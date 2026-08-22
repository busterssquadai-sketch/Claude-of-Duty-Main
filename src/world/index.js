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
    this.ctx.get('physics').rebuild(built.group);       // один раз на рейд, не покадрово
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
    this.current = null;
    this.navGrid = null;
  }

  dispose() { this.teardown(); for (const l of this._lights) l.parent?.remove(l); this._lights.length = 0; }
}