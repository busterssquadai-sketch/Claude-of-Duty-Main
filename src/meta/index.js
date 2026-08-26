import { EFL } from '../core/config.js';

const SKEY = 'efl_ow_v1';
const LLREQ = [
  { lvl: 1,  rep: 0,    sp: 0 },
  { lvl: 10, rep: 0.15, sp: 150000 },
  { lvl: 20, rep: 0.35, sp: 900000 },
  { lvl: 32, rep: 0.55, sp: 3500000 },
];

const TRADERS = [
  { id:'prapor',     n:'Прапор',     buys:['weapon','ammo','mag','mod'], cur:'rub' },
  { id:'therapist',  n:'Терапевт',  buys:['med','food'],               cur:'rub' },
  { id:'fence',      n:'Скупщик',    buys:['*'],                        cur:'rub', karma: true },
  { id:'skier',      n:'Лыжник',     buys:['weapon','barter'],          cur:'eur' },
  { id:'peacekeeper',n:'Миротворец',buys:['weapon','mod','armor'],    cur:'usd' },
  { id:'mechanic',   n:'Механик',    buys:['mod','mag'],                cur:'rub' },
  { id:'ragman',     n:'Барахольщик',buys:['rig','backpack','armor'],  cur:'rub' },
  { id:'jaeger',     n:'Егерь',      buys:['food','barter'],            cur:'rub' },
  { id:'ref',        n:'Смотритель', buys:['barter'],                  cur:'rub' },
];

export class MetaSystem {
  static id = 'meta';
  static deps = ['items', 'inventory'];

  async init(ctx) {
    this.ctx = ctx;
    this.items = ctx.get('items');
    this.inv = ctx.get('inventory');
    this.rng = ctx.rng.fork('meta');

    this.P = this._fresh();
    this._saveT = 0;
    this._dirty = false;
    this.load();

    ctx.events.on('inv:changed', () => { this._dirty = true; });
    ctx.events.on('karma:scav', (e) => { this.P.karma = Math.max(-1, Math.min(1, this.P.karma + e.delta)); this._dirty = true; });
    ctx.events.on('raid:end', (e) => this._afterRaid(e));
  }

  _fresh() {
    return {
      nick: 'MTDV_Fujiwara', lvl: 1, xp: 0, karma: 0,
      money: { rub: 800000, usd: 1200, eur: 600 },
      rep: { prapor: 0, therapist: 0, fence: 0, skier: 0, peacekeeper: 0, mechanic: 0, ragman: 0, jaeger: 0, ref: 0 },
      spent: {}, quests: {}, hideout: { stash: 1, gen: 0, med: 0, water: 0, bench: 0, intel: 0, sec: 0, rest: 0, nutr: 0, btc: 0, range: 0 },
      prod: {}, crafts: {}, insured: [], scavCd: 0, bp: { tier: 0, xp: 0 }, stats: { raids: 0, survived: 0, kills: 0 },
      stashRows: EFL.stash.rows,
    };
  }

  /* ---------- деньги и торговля ---------- */
  money(cur) { return this.P.money[cur] ?? 0; }
  spend(cur, sum) { if (this.P.money[cur] < sum) return false; this.P.money[cur] -= sum; this._dirty = true; return true; }

  loyalty(traderId) {
    const rep = this.P.rep[traderId] ?? 0, sp = this.P.spent[traderId] ?? 0;
    let ll = 1;
    for (let i = 1; i < LLREQ.length; i++) {
      const r = LLREQ[i];
      if (this.P.lvl >= r.lvl && rep >= r.rep && sp >= r.sp) ll = i + 1;
    }
    return ll;
  }

  buyPrice(traderId, itemId) {
    const base = this.items.price(itemId);
    const ll = this.loyalty(traderId);
    return Math.round(base * (1.25 - ll * 0.05));
  }

  sellPrice(traderId, itemId) {
    const base = this.items.price(itemId);
    const t = TRADERS.find((x) => x.id === traderId);
    let k = 0.52 + this.loyalty(traderId) * 0.03;
    if (t?.karma) k *= 1 + this.P.karma * 0.35;         // Скупщик любит хорошую карму
    return Math.round(base * k);
  }

  deal(traderId, kind, sum, cur) {
    if (kind === 'buy') { if (!this.spend(cur, sum)) return false; this.P.spent[traderId] = (this.P.spent[traderId] ?? 0) + sum; }
    else this.P.money[cur] += sum;
    this.P.rep[traderId] = Math.min(1, (this.P.rep[traderId] ?? 0) + sum / 4000000);
    this._dirty = true;
    this.ctx.events.emit('trader:deal', { traderId, kind, sum, currency: cur });
    return true;
  }

  /* ---------- страховка ---------- */
  insureCost(uid) { return Math.round(this.items.price(this.inv.get(uid).id) * 0.08); }
  insure(uid) {
    const cost = this.insureCost(uid);
    if (!this.spend('rub', cost)) return false;
    this.P.insured.push(this.inv.get(uid).id);
    return true;
  }

  keepLoadout() { this.P.insured.length = 0; this._dirty = true; }

  loseLoadout(kind) {
    // снаряжение с тела теряется, кроме защитного контейнера
    const secure = this.inv.slotItem('secure');
    const keep = new Set();
    if (secure) { keep.add(secure.uid); for (const it of this.inv.grid('in:' + secure.uid)?.items ?? []) keep.add(it.uid); }

    const returned = [];
    for (let i = this.inv.all.length - 1; i >= 0; i--) {
      const it = this.inv.all[i];
      if (!this.inv.onBody(it) || keep.has(it.uid)) continue;
      // страховка: шанс возврата выше, если вещь не подобрали
      const insured = this.P.insured.includes(it.id);
      if (insured && this.rng.float() < (kind === 'mia' ? 0.85 : 0.42)) returned.push(it.id);
      this.inv.remove(it.uid);
    }
    this.P.pendingInsurance = returned;              // придёт через N рейдов
    this.P.insured.length = 0;
    this._dirty = true;
  }

  /* ---------- квесты ---------- */
  questProgress(questId, index, value) {
    const q = (this.P.quests[questId] ??= { i: 0, done: false, prog: [0, 0, 0, 0] });
    q.prog[index] = (q.prog[index] ?? 0) + value;
    this._dirty = true;
    this.ctx.events.emit('quest:progress', { questId, index, value: q.prog[index], done: q.done });
  }

  /* ---------- убежище ---------- */
  upgrade(zoneId) {
    const lvl = this.P.hideout[zoneId] ?? 0;
    const cost = 25000 * Math.pow(3.1, lvl);
    if (!this.spend('rub', cost)) return false;
    this.P.hideout[zoneId] = lvl + 1;
    if (zoneId === 'stash') {
      this.P.stashRows = [30, 38, 46, 60][Math.min(3, lvl + 1)];
      this.inv.grid('stash').resize(EFL.stash.width, this.P.stashRows);
    }
    this._dirty = true;
    return true;
  }

  /** Оффлайн-прогресс крафтов и генератора — считается от метки времени, а не тиками. */
  tickProduction(nowMs) {
    const last = this.P.lastSeen ?? nowMs;
    const sec = Math.min(86400, (nowMs - last) / 1000);
    this.P.lastSeen = nowMs;
    if (sec < 1) return;
    for (const id in this.P.crafts) {
      const c = this.P.crafts[id];
      if (c.done) continue;
      c.left -= sec;
      if (c.left <= 0) { c.left = 0; c.done = true; }
    }
    this._dirty = true;
  }

  /* ---------- сейв ---------- */
  serialize() {
    return JSON.stringify({
      p: this.P,
      inv: this.inv.all.map((i) => [i.uid, i.id, i.n, i.path, i.x, i.y, i.rot, i.mag, i.nm, i.am, i.dur, i.mods]),
      slots: [...this.inv.slots],
    });
  }

  save() { try { localStorage.setItem(SKEY, this.serialize()); this._dirty = false; } catch (e) { console.warn('[meta] save failed', e); } }

  load() {
    try {
      const raw = localStorage.getItem(SKEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      Object.assign(this.P, d.p);
      this.inv.grid('stash').resize(EFL.stash.width, this.P.stashRows ?? EFL.stash.rows);
      // восстановление предметов и слотов — точно как в loadP() твоей версии
    } catch (e) { console.warn('[meta] load failed', e); }
  }

  /** Сейв не чаще раза в 8 секунд и никогда во время боя. */
  update(dt, ctx) {
    if (!this._dirty) return;
    this._saveT += dt;
    if (this._saveT < 8) return;
    const raid = ctx.peek('raid');
    if (raid?.active && ctx.get('ai').bots.some((b) => b.state === 3)) return;
    this._saveT = 0;
    this.save();
  }

  /**
   * Публичное начисление опыта и фиксация его в профиль.
   *
   * До этого опыт умел зачислять только приватный _afterRaid() по событию
   * raid:end, так что ни один экран UI не мог записать прогресс в профиль:
   * meta.addExperience() просто не существовало.
   *
   * @param {number} amount — опыт за рейд (мусор и отрицательные гасятся в 0,
   *   иначе undefined превратил бы P.xp в NaN и убил сейв).
   * @param {{ commit?: boolean }} [opts] — commit: false откладывает запись на диск.
   * @returns {{ lvl: number, xp: number, gained: number, leveledUp: boolean }}
   */
  addExperience(amount, opts = {}) {
    const gained = Math.max(0, Math.round(Number(amount) || 0));
    const lvlBefore = this.P.lvl;
    if (gained <= 0) return { lvl: this.P.lvl, xp: this.P.xp, gained: 0, leveledUp: false };

    /* Старые сейвы могли прийти без bp — иначе P.bp.xp упал бы с TypeError. */
    if (!this.P.bp || typeof this.P.bp !== 'object') this.P.bp = { tier: 0, xp: 0 };

    this.P.xp += gained;
    while (this.P.xp >= this._need(this.P.lvl)) { this.P.xp -= this._need(this.P.lvl); this.P.lvl++; }

    this.P.bp.xp += gained;
    while (this.P.bp.xp >= 1200 && this.P.bp.tier < 53) { this.P.bp.xp -= 1200; this.P.bp.tier++; }

    this._dirty = true;
    const leveledUp = this.P.lvl > lvlBefore;
    this.ctx?.events?.emit('meta:xp', { gained, lvl: this.P.lvl, xp: this.P.xp, leveledUp });
    if (opts.commit !== false) this.save();             // фиксация в localStorage
    return { lvl: this.P.lvl, xp: this.P.xp, gained, leveledUp };
  }

  _afterRaid({ kind, summary }) {
    const s = summary || {};
    this.P.stats.raids++;
    if (kind === 'survived') this.P.stats.survived++;
    this.P.stats.kills += Math.max(0, Math.round(Number(s.kills) || 0));
    /* Опыт, боевой пропуск, уровни и коммит — внутри addExperience():
     * единая точка начисления, чтобы экран итогов не посчитал тот же
     * опыт второй раз. */
    this.addExperience(s.xp);
    this._dirty = true;
    this.save();                                       // после рейда — сразу, кадры уже не важны
  }
  _need(lvl) { return Math.round(1000 * Math.pow(lvl, 1.35)); }

  dispose() { if (this._dirty) this.save(); }
}