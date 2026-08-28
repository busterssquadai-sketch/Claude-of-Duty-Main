import * as THREE from 'three';

/**
 * Projectile ballistics.
 *
 * Rounds are simulated, not hitscanned: each shot is a body with a muzzle
 * velocity, gravity and a drag term, stepped at the physics rate. A 9 mm round
 * takes 140 ms to cross a 50 m street and drops about 10 cm doing it, and you
 * can see the tracer travel. Terminal effects (penetration, spall, damage) are
 * handed to `physics.fireBullet()` at the moment of contact so wall penetration
 * and multi-layer hits stay in one place.
 *
 * Owned by WeaponSystem, which steps it from fixedUpdate(). This is not a
 * registry subsystem and deliberately has no static id.
 *
 * ORIGIN AND ALIGNMENT (REFACTOR 3)
 * ---------------------------------
 * `spawn()` is now always handed a MUZZLE origin by weapons/muzzle.js, never the
 * camera. Two consequences are load-bearing here:
 *
 *   - the tracer payload is emitted from the barrel tip, so it has real
 *     screen-space velocity and reads as a streak going downrange instead of a
 *     bar sitting on the near plane;
 *   - every visual is oriented from `velocity.normalize()`, not from the shot's
 *     initial direction. Gravity and drag bend the path, so a tracer aligned to
 *     the launch vector visibly slides sideways on a long flight. The payload
 *     therefore carries a live `dir` plus a `quaternion` that maps +Z onto that
 *     direction, and `orientAlongVelocity()` applies it to any mesh.
 */

const GRAVITY = -9.81;
const MAX_LIVE = 96;

/** +Z is the canonical "forward" for a tracer mesh, matching CylinderGeometry
 *  rotated onto Z and every look-at convention in three.js. */
const FORWARD = new THREE.Vector3(0, 0, 1);

/* PhysicsSystem exposes MASK_WORLD / MASK_ACTOR / MASK_ALL as instance fields.
 * There is no phys.MASK.BULLET -- the previous code read that, got undefined,
 * and passed undefined as the raycast mask on every single step. */
function bulletMask(phys) {
  if (!phys) return 3;
  if (Number.isFinite(phys.MASK_ALL)) return phys.MASK_ALL;
  if (phys.MASK && Number.isFinite(phys.MASK.ALL)) return phys.MASK.ALL;
  return 3;
}

/**
 * Point an Object3D down a projectile's CURRENT velocity and stretch it to the
 * segment length. Exported because bots, replays and the dev harness all draw
 * their own tracer meshes and must not each re-derive this.
 *
 * @param {THREE.Object3D} obj
 * @param {{pos: THREE.Vector3, vel: THREE.Vector3}} p
 * @param {number} [length] metres; when omitted the object's z scale is left alone
 */
export function orientAlongVelocity(obj, p, length) {
  if (!obj || !p) return obj;
  const v = p.vel;
  if (v.lengthSq() < 1e-10) return obj;
  _dirTmp.copy(v).normalize();
  obj.position.copy(p.pos);
  obj.quaternion.setFromUnitVectors(FORWARD, _dirTmp);
  if (Number.isFinite(length) && length > 0) obj.scale.z = length;
  obj.updateMatrix();
  return obj;
}

const _dirTmp = new THREE.Vector3();

class Projectile {
  constructor() {
    this.alive = false;
    this.pos = new THREE.Vector3();
    this.prev = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.damage = 30;
    this.penetration = 1;
    this.dragK = 0.3;
    this.travelled = 0;
    this.maxRange = 400;
    this.age = 0;
    this.dropoff = 0.5;
    this.weapon = null;
    this.ammoIndex = 0;
    this.shooter = null;
    this.mask = undefined;
    this.tracer = false;
  }

  /** Unit vector down the CURRENT velocity. Written into `out`, no allocation. */
  heading(out) {
    if (this.vel.lengthSq() < 1e-10) return out.copy(this.dir);
    return out.copy(this.vel).normalize();
  }
}

export class ProjectileSim {
  constructor(ctx) {
    this.ctx = ctx;
    this.pool = [];
    for (let i = 0; i < MAX_LIVE; i++) this.pool.push(new Projectile());
    this.live = [];
    this._physics = null;
    this._seg = new THREE.Vector3();
    this._hitDir = new THREE.Vector3();
    this._tracerFrom = new THREE.Vector3();
    this._tracerTo = new THREE.Vector3();
    this._tracerDir = new THREE.Vector3(0, 0, -1);
    this._tracerQuat = new THREE.Quaternion();

    /*
     * Tracer payload. `from` is the MUZZLE, `dir` is velocity.normalize() and
     * `quaternion` maps +Z onto it, so a consumer can either emit velocity-
     * aligned sprites (fx/tracers.js) or drop a mesh straight onto the
     * trajectory line without recomputing anything.
     */
    this._tracerPayload = {
      from: this._tracerFrom,
      to: this._tracerTo,
      dir: this._tracerDir,
      quaternion: this._tracerQuat,
      length: 0,
      speed: 800,
      weapon: null,
      fromMuzzle: true,
    };

    /* Преаллоцированный пейлоад попадания. Раньше здесь был объектный
     * литерал на каждое соприкосновение -- прямое нарушение правила
     * "ничего не аллоцировать в кадре" из ARCHITECTURE.md. */
    this._fireOpts = {
      origin: null,
      dir: null,
      maxDist: 24,
      damage: 30,
      penetration: 1,
      dropoff: 1,
      ammoIndex: 0,
      shooter: null,
      mask: undefined,
    };

    this.stats = { fired: 0, impacts: 0, live: 0, dropped: 0 };
  }

  get physics() {
    if (!this._physics && this.ctx && typeof this.ctx.peek === 'function') {
      try { this._physics = this.ctx.peek('physics'); } catch (e) { this._physics = null; }
    }
    return this._physics;
  }

  /**
   * @param {object} o origin (MUZZLE, see weapons/muzzle.js), dir (unit), speed,
   *                   damage, penetration, dragK, maxRange, dropoff, weapon,
   *                   ammoIndex, shooter, tracer
   */
  spawn(o) {
    if (!o || !o.origin || !o.dir) return null;

    let p = null;
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].alive) {
        p = this.pool[i];
        break;
      }
    }
    if (!p) {
      /* Самый старый патрон уступает слот, а не теряет выстрел. */
      p = this.live.shift() || null;
      if (!p) return null;
      this._retire(p);
      this.stats.dropped++;
      p.alive = false;
    }

    p.alive = true;
    p.pos.copy(o.origin);
    p.prev.copy(o.origin);
    p.dir.copy(o.dir);
    if (p.dir.lengthSq() < 1e-12) return null;
    p.dir.normalize();

    const speed = Number.isFinite(o.speed) && o.speed > 1 ? o.speed : 800;
    p.vel.copy(p.dir).multiplyScalar(speed);
    p.damage = Number.isFinite(o.damage) ? o.damage : 30;
    p.penetration = Number.isFinite(o.penetration) ? o.penetration : 1;
    p.dragK = Number.isFinite(o.dragK) ? o.dragK : 0.3;
    p.dropoff = Number.isFinite(o.dropoff) ? o.dropoff : 0.5;
    p.maxRange = Number.isFinite(o.maxRange) ? o.maxRange : 400;
    p.travelled = 0;
    p.age = 0;
    p.weapon = o.weapon != null ? o.weapon : null;
    p.ammoIndex = Number.isFinite(o.ammoIndex) ? o.ammoIndex : 0;
    p.shooter = o.shooter != null ? o.shooter : null;
    p.mask = o.mask;
    p.tracer = !!o.tracer;

    this.live.push(p);
    this.stats.fired++;

    if (p.tracer) this._emitTracer(p, speed, o.fromMuzzle !== false);
    return p;
  }

  /**
   * One tracer per burst of rounds: MUZZLE to wherever the round will land.
   *
   * The direction handed downstream is `velocity.normalize()` — identical to the
   * launch vector on this first step, but taken from the velocity so the contract
   * is the same one `orientAlongVelocity()` uses mid-flight.
   */
  _emitTracer(p, speed, fromMuzzle) {
    const phys = this.physics;
    this._tracerFrom.copy(p.pos);
    p.heading(this._tracerDir);

    let dist = Math.min(p.maxRange, 260);
    if (phys && typeof phys.raycast === 'function') {
      try {
        const hit = phys.raycast(p.pos, this._tracerDir, dist, bulletMask(phys));
        if (hit && hit.hit && Number.isFinite(hit.distance)) dist = hit.distance;
      } catch (e) { /* луч трассера не критичен */ }
    }
    if (!(dist > 0.05)) dist = 0.05;

    this._tracerTo.copy(p.pos).addScaledVector(this._tracerDir, dist);
    /* +Z -> heading. Any mesh using this quaternion extends FORWARD down the
     * trajectory; it can never end up broadside to the flight path. */
    this._tracerQuat.setFromUnitVectors(FORWARD, this._tracerDir);

    const pl = this._tracerPayload;
    pl.length = dist;
    pl.speed = speed;
    pl.weapon = p.weapon;
    pl.fromMuzzle = !!fromMuzzle;

    const events = this.ctx && this.ctx.events;
    if (events && typeof events.emit === 'function') events.emit('bullet:tracer', pl);
  }

  fixedUpdate(h) {
    if (!Number.isFinite(h) || h <= 0) return;
    const phys = this.physics;
    const mask = bulletMask(phys);
    const canRay = !!(phys && typeof phys.raycast === 'function');

    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.prev.copy(p.pos);

      /* gravity + a linear drag term (good enough over game distances) */
      p.vel.y += GRAVITY * h;
      const decay = Math.max(0, 1 - p.dragK * h);
      p.vel.multiplyScalar(decay);
      p.pos.addScaledVector(p.vel, h);
      p.age += h;

      this._seg.copy(p.pos).sub(p.prev);
      const segLen = this._seg.length();
      p.travelled += segLen;

      /* The impact ray uses the direction the round is ACTUALLY travelling on
       * this step, not its launch vector: after 300 m of drop those differ by
       * enough to move the impact point. Same vector the visuals align to. */
      if (segLen > 1e-6 && canRay) {
        this._hitDir.copy(this._seg).divideScalar(segLen);
        let hit = null;
        try {
          hit = phys.raycast(p.prev, this._hitDir, segLen, mask);
        } catch (e) {
          hit = null;
        }
        if (hit && hit.hit) {
          /* Contact: hand the round to the penetration solver, which emits
           * `bullet:impact` for every entry and exit face it goes through. */
          const range01 = Math.min(1, p.travelled / Math.max(1e-3, p.maxRange));
          const falloff = 1 - (1 - p.dropoff) * range01 * range01;

          const opts = this._fireOpts;
          opts.origin = p.prev;
          opts.dir = this._hitDir;
          opts.maxDist = Math.min(24, Math.max(1.5, p.maxRange - p.travelled + segLen));
          opts.damage = p.damage * falloff;
          opts.penetration = p.penetration;
          opts.dropoff = 1;
          opts.ammoIndex = p.ammoIndex;
          opts.shooter = p.shooter;
          opts.mask = p.mask;

          if (typeof phys.fireBullet === 'function') {
            try { phys.fireBullet(opts); } catch (e) { /* физика логирует сама */ }
          } else if (typeof phys.penetrate === 'function') {
            try { phys.penetrate(p.prev, this._hitDir, p.ammoIndex, p.shooter); } catch (e) {}
          }

          this.stats.impacts++;
          this._retire(p);
          this.live.splice(i, 1);
          continue;
        }
      }

      if (p.travelled > p.maxRange || p.age > 5 || p.pos.y < -80) {
        this._retire(p);
        this.live.splice(i, 1);
      }
    }
    this.stats.live = this.live.length;
  }

  /**
   * Orient an external mesh onto a live round's trajectory. Thin wrapper so a
   * caller holding an index does not have to reach into `live`.
   */
  orient(obj, index, length) {
    const p = this.live[index];
    if (!p) return obj;
    return orientAlongVelocity(obj, p, length);
  }

  _retire(p) {
    p.alive = false;
    p.weapon = null;
    p.shooter = null;
    p.tracer = false;
  }

  clear() {
    for (let i = 0; i < this.live.length; i++) this._retire(this.live[i]);
    this.live.length = 0;
    this.stats.live = 0;
  }

  dispose() {
    this.clear();
    this._physics = null;
    this.ctx = null;
  }
}

export default ProjectileSim;
