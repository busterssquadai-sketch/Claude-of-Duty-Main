import * as THREE from 'three';
import { EFL } from '../core/config.js';

export class RaidSystem {
  static id = 'raid';
  static deps = ['world', 'inventory', 'items', 'health', 'meta', 'ai', 'ui', 'audio', 'physics'];

  async init(ctx) {
    this.ctx = ctx;
    this.world = ctx.get('world');
    this.inv = ctx.get('inventory');
    this.items = ctx.get('items');
    this.health = ctx.get('health');
    this.meta = ctx.get('meta');

    this.active = false;
    this.mapId = null;
    this.faction = 'pmc';
    this.timeLeft = 0;
    this.night = false;
    this.kills = 0;
    this.lootPoints = [];      // пул, не пересоздаётся между рейдами
    this.corpses = [];
    this.exits = [];
    this._holdT = 0;
    this._activeExit = null;
    this._bag = [];            // переиспользуемый буфер ролла лута
    this._v = new THREE.Vector3();
    this.summary = { kind: '', kills: 0, xp: 0, value: 0, time: 0, exit: '' };

    ctx.events.on('damage:dealt', this._onKill = (e) => { if (e.killed) { this.kills++; this.summary.xp += e.xp ?? 0; } });
    ctx.events.on('actor:death', this._onDeath = (e) => { if (e.isPlayer) this.end('killed'); });
  }

  /* ---------- старт ---------- */
  async start(mapId, faction, night) {
    const seed = this.ctx.rng.uint32();
    this.rng = this.ctx.rng.fork('raid:' + seed);
    this.mapId = mapId; this.faction = faction; this.night = !!night;
    this.kills = 0;
    this.summary.xp = 0;

    // строим мир по требованию — вот ради чего world.buildMap асинхронный
    const map = await this.world.buildMap(mapId, { night: this.night, seed });
    this.exits = map.exits;
    this.timeLeft = map.duration;

    this._scatterLoot(map);
    if (faction === 'scav') this.meta.equipScavKit(this.rng);
    this.health.reset();

    this.active = true;
    this.ctx.events.emit('raid:start', { mapId, faction, night: this.night, seed });
  }

  _scatterLoot(map) {
    const spots = map.lootSpots;
    const budget = Math.min(EFL.budgets.lootPoints, spots.length);
    for (let i = 0; i < budget; i++) {
      const spot = spots[i];
      const lp = this.lootPoints[i] ?? (this.lootPoints[i] = { items: [], mesh: null, opened: false, kind: '', pos: new THREE.Vector3() });
      lp.items.length = 0;
      lp.opened = false;
      lp.kind = spot.kind;
      lp.pos.copy(spot.position);
      lp.mesh = spot.mesh;                        // инстанс из world, не создаём новый
      this.items.fillBag(this._bag, spot.kind, this.rng, spot.rich ?? 1);
      for (let k = 0; k < this._bag.length; k += 2) lp.items.push(this._bag[k], this._bag[k + 1]);
    }
    this.lootPoints.length = budget;
  }

  /* ---------- лут ---------- */
  openLoot(index) {
    const lp = this.lootPoints[index];
    if (!lp || lp.opened) return null;
    lp.opened = true;
    this.ctx.events.emit('loot:opened', { point: lp });
    return lp;
  }

  takeLoot(lp, slotIndex) {
    const id = lp.items[slotIndex * 2];
    const n = lp.items[slotIndex * 2 + 1];
    if (!id) return false;
    for (const path of this.inv.bodyPaths()) {
      if (this.inv.add(id, n, path, { fir: true })) {
        lp.items.splice(slotIndex * 2, 2);
        this.ctx.events.emit('loot:taken', { itemId: id, count: n, fir: true });
        return true;
      }
    }
    return false;                                  // нет места
  }

  /** Труп бота — та же лут-точка. Старые трупы теряют меш, но не содержимое. */
  spawnCorpse(bot) {
    const lp = { items: [], opened: false, kind: 'corpse', pos: bot.root.position.clone(), bot };
    lp.items.push(bot.wepId, 1, this.items.ammoId[bot.ammoIdx], this.rng.int(10, 60));
    this.items.fillBag(this._bag, 'jacket', this.rng, 0.7);
    for (let k = 0; k < this._bag.length; k += 2) lp.items.push(this._bag[k], this._bag[k + 1]);
    this.corpses.push(lp);
    this.lootPoints.push(lp);
    if (this.corpses.length > EFL.budgets.corpses) {
      const old = this.corpses.shift();
      this.world.recycleCorpseMesh(old.bot);       // меш в пул, лут остаётся доступен
    }
  }

  /* ---------- выходы ---------- */
  /** Условия выхода из EFL: фракция, время, ключ, цена, свободные руки. */
  exitStatus(exit, out) {
    out.open = true; out.reason = '';
    if (exit.faction && exit.faction !== this.faction) { out.open = false; out.reason = 'Только ' + (exit.faction === 'scav' ? 'Дикие' : 'ЧВК'); return out; }
    if (exit.afterSec && this.timeLeft > exit.afterSec) { out.open = false; out.reason = 'Откроется позже'; return out; }
    if (exit.beforeSec && this.timeLeft < exit.beforeSec) { out.open = false; out.reason = 'Закрыт'; return out; }
    if (exit.needKey && !this._hasItem(exit.needKey)) { out.open = false; out.reason = 'Нужен ключ'; return out; }
    if (exit.cost && this.meta.money('rub') < exit.cost) { out.open = false; out.reason = exit.cost + ' ₽'; return out; }
    if (exit.freeHands && this.inv.slotItem('backpack')) { out.open = false; out.reason = 'Без рюкзака'; return out; }
    return out;
  }
  _exitOut = { open: false, reason: '' };
  _hasItem(id) { for (const it of this.inv.all) if (it.id === id && this.inv.onBody(it)) return true; return false; }

  fixedUpdate(h, ctx) {
    if (!this.active) return;
    this.timeLeft -= h;
    if (this.timeLeft <= 0) { this.end('mia'); return; }

    const pos = ctx.get('player').position;
    let inside = null;
    for (let i = 0; i < this.exits.length; i++) {
      const e = this.exits[i];
      if (pos.distanceToSquared(e.position) > e.radius * e.radius) continue;
      if (!this.exitStatus(e, this._exitOut).open) continue;
      inside = e; break;
    }

    if (!inside) { this._holdT = 0; this._activeExit = null; return; }
    if (this._activeExit !== inside) { this._activeExit = inside; this._holdT = 0; }
    this._holdT += h;
    const need = inside.transfer ? EFL.raid.transferHold : EFL.raid.extractHold;
    ctx.events.emit('extract:progress', { exit: inside, t: this._holdT, need });
    if (this._holdT >= need) this.extract(inside);
  }

  extract(exit) {
    if (exit.cost) this.meta.spend('rub', exit.cost);
    this.ctx.events.emit('raid:extract', { exit, transfer: !!exit.transfer });
    this.end('survived', exit);
  }

  /* ---------- конец ---------- */
  end(kind, exit) {
    if (!this.active) return;
    this.active = false;

    const s = this.summary;
    s.kind = kind; s.kills = this.kills; s.exit = exit?.name ?? '';
    s.value = 0;
    for (const it of this.inv.all) if (this.inv.onBody(it)) s.value += this.items.price(it.id) * it.n;

    if (kind === 'survived') this.meta.keepLoadout();
    else this.meta.loseLoadout(kind);              // страховка разбирается внутри meta

    this.world.teardown();                         // ГЛАВНОЕ: освобождаем всю геометрию и RT
    this.corpses.length = 0;
    this.ctx.events.emit('raid:end', { kind, summary: s });
  }

  dispose() {
    this.ctx.events.off('damage:dealt', this._onKill);
    this.ctx.events.off('actor:death', this._onDeath);
    this.lootPoints.length = 0; this.corpses.length = 0; this.exits.length = 0;
  }
}