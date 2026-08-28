/* ==========================================================================
 * Escape-From-Larpov · src/weapons/models/kalashnikov.js
 *
 * KALASHNIKOV COMPOSITE VIEWMODEL ASSEMBLY.
 *
 * The AK family used to borrow models/rifle.js. That model is an AR-15: a
 * free-float aluminium handguard, a flat-top upper with a 21.2 mm Picatinny
 * deck, a cantilever tube red dot and a collapsible buffer-tube stock. Not one
 * line of that silhouette is a Kalashnikov, and VIEWMODEL_KIND mapping every
 * ak74m / aks74u / ak101 / rpk16 onto it is precisely what put "an M4 frame in
 * the player's hands" whatever the inventory actually held.
 *
 * This module compiles a real AK from the same modular primitives the rest of
 * the subsystem uses, in ONE parametric pass, so AK-74M/N and RPK-16 are two
 * configurations of one assembly rather than two hand-built models:
 *
 *   - a STAMPED sheet-steel receiver: flat flanks, the visible rivet line, the
 *     long selector slot on the right, front and rear trunnions, and a genuinely
 *     hollow magwell throat so the well is a hole when the magazine drops
 *   - the RIBBED DUST COVER and the tangent REAR SIGHT BLOCK ahead of it
 *   - the canted GAS BLOCK with its relief ports and the gas tube running back
 *     over the barrel into the receiver
 *   - the FRONT SIGHT BLOCK with a hooded post, cleaning-rod channel and
 *     bayonet lug
 *   - LOWER + UPPER handguards carrying the palm swell and the finger ribs, in
 *     laminate-brown (`polymer_tan`) or black (`polymer`) furniture
 *   - the рожковый CURVED BANANA magazine: a real 58 mm sagitta over 232 mm,
 *     with the front hook and the rear locking lug that seat it in the well,
 *     and the horizontal reinforcing ribs down the front face
 *   - the AK BUTTSTOCK with its lightening groove and butt-plate trap
 *   - a BOLT CARRIER whose charging handle is integral and on the RIGHT, so it
 *     travels with the carrier exactly as the real mechanism does
 *
 * WHY THE AK GETS IRON SIGHTS AND THE RPK GETS A RAIL
 * The single most recognisable thing about an AK-74 at hipfire framing is the
 * gas block / front sight block / brake stack on top of a bare barrel — putting
 * a tube optic over it hides the whole read. So the AK ships irons (which is
 * also what makes `nodes.sight` the rear notch, and what leaves `opticGlass`
 * null so Viewmodel._updateReticle correctly hides the dot). The RPK-16 really
 * does ship a full-length dust-cover rail, so it gets the rail and an optic.
 *
 * Weapon-local space, as everywhere else in this subsystem: +X right, +Y up,
 * -Z toward the muzzle, origin at the web of the shooting thumb (top-rear of
 * the pistol grip).
 * ========================================================================== */

import {
	Assembly,
	box,
	blob,
	dome,
	extrude,
	roundRect,
	latheZ,
	tubeZ,
	rodZ,
	ring,
	knurlBand,
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
	addScrew,
	buildMagazine,
	buildOptic,
	triggerPart,
	cartridge
} from '../parts.js'
import { WEAPON_DEFS } from '../defs.js'

const TAU = Math.PI * 2

/* 5.45x39. Case 39.82 mm, rim 10 mm across, 5.45 mm bullet standing ~22 mm out
 * of the neck — the round the magazine curve and the chambered case are cut to. */
const R545 = { caseLen: 0.0397, rimR: 0.005, bulletLen: 0.0225 }

/**
 * The two configurations.
 *
 * Everything that differs between an AK-74M and an RPK-16 lives here, so
 * `buildKalashnikov` itself has no variant branches beyond reading this table.
 * The RPK is the squad automatic: a longer, heavier barrel, a longer handguard,
 * a 45-round magazine with more curve, black polymer furniture, and the rail.
 */
export const KALASHNIKOV_VARIANTS = {
	ak: {
		id: 'ak',
		label: 'АК-74М',
		fxClass: 'carbine',
		/* Laminate-brown furniture. `polymer_tan` is the FDE/coyote entry in
		 * materials.js (tint 0.62/0.498/0.358) and it is the only warm dielectric in
		 * the set, so it is what reads as AK wood/plum against the cool stamped
		 * steel. Inventing a 'wood' key would resolve to undefined and render white. */
		furniture: 'polymer_tan',
		receiver: { zRear: 0.086, zFront: -0.114, w: 0.0298, top: 0.0932, bot: 0.0532 },
		zBreech: -0.1,
		zBarrelEnd: -0.474,
		muzzleKind: 'brake',
		rBarrel: 0.0072,
		gasZ: -0.296,
		frontSightZ: -0.43,
		hg: { z0: -0.118, z1: -0.246, r: 0.0272 },
		handZ: -0.184,
		stockZ: 0.272,
		mag: { w: 0.0255, d: 0.068, len: 0.232, curve: 0.058, segs: 10, ribs: 5 },
		topRail: false,
		optic: false,
		bayonet: true,
		rpm: 650
	},
	rpk: {
		id: 'rpk',
		label: 'РПК-16',
		fxClass: 'carbine',
		furniture: 'polymer',
		receiver: { zRear: 0.09, zFront: -0.118, w: 0.0306, top: 0.0938, bot: 0.0526 },
		zBreech: -0.104,
		zBarrelEnd: -0.552,
		muzzleKind: 'comp',
		rBarrel: 0.0082,
		gasZ: -0.372,
		frontSightZ: -0.508,
		hg: { z0: -0.122, z1: -0.33, r: 0.0286 },
		handZ: -0.226,
		stockZ: 0.284,
		mag: { w: 0.0262, d: 0.072, len: 0.262, curve: 0.07, segs: 12, ribs: 6 },
		topRail: true,
		optic: true,
		bayonet: false,
		rpm: 700
	}
}

/**
 * The magazine's feed curve, shared with parts.js buildMagazine so lugs and ribs
 * can be placed ON the arc instead of beside it.
 *
 * y runs down, z bows forward (-Z), and `tilt` is the local tangent so a part
 * placed at t sits flush against the body rather than shearing through it.
 */
function magAt(t, len, curve) {
	return { y: -t * len, z: -curve * t * t, tilt: Math.atan2(2 * curve * t, len) }
}

/* -------------------------------------------------------------------------- */
/*  receiver                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The stamped receiver.
 *
 * An AK receiver is a 1 mm sheet-steel U-channel, open on top, closed by the
 * dust cover, with a machined trunnion riveted in at each end. The rivets are
 * not decoration: four heads in a line down each flank, plus the selector-slot
 * shelf, are the entire reason a stamped receiver reads as stamped rather than
 * as a milled aluminium box like the AR's.
 */
function addAkReceiver(body, matSteel, o) {
	const bore = o.bore
	const zRear = o.zRear
	const zFront = o.zFront
	const w = o.w
	const top = o.top
	const bot = o.bot
	const len = zRear - zFront
	const cz = (zRear + zFront) / 2
	const h = top - bot
	const cy = (top + bot) / 2
	const hw = w * 0.5

	/* Main body. Kept solid: the top is covered by the dust cover and the only
	 * apertures that are ever seen into are the ejection port and the magwell,
	 * both of which get their own cavity below. */
	const shell = box(w, h, len, 0.0015, 2)
	body.add(shell, matSteel, { y: cy, z: cz })
	shell.dispose()

	/* The stamped flare over the magwell — the receiver widens very slightly
	 * where the well is spot-welded in, and that step catches a specular line
	 * down the whole flank. */
	const flare = box(0.0016, h * 0.44, len * 0.52, 0.0006, 1)
	body.addMirrored(flare, matSteel, { x: hw, y: bot + h * 0.3, z: cz - len * 0.1 })
	flare.dispose()

	/* Rivet line: four per flank, through the flats, plus the two trunnion rivets
	 * at each end which sit higher. */
	const rivZ = [zFront + 0.024, zFront + 0.062, zRear - 0.07, zRear - 0.03]
	for (let i = 0; i < rivZ.length; i++) {
		addPin(body, matSteel, 0, bot + h * 0.34, rivZ[i], 0.0021, w + 0.0012)
	}
	addPin(body, matSteel, 0, top - 0.006, zFront + 0.012, 0.0024, w + 0.0014)
	addPin(body, matSteel, 0, top - 0.006, zRear - 0.011, 0.0024, w + 0.0014)

	/* Front trunnion: the machined block the barrel is pressed into. It stands
	 * proud of the stamping on all four sides. */
	const trunF = box(w + 0.0022, h * 0.86, 0.03, 0.0014, 2)
	body.add(trunF, matSteel, { y: cy + 0.001, z: zFront + 0.015 })
	trunF.dispose()
	/* Rear trunnion / stock socket. */
	const trunR = box(w + 0.002, h * 0.9, 0.028, 0.0014, 2)
	body.add(trunR, matSteel, { y: cy, z: zRear - 0.014 })
	trunR.dispose()

	/* SELECTOR SLOT. The long milled shelf on the right flank that the safety
	 * lever rides in, with its two detent notches (safe up, full-auto middle).
	 * Cut in `cavity` so it is a recess rather than a raised strip. */
	const slot = box(0.0022, 0.0075, 0.052, 0.0004, 1)
	body.add(slot, 'cavity', { x: hw - 0.0008, y: bore - 0.0165, z: 0.006 })
	slot.dispose()
	const detent = box(0.0026, 0.0042, 0.0042, 0.0004, 1)
	body.add(detent, 'cavity', { x: hw - 0.0006, y: bore - 0.0125, z: 0.028 })
	body.add(detent, 'cavity', { x: hw - 0.0006, y: bore - 0.0125, z: 0.006 })
	detent.dispose()

	/* EJECTION PORT. On an AK the port is the open right-front corner under the
	 * dust cover, so it is a shallow recess with a lip rather than the AR's
	 * rectangular hole with a hinged cover. */
	const portZ = o.portZ
	const cav = box(0.014, 0.0155, 0.036, 0.0008, 1)
	body.add(cav, 'cavity', { x: hw - 0.005, y: bore + 0.004, z: portZ, ry: Math.PI / 2 })
	cav.dispose()
	const lip = extrude(roundRect(0.04, 0.0195, 0.002, 3), 0.0022, { bevel: 0.0006 })
	body.add(lip, matSteel, { x: hw - 0.0016, y: bore + 0.004, z: portZ, ry: Math.PI / 2 })
	lip.dispose()

	/* MAGWELL THROAT. A real hollow tube, tilted forward with the magazine, so
	 * that when the mag animates out during a reload the well is a hole and not a
	 * painted rectangle. Same construction as the AR's, different proportions:
	 * the AK well is shallower and much closer to vertical. */
	const magW = o.magW
	const magD = o.magD
	const magTilt = o.magTilt
	const wellTop = bot + 0.006
	const wellBot = bot - 0.013
	const wellH = wellTop - wellBot
	const well = extrude(roundRect(magW + 0.0034, magD + 0.0034, 0.006, 5), wellH, {
		bevel: 0.0011,
		holes: [roundRect(magW - 0.0012, magD - 0.0012, 0.005, 5)]
	})
	body.add(well, matSteel, {
		y: (wellTop + wellBot) / 2,
		z: o.magZ,
		rx: Math.PI / 2 + magTilt
	})
	well.dispose()
	const liner = extrude(roundRect(magW - 0.001, magD - 0.001, 0.005, 5), wellH - 0.003, {
		bevel: 0.0006,
		holes: [roundRect(magW - 0.0042, magD - 0.0042, 0.004, 5)]
	})
	body.add(liner, 'cavity', {
		y: (wellTop + wellBot) / 2,
		z: o.magZ,
		rx: Math.PI / 2 + magTilt
	})
	liner.dispose()

	/* The magazine catch: the AK's is a paddle hanging behind the well, worked by
	 * the trigger finger or the mag itself on the way in. */
	const catchBody = extrude(
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
	catchBody.rotateY(Math.PI / 2)
	body.add(catchBody, matSteel, { y: bot - 0.004, z: o.magZ + magD * 0.5 + 0.008 })
	catchBody.dispose()

	/* TRIGGER GUARD. Authored in the weapon's SIDE plane (first coordinate is
	 * fore/aft, second is up/down) and then rotated so the extrusion runs ACROSS
	 * the receiver — extruding straight out of XY would stand the loop up across
	 * the gun like a trigger-shaped cattle guard. */
	const guardOuter = [
		[-0.026, 0],
		[0.028, 0],
		[0.03, -0.006],
		[0.026, -0.021],
		[0.016, -0.026],
		[-0.019, -0.026],
		[-0.026, -0.02]
	]
	const guardInner = [
		[-0.0205, -0.003],
		[0.0225, -0.003],
		[0.0235, -0.0078],
		[0.02, -0.0195],
		[0.013, -0.0222],
		[-0.0155, -0.0222],
		[-0.0205, -0.018]
	]
	const guard = extrude(guardOuter, 0.0168, {
		bevel: 0.001,
		bevelSegments: 2,
		holes: [guardInner]
	})
	guard.rotateY(Math.PI / 2)
	body.add(guard, matSteel, { y: bot - 0.0035, z: -0.006 })
	guard.dispose()

	/* Rollmark on the left flank — the side that faces the camera in the hipfire
	 * pose. Modelled as recessed strokes rather than a decal for the same reason
	 * the AR's is: anything sampled in world space swims as the viewmodel moves. */
	addRollmark(body, 'cavity', { x: -hw + 0.0002, y: bore - 0.0135, z: -0.03, h: 0.0034 })
	addRollmark(body, 'cavity', {
		x: -hw + 0.0002,
		y: bore - 0.0205,
		z: -0.032,
		h: 0.0022,
		pitch: 0.0015,
		pattern: [3, 1, 2, 0, 3, 2, 1, 0, 2, 3]
	})

	return { hw, wellTop, wellBot }
}

/**
 * The dust cover: a stamped pressing with the transverse stiffening ribs that
 * are the most-photographed 40 mm of the whole rifle, plus the rear lip the
 * recoil-spring guide latches into.
 */
function addAkDustCover(body, matSteel, o) {
	const zRear = o.zRear
	const zFront = o.zFront
	const w = o.w
	const y = o.y
	const len = zRear - zFront
	const cz = (zRear + zFront) / 2

	/* The cover's cross-section is a shallow arch, so it is a lathe skin rather
	 * than a box: a flat-topped box here is what made earlier passes read as a
	 * lunchbox lid. */
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
	body.add(skin, matSteel, { y, z: cz })
	skin.dispose()

	/* Close the arch off with a thin deck so there is no daylight through it. */
	const deck = box(w - 0.0022, 0.0032, len - 0.002, 0.0008, 1)
	body.add(deck, matSteel, { y: y + w * 0.42, z: cz })
	deck.dispose()
	for (const sx of [-1, 1]) {
		const wall = box(0.0016, w * 0.44, len - 0.002, 0.0006, 1)
		body.add(wall, matSteel, { x: sx * (w * 0.5 - 0.0008), y: y + w * 0.2, z: cz })
		wall.dispose()
	}

	/* THE RIBS. Two pressed transverse swages near the rear of the cover. They
	 * are shallow — 1.1 mm — but they are transverse, so they break the one long
	 * unbroken highlight running down the top of the gun, which is what makes a
	 * stamped cover read as sheet metal. */
	for (let i = 0; i < 2; i++) {
		const rib = blob(w - 0.004, 0.0028, 0.0075, 0.0012, 2)
		body.add(rib, matSteel, { y: y + w * 0.43, z: zRear - 0.026 - i * 0.017 })
		rib.dispose()
	}
	/* Rear lip + the recoil-spring guide button poking through it. */
	const lipG = box(w - 0.003, 0.009, 0.0035, 0.0008, 1)
	body.add(lipG, matSteel, { y: y + w * 0.3, z: zRear - 0.0015 })
	lipG.dispose()
	const guideBtn = latheZ(
		[
			[0, 0],
			[0, 0.0048],
			[0.0022, 0.0052],
			[0.006, 0.0052],
			[0.006, 0]
		],
		14
	)
	body.add(guideBtn, 'steel_bright', { y: y + w * 0.28, z: zRear + 0.0005 })
	guideBtn.dispose()
}

/**
 * The tangent rear sight: a block sitting on the barrel just ahead of the dust
 * cover, carrying a sliding leaf with a U-notch and its two protective ears.
 *
 * `nodes.sight` is the notch, so this is also the geometry the solved ADS pose
 * aligns to the camera axis.
 */
function addAkRearSight(body, matSteel, o) {
	const bore = o.bore
	const z = o.z
	const baseG = box(0.026, 0.0125, 0.03, 0.0009, 2)
	body.add(baseG, matSteel, { y: bore + 0.0135, z })
	baseG.dispose()
	/* The sleeve the leaf slides in, and the leaf itself with its U-notch cut as
	 * a real gap between two shoulders. */
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
	body.add(leaf, matSteel, { y: bore + 0.0198, z: z - 0.008 })
	leaf.dispose()
	/* Protective ears either side of the leaf. */
	const ear = box(0.0032, 0.0105, 0.026, 0.0005, 1)
	body.addMirrored(ear, matSteel, { x: 0.0112, y: bore + 0.0215, z })
	ear.dispose()
	/* The graduated slider and its thumb catch. */
	const slider = box(0.021, 0.005, 0.009, 0.0008, 1)
	body.add(slider, 'steel_bright', { y: bore + 0.0205, z: z + 0.009 })
	slider.dispose()
	const catchG = box(0.008, 0.0045, 0.0035, 0.0006, 1)
	body.add(catchG, 'steel_bright', { y: bore + 0.0235, z: z + 0.0125 })
	catchG.dispose()
	/* Range graduations along the top of the block. */
	addRollmark(body, 'cavity', {
		x: -0.0128,
		y: bore + 0.0165,
		z: z + 0.008,
		h: 0.0022,
		pitch: 0.0022,
		count: 7,
		pattern: [2, 1, 2, 1, 2, 1, 2]
	})
	return { notchY: bore + 0.0233, notchZ: z - 0.008 }
}

/**
 * The gas block.
 *
 * An AK-74 gas block is CANTED: the gas is bled off at 45 degrees, so the block
 * is a wedge with the relief ports on its upper flanks, not a symmetric box like
 * an AR's low-profile block. That cant is the single detail that distinguishes
 * the front end of a Kalashnikov from everything else, so it is built as a real
 * rotated wedge with real vent holes rather than approximated.
 *
 * Sooted, not phosphated: the gas system vents combustion products by design.
 * See `steel_soot` in materials.js.
 */
function addAkGasBlock(body, o) {
	const bore = o.bore
	const z = o.z
	const r = o.rBarrel
	const mat = 'steel_soot'

	/* Collar clamped round the barrel. */
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
	body.add(collar, mat, { y: bore, z: z + 0.0134 })
	collar.dispose()

	/* THE CANTED TOWER. Authored standing up, then rolled 45 degrees about Z so
	 * the gas take-off points up-and-left exactly as the real one does. */
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
	body.add(tower, mat, { y: bore + 0.002, z: z + 0.012, rz: -Math.PI / 4 })
	tower.dispose()

	/* Gas relief ports: two real holes through the upper flank of the tower, in
	 * the cavity material so they read as holes. */
	for (let i = 0; i < 2; i++) {
		const vent = rodZ(0.0021, 0.0021, 0.014, 10, 0.0003)
		body.add(vent, 'cavity', {
			x: -0.0092,
			y: bore + 0.0155,
			z: z + 0.006 + i * 0.012,
			ry: Math.PI / 2,
			rz: -Math.PI / 4
		})
		vent.dispose()
	}

	/* The gas tube, running back over the barrel into the receiver, and the
	 * retaining lever that locks it. */
	const tubeLen = o.tubeTo - z
	const tube = tubeZ(0.0076, 0.0058, Math.abs(tubeLen), 16, 0.0004)
	body.add(tube, 'steel', { y: bore + 0.0175, z: z + tubeLen / 2 })
	tube.dispose()
	const lever = box(0.0075, 0.0125, 0.012, 0.0008, 1)
	body.add(lever, 'steel_bright', { x: 0.0085, y: bore + 0.0165, z: z + 0.0125 })
	lever.dispose()

	/* Handguard retainer ring at the rear of the block. */
	const retain = latheZ(
		[
			[0, r + 0.0068],
			[0, r + 0.0105],
			[0.0035, r + 0.0105],
			[0.0035, r + 0.0068]
		],
		16
	)
	body.add(retain, 'steel', { y: bore, z: z + 0.027 })
	retain.dispose()
}

/**
 * The front sight block: a hooded post between two ears, the cleaning-rod
 * channel underneath, and (on the AK) the bayonet lug.
 */
function addAkFrontSightBlock(body, o) {
	const bore = o.bore
	const z = o.z
	const r = o.rBarrel
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
	body.add(base, mat, { y: bore, z: z + 0.0109 })
	base.dispose()

	/* The hood: two ears bridged over the top, with the post standing inside.
	 * The bridge is what makes it a HOODED sight — an open post between two ears
	 * is an AR front sight, not an AK one. */
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
	const hoodG = mergeAll(parts)
	body.add(hoodG, mat, { y: bore + r + 0.0055, z })
	hoodG.dispose()

	/* Cleaning-rod channel under the barrel — a real dark bore, and on an AK it
	 * is visible for the whole length of the front end. */
	const rodHole = rodZ(0.0022, 0.0022, 0.022, 10, 0.0003)
	body.add(rodHole, 'cavity', { y: bore - r - 0.0042, z: z + 0.0109 })
	rodHole.dispose()

	if (o.bayonet) {
		/* Bayonet lug hanging below the block, with its locking slot. */
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
		body.add(lug, mat, { y: bore - r - 0.0055, z: z + 0.004 })
		lug.dispose()
	}
}

/**
 * The handguards.
 *
 * Two separate pieces, as on the real rifle and unlike the AR's single tube:
 * a LOWER handguard with the palm swell and the finger ribs, held between the
 * trunnion and the gas-block retainer, and an UPPER handguard capping the gas
 * tube. The gap between them, with the barrel and gas tube visible through it,
 * is a large part of the AK's read.
 */
function addAkHandguard(body, matWood, o) {
	const bore = o.bore
	const z0 = o.z0
	const z1 = o.z1
	const r = o.r
	const len = z0 - z1
	const cz = (z0 + z1) / 2

	/* --- lower handguard --- */
	/* A half-shell under the barrel. Authored as a lathe arc so it is a genuine
	 * curved trough; the palm swell is a separate blob lofted onto it. */
	const lower = latheZ(
		[
			[-len * 0.5, r * 0.86],
			[-len * 0.5 + 0.004, r],
			[-len * 0.5 + 0.03, r * 1.03],
			[cz * 0 + len * 0.06, r * 1.06],
			[len * 0.5 - 0.03, r * 1.02],
			[len * 0.5 - 0.004, r * 0.98],
			[len * 0.5, r * 0.86]
		],
		18,
		Math.PI * 1.06,
		Math.PI * 0.88
	)
	body.add(lower, matWood, { y: bore, z: cz })
	lower.dispose()
	/* Inner liner so the trough is not see-through from below. */
	const liner = latheZ(
		[
			[-len * 0.5 + 0.003, r * 0.8],
			[len * 0.5 - 0.003, r * 0.8]
		],
		18,
		Math.PI * 1.06,
		Math.PI * 0.88
	)
	body.add(liner, 'cavity', { y: bore, z: cz })
	liner.dispose()

	/* PALM SWELL. The lower handguard bulges where the support hand closes on it,
	 * and that bulge is what the fingertip contact solve in Viewmodel actually
	 * grips. */
	const swell = blob(r * 1.95, r * 0.9, len * 0.5, 0.008, 3)
	body.add(swell, matWood, { y: bore - r * 0.72, z: o.handZ })
	swell.dispose()

	/* Finger ribs across the underside — six shallow transverse grooves. They
	 * matter for the same reason the dust-cover swages do: they break the long
	 * highlight and give the hand something to read against. */
	for (let i = 0; i < 6; i++) {
		const t = 0.16 + i * 0.135
		const rib = blob(r * 1.5, 0.0026, 0.006, 0.0011, 2)
		body.add(rib, matWood, { y: bore - r * 1.14, z: z0 - t * len })
		rib.dispose()
	}

	/* Steel ferrule at the rear of the lower handguard. */
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
	body.add(ferrule, 'steel', { y: bore, z: z0 - 0.0045 })
	ferrule.dispose()

	/* --- upper handguard, over the gas tube --- */
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
	body.add(upper, matWood, { y: bore + 0.0175, z: (uz0 + uz1) / 2 })
	upper.dispose()
	/* Vent slots along the flanks of the upper guard — the AK's are real holes. */
	for (let i = 0; i < 3; i++) {
		const slotZ = uz0 - 0.028 - i * 0.03
		if (slotZ < uz1 + 0.02) break
		const slotG = box(0.0035, 0.0055, 0.016, 0.0006, 1)
		body.addMirrored(slotG, 'cavity', { x: 0.0108, y: bore + 0.0175, z: slotZ })
		slotG.dispose()
	}
}

/**
 * The buttstock.
 *
 * An AK stock is a straight taper from the rear trunnion to the butt plate with
 * a comb that rises very slightly, a lightening groove down each flank, a sling
 * slot through the toe and a steel butt plate with the cleaning-kit trap. It is
 * nothing like the AR's buffer tube plus sliding shell, so it is built from its
 * own side profile rather than by reusing addCarbineStock.
 */
function addAkStock(body, matWood, o) {
	const bore = o.bore
	const zFront = o.zFront
	const zRear = o.zRear
	const len = zRear - zFront
	const cz = (zFront + zRear) / 2
	const axis = bore - 0.012

	/* Side profile, extruded across the width: comb along the top, toe kicking
	 * down at the rear, wrist thinning where it meets the trunnion. */
	const outline = [
		[-len * 0.5, axis + 0.019],
		[-len * 0.5 + 0.03, axis + 0.024],
		[len * 0.5 - 0.014, axis + 0.029],
		[len * 0.5, axis + 0.024],
		[len * 0.5, axis - 0.03],
		[len * 0.5 - 0.012, axis - 0.036],
		[-len * 0.5 + 0.052, axis - 0.03],
		[-len * 0.5 + 0.014, axis - 0.019],
		[-len * 0.5, axis - 0.014]
	]
	const shell = extrude(outline, 0.039, { bevel: 0.0035, bevelSegments: 2 })
	shell.rotateY(Math.PI / 2)
	body.add(shell, matWood, { z: cz })
	shell.dispose()

	/* LIGHTENING GROOVE. A long shallow scallop down each flank — on a laminate
	 * stock it is the feature that says "this is a shaped block of wood". */
	const groove = blob(0.006, 0.019, len * 0.56, 0.005, 3)
	body.addMirrored(groove, 'cavity', { x: 0.0192, y: axis - 0.004, z: cz + 0.006 })
	groove.dispose()

	/* Sling slot through the toe: a real hole. */
	const slotG = box(0.042, 0.0075, 0.019, 0.0012, 2)
	body.add(slotG, 'cavity', { y: axis - 0.026, z: zFront + 0.052 })
	slotG.dispose()
	addSlingLoop(body, 'steel', 0, axis - 0.026, zFront + 0.052, 0.0085, {
		rx: Math.PI / 2,
		ry: Math.PI / 2
	})

	/* Steel butt plate with the cleaning-kit trap door and its sprung catch. */
	const plate = extrude(roundRect(0.04, 0.062, 0.005, 4), 0.005, { bevel: 0.001 })
	body.add(plate, 'steel', { y: axis - 0.003, z: zRear - 0.0015, rx: 0.05 })
	plate.dispose()
	const trap = box(0.02, 0.026, 0.0022, 0.0008, 1)
	body.add(trap, 'steel_bright', { y: axis + 0.004, z: zRear + 0.0022, rx: 0.05 })
	trap.dispose()
	const hinge = rodZ(0.0013, 0.0013, 0.021, 8, 0.0003)
	body.add(hinge, 'steel', { y: axis + 0.017, z: zRear + 0.002, ry: Math.PI / 2 })
	hinge.dispose()

	/* Rubber shim under the plate — thin, but it is the only soft material at the
	 * back of the gun and it keeps the plate from reading as bare sheet. */
	const shim = box(0.038, 0.058, 0.0022, 0.0008, 1)
	body.add(shim, 'rubber', { y: axis - 0.003, z: zRear - 0.0045, rx: 0.05 })
	shim.dispose()

	addQdSocket(body, matWood, 'steel', -0.02, axis + 0.006, zFront + 0.03, 'x', 0.005)
}

/* -------------------------------------------------------------------------- */
/*  magazine                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * THE рожковый MAGAZINE — the "little horn", the curved banana mag.
 *
 * This is the part that carries the whole silhouette. An AR magazine has a
 * 30 mm sagitta over 212 mm and reads as very nearly straight; a 5.45 AK
 * magazine has 58 mm over 232 mm, which is more than double the curvature, and
 * from the side it is unmistakable. parts.js buildMagazine already lofts a
 * curved body from a sagitta, so the curve itself is just a parameter — what has
 * to be added on top is the AK-specific hardware:
 *
 *   - the FRONT HOOK, the transverse rib near the top of the front face that
 *     the magazine is rocked into the well on
 *   - the REAR LOCKING LUG, the big square tab the catch closes behind
 *   - the HORIZONTAL REINFORCING RIBS down the front face
 *
 * Witness holes are switched off: a steel or plum AK magazine has none, and
 * four dark slots down the flank of one is an AR tell.
 */
function buildAkMagazine(v) {
	const m = v.mag
	const magazine = new Assembly(v.id + '-mag')
	const poly = v.furniture
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

	/* Front hook: sits on the arc, tilted to the local tangent so it lies flush. */
	const hookT = 0.1
	const hookP = magAt(hookT, m.len, m.curve)
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
	magazine.add(hook, poly, {
		y: hookP.y,
		z: hookP.z - m.d * 0.5 - 0.0026,
		rx: hookP.tilt
	})
	hook.dispose()

	/* Rear locking lug — beefier than the generic catch notch buildMagazine adds,
	 * because on an AK this tab is 8 mm proud and clearly visible below the well. */
	const lugT = 0.14
	const lugP = magAt(lugT, m.len, m.curve)
	const lug = extrude(
		[
			[-0.0068, 0],
			[0.0068, 0],
			[0.0068, -0.0105],
			[0.003, -0.0132],
			[-0.003, -0.0132],
			[-0.0068, -0.0105]
		],