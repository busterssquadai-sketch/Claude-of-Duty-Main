import { MapKit, normalizeBuildArgs, makeRng } from './_kit.js';

const SIZE = 110;
const SECTORS = ['A', 'B', 'C', 'D', 'E'];
const ROOM_W = 16;
const ROOM_H = 4;

/* [тип, x, z] — весь лут здесь с множителем качества 1.5 */
const LOOT = [
	['tool', -44, -26], ['crate', -36, -18], ['med', -40, -4], ['safe', -36, 4],
	['crate', -44, 18], ['gun', -36, 26],
	['med', -24, -26], ['tool', -16, -18], ['safe', -20, 0], ['crate', -16, 26],
	['med', -4, -26], ['gun', 4, -18], ['safe', 0, -2], ['med', -4, 4],
	['crate', 4, 26], ['tool', -4, 18],
	['med', 16, -26], ['safe', 24, -18], ['crate', 20, 2], ['gun', 16, 26], ['tool', 24, 18],
	['med', 36, -26], ['safe', 44, -18], ['crate', 40, 0], ['gun', 36, 22], ['med', 44, 26],
];

/* Серверные стойки: [x, z, yaw] */
const RACKS = [
	[-42, -20, 0], [-42, -16, 0], [-38, -20, 0],
	[-2, -24, 1.5708], [2, -24, 1.5708], [-2, -20, 1.5708],
	[38, 20, 0], [42, 20, 0], [38, 24, 0],
	[18, -2, 1.5708], [22, -2, 1.5708], [18, 2, 1.5708],
];

/* Аварийные лампы коридоров: [x, z] */
const EMERGENCY = [
	[-30, 0], [0, 11], [30, -11],
];

const BOT_SPAWNS = [
	[-46, -26], [-46, 26], [46, -26], [46, 26],
	[-26, 0], [26, 0], [0, -26], [0, 26],
	[-46, 0], [46, 0], [-16, -12], [16, 12],
];

const EXITS = [
	{ id: 'lab:elevator', name: 'Главный лифт', x: 0, z: -52, radius: 3.5, needKey: 'tgcard_exit', note: 'Требует активированную карту выхода TerraGroup.' },
	{ id: 'lab:cargo', name: 'Грузовой лифт', x: -52, z: -34, radius: 3.5, afterSec: 900, note: 'Работает в последние 15 минут.' },
	{ id: 'lab:vent', name: 'Вентиляционная шахта', x: 52, z: -34, radius: 3, freeHands: true, note: 'Ползти можно только с пустыми руками.' },
	{ id: 'lab:parking', name: 'Подземная парковка', x: 52, z: 34, radius: 3.5, cost: 8000, note: 'Платная эвакуация.' },
	{ id: 'lab:medblock', name: 'Медблок', x: 0, z: 52, radius: 3, needKey: 'key_medblock', note: 'Закрыт на ключ медблока.' },
	{ id: 'lab:transfer', name: 'Подъём на Развязку', x: -52, z: 34, radius: 3.5, transfer: 'interchange', note: 'Бесплатный переход наверх.' },
];

export const labMeta = {
	id: 'lab',
	name: 'Лаборатория',
	size: SIZE,
	duration: 30 * 60,
	minLevel: 12,
	needCard: 'tgcard',
	lightBudget: 18,
	lootCount: LOOT.length,
	lootRich: 1.5,
	indoor: true,
	bots: { scav: [0, 0], raider: [5, 8], pmcbot: [0, 1], boss: [1, 1] },
};

export function buildLab(world, ctx, opts) {
	const a = normalizeBuildArgs(world, ctx, opts);
	const kit = new MapKit(a.world, a.ctx, {
		id: 'lab',
		name: 'Лаборатория',
		size: SIZE,
		night: true,
		duration: labMeta.duration,
		lightBudget: labMeta.lightBudget,
		rng: (a.opts && a.opts.rng) || makeRng(a.ctx, 'map:lab'),
	});
	const H = kit.half;

	/* Под землёй всегда ночь: плотный холодный туман и почти нолевой солнечный свет. */
	kit.setFog(0x0c1014, 0.02);
	kit.setAmbient({
		color: 0x1a2430,
		intensity: 0.22,
		sunColor: 0x24303c,
		sunIntensity: 0.05,
		sunPosition: [0, 60, 0],
		indoor: true,
	});

	kit.ground('tile');
	kit.perimeter('concrete', 6, 1);

	/* Общий потолок над всем комплексом */
	kit.box('concrete', 0, 6.3, 0, SIZE, 0.6, SIZE, 0, 'roof');

	/* Коридоры: полосы плитки и навесной потолок */
	kit.box('tile', 0, 0.05, -11, 100, 0.1, 6, 0, 'floor');
	kit.box('tile', 0, 0.05, 11, 100, 0.1, 6, 0, 'floor');
	kit.box('tile', -10, 0.05, 0, 5, 0.1, 64, 0, 'floor');
	kit.box('tile', 10, 0.05, 0, 5, 0.1, 64, 0, 'floor');
	kit.box('tile', -30, 0.05, 0, 5, 0.1, 64, 0, 'floor');
	kit.box('tile', 30, 0.05, 0, 5, 0.1, 64, 0, 'floor');

	/* 15 герметичных секторов 5 x 3 */
	for (let i = -2; i <= 2; i++) {
		for (let j = -1; j <= 1; j++) {
			const x = i * 20;
			const z = j * 22;
			const code = SECTORS[i + 2] + (j + 2);
			const core = i === 0 && j === 0;
			kit.building({
				x: x,
				z: z,
				w: ROOM_W,
				d: ROOM_W,
				h: ROOM_H,
				surf: 'tile',
				floorSurf: 'tile',
				roofSurf: 'corrugated',
				name: 'Гермодверь ' + code,
				partitions: false,
				doorWidth: 3,
				keyId: core ? 'key_lab_core' : null,
				lampColor: core ? 0xff6a5a : 0xcfe4ff,
				lampIntensity: 1.5,
				lampRange: 18,
			});

			/* Два стола на сектор — ровно 30 на карту */
			kit.box('metal', x - 4, 0.4, z - 4, 1.6, 0.8, 1.1, 0, 'desk');
			kit.box('metal', x + 4, 0.4, z + 3, 1.6, 0.8, 1.1, 1.5708, 'desk');

			/* Стеклянная перегородка внутри сектора */
			kit.box('glass', x, 1.4, z + 5, 10, 2.8, 0.12, 0, 'glass');
			kit.box('metal', x - 5.1, 1.45, z + 5, 0.24, 2.9, 0.24, 0, 'decor');
			kit.box('metal', x + 5.1, 1.45, z + 5, 0.24, 2.9, 0.24, 0, 'decor');

			/* Вентиляционные трубы под потолком */
			kit.box('pipe', x, ROOM_H - 0.6, z - 6, ROOM_W - 1, 0.36, 0.36, 0, 'decor');
		}
	}

	/* Серверные стойки */
	for (let i = 0; i < RACKS.length; i++) {
		const r = RACKS[i];
		kit.box('metal', r[0], 1.05, r[1], 0.9, 2.1, 1.2, r[2], 'rack');
		kit.box('plastic', r[0], 2.16, r[1], 0.95, 0.12, 1.25, r[2], 'decor');
	}

	/* Капсулы-контейнменты в центральном секторе */
	kit.cylinder('glass', -4, 1.3, 2, 1.1, 2.6, 'tank');
	kit.cylinder('glass', 0, 1.3, 2, 1.1, 2.6, 'tank');
	kit.cylinder('glass', 4, 1.3, 2, 1.1, 2.6, 'tank');
	kit.box('metal', 0, 0.16, 2, 12, 0.32, 3, 0, 'decor');

	/* Аварийный свет коридоров */
	for (let i = 0; i < EMERGENCY.length; i++) {
		const p = EMERGENCY[i];
		kit.lamp(p[0], 5.2, p[1], 0xff4438, 1.8, 20);
	}

	/* Лут: всё богатое, множитель 1.5 */
	for (let i = 0; i < LOOT.length; i++) {
		const l = LOOT[i];
		kit.loot(l[0], l[1], 0, l[2], null, 1.5);
	}

	/* Выходы */
	for (let i = 0; i < EXITS.length; i++) kit.exit(EXITS[i]);

	/*
	 * Спавны. Диких на карте нет (bots.scav = [0, 0]), но точки всё равно заданы:
	 * игрок может зайти за Дикого через трансфер с Развязки.
	 */
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
	map.meta = labMeta;
	map.indoor = true;
	return map;
}

export default buildLab;