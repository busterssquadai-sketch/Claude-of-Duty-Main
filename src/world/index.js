import * as THREE from 'three';
import { EFL } from '../core/config.js';
import { buildFactory } from './maps/factory.js';
import { buildCustoms } from './maps/customs.js';
import { buildWoods } from './maps/woods.js';
import { buildInterchange } from './maps/interchange.js';
import { buildLab } from './maps/lab.js';

export const MAPS = {
  factory:     { n: 'Завод',      size: 96,  duration: 25 * 60, build: buildFactory,     lights: 20 },
  customs:     { n: 'Таможня',    size: 150, duration: 35 * 60, build: buildCustoms,     lights: 16 },
  woods:       { n: 'Лес',        size: 190, duration: 40 * 60, build: buildWoods,       lights: 8  },
  interchange: { n: 'Развязка',   size: 160, duration: 35 * 60, build: buildInterchange, lights: 22 },
  lab:         { n: 'Лаборатория', size: 110, duration: 30 * 60, build: buildLab, lights: 18, needCard: 'tgcard' },
};

export class WorldSystem {
  static id = 'world';
  static deps = ['materials', 'render', 'sky'];

  async init(ctx) {
    this.ctx = ctx;
    this.mats = ctx.get('materials');
    this.render = ctx.get('render');
    this.root = new THREE.Group();
    this.root.name = 'world';
    ctx.scene.add(this.root);

    this.current = null;
    this._owned = { geometries: new Set(), materials: new Set(), textures: new Set() };
    this._lights = [];              // ФИКСИРОВАННЫЙ пул point-light
    this._instanced = new Map();    // ключ кита → InstancedMesh
    this._actorPool = [];
    this._actors = new Set();
    this._colliders = [];
    this._matrix = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3(1, 1, 1);

    this._allocLightPool(Math.max(...Object.values(MAPS).map((m) => m.lights)));
  }

  /** Ловушка движка: число светов входит в permutation key шейдера.
   *  Создаём максимум раз и навсегда, лишние гасим intensity = 0.
   *  visible = false НЕЛЬЗЯ — это меняет ключ и вызывает рекомпиляцию всех материалов. */
  _allocLightPool(n) {
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffd9a0, 0, 14, 2);
      l.castShadow = false;
      this.root.add(l);
      this._lights.push(l);
      this.render.addLight(l);
    }
  }

  lamp(pos, color, intensity, distance) {
    const l = this._lights.find((x) => x.intensity === 0);
    if (!l) return null;                       // бюджет исчерпан — это норма, а не ошибка
    l.position.copy(pos); l.color.set(color); l.intensity = intensity; l.distance = distance;
    return l;
  }

  /* ---------- сборка карты ---------- */
  async buildMap(mapId, { night, seed }) {
    if (this.current) this.teardown();
    const def = MAPS[mapId];
    const rng = this.ctx.rng.fork('map:' + mapId + ':' + seed);

    const built = await def.build({
      ctx: this.ctx, rng, night, mats: this.mats, world: this,
      size: def.size, track: (o) => this._track(o),
    });

    this.root.add(built.group);
    this.current = { ...built, id: mapId, duration: def.duration, night };
    this.navGrid = built.navGrid;
    this.buildings = (built.rooms || []).map((spec) => ({ spec }));
    this.ctx.get('physics').rebuildStatic();            // один раз на рейд, не покадрово
    await this.ctx.get('render').prewarmMaterials(this.ctx);
    return this.current;
  }

  _track(obj) {
    obj.traverse?.((o) => {
      if (o.geometry) this._owned.geometries.add(o.geometry);
      const m = o.material;
      if (Array.isArray(m)) m.forEach((x) => this._owned.materials.add(x));
      else if (m) this._owned.materials.add(m);
    });
    return obj;
  }

  /** Вызывается после каждого рейда. Меши акторов и свет НЕ трогаем — они в пулах. */
  teardown() {
    if (!this.current) return;
    this.root.remove(this.current.group);
    for (const g of this._owned.geometries) g.dispose();
    for (const m of this._owned.materials) {
      for (const k in m) { const v = m[k]; if (v && v.isTexture && !this.mats.isShared(v)) v.dispose(); }
      m.dispose();
    }
    this._owned.geometries.clear();
    this._owned.materials.clear();
    for (const l of this._lights) l.intensity = 0;        // гасим, но не удаляем
    this._instanced.clear();
    this._actors.clear();
    this._colliders.length = 0;
    this.buildings = [];
    this.current = null;
    this.navGrid = null;
  }

  levelToWorld(x, y, z, out = new THREE.Vector3()) {
    return out.set(x, y, z);
  }

  isOpen(x, z, m = 0.3) {
    const nav = this.navGrid;
    if (!nav) return true;
    if (typeof nav.freeWorld !== 'function') return true;
    if (m <= 0) return nav.freeWorld(x, z);
    return (
      nav.freeWorld(x, z) &&
      nav.freeWorld(x + m, z) &&
      nav.freeWorld(x - m, z) &&
      nav.freeWorld(x, z + m) &&
      nav.freeWorld(x, z - m)
    );
  }

  spawnZones(kind) {
    return this.current?.spawnZones?.[kind] || [];
  }

  groundAt(x, z, fromY = 20) {
    const phys = this.ctx?.peek('physics');
    const y = phys?.groundHeight?.(x, z, fromY, phys.MASK_WORLD ?? 1);
    return Number.isFinite(y) ? y : 0;
  }

  randomPatrolPoint(rng) {
    const rand = typeof rng === 'function'
      ? rng
      : rng && typeof rng.float === 'function'
        ? () => rng.float()
        : () => this.ctx.rng.float();
    const nav = this.navGrid;
    const p = new THREE.Vector3();
    if (nav && typeof nav.randomFree === 'function' && nav.randomFree(rand, p)) {
      p.y = this.groundAt(p.x, p.z, p.y + 4);
      return p;
    }
    const zones = this.spawnZones('bot');
    if (zones.length) {
      const p = zones[(rand() * zones.length) | 0].clone();
      p.y = this.groundAt(p.x, p.z, p.y + 4);
      return p;
    }
    return p.set(0, this.groundAt(0, 0, 20), 0);
  }

  findPath(from, to) {
    const nav = this.navGrid;
    if (!nav || typeof nav.findPath !== 'function') return [];
    const out = [];
    const n = nav.findPath(from, to, out);
    if (!n) return [];
    for (let i = 0; i < out.length; i++) {
      const p = out[i];
      p.y = this.groundAt(p.x, p.z, p.y + 4);
    }
    return out;
  }

  findCover(pos, threat, rng) {
    const nav = this.navGrid;
    const phys = this.ctx?.peek('physics');
    if (!nav || !phys) return null;
    const rand = typeof rng === 'function'
      ? rng
      : rng && typeof rng.float === 'function'
        ? () => rng.float()
        : () => this.ctx.rng.float();
    const mask = phys.MASK_WORLD ?? 1;
    const baseX = pos.x - threat.x;
    const baseZ = pos.z - threat.z;
    const baseLen = Math.hypot(baseX, baseZ) || 1;
    const awayX = baseX / baseLen;
    const awayZ = baseZ / baseLen;
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 28; i++) {
      const wiggle = (rand() - 0.5) * 1.4;
      const ang = Math.atan2(awayZ, awayX) + wiggle;
      const dist = 6 + rand() * 16;
      const x = pos.x + Math.cos(ang) * dist;
      const z = pos.z + Math.sin(ang) * dist;
      if (typeof nav.freeWorld === 'function' && !nav.freeWorld(x, z)) continue;
      const y = phys.groundHeight(x, z, pos.y + 6, mask);
      if (!Number.isFinite(y)) continue;
      const p = new THREE.Vector3(x, y, z);
      if (phys.lineOfSight?.(threat, p, mask)) continue;
      const path = nav.findPath(pos, p, []);
      if (!path || path.length === 0) continue;
      const dBot = p.distanceTo(pos);
      const dThreat = p.distanceTo(threat);
      let score = dThreat * 2.1 - dBot * 0.6;
      score += ((x - pos.x) * awayX + (z - pos.z) * awayZ) / Math.max(1, dBot) * 2.4;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  addActor(actor) {
    if (!actor) return null;
    const node = actor.isObject3D ? actor : actor.root || null;
    if (node && node.parent !== this.root) this.root.add(node);
    if (actor.collider) actor.collider.enabled = true;
    if (Array.isArray(actor.colliders)) for (const c of actor.colliders) if (c) c.enabled = true;
    this._actors.add(actor);
    return actor;
  }

  removeActor(actor) {
    if (!actor) return null;
    const node = actor.isObject3D ? actor : actor.root || null;
    node?.parent?.remove(node);
    if (actor.collider) actor.collider.enabled = false;
    if (Array.isArray(actor.colliders)) for (const c of actor.colliders) if (c) c.enabled = false;
    this._actors.delete(actor);
    return actor;
  }

  disposeActor(actor) {
    if (!actor) return null;
    this.removeActor(actor);
    const phys = this.ctx?.peek('physics');
    if (actor.collider && phys?.removeCollider) phys.removeCollider(actor.collider);
    if (Array.isArray(actor.colliders) && phys?.removeCollider) {
      for (const c of actor.colliders) phys.removeCollider(c);
      actor.colliders.length = 0;
    }
    actor.dispose?.();
    return actor;
  }

  recycleCorpseMesh(actor) {
    return this.removeActor(actor);
  }

  recycleGhost(actor) {
    return this.removeActor(actor);
  }

  dispose() { this.teardown(); for (const l of this._lights) l.parent?.remove(l); this._lights.length = 0; }
}
