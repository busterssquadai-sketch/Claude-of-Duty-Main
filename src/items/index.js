import { EFL } from '../core/config.js';

/** Словарь поверхностей движка → баллистические свойства EFL.
 *  cost — сколько пробиваемости съедает 1 м материала, ric — шанс рикошета,
 *  ang — минимальный угол встречи, pass — доля урона за преградой. */
export const SURFACE_BALLISTICS = {
  concrete: { cost: 42, ric: 0.06, ang: 14, pass: 0.30 },
  plaster:  { cost: 18, ric: 0.02, ang: 10, pass: 0.62 },
  metal:    { cost: 34, ric: 0.22, ang: 26, pass: 0.45 },
  wood:     { cost: 12, ric: 0.02, ang: 9,  pass: 0.80 },
  glass:    { cost: 4,  ric: 0.01, ang: 6,  pass: 0.95 },
  dirt:     { cost: 48, ric: 0.02, ang: 11, pass: 0.15 },
  sand:     { cost: 52, ric: 0.01, ang: 9,  pass: 0.10 },
  fabric:   { cost: 6,  ric: 0.00, ang: 0,  pass: 0.92 },
  foliage:  { cost: 3,  ric: 0.00, ang: 0,  pass: 0.97 },
  rubber:   { cost: 20, ric: 0.04, ang: 16, pass: 0.55 },
  water:    { cost: 30, ric: 0.10, ang: 8,  pass: 0.35 },
  flesh:    { cost: 8,  ric: 0.00, ang: 0,  pass: 0.75 },
};

const ITEMS = Object.create(null);
const def = (o) => (ITEMS[o.id] = o);

/* ---------- оружие ---------- */
def({ id:'ak74n',  n:'АК-74Н', t:'weapon', cls:'rifle',  w:5,h:2, kg:3.3, px:24000, cal:'545', rpm:650, modes:['single','auto'], ergo:44, vr:139, hr:412, cap:30, spread:0.0034, magId:'mag_ak30' });
def({ id:'aks74u', n:'АКС-74У', t:'weapon', cls:'rifle', w:4,h:2, kg:2.7, px:19500, cal:'545', rpm:700, modes:['single','auto'], ergo:52, vr:141, hr:517, cap:30, spread:0.0042, magId:'mag_ak30' });
def({ id:'rpk16',  n:'РПК-16', t:'weapon', cls:'lmg',   w:6,h:2, kg:4.7, px:56000, cal:'545', rpm:600, modes:['single','auto'], ergo:38, vr:120, hr:390, cap:45, spread:0.0036, magId:'mag_ak45' });
def({ id:'m4a1',   n:'Colt M4A1', t:'weapon', cls:'rifle', w:5,h:2, kg:3.1, px:44000, cal:'556', rpm:800, modes:['single','auto'], ergo:47, vr:126, hr:342, cap:30, spread:0.0030, magId:'mag_stanag' });
def({ id:'mp5',    n:'HK MP5', t:'weapon', cls:'smg',    w:4,h:2, kg:2.6, px:27000, cal:'9x19', rpm:800, modes:['single','auto'], ergo:60, vr:78, hr:230, cap:30, spread:0.0038, magId:'mag_mp5' });
def({ id:'sv98',   n:'СВ-98', t:'weapon', cls:'sniper', w:6,h:2, kg:5.6, px:48000, cal:'762x54', rpm:60, modes:['single'], ergo:30, vr:180, hr:520, cap:10, zoom:4, spread:0.0012 });
def({ id:'mosin',  n:'Мосина (ОЦ-48)', t:'weapon', cls:'sniper', w:6,h:2, kg:4.2, px:21000, cal:'762x54', rpm:50, modes:['single'], ergo:34, vr:196, hr:560, cap:5, zoom:2.6, spread:0.0016 });
def({ id:'m870',   n:'МР-870', t:'weapon', cls:'shotgun', w:5,h:2, kg:3.6, px:23000, cal:'12x70', rpm:75, modes:['single'], ergo:40, vr:220, hr:600, cap:7, pellets:8, spread:0.030 });
def({ id:'pm',     n:'ПМ', t:'weapon', cls:'pistol', w:2,h:1, kg:0.73, px:3500, cal:'9x18', rpm:600, modes:['single'], ergo:75, vr:220, hr:480, cap:8, pistol:1, spread:0.005, magId:'mag_pm' });
def({ id:'glock',  n:'Glock 17', t:'weapon', cls:'pistol', w:2,h:1, kg:0.9, px:13000, cal:'9x19', rpm:700, modes:['single'], ergo:78, vr:200, hr:430, cap:17, pistol:1, spread:0.0048, magId:'mag_glock' });

/* ---------- патроны ---------- */
const A = (id,n,cal,dmg,pen,px,frag,ad) =>
  def({ id,n,t:'ammo',w:1,h:1,kg:0.012,px,cal,dmg,pen,frag,ad,stack:60 });
A('545ps','5.45 ПС','545',40,31,90,0.17,38);      A('545bt','5.45 БТ','545',44,37,140,0.12,42);
A('545bp','5.45 БП','545',44,45,210,0.08,46);     A('545bs','5.45 БС','545',43,51,480,0.05,52);
A('556m855','5.56 M855','556',41,37,120,0.14,40);   A('556m856','5.56 M856','556',43,26,80,0.22,34);
A('556m995','5.56 M995','556',42,53,520,0.05,54);
A('9x19pst','9x19 ПСТ','9x19',54,24,60,0.20,30);  A('9x19ap','9x19 AP 6.3','9x19',52,35,190,0.10,40);
A('9x18pmm','9x18 ПММ','9x18',50,17,40,0.24,24);
A('762x54lps','7.62x54 ЛПС','762x54',81,41,180,0.16,50);
A('762x54snb','7.62x54 СНБ','762x54',80,56,420,0.08,58);
A('12x70buck','12/70 Дробь 8.5','12x70',50,2,110,0.02,12);
A('12x70slug','12/70 Пуля','12x70',167,20,330,0.05,40);

/* ---------- магазины / моды / броня / медицина / бартер ----------
 * Переносится 1-в-1 из 1.html (MG/MOD/def-блоки), сокращено здесь для читаемости. */
const MG = (id,n,cal,cap,px,ergo,w=1,h=2,kg=0.2) => def({ id,n,t:'mag',cal,cap,px,ergo:ergo||0,w,h,kg });
MG('mag_ak30','Магазин АК 5.45 (30)','545',30,2600,0);
MG('mag_ak45','Магазин РПК 5.45 (45)','545',45,9000,-3,1,3,0.5);
MG('mag_stanag','STANAG 5.56 (30)','556',30,5200,0);
MG('mag_mp5','Магазин MP5 (30)','9x19',30,4200,0);
MG('mag_pm','Магазин ПМ (8)','9x18',8,900,2,1,1,0.1);
MG('mag_glock','Магазин Glock (17)','9x19',17,2400,1,1,1,0.14);

const MOD = (o) => def(Object.assign({ t:'mod', w:1, h:1, kg:0.2 }, o));
MOD({ id:'dtk74', n:'ДТК-1 5.45', slot:'muzzle', cal:'545', ergo:-2, vr:-24, hr:-15, px:16000 });
MOD({ id:'sup545', n:'ПБС-1', slot:'muzzle', cal:'545', ergo:-6, vr:-18, hr:-10, sup:1, heat:1.35, px:78000, w:2 });
MOD({ id:'pso1', n:'ПСО-1 4×', slot:'sight', cal:'any', ergo:-7, zoom:4, acc:12, px:34000, w:2 });
MOD({ id:'eotech', n:'EOTech HHS 1.35×', slot:'sight', cal:'any', ergo:-2, zoom:1.35, acc:5, px:41000 });
MOD({ id:'grip_fore', n:'Тактическая рукоятка', slot:'foregrip', cal:'any', ergo:2, vr:-8, hr:-12, px:18000 });
MOD({ id:'stock_zh', n:'Приклад Zhukov-S', slot:'stock', cal:'any', ergo:6, vr:-10, hr:-8, px:29000, w:2 });

export const MOD_SLOTS = [['sight','Прицел'],['muzzle','Дуло / ДТК'],['grip','Рукоятка'],['foregrip','Цевьё'],['stock','Приклад']];

export const SLOTS = [
  ['primary','Основное',['weapon']], ['secondary','Второе',['weapon']],
  ['holster','Кобура',['weapon']],   ['melee','Нож',['melee']],
  ['armor','Бронежилет',['armor']], ['helmet','Шлем',['helmet']],
  ['headset','Гарнитура',['headset']], ['glasses','Очки',['glasses']],
  ['face','Маска',['face']],        ['rig','Разгрузка',['rig']],
  ['backpack','Рюкзак',['backpack']], ['secure','Контейнер',['secure']],
];

const LOOT = {
  crate:  [['bolts',22],['wires',14],['gunpowder',6],['bandage',14],['crackers',12],['water',10],['545ps',12],['milmodule',4],['gpu',1],['rub',16]],
  safe:   [['rub',26],['usd',14],['key_cellar',6],['ledx',2],['gpu',4],['tgdocs',8],['btc',2],['tgcard',2]],
  jacket: [['rub',22],['crackers',14],['bandage',12],['analgin',6],['usd',6],['wires',8]],
  med:    [['bandage',24],['esmarch',14],['splint',12],['ai2',12],['ifak',9],['salewa',6],['grizzly',3],['ledx',1]],
  gun:    [['pm',16],['aks74u',10],['m870',8],['ak74n',7],['mosin',6],['545ps',16],['12x70buck',12],['mag_ak30',10],['dtk74',4]],
  tool:   [['bolts',24],['wires',18],['gunpowder',8],['milmodule',6],['gpu',2],['mag_stanag',5]],
};

export class ItemsSystem {
  static id = 'items';
  static deps = [];

  async init(ctx) {
    this.ctx = ctx;
    this.db = ITEMS;
    this.rate = { rub: 1, usd: 145, eur: 160 };

    // --- struct-of-arrays для баллистики ---
    const ammoIds = Object.keys(ITEMS).filter((k) => ITEMS[k].t === 'ammo');
    const n = ammoIds.length;
    this.ammoIndex = new Map();
    this.ammoId = ammoIds;
    this.aDmg = new Float32Array(n);
    this.aPen = new Float32Array(n);
    this.aFrag = new Float32Array(n);
    this.aArmor = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const d = ITEMS[ammoIds[i]];
      this.ammoIndex.set(ammoIds[i], i);
      this.aDmg[i] = d.dmg; this.aPen[i] = d.pen; this.aFrag[i] = d.frag; this.aArmor[i] = d.ad;
    }

    // калибр → патроны, отсортированные по пробитию (боты берут лучшее доступное)
    this.byCaliber = Object.create(null);
    for (const id of ammoIds) (this.byCaliber[ITEMS[id].cal] ??= []).push(id);
    for (const c in this.byCaliber) this.byCaliber[c].sort((a, b) => ITEMS[a].pen - ITEMS[b].pen);

    // предвычисленные кумулятивные веса таблиц лута — выборка за O(log n) без аллокаций
    this.loot = Object.create(null);
    for (const kind in LOOT) {
      const rows = LOOT[kind];
      const ids = new Array(rows.length);
      const cum = new Float32Array(rows.length);
      let acc = 0;
      for (let i = 0; i < rows.length; i++) { ids[i] = rows[i][0]; acc += rows[i][1]; cum[i] = acc; }
      this.loot[kind] = { ids, cum, total: acc };
    }

    // баллистика поверхностей в том же порядке, что physics.surfaceId
    this.surfaceKeys = Object.keys(SURFACE_BALLISTICS);
    this.sCost = new Float32Array(this.surfaceKeys.length);
    this.sRic = new Float32Array(this.surfaceKeys.length);
    this.sAng = new Float32Array(this.surfaceKeys.length);
    this.sPass = new Float32Array(this.surfaceKeys.length);
    this.surfaceIndex = new Map();
    this.surfaceKeys.forEach((k, i) => {
      const s = SURFACE_BALLISTICS[k];
      this.surfaceIndex.set(k, i);
      this.sCost[i] = s.cost; this.sRic[i] = s.ric; this.sAng[i] = s.ang; this.sPass[i] = s.pass;
    });

    this._rng = ctx.rng.fork('items');
  }

  /* ---------- чтение ---------- */
  get(id) { return ITEMS[id]; }
  ammoSlot(id) { const i = this.ammoIndex.get(id); return i === undefined ? -1 : i; }
  surfaceSlot(name) { const i = this.surfaceIndex.get(name); return i === undefined ? 0 : i; }
  price(id) { return ITEMS[id]?.px ?? 0; }
  size(id, rot) { const d = ITEMS[id]; return rot ? { w: d.h, h: d.w } : { w: d.w, h: d.h }; }
  ammoForCaliber(cal) { return this.byCaliber[cal] ?? null; }

  /* ---------- генерация лута — только через переданный rng ---------- */
  rollTable(kind, rng) {
    const t = this.loot[kind] ?? this.loot.crate;
    const r = rng.float() * t.total;
    let lo = 0, hi = t.cum.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (t.cum[m] < r) lo = m + 1; else hi = m; }
    return t.ids[lo];
  }

  /** Заполняет переданный массив парами [id, count] — вызывающий владеет памятью. */
  fillBag(out, kind, rng, mult = 1) {
    out.length = 0;
    let n = 1 + (rng.float() < 0.55 ? 1 : 0) + (rng.float() < 0.3 ? 1 : 0);
    n = Math.max(1, Math.round(n * mult));
    for (let i = 0; i < n; i++) {
      const id = this.rollTable(kind, rng);
      out.push(id, this.amountFor(id, rng));
    }
    return out;
  }

  amountFor(id, rng) {
    if (id === 'rub') return rng.int(8000, 60000);
    if (id === 'usd') return rng.int(60, 400);
    const d = ITEMS[id];
    if (d.t === 'ammo') return rng.int(10, 45);
    if (d.stack > 1) return rng.int(1, d.stack);
    return 1;
  }

  dispose() { this.ammoIndex?.clear(); this.surfaceIndex?.clear(); }
}