/* ==========================================================================
 * Escape-From-Larpov · src/weapons/models/kalashnikov.js
 *
 * KALASHNIKOV COMPOSITE VIEWMODEL ASSEMBLY.
 *
 * The AK family used to borrow models/rifle.js. That model is an AR-15: a
 * free-float aluminium handguard, a flat-top upper with a 21.2 mm Picatinny
 * deck, a cantilever tube red dot and a collapsible buffer-tube stock. Nothing
 * in that silhouette is a Kalashnikov, and VIEWMODEL_KIND mapping every
 * ak74m / aks74u / ak101 / rpk16 onto it is what put an M4 frame in the
 * player's hands whatever the inventory actually held.
 *
 * This compiles a real AK from the same modular primitives, in ONE parametric
 * pass, so AK-74M/N and RPK-16 are two configurations of one assembly.
 *
 * Weapon-local space: +X right, +Y up, -Z toward the muzzle, origin at the web
 * of the shooting thumb (top-rear of the pistol grip).
 * ========================================================================== */

import {
	Assembly,
	box,
	blob,
	extrude,
	roundRect,
	latheZ,
	tubeZ,
	rodZ,
	mergeAll
} from '../geometry.js'
import {
	addBarrel,
	addMuzzleDevice,
	addRail,
	addPistolGrip,
	addRollmark,
	addQdSocket,
	addSlingLoop,
	addPin,
	buildMagazine,
	buildOptic,
	triggerPart,
	cartridge
} from '../parts.js'
import { WEAPON_DEFS } from '../defs.js'

/* 5.45x39: case 39.7 mm, 10 mm rim, 22.5 mm of bullet out of the neck. */
const R545 = { caseLen: 0.0397, rimR: 0.005, bulletLen: 0.0225 }

/** Bore height, shared with WEAPON_DEFS.rifle's solved poses. */
const BORE = 0.075

/**
 * Support-hand contact geometry, solved against the handguard cylinder exactly
 * as models/rifle.js documents: clock angle 250 deg (under the handguard, wrap
 * counter-clockwise up the far side) keeps the hand off the muzzle, the barrel
 * and the gas block, which a C-clamp at 140 deg does not.
 *   finger = tangent at phi rolled 0.30 rad forward
 *   back   = surface normal tilted 0.62 rad rearward (turns the dorsum to camera)
 *   pos    = contact - 0.098 * finger   (hand targets are WRISTS)
 * 6.5 mm of knuckle standoff lets a 16 mm half-palm bury ~9 mm, which is what a
 * glove does when it is squeezing something.
 */
const PHI = (250 * Math.PI) / 180
const FINGER = [0.898, -0.327, -0.296]
const BACK = [-0.2784, -0.7651, 0.581]

function supportGrip(r, handZ) {
	const rc = r + 0.0065
	const cx = Math.cos(PHI) * rc
	const cy = BORE + Math.sin(PHI) * rc
	return {
		pos: [cx - 0.098 * FINGER[0], cy - 0.098 * FINGER[1], handZ - 0.098 * FINGER[2]],
		finger: FINGER.slice(),
		back: BACK.slice()
	}
}

/**
 * The two configurations. Everything variant-specific lives here so the builder
 * itself has no branches beyond reading this table. The RPK is the squad
 * automatic: longer heavy barrel, longer handguard, 45-round magazine with more
 * curve, black polymer furniture, and the dust-cover rail it really ships with.
 */
export const KALASHNIKOV_VARIANTS = {
	ak: {
		id: 'ak',
		label: 'АК-74М',
		/* polymer_tan is the warm FDE dielectric in materials.js and the only one
		 * that reads as AK laminate/plum against cool stamped steel. A 'wood' key
		 * does not exist and would resolve to undefined, i.e. render white. */
		furniture: 'polymer_tan',
		rec: { zRear: 0.086, zFront: -0.114, w: 0.0298, top: 0.0932, bot: 0.0532 },
		zBreech: -0.1,
		zBarrelEnd: -0.474,
		muzzleKind: 'brake',
		rBarrel: 0.0072,
		gasZ: -0.296,
		frontSightZ: -0.43,
		rearSightZ: -0.078,
		hg: { z0: -0.118, z1: -0.246, r: 0.0272 },
		handZ: -0.184,
		stockZ: 0.272,
		mag: { w: 0.0255, d: 0.068, len: 0.232, curve: 0.058, segs: 10, ribs: 5 },
		magZ: -0.068,
		magTilt: 0.055,
		topRail: false,
		optic: false,
		bayonet: true
	},
	rpk: {
		id: 'rpk',
		label: 'РПК-16',
		furniture: 'polymer',
		rec: { zRear: 0.09, zFront: -0.118, w: 0.0306, top: 0.0938, bot: 0.0526 },
		zBreech: -0.104,
		zBarrelEnd: -0.552,
		muzzleKind: 'comp',
		rBarrel: 0.0082,
		gasZ: -0.372,
		frontSightZ: -0.508,
		rearSightZ: -0.082,
		hg: { z0: -0.122, z1: -0.33, r: 0.0286 },
		handZ: -0.226,
		stockZ: 0.284,
		mag: { w: 0.0262, d: 0.072, len: 0.262, curve: 0.07, segs: 12, ribs: 6 },
		magZ: -0.072,
		magTilt: 0.05,
		topRail: true,
		optic: true,
		bayonet: false
	}
}

/** The magazine's feed arc, so lugs and ribs sit ON the curve, not beside it. */
function magAt(t, len, curve) {
	return { y: -t * len, z: -curve * t * t, tilt: Math.atan2(2 * curve * t, len) }
}

/* -------------------------------------------------------------------------- */
/*  receiver                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The stamped receiver: a 1 mm sheet-steel U-channel closed by the dust cover,
 * with a machined trunnion riveted in at each end. The rivet line and the
 * selector shelf are the whole reason it reads as stamped rather than as the
 * AR's milled aluminium box.
 */
function addReceiver(body, v) {
	const r = v.rec
	const len = r.zRear - r.zFront
	const cz = (r.zRear + r.zFront) / 2
	const h = r.top - r.bot
	const cy = (r.top + r.bot) / 2
	const hw = r.w * 0.5
	const mat = 'steel'

	/* Solid: the top is covered and the only apertures ever seen into are the
	 * ejection port and the magwell, both of which get their own cavity. */
	const shell = box(r.w, h, len, 0.0015, 2)
	body.add(shell, mat, { y: cy, z: cz })
	shell.dispose()

	/* The stamped flare where the magwell is welded in — that step carries a
	 * specular line down the whole flank. */
	const flare = box(0.0016, h * 0.44, len * 0.52, 0.0006, 1)
	body.addMirrored(flare, mat, { x: hw, y: r.bot + h * 0.3, z: cz - len * 0.1 })
	flare.dispose()

	/* Rivets: four through the flats, two higher ones through each trunnion. */
	const rivZ = [r.zFront + 0.024, r.zFront + 0.062, r.zRear - 0.07, r.zRear - 0.03]
	for (let i = 0; i < rivZ.length; i++) {
		addPin(body, mat, 0, r.bot + h * 0.34, rivZ[i], 0.0021, r.w + 0.0012)
	}
	addPin(body, mat, 0, r.top - 0.006, r.zFront + 0.012, 0.0024, r.w + 0.0014)
	addPin(body, mat, 0, r.top - 0.006, r.zRear - 0.011, 0.0024, r.w + 0.0014)

	/* Trunnions stand proud of the stamping on all four sides. */
	const trunF = box(r.w + 0.0022, h * 0.86, 0.03, 0.0014, 2)
	body.add(trunF, mat, { y: cy + 0.001, z: r.zFront + 0.015 })
	trunF.dispose()
	const trunR = box(r.w + 0.002, h * 0.9, 0.028, 0.0014, 2)
	body.add(trunR, mat, { y: cy, z: r.zRear - 0.014 })
	trunR.dispose()

	/* Selector shelf on the right flank with its safe / auto detent notches. */
	const slot = box(0.0022, 0.0075, 0.052, 0.0004, 1)
	body.add(slot, 'cavity', { x: hw - 0.0008, y: BORE - 0.0165, z: 0.006 })
	slot.dispose()
	const detent = box(0.0026, 0.0042, 0.0042, 0.0004, 1)
	body.add(detent, 'cavity', { x: hw - 0.0006, y: BORE - 0.0125, z: 0.028 })
	body.add(detent, 'cavity', { x: hw - 0.0006, y: BORE - 0.0125, z: 0.006 })
	detent.dispose()

	/* Ejection port: on an AK this is the open right-front corner under the dust
	 * cover, so a recess with a lip rather than the AR's hole with a hinged cover. */
	const portZ = -0.055
	const cav = box(0.014, 0.0155, 0.036, 0.0008, 1)
	body.add(cav, 'cavity', { x: hw - 0.005, y: BORE + 0.004, z: portZ, ry: Math.PI / 2 })
	cav.dispose()
	const lip = extrude(roundRect(0.04, 0.0195, 0.002, 3), 0.0022, { bevel: 0.0006 })
	body.add(lip, mat, { x: hw - 0.0016, y: BORE + 0.004, z: portZ, ry: Math.PI / 2 })
	lip.dispose()

	/* Magwell throat: a genuinely hollow tube tilted with the magazine, so the
	 * well is a hole when the mag animates out during a reload. */
	const m = v.mag
	const wellTop = r.bot + 0.006
	const wellBot = r.bot - 0.013
	const wellH = wellTop - wellBot
	const wellY = (wellTop + wellBot) / 2
	const wellRot = Math.PI / 2 + v.magTilt
	const well = extrude(roundRect(m.w + 0.0034, m.d + 0.0034, 0.006, 5), wellH, {
		bevel: 0.0011,
		holes: [roundRect(m.w - 0.0012, m.d - 0.0012, 0.005, 5)]
	})
	body.add(well, mat, { y: wellY, z: v.magZ, rx: wellRot })
	well.dispose()
	const liner = extrude(roundRect(m.w - 0.001, m.d - 0.001, 0.005, 5), wellH - 0.003, {
		bevel: 0.0006,
		holes: [roundRect(m.w - 0.0042, m.d - 0.0042, 0.004, 5)]
	})
	body.add(liner, 'cavity', { y: wellY, z: v.magZ, rx: wellRot })
	liner.dispose()

	/* Magazine catch: the AK's is a paddle hanging behind the well. */
	const mc = extrude(
		[
			[-0.005, 0],
			[0.007, 0],
			[0.009, -0.009],
			[0.004, -0.014],
			[-0.005, -0.012]
		],
		0.013,
		{ bevel: 0.0007 }
	)
	mc.rotateY(Math.PI / 2)
	body.add(mc, mat, { y: r.bot - 0.004, z: v.magZ + m.d * 0.5 + 0.008 })
	mc.dispose()

	/* Trigger guard. Outline is authored in the SIDE plane (first coordinate is
	 * fore/aft, second up/down) then rotated so the extrusion runs ACROSS the
	 * receiver — extruding straight out of XY stands the loop up across the gun. */
	const guard = extrude(
		[
			[-0.026, 0],
			[0.028, 0],
			[0.03, -0.006],
			[0.026, -0.021],
			[0.016, -0.026],
			[-0.019, -0.026],
			[-0.026, -0.02]
		],
		0.0168,
		{
			bevel: 0.001,
			bevelSegments: 2,
			holes: [
				[
					[-0.0205, -0.003],
					[0.0225, -0.003],
					[0.0235, -0.0078],
					[0.02, -0.0195],
					[0.013, -0.0222],
					[-0.0155, -0.0222],
					[-0.0205, -0.018]
				]
			]
		}
	)
	guard.rotateY(Math.PI / 2)
	body.add(guard, mat, { y: r.bot - 0.0035, z: -0.006 })
	guard.dispose()

	/* Rollmark on the LEFT flank — the side facing camera in the hipfire pose.
	 * Real recessed strokes, not a decal: anything sampled in world space swims
	 * as the viewmodel animates. */
	addRollmark(body, 'cavity', { x: -hw + 0.0002, y: BORE - 0.0135, z: -0.03, h: 0.0034 })
	addRollmark(body, 'cavity', {
		x: -hw + 0.0002,
		y: BORE - 0.0205,
		z: -0.032,
		h: 0.0022,
		pitch: 0.0015,
		pattern: [3, 1, 2, 0, 3, 2, 1, 0, 2, 3]
	})

	return { hw, portZ }
}

/** Ribbed dust cover: an arched pressing, not a flat lid. */
function addDustCover(body, v, zFront) {
	const r = v.rec
	const w = r.w
	const y = r.top - 0.002
	const len = r.zRear - zFront
	const cz = (r.zRear + zFront) / 2
	const mat = 'steel'

	const skin = latheZ(
		[
			[-len * 0.5, w * 0.49],
			[-len * 0.5 + 0.0018, w * 0.5],
			[len * 0.5 - 0.0018, w * 0.5],
			[len * 0.5, w * 0.49]
		],
		14,
		Math.PI * 0.06,
		Math.PI * 0.88
	)
	body.add(skin, mat, { y, z: cz })
	skin.dispose()

	const deck = box(w - 0.0022, 0.0032, len - 0.002, 0.0008, 1)
	body.add(deck, mat, { y: y + w * 0.42, z: cz })
	deck.dispose()
	const wall = box(0.0016, w * 0.44, len - 0.002, 0.0006, 1)
	body.addMirrored(wall, mat, { x: w * 0.5 - 0.0008, y: y + w * 0.2, z: cz })
	wall.dispose()

	/* Two pressed transverse swages. Shallow, but transverse, so they break the
	 * single unbroken highlight running down the top of the gun. */
	for (let i = 0; i < 2; i++) {
		const rib = blob(w - 0.004, 0.0028, 0.0075, 0.0012, 2)
		body.add(rib, mat, { y: y + w * 0.43, z: r.zRear - 0.026 - i * 0.017 })
		rib.dispose()
	}

	const lipG = box(w - 0.003, 0.009, 0.0035, 0.0008, 1)
	body.add(lipG, mat, { y: y + w * 0.3, z: r.zRear - 0.0015 })
	lipG.dispose()
	const btn = latheZ(
		[
			[0, 0],
			[0, 0.0048],
			[0.0022, 0.0052],
			[0.006, 0.0052],
			[0.006, 0]
		],
		14
	)
	body.add(btn, 'steel_bright', { y: y + w * 0.28, z: r.zRear + 0.0005 })
	btn.dispose()

	return { railTop: y + w * 0.42 + 0.0016 }
}

/**
 * Tangent rear sight. `nodes.sight` is the notch, so this is the geometry the
 * solved ADS pose aligns to the camera axis.
 */
function addRearSight(body, z) {
	const mat = 'steel'
	const base = box(0.026, 0.0125, 0.03, 0.0009, 2)
	body.add(base, mat, { y: BORE + 0.0135, z })
	base.dispose()

	/* Leaf with a real U-notch cut as a gap between two shoulders. */
	const leaf = extrude(
		[
			[-0.0115, 0],
			[0.0115, 0],
			[0.0115, 0.0078],
			[0.0032, 0.0078],
			[0.0026, 0.0042],
			[-0.0026, 0.0042],
			[-0.0032, 0.0078],
			[-0.0115, 0.0078]
		],
		0.0062,
		{ bevel: 0.0005 }
	)
	body.add(leaf, mat, { y: BORE + 0.0198, z: z - 0.008 })
	leaf.dispose()

	const ear = box(0.0032, 0.0105, 0.026, 0.0005, 1)
	body.addMirrored(ear, mat, { x: 0.0112, y: BORE + 0.0215, z })
	ear.dispose()

	const slider = box(0.021, 0.005, 0.009, 0.0008, 1)
	body.add(slider, 'steel_bright', { y: BORE + 0.0205, z: z + 0.009 })
	slider.dispose()
	const thumb = box(0.008, 0.0045, 0.0035, 0.0006, 1)
	body.add(thumb, 'steel_bright', { y: BORE + 0.0235, z: z + 0.0125 })
	thumb.dispose()

	addRollmark(body, 'cavity', {
		x: -0.0128,
		y: BORE + 0.0165,
		z: z + 0.008,
		h: 0.0022,
		pitch: 0.0022,
		count: 7,
		pattern: [2, 1, 2, 1, 2, 1, 2]
	})

	return { notch: [0, BORE + 0.0233, z - 0.008] }
}

/**
 * The gas block. An AK-74 block is CANTED: gas is bled at 45 degrees, so it is a
 * rolled wedge with the relief ports on its upper flank, not a symmetric box
 * like an AR's. That cant is the detail that identifies the front end of a
 * Kalashnikov, so it is real rotated geometry with real vent holes.
 *
 * Sooted, not phosphated: the gas system vents combustion products by design.
 */
function addGasBlock(body, v, tubeTo) {
	const z = v.gasZ
	const r = v.rBarrel
	const mat = 'steel_soot'

	const collar = latheZ(
		[
			[0, r + 0.0008],
			[0, r + 0.0062],
			[0.0022, r + 0.007],
			[0.0245, r + 0.007],
			[0.0268, r + 0.0058],
			[0.0268, r + 0.0008]
		],
		18
	)
	body.add(collar, mat, { y: BORE, z: z + 0.0134 })
	collar.dispose()

	/* Tower authored upright, then rolled 45 deg so the take-off points up-left. */
	const tower = extrude(
		[
			[-0.0092, 0],
			[0.0092, 0],
			[0.0082, 0.0155],
			[0.0044, 0.0205],
			[-0.0044, 0.0205],
			[-0.0082, 0.0155]
		],
		0.024,
		{ bevel: 0.0009, bevelSegments: 2 }
	)
	body.add(tower, mat, { y: BORE + 0.002, z: z + 0.012, rz: -Math.PI / 4 })
	tower.dispose()

	for (let i = 0; i < 2; i++) {
		const vent = rodZ(0.0021, 0.0021, 0.014, 10, 0.0003)
		body.add(vent, 'cavity', {
			x: -0.0092,
			y: BORE + 0.0155,
			z: z + 0.006 + i * 0.012,
			ry: Math.PI / 2,
			rz: -Math.PI / 4
		})
		vent.dispose()
	}

	/* Gas tube back over the barrel into the receiver, plus its lock lever. */
	const tubeLen = tubeTo - z
	const tube = tubeZ(0.0076, 0.0058, Math.abs(tubeLen), 16, 0.0004)
	body.add(tube, 'steel', { y: BORE + 0.0175, z: z + tubeLen / 2 })
	tube.dispose()
	const lever = box(0.0075, 0.0125, 0.012, 0.0008, 1)
	body.add(lever, 'steel_bright', { x: 0.0085, y: BORE + 0.0165, z: z + 0.0125 })
	lever.dispose()

	const retain = latheZ(
		[
			[0, r + 0.0068],
			[0, r + 0.0105],
			[0.0035, r + 0.0105],
			[0.0035, r + 0.0068]
		],
		16
	)
	body.add(retain, 'steel', { y: BORE, z: z + 0.027 })
	retain.dispose()
}

/** Front sight block: hooded post, cleaning-rod channel, bayonet lug. */
function addFrontSight(body, v) {
	const z = v.frontSightZ
	const r = v.rBarrel
	const mat = 'steel'

	const base = latheZ(
		[
			[0, r + 0.0008],
			[0, r + 0.0055],
			[0.0022, r + 0.0064],
			[0.0195, r + 0.0064],
			[0.0218, r + 0.0052],
			[0.0218, r + 0.0008]
		],
		18
	)
	body.add(base, mat, { y: BORE, z: z + 0.0109 })
	base.dispose()

	/* The bridge over the ears is what makes it a HOODED sight; an open post
	 * between two ears is an AR front sight. */
	const parts = []
	const ear = box(0.0034, 0.019, 0.0165, 0.0006, 1)
	for (const sx of [-1, 1]) {
		const g = ear.clone()
		g.translate(sx * 0.0082, 0.0095, 0)
		parts.push(g)
	}
	ear.dispose()
	const bridge = box(0.0198, 0.0032, 0.0165, 0.0006, 1)
	bridge.translate(0, 0.0205, 0)
	parts.push(bridge)
	const post = rodZ(0.0013, 0.0011, 0.0135, 8, 0.0002)
	post.rotateX(Math.PI / 2)
	post.translate(0, 0.0088, 0)
	parts.push(post)
	const hood = mergeAll(parts)
	body.add(hood, mat, { y: BORE + r + 0.0055, z })
	hood.dispose()

	const rodHole = rodZ(0.0022, 0.0022, 0.022, 10, 0.0003)
	body.add(rodHole, 'cavity', { y: BORE - r - 0.0042, z: z + 0.0109 })
	rodHole.dispose()

	if (v.bayonet) {
		const lug = extrude(
			[
				[-0.0105, 0],
				[0.0105, 0],
				[0.0105, -0.0062],
				[0.004, -0.0092],
				[-0.004, -0.0092],
				[-0.0105, -0.0062]
			],
			0.007,
			{ bevel: 0.0006 }
		)
		lug.rotateY(Math.PI / 2)
		body.add(lug, mat, { y: BORE - r - 0.0055, z: z + 0.004 })
		lug.dispose()
	}
}

/**
 * Two-piece furniture, as on the real rifle and unlike the AR's single tube: a
 * LOWER handguard with the palm swell and finger ribs, and an UPPER capping the
 * gas tube. The gap between them, with barrel and gas tube visible through it,
 * is a large part of the AK's read.
 */
function addHandguard(body, v) {
	const mat = v.furniture
	const z0 = v.hg.z0
	const z1 = v.hg.z1
	const r = v.hg.r
	const len = z0 - z1
	const cz = (z0 + z1) / 2

	/* Lower: a lathe arc, so a genuine curved trough. */
	const lower = latheZ(
		[
			[-len * 0.5, r * 0.86],
			[-len * 0.5 + 0.004, r],
			[-len * 0.5 + 0.03, r * 1.03],
			[len * 0.06, r * 1.06],
			[len * 0.5 - 0.03, r * 1.02],
			[len * 0.5 - 0.004, r * 0.98],
			[len * 0.5, r * 0.86]
		],
		18,
		Math.PI * 1.06,
		Math.PI * 0.88
	)
	body.add(lower, mat, { y: BORE, z: cz })
	lower.dispose()
	const liner = latheZ(
		[
			[-len * 0.5 + 0.003, r * 0.8],
			[len * 0.5 - 0.003, r * 0.8]
		],
		18,
		Math.PI * 1.06,
		Math.PI * 0.88
	)
	body.add(liner, 'cavity', { y: BORE, z: cz })
	liner.dispose()

	/* Palm swell: the surface the fingertip contact solve actually grips. */
	const swell = blob(r * 1.95, r * 0.9, len * 0.5, 0.008, 3)
	body.add(swell, mat, { y: BORE - r * 0.72, z: v.handZ })
	swell.dispose()

	for (let i = 0; i < 6; i++) {
		const rib = blob(r * 1.5, 0.0026, 0.006, 0.0011, 2)
		body.add(rib, mat, { y: BORE - r * 1.14, z: z0 - (0.16 + i * 0.135) * len })
		rib.dispose()
	}

	const ferrule = latheZ(
		[
			[0, r * 0.84],
			[0, r * 1.12],
			[0.0045, r * 1.12],
			[0.0045, r * 0.84]
		],
		18,
		Math.PI * 1.04,
		Math.PI * 0.92
	)
	body.add(ferrule, 'steel', { y: BORE, z: z0 - 0.0045 })
	ferrule.dispose()

	/* Upper, over the gas tube, with real vent slots through the flanks. */
	const uz0 = z0 - 0.006
	const uz1 = z1 + 0.006
	const uLen = uz0 - uz1
	const upper = latheZ(
		[
			[-uLen * 0.5, 0.0098],
			[-uLen * 0.5 + 0.004, 0.0122],
			[uLen * 0.5 - 0.004, 0.0122],
			[uLen * 0.5, 0.0098]
		],
		16,
		Math.PI * 0.08,
		Math.PI * 0.84
	)
	body.add(upper, mat, { y: BORE + 0.0175, z: (uz0 + uz1) / 2 })
	upper.dispose()
	for (let i = 0; i < 3; i++) {
		const sz = uz0 - 0.028 - i * 0.03
		if (sz < uz1 + 0.02) break
		const slot = box(0.0035, 0.0055, 0.016, 0.0006, 1)
		body.addMirrored(slot, 'cavity', { x: 0.0108, y: BORE + 0.0175, z: sz })
		slot.dispose()
	}
}

/**
 * The buttstock: a straight taper from the rear trunnion to the butt plate, a
 * lightening groove down each flank, a sling slot through the toe and a steel
 * butt plate with the cleaning-kit trap. Nothing like the AR's buffer tube plus
 * sliding shell, so it is built from its own side profile.
 */
function addStock(body, v) {
	const mat = v.furniture
	const zFront = v.rec.zRear
	const zRear = v.stockZ
	const len = zRear - zFront
	const cz = (zFront + zRear) / 2
	const axis = BORE - 0.012

	const shell = extrude(
		[
			[-len * 0.5, axis + 0.019],
			[-len * 0.5 + 0.03, axis + 0.024],
			[len * 0.5 - 0.014, axis + 0.029],
			[len * 0.5, axis + 0.024],
			[len * 0.5, axis - 0.03],
			[len * 0.5 - 0.012, axis - 0.036],
			[-len * 0.5 + 0.052, axis - 0.03],
			[-len * 0.5 + 0.014, axis - 0.019],
			[-len * 0.5, axis - 0.014]
		],
		0.039,
		{ bevel: 0.0035, bevelSegments: 2 }
	)
	shell.rotateY(Math.PI / 2)
	body.add(shell, mat, { z: cz })
	shell.dispose()

	const groove = blob(0.006, 0.019, len * 0.56, 0.005, 3)
	body.addMirrored(groove, 'cavity', { x: 0.0192, y: axis - 0.004, z: cz + 0.006 })
	groove.dispose()

	const slot = box(0.042, 0.0075, 0.019, 0.0012, 2)
	body.add(slot, 'cavity', { y: axis - 0.026, z: zFront + 0.052 })
	slot.dispose()
	addSlingLoop(body, 'steel', 0, axis - 0.026, zFront + 0.052, 0.0085, {
		rx: Math.PI / 2,
		ry: Math.PI / 2
	})

	const plate = extrude(roundRect(0.04, 0.062, 0.005, 4), 0.005, { bevel: 0.001 })
	body.add(plate, 'steel', { y: axis - 0.003, z: zRear - 0.0015, rx: 0.05 })
	plate.dispose()
	const trap = box(0.02, 0.026, 0.0022, 0.0008, 1)
	body.add(trap, 'steel_bright', { y: axis + 0.004, z: zRear + 0.0022, rx: 0.05 })
	trap.dispose()
	const hinge = rodZ(0.0013, 0.0013, 0.021, 8, 0.0003)
	body.add(hinge, 'steel', { y: axis + 0.017, z: zRear + 0.002, ry: Math.PI / 2 })
	hinge.dispose()
	const shim = box(0.038, 0.058, 0.0022, 0.0008, 1)
	body.add(shim, 'rubber', { y: axis - 0.003, z: zRear - 0.0045, rx: 0.05 })
	shim.dispose()

	addQdSocket(body, mat, 'steel', -0.02, axis + 0.006, zFront + 0.03, 'x', 0.005)
}

/* -------------------------------------------------------------------------- */
/*  magazine                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * THE рожковый MAGAZINE — the "little horn", the curved banana mag. This is the
 * part that carries the whole silhouette.
 *
 * An AR magazine has a 30 mm sagitta over 212 mm and reads as very nearly
 * straight. A 5.45 AK magazine has 58 mm over 232 mm — more than double the
 * curvature, and from the side it is unmistakable. buildMagazine already lofts a
 * curved body from a sagitta, so the curve is a parameter; what has to be added
 * is the AK hardware: the front rocking hook, the rear locking lug, and the
 * horizontal reinforcing ribs down the front face.
 *
 * Witness holes are OFF: a steel or plum AK mag has none, and four dark slots
 * down the flank of one is an AR tell.
 */
function buildAkMagazine(v) {
	const m = v.mag
	const poly = v.furniture
	const magazine = new Assembly(v.id + '-mag')
	const mag = buildMagazine(magazine, null, {
		w: m.w,
		d: m.d,
		len: m.len,
		curve: m.curve,
		segs: m.segs,
		witness: 0,
		poly,
		caseLen: R545.caseLen,
		rimR: R545.rimR,
		bulletLen: R545.bulletLen
	})

	/* Front rocking hook, on the arc and tilted to the local tangent. */
	const hp = magAt(0.1, m.len, m.curve)
	const hook = extrude(
		[
			[-0.0052, 0],
			[0.0052, 0],
			[0.0062, -0.0058],
			[-0.0062, -0.0058]
		],
		m.w * 0.86,
		{ bevel: 0.0006 }
	)
	hook.rotateY(Math.PI / 2)
	magazine.add(hook, poly, { y: hp.y, z: hp.z - m.d * 0.5 - 0.0026, rx: hp.tilt })
	hook.dispose()

	/* Rear locking lug — 8 mm proud and clearly visible below the well. */
	const lp = magAt(0.14, m.len, m.curve)
	const lug = extrude(
		[
			[-0.0068, 0],
			[0.0068, 0],
			[0.0068, -0.0105],
			[0.003, -0.0132],
			[-0.003, -0.0132],
			[-0.0068, -0.0105]
		],
		m.w * 0.7,
		{ bevel: 0.0007 }
	)
	lug.rotateY(Math.PI / 2)
	magazine.add(lug, poly, { y: lp.y, z: lp.z + m.d * 0.5 + 0.0034, rx: lp.tilt })
	lug.dispose()

	/* Horizontal reinforcing ribs across the front face. */
	for (let i = 0; i < m.ribs; i++) {
		const t = 0.26 + (i / Math.max(1, m.ribs - 1)) * 0.56
		const p = magAt(t, m.len, m.curve)
		const rib = box(m.w * 0.92, 0.0026, 0.0038, 0.0006, 1)
		magazine.add(rib, poly, { y: p.y, z: p.z - m.d * 0.5 + 0.0004, rx: p.tilt })
		rib.dispose()
	}

	return { magazine, mag }
}

/**
 * Bolt carrier with the charging handle INTEGRAL and on the RIGHT, which is how
 * the real mechanism works — so the handle travels with the carrier instead of
 * being a separate animated part like the AR's.
 */
function buildAkBolt(v) {
	const bolt = new Assembly(v.id + '-bolt')
	const r = 0.0132
	const len = 0.086

	const carrier = latheZ(
		[
			[0, r * 0.55],
			[0, r],
			[0.002, r + 0.0004],
			[len * 0.46, r + 0.0004],
			[len * 0.48, r],
			[len, r],
			[len, r * 0.5]
		],
		18
	)
	bolt.add(carrier, 'steel_bright', { z: 0, ry: Math.PI })
	carrier.dispose()

	/* The carrier's gas piston rides forward above the bore. */
	const piston = rodZ(0.0062, 0.0062, 0.03, 14, 0.0005)
	bolt.add(piston, 'steel_soot', { y: r + 0.0072, z: -len * 0.52 })
	piston.dispose()

	/* The charging handle: a stub arm out to the right ending in a knurled bar. */
	const arm = box(0.018, 0.0075, 0.011, 0.0008, 1)
	bolt.add(arm, 'steel_bright', { x: r + 0.006, y: 0.0025, z: len * 0.2 })
	arm.dispose()
	const bar = box(0.0095, 0.0115, 0.026, 0.0012, 2)
	bolt.add(bar, 'steel_bright', { x: r + 0.017, y: 0.0025, z: len * 0.2 })
	bar.dispose()

	/* A round in the chamber. The cartridge is authored base-at-0 running +Z, so
	 * ry=PI turns it muzzle-forward; pushed far enough forward that only the case
	 * head shows in the port. */
	const c = cartridge(R545.caseLen, R545.rimR, R545.bulletLen)
	bolt.add(c.brass, 'brass', { z: -0.086, ry: Math.PI })
	c.brass.dispose()
	c.bullet.dispose()

	return bolt
}

/** The AK safety lever: the big stamped paddle on the right flank. */
function buildAkSelector(v) {
	const selector = new Assembly(v.id + '-selector')
	const parts = []
	const shaft = rodZ(0.0034, 0.0034, 0.026, 12, 0.0004)
	shaft.rotateY(Math.PI / 2)
	parts.push(shaft)
	const paddle = extrude(
		[
			[0, -0.0045],
			[0.03, -0.008],
			[0.034, 0],
			[0.03, 0.007],
			[0, 0.0055]
		],
		0.0028,
		{ bevel: 0.0006 }
	)
	paddle.rotateY(Math.PI / 2)
	paddle.translate(0.0155, 0, 0)
	parts.push(paddle)
	const geo = mergeAll(parts)
	selector.add(geo, 'steel', {})
	geo.dispose()
	return selector
}

/* -------------------------------------------------------------------------- */
/*  the assembly                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Compile one Kalashnikov.
 *
 * @param {string} variant  'ak' (AK-74M/N pattern) or 'rpk' (RPK-16 pattern)
 * @returns a model description in the shape Viewmodel.addWeapon expects
 */
export function buildKalashnikov(variant = 'ak') {
	const v = KALASHNIKOV_VARIANTS[variant] ?? KALASHNIKOV_VARIANTS.ak
	const body = new Assembly(v.id + '-body')

	const rec = addReceiver(body, v)
	const cover = addDustCover(body, v, v.rearSightZ + 0.012)

	addBarrel(body, 'steel', 'cavity', {
		y: BORE,
		zBreech: v.zBreech,
		zMuzzle: v.zBarrelEnd,
		rChamber: v.rBarrel + 0.0033,
		rBarrel: v.rBarrel,
		rGas: v.rBarrel + 0.002,
		gasAt: v.gasZ
	})
	const muzzle = addMuzzleDevice(
		body,
		'steel_soot',
		'cavity',
		v.muzzleKind,
		v.zBarrelEnd,
		v.rBarrel,
		BORE
	)

	addGasBlock(body, v, v.rec.zFront + 0.008)
	addFrontSight(body, v)
	const sight = addRearSight(body, v.rearSightZ)
	addHandguard(body, v)
	addStock(body, v)

	/* AK grip: shorter and more vertical than the AR's 0.38 rad rake, but placed
	 * at the same origin so the proven gripR wrist target still lands. */
	addPistolGrip(body, v.furniture, 'rubber', {
		y: 0.035,
		z: 0.015,
		angle: 0.34,
		len: 0.104,
		w: 0.0305
	})

	/* Optic only where the real weapon carries a rail. */
	let optic = null
	if (v.topRail) {
		addRail(body, 'alu', v.rearSightZ + 0.014, v.rec.zRear - 0.006, cover.railTop)
	}
	if (v.optic) {
		optic = buildOptic(body, {
			rTube: 0.0155,
			len: 0.052,
			hood: 0.007,
			y: cover.railTop + 0.028,
			z: -0.03,
			railTop: cover.railTop,
			matBody: 'alu_fine',
			matSteel: 'steel'
		})
	}

	/* ---- moving parts ---- */
	const built = buildAkMagazine(v)
	const bolt = buildAkBolt(v)
	const selector = buildAkSelector(v)
	const trigger = new Assembly(v.id + '-trigger')
	const trg = triggerPart('steel_bright')
	trigger.add(trg.geo, 'steel_bright', {})
	trg.geo.dispose()

	const gripL = supportGrip(v.hg.r, v.handZ)

	return {
		id: v.id,
		label: v.label,
		fxClass: 'carbine',
		body,
		moving: { magazine: built.magazine, bolt, trigger, selector },
		nodes: {
			muzzle: [0, BORE, muzzle.crownZ],
			chamber: [0, BORE, rec.portZ],
			eject: [rec.hw + 0.008, BORE + 0.004, rec.portZ],
			/* An AK throws brass hard right and well forward. */
			ejectDir: [0.9, 0.42, -0.12],
			/* With no optic the sight node is the rear notch, which is what the
			 * solved ADS pose puts on the camera axis. */
			sight: optic ? [0, cover.railTop + 0.028, optic.lensZ] : sight.notch.slice(),
			sightAxis: [0, 0, -1],
			ironSight: sight.notch.slice(),
			/* Shooting hand: the AR's solved wrist target, reused because the grip is
			 * at the same origin with a near-identical rake. */
			gripR: {
				pos: [0.0251, 0.06, 0.1223],
				finger: [0.05, -0.55, -0.833],
				back: [1, 0.03, 0.04]
			},
			gripL,
			/* Collision profile for the build-time fingertip contact solve. The AK
			 * handguard is a trough rather than a full tube, but its gripping surface
			 * is on the bore axis, so the cylinder is the right approximation. */
			handguard: {
				axis: [0, BORE, 0],
				dir: [0, 0, 1],
				r: v.hg.r,
				z0: v.hg.z0,
				z1: v.hg.z1
			},
			magSeat: { pos: [0, v.rec.bot + 0.0075, v.magZ], rot: [v.magTilt, 0, 0] },
			magDrop: [0, -0.4, 0.02],
			/* No `charging` moving part: the handle is part of the carrier. These
			 * nodes still exist so clips.js routes the empty reload down the
			 * charging-handle path (reach right, pull, release) instead of the
			 * pistol's rack-the-slide-from-above path. */
			chargeRest: { pos: [rec.hw + 0.017, BORE + 0.0025, 0.0172], rot: [0, 0, 0] },
			chargePull: [0, 0, 0.058],
			boltRest: { pos: [0, BORE, 0.018], rot: [0, 0, 0] },
			boltTravel: [0, 0, 0.058],
			triggerPivot: { pos: [0, v.rec.bot - 0.0084, -0.006], rot: [0, 0, 0] },
			triggerPull: -0.32,
			selectorPivot: { pos: [rec.hw - 0.004, BORE - 0.0145, 0.017], rot: [0, 0, 0] },
			opticGlass: optic
		},
		shell: { caseLen: R545.caseLen, rimR: R545.rimR },
		magSize: { len: built.mag.len, w: built.mag.w, d: built.mag.d }
	}
}

/**
 * Viewmodel defs for the two variants.
 *
 * Derived from WEAPON_DEFS.rifle so the hip / sprint / low-ready poses stay on
 * the frame that was solved from the bore axis (see defs.js), with only the
 * things that genuinely differ overridden:
 *
 *   magLen      the banana mag is longer than a STANAG and the reload clips
 *               place the support hand off it
 *   eyeRelief   irons want the rear notch close to the eye; the RPK's rail optic
 *               wants a real tube relief
 *   recoil      7.62-era gas system on a 5.45 bolt: more muzzle rise and more
 *               roll than an AR, and a slower, heavier return
 *   rpm         cycleTime falls out of this in Viewmodel._updateParts
 */
const RIFLE = WEAPON_DEFS.rifle

export const KALASHNIKOV_DEFS = {
	ak: {
		...RIFLE,
		id: 'ak',
		label: 'АК-74М',
		class: 'carbine',
		caliber: '5.45x39',
		rpm: 650,
		modes: ['auto', 'semi'],
		magSize: 30,
		magLen: 0.232,
		eyeRelief: 0.088,
		adsTime: 0.245,
		reloadTac: 2.35,
		reloadEmpty: 3.05,
		drawTime: 0.66,
		swayScale: 1.04,
		bobScale: 1.02,
		recoil: {
			...RIFLE.recoil,
			pitch: 0.0104,
			yaw: 0.0029,
			kickBack: 0.0225,
			kickUp: 0.0088,
			roll: 0.041,
			freq: 7.6,
			damping: 0.46,
			patternSeed: 0x4b7412
		}
	},
	rpk: {
		...RIFLE,
		id: 'rpk',
		label: 'РПК-16',
		class: 'lmg',
		caliber: '5.45x39',
		rpm: 700,
		modes: ['auto', 'semi'],
		magSize: 45,
		magLen: 0.262,
		eyeRelief: 0.112,
		adsTime: 0.285,
		reloadTac: 2.6,
		reloadEmpty: 3.35,
		drawTime: 0.78,
		/* Heavier weapon: less idle wander, more settled bob. */
		swayScale: 0.88,
		bobScale: 0.94,
		recoil: {
			...RIFLE.recoil,
			pitch: 0.0082,
			yaw: 0.0024,
			kickBack: 0.0198,
			kickUp: 0.0072,
			roll: 0.033,
			freq: 6.9,
			damping: 0.52,
			patternSeed: 0x7d1f60
		}
	}
}

export default buildKalashnikov
