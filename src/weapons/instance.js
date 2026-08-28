import { ammoIndex, ammoForCaliber, AMMO } from "../physics/penetration.js"
import { resolveWeaponConfig } from "./table.js"

/*
 * Escape from Larpov - экземпляр ствола и тунинг стрельбы.
 *
 * Выделено из index.js. Здесь нет ни three.js, ни логики выстрела:
 * только числа, генератор случайных и состояние одного экземпляра оружия.
 */

export const DEG = Math.PI / 180

export const JAM_BASE = 0.0016
export const HEAT_PER_SHOT = 0.055
export const HEAT_COOL = 0.42
export const MAX_HEAT = 3.2

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
export const RECOIL_K = 148
export const RECOIL_D = 23

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v
}

export function ammoField(field, idx, fallback) {
  const col = AMMO && AMMO[field]
  if (!col) return fallback
  const v = col[idx]
  if (v === undefined || v === null) return fallback
  if (typeof v === "string") return v
  return Number.isFinite(v) ? v : fallback
}

export function makeRng(ctx, label) {
  const r = ctx && ctx.rng
  if (r) {
    if (typeof r.fork === "function") {
      const f = r.fork(label)
      if (typeof f === "function") return f
      if (f && typeof f.next === "function")
        return function next() {
          return f.next()
        }
      if (f && typeof f.float === "function")
        return function next() {
          return f.float()
        }
    }
    if (typeof r === "function") return r
    if (typeof r.next === "function")
      return function next() {
        return r.next()
      }
    if (typeof r.float === "function")
      return function next() {
        return r.float()
      }
  }
  let a = 0x9e3779b9
  for (let i = 0; i < label.length; i++)
    a = Math.imul(a ^ label.charCodeAt(i), 16777619) >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* Состояние одного экземпляра ствола. Создаётся только при смене оружия, не в кадре. */
export class WeaponInstance {
  constructor(id, ammoId) {
    /* Неизвестный id больше НЕ бросает: движок продолжает загрузку на
     * подменённой конфигурации, а requestedId/isFallback остаются для
     * дев-оверлея и тестов. */
    const resolved = resolveWeaponConfig(id)
    const def = resolved.def
    this.id = resolved.id
    this.requestedId = typeof id === "string" ? id : null
    this.isFallback = resolved.fallback
    this.def = def
    this.mode = def.modes[0]
    this.modeIndex = 0
    this.ammoId = ammoId || null
    this.ammoIdx = ammoId ? ammoIndex(ammoId) : ammoForCaliber(def.cal)
    if (this.ammoIdx < 0) this.ammoIdx = ammoForCaliber(def.cal)
    if (!Number.isFinite(this.ammoIdx) || this.ammoIdx < 0) this.ammoIdx = 0
    this.magCount = def.mag
    this.chambered = true
    this.durability = 1
    this.heat = 0
    this.jammed = false
    this.suppressed = false
    this.burstLeft = 0
    this.cycleReady = true
  }

  get cal() {
    return this.def.cal
  }

  get ammoLeft() {
    return this.magCount + (this.chambered ? 1 : 0)
  }
}

export default WeaponInstance
