import { PhysicsSystem } from './index.js';

let applied = false;

export function applyTarkovPhysicsPatch() {
  if (applied) return;
  applied = true;

  if (typeof PhysicsSystem.prototype.penetrate !== 'function') {
    PhysicsSystem.prototype.penetrate = function penetrate(origin, dir, ammoIdx, shooter) {
      return this._solver?.solve(origin, dir, ammoIdx, shooter) ?? null;
    };
  }

  if (typeof PhysicsSystem.prototype.fireBullet !== 'function') {
    PhysicsSystem.prototype.fireBullet = function fireBullet(opts) {
      return this.ballistics?.fire(opts) ?? [];
    };
  }
}
