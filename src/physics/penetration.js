import * as THREE from 'three';

const MAX_LAYERS = 6;        // больше шести преград не пробивает ничто
 const MAX_DIST = 420;
const POOL = 16;

/** Создаётся один раз в PhysicsSystem.init(). Все буферы — замыкания, аллокаций в рантайме нет. */
export function createPenetrator(ctx, physics) {
  const items = ctx.get('items');
  const rng = ctx.rng.fork('ballistics');

  const p = new THREE.Vector3();
  const d = new THREE.Vector3();
  const n = new THREE.Vector3();
  const from = new THREE.Vector3();
  const refl = new THREE.Vector3();
  const exitP = new THREE.Vector3();
  const pool = new Array(POOL);
  for (let i = 0; i < POOL; i++) pool[i] = new THREE.Vector3();

  // переиспользуемый результат рейкаста: physics.raycastInto пишет сюда
  const hit = {
    hit: false, distance: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(),
    surface: 0, thickness: 0.2, actor: null, partIndex: -1, object: null,
  };
  const back = { hit: false, distance: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), surface: 0 };

  const impact = { point: null, normal: null, surface: '', incident: null, damage: 0, penetrated: 0, armorDamage: 0, target: null, partIndex: -1 };
  const tracer = { from: null, to: null, speed: 900 };

  /** Толщина преграды: второй рейкаст изнутри навстречу. Дешёвле любой CSG. */
  function measure(point, dir, surfaceId) {
    exitP.copy(point).addScaledVector(dir, 1.2);
    refl.copy(dir).negate();
    if (physics.raycastInto(exitP, refl, 1.2, back, physics.MASK_WORLD)) {
      return Math.max(0.02, 1.2 - back.distance);
    }
    return 0.25;
  }

  /**
   * @param origin  THREE.Vector3 — точка вылета
   * @param dir     THREE.Vector3 — нормализованное направление
   * @param ammoIdx индекс патрона в struct-of-arrays items
   * @param shooter владелец выстрела (uid или бот), чтобы не попадать в себя
   */
  function penetrate(origin, dir, ammoIdx, shooter) {
    if (ammoIdx < 0) return;
    p.copy(origin);
    d.copy(dir);
    from.copy(origin);

    let damage = items.aDmg[ammoIdx];
    let pen = items.aPen[ammoIdx];
    const frag = items.aFrag[ammoIdx];
    const armorDmg = items.aArmor[ammoIdx];
    let dist = MAX_DIST;

    for (let layer = 0; layer < MAX_LAYERS; layer++) {
      if (!physics.raycastInto(p, d, dist, hit, physics.MASK_ALL)) break;

      // ---- попадание в актора ----
      if (hit.actor && hit.actor !== shooter) {
        // фрагментация: осколки добавляют урон, но только при достаточной энергии
        const mul = (hit.partIndex === 0 ? 1 : 1) * (pen > 20 && rng.float() < frag ? 1.5 : 1);
        impact.point = hit.point; impact.normal = hit.normal; impact.incident = d;
        impact.surface = 'flesh';
        impact.damage = damage * mul;
        impact.penetrated = pen;
        impact.armorDamage = armorDmg;
        impact.target = hit.actor;
        impact.partIndex = hit.partIndex;
        ctx.events.emit('bullet:impact', impact);

        damage *= 0.55; pen *= 0.5;                     // сквозняк теряет много
        if (pen < 6) break;
        p.copy(hit.point).addScaledVector(d, 0.35);
        dist -= hit.distance + 0.35;
        continue;
      }

      // ---- геометрия мира ----
      const s = hit.surface | 0;
      n.copy(hit.normal);
      const cosA = Math.abs(n.dot(d));
      const angDeg = Math.acos(Math.min(1, cosA)) * 57.2957795;   // угол от нормали

      impact.point = hit.point; impact.normal = hit.normal; impact.incident = d;
      impact.surface = items.surfaceKeys[s];
      impact.damage = damage; impact.penetrated = pen; impact.target = null; impact.partIndex = -1;
      ctx.events.emit('bullet:impact', impact);

      // рикошет: только на острых углах и твёрдых материалах
      if (angDeg > 90 - items.sAng[s] && rng.float() < items.sRic[s]) {
        d.reflect(n).normalize();
        damage *= 0.62; pen *= 0.55;
        p.copy(hit.point).addScaledVector(d, 0.02);
        dist -= hit.distance;
        tracer.from = from; tracer.to = hit.point;
        ctx.events.emit('bullet:tracer', tracer);
        from.copy(hit.point);
        if (pen < 5 || damage < 3) break;
        continue;
      }

      // пробитие: толщина × стоимость, с поправкой на косой вход
      const thick = measure(hit.point, d, s) / Math.max(0.25, cosA);
      const cost = items.sCost[s] * thick;
      if (cost > pen) break;

      pen -= cost;
      damage *= items.sPass[s];
      p.copy(hit.point).addScaledVector(d, thick * 1.05 + 0.02);
      dist -= hit.distance + thick;
      if (damage < 2.5 || pen < 4 || dist <= 0) break;
    }

    tracer.from = from; tracer.to = p;
    ctx.events.emit('bullet:tracer', tracer);
  }

  return { penetrate };
}