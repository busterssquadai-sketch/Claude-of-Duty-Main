/* ==========================================================================
 * Escape-From-Larpov · src/ui/index.js
 * Управляющая подсистема интерфейса. Интегрирует ESC-меню, Настройки 
 * и Линейный отчет о рейде в общий стейт-машина движка.
 * ========================================================================== */

import { EscapeMenuSystem } from './escapeMenu.js'
import * as SettingsModule from './settingsMenu.js' // <-- ИМПОРТ ВСЕГО МОДУЛЯ (Фикс SyntaxError)
import { RaidResultSystem } from './raidResult.js'
import { STATE } from '../core/engine.js'

export class UiSystem {
  static id = 'ui'
  static deps = ['audio', 'meta'] // Ждем инициализацию звука и мета-данных профиля

  constructor(opts = {}) {
    this.opts = opts
    this.enabled = true
    this.escapeMenu = null
    this.settingsMenu = null
    this.raidResult = null
    this.hudElement = null
  }

  async init(ctx) {
    this.ctx = ctx

    // Инициализируем реактивное меню настроек через пространство имен модуля
    this.settingsMenu = new SettingsModule.SettingsMenu(ctx, { // <-- БЕЗОПАСНЫЙ ВЫЗОВ КЛАССА
      zIndex: 9800,
      onClose: () => {
        // Если игра на паузе, при закрытии настроек возвращаем фокус на ESC-меню
        if (ctx.engine.state === STATE.PAUSED && this.escapeMenu) {
          this.escapeMenu.openMenu()
        }
      }
    })

    // Инициализируем ESC-меню (Пауза / Дезертирство)
    this.escapeMenu = new EscapeMenuSystem(ctx, {
      buildVersion: '1.1.0.1.46777',
      raidMode: 'TRAINING',
      gameMode: 'PvE',
      settingsFactory: () => this.settingsMenu
    })

    // Инициализируем систему последовательного вывода статистики (Убийства -> Статистика -> Опыт)
    this.raidResult = new RaidResultSystem(ctx, {
      buildVersion: '1.1.0.1.46777',
      gameMode: 'PvE'
    })

    // Подписываемся на системную смену игровых состояний движка
    ctx.events.on('state', (e) => this._onStateTransition(e.from, e.to))
    
    // Биндим глобальный отлов ESC во время геймплея
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && ctx.engine.state === STATE.GAMEPLAY) {
        e.preventDefault()
        e.stopPropagation()
        ctx.engine.setState(STATE.PAUSED)
      }
    }, true)
  }

  /**
   * Реакция на изменение глобальных состояний Движка (src/core/engine.js)
   */
  _onStateTransition(from, to) {
    // 1. Переход в режим Паузы (нажатие ESC во время рейда)
    if (to === STATE.PAUSED) {
      if (this.escapeMenu) {
        this.escapeMenu.openMenu()
      }
    } 
    // Если выходим из паузы обратно в рейд
    else if (from === STATE.PAUSED && to === STATE.GAMEPLAY) {
      if (this.escapeMenu && this.escapeMenu.open) {
        this.escapeMenu.resumeGameplay()
      }
    }

    // 2. Переход на экран итогов рейда (Через штатный триггер движка "showResults")
    if (to === STATE.RESULTS) {
      this.setHudVisible(false)
    } else if (from === STATE.RESULTS) {
      if (this.raidResult) this.raidResult.close()
    }

    // 3. Возврат в главное меню
    if (to === STATE.MENU) {
      this.setHudVisible(false)
      if (this.escapeMenu) this.escapeMenu.destroyOverlay()
      if (this.settingsMenu && this.settingsMenu.isOpen) this.settingsMenu.close({ revert: false })
      if (this.raidResult) this.raidResult.close()
    }
  }

  /* --- Реализация интерфейсного контракта, запрашиваемого из src/core/engine.js --- */

  setHudVisible(visible) {
    if (!this.hudElement) {
      this.hudElement = document.getElementById('hud') || document.querySelector('.efl-hud-root')
    }
    if (this.hudElement) {
      this.hudElement.style.display = visible ? 'block' : 'none'
    }
    // Кастомные вызовы скрытия HUD элементов вашего UI
    call(this.ctx.peek('hud'), visible ? 'show' : 'hide')
  }

  showRaidResults(summaryPayload) {
    if (this.raidResult) {
      this.raidResult.show(summaryPayload)
    }
  }

  hideRaidResults() {
    if (this.raidResult) {
      this.raidResult.close()
    }
  }

  /**
   * Ссылка на меню для обратной совместимости с вызовами: ui?.menu?.close?.()
   */
  get menu() {
    return {
      close: () => {
        if (this.escapeMenu) this.escapeMenu.destroyOverlay()
        if (this.settingsMenu && this.settingsMenu.isOpen) this.settingsMenu.close({ revert: false })
      }
    }
  }

  update(dt, ctx) {
    // Сюда можно транслировать тики для анимаций интерфейса или обновления HUD
    if (this.escapeMenu && this.escapeMenu.open) {
      // Обновление таймеров, если требуется
    }
  }

  resize(w, h, ctx) {
    // Передаем изменения размеров окна в систему шейдеров PostFX через рендер-сервис
    const postfx = ctx.get('render')?.postfx || ctx.postfx
    if (postfx && typeof postfx.setSize === 'function') {
      postfx.setSize(w, h)
    }
  }

  dispose() {
    if (this.escapeMenu) this.escapeMenu.destroy()
    if (this.settingsMenu) this.settingsMenu.destroy()
    if (this.raidResult) this.raidResult.destroy()
  }
}

function call(target, method, ...args) {
  if (target && typeof target[method] === 'function') return target[method](...args)
  return undefined
}

export default UiSystem
