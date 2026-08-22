// src/ui/hud.js
export class Hud {
  constructor(ctx) {
    this.ctx = ctx;
    this._acc = 0;
    this._last = { hp: -1, ammo: -1, weight: -1, time: -1, mode: -1 };
    this.el = {};                       // ссылки на DOM берутся один раз
  }

  /** HUD обновляется 10 раз в секунду, а не каждый кадр,
   *  и пишет в DOM только изменившиеся поля. В твоей версии hudSync()
   *  пересобирал innerHTML каждый кадр — это layout thrash на 6–10 мс. */
  update(dt) {
    this._acc += dt;
    if (this._acc < 0.1) return;
    this._acc = 0;

    const h = this.ctx.get('health'), w = this.ctx.get('weapons'), r = this.ctx.get('raid');
    const hp = Math.round(h.total());
    if (hp !== this._last.hp) { this.el.hp.textContent = hp; this._last.hp = hp; }

    const ammo = w.active?.nm ?? 0;
    if (ammo !== this._last.ammo) { this.el.ammo.textContent = ammo; this._last.ammo = ammo; }

    const kg = Math.round(this.ctx.get('inventory').weight() * 10) / 10;
    if (kg !== this._last.weight) {
      this.el.kg.textContent = kg + ' кг';
      this.el.kg.className = kg > 42 ? 'over' : kg > 28 ? 'warn' : '';
      this._last.weight = kg;
    }

    const t = Math.ceil(r.timeLeft);
    if (t !== this._last.time) { this.el.time.textContent = mmss(t); this._last.time = t; }
  }
}