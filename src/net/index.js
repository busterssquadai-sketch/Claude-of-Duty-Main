export class NetSystem {
  static id = 'net';
  static deps = ['raid', 'inventory', 'health', 'ai', 'world'];

  async init(ctx) {
    this.ctx = ctx;
    this.role = 'off';                 // 'off' | 'host' | 'guest'
    this.peers = new Map();
    this.ghosts = new Map();           // id → аватар (меш из пула world)
    this.tickRate = 20;                // Гц снапшотов
    this._acc = 0;
    this._buf = new Float32Array(16);  // один буфер на все пакеты состояния
    this._view = new DataView(this._buf.buffer);
  }

  /* Хост — авторитет по ботам, луту, дверям и урону. Гости шлют только ввод и выстрелы. */
  async host(mapId, faction, night) {
    this.role = 'host';
    this.seed = this.ctx.rng.uint32();
    await this.ctx.get('raid').start(mapId, faction, night);
    return this._makeOffer();          // base64-код для друга, как в 1.2.html
  }

  /** Снапшот бинарный, а не JSON: 20 Гц × 24 бота в JSON — это мусорка и гарбаж-паузы. */
  _packSnapshot(out) {
    const bots = this.ctx.get('ai').bots;
    let o = 0;
    this._view.setUint16(o, bots.length, true); o += 2;
    for (let i = 0; i < bots.length; i++) {
      const b = bots[i];
      this._view.setUint16(o, i, true); o += 2;
      this._view.setInt16(o, b.root.position.x * 64, true); o += 2;
      this._view.setInt16(o, b.root.position.y * 64, true); o += 2;
      this._view.setInt16(o, b.root.position.z * 64, true); o += 2;
      this._view.setUint8(o++, b.state | (b.alive ? 128 : 0));
    }
    return o;
  }

  update(dt, ctx) {
    if (this.role === 'off') return;
    this._acc += dt;
    if (this._acc < 1 / this.tickRate) { this._interpolateGhosts(dt); return; }
    this._acc = 0;
    if (this.role === 'host') this._broadcast(this._packSnapshot());
    else this._sendInput();
    this._interpolateGhosts(dt);
  }

  dispose() {
    for (const p of this.peers.values()) p.close();
    this.peers.clear();
    for (const g of this.ghosts.values()) this.ctx.get('world').recycleGhost(g);
    this.ghosts.clear();
  }
}