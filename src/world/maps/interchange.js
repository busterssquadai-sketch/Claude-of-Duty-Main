import { MapKit, normalizeBuildArgs, makeRng } from './_kit.js';

const SIZE = 160;
const CRATE_COUNT = 40;

/* Габариты ТЦ */
const MALL_W = 86;
const MALL_D = 58;
const MALL_H = 9;

/* Стеллажи торгового зала: [x, z, yaw] */
const SHELVES = [
	[-34, -20, 0], [-22, -20, 0], [-10, -20, 0], [2, -20, 0], [14, -20, 0], [26, -20, 0],
	[-34, -10, 0], [-22, -10, 0], [-10, -10, 0], [2, -10, 0], [14, -10, 0], [26, -10, 0],
	[-30, 10, 0], [-18, 10, 0], [-6, 10, 0], [6, 10, 0], [18, 10, 0], [30, 10, 0],
	[-30, 20, 0], [-18, 20, 0], [-6, 20, 0], [6, 20, 0], [18, 20, 0], [30, 20, 0],
	[36, -15, 1.5708], [36, 15, 1.5708],
];

/* Легковые машины на парковке: [x, z, yaw] */
const CARS = [
	[-56, 40, 0], [-48, 40, 0], [-40, 40, 0], [-32, 40, 0],
	[-56, 50, 0], [-48, 50, 0], [-40, 50, 0],
	[54, -44, 1.5708], [54, -34, 1.5708], [54, -24, 1.5708],
	[20, 52, 0.35], [34, 46, 2.9],
];

/* [тип, x, z] */
const LOOT = [
	['crate', -38, -24], ['jacket', -28, -16], ['med', -16, -22], ['tool', -4, -18],
	['safe', 8, -24], ['crate', 20, -16], ['gun', 32, -22], ['jacket', 38, -8],
	['crate', -38, 4], ['med', -26, 8], ['jacket', -14, 2], ['tool', -2, 6],
	['crate', 10, 2], ['safe', 22, 8], ['crate', 34, 4], ['jacket', 40, 18],
	['crate', -36, 22], ['tool', -24, 26], ['med', -12, 18], ['crate', 0, 24],
	['jacket', 12, 20], ['crate', 24, 26], ['gun', 36, 24],
	['crate', -52, 44], ['jacket', -44, 52], ['tool', -60, 36],
	['crate', 58, -38], ['med', 50, -28], ['jacket', 62, -50],
	['crate', -66, -20], ['tool', -58, -8], ['crate', 66, 30], ['jacket', 58, 44],
	['safe', 0, 62],
];

/* Потолочные светильники ТЦ: [x, z] */
const MALL_LIGHTS = [
	[-34, -18], [-12, -18], [12, -18], [34, -18],
	[-34, 0], [-12, 0], [12, 0], [34, 0],
	[-34, 18], [-12, 18], [12, 18], [34, 18],
];

/* Фонари парковки: [x, z] */
const YARD_LIGHTS = [
	[-48, 46], [52, -34], [0, 56], [-64, -30], [64, 26], [0, -50],
];

const BOT_SPAWNS = [
	[-64, -34], [-34, -64], [34, -64], [64, -34],
	[64, 34], [34, 64], [-34, 64], [-64, 34],
	[0, -44], [46, 0], [0, 44], [-46, 0],
];

const EXITS = [
	{ id: 'interchange:railway', name: 'ЖД-терминал', x: -74, z: -66, radius: 4, noBotsNear: 20, note: 'Основной выход ЧВК.' },
	{ id: 'interchange:emercom', name: 'Выход МЧС', x: 74, z: 66, radius: 3.2, needKey: 'key_emercom', note: 'Закрыт на ключ МЧС.' },
	{ id: 'interchange:camp', name: 'Лагерь Диких', x: -74, z: 66, radius: 3.5, faction: 'scav', note: 'Только за Дикого.' },
	{ id: 'interchange:parking', name: 'Подземная парковка', x: 74, z: -20, radius: 4, afterSec: 1200, note: 'Открывается в последние 20 минут.' },
	{ id: 'interchange:fire', name: 'Пожарная лестница', x: 0, z: -74, radius: 3, freeHands: true, note: 'Нужны свободные руки.' },
	{ id: 'interchange:transfer', name: 'Лифт в Лабораторию', x: 0, z: 74, radius: 3.5, transfer: 'lab', cost: 12000, note: 'Платный спуск в TerraGroup Labs.' },
];

export const interchangeMeta = {
	id: 'interchange',
	name: 'Развязка',
	size: SIZE,
	duration: 35 * 60,
	minLevel: 8,
	lightBudget: 22,
	lootCount: LOOT.length,
	bots: { scav: [8, 12], raider: [2, 4], pmcbot: [1, 2], boss: [0, 1] },
};

function buildCar(kit, x, z, yaw) {
	kit.box('rust', x, 0.75, z, 4.4, 1.5, 2, yaw, 'car');
	kit.box('glass', x, 1.85, z, 2.2, 0.9, 1.8, yaw, 'car');
	const c = Math.cos(yaw);
	const s = Math.sin(yaw);
	for (let i = 0; i < 4; i++) {
		const ox = i < 2 ? 1.5 : -1.5;
		const oz = i % 2 === 0 ? 1.0 : -1.0;
		kit.box('rubber', x + ox * c - oz * s, 0.35, z + ox * s + oz * c, 0.7, 0.7, 0.36, yaw, 'decor');
	}
}

export function buildInterchange(world, ctx, opts) {
	const a = normalizeBuildArgs(world, ctx, opts);
	const night = !!(a.opts && a.opts.night);
	const kit = new MapKit(a.world, a.ctx, {
		id: 'interchange',
		name: 'Развязка',
		size: SIZE,
		night: night,
		duration: interchangeMeta.duration,
		lightBudget: interchangeMeta.lightBudget,
		rng: (a.opts && a.opts.rng) || makeRng(a.ctx, 'map:interchange'),
	});
	const H = kit.half;
	const hw = MALL_W * 0.5;
	const hd = MALL_D * 0.5;

	kit.setFog(night ? 0x0d1016 : 0x9ea6ae, night ? 0.018 : 0.009);
	kit.setAmbient({
		color: night ? 0x28304a : 0xc2ccd8,
		intensity: night ? 0.2 : 0.6,
		sunColor: night ? 0x7086b8 : 0xfff0d6,
		sunIntensity: night ? 0.14 : 1.05,
		sunPosition: [-50, 95, 60],
	});

	kit.ground('asphalt');
	kit.perimeter('corrugated', 3.4, 0.4);

	/* Разметка парковки */
	for (let i = 0; i < 14; i++) {
		kit.box('plaster', -62 + i * 8, 0.03, 45, 0.18, 0.02, 9, 0, 'floor');
	}
	for (let i = 0; i < 8; i++) {
		kit.box('plaster', 54, 0.03, -52 + i * 8, 9, 0.02, 0.18, 0, 'floor');
	}

	/* Пол и потолок ТЦ */
	kit.box('tile', 0, 0.06, 0, MALL_W, 0.12, MALL_D, 0, 'floor');
	kit.box('concrete', 0, MALL_H + 0.2, 0, MALL_W + 1.2, 0.4, MALL_D + 1.2, 0, 'roof');

	/* Северная стена с центральным входом 16 м */
	kit.box('concrete', -25.5, MALL_H * 0.5, -hd, 35, MALL_H, 0.6, 0, 'wall');
	kit.box('concrete', 25.5, MALL_H * 0.5, -hd, 35, MALL_H, 0.6, 0, 'wall');
	kit.box('concrete', 0, MALL_H - 1.2, -hd, 16, 2.4, 0.6, 0, 'wall');

	/* Южная стена с грузовым входом */
	kit.box('concrete', -36.5, MALL_H * 0.5, hd, 13, MALL_H, 0.6, 0, 'wall');
	kit.box('concrete', 10.5, MALL_H * 0.5, hd, 65, MALL_H, 0.6, 0, 'wall');
	kit.box('concrete', -26, MALL_H - 1.2, hd, 8, 2.4, 0.6, 0, 'wall');

	/* Западная стена с боковым входом, восточная глухая */
	kit.box('concrete', -hw, MALL_H * 0.5, -16.5, 0.6, MALL_H, 25, 0, 'wall');
	kit.box('concrete', -hw, MALL_H * 0.5, 16.5, 0.6, MALL_H, 25, 0, 'wall');
	kit.box('concrete', -hw, MALL_H - 1.2, 0, 0.6, 2.4, 8, 0, 'wall');
	kit.box('concrete', hw, MALL_H * 0.5, 0, 0.6, MALL_H, MALL_D, 0, 'wall');

	/* Двери на входах */
	kit.door(0, 0, -hd, 0, 16, 'Центральный вход ТЦ', null);
	kit.door(-26, 0, hd, 0, 8, 'Грузовой вход', null);
	kit.door(-hw, 0, 0, 1.5708, 8, 'Западный вход', 'key_mall_west');

	/* 7 несущих колонн */
	for (let i = -3; i <= 3; i++) {
		kit.box('concrete', i * 12, MALL_H * 0.5, 0, 1, MALL_H, 1, 0, 'column');
	}

	/* 26 стеллажей: каркас + три полки */
	for (let i = 0; i < SHELVES.length; i++) {
		const s = SHELVES[i];
		kit.box('metal', s[0], 1.1, s[1], 6, 2.2, 1, s[2], 'shelf');
		kit.box('plank', s[0], 0.75, s[1], 6.1, 0.08, 1.1, s[2], 'decor');
		kit.box('plank', s[0], 1.5, s[1], 6.1, 0.08, 1.1, s[2], 'decor');
		kit.box('plank', s[0], 2.2, s[1], 6.1, 0.08, 1.1, s[2], 'decor');
	}

	/* 18 витрин: две линии магазинов внутри зала */
	for (let i = 0; i < 9; i++) {
		const x = -36 + i * 9;
		kit.box('glass', x, 1.7, -24, 8, 3.4, 0.14, 0, 'glass');
		kit.box('glass', x, 1.7, 24, 8, 3.4, 0.14, 0, 'glass');
		kit.box('metal', x + 4.5, 1.75, -24, 0.3, 3.5, 0.3, 0, 'decor');
		kit.box('metal', x + 4.5, 1.75, 24, 0.3, 3.5, 0.3, 0, 'decor');
	}

	/* 40 ящиков по торговому залу и складу */
	for (let i = 0; i < CRATE_COUNT; i++) {
		const x = (kit.rng() * 2 - 1) * (hw - 5);
		const z = (kit.rng() * 2 - 1) * (hd - 5);
		const s = 0.9 + kit.rng() * 0.7;
		kit.box('plank', x, s * 0.5, z, s * 1.2, s, s * 1.2, kit.rng() * Math.PI, 'crate');
	}

	/* Машины */
	for (let i = 0; i < CARS.length; i++) {
		buildCar(kit, CARS[i][0], CARS[i][1], CARS[i][2]);
	}

	/* Свет торгового зала */
	for (let i = 0; i < MALL_LIGHTS.length; i++) {
		const p = MALL_LIGHTS[i];
		kit.lamp(p[0], MALL_H - 1.1, p[1], 0xe8f0ff, night ? 1.9 : 1.2, 24);
	}

	/* Фонари парковки */
	for (let i = 0; i < YARD_LIGHTS.length; i++) {
		const p = YARD_LIGHTS[i];
		kit.box('metal', p[0], 3.2, p[1], 0.26, 6.4, 0.26, 0, 'decor');
		kit.lamp(p[0], 6.5, p[1], night ? 0xffd2a0 : 0xfff0d8, night ? 2.1 : 0.7, 24);
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
	map.meta = interchangeMeta;
	return map;
}

export default buildInterchange;