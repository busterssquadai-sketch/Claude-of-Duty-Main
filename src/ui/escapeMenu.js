/* ==========================================================================
 * Escape-From-Larpov · src/ui/escapeMenu.js
 * ESC-меню внутри рейда: Пауза -> Предупреждение -> Дезертирство.
 * Полностью автономный модуль: DOM + scoped CSS + шрифты + логика движка.
 * ========================================================================== */

import * as SettingsModule from './settingsMenu.js'

/* Единственный источник истины по состояниям — src/core/engine.js.
 * Значения строк ОБЯЗАНЫ совпадать с ядром посимвольно (нижний регистр):
 * engine.setState() пишет строку в data-game-state и сверяет её со списками
 * состояний систем из src/main.js. Любое расхождение (RESULT вместо RESULTS
 * или верхний регистр) глушит подсистемы и вешает движок. */
export const STATE = Object.freeze({
  BOOT: 'boot',
  MENU: 'menu',
  LOADING: 'loading',
  GAMEPLAY: 'gameplay',
  PAUSED: 'paused',
  RESULTS: 'results',
})

export const ESC_SCREEN = {
  PAUSE: 'pause',
  ABANDON: 'abandon',
  DESERTED: 'deserted',
}

/* --------------------------------------------------------------------------
 * Каталог локаций — тексты как в оригинальном клиенте.
 * ------------------------------------------------------------------------ */
export const MAP_CATALOG = {
  factory: {
    id: 'factory',
    title: 'Завод',
    thumbnail: 'assets/maps/factory.jpg',
    accent: 'linear-gradient(135deg, #3b3a34 0%, #22211d 55%, #14140f 100%)',
    description:
      'Территория и производственные помещения химического комбината №16 были незаконно сданы ' +
      'компании TerraGroup. В период Контрактных Войн здесь проходили бои между подразделениями USEC и ' +
      'BEAR, определяющие контроль за заводским районом города Таркова.',
  },
  woods: {
    id: 'woods',
    title: 'Лес',
    thumbnail: 'assets/maps/woods.jpg',
    accent: 'linear-gradient(135deg, #2f3a2c 0%, #1d241b 55%, #10140e 100%)',
    description:
      'Обширный лесной массив западнее Таркова, через который проходит старая лесовозная дорога и ' +
      'периметр лесопильного комплекса. Основной маршрут эвакуации гражданских в первые недели конфликта.',
  },
  customs: {
    id: 'customs',
    title: 'Таможня',
    thumbnail: 'assets/maps/customs.jpg',
    accent: 'linear-gradient(135deg, #3a352c 0%, #241f19 55%, #14110d 100%)',
    description:
      'Пограничный таможенный терминал и складская зона порта. Здесь TerraGroup вывозила документацию ' +
      'после начала беспорядков; сейчас район контролируют банды диких.',
  },
  cyberlarp: {
    id: 'cyberlarp',
    title: 'CyberLarp',
    thumbnail: 'assets/maps/cyberlarp.jpg',
    accent: 'linear-gradient(135deg, #2a1240 0%, #101033 55%, #05060f 100%)',
    description:
      'Экспериментальный сектор с неоновой застройкой и автономными дронами-наблюдателями TerraGroup. ' +
      'Зона повышенной радиоэлектронной активности.',
  },
}

/* --------------------------------------------------------------------------
 * Шрифты Google Fonts — подключаются самим модулем, один раз на документ.
 * ------------------------------------------------------------------------ */
export function ensureTarkovFonts() {
  if (typeof document === 'undefined') return
  if (document.getElementById('efl-fonts')) return
  const pre1 = document.createElement('link')
  pre1.rel = 'preconnect'
  pre1.href = 'https://fonts.googleapis.com'
  const pre2 = document.createElement('link')
  pre2.rel = 'preconnect'
  pre2.href = 'https://fonts.gstatic.com'
  pre2.crossOrigin = 'anonymous'
  const css = document.createElement('link')
  css.id = 'efl-fonts'
  css.rel = 'stylesheet'
  css.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Oswald:wght@200;300;400;500;600;700&display=swap'
  document.head.appendChild(pre1)
  document.head.appendChild(pre2)
  document.head.appendChild(css)
}

/* Безопасный вызов метода подсистемы движка. */
function call(target, method, ...args) {
  if (target && typeof target[method] === 'function') return target[method](...args)
  return undefined
}

function pad2(n) {
  return (n < 10 ? '0' : '') + n
}

export function formatRaidClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return pad2(h) + ':' + pad2(m) + ':' + pad2(s)
}

/* ==========================================================================
 * CSS — весь визуал экранов паузы / выхода / дезертирства
 * ========================================================================== */
const ESCAPE_MENU_CSS = `
.efl-esc, .efl-esc * { box-sizing: border-box; margin: 0; padding: 0; }

.efl-esc {
  --efl-orange: #e27210;
  --efl-orange-dim: #a8540b;
  --efl-red: #c0392b;
  --efl-text: #c8c7c2;
  --efl-text-dim: #8b8a85;
  --efl-line: rgba(200, 199, 194, 0.12);
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  flex-direction: column;
  font-family: 'Oswald', 'Geometria', Arial, sans-serif;
  color: var(--efl-text);
  user-select: none;
  -webkit-font-smoothing: antialiased;
  opacity: 0;
  transition: opacity 140ms ease-out;
}
.efl-esc.is-visible { opacity: 1; }

/* --- затемнённый размытый слой поверх 3D-канвы --- */
.efl-esc__backdrop {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(120% 90% at 50% 45%, rgba(8, 9, 8, 0.55) 0%, rgba(4, 5, 4, 0.88) 78%),
    rgba(6, 7, 6, 0.55);
  backdrop-filter: blur(8px) saturate(0.75);
  -webkit-backdrop-filter: blur(8px) saturate(0.75);
}
.efl-esc__grain {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.05;
  background-image:
    repeating-linear-gradient(0deg, rgba(255,255,255,0.09) 0 1px, transparent 1px 3px),
    repeating-linear-gradient(90deg, rgba(0,0,0,0.25) 0 1px, transparent 1px 4px);
  mix-blend-mode: overlay;
}
.efl-esc__vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  box-shadow: inset 0 0 260px 90px rgba(0, 0, 0, 0.85);
}

.efl-esc__screen {
  position: relative;
  flex: 1 1 auto;
  display: none;
  flex-direction: column;
  align-items: center;
  padding: 46px 64px 96px;
}
.efl-esc__screen.is-active { display: flex; animation: efl-esc-in 180ms ease-out both; }

@keyframes efl-esc-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* --- заголовки --- */
.efl-esc__title {
  font-family: 'Bebas Neue', Impact, sans-serif;
  font-size: 44px;
  line-height: 1;
  letter-spacing: 0.14em;
  color: #e8e7e2;
  text-align: center;
  text-shadow: 0 2px 18px rgba(0, 0, 0, 0.9);
}
.efl-esc__subtitle {
  margin-top: 6px;
  font-family: 'Oswald', Arial, sans-serif;
  font-weight: 300;
  font-size: 13px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--efl-text-dim);
  text-align: center;
}

/* --- большие кнопки паузы --- */
.efl-esc__stack {
  margin: auto 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 26px;
}
.efl-esc__big {
  position: relative;
  background: none;
  border: 0;
  cursor: pointer;
  font-family: 'Bebas Neue', Impact, sans-serif;
  font-size: 42px;
  line-height: 1;
  letter-spacing: 0.16em;
  color: #bdbcb7;
  padding: 6px 42px;
  transition: color 120ms linear, text-shadow 120ms linear, transform 120ms ease-out;
}
.efl-esc__big::before,
.efl-esc__big::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 0;
  height: 2px;
  background: var(--efl-orange);
  transform: translateY(-50%);
  transition: width 140ms ease-out;
}
.efl-esc__big::before { left: 0; }
.efl-esc__big::after { right: 0; }
.efl-esc__big:hover,
.efl-esc__big:focus-visible {
  color: #ffffff;
  outline: none;
  text-shadow: 0 0 22px rgba(226, 114, 16, 0.55);
}
.efl-esc__big:hover::before,
.efl-esc__big:hover::after,
.efl-esc__big:focus-visible::before,
.efl-esc__big:focus-visible::after { width: 26px; }
.efl-esc__big:active { transform: scale(0.985); }
.efl-esc__big--danger:hover { color: #ff6a4d; text-shadow: 0 0 22px rgba(192, 57, 43, 0.6); }

/* --- нижние кнопки экранов 2 и 3 --- */
.efl-esc__footer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 74px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

/* --- статус-строка слева внизу --- */
.efl-esc__build {
  position: absolute;
  left: 18px;
  bottom: 42px;
  font-family: 'Oswald', Arial, sans-serif;
  font-weight: 300;
  font-size: 12px;
  letter-spacing: 0.12em;
  color: rgba(200, 199, 194, 0.45);
  text-transform: uppercase;
  pointer-events: none;
}

/* --- шестерёнка настроек справа внизу --- */
.efl-esc__gear {
  position: absolute;
  right: 16px;
  bottom: 34px;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  background: rgba(20, 20, 18, 0.6);
  border: 1px solid var(--efl-line);
  cursor: pointer;
  color: #b9b8b3;
  transition: color 120ms linear, border-color 120ms linear, transform 200ms ease-out, background 120ms linear;
}
.efl-esc__gear svg { width: 20px; height: 20px; display: block; }
.efl-esc__gear:hover {
  color: var(--efl-orange);
  border-color: rgba(226, 114, 16, 0.65);
  background: rgba(226, 114, 16, 0.1);
  transform: rotate(45deg);
}

/* --- нижняя панель-шелл главного меню --- */
.efl-esc__shell {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 30px;
  display: flex;
  align-items: center;
  gap: 26px;
  padding: 0 14px;
  background: linear-gradient(180deg, rgba(12,12,11,0.55) 0%, rgba(8,8,7,0.88) 100%);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(190, 189, 184, 0.4);
  pointer-events: none;
}
.efl-esc__shell-group { display: flex; align-items: center; gap: 22px; }
.efl-esc__shell-group--right { margin-left: auto; }

/* --- экран 2: сетка персонаж + карта --- */
.efl-esc__body {
  width: 100%;
  max-width: 1180px;
  margin-top: 56px;
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 34px;
  align-items: start;
}
.efl-esc__pmc { position: relative; display: flex; justify-content: center; }
.efl-esc__pmc svg { width: 250px; height: 470px; display: block; filter: drop-shadow(0 18px 40px rgba(0,0,0,0.85)); }

.efl-esc__level {
  position: absolute;
  top: 6px;
  left: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px 6px 8px;
  background: rgba(14, 14, 13, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.efl-esc__level svg { width: 38px; height: 38px; filter: none; }
.efl-esc__level-value {
  font-family: 'Bebas Neue', Impact, sans-serif;
  font-size: 40px;
  line-height: 0.9;
  letter-spacing: 0.04em;
  color: #e6e5e0;
}

.efl-esc__map {
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.07);
  background: #0d0d0c;
  overflow: hidden;
}
.efl-esc__map-tag {
  position: absolute;
  top: -30px;
  left: 2px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 400;
  letter-spacing: 0.05em;
  color: #d6d5d0;
}
.efl-esc__map-tag::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #d6d5d0;
}
.efl-esc__map-shot {
  width: 100%;
  height: 372px;
  object-fit: cover;
  display: block;
  filter: contrast(1.05) saturate(0.85) brightness(0.92);
}
.efl-esc__map-shot--fallback { background: var(--efl-map-accent, #22211d); }
.efl-esc__map-info {
  padding: 14px 18px 16px;
  background: linear-gradient(180deg, rgba(10,10,9,0.92) 0%, rgba(6,6,5,0.98) 100%);
  border-top: 1px solid rgba(255,255,255,0.05);
}
.efl-esc__map-name {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: #e6e5e0;
  margin-bottom: 6px;
}
.efl-esc__map-desc {
  font-weight: 300;
  font-size: 12.5px;
  line-height: 1.55;
  color: rgba(200, 199, 194, 0.72);
  max-width: 720px;
}
.efl-esc__dots { display: flex; gap: 7px; justify-content: flex-end; padding: 10px 18px 14px; background: rgba(6,6,5,0.98); }
.efl-esc__dot { width: 8px; height: 8px; background: rgba(255,255,255,0.16); }
.efl-esc__dot.is-active { background: #e8e7e2; }

/* --- красный алерт --- */
.efl-esc__alert {
  width: 100%;
  max-width: 1180px;
  margin-top: 26px;
  display: grid;
  grid-template-columns: 56px 1fr;
  align-items: center;
  gap: 4px;
  background: linear-gradient(90deg, rgba(150, 25, 18, 0.92) 0%, rgba(178, 34, 24, 0.92) 45%, rgba(150, 25, 18, 0.92) 100%);
  border: 1px solid rgba(255, 120, 90, 0.28);
  box-shadow: 0 10px 40px rgba(120, 15, 10, 0.35);
  padding: 12px 18px 12px 0;
  animation: efl-alert-pulse 2.6s ease-in-out infinite;
}
@keyframes efl-alert-pulse {
  0%, 100% { box-shadow: 0 10px 40px rgba(120, 15, 10, 0.3); }
  50%      { box-shadow: 0 10px 52px rgba(200, 40, 25, 0.55); }
}
.efl-esc__alert-icon { display: grid; place-items: center; color: #2a0a06; }
.efl-esc__alert-icon svg { width: 30px; height: 30px; }
.efl-esc__alert-title {
  font-size: 15px;
  font-weight: 600;
  color: #ffe9e2;
  letter-spacing: 0.02em;
  margin-bottom: 3px;
}
.efl-esc__alert-text {
  font-weight: 300;
  font-size: 13px;
  line-height: 1.45;
  color: rgba(255, 235, 228, 0.88);
  max-width: 1020px;
}
.efl-esc__alert--center { grid-template-columns: 52px 1fr; max-width: 940px; text-align: left; }

/* --- таймер возврата --- */
.efl-esc__grace {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(200, 199, 194, 0.6);
}
.efl-esc__grace-value {
  font-family: 'Bebas Neue', Impact, sans-serif;
  font-size: 26px;
  letter-spacing: 0.08em;
  color: var(--efl-orange);
}
.efl-esc__grace-value.is-critical { color: #ff5a3c; animation: efl-blink 700ms steps(2, start) infinite; }
@keyframes efl-blink { 50% { opacity: 0.25; } }

/* --- экран 3: дезертир --- */
.efl-esc__result { display: flex; flex-direction: column; align-items: center; margin-top: 22px; }
.efl-esc__result-figure { position: relative; display: flex; align-items: flex-start; gap: 18px; }
.efl-esc__result-figure svg.efl-esc__pmc-art { width: 210px; height: 400px; filter: drop-shadow(0 18px 40px rgba(0,0,0,0.9)); }
.efl-esc__nickname {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 16px;
  letter-spacing: 0.12em;
  color: #dcdbd6;
  text-transform: uppercase;
}
.efl-esc__nickname svg { width: 15px; height: 15px; opacity: 0.75; }

.efl-esc__verdict { margin-top: 18px; display: flex; align-items: center; gap: 26px; }
.efl-esc__badge {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 232px;
  padding: 11px 22px;
  background: linear-gradient(180deg, #f0821a 0%, #d9660b 100%);
  border: 1px solid rgba(255, 190, 120, 0.5);
  box-shadow: 0 0 34px rgba(226, 114, 16, 0.45), inset 0 1px 0 rgba(255,255,255,0.25);
  color: #1a0c02;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.06em;
}
.efl-esc__badge svg { width: 21px; height: 21px; }
.efl-esc__clock { display: flex; align-items: center; gap: 12px; }
.efl-esc__clock-label {
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(200, 199, 194, 0.55);
}
.efl-esc__clock-row { display: flex; align-items: center; gap: 9px; }
.efl-esc__clock-row svg { width: 19px; height: 19px; color: rgba(220,219,214,0.8); }
.efl-esc__clock-value {
  font-family: 'Bebas Neue', Impact, sans-serif;
  font-size: 30px;
  letter-spacing: 0.1em;
  color: #e8e7e2;
  font-variant-numeric: tabular-nums;
}
.efl-esc__exp {
  margin-top: 20px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.efl-esc__exp-tag {
  padding: 3px 9px;
  background: #c8c7c2;
  color: #12120f;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
}
.efl-esc__exp-value {
  font-family: 'Bebas Neue', Impact, sans-serif;
  font-size: 28px;
  letter-spacing: 0.08em;
  color: #e8e7e2;
}

.efl-esc[hidden] { display: none !important; }
`

/* ==========================================================================
 * Векторные иконки (без внешних ассетов)
 * ========================================================================== */
const ICON_GEAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.63.68 1.09 1.32 1.09H21a2 2 0 1 1 0 4h-.09c-.64 0-1.18.46-1.32 1.09z"/></svg>`

const ICON_ALERT = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.8 22.6 20.2H1.4L12 1.8Zm-1.2 6.4v6.2h2.4V8.2h-2.4Zm0 7.8v2.4h2.4V16h-2.4Z"/></svg>`

const ICON_USER = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12a4.6 4.6 0 1 0 0-9.2A4.6 4.6 0 0 0 12 12Zm0 2.1c-4 0-8 2-8 4.6V21h16v-2.3c0-2.6-4-4.6-8-4.6Z"/></svg>`

const ICON_CLOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 6.6V12l3.6 2.2" stroke-linecap="round"/></svg>`

const ICON_EXIT = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.2 3H5.4A2.4 2.4 0 0 0 3 5.4v13.2A2.4 2.4 0 0 0 5.4 21h7.8v-2.2H5.4V5.2h7.8V3Zm4.1 4.2-1.6 1.6 2.1 2.1H9.2v2.2h8.6l-2.1 2.1 1.6 1.6L22.1 12l-4.8-4.8Z"/></svg>`

/* Силуэт ПМК — используется, если не передан рендер живой модели. */
const PMC_SILHOUETTE = `
<svg class="efl-esc__pmc-art" viewBox="0 0 220 420" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="eflPmcBody" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#5a5449"/>
      <stop offset="55%" stop-color="#3a362e"/>
      <stop offset="100%" stop-color="#23211c"/>
    </linearGradient>
    <linearGradient id="eflPmcRig" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#8c7f5f"/>
      <stop offset="100%" stop-color="#5d5439"/>
    </linearGradient>
  </defs>
  <ellipse cx="110" cy="408" rx="66" ry="9" fill="#000" opacity="0.55"/>
  <path d="M92 44c0-12 8-20 18-20s18 8 18 20v14c0 10-8 17-18 17s-18-7-18-17V44Z" fill="#2b2924"/>
  <path d="M94 48h32v10H94z" fill="#16150f"/>
  <circle cx="110" cy="63" r="3.2" fill="#0c0b08"/>
  <path d="M84 78h52l14 22 8 84-20 6-6-56v52H88v-52l-6 56-20-6 8-84 14-22Z" fill="url(#eflPmcBody)"/>
  <path d="M86 92h48v56H86z" fill="url(#eflPmcRig)" opacity="0.92"/>
  <path d="M90 100h16v14H90zm24 0h16v14h-16zM90 122h16v16H90zm24 0h16v16h-16z" fill="#3f3a26" opacity="0.9"/>
  <path d="M88 186h44l6 106h-18l-8-70-8 70H82l6-106Z" fill="#33323a"/>
  <path d="M84 292h24l4 92H86l-2-92Zm28 0h24l-2 92h-26l4-92Z" fill="#2a2932"/>
  <path d="M80 384h32v14H80zm28 0h32v14h-32z" fill="#191813"/>
  <path d="M136 118l52-16 6 12-52 18-6-14Z" fill="#4a4536"/>
  <path d="M150 112h44v12h-44z" fill="#2f2b21"/>
  <path d="M62 176l16-6 4 12-16 6-4-12Z" fill="#242219"/>
</svg>`

const LEVEL_CLAW = `
<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M6 40 20 6M16 42 30 8M26 42 40 8" stroke="#c8c7c2" stroke-width="3.4" stroke-linecap="round" opacity="0.85"/>
  <path d="M13 26c6-3 13-3 19 0" stroke="#8b8a85" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
</svg>`

/* ==========================================================================
 * EscapeMenuSystem
 * ========================================================================== */
export class EscapeMenuSystem {
  constructor(ctx, options = {}) {
    this.ctx = ctx
    this.options = options

    this.root = null
    this.screen = null
    this.open = false
    this.destroyed = false

    this.buildVersion = options.buildVersion || '1.1.0.1.46911'
    this.raidMode = options.raidMode || 'TRAINING'
    this.gameMode = options.gameMode || 'PvE'
    this.graceSeconds = options.graceSeconds != null ? options.graceSeconds : 30
    this.canvasSelector = options.canvasSelector || 'canvas'

    this.settingsMenu = null
    this._graceLeft = this.graceSeconds
    this._graceTimer = null
    this._clockTimer = null
    this._deserted = false
    this._raidElapsedMs = 0

    this._onKeyDown = this._onKeyDown.bind(this)
    this._onClick = this._onClick.bind(this)
    this._onPointerLockChange = this._onPointerLockChange.bind(this)

    ensureTarkovFonts()
    this._injectStyles()

    document.addEventListener('keydown', this._onKeyDown, true)
    document.addEventListener('pointerlockchange', this._onPointerLockChange, false)
  }

  /* ---------------------------------------------------------------- utils */
  _svc(name) {
    if (!this.ctx || typeof this.ctx.get !== 'function') return null
    try { return this.ctx.get(name) } catch (e) { return null }
  }

  _injectStyles() {
    if (document.getElementById('efl-escape-menu-css')) return
    const style = document.createElement('style')
    style.id = 'efl-escape-menu-css'
    style.textContent = ESCAPE_MENU_CSS
    document.head.appendChild(style)
  }

  _emit(event, payload) {
    const bus = this._svc('bus') || this._svc('events')
    call(bus, 'emit', event, payload)
    if (typeof this.options.onEvent === 'function') this.options.onEvent(event, payload)
  }

  _ui(sound) {
    call(this._svc('audio'), 'playUi', sound)
  }

  get currentMap() {
    const raid = this._svc('raid')
    const id = (raid && (raid.mapId || raid.map)) || this.options.mapId || 'factory'
    return MAP_CATALOG[id] || MAP_CATALOG.factory
  }

  get playerLevel() {
    const player = this._svc('player')
    if (player && player.level != null) return player.level
    const raid = this._svc('raid')
    if (raid && raid.level != null) return raid.level
    return this.options.level != null ? this.options.level : 41
  }

  get nickname() {
    const player = this._svc('player')
    if (player && player.nickname) return player.nickname
    return this.options.nickname || 'SBEU_BABUINOV'
  }

  get raidStartedAt() {
    const raid = this._svc('raid')
    if (raid && raid.startedAt) return raid.startedAt
    if (!this._fallbackStart) this._fallbackStart = Date.now()
    return this._fallbackStart
  }

  /* --------------------------------------------------------------- keys */
  _onKeyDown(event) {
    if (this.destroyed || event.code !== 'Escape') return

    if (this.settingsMenu && this.settingsMenu.isOpen) {
      event.preventDefault()
      event.stopPropagation()
      this.settingsMenu.close()
      return
    }

    if (!this.open) {
      const state = this._svc('state')
      const current = state ? state.current : STATE.GAMEPLAY
      if (current !== STATE.GAMEPLAY) return
      event.preventDefault()
      event.stopPropagation()
      this.openMenu()
      return
    }

    event.preventDefault()
    event.stopPropagation()
    if (this.screen === ESC_SCREEN.PAUSE) this.resumeGameplay()
    else if (this.screen === ESC_SCREEN.ABANDON) this.showScreen(ESC_SCREEN.PAUSE)
  }

  _onPointerLockChange() {
    if (this.destroyed || this.open) return
    if (document.pointerLockElement) return
    const state = this._svc('state')
    if (state && state.current !== STATE.GAMEPLAY) return
    if (this.options.openOnPointerLockLost === false) return
    this.openMenu()
  }

  /* --------------------------------------------------------------- open */
  openMenu() {
    if (this.open || this.destroyed) return
    this.open = true

    call(this._svc('raid'), 'pause')
    call(this._svc('input'), 'setEnabled', false)
    call(this._svc('audio'), 'duck', 0.35, 180)
    if (document.exitPointerLock) document.exitPointerLock()

    this._render()
    this.showScreen(ESC_SCREEN.PAUSE)
    requestAnimationFrame(() => this.root && this.root.classList.add('is-visible'))
    this._emit('escape:opened', {})
  }

  resumeGameplay() {
    if (!this.open || this._deserted) return
    this._ui('back')
    this._teardownDom()
    this.open = false

    call(this._svc('raid'), 'resume')
    call(this._svc('input'), 'setEnabled', true)
    call(this._svc('audio'), 'unduck', 220)

    const canvas = document.querySelector(this.canvasSelector)
    if (canvas && canvas.requestPointerLock) canvas.requestPointerLock()

    const state = this._svc('state')
    call(state, 'set', STATE.GAMEPLAY)
    this._emit('escape:resumed', {})
  }

  /* ------------------------------------------------------------- render */
  _render() {
    if (this.root) return
    const root = document.createElement('div')
    root.className = 'efl-esc'
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-modal', 'true')
    root.innerHTML =
      '<div class="efl-esc__backdrop"></div>' +
      '<div class="efl-esc__grain"></div>' +
      '<div class="efl-esc__vignette"></div>' +
      this._renderPauseScreen() +
      this._renderAbandonScreen() +
      this._renderDesertedScreen() +
      this._renderShellBar()

    root.addEventListener('click', this._onClick)
    document.body.appendChild(root)
    this.root = root

    const shot = root.querySelector('[data-role="map-shot"]')
    if (shot) {
      shot.addEventListener('error', () => {
        shot.classList.add('efl-esc__map-shot--fallback')
        shot.removeAttribute('src')
      })
    }
  }

  _renderShellBar() {
    if (this.options.showShellBar === false) return ''
    const left = ['ГЛАВНОЕ МЕНЮ', 'УБЕЖИЩЕ']
    const right = ['ПЕРСОНАЖ', 'ТОРГОВЦЫ', 'БАРАХОЛКА', 'СБОРКИ', 'СПРАВОЧНИК', 'СООБЩЕНИЯ', 'ОПРОС', 'РАСШИРЕНИЯ']
    const item = t => '<span>' + t + '</span>'
    return (
      '<div class="efl-esc__shell">' +
        '<div class="efl-esc__shell-group">' + left.map(item).join('') + '</div>' +
        '<div class="efl-esc__shell-group efl-esc__shell-group--right">' + right.map(item).join('') + '</div>' +
      '</div>'
    )
  }

  _buildString() {
    return [this.buildVersion, this.raidMode, this.gameMode].join(' | ')
  }

  _renderLevelBadge() {
    return (
      '<div class="efl-esc__level">' +
        LEVEL_CLAW +
        '<span class="efl-esc__level-value" data-role="level">' + this.playerLevel + '</span>' +
      '</div>'
    )
  }

  /* ---------------------------------------------------- SCREEN 1: ПАУЗА */
  _renderPauseScreen() {
    return (
      '<section class="efl-esc__screen" data-screen="pause">' +
        '<div class="efl-esc__stack">' +
          '<button type="button" class="efl-esc__big efl-esc__big--danger" data-act="abandon">ОТКЛЮЧИТЬСЯ</button>' +
          '<button type="button" class="efl-esc__big" data-act="resume">ВЕРНУТЬСЯ</button>' +
        '</div>' +
        '<div class="efl-esc__build" data-role="build">' + this._buildString() + '</div>' +
        '<div class="efl-esc__gear" data-act="settings" role="button" tabindex="0" title="Настройки">' + ICON_GEAR + '</div>' +
      '</section>'
    )
  }

  /* ------------------------------------- SCREEN 2: ВОЗВРАЩАЙТЕСЬ В РЕЙД */
  _renderAbandonScreen() {
    const map = this.currentMap
    const dots = new Array(11).fill(0)
      .map((v, i) => '<span class="efl-esc__dot' + (i === 0 ? ' is-active' : '') + '"></span>').join('')

    return (
      '<section class="efl-esc__screen" data-screen="abandon">' +
        '<h1 class="efl-esc__title">ВОЗВРАЩАЙТЕСЬ В РЕЙД</h1>' +
        '<p class="efl-esc__subtitle">Не пытайтесь покинуть его</p>' +

        '<div class="efl-esc__body">' +
          '<div class="efl-esc__pmc">' +
            this._renderLevelBadge() +
            (this.options.portrait
              ? '<img class="efl-esc__pmc-art" src="' + this.options.portrait + '" alt="" />'
              : PMC_SILHOUETTE) +
          '</div>' +

          '<div class="efl-esc__map" style="--efl-map-accent:' + map.accent + '">' +
            '<span class="efl-esc__map-tag">' + map.title + '</span>' +
            '<img class="efl-esc__map-shot" data-role="map-shot" src="' + map.thumbnail + '" alt="' + map.title + '" />' +
            '<div class="efl-esc__map-info">' +
              '<div class="efl-esc__map-name">' + map.title + '</div>' +
              '<div class="efl-esc__map-desc">' + map.description + '</div>' +
            '</div>' +
            '<div class="efl-esc__dots">' + dots + '</div>' +
          '</div>' +
        '</div>' +

        '<div class="efl-esc__alert">' +
          '<div class="efl-esc__alert-icon">' + ICON_ALERT + '</div>' +
          '<div>' +
            '<div class="efl-esc__alert-title">Внимание! Вы пытаетесь покинуть рейд из-за разрыва соединения или намеренно.</div>' +
            '<div class="efl-esc__alert-text">Пожалуйста, избегайте покидания рейда подобным способом. Ваш персонаж остался в рейде без вашего контроля. У вас есть ограниченный запас времени на возвращение в рейд.</div>' +
          '</div>' +
        '</div>' +

        '<div class="efl-esc__grace">' +
          '<span>Время на возвращение</span>' +
          '<span class="efl-esc__grace-value" data-role="grace">00:' + pad2(this.graceSeconds) + '</span>' +
        '</div>' +

        '<div class="efl-esc__footer">' +
          '<button type="button" class="efl-esc__big" data-act="back">НАЗАД</button>' +
          '<button type="button" class="efl-esc__big efl-esc__big--danger" data-act="confirm-desert">ПОКИНУТЬ РЕЙД</button>' +
        '</div>' +

        '<div class="efl-esc__build">' + this._buildString() + '</div>' +
        '<div class="efl-esc__gear" data-act="settings" role="button" tabindex="0" title="Настройки">' + ICON_GEAR + '</div>' +
      '</section>'
    )
  }

  /* --------------------------------------------- SCREEN 3: РЕЙД ОКОНЧЕН */
  _renderDesertedScreen() {
    return (
      '<section class="efl-esc__screen" data-screen="deserted">' +
        '<h1 class="efl-esc__title">РЕЙД ОКОНЧЕН</h1>' +
        '<p class="efl-esc__subtitle">Досрочное завершение</p>' +

        '<div class="efl-esc__result">' +
          '<div class="efl-esc__result-figure">' +
            this._renderLevelBadge() +
            (this.options.portrait
              ? '<img class="efl-esc__pmc-art" src="' + this.options.portrait + '" alt="" />'
              : PMC_SILHOUETTE) +
          '</div>' +

          '<div class="efl-esc__nickname">' + ICON_USER + '<span data-role="nickname">' + this.nickname + '</span></div>' +

          '<div class="efl-esc__verdict">' +
            '<div class="efl-esc__badge">' + ICON_EXIT + '<span>Дезертир</span></div>' +
            '<div class="efl-esc__clock">' +
              '<div>' +
                '<div class="efl-esc__clock-label">Время рейда:</div>' +
                '<div class="efl-esc__clock-row">' + ICON_CLOCK +
                  '<span class="efl-esc__clock-value" data-role="raid-clock">00:00:00</span>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div class="efl-esc__exp">' +
            '<span class="efl-esc__exp-tag">EXP</span>' +
            '<span class="efl-esc__exp-value" data-role="exp">0</span>' +
          '</div>' +
        '</div>' +

        '<div class="efl-esc__alert efl-esc__alert--center">' +
          '<div class="efl-esc__alert-icon">' + ICON_ALERT + '</div>' +
          '<div>' +
            '<div class="efl-esc__alert-title">Внимание! Вы покинули рейд и лишились всего снаряжения.</div>' +
            '<div class="efl-esc__alert-text">Когда вы покидаете рейд, вы теряете всё найденное и также получаете статус "Покинул Игру".</div>' +
          '</div>' +
        '</div>' +

        '<div class="efl-esc__footer">' +
          '<button type="button" class="efl-esc__big" data-act="next">ДАЛЕЕ</button>' +
          '<button type="button" class="efl-esc__big" data-act="main-menu">ГЛАВНОЕ МЕНЮ</button>' +
        '</div>' +

        '<div class="efl-esc__build">' + [this.buildVersion, this.gameMode].join(' | ') + '</div>' +
      '</section>'
    )
  }

  /* --------------------------------------------------- переключение экранов */
  showScreen(name) {
    if (!this.root) this._render()
    if (this.screen === name) return
    this.screen = name

    const screens = this.root.querySelectorAll('.efl-esc__screen')
    for (let i = 0; i < screens.length; i++) {
      const el = screens[i]
      el.classList.toggle('is-active', el.getAttribute('data-screen') === name)
    }

    this._bindKeyboardActivation()

    if (name === ESC_SCREEN.ABANDON) this._startGraceCountdown()
    else this._stopGraceCountdown()

    if (name !== ESC_SCREEN.DESERTED) this._stopStopwatch()

    const first = this.root.querySelector('.efl-esc__screen.is-active [data-act]')
    if (first && typeof first.focus === 'function') first.focus()

    this._emit('escape:screen', { screen: name })
  }

  _bindKeyboardActivation() {
    if (!this.root || this._kbBound) return
    this._kbBound = true
    this.root.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      const target = event.target && event.target.closest ? event.target.closest('[data-act]') : null
      if (!target) return
      event.preventDefault()
      target.click()
    })
  }

  /* ------------------------------------------------ таймер возврата в рейд */
  _paintGrace() {
    const el = this.root && this.root.querySelector('[data-role="grace"]')
    if (!el) return
    const left = Math.max(0, this._graceLeft)
    el.textContent = '00:' + pad2(left)
    el.classList.toggle('is-critical', left <= 10)
  }

  _startGraceCountdown() {
    this._stopGraceCountdown()
    if (this.graceSeconds <= 0) return
    this._graceLeft = this.graceSeconds
    this._paintGrace()
    this._graceTimer = setInterval(() => {
      this._graceLeft -= 1
      this._paintGrace()
      if (this._graceLeft <= 0) {
        this._stopGraceCountdown()
        this.desertRaid()
      }
    }, 1000)
  }

  _stopGraceCountdown() {
    if (this._graceTimer) clearInterval(this._graceTimer)
    this._graceTimer = null
  }

  /* ------------------------------------------------------- секундомер рейда */
  _startStopwatch() {
    this._stopStopwatch()
    const paint = () => {
      const el = this.root && this.root.querySelector('[data-role="raid-clock"]')
      if (!el) return
      const ms = this.options.liveStopwatch === false
        ? this._raidElapsedMs
        : Date.now() - this.raidStartedAt
      el.textContent = formatRaidClock(ms)
    }
    paint()
    this._clockTimer = setInterval(paint, 200)
  }

  _stopStopwatch() {
    if (this._clockTimer) clearInterval(this._clockTimer)
    this._clockTimer = null
  }

  /* --------------------------------------------------------- меню настроек */
  openSettings() {
    if (!this.settingsMenu) {
      const factory = this.options.settingsFactory
      this.settingsMenu = typeof factory === 'function'
        ? factory(this.ctx)
        : new SettingsModule.SettingsMenu(this.ctx, {
            zIndex: 9600,
            onClose: () => this._emit('settings:closed', {}),
          })
    }
    this.settingsMenu.open()
    this._emit('settings:opened', {})
  }

  /* ------------------------------------------------------------ дезертирство */
  desertRaid() {
    if (this._deserted) return
    this._deserted = true
    this._raidElapsedMs = Date.now() - this.raidStartedAt

    const raid = this._svc('raid')
    const player = this._svc('player')

    /* 1. Фиксируем итог рейда и полностью гасим симуляцию. */
    if (raid && raid.stats) {
      raid.stats.experience = 0
      raid.stats.survived = false
      raid.stats.exitStatus = 'Дезертир'
      raid.stats.durationMs = this._raidElapsedMs
    }
    if (raid && typeof raid.teardown === 'function') raid.teardown()

    /* 2. Статус MIA: ПМК теряет всё снаряжение, взятое в рейд. */
    const inventory = player && player.inventory
    if (inventory) {
      if (typeof inventory.clear === 'function') inventory.clear()
      else if (Array.isArray(inventory.items)) inventory.items.length = 0
      if (inventory.slots && typeof inventory.slots === 'object') {
        Object.keys(inventory.slots).forEach(slot => { inventory.slots[slot] = null })
      }
      call(inventory, 'setStatus', 'MIA')
    }
    call(player, 'setStatus', 'MIA')

    /* 3. Опыт за рейд обнуляется. */
    if (player) {
      player.raidExperience = 0
      if (player.pendingExperience != null) player.pendingExperience = 0
    }

    /* 4. Переход на экран 3 с живым секундомером. */
    this._stopGraceCountdown()
    this.showScreen(ESC_SCREEN.DESERTED)
    this._startStopwatch()

    const audio = this._svc('audio')
    call(audio, 'stopRaidAmbience')
    call(audio, 'playUi', 'alert')

    if (this.ctx && this.ctx.engine && typeof this.ctx.engine.setState === 'function') {
      this.ctx.engine.setState(STATE.RESULTS)
    }
    this._emit('raid:deserted', { durationMs: this._raidElapsedMs, experience: 0, status: 'Дезертир' })
  }

  /* ------------------------------------------------------ выход в главное меню */
  exitToMainMenu() {
    // 1. Очищаем все оверлеи DOM
    this.destroyOverlay()

    // 2. Возвращаем нормальное микширование звуков
    const audio = this._svc('audio')
    call(audio, 'unduck', 300)
    call(audio, 'stopRaidAmbience')
    call(audio, 'stopHideoutLoop')
    call(audio, 'playMenuMusic')

    // 3. Вызываем встроенный метод ядра движка для безопасной очистки стейта
    if (this.ctx && this.ctx.engine && typeof this.ctx.engine.returnToMenu === 'function') {
      this.ctx.engine.returnToMenu()
    } else {
      // Фаллбэк на случай прямой подмены состояния
      const state = this._svc('state')
      call(this._svc('mainMenu'), 'show')
      call(state, 'set', STATE.MENU)
    }

    this._emit('escape:exitToMenu', {})
  }

  destroyOverlay() {
    if (this.settingsMenu && this.settingsMenu.isOpen) this.settingsMenu.close()
    this._teardownDom()
    this.open = false
    this._deserted = false
  }

  /* --------------------------------------------------------- снос DOM-оверлея */
  /* Единственная точка удаления DOM. Вызывается из resumeGameplay() и
   * destroyOverlay() — раньше метод отсутствовал в классе, и любой выход из
   * ESC-меню падал с TypeError: this._teardownDom is not a function, унося с
   * собой стейт-машину движка. */
  _teardownDom() {
    /* Реальная ссылка на корневой узел — this.root (создаётся в _render()).
     * Остальные имена оставлены как фаллбэк для прежних ревизий модуля. */
    const container =
      this.root ||
      this.overlay ||
      this.element ||
      this.dom ||
      this.container ||
      this.menuElement

    if (container) {
      if (typeof container.remove === 'function') container.remove()
      else if (container.parentNode) container.parentNode.removeChild(container)
    }

    /* Гасим таймеры: иначе отсчёт возврата продолжает тикать без DOM и
     * способен вызвать desertRaid() уже после закрытия меню. */
    this._stopGraceCountdown()
    this._stopStopwatch()

    this.root = null
    this.overlay = null
    this.element = null
    this.dom = null
    this.container = null
    this.menuElement = null

    /* Сбрасываем кэш экрана и флаг подписки на клавиатуру, чтобы следующий
     * openMenu() заново отрисовал разметку и повесил слушатели на новый узел,
     * а не показал пустой оверлей. */
    this.screen = null
    this._kbBound = false
    this.open = false
  }

  destroy() {
    this.destroyed = true
    this.destroyOverlay()
    document.removeEventListener('keydown', this._onKeyDown, true)
    document.removeEventListener('pointerlockchange', this._onPointerLockChange, false)
    if (this.settingsMenu) call(this.settingsMenu, 'destroy')
    this.settingsMenu = null
  }

  /* -------------------------------------------------------- делегат кликов */
  _onClick(event) {
    const target = event.target && event.target.closest ? event.target.closest('[data-act]') : null
    if (!target) return
    event.preventDefault()
    const act = target.getAttribute('data-act')
    this._ui(act === 'back' || act === 'resume' ? 'back' : 'click')

    switch (act) {
      case 'resume': this.resumeGameplay(); break
      case 'abandon': this.showScreen(ESC_SCREEN.ABANDON); break
      case 'back': this.showScreen(ESC_SCREEN.PAUSE); break
      case 'confirm-desert': this.desertRaid(); break
      case 'next': this.exitToMainMenu(); break
      case 'main-menu': this.exitToMainMenu(); break
      case 'settings': this.openSettings(); break
      default: break
    }
  }
}

export default EscapeMenuSystem