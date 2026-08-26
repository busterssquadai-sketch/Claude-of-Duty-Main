/* ==========================================================================
 * Escape-From-Larpov · src/ui/index.js
 * UiSystem — единственный владелец оверлеев поверх игрового цикла.
 *
 * Состояния берём только из STATE (escapeMenu.js), который один в один
 * повторяет замороженный STATE из core/engine.js (всё строго в нижнем
 * регистре: 'boot' | 'menu' | 'loading' | 'gameplay' | 'paused' | 'results').
 * Строковые литералы состояний здесь запрещены.
 * ========================================================================== */

import {
  STATE,
  EscapeMenuSystem,
  ensureTarkovFonts,
  call,
  installAudioCompat,
} from './escapeMenu.js'
import { RaidResultSystem } from './raidResult.js'
import * as SettingsModule from './settingsMenu.js'

const BUILD_VERSION = '1.1.0.1.46777'

/* settingsMenu.js отдаёт и named, и default. Берём что есть и никогда не бросаем:
 * без меню настроек UI обязан продолжать работать. */
function resolveSettingsCtor(mod) {
  if (mod && typeof mod.SettingsMenu === 'function') return mod.SettingsMenu
  if (mod && typeof mod.default === 'function') return mod.default
  console.warn('[EFL/ui] settingsMenu.js не отдал конструктор — меню настроек отключено')
  return null
}

export class UiSystem {
  static id = 'ui'
  static deps = ['audio', 'meta']

  constructor(options = {}) {
    this.options = options || {}

    this.ctx = null
    this.audio = null

    this.escapeMenu = null
    this.raidResult = null
    this.settingsMenu = null

    this.hudVisible = false

    this._offState = null
    this._pendingResults = null
    this._progressBefore = null
    this._menuFacade = null
  }

  /* registry.get() БРОСАЕТ для незарегистрированного id, peek() — нет.
   * Половина того, что спрашивал старый UI ('state', 'input', 'hud',
   * 'mainMenu', 'postfx'), в реестре не регистрируется вообще. */
  _peek(id) {
    const ctx = this.ctx
    if (!ctx) return null
    if (typeof ctx.peek === 'function') {
      try { return ctx.peek(id) } catch (e) { return null }
    }
    if (typeof ctx.get === 'function') {
      try { return ctx.get(id) } catch (e) { return null }
    }
    return null
  }

  get engine() {
    return this.ctx && this.ctx.engine ? this.ctx.engine : null
  }

  /* ---------------------------------------------------------------- init */
  init(ctx) {
    this.ctx = ctx
    ensureTarkovFonts()

    /* Доклеивает duck/unduck/set*Volume/stop*, чего нет в AudioSystem. */
    this.audio = installAudioCompat(this._peek('audio'))

    const SettingsCtor = resolveSettingsCtor(SettingsModule)
    if (SettingsCtor) {
      try {
        this.settingsMenu = new SettingsCtor(ctx, {
          zIndex: 9800,
          onClose: () => { call(this.escapeMenu, 'onSettingsClosed') },
        })
      } catch (err) {
        console.error('[EFL/ui] SettingsMenu не создан', err)
        this.settingsMenu = null
      }
    }

    /* EscapeMenuSystem статически не импортирует settingsMenu.js (это был
     * цикл ESM), поэтому передаём ему готовый экземпляр фабрикой. */
    try {
      this.escapeMenu = new EscapeMenuSystem(ctx, {
        buildVersion: BUILD_VERSION,
        raidMode: 'TRAINING',
        gameMode: 'PvE',
        settingsFactory: () => this.settingsMenu,
      })
    } catch (err) {
      console.error('[EFL/ui] EscapeMenuSystem не создан', err)
      this.escapeMenu = null
    }

    try {
      this.raidResult = new RaidResultSystem(ctx, {
        onFinish: () => this._returnToMenu(),
      })
    } catch (err) {
      console.error('[EFL/ui] RaidResultSystem не создан', err)
      this.raidResult = null
    }

    if (ctx && ctx.events && typeof ctx.events.on === 'function') {
      this._offState = ctx.events.on('state', (e) => {
        const from = e && e.from ? e.from : null
        const to = e && e.to ? e.to : null
        this._onStateTransition(from, to)
      })
    }

    this.setHudVisible(false)
  }

  /* ------------------------------------------------------ переходы состояний */
  _onStateTransition(from, to) {
    try {
      if (to === STATE.PAUSED) {
        this.setHudVisible(false)
        call(this.escapeMenu, 'openMenu')
        return
      }

      if (from === STATE.PAUSED && to === STATE.GAMEPLAY) {
        /* Если оверлей уже закрыт, resumeGameplay() звать нельзя: он сам
         * дёргает setState и мы уйдём в лишний круг событий. */
        if (this.escapeMenu && this.escapeMenu.open) {
          call(this.escapeMenu, 'resumeGameplay')
        }
        this.setHudVisible(true)
        return
      }

      if (to === STATE.GAMEPLAY) {
        this._closeOverlays()
        this.setHudVisible(true)
        return
      }

      if (to === STATE.RESULTS) {
        /* Сам визард открывает engine.showResults() через showRaidResults()
         * сразу после setState — здесь только гасим HUD. */
        this.setHudVisible(false)
        return
      }

      if (to === STATE.MENU || to === STATE.LOADING) {
        this.setHudVisible(false)
        this.hideRaidResults()
        call(this.escapeMenu, 'destroyOverlay')
        if (this.settingsMenu && this.settingsMenu.isOpen) {
          call(this.settingsMenu, 'close', { revert: false })
        }
      }
    } catch (err) {
      console.error('[EFL/ui] обработчик перехода состояния упал', err)
    }
  }

  _closeOverlays() {
    call(this.escapeMenu, 'destroyOverlay')
    if (this.settingsMenu && this.settingsMenu.isOpen) {
      call(this.settingsMenu, 'close', { revert: false })
    }
    this.hideRaidResults()
  }

  /* ------------------------------------------------------------ итоги рейда */

  /* Снимок прогресса ДО того, как MetaSystem._afterRaid() зачислит опыт.
   * Engine подписывается на raid:end в конструкторе, MetaSystem — в init(),
   * так что при первом вызове здесь ещё лежат дорейдовые уровень и опыт. */
  _readProgress() {
    const meta = this._peek('meta')
    const P = meta && meta.P ? meta.P : null
    if (!P) return { lvl: 1, xp: 0 }
    return {
      lvl: Number(P.lvl) || 1,
      xp: Number(P.xp) || 0,
    }
  }

  showRaidResults(payload) {
    const data = payload && typeof payload === 'object' ? payload : {}

    if (!this._progressBefore) this._progressBefore = this._readProgress()

    /* При дезертирстве экраном владеет EscapeMenuSystem — он покажет свою
     * сводку и сам позовёт нас снова из continueToResults(). */
    if (this.escapeMenu &&
        typeof this.escapeMenu.ownsResultsScreen === 'function' &&
        this.escapeMenu.ownsResultsScreen()) {
      this._pendingResults = data
      return
    }

    /* Отложенная сводка из raid:end точнее фолбэка оверлея, поэтому побеждает. */
    const merged = Object.assign({}, data, this._pendingResults || {})
    this._pendingResults = null

    if (this.raidResult && typeof this.raidResult.show === 'function') {
      this.raidResult.show(Object.assign({}, merged, {
        progressBefore: this._progressBefore,
      }))
    } else {
      console.warn('[EFL/ui] RaidResultSystem недоступен, итоги рейда пропущены')
    }
  }

  hideRaidResults() {
    this._pendingResults = null
    this._progressBefore = null
    call(this.raidResult, 'close')
  }

  /* ------------------------------------------------------------ фасад menu */

  /* engine.showResults() безусловно зовёт ui?.menu?.close?.(). Если в этот
   * момент показан экран дезертира, закрывать его нельзя. enterMenu()
   * сначала ставит состояние MENU, так что выход в убежище работает. */
  get menu() {
    if (this._menuFacade) return this._menuFacade
    const self = this

    this._menuFacade = {
      get isOpen() {
        return !!(self.escapeMenu && self.escapeMenu.open)
      },
      open() {
        call(self.escapeMenu, 'openMenu')
      },
      close() {
        const engine = self.engine
        const owns = !!(self.escapeMenu &&
          typeof self.escapeMenu.ownsResultsScreen === 'function' &&
          self.escapeMenu.ownsResultsScreen())
        if (owns && engine && engine.state === STATE.RESULTS) return
        call(self.escapeMenu, 'destroyOverlay')
      },
    }
    return this._menuFacade
  }

  /* ------------------------------------------------------------------- HUD */
  setHudVisible(visible) {
    const on = !!visible
    this.hudVisible = on
    if (typeof document === 'undefined') return

    if (document.documentElement) {
      document.documentElement.setAttribute('data-hud', on ? 'on' : 'off')
    }

    /* 'hud' в реестр никто не добавляет, но контракт держим. */
    const hud = this._peek('hud')
    if (hud) {
      if (typeof hud.setVisible === 'function') call(hud, 'setVisible', on)
      else hud.visible = on
    }

    const node = document.getElementById('hud')
    if (node && node.style) node.style.display = on ? '' : 'none'
  }

  /* ---------------------------------------------------------------- resize */
  resize(w, h) {
    const render = this._peek('render')
    call(render && render.postfx, 'setSize', w, h)
    call(this.raidResult, 'onResize', w, h)
    call(this.escapeMenu, 'onResize', w, h)
    call(this.settingsMenu, 'onResize', w, h)
  }

  update(dt, ctx) {
    /* Оверлеи живут на событиях и rAF, покадровая работа им не нужна. */
  }

  /* ------------------------------------------------------------ в убежище */
  _returnToMenu() {
    this.hideRaidResults()

    const engine = this.engine
    if (!engine) return

    if (typeof engine.returnToMenu === 'function') {
      call(engine, 'returnToMenu')
      if (engine.state === STATE.MENU) return
    }

    if (typeof engine.setState === 'function') engine.setState(STATE.MENU)
    call(engine.mainMenu, 'show')
  }

  /* --------------------------------------------------------------- dispose */
  dispose() {
    if (typeof this._offState === 'function') {
      try { this._offState() } catch (e) { /* отписка не должна ломать выгрузку */ }
    }
    this._offState = null

    call(this.raidResult, 'destroy')
    call(this.escapeMenu, 'destroy')
    call(this.settingsMenu, 'destroy')

    this.raidResult = null
    this.escapeMenu = null
    this.settingsMenu = null
    this._menuFacade = null
    this._pendingResults = null
    this._progressBefore = null
    this.audio = null
    this.ctx = null
  }
}

export default UiSystem
