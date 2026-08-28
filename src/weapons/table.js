/*
 * Escape from Larpov - таблицы оружия.
 *
 * Только данные и резолвер конфигурации: никакого состояния, никакой
 * логики выстрела, ни одного импорта three.js. Выделено из index.js:
 * две трети того файла было статикой, и его невозможно было читать целиком.
 *
 * index.js реэкспортирует всё нижеперечисленное, поэтому старые импорты
 * вида `import { WEAPONS } from "../weapons/index.js"` продолжают работать.
 */

/* Режимы огня. burst всегда по три патрона. */
export const FIRE_MODES = ["single", "burst", "auto", "pump", "bolt"]

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
}

export const WEAPON_IDS = Object.keys(WEAPONS)

export const VIEWMODEL_KIND = {
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
}

/*
 * Идентификаторы из src/items/index.js, которых нет в таблице выше,
 * разрешаются в ближайший зарегистрированный ствол. Без этого лут и
 * стартовые комплекты уходили в общий фолбэк: дробовик m870 выдавал 5.56,
 * а мосинка стреляла как карабин.
 */
export const WEAPON_ALIAS = {
  ak74n: "ak74m",
  glock: "glock17",
  mp7: "mp7a2",
  rpk16: "ak74m",
  mosin: "sv98",
  m870: "mp133",
}

/* Ствол, на который подменяется любой неизвестный идентификатор. */
export const FALLBACK_WEAPON_ID = "m4a1"

/*
 * Аварийный профиль на случай, если таблица WEAPONS вообще пуста (мод срезал
 * её или подменил модуль). Нужен ровно для одного: движок обязан доехать до
 * первого кадра, а не упасть в чёрный экран.
 */
export const SAFE_WEAPON_DEF = {
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
}

/* Запас патронов на старте. Ключи РАЗРЕШАЮТСЯ через ammoForCaliber,
 * а не пишутся строками: прежний хардкод "556m855" не совпадал с реальным
 * идентификатором "556_m855" из CAL_DEFAULT, поэтому _reserveFor() всегда
 * возвращал 0 и M4A1 невозможно было перезарядить в принципе. */
export const START_RESERVE = [
  ["556", 120],
  ["545", 90],
  ["9x18", 48],
  ["9x19", 60],
  ["762x54", 40],
  ["12x70", 24],
]

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
  const key = typeof id === "string" ? id : ""
  const direct = WEAPONS[key]
  if (direct) return { id: key, def: direct, fallback: false }

  console.warn(
    '[weapons] Unknown weapon ID "' +
      key +
      '" requested. Automatically falling back to "' +
      FALLBACK_WEAPON_ID +
      '" to prevent boot loop crash.',
  )

  const fallback = WEAPONS[FALLBACK_WEAPON_ID]
  if (fallback) return { id: FALLBACK_WEAPON_ID, def: fallback, fallback: true }

  const first = Object.keys(WEAPONS)[0]
  if (first) return { id: first, def: WEAPONS[first], fallback: true }

  return { id: key || "unknown", def: SAFE_WEAPON_DEF, fallback: true }
}

/* Нормализация идентификатора и выбор вьюмодели живут рядом с таблицами,
 * которые они читают. */
export function normalizeWeaponId(id) {
  return WEAPON_ALIAS[id] || id
}

export function viewmodelKindFor(id) {
  return VIEWMODEL_KIND[normalizeWeaponId(id)] || "rifle"
}
