import * as THREE from 'three'
import { MuzzleSolver } from './muzzle.js'

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
 * ORIGIN AND ALIGNMENT
 * --------------------
 * `spawn()` is the single chokepoint every round passes through, so it is where
 * the muzzle rerouting lives -- WeaponSystem, the dev harness and any future
 * caller are fixed at once instead of each having to remember.
 *
 *   1. THE ORIGIN IS THE BARREL TIP, NEVER THE EYE. WeaponSystem solves the
 *      Muzzle Device / flash hider node once per trigger pull and hands the
 *      result down with `fromMuzzle: true`. Anything that still arrives carrying
 *      a camera position is rerouted here: MuzzleSolver replaces it with the
 *      world-space muzzle node of the active viewmodel and converges the shot on
 *      whatever the aim ray resolved to. See weapons/muzzle.js for why that is
 *      two rays and not one.
 *
 *   2. SPREAD IS PRESERVED. A direction that arrives already carrying the
 *      weapon's cone of fire (recoil pattern + sway + hipfire bloom) keeps it.
 *      The deviation from the view axis is extracted as a quaternion and
 *      re-applied to the converged muzzle direction; without that step,
 *      rerouting through the barrel would quietly turn every weapon into a
 *      laser.
 *
 *   3. VISUALS FOLLOW VELOCITY, NOT LAUNCH. Gravity and drag bend the path, so a
 *      mesh aligned to the launch vector slides sideways on a long flight, and a
 *      mesh aligned to a stale vector can end up broadside to the camera -- the
 *      "horizontal log flying at your face". Every live round therefore
 *      re-derives `dir` from `velocity.normalize()` and a `quaternion` mapping
 *      +Z onto it ON EVERY FIXED STEP (`Projectile.syncHeading`), and
 *      `orientAlongVelocity()` / `trajectoryMatrix()` apply exactly that, so a
 *      tracer segment always extends forward down the active trajectory line and
 *      can never point back at the player.
 */

const GRAVITY = -9.81
const MAX_LIVE = 96

/** +Z is the canonical "forward" for a tracer mesh, matching a CylinderGeometry
 *  rotated onto Z and every look-at convention in three.js. */
const FORWARD = new THREE.Vector3(0, 0, 1)

const _dirTmp = new THREE.Vector3()
const _spreadTmp = new THREE.Vector3()
const _quatTmp = new THREE.Quaternion()
const _scaleTmp = new THREE.Vector3(1, 1, 1)

/* PhysicsSystem exposes MASK_WORLD / MASK_ACTOR / MASK_ALL as instance fields.
 * There is no phys.MASK.BULLET -- the previous code read that, got undefined,
 * and passed undefined as the raycast mask on every single step. */
function bulletMask(phys) {
  if (!phys) return 3
  if (Number.isFinite(phys.MASK_ALL)) return phys.MASK_ALL
  if (phys.MASK && Number.isFinite(phys.MASK.ALL)) return phys.MASK.ALL
  return 3
}

/**
 * The look-at rotation down a trajectory: maps the canonical +Z forward axis
 * onto `dir`. A +Z-forward mesh (tracer segment, cylinder, stretched quad)
 * rotated by this extends ALONG the direction of flight, never across it.
 *
 * Exported because every consumer that draws its own tracer geometry must use
 * the same convention; two conventions is how a projectile ends up flying
 * broadside in one renderer and correctly in another.
 *
 * @param {THREE.Quaternion} out
 * @param {THREE.Vector3} dir  any non-zero vector; normalized internally
 */
export function alignToDirection(out, dir) {
  if (!out || !dir) return out
  if (dir.lengthSq() < 1e-12) return out
  _dirTmp.copy(dir).normalize()
  /* setFromUnitVectors handles the exactly-antiparallel case internally, so a
   * round travelling straight back down the view axis still gets a valid
   * rotation instead of a NaN quaternion. */
  return out.setFromUnitVectors(FORWARD, _dirTmp)
}

/**
 * Point an Object3D down a projectile's CURRENT velocity and stretch it to the
 * segment length. Exported because bots, replays and the dev harness all draw
 * their own tracer meshes and must not each re-derive this.
 *
 * @param {THREE.Object3D} obj
 * @param {{pos: THREE.Vector3, vel: THREE.Vector3, dir: THREE.Vector3}} p
 * @param {number} [length] metres; when omitted the object's z scale is untouched
 */
export function orientAlongVelocity(obj, p, length) {
  if (!obj || !p) return obj
  const v = p.vel && p.vel.lengthSq() > 1e-10 ? p.vel : p.dir
  if (!v || v.lengthSq() < 1e-10) return obj
  obj.position.copy(p.pos)
  alignToDirection(obj.quaternion, v)
  if (Number.isFinite(length) && length > 0) obj.scale.z = length
  obj.updateMatrix()
  return obj
}

/**
 * The same alignment as a bare transform, for callers driving instanced
 * geometry that never build an Object3D per round. Allocation-free.
 *
 * @param {THREE.Matrix4} out
 * @param {{pos: THREE.Vector3, vel: THREE.Vector3, dir: THREE.Vector3}} p
 * @param {number} [length] metres along +Z; defaults to 1
 */
export function trajectoryMatrix(out, p, length) {
  if (!out || !p) return out
  const v = p.vel && p.vel.lengthSq() > 1e-10 ? p.vel : p.dir
  if (!v || v.lengthSq() < 1e-10) _quatTmp.identity()
  else alignToDirection(_quatTmp, v)
  _scaleTmp.set(1, 1, Number.isFinite(length) && length > 0 ? length : 1)
  return out.compose(p.pos, _quatTmp, _scaleTmp)
}

class Projectile {
  constructor() {
    this.alive = false
    this.pos = new THREE.Vector3()
    this.prev = new THREE.Vector3()
    this.vel = new THREE.Vector3()
    /** Live heading: velocity.normalize(), refreshed every fixed step. */
    this.dir = new THREE.Vector3(0, 0, -1)
    /** Live look-at rotation: +Z mapped onto `dir`. Same cadence as `dir`. */
    this.quaternion = new THREE.Quaternion()
    this.damage = 30
    this.penetration = 1
    this.dragK = 0.3
    this.travelled = 0
    this.maxRange = 400
    this.age = 0
    this.dropoff = 0.5
    this.weapon = null
    this.ammoIndex = 0
    this.shooter = null
    this.mask = undefined
    this.tracer = false
    /** True when this round really did leave the barrel tip. */
    this.fromMuzzle = false
  }

  /** Unit vector down the CURRENT velocity. Written into `out`, no allocation. */
  heading(out) {
    if (this.vel.lengthSq() < 1e-10) return out.copy(this.dir)
    return out.copy(this.vel).normalize()
  }

  /**
   * Re-derive `dir` and `quaternion` from the CURRENT velocity.
   *
   * This is the whole fix for tracers flying sideways. Both fields used to be
   * written once, at spawn, from the launch vector: 300 m downrange the round is
   * travelling measurably below that vector, so any mesh oriented from it sat at
   * an angle to its own flight path, and a round whose velocity had been flipped
   * by a bounce or a bad spawn pointed back at the camera. Called at spawn and
   * once per fixed step, so `quaternion` is always the look-at rotation down the
   * ACTIVE trajectory line.
   */
  syncHeading() {
    if (this.vel.lengthSq() >= 1e-10) this.dir.copy(this.vel).normalize()
    if (this.dir.lengthSq() < 1e-12) this.dir.set(0, 0, -1)
    this.quaternion.setFromUnitVectors(FORWARD, this.dir)
    return this.dir
  }
}

export class ProjectileSim {
  constructor(ctx) {
    this.ctx = ctx
    this.pool = []
    for (let i = 0; i < MAX_LIVE; i++) this.pool.push(new Projectile())
    this.live = []
    this._physics = null
    this._weapons = null

    /** Rerouting for any caller that still hands us an eye/camera position. */
    this.muzzle = new MuzzleSolver()
    /** Set false to disable rerouting (used by the deterministic shot harness). */
    this.rerouteToMuzzle = true

    this._seg = new THREE.Vector3()
    this._hitDir = new THREE.Vector3()
    this._useOrigin = new THREE.Vector3()
    this._useDir = new THREE.Vector3()
    this._spreadQ = new THREE.Quaternion()

    this._tracerFrom = new THREE.Vector3()
    this._tracerTo = new THREE.Vector3()
    this._tracerDir = new THREE.Vector3(0, 0, -1)
    this._tracerQuat = new THREE.Quaternion()

    /*
     * Tracer payload. `from` is the MUZZLE, `dir` is velocity.normalize() and
     * `quaternion` maps +Z onto it, so a consumer can either emit velocity-
     * aligned sprites (fx/tracers.js) or drop a mesh straight onto the
     * trajectory line without recomputing anything. Preallocated: emitting a
     * tracer must not allocate.
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
    }

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
    }

    this.stats = { fired: 0, impacts: 0, live: 0, dropped: 0, fromMuzzle: 0, fromEye: 0 }
  }

  get physics() {
    if (!this._physics && this.ctx && typeof this.ctx.peek === 'function') {
      try { this._physics = this.ctx.peek('physics') } catch (e) { this._physics = null }
    }
    return this._physics
  }

  /** The player's viewmodel, if one is mounted. Lazily peeked, never cached hard. */
  get viewmodel() {
    if (!this._weapons && this.ctx && typeof this.ctx.peek === 'function') {
      try { this._weapons = this.ctx.peek('weapons') } catch (e) { this._weapons = null }
    }
    const w = this._weapons
    return w && w.viewmodel ? w.viewmodel : null
  }

  /**
   * Solve the barrel tip for the current pose.
   *
   * Public so WeaponSystem can solve ONCE per trigger pull and hand the result
   * to every pellet. An 8-pellet buckshot shell used to run this solver (and its
   * aim ray plus its occlusion ray) eight times for one press of the mouse.
   *
   * @param {object} [o] camera / viewmodel / physics / shooter / converge
   * @returns {MuzzleSolver} the solver, holding origin, dir, eye, eyeDir, aim,
   *                         bore, fromMuzzle and reason
   */
  solveMuzzle(o) {
    const opts = o || {}
    return this.muzzle.solve({
      camera: opts.camera || (this.ctx ? this.ctx.camera : null),
      viewmodel: opts.viewmodel || this.viewmodel,
      physics: opts.physics || this.physics,
      shooter: opts.shooter || null,
      converge: opts.converge,
    })
  }

  /**
   * Replace an eye-space origin with the real barrel tip, preserving the shot's
   * angular deviation from the view axis.
   *
   * @returns {boolean} true when `_useOrigin`/`_useDir` now hold the solution
   */
  _rerouteToMuzzle(o) {
    if (!this.rerouteToMuzzle) return false
    /* Bots emit from their own weapon node; they never had the camera bug. */
    if (o.shooter) return false
    /* An explicit flag lets a caller say "this is already a muzzle position". */
    if (o.fromMuzzle === true) return false

    const vm = this.viewmodel
    if (!vm || !vm.active) return false
    const cam = this.ctx ? this.ctx.camera : null
    if (!cam) return false

    const sol = this.solveMuzzle({ camera: cam, viewmodel: vm, physics: this.physics })
    if (!sol.fromMuzzle) return false

    this._useOrigin.copy(sol.origin)
    this._useDir.copy(sol.dir)

    /* Re-apply the cone of fire. `o.dir` is the view axis rotated by spread and
     * recoil; that same rotation must survive the move to the barrel. */
    _spreadTmp.copy(o.dir)
    if (_spreadTmp.lengthSq() > 1e-12) {
      _spreadTmp.normalize()
      /* setFromUnitVectors handles the antiparallel case internally. */
      this._spreadQ.setFromUnitVectors(sol.eyeDir, _spreadTmp)
      this._useDir.applyQuaternion(this._spreadQ)
      if (this._useDir.lengthSq() < 1e-12) this._useDir.copy(sol.dir)
      else this._useDir.normalize()
    }
    return true
  }

  /**
   * @param {object} o origin, dir (unit), speed, damage, penetration, dragK,
   *                   maxRange, dropoff, weapon, ammoIndex, shooter, tracer,
   *                   fromMuzzle.
   *                   Pass `fromMuzzle: true` when `origin` is ALREADY the
   *                   world-space muzzle device node (WeaponSystem does this).
   *                   Otherwise an eye position is rerouted to the barrel here,
   *                   unless a `shooter` is present.
   */
  spawn(o) {
    if (!o || !o.origin || !o.dir) return null

    /* Solved upstream, or rerouted here. Either way the round leaves the barrel
     * tip and not the camera. */
    const preSolved = o.fromMuzzle === true
    const rerouted = preSolved ? false : this._rerouteToMuzzle(o)
    const fromMuzzle = preSolved || rerouted
    const srcOrigin = rerouted ? this._useOrigin : o.origin
    const srcDir = rerouted ? this._useDir : o.dir
    if (fromMuzzle) this.stats.fromMuzzle++
    else this.stats.fromEye++

    let p = null
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].alive) {
        p = this.pool[i]
        break
      }
    }
    if (!p) {
      /* Самый старый патрон уступает слот, а не теряет выстрел. */
      p = this.live.shift() || null
      if (!p) return null
      this._retire(p)
      this.stats.dropped++
      p.alive = false
    }

    p.dir.copy(srcDir)
    if (p.dir.lengthSq() < 1e-12) return null
    p.dir.normalize()

    p.alive = true
    p.pos.copy(srcOrigin)
    p.prev.copy(srcOrigin)

    const speed = Number.isFinite(o.speed) && o.speed > 1 ? o.speed : 800
    p.vel.copy(p.dir).multiplyScalar(speed)
    p.damage = Number.isFinite(o.damage) ? o.damage : 30
    p.penetration = Number.isFinite(o.penetration) ? o.penetration : 1
    p.dragK = Number.isFinite(o.dragK) ? o.dragK : 0.3
    p.dropoff = Number.isFinite(o.dropoff) ? o.dropoff : 0.5
    p.maxRange = Number.isFinite(o.maxRange) ? o.maxRange : 400
    p.travelled = 0
    p.age = 0
    p.weapon = o.weapon != null ? o.weapon : null
    p.ammoIndex = Number.isFinite(o.ammoIndex) ? o.ammoIndex : 0
    p.shooter = o.shooter != null ? o.shooter : null
    p.mask = o.mask
    p.tracer = !!o.tracer
    p.fromMuzzle = fromMuzzle

    /* dir + quaternion from the velocity we just built, so the visual contract is
     * velocity-derived from the very first frame rather than from the launch
     * vector that happens to match it only on step one. */
    p.syncHeading()

    this.live.push(p)
    this.stats.fired++

    if (p.tracer) this._emitTracer(p, speed)
    return p
  }

  /**
   * One tracer per round that carries one: MUZZLE to wherever it will land.
   *
   * Everything handed downstream is read off the projectile's live heading, so
   * `dir` is `velocity.normalize()` and `quaternion` is the matching +Z look-at
   * rotation. A consumer that stretches a sprite along `dir`, or that parents a
   * mesh to `quaternion`, is aligned down the trajectory by construction.
   */
  _emitTracer(p, speed) {
    const phys = this.physics
    this._tracerFrom.copy(p.pos)
    this._tracerDir.copy(p.dir)

    let dist = Math.min(p.maxRange, 260)
    if (phys && typeof phys.raycast === 'function') {
      try {
        const hit = phys.raycast(p.pos, this._tracerDir, dist, bulletMask(phys))
        if (hit && hit.hit && Number.isFinite(hit.distance)) dist = hit.distance
      } catch (e) { /* луч трассера не критичен */ }
    }
    if (!(dist > 0.05)) dist = 0.05

    this._tracerTo.copy(p.pos).addScaledVector(this._tracerDir, dist)
    /* +Z -> heading. Any mesh using this quaternion extends FORWARD down the
     * trajectory; it can never end up broadside to the flight path. */
    this._tracerQuat.copy(p.quaternion)

    const pl = this._tracerPayload
    pl.length = dist
    pl.speed = speed
    pl.weapon = p.weapon
    pl.fromMuzzle = !!p.fromMuzzle

    const events = this.ctx && this.ctx.events
    if (events && typeof events.emit === 'function') events.emit('bullet:tracer', pl)
  }

  fixedUpdate(h) {
    if (!Number.isFinite(h) || h <= 0) return
    const phys = this.physics
    const mask = bulletMask(phys)
    const canRay = !!(phys && typeof phys.raycast === 'function')

    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i]
      p.prev.copy(p.pos)

      /* gravity + a linear drag term (good enough over game distances) */
      p.vel.y += GRAVITY * h
      const decay = Math.max(0, 1 - p.dragK * h)
      p.vel.multiplyScalar(decay)
      p.pos.addScaledVector(p.vel, h)
      p.age += h

      /* LIVE ALIGNMENT. dir and quaternion follow the velocity every step, so a
       * tracer mesh can never lag onto the launch vector and read as a bar
       * sliding sideways across the screen. */
      p.syncHeading()

      this._seg.copy(p.pos).sub(p.prev)
      const segLen = this._seg.length()
      p.travelled += segLen

      /* The impact ray uses the direction the round is ACTUALLY travelling on
       * this step, not its launch vector: after 300 m of drop those differ by
       * enough to move the impact point. Same vector the visuals align to. */
      if (segLen > 1e-6 && canRay) {
        this._hitDir.copy(this._seg).divideScalar(segLen)
        let hit = null
        try {
          hit = phys.raycast(p.prev, this._hitDir, segLen, mask)
        } catch (e) {
          hit = null
        }
        if (hit && hit.hit) {
          /* Contact: hand the round to the penetration solver, which emits
           * `bullet:impact` for every entry and exit face it goes through. */
          const range01 = Math.min(1, p.travelled / Math.max(1e-3, p.maxRange))
          const falloff = 1 - (1 - p.dropoff) * range01 * range01

          const opts = this._fireOpts
          opts.origin = p.prev
          opts.dir = this._hitDir
          opts.maxDist = Math.min(24, Math.max(1.5, p.maxRange - p.travelled + segLen))
          opts.damage = p.damage * falloff
          opts.penetration = p.penetration
          opts.dropoff = 1
          opts.ammoIndex = p.ammoIndex
          opts.shooter = p.shooter
          opts.mask = p.mask

          if (typeof phys.fireBullet === 'function') {
            try { phys.fireBullet(opts) } catch (e) { /* физика логирует сама */ }
          } else if (typeof phys.penetrate === 'function') {
            try { phys.penetrate(p.prev, this._hitDir, p.ammoIndex, p.shooter) } catch (e) {}
          }

          this.stats.impacts++
          this._retire(p)
          this.live.splice(i, 1)
          continue
        }
      }

      if (p.travelled > p.maxRange || p.age > 5 || p.pos.y < -80) {
        this._retire(p)
        this.live.splice(i, 1)
      }
    }
    this.stats.live = this.live.length
  }

  /**
   * Orient an external mesh onto a live round's trajectory. Thin wrapper so a
   * caller holding an index does not have to reach into `live`.
   */
  orient(obj, index, length) {
    const p = this.live[index]
    if (!p) return obj
    return orientAlongVelocity(obj, p, length)
  }

  /** The same, as a transform, for instanced tracer geometry. */
  orientMatrix(out, index, length) {
    const p = this.live[index]
    if (!p) return out
    return trajectoryMatrix(out, p, length)
  }

  /**
   * Touch every pooled round once so the JIT has seen the hot path and the
   * arrays are resident before the first shot of a raid. Called by the loading
   * screen (see core/prewarm.js and ui/lobbyWizard.js STEP 5).
   */
  prewarm() {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i]
      p.pos.set(0, -1000, 0)
      p.prev.copy(p.pos)
      p.vel.set(0, 0, -1)
      p.dir.set(0, 0, -1)
      p.syncHeading()
      p.heading(this._hitDir)
      p.alive = false
    }
    this._tracerQuat.setFromUnitVectors(FORWARD, this._tracerDir)
    return this.pool.length
  }

  _retire(p) {
    p.alive = false
    p.weapon = null
    p.shooter = null
    p.tracer = false
    p.fromMuzzle = false
  }

  clear() {
    for (let i = 0; i < this.live.length; i++) this._retire(this.live[i])
    this.live.length = 0
    this.stats.live = 0
  }

  dispose() {
    this.clear()
    this._physics = null
    this._weapons = null
    this.ctx = null
  }
}

export default ProjectileSim
