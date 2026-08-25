/* ==========================================================================
 * Escape-From-Larpov · src/ui/settingsMenu.js
 * Полноэкранное меню настроек над канвой.
 * Вкладки: ИГРА / ГРАФИКА / POSTFX / ЗВУК / УПРАВЛЕНИЕ.
 * Каждый контрол пишет значение напрямую в подсистему движка.
 * ========================================================================== */

import { ensureTarkovFonts } from './escapeMenu.js'

export const SETTINGS_STORAGE_KEY = 'efl.settings.v1'

/* ==========================================================================
 * Пресеты фонов главного меню (MainMenuSystem.setBackground)
 * ========================================================================== */
export const MENU_BACKGROUNDS = {
  random: {
    id: 'random',
    label: 'Случайный',
    random: true,
  },
  factory: {
    id: 'factory',
    label: 'Завод',
    video: 'assets/menu/factory.webm',
    still: 'assets/menu/factory.jpg',
    tint: '#1b1a16',
    bloom: 0.55,
    vignette: 0.65,
    props: [],
    ambience: 'audio/ambience/factory_hum.ogg',
  },
  woods: {
    id: 'woods',
    label: 'Лес',
    video: 'assets/menu/woods.webm',
    still: 'assets/menu/woods.jpg',
    tint: '#161c14',
    bloom: 0.5,
    vignette: 0.6,
    props: [],
    ambience: 'audio/ambience/woods_wind.ogg',
  },
  cyberlarp: {
    id: 'cyberlarp',
    label: 'CyberLarp',
    video: 'assets/menu/cyberlarp.webm',
    still: 'assets/menu/cyberlarp.jpg',
    tint: '#0b0620',
    neon: { primary: '#18e0ff', secondary: '#ff2bd6', intensity: 1.35 },
    bloom: 1.35,
    vignette: 0.35,
    props: [{ id: 'drone', model: 'assets/props/recon_drone.glb', orbit: true, light: '#18e0ff' }],
    ambience: 'audio/ambience/cyber_synth.ogg',
  },
  server: {
    id: 'server',
    label: 'Серверная',
    video: 'assets/menu/server_room.webm',
    still: 'assets/menu/server_room.jpg',
    tint: '#04120a',
    overlay: 'hacker',
    scanlines: true,
    bloom: 0.85,
    vignette: 0.75,
    props: [{ id: 'baofeng', model: 'assets/props/baofeng_uv5r.glb', squelch: true, chatter: 'audio/radio/baofeng_chatter.ogg' }],
    ambience: 'audio/ambience/server_fans.ogg',
  },
  unknown: {
    id: 'unknown',
    label: 'Неизвестные',
    video: 'assets/menu/cultists.webm',
    still: 'assets/menu/cultists.jpg',
    tint: '#050505',
    overlay: 'deep_dark',
    bloom: 0.25,
    vignette: 0.92,
    props: [{ id: 'cultist_amulet', model: 'assets/props/cultist_amulet.glb', sway: true, light: '#7a1f1f' }],
    ambience: 'audio/ambience/cultist_whisper.ogg',
  },
}

/* ==========================================================================
 * Профили цветокоррекции (передаются в postfx.setColorGrading)
 * Emilia — холодный десатурированный серо-зелёный тарковский грейдинг.
 * ========================================================================== */
export const GRADING_PRESETS = {
  none: {
    id: 'none', label: 'None',
    saturation: 1.00, contrast: 1.00, temperature: 0.00, tintGreen: 0.00,
    lift: [0.000, 0.000, 0.000], gamma: [1.00, 1.00, 1.00], gain: [1.00, 1.00, 1.00], fade: 0.00,
  },
  emilia: {
    id: 'emilia', label: 'Emilia',
    saturation: 0.62, contrast: 1.12, temperature: -0.18, tintGreen: 0.07,
    lift: [0.010, 0.021, 0.017], gamma: [0.98, 1.03, 0.99], gain: [0.90, 1.00, 0.93], fade: 0.06,
  },
  feather: {
    id: 'feather', label: 'Feather',
    saturation: 0.80, contrast: 0.94, temperature: 0.04, tintGreen: 0.02,
    lift: [0.026, 0.026, 0.030], gamma: [1.04, 1.03, 1.02], gain: [1.02, 1.01, 1.00], fade: 0.14,
  },
  cognac: {
    id: 'cognac', label: 'Cognac',
    saturation: 0.92, contrast: 1.08, temperature: 0.22, tintGreen: -0.04,
    lift: [0.020, 0.010, 0.000], gamma: [1.02, 0.99, 0.95], gain: [1.08, 1.00, 0.88], fade: 0.04,
  },
}

export const SSR_PRESETS = { off: 0, medium: 0.5, high: 1.0 }

export const SHADOW_PRESETS = {
  low:    { size: 1024, cascades: 2, distance: 90 },
  medium: { size: 2048, cascades: 3, distance: 140 },
  high:   { size: 4096, cascades: 4, distance: 200 },
  ultra:  { size: 8192, cascades: 4, distance: 280 },
}

/* ==========================================================================
 * Заводские настройки
 * ========================================================================== */
export const DEFAULT_SETTINGS = {
  game: {
    nickname: 'SBEU_BABUINOV',
    language: 'ru',
    menuBackground: 'random',
    hudStamina: 'always',
    hudHealth: 'auto',
    healthPalette: 'color',
    headBob: 0.60,
    fov: 68,
    bodycam: false,
    autoFlushRam: true,
    physicalCoresOnly: false,
  },
  graphics: {
    screenMode: 'borderless',
    antialiasing: 'taa_high',
    ssr: 'medium',
    shadows: 'high',
    skyQuality: 'high',
    grain: true,
    chromatic: false,
  },
  postfx: {
    enabled: true,
    brightness: 50,
    clarity: 42,
    lumaSharpen: 35,
    adaptiveSharpen: 25,
    grading: 'emilia',
  },
  audio: {
    master: 72,
    ui: 60,
    music: 45,
    hideout: 55,
  },
  controls: {
    sensitivity: 40,
    aimSensitivity: 32,
    invertY: false,
    holdToAim: true,
    binds: {
      forward: 'KeyW',
      back: 'KeyS',
      left: 'KeyA',
      right: 'KeyD',
      sprint: 'ShiftLeft',
      jump: 'Space',
      crouch: 'KeyC',
      prone: 'KeyX',
      reload: 'KeyR',
      use: 'KeyF',
      inventory: 'Tab',
      map: 'KeyM',
      flashlight: 'KeyL',
      melee: 'KeyV',
    },
  },
}

export const BIND_ACTIONS = [
  { action: 'forward', label: 'Вперёд' },
  { action: 'back', label: 'Назад' },
  { action: 'left', label: 'Влево' },
  { action: 'right', label: 'Вправо' },
  { action: 'sprint', label: 'Бег' },
  { action: 'jump', label: 'Прыжок' },
  { action: 'crouch', label: 'Присесть' },
  { action: 'prone', label: 'Лежать' },
  { action: 'reload', label: 'Перезарядка' },
  { action: 'use', label: 'Взаимодействие' },
  { action: 'inventory', label: 'Инвентарь' },
  { action: 'map', label: 'Карта' },
  { action: 'flashlight', label: 'Фонарь' },
  { action: 'melee', label: 'Удар ножом' },
]

const KEY_LABELS = {
  Space: 'ПРОБЕЛ',
  ShiftLeft: 'LSHIFT',
  ShiftRight: 'RSHIFT',
  ControlLeft: 'LCTRL',
  ControlRight: 'RCTRL',
  AltLeft: 'LALT',
  AltRight: 'RALT',
  Tab: 'TAB',
  Escape: 'ESC',
  Enter: 'ENTER',
  Backspace: 'BACKSPACE',
  CapsLock: 'CAPS',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
}

export function keyLabel(code) {
  if (!code) return '—'
  if (KEY_LABELS[code]) return KEY_LABELS[code]
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit\d$/.test(code)) return code.slice(5)
  if (/^Numpad/.test(code)) return 'NUM ' + code.slice(6)
  if (/^F\d{1,2}$/.test(code)) return code
  return code.toUpperCase()
}

/* ==========================================================================
 * Схема вкладок: весь UI строится из неё автоматически.
 * ========================================================================== */
export const SETTINGS_TABS = [
  {
    id: 'game',
    label: 'ИГРА',
    sections: [
      {
        title: 'Профиль',
        fields: [
          { type: 'nickname', label: 'Никнейм', path: 'game.nickname' },
          { type: 'dropdown', label: 'Язык интерфейса', path: 'game.language', options: [
            { value: 'ru', label: 'Русский' },
            { value: 'en', label: 'English' },
          ] },
          { type: 'dropdown', label: 'Фон главного меню', path: 'game.menuBackground', options: [
            { value: 'random', label: 'Случайный' },
            { value: 'factory', label: 'Завод' },
            { value: 'woods', label: 'Лес' },
            { value: 'cyberlarp', label: 'CyberLarp' },
            { value: 'server', label: 'Серверная' },
            { value: 'unknown', label: 'Неизвестные' },
          ], hint: 'CyberLarp: неон и дрон. Серверная: хакерская с Baofeng. Неизвестные: амулет культистов.' },
        ],
      },
      {
        title: 'Интерфейс и обзор',
        fields: [
          { type: 'dropdown', label: 'Выносливость и поза', path: 'game.hudStamina', options: [
            { value: 'always', label: 'Всегда показывать' },
            { value: 'auto', label: 'Автоматически' },
          ] },
          { type: 'dropdown', label: 'Состояние здоровья', path: 'game.hudHealth', options: [
            { value: 'always', label: 'Всегда показывать' },
            { value: 'auto', label: 'Автоматически' },
          ] },
          { type: 'dropdown', label: 'Подсветка состояния здоровья', path: 'game.healthPalette', options: [
            { value: 'color', label: 'Цветная' },
            { value: 'mono', label: 'Монохромная' },
          ] },
          { type: 'slider', label: 'Качание головы', path: 'game.headBob', min: 0.2, max: 1, step: 0.05, format: 'ratio' },
          { type: 'slider', label: 'Область обзора', path: 'game.fov', min: 50, max: 75, step: 1, format: 'deg' },
          { type: 'checkbox', label: 'Режим нашлемной камеры', path: 'game.bodycam', hint: 'Fisheye, зерно, VHS-трекинг и метка REC' },
        ],
      },
      {
        title: 'Система',
        fields: [
          { type: 'checkbox', label: 'Автоочистка оперативной памяти', path: 'game.autoFlushRam' },
          { type: 'checkbox', label: 'Использовать только физические ядра', path: 'game.physicalCoresOnly' },
        ],
      },
    ],
  },
  {
    id: 'graphics',
    label: 'ГРАФИКА',
    sections: [
      {
        title: 'Дисплей',
        fields: [
          { type: 'dropdown', label: 'Режим экрана', path: 'graphics.screenMode', options: [
            { value: 'borderless', label: 'Безрамочный' },
            { value: 'fullscreen', label: 'Полный экран' },
          ] },
        ],
      },
      {
        title: 'Качество картинки',
        fields: [
          { type: 'dropdown', label: 'Сглаживание', path: 'graphics.antialiasing', options: [
            { value: 'off', label: 'выкл' },
            { value: 'taa_high', label: 'TAA Выс' },
          ] },
          { type: 'dropdown', label: 'SSR / Отражения', path: 'graphics.ssr', options: [
            { value: 'off', label: 'выкл' },
            { value: 'medium', label: 'среднее' },
            { value: 'high', label: 'высокое' },
          ] },
          { type: 'dropdown', label: 'Качество теней', path: 'graphics.shadows', options: [
            { value: 'low', label: 'низкое' },
            { value: 'medium', label: 'среднее' },
            { value: 'high', label: 'высокое' },
            { value: 'ultra', label: 'ультра' },
          ], hint: 'Разрешение каскадных теневых карт (CSM)' },
          { type: 'dropdown', label: 'Качество неба', path: 'graphics.skyQuality', options: [
            { value: 'low', label: 'низкое' },
            { value: 'medium', label: 'среднее' },
            { value: 'high', label: 'высокое' },
            { value: 'ultra', label: 'ультра' },
          ], hint: 'STEPS шейдера атмосферы (перекомпиляция)' },
        ],
      },
      {
        title: 'Эффекты',
        fields: [
          { type: 'checkbox', label: 'Шум', path: 'graphics.grain' },
          { type: 'checkbox', label: 'Хроматическая аберрация', path: 'graphics.chromatic' },
        ],
      },
    ],
  },
  {
    id: 'postfx',
    label: 'POSTFX',
    sections: [
      {
        title: 'Постобработка',
        fields: [
          { type: 'checkbox', label: 'Включить PostFX', path: 'postfx.enabled' },
          { type: 'slider', label: 'Яркость', path: 'postfx.brightness', min: 0, max: 100, step: 1, format: 'percent' },
          { type: 'slider', label: 'Чёткость', path: 'postfx.clarity', min: 0, max: 100, step: 1, format: 'percent' },
          { type: 'slider', label: 'Luma Резкость', path: 'postfx.lumaSharpen', min: 0, max: 100, step: 1, format: 'percent' },
          { type: 'slider', label: 'Адаптивная резкость', path: 'postfx.adaptiveSharpen', min: 0, max: 100, step: 1, format: 'percent' },
          { type: 'dropdown', label: 'Цветокоррекция', path: 'postfx.grading', options: [
            { value: 'none', label: 'None' },
            { value: 'emilia', label: 'Emilia' },
            { value: 'feather', label: 'Feather' },
            { value: 'cognac', label: 'Cognac' },
          ], hint: 'Emilia: холодный десатурированный серо-зелёный грейдинг' },
        ],
      },
    ],
  },
  {
    id: 'audio',
    label: 'ЗВУК',
    sections: [
      {
        title: 'Микшер',
        fields: [
          { type: 'slider', label: 'Общий уровень громкости', path: 'audio.master', min: 0, max: 100, step: 1, format: 'percent' },
          { type: 'slider', label: 'Громкость звуков интерфейса', path: 'audio.ui', min: 0, max: 100, step: 1, format: 'percent' },
          { type: 'slider', label: 'Громкость музыки', path: 'audio.music', min: 0, max: 100, step: 1, format: 'percent' },
          { type: 'slider', label: 'Громкость убежища', path: 'audio.hideout', min: 0, max: 100, step: 1, format: 'percent' },
        ],
      },
    ],
  },
  {
    id: 'controls',
    label: 'УПРАВЛЕНИЕ',
    sections: [
      {
        title: 'Мышь',
        fields: [
          { type: 'slider', label: 'Чувствительность', path: 'controls.sensitivity', min: 1, max: 100, step: 1, format: 'percent' },
          { type: 'slider', label: 'Чувствительность в прицеливании', path: 'controls.aimSensitivity', min: 1, max: 100, step: 1, format: 'percent' },
          { type: 'checkbox', label: 'Инвертировать вертикаль', path: 'controls.invertY' },
          { type: 'checkbox', label: 'Прицеливание удержанием', path: 'controls.holdToAim' },
        ],
      },
      { title: 'Назначение клавиш', fields: [{ type: 'binds' }] },
    ],
  },
]

/* ------------------------------------------------------------------ utils */
function call(target, method, ...args) {
  if (target && typeof target[method] === 'function') return target[method](...args)
  return undefined
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function deepMerge(base, patch) {
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base)
  if (!patch || typeof patch !== 'object') return out
  Object.keys(patch).forEach(key => {
    const value = patch[key]
    if (value && typeof value === 'object' && !Array.isArray(value) && base && typeof base[key] === 'object') {
      out[key] = deepMerge(base[key], value)
    } else if (value !== undefined) {
      out[key] = value
    }
  })
  return out
}

function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj)
}

function setPath(obj, path, value) {
  const keys = path.split('.')
  let node = obj
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof node[keys[i]] !== 'object' || node[keys[i]] === null) node[keys[i]] = {}
    node = node[keys[i]]
  }
  node[keys[keys.length - 1]] = value
  return obj
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatValue(field, value) {
  if (field.format === 'percent') return Math.round(value) + ' %'
  if (field.format === 'deg') return Math.round(value) + '°'
  if (field.format === 'ratio') return Number(value).toFixed(2)
  return String(value)
}

const ICON_CARET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9.5 12 15.5 18 9.5" stroke-linecap="round"/></svg>'
const ICON_PENCIL = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.4 16.1 4.3l3.6 3.6L6.6 21H3v-3.6Zm15.1-14.1 2.6 2.6-1.9 1.9-2.6-2.6 1.9-1.9Z"/></svg>'

/* ==========================================================================
 * CSS
 * ========================================================================== */
const SETTINGS_CSS = [
  '.efl-set, .efl-set * { box-sizing: border-box; margin: 0; padding: 0; }',
  '.efl-set {',
  '  --efl-orange: #e27210;',
  '  --efl-text: #c8c7c2;',
  '  --efl-dim: #86857f;',
  '  --efl-line: rgba(200, 199, 194, 0.12);',
  '  position: fixed; inset: 0; z-index: 9600;',
  '  display: flex; flex-direction: column;',
  "  font-family: 'Oswald', 'Geometria', Arial, sans-serif;",
  '  color: var(--efl-text); user-select: none;',
  '  opacity: 0; transition: opacity 140ms ease-out;',
  '}',
  '.efl-set.is-visible { opacity: 1; }',
  '.efl-set__bg {',
  '  position: absolute; inset: 0;',
  '  background: radial-gradient(120% 100% at 50% 0%, rgba(26, 26, 22, 0.72) 0%, rgba(5, 6, 5, 0.96) 75%), rgba(6, 7, 6, 0.9);',
  '  backdrop-filter: blur(14px) saturate(0.7); -webkit-backdrop-filter: blur(14px) saturate(0.7);',
  '}',
  '.efl-set__bg::after {',
  "  content: ''; position: absolute; inset: 0; opacity: 0.05; mix-blend-mode: overlay;",
  '  background-image: repeating-linear-gradient(0deg, rgba(255,255,255,0.08) 0 1px, transparent 1px 3px);',
  '}',
  '.efl-set__top {',
  '  position: relative; display: flex; align-items: flex-end; gap: 26px;',
  '  padding: 26px 44px 0;',
  '}',
  '.efl-set__title {',
  "  font-family: 'Bebas Neue', Impact, sans-serif; font-size: 40px; line-height: 1;",
  '  letter-spacing: 0.16em; color: #eceae5;',
  '}',
  '.efl-set__top-actions { margin-left: auto; display: flex; align-items: center; gap: 30px; }',
  '.efl-set__nav {',
  '  position: relative; display: flex; gap: 30px; padding: 18px 44px 0;',
  '  border-bottom: 1px solid var(--efl-line);',
  '}',
  '.efl-set__tab {',
  '  background: none; border: 0; cursor: pointer; padding: 6px 2px 12px;',
  "  font-family: 'Bebas Neue', Impact, sans-serif; font-size: 24px; letter-spacing: 0.14em;",
  '  color: #86857f; position: relative; transition: color 120ms linear;',
  '}',
  '.efl-set__tab:hover { color: #dcdbd6; }',
  '.efl-set__tab.is-active { color: var(--efl-orange); }',
  '.efl-set__tab.is-active::after {',
  "  content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px;",
  '  background: var(--efl-orange); box-shadow: 0 0 16px rgba(226, 114, 16, 0.75);',
  '}',
  '.efl-set__body {',
  '  position: relative; flex: 1 1 auto; overflow-y: auto; padding: 26px 44px 30px;',
  '  scrollbar-width: thin; scrollbar-color: rgba(226,114,16,0.5) transparent;',
  '}',
  '.efl-set__body::-webkit-scrollbar { width: 6px; }',
  '.efl-set__body::-webkit-scrollbar-thumb { background: rgba(226, 114, 16, 0.45); }',
  '.efl-set__pane { display: none; max-width: 880px; }',
  '.efl-set__pane.is-active { display: block; animation: efl-set-in 180ms ease-out both; }',
  '@keyframes efl-set-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }',
  '.efl-set__section { margin-bottom: 26px; }',
  '.efl-set__section-title {',
  "  font-family: 'Bebas Neue', Impact, sans-serif; font-size: 20px; letter-spacing: 0.14em;",
  '  color: #dcdbd6; padding-bottom: 7px; margin-bottom: 6px;',
  '  border-bottom: 1px solid rgba(226, 114, 16, 0.35);',
  '}',
  '.efl-set__row {',
  '  display: grid; grid-template-columns: 320px 1fr; align-items: center; gap: 20px;',
  '  padding: 9px 4px; border-bottom: 1px solid var(--efl-line);',
  '}',
  '.efl-set__row:hover { background: rgba(255, 255, 255, 0.02); }',
  '.efl-set__label { font-size: 14px; font-weight: 300; color: #c4c3be; }',
  '.efl-set__hint { display: block; margin-top: 3px; font-size: 11.5px; color: rgba(200,199,194,0.45); line-height: 1.4; }',
  '.efl-set__control { display: flex; align-items: center; gap: 14px; }',
  '.efl-set__nick {',
  '  display: flex; align-items: center; gap: 14px;',
  '}',
  '.efl-set__nick-value {',
  "  font-family: 'Bebas Neue', Impact, sans-serif; font-size: 26px; letter-spacing: 0.1em; color: #eceae5;",
  '}',
  '.efl-set__mini {',
  '  display: inline-flex; align-items: center; gap: 7px; cursor: pointer;',
  '  background: rgba(226, 114, 16, 0.12); border: 1px solid rgba(226, 114, 16, 0.45);',
  '  color: #f0a45c; padding: 5px 12px; font-size: 12px; letter-spacing: 0.14em;',
  '  text-transform: uppercase; transition: background 120ms linear, color 120ms linear;',
  '}',
  '.efl-set__mini svg { width: 13px; height: 13px; }',
  '.efl-set__mini:hover { background: var(--efl-orange); color: #150a02; }',
  '.efl-set__dd { position: relative; min-width: 250px; }',
  '.efl-set__dd-btn {',
  '  width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px;',
  '  background: rgba(18, 18, 16, 0.85); border: 1px solid var(--efl-line); cursor: pointer;',
  '  color: #dcdbd6; padding: 8px 12px; font-size: 13.5px; font-family: inherit;',
  '  letter-spacing: 0.04em; transition: border-color 120ms linear, color 120ms linear;',
  '}',
  '.efl-set__dd-btn svg { width: 16px; height: 16px; opacity: 0.7; transition: transform 140ms ease-out; }',
  '.efl-set__dd-btn:hover { border-color: rgba(226, 114, 16, 0.6); color: #fff; }',
  '.efl-set__dd.is-open .efl-set__dd-btn { border-color: var(--efl-orange); color: #fff; }',
  '.efl-set__dd.is-open .efl-set__dd-btn svg { transform: rotate(180deg); }',
  '.efl-set__dd-list {',
  '  position: absolute; left: 0; right: 0; top: calc(100% + 3px); z-index: 5; display: none;',
  '  background: rgba(10, 10, 9, 0.98); border: 1px solid rgba(226, 114, 16, 0.4);',
  '  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.7); max-height: 260px; overflow-y: auto;',
  '}',
  '.efl-set__dd.is-open .efl-set__dd-list { display: block; }',
  '.efl-set__dd-opt {',
  '  display: block; width: 100%; text-align: left; background: none; border: 0; cursor: pointer;',
  '  color: #bcbbb6; padding: 8px 12px; font-size: 13.5px; font-family: inherit;',
  '  transition: background 100ms linear, color 100ms linear;',
  '}',
  '.efl-set__dd-opt:hover { background: rgba(226, 114, 16, 0.16); color: #fff; }',
  '.efl-set__dd-opt.is-active { color: var(--efl-orange); box-shadow: inset 3px 0 0 var(--efl-orange); }',
  '.efl-set__slider { display: flex; align-items: center; gap: 14px; width: 100%; max-width: 420px; }',
  '.efl-set__range { -webkit-appearance: none; appearance: none; width: 100%; height: 18px; background: none; cursor: pointer; }',
  '.efl-set__range::-webkit-slider-runnable-track { height: 4px; background: rgba(255,255,255,0.12); border: 0; }',
  '.efl-set__range::-webkit-slider-thumb {',
  '  -webkit-appearance: none; appearance: none; width: 14px; height: 18px; margin-top: -7px;',
  '  background: var(--efl-orange); border: 0; box-shadow: 0 0 12px rgba(226, 114, 16, 0.7);',
  '}',
  '.efl-set__range::-moz-range-track { height: 4px; background: rgba(255,255,255,0.12); }',
  '.efl-set__range::-moz-range-thumb { width: 14px; height: 18px; border: 0; border-radius: 0; background: var(--efl-orange); }',
  '.efl-set__range::-moz-range-progress { height: 4px; background: var(--efl-orange); }',
  '.efl-set__slider-val {',
  '  min-width: 62px; text-align: right; font-variant-numeric: tabular-nums;',
  '  font-size: 14px; color: #eceae5;',
  '}',
  '.efl-set__check {',
  '  display: inline-flex; align-items: center; gap: 10px; cursor: pointer;',
  '  background: none; border: 0; color: #bcbbb6; font-family: inherit; font-size: 13px;',
  '  letter-spacing: 0.12em; text-transform: uppercase;',
  '}',
  '.efl-set__check-box {',
  '  width: 18px; height: 18px; display: grid; place-items: center;',
  '  border: 1px solid rgba(200, 199, 194, 0.4); background: rgba(18, 18, 16, 0.85);',
  '  transition: border-color 120ms linear, background 120ms linear;',
  '}',
  '.efl-set__check-box::after {',
  "  content: ''; width: 8px; height: 8px; background: var(--efl-orange); opacity: 0;",
  '  box-shadow: 0 0 12px rgba(226, 114, 16, 0.8); transition: opacity 120ms linear;',
  '}',
  '.efl-set__check.is-on .efl-set__check-box { border-color: var(--efl-orange); }',
  '.efl-set__check.is-on .efl-set__check-box::after { opacity: 1; }',
  '.efl-set__check.is-on { color: var(--efl-orange); }',
  '.efl-set__binds { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 26px; }',
  '.efl-set__bind-row { display: flex; align-items: center; gap: 14px; padding: 7px 2px; border-bottom: 1px solid var(--efl-line); }',
  '.efl-set__bind-label { flex: 1 1 auto; font-size: 13.5px; font-weight: 300; color: #c4c3be; }',
  '.efl-set__bind {',
  '  min-width: 108px; cursor: pointer; background: rgba(18, 18, 16, 0.85);',
  '  border: 1px solid var(--efl-line); color: #dcdbd6; padding: 6px 12px;',
  "  font-family: 'Bebas Neue', Impact, sans-serif; font-size: 17px; letter-spacing: 0.1em;",
  '  transition: border-color 120ms linear, color 120ms linear, background 120ms linear;',
  '}',
  '.efl-set__bind:hover { border-color: rgba(226, 114, 16, 0.6); color: #fff; }',
  '.efl-set__bind.is-listening {',
  '  border-color: var(--efl-orange); color: var(--efl-orange);',
  '  background: rgba(226, 114, 16, 0.14); animation: efl-set-blink 700ms steps(2, start) infinite;',
  '}',
  '@keyframes efl-set-blink { 50% { opacity: 0.35; } }',
  '.efl-set__foot {',
  '  position: relative; display: flex; align-items: center; gap: 24px;',
  '  padding: 12px 44px 26px; border-top: 1px solid var(--efl-line);',
  '}',
  '.efl-set__foot-right { margin-left: auto; display: flex; align-items: center; gap: 26px; }',
  '.efl-set__btn {',
  '  background: none; border: 0; cursor: pointer; position: relative;',
  "  font-family: 'Bebas Neue', Impact, sans-serif; font-size: 28px; letter-spacing: 0.16em;",
  '  color: #bdbcb7; padding: 4px 20px; transition: color 120ms linear, text-shadow 120ms linear;',
  '}',
  '.efl-set__btn:hover, .efl-set__btn:focus-visible { color: #fff; outline: none; text-shadow: 0 0 18px rgba(226, 114, 16, 0.6); }',
  '.efl-set__btn--accent { color: var(--efl-orange); }',
  '.efl-set__btn--accent:hover { color: #ffa14a; }',
  '.efl-set__dirty { font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(226, 114, 16, 0.85); }',
  '.efl-set__toast {',
  '  position: absolute; right: 44px; bottom: 78px; padding: 9px 18px;',
  '  background: rgba(226, 114, 16, 0.92); color: #150a02; font-size: 13px;',
  '  letter-spacing: 0.14em; text-transform: uppercase; opacity: 0;',
  '  transform: translateY(8px); transition: opacity 160ms ease-out, transform 160ms ease-out;',
  '  pointer-events: none;',
  '}',
  '.efl-set__toast.is-visible { opacity: 1; transform: translateY(0); }',
  '.efl-set__modal {',
  '  position: absolute; inset: 0; z-index: 20; display: none;',
  '  align-items: center; justify-content: center; background: rgba(4, 5, 4, 0.72);',
  '  backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);',
  '}',
  '.efl-set__modal.is-open { display: flex; }',
  '.efl-set__modal-card {',
  '  width: 420px; padding: 24px; background: rgba(14, 14, 12, 0.98);',
  '  border: 1px solid rgba(226, 114, 16, 0.45); box-shadow: 0 24px 60px rgba(0,0,0,0.8);',
  '}',
  '.efl-set__modal-title {',
  "  font-family: 'Bebas Neue', Impact, sans-serif; font-size: 24px; letter-spacing: 0.14em;",
  '  color: #eceae5; margin-bottom: 14px;',
  '}',
  '.efl-set__input {',
  '  width: 100%; background: rgba(6, 6, 5, 0.9); border: 1px solid var(--efl-line);',
  '  color: #eceae5; padding: 10px 12px; font-family: inherit; font-size: 15px;',
  '  letter-spacing: 0.08em; outline: none;',
  '}',
  '.efl-set__input:focus { border-color: var(--efl-orange); }',
  '.efl-set__modal-actions { margin-top: 18px; display: flex; justify-content: flex-end; gap: 18px; }',
].join('\n')

/* ==========================================================================
 * SettingsMenu
 * ========================================================================== */
export class SettingsMenu {
  constructor(ctx, options = {}) {
    this.ctx = ctx
    this.options = options
    this.root = null
    this.isOpen = false
    this.activeTab = options.activeTab || 'game'
    this.dirty = false
    this._pendingBind = null
    this._snapshot = null
    this._toastTimer = null

    this.settings = deepMerge(clone(DEFAULT_SETTINGS), this.load())

    this._onClick = this._onClick.bind(this)
    this._onInput = this._onInput.bind(this)
    this._onKeyDown = this._onKeyDown.bind(this)
    this._onDocClick = this._onDocClick.bind(this)

    ensureTarkovFonts()
    this._injectStyles()

    /* На старте сразу применяем сохранённый профиль к движку. */
    if (options.applyOnCreate !== false) this.applyAll()
  }

  /* ---------------------------------------------------------------- utils */
  _svc(name) {
    if (!this.ctx || typeof this.ctx.get !== 'function') return null
    try { return this.ctx.get(name) } catch (e) { return null }
  }

  _injectStyles() {
    if (document.getElementById('efl-settings-css')) return
    const style = document.createElement('style')
    style.id = 'efl-settings-css'
    style.textContent = SETTINGS_CSS
    document.head.appendChild(style)
  }

  _ui(sound) { call(this._svc('audio'), 'playUi', sound) }

  get(path) { return getPath(this.settings, path) }

  /* ------------------------------------------------------- персистентность */
  load() {
    try {
      const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch (e) {
      return {}
    }
  }

  save() {
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings))
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('[EFL/settings] localStorage недоступен', e)
    }
    call(this._svc('profile'), 'saveSettings', clone(this.settings))
    this._snapshot = clone(this.settings)
    this.dirty = false
    this._paintDirty()
    this._toast('Настройки сохранены')
    if (typeof this.options.onSave === 'function') this.options.onSave(clone(this.settings))
  }

  reset() {
    this.settings = clone(DEFAULT_SETTINGS)
    const player = this._svc('player')
    if (player && player.nickname) this.settings.game.nickname = player.nickname
    this.dirty = true
    this.applyAll()
    this._rebuildPanes()
    this._toast('Сброшено к заводским')
  }

  /* -------------------------------------------------------------- открытие */
  open() {
    if (this.isOpen) return
    this.isOpen = true
    this._snapshot = clone(this.settings)
    this.dirty = false

    const player = this._svc('player')
    if (player && player.nickname) this.settings.game.nickname = player.nickname

    this._render()
    document.addEventListener('keydown', this._onKeyDown, true)
    document.addEventListener('mousedown', this._onDocClick, true)
    requestAnimationFrame(() => this.root && this.root.classList.add('is-visible'))
  }

  close({ revert = true } = {}) {
    if (!this.isOpen) return
    if (revert && this.dirty && this._snapshot) {
      this.settings = clone(this._snapshot)
      this.applyAll()
    }
    document.removeEventListener('keydown', this._onKeyDown, true)
    document.removeEventListener('mousedown', this._onDocClick, true)
    if (this.root) {
      this.root.removeEventListener('click', this._onClick)
      this.root.removeEventListener('input', this._onInput)
      if (this.root.parentNode) this.root.parentNode.removeChild(this.root)
      this.root = null
    }
    this.isOpen = false
    this.dirty = false
    this._pendingBind = null
    if (typeof this.options.onClose === 'function') this.options.onClose()
  }

  destroy() { this.close({ revert: false }) }

  /* ---------------------------------------------------------------- render */
  _render() {
    if (this.root) return
    const root = document.createElement('div')
    root.className = 'efl-set'
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-modal', 'true')
    if (this.options.zIndex) root.style.zIndex = String(this.options.zIndex)

    root.innerHTML =
      '<div class="efl-set__bg"></div>' +
      '<div class="efl-set__top">' +
        '<div class="efl-set__title">Настройки</div>' +
        '<div class="efl-set__top-actions">' +
          '<button type="button" class="efl-set__btn" data-act="back">НАЗАД</button>' +
          '<button type="button" class="efl-set__btn" data-act="reset">СБРОСИТЬ</button>' +
        '</div>' +
      '</div>' +
      '<nav class="efl-set__nav">' +
        SETTINGS_TABS.map(tab =>
          '<button type="button" class="efl-set__tab' + (tab.id === this.activeTab ? ' is-active' : '') +
          '" data-act="tab" data-tab="' + tab.id + '">' + tab.label + '</button>'
        ).join('') +
      '</nav>' +
      '<div class="efl-set__body" data-role="body">' + this._renderPanes() + '</div>' +
      '<div class="efl-set__foot">' +
        '<span class="efl-set__dirty" data-role="dirty"></span>' +
        '<div class="efl-set__foot-right">' +
          '<button type="button" class="efl-set__btn efl-set__btn--accent" data-act="save">СОХРАНИТЬ</button>' +
        '</div>' +
        '<div class="efl-set__toast" data-role="toast"></div>' +
      '</div>' +
      '<div class="efl-set__modal" data-role="modal">' +
        '<div class="efl-set__modal-card">' +
          '<div class="efl-set__modal-title">Изменить никнейм</div>' +
          '<input type="text" class="efl-set__input" data-role="nick-input" maxlength="18" spellcheck="false" />' +
          '<div class="efl-set__modal-actions">' +
            '<button type="button" class="efl-set__btn" data-act="nick-cancel">ОТМЕНА</button>' +
            '<button type="button" class="efl-set__btn efl-set__btn--accent" data-act="nick-apply">ПРИНЯТЬ</button>' +
          '</div>' +
        '</div>' +
      '</div>'

    root.addEventListener('click', this._onClick)
    root.addEventListener('input', this._onInput)
    document.body.appendChild(root)
    this.root = root
  }

  _renderPanes() {
    return SETTINGS_TABS.map(tab =>
      '<section class="efl-set__pane' + (tab.id === this.activeTab ? ' is-active' : '') + '" data-pane="' + tab.id + '">' +
        tab.sections.map(section =>
          '<div class="efl-set__section">' +
            '<div class="efl-set__section-title">' + section.title + '</div>' +
            section.fields.map(field => this._renderField(field)).join('') +
          '</div>'
        ).join('') +
      '</section>'
    ).join('')
  }

  _rebuildPanes() {
    if (!this.root) return
    const body = this.root.querySelector('[data-role="body"]')
    if (body) body.innerHTML = this._renderPanes()
    this._paintDirty()
  }

  _renderField(field) {
    if (field.type === 'binds') return this._renderBinds()

    const value = field.path ? this.get(field.path) : null
    const hint = field.hint ? '<span class="efl-set__hint">' + field.hint + '</span>' : ''
    let control = ''

    if (field.type === 'nickname') {
      control =
        '<div class="efl-set__nick">' +
          '<span class="efl-set__nick-value" data-role="nick-value">' + escapeHtml(value) + '</span>' +
          '<button type="button" class="efl-set__mini" data-act="nick-open">' + ICON_PENCIL + 'Изменить</button>' +
        '</div>'
    } else if (field.type === 'dropdown') {
      const active = field.options.filter(o => o.value === value)[0] || field.options[0]
      control =
        '<div class="efl-set__dd" data-path="' + field.path + '">' +
          '<button type="button" class="efl-set__dd-btn" data-act="dd-toggle">' +
            '<span data-role="dd-label">' + active.label + '</span>' + ICON_CARET +
          '</button>' +
          '<div class="efl-set__dd-list" role="listbox">' +
            field.options.map(o =>
              '<button type="button" class="efl-set__dd-opt' + (o.value === value ? ' is-active' : '') +
              '" data-act="dd-pick" data-value="' + o.value + '">' + o.label + '</button>'
            ).join('') +
          '</div>' +
        '</div>'
    } else if (field.type === 'slider') {
      control =
        '<div class="efl-set__slider">' +
          '<input type="range" class="efl-set__range" data-act="slider" data-path="' + field.path +
            '" data-format="' + (field.format || '') + '" min="' + field.min + '" max="' + field.max +
            '" step="' + field.step + '" value="' + value + '" />' +
          '<span class="efl-set__slider-val" data-role="val">' + formatValue(field, value) + '</span>' +
        '</div>'
    } else if (field.type === 'checkbox') {
      control =
        '<button type="button" class="efl-set__check' + (value ? ' is-on' : '') +
          '" data-act="check" data-path="' + field.path + '">' +
          '<span class="efl-set__check-box"></span>' +
          '<span data-role="check-label">' + (value ? 'вкл' : 'выкл') + '</span>' +
        '</button>'
    }

    return (
      '<div class="efl-set__row">' +
        '<div class="efl-set__label">' + field.label + hint + '</div>' +
        '<div class="efl-set__control">' + control + '</div>' +
      '</div>'
    )
  }

  _renderBinds() {
    const binds = this.settings.controls.binds
    return (
      '<div class="efl-set__binds">' +
        BIND_ACTIONS.map(item =>
          '<div class="efl-set__bind-row">' +
            '<span class="efl-set__bind-label">' + item.label + '</span>' +
            '<button type="button" class="efl-set__bind" data-act="bind" data-action="' + item.action + '">' +
              keyLabel(binds[item.action]) +
            '</button>' +
          '</div>'
        ).join('') +
      '</div>'
    )
  }

  /* --------------------------------------------------------------- события */
  _onClick(event) {
    const target = event.target && event.target.closest ? event.target.closest('[data-act]') : null
    if (!target) return
    const act = target.getAttribute('data-act')
    event.preventDefault()

    if (act === 'tab') {
      this._ui('hover')
      this.activeTab = target.getAttribute('data-tab')
      const tabs = this.root.querySelectorAll('.efl-set__tab')
      for (let i = 0; i < tabs.length; i++) {
        tabs[i].classList.toggle('is-active', tabs[i].getAttribute('data-tab') === this.activeTab)
      }
      const panes = this.root.querySelectorAll('.efl-set__pane')
      for (let i = 0; i < panes.length; i++) {
        panes[i].classList.toggle('is-active', panes[i].getAttribute('data-pane') === this.activeTab)
      }
      return
    }

    if (act === 'dd-toggle') {
      const dd = target.closest('.efl-set__dd')
      const wasOpen = dd.classList.contains('is-open')
      this._closeDropdowns()
      if (!wasOpen) { dd.classList.add('is-open'); this._ui('hover') }
      return
    }

    if (act === 'dd-pick') {
      const dd = target.closest('.efl-set__dd')
      const path = dd.getAttribute('data-path')
      const value = target.getAttribute('data-value')
      const label = dd.querySelector('[data-role="dd-label"]')
      if (label) label.textContent = target.textContent
      const opts = dd.querySelectorAll('.efl-set__dd-opt')
      for (let i = 0; i < opts.length; i++) opts[i].classList.toggle('is-active', opts[i] === target)
      dd.classList.remove('is-open')
      this._ui('click')
      this._commit(path, value)
      return
    }

    if (act === 'check') {
      const path = target.getAttribute('data-path')
      const next = !this.get(path)
      target.classList.toggle('is-on', next)
      const label = target.querySelector('[data-role="check-label"]')
      if (label) label.textContent = next ? 'вкл' : 'выкл'
      this._ui('click')
      this._commit(path, next)
      return
    }

    if (act === 'bind') {
      this._startBindCapture(target)
      return
    }

    if (act === 'nick-open') {
      const modal = this.root.querySelector('[data-role="modal"]')
      const input = this.root.querySelector('[data-role="nick-input"]')
      input.value = this.settings.game.nickname
      modal.classList.add('is-open')
      input.focus()
      input.select()
      return
    }

    if (act === 'nick-cancel') {
      this.root.querySelector('[data-role="modal"]').classList.remove('is-open')
      return
    }

    if (act === 'nick-apply') {
      const input = this.root.querySelector('[data-role="nick-input"]')
      const next = String(input.value || '').trim().slice(0, 18)
      if (next.length >= 3) {
        this._commit('game.nickname', next)
        const view = this.root.querySelector('[data-role="nick-value"]')
        if (view) view.textContent = next
        this._toast('Никнейм обновлён')
      } else {
        this._toast('Минимум 3 символа')
      }
      this.root.querySelector('[data-role="modal"]').classList.remove('is-open')
      return
    }

    if (act === 'save') { this.save(); return }
    if (act === 'reset') { this._ui('click'); this.reset(); return }
    if (act === 'back') { this._ui('back'); this.close({ revert: true }); return }
  }

  _onInput(event) {
    const input = event.target
    if (!input || input.getAttribute('data-act') !== 'slider') return
    const path = input.getAttribute('data-path')
    const format = input.getAttribute('data-format')
    const value = parseFloat(input.value)
    const view = input.parentNode.querySelector('[data-role="val"]')
    if (view) view.textContent = formatValue({ format: format }, value)
    this._commit(path, value)
  }

  _onDocClick(event) {
    if (!this.root) return
    if (event.target && event.target.closest && event.target.closest('.efl-set__dd')) return
    this._closeDropdowns()
  }

  _closeDropdowns() {
    if (!this.root) return
    const list = this.root.querySelectorAll('.efl-set__dd.is-open')
    for (let i = 0; i < list.length; i++) list[i].classList.remove('is-open')
  }

  _onKeyDown(event) {
    if (!this.isOpen) return

    if (this._pendingBind) {
      event.preventDefault()
      event.stopPropagation()
      if (event.code === 'Escape') { this._cancelBindCapture(); return }
      const action = this._pendingBind.action
      const button = this._pendingBind.button
      const binds = this.settings.controls.binds
      Object.keys(binds).forEach(key => { if (binds[key] === event.code && key !== action) binds[key] = null })
      binds[action] = event.code
      button.classList.remove('is-listening')
      button.textContent = keyLabel(event.code)
      this._pendingBind = null
      this.dirty = true
      this._paintDirty()
      this._rebuildBindLabels()
      call(this._svc('input'), 'bind', action, event.code)
      this._ui('click')
      return
    }

    const modal = this.root.querySelector('[data-role="modal"]')
    if (modal && modal.classList.contains('is-open')) {
      if (event.code === 'Escape') { event.preventDefault(); event.stopPropagation(); modal.classList.remove('is-open') }
      if (event.code === 'Enter') {
        event.preventDefault()
        event.stopPropagation()
        const apply = this.root.querySelector('[data-act="nick-apply"]')
        if (apply) apply.click()
      }
      return
    }

    if (event.code === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.close({ revert: true })
    }
  }

  _startBindCapture(button) {
    if (this._pendingBind) this._cancelBindCapture()
    this._pendingBind = { action: button.getAttribute('data-action'), button: button, previous: button.textContent }
    button.classList.add('is-listening')
    button.textContent = 'НАЖМИТЕ'
    this._ui('hover')
  }

  _cancelBindCapture() {
    if (!this._pendingBind) return
    this._pendingBind.button.classList.remove('is-listening')
    this._pendingBind.button.textContent = keyLabel(this.settings.controls.binds[this._pendingBind.action])
    this._pendingBind = null
  }

  _rebuildBindLabels() {
    if (!this.root) return
    const buttons = this.root.querySelectorAll('[data-act="bind"]')
    for (let i = 0; i < buttons.length; i++) {
      const action = buttons[i].getAttribute('data-action')
      if (buttons[i].classList.contains('is-listening')) continue
      buttons[i].textContent = keyLabel(this.settings.controls.binds[action])
    }
  }

  _paintDirty() {
    if (!this.root) return
    const el = this.root.querySelector('[data-role="dirty"]')
    if (el) el.textContent = this.dirty ? 'есть несохранённые изменения' : ''
  }

  _toast(text) {
    if (!this.root) return
    const el = this.root.querySelector('[data-role="toast"]')
    if (!el) return
    el.textContent = text
    el.classList.add('is-visible')
    if (this._toastTimer) clearTimeout(this._toastTimer)
    this._toastTimer = setTimeout(() => el.classList.remove('is-visible'), 1800)
  }

  /* ------------------------------------------------------------- коммит */
  _commit(path, value) {
    setPath(this.settings, path, value)
    this.dirty = true
    this._paintDirty()
    this.applyField(path, value)
    if (typeof this.options.onChange === 'function') this.options.onChange(path, value, clone(this.settings))
  }

  /* ==========================================================================
   * Привязка к движку
   * ======================================================================== */
  applyField(path, value) {
    const camera = this._svc('camera')
    const renderer = this._svc('renderer')
    const postfx = this._svc('postfx') || (renderer && renderer.postfx) || null
    const character = this._svc('character')
    const audio = this._svc('audio')
    const hud = this._svc('hud')
    const mainMenu = this._svc('mainMenu')
    const sky = this._svc('sky')
    const input = this._svc('input')
    const player = this._svc('player')

    switch (path) {
      /* ------------------------------- ИГРА ------------------------------ */
      case 'game.nickname':
        if (player) player.nickname = value
        call(player, 'setNickname', value)
        call(mainMenu, 'setNickname', value)
        break

      case 'game.language':
        call(this._svc('i18n'), 'setLanguage', value)
        document.documentElement.setAttribute('lang', value)
        break

      case 'game.menuBackground':
        this._applyMenuBackground(value)
        break

      case 'game.hudStamina':
        if (hud) hud.staminaMode = value
        call(hud, 'setStaminaMode', value)
        break

      case 'game.hudHealth':
        if (hud) hud.healthMode = value
        call(hud, 'setHealthMode', value)
        break

      case 'game.healthPalette':
        if (hud) hud.healthPalette = value
        call(hud, 'setHealthPalette', value)
        break

      /* src/physics/character.js: амплитуда качания головы */
      case 'game.headBob':
        if (character) character.headBobAmplitude = value
        call(character, 'setHeadBobAmplitude', value)
        break

      /* Three.js камера: FOV + пересборка проекции */
      case 'game.fov':
        if (camera) {
          camera.fov = value
          if (typeof camera.updateProjectionMatrix === 'function') camera.updateProjectionMatrix()
        }
        break

      /* Нашлемная камера: fisheye + зерно + VHS + REC */
      case 'game.bodycam':
        if (renderer) renderer.bodycam = value
        call(postfx, 'setBodycam', value, { fisheye: 0.30, grain: 0.38, vhs: 0.45, rec: true })
        break

      case 'game.autoFlushRam':
        call(this._svc('memory'), 'setAutoFlush', value)
        break

      case 'game.physicalCoresOnly':
        call(this._svc('workers'), 'setPhysicalCoresOnly', value)
        break

      /* ----------------------------- ГРАФИКА ----------------------------- */
      case 'graphics.screenMode':
        this._applyScreenMode(value, this._interactive === true)
        break

      case 'graphics.antialiasing': {
        const taa = value !== 'off'
        if (renderer) renderer.taa = taa
        call(postfx, 'setTaa', taa)
        break
      }

      case 'graphics.ssr': {
        const intensity = SSR_PRESETS[value] != null ? SSR_PRESETS[value] : 0
        if (renderer) {
          renderer.ssr = intensity > 0
          renderer.ssrIntensity = intensity
        }
        call(postfx, 'setSsr', intensity)
        break
      }

      case 'graphics.shadows': {
        const preset = SHADOW_PRESETS[value] || SHADOW_PRESETS.high
        if (renderer) {
          renderer.shadowQuality = value
          renderer.shadowMapSize = preset.size
          renderer.shadowCascades = preset.cascades
        }
        call(renderer, 'setShadowQuality', value, preset)
        call(this._svc('csm'), 'configure', preset)
        break
      }

      case 'graphics.skyQuality':
        call(sky, 'setQuality', value)
        break

      case 'graphics.grain':
        if (renderer) renderer.grain = value
        call(postfx, 'setGrain', value ? 0.35 : 0)
        break

      case 'graphics.chromatic':
        if (renderer) renderer.chromatic = value
        call(postfx, 'setChromaticAberration', value ? 0.0022 : 0)
        break

      /* ------------------------------ POSTFX ------------------------------ */
      case 'postfx.enabled':
        if (renderer) renderer.postfxEnabled = value
        call(postfx, 'setEnabled', value)
        break

      case 'postfx.brightness':
        call(postfx, 'setBrightness', value / 100)
        break

      case 'postfx.clarity':
        call(postfx, 'setClarity', value / 100)
        break

      case 'postfx.lumaSharpen':
        call(postfx, 'setLumaSharpen', value / 100)
        break

      case 'postfx.adaptiveSharpen':
        call(postfx, 'setAdaptiveSharpen', value / 100)
        break

      /* Emilia и прочие профили уезжают в миксер рендера мгновенно */
      case 'postfx.grading': {
        const preset = GRADING_PRESETS[value] || GRADING_PRESETS.none
        if (renderer) renderer.colorGrading = value
        call(postfx, 'setColorGrading', value, preset)
        break
      }

      /* ------------------------------- ЗВУК ------------------------------- */
      case 'audio.master':
        call(audio, 'setMasterVolume', value / 100)
        break

      case 'audio.ui':
        call(audio, 'setUiVolume', value / 100)
        break

      case 'audio.music':
        call(audio, 'setMusicVolume', value / 100)
        break

      case 'audio.hideout':
        call(audio, 'setHideoutVolume', value / 100)
        break

      /* --------------------------- УПРАВЛЕНИЕ --------------------------- */
      case 'controls.sensitivity':
        if (input) input.sensitivity = value / 100
        call(input, 'setSensitivity', value / 100)
        break

      case 'controls.aimSensitivity':
        if (input) input.aimSensitivity = value / 100
        call(input, 'setAimSensitivity', value / 100)
        break

      case 'controls.invertY':
        if (input) input.invertY = value
        call(input, 'setInvertY', value)
        break

      case 'controls.holdToAim':
        if (input) input.holdToAim = value
        call(input, 'setHoldToAim', value)
        break

      default:
        break
    }

    return this
  }

  /* Прогоняем все значения в движок (старт, СБРОСИТЬ, откат). */
  applyAll() {
    const paths = [
      'game.nickname', 'game.language', 'game.menuBackground', 'game.hudStamina',
      'game.hudHealth', 'game.healthPalette', 'game.headBob', 'game.fov',
      'game.bodycam', 'game.autoFlushRam', 'game.physicalCoresOnly',
      'graphics.screenMode', 'graphics.antialiasing', 'graphics.ssr',
      'graphics.shadows', 'graphics.skyQuality', 'graphics.grain', 'graphics.chromatic',
      'postfx.enabled', 'postfx.brightness', 'postfx.clarity', 'postfx.lumaSharpen',
      'postfx.adaptiveSharpen', 'postfx.grading',
      'audio.master', 'audio.ui', 'audio.music', 'audio.hideout',
      'controls.sensitivity', 'controls.aimSensitivity', 'controls.invertY', 'controls.holdToAim',
    ]
    paths.forEach(path => this.applyField(path, getPath(this.settings, path)))

    const input = this._svc('input')
    const binds = this.settings.controls.binds
    Object.keys(binds).forEach(action => call(input, 'bind', action, binds[action]))
    return this
  }

  /* Фон главного меню: Случайный разворачивается в конкретный пресет. */
  _applyMenuBackground(id) {
    let descriptor = MENU_BACKGROUNDS[id] || MENU_BACKGROUNDS.random
    if (descriptor.random) {
      const pool = Object.keys(MENU_BACKGROUNDS).filter(key => !MENU_BACKGROUNDS[key].random)
      descriptor = MENU_BACKGROUNDS[pool[Math.floor(Math.random() * pool.length)]]
    }

    const mainMenu = this._svc('mainMenu')
    if (mainMenu) mainMenu.backgroundId = descriptor.id
    call(mainMenu, 'setBackground', descriptor.id, descriptor)

    if (descriptor.props && descriptor.props.length) {
      call(mainMenu, 'clearProps')
      descriptor.props.forEach(prop => call(mainMenu, 'spawnProp', prop))
    } else {
      call(mainMenu, 'clearProps')
    }

    if (descriptor.neon) call(mainMenu, 'setNeon', descriptor.neon)
    if (descriptor.overlay) call(mainMenu, 'setOverlay', descriptor.overlay)
    if (descriptor.ambience) call(this._svc('audio'), 'playMenuAmbience', descriptor.ambience)

    const postfx = this._svc('postfx')
    if (descriptor.bloom != null) call(postfx, 'setBloom', descriptor.bloom)
    if (descriptor.vignette != null) call(postfx, 'setVignette', descriptor.vignette)

    return descriptor
  }

  /* Режим экрана: fullscreen требует жеста пользователя. */
  _applyScreenMode(value, allowRequest) {
    const renderer = this._svc('renderer')
    if (renderer) renderer.screenMode = value
    if (!allowRequest) return
    try {
      if (value === 'fullscreen' && !document.fullscreenElement) {
        const el = document.documentElement
        const request = el.requestFullscreen || el.webkitRequestFullscreen
        if (request) request.call(el)
      } else if (value === 'borderless' && document.fullscreenElement) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen
        if (exit) exit.call(document)
      }
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('[EFL/settings] fullscreen отклонён', e)
    }
  }
}

export default SettingsMenu