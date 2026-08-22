import * as THREE from "three";
import { ammoIndex, ammoForCaliber, AMMO } from "../physics/penetration.js";

/*
 * Escape from Larpov - weapon subsystem.
 *
 * Контракт событий:
 *   weapon:fire        { weapon, origin, dir, seed, suppressed, bot, cal }
 *   weapon:shell       { position }
 *   weapon:reload      { weapon, phase }
 *   weapon:magcheck    { weapon, left }
 *   weapon:malfunction { weapon, kind }
 *
 * Ни одной аллокации в горячем пути: все векторы и пейлоады событий
 * созданы в конструкторе и перезаписываются на месте.
 */

const DEG = Math.PI / 180;

/* Режимы огня. burst всегда по три патрона. */
export const FIRE_MODES = ["single", "burst", "auto", "pump", "bolt"];

/*
 * Таблица стволов.
 *   rpm        - выстрелов в минуту
 *   spread     - базовый разброс от бедра в градусах
 *   spreadAds  - разброс в прицеле
 *   rv / rh    - вертикальная и горизонтальная отдача в градусах на выстрел
 *   ergo       - эргономика, влияет на скорость вскидки и сведение
 *   pellets    - число дробин в выстреле
 */
export const WEAPONS = {
  ak74m: {
    name: "АК-74М",
    cal: "545",
    rpm: 650,
    modes: ["auto", "single"],
    mag: 30,
    pellets: 1,
    spread: 0.58,
    spreadAds: 0.16,
    rv: 1.35,
    rh: 0.42,
    ergo: 44,
    weight: 3.6,
    reload: 2.9,
    chamber: 0.72,
    price: 24000,
    suppressor: true,
  },
  aks74u: {
    name: "АКС-74У",
    cal: "545",
    rpm: 700,
    modes: ["auto", "single"],
    mag: 30,
    pellets: 1,
    spread: 0.9,
    spreadAds: 0.28,
    rv: 1.6,
    rh: 0.55,
    ergo: 52,
    weight: 2.9,
    reload: 2.7,
    chamber: 0.68,
    price: 19000,
    suppressor: true,
  },
  ak101: {
    name: "АК-101",
    cal: "556",
    rpm: 600,
    modes: ["auto", "single"],
    mag: 30,
    pellets: 1,
    spread: 0.55,
    spreadAds: 0.15,
    rv: 1.3,
    rh: 0.4,
    ergo: 42,
    weight: 3.8,
    reload: 3,
    chamber: 0.74,
    price: 31000,
    suppressor: true,
  },
  m4a1: {
    name: "M4A1",
    cal: "556",
    rpm: 800,
    modes: ["auto", "burst", "single"],
    mag: 30,
    pellets: 1,
    spread: 0.5,
    spreadAds: 0.13,
    rv: 1.05,
    rh: 0.3,
    ergo: 56,
    weight: 3.2,
    reload: 2.6,
    chamber: 0.64,
    price: 42000,
    suppressor: true,
  },
  mp5: {
    name: "MP5",
    cal: "9x19",
    rpm: 800,
    modes: ["auto", "burst", "single"],
    mag: 30,
    pellets: 1,
    spread: 0.62,
    spreadAds: 0.2,
    rv: 0.75,
    rh: 0.26,
    ergo: 62,
    weight: 2.6,
    reload: 2.5,
    chamber: 0.6,
    price: 27000,
    suppressor: true,
  },
  pp19: {
    name: "ПП-19 Витязь",
    cal: "9x19",
    rpm: 750,
    modes: ["auto", "single"],
    mag: 30,
    pellets: 1,
    spread: 0.7,
    spreadAds: 0.22,
    rv: 0.8,
    rh: 0.3,
    ergo: 58,
    weight: 3.1,
    reload: 2.8,
    chamber: 0.62,
    price: 22000,
    suppressor: true,
  },
  mp133: {
    name: "МР-133",
    cal: "12x70",
    rpm: 70,
    modes: ["pump"],
    mag: 6,
    pellets: 8,
    spread: 2.6,
    spreadAds: 1.9,
    rv: 3.4,
    rh: 0.9,
    ergo: 38,
    weight: 3.5,
    reload: 4.6,
    chamber: 0.85,
    price: 12000,
    suppressor: false,
  },
  saiga12: {
    name: "Сайга-12",
    cal: "12x70",
    rpm: 240,
    modes: ["single"],
    mag: 8,
    pellets: 8,
    spread: 2.4,
    spreadAds: 1.7,
    rv: 3,
    rh: 0.8,
    ergo: 40,
    weight: 3.9,
    reload: 3.4,
    chamber: 0.8,
    price: 26000,
    suppressor: false,
  },
  sv98: {
    name: "СВ-98",
    cal: "762x54",
    rpm: 45,
    modes: ["bolt"],
    mag: 10,
    pellets: 1,
    spread: 0.18,
    spreadAds: 0.05,
    rv: 4.2,
    rh: 0.6,
    ergo: 30,
    weight: 6.2,
    reload: 5,
    chamber: 1.35,
    price: 58000,
    suppressor: true,
  },
  svd: {
    name: "СВД",
    cal: "762x54",
    rpm: 300,
    modes: ["single"],
    mag: 10,
    pellets: 1,
    spread: 0.26,
    spreadAds: 0.08,
    rv: 2.9,
    rh: 0.5,
    ergo: 34,
    weight: 4.3,
    reload: 3.6,
    chamber: 0.9,
    price: 64000,
    suppressor: true,
  },
  pm: {
    name: "ПМ",
    cal: "9x18",
    rpm: 600,
    modes: ["single"],
    mag: 8,
    pellets: 1,
    spread: 1.1,
    spreadAds: 0.42,
    rv: 0.9,
    rh: 0.3,
    ergo: 78,
    weight: 0.73,
    reload: 2.1,
    chamber: 0.55,
    price: 3500,
    suppressor: false,
  },
  glock17: {
    name: "Glock 17",
    cal: "9x19",
    rpm: 700,
    modes: ["single"],
    mag: 17,
    pellets: 1,
    spread: 0.95,
    spreadAds: 0.36,
    rv: 0.85,
    rh: 0.28,
    ergo: 74,
    weight: 0.9,
    reload: 2,
    chamber: 0.52,
    price: 9000,
    suppressor: true,
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS);

/* Патрон по умолчанию для каждого калибра берётся из penetration.js. */

const JAM_BASE = 0.0016;
const HEAT_PER_SHOT = 0.055;
const HEAT_COOL = 0.42;
const MAX_HEAT = 3.2;

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function makeRng(ctx, label) {
  const r = ctx && ctx.rng;
  if (r) {
    if (typeof r.fork === "function") {
      const f = r.fork(label);
      if (typeof f === "function") return f;
      if (f && typeof f.next === "function")
        return function next() {
          return f.next();
        };
      if (f && typeof f.float === "function")
        return function next() {
          return f.float();
        };
    }
    if (typeof r === "function") return r;
    if (typeof r.next === "function")
      return function next() {
        return r.next();
      };
    if (typeof r.float === "function")
      return function next() {
        return r.float();
      };
  }
  let a = 0x9e3779b9;
  for (let i = 0; i < label.length; i++)
    a = Math.imul(a ^ label.charCodeAt(i), 16777619) >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Состояние одного экземпляра ствола. Создаётся только при смене оружия, не в кадре. */
export class WeaponInstance {
  constructor(id, ammoId) {
    const def = WEAPONS[id];
    if (!def) throw new Error('[weapons] неизвестное оружие "' + id + '"');
    this.id = id;
    this.def = def;
    this.mode = def.modes[0];
    this.modeIndex = 0;
    this.ammoId = ammoId || null;
    this.ammoIdx = ammoId ? ammoIndex(ammoId) : ammoForCaliber(def.cal);
    if (this.ammoIdx < 0) this.ammoIdx = ammoForCaliber(def.cal);
    this.magCount = def.mag;
    this.chambered = true;
    this.durability = 1;
    this.heat = 0;
    this.jammed = false;
    this.suppressed = false;
    this.burstLeft = 0;
    this.cycleReady = true;
  }

  get cal() {
    return this.def.cal;
  }

  get ammoLeft() {
    return this.magCount + (this.chambered ? 1 : 0);
  }
}

export class WeaponSystem {
  static id = "weapons";
  static deps = [];

  constructor() {
    this.ctx = null;
    this.rng = null;
    this.enabled = true;

    this.slots = { primary: null, secondary: null, holster: null };
    this.slotOrder = ["primary", "secondary", "holster"];
    this.slot = "primary";
    this.weapon = null;

    this.triggerDown = false;
    this.triggerLatch = false;
    this.ads = false;
    this.moving = 0;
    this.stance = 1;
    this.nextShotAt = 0;
    this.time = 0;

    this.reloading = false;
    this.reloadEndsAt = 0;
    this.swapEndsAt = 0;

    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.bloom = 0;

    this.reserve = Object.create(null);
    this.shotsFired = 0;

    /* --- Пул временных объектов. Всё, что нужно в tryFire. --- */
    this._origin = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._pelletDir = new THREE.Vector3();
    this._shellPos = new THREE.Vector3();

    /* Переиспользуемые пейлоады событий: обработчики читают их синхронно. */
    this._fireEvent = {
      weapon: null,
      origin: this._origin,
      dir: this._dir,
      seed: 0,
      suppressed: false,
      bot: false,
      cal: null,
      mode: null,
    };
    this._shellEvent = { position: this._shellPos, cal: null };
    this._reloadEvent = { weapon: null, phase: "start", duration: 0 };
    this._magEvent = { weapon: null, left: 0, position: this._origin };
    this._jamEvent = { weapon: null, kind: "jam", position: this._origin };

    this._handlers = null;
  }

  init(ctx) {
    this.ctx = ctx;
    this.rng = makeRng(ctx, "weapons");
    this.setWeapon("primary", "ak74m", null);
    this.setWeapon("holster", "pm", null);
    this.equip("primary");
    this.reserve["545_bp"] = 120;
    this.reserve["9x18_pst"] = 48;

    const ev = ctx && ctx.events;
    if (ev && typeof ev.on === "function") {
      const self = this;
      this._handlers = [
        [
          "raid:start",
          function onStart() {
            self.enabled = true;
            self.triggerDown = false;
            self.reloading = false;
            self.recoilPitch = 0;
            self.recoilYaw = 0;
            self.bloom = 0;
          },
        ],
        [
          "raid:end",
          function onEnd() {
            self.enabled = false;
            self.triggerDown = false;
          },
        ],
      ];
      for (let i = 0; i < this._handlers.length; i++)
        ev.on(this._handlers[i][0], this._handlers[i][1]);
    }
  }

  /* --- Снаряжение --- */

  setWeapon(slot, weaponId, ammoId) {
    if (weaponId === null) {
      this.slots[slot] = null;
      if (this.slot === slot) this.weapon = null;
      return null;
    }
    const inst = new WeaponInstance(weaponId, ammoId);
    this.slots[slot] = inst;
    if (this.slot === slot) this.weapon = inst;
    return inst;
  }

  equip(slot) {
    if (!Object.prototype.hasOwnProperty.call(this.slots, slot)) return false;
    const inst = this.slots[slot];
    this.slot = slot;
    this.weapon = inst;
    this.reloading = false;
    this.triggerLatch = true;
    if (inst) {
      const t = clamp(1.1 - inst.def.ergo * 0.008, 0.32, 1.1);
      this.swapEndsAt = this.time + t;
      this.nextShotAt = this.swapEndsAt;
    }
    return true;
  }

  equipNext() {
    const i = this.slotOrder.indexOf(this.slot);
    for (let k = 1; k <= this.slotOrder.length; k++) {
      const s = this.slotOrder[(i + k) % this.slotOrder.length];
      if (this.slots[s]) return this.equip(s);
    }
    return false;
  }

  toggleMode() {
    const w = this.weapon;
    if (!w || w.def.modes.length < 2) return null;
    w.modeIndex = (w.modeIndex + 1) % w.def.modes.length;
    w.mode = w.def.modes[w.modeIndex];
    w.burstLeft = 0;
    return w.mode;
  }

  setSuppressor(on) {
    const w = this.weapon;
    if (!w) return false;
    if (!w.def.suppressor) return false;
    w.suppressed = !!on;
    return true;
  }

  /* Сколько патронов этого типа осталось в разгрузке. */
  _reserveFor(ammoIdx) {
    const id = AMMO.id[ammoIdx];
    const n = this.reserve[id];
    return n === undefined ? 0 : n;
  }

  _takeReserve(ammoIdx, want) {
    const id = AMMO.id[ammoIdx];
    const have = this.reserve[id] === undefined ? 0 : this.reserve[id];
    const take = have < want ? have : want;
    this.reserve[id] = have - take;
    return take;
  }

  addReserve(ammoId, count) {
    const have = this.reserve[ammoId] === undefined ? 0 : this.reserve[ammoId];
    this.reserve[ammoId] = have + count;
    return this.reserve[ammoId];
  }

  setShooter(actor) {
    this.shooter = actor || null;
    return this.shooter;
  }

  _physics() {
    if (this._phys) return this._phys;
    const c = this.ctx;
    if (!c) return null;
    let p = null;
    try {
      if (typeof c.peek === "function") p = c.peek("physics");
    } catch (e) {
      p = null;
    }
    if (!p) {
      try {
        if (typeof c.get === "function") p = c.get("physics");
      } catch (e) {
        p = null;
      }
    }
    if (p) this._phys = p;
    return p;
  }

  _emit(name, payload) {
    const ev = this.ctx && this.ctx.events;
    if (ev && typeof ev.emit === "function") ev.emit(name, payload);
  }

  /* --- Управление спусковым крючком --- */

  setTrigger(down) {
    const d = !!down;
    if (!d) this.triggerLatch = false;
    this.triggerDown = d;
    return d;
  }

  setAds(on) {
    this.ads = !!on;
    return this.ads;
  }

  /*
   * Текущий разброс в градусах.
   * Складывается из базы ствола, накопленного bloom, стойки и движения.
   */
  _spreadDeg(w) {
    const base = this.ads ? w.def.spreadAds : w.def.spread;
    const move = 1 + this.moving * 1.4;
    const stance = this.stance === 0 ? 0.55 : this.stance === 2 ? 0.78 : 1;
    return (base + this.bloom) * move * stance;
  }

  /*
   * ГЛАВНЫЙ МЕТОД. Ни одного new, ни одного clone().
   *
   * Базис камеры читается напрямую из matrixWorld.elements:
   *   e[12..14] - мировая позиция
   *   -e[8..10] - направление взгляда
   *   e[0..2]   - вправо
   *   e[4..6]   - вверх
   * Матрица не декомпозируется, кватернионы не создаются.
   */
  tryFire() {
    if (!this.enabled) return false;
    const w = this.weapon;
    if (!w) return false;
    if (this.reloading) return false;
    if (this.time < this.swapEndsAt) return false;
    if (this.time < this.nextShotAt) return false;

    const mode = w.mode;
    const auto = mode === "auto";
    if (!auto && this.triggerLatch && w.burstLeft <= 0) return false;

    if (w.jammed) {
      this._jamEvent.weapon = w.id;
      this._jamEvent.kind = "jam";
      this._emit("weapon:malfunction", this._jamEvent);
      this.nextShotAt = this.time + 0.3;
      this.triggerLatch = true;
      return false;
    }

    if (!w.chambered) {
      this._jamEvent.weapon = w.id;
      this._jamEvent.kind = "empty";
      this._emit("weapon:malfunction", this._jamEvent);
      this.nextShotAt = this.time + 0.28;
      this.triggerLatch = true;
      w.burstLeft = 0;
      return false;
    }

    const cam = this.ctx && this.ctx.camera ? this.ctx.camera : null;
    if (cam) {
      const e = cam.matrixWorld.elements;
      this._origin.set(e[12], e[13], e[14]);
      this._dir.set(-e[8], -e[9], -e[10]);
    } else if (this.shooter && this.shooter.position && this.shooter.forward) {
      const p = this.shooter.position;
      const f = this.shooter.forward;
      this._origin.set(p.x, p.y + 1.5, p.z);
      this._dir.set(f.x, f.y, f.z);
    } else {
      return false;
    }

    if (mode === "burst" && w.burstLeft <= 0) w.burstLeft = 3;
    this._discharge(w, false);

    if (mode === "burst") {
      w.burstLeft--;
      if (w.burstLeft < 0) w.burstLeft = 0;
    }
    if (!auto) this.triggerLatch = true;
    return true;
  }

  /* Выстрел бота: тот же горячий путь, но с явным началом и направлением. */
  fireFrom(originVec, dirVec, weaponInstance, actor) {
    const w = weaponInstance || this.weapon;
    if (!w || !w.chambered) return false;
    this._origin.set(originVec.x, originVec.y, originVec.z);
    this._dir.set(dirVec.x, dirVec.y, dirVec.z);
    const prev = this.shooter;
    if (actor !== undefined) this.shooter = actor;
    this._discharge(w, true);
    this.shooter = prev;
    return true;
  }

  /*
   * Собственно выстрел. _origin и _dir уже заполнены.
   * Ортонормированный базис считается скалярами прямо здесь.
   */
  _discharge(w, bot) {
    /* Нормализация направления без создания объектов. */
    let dx = this._dir.x;
    let dy = this._dir.y;
    let dz = this._dir.z;
    let len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-6) return;
    const inv = 1 / len;
    dx *= inv;
    dy *= inv;
    dz *= inv;
    this._dir.set(dx, dy, dz);

    /* right = normalize(dir x worldUp), up = right x dir. */
    let ux = 0;
    let uy = 1;
    let uz = 0;
    if (dy > 0.999 || dy < -0.999) {
      ux = 1;
      uy = 0;
      uz = 0;
    }
    let rx = dy * uz - dz * uy;
    let ry = dz * ux - dx * uz;
    let rz = dx * uy - dy * ux;
    len = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (len < 1e-6) {
      rx = 1;
      ry = 0;
      rz = 0;
      len = 1;
    }
    const rinv = 1 / len;
    rx *= rinv;
    ry *= rinv;
    rz *= rinv;
    const vx = ry * dz - rz * dy;
    const vy = rz * dx - rx * dz;
    const vz = rx * dy - ry * dx;
    this._right.set(rx, ry, rz);
    this._up.set(vx, vy, vz);

    const def = w.def;
    const pellets = def.pellets;
    const spread = this._spreadDeg(w) * DEG;
    const phys = this._physics();
    const ammoIdx = w.ammoIdx;

    /* Снятие патрона: стреляет тот, что в патроннике, следующий идёт из магазина. */
    w.chambered = false;
    if (w.magCount > 0) {
      w.magCount--;
      w.chambered = true;
    }

    /*
     * Цикл дроби. Раньше здесь был dir.clone().applyAxisAngle() — восемь
     * новых Vector3 на каждый выстрел. Теперь это два скаляра и один
     * преаллоцированный _pelletDir, который перезаписывается на месте.
     */
    for (let p = 0; p < pellets; p++) {
      const ang = this.rng() * 6.28318530718;
      const rad = Math.sqrt(this.rng()) * spread;
      const sx = Math.cos(ang) * rad;
      const sy = Math.sin(ang) * rad;

      let px = dx + rx * sx + vx * sy;
      let py = dy + ry * sx + vy * sy;
      let pz = dz + rz * sx + vz * sy;
      const pl = Math.sqrt(px * px + py * py + pz * pz);
      if (pl > 1e-6) {
        const pinv = 1 / pl;
        px *= pinv;
        py *= pinv;
        pz *= pinv;
      }
      this._pelletDir.set(px, py, pz);

      if (phys && typeof phys.penetrate === "function") {
        phys.penetrate(this._origin, this._pelletDir, ammoIdx, this.shooter);
      }
    }

    /* Отдача, нагрев и растущий разброс. */
    const ergoK = clamp(1.35 - def.ergo * 0.007, 0.45, 1.35);
    const adsK = this.ads ? 0.72 : 1;
    this.recoilPitch += def.rv * ergoK * adsK;
    this.recoilYaw += (this.rng() * 2 - 1) * def.rh * ergoK * adsK;
    this.bloom = Math.min(this.bloom + def.spread * 0.32, def.spread * 2.6);
    w.heat = Math.min(w.heat + HEAT_PER_SHOT, MAX_HEAT);
    this.shotsFired++;

    /* Задержка следующего выстрела. */
    let interval = 60 / def.rpm;
    if (w.mode === "pump" || w.mode === "bolt") interval = def.chamber + 0.18;
    this.nextShotAt = this.time + interval;

    /* Шанс перекоса растёт с нагревом и падает с ресурсом ствола. */
    if (this.rng() < JAM_BASE * (1 + w.heat) * (2 - w.durability))
      w.jammed = true;
    w.durability = Math.max(0.35, w.durability - 0.00035);

    /* События. Пейлоады переиспользуются, обработчики читают их синхронно. */
    const fe = this._fireEvent;
    fe.weapon = w.id;
    fe.seed = (this.shotsFired * 2654435761) >>> 0;
    fe.suppressed = w.suppressed;
    fe.bot = !!bot;
    fe.cal = def.cal;
    fe.mode = w.mode;
    this._emit("weapon:fire", fe);

    this._shellPos.set(
      this._origin.x + rx * 0.28,
      this._origin.y - 0.12,
      this._origin.z + rz * 0.28,
    );
    this._shellEvent.cal = def.cal;
    this._emit("weapon:shell", this._shellEvent);
  }

  /* --- Перезарядка и обслуживание --- */

  reload() {
    const w = this.weapon;
    if (!w || this.reloading) return false;
    if (w.magCount >= w.def.mag) return false;
    if (this._reserveFor(w.ammoIdx) <= 0) return false;

    const speed = clamp(1.3 - w.def.ergo * 0.005, 0.7, 1.3);
    const dur = w.def.reload * speed;
    this.reloading = true;
    this.reloadEndsAt = this.time + dur;
    this.triggerLatch = true;
    w.burstLeft = 0;

    this._reloadEvent.weapon = w.id;
    this._reloadEvent.phase = "start";
    this._reloadEvent.duration = dur;
    this._emit("weapon:reload", this._reloadEvent);
    return true;
  }

  _finishReload() {
    const w = this.weapon;
    this.reloading = false;
    if (!w) return;
    const need = w.def.mag - w.magCount;
    if (need > 0) w.magCount += this._takeReserve(w.ammoIdx, need);
    if (!w.chambered && w.magCount > 0) {
      w.magCount--;
      w.chambered = true;
    }
    w.jammed = false;
    this.nextShotAt = this.time + 0.16;

    this._reloadEvent.weapon = w.id;
    this._reloadEvent.phase = "end";
    this._reloadEvent.duration = 0;
    this._emit("weapon:reload", this._reloadEvent);
  }

  checkMag() {
    const w = this.weapon;
    if (!w) return -1;
    this._magEvent.weapon = w.id;
    this._magEvent.left = w.ammoLeft;
    this._emit("weapon:magcheck", this._magEvent);
    return w.ammoLeft;
  }

  clearJam() {
    const w = this.weapon;
    if (!w || !w.jammed) return false;
    w.jammed = false;
    w.heat = Math.max(0, w.heat - 0.6);
    this.nextShotAt = this.time + w.def.chamber;
    this._reloadEvent.weapon = w.id;
    this._reloadEvent.phase = "clear";
    this._reloadEvent.duration = w.def.chamber;
    this._emit("weapon:reload", this._reloadEvent);
    return true;
  }

  /* Игрок забирает накопленную отдачу раз в кадр и обнуляет её. */
  pullRecoil(out) {
    const pitch = this.recoilPitch;
    const yaw = this.recoilYaw;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    if (out) {
      out.x = pitch * DEG;
      out.y = yaw * DEG;
      out.z = 0;
    }
    return pitch;
  }

  update(dt, ctx) {
    if (ctx) this.ctx = ctx;
    this.time += dt;

    const w = this.weapon;
    if (w) {
      if (w.heat > 0) w.heat = Math.max(0, w.heat - dt * HEAT_COOL);
      const recover = (2.4 + w.def.ergo * 0.03) * dt;
      this.bloom = Math.max(0, this.bloom - recover);
    }

    if (this.reloading && this.time >= this.reloadEndsAt) this._finishReload();

    if (!this.enabled || !w || this.reloading) return;
    if (w.burstLeft > 0) {
      this.tryFire();
      return;
    }
    if (this.triggerDown) this.tryFire();
  }

  /* Снимок для HUD. Объект переиспользуется, в кадре не аллоцирует. */
  hudState(out) {
    const o =
      out ||
      this._hud ||
      (this._hud = {
        name: "",
        mode: "",
        mag: 0,
        chambered: false,
        reserve: 0,
        jammed: false,
        reloading: false,
        heat: 0,
        cal: null,
      });
    const w = this.weapon;
    if (!w) {
      o.name = "";
      o.mode = "";
      o.mag = 0;
      o.chambered = false;
      o.reserve = 0;
      o.jammed = false;
      o.reloading = false;
      o.heat = 0;
      o.cal = null;
      return o;
    }
    o.name = w.def.name;
    o.mode = w.mode;
    o.mag = w.magCount;
    o.chambered = w.chambered;
    o.reserve = this._reserveFor(w.ammoIdx);
    o.jammed = w.jammed;
    o.reloading = this.reloading;
    o.heat = w.heat / MAX_HEAT;
    o.cal = w.def.cal;
    return o;
  }

  dispose() {
    const ev = this.ctx && this.ctx.events;
    if (ev && this._handlers && typeof ev.off === "function") {
      for (let i = 0; i < this._handlers.length; i++)
        ev.off(this._handlers[i][0], this._handlers[i][1]);
    }
    this._handlers = null;
    this.slots.primary = null;
    this.slots.secondary = null;
    this.slots.holster = null;
    this.weapon = null;
    this._phys = null;
    this.ctx = null;
  }
}

export default WeaponSystem;
