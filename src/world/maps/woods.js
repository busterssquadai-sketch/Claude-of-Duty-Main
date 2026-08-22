import { MapKit, normalizeBuildArgs, makeRng } from './_kit.js';

const SIZE = 190;
const TREE_COUNT = 190;
const ROCK_COUNT = 40;
const BUSH_COUNT = 70;

/* [x, z, w, d, h, материал, имя] */
const BUILDINGS = [
	[-20, 10, 22, 16, 6, 'wood', 'Лесопилка'],
	[30, -30, 14, 12, 5, 'wood', 'Сторожка'],
];

/* Прогалины, где не сажается растительность: [x, z, полуширина, полуглубина] */
const CLEARINGS = [
	[-20, 10, 15, 11],
	[30, -30, 11, 9],
	[0, 0, 7, 95],
	[-85, -60, 8, 8],
	[85, 20, 8, 8],
	[-20, 88, 8, 8],
	[88, -70, 8, 8],
	[-88, 70, 8, 8],
];

/* [тип, x, z] */
const LOOT = [
	['crate', -26, 6], ['crate', -22, 14], ['jacket', -14, 8], ['tool', -28, 15],
	['safe', -18, 4], ['med', -12, 13], ['gun', -24, 11],
	['crate', 27, -33], ['jacket', 33, -27], ['med', 30, -31], ['tool', 25, -28], ['safe', 34, -32],
	['crate', -60, -40], ['jacket', -52, -34], ['crate', -70, 20], ['tool', -64, 28],
	['crate', 55, 55], ['jacket', 62, 48], ['med', 48, 60],
	['crate', -40, 60], ['tool', -34, 68], ['crate', 70, -20], ['jacket', 64, -14],
	['crate', 12, -60], ['med', 20, -66], ['crate', -8, 70], ['tool', -16, 76],
	['jacket', 40, 10], ['crate', 46, 4], ['crate', -46, -8], ['gun', -52, -2],
	['crate', 8, 40], ['jacket', 2, 34], ['safe', -70, -70],
];

/* Костры и фонари: [x, z, радиус света] */
const FIRES = [
	[-44, -18, 16],
	[52, 34, 16],
	[8, -72, 14],
	[-66, 52, 14],
];

const BOT_SPAWNS = [
	[-75, -40], [-40, -75], [40, -75], [75, -40],
	[75, 40], [40, 75], [-40, 75], [-75, 40],
	[0, -55], [55, 0], [0, 55], [-55, 0],
];

const EXITS = [
	{ id: 'woods:outskirts', name: 'Опушка', x: -85, z: -60, radius: 4, noBotsNear: 25, note: 'Выход ЧВК. Не работает, пока рядом боты.' },
	{ id: 'woods:factory', name: 'Ворота завода', x: 85, z: 20, radius: 4.5, afterSec: 1800, note: 'Открыт в последние 30 минут.' },
	{ id: 'woods:bunker', name: 'Схрон Диких', x: -20, z: 88, radius: 3.5, faction: 'scav', note: 'Только за Дикого.' },
	{ id: 'woods:ravine', name: 'Овраг', x: 88, z: -70, radius: 3, freeHands: true, note: 'Нужны свободные руки: подъём по склону.' },
	{ id: 'woods:transfer', name: 'Переход на Таможню', x: -88, z: 70, radius: 3.5, transfer: 'customs', cost: 4000, note: 'Платный переход.' },
];

export const woodsMeta = {
	id: 'woods',
	name: 'Лес',
	size: SIZE,
	duration: 40 * 60,
	minLevel: 3,
	lightBudget: 8,
	lootCount: LOOT.length,
	bots: { scav: [6, 9], raider: [1, 2], pmcbot: [1, 3], boss: [0, 1] },
};

function inClearing(x, z) {
	for (let i = 0; i < CLEARINGS.length; i++) {
		const c = CLEARINGS[i];
		if (Math.abs(x - c[0]) < c[2] && Math.abs(z - c[1]) < c[3]) return true;
	}
	return false;
}

export function buildWoods(world, ctx, opts) {
	const a = normalizeBuildArgs(world, ctx, opts);
	const night = !!(a.opts && a.opts.night);
	const kit = new MapKit(a.world, a.ctx, {
		id: 'woods',
		name: 'Лес',
		size: SIZE,
		night: night,
		duration: woodsMeta.duration,
		lightBudget: woodsMeta.lightBudget,
		rng: (a.opts && a.opts.rng) || makeRng(a.ctx, 'map:woods'),
	});
	const H = kit.half;

	kit.setFog(night ? 0x0a0f0c : 0x9aa896, night ? 0.022 : 0.012);
	kit.setAmbient({
		color: night ? 0x1d2a22 : 0xa8bda0,
		intensity: night ? 0.14 : 0.5,
		sunColor: night ? 0x5f7b8f : 0xffeccd,
		sunIntensity: night ? 0.1 : 0.95,
		sunPosition: [-70, 80, -50],
	});

	kit.ground('grass');

	/* Грунтовая дорога с севера на юг и съезд к лесопилке */
	kit.box('dirt', 0, 0.02, 0, 9, 0.04, SIZE, 0, 'floor');
	kit.box('dirt', -11, 0.02, 10, 22, 0.04, 7, 0, 'floor');

	/* Здания */
	for (let i = 0; i < BUILDINGS.length; i++) {
		const b = BUILDINGS[i];
		kit.building({
			x: b[0],
			z: b[1],
			w: b[2],
			d: b[3],
			h: b[4],
			surf: b[5],
			name: b[6],
			floorSurf: 'plank',
			roofSurf: 'corrugated',
			partitions: false,
			lampIntensity: night ? 1.6 : 0.9,
		});
	}

	/* Штабеля брёвен у лесопилки */
	for (let row = 0; row < 3; row++) {
		for (let i = 0; i < 5; i++) {
			const x = -38 + i * 1.1;
			const y = 0.55 + row * 1.02;
			kit.box('bark', x, y, 24 + row * 0.2, 0.98, 0.98, 7, 0, 'crate');
		}
	}
	for (let i = 0; i < 4; i++) {
		kit.box('plank', -6 + i * 2.4, 0.5, 22, 2, 1, 6, 0, 'crate');
	}

	/* Забор вокруг лесопилки */
	kit.wallSeg('plank', -42, 30, 4, 30, 2, 0.24, 'wall');
	kit.wallSeg('plank', -42, -4, -42, 30, 2, 0.24, 'wall');
	kit.wallSeg('plank', 4, -4, 4, 30, 2, 0.24, 'wall');

	/* Деревья: ствол + крона */
	kit.scatter(TREE_COUNT, 12, function plantTree(x, z) {
		if (inClearing(x, z)) return false;
		const scale = 0.8 + kit.rng() * 0.55;
		const trunkH = 9 * scale;
		kit.cylinder('bark', x, trunkH * 0.5, z, 0.32 * scale, trunkH, 'tree');
		kit.cone('foliage', x, trunkH * 0.78 + 3.5 * scale, z, 2.6 * scale, 7 * scale, 'tree', false);
		kit.cone('foliage', x, trunkH * 0.55 + 2.2 * scale, z, 3.2 * scale, 5 * scale, 'tree', false);
		return true;
	});

	/* Валуны */
	kit.scatter(ROCK_COUNT, 10, function placeRock(x, z) {
		if (inClearing(x, z)) return false;
		const s = 1.1 + kit.rng() * 2.4;
		kit.box('concrete', x, s * 0.32, z, s, s * 0.72, s * 0.86, kit.rng() * Math.PI, 'rock');
		return true;
	});

	/* Кусты: без коллайдеров, только визуал и укрытие от взгляда */
	kit.scatter(BUSH_COUNT, 8, function placeBush(x, z) {
		if (inClearing(x, z)) return false;
		const s = 0.9 + kit.rng() * 1.1;
		kit.cone('foliage', x, s * 0.6, z, s * 1.3, s * 1.9, 'bush', false);
		return true;
	});

	/* Костры с теплым светом */
	for (let i = 0; i < FIRES.length; i++) {
		const f = FIRES[i];
		for (let k = 0; k < 5; k++) {
			const ang = (k / 5) * Math.PI * 2;
			kit.box('concrete', f[0] + Math.cos(ang) * 1.1, 0.16, f[1] + Math.sin(ang) * 1.1, 0.5, 0.32, 0.5, ang, 'decor');
		}
		kit.box('bark', f[0], 0.28, f[1], 1.3, 0.42, 0.42, 0.7, 'decor');
		kit.box('bark', f[0], 0.28, f[1], 0.42, 0.42, 1.3, -0.5, 'decor');
		kit.lamp(f[0], 0.9, f[1], 0xff9a3c, night ? 2.6 : 1.1, f[2]);
	}

	/* Лут */
	for (let i = 0; i < LOOT.length; i++) {
		const l = LOOT[i];
		kit.loot(l[0], l[1], 0, l[2], null, 1);
	}

	/* Выходы */
	for (let i = 0; i < EXITS.length; i++) kit.exit(EXITS[i]);

	/* Спавны */
	kit.spawn('pmc', -H + 8, 0, -H + 8);
	kit.spawn('pmc', H - 8, 0, -H + 10);
	kit.spawn('pmc', 0, 0, -H + 12);
	kit.spawn('scav', H - 10, 0, H - 10);
	kit.spawn('scav', -H + 10, 0, H - 12);
	kit.spawn('scav', 6, 0, H - 16);
	for (let i = 0; i < BOT_SPAWNS.length; i++) {
		kit.spawn('bot', BOT_SPAWNS[i][0], 0, BOT_SPAWNS[i][1]);
	}

	const map = kit.finalize();
	map.meta = woodsMeta;
	return map;
}

export default buildWoods;