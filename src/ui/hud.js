// src/ui/hud.js
// mmss() вызывался в update(), но нигде не был объявлен и не импортирован —
// гарантированный ReferenceError на первом же тике таймера рейда.

function pad2(n) {
  return String(Math.max(0, Math.floor(Number(n) || 0))).padStart(2, '0');
}

export function mmss(totalSeconds) {
  const t = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return pad2(Math.floor(t / 60)) + ':' + pad2(t % 60);
}

export class Hud {
  static id = 'hud';
  static deps = [];

  constructor(ctx) {
    this.ctx = ctx || null;
    this._acc = 0;
    this._last = { hp: -1, ammo: -1, weight: -1, time: -1, mode: -1 };
    this.el = {};                       // ссылки на DOM берутся один раз, в mount()
    this.root = null;
    this.visible = false;
  }

  init(ctx) {
    this.ctx = ctx;
    this.mount();
    return this;
  }

  /* registry.get() бросает для незарегистрированного id — только peek. */
  _svc(id) {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (typeof ctx.peek === 'function') {
      try { return ctx.peek(id); } catch (e) { return null; }
    }
    if (typeof ctx.get === 'function') {
      try { return ctx.get(id); } catch (e) { return null; }
    }
    return null;
  }

  /** Старая версия никогда не заполняла this.el, так что любая запись в
   *  this.el.hp.textContent падала с TypeError. */
  mount(root) {
    if (typeof document === 'undefined') return this;
    const host = root || document.getElementById('hud');
    this.root = host || null;
    if (!this.root) return this;

    const pick = (name) =>
      this.root.querySelector('[data-hud="' + name + '"]') ||
      this.root.querySelector('#hud-' + name) ||
      this.root.querySelector('.hud-' + name) ||
      null;

    this.el = {
      hp: pick('hp'),
      ammo: pick('ammo'),
      kg: pick('kg') || pick('weight'),
      time: pick('time'),
    };
    return this;
  }

  /** Контракт, который щупает UiSystem.setHudVisible(). */
  setVisible(v) {
    this.visible = !!v;
    if (this.root && this.root.style) this.root.style.display = this.visible ? '' : 'none';
    return this;
  }

  /** HUD обновляется 10 раз в секунду, а не каждый кадр,
   *  и пишет в DOM только изменившиеся поля. */
  update(dt) {
    this._acc += Number(dt) || 0;
    if (this._acc < 0.1) return;
    this._acc = 0;

    if (!this.root) return;

    const health = this._svc('health');
    if (health && typeof health.total === 'function' && this.el.hp) {
      const hp = Math.round(Number(health.total()) || 0);
      if (hp !== this._last.hp) { this.el.hp.textContent = String(hp); this._last.hp = hp; }
    }

    const weapons = this._svc('weapons');
    if (weapons && this.el.ammo) {
      const ammo = weapons.active?.nm ?? 0;
      if (ammo !== this._last.ammo) { this.el.ammo.textContent = String(ammo); this._last.ammo = ammo; }
    }

    const inv = this._svc('inventory');
    if (inv && typeof inv.weight === 'function' && this.el.kg) {
      const kg = Math.round((Number(inv.weight()) || 0) * 10) / 10;
      if (kg !== this._last.weight) {
        this.el.kg.textContent = kg + ' кг';
        this.el.kg.className = kg > 42 ? 'over' : kg > 28 ? 'warn' : '';
        this._last.weight = kg;
      }
    }

    const raid = this._svc('raid');
    if (raid && this.el.time) {
      const t = Math.ceil(Number(raid.timeLeft) || 0);
      if (t !== this._last.time) { this.el.time.textContent = mmss(t); this._last.time = t; }
    }
  }

  dispose() {
    this.el = {};
    this.root = null;
    this.ctx = null;
  }
}

export default Hud;
