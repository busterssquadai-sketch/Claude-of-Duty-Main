/* ==========================================================================
 * Escape-From-Larpov · src/ui/raidResult.js
 * Последовательный пост-рейдовый отчёт (выжил / погиб):
 *   шаг 1 — Список убийств
 *   шаг 2 — Статистика рейда
 *   шаг 3 — Опыта получено
 * Собственный scoped CSS, шрифты Bebas Neue / Oswald, акцент #e27210.
 * ========================================================================== */

import { ensureTarkovFonts, STATE, formatRaidClock } from './escapeMenu.js'

export const RAID_STEP = {
  KILLS: 'kills',
  STATS: 'stats',
  EXPERIENCE: 'experience',
}

export const RAID_STEP_ORDER = [RAID_STEP.KILLS, RAID_STEP.STATS, RAID_STEP.EXPERIENCE]

/* --------------------------------------------------------------------------
 * Данные по умолчанию — полностью совпадают со скриншотами.
 * Любое поле перекрывается реальными данными из ctx.get('raid').stats.
 * ------------------------------------------------------------------------ */
export const DEFAULT_KILL_LIST = [
  { location: 'Завод', time: '00:01:28', player: 'Жора Вереск',     level: '—', faction: 'дикий', status: 'Убит (HK 416A5, грудная клетка, 5.5 м)' },
  { location: 'Завод', time: '00:02:36', player: 'Тагилла',         level: '—', faction: 'БОСС',   status: 'В голову (HK 416A5, 4.9 м)' },
  { location: 'Завод', time: '00:03:10', player: 'Влад Геленджик', level: '—', faction: 'дикий', status: 'Убит (МР-155, грудная клетка, 5.4 м)' },
  { location: 'Завод', time: '00:03:44', player: 'Трифон Кот',      level: '—', faction: 'дикий', status: 'Убит (МР-155, грудная клетка, 7.1 м)' },
  { location: 'Завод', time: '00:04:19', player: 'Пуш Шапка',       level: '—', faction: 'дикий', status: 'Убит (МР-155, живот, 3.8 м)' },
]

export const DEFAULT_RAID_STATS = [
  {
    title: 'Здоровье и физическое состояние',
    rows: [
      { label: 'Крови потеряно', value: '0.11л' },
      { label: 'Частей тела потеряно', value: '1' },
      { label: 'Наименее поражаемая часть тела', value: 'ГОЛОВА' },
      { label: 'Здоровья восстановлено', value: '126.88' },
    ],
  },
  {
    title: 'Добыча',
    rows: [
      { label: 'Км пройдено', value: '0.481' },
      { label: 'Тел обыскано', value: '3' },
      { label: 'Оружия найдено', value: '1' },
      { label: 'Найдено обвесов', value: '8' },
      { label: 'Метательного оружия найдено', value: '3' },
      { label: 'Провианта найдено', value: '1' },
      { label: 'Снаряжения найдено', value: '9' },
    ],
  },
  {
    title: 'Бой',
    rows: [
      { label: 'Урон нанесенный по телу', value: '888' },
      { label: 'Урон поглощенный броней', value: '809' },
      { label: 'Боеприпасов израсходовано', value: '73' },
      { label: 'Количество попаданий', value: '33' },
      { label: 'Смертельных попаданий', value: '5' },
    ],
  },
]

export const DEFAULT_EXPERIENCE = {
  levelFrom: 41,
  levelTo: 42,
  levelStartXp: 3998100,
  currentXp: 4575176,
  remainingXp: 190623,
  groups: [
    {
      title: 'Боевой опыт',
      total: 3119,
      rows: [
        { label: 'Уничтожение противника', count: 5, xp: 1445 },
        { label: 'Попадания в голову', count: 1, xp: 1347 },
        { label: 'Бонус за серию убийств', count: null, xp: 310 },
        { label: 'Нанесенный тяжелый урон', count: null, xp: 17 },
      ],
    },
    {
      title: 'Исследовательский опыт',
      total: 300,
      rows: [{ label: 'Опыт за выход из локации', count: null, xp: 300 }],
    },
    {
      title: 'Лечение и уход',
      total: 166,
      rows: [{ label: 'Лечение', count: null, xp: 166 }],
    },
    {
      title: 'Опыт за нахождение предметов',
      total: 335,
      rows: [{ label: 'Предметы', count: null, xp: 335 }],
    },
  ],
  summary: {
    status: 'Выжил',
    base: 3919,
    multipliers: [1.5, 1.2],
    total: 7031,
  },
}

/* ------------------------------------------------------------------ utils */
function call(target, method, ...args) {
  if (target && typeof target[method] === 'function') return target[method](...args)
  return undefined
}

export function formatNumber(value) {
  if (value == null || isNaN(value)) return '0'
  return Math.round(value).toLocaleString('ru-RU')
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/* ==========================================================================
 * CSS
 * ========================================================================== */
const RAID_RESULT_CSS = `
.efl-res, .efl-res * { box-sizing: border-box; margin: 0; padding: 0; }

.efl-res {
  --efl-orange: #e27210;
  --efl-lime: #9bd12a;
  --efl-text: #c8c7c2;
  --efl-dim: #85847f;
  --efl-line: rgba(200, 199, 194, 0.10);
  position: fixed;
  inset: 0;
  z-index: 9200;
  display: flex;
  flex-direction: column;
  align-items: center;
  font-family: 'Oswald', 'Geometria', Arial, sans-serif;
  color: var(--efl-text);
  user-select: none;
  opacity: 0;
  transition: opacity 160ms ease-out;
}
.efl-res.is-visible { opacity: 1; }

.efl-res__bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(120% 100% at 50% 0%, rgba(30, 29, 25, 0.55) 0%, rgba(6, 7, 6, 0.95) 70%),
    #060706;
  backdrop-filter: blur(10px) saturate(0.7);
  -webkit-backdrop-filter: blur(10px) saturate(0.7);
}
.efl-res__bg::after {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0.055;
  background-image: repeating-linear-gradient(0deg, rgba(255,255,255,0.08) 0 1px, transparent 1px 3px);
  mix-blend-mode: overlay;
}

.efl-res__head { position: relative; padding: 40px 0 6px; text-align: center; }
.efl-res__title {
  font-family: 'Bebas Neue', Impact, sans-serif;
  font-size: 46px;
  letter-spacing: 0.15em;
  line-height: 1;
  color: #eceae5;
  text-shadow: 0 3px 22px rgba(0,0,0,0.9);
}
.efl-res__subtitle {
  margin-top: 7px;
  font-size: 13px;
  font-weight: 300;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--efl-dim);
}
.efl-res__steps { margin-top: 16px; display: flex; gap: 8px; justify-content: center; }
.efl-res__step-dot {
  width: 46px;
  height: 3px;
  background: rgba(200, 199, 194, 0.16);
  transition: background 160ms linear, box-shadow 160ms linear;
}
.efl-res__step-dot.is-active { background: var(--efl-orange); box-shadow: 0 0 14px rgba(226, 114, 16, 0.6); }
.efl-res__step-dot.is-done { background: rgba(226, 114, 16, 0.45); }

.efl-res__scroll {
  position: relative;
  width: 100%;
  max-width: 1320px;
  flex: 1 1 auto;
  margin-top: 26px;
  padding: 0 40px 26px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(226,114,16,0.5) transparent;
}
.efl-res__scroll::-webkit-scrollbar { width: 6px; }
.efl-res__scroll::-webkit-scrollbar-thumb { background: rgba(226, 114, 16, 0.45); }
.efl-res__scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); }

.efl-res__pane { display: none; animation: efl-res-in 200ms ease-out both; }
.efl-res__pane.is-active { display: block; }
@keyframes efl-res-in {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ------------------------------- шаг 1: таблица убийств ------------------- */
.efl-res__table { width: 100%; border-collapse: collapse; background: rgba(12, 12, 11, 0.55); }
.efl-res__table thead th {
  padding: 11px 14px;
  text-align: left;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--efl-dim);
  border-bottom: 1px solid rgba(226, 114, 16, 0.35);
  background: rgba(20, 20, 18, 0.75);
  white-space: nowrap;
}
.efl-res__table tbody td {
  padding: 12px 14px;
  font-size: 14px;
  font-weight: 300;
  color: #d3d2cd;
  border-bottom: 1px solid var(--efl-line);
  vertical-align: middle;
}
.efl-res__table tbody tr { transition: background 120ms linear; }
.efl-res__table tbody tr:nth-child(even) { background: rgba(255, 255, 255, 0.014); }
.efl-res__table tbody tr:hover { background: rgba(226, 114, 16, 0.08); }
.efl-res__table tbody tr:hover td:first-child { box-shadow: inset 3px 0 0 var(--efl-orange); }
.efl-res__cell-index { width: 54px; color: var(--efl-dim); font-variant-numeric: tabular-nums; }
.efl-res__cell-time { width: 108px; font-variant-numeric: tabular-nums; color: #bab9b4; }
.efl-res__cell-level { width: 70px; text-align: center; color: var(--efl-dim); }
.efl-res__cell-name { font-weight: 400; color: #eceae5; }
.efl-res__faction { font-size: 12.5px; letter-spacing: 0.08em; color: #a9a8a3; text-transform: lowercase; }
.efl-res__faction--boss {
  color: #14100a;
  background: var(--efl-orange);
  padding: 2px 9px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.efl-res__faction--usec, .efl-res__faction--bear { color: #dcdbd6; text-transform: uppercase; letter-spacing: 0.14em; }
.efl-res__status { color: #b4b3ae; font-size: 13px; }
.efl-res__status--head { color: #e9c48a; }
.efl-res__empty { padding: 40px; text-align: center; color: var(--efl-dim); letter-spacing: 0.14em; text-transform: uppercase; }

/* ------------------------------- шаг 2: статистика ----------------------- */
.efl-res__group { margin-bottom: 30px; }
.efl-res__group-title {
  font-family: 'Bebas Neue', Impact, sans-serif;
  font-size: 24px;
  letter-spacing: 0.12em;
  color: #eceae5;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(226, 114, 16, 0.4);
  margin-bottom: 4px;
}
.efl-res__row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 9px 4px;
  border-bottom: 1px solid var(--efl-line);
  font-size: 14px;
  font-weight: 300;
}
.efl-res__row:hover { background: rgba(255,255,255,0.02); }
.efl-res__row-label { color: #bcbbb6; white-space: nowrap; }
.efl-res__row-lead { flex: 1 1 auto; border-bottom: 1px dotted rgba(200,199,194,0.18); transform: translateY(-4px); }
.efl-res__row-value { color: #eceae5; font-weight: 400; font-variant-numeric: tabular-nums; white-space: nowrap; }

/* ------------------------------- шаг 3: опыт ---------------------------- */
.efl-res__xp-head {
  display: grid;
  grid-template-columns: 92px 1fr 92px;
  align-items: center;
  gap: 22px;
  padding: 8px 0 26px;
}
.efl-res__xp-level {
  display: grid;
  place-items: center;
  height: 76px;
  background: linear-gradient(180deg, rgba(28,28,25,0.95) 0%, rgba(15,15,13,0.95) 100%);
  border: 1px solid rgba(255,255,255,0.07);
  font-family: 'Bebas Neue', Impact, sans-serif;
  font-size: 44px;
  letter-spacing: 0.06em;
  color: #eceae5;
}
.efl-res__xp-level--next { color: var(--efl-orange); border-color: rgba(226,114,16,0.45); }
.efl-res__xp-bar-wrap { position: relative; }
.efl-res__xp-bar {
  position: relative;
  height: 20px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  overflow: hidden;
}
.efl-res__xp-fill {
  position: absolute;
  inset: 0 auto 0 0;
  width: 0%;
  background:
    repeating-linear-gradient(115deg, rgba(255,255,255,0.14) 0 6px, transparent 6px 13px),
    linear-gradient(90deg, #b8560a 0%, #e27210 70%, #ff9a3c 100%);
  box-shadow: 0 0 26px rgba(226, 114, 16, 0.55);
  transition: width 900ms cubic-bezier(0.2, 0.7, 0.2, 1);
}
.efl-res__xp-meta {
  margin-top: 9px;
  display: flex;
  justify-content: space-between;
  font-size: 12.5px;
  font-weight: 300;
  letter-spacing: 0.08em;
  color: var(--efl-dim);
}
.efl-res__xp-meta b { color: #dcdbd6; font-weight: 500; font-variant-numeric: tabular-nums; }

.efl-res__xp-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 34px; }
.efl-res__xp-group { background: rgba(12,12,11,0.5); border: 1px solid var(--efl-line); padding: 14px 16px 8px; }
.efl-res__xp-group-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  padding-bottom: 9px;
  border-bottom: 1px solid rgba(226,114,16,0.35);
}
.efl-res__xp-group-title {
  font-family: 'Bebas Neue', Impact, sans-serif;
  font-size: 21px;
  letter-spacing: 0.1em;
  color: #eceae5;
}
.efl-res__xp-group-total {
  font-family: 'Bebas Neue', Impact, sans-serif;
  font-size: 21px;
  letter-spacing: 0.06em;
  color: var(--efl-orange);
  font-variant-numeric: tabular-nums;
}
.efl-res__xp-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 2px;
  border-bottom: 1px solid var(--efl-line);
  font-size: 13.5px;
  font-weight: 300;
}
.efl-res__xp-row:last-child { border-bottom: 0; }
.efl-res__xp-count {
  min-width: 24px;
  padding: 1px 6px;
  text-align: center;
  background: rgba(226, 114, 16, 0.16);
  border: 1px solid rgba(226, 114, 16, 0.3);
  color: #f0a45c;
  font-size: 11.5px;
}
.efl-res__xp-value { color: #eceae5; font-weight: 400; font-variant-numeric: tabular-nums; white-space: nowrap; }

.efl-res__banner {
  margin: 26px 0 10px;
  padding: 13px 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: linear-gradient(90deg, rgba(120, 165, 25, 0.9) 0%, rgba(155, 209, 42, 0.92) 50%, rgba(120, 165, 25, 0.9) 100%);
  border: 1px solid rgba(210, 255, 130, 0.4);
  box-shadow: 0 0 42px rgba(155, 209, 42, 0.28);
  color: #10160a;
  font-size: 19px;
  font-weight: 600;
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
}
.efl-res__banner-status { font-family: 'Bebas Neue', Impact, sans-serif; font-size: 26px; letter-spacing: 0.14em; }
.efl-res__banner-sep { opacity: 0.45; }

.efl-res__exp-total { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 6px 0 4px; }
.efl-res__exp-tag {
  padding: 3px 10px;
  background: #c8c7c2;
  color: #12120f;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
}
.efl-res__exp-value {
  font-family: 'Bebas Neue', Impact, sans-serif;
  font-size: 34px;
  letter-spacing: 0.08em;
  color: #eceae5;
  font-variant-numeric: tabular-nums;
}

/* ------------------------------- низ ------------------------------------ */
.efl-res__foot {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 56px;
  padding: 14px 0 34px;
}
.efl-res__btn {
  background: none;
  border: 0;
  cursor: pointer;
  font-family: 'Bebas Neue', Impact, sans-serif;
  font-size: 34px;
  letter-spacing: 0.16em;
  color: #bdbcb7;
  padding: 4px 30px;
  position: relative;
  transition: color 120ms linear, text-shadow 120ms linear, opacity 120ms linear;
}
.efl-res__btn:hover, .efl-res__btn:focus-visible {
  color: #fff;
  outline: none;
  text-shadow: 0 0 20px rgba(226, 114, 16, 0.6);
}
.efl-res__btn::before, .efl-res__btn::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 0;
  height: 2px;
  background: var(--efl-orange);
  transform: translateY(-50%);
  transition: width 140ms ease-out;
}
.efl-res__btn::before { left: 4px; }
.efl-res__btn::after { right: 4px; }
.efl-res__btn:hover::before, .efl-res__btn:hover::after { width: 18px; }
.efl-res__btn[disabled] { opacity: 0.25; pointer-events: none; }
.efl-res__build {
  position: absolute;
  left: 18px;
  bottom: 12px;
  font-size: 12px;
  font-weight: 300;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(200,199,194,0.4);
}
`

/* ==========================================================================
 * RaidResultSystem
 * ========================================================================== */
export class RaidResultSystem {
  constructor(ctx, options = {}) {
    this.ctx = ctx
    this.options = options
    this.root = null
    this.isOpen = false
    this.stepIndex = 0
    this.result = null
    this.buildVersion = options.buildVersion || '1.1.0.1.46911'
    this.gameMode = options.gameMode || 'PvE'

    this._onClick = this._onClick.bind(this)
    this._onKeyDown = this._onKeyDown.bind(this)

    ensureTarkovFonts()
    this._injectStyles()
  }

  _svc(name) {
    if (!this.ctx || typeof this.ctx.get !== 'function') return null
    try { return this.ctx.get(name) } catch (e) { return null }
  }

  _injectStyles() {
    if (document.getElementById('efl-raid-result-css')) return
    const style = document.createElement('style')
    style.id = 'efl-raid-result-css'
    style.textContent = RAID_RESULT_CSS
    document.head.appendChild(style)
  }

  /* Собираем модель отчёта: реальные данные рейда перекрывают дефолты. */
  _buildModel(payload = {}) {
    const raid = this._svc('raid')
    const stats = (raid && raid.stats) || {}
    const map = payload.map || (raid && raid.mapTitle) || 'ЗАВОД'
    return {
      map: String(map).toUpperCase(),
      survived: payload.survived != null ? payload.survived : stats.survived !== false,
      status: payload.status || stats.exitStatus || (stats.survived === false ? 'Погиб' : 'Выжил'),
      durationMs: payload.durationMs != null ? payload.durationMs : (stats.durationMs || 0),
      kills: payload.kills || stats.kills || DEFAULT_KILL_LIST,
      statGroups: payload.statGroups || stats.groups || DEFAULT_RAID_STATS,
      experience: Object.assign({}, DEFAULT_EXPERIENCE, payload.experience || stats.experienceReport || {}),
    }
  }

  /* --------------------------------------------------------------- показ */
  show(payload = {}) {
    if (this.isOpen) return
    this.isOpen = true
    this.stepIndex = 0
    this.result = this._buildModel(payload)

    call(this._svc('input'), 'setEnabled', false)
    if (document.exitPointerLock) document.exitPointerLock()
    call(this._svc('state'), 'set', STATE.RESULT)

    const audio = this._svc('audio')
    call(audio, 'stopRaidAmbience')
    call(audio, 'playMenuMusic')

    this._render()
    this._paintStep()
    document.addEventListener('keydown', this._onKeyDown, true)
    requestAnimationFrame(() => this.root && this.root.classList.add('is-visible'))
  }

  _render() {
    if (this.root) return
    const root = document.createElement('div')
    root.className = 'efl-res'
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-modal', 'true')
    root.innerHTML =
      '<div class="efl-res__bg"></div>' +
      '<header class="efl-res__head">' +
        '<h1 class="efl-res__title">РЕЙД ОКОНЧЕН</h1>' +
        '<p class="efl-res__subtitle" data-role="subtitle"></p>' +
        '<div class="efl-res__steps" data-role="steps"></div>' +
      '</header>' +
      '<div class="efl-res__scroll">' +
        '<section class="efl-res__pane" data-pane="kills">' + this._renderKills() + '</section>' +
        '<section class="efl-res__pane" data-pane="stats">' + this._renderStats() + '</section>' +
        '<section class="efl-res__pane" data-pane="experience">' + this._renderExperience() + '</section>' +
      '</div>' +
      '<footer class="efl-res__foot">' +
        '<button type="button" class="efl-res__btn" data-act="prev">НАЗАД</button>' +
        '<button type="button" class="efl-res__btn" data-act="next">ДАЛЕЕ</button>' +
        '<div class="efl-res__build">' + this.buildVersion + ' | ' + this.gameMode + '</div>' +
      '</footer>'

    root.addEventListener('click', this._onClick)
    document.body.appendChild(root)
    this.root = root
  }

  /* ----------------------------------------------------- шаг 1: убийства */
  _renderKills() {
    const kills = this.result.kills
    if (!kills || !kills.length) {
      return '<div class="efl-res__empty">В этом рейде убийств не было</div>'
    }

    const head =
      '<thead><tr>' +
        '<th>#</th>' +
        '<th>Локация</th>' +
        '<th>Время</th>' +
        '<th>Игрок</th>' +
        '<th>Ур.</th>' +
        '<th>Фракция</th>' +
        '<th>Статус</th>' +
      '</tr></thead>'

    const body = kills.map((kill, i) => {
      const faction = String(kill.faction || '')
      const isBoss = faction.toUpperCase() === 'БОСС'
      const isPmc = /USEC|BEAR/i.test(faction)
      const factionClass = isBoss
        ? 'efl-res__faction efl-res__faction--boss'
        : isPmc ? 'efl-res__faction efl-res__faction--usec' : 'efl-res__faction'
      const status = String(kill.status || '')
      const statusClass = /голов/i.test(status) ? 'efl-res__status efl-res__status--head' : 'efl-res__status'

      return (
        '<tr>' +
          '<td class="efl-res__cell-index">' + (kill.index != null ? kill.index : i + 1) + '</td>' +
          '<td>' + escapeHtml(kill.location) + '</td>' +
          '<td class="efl-res__cell-time">' + escapeHtml(kill.time) + '</td>' +
          '<td class="efl-res__cell-name">' + escapeHtml(kill.player) + '</td>' +
          '<td class="efl-res__cell-level">' + escapeHtml(kill.level == null ? '—' : kill.level) + '</td>' +
          '<td><span class="' + factionClass + '">' + escapeHtml(faction) + '</span></td>' +
          '<td class="' + statusClass + '">' + escapeHtml(status) + '</td>' +
        '</tr>'
      )
    }).join('')

    return '<table class="efl-res__table">' + head + '<tbody>' + body + '</tbody></table>'
  }

  /* --------------------------------------------------- шаг 2: статистика */
  _renderStats() {
    return this.result.statGroups.map(group => {
      const rows = group.rows.map(row =>
        '<div class="efl-res__row">' +
          '<span class="efl-res__row-label">' + escapeHtml(row.label) + '</span>' +
          '<span class="efl-res__row-lead"></span>' +
          '<span class="efl-res__row-value">' + escapeHtml(row.value) + '</span>' +
        '</div>'
      ).join('')
      return (
        '<div class="efl-res__group">' +
          '<div class="efl-res__group-title">' + escapeHtml(group.title) + '</div>' +
          rows +
        '</div>'
      )
    }).join('')
  }

  /* -------------------------------------------------------- шаг 3: опыт */
  _renderExperience() {
    const xp = this.result.experience
    const nextLevelXp = xp.currentXp + xp.remainingXp
    const span = Math.max(1, nextLevelXp - xp.levelStartXp)
    const percent = Math.max(0, Math.min(100, ((xp.currentXp - xp.levelStartXp) / span) * 100))

    const groups = xp.groups.map(group => {
      const rows = group.rows.map(row =>
        '<div class="efl-res__xp-row">' +
          '<span>' + escapeHtml(row.label) + '</span>' +
          (row.count != null ? '<span class="efl-res__xp-count">' + row.count + '</span>' : '') +
          '<span class="efl-res__row-lead"></span>' +
          '<span class="efl-res__xp-value">' + formatNumber(row.xp) + '</span>' +
        '</div>'
      ).join('')
      return (
        '<div class="efl-res__xp-group">' +
          '<div class="efl-res__xp-group-head">' +
            '<span class="efl-res__xp-group-title">' + escapeHtml(group.title) + '</span>' +
            '<span class="efl-res__xp-group-total">' + formatNumber(group.total) + '</span>' +
          '</div>' +
          rows +
        '</div>'
      )
    }).join('')

    const s = xp.summary
    const formula = s.multipliers.map(m => ' * ' + m).join('')

    return (
      '<div class="efl-res__xp-head">' +
        '<div class="efl-res__xp-level">' + xp.levelFrom + '</div>' +
        '<div class="efl-res__xp-bar-wrap">' +
          '<div class="efl-res__xp-bar"><div class="efl-res__xp-fill" data-role="xp-fill" data-target="' + percent.toFixed(2) + '"></div></div>' +
          '<div class="efl-res__xp-meta">' +
            '<span>опыт: <b>' + formatNumber(xp.currentXp) + '</b></span>' +
            '<span>осталось: <b>' + formatNumber(xp.remainingXp) + '</b></span>' +
          '</div>' +
        '</div>' +
        '<div class="efl-res__xp-level efl-res__xp-level--next">' + xp.levelTo + '</div>' +
      '</div>' +
      '<div class="efl-res__xp-grid">' + groups + '</div>' +
      '<div class="efl-res__banner">' +
        '<span class="efl-res__banner-status">' + escapeHtml(s.status) + '</span>' +
        '<span class="efl-res__banner-sep">|</span>' +
        '<span>' + formatNumber(s.base) + formula + ' = ' + formatNumber(s.total) + ' EXP</span>' +
      '</div>' +
      '<div class="efl-res__exp-total">' +
        '<span class="efl-res__exp-tag">EXP</span>' +
        '<span class="efl-res__exp-value">' + formatNumber(s.total) + '</span>' +
      '</div>'
    )
  }

  /* ------------------------------------------------------------ навигация */
  _paintStep() {
    if (!this.root) return
    const step = RAID_STEP_ORDER[this.stepIndex]

    const panes = this.root.querySelectorAll('.efl-res__pane')
    for (let i = 0; i < panes.length; i++) {
      panes[i].classList.toggle('is-active', panes[i].getAttribute('data-pane') === step)
    }

    const subtitles = {
      kills: 'Список убийств',
      stats: 'Статистика рейда • ' + this.result.map,
      experience: 'Опыта получено',
    }
    const subtitle = this.root.querySelector('[data-role="subtitle"]')
    if (subtitle) subtitle.textContent = subtitles[step]

    const steps = this.root.querySelector('[data-role="steps"]')
    if (steps) {
      steps.innerHTML = RAID_STEP_ORDER.map((name, i) => {
        const cls = i === this.stepIndex ? ' is-active' : (i < this.stepIndex ? ' is-done' : '')
        return '<span class="efl-res__step-dot' + cls + '"></span>'
      }).join('')
    }

    const prev = this.root.querySelector('[data-act="prev"]')
    if (prev) prev.disabled = this.stepIndex === 0

    const scroll = this.root.querySelector('.efl-res__scroll')
    if (scroll) scroll.scrollTop = 0

    if (step === RAID_STEP.EXPERIENCE) {
      const fill = this.root.querySelector('[data-role="xp-fill"]')
      if (fill) {
        fill.style.width = '0%'
        requestAnimationFrame(() => {
          requestAnimationFrame(() => { fill.style.width = fill.getAttribute('data-target') + '%' })
        })
      }
    }
  }

  next() {
    call(this._svc('audio'), 'playUi', 'click')
    if (this.stepIndex >= RAID_STEP_ORDER.length - 1) { this.finish(); return }
    this.stepIndex += 1
    this._paintStep()
  }

  prev() {
    if (this.stepIndex === 0) return
    call(this._svc('audio'), 'playUi', 'back')
    this.stepIndex -= 1
    this._paintStep()
  }

  /* Завершение: начисляем опыт, гасим рейд, возвращаемся в меню. */
  finish() {
    const player = this._svc('player')
    const gained = this.result && this.result.experience && this.result.experience.summary
      ? this.result.experience.summary.total
      : 0
    if (player) {
      if (typeof player.addExperience === 'function') player.addExperience(gained)
      else if (player.xp != null) player.xp += gained
    }

    const raid = this._svc('raid')
    if (raid && typeof raid.teardown === 'function') raid.teardown()

    this.close()

    const audio = this._svc('audio')
    call(audio, 'unduck', 300)
    call(audio, 'playMenuMusic')
    call(this._svc('mainMenu'), 'show')
    call(this._svc('state'), 'set', STATE.MENU)
  }

  close() {
    document.removeEventListener('keydown', this._onKeyDown, true)
    if (this.root) {
      this.root.removeEventListener('click', this._onClick)
      if (this.root.parentNode) this.root.parentNode.removeChild(this.root)
      this.root = null
    }
    this.isOpen = false
    this.stepIndex = 0
  }

  destroy() { this.close() }

  /* --------------------------------------------------------------- события */
  _onClick(event) {
    const target = event.target && event.target.closest ? event.target.closest('[data-act]') : null
    if (!target || target.disabled) return
    event.preventDefault()
    const act = target.getAttribute('data-act')
    if (act === 'next') this.next()
    else if (act === 'prev') this.prev()
  }

  _onKeyDown(event) {
    if (!this.isOpen) return
    if (event.code === 'ArrowRight' || event.code === 'Enter' || event.code === 'Space') {
      event.preventDefault()
      event.stopPropagation()
      this.next()
    } else if (event.code === 'ArrowLeft' || event.code === 'Backspace') {
      event.preventDefault()
      event.stopPropagation()
      this.prev()
    }
  }
}

/* Удобная точка входа для движка: raid.on('end', payload => showRaidResult(ctx, payload)) */
export function showRaidResult(ctx, payload, options) {
  const system = new RaidResultSystem(ctx, options)
  system.show(payload)
  return system
}

export default RaidResultSystem