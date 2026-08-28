import * as THREE from "three";
import { ammoIndex, ammoForCaliber, AMMO } from "../physics/penetration.js";
import { WeaponMaterials } from "./materials.js";
import { Viewmodel } from "./viewmodel.js";
import { WEAPON_DEFS } from "./defs.js";
import { ProjectileSim } from "./ballistics.js";
import { buildRifle } from "./models/rifle.js";
import { buildSmg } from "./models/smg.js";
import { buildPistol } from "./models/pistol.js";

/*
 * Escape from Larpov - weapon subsystem.
 *
 * Контракт событий:
 *   weapon:fire        { weapon, origin, dir, seed, suppressed, bot, cal }
 *   weapon:shell       { position }
 *   weapon:reload      { weapon, phase }
 *   weapon:magcheck    { weapon, left }
 *   weapon:malfunction { weapon, kind }
 *   bullet:tracer      { from, to, speed }   <- через ProjectileSim
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
 *   recoilK    - НЕОБЯЗАТЕЛЬНО: жёсткость пружины отдачи для этого ствола
 *   recoilD    - НЕОБЯЗАТЕЛЬНО: демпфирование пружины отдачи для этого ствола
 *
 * recoilK/recoilD переопределяют глобальные RECOIL_K/RECOIL_D и позволяют
 * компактным стволам садиться обратно быстрее, не трогая остальные.
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
  /*
   * HK MP7A2. Раньше id жил ТОЛЬКО в src/items/index.js, поэтому стартовый
   * комплект валил Engine.init через new WeaponInstance("mp7a2").
   *
   * Калибр — "9x19", а не "46x30", осознанно: таблица AMMO в
   * physics/penetration.js, CAL_DEFAULT и START_RESERVE знают только
   * зарегистрированные калибры, а сам предмет в базе (cal: '9x19',
   * magId: 'mag_mp7' на 40 патронов) уже описан как 9x19. Любой
   * незарегистрированный калибр молча свалился бы в ammoForCaliber() -> 0,
   * то есть в 5.45 ПС, и ствол невозможно было бы перезарядить: _reserveFor()
   * искал бы патрон, которого нет в разгрузке.
   *
   * Отдача: низкий вертикальный подброс (rv ниже, чем у MP5) плюс своя
   * пружина — жёстче и сильнее задемпфирована глобальной, поэтому камера
   * возвращается на место заметно быстрее при 950 выстрелах в минуту.
   *
   * Вьюмодель: VIEWMODEL_KIND ниже отправляет ствол в компактный набор
   * "smg" (models/smg.js + WEAPON_DEFS.smg, 9x19, 950 rpm), отдельные меши
   * не нужны и ничего не грузится вслепую.
   */
  mp7a2: {
    name: "HK MP7A2",
    cal: "9x19",
    rpm: 950,
    modes: ["auto", "burst", "single"],
    mag: 40,
    pellets: 1,
    spread: 0.6,
    spreadAds: 0.18,
    rv: 0.58,
    rh: 0.19,
    ergo: 66,
    weight: 2.2,
    reload: 2.4,
    chamber: 0.55,
    price: 61000,
    suppressor: true,
    recoilK: 196,
    recoilD: 27,
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

const VIEWMODEL_KIND = {
  ak74m: "rifle",
  aks74u: "rifle",
  ak101: "rifle",
  m4a1: "rifle",
  saiga12: "rifle",
  mp133: "rifle",
  sv98: "rifle",
  svd: "rifle",
  mp5: "smg",
  mp7a2: "smg",
  pp19: "smg",
  pm: "pistol",
  glock17: "pistol",
};

/*
 * Идентификаторы из src/items/index.js, которых нет в таблице выше,
 * разрешаются в ближайший зарегистрированный ствол. Без этого лут и
 * стартовые комплекты уходили в общий фолбэк: дробовик m870 выдавал 5.56,
 * а мосинка стреляла как карабин.
 */
const WEAPON_ALIAS = {
  ak74n: "ak74m",
  glock: "glock17",
  mp7: "mp7a2",
  rpk16: "ak74m",
  mosin: "sv98",
  m870: "mp133",
};

/* Патрон по умолчанию для каждого калибра берётся из penetration.js. */

const JAM_BASE = 0.0016;
const HEAT_PER_SHOT = 0.055;
const HEAT_COOL = 0.42;
const MAX_HEAT = 3.2;

/*
 * Пружина отдачи камеры.
 *
 * Раньше отдача была голым сумматором: recoilPitch += rv, игрок забирал
 * значение и оно обнулялось. Камера уезжала вверх и там оставалась.
 * Теперь это пружина с демпфером: выстрел вбрасывает импульс в скорость,
 * update() интегрирует положение обратно к нулю, а pullRecoil() отдаёт
 * РАЗНИЦУ положения за кадр. Контракт наружу не изменился, но ствол
 * подбрасывает и возвращает на место.
 *
 * RECOIL_K   - жёсткость (чем выше, тем быстрее возврат)
 * RECOIL_D   - демпфирование, ~2*sqrt(K) даёт критическое
 *
 * Конкретный ствол может переопределить оба значения полями recoilK/recoilD.
 */
const RECOIL_K = 148;
const RECOIL_D = 23;

/* Запас патронов на старте. Ключи РАЗРЕШАЮТСЯ через ammoForCaliber,
 * а не пишутся строками: прежний хардкод "556m855" не совпадал с реальным
 * идентификатором "556_m855" из CAL_DEFAULT, поэтому _reserveFor() всегда
 * возвращал 0 и M4A1 невозможно было перезарядить в принципе. */
const START_RESERVE = [
  ["556", 120],
  ["545", 90],
  ["9x18", 48],
  ["9x19", 60],
  ["762x54", 40],
  ["12x70", 24],
];

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function ammoField(field, idx, fallback) {
  const col = AMMO && AMMO[field];
  if (!col) return fallback;
  const v = col[idx];
  if (v === undefined || v === null) return fallback;
  if (typeof v === "string") return v;
  return Number.isFinite(v) ? v : fallback;
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

/* Ствол, на который подменяется любой неизвестный идентификатор. */
export const FALLBACK_WEAPON_ID = "m4a1";

/*
 * Аварийный профиль на случай, если таблица WEAPONS вообще пуста (мод срезал
 * её или подменил модуль). Нужен ровно для одного: движок обязан доехать до
 * первого кадра, а не упасть в чёрный экран.
 */
const SAFE_WEAPON_DEF = {
  name: "—",
  cal: "9x19",
  rpm: 600,
  modes: ["single"],
  mag: 10,
  pellets: 1,
  spread: 1,
  spreadAds: 0.4,
  rv: 0.8,
  rh: 0.3,
  ergo: 60,
  weight: 2,
  reload: 2.5,
  chamber: 0.6,
  price: 0,
  suppressor: false,
};

/*
 * Резолвер конфигурации ствола.
 *
 * Раньше WeaponInstance бросал исключение на любой незнакомый id, и это
 * убивало ВСЮ загрузку: InventorySystem._seedStarterKit выдаёт стартовый
 * комплект до первого кадра, поэтому один незарегистрированный ствол
 * (mp7a2) валил Engine.init и давал чёрный экран.
 *
 * Теперь неизвестный id логируется предупреждением и подменяется на
 * FALLBACK_WEAPON_ID. Исключений здесь больше нет ни на одном пути.
 */
export function resolveWeaponConfig(id) {
  const key = typeof id === "string" ? id : "";
  const direct = WEAPONS[key];
  if (direct) return { id: key, def: direct, fallback: false };

  console.warn(
    '[weapons] Unknown weapon ID "' +
      key +
      '" requested. Automatically falling back to "' +
      FALLBACK_WEAPON_ID +
      '" to prevent boot loop crash.',
  );

  const fallback = WEAPONS[FALLBACK_WEAPON_ID];
  if (fallback) return { id: FALLBACK_WEAPON_ID, def: fallback, fallback: true };

  const first = Object.keys(WEAPONS)[0];
  if (first) return { id: first, def: WEAPONS[first], fallback: true };

  return { id: key || "unknown", def: SAFE_WEAPON_DEF, fallback: true };
}

/* Состояние одного экземпляра ствола. Создаётся только при смене оружия, не в кадре. */
export class WeaponInstance {
  constructor(id, ammoId) {
    /* Неизвестный id больше НЕ бросает: движок продолжает загрузку на
     * подменённой конфигурации, а requestedId/isFallback остаются для
     * дев-оверлея и тестов. */
    const resolved = resolveWeaponConfig(id);
    const def = resolved.def;
    this.id = resolved.id;
    this.requestedId = typeof id === "string" ? id : null;
    this.isFallback = resolved.fallback;
    this.def = def;
    this.mode = def.modes[0];
    this.modeIndex = 0;
    this.ammoId = ammoId || null;
    this.ammoIdx = ammoId ? ammoIndex(ammoId) : ammoForCaliber(def.cal);
    if (this.ammoIdx < 0) this.ammoIdx = ammoForCaliber(def.cal);
    if (!Number.isFinite(this.ammoIdx) || this.ammoIdx < 0) this.ammoIdx = 0;
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
  static deps = ["inventory", "materials", "render"];

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
    this.reloadDuration = 0;
    this.swapEndsAt = 0;

    /* Наружный контракт: накопленная за кадр дельта отдачи. */
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.bloom = 0;

    /* Внутреннее состояние пружины. */
    this._kickPitch = 0;
    this._kickYaw = 0;
    this._kickVelP = 0;
    this._kickVelY = 0;

    /* Читать ввод самостоятельно. Все хуки идемпотентны, поэтому это
     * безопасно даже если игрок дублирует их из своей подсистемы. */
    this.autoInput = true;

    /* Пулевая симуляция вместо мгновенного хитскана. */
    this.useProjectiles = true;
    this.projectiles = null;

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

    /* Преаллоцированные аргументы для ProjectileSim.spawn(). */
    this._spawnOpts = {
      origin: this._origin,
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
    };

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
    this._recoilOut = { x: 0, y: 0, z: 0 };

    this._handlers = null;
    this.viewmodel = null;
    this._weaponStateEvent = null;
    this._stateDirty = true;
    this._audioResumed = false;
  }

  init(ctx) {
    this.ctx = ctx;
    this.rng = makeRng(ctx, "weapons");
    this._initViewmodel(ctx);
    this.projectiles = new ProjectileSim(ctx);
    this.setWeapon("primary", "m4a1", null);
    this.setWeapon("holster", "pm", null);
    this.equip("primary");
    this._seedReserve();

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
            self._kickPitch = 0;
            self._kickYaw = 0;
            self._kickVelP = 0;
            self._kickVelY = 0;
            self.bloom = 0;
            self.projectiles?.clear?.();
            self._emitState(true);
          },
        ],
        [
          "raid:end",
          function onEnd() {
            self.enabled = false;
            self.triggerDown = false;
            self.projectiles?.clear?.();
            self._emitState(true);
          },
        ],
        [
          "inv:changed",
          function onInventory() {
            self._syncFromInventory();
          },
        ],
      ];
      for (let i = 0; i < this._handlers.length; i++)
        ev.on(this._handlers[i][0], this._handlers[i][1]);
    }
    this._syncFromInventory();
    this._emitState(true);
  }

  /* Разрешаем канонические идентификаторы патронов через таблицу, а не строками. */
  _seedReserve() {
    for (let i = 0; i < START_RESERVE.length; i++) {
      const cal = START_RESERVE[i][0];
      const count = START_RESERVE[i][1];
      const idx = ammoForCaliber(cal);
      if (!Number.isFinite(idx) || idx < 0) continue;
      const id = ammoField("id", idx, null);
      if (typeof id !== "string" || !id) continue;
      this.reserve[id] = (this.reserve[id] || 0) + count;
    }
  }

  _normalizeWeaponId(id) {
    return WEAPON_ALIAS[id] || id;
  }

  _viewmodelKindFor(id) {
    return VIEWMODEL_KIND[this._normalizeWeaponId(id)] || "rifle";
  }

  _initViewmodel(ctx) {
    if (!ctx?.viewScene || !ctx?.peek?.("materials")) return;
    const mats = new WeaponMaterials(ctx);
    const vm = new Viewmodel(ctx, mats);
    vm.trackCamera = true;
    vm.addWeapon(buildRifle(), WEAPON_DEFS.rifle);
    vm.addWeapon(buildSmg(), WEAPON_DEFS.smg);
    vm.addWeapon(buildPistol(), WEAPON_DEFS.pistol);
    this.viewmodel = vm;
  }

  _syncFromInventory() {
    const inv = this.ctx?.peek?.("inventory");
    if (!inv || typeof inv.slotItem !== "function") return;
    for (const slot of ["primary", "secondary", "holster"]) {
      const item = inv.slotItem(slot);
      this.setWeapon(slot, item ? item.id : null, null);
    }
    if (!this.weapon) {
      for (const slot of this.slotOrder) {
        if (this.slots[slot]) {
          this.equip(slot);
          break;
        }
      }
    }
  }

  /* Событие состояния слалось каждый кадр из update(). Теперь только по флагу. */
  _emitState(force) {
    if (!force && !this._stateDirty) return;
    this._stateDirty = false;
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
      });
    const w = this.weapon;
    if (!w) {
      o.empty = true;
      o.name = "";
      o.inMag = 0;
      o.chamber = false;
      o.capacity = 0;
      o.ammoName = "";
      o.modeShort = "";
      o.heat = 0;
      o.dur = 100;
      o.malfunction = false;
      o.malfunctionName = "";
      o.busy = "";
      o.reloading = false;
      this._emit("weapon:state", o);
      return;
    }
    o.empty = false;
    o.name = w.def.name;
    o.inMag = w.magCount;
    o.chamber = w.chambered;
    o.capacity = w.def.mag;
    o.ammoName = ammoField("id", w.ammoIdx, w.def.cal) || w.def.cal;
    o.modeShort = String(w.mode || "").toUpperCase();
    o.heat = Math.round((w.heat / MAX_HEAT) * 100);
    o.dur = Math.round(w.durability * 100);
    o.malfunction = !!w.jammed;
    o.malfunctionName = w.jammed ? "JAM" : "";
    o.busy = this.reloading ? "RELOADING" : "";
    o.reloading = this.reloading;
    this._emit("weapon:state", o);
  }

  /* --- Снаряжение --- */

  setWeapon(slot, weaponId, ammoId) {
    if (weaponId === null) {
      this.slots[slot] = null;
      if (this.slot === slot) this.weapon = null;
      this._stateDirty = true;
      this._emitState();
      return null;
    }
    const inst = new WeaponInstance(this._normalizeWeaponId(weaponId), ammoId);
    this.slots[slot] = inst;
    if (this.slot === slot) this.weapon = inst;
    this._stateDirty = true;
    this._emitState();
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
      const vmId = this._viewmodelKindFor(inst.id);
      this.viewmodel?.setActive?.(vmId);
      this.viewmodel?.play?.("draw");
    }
    this._stateDirty = true;
    this._emitState();
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
    this._stateDirty = true;
    this._emitState();
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
    const id = ammoField("id", ammoIdx, null);
    if (typeof id !== "string") return 0;
    const n = this.reserve[id];
    return n === undefined ? 0 : n;
  }

  _takeReserve(ammoIdx, want) {
    const id = ammoField("id", ammoIdx, null);
    if (typeof id !== "string") return 0;
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

  /* AudioContext стартует suspended до жеста пользователя, и это тихо
   * съедает ВСЮ процедурную стрельбу. Один раз пинаем его на первом выстреле. */
  _wakeAudio() {
    if (this._audioResumed) return;
    this._audioResumed = true;
    const audio = this.ctx?.peek?.("audio");
    if (!audio) return;
    try {
      if (typeof audio.resume === "function") audio.resume();
      else if (audio.ctx && typeof audio.ctx.resume === "function") audio.ctx.resume();
    } catch (e) { /* политика автоплея, не наша забота */ }
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

  getHudState(out) {
    return this.hudState(out);
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

    this._wakeAudio();

    /* Баллистические параметры патрона из таблицы penetration.js. */
    const muzzle = ammoField("speed", ammoIdx, 800);
    const dmg = ammoField("damage", ammoIdx, 30);
    const pen = ammoField("pen", ammoIdx, 1);
    const tracer = !!ammoField("tracer", ammoIdx, 0);
    const sim = this.useProjectiles ? this.projectiles : null;

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

      /* Основной путь: настоящий снаряд со временем полёта и просадкой.
       * ProjectileSim сам отдаёт терминальную баллистику в physics при
       * соприкосновении, поэтому пробитие остаётся в одном месте. */
      let spawned = false;
      if (sim) {
        const o = this._spawnOpts;
        o.speed = muzzle;
        o.damage = dmg;
        o.penetration = pen;
        o.dragK = 0.3;
        o.maxRange = 400;
        o.dropoff = 0.5;
        o.weapon = w.id;
        o.ammoIndex = ammoIdx;
        o.shooter = this.shooter || null;
        o.tracer = tracer && p === 0;
        spawned = !!sim.spawn(o);
      }

      /* Резервный хитскан, если симуляции нет. */
      if (!spawned && phys && typeof phys.penetrate === "function") {
        phys.penetrate(this._origin, this._pelletDir, ammoIdx, this.shooter);
      }
    }

    /* Отдача, нагрев и растущий разброс. Импульс идёт в СКОРОСТЬ пружины.
     * Жёсткость берём из ствола, если он её переопределяет. */
    const ergoK = clamp(1.35 - def.ergo * 0.007, 0.45, 1.35);
    const adsK = this.ads ? 0.72 : 1;
    const springK = def.recoilK ? def.recoilK : RECOIL_K;
    this._kickVelP += def.rv * ergoK * adsK * springK * 0.06;
    this._kickVelY += (this.rng() * 2 - 1) * def.rh * ergoK * adsK * springK * 0.06;
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

    /* События. Пейлоады переиспользуются, обработчики читают их синхронно.
     * weapon:fire — канонический вход для src/audio/weapons.js, поэтому
     * прямого дублирующего вызова микшера здесь нет. */
    const fe = this._fireEvent;
    fe.weapon = w.id;
    fe.seed = (this.shotsFired * 2654435761) >>> 0;
    fe.suppressed = w.suppressed;
    fe.bot = !!bot;
    fe.cal = def.cal;
    fe.mode = w.mode;
    this._emit("weapon:fire", fe);
    this.viewmodel?.addRecoil?.(def.rv * DEG * 0.1, this._kickYaw * DEG * 0.1, this.shotsFired <= 1);

    this._shellPos.set(
      this._origin.x + rx * 0.28,
      this._origin.y - 0.12,
      this._origin.z + rz * 0.28,
    );
    this._shellEvent.cal = def.cal;
    this._emit("weapon:shell", this._shellEvent);
    this._stateDirty = true;
    this._emitState();
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
    this.reloadDuration = dur;
    this.triggerLatch = true;
    w.burstLeft = 0;

    this._reloadEvent.weapon = w.id;
    this._reloadEvent.phase = "start";
    this._reloadEvent.duration = dur;
    this._emit("weapon:reload", this._reloadEvent);
    this._emit("weapon:reload:start", this._reloadEvent);
    this.viewmodel?.play?.(w.ammoLeft <= 1 ? "reloadEmpty" : "reloadTac");
    this._stateDirty = true;
    this._emitState();
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
    this._emit("weapon:reload:end", this._reloadEvent);
    this._stateDirty = true;
    this._emitState();
  }

  checkMag() {
    const w = this.weapon;
    if (!w) return -1;
    this._magEvent.weapon = w.id;
    this._magEvent.left = w.ammoLeft;
    this._emit("weapon:magcheck", this._magEvent);
    this._stateDirty = true;
    this._emitState();
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
    this._emit("weapon:reload:clear", this._reloadEvent);
    this._stateDirty = true;
    this._emitState();
    return true;
  }

  inspect() {
    this.viewmodel?.play?.("inspect");
    return true;
  }

  equipSlot(slot) {
    return this.equip(slot);
  }

  nextSlot(dir = 1) {
    if (dir > 0) return this.equipNext();
    const i = this.slotOrder.indexOf(this.slot);
    for (let k = 1; k <= this.slotOrder.length; k++) {
      const s = this.slotOrder[(i - k + this.slotOrder.length * 2) % this.slotOrder.length];
      if (this.slots[s]) return this.equip(s);
    }
    return false;
  }

  /* Игрок забирает накопленную отдачу раз в кадр и обнуляет её.
   * Значение — дельта пружины за кадр, поэтому камера подбрасывает
   * и сама возвращается на место. */
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

  getRecoilState() {
    const o = this._recoilOut;
    o.x = this._kickPitch;
    o.y = this._kickYaw;
    o.z = 0;
    return o;
  }

  /* Снаряды интегрируются на фиксированном шаге (120 Гц по ARCHITECTURE),
   * поэтому полёт пули не зависит от частоты кадров. Раньше этого метода
   * не существовало вовсе, и симуляция не могла шагать даже теоретически. */
  fixedUpdate(h, ctx) {
    if (ctx) this.ctx = ctx;
    if (this.projectiles) this.projectiles.fixedUpdate(h);
  }

  update(dt, ctx) {
    if (ctx) this.ctx = ctx;
    this.time += dt;

    /* Пружина отдачи: интегрируем и отдаём дельту наружу. Жёсткость и
     * демпфирование берутся из активного ствола, если он их переопределяет:
     * компактный MP7A2 садится обратно быстрее карабина. */
    if (dt > 0) {
      const sd = this.weapon ? this.weapon.def : null;
      const kk = sd && sd.recoilK ? sd.recoilK : RECOIL_K;
      const dd = sd && sd.recoilD ? sd.recoilD : RECOIL_D;
      const accP = -kk * this._kickPitch - dd * this._kickVelP;
      const accY = -kk * this._kickYaw - dd * this._kickVelY;
      this._kickVelP += accP * dt;
      this._kickVelY += accY * dt;
      const prevP = this._kickPitch;
      const prevY = this._kickYaw;
      this._kickPitch += this._kickVelP * dt;
      this._kickYaw += this._kickVelY * dt;
      if (Math.abs(this._kickPitch) < 1e-5 && Math.abs(this._kickVelP) < 1e-4) {
        this._kickPitch = 0;
        this._kickVelP = 0;
      }
      if (Math.abs(this._kickYaw) < 1e-5 && Math.abs(this._kickVelY) < 1e-4) {
        this._kickYaw = 0;
        this._kickVelY = 0;
      }
      this.recoilPitch += this._kickPitch - prevP;
      this.recoilYaw += this._kickYaw - prevY;
    }

    /* Спуск, прицеливание и перезарядка с реального ввода. Все вызовы
     * идемпотентны, поэтому дублирование из PlayerSystem безвредно.
     * swapWeapon сознательно НЕ вешаем: core/input.js держит на нём Tab,
     * который принадлежит инвентарю. */
    if (this.autoInput && this.enabled) {
      const input = this.ctx && this.ctx.input;
      if (input) {
        if (typeof input.fire === "boolean") this.setTrigger(input.fire);
        if (typeof input.ads === "boolean") this.setAds(input.ads);
        if (typeof input.actionPressed === "function") {
          if (input.actionPressed("reload")) {
            if (this.weapon && this.weapon.jammed) this.clearJam();
            else this.reload();
          }
        }
      }
    }

    const w = this.weapon;
    if (w) {
      if (w.heat > 0) w.heat = Math.max(0, w.heat - dt * HEAT_COOL);
      const recover = (2.4 + w.def.ergo * 0.03) * dt;
      this.bloom = Math.max(0, this.bloom - recover);
    }

    if (this.reloading && this.time >= this.reloadEndsAt) this._finishReload();

    if (this.viewmodel && this.weapon) {
      this.viewmodel.update(dt, {
        ads: this.ads,
        sprint: this.moving > 0.7 && !this.ads,
        lowReady: false,
        speed: this.moving * 6,
        crouch: this.stance === 0,
        airborne: false,
        trigger: this.triggerDown,
        empty: this.weapon.ammoLeft <= 0,
      });
    }

    if (!this.enabled || !w || this.reloading) return;
    if (w.burstLeft > 0) {
      this.tryFire();
      return;
    }
    if (this.triggerDown) this.tryFire();
    this._emitState();
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
      });
    const w = this.weapon;
    if (!w) {
      o.name = "";
      o.mode = "";
      o.weapon = "";
      o.mag = 0;
      o.ammo = 0;
      o.magSize = 0;
      o.chambered = false;
      o.reserve = 0;
      o.jammed = false;
      o.reloading = false;
      o.reloadProgress = 0;
      o.heat = 0;
      o.cal = null;
      o.ads = this.ads;
      o.spread = 0;
      o.lethalCount = 0;
      o.tacticalCount = 0;
      return o;
    }
    o.name = w.def.name;
    o.mode = w.mode;
    o.weapon = w.id;
    o.mag = w.magCount;
    o.ammo = w.ammoLeft;
    o.magSize = w.def.mag;
    o.chambered = w.chambered;
    o.reserve = this._reserveFor(w.ammoIdx);
    o.jammed = w.jammed;
    o.reloading = this.reloading;
    o.reloadProgress = this.reloading
      ? 1 - Math.max(0, (this.reloadEndsAt - this.time) / Math.max(0.001, this.reloadDuration || 1))
      : 0;
    o.heat = w.heat / MAX_HEAT;
    o.cal = w.def.cal;
    o.ads = this.ads;
    o.spread = this._spreadDeg(w);
    o.lethalCount = 0;
    o.tacticalCount = 0;
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
    this.projectiles?.dispose?.();
    this.projectiles = null;
    this.viewmodel?.dispose?.();
    this.viewmodel = null;
    this.ctx = null;
  }
}

export default WeaponSystem;
