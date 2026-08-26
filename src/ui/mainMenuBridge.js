/* ==========================================================================
 * Escape-From-Larpov · src/ui/mainMenuBridge.js
 *
 * «НАСТРОЙКИ» на стартовом экране не открывали ничего: MainMenuSystem не
 * владеет экземпляром SettingsMenu (его создаёт UiSystem у себя внутри) и
 * не имеет метода открытия панели, поэтому клик уходил в пустоту.
 *
 * Мост делает три вещи и ни одна из них не требует правок разметки меню:
 *   1. добавляет MainMenuSystem.prototype.openSettings() —
 *      он берёт готовый экземпляр у UiSystem, а если его нет,
 *      инстанцирует SettingsMenu сам и вызывает open();
 *   2. навешивает ОДИН делегированный слушатель клика в фазе capture,
 *      который распознаёт кнопку настроек по data-атрибуту или по подписи
 *      (НАСТРОЙКИ / SETTINGS / ОПЦИИ) и работает даже если меню
 *      перерисовывает свой DOM целиком;
 *   3. аккуратно отходит в сторону, когда клик пришёл из ESC-меню или из
 *      самой панели настроек — там свои обработчики.
 *
 * Импорты НАМЕРЕННО неймспейсные: промах именованного импорта в ESM —
 * это ошибка СВЯЗЫВАНИЯ, которая роняет весь бандл. Слой мостов не имеет
 * права ронять загрузку игры.
 * ========================================================================== */

import * as MainMenuModule from './mainMenu.js'
import * as SettingsMenuModule from './settingsMenu.js'

const MainMenuSystem = MainMenuModule.MainMenuSystem || MainMenuModule.default || null
const SettingsMenu = SettingsMenuModule.SettingsMenu || SettingsMenuModule.default || null

const SETTINGS_TEXT = /^(настройки|настроики|settings|опции|options)$/i
const SETTINGS_TOKENS = [
  'settings',
  'setting',
  'open-settings',
  'opensettings',
  'options',
  'opts',
  'config',
]
const SKIP_ROOTS = '.efl-esc, .efl-set, #eftInv'
const MAX_WALK = 8

let applied = false
let clickBound = false

function attrOf(node, name) {
  if (!node || typeof node.getAttribute !== 'function') return null
  const v = node.getAttribute(name)
  return v == null ? null : String(v).toLowerCase()
}

function looksLikeSettings(node) {
  if (!node || node.nodeType !== 1) return false

  const attrs = [
    attrOf(node, 'data-act'),
    attrOf(node, 'data-action'),
    attrOf(node, 'data-nav'),
    attrOf(node, 'data-screen'),
    attrOf(node, 'data-menu'),
    attrOf(node, 'data-tab'),
    attrOf(node, 'data-role'),
    attrOf(node, 'data-view'),
    node.id ? String(node.id).toLowerCase() : null,
  ]
  for (let i = 0; i < attrs.length; i++) {
    if (attrs[i] && SETTINGS_TOKENS.indexOf(attrs[i]) >= 0) return true
  }

  const label = attrOf(node, 'aria-label')
  if (label && SETTINGS_TEXT.test(label.trim())) return true

  /* Подпись. Короткий текст, чтобы не поймать контейнер целиком. */
  const text = node.textContent
  if (text) {
    const trimmed = text.replace(/\s+/g, ' ').trim()
    if (trimmed.length > 0 && trimmed.length <= 24 && SETTINGS_TEXT.test(trimmed)) return true
  }
  return false
}

function engineFrom(instance) {
  if (!instance) return null
  if (instance.engine) return instance.engine
  if (instance.options && instance.options.engine) return instance.options.engine
  if (instance.ctx && instance.ctx.engine) return instance.ctx.engine
  if (typeof window !== 'undefined' && window.__ENGINE__) return window.__ENGINE__
  return null
}

function ctxFrom(instance) {
  if (!instance) {
    if (typeof window !== 'undefined' && window.__ENGINE__) return window.__ENGINE__.ctx || null
    return null
  }
  if (instance.ctx) return instance.ctx
  if (instance.options && instance.options.ctx) return instance.options.ctx
  const engine = engineFrom(instance)
  return (engine && engine.ctx) || null
}

function uiSystemOf(ctx) {
  if (!ctx) return null
  if (typeof ctx.peek === 'function') {
    try {
      const ui = ctx.peek('ui')
      if (ui) return ui
    } catch (e) {
      /* UiSystem ещё не зарегистрирован */
    }
  }
  if (typeof ctx.get === 'function') {
    try {
      return ctx.get('ui') || null
    } catch (e) {
      return null
    }
  }
  return null
}

/** Экземпляр панели настроек: сначала общий из UiSystem, потом свой. */
export function ensureSettingsMenu(instance) {
  const ctx = ctxFrom(instance)
  if (!ctx) {
    if (typeof console !== 'undefined') console.warn('[EFL/mainMenu] нет ctx — настройки не открыть')
    return null
  }

  const ui = uiSystemOf(ctx)
  if (ui && ui.settingsMenu) {
    if (instance) instance.settingsMenu = ui.settingsMenu
    return ui.settingsMenu
  }

  if (instance && instance.settingsMenu) return instance.settingsMenu

  if (!SettingsMenu) {
    if (typeof console !== 'undefined') {
      console.error('[EFL/mainMenu] SettingsMenu не найден в ./settingsMenu.js')
    }
    return null
  }

  try {
    const menu = new SettingsMenu(ctx, { zIndex: 9800 })
    if (instance) instance.settingsMenu = menu
    if (ui && !ui.settingsMenu) ui.settingsMenu = menu
    return menu
  } catch (err) {
    if (typeof console !== 'undefined') console.error('[EFL/mainMenu] SettingsMenu не создан', err)
    return null
  }
}

export function openMainMenuSettings(instance) {
  const menu = ensureSettingsMenu(instance)
  if (!menu) return null
  if (menu.isOpen) return menu
  try {
    menu.open()
  } catch (err) {
    if (typeof console !== 'undefined') console.error('[EFL/mainMenu] SettingsMenu.open() упал', err)
    return null
  }
  return menu
}

function mainMenuInstance() {
  if (typeof window === 'undefined') return null
  const engine = window.__ENGINE__
  return (engine && engine.mainMenu) || null
}

function mainMenuIsUp(instance) {
  const engine = engineFrom(instance)
  if (engine && typeof engine.state === 'string') {
    /* Стартовая сцена — это STATE.MENU. В рейде за настройки отвечает ESC-меню. */
    if (engine.state !== 'menu' && engine.state !== 'boot' && engine.state !== 'loading') return false
  }
  if (instance && typeof instance.isOpen === 'function') {
    try {
      if (instance.isOpen()) return true
    } catch (e) {
      /* игнорируем */
    }
  }
  if (instance && instance.open === true) return true
  /* Если инстанс молчит, доверяем состоянию движка. */
  return !!engine
}

function onDocumentClick(event) {
  if (!event || event.defaultPrevented) return
  const target = event.target
  if (!target || target.nodeType !== 1) return

  /* ESC-меню и сама панель настроек обрабатывают свои кнопки сами. */
  if (typeof target.closest === 'function' && target.closest(SKIP_ROOTS)) return

  let node = target
  let hit = null
  for (let i = 0; i < MAX_WALK && node && node.nodeType === 1; i++) {
    if (looksLikeSettings(node)) {
      hit = node
      break
    }
    node = node.parentElement
  }
  if (!hit) return

  const instance = mainMenuInstance()
  if (!mainMenuIsUp(instance)) return

  event.preventDefault()
  if (typeof event.stopPropagation === 'function') event.stopPropagation()

  if (instance && typeof instance.openSettings === 'function') instance.openSettings()
  else openMainMenuSettings(instance)
}

function bindDelegatedClick() {
  if (clickBound || typeof document === 'undefined') return
  clickBound = true
  document.addEventListener('click', onDocumentClick, true)
}

export function applyMainMenuBridge() {
  if (applied) return MainMenuSystem
  applied = true

  const proto = MainMenuSystem && MainMenuSystem.prototype
  if (!proto) {
    if (typeof console !== 'undefined') {
      console.error('[EFL/mainMenu] MainMenuSystem не найден в ./mainMenu.js — мост без прототипа')
    }
    /* Делегированный клик всё равно ставим: он умеет работать без инстанса. */
    bindDelegatedClick()
    return MainMenuSystem
  }

  const original = proto.openSettings

  proto.openSettings = function openSettings() {
    /* Если у меню уже был свой рабочий метод — уважаем его, но страхуем. */
    if (typeof original === 'function' && original !== proto.openSettings) {
      try {
        const res = original.call(this)
        if (this.settingsMenu && this.settingsMenu.isOpen) return res
      } catch (err) {
        if (typeof console !== 'undefined') {
          console.warn('[EFL/mainMenu] родной openSettings() упал, открываем панель сами', err)
        }
      }
    }
    return openMainMenuSettings(this)
  }

  if (typeof proto.showSettings !== 'function') {
    proto.showSettings = function showSettings() {
      return this.openSettings()
    }
  }
  if (typeof proto.settingsMenuInstance !== 'function') {
    proto.settingsMenuInstance = function settingsMenuInstance() {
      return ensureSettingsMenu(this)
    }
  }

  /* Кнопка может рисоваться при mount() — вешаем делегирование после него. */
  const originalMount = proto.mount
  if (typeof originalMount === 'function') {
    proto.mount = function patchedMount() {
      const res = originalMount.apply(this, arguments)
      bindDelegatedClick()
      return res
    }
  }

  bindDelegatedClick()
  return MainMenuSystem
}

export default applyMainMenuBridge
