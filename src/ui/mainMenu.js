/* =============================================================================
 *  ESCAPE FROM LARPOV · src/ui/mainMenu.js
 * -----------------------------------------------------------------------------
 *  MainMenuSystem — полноэкранная HTML/CSS-оболочка главного меню поверх
 *  WebGL-канваса. Pixel-perfect реплика главного меню Escape from Tarkov.
 *
 *  ЧТО ВНУТРИ
 *   • 3 темы фона: default (лампочка) / forest (хвойная ветка) / drone (неон)
 *     + registerTheme() для добавления новых тем в одну строку
 *   • Трафаретно-металлический SVG-логотип: маска-«фото» внутри слова TARKOV,
 *     силуэт бойца с винтовкой в букве «A», процедурные потёртости трафарета
 *   • Процедурные декорации: лампа накаливания со случайным мерцанием,
 *     хвойная ветка (генерация иголок по кривой Безье), квадрокоптер с
 *     красным индикатором и вращающимися винтами. Внешние ассеты не нужны.
 *   • Аудио на WebAudio (логика синтеза перенесена из 1.html / 1.2.html):
 *     мрачный эмбиент-луп после первого клика, аналоговый щелчок на hover,
 *     тяжёлый металлический «затвор» на клик, fade-out музыки за 1.5 с
 *   • Полная блокировка геймплея: пока меню открыто, PointerLock
 *     принудительно снимается, а рейд стартует только через engine.startRaid()
 *
 *  ЗАВИСИМОСТИ: нет. Чистый DOM + WebAudio. ES-модуль.
 * ========================================================================== */

/* ---------------------------------------------------------------------------
 *  0. КОНСТАНТЫ И УТИЛИТЫ
 * ------------------------------------------------------------------------ */

export const MENU_FONTS_HREF =
  'https://fonts.googleapis.com/css2' +
  '?family=Bebas+Neue' +
  '&family=Oswald:wght@200;300;400;500;600;700' +
  '&display=swap';

export const MENU_ACTION = {
  RAID: 'raid',
  CHARACTER: 'character',
  TRADING: 'trading',
  HIDEOUT: 'hideout',
  EXIT: 'exit',
};

/** Центральный вертикальный список (строго по центру, английский). */
const MENU_ITEMS = [
  { id: MENU_ACTION.RAID,      label: 'ESCAPE FROM TARKOV', primary: true },
  { id: MENU_ACTION.CHARACTER, label: 'CHARACTER' },
  { id: MENU_ACTION.TRADING,   label: 'TRADING' },
  { id: MENU_ACTION.HIDEOUT,   label: 'HIDEOUT' },
  { id: MENU_ACTION.EXIT,      label: 'EXIT' },
];

/** Детерминированный ГПСЧ (перенесён из 1.2.html — общий сид для декораций). */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const n1 = (v) => Math.round(v * 10) / 10;

/* ---------------------------------------------------------------------------
 *  1. ИКОНКИ НИЖНЕЙ ПАНЕЛИ (инлайновый SVG, currentColor)
 * ------------------------------------------------------------------------ */

const ICONS = {
  burger:
    '<svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18" fill="none"' +
    ' stroke="currentColor" stroke-width="2" stroke-linecap="square"/></svg>',
  hideout:
    '<svg viewBox="0 0 24 24"><path d="M12 3 2.8 10.4V21h6.4v-5.6h5.6V21h6.4' +
    'V10.4z" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
  character:
    '<svg viewBox="0 0 24 24"><path d="M12 2.8a3.3 3.3 0 1 1 0 6.6 3.3 3.3 0' +
    ' 0 1 0-6.6zM5.4 21.2v-2.6c0-3.2 2.9-5.6 6.6-5.6s6.6 2.4 6.6 5.6v2.6z"' +
    ' fill="currentColor"/></svg>',
  traders:
    '<svg viewBox="0 0 24 24"><path d="M1.8 4h3.1l2.5 11.2h11.2l1.9-8.2H7.2"' +
    ' fill="none" stroke="currentColor" stroke-width="1.7"/>' +
    '<circle cx="9.8" cy="19.4" r="1.6" fill="currentColor"/>' +
    '<circle cx="17.8" cy="19.4" r="1.6" fill="currentColor"/></svg>',
  flea:
    '<svg viewBox="0 0 24 24"><path d="M2.5 8.4h14.2l-3.4-3.4M21.5 15.6H7.3' +
    'l3.4 3.4" fill="none" stroke="currentColor" stroke-width="1.9"' +
    ' stroke-linecap="round"/></svg>',
  builds:
    '<svg viewBox="0 0 24 24"><path d="M1.8 9.6h13.1l2.1-3.1h5.2v4.1h-3.1' +
    'l-2.1 3.1h-4.1l-1 4.1H7.8l1-4.1H1.8z" fill="currentColor"/></svg>',
  handbook:
    '<svg viewBox="0 0 24 24"><rect x="4.2" y="2.8" width="15.6"' +
    ' height="18.4" fill="none" stroke="currentColor" stroke-width="1.7"/>' +
    '<path d="M12 9.4v8M12 6.2v.02" stroke="currentColor" stroke-width="2.1"' +
    ' stroke-linecap="round"/></svg>',
  messenger:
    '<svg viewBox="0 0 24 24"><path d="M2.6 4.6h18.8v11.6H8.4l-5.8 4.2z"' +
    ' fill="none" stroke="currentColor" stroke-width="1.7"/>' +
    '<path d="M6.6 8.6h10.8M6.6 12.2h7.4" stroke="currentColor"' +
    ' stroke-width="1.5"/></svg>',
  survey:
    '<svg viewBox="0 0 24 24"><path d="M6.2 2.8h11.6v18.4H6.2z" fill="none"' +
    ' stroke="currentColor" stroke-width="1.7"/><path d="M9 7.6h6M9 11.6h6' +
    'M9 15.6h4" stroke="currentColor" stroke-width="1.6"/></svg>',
  gear:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.4" fill="none"' +
    ' stroke="currentColor" stroke-width="1.7"/><path d="M12 2.4l1.6 2.7' +
    ' 3.1-.5.4 3.1 2.7 1.6-1.7 2.7 1.7 2.7-2.7 1.6-.4 3.1-3.1-.5L12 21.6' +
    'l-1.6-2.7-3.1.5-.4-3.1-2.7-1.6 1.7-2.7-1.7-2.7 2.7-1.6.4-3.1 3.1.5z"' +
    ' fill="none" stroke="currentColor" stroke-width="1.25"/></svg>',
  plus:
    '<svg viewBox="0 0 24 24"><path d="M12 5.4v13.2M5.4 12h13.2"' +
    ' stroke="currentColor" stroke-width="1.8" stroke-linecap="square"/></svg>',
  /** Череп зоны PvE. */
  skull:
    '<svg viewBox="0 0 32 34"><path d="M16 1.6c7 0 11.6 4.6 11.6 11.4 0 4.2' +
    '-1.6 6.3-3.2 7.7-1 .9-1.3 1.6-1.4 2.9l-.3 3.4c-.1 1.5-1 2.3-2.5 2.3h-8.4' +
    'c-1.5 0-2.4-.8-2.5-2.3l-.3-3.4c-.1-1.3-.4-2-1.4-2.9C5.9 19.3 4.4 17.2' +
    ' 4.4 13 4.4 6.2 9 1.6 16 1.6z" fill="currentColor" opacity=".82"/>' +
    '<ellipse cx="11.3" cy="13.4" rx="3.1" ry="3.6" fill="#0c0f10"/>' +
    '<ellipse cx="20.7" cy="13.4" rx="3.1" ry="3.6" fill="#0c0f10"/>' +
    '<path d="M16 17.4l1.9 3.6h-3.8z" fill="#0c0f10"/>' +
    '<path d="M12.2 24.6h1.9v4.4h-1.9zM15.1 24.6H17v4.4h-1.9zM18 24.6h1.9v4.4' +
    'H18z" fill="#0c0f10"/></svg>',
  /** Оранжевый глиф бойца для блока EXPANSIONS. */
  expansion:
    '<svg viewBox="0 0 26 44"><path d="M13 3.2a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"' +
    ' fill="currentColor"/><path d="M8.6 10.4h8.8l2.4 8.4-2.6 1.2-1.2-4.2' +
    'v6.2l2.4 14.4h-3.4l-2.4-11-2.4 11H6.4L8.8 21.8v-6.2l-1.2 4.2-2.6-1.2z"' +
    ' fill="currentColor"/><path d="M17.8 9.2l6.6-2.4.7 2-6.6 2.4z"' +
    ' fill="currentColor"/></svg>',
  level:
    '<svg viewBox="0 0 24 24"><path d="M12 3.6 20.4 18H3.6z" fill="none"' +
    ' stroke="currentColor" stroke-width="1.9"/></svg>',
};

/* Нижняя панель: левая и правая группы вкладок (как на скриншотах). */
const TABS_LEFT = [
  { id: 'mainmenu', label: 'MAIN MENU', icon: 'burger', active: true },
  { id: 'hideout',  label: 'HIDEOUT',   icon: 'hideout' },
  { id: 'slots',    label: '',          icon: 'character', slots: 4 },
];

const TABS_RIGHT = [
  { id: 'character', label: 'CHARACTER',   icon: 'character', dot: true },
  { id: 'traders',   label: 'TRADERS',     icon: 'traders' },
  { id: 'flea',      label: 'FLEA MARKET', icon: 'flea' },
  { id: 'builds',    label: 'BUILDS',      icon: 'builds' },
  { id: 'handbook',  label: 'HANDBOOK',    icon: 'handbook', badge: '8' },
  { id: 'messenger', label: 'MESSENGER',   icon: 'messenger', badge: '2' },
  { id: 'survey',    label: 'SURVEY',      icon: 'survey' },
  { id: 'settings',  label: '',            icon: 'gear' },
];

/* ---------------------------------------------------------------------------
 *  2. ТЕМЫ ФОНА
 *     Каждая тема — это чистые данные. Добавить новую тему = один объект:
 *     menu.registerTheme({ id:'winter', label:'WINTER', background:'...' })
 * ------------------------------------------------------------------------ */

export const THEME_PRESETS = {
  /* ТЕМА 1 — DEFAULT / ЛАМПОЧКА -------------------------------------------- */
  default: {
    id: 'default',
    label: 'LIGHT BULB',
    logo: 'metal',
    decor: ['bulb'],
    beta: false,
    leaving: false,
    blur: '11px',
    saturate: '0.62',
    brightness: '0.55',
    vignette: '0.80',
    background:
      'radial-gradient(46% 62% at 16% 34%, rgba(196,186,166,.30), transparent 70%),' +
      'radial-gradient(30% 40% at 74% 18%, rgba(232,196,124,.20), transparent 72%),' +
      'radial-gradient(70% 80% at 50% 100%, rgba(18,20,20,.92), transparent 74%),' +
      'linear-gradient(168deg, #232725 0%, #1b1f20 38%, #141718 72%, #0c0e0f 100%)',
  },

  /* ТЕМА 2 — FOREST / ЛЕС --------------------------------------------------- */
  forest: {
    id: 'forest',
    label: 'BETA FOREST',
    logo: 'metal',
    decor: ['branch', 'spinner'],
    beta: true,
    leaving: true,
    blur: '13px',
    saturate: '0.86',
    brightness: '0.66',
    vignette: '0.86',
    background:
      'radial-gradient(40% 48% at 22% 26%, rgba(214,224,206,.32), transparent 70%),' +
      'radial-gradient(52% 60% at 62% 12%, rgba(150,176,140,.24), transparent 74%),' +
      'radial-gradient(80% 90% at 50% 104%, rgba(10,14,11,.95), transparent 70%),' +
      'linear-gradient(172deg, #2b3328 0%, #1e261d 40%, #141a14 74%, #090c09 100%)',
  },

  /* ТЕМА 3 — DRONE / НЕОН --------------------------------------------------- */
  drone: {
    id: 'drone',
    label: 'CYBER DRONE',
    logo: 'neon',
    decor: ['drone'],
    beta: false,
    leaving: false,
    blur: '15px',
    saturate: '1.35',
    brightness: '0.78',
    vignette: '0.72',
    background:
      'radial-gradient(24% 30% at 12% 22%, rgba(236,240,246,.55), transparent 68%),' +
      'radial-gradient(26% 34% at 52% 40%, rgba(238,70,148,.38), transparent 70%),' +
      'radial-gradient(34% 40% at 74% 24%, rgba(52,132,246,.42), transparent 72%),' +
      'radial-gradient(30% 36% at 86% 74%, rgba(24,206,226,.30), transparent 74%),' +
      'radial-gradient(70% 84% at 50% 104%, rgba(4,8,20,.94), transparent 72%),' +
      'linear-gradient(160deg, #0a1430 0%, #0d1a3c 34%, #0a1128 70%, #050814 100%)',
  },
};

/* ---------------------------------------------------------------------------
 *  3. CSS (инжектится один раз в <head>)
 * ------------------------------------------------------------------------ */

const MENU_CSS = `
#eft-menu{
  --eft-orange:#e27210;
  --eft-dirty:#cdc9c0;
  --eft-dirty-dim:#a7a49c;
  --eft-bar:clamp(30px,3.35vh,40px);
  --eft-blur:11px;
  --eft-sat:.62;
  --eft-bright:.55;
  --eft-vig:.8;
  --eft-bg:#111;
  --eft-soldier-x:392px;
  --eft-soldier-y:158px;
  --eft-soldier-scale:.96;
  position:fixed; inset:0; z-index:60;
  font-family:'Oswald',Arial,Helvetica,sans-serif;
  color:var(--eft-dirty);
  overflow:hidden;
  opacity:0;
  transition:opacity .6s ease;
  -webkit-font-smoothing:antialiased;
  text-rendering:optimizeLegibility;
  user-select:none;
  cursor:default;
}
#eft-menu.eft-on{opacity:1}
#eft-menu.eft-fading{pointer-events:none}
#eft-menu *{box-sizing:border-box; margin:0; padding:0}
#eft-menu button{background:none;border:0;color:inherit;font:inherit;cursor:pointer}

#eft-menu .eft-layer{position:absolute; inset:0; pointer-events:none}

/* ---------- ФОН ---------- */
#eft-menu .eft-bg{
  background:var(--eft-bg);
  background-size:cover; background-position:center;
  transform:scale(1.08);
  filter:blur(var(--eft-blur)) saturate(var(--eft-sat)) brightness(var(--eft-bright));
  transition:filter .8s ease, opacity .8s ease, background .8s ease;
  animation:eft-breathe 26s ease-in-out infinite;
}
#eft-menu .eft-vignette{
  background:
    radial-gradient(126% 96% at 50% 44%, rgba(0,0,0,0) 30%, rgba(0,0,0,var(--eft-vig)) 100%),
    linear-gradient(180deg, rgba(0,0,0,.72) 0%, rgba(0,0,0,0) 18%,
                    rgba(0,0,0,0) 66%, rgba(0,0,0,.92) 100%);
}
#eft-menu .eft-grain{
  opacity:.055; mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.82' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)'/%3E%3C/svg%3E");
  animation:eft-grain 1.1s steps(3) infinite;
}
#eft-menu .eft-scan{
  opacity:.16;
  background:repeating-linear-gradient(180deg,
    rgba(255,255,255,.035) 0 1px, rgba(0,0,0,0) 1px 3px);
}
@keyframes eft-grain{
  0%{transform:translate3d(0,0,0)} 33%{transform:translate3d(-2%,1%,0)}
  66%{transform:translate3d(1%,-2%,0)} 100%{transform:translate3d(0,0,0)}
}
@keyframes eft-breathe{
  0%,100%{transform:scale(1.08) translate3d(0,0,0)}
  50%{transform:scale(1.115) translate3d(-.6%,-.5%,0)}
}

/* ---------- КОМПОЗИЦИЯ ---------- */
#eft-menu .eft-stage{
  position:absolute; inset:0;
  display:flex; flex-direction:column; align-items:center;
  padding-top:clamp(26px,6.2vh,92px);
  pointer-events:none;
}

/* ---------- BETA TESTING ---------- */
#eft-menu .eft-beta{
  display:none;
  font:400 clamp(11px,1.02vw,15px)/1 'Oswald',Arial;
  letter-spacing:.44em; text-transform:uppercase;
  color:#e9ebe4; text-shadow:0 2px 12px rgba(0,0,0,.9);
  margin-bottom:clamp(2px,.6vh,8px);
  padding-left:.44em;
}
#eft-menu[data-beta="1"] .eft-beta{display:block}

/* ---------- ЛОГОТИП ---------- */
#eft-menu .eft-logo{
  width:min(60vw,880px);
  filter:drop-shadow(0 10px 30px rgba(0,0,0,.85));
  transition:filter .6s ease;
}
#eft-menu[data-logo="neon"] .eft-logo{
  filter:drop-shadow(0 0 18px rgba(228,244,58,.5))
         drop-shadow(0 0 54px rgba(206,226,26,.28))
         drop-shadow(0 6px 22px rgba(0,0,0,.6));
}
#eft-menu .eft-logo-svg{display:block; width:100%; height:auto; overflow:visible}
#eft-menu .eft-logo-top{
  font-family:'Bebas Neue','Oswald',Impact,sans-serif;
  font-size:104px; letter-spacing:17px; text-anchor:middle;
}
#eft-menu .eft-logo-word{
  font-family:'Bebas Neue','Oswald',Impact,sans-serif;
  font-size:216px; letter-spacing:4px; text-anchor:middle;
}
#eft-menu .eft-logo-fill{fill:url(#eftMetal)}
#eft-menu[data-logo="neon"] .eft-logo-fill{fill:url(#eftNeon)}
#eft-menu .eft-logo-photo{opacity:.9; transition:opacity .6s ease}
#eft-menu[data-logo="neon"] .eft-logo-photo{opacity:.22}
#eft-menu .eft-logo-soldier{
  transform:translate(var(--eft-soldier-x),var(--eft-soldier-y))
            scale(var(--eft-soldier-scale));
  transform-origin:0 0;
}

/* ---------- СЕЗОННЫЙ БАННЕР (опционально) ---------- */
#eft-menu .eft-season{
  display:none; pointer-events:auto;
  margin-top:clamp(10px,2.4vh,30px);
  width:min(46vw,700px);
  border:1px solid rgba(142,178,150,.34);
  background:linear-gradient(90deg, rgba(12,20,16,.86), rgba(10,16,14,.6));
  box-shadow:0 0 0 1px rgba(0,0,0,.5), 0 10px 28px rgba(0,0,0,.55);
  display:none; align-items:center; gap:14px; padding:8px 14px;
}
#eft-menu[data-season="1"] .eft-season{display:flex}
#eft-menu .eft-season-badge{
  width:34px;height:34px;flex:0 0 34px;
  display:grid;place-items:center;color:#9fd9ad;
  border:1px solid rgba(159,217,173,.4);
  background:rgba(20,34,26,.7);
}
#eft-menu .eft-season-title{
  font-family:'Bebas Neue','Oswald';font-size:22px;letter-spacing:.14em;color:#eef3ea;
}
#eft-menu .eft-season-title b{color:#9fd9ad;font-weight:400}
#eft-menu .eft-season-sub{
  font-size:9.5px;letter-spacing:.32em;color:#7f9a86;text-transform:uppercase;
}
#eft-menu .eft-season-cell{
  border-left:1px solid rgba(120,150,128,.26);padding:2px 0 2px 14px;margin-left:auto;
}
#eft-menu .eft-season-cell span{
  display:block;font-size:9px;letter-spacing:.26em;color:#7f8f84;text-transform:uppercase;
}
#eft-menu .eft-season-cell b{
  font:400 15px 'Oswald',monospace;color:#e6ebe3;letter-spacing:.06em;
}

/* ---------- ЦЕНТРАЛЬНОЕ МЕНЮ ---------- */
#eft-menu .eft-nav{
  margin-top:clamp(24px,7.2vh,104px);
  display:flex; flex-direction:column; align-items:center;
  gap:clamp(9px,2.5vh,28px);
  pointer-events:auto;
}
#eft-menu .eft-item{
  position:relative;
  font-family:'Bebas Neue','Oswald',Impact,sans-serif;
  font-size:clamp(19px,2.02vw,34px);
  line-height:1.05;
  letter-spacing:.132em;
  color:var(--eft-dirty);
  padding:5px 30px;
  text-transform:uppercase;
  text-shadow:0 2px 10px rgba(0,0,0,.75);
  transition:color .24s ease, text-shadow .24s ease,
             letter-spacing .24s ease, transform .18s ease;
}
#eft-menu .eft-item::before,
#eft-menu .eft-item::after{
  content:''; position:absolute; top:50%; width:0; height:1px;
  background:var(--eft-orange); opacity:.85;
  transition:width .26s ease;
}
#eft-menu .eft-item::before{left:2px}
#eft-menu .eft-item::after{right:2px}
#eft-menu .eft-item:hover,
#eft-menu .eft-item.eft-focus{
  color:var(--eft-orange);
  letter-spacing:.158em;
  text-shadow:0 0 12px rgba(226,114,16,.55),
              0 0 34px rgba(226,114,16,.3),
              0 2px 12px rgba(0,0,0,.8);
}
#eft-menu .eft-item:hover::before,
#eft-menu .eft-item:hover::after,
#eft-menu .eft-item.eft-focus::before,
#eft-menu .eft-item.eft-focus::after{width:16px}
#eft-menu .eft-item:active{transform:translateY(1px) scale(.995)}
#eft-menu .eft-item[disabled]{opacity:.35; cursor:not-allowed}

/* ---------- LEAVING THE GAME (тема forest) ---------- */
#eft-menu .eft-leaving{
  display:none; position:absolute; left:50%; bottom:16.5%;
  transform:translateX(-50%);
  font:300 clamp(15px,1.42vw,22px)/1 'Oswald',Arial;
  letter-spacing:.015em; color:#e9ebe5;
  text-shadow:0 2px 14px rgba(0,0,0,.9);
  white-space:nowrap;
}
#eft-menu[data-leaving="1"] .eft-leaving{display:block}
#eft-menu .eft-leaving i{font-style:normal; animation:eft-dots 1.6s steps(4) infinite}
@keyframes eft-dots{0%{opacity:.25}50%{opacity:1}100%{opacity:.25}}

#eft-menu .eft-spinner{
  display:none; position:absolute; right:44px; bottom:74px;
  width:19px; height:19px; border-radius:50%;
  border:2px solid rgba(214,219,210,.28); border-top-color:#e6eae2;
  animation:eft-spin 1.05s linear infinite;
}
#eft-menu[data-spinner="1"] .eft-spinner{display:block}
@keyframes eft-spin{to{transform:rotate(360deg)}}

/* ---------- ЛАМПА (тема default) ---------- */
#eft-menu .eft-bulb{
  display:none; position:absolute;
  right:clamp(120px,17.5vw,330px); top:-6px;
  width:min(20vw,260px);
  transform-origin:52% 0;
  animation:eft-sway 9.4s ease-in-out infinite;
}
#eft-menu[data-decor~="bulb"] .eft-bulb{display:block}
#eft-menu .eft-bulb-halo{
  position:absolute; left:50%; top:52%;
  width:280%; aspect-ratio:1; transform:translate(-50%,-46%);
  border-radius:50%;
  background:radial-gradient(circle,
    rgba(255,226,150,.55) 0%, rgba(255,206,112,.28) 26%,
    rgba(255,186,84,.12) 48%, rgba(255,176,72,0) 72%);
  filter:blur(6px);
  animation:eft-flicker 7.4s linear infinite;
  animation-delay:var(--eft-flick-delay,0s);
}
#eft-menu .eft-bulb.eft-surge .eft-bulb-halo{animation-duration:.34s}
#eft-menu .eft-bulb-filament{
  animation:eft-flicker 7.4s linear infinite;
  animation-delay:var(--eft-flick-delay,0s);
  transform-origin:center;
}
@keyframes eft-flicker{
  0%{opacity:.96} 2%{opacity:.4}  3.5%{opacity:.98} 11%{opacity:.9}
  12%{opacity:.28} 13%{opacity:1} 27%{opacity:.94} 27.6%{opacity:.52}
  28.4%{opacity:.99} 46%{opacity:.86} 47%{opacity:.22} 48%{opacity:1}
  63%{opacity:.93} 64%{opacity:.46} 65%{opacity:.97} 81%{opacity:.9}
  82%{opacity:.3}  83%{opacity:1}  95%{opacity:.95} 100%{opacity:.96}
}
@keyframes eft-sway{
  0%,100%{transform:rotate(-1.15deg)} 50%{transform:rotate(1.35deg)}
}

/* ---------- ХВОЙНАЯ ВЕТКА (тема forest) ---------- */
#eft-menu .eft-branch{
  display:none; position:absolute; right:-4%; top:-8%;
  width:min(66vw,1020px);
  transform-origin:96% 4%;
  animation:eft-branch-sway 13s ease-in-out infinite;
  filter:drop-shadow(0 14px 26px rgba(0,0,0,.6));
}
#eft-menu[data-decor~="branch"] .eft-branch{display:block}
@keyframes eft-branch-sway{
  0%,100%{transform:rotate(-.7deg) translate3d(0,0,0)}
  50%{transform:rotate(.9deg) translate3d(-.5%,.6%,0)}
}

/* ---------- ДРОН (тема drone) ---------- */
#eft-menu .eft-drone{
  display:none; position:absolute; right:2.5%; top:7.5%;
  width:min(40vw,600px);
  animation:eft-float 6.4s ease-in-out infinite;
  filter:drop-shadow(0 18px 34px rgba(0,0,0,.62));
}
#eft-menu[data-decor~="drone"] .eft-drone{display:block}
@keyframes eft-float{
  0%,100%{transform:translate3d(0,0,0) rotate(-1.2deg)}
  50%{transform:translate3d(-1.4%,-2.6%,0) rotate(1.1deg)}
}
#eft-menu .eft-prop{transform-origin:center; animation:eft-spin .11s linear infinite}
#eft-menu .eft-led{animation:eft-led 1.35s ease-in-out infinite}
@keyframes eft-led{
  0%,100%{opacity:1; r:5.4} 50%{opacity:.42; r:4.4}
}

/* ---------- НИЖНЯЯ ПАНЕЛЬ ---------- */
#eft-menu .eft-taskbar{
  position:absolute; left:0; right:0; bottom:0;
  height:var(--eft-bar);
  display:flex; align-items:stretch; justify-content:space-between;
  background:linear-gradient(180deg, rgba(30,34,36,.9), rgba(22,25,27,.97));
  border-top:1px solid #2b3033;
  box-shadow:0 -8px 22px rgba(0,0,0,.5);
  backdrop-filter:blur(3px);
  pointer-events:auto;
}
#eft-menu .eft-taskgroup{display:flex; align-items:stretch}
#eft-menu .eft-tab{
  position:relative;
  display:flex; align-items:center; gap:7px;
  padding:0 clamp(7px,.86vw,14px);
  font:400 clamp(9.5px,.76vw,12px)/1 'Oswald',Arial;
  letter-spacing:.085em; text-transform:uppercase;
  color:#b3b8b0; white-space:nowrap;
  border-right:1px solid rgba(0,0,0,.42);
  box-shadow:inset -1px 0 0 rgba(255,255,255,.03);
  transition:background .16s ease, color .16s ease;
}
#eft-menu .eft-taskgroup:last-child .eft-tab:last-child{border-right:0}
#eft-menu .eft-tab svg{width:14px; height:14px; opacity:.86; flex:0 0 14px}
#eft-menu .eft-tab:hover{background:#272d2f; color:#f1ead9}
#eft-menu .eft-tab.eft-tab-on{
  background:#2c3235; color:#f4f6f1;
  box-shadow:inset 0 -2px 0 rgba(226,114,16,.85);
}
#eft-menu .eft-tab-slots{display:flex; align-items:center; gap:3px; padding-left:4px}
#eft-menu .eft-slot{
  width:15px; height:15px; display:grid; place-items:center;
  border:1px solid #3a4145; background:#1d2224; color:#6d7570;
}
#eft-menu .eft-slot svg{width:9px; height:9px; opacity:.8}
#eft-menu .eft-badge{
  position:absolute; top:-8px; left:50%; transform:translateX(-50%);
  min-width:13px; height:12px; padding:0 3px;
  display:grid; place-items:center;
  font:600 9px/1 'Oswald',monospace; letter-spacing:0;
  color:#0c1210; background:#8fd06a;
  box-shadow:0 0 8px rgba(143,208,106,.5);
}
#eft-menu .eft-badge.eft-badge-gray{background:#b9beb6; box-shadow:none}
#eft-menu .eft-dot{
  position:absolute; top:5px; right:5px;
  width:6px; height:6px; background:#8fd06a; border-radius:50%;
  box-shadow:0 0 8px rgba(143,208,106,.75);
}

/* ---------- EXPANSIONS / УРОВЕНЬ / ВЕРСИЯ ---------- */
#eft-menu .eft-expansions{
  position:absolute; left:12px; bottom:calc(var(--eft-bar) + 20px);
  display:flex; align-items:flex-end; gap:9px;
  pointer-events:auto; cursor:pointer;
  transition:filter .2s ease;
}
#eft-menu .eft-expansions:hover{filter:brightness(1.25)}
#eft-menu .eft-exp-plate{
  width:27px; height:46px; flex:0 0 27px;
  display:grid; place-items:center;
  color:var(--eft-orange);
  background:linear-gradient(180deg, rgba(226,114,16,.20), rgba(226,114,16,.04));
  border:1px solid rgba(226,114,16,.45);
  box-shadow:inset 0 0 12px rgba(226,114,16,.18), 0 4px 14px rgba(0,0,0,.55);
}
#eft-menu .eft-exp-plate svg{width:16px; height:30px}
#eft-menu .eft-exp-body{display:flex; flex-direction:column; gap:3px; padding-bottom:2px}
#eft-menu .eft-exp-label{
  font:400 clamp(13px,1.16vw,19px)/1 'Oswald',Arial;
  letter-spacing:.1em; text-transform:uppercase;
  color:var(--eft-orange);
  text-shadow:0 0 14px rgba(226,114,16,.42), 0 2px 8px rgba(0,0,0,.8);
}
#eft-menu[data-exp-orientation="vertical"] .eft-exp-label{
  writing-mode:vertical-rl; transform:rotate(180deg); letter-spacing:.22em;
}
#eft-menu .eft-exp-level{
  display:flex; align-items:center; gap:5px;
  font:400 10.5px/1 'Oswald',monospace; letter-spacing:.14em; color:#c8cdc4;
}
#eft-menu .eft-exp-level svg{width:9px; height:9px; color:var(--eft-orange)}
#eft-menu .eft-build{
  position:absolute; left:13px; bottom:calc(var(--eft-bar) + 5px);
  font:300 10.5px/1 'Oswald',monospace; letter-spacing:.07em;
  color:#8b9188; text-shadow:0 1px 6px rgba(0,0,0,.9);
  pointer-events:none;
}

/* ---------- PVE ZONE ---------- */
#eft-menu .eft-pve{
  position:absolute; right:16px; bottom:calc(var(--eft-bar) + 14px);
  display:flex; align-items:center; gap:10px;
  font:300 clamp(12px,1.05vw,17px)/1 'Oswald',Arial;
  letter-spacing:.24em; text-transform:uppercase;
  color:#9aa197; text-shadow:0 2px 10px rgba(0,0,0,.85);
  pointer-events:auto;
}
#eft-menu .eft-pve svg{width:clamp(20px,1.85vw,29px); height:auto; opacity:.72}

/* ---------- ПЕРЕКЛЮЧАТЕЛЬ ТЕМ (F9, служебный) ---------- */
#eft-menu .eft-themechip{
  position:absolute; right:16px; top:14px;
  display:none; align-items:center; gap:8px;
  padding:5px 10px; pointer-events:auto;
  background:rgba(10,13,14,.66); border:1px solid #2c3234;
  font:400 10px/1 'Oswald',monospace; letter-spacing:.2em;
  color:#a9b0a6; text-transform:uppercase;
}
#eft-menu[data-themechip="1"] .eft-themechip{display:flex}
#eft-menu .eft-themechip b{color:var(--eft-orange); font-weight:400}

/* ---------- ТОСТЫ И МОДАЛКА ВЫХОДА ---------- */
#eft-menu .eft-toasts{
  position:absolute; right:16px; top:52px;
  display:flex; flex-direction:column; gap:6px; pointer-events:none;
}
#eft-menu .eft-toast{
  background:rgba(18,22,24,.92); border-left:3px solid var(--eft-orange);
  padding:7px 12px; font:400 12px/1.3 'Oswald',Arial; color:#dfe3da;
  box-shadow:0 8px 22px rgba(0,0,0,.5); transition:opacity .4s ease;
}
#eft-menu .eft-modal{
  position:absolute; inset:0; display:none; align-items:center; justify-content:center;
  background:rgba(4,6,7,.72); pointer-events:auto; z-index:5;
}
#eft-menu .eft-modal.eft-modal-on{display:flex}
#eft-menu .eft-modal-box{
  width:min(92vw,420px); background:#101416; border:1px solid #333b3c;
  padding:18px 20px; box-shadow:0 22px 60px rgba(0,0,0,.7);
}
#eft-menu .eft-modal-box h4{
  font-family:'Bebas Neue','Oswald'; font-size:22px; letter-spacing:.12em;
  color:#f0e4c8; margin-bottom:8px;
}
#eft-menu .eft-modal-box p{font-size:12.5px; color:#a8b0a6; margin-bottom:16px}
#eft-menu .eft-modal-row{display:flex; gap:9px}
#eft-menu .eft-btn{
  flex:1; padding:9px 12px; border:1px solid #39413f;
  background:linear-gradient(#20262a,#14181a);
  font:400 12px/1 'Oswald'; letter-spacing:.12em; text-transform:uppercase;
  color:#d8dcd4; transition:.16s ease;
}
#eft-menu .eft-btn:hover{border-color:var(--eft-orange); color:#f0e4c8}
#eft-menu .eft-btn.eft-btn-pri{
  border-color:var(--eft-orange); background:linear-gradient(#3a2f1c,#20211a); color:#f4e6c6;
}

/* ---------- АДАПТИВ ---------- */
@media (max-width:1180px){
  #eft-menu .eft-tab span{display:none}
  #eft-menu .eft-tab{padding:0 9px}
}
@media (max-width:860px){
  #eft-menu .eft-logo{width:82vw}
  #eft-menu .eft-pve{letter-spacing:.14em}
  #eft-menu .eft-drone,#eft-menu .eft-branch{opacity:.6}
}
@media (prefers-reduced-motion:reduce){
  #eft-menu .eft-bg,#eft-menu .eft-grain,#eft-menu .eft-bulb,
  #eft-menu .eft-bulb-halo,#eft-menu .eft-branch,#eft-menu .eft-drone,
  #eft-menu .eft-prop{animation:none !important}
}
`;

/* ---------------------------------------------------------------------------
 *  4. ПРОЦЕДУРНАЯ ГРАФИКА (SVG-генераторы)
 *     Ни одного внешнего файла: всё рисуется вектором и градиентами.
 * ------------------------------------------------------------------------ */

/** Трафаретные «срезы»: случайные штрихи, разрывающие глифы логотипа. */
function stencilCuts(seed, count) {
  const rnd = mulberry32(seed);
  let out = '';
  for (let i = 0; i < count; i++) {
    const x = rnd() * 1240;
    const y = 34 + rnd() * 300;
    const w = 18 + rnd() * 190;
    const h = 0.9 + rnd() * 4.6;
    const r = (rnd() * 6 - 3).toFixed(2);
    out +=
      '<rect x="' + n1(x) + '" y="' + n1(y) + '" width="' + n1(w) +
      '" height="' + n1(h) + '" fill="#000" transform="rotate(' + r + ' ' +
      n1(x) + ' ' + n1(y) + ')"/>';
  }
  /* Крупные «сколы» по нижней кромке слова TARKOV. */
  for (let i = 0; i < 14; i++) {
    const x = 60 + rnd() * 1120;
    const w = 6 + rnd() * 26;
    const h = 6 + rnd() * 22;
    out += '<rect x="' + n1(x) + '" y="' + n1(300 - h * .4) + '" width="' +
      n1(w) + '" height="' + n1(h) + '" fill="#000" rx="2"/>';
  }
  return out;
}

/** Городской скайлайн — виден ВНУТРИ букв TARKOV (как фотовставка). */
function skylineBars(seed) {
  const rnd = mulberry32(seed);
  let out = '<rect x="0" y="140" width="1240" height="210" fill="#1c2124"/>';
  let x = -20;
  while (x < 1260) {
    const w = 16 + rnd() * 74;
    const h = 26 + rnd() * 132;
    const tone = ['#2a3135', '#242a2e', '#313a3e', '#1e2427'][Math.floor(rnd() * 4)];
    out += '<rect x="' + n1(x) + '" y="' + n1(330 - h) + '" width="' + n1(w) +
      '" height="' + n1(h + 24) + '" fill="' + tone + '"/>';
    /* трубы и краны */
    if (rnd() < 0.26) {
      out += '<rect x="' + n1(x + w * .42) + '" y="' + n1(330 - h - 46) +
        '" width="9" height="52" fill="' + tone + '"/>';
    }
    if (rnd() < 0.16) {
      out += '<rect x="' + n1(x + w * .1) + '" y="' + n1(330 - h - 8) +
        '" width="' + n1(w * 1.5) + '" height="4" fill="#39434a"/>';
    }
    x += w + 4 + rnd() * 12;
  }
  /* дымка над городом */
  out += '<rect x="0" y="150" width="1240" height="200" fill="url(#eftHaze)"/>';
  return out;
}

/** Силуэт бойца с винтовкой — ставится внутрь буквы «A» слова TARKOV. */
function soldierSilhouette() {
  const c = '#0a0d0e';
  return (
    '<g fill="' + c + '">' +
    /* каска + подшлемник */
    '<ellipse cx="60" cy="25" rx="13.6" ry="10.4"/>' +
    '<path d="M46 27.4h28.4l-2.6 5.4H48.4z"/>' +
    /* шея и корпус (лёгкий наклон вперёд) */
    '<path d="M52.6 32.8h15.2l6.4 10.6 1.6 30.4-6.2 8.2H51.4l-5.6-10.4' +
    ' 2.2-28.6z"/>' +
    /* рюкзак за спиной */
    '<path d="M35.8 40.6h13.4l1.8 5.4-1.2 21.6-13.6 1.4-2.2-22z"/>' +
    /* дальняя рука */
    '<path d="M50.4 45.2l11.6 4.4 8.6 8.2-4.4 6.4-10.8-6.6-8.6-6.2z"/>' +
    /* винтовка: цевьё, ствол, магазин, оптика, приклад */
    '<path d="M66.4 43.4l44-6.6 3.4 5.6-13.4 3.2 24-2.2 2.2 5.6-26.6 4.4' +
    '-33.2 6.6-2.6-9.2z"/>' +
    '<path d="M86.8 49.4l8.8-1.2 4.4 13.2-8.8 2.2z"/>' +
    '<rect x="87.4" y="36.6" width="17.6" height="5.2" rx="2.2"/>' +
    '<path d="M62.4 52.6l-13.8 3.2-4.6 6.6 6.2 2.2 13.6-4.6z"/>' +
    /* ближняя рука на рукоятке */
    '<path d="M65.8 43.8l22.4 6.2 6.2 4.2-2.4 7.2-8.2-2.4-20.6-6.4z"/>' +
    /* ноги (шаг) */
    '<path d="M51.8 77.4h9l2 25.4 6.4 22.6-10.6 2.4-8.6-25.6z"/>' +
    '<path d="M61.6 77.4h10.8l6.2 20.8 12.6 16.4-8.6 6.6-14.6-18.6-6.4-16.8z"/>' +
    /* берцы */
    '<path d="M57.4 123.4h12.6l1.2 5.6H55.6z"/>' +
    '<path d="M82.4 116.6l10.4 5.4-2.6 5.4-11.6-5.2z"/>' +
    '</g>'
  );
}

/** Полный SVG логотипа «ESCAPE FROM TARKOV». */
function buildLogo(seed) {
  return (
'<svg class="eft-logo-svg" viewBox="0 0 1240 372" role="img"' +
' aria-label="Escape from Tarkov" xmlns="http://www.w3.org/2000/svg">' +
  '<defs>' +
    /* металлический градиент «шлифованная сталь» */
    '<linearGradient id="eftMetal" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#f6f8f5"/>' +
      '<stop offset=".18" stop-color="#d3d9d3"/>' +
      '<stop offset=".40" stop-color="#8d9591"/>' +
      '<stop offset=".52" stop-color="#eef1ec"/>' +
      '<stop offset=".70" stop-color="#9aa29d"/>' +
      '<stop offset=".88" stop-color="#767d7a"/>' +
      '<stop offset="1" stop-color="#5e6564"/>' +
    '</linearGradient>' +
    /* ядовито-жёлтый неон для темы drone */
    '<linearGradient id="eftNeon" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#fbff6a"/>' +
      '<stop offset=".42" stop-color="#eaf522"/>' +
      '<stop offset=".72" stop-color="#d3e30d"/>' +
      '<stop offset="1" stop-color="#b8cc06"/>' +
    '</linearGradient>' +
    '<linearGradient id="eftHaze" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#9fb0b8" stop-opacity=".42"/>' +
      '<stop offset="1" stop-color="#9fb0b8" stop-opacity="0"/>' +
    '</linearGradient>' +
    /* лёгкая шероховатость краёв — «трафарет по бетону» */
    '<filter id="eftRough" x="-8%" y="-24%" width="116%" height="156%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.92 0.5"' +
      ' numOctaves="2" seed="' + (seed % 97) + '" result="noise"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="noise" scale="3.2"' +
      ' xChannelSelector="R" yChannelSelector="G"/>' +
    '</filter>' +
    /* маска трафаретных срезов */
    '<mask id="eftStencil">' +
      '<rect x="0" y="0" width="1240" height="372" fill="#fff"/>' +
      stencilCuts(seed, 30) +
    '</mask>' +
    /* маска по форме слова TARKOV — внутрь кладём «фото» */
    '<mask id="eftWord">' +
      '<text class="eft-logo-word" x="620" y="318" fill="#fff">TARKOV</text>' +
    '</mask>' +
  '</defs>' +

  /* 1. Металл / неон: сами буквы */
  '<g class="eft-logo-fill" filter="url(#eftRough)" mask="url(#eftStencil)">' +
    '<text class="eft-logo-top" x="620" y="118">ESCAPE FROM</text>' +
    '<text class="eft-logo-word" x="620" y="318">TARKOV</text>' +
  '</g>' +

  /* 2. «Фотовставка» внутри букв TARKOV: город + боец в букве A */
  '<g class="eft-logo-photo" mask="url(#eftWord)">' +
    skylineBars(seed + 11) +
    '<g class="eft-logo-soldier">' + soldierSilhouette() + '</g>' +
  '</g>' +

  /* 3. Финальные потёртости поверх всего */
  '<g mask="url(#eftWord)" opacity=".35">' +
    '<rect x="0" y="150" width="1240" height="6" fill="#0b0e0f"/>' +
    '<rect x="0" y="244" width="1240" height="3" fill="#0b0e0f"/>' +
  '</g>' +
'</svg>'
  );
}

/** ТЕМА 1: лампа накаливания на проводе (правый верхний угол). */
function buildBulb() {
  return (
'<div class="eft-bulb">' +
  '<div class="eft-bulb-halo"></div>' +
  '<svg viewBox="0 0 260 430" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
      '<radialGradient id="eftGlass" cx="38%" cy="32%" r="72%">' +
        '<stop offset="0" stop-color="#fff6dc" stop-opacity=".96"/>' +
        '<stop offset=".42" stop-color="#ffd98f" stop-opacity=".72"/>' +
        '<stop offset=".78" stop-color="#c99a4a" stop-opacity=".38"/>' +
        '<stop offset="1" stop-color="#8a6a34" stop-opacity=".26"/>' +
      '</radialGradient>' +
      '<linearGradient id="eftCap" x1="0" y1="0" x2="1" y2="0">' +
        '<stop offset="0" stop-color="#4a4f52"/>' +
        '<stop offset=".34" stop-color="#b9bfc2"/>' +
        '<stop offset=".62" stop-color="#7d8386"/>' +
        '<stop offset="1" stop-color="#3d4245"/>' +
      '</linearGradient>' +
    '</defs>' +
    /* провод */
    '<path d="M132 0 C 128 60 138 120 130 176" stroke="#15181a"' +
    ' stroke-width="7" fill="none"/>' +
    '<path d="M132 0 C 129 60 137 120 130 176" stroke="#2c3134"' +
    ' stroke-width="2.2" fill="none"/>' +
    /* патрон */
    '<path d="M110 176h42l6 22h-54z" fill="url(#eftCap)"/>' +
    '<rect x="104" y="196" width="54" height="30" rx="5" fill="url(#eftCap)"/>' +
    '<rect x="104" y="203" width="54" height="3" fill="#2b3033" opacity=".7"/>' +
    '<rect x="104" y="212" width="54" height="3" fill="#2b3033" opacity=".7"/>' +
    /* стекло */
    '<path d="M118 224h26c26 10 46 34 46 64 0 38-30 66-59 66s-59-28-59-66' +
    'c0-30 20-54 46-64z" fill="url(#eftGlass)" stroke="#e7d3a4"' +
    ' stroke-opacity=".35" stroke-width="1.6"/>' +
    /* спираль накала */
    '<g class="eft-bulb-filament" stroke="#ffcf6a" stroke-width="3"' +
    ' fill="none" stroke-linecap="round">' +
      '<path d="M118 240v28M144 240v28"/>' +
      '<path d="M118 268c0 14 26 14 26 0"/>' +
      '<path d="M124 268c0 22 14 22 14 0" stroke="#fff0b8" stroke-width="2"/>' +
    '</g>' +
    '<ellipse cx="131" cy="272" rx="30" ry="26" fill="#ffdc94" opacity=".3"/>' +
    /* блик на стекле */
    '<path d="M108 250c-8 12-11 26-9 40 1 6 8 5 8-1 0-13 3-24 9-34 3-5-5-9-8-5z"' +
    ' fill="#fff" opacity=".2"/>' +
  '</svg>' +
'</div>'
  );
}

/* Кубическая кривая Безье: точка и касательная (для раскладки иголок). */
function bezPoint(t, p0, p1, p2, p3) {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}
function bezAngle(t, p0, p1, p2, p3) {
  const a = bezPoint(clamp(t - 0.01, 0, 1), p0, p1, p2, p3);
  const b = bezPoint(clamp(t + 0.01, 0, 1), p0, p1, p2, p3);
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** ТЕМА 2: реалистичная хвойная ветка в правом верхнем углу. */
function buildBranch(seed) {
  const rnd = mulberry32(seed);
  const W = 1020, H = 560;
  /* три ветви: главная и две подветви */
  const stems = [
    { p0: { x: 1010, y: 26 },  p1: { x: 760, y: 74 },  p2: { x: 470, y: 160 }, p3: { x: 150, y: 268 }, w: 11, len: 1 },
    { p0: { x: 880,  y: 60 },  p1: { x: 720, y: 150 }, p2: { x: 540, y: 214 }, p3: { x: 360, y: 236 }, w: 7,  len: .82 },
    { p0: { x: 950,  y: 18 },  p1: { x: 830, y: 40 },  p2: { x: 700, y: 96 },  p3: { x: 560, y: 96 },  w: 6,  len: .74 },
  ];
  let stemPaths = '';
  let needles = '';
  stems.forEach((s, si) => {
    stemPaths +=
      '<path d="M' + s.p0.x + ' ' + s.p0.y + ' C ' + s.p1.x + ' ' + s.p1.y +
      ' ' + s.p2.x + ' ' + s.p2.y + ' ' + s.p3.x + ' ' + s.p3.y +
      '" stroke="url(#eftBark)" stroke-width="' + s.w +
      '" fill="none" stroke-linecap="round"/>';
    const steps = 74;
    for (let i = 2; i < steps; i++) {
      const t = i / steps;
      const p = bezPoint(t, s.p0, s.p1, s.p2, s.p3);
      const ang = bezAngle(t, s.p0, s.p1, s.p2, s.p3);
      /* по паре иголок на каждую сторону стебля */
      for (let k = -1; k <= 1; k += 2) {
        const spread = (0.62 + rnd() * 0.55) * k;
        const len = (38 + rnd() * 54) * (1 - t * 0.35) * s.len;
        const a = ang + spread;
        const x2 = p.x + Math.cos(a) * len;
        const y2 = p.y + Math.sin(a) * len;
        const tone = rnd();
        const col = tone < .3 ? '#3f6b34' : tone < .62 ? '#537f3c' : tone < .85 ? '#6a9648' : '#7fae55';
        const wid = (1.9 + rnd() * 1.9).toFixed(2);
        needles +=
          '<line x1="' + n1(p.x) + '" y1="' + n1(p.y) + '" x2="' + n1(x2) +
          '" y2="' + n1(y2) + '" stroke="' + col + '" stroke-width="' + wid +
          '" stroke-linecap="round" opacity="' + (0.66 + rnd() * 0.34).toFixed(2) +
          '"/>';
      }
      /* редкие светлые молодые побеги */
      if (rnd() < 0.06) {
        const a = ang + (rnd() - 0.5);
        needles += '<line x1="' + n1(p.x) + '" y1="' + n1(p.y) + '" x2="' +
          n1(p.x + Math.cos(a) * 22) + '" y2="' + n1(p.y + Math.sin(a) * 22) +
          '" stroke="#c8dd8e" stroke-width="2.4" stroke-linecap="round"/>';
      }
    }
    if (si === 0) needles += '<g></g>';
  });
  return (
'<div class="eft-branch">' +
  '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
      '<linearGradient id="eftBark" x1="1" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#5a4326"/>' +
        '<stop offset=".5" stop-color="#42301b"/>' +
        '<stop offset="1" stop-color="#2c2013"/>' +
      '</linearGradient>' +
      '<filter id="eftSoft"><feGaussianBlur stdDeviation="1.15"/></filter>' +
      '<filter id="eftFar"><feGaussianBlur stdDeviation="4.6"/></filter>' +
    '</defs>' +
    /* дальний, размытый дубль ветки — глубина кадра */
    '<g filter="url(#eftFar)" opacity=".55"' +
    ' transform="translate(-58,52) scale(1.06)">' + needles + '</g>' +
    '<g filter="url(#eftSoft)">' + stemPaths + needles + '</g>' +
  '</svg>' +
'</div>'
  );
}

/** ТЕМА 3: парящий квадрокоптер с горящим красным индикатором. */
function buildDrone() {
  /* Мотор + винт: x, y, масштаб, направление вращения. */
  const rotor = (x, y, s, dir) =>
    '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' +
      '<rect x="-7" y="-26" width="14" height="30" rx="5" fill="#20262b"/>' +
      '<rect x="-9" y="-30" width="18" height="7" rx="3" fill="#2f373d"/>' +
      '<g class="eft-prop" style="animation-direction:' +
        (dir > 0 ? 'normal' : 'reverse') + '">' +
        '<ellipse cx="0" cy="-32" rx="52" ry="3.4" fill="#8b98a4" opacity=".34"/>' +
        '<ellipse cx="0" cy="-32" rx="3.4" ry="52" fill="#8b98a4" opacity=".18"/>' +
      '</g>' +
      '<circle cx="0" cy="-32" r="5.6" fill="#161b1f"/>' +
      '<path d="M-3 4h6l4 30h-14z" fill="#252c31"/>' +
    '</g>';

  return (
'<div class="eft-drone">' +
  '<svg viewBox="0 0 600 380" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
      '<linearGradient id="eftShell" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#f4f7fa"/>' +
        '<stop offset=".46" stop-color="#d6dde4"/>' +
        '<stop offset=".72" stop-color="#9ba7b1"/>' +
        '<stop offset="1" stop-color="#6c7883"/>' +
      '</linearGradient>' +
      '<linearGradient id="eftArm" x1="0" y1="0" x2="1" y2="0">' +
        '<stop offset="0" stop-color="#2b3237"/>' +
        '<stop offset=".5" stop-color="#4c565e"/>' +
        '<stop offset="1" stop-color="#232a2f"/>' +
      '</linearGradient>' +
      '<radialGradient id="eftLedGlow" cx="50%" cy="50%" r="50%">' +
        '<stop offset="0" stop-color="#ff5a4a" stop-opacity=".95"/>' +
        '<stop offset=".45" stop-color="#ff2f22" stop-opacity=".42"/>' +
        '<stop offset="1" stop-color="#ff2f22" stop-opacity="0"/>' +
      '</radialGradient>' +
    '</defs>' +

    /* штанги-лучи */
    '<path d="M292 176 L96 116" stroke="url(#eftArm)" stroke-width="15" stroke-linecap="round"/>' +
    '<path d="M310 176 L512 120" stroke="url(#eftArm)" stroke-width="15" stroke-linecap="round"/>' +
    '<path d="M296 196 L146 244" stroke="url(#eftArm)" stroke-width="13" stroke-linecap="round"/>' +
    '<path d="M312 196 L470 236" stroke="url(#eftArm)" stroke-width="13" stroke-linecap="round"/>' +

    /* задние моторы (чуть меньше — перспектива) */
    rotor(146, 246, 0.86, 1) +
    rotor(470, 238, 0.9, -1) +

    /* корпус */
    '<path d="M258 152h86c16 0 27 10 29 25l4 26c1 13-9 23-22 23h-108' +
    'c-13 0-23-10-22-23l4-26c2-15 13-25 29-25z" fill="url(#eftShell)"' +
    ' stroke="#5c666e" stroke-width="1.4"/>' +
    '<path d="M266 158h70l6 14h-82z" fill="#eef2f6" opacity=".85"/>' +
    '<rect x="250" y="186" width="104" height="6" rx="3" fill="#8d99a3" opacity=".7"/>' +

    /* вентиляционные рёбра */
    '<g fill="#7d8890" opacity=".55">' +
      '<rect x="272" y="196" width="58" height="3" rx="1.5"/>' +
      '<rect x="272" y="203" width="58" height="3" rx="1.5"/>' +
      '<rect x="272" y="210" width="58" height="3" rx="1.5"/>' +
    '</g>' +

    /* подвес с камерой */
    '<path d="M286 224h30l4 16c1 8-5 14-13 14h-12c-8 0-14-6-13-14z" fill="#1b2126"/>' +
    '<circle cx="301" cy="244" r="9.4" fill="#0b0f12" stroke="#39434a" stroke-width="1.6"/>' +
    '<circle cx="298" cy="241" r="2.6" fill="#7fc9ff" opacity=".8"/>' +

    /* КРАСНЫЙ ИНДИКАТОР — главная деталь со скриншота */
    '<circle cx="512" cy="120" r="34" fill="url(#eftLedGlow)"/>' +
    '<circle class="eft-led" cx="512" cy="120" r="5.4" fill="#ff4a3a"/>' +
    '<circle cx="96" cy="116" r="22" fill="url(#eftLedGlow)" opacity=".45"/>' +
    '<circle class="eft-led" cx="96" cy="116" r="4.2" fill="#ff6a52"' +
    ' style="animation-delay:.42s"/>' +

    /* передние моторы поверх лучей */
    rotor(96, 118, 1, -1) +
    rotor(512, 122, 1.04, 1) +
  '</svg>' +
'</div>'
  );
}

/* ---------------------------------------------------------------------------
 *  5. АУДИО
 *     Логика синтеза взята из 1.html / 1.2.html (объект Audio2):
 *     tone() / noise() на WebAudio — ни одного внешнего аудиофайла.
 *     Добавлено: мрачный эмбиент-луп, hover-щелчок, «затвор»,
 *     fade-out за 1.5 с и опциональный внешний трек (opts.ambientUrl).
 * ------------------------------------------------------------------------ */

export class MenuAudio {
  constructor(opts = {}) {
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.volume = opts.volume == null ? 0.62 : opts.volume;
    this.musicVolume = opts.musicVolume == null ? 0.42 : opts.musicVolume;
    this.ambientUrl = opts.ambientUrl || null;
    this.muted = false;
    this.playing = false;
    this.armed = false;
    this._nodes = [];
    this._timers = [];
    this._el = null;
  }

  /* --- контекст создаётся только после жеста пользователя --- */
  init() {
    return this.arm();
  }

  arm() {
    this.armed = true;
    if (this.ctx) { this.resume(); return this.ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0.0001 : this.volume;
    this.master.connect(this.ctx.destination);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.0001;
    this.musicBus.connect(this.master);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 1;
    this.sfxBus.connect(this.master);
    return this.ctx;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  /* --- базовые генераторы (порт из Audio2.tone / Audio2.noise) --- */
  tone(freq, dur, type, vol, slide, dest) {
    if (!this.ctx) return;
    const t = this.now();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slide) {
      o.frequency.exponentialRampToValueAtTime(Math.max(24, freq * slide), t + dur);
    }
    g.gain.setValueAtTime(Math.max(0.0001, vol == null ? 0.25 : vol), t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g);
    g.connect(dest || this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  noise(dur, vol, cutoff, filterType, dest) {
    if (!this.ctx) return;
    const sr = this.ctx.sampleRate;
    const len = Math.max(1, Math.floor(sr * dur));
    const buf = this.ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bq = this.ctx.createBiquadFilter();
    bq.type = filterType || 'lowpass';
    bq.frequency.value = cutoff || 1800;
    const g = this.ctx.createGain();
    g.gain.value = vol == null ? 0.3 : vol;
    src.connect(bq); bq.connect(g); g.connect(dest || this.sfxBus);
    src.start();
  }

  /* --- SFX: аналоговый щелчок на наведение --- */
  hover() {
    if (!this.ctx) return;
    this.noise(0.042, 0.085, 3200, 'bandpass');
    this.tone(1820, 0.02, 'square', 0.045, 0.72);
  }

  /* --- SFX: тяжёлый металлический «затвор» на клик --- */
  press() {
    if (!this.ctx) return;
    /* 1) лязг рамы */
    this.noise(0.055, 0.46, 5400, 'highpass');
    this.tone(212, 0.085, 'square', 0.2, 0.42);
    this.tone(2380, 0.15, 'triangle', 0.1, 0.34);
    /* 2) досылание затвора */
    this._later(88, () => {
      this.noise(0.09, 0.4, 3000);
      this.tone(132, 0.22, 'sine', 0.28, 0.4);
      this.tone(1640, 0.11, 'triangle', 0.07, 0.5);
    });
    /* 3) глухое эхо в бетоне */
    this._later(215, () => this.noise(0.16, 0.2, 900));
  }

  back() {
    if (!this.ctx) return;
    this.tone(420, 0.07, 'square', 0.14, 0.55);
    this.noise(0.06, 0.16, 1400);
  }

  _later(ms, fn) {
    const id = setTimeout(() => {
      this._timers = this._timers.filter((x) => x !== id);
      fn();
    }, ms);
    this._timers.push(id);
  }

  /* --- МУЗЫКА: мрачный эмбиент Таркова по кругу --- */
  startAmbient(fadeMs = 3200) {
    if (this.playing) return;
    if (!this.ctx) return;
    this.playing = true;
    this.resume();

    /* Вариант A: внешний трек (opts.ambientUrl) — чистый loop. */
    if (this.ambientUrl) {
      const el = new Audio(this.ambientUrl);
      el.loop = true;
      el.crossOrigin = 'anonymous';
      el.preload = 'auto';
      try {
        this.ctx.createMediaElementSource(el).connect(this.musicBus);
      } catch (e) {
        el.volume = this.musicVolume;
      }
      el.play().catch(() => {});
      this._el = el;
      this._fade(this.musicBus.gain, this.musicVolume, fadeMs);
      return;
    }

    /* Вариант B: процедурный эмбиент — бесконечный по природе. */
    const t = this.now();

    /* Низкий гуд: два расстроенных голоса + квинта + октава. */
    const drone = this.ctx.createGain();
    drone.gain.value = 0.5;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    lp.Q.value = 0.9;
    drone.connect(lp); lp.connect(this.musicBus);

    [55, 55.45, 82.4, 110.2].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = i > 1 ? 'triangle' : 'sawtooth';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.value = i > 1 ? 0.06 : 0.12;
      o.connect(g); g.connect(drone);
      o.start(t);
      this._nodes.push(o, g);
    });

    /* Медленное «дыхание» фильтра (LFO 0.045 Гц). */
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain); lfoGain.connect(lp.frequency);
    lfo.start(t);
    this._nodes.push(lfo, lfoGain);

    /* Ветер: броуновский шум в полосовом фильтре, цикличный буфер 8 с. */
    const sr = this.ctx.sampleRate;
    const wBuf = this.ctx.createBuffer(1, sr * 8, sr);
    const wd = wBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < wd.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.021 * white) / 1.021;
      wd[i] = last * 3.2;
    }
    const wind = this.ctx.createBufferSource();
    wind.buffer = wBuf;
    wind.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 0.7;
    const wg = this.ctx.createGain();
    wg.gain.value = 0.5;
    wind.connect(bp); bp.connect(wg); wg.connect(this.musicBus);
    wind.start(t);
    this._nodes.push(wind, bp, wg);

    const wlfo = this.ctx.createOscillator();
    wlfo.frequency.value = 0.07;
    const wlfoG = this.ctx.createGain();
    wlfoG.gain.value = 0.28;
    wlfo.connect(wlfoG); wlfoG.connect(wg.gain);
    wlfo.start(t);
    this._nodes.push(wlfo, wlfoG);

    /* Далёкие взрывы и лязг металла — случайный планировщик. */
    const schedule = () => {
      if (!this.playing) return;
      const wait = 5200 + Math.random() * 9800;
      const id = setTimeout(() => {
        if (!this.playing) return;
        const far = Math.random();
        if (far < 0.5) {
          this.noise(0.9, 0.1, 300, 'lowpass', this.musicBus);
          this.tone(48, 0.8, 'sine', 0.1, 0.4, this.musicBus);
        } else if (far < 0.8) {
          this.tone(1240, 0.5, 'triangle', 0.024, 0.28, this.musicBus);
          this.noise(0.25, 0.05, 2400, 'bandpass', this.musicBus);
        } else {
          this.tone(196, 0.42, 'sawtooth', 0.03, 0.5, this.musicBus);
        }
        schedule();
      }, wait);
      this._timers.push(id);
    };
    schedule();

    this._fade(this.musicBus.gain, this.musicVolume, fadeMs);
  }

  /** Плавное гашение музыки — по техзаданию 1500 мс. */
  fadeOutMusic(ms = 1500) {
    if (!this.ctx || !this.musicBus) return Promise.resolve();
    this._fade(this.musicBus.gain, 0.0001, ms);
    return sleep(ms).then(() => this.stopAmbient());
  }

  stopAmbient() {
    this.playing = false;
    this._timers.forEach(clearTimeout);
    this._timers = [];
    this._nodes.forEach((n) => {
      try { if (n.stop) n.stop(); n.disconnect(); } catch (e) {}
    });
    this._nodes = [];
    if (this._el) { try { this._el.pause(); } catch (e) {} this._el = null; }
  }

  setMuted(v) {
    this.muted = !!v;
    if (this.master) {
      this._fade(this.master.gain, this.muted ? 0.0001 : this.volume, 220);
    }
  }

  _fade(param, to, ms) {
    if (!this.ctx) return;
    const t = this.now();
    const from = Math.max(0.0001, param.value);
    param.cancelScheduledValues(t);
    param.setValueAtTime(from, t);
    param.exponentialRampToValueAtTime(Math.max(0.0001, to), t + ms / 1000);
  }

  dispose() {
    this.stopAmbient();
    if (this.ctx) { try { this.ctx.close(); } catch (e) {} }
    this.ctx = null;
  }
}

/* ---------------------------------------------------------------------------
 *  6. СКЛЕЙКА РАЗМЕТКИ
 *     Микро-блок правил для вложенных спанов и иконок: гарантирует
 *     размер SVG вне зависимости от того, что пришло из ICONS.
 * ------------------------------------------------------------------------ */

const MENU_CSS_GLUE = [
  '#eft-menu .eft-decor{position:absolute;inset:0;pointer-events:none;',
  'overflow:hidden;z-index:2}',
  '#eft-menu .eft-tab-ico,#eft-menu .eft-pve-ico,#eft-menu .eft-exp-ico',
  '{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto}',
  '#eft-menu .eft-tab-ico{width:15px;height:15px}',
  '#eft-menu .eft-pve-ico{width:clamp(20px,1.85vw,29px);height:auto}',
  '#eft-menu .eft-exp-ico{width:16px;height:30px}',
  '#eft-menu .eft-tab-ico svg,#eft-menu .eft-pve-ico svg,',
  '#eft-menu .eft-exp-ico svg{width:100%;height:100%;display:block;',
  'fill:currentColor}',
  '#eft-menu .eft-tab-label,#eft-menu .eft-item-txt{white-space:nowrap}',
  '#eft-menu .eft-tabs-sep{flex:1 1 auto}',
  '@media (max-width:1180px){',
  '#eft-menu .eft-tab .eft-tab-ico{display:inline-flex}',
  '}',
].join('');

/* ---------------------------------------------------------------------------
 *  7. MainMenuSystem — система главного меню
 * ------------------------------------------------------------------------ */

export class MainMenuSystem {
  /**
   * @param {Object}   opts
   * @param {Object}   [opts.engine]        ссылка на Engine (для startRaid)
   * @param {Object}   [opts.ctx]           service locator движка
   * @param {Element}  [opts.mount]         куда монтировать (default: document.body)
   * @param {string}   [opts.theme]         'default' | 'forest' | 'drone'
   * @param {string}   [opts.buildVersion]  текст версии в левом углу
   * @param {number}   [opts.level]         уровень игрока (100)
   * @param {string}   [opts.nickname]
   * @param {string}   [opts.zone]          'PVE ZONE'
   * @param {string}   [opts.expansionsLabel] 'EXPANSIONS' | 'РАСШИРЕНИЯ'
   * @param {boolean}  [opts.showSeasonBanner]
   * @param {boolean}  [opts.showThemeChip]
   * @param {string}   [opts.ambientUrl]    внешний эмбиент-трек (необязательно)
   * @param {Function} [opts.onAction]      внешний перехватчик действий
   */
  constructor(opts = {}) {
    this.name = 'menu';
    this.opts = opts;
    this.engine = opts.engine || null;
    this.ctx = opts.ctx || (this.engine && this.engine.ctx) || null;
    this.host = opts.mount || document.body;

    /* Темы храним в Map — новая тема добавляется одной строкой. */
    this.themes = new Map(Object.keys(THEME_PRESETS).map((k) => [k, THEME_PRESETS[k]]));
    this.themeId = this.themes.has(opts.theme) ? opts.theme : 'default';

    this.seed = opts.seed == null ? 20770 : opts.seed;
    this.buildVersion = opts.buildVersion || '1.1.0.1.46777 | PvE';
    this.level = opts.level == null ? 100 : opts.level;
    this.nickname = opts.nickname || 'Larpov';
    this.zone = opts.zone || 'PVE ZONE';
    this.expansionsLabel = opts.expansionsLabel || 'EXPANSIONS';
    this.seasonLabel = opts.seasonLabel || 'KORD BREACH';
    this.seasonProgress = opts.seasonProgress || '10 / 53';
    this.showSeasonBanner = !!opts.showSeasonBanner;
    this.showThemeChip = opts.showThemeChip !== false;
    this.onAction = typeof opts.onAction === 'function' ? opts.onAction : null;

    this.audio = opts.audio || new MenuAudio({
      ambientUrl: opts.ambientUrl || null,
      volume: opts.volume,
      musicVolume: opts.musicVolume,
    });

    /* Состояние */
    this.root = null;
    this.refs = {};
    this.opened = false;
    this.destroyed = false;
    this.cursor = 0;
    this.audioArmed = false;
    this._handlers = [];
    this._flickTimer = null;
    this._toastTimer = null;
  }

  /* =======================================================================
   *  РЕСУРСЫ: шрифты Google Fonts и таблица стилей
   * ===================================================================== */

  injectFonts() {
    if (document.getElementById('eft-fonts')) return;
    const pre1 = document.createElement('link');
    pre1.rel = 'preconnect';
    pre1.href = 'https://fonts.googleapis.com';

    const pre2 = document.createElement('link');
    pre2.rel = 'preconnect';
    pre2.href = 'https://fonts.gstatic.com';
    pre2.crossOrigin = 'anonymous';

    const link = document.createElement('link');
    link.id = 'eft-fonts';
    link.rel = 'stylesheet';
    link.href = MENU_FONTS_HREF;

    document.head.appendChild(pre1);
    document.head.appendChild(pre2);
    document.head.appendChild(link);
  }

  injectCSS() {
    if (document.getElementById('eft-menu-css')) return;
    const style = document.createElement('style');
    style.id = 'eft-menu-css';
    style.textContent = MENU_CSS + MENU_CSS_GLUE;
    document.head.appendChild(style);
  }

  /* =======================================================================
   *  РАЗМЕТКА
   * ===================================================================== */

  /** Декор темы: лампа / ветка / дрон. */
  _decorMarkup(theme) {
    const decor = Array.isArray(theme.decor)
      ? theme.decor : (theme.decor ? [theme.decor] : []);
    let out = '';
    if (decor.indexOf('bulb') >= 0) out += buildBulb();
    if (decor.indexOf('branch') >= 0) out += buildBranch(this.seed + 7);
    if (decor.indexOf('drone') >= 0) out += buildDrone();
    return out;
  }

  /** Центральный вертикальный список кнопок. */
  _navMarkup() {
    return MENU_ITEMS.map((it, i) => {
      const label = esc(it.label || String(it.id).toUpperCase());
      const action = esc(it.action || it.id);
      const cls = 'eft-item' + (it.primary ? ' is-primary' : '') +
        (it.danger ? ' is-danger' : '');
      return `<button type="button" class="${cls}" data-action="${action}"` +
        ` data-index="${i}" tabindex="-1">` +
        `<span class="eft-item-txt">${label}</span></button>`;
    }).join('');
  }

  /** Одна вкладка нижней панели. */
  _tabMarkup(t) {
    const ico = ICONS[t.icon] || ICONS.gear || '';
    const badge = t.badge != null && t.badge !== ''
      ? `<span class="eft-badge">${esc(String(t.badge))}</span>` : '';
    const dot = t.dot ? '<span class="eft-dot"></span>' : '';
    const cls = 'eft-tab' + (t.active ? ' eft-tab-on' : '') +
      (t.label ? '' : ' eft-tab-icoonly');
    const label = t.label
      ? '<span class="eft-tab-label">' + esc(t.label) + '</span>' : '';
    return `<button type="button" class="${cls}" data-action="${esc(t.action || t.id)}"` +
      ` title="${esc(t.label)}" aria-label="${esc(t.label)}">` +
      `<span class="eft-tab-ico">${ico}</span>${label}${dot}${badge}</button>`;
  }

  /** Нижняя панель: расширения + вкладки + PVE ZONE. */
  _taskbarMarkup() {
    const tabs = (list) => list
      .filter((t) => !t.slots)
      .map((t) => this._tabMarkup(t))
      .join('');
    const left = tabs(TABS_LEFT);
    const right = tabs(TABS_RIGHT);
    const slots = [0, 1, 2, 3].map((i) =>
      '<span class="eft-slot" data-slot="' + i + '">' +
      (ICONS.plus || '') + '</span>'
    ).join('');

    return [
      '<footer class="eft-taskbar">',
        '<div class="eft-taskgroup">', left, '</div>',
        '<div class="eft-taskgroup">',
          '<div class="eft-tab-slots">', slots, '</div>',
          right,
        '</div>',
      '</footer>',
    ].join('');
  }

  /** Полная разметка меню. */
  _markup(theme) {
    return [
      /* --- слои фона (все — CSS, ни одного растра) --- */
      '<div class="eft-layer eft-bg"></div>',
      '<div class="eft-layer eft-vignette"></div>',
      '<div class="eft-layer eft-grain"></div>',
      '<div class="eft-layer eft-scan"></div>',
      '<div class="eft-decor">', this._decorMarkup(theme), '</div>',

      /* --- центральная сцена: BETA / логотип / сезон / меню --- */
      '<main class="eft-stage">',
        '<div class="eft-beta">', esc(theme.betaText || 'BETA TESTING'), '</div>',
        '<div class="eft-logo">', buildLogo(this.seed), '</div>',
        '<div class="eft-season">',
          '<span class="eft-season-badge">', esc(this.seasonProgress), '</span>',
          '<span class="eft-season-cell">',
            '<b class="eft-season-title">', esc(this.seasonLabel), '</b>',
            '<i class="eft-season-sub">EVENT PROGRESS</i>',
          '</span>',
        '</div>',
        '<nav class="eft-nav" role="menu">', this._navMarkup(), '</nav>',
      '</main>',

      /* --- «Leaving the game...» (тема forest) --- */
      '<div class="eft-leaving">',
        '<span class="eft-spinner" aria-hidden="true"></span>',
        '<span class="eft-leaving-txt">Leaving the game',
        '<i>.</i><i>.</i><i>.</i></span>',
      '</div>',

      /* --- нижняя панель с вкладками --- */
      this._taskbarMarkup(),

      /* --- левый угол: EXPANSIONS / уровень / версия билда --- */
      '<button type="button" class="eft-expansions" data-action="expansions"',
      ' title="', esc(this.expansionsLabel), '">',
        '<span class="eft-exp-plate"><span class="eft-exp-ico">',
        (ICONS.expansion || ICONS.plus || ''), '</span></span>',
        '<span class="eft-exp-label">', esc(this.expansionsLabel), '</span>',
      '</button>',
      '<div class="eft-exp-level" title="Level"><b>',
      esc(String(this.level)), '</b></div>',
      '<div class="eft-build">', esc(this.buildVersion), '</div>',

      /* --- правый угол: PVE ZONE + череп --- */
      '<div class="eft-pve"><span class="eft-pve-ico">', (ICONS.skull || ''),
      '</span><span class="eft-pve-txt">', esc(this.zone), '</span></div>',

      /* --- служебные слои --- */
      '<div class="eft-toasts" aria-live="polite"></div>',
      '<div class="eft-modal">',
        '<div class="eft-modal-box">',
          '<h4>EXIT THE GAME</h4>',
          '<p>Are you sure you want to leave Tarkov?</p>',
          '<div class="eft-modal-row">',
            '<button type="button" class="eft-btn eft-btn-pri"',
            ' data-modal="yes">YES</button>',
            '<button type="button" class="eft-btn" data-modal="no">NO</button>',
          '</div>',
        '</div>',
      '</div>',
      '<div class="eft-themechip">F9 &middot; THEME: <b>',
      esc(this.themeId.toUpperCase()), '</b></div>',
    ].join('');
  }

  /* =======================================================================
   *  МОНТАЖ И СОБЫТИЯ
   * ===================================================================== */

  mount() {
    if (this.root || this.destroyed) return this;
    this.injectFonts();
    this.injectCSS();

    const theme = this.themes.get(this.themeId) || THEME_PRESETS.default;

    const root = document.createElement('div');
    root.id = 'eft-menu';
    root.setAttribute('role', 'application');
    root.innerHTML = this._markup(theme);
    this.host.appendChild(root);
    this.root = root;

    this._cacheRefs();
    this._applyTheme(this.themeId, { silent: true });
    this._bind();

    this.opened = true;
    this.cursor = 0;
    this._syncCursor();
    document.documentElement.classList.add('eft-menu-open');

    /* Плавное появление (opacity в CSS: #eft-menu.eft-on). */
    requestAnimationFrame(() => root.classList.add('eft-on'));

    /* Страж ┣ пока меню открыто, PointerLock ЗАПРЕЩЁН. */
    if (document.pointerLockElement) {
      try { document.exitPointerLock(); } catch (e) {}
    }
    return this;
  }

  _cacheRefs() {
    const q = (sel) => this.root.querySelector(sel);
    const qa = (sel) => Array.prototype.slice.call(this.root.querySelectorAll(sel));
    this.refs = {
      decor: q('.eft-decor'),
      stage: q('.eft-stage'),
      beta: q('.eft-beta'),
      logo: q('.eft-logo'),
      season: q('.eft-season'),
      nav: q('.eft-nav'),
      items: qa('.eft-item'),
      leaving: q('.eft-leaving'),
      taskbar: q('.eft-taskbar'),
      tabs: qa('.eft-tab'),
      toasts: q('.eft-toasts'),
      modal: q('.eft-modal'),
      chip: q('.eft-themechip'),
    };
  }

  _on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this._handlers.push([target, type, fn, opts]);
  }

  _bind() {
    const root = this.root;

    /* --- Аудио: первый же клик/клавиша заводит эмбиент --- */
    const arm = () => {
      if (this.audioArmed || this.destroyed) return;
      this.audioArmed = true;
      this.audio.arm();
      this.audio.startAmbient(3200);
    };
    this._on(window, 'pointerdown', arm);
    this._on(window, 'keydown', arm);

    /* --- Наведение: аналоговый щелчок --- */
    this._on(root, 'pointerover', (e) => {
      const btn = e.target.closest(
        '.eft-item, .eft-tab, .eft-btn, .eft-expansions, .eft-slot');
      if (!btn || btn.disabled || btn === this._lastHover) return;
      this._lastHover = btn;
      this.audio.hover();
      if (btn.classList.contains('eft-item')) {
        this.cursor = Number(btn.dataset.index) || 0;
        this._syncCursor();
      }
    });
    this._on(root, 'pointerout', (e) => {
      if (e.target === this._lastHover) this._lastHover = null;
    });

    /* --- Клик: тяжёлый «затвор» + диспетчер действий --- */
    this._on(root, 'click', (e) => {
      const modalBtn = e.target.closest('[data-modal]');
      if (modalBtn) {
        this.audio.press();
        this._modalAnswer(modalBtn.dataset.modal === 'yes');
        return;
      }
      const btn = e.target.closest('[data-action]');
      if (!btn || btn.disabled) return;
      e.preventDefault();
      this.audio.press();
      this.handle(btn.dataset.action, btn);
    });

    /* --- Клавиатура: стрелки/WS, Enter, Esc, F9 (тема), M (звук) --- */
    this._on(window, 'keydown', (e) => {
      if (!this.opened) return;
      const k = e.key;
      const modalOpen = this.refs.modal.classList.contains('eft-modal-on');
      if (modalOpen) {
        if (k === 'Escape') { this.audio.back(); this._modalAnswer(false); }
        if (k === 'Enter') { this.audio.press(); this._modalAnswer(true); }
        return;
      }
      if (k === 'ArrowDown' || k === 's' || k === 'S') {
        e.preventDefault(); this._move(1);
      } else if (k === 'ArrowUp' || k === 'w' || k === 'W') {
        e.preventDefault(); this._move(-1);
      } else if (k === 'Enter' || k === ' ') {
        e.preventDefault();
        const it = this.refs.items[this.cursor];
        if (it) { this.audio.press(); this.handle(it.dataset.action, it); }
      } else if (k === 'F9') {
        e.preventDefault(); this.nextTheme();
      } else if (k === 'm' || k === 'M') {
        this.audio.setMuted(!this.audio.muted);
        this.toast(this.audio.muted ? 'SOUND: OFF' : 'SOUND: ON');
      }
    });

    /* --- ГЛАВНЫЙ СТРАЖ: выбиваем PointerLock, пока меню живо --- */
    this._on(document, 'pointerlockchange', () => {
      if (this.opened && document.pointerLockElement) {
        try { document.exitPointerLock(); } catch (e) {}
      }
    });
    this._on(root, 'contextmenu', (e) => e.preventDefault());

    /* --- Случайное мерцание лампы --- */
    this._scheduleFlicker();
  }

  _unbind() {
    this._handlers.forEach((h) => {
      try { h[0].removeEventListener(h[1], h[2], h[3]); } catch (e) {}
    });
    this._handlers = [];
    if (this._flickTimer) { clearTimeout(this._flickTimer); this._flickTimer = null; }
    if (this._toastTimer) { clearTimeout(this._toastTimer); this._toastTimer = null; }
  }

  /* =======================================================================
   *  НАВИГАЦИЯ ПО СПИСКУ
   * ===================================================================== */

  _move(dir) {
    const usable = this.refs.items.filter((el) => !el.disabled);
    if (!usable.length) return;
    this.cursor = (this.cursor + dir + usable.length) % usable.length;
    this._syncCursor();
    this.audio.hover();
  }

  _syncCursor() {
    this.refs.items.forEach((el, i) => {
      el.classList.toggle('eft-focus', i === this.cursor);
    });
  }

  /* =======================================================================
   *  ТЕМЫ — добавление новой темы = одна строка registerTheme()
   * ===================================================================== */

  /**
   * menu.registerTheme('rain', {
   *   background: 'radial-gradient(...)', blur: '14px', logo: 'metal',
   *   decor: ['bulb'], beta: false, leaving: false,
   * });
   */
  registerTheme(id, def) {
    this.themes.set(id, Object.assign({}, THEME_PRESETS.default, def || {}));
    return this;
  }

  listThemes() { return Array.from(this.themes.keys()); }

  setTheme(id) {
    if (!this.themes.has(id) || this.destroyed) return this;
    this._applyTheme(id);
    return this;
  }

  nextTheme() {
    const ids = this.listThemes();
    const i = ids.indexOf(this.themeId);
    this.audio.back();
    return this.setTheme(ids[(i + 1) % ids.length]);
  }

  _applyTheme(id, o) {
    const opt = o || {};
    const t = this.themes.get(id) || THEME_PRESETS.default;
    const r = this.root;
    this.themeId = id;
    if (!r) return this;

    const decor = Array.isArray(t.decor)
      ? t.decor : (t.decor ? [t.decor] : []);

    /* 1. Состояние темы живёт в data-атрибутах — всю отрисовку делает CSS. */
    r.setAttribute('data-theme', id);
    r.setAttribute('data-logo', t.logo || 'metal');
    r.setAttribute('data-decor', decor.join(' '));
    r.setAttribute('data-beta', t.beta ? '1' : '0');
    r.setAttribute('data-leaving', t.leaving ? '1' : '0');
    r.setAttribute('data-spinner', decor.indexOf('spinner') >= 0 ? '1' : '0');
    r.setAttribute('data-season', this.showSeasonBanner ? '1' : '0');
    r.setAttribute('data-themechip', this.showThemeChip ? '1' : '0');

    /* 2. CSS-переменные фона и постобработки. */
    const set = (k, v) => {
      if (v !== undefined && v !== null) r.style.setProperty(k, String(v));
    };
    set('--eft-bg', t.background);
    set('--eft-blur', t.blur);
    set('--eft-sat', t.saturate);
    set('--eft-bright', t.brightness);
    set('--eft-vig', t.vignette);
    set('--eft-glow', t.glow);
    set('--eft-accent', t.accent);

    /* 3. Декор пересобирается процедурно (новый seed — новая ветка). */
    if (this.refs.decor) this.refs.decor.innerHTML = this._decorMarkup(t);
    if (this.refs.beta) {
      this.refs.beta.textContent = t.betaText || 'BETA TESTING';
    }
    if (this.refs.chip) {
      this.refs.chip.innerHTML = 'F9 &middot; THEME: <b>' +
        esc(id.toUpperCase()) + '</b>';
    }

    this._scheduleFlicker();
    if (!opt.silent) this.toast('THEME: ' + id.toUpperCase());
    return this;
  }

  /** Случайное мерцание лампы: скачок напряжения каждые 1.4–6.6 с. */
  _scheduleFlicker() {
    if (this._flickTimer) { clearTimeout(this._flickTimer); this._flickTimer = null; }
    const t = this.themes.get(this.themeId) || {};
    const decor = Array.isArray(t.decor) ? t.decor : [t.decor];
    if (decor.indexOf('bulb') < 0 || !this.root) return;

    const tick = () => {
      const bulb = this.root && this.root.querySelector('.eft-bulb');
      if (!bulb) return;
      bulb.classList.add('eft-surge');
      setTimeout(() => bulb.classList.remove('eft-surge'), 70 + Math.random() * 230);
      this.root.style.setProperty('--eft-flick-delay',
        (Math.random() * 2.4).toFixed(2) + 's');
      this._flickTimer = setTimeout(tick, 1400 + Math.random() * 5200);
    };
    this._flickTimer = setTimeout(tick, 1200 + Math.random() * 2600);
  }

  /* =======================================================================
   *  ДЕЙСТВИЯ МЕНЮ
   * ===================================================================== */

  handle(action, el) {
    const a = String(action || '').toLowerCase();

    /* Внешний перехватчик может отменить стандартное поведение (вернув true). */
    if (this.onAction && this.onAction(a, el, this) === true) return undefined;

    switch (a) {
      case MENU_ACTION.RAID:
      case 'raid':
      case 'play':
        return this.startRaid();

      case MENU_ACTION.EXIT:
      case 'exit':
      case 'quit':
        return this.openExitModal();

      default:
        return this.route(a);
    }
  }

  /** Отдаём экран UI-подсистеме движка, если она есть. */
  route(id) {
    const hasUi = this.ctx && typeof this.ctx.has === 'function' && this.ctx.has('ui');
    const ui = hasUi ? this.ctx.get('ui') : null;
    if (ui && typeof ui.go === 'function') { ui.go(id); return true; }
    this.toast(id.toUpperCase() + ' — not available in this build');
    return false;
  }

  /* =======================================================================
   *  СТАРТ РЕЙДА — единственная дверь в геймплей
   * ===================================================================== */

  async startRaid(opts) {
    if (this._launching || this.destroyed) return;
    this._launching = true;
    if (this.root) this.root.classList.add('eft-launching');
    this.toast('MATCHING… ENTERING THE RAID');

    try {
      if (this.engine && typeof this.engine.startRaid === 'function') {
        /* Движок сам погасит меню через menu.close({ fade: 1500 }). */
        await this.engine.startRaid(opts || {});
      } else {
        await this.close({ fade: 1500, destroy: true });
      }
    } finally {
      this._launching = false;
    }
  }

  /* =======================================================================
   *  ВЫХОД / ТОСТЫ
   * ===================================================================== */

  openExitModal() {
    if (this.refs.modal) this.refs.modal.classList.add('eft-modal-on');
  }

  _modalAnswer(yes) {
    if (this.refs.modal) this.refs.modal.classList.remove('eft-modal-on');
    if (!yes) return;

    /* Обёртка Electron / Tauri, если есть. */
    if (window.eftShell && typeof window.eftShell.quit === 'function') {
      this.fadeOut(700);
      setTimeout(() => window.eftShell.quit(), 720);
      return;
    }
    this.fadeOut(900);
    setTimeout(() => {
      try { window.close(); } catch (e) {}
      this.toast('You can close the tab now');
      if (this.root) this.root.classList.add('eft-on');
    }, 950);
  }

  toast(text, ms) {
    if (!this.refs.toasts) return this;
    const el = document.createElement('div');
    el.className = 'eft-toast';
    el.textContent = text;
    this.refs.toasts.appendChild(el);
    requestAnimationFrame(() => el.classList.add('eft-on'));
    setTimeout(() => {
      el.classList.remove('eft-on');
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 420);
    }, ms == null ? 2600 : ms);
    return this;
  }

  /* =======================================================================
   *  ЗАКРЫТИЕ / ЖИЗНЕННЫЙ ЦИКЛ
   * ===================================================================== */

  /** Только гашение (без удаления DOM): музыка + прозрачность. */
  fadeOut(ms) {
    const d = ms == null ? 1500 : ms;
    if (this.root) {
      this.root.style.transition = 'opacity ' + d + 'ms ease';
      this.root.classList.remove('eft-on');
    }
    return this.audio.fadeOutMusic(d);
  }

  /**
   * Закрыть меню: музыка гаснет за fade мс, затем HTML удаляется.
   * Именно это вызывает Engine.startRaid().
   */
  async close(o) {
    const opt = o || {};
    const fade = opt.fade == null ? 1500 : opt.fade;
    const destroy = opt.destroy !== false;
    if (!this.root || this.destroyed) return this;

    /* Снимаем стража PointerLock ДО анимации, чтобы движок мог забрать курсор. */
    this.opened = false;
    document.documentElement.classList.remove('eft-menu-open');

    const music = this.audio.fadeOutMusic(fade);
    if (this.root) {
      this.root.style.transition = 'opacity ' + fade + 'ms ease';
      this.root.classList.remove('eft-on');
      this.root.style.pointerEvents = 'none';
    }

    await Promise.all([music, sleep(fade)]);

    if (destroy) this.destroy();
    else if (this.root) this.root.style.display = 'none';
    return this;
  }

  hide() {
    if (this.root) this.root.style.display = 'none';
    this.opened = false;
    document.documentElement.classList.remove('eft-menu-open');
    return this;
  }

  show() {
    if (!this.root) return this.mount();
    this.root.style.display = '';
    this.root.style.pointerEvents = '';
    this.opened = true;
    document.documentElement.classList.add('eft-menu-open');
    requestAnimationFrame(() => this.root.classList.add('eft-on'));
    if (document.pointerLockElement) {
      try { document.exitPointerLock(); } catch (e) {}
    }
    return this;
  }

  isOpen() { return !!this.opened; }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.opened = false;
    this._unbind();
    this.audio.stopAmbient();
    if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    this.root = null;
    this.refs = {};
    document.documentElement.classList.remove('eft-menu-open');
  }

  /* =======================================================================
   *  СИСТЕМНЫЕ ХУКИ ДВИЖКА (Engine.register('menu', ...))
   * ===================================================================== */

  /** Вызывается движком при регистрации системы. */
  init(ctx, engine) {
    if (ctx) this.ctx = ctx;
    if (engine) this.engine = engine;
    return this;
  }

  /** Меню не нуждается в кадровом апдейте — всё делает CSS. */
  update() {}
}

export default MainMenuSystem;
