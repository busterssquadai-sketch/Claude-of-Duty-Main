import * as THREE from "three";

/** Все повторяющиеся объекты — через InstancedMesh, а не меш на штуку. */
const KITS = [
  "barrel",
  "crate",
  "pallet",
  "locker",
  "pipe",
  "fence",
  "car",
  "tree",
  "bush",
];

export async function buildFactory({
  ctx,
  rng,
  night,
  mats,
  world,
  size,
  track,
}) {
  const group = new THREE.Group();
  const lootSpots = [];
  const exits = [];
  const counts = Object.create(null);

  // 1. Геометрия стен/полов — одна слитая BufferGeometry на материал.
  //    В твоём mkBox каждая стена — отдельный Mesh: на Заводе это ~900 draw calls.
  //    После слияния по материалу — 12–18.
  const shell = mats.mergeStatic([
    ...hall(rng),
    ...catwalks(rng),
    ...basement(rng),
    ...offices(rng),
    ...tent(rng),
  ]);
  group.add(track(shell));

  // 2. Инстансинг китов
  for (const kit of KITS) {
    const placements = scatter(kit, rng, size);
    if (!placements.length) continue;
    const inst = mats.instanced(kit, placements.length);
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      inst.setMatrixAt(i, p.matrix);
      if (p.loot)
        lootSpots.push({
          kind: p.loot,
          position: p.position,
          mesh: inst,
          instanceId: i,
          rich: p.rich,
        });
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.userData.owNoPrepass = kit === "bush" || kit === "tree"; // листва без depth-prepass
    group.add(track(inst));
  }

  // 3. Свет: только через world.lamp() — фиксированный пул
  for (const spot of lampSpots(rng))
    world.lamp(spot.pos, night ? 0xffc98a : 0xfff0d0, night ? 2.4 : 1.1, 16);

  // 4. Выходы — те же, что в твоём buildFactory
  exits.push(
    {
      id: "ex01",
      name: "Ворота 0",
      position: v(-40, 0, -44),
      radius: 3.5,
      faction: "pmc",
    },
    {
      id: "ex02",
      name: "Каморка",
      position: v(41, 0, 12),
      radius: 3.0,
      needKey: "key_cellar",
    },
    {
      id: "ex03",
      name: "Собиратель",
      position: v(2, 0, 46),
      radius: 3.5,
      faction: "scav",
    },
    {
      id: "ex04",
      name: "Кабельный люк",
      position: v(-18, -4, 30),
      radius: 2.5,
      freeHands: true,
    },
    {
      id: "ex05",
      name: "Офисный выход",
      position: v(26, 6, -20),
      radius: 3.0,
      cost: 7000,
      afterSec: 15 * 60,
    },
    {
      id: "tr01",
      name: "→ Таможня",
      position: v(-46, 0, 20),
      radius: 3.0,
      transfer: "customs",
    },
    {
      id: "tr02",
      name: "→ Развязка",
      position: v(46, 0, -30),
      radius: 3.0,
      transfer: "interchange",
    },
    {
      id: "tr03",
      name: "→ Лаборатория",
      position: v(0, -6, -2),
      radius: 2.5,
      transfer: "lab",
      needKey: "tgcard",
    },
  );

  const navGrid = buildNav(group, size, 0.75);
  return { group, exits, lootSpots, navGrid, spawnZones: zones(rng, size) };
}
