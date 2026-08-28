import { EFL } from '../core/config.js';
import { STATE } from '../core/engine.js';

const EMPTY = 0xffff;
const CELL = 34;

/** Build stamp in the footer, matching the reference client. */
const BUILD_VERSION = '1.1.0.1.46911';

/** Display carry ceiling from the reference build ("26.8KG/89"). */
const WEIGHT_LIMIT = 89;

/** Quick-access row: 1..9 then 0, exactly as the reference hotbar. */
const QUICK_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const QUICK_SIZE = QUICK_KEYS.length;

/**
 * The two contexts the panel can render in.
 *
 * RAID is the in-match TAB view: equipment, pockets, rig, backpack, secure
 * container, hotbar. No stash, ever — the hideout is unreachable from a match.
 *
 * CHARACTER is the out-of-raid «ПЕРСОНАЖ» screen: the same left pane plus the
 * global stash on the right half.
 */
const VIEW = { RAID: 'raid', CHARACTER: 'character' };

/**
 * PMC doll. `area` is the named CSS grid area used by the left pane, which
 * reproduces the reference three-column geometry: three small sockets down the
 * outer columns, head and body armour stacked in the middle (БРОНЯ spanning two
 * rows), then two full-width weapon rails each paired with a small socket.
 *
 * Slot ids mirror `SLOTS` in items/index.js. Captions live here because they are
 * presentation, not data.
 */
const EQUIP_SLOTS = [
  { id: 'headset', label: 'УШИ', accept: ['headset'], area: 'ears', size: 'sm' },
  { id: 'helmet', label: 'ГОЛОВА', accept: ['helmet'], area: 'head', size: 'md' },
  { id: 'face', label: 'ЛИЦО', accept: ['face'], area: 'face', size: 'sm' },
  { id: 'armband', label: 'ПОВЯЗКА', accept: ['armband'], area: 'band', size: 'sm' },
  { id: 'armor', label: 'БРОНЯ', accept: ['armor'], area: 'armor', size: 'tall' },
  { id: 'glasses', label: 'ГЛАЗА', accept: ['glasses'], area: 'eyes', size: 'sm' },
  { id: 'dogtag', label: 'ЖЕТОН', accept: ['dogtag'], area: 'tag', size: 'sm' },
  { id: 'primary', label: 'НА РЕМНЕ', accept: ['weapon'], area: 'sling', size: 'wide' },
  { id: 'holster', label: 'КОБУРА', accept: ['weapon'], area: 'holster', size: 'sm' },
  { id: 'secondary', label: 'НА СПИНЕ', accept: ['weapon'], area: 'back', size: 'wide' },
  { id: 'melee', label: 'НОЖНЫ', accept: ['melee'], area: 'sheath', size: 'sm' },
];

/** Sockets that carry their own grid. Rendered as cards in the middle pane. */
const CONTAINER_SLOTS = [
  { id: 'rig', label: 'РАЗГРУЗКА', accept: ['rig'] },
  { id: 'backpack', label: 'РЮКЗАК', accept: ['backpack'] },
  { id: 'secure', label: 'ПОДСУМОК', accept: ['secure'] },
];

const ALL_SLOTS = EQUIP_SLOTS.concat(CONTAINER_SLOTS);

/** Order used when resolving "which socket does this item belong in". */
const EQUIP_ORDER = ALL_SLOTS.map((s) => s.id);

const SLOT_LABEL = Object.create(null);
const SLOT_ACCEPT = Object.create(null);
for (const s of ALL_SLOTS) {
  SLOT_LABEL[s.id] = s.label;
  SLOT_ACCEPT[s.id] = s.accept;
}

/** Tab strip. `on` marks which view owns the tab; the rest are other screens. */
const TABS = [
  { id: 'character', label: 'ПЕРСОНАЖ', view: VIEW.CHARACTER },
  { id: 'common', label: 'ОБЩЕЕ' },
  { id: 'gear', label: 'ВЕЩИ', view: VIEW.RAID },
  { id: 'health', label: 'ЗДОРОВЬЕ' },
  { id: 'skills', label: 'УМЕНИЯ' },
  { id: 'map', label: 'КАРТА' },
  { id: 'quests', label: 'ЗАДАНИЯ' },
  { id: 'achievements', label: 'ДОСТИЖЕНИЯ' },
];

const CSS = `
#eftInv{position:fixed;inset:0;z-index:9400;display:none;color:#d7dbd3;font:12px/1.35 "Oswald","Segoe UI",sans-serif;letter-spacing:.05em;user-select:none}
#eftInv.open{display:block}
#eftInv *{box-sizing:border-box}

/* The root is transparent on purpose: backdrop-filter samples what is BEHIND
 * the element, so an opaque root would leave the blur nothing to work with. */
#eftInv .inv-scrim{position:absolute;inset:0;backdrop-filter:blur(15px) saturate(.6);-webkit-backdrop-filter:blur(15px) saturate(.6);background:rgba(9,11,12,.62)}
#eftInv .inv-vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(118% 88% at 50% 42%,rgba(0,0,0,0) 34%,rgba(0,0,0,.55) 78%,rgba(0,0,0,.86) 100%)}

#eftInv .inv-shell{position:absolute;inset:0;display:flex;flex-direction:column;min-height:0}

#eftInv .inv-top{display:flex;align-items:center;gap:18px;padding:12px 22px 10px;border-bottom:1px solid rgba(199,161,90,.22);background:linear-gradient(180deg,rgba(18,21,22,.72),rgba(18,21,22,0))}
#eftInv .inv-tabs{display:flex;align-items:center;gap:2px;flex:1 1 auto;min-width:0;overflow:hidden}
#eftInv .inv-tab{padding:7px 15px;font-size:12px;letter-spacing:.16em;color:#7f877f;background:transparent;border:0;border-bottom:2px solid transparent;cursor:pointer;white-space:nowrap;font-family:inherit}
#eftInv .inv-tab.on{color:#e8dcc0;border-bottom-color:#c8a15a;background:rgba(200,161,90,.07)}
#eftInv .inv-tab.off{color:#4e544e;cursor:not-allowed}
#eftInv .inv-wallet{display:flex;gap:16px;font:12px/1 "Consolas",monospace;letter-spacing:.06em;color:#cdd2c8;white-space:nowrap}
#eftInv .inv-wallet b{color:#e8dcc0;font-weight:400}
#eftInv .inv-back{padding:7px 18px;font-size:12px;letter-spacing:.18em;color:#cdd2c8;background:rgba(30,35,36,.8);border:1px solid #3d4446;cursor:pointer;font-family:inherit}
#eftInv .inv-back:hover{border-color:#c8a15a;color:#e8dcc0}

#eftInv .inv-body{flex:1 1 auto;min-height:0;display:grid;gap:14px;padding:14px 18px}
#eftInv.view-raid .inv-body{grid-template-columns:344px minmax(0,1fr)}
#eftInv.view-character .inv-body{grid-template-columns:344px minmax(0,420px) minmax(0,1fr)}
#eftInv.view-raid .inv-pane-stash{display:none}

#eftInv .inv-pane{display:flex;flex-direction:column;gap:12px;min-height:0;min-width:0}
#eftInv .inv-pane-mid,#eftInv .inv-pane-stash{min-width:0}
#eftInv .card{background:linear-gradient(160deg,rgba(20,24,26,.92),rgba(11,13,14,.86));border:1px solid #2a3033;box-shadow:0 14px 32px rgba(0,0,0,.45);padding:10px}
#eftInv h6{margin:0 0 8px;font-size:10px;letter-spacing:.24em;color:#c8a15a;font-weight:400}
#eftInv .scroll{overflow:auto;min-height:0;flex:1 1 auto;padding-right:4px}
#eftInv .scroll::-webkit-scrollbar{width:8px}
#eftInv .scroll::-webkit-scrollbar-thumb{background:#333a3c}

/* ---- PMC doll: three columns, БРОНЯ spans two rows ---- */
#eftInv .doll{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;
  grid-template-areas:
    "ears  head  face"
    "band  armor eyes"
    "tag   armor ."
    "sling sling holster"
    "back  back  sheath"}
#eftInv .slot{position:relative;display:flex;align-items:flex-end;border:1px dashed #3a4143;background:rgba(20,24,26,.72);padding:16px 6px 6px;cursor:pointer;min-height:56px;overflow:hidden}
#eftInv .slot.md{min-height:70px}
#eftInv .slot.tall{min-height:118px}
#eftInv .slot.fill{border-style:solid;border-color:#58625e;background:rgba(26,31,33,.92);cursor:grab}
#eftInv .slot.hot{outline:2px solid #c8a15a;outline-offset:-2px}
#eftInv .slot.target-ok{outline:2px solid #8fc06a;outline-offset:-2px}
#eftInv .slot.target-bad{outline:2px solid #d95c46;outline-offset:-2px}
#eftInv .slot em{position:absolute;left:6px;top:4px;font-style:normal;font-size:8px;letter-spacing:.14em;color:#6c746f}
#eftInv .slot b{font:11px/1.15 "Consolas",monospace;color:#dfe5db;font-weight:400;word-break:break-word}
#eftInv .slot i{position:absolute;right:6px;top:4px;font-style:normal;font:9px/1 "Consolas",monospace;color:#8fc06a}
#eftInv .slot.empty b{color:#4e544e}

/* ---- vitals strip ---- */
#eftInv .vitals{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
#eftInv .vital{display:flex;flex-direction:column;gap:3px}
#eftInv .vital span{font-size:9px;letter-spacing:.18em;color:#78807a}
#eftInv .vital b{font:15px/1 "Consolas",monospace;font-weight:400;color:#e6ebe1;font-variant-numeric:tabular-nums}
#eftInv .vital b.warn{color:#e2a114}
#eftInv .vital b.over{color:#e2544a}

/* ---- grids ---- */
#eftInv .grid-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;gap:10px}
#eftInv .grid-head span{font:9px/1 "Consolas",monospace;color:#6f776f;white-space:nowrap}
#eftInv .grid{position:relative;background:rgba(18,22,23,.85);border:1px solid #2d3436;background-image:linear-gradient(to right,rgba(49,58,60,.75) 1px,transparent 1px),linear-gradient(to bottom,rgba(49,58,60,.75) 1px,transparent 1px)}
#eftInv .item{position:absolute;border:1px solid rgba(0,0,0,.75);box-shadow:inset 0 0 0 1px rgba(255,255,255,.05),0 4px 12px rgba(0,0,0,.45);padding:2px 4px;display:flex;flex-direction:column;justify-content:space-between;cursor:grab;overflow:hidden}
#eftInv .item.drag-source{opacity:.3}
#eftInv .item.dim{opacity:.16}
#eftInv .item b{font:10px/1.08 "Consolas",monospace;color:#edf0ea;font-weight:400;pointer-events:none;word-break:break-word}
#eftInv .item i{font-style:normal;font:9px/1 "Consolas",monospace;color:#d8ddd3;align-self:flex-end;pointer-events:none}
#eftInv .item.med{background:linear-gradient(145deg,#4d6d4e,#273629)}
#eftInv .item.food{background:linear-gradient(145deg,#705d38,#3e3321)}
#eftInv .item.weapon{background:linear-gradient(145deg,#6b6858,#2e2f2b)}
#eftInv .item.melee{background:linear-gradient(145deg,#5e6167,#2b2d31)}
#eftInv .item.mag{background:linear-gradient(145deg,#4d5457,#262a2b)}
#eftInv .item.ammo{background:linear-gradient(145deg,#5a5348,#2c2924)}
#eftInv .item.mod{background:linear-gradient(145deg,#67524a,#302722)}
#eftInv .item.armor,#eftInv .item.helmet,#eftInv .item.rig,#eftInv .item.backpack,#eftInv .item.secure,#eftInv .item.headset,#eftInv .item.glasses,#eftInv .item.face,#eftInv .item.armband,#eftInv .item.dogtag{background:linear-gradient(145deg,#48545a,#242b2f)}
#eftInv .item.barter{background:linear-gradient(145deg,#6a5533,#34291b)}
#eftInv .item .dur{position:absolute;left:0;right:0;bottom:0;height:2px;background:#8fc06a}
#eftInv .grid.target-ok{outline:2px solid #8fc06a;outline-offset:-1px}
#eftInv .grid.target-bad{outline:2px solid #d95c46;outline-offset:-1px}

/* ---- БЫСТРЫЙ ДОСТУП ---- */
#eftInv .hotbar{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:5px}
#eftInv .hot{position:relative;min-height:44px;border:1px solid #333a3c;background:rgba(18,22,23,.9);padding:12px 3px 3px;cursor:pointer;overflow:hidden}
#eftInv .hot em{position:absolute;left:4px;top:3px;font-style:normal;font:9px/1 "Consolas",monospace;color:#c8a15a}
#eftInv .hot b{font:9px/1.05 "Consolas",monospace;font-weight:400;color:#cdd2c8;word-break:break-word}
#eftInv .hot.empty b{color:#454b45}
#eftInv .hot.target-ok{outline:2px solid #8fc06a;outline-offset:-2px}
#eftInv .hot.pin{border-color:#5d6a5a}

/* ---- stash pane ---- */
#eftInv .stash-tools{display:flex;align-items:center;gap:8px;margin-bottom:10px}
#eftInv .stash-search{flex:1 1 auto;min-width:0;background:rgba(12,15,16,.92);border:1px solid #343b3d;color:#dfe5db;padding:6px 9px;font:11px/1.2 "Consolas",monospace;letter-spacing:.06em}
#eftInv .stash-search:focus{outline:none;border-color:#c8a15a}
#eftInv .stash-btn{padding:6px 13px;font-size:10px;letter-spacing:.16em;color:#cdd2c8;background:rgba(30,35,36,.9);border:1px solid #3d4446;cursor:pointer;white-space:nowrap;font-family:inherit}
#eftInv .stash-btn:hover{border-color:#c8a15a;color:#e8dcc0}
#eftInv .stash-body{display:flex;gap:10px;min-height:0;flex:1 1 auto}
#eftInv .stash-rail{display:flex;flex-direction:column;gap:3px;flex:0 0 auto}
#eftInv .rail-btn{width:30px;height:30px;border:1px solid #333a3c;background:rgba(18,22,23,.9);color:#7f877f;font:9px/1 "Consolas",monospace;cursor:pointer;font-family:inherit}
#eftInv .rail-btn.on{border-color:#c8a15a;color:#e8dcc0;background:rgba(200,161,90,.1)}

#eftInv .inv-foot{display:flex;justify-content:space-between;align-items:center;padding:7px 22px 9px;border-top:1px solid rgba(255,255,255,.06);font:9px/1 "Consolas",monospace;letter-spacing:.12em;color:#5f665f}
#eftInv .inv-hint{color:#6f776f}

#eftInv .ghost{position:fixed;pointer-events:none;z-index:9500;opacity:.95}
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

/* No regex: split/join keeps this readable and avoids escaping traps. */
function esc(s) {
  return String(s)
    .split('&')
    .join('&amp;')
    .split('<')
    .join('&lt;')
    .split('>')
    .join('&gt;')
    .split('"')
    .join('&quot;');
}

/** 42778605 -> "42 778 605", the reference client's thousands grouping. */
function grp(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  const s = String(v);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ' ';
    out += s[i];
  }
  return out;
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

/** Text entry inside the panel must keep its native behaviour. */
function isEditable(node) {
  if (!node || node.nodeType !== 1) return false;
  const tag = node.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable === true;
}

export class InventorySystem {
  static id = 'inventory';
  static deps = ['items'];

  _scratch = { x: 0, y: 0, rot: 0 };
  _bodyPaths = ['pocket', '', '', ''];

  async init(ctx) {
    this.ctx = ctx;
    this.items = ctx.get('items');
    this.byUid = new Map();
    this.grids = new Map();
    this.slots = new Map();
    this.all = [];
    this.quick = new Array(QUICK_SIZE).fill(null);
    this.quickPinned = new Array(QUICK_SIZE).fill(null);
    this._uid = 1;
    this._weight = 0;
    this._weightDirty = true;
    this._rng = ctx.rng.fork('inventory');
    this.open = false;
    this.view = VIEW.RAID;
    this.selectedPart = 'thorax';
    this._drag = null;
    this._useLabel = '';
    this._filter = '';
    this._typeFilter = null;
    this._bound = [];
    this._sealed = [];
    this._savedScale = 1;
    this._scaleOwned = false;
    this._controlOwned = false;

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
      this._renderVitals();
    });
    this.ctx.events.on('health:heal', () => this._render());

    /* Leaving a match closes the panel: otherwise it hangs over the raid results
     * and leaves time.scale pinned at zero forever. */
    this.ctx.events.on('raid:end', () => this.hide());
    this.ctx.events.on('state', (e) => {
      if (!e || !e.to || !this.open) return;
      const raidish = e.to === STATE.GAMEPLAY || e.to === STATE.PAUSED;
      /* The raid view needs an active match; the character view needs the
       * out-of-raid shell, because it carries the stash. */
      if (this.view === VIEW.RAID && e.to !== STATE.GAMEPLAY) this.hide();
      else if (this.view === VIEW.CHARACTER && raidish) this.hide();
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

  /* ------------------------------------------------ engine state / cursor */

  _engineState() {
    const engine = this.ctx && this.ctx.engine ? this.ctx.engine : null;
    if (engine && typeof engine.state === 'string') return engine.state;
    /* Engine.setState() mirrors the state into data-game-state — fallback for
     * dev harnesses where ctx.engine is not threaded through. */
    if (typeof document !== 'undefined' && document.documentElement) {
      return document.documentElement.getAttribute('data-game-state');
    }
    return null;
  }

  /**
   * True while a match is live or paused. THE guard for defect 2: the global
   * stash may never be reachable from inside a raid.
   */
  _isRaidContext() {
    const s = this._engineState();
    return s === STATE.GAMEPLAY || s === STATE.PAUSED;
  }

  /* TAB belongs to the inventory only in a live match. In the menu, on the
   * loading screen, in pause and on the results screen the key is not ours and
   * passes through untouched. */
  _canOpenRaid() {
    return this._engineState() === STATE.GAMEPLAY;
  }

  /** The character screen carries the stash, so it is out-of-raid only. */
  _canOpenCharacter() {
    const s = this._engineState();
    if (s === STATE.GAMEPLAY || s === STATE.PAUSED) return false;
    return s === STATE.MENU || s === STATE.BOOT || s === STATE.LOADING || s == null;
  }

  /** Legacy alias kept for callers that only ask "can the panel open at all". */
  _canOpen() {
    return this._canOpenRaid() || this._canOpenCharacter();
  }

  /* EscapeMenuSystem lives on UiSystem, not in the registry. Fetch it lazily and
   * without a dep: the inventory must work with no UI at all. */
  _escapeMenu() {
    const ui = this.ctx && typeof this.ctx.peek === 'function' ? this.ctx.peek('ui') : null;
    return ui && ui.escapeMenu ? ui.escapeMenu : null;
  }

  _holdCursor() {
    const esc2 = this._escapeMenu();
    if (esc2 && typeof esc2.holdCursor === 'function') {
      try {
        esc2.holdCursor('inventory');
      } catch (e) {}
    }
  }

  /* Release two frames later: the pointer-lock-loss heuristic in escapeMenu
   * re-checks itself after one rAF, and dropping the claim early would reopen
   * the pause menu. */
  _releaseCursorSoon() {
    const esc2 = this._escapeMenu();
    if (!esc2 || typeof esc2.releaseCursor !== 'function') return;
    const drop = () => {
      try {
        esc2.releaseCursor('inventory');
      } catch (e) {}
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(drop));
    } else {
      setTimeout(drop, 32);
    }
  }

  /** Weapon inspection pose, installed by weapons/inspectBridge.js. */
  _setWeaponInspect(on) {
    const weapons = this.ctx && typeof this.ctx.peek === 'function' ? this.ctx.peek('weapons') : null;
    if (!weapons) return;
    try {
      if (typeof weapons.setInventoryInspect === 'function') weapons.setInventoryInspect(!!on);
      else if (weapons.viewmodel && typeof weapons.viewmodel.setInspect === 'function') {
        weapons.viewmodel.setInspect(!!on);
      }
    } catch (e) {
      /* the bridge is optional — never let a cosmetic pose break the panel */
    }
  }

  /* ------------------------------------------------------------ grid model */

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
    for (let i = 0; i < QUICK_SIZE; i++) if (this.quickPinned[i] === uid) this.quickPinned[i] = null;
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
    /* Nothing may be moved into the stash from inside a raid, and nothing may be
     * pulled out of it either — the hideout does not exist during a match. */
    if (path === 'stash' && this._isRaidContext()) return false;
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
    /* Only out of raid does the stash exist as an overflow destination. */
    if (!this._isRaidContext() && this.move(uid, 'stash')) return true;
    return false;
  }

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

  /**
   * «СОРТ. СТОЛ» — repack the stash largest-first, then by type, then by name, so
   * fragmentation from a raid's worth of loot collapses into a solid block.
   */
  sortStash() {
    const g = this.grid('stash');
    if (!g || this._isRaidContext()) return false;
    const list = g.items.slice();
    list.sort((a, b) => {
      const da = this.items.get(a.id);
      const db = this.items.get(b.id);
      const areaA = (da?.w ?? 1) * (da?.h ?? 1);
      const areaB = (db?.w ?? 1) * (db?.h ?? 1);
      if (areaB !== areaA) return areaB - areaA;
      const ta = da?.t ?? '';
      const tb = db?.t ?? '';
      if (ta !== tb) return ta < tb ? -1 : 1;
      const na = da?.n ?? a.id;
      const nb = db?.n ?? b.id;
      return na < nb ? -1 : na > nb ? 1 : 0;
    });
    g.clear();
    for (const it of list) {
      it.rot = 0;
      if (this.findFree(g, it, this._scratch)) {
        it.x = this._scratch.x;
        it.y = this._scratch.y;
        it.rot = this._scratch.rot;
      } else {
        /* Cannot happen for a set that already fitted, but never drop an item. */
        it.x = 0;
        it.y = 0;
      }
      g.items.push(it);
      this._stamp(g, it, g.items.length - 1);
    }
    this._weightDirty = true;
    this._emit('sort');
    return true;
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
    if (index < 0 || index >= QUICK_SIZE) return 0;
    const uid = this.quick[index];
    if (uid && this.get(uid)) return this.useItem(uid);
    return this.quickHeal();
  }

  /** Drag-to-pin: an explicit assignment survives auto-fill. */
  assignQuick(index, uid) {
    if (index < 0 || index >= QUICK_SIZE) return false;
    const it = this.get(uid);
    if (!it || !this.onBody(it)) return false;
    for (let i = 0; i < QUICK_SIZE; i++) if (this.quickPinned[i] === uid) this.quickPinned[i] = null;
    this.quickPinned[index] = uid;
    this._emit('quick');
    return true;
  }

  clearQuick(index) {
    if (index < 0 || index >= QUICK_SIZE) return false;
    if (this.quickPinned[index] == null) return false;
    this.quickPinned[index] = null;
    this._emit('quick');
    return true;
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

    const helmet = add('helmet_ronin', 1);
    const headset = add('headset_proflex', 1);
    const armband = add('armband_obereg', 1);
    const dogtag = add('dogtag_usec', 1);
    const glasses = add('glasses_crossbow', 1);
    const melee = add('melee_m2', 1);
    const armor = add('armor_paca', 1);
    const rig = add('rig_fcpc', 1);
    const backpack = add('backpack_beta2', 1);
    const secure = add('secure_epsilon', 1);
    const primary = add('mp7a2', 1);
    const holster = add('glock', 1);

    /* Containers first: equipping them creates the grids the rest lands in. */
    if (rig) this.equip(rig.uid, 'rig');
    if (backpack) this.equip(backpack.uid, 'backpack');
    if (secure) this.equip(secure.uid, 'secure');
    if (armor) this.equip(armor.uid, 'armor');
    if (helmet) this.equip(helmet.uid, 'helmet');
    if (headset) this.equip(headset.uid, 'headset');
    if (armband) this.equip(armband.uid, 'armband');
    if (dogtag) this.equip(dogtag.uid, 'dogtag');
    if (glasses) this.equip(glasses.uid, 'glasses');
    if (melee) this.equip(melee.uid, 'melee');
    if (primary) this.equip(primary.uid, 'primary');
    if (holster) this.equip(holster.uid, 'holster');

    /* КАРМАНЫ — four sockets, as in the reference. */
    add('ifak', 1, 'pocket');
    add('salewa', 1, 'pocket');
    add('bandage', 1, 'pocket');
    add('calokb', 1, 'pocket');

    const rigItem = this.slotItem('rig');
    if (rigItem) {
      const p = 'in:' + rigItem.uid;
      add('mag_mp7', 3, p);
      add('9x19pst', 60, p);
    }
    const bagItem = this.slotItem('backpack');
    if (bagItem) {
      const p = 'in:' + bagItem.uid;
      add('afak', 1, p);
      add('splint', 1, p);
      add('water', 1, p);
      add('crackers', 1, p);
    }
    const secItem = this.slotItem('secure');
    if (secItem) {
      const p = 'in:' + secItem.uid;
      add('tgdocs', 1, p);
      add('analgin', 2, p);
    }

    /* Stash seed. `rub` caps at 500000 per stack and add() only tops up stacks
     * that already exist, so the balance is built from whole stacks and the
     * on-screen counter reports the real total rather than a hard-coded one. */
    for (let i = 0; i < 4; i++) add('rub', 500000);
    add('usd', 7252);
    add('eur', 3608);
    add('m4a1', 1);
    add('ak74n', 1);
    add('mag_stanag', 2);
    add('556m855', 60);
    add('545ps', 60);
    add('helmet_ssh', 1);
    add('rig_bankrobber', 1);
    add('backpack_smb', 1);
    add('headset_comtac', 1);
    add('face_shroud', 1);
    add('ledx', 1);
    add('gpu', 1);
    add('bolts', 4);
    add('wires', 4);

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

  /**
   * Pinned assignments win; the remaining sockets auto-fill from carried
   * consumables. The old build wiped the whole row on every change, so a manual
   * assignment could never survive picking anything up.
   */
  _rebuildQuick() {
    this.quick.fill(null);
    const taken = new Set();

    for (let i = 0; i < QUICK_SIZE; i++) {
      const uid = this.quickPinned[i];
      if (uid == null) continue;
      const it = this.get(uid);
      if (!it || !this.onBody(it)) {
        this.quickPinned[i] = null;
        continue;
      }
      this.quick[i] = uid;
      taken.add(uid);
    }

    const preferred = ['ifak', 'afak', 'salewa', 'bandage', 'calokb', 'splint', 'analgin', 'water', 'crackers'];
    let qi = 0;
    for (const id of preferred) {
      while (qi < QUICK_SIZE && this.quick[qi] != null) qi++;
      if (qi >= QUICK_SIZE) break;
      const found = this.all.find((it) => it.id === id && this.onBody(it) && !taken.has(it.uid));
      if (found) {
        this.quick[qi] = found.uid;
        taken.add(found.uid);
      }
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

  /* ------------------------------------------------------------ open / close */

  /** TAB: the raid panel in a match, the character screen out of one. */
  toggle(force) {
    const wantOpen = force == null ? !this.open : !!force;
    if (!wantOpen) {
      this.hide();
      return false;
    }
    return this._isRaidContext() ? this.openRaid() : this.openCharacter();
  }

  openRaid() {
    if (!this._canOpenRaid()) return false;
    return this._open(VIEW.RAID);
  }

  openCharacter() {
    if (!this._canOpenCharacter()) return false;
    return this._open(VIEW.CHARACTER);
  }

  /** Back-compat: show() with no argument picks the view from engine state. */
  show(view) {
    if (view === VIEW.CHARACTER) return this.openCharacter();
    if (view === VIEW.RAID) return this.openRaid();
    return this._isRaidContext() ? this.openRaid() : this.openCharacter();
  }

  /**
   * The cursor is taken EXPLICITLY and WITH NOTICE.
   *
   * Two separate claims are filed, because they solve two separate problems:
   *   - escapeMenu.holdCursor() stops the ESC menu reading the lock loss as an
   *     alt-tab and raising a pause screen over the panel;
   *   - input.suppressPointerLock() stops core/input.js re-acquiring the lock on
   *     the next mousedown, which is what broke item dragging.
   */
  _open(view) {
    if (!this.root) return false;

    if (this.open) {
      if (this.view === view) return true;
      /* Switching views live (ПЕРСОНАЖ <-> ВЕЩИ). */
      this.view = view;
      this._applyViewClass();
      this._render();
      return true;
    }

    this.open = true;
    this.view = view;
    const raid = view === VIEW.RAID;

    this._holdCursor();

    /* Freeze the world only in a match. Zeroing time.scale in the main menu
     * would stall the menu's own animated backdrop. */
    if (raid) {
      const time = this.ctx.time;
      this._savedScale = time && Number.isFinite(time.scale) ? time.scale : 1;
      if (this._savedScale === 0) this._savedScale = 1;
      if (time) {
        time.scale = 0;
        this._scaleOwned = true;
      }
      const player = this.ctx.peek('player');
      if (player && typeof player.setControlEnabled === 'function') {
        player.setControlEnabled(false);
        this._controlOwned = true;
      }
      this._setWeaponInspect(true);
    }

    if (this.ctx.input) {
      this.ctx.input.frozen = true;
      if (typeof this.ctx.input.suppressPointerLock === 'function') {
        this.ctx.input.suppressPointerLock('inventory');
      }
    }

    if (typeof document !== 'undefined' && typeof document.exitPointerLock === 'function') {
      try {
        document.exitPointerLock();
      } catch (e) {}
    }

    this.root.classList.add('open');
    this._applyViewClass();
    this._render();
    this.ctx.events.emit('inventory:toggle', { open: true, view });
    return true;
  }

  hide() {
    if (!this.open || !this.root) return false;
    this.open = false;
    const wasRaid = this.view === VIEW.RAID;

    if (this._scaleOwned) {
      const time = this.ctx.time;
      if (time) {
        time.scale = Number.isFinite(this._savedScale) && this._savedScale > 0 ? this._savedScale : 1;
      }
      this._scaleOwned = false;
    }
    if (this._controlOwned) {
      this.ctx.peek('player')?.setControlEnabled?.(true);
      this._controlOwned = false;
    }
    if (wasRaid) this._setWeaponInspect(false);

    if (this.ctx.input) {
      this.ctx.input.frozen = false;
      /* Release BEFORE re-requesting, or requestPointerLock() no-ops itself. */
      if (typeof this.ctx.input.allowPointerLock === 'function') {
        this.ctx.input.allowPointerLock('inventory');
      }
    }

    this.root.classList.remove('open');
    this._stopDrag();

    /* Recapture the cursor only if the match is still running. */
    if (this._canOpenRaid()) this.ctx.input?.requestPointerLock?.();
    this._releaseCursorSoon();

    this.ctx.events.emit('inventory:toggle', { open: false, view: this.view });
    return true;
  }

  _applyViewClass() {
    if (!this.root) return;
    this.root.classList.toggle('view-raid', this.view === VIEW.RAID);
    this.root.classList.toggle('view-character', this.view === VIEW.CHARACTER);
  }

  /* ------------------------------------------------------------------- DOM */

  _buildUi() {
    this.root = document.createElement('div');
    this.root.id = 'eftInv';
    /* Marks this subtree as a cursor-owning overlay for core/input.js. */
    this.root.setAttribute('data-efl-overlay', 'inventory');
    this.root.innerHTML =
      '<div class="inv-scrim"></div>' +
      '<div class="inv-vig"></div>' +
      '<div class="inv-shell">' +
      '<div class="inv-top">' +
      '<div class="inv-tabs" id="inv-tabs"></div>' +
      '<div class="inv-wallet" id="inv-wallet"></div>' +
      '<button type="button" class="inv-back" id="inv-back">НАЗАД</button>' +
      '</div>' +
      '<div class="inv-body">' +
      '<div class="inv-pane inv-pane-left">' +
      '<div class="card"><div class="doll" id="inv-doll"></div></div>' +
      '<div class="card"><div class="vitals" id="inv-vitals"></div></div>' +
      '</div>' +
      '<div class="inv-pane inv-pane-mid">' +
      '<div class="scroll" id="inv-containers"></div>' +
      '<div class="card"><h6>БЫСТРЫЙ ДОСТУП</h6><div class="hotbar" id="inv-hotbar"></div></div>' +
      '</div>' +
      '<div class="inv-pane inv-pane-stash">' +
      '<div class="card" style="display:flex;flex-direction:column;min-height:0;flex:1 1 auto">' +
      '<div class="stash-tools">' +
      '<h6 style="margin:0">СХРОН</h6>' +
      '<input class="stash-search" id="inv-search" type="text" placeholder="ПОИСК" autocomplete="off" spellcheck="false" />' +
      '<button type="button" class="stash-btn" id="inv-sort">СОРТ. СТОЛ</button>' +
      '</div>' +
      '<div class="stash-body">' +
      '<div class="stash-rail" id="inv-rail"></div>' +
      '<div class="scroll" id="inv-stash"></div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="inv-foot">' +
      '<span class="inv-hint" id="inv-hint"></span>' +
      '<span id="inv-build"></span>' +
      '</div>' +
      '</div>';
    document.body.appendChild(this.root);

    this.$tabs = this.root.querySelector('#inv-tabs');
    this.$wallet = this.root.querySelector('#inv-wallet');
    this.$back = this.root.querySelector('#inv-back');
    this.$doll = this.root.querySelector('#inv-doll');
    this.$vitals = this.root.querySelector('#inv-vitals');
    this.$containers = this.root.querySelector('#inv-containers');
    this.$hotbar = this.root.querySelector('#inv-hotbar');
    this.$stash = this.root.querySelector('#inv-stash');
    this.$rail = this.root.querySelector('#inv-rail');
    this.$search = this.root.querySelector('#inv-search');
    this.$sort = this.root.querySelector('#inv-sort');
    this.$hint = this.root.querySelector('#inv-hint');
    this.$build = this.root.querySelector('#inv-build');

    this._applyViewClass();
    this._sealOverlay();

    this.$back.addEventListener('click', () => this.hide());
    this.$sort.addEventListener('click', () => this.sortStash());
    this.$search.addEventListener('input', () => {
      this._filter = String(this.$search.value || '').trim().toLowerCase();
      this._renderStash();
    });
  }

  /**
   * MOUSE LOCK ISOLATION, layer 2 of 3.
   *
   * A bubble-phase seal on the overlay root. Every pointer/mouse/click/wheel
   * event that reaches the root without having been handled stops here and never
   * reaches the window listeners in core/input.js.
   *
   * Bubble phase, NOT capture: a capture-phase stopImmediatePropagation() on the
   * root would fire before the target and kill the panel's own item handlers
   * before they ever ran. By the time an event bubbles back up to the root, the
   * item handlers have had their turn.
   *
   * The drag move/up listeners are bound on window in the CAPTURE phase for the
   * same reason, mirrored: they must run before this seal can swallow them, or a
   * drop would never complete.
   */
  _sealOverlay() {
    const seal = (e, blockDefault) => {
      if (blockDefault && e.cancelable && !isEditable(e.target)) e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    };

    /* preventDefault on these would eat focus for the search box; isEditable()
     * inside seal() already exempts it, so the flag is safe here. */
    const withDefault = ['pointerdown', 'mousedown', 'contextmenu', 'dragstart', 'selectstart'];
    /* Never preventDefault: wheel must still scroll the stash, and click/keyup
     * must still reach the panel's own buttons and inputs. */
    const passthroughDefault = ['pointerup', 'mouseup', 'click', 'dblclick', 'wheel', 'auxclick'];

    for (const type of withDefault) {
      const f