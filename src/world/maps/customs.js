import { MapKit, normalizeBuildArgs, makeRng } from './_kit.js';

const SIZE = 150;

/* [x, z, w, d, h, материал, имя] */
const BUILDINGS = [
	[-30, -20, 26, 18, 7, 'wall', 'Склад №7'],
	[20, -28, 20, 14, 6, 'rust', 'Таможня'],
	[34, 18, 24, 20, 8, 'wall', 'Общага №3'],
	[-24, 30, 18, 14, 6, 'wall', 'АЗС'],
	[4, 6, 16, 12, 5, 'rust', 'Ангар'],
];

/* Морские контейнеры 6 x 2.4 x 2.4: [x, z, yaw] */
const CONTAINERS = [
	[-58, -58, 0], [-50, -58, 0], [-42, -58, 0], [-34, -58, 0],
	[-58, -52, 0], [-50, -52, 0], [-42, -52, 0],
	[58, -30, 1.5708], [58, -22, 1.5708], [58, -14, 1.5708], [58, -6, 1.5708],
	[52, -30, 1.5708], [52, -22, 1.5708], [52, -14, 1.5708],
	[-20, 46, 0], [-12, 46, 0], [-4, 46, 0], [4, 46, 0], [12, 46, 0],
	[-16, 52, 0], [-8, 52, 0], [0, 52, 0], [8, 52, 0],
	[-58, 8, 1.5708], [-58, 16, 1.5708], [-58, 24, 1.5708],
	[10, -8, 0.4], [18, -2, 2.7],
];

/* Поддоны 6 x 0.8 x 2.4: [x, z, yaw] */
const PALLETS = [
	[-34, -6, 0], [-28, -6, 0], [-22, -6, 0],
	[14, 20, 1.5708], [20, 20, 1.5708], [26, 20, 1.5708],
	[-46, 36, 0], [-40, 36, 0],
	[40, -42, 0.9], [46, -42, 0.9],
];

/* Точки лута: [тип, x, z] */
const LOOT = [
	['crate', -36, -24], ['crate', -32, -17], ['jacket', -26, -23], ['tool', -38, -15],
	['safe', -24, -25], ['med', -28, -14], ['gun', -34, -21],
	['crate', 15, -30], ['jacket', 24, -25], ['safe', 26, -31], ['med', 18, -23], ['tool', 21, -28],
	['crate', 27, 13], ['jacket', 31, 22], ['jacket', 38, 15], ['med', 41, 24],
	['safe', 36, 19], ['crate', 43, 11], ['tool', 29, 25],
	['crate', -29, 27], ['med', -20, 33], ['jacket', -26, 34], ['tool', -18, 26],
	['crate', 0, 4], ['gun', 7, 9], ['tool', -1, 8], ['crate', 9, 3],
	['crate', -54, -56], ['jacket', -46, -50], ['crate', 56, -20], ['tool', 50, -12],
	['crate', -8, 50], ['jacket', 6, 44], ['safe', -56, 14],
];

/* Столбы освещения двора: [x, z] */
const LAMP_POSTS = [
	[-45, -40], [45, -40], [-45, 40], [45, 40],
	[0, -45], [0, 45], [-60, 0], [60, 0],
];

/* Спавны ботов: [x, z] */
const BOT_SPAWNS = [
	[-60, -30], [-30, -60], [30, -60], [60, -30],
	[60, 30], [30, 60], [-30, 60], [-60, 30],
	[0, -40], [40, 0], [0, 40], [-40, 0],
];

const EXITS = [
	{ id: 'customs:gate_pmc', name: 'Ворота ЧВК', x: -69, z: -40, radius: 4, noBotsNear: 22, note: 'Основной выход ЧВК. Закрыт, пока рядом есть боты.' },
	{ id: 'customs:railway', name: 'ЖД-переезд', x: 69, z: 10, radius: 4.5, afterSec: 1500, note: 'Открывается в последние 25 минут рейда.' },
	{ id: 'customs:bus', name: 'Автобус Диких', x: 30, z: 69, radius: 3.5, faction: 'scav', note: 'Только за Дикого.' },
	{ id: 'customs:hole', name: 'Дыра в заборе', x: -10, z: 69, radius: 3, freeHands: true, note: 'Нужны свободные руки.' },
	{ id: 'customs:locked', name: 'Закрытые ворота', x: 69, z: -55, radius: 3.2, needKey: 'key_customs_gate', note: 'Требует ключ от ворот таможни.' },
	{ id: 'customs:transfer', name: 'Переход на Развязку', x: -69, z: 55, radius: 3.5, transfer: 'interchange', cost: 5000, note: 'Платный переход в соседнюю локацию.' },
];

export const customsMeta = {
	id: 'customs',
	name: 'Таможня',
	size: SIZE,
	duration: 35 * 60,
	minLevel: 1,
	lightBudget: 16,
	lootCount: LOOT.length,
	bots: { scav: [7, 10], raider: [2, 3], pmcbot: [1, 2], boss: [0, 1] },
};

export function buildCustoms(world, ctx, opts) {
	const a = normalizeBuildArgs(world, ctx, opts);
	const night = !!(a.opts && a.opts.night);
	const kit = new MapKit(a.world, a.ctx, {
		id: 'customs',
		name: 'Таможня',
		size: SIZE,
		night: night,
		duration: customsMeta.duration,
		lightBudget: customsMeta.lightBudget,
		rng: (a.opts && a.opts.rng) || makeRng(a.ctx, 'map:customs'),
	});
	const H = kit.half;

	kit.setFog(night ? 0x0b0f14 : 0x9aa3ad, night ? 0.016 : 0.008);
	kit.setAmbient({
		color: night ? 0x2a3550 : 0xbfd2e6,
		intensity: night ? 0.18 : 0.55,
		sunColor: night ? 0x6d84b4 : 0xffe6c2,
		sunIntensity: night ? 0.12 : 1.15,
		sunPosition: [60, 90, 40],
	});

	/* Земля и асфальтовые проезды */
	kit.ground('gravel');
	kit.box('asphalt', 0, 0.02, -10, SIZE, 0.04, 14, 0, 'floor');
	kit.box('asphalt', -6, 0.02, 0, 12, 0.04, SIZE, 0, 'floor');
	kit.box('kerb', 0, 0.14, -17.2, SIZE, 0.28, 0.4, 0, 'decor');
	kit.box('kerb', 0, 0.14, -2.8, SIZE, 0.28, 0.4, 0, 'decor');

	/* ЖД-ветка вдоль северной границы */
	for (let x = -H + 4; x <= H - 4; x += 2.5) {
		kit.box('wood', x, 0.12, -64, 2.2, 0.24, 0.35, 0, 'decor');
	}
	kit.box('rail', 0, 0.28, -64.75, SIZE - 6, 0.16, 0.14, 0, 'decor');
	kit.box('rail', 0, 0.28, -63.25, SIZE - 6, 0.16, 0.14, 0, 'decor');
	kit.box('gravel', 0, 0.06, -64, SIZE - 6, 0.12, 3.4, 0, 'floor');

	/* Внешний забор из профлиста */
	kit.perimeter('corrugated', 4.5, 0.5);

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
			floorSurf: 'concrete',
			roofSurf: 'corrugated',
			lampIntensity: night ? 1.7 : 1.0,
		});
	}

	/* Контейнеры: корпус + рёбра жёсткости */
	for (let i = 0; i < CONTAINERS.length; i++) {
		const c = CONTAINERS[i];
		kit.box('rust', c[0], 1.2, c[1], 6, 2.4, 2.4, c[2], 'crate');
		kit.box('corrugated', c[0], 2.46, c[1], 6.1, 0.12, 2.5, c[2], 'roof');
	}

	/* Поддоны */
	for (let i = 0; i < PALLETS.length; i++) {
		const p = PALLETS[i];
		kit.box('plank', p[0], 0.4, p[1], 6, 0.8, 2.4, p[2], 'crate');
	}

	/* АЗС: три цистерны и навес */
	kit.cylinder('metal', -40, 2.1, 26, 2.6, 4.2, 'tank');
	kit.cylinder('metal', -40, 2.1, 34, 2.6, 4.2, 'tank');
	kit.cylinder('rust', -46, 1.8, 30, 2.2, 3.6, 'tank');
	kit.box('corrugated', -12, 4.3, 30, 12, 0.3, 10, 0, 'roof');
	kit.box('metal', -17, 2.15, 26, 0.3, 4.3, 0.3, 0, 'decor');
	kit.box('metal', -17, 2.15, 34, 0.3, 4.3, 0.3, 0, 'decor');
	kit.box('metal', -7, 2.15, 26, 0.3, 4.3, 0.3, 0, 'decor');
	kit.box('metal', -7, 2.15, 34, 0.3, 4.3, 0.3, 0, 'decor');
	kit.box('plastic', -12, 0.9, 28, 1.4, 1.8, 0.9, 0, 'decor');
	kit.box('plastic', -12, 0.9, 32, 1.4, 1.8, 0.9, 0, 'decor');

	/* Надземные трубы вдоль склада */
	for (let i = 0; i < 6; i++) {
		const x = -52 + i * 8;
		kit.box('pipe', x, 2.6, -34, 0.34, 5.2, 0.34, 0, 'decor');
	}
	kit.box('pipe', -28, 5.2, -34, 48, 0.42, 0.42, 0, 'decor');

	/* Фонари двора */
	for (let i = 0; i < LAMP_POSTS.length; i++) {
		const p = LAMP_POSTS[i];
		kit.box('metal', p[0], 3, p[1], 0.24, 6, 0.24, 0, 'decor');
		kit.lamp(p[0], 6.1, p[1], night ? 0xffd2a0 : 0xfff0d8, night ? 2.2 : 0.8, 22);
	}

	/* Лут */
	for (let i = 0; i < LOOT.length; i++) {
		const l = LOOT[i];
		kit.loot(l[0], l[1], 0, l[2], null, 1);
	}

	/* Выходы */
	for (let i = 0; i < EXITS.length; i++) kit.exit(EXITS[i]);

	/* Спавны ЧВК, Диких и ботов */
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
	map.meta = customsMeta;
	return map;
}

export default buildCustoms;