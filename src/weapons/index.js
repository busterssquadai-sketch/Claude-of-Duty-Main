import * as THREE from 'three';
import { EFL } from '../core/config.js';

const MODES = ['single', 'burst', 'auto'];
export const MALF = ['misfire', 'feed', 'extract', 'jam'];

export class WeaponSystem {
  static id = 'weapons';
  static deps = ['items', 'inventory', 'health', 'physics', 'fx', 'audio', 'render'];

  async init(ctx) {
    this.ctx = ctx;
    this.items = ctx.get('items');
    this.inv = ctx.get('inventory');
    this.health = ctx.get('health');
    this.physics = ctx.get('physics');
    this.fx = ctx.get('fx');
    this.audio = ctx.get('audio');
    this.rng = ctx.rng.fork('weapons');

    // --- преаллокация: ни одного new в бою ---
    this._origin = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._stats = { ergo: 0, vr: 0, hr: 0, spread: 0, zoom: 1, sup: 0, adsTime: 0, weight: 0 };
    this._statsDirty = true;

    this.active = null;         // экземпляр из inventory
    this.slot = 'primary';
    this.ads = 0;               // 0..1
    this.recoilV = 0; this.recoilH = 0; this.recoilVel = 0;
    this.heat = 0;
    this.cooldown = 0;
    this.reloading = 0;
    this.burstLeft = 0;
    this.malfunction = null;
    this.fixTime = 0;

    ctx.events.on('inv:changed', this._onInv = () => { this._statsDirty = true; });
  }

  /* ---------- статы с модами: кэшируются, пересчитываются по грязному флагу ---------- */
  stats() {
    const s = this._stats;
    if (!this._statsDirty || !this.active) return s;
    const d = this.items.get(this.active.id);
    s.ergo = d.ergo; s.vr = d.vr; s.hr = d.hr; s.spread = d.spread;
    s.zoom = d.zoom ?? 1; s.sup = 0; s.weight = d.kg;

    const mods = this.active.mods;
    if (mods) for (const key in mods) {
      const m = this.items.get(mods[key]);
      if (!m) continue;
      s.ergo += m.ergo ?? 0;
      s.vr += m.vr ?? 0;
      s.hr += m.hr ?? 0;
      s.weight += m.kg ?? 0;
      if (m.zoom) s.zoom = m.zoom;
      if (m.sup) s.sup = 1;
      if (m.acc) s.spread *= 1 - m.acc / 100;
    }
    const mag = this.active.mag ? this.items.get(this.active.mag) : null;
    if (mag) { s.ergo += mag.ergo ?? 0; s.weight += (mag.kg ?? 0) + this.active.nm * 0.012; }

    // вес снаряжения и травмы рук бьют по эргономике
    const over = Math.max(0, this.inv.weight() - EFL.weight.free);
    s.ergo = Math.max(5, (s.ergo - over * 0.8) * this.health.armPenalty());
    s.adsTime = 0.62 - Math.min(0.34, s.ergo * 0.0042);
    this._statsDirty = false;
    return s;
  }

  /* ---------- магазины ---------- */
  reserveFor(cal, out) {
    out.length = 0;
    for (const it of this.inv.all) {
      if (!this.inv.onBody(it)) continue;
      const d = this.items.get(it.id);
      if (d.t === 'mag' && d.cal === cal && it.nm > 0) out.push(it);
      else if (d.t === 'ammo' && d.cal === cal) out.push(it);
    }
    out.sort((a, b) => (b.nm ?? b.n) - (a.nm ?? a.n));
    return out;
  }
  _reserveBuf = [];

  reloadTime(tactical) {
    const s = this.stats();
    const base = tactical ? 2.4 : 3.1;
    return base * (1 - Math.min(0.42, s.ergo * 0.0052));
  }

  startReload() {
    if (this.reloading > 0 || this.malfunction || !this.active) return false;
    const d = this.items.get(this.active.id);
    const list = this.reserveFor(d.cal, this._reserveBuf);
    if (!list.length) return false;
    this.reloading = this.reloadTime(this.active.nm > 0);
    this._reloadSrc = list[0];
    this.ctx.events.emit('weapon:reload', { weapon: this.active.id, phase: 'start' });
    this.audio.play('reload', this.stats().sup ? 0.6 : 1);
    return true;
  }

  _finishReload() {
    const w = this.active, src = this._reloadSrc;
    if (!w || !src) return;
    const wd = this.items.get(w.id);
    const sd = this.items.get(src.id);
    const cap = (w.mag ? this.items.get(w.mag).cap : wd.cap) | 0;

    if (sd.t === 'mag') {                         // меняем магазин целиком
      const oldMag = w.mag, oldN = w.nm, oldAm = w.am;
      w.mag = src.id; w.nm = src.nm; w.am = src.am;
      src.id = oldMag ?? src.id; src.nm = oldN; src.am = oldAm;
      if (!oldMag) this.inv.remove(src.uid);
    } else {                                       // дозарядка россыпью
      const take = Math.min(cap - w.nm, src.n);
      if (w.nm === 0 || w.am === src.id) { w.am = src.id; w.nm += take; }
      if (src.n > take) src.n -= take; else this.inv.remove(src.uid);
    }
    this._reloadSrc = null;
    this._statsDirty = true;
    this.ctx.events.emit('weapon:reload', { weapon: w.id, phase: 'end' });
  }

  checkMag() {
    if (!this.active) return;
    const cap = this.active.mag ? this.items.get(this.active.mag).cap : this.items.get(this.active.id).cap;
    this.ctx.events.emit('weapon:magcheck', { weapon: this.active.id, rounds: this.active.nm, cap });
  }

  cycleMode() {
    const d = this.items.get(this.active?.id);
    if (!d?.modes?.length) return;
    this.active.mode = (this.active.mode + 1) % d.modes.length;
  }

  /* ---------- выстрел ---------- */
  tryFire(held) {
    const w = this.active;
    if (!w || this.cooldown > 0 || this.reloading > 0 || this.malfunction) return false;
    const d = this.items.get(w.id);
    const mode = d.modes[w.mode] ?? 'single';
    if (mode !== 'auto' && held) return false;
    if (w.nm <= 0) { this.audio.play('click'); return false; }

    // осечка: шанс растёт от нагрева и износа
    const wear = 1 - (w.dur ?? 100) / 100;
    if (this.rng.float() < 0.0006 + this.heat * 0.0021 + wear * 0.004) {
      this.malfunction = MALF[this.rng.int(0, MALF.length - 1)];
      this.fixTime = this.malfunction === 'jam' ? 4.2 : 1.9;
      this.ctx.events.emit('weapon:malfunction', { weapon: w.id, kind: this.malfunction });
      this.audio.play('click');
      return false;
    }

    const s = this.stats();
    const cam = this.ctx.camera;
    cam.getWorldPosition(this._origin);
    cam.getWorldDirection(this._dir);

    // разброс: стойка + ADS + усталость
    const spread = s.spread * (1 - this.ads * 0.72) * (this.health.armPenalty() < 1 ? 1.3 : 1);
    const pellets = d.pellets ?? 1;
    const ammoIdx = this.items.ammoSlot(w.am);
    const seed = this.rng.uint32();

    for (let i = 0; i < pellets; i++) {
      this._tmp.set(
        (this.rng.float() * 2 - 1) * spread,
        (this.rng.float() * 2 - 1) * spread,
        0,
      ).applyQuaternion(cam.quaternion);
      this._dir.copy(cam.getWorldDirection(this._tmp.clone ? this._tmp : this._tmp)).normalize();
      // ПРИМЕЧАНИЕ: в боевом коде без clone — см. penetration.js, там вектора из пула
      this.physics.penetrate(this._origin, this._dir, ammoIdx, w.uid);
    }

    w.nm--;
    this.heat = Math.min(1, this.heat + 0.06 * (this.items.get(w.mods?.muzzle)?.heat ?? 1));
    this.cooldown = 60 / d.rpm;

    // отдача — пружина, а не мгновенный скачок
    const ergoK = 1 - Math.min(0.5, s.ergo * 0.006);
    this.recoilVel += s.vr * 0.00042 * ergoK * (1 - this.ads * 0.25);
    this.recoilH += (this.rng.float() * 2 - 1) * s.hr * 0.00013 * ergoK;

    this.ctx.events.emit('weapon:fire', { weapon: w.id, origin: this._origin, dir: this._dir, seed, suppressed: s.sup });
    this.ctx.events.emit('weapon:shell', { position: this._origin, velocity: this._dir });
    this.audio.play(s.sup ? 'shot_sup' : 'shot', 1, d.cal);
    if (mode === 'burst' && this.burstLeft === 0) this.burstLeft = 2;
    return true;
  }

  /* ---------- кадр ---------- */
  update(dt, ctx) {
    const input = ctx.input;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.heat = Math.max(0, this.heat - dt * 0.22);

    if (this.malfunction) {
      if (input.down('reload')) {
        this.fixTime -= dt;
        if (this.fixTime <= 0) { this.malfunction = null; this.audio.play('reload'); }
      }
      return;
    }
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this._finishReload();
      return;
    }

    // ADS с учётом эргономики и веса
    const want = input.down('ads') ? 1 : 0;
    const rate = dt / Math.max(0.08, this.stats().adsTime);
    this.ads = want ? Math.min(1, this.ads + rate) : Math.max(0, this.ads - rate * 1.6);

    if (this.burstLeft > 0 && this.cooldown === 0) { this.burstLeft--; this.tryFire(true); }
    else if (input.down('fire')) this.tryFire(input.held('fire'));

    // возврат отдачи (критически затухающая пружина)
    const k = 34, c = 11;
    this.recoilVel += (-k * this.recoilV - c * this.recoilVel) * dt;
    this.recoilV += this.recoilVel * dt;
    this.recoilH *= 1 - Math.min(1, dt * 7);
  }

  dispose() { this.ctx.events.off('inv:changed', this._onInv); }
}