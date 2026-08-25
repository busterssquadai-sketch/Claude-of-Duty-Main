import * as THREE from 'three';
import { EFL } from '../core/config.js';

export const FACTION = { SCAV: 0, RAIDER: 1, PMC: 2, BOSS: 3 };

const DEF = [
  { id: 'scav',   hp: 240, acc: 0.42, react: 0.62, view: 62,  fov: 105, wep: ['pm','m870','aks74u','mosin'],  xp: 120, karma: -0.03 },
  { id: 'raider', hp: 420, acc: 0.74, react: 0.28, view: 95,  fov: 125, wep: ['ak74n','m4a1','rpk16'],        xp: 480, karma: +0.02 },
  { id: 'pmc',    hp: 380, acc: 0.68, react: 0.34, view: 88,  fov: 120, wep: ['m4a1','ak74n','mp5'],          xp: 560, karma: 0 },
  { id: 'boss',   hp: 780, acc: 0.86, react: 0.20, view: 110, fov: 140, wep: ['rpk16','sv98'],                xp: 1500, karma: 0 },
];

const S_IDLE = 0, S_PATROL = 1, S_ALERT = 2, S_COMBAT = 3, S_COVER = 4, S_HEAL = 5, S_DEAD = 6;

export class AiSystem {
  static id = 'ai';
  static deps = ['world', 'physics', 'items', 'health', 'fx', 'audio', 'materials'];

  async init(ctx) {
    this.ctx = ctx;
    this.world = ctx.get('world');
    this.physics = ctx.get('physics');
    this.items = ctx.get('items');
    this.playerHealth = ctx.get('health');
    this.audio = ctx.get('audio');
    this.rng = ctx.rng.fork('ai');

    this.bots = [];
    this.actors = this.bots;
    this.free = [];                      // пул выведенных из игры ботов
    this.cursor = 0;                     // курсор тайм-слайсинга
    this.pathQueue = [];                 // кольцевая очередь запросов пути
    this.scavKarmaHostile = false;       // стал ли игрок-Дикий врагом для Диких
    this.playerFaction = FACTION.PMC;
    this._botSeq = 1;
    this._botBodyGeo = new THREE.CylinderGeometry(0.34, 0.39, 1.52, 8, 1);
    this._botHeadGeo = new THREE.SphereGeometry(0.21, 8, 6);
    this._botMat = new THREE.MeshStandardMaterial({ color: 0x6c7862, roughness: 0.96, metalness: 0.02 });

    // преаллокация
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._eye = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._los = { hit: false, distance: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), surface: 0, actor: null, partIndex: -1 };

    ctx.events.on('weapon:fire', this._onFire = (e) => this.hearNoise(e.origin, e.suppressed ? 22 : 85));
    ctx.events.on('explosion', this._onBoom = (e) => this.hearNoise(e.position, 140));
    ctx.events.on('raid:start', this._onRaid = (e) => this.spawnWave(e));
    ctx.events.on('raid:end', this._onEnd = () => this.clear());
  }

  /* ---------- спавн ---------- */
  spawnWave({ faction, mapId, night }) {
    this.playerFaction = faction === 'scav' ? FACTION.SCAV : FACTION.PMC;
    this.scavKarmaHostile = false;
    const zones = this.world.spawnZones('bot');
    const budget = Math.min(EFL.budgets.bots, zones.length);
    for (let i = 0; i < budget; i++) {
      const r = this.rng.float();
      const kind = r < 0.68 ? FACTION.SCAV : r < 0.88 ? FACTION.RAIDER : r < 0.98 ? FACTION.PMC : FACTION.BOSS;
      this.spawn(kind, zones[i], night);
    }
  }

  spawn(kind, at, night) {
    const d = DEF[kind];
    const bot = this.free.pop() ?? this._createBot();
    bot.kind = kind;
    bot.hp = d.hp;
    bot.state = S_PATROL;
    bot.alive = true;
    bot.target = null;
    bot.suspicion = 0;
    bot.path = [];
    bot.pathI = 0;
    bot.pathPending = false;
    bot.coverPoint = null;
    bot.burst = 0;
    bot.aimT = 0; bot.fireT = 0; bot.thinkT = 0; bot.lastSeen = -99;
    bot.wepId = d.wep[this.rng.int(0, d.wep.length - 1)];
    bot.ammoIdx = this.items.ammoSlot(this._pickAmmo(bot.wepId));
    bot.mag = this.items.get(bot.wepId).cap;
    bot.view = d.view * (night ? 0.45 : 1);
    bot.root.position.copy(at);
    const gy = this.physics.groundHeight(bot.root.position.x, bot.root.position.z, bot.root.position.y + 6, this.physics.MASK_WORLD ?? 1);
    if (Number.isFinite(gy)) bot.root.position.y = gy;
    bot.noiseAt.copy(bot.root.position);
    bot.lastPos.copy(bot.root.position);
    bot.yaw = 0;
    bot.root.visible = true;
    this.world.addActor(bot);              // в BVH как MASK_ACTOR
    this._syncBot(bot);
    this.bots.push(bot);
    return bot;
  }

  _createBot() {
    const root = new THREE.Group();
    root.name = `bot:${this._botSeq}`;
    root.visible = false;
    const body = new THREE.Mesh(this._botBodyGeo, this._botMat);
    body.position.y = 0.78;
    body.castShadow = true;
    body.receiveShadow = true;
    const head = new THREE.Mesh(this._botHeadGeo, this._botMat);
    head.position.y = 1.6;
    head.castShadow = true;
    head.receiveShadow = true;
    root.add(body);
    root.add(head);

    const collider = this.physics.addCollider({
      shape: 'capsule',
      layer: this.physics.LAYER.ACTOR,
      surface: 'flesh',
      owner: null,
      part: 'torso',
      radius: 0.33,
      damageScale: 1,
      enabled: false,
    });

    const bot = {
      id: this._botSeq++,
      root,
      body,
      head,
      collider,
      kind: FACTION.SCAV,
      hp: 0,
      state: S_IDLE,
      alive: false,
      target: null,
      yaw: 0,
      aimT: 0,
      fireT: 0,
      thinkT: 0,
      lastSeen: -99,
      suspicion: 0,
      ammoIdx: 0,
      mag: 0,
      view: 0,
      burst: 0,
      path: [],
      pathI: 0,
      pathPending: false,
      coverPoint: null,
      noiseAt: new THREE.Vector3(),
      lastPos: new THREE.Vector3(),
    };
    collider.owner = bot;
    root.userData.bot = bot;
    return bot;
  }

  _syncBot(bot) {
    if (!bot || !bot.root) return;
    bot.root.rotation.y = bot.yaw || 0;
    if (bot.collider) {
      const p = bot.root.position;
      bot.collider.enabled = bot.alive;
      bot.collider.setSegment(p.x, p.y + 0.11, p.z, p.x, p.y + 1.62, p.z);
    }
  }

  _faceTo(bot, targetPos, dt, rate) {
    const p = bot.root.position;
    const desired = Math.atan2(targetPos.x - p.x, targetPos.z - p.z);
    let dy = desired - bot.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const turn = Math.max(0.001, rate || 1) * dt;
    bot.yaw += Math.max(-turn, Math.min(turn, dy));
    this._syncBot(bot);
  }

  _moveTo(bot, dest, dt, speed) {
    if (!dest || !bot || !bot.root) return false;
    const p = bot.root.position;
    const dx = dest.x - p.x;
    const dz = dest.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.08) {
      p.x = dest.x;
      p.z = dest.z;
      const gy = this.physics.groundHeight(p.x, p.z, p.y + 4, this.physics.MASK_WORLD ?? 1);
      if (Number.isFinite(gy)) p.y = gy;
      this._syncBot(bot);
      return true;
    }
    const step = Math.min(dist, Math.max(0.1, speed || 1) * dt * 5);
    p.x += (dx / dist) * step;
    p.z += (dz / dist) * step;
    const gy = this.physics.groundHeight(p.x, p.z, p.y + 4, this.physics.MASK_WORLD ?? 1);
    if (Number.isFinite(gy)) p.y = gy;
    bot.yaw = Math.atan2(dx, dz);
    this._syncBot(bot);
    return dist <= step + 0.001;
  }

  _followPath(bot, dt, speed) {
    if (!bot.path || bot.pathI >= bot.path.length) {
      bot.path = [];
      bot.pathI = 0;
      bot.pathPending = false;
      return false;
    }
    const wp = bot.path[bot.pathI];
    if (!wp) {
      bot.path = [];
      bot.pathI = 0;
      bot.pathPending = false;
      return false;
    }
    if (this._moveTo(bot, wp, dt, speed)) {
      bot.pathI++;
      if (bot.pathI >= bot.path.length) {
        bot.path = [];
        bot.pathI = 0;
        bot.pathPending = false;
      }
    }
    return true;
  }

  _animate(bot, dt) {
    this._syncBot(bot);
  }

  _pickAmmo(wepId) {
    const list = this.items.ammoForCaliber(this.items.get(wepId).cal);
    return list[Math.min(list.length - 1, this.rng.int(0, list.length - 1))];
  }

  /* ---------- враждебность: точно как в EFL ---------- */
  hostileToPlayer(bot) {
    if (this.playerFaction === FACTION.SCAV) {
      if (bot.kind === FACTION.SCAV) return this.scavKarmaHostile;   // своих не трогают
      return true;                                                   // рейдеры/ЧВК/боссы — всегда
    }
    return true;
  }
  hostileBots(a, b) {
    if (a.kind === b.kind) return false;
    if (a.kind === FACTION.SCAV && b.kind === FACTION.BOSS) return false;   // босс и его свита
    return true;
  }

  /** Игрок-Дикий убил Дикого — вся карта становится враждебной. */
  angerScavs(reason) {
    if (this.scavKarmaHostile) return;
    this.scavKarmaHostile = true;
    for (const b of this.bots) if (b.kind === FACTION.SCAV && b.state < S_ALERT) b.state = S_ALERT;
    this.ctx.events.emit('karma:scav', { delta: -0.15, reason });
  }

  /* ---------- восприятие ---------- */
  hearNoise(pos, loudness) {
    for (let i = 0; i < this.bots.length; i++) {
      const b = this.bots[i];
      if (!b.alive) continue;
      const dist = b.root.position.distanceTo(pos);
      if (dist > loudness) continue;
      // стены глушат: один дешёвый луч на бота, а не полный рейкаст
      const clear = this.physics.lineOfSight(b.root.position, pos);
      if (!clear && dist > loudness * 0.45) continue;
      b.suspicion = Math.min(1, b.suspicion + (1 - dist / loudness) * 0.8);
      b.noiseAt.copy(pos);
      if (b.state < S_ALERT) b.state = S_ALERT;
    }
  }

  _perceive(bot, playerPos, dt) {
    const d = DEF[bot.kind];
    this._eye.copy(bot.root.position).y += 1.6;
    this._v.subVectors(playerPos, this._eye);
    const dist = this._v.length();
    if (dist > bot.view) { bot.seesPlayer = false; return; }

    this._v.divideScalar(dist);
    bot.root.getWorldDirection(this._v2);
    const cos = this._v.dot(this._v2);
    if (cos < Math.cos((d.fov * 0.5) * 0.01745)) { bot.seesPlayer = false; return; }

    bot.seesPlayer = this.physics.lineOfSight(this._eye, playerPos);
    if (bot.seesPlayer) {
      bot.lastSeen = this.ctx.time.elapsed;
      bot.lastPos.copy(playerPos);
      if (bot.state < S_COMBAT && this.hostileToPlayer(bot)) {
        bot.state = S_COMBAT;
        bot.aimT = d.react * (0.7 + this.rng.float() * 0.6);
      }
    }
  }

  /* ---------- бой ---------- */
  _combat(bot, playerPos, dt) {
    const d = DEF[bot.kind];
    bot.aimT -= dt;
    if (!bot.seesPlayer) {
      if (this.ctx.time.elapsed - bot.lastSeen > 4.5) { bot.state = S_ALERT; return; }
      this._moveTo(bot, bot.lastPos, dt, 1);
      return;
    }

    this._faceTo(bot, playerPos, dt, 7.5);
    const dist = bot.root.position.distanceTo(playerPos);

    // тактика: держать дистанцию, уходить в укрытие на перезарядке
    if (bot.mag <= 0) { bot.state = S_COVER; bot.reloadT = 3.2; return; }
    if (dist > 34 && bot.kind !== FACTION.SCAV) this._moveTo(bot, playerPos, dt, 0.8);
    else if (dist < 8) this._strafe(bot, dt);

    if (bot.aimT > 0) return;
    bot.fireT -= dt;
    if (bot.fireT > 0) return;

    // стрельба очередями через ту же баллистику, что и у игрока
    const wep = this.items.get(bot.wepId);
    const skill = d.acc * (1 - Math.min(0.5, dist / 160));
    const spread = wep.spread * (2.2 - skill * 1.6);
    this._target.copy(playerPos);
    this._target.x += (this.rng.float() * 2 - 1) * spread * dist;
    this._target.y += (this.rng.float() * 2 - 1) * spread * dist + 0.9;
    this._target.z += (this.rng.float() * 2 - 1) * spread * dist;
    this._v.subVectors(this._target, this._eye).normalize();

    this.physics.penetrate(this._eye, this._v, bot.ammoIdx, bot);
    this.ctx.events.emit('weapon:fire', { weapon: bot.wepId, origin: this._eye, dir: this._v, seed: this.rng.uint32(), bot: true });
    bot.mag--;
    bot.burst = bot.burst > 0 ? bot.burst - 1 : this.rng.int(2, 5);
    bot.fireT = bot.burst > 0 ? 60 / wep.rpm : 0.35 + this.rng.float() * 0.9;
  }

  /* ---------- шаг модели поведения ---------- */
  _think(bot, playerPos, dt) {
    switch (bot.state) {
      case S_PATROL:
        if (!bot.path || bot.pathI >= bot.path.length) this._requestPath(bot, this.world.randomPatrolPoint(this.rng));
        this._followPath(bot, dt, 0.55);
        break;
      case S_ALERT:
        this._moveTo(bot, bot.noiseAt, dt, 0.85);
        if (bot.root.position.distanceToSquared(bot.noiseAt) < 4) { bot.suspicion *= 0.5; if (bot.suspicion < 0.2) bot.state = S_PATROL; }
        break;
      case S_COMBAT: this._combat(bot, playerPos, dt); break;
      case S_COVER:
        bot.reloadT -= dt;
        if (!bot.coverPoint) bot.coverPoint = this.world.findCover(bot.root.position, playerPos, this.rng);
        if (bot.coverPoint) this._moveTo(bot, bot.coverPoint, dt, 1.2);
        if (bot.reloadT <= 0) { bot.mag = this.items.get(bot.wepId).cap; bot.coverPoint = null; bot.state = S_COMBAT; }
        break;
    }
  }

  /* ---------- тайм-слайсинг: тяжёлое только для N ботов в кадр ---------- */
  update(dt, ctx) {
    const n = this.bots.length;
    if (!n) return;
    const player = ctx.get('player');
    const ppos = player.position;
    const slice = Math.min(EFL.budgets.botsUpdatedPerFrame, n);

    for (let k = 0; k < slice; k++) {
      const bot = this.bots[(this.cursor + k) % n];
      if (!bot.alive) continue;
      // восприятие и поиск укрытий — редкие, дорогие операции
      this._perceive(bot, ppos, dt * n / slice);
    }
    this.cursor = (this.cursor + slice) % n;

    // лёгкая часть — для всех каждый кадр (движение, анимация, таймеры)
    for (let i = 0; i < n; i++) {
      const bot = this.bots[i];
      if (!bot.alive) continue;
      const far = bot.root.position.distanceToSquared(ppos) > 6400;   // >80 м
      bot.root.userData.owNoShadow = far;                             // далёкие не льют тени
      if (far && bot.state < S_COMBAT) continue;                      // далёкие патрули замирают
      this._think(bot, ppos, dt);
      this._animate(bot, dt);
    }

    // очередь путей: не больше 2 A* в кадр
    let budget = EFL.budgets.pathRequestsPerFrame;
    while (budget-- > 0 && this.pathQueue.length) {
      const req = this.pathQueue.shift();
      if (!req.bot.alive) continue;
      req.bot.path = this.world.findPath(req.bot.root.position, req.to);
      req.bot.pathI = 0;
      req.bot.pathPending = false;
    }
  }

  _requestPath(bot, to) {
    if (bot.pathPending) return;
    bot.pathPending = true;
    this.pathQueue.push({ bot, to });
  }

  /* ---------- смерть ---------- */
  kill(bot, byPlayer) {
    if (!bot.alive) return;
    bot.alive = false;
    bot.state = S_DEAD;
    this.ctx.events.emit('actor:death', { actor: bot, point: bot.root.position });
    if (byPlayer) {
      if (this.playerFaction === FACTION.SCAV && bot.kind === FACTION.SCAV) this.angerScavs('scav_kill');
      if (this.playerFaction === FACTION.SCAV && bot.kind === FACTION.RAIDER)
        this.ctx.events.emit('karma:scav', { delta: +0.05, reason: 'raider_kill' });
      this.ctx.events.emit('damage:dealt', { target: bot, killed: true, xp: DEF[bot.kind].xp });
    }
    this.ctx.get('raid').spawnCorpse(bot);      // труп с лутом владеет raid
  }

  clear() {
    for (const b of this.bots) { b.root.visible = false; this.world.removeActor(b); this.free.push(b); }
    this.bots.length = 0;
    this.pathQueue.length = 0;
    this.cursor = 0;
  }

  dispose() {
    this.clear();
    for (const b of this.free) this.world.disposeActor(b);
    this.free.length = 0;
    this._botBodyGeo.dispose();
    this._botHeadGeo.dispose();
    this._botMat.dispose();
    const e = this.ctx.events;
    e.off('weapon:fire', this._onFire); e.off('explosion', this._onBoom);
    e.off('raid:start', this._onRaid);  e.off('raid:end', this._onEnd);
  }
}
