import * as THREE from 'three';

/*
 * Escape from Larpov - общий конструктор карт.
 *
 * Все карты строятся через MapKit: он батчит геометрию в InstancedMesh,
 * ведёт список OBB-коллайдеров, следит за бюджетом света, собирает точки лута,
 * выходы, спавны и печёт навигационную сетку.
 *
 * Контракт с движком намеренно мягкий: любой вызов в world/materials обёрнут
 * в перебор возможных имён с безопасным фоллбэком.
 */

/* Визуальный ключ материала -> баллистическая поверхность из SURFACE_BALLISTICS. */
export const MATERIAL_SURFACE = {
	concrete: 'concrete',
	wall: 'plaster',
	plaster: 'plaster',
	brick: 'concrete',
	asphalt: 'concrete',
	tile: 'concrete',
	kerb: 'concrete',
	metal: 'metal',
	rust: 'metal',
	corrugated: 'metal',
	rail: 'metal',
	pipe: 'metal',
	lamp: 'metal',
	wood: 'wood',
	plank: 'wood',
	bark: 'wood',
	glass: 'glass',
	dirt: 'dirt',
	gravel: 'dirt',
	grass: 'dirt',
	sand: 'sand',
	foliage: 'foliage',
	fabric: 'fabric',
	tent: 'fabric',
	camo: 'fabric',
	rubber: 'rubber',
	plastic: 'rubber',
	water: 'water',
};

/* Порядок совпадает с items.surfaceKeys и индексами в SURFACE_BALLISTICS. */
export const SURFACE_ORDER = [
	'concrete',
	'plaster',
	'metal',
	'wood',
	'glass',
	'dirt',
	'sand',
	'fabric',
	'foliage',
	'rubber',
	'water',
	'flesh',
];

export function surfaceIndex(name) {
	const i = SURFACE_ORDER.indexOf(name);
	return i < 0 ? 0 : i;
}

const FALLBACK_PBR = {
	concrete: { color: 0x8f8b82, roughness: 0.94, metalness: 0 },
	wall: { color: 0xb9b3a4, roughness: 0.92, metalness: 0 },
	plaster: { color: 0xc8c2b2, roughness: 0.95, metalness: 0 },
	brick: { color: 0x8c5b45, roughness: 0.9, metalness: 0 },
	asphalt: { color: 0x3b3d40, roughness: 0.97, metalness: 0 },
	tile: { color: 0xd3d8da, roughness: 0.45, metalness: 0.05 },
	kerb: { color: 0xa8a49b, roughness: 0.9, metalness: 0 },
	metal: { color: 0x8d949b, roughness: 0.42, metalness: 0.85 },
	rust: { color: 0x7d4a2c, roughness: 0.82, metalness: 0.55 },
	corrugated: { color: 0x6f7780, roughness: 0.55, metalness: 0.7 },
	rail: { color: 0x5a5f63, roughness: 0.5, metalness: 0.9 },
	pipe: { color: 0x6c7378, roughness: 0.5, metalness: 0.8 },
	lamp: { color: 0xfff2cf, roughness: 0.4, metalness: 0, emissive: 0xffd9a0, emissiveIntensity: 2.4 },
	wood: { color: 0x7a5a37, roughness: 0.88, metalness: 0 },
	plank: { color: 0x8a6a42, roughness: 0.9, metalness: 0 },
	bark: { color: 0x4a3b2c, roughness: 0.96, metalness: 0 },
	glass: { color: 0x9fc4cc, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.32 },
	dirt: { color: 0x5b4c39, roughness: 0.98, metalness: 0 },
	gravel: { color: 0x6b6459, roughness: 0.97, metalness: 0 },
	grass: { color: 0x46543a, roughness: 0.97, metalness: 0 },
	sand: { color: 0xa79772, roughness: 0.98, metalness: 0 },
	foliage: { color: 0x36512f, roughness: 0.95, metalness: 0 },
	fabric: { color: 0x4d4a41, roughness: 0.98, metalness: 0 },
	tent: { color: 0x5c5b46, roughness: 0.97, metalness: 0 },
	camo: { color: 0x49512f, roughness: 0.96, metalness: 0 },
	rubber: { color: 0x2b2b2d, roughness: 0.93, metalness: 0 },
	plastic: { color: 0xb5b8ba, roughness: 0.6, metalness: 0 },
	water: { color: 0x2a4750, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.75 },
};

/*
 * Берёт материал из подсистемы materials, если она его отдаёт.
 * Иначе — честный PBR-фоллбэк, помеченный owFallback для корректного dispose.
 */
export function resolveMaterial(ctx, key, cache) {
	const cached = cache.get(key);
	if (cached) return cached;

	const surf = MATERIAL_SURFACE[key] || 'concrete';
	let mats = null;
	try {
		if (ctx && typeof ctx.peek === 'function') mats = ctx.peek('materials');
	} catch (e) {
		mats = null;
	}
	if (!mats) {
		try {
			if (ctx && typeof ctx.get === 'function') mats = ctx.get('materials');
		} catch (e) {
			mats = null;
		}
	}

	let mat = null;
	if (mats) {
		const names = ['getSurface', 'surface', 'get', 'material', 'make', 'byName'];
		for (let i = 0; i < names.length && !mat; i++) {
			const member = mats[names[i]];
			if (typeof member === 'function') {
				try {
					const r = member.call(mats, key);
					if (r && r.isMaterial) mat = r;
				} catch (e) {
					mat = null;
				}
			} else if (member && typeof member === 'object' && member[key] && member[key].isMaterial) {
				mat = member[key];
			}
		}
		if (!mat && mats.surfaces && mats.surfaces[key] && mats.surfaces[key].isMaterial) mat = mats.surfaces[key];
	}

	if (mat && mat.userData && mat.userData.surface && mat.userData.surface !== surf) {
		mat = mat.clone();
		mat.userData.owCloned = true;
	}

	if (!mat) {
		const p = FALLBACK_PBR[key] || FALLBACK_PBR.concrete;
		mat = new THREE.MeshStandardMaterial({
			color: p.color,
			roughness: p.roughness,
			metalness: p.metalness,
			transparent: !!p.transparent,
			opacity: p.opacity === undefined ? 1 : p.opacity,
			side: p.transparent ? THREE.DoubleSide : THREE.FrontSide,
		});
		if (p.emissive !== undefined) {
			mat.emissive = new THREE.Color(p.emissive);
			mat.emissiveIntensity = p.emissiveIntensity === undefined ? 1 : p.emissiveIntensity;
		}
		mat.name = 'ow:' + key;
		mat.userData.owFallback = true;
	}

	mat.userData.surface = surf;
	mat.userData.surfaceIndex = surfaceIndex(surf);
	cache.set(key, mat);
	return mat;
}

function hash32(s) {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

function mulberry32(seed) {
	let a = seed >>> 0;
	return function next() {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/* Детерминированный RNG. Math.random() не используется нигде. */
export function makeRng(ctx, label) {
	const r = ctx && ctx.rng;
	if (r) {
		if (typeof r.fork === 'function') {
			const f = r.fork(label);
			if (typeof f === 'function') return f;
			if (f && typeof f.next === 'function') return function next() { return f.next(); };
			if (f && typeof f.float === 'function') return function next() { return f.float(); };
		}
		if (typeof r === 'function') return r;
		if (typeof r.next === 'function') return function next() { return r.next(); };
		if (typeof r.float === 'function') return function next() { return r.float(); };
	}
	return mulberry32(hash32(label));
}

/*
 * Поддерживает оба стиля вызова:
 *   buildCustoms(world, ctx, opts)
 *   buildCustoms({ world, ctx, rng, night })
 */
export function normalizeBuildArgs(a, b, c) {
	if (a && !b && typeof a === 'object' && !a.isObject3D && (a.ctx || a.world)) {
		const ctx = a.ctx || null;
		let world = a.world || null;
		if (!world && ctx && typeof ctx.peek === 'function') {
			try {
				world = ctx.peek('world');
			} catch (e) {
				world = null;
			}
		}
		return { world: world, ctx: ctx, opts: a };
	}
	return { world: a || null, ctx: b || null, opts: c || {} };
}

const NEI_X = [1, -1, 0, 0, 1, 1, -1, -1];
const NEI_Z = [0, 0, 1, -1, 1, -1, 1, -1];

/* Навигационная сетка с A* на бинарной куче. После прогрева не аллоцирует. */
export class NavGrid {
	constructor(size, cell) {
		this.cell = cell;
		this.size = size;
		this.half = size * 0.5;
		this.w = Math.ceil(size / cell) + 2;
		this.h = this.w;
		this.ox = -this.half - cell;
		this.oz = -this.half - cell;
		const n = this.w * this.h;
		this.blocked = new Uint8Array(n);
		this._g = new Float32Array(n);
		this._f = new Float32Array(n);
		this._prev = new Int32Array(n);
		this._state = new Uint8Array(n);
		this._stamp = new Int32Array(n);
		this._heap = new Int32Array(n * 2 + 8);
		this._rev = new Int32Array(n);
		this._heapLen = 0;
		this._run = 0;
		this._pool = [];
		this._out = [];
	}

	ix(x) {
		let i = Math.floor((x - this.ox) / this.cell);
		if (i < 0) i = 0;
		if (i >= this.w) i = this.w - 1;
		return i;
	}

	iz(z) {
		let i = Math.floor((z - this.oz) / this.cell);
		if (i < 0) i = 0;
		if (i >= this.h) i = this.h - 1;
		return i;
	}

	wx(ix) {
		return this.ox + (ix + 0.5) * this.cell;
	}

	wz(iz) {
		return this.oz + (iz + 0.5) * this.cell;
	}

	free(ix, iz) {
		if (ix < 0 || iz < 0 || ix >= this.w || iz >= this.h) return false;
		return this.blocked[iz * this.w + ix] === 0;
	}

	freeWorld(x, z) {
		return this.free(this.ix(x), this.iz(z));
	}

	bake(colliders) {
		for (let i = 0; i < colliders.length; i++) {
			const b = colliders[i];
			if (b.tag === 'floor' || b.tag === 'roof' || b.tag === 'loot' || b.tag === 'decor') continue;
			const top = b.cy + b.hy;
			const bot = b.cy - b.hy;
			if (top < 0.35) continue;
			if (bot > 1.9) continue;
			const ca = Math.abs(Math.cos(b.yaw));
			const sa = Math.abs(Math.sin(b.yaw));
			const rx = ca * b.hx + sa * b.hz + 0.45;
			const rz = sa * b.hx + ca * b.hz + 0.45;
			const x0 = this.ix(b.cx - rx);
			const x1 = this.ix(b.cx + rx);
			const z0 = this.iz(b.cz - rz);
			const z1 = this.iz(b.cz + rz);
			for (let iz = z0; iz <= z1; iz++) {
				const row = iz * this.w;
				for (let ix = x0; ix <= x1; ix++) this.blocked[row + ix] = 1;
			}
		}
		for (let i = 0; i < this.w; i++) {
			this.blocked[i] = 1;
			this.blocked[(this.h - 1) * this.w + i] = 1;
			this.blocked[i * this.w] = 1;
			this.blocked[i * this.w + this.w - 1] = 1;
		}
	}

	_push(node) {
		if (this._heapLen + 2 >= this._heap.length) return;
		let i = ++this._heapLen;
		this._heap[i] = node;
		const f = this._f;
		while (i > 1) {
			const p = i >> 1;
			if (f[this._heap[p]] <= f[this._heap[i]]) break;
			const t = this._heap[p];
			this._heap[p] = this._heap[i];
			this._heap[i] = t;
			i = p;
		}
	}

	_pop() {
		const top = this._heap[1];
		this._heap[1] = this._heap[this._heapLen--];
		const f = this._f;
		let i = 1;
		for (;;) {
			const l = i << 1;
			const r = l + 1;
			let m = i;
			if (l <= this._heapLen && f[this._heap[l]] < f[this._heap[m]]) m = l;
			if (r <= this._heapLen && f[this._heap[r]] < f[this._heap[m]]) m = r;
			if (m === i) break;
			const t = this._heap[m];
			this._heap[m] = this._heap[i];
			this._heap[i] = t;
			i = m;
		}
		return top;
	}

	_heur(ax, az, bx, bz) {
		const dx = Math.abs(ax - bx);
		const dz = Math.abs(az - bz);
		const d = dx < dz ? dx : dz;
		return dx + dz - 0.58578 * d;
	}

	_vec(i) {
		let v = this._pool[i];
		if (!v) {
			v = new THREE.Vector3();
			this._pool[i] = v;
		}
		return v;
	}

	nearestFree(ix, iz, radius) {
		if (this.free(ix, iz)) return iz * this.w + ix;
		let best = -1;
		let bestD = 1e9;
		for (let dz = -radius; dz <= radius; dz++) {
			for (let dx = -radius; dx <= radius; dx++) {
				const nx = ix + dx;
				const nz = iz + dz;
				if (!this.free(nx, nz)) continue;
				const d = dx * dx + dz * dz;
				if (d < bestD) {
					bestD = d;
					best = nz * this.w + nx;
				}
			}
		}
		return best;
	}

	findPath(from, to, out) {
		const res = out || this._out;
		res.length = 0;
		const startIdx = this.nearestFree(this.ix(from.x), this.iz(from.z), 3);
		const goalIdx = this.nearestFree(this.ix(to.x), this.iz(to.z), 4);
		if (startIdx < 0 || goalIdx < 0) return res;
		if (startIdx === goalIdx) {
			const v = this._vec(0);
			v.set(to.x, 0, to.z);
			res.push(v);
			return res;
		}

		const tx = goalIdx % this.w;
		const tz = (goalIdx / this.w) | 0;
		const run = ++this._run;
		this._heapLen = 0;
		this._stamp[startIdx] = run;
		this._g[startIdx] = 0;
		this._f[startIdx] = this._heur(startIdx % this.w, (startIdx / this.w) | 0, tx, tz);
		this._prev[startIdx] = -1;
		this._state[startIdx] = 1;
		this._push(startIdx);

		const limit = this.w * this.h;
		let guard = 0;
		let found = false;
		while (this._heapLen > 0 && guard++ < limit * 3) {
			const cur = this._pop();
			if (this._stamp[cur] !== run || this._state[cur] === 2) continue;
			this._state[cur] = 2;
			if (cur === goalIdx) {
				found = true;
				break;
			}
			const cix = cur % this.w;
			const ciz = (cur / this.w) | 0;
			const gc = this._g[cur];
			for (let k = 0; k < 8; k++) {
				const nx = cix + NEI_X[k];
				const nz = ciz + NEI_Z[k];
				if (!this.free(nx, nz)) continue;
				if (k >= 4 && (!this.free(nx, ciz) || !this.free(cix, nz))) continue;
				const ni = nz * this.w + nx;
				if (this._stamp[ni] !== run) {
					this._stamp[ni] = run;
					this._g[ni] = 1e30;
					this._state[ni] = 0;
					this._prev[ni] = -1;
				}
				if (this._state[ni] === 2) continue;
				const ng = gc + (k >= 4 ? 1.41421356 : 1);
				if (ng < this._g[ni]) {
					this._g[ni] = ng;
					this._f[ni] = ng + this._heur(nx, nz, tx, tz);
					this._prev[ni] = cur;
					this._state[ni] = 1;
					this._push(ni);
				}
			}
		}
		if (!found) return res;

		let n = goalIdx;
		let len = 0;
		while (n !== -1 && len < limit) {
			this._rev[len++] = n;
			n = this._prev[n];
		}
		for (let i = len - 2; i >= 0; i--) {
			const idx = this._rev[i];
			const v = this._vec(res.length);
			v.set(this.wx(idx % this.w), 0, this.wz((idx / this.w) | 0));
			res.push(v);
		}
		if (res.length > 0) res[res.length - 1].set(to.x, 0, to.z);
		return res;
	}

	randomFree(rng, out) {
		for (let i = 0; i < 64; i++) {
			const ix = 1 + ((rng() * (this.w - 2)) | 0);
			const iz = 1 + ((rng() * (this.h - 2)) | 0);
			if (!this.free(ix, iz)) continue;
			out.set(this.wx(ix), 0, this.wz(iz));
			return true;
		}
		return false;
	}
}

/* Только эти шесть типов есть в ItemsSystem.LOOT, другие ключи создадут пустые контейнеры. */
export const LOOT_KINDS = ['crate', 'jacket', 'safe', 'med', 'tool', 'gun'];

const LOOT_MATERIAL = { crate: 'wood', jacket: 'fabric', safe: 'metal', med: 'plastic', tool: 'rust', gun: 'wood' };
const LOOT_SIZE = {
	crate: [0.95, 0.7, 0.7],
	jacket: [0.5, 0.95, 0.28],
	safe: [0.8, 0.9, 0.7],
	med: [0.6, 0.5, 0.42],
	tool: [1.0, 0.55, 0.6],
	gun: [1.25, 0.4, 0.5],
};
const LOOT_NAME = {
	crate: 'Деревянный ящик',
	jacket: 'Куртка',
	safe: 'Сейф',
	med: 'Медицинский ящик',
	tool: 'Ящик с инструментом',
	gun: 'Оружейный ящик',
};

export class MapKit {
	constructor(world, ctx, opts) {
		const o = opts || {};
		this.world = world || null;
		this.ctx = ctx || null;
		this.id = o.id || 'map';
		this.name = o.name || this.id;
		this.size = o.size || 120;
		this.half = this.size * 0.5;
		this.night = !!o.night;
		this.duration = o.duration || 25 * 60;
		this.lightBudget = o.lightBudget || 16;
		this.rng = o.rng || makeRng(ctx, 'map:' + this.id);

		this.group = new THREE.Group();
		this.group.name = 'map:' + this.id;

		this.exits = [];
		this.doors = [];
		this.rooms = [];
		this.lootSpots = [];
		this.lights = [];
		this.colliders = [];
		this.spawns = { pmc: [], scav: [], bot: [] };
		this.materials = new Map();
		this.fogSpec = null;
		this.ambientSpec = null;

		this._batches = new Map();
		this._geo = new Map();
		this._lightsUsed = 0;
		this._m4 = new THREE.Matrix4();
		this._q = new THREE.Quaternion();
		this._e = new THREE.Euler();
		this._v1 = new THREE.Vector3();
		this._v2 = new THREE.Vector3();
		this.bounds = new THREE.Box3();
		this.bounds.makeEmpty();
	}

	mat(key) {
		return resolveMaterial(this.ctx, key, this.materials);
	}

	rand(a, b) {
		return a + (b - a) * this.rng();
	}

	randInt(a, b) {
		return a + Math.floor((b - a + 1) * this.rng());
	}

	pick(arr) {
		return arr[(this.rng() * arr.length) | 0];
	}

	_geometry(shape) {
		let g = this._geo.get(shape);
		if (!g) {
			if (shape === 'cyl') g = new THREE.CylinderGeometry(0.5, 0.5, 1, 14, 1);
			else if (shape === 'cone') g = new THREE.ConeGeometry(0.5, 1, 10, 1);
			else if (shape === 'sphere') g = new THREE.SphereGeometry(0.5, 10, 8);
			else g = new THREE.BoxGeometry(1, 1, 1);
			this._geo.set(shape, g);
		}
		return g;
	}

	_batch(shape, matKey, cx, cy, cz, sx, sy, sz, yaw) {
		const key = shape + '|' + matKey;
		let b = this._batches.get(key);
		if (!b) {
			b = { shape: shape, matKey: matKey, list: [] };
			this._batches.set(key, b);
		}
		b.list.push(cx, cy, cz, sx, sy, sz, yaw);
	}

	_expand(cx, cy, cz, hx, hy, hz) {
		const r = hx > hz ? hx : hz;
		this._v1.set(cx - r, cy - hy, cz - r);
		this.bounds.expandByPoint(this._v1);
		this._v1.set(cx + r, cy + hy, cz + r);
		this.bounds.expandByPoint(this._v1);
	}

	/* Аналитический OBB. Идёт в навсетку и в быстрые проверки физики. */
	collider(cx, cy, cz, hx, hy, hz, yaw, matKey, tag) {
		const surf = MATERIAL_SURFACE[matKey] || 'concrete';
		const c = {
			cx: cx,
			cy: cy,
			cz: cz,
			hx: hx,
			hy: hy,
			hz: hz,
			yaw: yaw || 0,
			surface: surf,
			surfaceIndex: surfaceIndex(surf),
			tag: tag || '',
			open: false,
		};
		this.colliders.push(c);
		if (this.world && typeof this.world.addCollider === 'function') {
			try {
				this.world.addCollider(c);
			} catch (e) {
				/* движок может не принимать аналитические боксы, список всё равно уедет в дескриптор */
			}
		}
		this._expand(cx, cy, cz, hx, hy, hz);
		return this.colliders.length - 1;
	}

	/* Батченый ящик: геометрия уйдёт в InstancedMesh на finalize(). */
	box(matKey, cx, cy, cz, sx, sy, sz, yaw, tag) {
		this._batch('box', matKey, cx, cy, cz, sx, sy, sz, yaw || 0);
		return this.collider(cx, cy, cz, sx * 0.5, sy * 0.5, sz * 0.5, yaw || 0, matKey, tag);
	}

	/* Небатченый ящик — для того, что надо двигать в рантайме (двери). */
	uniqueBox(matKey, cx, cy, cz, sx, sy, sz, yaw, tag) {
		const mesh = new THREE.Mesh(this._geometry('box'), this.mat(matKey));
		mesh.position.set(cx, cy, cz);
		mesh.rotation.y = yaw || 0;
		mesh.scale.set(sx, sy, sz);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.name = (tag || 'box') + ':' + matKey;
		mesh.userData.surface = MATERIAL_SURFACE[matKey] || 'concrete';
		mesh.userData.surfaceIndex = surfaceIndex(mesh.userData.surface);
		this.group.add(mesh);
		this._register(mesh);
		const id = this.collider(cx, cy, cz, sx * 0.5, sy * 0.5, sz * 0.5, yaw || 0, matKey, tag);
		return { mesh: mesh, colliderId: id };
	}

	cylinder(matKey, cx, cy, cz, radius, height, tag, solid) {
		this._batch('cyl', matKey, cx, cy, cz, radius * 2, height, radius * 2, 0);
		if (solid === false) return -1;
		return this.collider(cx, cy, cz, radius, height * 0.5, radius, 0, matKey, tag);
	}

	cone(matKey, cx, cy, cz, radius, height, tag, solid) {
		this._batch('cone', matKey, cx, cy, cz, radius * 2, height, radius * 2, 0);
		if (solid === false) return -1;
		return this.collider(cx, cy, cz, radius * 0.6, height * 0.5, radius * 0.6, 0, matKey, tag);
	}

	/* Отрезок стены между двумя точками на плане. */
	wallSeg(matKey, x1, z1, x2, z2, h, t, tag) {
		const dx = x2 - x1;
		const dz = z2 - z1;
		const len = Math.sqrt(dx * dx + dz * dz);
		if (len < 0.001) return -1;
		const yaw = Math.atan2(dx, dz);
		return this.box(matKey, x1 + dx * 0.5, h * 0.5, z1 + dz * 0.5, t, h, len, yaw, tag || 'wall');
	}

	ground(matKey) {
		const geo = new THREE.PlaneGeometry(this.size, this.size, 1, 1);
		const mesh = new THREE.Mesh(geo, this.mat(matKey));
		mesh.rotation.x = -Math.PI * 0.5;
		mesh.receiveShadow = true;
		mesh.name = 'ground:' + matKey;
		mesh.userData.surface = MATERIAL_SURFACE[matKey] || 'dirt';
		mesh.userData.surfaceIndex = surfaceIndex(mesh.userData.surface);
		this.group.add(mesh);
		this._register(mesh);
		this.collider(0, -0.5, 0, this.half, 0.5, this.half, 0, matKey, 'floor');
		return mesh;
	}

	/* Внешняя стена по периметру. */
	perimeter(matKey, h, t) {
		const s = this.half;
		const th = t === undefined ? 0.8 : t;
		this.box(matKey, 0, h * 0.5, -s, this.size, h, th, 0, 'wall');
		this.box(matKey, 0, h * 0.5, s, this.size, h, th, 0, 'wall');
		this.box(matKey, -s, h * 0.5, 0, th, h, this.size, 0, 'wall');
		this.box(matKey, s, h * 0.5, 0, th, h, this.size, 0, 'wall');
	}

	/* Детерминированный разброс. fn возвращает false, если точка не подошла. */
	scatter(count, tries, fn) {
		let placed = 0;
		let guard = 0;
		const lim = count * (tries || 10);
		while (placed < count && guard++ < lim) {
			const x = (this.rng() * 2 - 1) * (this.half - 4);
			const z = (this.rng() * 2 - 1) * (this.half - 4);
			if (fn(x, z, placed) === false) continue;
			placed++;
		}
		return placed;
	}

	/*
	 * Коробка с четырьмя стенами, проёмом в северной стене, крышей, полом,
	 * внутренними перегородками, лампой и дверью. Прямой потомок building() из оригинала.
	 */
	building(spec) {
		const x = spec.x;
		const z = spec.z;
		const w = spec.w;
		const d = spec.d;
		const h = spec.h;
		const surf = spec.surf || 'wall';
		const t = spec.t === undefined ? 0.4 : spec.t;
		const doorW = spec.doorWidth === undefined ? 3.2 : spec.doorWidth;
		const name = spec.name || 'Строение';
		const hw = w * 0.5;
		const hd = d * 0.5;
		const side = (w - doorW) * 0.25;

		/* северная стена с дверным проёмом */
		this.box(surf, x - (doorW * 0.5 + side), h * 0.5, z - hd, side * 2, h, t, 0, 'wall');
		this.box(surf, x + (doorW * 0.5 + side), h * 0.5, z - hd, side * 2, h, t, 0, 'wall');
		this.box(surf, x, h - 0.55, z - hd, doorW, 1.1, t, 0, 'wall');

		this.box(surf, x, h * 0.5, z + hd, w, h, t, 0, 'wall');
		this.box(surf, x - hw, h * 0.5, z, t, h, d, 0, 'wall');
		this.box(surf, x + hw, h * 0.5, z, t, h, d, 0, 'wall');

		if (spec.floor !== false) this.box(spec.floorSurf || 'concrete', x, 0.05, z, w, 0.1, d, 0, 'floor');
		if (spec.roof !== false) this.box(spec.roofSurf || 'corrugated', x, h + 0.15, z, w + 0.6, 0.3, d + 0.6, 0, 'roof');

		if (w > 12 && d > 12 && spec.partitions !== false) {
			this.box(surf, x, h * 0.5, z, w * 0.5, h, t, 0, 'wall');
			this.box(surf, x + w * 0.2, h * 0.5, z + d * 0.22, t, h, d * 0.4, 0, 'wall');
		}

		if (spec.lamp !== false) {
			this.lamp(x, h - 0.5, z, spec.lampColor || 0xffd9a0, spec.lampIntensity || 1.4, spec.lampRange || Math.max(w, d) * 0.95);
		}

		const door = this.door(x, 0, z - hd, 0, doorW, name, spec.keyId || null);
		const rec = { name: name, x: x, z: z, w: w, d: d, h: h, door: door };
		this.rooms.push(rec);
		return rec;
	}

	lamp(x, y, z, color, intensity, distance) {
		const col = color === undefined ? 0xffd9a0 : color;
		const pow = intensity === undefined ? 1.2 : intensity;
		const dist = distance === undefined ? 18 : distance;

		if (this.world && typeof this.world.lamp === 'function') {
			this._v1.set(x, y, z);
			try {
				const l = this.world.lamp(this._v1, col, pow, dist);
				if (l) this.lights.push(l);
				this._lightsUsed++;
				return l || null;
			} catch (e) {
				/* падаем в собственный путь */
			}
		}
		if (this._lightsUsed >= this.lightBudget) return null;
		const light = new THREE.PointLight(col, pow, dist, 2);
		light.position.set(x, y, z);
		light.castShadow = false;
		light.name = 'lamp:' + this.lights.length;
		this.group.add(light);
		this.lights.push(light);
		this._lightsUsed++;
		this._batch('box', 'lamp', x, y + 0.12, z, 0.5, 0.08, 0.5, 0);
		return light;
	}

	door(x, y, z, yaw, width, name, keyId) {
		const h = 2.1;
		const t = 0.14;
		const made = this.uniqueBox('metal', x, y + h * 0.5, z, width, h, t, yaw || 0, 'door');
		const rec = {
			id: this.id + ':door' + this.doors.length,
			name: name || 'Дверь',
			keyId: keyId || null,
			locked: !!keyId,
			open: false,
			width: width,
			yaw: yaw || 0,
			position: new THREE.Vector3(x, y, z),
			mesh: made.mesh,
			colliderId: made.colliderId,
		};
		this.doors.push(rec);
		return rec;
	}

	/* Точка лута: визуал уходит в батч, а сама точка — в lootSpots для RaidSystem. */
	loot(kind, x, y, z, name, rich) {
		const k = LOOT_MATERIAL[kind] ? kind : 'crate';
		const s = LOOT_SIZE[k];
		const yaw = this.rng() * Math.PI * 2;
		this.box(LOOT_MATERIAL[k], x, y + s[1] * 0.5, z, s[0], s[1], s[2], yaw, 'loot');
		const spot = {
			id: this.id + ':loot' + this.lootSpots.length,
			kind: k,
			name: name || LOOT_NAME[k],
			position: new THREE.Vector3(x, y + s[1] * 0.5, z),
			radius: 1.7,
			rich: rich === undefined ? 1 : rich,
			searched: false,
		};
		this.lootSpots.push(spot);
		return spot;
	}

	/*
	 * Нормализация выхода под новый RaidSystem.exitStatus:
	 *   afterSec  - открыт только когда до конца рейда осталось меньше afterSec (бывший maxLeft)
	 *   beforeSec - закрывается, когда времени осталось меньше beforeSec
	 *   faction   - 'scav' для выходов только за Дикого (бывший fac)
	 *   needKey   - id ключа (бывший key)
	 */
	exit(spec) {
		const e = {
			id: spec.id || this.id + ':exit' + this.exits.length,
			name: spec.name || 'Выход',
			position: new THREE.Vector3(spec.x, spec.y === undefined ? 0 : spec.y, spec.z),
			radius: spec.radius === undefined ? 3.2 : spec.radius,
			faction: spec.faction || null,
			afterSec: spec.afterSec === undefined ? 0 : spec.afterSec,
			beforeSec: spec.beforeSec === undefined ? 0 : spec.beforeSec,
			needKey: spec.needKey || null,
			cost: spec.cost === undefined ? 0 : spec.cost,
			freeHands: !!spec.freeHands,
			transfer: spec.transfer || null,
			noBotsNear: spec.noBotsNear === undefined ? 0 : spec.noBotsNear,
			note: spec.note || '',
		};
		this.exits.push(e);
		/* Визуальный маркер зоны эвакуации: две стойки и плита под ногами. */
		if (spec.marker !== false) {
			const r = e.radius;
			this.box('asphalt', e.position.x, 0.03, e.position.z, r * 1.6, 0.06, r * 1.6, 0, 'floor');
			this.box('rust', e.position.x - r * 0.7, 1.1, e.position.z, 0.2, 2.2, 0.2, 0, 'decor');
			this.box('rust', e.position.x + r * 0.7, 1.1, e.position.z, 0.2, 2.2, 0.2, 0, 'decor');
		}
		return e;
	}

	spawn(kind, x, y, z) {
		const list = this.spawns[kind] || (this.spawns[kind] = []);
		const v = new THREE.Vector3(x, y === undefined ? 0 : y, z);
		list.push(v);
		return v;
	}

	setFog(color, density) {
		this.fogSpec = { color: color, density: density };
		return this.fogSpec;
	}

	setAmbient(spec) {
		this.ambientSpec = spec;
		return spec;
	}

	_register(obj) {
		const w = this.world;
		if (!w) return;
		const info = {
			static: true,
			surface: obj.userData ? obj.userData.surface : 'concrete',
			surfaceIndex: obj.userData ? obj.userData.surfaceIndex : 0,
			name: obj.name,
		};
		try {
			if (typeof w.addMesh === 'function') {
				w.addMesh(obj, info);
				return;
			}
			if (typeof w.addStatic === 'function') {
				w.addStatic(obj, info);
				return;
			}
			if (typeof w.trackStatic === 'function') {
				w.trackStatic(obj, info);
			}
		} catch (e) {
			/* меш всё равно лежит в group, physics.rebuild(group) его подберёт */
		}
	}

	finalizeBatches() {
		const it = this._batches.values();
		for (let e = it.next(); !e.done; e = it.next()) {
			const b = e.value;
			const count = (b.list.length / 7) | 0;
			if (count === 0) continue;
			const mat = this.mat(b.matKey);
			const inst = new THREE.InstancedMesh(this._geometry(b.shape), mat, count);
			inst.name = b.shape + ':' + b.matKey;
			inst.castShadow = true;
			inst.receiveShadow = true;
			inst.userData.surface = mat.userData.surface;
			inst.userData.surfaceIndex = mat.userData.surfaceIndex;
			for (let i = 0; i < count; i++) {
				const o = i * 7;
				this._v1.set(b.list[o], b.list[o + 1], b.list[o + 2]);
				this._v2.set(b.list[o + 3], b.list[o + 4], b.list[o + 5]);
				this._e.set(0, b.list[o + 6], 0);
				this._q.setFromEuler(this._e);
				this._m4.compose(this._v1, this._q, this._v2);
				inst.setMatrixAt(i, this._m4);
			}
			inst.instanceMatrix.needsUpdate = true;
			inst.computeBoundingSphere();
			this.group.add(inst);
			this._register(inst);
		}
		this._batches.clear();
	}

	finalize() {
		this.finalizeBatches();

		if (this.bounds.isEmpty()) {
			this._v1.set(-this.half, -2, -this.half);
			this._v2.set(this.half, 16, this.half);
			this.bounds.set(this._v1, this._v2);
		}

		const navGrid = new NavGrid(this.size, 1.6);
		navGrid.bake(this.colliders);

		const mats = [];
		const mit = this.materials.values();
		for (let e = mit.next(); !e.done; e = mit.next()) mats.push(e.value);

		const geos = [];
		const git = this._geo.values();
		for (let e = git.next(); !e.done; e = git.next()) geos.push(e.value);

		return {
			id: this.id,
			name: this.name,
			group: this.group,
			root: this.group,
			size: this.size,
			night: this.night,
			duration: this.duration,
			bounds: this.bounds,
			exits: this.exits,
			doors: this.doors,
			rooms: this.rooms,
			lootSpots: this.lootSpots,
			spawnZones: this.spawns,
			colliders: this.colliders,
			navGrid: navGrid,
			lights: this.lights,
			materials: mats,
			geometries: geos,
			fog: this.fogSpec,
			ambient: this.ambientSpec,
		};
	}
}

export default MapKit;