import { EFL } from '../core/config.js';

export const PARTS = ['head', 'thorax', 'stomach', 'larm', 'rarm', 'lleg', 'rleg'];
const MAXHP = new Float32Array([35, 85, 70, 60, 60, 65, 65]);

/** Биты эффектов на часть тела. */
export const E_BLEED_L = 1, E_BLEED_H = 2, E_FRACTURE = 4, E_PAIN = 8, E_HEALING = 16;

/** Класс брони → условная стойкость (тарковская кривая). */
const ARMOR_RES = new Float32Array([0, 14, 22, 32, 44, 58, 74]);

export class HealthSystem {
  static id = 'health';
  static deps = ['items', 'inventory'];

  async init(ctx) {
    this.ctx = ctx;
    this.items = ctx.get('items');
    this.inv = ctx.get('inventory');
    this.rng = ctx.rng.fork('health');

    this.hp = new Float32Array(PARTS.length);
    this.max = new Float32Array(MAXHP);
    this.fx = new Uint8Array(PARTS.length);
    this.healTimer = new Float32Array(PARTS.length);
    this.energy = 100;
    this.hydration = 100;
    this.stamina = 100;
    this.dead = false;
    this._acc = 0;
    this._painT = 0;
    this.reset();

    ctx.events.on('bullet:impact', this._onImpact = (e) => {
      if (e.target?.isPlayer) this.hit(e.partIndex ?? 1, e.damage, e.penetrated, e.armorDamage);
    });
  }

  reset() {
    this.hp.set(this.max);
    this.fx.fill(0);
    this.healTimer.fill(0);
    this.energy = 100; this.hydration = 100; this.stamina = 100;
    this.dead = false;
  }

  partIndex(name) { return PARTS.indexOf(name); }
  isDead() { return this.dead; }
  total() { let s = 0; for (let i = 0; i < this.hp.length; i++) s += this.hp[i]; return s; }

  /* ---------- броня ---------- */
  /** Возвращает итоговый урон, мутирует прочность брони. Без аллокаций. */
  applyArmor(partIdx, damage, penPower, armorDamage) {
    const slot = partIdx === 0 ? 'helmet' : (partIdx === 1 || partIdx === 2) ? 'armor' : null;
    if (!slot) return damage;
    const arm = this.inv.slotItem(slot);
    if (!arm || arm.dur <= 0) return damage;
    const d = this.items.get(arm.id);
    if (partIdx === 2 && !d.covers?.includes('stomach')) return damage;

    const wear = arm.dur / (d.dur || 1);
    const res = ARMOR_RES[d.cls | 0] * (0.35 + 0.65 * wear);
    // тарковская логиста: шанс пробития от разницы pen и res
    const chance = 1 / (1 + Math.exp((res - penPower) * 0.17));
    arm.dur = Math.max(0, arm.dur - armorDamage * 0.01 * (1.6 - wear * 0.6));

    if (this.rng.float() < chance) return damage * (0.62 + 0.38 * (1 - wear));  // пробитие
    return damage * 0.12 * (1 - res / 110);                                     // заброневая травма
  }

  /* ---------- урон ---------- */
  hit(partIdx, rawDamage, penPower = 0, armorDamage = 0) {
    if (this.dead) return 0;
    const dmg = this.applyArmor(partIdx, rawDamage, penPower, armorDamage);
    this.hp[partIdx] = Math.max(0, this.hp[partIdx] - dmg);

    // эффекты от величины урона
    const r = this.rng.float();
    if (dmg > 22 && r < 0.30) this.setEffect(partIdx, E_BLEED_H, true);
    else if (dmg > 8 && r < 0.45) this.setEffect(partIdx, E_BLEED_L, true);
    if (partIdx >= 3 && dmg > 26 && this.rng.float() < 0.22) this.setEffect(partIdx, E_FRACTURE, true);
    this._painT = Math.max(this._painT, 4.5);

    if (this.hp[partIdx] <= 0) this._blackout(partIdx);
    this.ctx.events.emit('health:changed', { part: PARTS[partIdx], hp: this.hp[partIdx], dead: this.dead });
    return dmg;
  }

  _blackout(partIdx) {
    if (partIdx === 0 || partIdx === 1) { this.die(); return; }
    // черная конечность: штраф и постоянный урон в грудь
    this.setEffect(partIdx, E_PAIN, true);
    if (partIdx === 2) this.energy = Math.min(this.energy, 40);
  }

  setEffect(partIdx, bit, on) {
    const had = (this.fx[partIdx] & bit) !== 0;
    if (had === on) return;
    if (on) this.fx[partIdx] |= bit; else this.fx[partIdx] &= ~bit;
    this.ctx.events.emit('health:effect', { kind: bit, part: PARTS[partIdx], on });
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.ctx.events.emit('actor:death', { actor: null, isPlayer: true });
  }

  /* ---------- медицина ---------- */
  /** Возвращает время применения или 0, если нечего лечить. */
  useMed(uid) {
    const it = this.inv.get(uid);
    if (!it) return 0;
    const d = this.items.get(it.id);
    if (d.t !== 'med' && d.t !== 'food') return 0;

    if (d.t === 'food') {
      this.energy = Math.min(100, this.energy + (d.energy ?? 0));
      this.hydration = Math.min(100, this.hydration + (d.hydra ?? 0));
      this._consume(it, d);
      return d.time ?? 2.5;
    }

    let did = false;
    if (d.stopsBleed) for (let i = 0; i < PARTS.length; i++) {
      if (this.fx[i] & (E_BLEED_L | E_BLEED_H)) {
        this.setEffect(i, E_BLEED_L, false);
        if (d.stopsBleed > 1) this.setEffect(i, E_BLEED_H, false);
        did = true; break;
      }
    }
    if (d.splint) for (let i = 3; i < PARTS.length; i++) {
      if (this.fx[i] & E_FRACTURE) { this.setEffect(i, E_FRACTURE, false); did = true; break; }
    }
    if (d.hp) {
      let worst = -1, ratio = 1;
      for (let i = 0; i < PARTS.length; i++) {
        const rr = this.hp[i] / this.max[i];
        if (this.hp[i] > 0 && rr < ratio) { ratio = rr; worst = i; }
      }
      if (worst >= 0 && ratio < 1) {
        const heal = Math.min(d.hp, this.max[worst] - this.hp[worst]);
        this.hp[worst] += heal; did = true;
        this.ctx.events.emit('health:changed', { part: PARTS[worst], hp: this.hp[worst], dead: false });
      }
    }
    if (!did) return 0;
    this._consume(it, d);
    return d.time ?? 3;
  }

  _consume(it, d) {
    if (it.uses != null && --it.uses > 0) return;
    if (it.n > 1) it.n--; else this.inv.remove(it.uid);
  }

  /* ---------- тик с аккумулятором 1 Гц ---------- */
  fixedUpdate(h, ctx) {
    if (this.dead) return;
    this._painT = Math.max(0, this._painT - h);
    this._acc += h;
    if (this._acc < 1) return;
    const dt = this._acc; this._acc = 0;

    const S = EFL.survival;
    let bleed = 0;
    for (let i = 0; i < PARTS.length; i++) {
      const f = this.fx[i];
      if (f & E_BLEED_H) bleed += S.bleedHeavy;
      else if (f & E_BLEED_L) bleed += S.bleedLight;
    }
    if (bleed > 0) {
      const target = this.hp[1] > 0 ? 1 : 2;
      this.hp[target] = Math.max(0, this.hp[target] - bleed * dt);
      this.hydration = Math.max(0, this.hydration - bleed * dt * 0.4);
      if (this.hp[target] <= 0) this._blackout(target);
      ctx.events.emit('health:changed', { part: PARTS[target], hp: this.hp[target], dead: this.dead });
    }

    this.energy = Math.max(0, this.energy - S.energyDrain * dt);
    this.hydration = Math.max(0, this.hydration - S.hydraDrain * dt);
    if (this.energy <= 0 || this.hydration <= 0) {
      this.hp[1] = Math.max(0, this.hp[1] - S.starveDamage * dt);
      if (this.hp[1] <= 0) this.die();
    } else if (this.energy > 55 && bleed === 0) {
      // медленная регенерация сытого ПМКа
      for (let i = 0; i < PARTS.length; i++)
        if (this.hp[i] > 0 && this.hp[i] < this.max[i]) this.hp[i] = Math.min(this.max[i], this.hp[i] + 0.12 * dt);
    }
  }

  /** Суммарные штрафы для player/weapons — читаются каждый тик, поэтому без объектов. */
  legPenalty() {
    let p = 1;
    if (this.hp[5] <= 0 || this.hp[6] <= 0) p *= 0.55;
    if (this.fx[5] & E_FRACTURE) p *= 0.7;
    if (this.fx[6] & E_FRACTURE) p *= 0.7;
    return p;
  }
  armPenalty() {
    let p = 1;
    if (this.hp[3] <= 0 || this.hp[4] <= 0) p *= 0.6;
    if ((this.fx[3] | this.fx[4]) & E_FRACTURE) p *= 0.75;
    if (this._painT > 0) p *= 0.85;
    return p;
  }

  dispose() { this.ctx.events.off('bullet:impact', this._onImpact); }
}