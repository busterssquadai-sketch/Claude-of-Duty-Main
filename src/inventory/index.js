import { EFL } from '../core/config.js';
import { STATE } from '../core/engine.js';

const EMPTY = 0xffff;
const CELL = 34;
const EQUIP_ORDER = ['primary', 'secondary', 'holster', 'armor', 'helmet', 'rig', 'backpack', 'secure'];
const SLOT_LABEL = {
  primary: 'PRIMARY',
  secondary: 'SECONDARY',
  holster: 'HOLSTER',
  armor: 'ARMOR',
  helmet: 'HELMET',
  rig: 'RIG',
  backpack: 'BACKPACK',
  secure: 'SECURE',
};
const SLOT_ACCEPT = {
  primary: ['weapon'],
  secondary: ['weapon'],
  holster: ['weapon'],
  armor: ['armor'],
  helmet: ['helmet'],
  rig: ['rig'],
  backpack: ['backpack'],
  secure: ['secure'],
};

const CSS = `
#eftInv{position:fixed;inset:0;z-index:90;display:none;background:radial-gradient(120% 90% at 50% 0%,rgba(32,38,40,.98),rgba(9,11,12,.995) 74%);color:#d7dbd3;font:12px/1.35 "Oswald","Segoe UI",sans-serif;letter-spacing:.05em;user-select:none}
#eftInv.open{display:block}
#eftInv *{box-sizing:border-box}
#eftInv .top{display:flex;justify-content:space-between;align-items:flex-end;padding:18px 22px 10px;border-bottom:1px solid rgba(255,255,255,.08)}
#eftInv .title{font-size:28px;letter-spacing:.18em;color:#e5dcc6}
#eftInv .sub{font:11px/1.4 "Segoe UI",sans-serif;color:#8f968c}
#eftInv .wrap{display:grid;grid-template-columns:320px 1fr;gap:16px;padding:16px 18px 18px;height:calc(100% - 78px)}
#eftInv .side,#eftInv .main{display:flex;flex-direction:column;gap:12px;min-height:0}
#eftInv .card{background:linear-gradient(160deg,rgba(20,24,26,.94),rgba(11,13,14,.88));border:1px solid #2a3033;box-shadow:0 14px 32px rgba(0,0,0,.45);padding:10px}
#eftInv h6{margin:0 0 8px;font-size:10px;letter-spacing:.24em;color:#c8a15a}
#eftInv .equip{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
#eftInv .slot{min-height:66px;border:1px dashed #3a4143;background:#14181a;padding:6px;position:relative;display:flex;align-items:flex-end;justify-content:flex-start;cursor:pointer}
#eftInv .slot.fill{border-style:solid;border-color:#58625e;background:#1a1f21}
#eftInv .slot.hot{outline:2px solid #c8a15a}
#eftInv .slot em{position:absolute;left:6px;top:4px;font-style:normal;font-size:8px;color:#6c746f}
#eftInv .slot b{font:11px/1.2 "Segoe UI",sans-serif;color:#d7dbd3;max-width:100%}
#eftInv .kv{display:flex;justify-content:space-between;font:11px/1.4 "Consolas",monospace;color:#a2aaa2;padding:2px 0;border-bottom:1px dotted #23282a}
#eftInv .kv b{color:#dfe5db}
#eftInv .hint{font:10px/1.5 "Consolas",monospace;color:#7c847d}
#eftInv .main-scroll{display:flex;flex-direction:column;gap:12px;overflow:auto;padding-right:4px}
#eftInv .grid{position:relative;background:#121617;border:1px solid #2d3436;background-image:linear-gradient(to right,rgba(49,58,60,.75) 1px,transparent 1px),linear-gradient(to bottom,rgba(49,58,60,.75) 1px,transparent 1px);overflow:hidden}
#eftInv .grid-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
#eftInv .grid-head span{font-size:10px;color:#7e8780}
#eftInv .item{position:absolute;border:1px solid rgba(0,0,0,.75);box-shadow:inset 0 0 0 1px rgba(255,255,255,.05),0 4px 12px rgba(0,0,0,.45);padding:2px 4px;display:flex;flex-direction:column;justify-content:space-between;cursor:grab;overflow:hidden}
#eftInv .item.drag-source{opacity:.3}
#eftInv .item b{font:10px/1.08 "Consolas",monospace;color:#edf0ea;pointer-events:none;word-break:break-word}
#eftInv .item i{font-style:normal;font:9px/1 "Consolas",monospace;color:#d8ddd3;align-self:flex-end;pointer-events:none}
#eftInv .item.med{background:linear-gradient(145deg,#4d6d4e,#273629)}
#eftInv .item.food{background:linear-gradient(145deg,#705d38,#3e3321)}
#eftInv .item.weapon{background:linear-gradient(145deg,#6b6858,#2e2f2b)}
#eftInv .item.mag{background:linear-gradient(145deg,#4d5457,#262a2b)}
#eftInv .item.mod{background:linear-gradient(145deg,#67524a,#302722)}
#eftInv .item.armor,#eftInv .item.helmet,#eftInv .item.rig,#eftInv .item.backpack,#eftInv .item.secure{background:linear-gradient(145deg,#48545a,#242b2f)}
#eftInv .item.barter{background:linear-gradient(145deg,#6a5533,#34291b)}
#eftInv .item .dur{position:absolute;left:0;right:0;bottom:0;height:2px;background:#8fc06a}
#eftInv .target-ok{outline:2px solid #8fc06a}
#eftInv .target-bad{outline:2px solid #d95c46}
#eftInv .ghost{position:fixed;pointer-events:none;z-index:110;opacity:.95}
`;

class Grid {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.cells = new Uint16Array(w * h).fill(EMPTY);
    this.items = [];
  }

  resize(w, h) {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.cells = new Uint16Array(w * h).fill(EMPTY);
    const list = this.items;
    this.items = [];
    for (let i = 0; i < list.length; i++) list[i].dirty = true;
  }

  clear() {
    this.cells.fill(EMPTY);
    this.items.length = 0;
  }
}

function injectStyle(id, css) {
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

function itemName(items, it) {
  return items.get(it.id)?.n ?? it.id;
}

function itemType(items, it) {
  return items.get(it.id)?.t ?? 'barter';
}

function sizeFor(items, it, rot) {
  const d = items.get(it.id);
  const w = rot ? d.h : d.w;
  const h = rot ? d.w : d.h;
  return { w, h };
}

function acceptedSlot(def) {
  if (!def) return null;
  for (const slot of EQUIP_ORDER) {
    const accept = SLOT_ACCEPT[slot];
    if (accept && accept.includes(def.t)) return slot;
  }
  return null;
}

export class InventorySystem {
  static id = 'inventory';
  static deps = ['items'];

  async init(ctx) {
    this.ctx = ctx;
    this.items = ctx.get('items');
    this.byUid = new Map();
    this.grids = new Map();
    this.slots = new Map();
    this.all = [];
    this.quick = new Array(7).fill(null);
    this._uid = 1;
    this._weight = 0;
    this._weightDirty = true;
    this._rng = ctx.rng.fork('inventory');
    this.open = false;
    this.selectedPart = 'thorax';
    this._drag = null;
    this._useLabel = '';
    this._bound = [];
    this._savedScale = 1;

    this.grids.set('stash', new Grid(EFL.stash.width, EFL.stash.rows));
    this.grids.set('pocket', new Grid(4, 1));

    if (this.all.length === 0) this._seedStarterKit();

    if (typeof document !== 'undefined') {
      injectStyle('eft-inventory-css', CSS);
      this._buildUi();
      this._bindUi();
      this._render();
    }

    this.ctx.events.on('health:select', (e) => {
      this.selectedPart = e?.part ?? 'thorax';
      this._renderSummary();
    });
    this.ctx.events.on('health:heal', () => this._render());

    /* Любой уход из боя закрывает панель: иначе она останется висеть поверх
     * итогов рейда и навсегда оставит time.scale в нуле. */
    this.ctx.events.on('raid:end', () => this.hide());
    this.ctx.events.on('state', (e) => {
      if (e && e.to && e.to !== STATE.GAMEPLAY) this.hide();
    });

    this._syncWeapons();
    this._emit('ready');
  }

  grid(path) {
    return this.grids.get(path) ?? null;
  }

  get(uid) {
    return this.byUid.get(uid) ?? null;
  }

  slotItem(slot) {
    const uid = this.slots.get(slot);
    return uid ? this.byUid.get(uid) : null;
  }

  /* ------------------------------------------------- состояние движка / курсор */

  _engineState() {
    const engine = this.ctx && this.ctx.engine ? this.ctx.engine : null;
    if (engine && typeof engine.state === 'string') return engine.state;
    /* Engine.setState() дублирует состояние в data-game-state — резервный путь
     * для дев-харнессов, где ctx.engine не проброшен. */
    if (typeof document !== 'undefined' && document.documentElement) {
      return document.documentElement.getAttribute('data-game-state');
    }
    return null;
  }

  /* TAB работает только в рейде. В меню, на загрузке, в паузе и на итогах
   * клавиша нам не принадлежит и проходит мимо нетронутой. */
  _canOpen() {
    return this._engineState() === STATE.GAMEPLAY;
  }

  /* EscapeMenuSystem живёт на UiSystem, а не в реестре. Берём лениво, без deps:
   * инвентарь обязан работать и без UI. */
  _escapeMenu() {
    const ui = this.ctx && typeof this.ctx.peek === 'function' ? this.ctx.peek('ui') : null;
    return ui && ui.escapeMenu ? ui.escapeMenu : null;
  }

  _holdCursor() {
    const esc = this._escapeMenu();
    if (esc && typeof esc.holdCursor === 'function') {
      try { esc.holdCursor('inventory'); } catch (e) {}
    }
  }

  /* Снимаем заявку через два кадра: эвристика потери pointer lock в
   * escapeMenu проверяет себя через один rAF, и снятие раньше срока снова
   * открыло бы паузу. */
  _releaseCursorSoon() {
    const esc = this._escapeMenu();
    if (!esc || typeof esc.releaseCursor !== 'function') return;
    const drop = () => {
      try { esc.releaseCursor('inventory'); } catch (e) {}
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(drop));
    } else {
      setTimeout(drop, 32);
    }
  }

  _ensureContainer(host) {
    const d = this.items.get(host.id);
    if (!d?.grid) return null;
    const path = 'in:' + host.uid;
    let g = this.grids.get(path);
    if (!g) {
      g = new Grid(d.grid.w, d.grid.h);
      this.grids.set(path, g);
    }
    return g;
  }

  fits(g, it, x, y, rot) {
    const d = this.items.get(it.id);
    const w = rot ? d.h : d.w;
    const h = rot ? d.w : d.h;
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
    const w = it.rot ? d.h : d.w;
    const h = it.rot ? d.w : d.h;
    for (let j = 0; j < h; j++) {
      const row = (it.y + j) * g.w;
      for (let i = 0; i < w; i++) g.cells[row + it.x + i] = value;
    }
  }

  findFree(g, it, out) {
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        if (this.fits(g, it, x, y, false)) {
          out.x = x;
          out.y = y;
          out.rot = 0;
          return true;
        }
        if (this.fits(g, it, x, y, true)) {
          out.x = x;
          out.y = y;
          out.rot = 1;
          return true;
        }
      }
    }
    return false;
  }

  _scratch = { x: 0, y: 0, rot: 0 };

  add(itemId, count, path, extra) {
    const d = this.items.get(itemId);
    if (!d) return null;
    const g = this.grids.get(path);
    if (!g) return null;

    if (d.stack > 1) {
      for (let i = 0; i < g.items.length && count > 0; i++) {
        const o = g.items[i];
        if (o.id !== itemId || o.n >= d.stack) continue;
        const can = Math.min(d.stack - o.n, count);
        o.n += can;
        count -= can;
      }
      if (count <= 0) {
        this._weightDirty = true;
        this._emit('stack');
        return null;
      }
    }

    const it = {
      uid: this._uid++,
      id: itemId,
      n: Math.min(count, d.stack ?? 1),
      path,
      x: 0,
      y: 0,
      rot: 0,
      dur: d.dur ?? null,
      uses: d.uses ?? null,
      mods: d.t === 'weapon' ? Object.create(null) : null,
      am: null,
      nm: 0,
      mag: d.magId ?? null,
      heat: 0,
      mode: 0,
      fir: extra?.fir ?? false,
    };
    if (!this.findFree(g, it, this._scratch)) return null;
    it.x = this._scratch.x;
    it.y = this._scratch.y;
    it.rot = this._scratch.rot;

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
    if (count && it.n > count) {
      it.n -= count;
      this._weightDirty = true;
      this._emit('split');
      return;
    }
    const inner = this.grids.get('in:' + uid);
    if (inner) {
      for (let i = inner.items.length - 1; i >= 0; i--) this.remove(inner.items[i].uid);
      this.grids.delete('in:' + uid);
    }
    const g = this.grids.get(it.path);
    if (g) {
      const idx = g.items.indexOf(it);
      if (idx >= 0) {
        this._stamp(g, it, EMPTY);
        g.items.splice(idx, 1);
        for (let i = idx; i < g.items.length; i++) this._stamp(g, g.items[i], i);
      }
    }
    if (it.path.startsWith('slot:')) this.slots.delete(it.path.slice(5));
    for (const [s, u] of this.slots) if (u === uid) this.slots.delete(s);
    this.byUid.delete(uid);
    const a = this.all.indexOf(it);
    if (a >= 0) this.all.splice(a, 1);
    this._weightDirty = true;
    this._emit('remove');
  }

  move(uid, path, x, y, rot) {
    const it = this.byUid.get(uid);
    const dst = this.grids.get(path);
    if (!it || !dst) return false;
    if (path.startsWith('in:')) {
      let hostUid = +path.slice(3);
      let guard = 0;
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
      if (!this.findFree(dst, it, this._scratch)) {
        it.rot = oldRot;
        return false;
      }
      x = this._scratch.x;
      y = this._scratch.y;
      it.rot = this._scratch.rot;
    }
    if (src) {
      const i = src.items.indexOf(it);
      if (i >= 0) {
        this._stamp(src, it, EMPTY);
        src.items.splice(i, 1);
        for (let k = i; k < src.items.length; k++) this._stamp(src, src.items[k], k);
      }
    }
    if (it.path.startsWith('slot:')) this.slots.delete(it.path.slice(5));
    it.path = path;
    it.x = x;
    it.y = y;
    dst.items.push(it);
    this._stamp(dst, it, dst.items.length - 1);
    this._weightDirty = true;
    this._emit('move');
    return true;
  }

  equip(uid, slot) {
    const it = this.byUid.get(uid);
    if (!it) return false;
    const d = this.items.get(it.id);
    if (!d) return false;
    const accept = SLOT_ACCEPT[slot];
    if (accept && !accept.includes(d.t)) return false;
    const cur = this.slotItem(slot);
    if (cur && cur.uid !== uid && !this.unequip(cur.uid)) return false;
    const src = this.grids.get(it.path);
    if (src) {
      const i = src.items.indexOf(it);
      if (i >= 0) {
        this._stamp(src, it, EMPTY);
        src.items.splice(i, 1);
        for (let k = i; k < src.items.length; k++) this._stamp(src, src.items[k], k);
      }
    }
    if (it.path.startsWith('slot:')) this.slots.delete(it.path.slice(5));
    it.path = 'slot:' + slot;
    it.x = 0;
    it.y = 0;
    it.rot = 0;
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
      if (this.move(uid, p)) return true;
    }
    if (this.move(uid, 'stash')) return true;
    return false;
  }

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
    let cur = it;
    let guard = 0;
    while (cur && guard++ < 12) {
      if (cur.path === 'pocket' || cur.path.startsWith('slot:')) return true;
      if (!cur.path.startsWith('in:')) return false;
      cur = this.byUid.get(+cur.path.slice(3));
    }
    return false;
  }

  inStash(it) {
    let cur = it;
    let guard = 0;
    while (cur && guard++ < 12) {
      if (cur.path === 'stash') return true;
      if (!cur.path.startsWith('in:')) return false;
      cur = this.byUid.get(+cur.path.slice(3));
    }
    return false;
  }

  countStash(id) {
    let n = 0;
    for (const it of this.all) if (it.id === id && this.inStash(it)) n += it.n;
    return n;
  }

  takeStash(id, count) {
    let left = count;
    for (let i = this.all.length - 1; i >= 0 && left > 0; i--) {
      const it = this.all[i];
      if (it.id !== id || !this.inStash(it)) continue;
      const take = Math.min(it.n, left);
      left -= take;
      if (it.n > take) it.n -= take;
      else this.remove(it.uid);
    }
    return left <= 0;
  }

  weight() {
    if (!this._weightDirty) return this._weight;
    let kg = 0;
    for (const it of this.all) {
      if (!this.onBody(it)) continue;
      const d = this.items.get(it.id);
      kg += (d?.kg ?? 0) * (d?.stack > 1 ? it.n : 1);
      if (it.mods) for (const s in it.mods) kg += this.items.get(it.mods[s])?.kg ?? 0;
      if (it.nm) kg += it.nm * 0.012;
    }
    this._weight = kg;
    this._weightDirty = false;
    return kg;
  }

  useItem(uid) {
    const health = this.ctx.peek('health');
    const it = this.get(uid);
    if (!health || !it) return 0;
    const d = this.items.get(it.id);
    if (!d || (d.t !== 'med' && d.t !== 'food')) return 0;
    const t = health.use(uid, this.selectedPart);
    if (t > 0) {
      this._useLabel = d.n;
      this._emit('use');
    }
    return t;
  }

  quickHeal() {
    const rec = this._firstConsumable();
    if (!rec) return 0;
    return this.useItem(rec.uid);
  }

  useQuickSlot(index) {
    const uid = this.quick[index];
    if (uid && this.get(uid)) return this.useItem(uid);
    return this.quickHeal();
  }

  _firstConsumable() {
    for (const it of this.all) {
      if (!this.onBody(it)) continue;
      const d = this.items.get(it.id);
      if (d?.t === 'med' || d?.t === 'food') return it;
    }
    return null;
  }

  _seedStarterKit() {
    const add = (id, count, path = 'stash') => this.add(id, count, path);
    const primary = add('m4a1', 1, 'stash');
    const holster = add('pm', 1, 'stash');
    const rig = add('rig_bankrobber', 1, 'stash');
    const backpack = add('backpack_smb', 1, 'stash');
    const secure = add('secure_alpha', 1, 'stash');
    const armor = add('armor_paca', 1, 'stash');
    const helmet = add('helmet_ssh', 1, 'stash');
    if (rig) this.equip(rig.uid, 'rig');
    if (backpack) this.equip(backpack.uid, 'backpack');
    if (secure) this.equip(secure.uid, 'secure');
    if (armor) this.equip(armor.uid, 'armor');
    if (helmet) this.equip(helmet.uid, 'helmet');
    if (primary) this.equip(primary.uid, 'primary');
    if (holster) this.equip(holster.uid, 'holster');
    add('mag_stanag', 1, 'pocket');
    add('556m855', 60, 'pocket');
    add('bandage', 1, 'pocket');
    add('salewa', 1, 'pocket');
    add('splint', 1, 'stash');
    add('water', 1, 'stash');
    add('crackers', 1, 'stash');
    this._rebuildQuick();
  }

  _weaponIdForItem(id) {
    return { ak74n: 'ak74m', glock: 'glock17' }[id] ?? id;
  }

  _syncWeapons() {
    const weapons = this.ctx.peek('weapons');
    if (!weapons || typeof weapons.setWeapon !== 'function') return;
    for (const slot of ['primary', 'secondary', 'holster']) {
      const it = this.slotItem(slot);
      weapons.setWeapon(slot, it ? this._weaponIdForItem(it.id) : null, null);
    }
    const active = this.slotItem(weapons.slot);
    if (!active) {
      for (const slot of ['primary', 'secondary', 'holster']) {
        if (this.slotItem(slot)) {
          weapons.equip(slot);
          break;
        }
      }
    }
  }

  _rebuildQuick() {
    const preferred = ['salewa', 'bandage', 'splint', 'water', 'crackers'];
    this.quick.fill(null);
    let qi = 0;
    for (const id of preferred) {
      const found = this.all.find((it) => this.onBody(it) && it.id === id);
      if (found) this.quick[qi++] = found.uid;
    }
  }

  _emit(reason) {
    this._rebuildQuick();
    this._syncWeapons();
    const payload = { reason, weight: this._weightDirty ? this.weight() : this._weight };
    this.ctx.events.emit('inv:changed', payload);
    this.ctx.events.emit('inventory:changed', payload);
    this.ctx.events.emit('inventory:weight', { kg: payload.weight });
    this._render();
  }

  toggle(force) {
    const open = force == null ? !this.open : !!force;
    if (open) this.show();
    else this.hide();
  }

  /**
   * Открытие панели. Курсор забирается ЯВНО и С УВЕДОМЛЕНИЕМ.
   *
   * Раньше здесь был просто document.exitPointerLock(), и EscapeMenuSystem
   * видел в этом альт-таб, после чего ставил STATE.PAUSED и поднимал
   * полноценное меню паузы поверх инвентаря.
   */
  show() {
    if (this.open || !this.root) return;
    this.open = true;

    this._holdCursor();

    const time = this.ctx.time;
    this._savedScale = time && Number.isFinite(time.scale) ? time.scale : 1;
    if (this._savedScale === 0) this._savedScale = 1;
    if (time) time.scale = 0;

    this.ctx.peek('player')?.setControlEnabled?.(false);
    if (this.ctx.input) this.ctx.input.frozen = true;

    if (typeof document !== 'undefined' && typeof document.exitPointerLock === 'function') {
      try { document.exitPointerLock(); } catch (e) {}
    }

    this.root.classList.add('open');
    this._render();
    this.ctx.events.emit('inventory:toggle', { open: true });
  }

  hide() {
    if (!this.open || !this.root) return;
    this.open = false;

    const time = this.ctx.time;
    if (time) time.scale = Number.isFinite(this._savedScale) && this._savedScale > 0 ? this._savedScale : 1;

    this.ctx.peek('player')?.setControlEnabled?.(true);
    if (this.ctx.input) this.ctx.input.frozen = false;

    this.root.classList.remove('open');
    this._stopDrag();

    /* Захват курсора возвращаем только если бой всё ещё идảт. */
    if (this._canOpen()) this.ctx.input?.requestPointerLock?.();
    this._releaseCursorSoon();

    this.ctx.events.emit('inventory:toggle', { open: false });
  }

  _buildUi() {
    this.root = document.createElement('div');
    this.root.id = 'eftInv';
    this.root.innerHTML =
      '<div class="top">' +
      '<div><div class="title">ESCAPE FROM LARPOV</div><div class="sub">TAB to close · Drag and drop · R while dragging to rotate · Double click to use/equip</div></div>' +
      '<div class="sub" id="inv-close">ESC</div></div>' +
      '<div class="wrap">' +
      '<div class="side">' +
      '<div class="card"><h6>EQUIPMENT</h6><div class="equip" id="inv-equip"></div></div>' +
      '<div class="card"><h6>STATUS</h6><div id="inv-status"></div><div class="hint" id="inv-hint"></div></div>' +
      '</div>' +
      '<div class="main"><div class="main-scroll" id="inv-main"></div></div>' +
      '</div>';
    document.body.appendChild(this.root);
    this.$equip = this.root.querySelector('#inv-equip');
    this.$status = this.root.querySelector('#inv-status');
    this.$hint = this.root.querySelector('#inv-hint');
    this.$main = this.root.querySelector('#inv-main');
  }

  /**
   * Слушатель клавиатуры висит в фазе ПЕРЕХВАТА на window — самое раннее
   * звено во всей цепочке события. Это обязательно для TAB: core/input.js
   * держит swapWeapon = ['Digit1','Digit2','Tab'], и без stopPropagation каждое
   * открытие инвентаря ещё и переключало оружие игрока.
   *
   * Глушим СТРОГО те клавиши, которые реально обработали. Всё остальное
   * уходит дальше нетронутым — в том числе Escape, когда панель закрыта.
   */
  _bindUi() {
    const stop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    };

    const onKey = (e) => {
      if (!e) return;

      /* ---- TAB: исключительная собственность инвентаря ---- */
      if (e.code === 'Tab') {
        if (e.repeat) { stop(e); return; }
        /* Вне рейда TAB нам не принадлежит. Закрыть можно всегда. */
        if (!this.open && !this._canOpen()) return;
        stop(e);
        this.toggle();
        return;
      }

      if (!this.open) return;

      if (e.code === 'Escape') {
        stop(e);
        this.hide();
        return;
      }

      if (e.code === 'KeyR' && this._drag) {
        stop(e);
        this._drag.rot = this._drag.rot ? 0 : 1;
        this._updateGhost();
        return;
      }

      if (e.code === 'Digit4') { stop(e); this.useQuickSlot(0); return; }
      if (e.code === 'Digit5') { stop(e); this.useQuickSlot(1); return; }
      if (e.code === 'Digit6') { stop(e); this.useQuickSlot(2); return; }
    };

    const onMove = (e) => this._onPointerMove(e);
    const onUp = (e) => this._onPointerUp(e);

    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    this._bound.push(['keydown', onKey, true], ['pointermove', onMove, false], ['pointerup', onUp, false]);
  }

  _render() {
    if (!this.root) return;
    this._renderEquip();
    this._renderSummary();
    this._renderGrids();
  }

  _renderEquip() {
    this.$equip.innerHTML = '';
    for (const slot of EQUIP_ORDER) {
      const it = this.slotItem(slot);
      const el = document.createElement('div');
      el.className = 'slot' + (it ? ' fill' : '');
      el.dataset.slot = slot;
      el.innerHTML = `<em>${SLOT_LABEL[slot]}</em><b>${it ? itemName(this.items, it) : 'EMPTY'}</b>`;
      if (it) {
        el.addEventListener('dblclick', () => {
          if (!this.unequip(it.uid)) this.move(it.uid, 'stash');
        });
      }
      this.$equip.appendChild(el);
    }
  }

  _renderSummary() {
    if (!this.$status) return;
    const health = this.ctx.peek('health');
    const selected = this.selectedPart || health?.selectedPart || 'thorax';
    this.$status.innerHTML =
      `<div class="kv"><span>Weight</span><b>${this.weight().toFixed(1)} kg</b></div>` +
      `<div class="kv"><span>Selected limb</span><b>${selected.toUpperCase()}</b></div>` +
      `<div class="kv"><span>Primary</span><b>${this.slotItem('primary') ? itemName(this.items, this.slotItem('primary')) : '—'}</b></div>` +
      `<div class="kv"><span>Sidearm</span><b>${this.slotItem('holster') ? itemName(this.items, this.slotItem('holster')) : '—'}</b></div>`;
    this.$hint.textContent = this._useLabel
      ? `Last used: ${this._useLabel}`
      : 'Left drag: move item. Double click medicine/food to use it on the selected limb from the HP HUD.';
  }

  _renderGrids() {
    this.$main.innerHTML = '';
    this._appendGridCard('pocket', 'POCKETS');
    for (const slot of ['rig', 'backpack', 'secure']) {
      const it = this.slotItem(slot);
      if (it) this._appendGridCard('in:' + it.uid, SLOT_LABEL[slot]);
    }
    this._appendGridCard('stash', 'STASH');
  }

  _appendGridCard(id, title) {
    const g = this.grid(id);
    if (!g) return;
    const card = document.createElement('div');
    card.className = 'card';
    const count = g.items.length;
    card.innerHTML = `<div class="grid-head"><h6>${title}</h6><span>${g.w}x${g.h} · ${count} items</span></div>`;
    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.dataset.grid = id;
    grid.style.width = `${g.w * CELL + 1}px`;
    grid.style.height = `${g.h * CELL + 1}px`;
    grid.style.backgroundSize = `${CELL}px ${CELL}px`;
    for (let i = 0; i < g.items.length; i++) {
      const it = g.items[i];
      const d = this.items.get(it.id);
      const s = sizeFor(this.items, it, it.rot);
      const el = document.createElement('div');
      el.className = `item ${d?.t ?? 'barter'}`;
      if (this._drag?.uid === it.uid) el.classList.add('drag-source');
      el.dataset.uid = String(it.uid);
      el.style.left = `${it.x * CELL}px`;
      el.style.top = `${it.y * CELL}px`;
      el.style.width = `${s.w * CELL - 1}px`;
      el.style.height = `${s.h * CELL - 1}px`;
      el.innerHTML = `<b>${itemName(this.items, it)}</b><i>${it.n > 1 ? it.n : ''}</i>${it.dur != null ? `<div class="dur" style="width:${Math.max(4, Math.round((it.dur / Math.max(1, d.dur || 100)) * 100))}%"></div>` : ''}`;
      el.addEventListener('pointerdown', (e) => this._startDrag(it.uid, e));
      el.addEventListener('dblclick', () => {
        const def = this.items.get(it.id);
        if (def?.t === 'med' || def?.t === 'food') this.useItem(it.uid);
        else {
          const slot = acceptedSlot(def);
          if (slot) this.equip(it.uid, slot);
        }
      });
      grid.appendChild(el);
    }
    card.appendChild(grid);
    this.$main.appendChild(card);
  }

  _startDrag(uid, e) {
    if (!this.open || e.button !== 0) return;
    e.preventDefault();
    const it = this.get(uid);
    if (!it) return;
    this._drag = {
      uid,
      rot: it.rot,
      pointerX: e.clientX,
      pointerY: e.clientY,
    };
    const ghost = document.createElement('div');
    ghost.className = `item ghost ${itemType(this.items, it)}`;
    ghost.innerHTML = `<b>${itemName(this.items, it)}</b><i>${it.n > 1 ? it.n : ''}</i>`;
    document.body.appendChild(ghost);
    this._drag.ghost = ghost;
    this._updateGhost();
    this._render();
  }

  _updateGhost() {
    if (!this._drag?.ghost) return;
    const it = this.get(this._drag.uid);
    if (!it) return;
    const s = sizeFor(this.items, it, this._drag.rot);
    this._drag.ghost.style.width = `${s.w * CELL - 1}px`;
    this._drag.ghost.style.height = `${s.h * CELL - 1}px`;
    this._drag.ghost.style.left = `${this._drag.pointerX + 14}px`;
    this._drag.ghost.style.top = `${this._drag.pointerY + 14}px`;
  }

  _onPointerMove(e) {
    if (!this._drag) return;
    this._drag.pointerX = e.clientX;
    this._drag.pointerY = e.clientY;
    this._updateGhost();
  }

  _onPointerUp(e) {
    if (!this._drag) return;
    const target = this._pickTarget(e.clientX, e.clientY);
    const uid = this._drag.uid;
    const rot = this._drag.rot;
    if (target?.slot) {
      this.equip(uid, target.slot);
    } else if (target?.grid) {
      this.move(uid, target.grid, target.x, target.y, rot);
    }
    this._stopDrag();
    this._render();
  }

  _pickTarget(x, y) {
    let el = document.elementFromPoint(x, y);
    while (el && el !== document.body) {
      if (el.dataset?.slot) return { slot: el.dataset.slot };
      if (el.dataset?.grid) {
        const rect = el.getBoundingClientRect();
        const gx = Math.floor((x - rect.left) / CELL);
        const gy = Math.floor((y - rect.top) / CELL);
        return { grid: el.dataset.grid, x: gx, y: gy };
      }
      el = el.parentElement;
    }
    return null;
  }

  _stopDrag() {
    if (!this._drag) return;
    this._drag.ghost?.remove();
    this._drag = null;
  }

  dispose() {
    this._stopDrag();

    /* Не оставляем мир замороженным и курсор захваченным. */
    if (this.open) {
      this.open = false;
      const time = this.ctx && this.ctx.time;
      if (time) time.scale = Number.isFinite(this._savedScale) && this._savedScale > 0 ? this._savedScale : 1;
      if (this.ctx && this.ctx.input) this.ctx.input.frozen = false;
      const esc = this._escapeMenu();
      if (esc && typeof esc.releaseCursor === 'function') {
        try { esc.releaseCursor('inventory'); } catch (e) {}
      }
    }

    for (const [type, fn, capture] of this._bound) window.removeEventListener(type, fn, !!capture);
    this._bound.length = 0;
    this.byUid.clear();
    this.grids.clear();
    this.slots.clear();
    this.all.length = 0;
    this.root?.remove();
    this.root = null;
  }
}

export default InventorySystem;
