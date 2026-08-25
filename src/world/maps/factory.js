import { MapKit, normalizeBuildArgs, makeRng } from './_kit.js';

const SIZE = 96;

const LOOT = [
  ['crate', -30, -24], ['jacket', -24, -18], ['tool', -20, -30], ['med', -14, -22],
  ['safe', -6, -26], ['gun', 2, -18], ['crate', 12, -28], ['jacket', 18, -18],
  ['crate', 26, -6], ['tool', 20, 6], ['med', 10, 12], ['safe', -4, 10],
  ['crate', -20, 20], ['jacket', -8, 28], ['gun', 14, 24], ['tool', 30, 18],
  ['crate', -34, 34], ['med', -18, 36], ['safe', 34, -34],
];

const EXITS = [
  { id: 'factory:gate', name: 'Gate', x: -42, z: -38, radius: 3.5, faction: 'pmc' },
  { id: 'factory:cellar', name: 'Cellar', x: 38, z: 30, radius: 3.0, freeHands: true },
  { id: 'factory:office', name: 'Office', x: 20, z: -34, radius: 3.0, needKey: 'key_factory_office' },
  { id: 'factory:transfer', name: 'To Customs', x: -44, z: 30, radius: 3.0, transfer: 'customs' },
];

function addBlock(kit, x, z, w, d, h, surf, name) {
  kit.building({ x, z, w, d, h, surf, name, partitions: false });
}

export async function buildFactory(world, ctx, opts) {
  const a = normalizeBuildArgs(world, ctx, opts);
  const kit = new MapKit(a.world, a.ctx, {
    id: 'factory',
    name: 'Factory',
    size: SIZE,
    night: !!a.opts.night,
    duration: 25 * 60,
    lightBudget: 20,
    rng: makeRng({ rng: a.opts && a.opts.rng }, 'map:factory'),
  });

  kit.setFog(0x1b1f22, 0.015);
  kit.setAmbient({
    color: 0x2a3135,
    intensity: 0.28,
    sunColor: 0xd8e3ea,
    sunIntensity: a.opts.night ? 0.06 : 0.16,
  });

  kit.ground('concrete');
  kit.perimeter('wall', 8, 0.6);
  kit.box('concrete', 0, 0.04, 0, SIZE - 6, 0.08, SIZE - 6, 0, 'floor');

  addBlock(kit, -16, -10, 40, 22, 8, 'wall', 'main hall');
  addBlock(kit, 18, -20, 18, 12, 6, 'wall', 'offices');
  addBlock(kit, -28, 22, 18, 14, 5, 'tent', 'checkpoint tent');
  addBlock(kit, 22, 22, 14, 14, 5, 'corrugated', 'storage');

  for (let i = 0; i < 10; i++) {
    const x = -34 + i * 7;
    kit.box('metal', x, 1.0, 2 + (i % 2) * 4, 1.2, 2.0, 1.2, i * 0.12, 'decor');
  }

  for (let i = 0; i < LOOT.length; i++) {
    const l = LOOT[i];
    kit.loot(l[0], l[1], 0, l[2], null, 1 + (i % 3) * 0.2);
  }

  for (let i = 0; i < EXITS.length; i++) kit.exit(EXITS[i]);

  kit.spawn('pmc', -38, 0, -32);
  kit.spawn('pmc', 30, 0, -30);
  kit.spawn('scav', -30, 0, 34);
  kit.spawn('scav', 34, 0, 20);
  kit.spawn('bot', 0, 0, 0);

  return kit.finalize();
}

export default buildFactory;
