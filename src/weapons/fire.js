import {
  ammoField,
  clamp,
  DEG,
  JAM_BASE,
  HEAT_PER_SHOT,
  MAX_HEAT,
  RECOIL_K,
} from "./instance.js"

/*
 * Escape from Larpov - геометрия и конвейер выстрела.
 *
 * Выделено из index.js: весь горячий путь выстрела теперь в одном файле.
 * Функции чистые и берут систему первым аргументом, поэтому их можно
 * гонять в тестах без живого движка. Ни одной аллокации: все векторы и
 * пейлоады событий лежат на системе и перезаписываются на месте.
 *
 * ГЕОМЕТРИЯ ВЫСТРЕЛА. Лучей два, а не один:
 *
 *   ПРИЦЕЛЬНЫЙ ЛУЧ - глаз (камера) плюс ось взгляда. Это обещание
 *                     прицельной метки, и он остаётся в sys._origin / sys._dir.
 *   ЛУЧ ПУЛИ      - мировая позиция ноды дульного устройства
 *                     вьюмодели (sys._shotOrigin) и сведённое на прицельную
 *                     точку направление (sys._shotDir). Отсюда уходит ВСЁ:
 *                     снаряды, трассеры, резервный хитскан, дульная
 *                     вспышка и гильза.
 *
 * Дульное устройство решается РОВНО ОДИН РАЗ на нажатие спуска и
 * раздаётся всем дробинам флагом fromMuzzle, иначе картечный выстрел
 * гонял бы MuzzleSolver и его лучи восемь раз на одну гильзу.
 */

/*
 * Прицельный луч.
 *
 * Базис камеры читается напрямую из matrixWorld.elements:
 *   e[12..14] - мировая позиция
 *   -e[8..10] - направление взгляда
 * Матрица не декомпозируется, кватернионы не создаются.
 */
export function syncAimVectors(sys) {
  const cam = sys.ctx && sys.ctx.camera ? sys.ctx.camera : null
  if (cam) {
    const e = cam.matrixWorld.elements
    sys._origin.set(e[12], e[13], e[14])
    sys._dir.set(-e[8], -e[9], -e[10])
    return true
  }
  if (sys.shooter && sys.shooter.position && sys.shooter.forward) {
    const p = sys.shooter.position
    const f = sys.shooter.forward
    sys._origin.set(p.x, p.y + 1.5, p.z)
    sys._dir.set(f.x, f.y, f.z)
    return true
  }
  return false
}

/*
 * Луч пули: рероут начала выстрела в конец ствола.
 *
 * По умолчанию копирует прицельный луч, чтобы любой ранний выход
 * оставлял систему в рабочем состоянии, а не с мусором в векторах.
 *
 * Боты и любой внешний стрелок НЕ рероутятся: у них своё дуло и своё
 * направление, а вьюмодель — это руки ИГРОКА.
 */
export function resolveShotVectors(sys, bot) {
  sys._shotOrigin.copy(sys._origin)
  sys._shotDir.copy(sys._dir)
  sys.fromMuzzle = false

  if (bot || sys.shooter) return false

  const cam = sys.ctx && sys.ctx.camera ? sys.ctx.camera : null
  const vm = sys.viewmodel
  if (!cam || !vm || !vm.active) return false
  if (!sys.muzzle || typeof sys.muzzle.solve !== "function") return false

  /* Солвер трогает ноды вьюмодели и стреляет два луча в физику.
   * Его падение не имеет права съесть выстрел целиком. */
  let sol = null
  try {
    sol = sys.muzzle.solve({
      camera: cam,
      viewmodel: vm,
      physics: sys._physics(),
    })
  } catch (e) {
    sol = null
  }
  if (!sol || !sol.fromMuzzle) return false
  if (!sol.origin || !sol.dir) return false
  if (sol.dir.lengthSq() < 1e-12) return false

  sys._shotOrigin.copy(sol.origin)
  sys._shotDir.copy(sol.dir).normalize()
  sys.fromMuzzle = true
  return true
}

/*
 * Собственно выстрел. sys._origin и sys._dir уже заполнены.
 * Ортонормированный базис считается скалярами прямо здесь.
 */
export function dischargeShot(sys, w, bot) {
  /* Нормализация ПРИЦЕЛЬНОГО луча без создания объектов. */
  let ax = sys._dir.x
  let ay = sys._dir.y
  let az = sys._dir.z
  let len = Math.sqrt(ax * ax + ay * ay + az * az)
  if (len < 1e-6) return
  const inv = 1 / len
  ax *= inv
  ay *= inv
  az *= inv
  sys._dir.set(ax, ay, az)

  const def = w.def
  const pellets = def.pellets
  const spread = sys._spreadDeg(w) * DEG
  const phys = sys._physics()
  const ammoIdx = w.ammoIdx

  /* Рероут начала выстрела в дульное устройство. Один раз на выстрел. */
  resolveShotVectors(sys, bot)

  /*
   * Базис вокруг ЛУЧА ПУЛИ, а не вокруг оси взгляда: конус разброса
   * обязан разворачиваться вокруг того же вектора, по которому летит пуля,
   * иначе сведение на дуле съедает разброс дроби.
   */
  let dx = sys._shotDir.x
  let dy = sys._shotDir.y
  let dz = sys._shotDir.z
  len = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (len < 1e-6) {
    dx = ax
    dy = ay
    dz = az
    len = 1
  }
  const binv = 1 / len
  dx *= binv
  dy *= binv
  dz *= binv
  sys._shotDir.set(dx, dy, dz)

  /* right = normalize(dir x worldUp), up = right x dir. */
  let ux = 0
  let uy = 1
  let uz = 0
  if (dy > 0.999 || dy < -0.999) {
    ux = 1
    uy = 0
    uz = 0
  }
  let rx = dy * uz - dz * uy
  let ry = dz * ux - dx * uz
  let rz = dx * uy - dy * ux
  len = Math.sqrt(rx * rx + ry * ry + rz * rz)
  if (len < 1e-6) {
    rx = 1
    ry = 0
    rz = 0
    len = 1
  }
  const rinv = 1 / len
  rx *= rinv
  ry *= rinv
  rz *= rinv
  const vx = ry * dz - rz * dy
  const vy = rz * dx - rx * dz
  const vz = rx * dy - ry * dx
  sys._right.set(rx, ry, rz)
  sys._up.set(vx, vy, vz)

  sys._wakeAudio()

  /* Баллистические параметры патрона из таблицы penetration.js. */
  const muzzleSpeed = ammoField("speed", ammoIdx, 800)
  const dmg = ammoField("damage", ammoIdx, 30)
  const pen = ammoField("pen", ammoIdx, 1)
  const tracer = !!ammoField("tracer", ammoIdx, 0)
  const sim = sys.useProjectiles ? sys.projectiles : null

  /* Снятие патрона: стреляет тот, что в патроннике, следующий идёт из магазина. */
  w.chambered = false
  if (w.magCount > 0) {
    w.magCount--
    w.chambered = true
  }

  /*
   * Цикл дроби. Раньше здесь был dir.clone().applyAxisAngle() — восемь
   * новых Vector3 на каждый выстрел. Теперь это два скаляра и один
   * преаллоцированный _pelletDir, который перезаписывается на месте.
   */
  for (let p = 0; p < pellets; p++) {
    const ang = sys.rng() * 6.28318530718
    const rad = Math.sqrt(sys.rng()) * spread
    const sx = Math.cos(ang) * rad
    const sy = Math.sin(ang) * rad

    let px = dx + rx * sx + vx * sy
    let py = dy + ry * sx + vy * sy
    let pz = dz + rz * sx + vz * sy
    const pl = Math.sqrt(px * px + py * py + pz * pz)
    if (pl > 1e-6) {
      const pinv = 1 / pl
      px *= pinv
      py *= pinv
      pz *= pinv
    }
    sys._pelletDir.set(px, py, pz)

    /* Основной путь: настоящий снаряд со временем полёта и просадкой.
     * ProjectileSim сам отдаёт терминальную баллистику в physics при
     * соприкосновении, поэтому пробитие остаётся в одном месте. */
    let spawned = false
    if (sim) {
      const o = sys._spawnOpts
      o.speed = muzzleSpeed
      o.damage = dmg
      o.penetration = pen
      o.dragK = 0.3
      o.maxRange = 400
      o.dropoff = 0.5
      o.weapon = w.id
      o.ammoIndex = ammoIdx
      o.shooter = sys.shooter || null
      o.tracer = tracer && p === 0
      /* Дуло уже решено: симуляция не пересчитывает его на каждую дробину
       * и НЕ применяет разброс повторно. */
      o.fromMuzzle = sys.fromMuzzle
      spawned = !!sim.spawn(o)
    }

    /* Резервный хитскан, если симуляции нет. Стреляет С ДУЛА:
     * раньше здесь стоял _origin, то есть луч из глаза игрока. */
    if (!spawned && phys && typeof phys.penetrate === "function") {
      phys.penetrate(sys._shotOrigin, sys._pelletDir, ammoIdx, sys.shooter)
    }
  }

  /* Отдача, нагрев и растущий разброс. Импульс идёт в СКОРОСТЬ пружины.
   * Жёсткость берём из ствола, если он её переопределяет. */
  const ergoK = clamp(1.35 - def.ergo * 0.007, 0.45, 1.35)
  const adsK = sys.ads ? 0.72 : 1
  const springK = def.recoilK ? def.recoilK : RECOIL_K
  sys._kickVelP += def.rv * ergoK * adsK * springK * 0.06
  sys._kickVelY += (sys.rng() * 2 - 1) * def.rh * ergoK * adsK * springK * 0.06
  sys.bloom = Math.min(sys.bloom + def.spread * 0.32, def.spread * 2.6)
  w.heat = Math.min(w.heat + HEAT_PER_SHOT, MAX_HEAT)
  sys.shotsFired++

  /* Задержка следующего выстрела. */
  let interval = 60 / def.rpm
  if (w.mode === "pump" || w.mode === "bolt") interval = def.chamber + 0.18
  sys.nextShotAt = sys.time + interval

  /* Шанс перекоса растёт с нагревом и падает с ресурсом ствола. */
  if (sys.rng() < JAM_BASE * (1 + w.heat) * (2 - w.durability))
    w.jammed = true
  w.durability = Math.max(0.35, w.durability - 0.00035)

  /* События. Пейлоады переиспользуются, обработчики читают их синхронно.
   * weapon:fire — канонический вход для src/audio/weapons.js, поэтому
   * прямого дублирующего вызова микшера здесь нет.
   * origin/dir — дуло и ось ствола, eye/eyeDir — прицельный луч. */
  const fe = sys._fireEvent
  fe.weapon = w.id
  fe.fromMuzzle = sys.fromMuzzle
  fe.seed = (sys.shotsFired * 2654435761) >>> 0
  fe.suppressed = w.suppressed
  fe.bot = !!bot
  fe.cal = def.cal
  fe.mode = w.mode
  sys._emit("weapon:fire", fe)
  sys.viewmodel?.addRecoil?.(def.rv * DEG * 0.1, sys._kickYaw * DEG * 0.1, sys.shotsFired <= 1)

  /*
   * Гильза уходит из окна выброса вьюмодели. Раньше она рождалась в
   * _origin + right * 0.28, то есть вылетала из щеки игрока.
   */
  const vm = sys.viewmodel
  let ejected = false
  if (vm && vm.active && typeof vm.ejectWorld === "function") {
    try {
      vm.ejectWorld(sys._shellPos)
      if (typeof vm.ejectVelocity === "function") vm.ejectVelocity(sys._shellVel, 2.6)
      else sys._shellVel.set(rx * 2.2, 1.1, rz * 2.2)
      ejected = Number.isFinite(sys._shellPos.x)
    } catch (e) {
      ejected = false
    }
  }
  if (!ejected) {
    sys._shellPos.set(
      sys._shotOrigin.x + rx * 0.28,
      sys._shotOrigin.y - 0.12,
      sys._shotOrigin.z + rz * 0.28,
    )
    sys._shellVel.set(rx * 2.2, 1.1, rz * 2.2)
  }
  sys._shellEvent.cal = def.cal
  sys._emit("weapon:shell", sys._shellEvent)
  sys._stateDirty = true
  sys._emitState()
}

/*
 * ГЛАВНЫЙ МЕТОД. Ни одного new, ни одного clone().
 * Порядок ранних выходов сохранён: осечка и перекос всё ещё
 * отстреливают свои события до того, как читается базис камеры.
 */
export function pullTrigger(sys) {
  if (!sys.enabled) return false
  const w = sys.weapon
  if (!w) return false
  if (sys.reloading) return false
  if (sys.time < sys.swapEndsAt) return false
  if (sys.time < sys.nextShotAt) return false

  const mode = w.mode
  const auto = mode === "auto"
  if (!auto && sys.triggerLatch && w.burstLeft <= 0) return false

  if (w.jammed) {
    sys._jamEvent.weapon = w.id
    sys._jamEvent.kind = "jam"
    sys._emit("weapon:malfunction", sys._jamEvent)
    sys.nextShotAt = sys.time + 0.3
    sys.triggerLatch = true
    return false
  }

  if (!w.chambered) {
    sys._jamEvent.weapon = w.id
    sys._jamEvent.kind = "empty"
    sys._emit("weapon:malfunction", sys._jamEvent)
    sys.nextShotAt = sys.time + 0.28
    sys.triggerLatch = true
    w.burstLeft = 0
    return false
  }

  if (!syncAimVectors(sys)) return false

  if (mode === "burst" && w.burstLeft <= 0) w.burstLeft = 3
  dischargeShot(sys, w, false)

  if (mode === "burst") {
    w.burstLeft--
    if (w.burstLeft < 0) w.burstLeft = 0
  }
  if (!auto) sys.triggerLatch = true
  return true
}

/* Выстрел бота: тот же горячий путь, но с явным началом и направлением.
 * Дуло вьюмодели здесь не при делах: это руки игрока, а не бота. */
export function fireFromVectors(sys, originVec, dirVec, weaponInstance, actor) {
  const w = weaponInstance || sys.weapon
  if (!w || !w.chambered) return false
  sys._origin.set(originVec.x, originVec.y, originVec.z)
  sys._dir.set(dirVec.x, dirVec.y, dirVec.z)
  const prev = sys.shooter
  if (actor !== undefined) sys.shooter = actor
  dischargeShot(sys, w, true)
  sys.shooter = prev
  return true
}
