import { applyTarkovPlayerPatch } from '../player/tarkovPlayerPatch.js';
import { applyTarkovPhysicsPatch } from '../physics/tarkovPhysicsPatch.js';
import { applyMainMenuBridge } from '../ui/mainMenuBridge.js';
import { applySettingsBridge } from '../ui/settingsBridge.js';

/*
 * Единственный швав для патчей, которые обязаны встать ДО сборки движка.
 *
 * Вызывается первой строкой main.js, то есть раньше new Engine() и раньше
 * engine.init(). Это принципиально для settingsBridge: UiSystem создаёт
 * SettingsMenu внутри init(), а конструктор панели сразу зовёт applyAll().
 * Если патч опоздает, первый прогон настроек уйдёт в никуда.
 *
 * Каждый патч изолирован: падение одного моста не должно уронить загрузку
 * игры целиком.
 */
function step(name, fn) {
  try {
    fn();
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.error('[EFL/bootstrap] патч "' + name + '" не установлен', err);
    }
  }
}

export function applyTarkovBootstrap() {
  step('player', applyTarkovPlayerPatch);
  step('physics', applyTarkovPhysicsPatch);

  /* Сначала настройки: mainMenuBridge умеет сам инстанцировать SettingsMenu,
   * и к этому моменту его прототип уже должен быть исправлен. */
  step('settings', applySettingsBridge);
  step('mainMenu', applyMainMenuBridge);
}

export default applyTarkovBootstrap;
