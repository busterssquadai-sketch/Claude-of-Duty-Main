import * as THREE from "three"
import { WeaponMaterials } from "./materials.js"
import { Viewmodel } from "./viewmodel.js"
import { WEAPON_DEFS } from "./defs.js"
import { ProjectileSim } from "./ballistics.js"
import { MuzzleSolver } from "./muzzle.js"
import { buildRifle } from "./models/rifle.js"
import { buildSmg } from "./models/smg.js"
import { buildPistol } from "./models/pistol.js"
import { buildKalashnikov, KALASHNIKOV_DEFS } from "./models/kalashnikov.js"
import { buildHandsFree, HANDS_FREE_DEF } from "./models/handsFree.js"
import {
  START_RESERVE,
  normalizeWeaponId,
  viewmodelKindFor,
} from "./table.js"
import {
  WeaponInstance,
  ammoField,
  clamp,
  makeRng,
  DEG,
  HEAT_COOL,
  MAX_HEAT,
  RECOIL_K,
  RECOIL_D,
} from "./instance.js"
import {
  syncAimVectors,
  resolveShotVectors,
  dischargeShot,
  pullTrigger,
  fireFromVectors,
} from "./fire.js"
import { ammoForCaliber } from "../physics/penetration.js"

/*
 * Escape from Larpov - weapon subsystem.
 *
 * Раскладка модулей:
 *   table.js    - статические таблицы стволов и резолвер конфигурации
 *   instance.js - WeaponInstance, генератор случайных, тунинг отдачи
 *   fire.js     - геометрия выстрела и горячий путь
 *   models/*.js - процедурная геометрия вьюмоделей
 *   index.js    - сама система: слоты, перезарядка, пружина, HUD
 *
 * Всё, что раньше импортировалось из этого файла, реэкспортируется ниже:
 * внешние импорты менять не нужно.
 *
 * КОНТРАКТ REGISTRY (core/registry.js): static id, static deps, init(ctx),
 * update(dt, ctx), fixedUpdate(h, ctx), dispose(). Подсистемы не импортируют
 * друг друга напрямую — только через ctx.get / ctx.peek. Состояния движка
 * (STATE) принадлежат Engine: система реагирует на raid:start / raid:end и на
 * собственный флаг enabled, а сам перечень состояний не расширяет.
 *
 * Контракт событий:
 *   weapon:fire        { weapon, origin, dir, eye, eyeDir, fromMuzzle, seed, suppressed, bot, cal, mode }
 *   weapon:shell       { position, velocity, cal }
 *   weapon:reload      { weapon, phase, duration }
 *   weapon:magcheck    { weapon, left, position }
 *   weapon:malfunction { weapon, kind, position }
 *   bullet:tracer      { from, to, dir, quaternion, length, speed, weapon, fromMuzzle }   <- через ProjectileSim
 *
 * ГЕОМЕТРИЯ ВЫСТРЕЛА. Лучей два, а не один:
 *
 *   ПРИЦЕЛЬНЫЙ ЛУЧ - глаз (камера) плюс ось взгляда, в _origin / _dir.
 *   ЛУЧ ПУЛИ      - нода дульного устройства вьюмодели и сведённое
 *                     направление, в _shotOrigin / _shotDir. Отсюда уходит
 *                     ВСЁ: снаряды, трассеры, хитскан, вспышка, гильза.
 *
 * Ни одной аллокации в горячем пути: все векторы и пейлоады событий
 * созданы в конструкторе и перезаписываются на месте.
 */

export {
  FIRE_MODES,
  WEAPONS,
  WEAPON_IDS,
  VIEWMODEL_KIND,
  WEAPON_ALIAS,
  SAFE_WEAPON_DEF,
  FALLBACK_WEAPON_ID,
  resolveWeaponConfig,
  normalizeWeaponId,
  viewmodelKindFor,
  START_RESERVE,
} from "./table.js"

export { WeaponInstance } from "./instance.js"

/*
 * Набор вьюмодели для пустых рук. models/handsFree.js отдаёт полноценное
 * описание модели, у которой body — ПУСТАЯ Assembly: addWeapon создаёт группу
 * с нулём мешей и нулём треугольников, а setActive('hands') гасит группу
 * уходящего ствола и показывает группу, в которой нет ничего. Это реальная
 * чистка сцены, а не сокрытие меша.
 */
const HANDS_VIEWMODEL = "hands"

/* Куда откатываемся, если нужный набор не удалось собрать. */
const FALLBACK_VIEWMODEL = "rifle"

/*
 * Калашниковы -> вариант композитной сборки models/kalashnikov.js.
 *
 * ЗАЧЕМ ОТДЕЛЬНАЯ ТАБЛИЦА. VIEWMODEL_KIND в table.js отправляет ak74m, aks74u
 * и ak101 в набор "rifle", а это AR-15: вывешенный алюминиевый хендгард,
 * флэт-топ с планкой на 21.2 мм, труба буфера вместо приклада. Ни одна деталь
 * этого силуэта не является Калашниковым, и именно поэтому в руках игрока
 * оказывался M4 вне зависимости от того, что лежало в слоте.
 *
 * rpk16 стоит отдельной строкой, И ЭТО ВАЖНО: WEAPON_ALIAS сводит rpk16 ->
 * ak74m, потому что в таблице WEAPONS нет записи для РПК и баллистику брать
 * неоткуда. Поэтому исходный id предмета сохраняется в WeaponInstance.sourceId
 * и разрешается ДО нормализации — иначе РПК-16 молча собирался бы как АК-74М:
 * без длинного тяжёлого ствола, без магазина на 45 и без планки на пылевой
 * крышке.
 */
const KALASHNIKOV_VIEWMODELS = {
  ak74m: "ak",
  aks74u: "ak",
  ak101: "ak",
  rpk16: "rpk",
}

/*
 * Сборщики вьюмоделей. Набор компилируется в момент, когда он реально
 * понадобился, и больше никогда: композитный Калашников — это процедурная
 * геометрия (штампованная коробка с заклёпками, газовый блок под 45 градусов,
 * изогнутый рожок, фурнитура polymer_tan / polymer), и платить за неё на
 * старте, когда игрок может вообще не взять АК в руки, незачем.
 */
const VIEWMODEL_BUILDERS = {
  rifle: function makeRifle() {
    return { model: buildRifle(), def: WEAPON_DEFS.rifle }
  },
  smg: function makeSmg() {
    return { model: buildSmg(), def: WEAPON_DEFS.smg }
  },
  pistol: function makePistol() {
    return { model: buildPistol(), def: WEAPON_DEFS.pistol }
  },
  ak: function makeAk() {
    return { model: buildKalashnikov("ak"), def: KALASHNIKOV_DEFS.ak }
  },
  rpk: function makeRpk() {
    return { model: buildKalashnikov("rpk"), def: KALASHNIKOV_DEFS.rpk }
  },
  hands: function makeHands() {
    return { model: buildHandsFree(), def: HANDS_FREE_DEF }
  },
}

/* Собирается сразу: три базовых силуэта и пустые руки. handsFree — нулевая
 * геометрия, его сборка бесплатна, а гарантированная доступность рук нужна,
 * чтобы пустые слоты никогда не оставили в кадре висящий ствол. */
const EAGER_VIEWMODELS = ["rifle", "smg", "pistol", HANDS_VIEWMODEL]

/* Максимальный шаг кадра. Совпадает с клампом Engine.step и с защитой внутри
 * Viewmodel.update: пауза на точке останова не должна телепортировать анимацию. */
const MAX_RAW_DT = 0.1

/** Вариант композитной сборки для идентификатора ствола, или null. */
function kalashnikovVariantFor(id) {
  if (typeof id !== "string" || !id) return null
  const direct = KALASHNIKOV_VIEWMODELS[id]
  if (direct) return direct
  /* Псевдонимы вида ak74n -> ak74m разрешаются таблицей table.js. */
  return KALASHNIKOV_VIEWMODELS[normalizeWeaponId(id)] || null
}

export class WeaponSystem {
  static id = "weapons"
  static deps = ["inventory", "materials", "render"]

  constructor() {
    this.ctx = null
    this.rng = null
    this.enabled = true

    this.slots = { primary: null, secondary: null, holster: null }
    this.slotOrder = ["primary", "secondary", "holster"]
    this.slot = "primary"
    this.weapon = null

    this.triggerDown = false
    this.triggerLatch = false
    this.ads = false
    this.moving = 0
    this.stance = 1
    this.nextShotAt = 0
    this.time = 0

    this.reloading = false
    this.reloadEndsAt = 0
    this.reloadDuration = 0
    this.swapEndsAt = 0

    /* Наружный контракт: накопленная за кадр дельта отдачи. */
    this.recoilPitch = 0
    this.recoilYaw = 0
    this.bloom = 0

    /* Внутреннее состояние пружины. */
    this._kickPitch = 0
    this._kickYaw = 0
    this._kickVelP = 0
    this._kickVelY = 0

    /* Читать ввод самостоятельно. Все хуки идемпотентны, поэтому это
     * безопасно даже если игрок дублирует их из своей подсистемы. */
    this.autoInput = true

    /* Пулевая симуляция вместо мгновенного хитскана. */
    this.useProjectiles = true
    this.projectiles = null

    /* Стрелок-актёр выставляется setShooter(): у бота своё дуло и свой
     * луч, поэтому рероутить ему ничего не надо. */
    this.shooter = null
    this._phys = null

    /* Решатель дульного устройства. Один на систему, переиспользуется
     * каждый выстрел и ничего не аллоцирует в solve(). */
    this.muzzle = new MuzzleSolver()
    /** Решён ли ствол выстрела через ноду дульного устройства. */
    this.fromMuzzle = false

    this.reserve = Object.create(null)
    this.shotsFired = 0

    /* --- Пул временных объектов. Всё, что нужно в горячем пути. --- */
    /* Прицельный луч: глаз и ось взгляда. */
    this._origin = new THREE.Vector3()
    this._dir = new THREE.Vector3()
    /* Луч пули: конец ствола и сведённое направление. */
    this._shotOrigin = new THREE.Vector3()
    this._shotDir = new THREE.Vector3()
    this._right = new THREE.Vector3()
    this._up = new THREE.Vector3()
    this._tmp = new THREE.Vector3()
    this._pelletDir = new THREE.Vector3()
    this._shellPos = new THREE.Vector3()
    this._shellVel = new THREE.Vector3()

    /* Преаллоцированные аргументы для ProjectileSim.spawn().
     * origin смотрит на _shotOrigin, а НЕ на глаз: снаряд уходит с дула.
     * fromMuzzle говорит симуляции, что рероутить уже нечего. */
    this._spawnOpts = {
      origin: this._shotOrigin,
      dir: this._pelletDir,
      speed: 800,
      damage: 30,
      penetration: 1,
      dragK: 0.3,
      maxRange: 400,
      dropoff: 0.5,
      weapon: null,
      ammoIndex: 0,
      shooter: null,
      tracer: false,
      fromMuzzle: false,
    }

    /* Переиспользуемые пейлоады событий: обработчики читают их синхронно.
     * origin/dir — ДУЛО и ось ствола: вспышка и позиционный звук должны
     * рождаться на конце ствола, а не внутри головы игрока. eye/eyeDir
     * остаются для тех, кому нужен именно прицельный луч. */
    this._fireEvent = {
      weapon: null,
      origin: this._shotOrigin,
      dir: this._shotDir,
      eye: this._origin,
      eyeDir: this._dir,
      fromMuzzle: false,
      seed: 0,
      suppressed: false,
      bot: false,
      cal: null,
      mode: null,
    }
    this._shellEvent = {
      position: this._shellPos,
      velocity: this._shellVel,
      cal: null,
    }
    this._reloadEvent = { weapon: null, phase: "start", duration: 0 }
    this._magEvent = { weapon: null, left: 0, position: this._shotOrigin }
    this._jamEvent = { weapon: null, kind: "jam", position: this._shotOrigin }
    this._recoilOut = { x: 0, y: 0, z: 0 }

    this._handlers = null
    this.viewmodel = null
    /** Активный набор: 'rifle' | 'smg' | 'pistol' | 'ak' | 'rpk' | 'hands'. */
    this.viewmodelId = null
    /** Руки пусты: в кадре нулевая геометрия handsFree, ствола нет вообще. */
    this.handsFree = false

    /* Преаллоцированное состояние для Viewmodel.update: раньше здесь каждый
     * кадр рождался объектный литерал. */
    this._vmState = {
      ads: false,
      sprint: false,
      lowReady: false,
      speed: 0,
      crouch: false,
      airborne: false,
      trigger: false,
      empty: true,
    }
    /* Предыдущее значение ctx.time.raw. -1 = ещё не читали. */
    this._rawPrev = -1

    this._weaponStateEvent = null
    this._hud = null
    this._stateDirty = true
    this._audioResumed = false
  }

  init(ctx) {
    this.ctx = ctx
    this.rng = makeRng(ctx, "weapons")
    this._rawPrev = Number.isFinite(ctx?.time?.raw) ? ctx.time.raw : -1
    this._initViewmodel(ctx)
    this.projectiles = new ProjectileSim(ctx)
    this.setWeapon("primary", "m4a1", null)
    this.setWeapon("holster", "pm", null)
    this.equip("primary")
    this._seedReserve()

    const ev = ctx && ctx.events
    if (ev && typeof ev.on === "function") {
      const self = this
      this._handlers = [
        [
          "raid:start",
          function onStart() {
            self.enabled = true
            self.triggerDown = false
            self.reloading = false
            self.recoilPitch = 0
            self.recoilYaw = 0
            self._kickPitch = 0
            self._kickYaw = 0
            self._kickVelP = 0
            self._kickVelY = 0
            self.bloom = 0
            self.projectiles?.clear?.()
            self._emitState(true)
          },
        ],
        [
          "raid:end",
          function onEnd() {
            self.enabled = false
            self.triggerDown = false
            self.projectiles?.clear?.()
            self._emitState(true)
          },
        ],
        [
          "inv:changed",
          function onInventory() {
            self._syncFromInventory()
          },
        ],
      ]
      for (let i = 0; i < this._handlers.length; i++)
        ev.on(this._handlers[i][0], this._handlers[i][1])
    }
    this._syncFromInventory()
    this._emitState(true)
  }

  /* Разрешаем канонические идентификаторы патронов через таблицу, а не строками. */
  _seedReserve() {
    for (let i = 0; i < START_RESERVE.length; i++) {
      const cal = START_RESERVE[i][0]
      const count = START_RESERVE[i][1]
      const idx = ammoForCaliber(cal)
      if (!Number.isFinite(idx) || idx < 0) continue
      const id = ammoField("id", idx, null)
      if (typeof id !== "string" || !id) continue
      this.reserve[id] = (this.reserve[id] || 0) + count
    }
  }

  _normalizeWeaponId(id) {
    return normalizeWeaponId(id)
  }

  _viewmodelKindFor(id) {
    return viewmodelKindFor(id)
  }

  _initViewmodel(ctx) {
    if (!ctx?.viewScene || !ctx?.peek?.("materials")) return
    const mats = new WeaponMaterials(ctx)
    const vm = new Viewmodel(ctx, mats)
    vm.trackCamera = true
    this.viewmodel = vm
    for (let i = 0; i < EAGER_VIEWMODELS.length; i++)
      this._ensureViewmodel(EAGER_VIEWMODELS[i])
  }

  /*
   * Собрать и зарегистрировать набор вьюмодели, если его ещё нет.
   * Идемпотентно: Viewmodel.weapons — это Map по model.id.
   *
   * Падение сборки НЕ роняет кадр: движок обязан доехать до картинки, поэтому
   * неудача логируется, а вызывающий откатывается на другой набор.
   */
  _ensureViewmodel(id) {
    const vm = this.viewmodel
    if (!vm || typeof id !== "string" || !id) return false
    if (vm.weapons && typeof vm.weapons.has === "function" && vm.weapons.has(id))
      return true
    const make = VIEWMODEL_BUILDERS[id]
    if (!make) return false
    try {
      const built = make()
      if (!built || !built.model || !built.def) return false
      vm.addWeapon(built.model, built.def)
      return true
    } catch (e) {
      console.warn('[weapons] viewmodel "' + id + '" failed to assemble:', e)
      return false
    }
  }

  /*
   * Какой набор вьюмодели показывать под этот экземпляр ствола.
   *
   * sourceId — исходный id предмета из инвентаря, ДО нормализации: только он
   * отличает rpk16 от ak74m, потому что WEAPON_ALIAS сводит их в один ключ
   * таблицы WEAPONS. Если поля нет (ствол создан не через setWeapon), падаем на
   * нормализованный id: это всё ещё Калашников, просто в варианте 'ak'.
   */
  _viewmodelIdFor(inst) {
    if (!inst) return HANDS_VIEWMODEL
    const variant =
      kalashnikovVariantFor(inst.sourceId) || kalashnikovVariantFor(inst.id)
    if (variant) return variant
    return viewmodelKindFor(inst.id)
  }

  /*
   * Привести вьюмодель к активному слоту.
   *
   * Пустые слоты — это не «спрятать ствол»: setActive('hands') гасит группу
   * уходящего оружия и показывает набор handsFree, в котором ноль мешей и ноль
   * треугольников. Висящая в воздухе винтовка исчезает из сцены полностью.
   */
  _syncViewmodel(playDraw) {
    const vm = this.viewmodel
    if (!vm) return null
    const inst = this.weapon
    let id = this._viewmodelIdFor(inst)
    if (!this._ensureViewmodel(id)) {
      id = inst ? FALLBACK_VIEWMODEL : HANDS_VIEWMODEL
      if (!this._ensureViewmodel(id)) return null
    }
    vm.setActive?.(id)
    this.viewmodelId = id
    this.handsFree = id === HANDS_VIEWMODEL
    if (this.handsFree) {
      /* Без оружия нечего вскидывать: HANDS_FREE_DEF не описывает прицел, а
       * opticGlass у него null, поэтому марка тоже гасится. */
      this.ads = false
    } else if (playDraw) {
      vm.play?.("draw")
    }
    return id
  }

  /*
   * Снаряжение читается из инвентаря, а не хранится параллельно с ним.
   * Вызывается из init() и из хука inv:changed.
   */
  _syncFromInventory() {
    const inv = this.ctx?.peek?.("inventory")
    if (!inv || typeof inv.slotItem !== "function") return
    for (let i = 0; i < this.slotOrder.length; i++) {
      const slot = this.slotOrder[i]
      const item = inv.slotItem(slot)
      this.setWeapon(slot, item ? item.id : null, null)
    }
    if (!this.weapon) {
      for (let i = 0; i < this.slotOrder.length; i++) {
        const slot = this.slotOrder[i]
        if (this.slots[slot]) {
          this.equip(slot)
          break
        }
      }
    }
    /* Все три слота пусты: в кадре должны остаться только руки. */
    if (!this.weapon) this._syncViewmodel(false)
  }

  /* Событие состояния слалось каждый кадр из update(). Теперь только по флагу. */
  _emitState(force) {
    if (!force && !this._stateDirty) return
    this._stateDirty = false
    const o =
      this._weaponStateEvent ||
      (this._weaponStateEvent = {
        empty: true,
        name: "",
        inMag: 0,
        chamber: false,
        capacity: 0,
        ammoName: "",
        modeShort: "",
        heat: 0,
        dur: 100,
        malfunction: false,
        malfunctionName: "",
        busy: "",
        reloading: false,
      })
    const w = this.weapon
    if (!w) {
      o.empty = true
      o.name = ""
      o.inMag = 0
      o.chamber = false
      o.capacity = 0
      o.ammoName = ""
      o.modeShort = ""
      o.heat = 0
      o.dur = 100
      o.malfunction = false
      o.malfunctionName = ""
      o.busy = ""
      o.reloading = false
      this._emit("weapon:state", o)
      return
    }
    o.empty = false
    o.name = w.def.name
    o.inMag = w.magCount
    o.chamber = w.chambered
    o.capacity = w.def.mag
    o.ammoName = ammoField("id", w.ammoIdx, w.def.cal) || w.def.cal
    o.modeShort = String(w.mode || "").toUpperCase()
    o.heat = Math.round((w.heat / MAX_HEAT) * 100)
    o.dur = Math.round(w.durability * 100)
    o.malfunction = !!w.jammed
    o.malfunctionName = w.jammed ? "JAM" : ""
    o.busy = this.reloading ? "RELOADING" : ""
    o.reloading = this.reloading
    this._emit("weapon:state", o)
  }

  /* --- Снаряжение --- */

  setWeapon(slot, weaponId, ammoId) {
    if (!Object.prototype.hasOwnProperty.call(this.slots, slot)) return null
    if (weaponId === null || weaponId === undefined) {
      this.slots[slot] = null
      if (this.slot === slot) {
        this.weapon = null
        this._syncViewmodel(false)
      }
      this._stateDirty = true
      this._emitState()
      return null
    }
    const inst = new WeaponInstance(normalizeWeaponId(weaponId), ammoId)
    /* Исходный id предмета. Нормализация нужна баллистике (в WEAPONS нет строки
     * для РПК), а вьюмодели нужен именно РПК-16: без этого поля АК и РПК
     * неразличимы. */
    inst.sourceId = typeof weaponId === "string" ? weaponId : null
    this.slots[slot] = inst
    if (this.slot === slot) {
      this.weapon = inst
      this._syncViewmodel(false)
    }
    this._stateDirty = true
    this._emitState()
    return inst
  }

  equip(slot) {
    if (!Object.prototype.hasOwnProperty.call(this.slots, slot)) return false
    const inst = this.slots[slot]
    this.slot = slot
    this.weapon = inst
    this.reloading = false
    this.triggerLatch = true
    if (inst) {
      const t = clamp(1.1 - inst.def.ergo * 0.008, 0.32, 1.1)
      this.swapEndsAt = this.time + t
      this.nextShotAt = this.swapEndsAt
    }
    this._syncViewmodel(true)
    this._stateDirty = true
    this._emitState()
    return true
  }

  equipNext() {
    const i = this.slotOrder.indexOf(this.slot)
    for (let k = 1; k <= this.slotOrder.length; k++) {
      const s = this.slotOrder[(i + k) % this.slotOrder.length]
      if (this.slots[s]) return this.equip(s)
    }
    return false
  }

  toggleMode() {
    const w = this.weapon
    if (!w || w.def.modes.length < 2) return null
    w.modeIndex = (w.modeIndex + 1) % w.def.modes.length
    w.mode = w.def.modes[w.modeIndex]
    w.burstLeft = 0
    this._stateDirty = true
    this._emitState()
    return w.mode
  }

  setSuppressor(on) {
    const w = this.weapon
    if (!w) return false
    if (!w.def.suppressor) return false
    w.suppressed = !!on
    return true
  }

  /* Сколько патронов этого типа осталось в разгрузке. */
  _reserveFor(ammoIdx) {
    const id = ammoField("id", ammoIdx, null)
    if (typeof id !== "string") return 0
    const n = this.reserve[id]
    return n === undefined ? 0 : n
  }

  _takeReserve(ammoIdx, want) {
    const id = ammoField("id", ammoIdx, null)
    if (typeof id !== "string") return 0
    const have = this.reserve[id] === undefined ? 0 : this.reserve[id]
    const take = have < want ? have : want
    this.reserve[id] = have - take
    return take
  }

  addReserve(ammoId, count) {
    const have = this.reserve[ammoId] === undefined ? 0 : this.reserve[ammoId]
    this.reserve[ammoId] = have + count
    return this.reserve[ammoId]
  }

  setShooter(actor) {
    this.shooter = actor || null
    return this.shooter
  }

  _physics() {
    if (this._phys) return this._phys
    const c = this.ctx
    if (!c) return null
    let p = null
    try {
      if (typeof c.peek === "function") p = c.peek("physics")
    } catch (e) {
      p = null
    }
    if (!p) {
      try {
        if (typeof c.get === "function") p = c.get("physics")
      } catch (e) {
        p = null
      }
    }
    if (p) this._phys = p
    return p
  }

  _emit(name, payload) {
    const ev = this.ctx && this.ctx.events
    if (ev && typeof ev.emit === "function") ev.emit(name, payload)
  }

  /* AudioContext стартует suspended до жеста пользователя, и это тихо
   * съедает ВСЮ процедурную стрельбу. Один раз пинаем его на первом выстреле. */
  _wakeAudio() {
    if (this._audioResumed) return
    this._audioResumed = true
    const audio = this.ctx?.peek?.("audio")
    if (!audio) return
    try {
      if (typeof audio.resume === "function") audio.resume()
      else if (audio.ctx && typeof audio.ctx.resume === "function") audio.ctx.resume()
    } catch (e) { /* политика автоплея, не наша забота */ }
  }

  /* --- Управление спусковым крючком --- */

  setTrigger(down) {
    const d = !!down
    if (!d) this.triggerLatch = false
    this.triggerDown = d
    return d
  }

  setAds(on) {
    /* Пустые руки не прицеливаются: у HANDS_FREE_DEF нет ни прицела, ни линзы. */
    this.ads = !!on && !!this.weapon
    return this.ads
  }

  /*
   * Текущий разброс в градусах.
   * Складывается из базы ствола, накопленного bloom, стойки и движения.
   */
  _spreadDeg(w) {
    const base = this.ads ? w.def.spreadAds : w.def.spread
    const move = 1 + this.moving * 1.4
    const stance = this.stance === 0 ? 0.55 : this.stance === 2 ? 0.78 : 1
    return (base + this.bloom) * move * stance
  }

  getHudState(out) {
    return this.hudState(out)
  }

  /* --- Горячий путь выстрела живёт в fire.js. Здесь только точки входа. --- */

  /** Прицельный луч из камеры или из актёра. */
  _syncAimVectors() {
    return syncAimVectors(this)
  }

  /** Рероут начала выстрела в ноду дульного устройства. */
  _resolveShotVectors(bot) {
    return resolveShotVectors(this, bot)
  }

  _discharge(w, bot) {
    return dischargeShot(this, w, bot)
  }

  tryFire() {
    return pullTrigger(this)
  }

  /* Выстрел бота: тот же горячий путь, но с явным началом и направлением. */
  fireFrom(originVec, dirVec, weaponInstance, actor) {
    return fireFromVectors(this, originVec, dirVec, weaponInstance, actor)
  }

  /* --- Перезарядка и обслуживание --- */

  reload() {
    const w = this.weapon
    if (!w || this.reloading) return false
    if (w.magCount >= w.def.mag) return false
    if (this._reserveFor(w.ammoIdx) <= 0) return false

    const speed = clamp(1.3 - w.def.ergo * 0.005, 0.7, 1.3)
    const dur = w.def.reload * speed
    this.reloading = true
    this.reloadEndsAt = this.time + dur
    this.reloadDuration = dur
    this.triggerLatch = true
    w.burstLeft = 0

    this._reloadEvent.weapon = w.id
    this._reloadEvent.phase = "start"
    this._reloadEvent.duration = dur
    this._emit("weapon:reload", this._reloadEvent)
    this._emit("weapon:reload:start", this._reloadEvent)
    this.viewmodel?.play?.(w.ammoLeft <= 1 ? "reloadEmpty" : "reloadTac")
    this._stateDirty = true
    this._emitState()
    return true
  }

  _finishReload() {
    const w = this.weapon
    this.reloading = false
    if (!w) return
    const need = w.def.mag - w.magCount
    if (need > 0) w.magCount += this._takeReserve(w.ammoIdx, need)
    if (!w.chambered && w.magCount > 0) {
      w.magCount--
      w.chambered = true
    }
    w.jammed = false
    this.nextShotAt = this.time + 0.16

    this._reloadEvent.weapon = w.id
    this._reloadEvent.phase = "end"
    this._reloadEvent.duration = 0
    this._emit("weapon:reload", this._reloadEvent)
    this._emit("weapon:reload:end", this._reloadEvent)
    this._stateDirty = true
    this._emitState()
  }

  checkMag() {
    const w = this.weapon
    if (!w) return -1
    this._magEvent.weapon = w.id
    this._magEvent.left = w.ammoLeft
    this._emit("weapon:magcheck", this._magEvent)
    this._stateDirty = true
    this._emitState()
    return w.ammoLeft
  }

  clearJam() {
    const w = this.weapon
    if (!w || !w.jammed) return false
    w.jammed = false
    w.heat = Math.max(0, w.heat - 0.6)
    this.nextShotAt = this.time + w.def.chamber
    this._reloadEvent.weapon = w.id
    this._reloadEvent.phase = "clear"
    this._reloadEvent.duration = w.def.chamber
    this._emit("weapon:reload", this._reloadEvent)
    this._emit("weapon:reload:clear", this._reloadEvent)
    this._stateDirty = true
    this._emitState()
    return true
  }

  inspect() {
    this.viewmodel?.play?.("inspect")
    return true
  }

  equipSlot(slot) {
    return this.equip(slot)
  }

  nextSlot(dir = 1) {
    if (dir > 0) return this.equipNext()
    const i = this.slotOrder.indexOf(this.slot)
    for (let k = 1; k <= this.slotOrder.length; k++) {
      const s = this.slotOrder[(i - k + this.slotOrder.length * 2) % this.slotOrder.length]
      if (this.slots[s]) return this.equip(s)
    }
    return false
  }

  /* Игрок забирает накопленную отдачу раз в кадр и обнуляет её.
   * Значение — дельта пружины за кадр, поэтому камера подбрасывает
   * и сама возвращается на место. */
  pullRecoil(out) {
    const pitch = this.recoilPitch
    const yaw = this.recoilYaw
    this.recoilPitch = 0
    this.recoilYaw = 0
    if (out) {
      out.x = pitch * DEG
      out.y = yaw * DEG
      out.z = 0
    }
    return pitch
  }

  getRecoilState() {
    const o = this._recoilOut
    o.x = this._kickPitch
    o.y = this._kickYaw
    o.z = 0
    return o
  }

  /*
   * Нескалированный шаг кадра.
   *
   * ЗАЧЕМ. Инвентарь на время открытия ставит ctx.time.scale = 0 (см.
   * inventory/index.js _open), а движок раздаёт системам dt = rawDt * scale,
   * то есть ноль. Viewmodel.update интегрирует ВСЮ процедурную анимацию из
   * этого dt, включая дыхание и покачивание (noiseT += dt), поэтому при
   * нулевом масштабе руки замирают насмерть. ctx.time.raw идёт по стенным
   * часам и от scale не зависит.
   */
  _rawDelta(dt) {
    const raw = this.ctx?.time?.raw
    if (!Number.isFinite(raw)) {
      if (!(dt > 0)) return 0
      return dt < MAX_RAW_DT ? dt : MAX_RAW_DT
    }
    const d = this._rawPrev < 0 ? dt : raw - this._rawPrev
    this._rawPrev = raw
    if (!(d > 0)) return 0
    return d < MAX_RAW_DT ? d : MAX_RAW_DT
  }

  /*
   * Кадр вьюмодели.
   *
   * Гоняется ВСЕГДА, даже когда ствола нет. Раньше вызов стоял под условием
   * `this.viewmodel && this.weapon`, и именно поэтому пустые слоты оставляли в
   * кадре замороженный M4A1: модель была, а состояния для её анимации не
   * приходило ни одного кадра.
   */
  _updateViewmodel(dt, rawDt) {
    const vm = this.viewmodel
    if (!vm) return
    const w = this.weapon
    const s = this._vmState
    s.ads = !!this.ads && !!w
    s.sprint = this.moving > 0.7 && !s.ads
    s.lowReady = false
    s.speed = this.moving * 6
    s.crouch = this.stance === 0
    s.airborne = false
    s.trigger = !!this.triggerDown && !!w
    s.empty = w ? w.ammoLeft <= 0 : true
    /* Пустые руки живут по нескалированному времени, ствол — по игровому:
     * отдача, затвор и перезарядка обязаны замирать вместе с миром. */
    vm.update(w ? dt : rawDt, s)
  }

  /* Снаряды интегрируются на фиксированном шаге (120 Гц по ARCHITECTURE),
   * поэтому полёт пули не зависит от частоты кадров. Раньше этого метода
   * не существовало вовсе, и симуляция не могла шагать даже теоретически. */
  fixedUpdate(h, ctx) {
    if (ctx) this.ctx = ctx
    if (this.projectiles) this.projectiles.fixedUpdate(h)
  }

  update(dt, ctx) {
    if (ctx) this.ctx = ctx
    /* Читается РОВНО раз в кадр и до любых ранних выходов: иначе _rawPrev
     * отстаёт и следующая дельта приходит завышенной. */
    const rawDt = this._rawDelta(dt)
    this.time += dt

    /* Пружина отдачи: интегрируем и отдаём дельту наружу. Жёсткость и
     * демпфирование берутся из активного ствола, если он их переопределяет:
     * компактный MP7A2 садится обратно быстрее карабина. */
    if (dt > 0) {
      const sd = this.weapon ? this.weapon.def : null
      const kk = sd && sd.recoilK ? sd.recoilK : RECOIL_K
      const dd = sd && sd.recoilD ? sd.recoilD : RECOIL_D
      const accP = -kk * this._kickPitch - dd * this._kickVelP
      const accY = -kk * this._kickYaw - dd * this._kickVelY
      this._kickVelP += accP * dt
      this._kickVelY += accY * dt
      const prevP = this._kickPitch
      const prevY = this._kickYaw
      this._kickPitch += this._kickVelP * dt
      this._kickYaw += this._kickVelY * dt
      if (Math.abs(this._kickPitch) < 1e-5 && Math.abs(this._kickVelP) < 1e-4) {
        this._kickPitch = 0
        this._kickVelP = 0
      }
      if (Math.abs(this._kickYaw) < 1e-5 && Math.abs(this._kickVelY) < 1e-4) {
        this._kickYaw = 0
        this._kickVelY = 0
      }
      this.recoilPitch += this._kickPitch - prevP
      this.recoilYaw += this._kickYaw - prevY
    }

    /* Спуск, прицеливание и перезарядка с реального ввода. Все вызовы
     * идемпотентны, поэтому дублирование из PlayerSystem безвредно.
     * swapWeapon сознательно НЕ вешаем: core/input.js держит на нём Tab,
     * который принадлежит инвентарю. */
    if (this.autoInput && this.enabled) {
      const input = this.ctx && this.ctx.input
      if (input) {
        if (typeof input.fire === "boolean") this.setTrigger(input.fire)
        if (typeof input.ads === "boolean") this.setAds(input.ads)
        if (typeof input.actionPressed === "function") {
          if (input.actionPressed("reload")) {
            if (this.weapon && this.weapon.jammed) this.clearJam()
            else this.reload()
          }
        }
      }
    }

    const w = this.weapon
    if (w) {
      if (w.heat > 0) w.heat = Math.max(0, w.heat - dt * HEAT_COOL)
      const recover = (2.4 + w.def.ergo * 0.03) * dt
      this.bloom = Math.max(0, this.bloom - recover)
    }

    if (this.reloading && this.time >= this.reloadEndsAt) this._finishReload()

    this._updateViewmodel(dt, rawDt)

    if (!this.enabled || !w || this.reloading) return
    if (w.burstLeft > 0) {
      this.tryFire()
      return
    }
    if (this.triggerDown) this.tryFire()
    this._emitState()
  }

  /* Снимок для HUD. Объект переиспользуется, в кадре не аллоцирует. */
  hudState(out) {
    const o =
      out ||
      this._hud ||
      (this._hud = {
        name: "",
        mode: "",
        weapon: "",
        mag: 0,
        ammo: 0,
        magSize: 0,
        chambered: false,
        reserve: 0,
        jammed: false,
        reloading: false,
        reloadProgress: 0,
        heat: 0,
        cal: null,
        ads: false,
        spread: 0,
        lethalCount: 0,
        tacticalCount: 0,
      })
    const w = this.weapon
    if (!w) {
      o.name = ""
      o.mode = ""
      o.weapon = ""
      o.mag = 0
      o.ammo = 0
      o.magSize = 0
      o.chambered = false
      o.reserve = 0
      o.jammed = false
      o.reloading = false
      o.reloadProgress = 0
      o.heat = 0
      o.cal = null
      o.ads = this.ads
      o.spread = 0
      o.lethalCount = 0
      o.tacticalCount = 0
      return o
    }
    o.name = w.def.name
    o.mode = w.mode
    o.weapon = w.id
    o.mag = w.magCount
    o.ammo = w.ammoLeft
    o.magSize = w.def.mag
    o.chambered = w.chambered
    o.reserve = this._reserveFor(w.ammoIdx)
    o.jammed = w.jammed
    o.reloading = this.reloading
    o.reloadProgress = this.reloading
      ? 1 - Math.max(0, (this.reloadEndsAt - this.time) / Math.max(0.001, this.reloadDuration || 1))
      : 0
    o.heat = w.heat / MAX_HEAT
    o.cal = w.def.cal
    o.ads = this.ads
    o.spread = this._spreadDeg(w)
    o.lethalCount = 0
    o.tacticalCount = 0
    return o
  }

  dispose() {
    const ev = this.ctx && this.ctx.events
    if (ev && this._handlers && typeof ev.off === "function") {
      for (let i = 0; i < this._handlers.length; i++)
        ev.off(this._handlers[i][0], this._handlers[i][1])
    }
    this._handlers = null
    this.slots.primary = null
    this.slots.secondary = null
    this.slots.holster = null
    this.weapon = null
    this._phys = null
    this.projectiles?.dispose?.()
    this.projectiles = null
    this.viewmodel?.dispose?.()
    this.viewmodel = null
    this.viewmodelId = null
    this.handsFree = false
    this._rawPrev = -1
    this.ctx = null
  }
}

export default WeaponSystem
