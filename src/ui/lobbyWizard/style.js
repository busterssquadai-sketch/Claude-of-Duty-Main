/* ==========================================================================
 * Escape-From-Larpov · src/ui/lobbyWizard/style.js
 *
 * Весь CSS визарда в одном впрыскиваемом <style>. Каждый селектор лежит
 * под префиксом .efl-lw, чтобы ничего не утекало в чужие корни
 * (.efl-esc, .efl-set, #eftInv) и в главное меню.
 *
 * Впрыск идемпотентен: тег ставится один раз и сносится в removeStyles()
 * при полном dispose — «dispose what you create» из ARCHITECTURE.md.
 * ========================================================================== */

export const NS = 'efl-lw'
export const STYLE_ID = 'efl-lobby-wizard-style'
export const Z_INDEX = 9600

export const CSS = `
/* ── поворот контейнера главного меню на 90° влево ── */
.${NS}-menu-rotate {
	transition: transform 620ms cubic-bezier(.22,.61,.36,1), opacity 620ms ease, filter 620ms ease;
	transform-origin: 50% 50%;
	will-change: transform, opacity;
}
.${NS}-menu-rotate.${NS}-menu-out {
	transform: rotate(-90deg) scale(.82);
	opacity: 0;
	filter: blur(6px) saturate(.4);
	pointer-events: none;
}

/* ── оболочка ── */
.${NS} {
	position: fixed;
	inset: 0;
	z-index: ${Z_INDEX};
	display: flex;
	flex-direction: column;
	font-family: 'Bender', 'Oswald', 'Inter', 'Helvetica Neue', Arial, sans-serif;
	color: #c8c3b6;
	background:
		radial-gradient(120% 90% at 50% 0%, rgba(28,32,36,.92) 0%, rgba(9,10,11,.97) 55%, rgba(4,4,5,.99) 100%),
		repeating-linear-gradient(0deg, rgba(255,255,255,.014) 0 1px, rgba(0,0,0,0) 1px 3px);
	-webkit-font-smoothing: antialiased;
	user-select: none;
	opacity: 0;
	transition: opacity 320ms ease;
	cursor: default;
}
.${NS}.${NS}-in { opacity: 1; }
.${NS} * { box-sizing: border-box; }

.${NS}-head { flex: 0 0 auto; padding: 34px 48px 10px; text-align: center; }
.${NS}-title {
	font-size: 40px;
	letter-spacing: .16em;
	text-transform: uppercase;
	font-weight: 400;
	color: #e8e3d6;
	text-shadow: 0 3px 22px rgba(0,0,0,.85);
}
.${NS}-zone { margin-top: 6px; font-size: 12px; letter-spacing: .42em; color: #6f6a5e; }
.${NS}-steps { display: flex; gap: 10px; justify-content: center; margin-top: 18px; }
.${NS}-pip { width: 46px; height: 3px; background: rgba(255,255,255,.1); }
.${NS}-pip.done { background: rgba(154,138,92,.45); }
.${NS}-pip.on { background: #9a8a5c; }

.${NS}-body {
	flex: 1 1 auto;
	min-height: 0;
	position: relative;
	padding: 8px 48px;
	overflow-y: auto;
	overflow-x: hidden;
	scrollbar-width: thin;
	scrollbar-color: rgba(154,138,92,.5) transparent;
}
.${NS}-body::-webkit-scrollbar { width: 8px; }
.${NS}-body::-webkit-scrollbar-thumb { background: rgba(154,138,92,.45); }

.${NS}-foot { flex: 0 0 auto; padding: 14px 48px 34px; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.${NS}-nav {
	background: none;
	border: 0;
	color: #cfc9bb;
	font: inherit;
	font-size: 27px;
	letter-spacing: .14em;
	text-transform: uppercase;
	padding: 5px 26px;
	cursor: pointer;
	transition: color 140ms ease, text-shadow 140ms ease;
}
.${NS}-nav:hover { color: #fff8e2; text-shadow: 0 0 20px rgba(214,190,122,.5); }
.${NS}-nav:disabled { color: #4a473f; cursor: not-allowed; text-shadow: none; }
.${NS}-nav.primary { color: #e6dcc0; }
.${NS}-nav.ready { font-size: 31px; color: #f0e6c8; }
.${NS}-hint { min-height: 16px; font-size: 12px; letter-spacing: .12em; color: #8d5f4a; text-transform: uppercase; }

/* ── шаг 1: выбор персонажа ── */
.${NS}-chars {
	display: grid;
	grid-template-columns: repeat(2, minmax(240px, 460px));
	gap: 26px;
	justify-content: center;
	align-items: stretch;
	padding-top: 6px;
}
.${NS}-char {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 18px 20px 22px;
	border: 1px solid rgba(255,255,255,.07);
	background: linear-gradient(180deg, rgba(255,255,255,.035), rgba(0,0,0,.32));
	color: inherit;
	font: inherit;
	text-align: center;
	cursor: pointer;
	transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
}
.${NS}-char:hover { border-color: rgba(214,190,122,.4); transform: translateY(-2px); }
.${NS}-char.sel { border-color: #9a8a5c; background: linear-gradient(180deg, rgba(214,190,122,.1), rgba(0,0,0,.4)); }
.${NS}-char-art { width: 100%; height: 300px; display: flex; align-items: flex-end; justify-content: center; }
.${NS}-char-art svg { height: 100%; width: auto; }
.${NS}-char-name { margin-top: 14px; font-size: 26px; letter-spacing: .2em; color: #ddd6c4; text-transform: uppercase; }
.${NS}-char.sel .${NS}-char-name { background: #cfc4a4; color: #1a1712; padding: 3px 26px; }
.${NS}-char-tag { margin-top: 7px; font-size: 10px; letter-spacing: .24em; color: #7d7768; text-transform: uppercase; }
.${NS}-char-desc {
	margin-top: 14px;
	font-size: 13px;
	line-height: 1.55;
	color: #a49e91;
	background: rgba(0,0,0,.55);
	padding: 12px 14px;
	text-align: left;
}

/* ── шаг 2: локация и время ── */
.${NS}-loc { display: grid; grid-template-columns: 1fr 400px; gap: 30px; align-items: start; }
.${NS}-maps { display: grid; grid-template-columns: repeat(auto-fill, minmax(196px, 1fr)); gap: 14px; align-content: start; }
.${NS}-map {
	position: relative;
	text-align: left;
	padding: 12px 14px;
	border: 1px solid rgba(255,255,255,.07);
	background: linear-gradient(180deg, rgba(255,255,255,.03), rgba(0,0,0,.34));
	color: #bdb7a9;
	font: inherit;
	cursor: pointer;
	transition: border-color 150ms ease, transform 150ms ease, color 150ms ease;
}
.${NS}-map:hover:not(.locked) { border-color: rgba(214,190,122,.45); transform: translateY(-2px); color: #efe8d6; }
.${NS}-map.sel { border-color: #9a8a5c; background: linear-gradient(180deg, rgba(214,190,122,.12), rgba(0,0,0,.42)); color: #f3ecd9; }
.${NS}-map.locked { cursor: not-allowed; opacity: .42; }
.${NS}-map-name { font-size: 17px; letter-spacing: .13em; text-transform: uppercase; }
.${NS}-map-sub { margin-top: 5px; font-size: 10px; letter-spacing: .2em; color: #7b7566; text-transform: uppercase; }
.${NS}-map-lock { position: absolute; top: 11px; right: 12px; font-size: 9px; letter-spacing: .16em; color: #8d5f4a; }

.${NS}-detail { border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.42); padding: 16px; }
.${NS}-detail-title { font-size: 12px; letter-spacing: .3em; color: #6f6a5e; text-transform: uppercase; }
.${NS}-thumb {
	margin-top: 12px;
	width: 100%;
	aspect-ratio: 16 / 9;
	overflow: hidden;
	border: 1px solid rgba(255,255,255,.08);
	background: #08090a;
}
.${NS}-thumb svg { width: 100%; height: 100%; display: block; }
.${NS}-detail-name { margin-top: 14px; font-size: 30px; letter-spacing: .08em; color: #ece5d2; text-transform: uppercase; }
.${NS}-detail-desc { margin-top: 12px; font-size: 12.5px; line-height: 1.6; color: #9d978a; }
.${NS}-detail-meta {
	margin-top: 16px;
	display: flex;
	flex-wrap: wrap;
	gap: 18px;
	padding-top: 13px;
	border-top: 1px solid rgba(255,255,255,.08);
}
.${NS}-chip { display: flex; align-items: center; gap: 7px; font-size: 11.5px; letter-spacing: .14em; color: #ada699; text-transform: uppercase; }
.${NS}-chip svg { width: 14px; height: 14px; opacity: .75; flex: 0 0 auto; }

.${NS}-clock-head { margin-top: 26px; font-size: 11px; letter-spacing: .28em; color: #6f6a5e; text-transform: uppercase; }
.${NS}-clocks { margin-top: 11px; display: flex; gap: 14px; flex-wrap: wrap; }
.${NS}-clock {
	flex: 1 1 168px;
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px 14px;
	border: 1px solid rgba(255,255,255,.08);
	background: rgba(0,0,0,.4);
	color: #cbc5b7;
	font: inherit;
	cursor: pointer;
	transition: border-color 150ms ease, background 150ms ease;
}
.${NS}-clock:hover { border-color: rgba(214,190,122,.45); }
.${NS}-clock.sel { border-color: #9a8a5c; background: rgba(214,190,122,.1); }
.${NS}-box { flex: 0 0 auto; width: 15px; height: 15px; border: 1px solid #8b8474; position: relative; background: rgba(0,0,0,.5); }
.${NS}-clock.sel .${NS}-box::after,
.${NS}-check.on .${NS}-box::after {
	content: '';
	position: absolute;
	inset: 3px;
	background: #d6be7a;
}
.${NS}-clock-val { font-size: 25px; letter-spacing: .06em; font-variant-numeric: tabular-nums; color: #ece5d2; }
.${NS}-clock-tag { margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 9.5px; letter-spacing: .18em; color: #7b7566; text-transform: uppercase; }
.${NS}-clock-tag svg { width: 13px; height: 13px; }
.${NS}-clock-note { margin-top: 10px; font-size: 10.5px; letter-spacing: .1em; color: #635e54; text-transform: uppercase; line-height: 1.5; }

/* ── шаг 3: тренировочный режим ── */
.${NS}-offline { max-width: 940px; margin: 0 auto; }
.${NS}-lede { font-size: 13.5px; line-height: 1.62; color: #a09a8d; }
.${NS}-toggle-row { margin-top: 22px; display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.${NS}-check {
	display: flex;
	align-items: center;
	gap: 11px;
	padding: 11px 15px;
	border: 1px solid rgba(255,255,255,.08);
	background: rgba(0,0,0,.36);
	color: #cbc5b7;
	font: inherit;
	font-size: 15px;
	letter-spacing: .06em;
	cursor: pointer;
	transition: border-color 150ms ease;
}
.${NS}-check:hover { border-color: rgba(214,190,122,.45); }
.${NS}-check.on { border-color: #9a8a5c; }
.${NS}-gear {
	display: flex;
	align-items: center;
	gap: 9px;
	background: none;
	border: 0;
	color: #cbc5b7;
	font: inherit;
	font-size: 14px;
	letter-spacing: .14em;
	text-transform: uppercase;
	cursor: pointer;
	transition: color 140ms ease, opacity 140ms ease;
}
.${NS}-gear:hover { color: #fff8e2; }
.${NS}-gear:disabled { opacity: .35; cursor: not-allowed; }
.${NS}-gear svg { width: 17px; height: 17px; }

.${NS}-rows { margin-top: 20px; border-top: 1px solid rgba(255,255,255,.07); }
.${NS}-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 20px;
	padding: 11px 4px;
	border-bottom: 1px solid rgba(255,255,255,.05);
	font-size: 13.5px;
	color: #9b9588;
}
.${NS}-row.dim { opacity: .42; }
.${NS}-row-val { color: #cbc5b7; letter-spacing: .08em; text-align: right; }

.${NS}-warn {
	margin-top: 24px;
	display: flex;
	gap: 14px;
	align-items: flex-start;
	padding: 14px 16px;
	background: linear-gradient(90deg, rgba(150,26,26,.92), rgba(96,18,18,.82));
	color: #f4e7e3;
	font-size: 12.5px;
	line-height: 1.55;
}
.${NS}-warn b { display: block; margin-bottom: 3px; letter-spacing: .06em; }
.${NS}-warn-i { flex: 0 0 auto; width: 22px; height: 22px; }

/* ── модалка настроек ── */
.${NS}-modal-wrap {
	position: absolute;
	inset: 0;
	z-index: 4;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(3,4,5,.72);
	backdrop-filter: blur(3px);
}
.${NS}-modal {
	width: min(760px, 92vw);
	max-height: 86%;
	overflow-y: auto;
	border: 1px solid rgba(255,255,255,.12);
	background: linear-gradient(180deg, #14161a, #0b0c0e);
	box-shadow: 0 30px 90px rgba(0,0,0,.8);
}
.${NS}-modal-bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 9px 12px;
	background: #1d2026;
	font-size: 11.5px;
	letter-spacing: .16em;
	color: #a9a396;
	text-transform: uppercase;
}
.${NS}-x { background: #7a1d1d; border: 0; color: #f2e6e6; width: 22px; height: 18px; line-height: 1; font: inherit; font-size: 12px; cursor: pointer; }
.${NS}-modal-in { padding: 22px 24px 26px; }
.${NS}-modal-h { font-size: 19px; letter-spacing: .1em; color: #e2dbc8; text-transform: uppercase; margin-bottom: 14px; }
.${NS}-modal-h + .${NS}-field { border-top: 1px solid rgba(255,255,255,.07); }
.${NS}-field { display: flex; align-items: center; gap: 16px; padding: 9px 0; }
.${NS}-field-l { flex: 1 1 auto; font-size: 13.5px; color: #9b9588; }
.${NS}-sel {
	flex: 0 0 auto;
	min-width: 210px;
	padding: 7px 10px;
	border: 1px solid rgba(255,255,255,.14);
	background: #0e1013;
	color: #d4cebf;
	font: inherit;
	font-size: 13px;
	cursor: pointer;
}
.${NS}-sel:focus { outline: 1px solid #9a8a5c; }
.${NS}-modal .${NS}-check { flex: 0 0 auto; min-width: 210px; }

/* ── шаг 4: подтверждение ── */
.${NS}-confirm { display: grid; grid-template-columns: 300px minmax(0, 1fr) 300px; gap: 26px; align-items: stretch; min-height: 100%; }
.${NS}-silhouette { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; }
.${NS}-silhouette::after {
	content: '';
	position: absolute;
	left: 50%;
	bottom: 14px;
	transform: translateX(-50%);
	width: 260px;
	height: 34px;
	background: radial-gradient(50% 50% at 50% 50%, rgba(0,0,0,.85), rgba(0,0,0,0));
}
.${NS}-silhouette svg {
	height: min(62vh, 560px);
	width: auto;
	position: relative;
	z-index: 1;
	filter: drop-shadow(0 22px 40px rgba(0,0,0,.85));
}
.${NS}-badge {
	position: absolute;
	top: 8px;
	left: 50%;
	transform: translateX(-50%);
	z-index: 2;
	padding: 4px 14px;
	border: 1px solid rgba(214,190,122,.5);
	background: rgba(0,0,0,.6);
	font-size: 17px;
	letter-spacing: .1em;
	color: #e8dcb8;
}
.${NS}-nick { margin-top: 12px; font-size: 15px; letter-spacing: .2em; color: #cdc7b9; text-transform: uppercase; position: relative; z-index: 1; }
.${NS}-panel { border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.4); padding: 15px; align-self: start; }
.${NS}-panel + .${NS}-panel { margin-top: 16px; }
.${NS}-panel-h { font-size: 11px; letter-spacing: .26em; color: #6f6a5e; text-transform: uppercase; margin-bottom: 11px; }
.${NS}-kv { display: flex; justify-content: space-between; gap: 14px; padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,.05); font-size: 12.5px; }
.${NS}-kv span:first-child { color: #85806f; }
.${NS}-kv span:last-child { color: #ccc6b8; text-align: right; }
.${NS}-status-bar {
	grid-column: 1 / -1;
	display: flex;
	flex-wrap: wrap;
	gap: 34px;
	justify-content: center;
	padding: 13px 18px;
	border-top: 1px solid rgba(255,255,255,.08);
	background: rgba(0,0,0,.4);
	font-size: 11.5px;
	letter-spacing: .14em;
	text-transform: uppercase;
	color: #8d8778;
}
.${NS}-status-bar b { color: #d6cfbe; font-weight: 400; margin-left: 8px; }
.${NS}-status-bar svg { width: 14px; height: 14px; vertical-align: -2px; margin-left: 8px; }

/* ── шаг 5: высадка ── */
.${NS}-deploy { position: absolute; inset: 0; display: flex; flex-direction: column; }
.${NS}-deploy-bg { position: absolute; inset: 0; overflow: hidden; }
.${NS}-deploy-bg svg { width: 100%; height: 100%; opacity: .3; filter: saturate(.5) contrast(1.1); }
.${NS}-deploy-bg::after {
	content: '';
	position: absolute;
	inset: 0;
	background:
		linear-gradient(180deg, rgba(4,5,6,.62), rgba(4,5,6,.93)),
		repeating-linear-gradient(0deg, rgba(0,0,0,.28) 0 2px, rgba(0,0,0,0) 2px 4px);
}
.${NS}-deploy-in { position: relative; z-index: 1; flex: 1 1 auto; display: flex; flex-direction: column; padding: 46px 56px; }
.${NS}-deploy-h { font-size: 32px; letter-spacing: .14em; color: #e9e2cf; text-transform: uppercase; }
.${NS}-deploy-sub { margin-top: 8px; font-size: 12px; letter-spacing: .28em; color: #6f6a5e; text-transform: uppercase; }
.${NS}-deploy-grid { margin-top: auto; display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 34px; align-items: end; }
.${NS}-stages { display: flex; flex-direction: column; gap: 6px; }
.${NS}-stage {
	display: flex;
	align-items: center;
	gap: 11px;
	font-size: 12.5px;
	letter-spacing: .12em;
	color: #5d584f;
	text-transform: uppercase;
	transition: color 180ms ease;
}
.${NS}-stage.on { color: #e5dcc2; }
.${NS}-stage.done { color: #8a8474; }
.${NS}-stage-dot { flex: 0 0 auto; width: 7px; height: 7px; border: 1px solid currentColor; }
.${NS}-stage.on .${NS}-stage-dot { background: #d6be7a; border-color: #d6be7a; }
.${NS}-stage.done .${NS}-stage-dot { background: currentColor; }
.${NS}-status { margin-top: 20px; font-size: 15px; letter-spacing: .18em; color: #ddd4bb; text-transform: uppercase; min-height: 20px; }
.${NS}-bar { margin-top: 12px; height: 3px; background: rgba(255,255,255,.09); overflow: hidden; }
.${NS}-bar-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #9a8a5c, #d6be7a); transition: width 260ms ease; }
.${NS}-watch { margin-top: 12px; font-size: 13px; letter-spacing: .2em; color: #8a8474; font-variant-numeric: tabular-nums; text-transform: uppercase; }
.${NS}-sum { border-left: 1px solid rgba(255,255,255,.1); padding-left: 22px; }
.${NS}-err { margin-top: 16px; color: #d98a72; font-size: 13px; letter-spacing: .08em; line-height: 1.5; }

@media (max-width: 1100px) {
	.${NS}-loc,
	.${NS}-confirm,
	.${NS}-deploy-grid { grid-template-columns: minmax(0, 1fr); }
	.${NS}-head { padding: 22px 22px 8px; }
	.${NS}-title { font-size: 30px; }
	.${NS}-body { padding: 8px 22px; }
	.${NS}-foot { padding: 12px 22px 24px; }
	.${NS}-chars { grid-template-columns: minmax(0, 1fr); }
	.${NS}-deploy-in { padding: 30px 24px; }
}
`

/** Впрыскивает тег стилей один раз за жизнь документа. */
export function ensureStyles() {
	if (typeof document === 'undefined') return null
	const existing = document.getElementById(STYLE_ID)
	if (existing) return existing
	const tag = document.createElement('style')
	tag.id = STYLE_ID
	tag.textContent = CSS
	document.head.appendChild(tag)
	return tag
}

/** Сносит тег стилей — зовётся только из LobbyWizard.dispose(). */
export function removeStyles() {
	if (typeof document === 'undefined') return
	const tag = document.getElementById(STYLE_ID)
	if (tag && tag.parentNode) tag.parentNode.removeChild(tag)
}
