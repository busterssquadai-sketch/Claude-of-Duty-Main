import { applyTarkovPlayerPatch } from '../player/tarkovPlayerPatch.js';
import { applyTarkovPhysicsPatch } from '../physics/tarkovPhysicsPatch.js';

export function applyTarkovBootstrap() {
  applyTarkovPlayerPatch();
  applyTarkovPhysicsPatch();
}
