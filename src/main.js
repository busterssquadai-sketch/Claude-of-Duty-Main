import { Engine } from './core/engine.js';
import { createConfig } from './core/config.js';

import { RenderSystem } from './render/index.js';
import { MaterialSystem } from './materials/index.js';
import { SkySystem } from './sky/index.js';
import { WorldSystem } from './world/index.js';
import { PhysicsSystem } from './physics/index.js';
import { PlayerSystem } from './player/index.js';
import { WeaponSystem } from './weapons/index.js';
import { FxSystem } from './fx/index.js';
import { AiSystem } from './ai/index.js';
import { UiSystem } from './ui/index.js';
import { AudioSystem } from './audio/index.js';

// --- EFL ---
import { ItemsSystem } from './items/index.js';
import { InventorySystem } from './inventory/index.js';
import { HealthSystem } from './health/index.js';
import { MetaSystem } from './meta/index.js';
import { RaidSystem } from './raid/index.js';
import { NetSystem } from './net/index.js';

import { installShotApi } from './dev/shots.js';
import { prewarm } from './core/prewarm.js';

const params = new URLSearchParams(location.search);
const capture = params.get('capture') === '1';
const lockstep = capture && params.get('lockstep') === '1';

const config = createConfig({
  quality: params.get('q') ?? 'high',   // EFL: интерьеры дешевле улицы, high — рабочий дефолт
  deterministic: capture,
});

const engine = new Engine({ canvas: document.getElementById('game'), config });

engine
  .add(RenderSystem)
  .add(MaterialSystem)
  .add(SkySystem)
  .add(WorldSystem)
  .add(PhysicsSystem)
  .add(PlayerSystem)
  .add(WeaponSystem)
  .add(FxSystem)
  .add(AiSystem)
  .add(UiSystem)
  .add(AudioSystem)
  // порядок ниже не важен — решают static deps
  .add(ItemsSystem)
  .add(InventorySystem)
  .add(HealthSystem)
  .add(MetaSystem)
  .add(RaidSystem)
  .add(NetSystem);

try {
  await engine.init();
} catch (err) {
  console.error('[boot] init failed', err);
  throw err;
}

const shotApi = installShotApi(engine, { capture, lockstep });

// Прогрев шейдеров обязателен: у EFL добавились варианты материалов лута,
// трупов и оружейных модов — без него они компилируются в бою.
const warmup = params.get('prewarm') === '0'
  ? { ok: false, reason: 'disabled' }
  : await prewarm(engine);
console.info('[boot] prewarm', warmup);

engine.start();

const BOOT_FRAMES = 3;
if (lockstep) {
  await shotApi.pump(BOOT_FRAMES);
  window.__READY__ = true;
} else {
  let warm = 0;
  const probe = () => { if (++warm >= BOOT_FRAMES) window.__READY__ = true; else requestAnimationFrame(probe); };
  requestAnimationFrame(probe);
}

window.__ENGINE__ = engine;
if (import.meta.hot) import.meta.hot.dispose(() => engine.dispose());