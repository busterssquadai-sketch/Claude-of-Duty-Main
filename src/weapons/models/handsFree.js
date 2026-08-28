/* ==========================================================================
 * Escape-From-Larpov · src/weapons/models/handsFree.js
 *
 * THE UNARMED STANCE.
 *
 * When every weapon slot is empty there must be no weapon in the view scene at
 * all — not a hidden one, not one shoved below the near plane, and above all not
 * the M4A1 that used to sit there frozen because the viewmodel had been handed a
 * model but never a state to animate it with.
 *
 * The trick is that this is a fully valid model description whose `body` is an
 * EMPTY Assembly and whose `moving` map has no entries. Assembly.build() returns
 * an empty Map, so addWeapon creates a group with zero meshes and zero triangles.
 * setActive('hands') then hides the outgoing weapon's group and shows a group
 * that contains nothing, which is a genuine purge rather than a hide.
 *
 * Everything else in Viewmodel.update keeps running exactly as it does for a
 * rifle — the breathing noise, the walk and sprint bob, positional and
 * rotational lag, the jump and land springs, the arm IK — because all of that
 * layer operates on the rig transform and the two arms, none of which care
 * whether the weapon group has geometry in it. So no change to viewmodel.js is
 * needed to support an unarmed stance; it only needs a weapon that is nothing.
 *
 * TWO OMISSIONS THAT ARE LOAD-BEARING
 *  - there is no `handguard` node, so Viewmodel._fitSupportHand early-returns
 *    rather than solving a fingertip clamp around a cylinder that is not there
 *  - there is no `opticGlass`, so Viewmodel._updateReticle hides the dot
 *
 * Space, as everywhere else: +X right, +Y up, -Z forward. Unlike the weapon
 * models the origin is not a grip — there is nothing to grip — so it sits at the
 * rig root and the two wrist targets hang off it directly.
 * ========================================================================== */

import { Assembly } from '../geometry.js'
import { WEAPON_DEFS } from '../defs.js'

/**
 * Build the empty-handed "weapon".
 *
 * @returns a model description in the shape Viewmodel.addWeapon expects, with
 *          no geometry and no moving parts.
 */
export function buildHandsFree() {
	/* Never has anything added to it. This is the entire point. */
	const body = new Assembly('hands-body')

	return {
		id: 'hands',
		label: 'Без оружия',
		fxClass: 'none',
		body,
		/* No magazine, no bolt, no trigger, no selector. _updateParts guards every
		 * one of those individually, so an empty map is simply a no-op frame. */
		moving: {},
		nodes: {
			/* Kept inside the frustum and pointing down the camera axis so anything
			 * that reads them for a direction gets a sane forward vector rather than
			 * a zero-length one. Nothing fires in this mode. */
			muzzle: [0, 0, -0.2],
			chamber: [0, 0, -0.1],
			eject: [0.02, 0, -0.1],
			ejectDir: [1, 0.3, 0],
			sight: [0, 0, -0.2],
			sightAxis: [0, 0, -1],
			ironSight: [0, 0, -0.2],

			/* RIGHT WRIST. Hand targets are wrists, and `finger` / `back` are the
			 * frame the glove is oriented by: fingers hanging forward-and-down, the
			 * back of the hand turned outboard, which is what a relaxed arm does.
			 * Checked against Viewmodel's shoulderR (0.205, -0.2, 0.06): the wrist
			 * lands ~0.369 m out against an arm of roughly 0.6 m, so the elbow keeps a
			 * visible bend instead of snapping straight. */
			gripR: {
				pos: [0.115, -0.145, -0.235],
				finger: [0.05, -0.42, -0.906],
				back: [0.94, 0.3, 0.16]
			},
			/* LEFT WRIST, mirrored. ~0.316 m from shoulderL (-0.2, -0.22, 0.02). */
			gripL: {
				pos: [-0.125, -0.155, -0.225],
				finger: [-0.05, -0.42, -0.906],
				back: [-0.94, 0.3, 0.16]
			},

			/* NO `handguard` — see the header. Its absence is what keeps
			 * _fitSupportHand from clamping the left hand onto nothing. */

			/* Required by addWeapon and by buildClips' waypoint maths even though no
			 * reload can ever run here. */
			magSeat: { pos: [0, -0.06, -0.02], rot: [0, 0, 0] },
			magDrop: [0, -0.3, 0],
			boltRest: { pos: [0, 0, 0], rot: [0, 0, 0] },
			boltTravel: [0, 0, 0],
			triggerPivot: { pos: [0, 0, 0], rot: [0, 0, 0] },
			triggerPull: 0,

			/* NO `opticGlass` — keeps the reticle hidden. */
			opticGlass: null
		},
		shell: { caseLen: 0.01, rimR: 0.002 },
		magSize: { len: 0.1, w: 0.02, d: 0.05 }
	}
}

/**
 * Def for the unarmed stance.
 *
 * Spread from the rifle so every field Viewmodel.update reads exists with a sane
 * value, then overridden where empty hands genuinely behave differently:
 *
 *   hipPos/hipRot   hands hang lower and closer than a shouldered rifle, and sit
 *                   centred rather than offset to the strong side
 *   swayScale       ABOVE the rifle's: hands are not braced against 3.6 kg of
 *   bobScale        weapon, so they wander more at idle and swing harder at a run
 *   adsTime         irrelevant — ADS is forced off in this mode — but kept finite
 *   recoil          zeroed rather than deleted, so any stray addRecoil call is a
 *                   no-op instead of a NaN
 */
const RIFLE = WEAPON_DEFS.rifle

export const HANDS_FREE_DEF = {
	...RIFLE,
	id: 'hands',
	label: 'Без оружия',
	class: 'unarmed',
	caliber: null,
	modes: [],
	magSize: 0,
	magLen: 0.1,
	rpm: 0,

	/* Idle carry: both hands low and just forward of the chest. */
	hipPos: [0, -0.1, -0.06],
	hipRot: [0, 0, 0],

	/* Running: arms drop back and the whole container rolls with the stride. The
	 * pose is deliberately looser than the rifle's sprint pose, which exists to
	 * keep a muzzle out of the camera — a constraint that does not apply here. */
	sprintPos: [0.02, -0.2, -0.1],
	sprintRot: [-0.3, 0.34, 0.16],

	lowReadyPos: [0, -0.19, -0.075],
	lowReadyRot: [-0.26, 0.06, -0.04],

	/* Unbraced hands move more than a shouldered weapon does. */
	swayScale: 1.45,
	bobScale: 1.6,

	adsTime: 0.2,
	adsFov: 1,
	viewFov: 1,
	adsCant: [0, 0, 0],
	eyeRelief: 0.2,

	drawTime: 0.34,
	holsterTime: 0.24,
	reloadTac: 0,
	reloadEmpty: 0,
	inspectTime: 1.4,

	recoil: {
		...RIFLE.recoil,
		pitch: 0,
		yaw: 0,
		kickBack: 0,
		kickUp: 0,
		roll: 0,
		punch: 0
	}
}

export default buildHandsFree
