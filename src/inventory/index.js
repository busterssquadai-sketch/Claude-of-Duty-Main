import { EFL } from '../core/config.js';

const EMPTY = 0xffff;

class Grid {
  constructor(w, h) { this.w = w; this.h = h; this.cells = new Uint16Array(w * h).fill(EMPTY); this.items = []; }
  resize(w, h) {
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h; this.cells = new Uint16Array(w * h).fill(EMPTY);
    const list = this.items; this.items = [];
    for (let i = 0; i < list.length; i++) list[i].dirty = true;   // переукладка снаружи
  }
  clear() { this.cells.fill(EMPTY); this.items.length = 0; }
}

export class InventorySystem {
  static id = 'inventory';
  static deps = ['items'];

  async init(ctx) {
    this.ctx = ctx;
    this.items = ctx.get('items');
    this.byUid = new Map();          // uid → экземпляр
    this.grids = new Map();          // path → Grid
    this.slots = new Map();          // 'primary' → uid
    this.all = [];                   // плоский список для сериализации
    this._uid = 1;
    this._weight = 0;
    this._weightDirty = true;
    this._rng = ctx.rng.fork('inventory');

    this.grids.set('stash', new Grid(EFL.stash.width, EFL.stash.rows));
    this.grids.set('pocket', new Grid(4, 1));
  }

  /* ---------- служебное ---------- */
  grid(path) { return this.grids.get(path) ?? null; }
  get(uid) { return this.byUid.get(uid) ?? null; }
  slotItem(slot) { const u = this.slots.get(slot); return u ? this.byUid.get(u) : null; }

  _ensureContainer(host) {
    const d = this.items.get(host.id);
    if (!d.grid) return null;
    const path = 'in:' + host.uid;
    let g = this.grids.get(path);
    if (!g) { g = new Grid(d.grid.w, d.grid.h); this.grids.set(path, g); }
    return g;
  }

  /* ---------- геометрия сетки: O(w·h), без обхода списка ---------- */
  fits(g, it, x, y, rot) {
    const d = this.items.get(it.id);
    const w = rot ? d.h : d.w, h = rot ? d.w : d.h;
    if (x < 0 || y < 0 || x + w > g.w || y + h > g.h) return false;
    const idx = g.items.indexOf(it);
    for (let j = 0; j < h; j++) {
      const row = (y + j) * g.w;
      for (let i = 0; i < w; i++) {
        const c = g.cells[row + x + i];
        if (c !== EMPTY && c !== idx) return false;
      }
    }
    return true;
  }

  _stamp(g, it, value) {
    const d = this.items.get(it.id);
    const w = it.rot ? d.h : d.w, h = it.rot ? d.w : d.h;
    for (let j = 0; j < h; j++) {
      const row = (it.y + j) * g.w;
      for (let i = 0; i < w; i++) g.cells[row + it.x + i] = value;
    }
  }

  /** Первая свободная клетка с автоповоротом. Пишет в out, не аллоцирует. */
  findFree(g, it, out) {
    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) {
        if (this.fits(g, it, x, y, false)) { out.x = x; out.y = y; out.rot = 0; return true; }
        if (this.fits(g, it, x, y, true))  { out.x = x; out.y = y; out.rot = 1; return true; }
      }
    return false;
  }

  _scratch = { x: 0, y: 0, rot: 0 };

  /* ---------- мутации ---------- */
  add(itemId, count, path, extra) {
    const d = this.items.get(itemId);
    if (!d) return null;
    const g = this.grids.get(path);
    if (!g) return null;

    // слияние стаков
    if (d.stack > 1) {
      for (let i = 0; i < g.items.length && count > 0; i++) {
        const o = g.items[i];
        if (o.id !== itemId || o.n >= d.stack) continue;
        const can = Math.min(d.stack - o.n, count);
        o.n += can; count -= can;
      }
      if (count <= 0) { this._weightDirty = true; this._emit('stack'); return null; }
    }

    const it = {
      uid: this._uid++, id: itemId, n: Math.min(count, d.stack ?? 1),
      path, x: 0, y: 0, rot: 0,
      dur: d.dur ?? null, uses: d.uses ?? null,
      mods: d.t === 'weapon' ? Object.create(null) : null,
      am: null, nm: 0, mag: d.magId ?? null, heat: 0, mode: 0,
      fir: extra?.fir ?? false,
    };
    if (!this.findFree(g, it, this._scratch)) return null;
    it.x = this._scratch.x; it.y = this._scratch.y; it.rot = this._scratch.rot;

    g.items.push(it);
    this._stamp(g, it, g.items.length - 1);
    this.byUid.set(it.uid, it);
    this.all.push(it);
    if (d.grid) this._ensureContainer(it);
    this._weightDirty = true;
    this._emit('add');
    return it;
  }

  remove(uid, count) {
    const it = this.byUid.get(uid);
    if (!it) return;
    if (count && it.n > count) { it.n -= count; this._weightDirty = true; this._emit('split'); return; }

    const inner = this.grids.get('in:' + uid);
    if (inner) { for (let i = inner.items.length - 1; i >= 0; i--) this.remove(inner.items[i].uid); this.grids.delete('in:' + uid); }

    const g = this.grids.get(it.path);
    if (g) {
      const idx = g.items.indexOf(it);
      if (idx >= 0) {
        this._stamp(g, it, EMPTY);
        g.items.splice(idx, 1);
        for (let i = idx; i < g.items.length; i++) this._stamp(g, g.items[i], i);  // индексы съехали
      }
    }
    for (const [s, u] of this.slots) if (u === uid) this.slots.delete(s);
    this.byUid.delete(uid);
    const a = this.all.indexOf(it); if (a >= 0) this.all.splice(a, 1);
    this._weightDirty = true;
    this._emit('remove');
  }

  move(uid, path, x, y, rot) {
    const it = this.byUid.get(uid);
    const dst = this.grids.get(path);
    if (!it || !dst) return false;
    if (path.startsWith('in:')) {                     // защита от рекурсии контейнеров
      let hostUid = +path.slice(3), guard = 0;
      while (hostUid && guard++ < 12) {
        if (hostUid === uid) return false;
        const host = this.byUid.get(hostUid);
        hostUid = host?.path.startsWith('in:') ? +host.path.slice(3) : 0;
      }
    }
    const src = this.grids.get(it.path);
    const oldRot = it.rot;
    it.rot = rot ?? it.rot;
    if (x == null || !this.fits(dst, it, x, y, it.rot)) {
      if (!this.findFree(dst, it, this._scratch)) { it.rot = oldRot; return false; }
      x = this._scratch.x; y = this._scratch.y; it.rot = this._scratch.rot;
    }
    if (src) { const i = src.items.indexOf(it); if (i >= 0) { this._stamp(src, it, EMPTY); src.items.splice(i, 1); for (let k = i; k < src.items.length; k++) this._stamp(src, src.items[k], k); } }
    it.path = path; it.x = x; it.y = y;
    dst.items.push(it); this._stamp(dst, it, dst.items.length - 1);
    this._weightDirty = true;
    this._emit('move');
    return true;
  }

  equip(uid, slot) {
    const it = this.byUid.get(uid);
    if (!it) return false;
    const d = this.items.get(it.id);
    const spec = this.ctx.get('items');
    const rules = spec.constructor;                    // SLOTS с типами
    const cur = this.slotItem(slot);
    if (cur && cur.uid !== uid && !this.unequip(cur.uid)) return false;
    const src = this.grids.get(it.path);
    if (src) { const i = src.items.indexOf(it); if (i >= 0) { this._stamp(src, it, EMPTY); src.items.splice(i, 1); for (let k = i; k < src.items.length; k++) this._stamp(src, src.items[k], k); } }
    it.path = 'slot:' + slot; it.x = 0; it.y = 0; it.rot = 0;
    this.slots.set(slot, uid);
    if (d.grid) this._ensureContainer(it);
    this._weightDirty = true;
    this._emit('equip');
    return true;
  }

  unequip(uid) {
    const it = this.byUid.get(uid);
    if (!it) return false;
    for (const p of this.bodyPaths()) {
      if (p.startsWith('in:' + uid)) continue;
      if (this.move(uid, p)) { for (const [s, u] of this.slots) if (u === uid) this.slots.delete(s); return true; }
    }
    if (this.move(uid, 'stash')) { for (const [s, u] of this.slots) if (u === uid) this.slots.delete(s); return true; }
    return false;
  }

  /** Карманы → разгрузка → рюкзак → защитный. Заполняет переиспользуемый массив. */
  _bodyPaths = ['pocket', '', '', ''];
  bodyPaths() {
    const p = this._bodyPaths;
    p.length = 1;
    for (const s of ['rig', 'backpack', 'secure']) {
      const h = this.slotItem(s);
      if (h) p.push('in:' + h.uid);
    }
    return p;
  }

  onBody(it) {
    let cur = it, guard = 0;
    while (cur && guard++ < 12) {
      if (cur.path === 'pocket' || cur.path.startsWith('slot:')) return true;
      if (!cur.path.startsWith('in:')) return false;
      cur = this.byUid.get(+cur.path.slice(3));
    }
    return false;
  }

  inStash(it) {
    let cur = it, guard = 0;
    while (cur && guard++ < 12) {
      if (cur.path === 'stash') return true;
      if (!cur.path.startsWith('in:')) return false;
      cur = this.byUid.get(+cur.path.slice(3));
    }
    return false;
  }

  countStash(id) { let n = 0; for (const it of this.all) if (it.id === id && this.inStash(it)) n += it.n; return n; }

  takeStash(id, count) {
    let left = count;
    for (let i = this.all.length - 1; i >= 0 && left > 0; i--) {
      const it = this.all[i];
      if (it.id !== id || !this.inStash(it)) continue;
      const take = Math.min(it.n, left); left -= take;
      if (it.n > take) it.n -= take; else this.remove(it.uid);
    }
    return left <= 0;
  }

  /** Вес на теле. Кэш с грязным флагом — player читает это 120 раз в секунду. */
  weight() {
    if (!this._weightDirty) return this._weight;
    let kg = 0;
    for (const it of this.all) {
      if (!this.onBody(it)) continue;
      const d = this.items.get(it.id);
      kg += (d.kg ?? 0) * (d.stack > 1 ? it.n : 1);
      if (it.mods) for (const s in it.mods) kg += this.items.get(it.mods[s])?.kg ?? 0;
      if (it.nm) kg += it.nm * 0.012;
    }
    this._weight = kg;
    this._weightDirty = false;
    return kg;
  }

  _emit(reason) { this.ctx.events.emit('inv:changed', { reason }); }

  dispose() { this.byUid.clear(); this.grids.clear(); this.slots.clear(); this.all.length = 0; }
}