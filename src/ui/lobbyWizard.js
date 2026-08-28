/* ==========================================================================
 * Escape-From-Larpov · src/ui/lobbyWizard.js
 *
 * Визард высадки: линейная цепочка «убежище → рейд» из пяти шагов с
 * навигацией ДАЛЕЕ / НАЗАД. Модуль владеет своим оверлеем и своими стилями
 * и никогда не рисует поверх чужих корней (.efl-esc, .efl-set, #eftInv).
 *
 * ШАГИ
 *   1. Выбор персонажа     — ДИКИЙ / ЧВК
 *   2. Выбор локации       — карточки карт + сжатые часы 1:9
 *   3. Тренировочный режим — чекбокс + модалка настроек ИИ
 *   4. Подтверждение       — силуэт снаряжения и кнопка ГОТОВ
 *   5. Высадка             — прогрев под экраном загрузки
 *
 * ПОРЯДОК СОСТОЯНИЙ — главное в этом файле.
 *
 * engine.startRaid() сознательно НЕ используется: он зовёт enterGameplay()
 * сразу после raid.start(), то есть STATE.GAMEPLAY встал бы ДО компиляции
 * шейдеров и ДО роста пула трассеров — ровно те микрофризы, которые шаг 5
 * обязан убрать. Поэтому цепочка собрана вручную:
 *
 *   engine.enterLoading()                   → STATE.LOADING
 *   runRaidPrewarm(engine, {
 *     afterTerrain: () => raid.start(...)    → world.buildMap(), лут, здоровье
 *   })
 *        ├─ shaders : compile обеих сцен по УЖЕ собранной карте
 *        ├─ weapons : прогон каждого набора вьюмодели (первый кадр со стволом)
 *        └─ tracers : пул частиц вырастает до боевого размера
 *   engine.enterGameplay()                  → STATE.GAMEPLAY, только теперь
 *
 * Сам прогрев живёт в src/core/raidPrewarm.js (собственность лида) и уже
 * умеет всё, что требует шаг 5: пре-пул трассеров, прогрев геометрии оружия
 * и компиляцию шейдерных конвейеров. Дублировать его здесь запрещено.
 *
 * АКТИВАЦИЯ. main.js про этот модуль не знает, поэтому мост ставится сам при
 * импорте и делает это идемпотентно. Достаточно одной строки в src/ui/index.js:
 *     import './lobbyWizard.js'
 * либо явного вызова applyLobbyWizardBridge().
 *
 * ARCHITECTURE.md: чужие подсистемы не импортируются, только ctx.peek(id).
 * Каталог карт продублирован ниже как ПРЕЗЕНТАЦИОННЫЕ данные и обязан
 * совпадать с таблицей MAPS из src/world/index.js.
 * ========================================================================== */

import { STATE } from '../core/engine.js'
import { runRaidPrewarm, PREWARM_STAGES } from '../core/raidPrewarm.js'

/* ------------------------------------------------------------------ бренд */

export const BRAND = Object.freeze({
	ru: 'Побег из Ларпова',
	ruUpper: 'ПОБЕГ ИЗ ЛАРПОВА',
	city: 'Ларпов',
	cityUpper: 'ЛАРПОВ',
	en: 'Escape from Larpov',
	shortEn: 'Larpov',
	zone: 'PVE ZONE',
	pmc: 'AMSEC/TAIGA'
})

/* Таблица глобального ребрендинга. Порядок важен: длинные формы идут раньше
 * коротких, иначе «Побег из Таркова» распадётся на два независимых куска. */
const REBRAND_RULES = [
	[/Escape\s+from\s+Tarkov/gi, BRAND.en],
	[/Побег\s+из\s+Таркова/gi, BRAND.ru],
	[/ТАРКОВА/g, 'ЛАРПОВА'],
	[/ТАРКОВ/g, 'ЛАРПОВ'],
	[/Таркова/g, 'Ларпова'],
	[/Таркове/g, 'Ларпове'],
	[/Таркову/g, 'Ларпову'],
	[/Тарков/g, 'Ларпов'],
	[/таркова/g, 'ларпова'],
	[/тарков/g, 'ларпов'],
	[/TARKOV/g, 'LARPOV'],
	[/Tarkov/g, 'Larpov'],
	[/tarkov/g, 'larpov'],
	[/\bUSEC\b/g, 'AMSEC'],
	[/\bBEAR\b/g, 'TAIGA']
]

const SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CANVAS: 1, CODE: 1, PRE: 1 }

/** Ребрендинг одной строки. Чистая функция, безопасна для пустого ввода. */
export function rebrandText(input) {
	if (input == null) return ''
	let out = String(input)
	for (let i = 0; i < REBRAND_RULES.length; i++) {
		out = out.replace(REBRAND_RULES[i][0], REBRAND_RULES[i][1])
	}
	return out
}

/**
 * Глобальный ребрендинг живого DOM: заголовок документа и все текстовые узлы
 * поддерева. Пишем только когда строка реально изменилась — иначе каждый
 * проход дёргал бы reflow на всём меню.
 */
export function applyGlobalRebranding(root) {
	if (typeof document === 'undefined') return 0

	const title = rebrandText(document.title)
	if (title !== document.title) document.title = title
	if (/OVERWATCH|Tactical Shooter/i.test(document.title)) {
		document.title = BRAND.ru + ' · ' + BRAND.en
	}

	const scope = root || document.body
	if (!scope || typeof document.createTreeWalker !== 'function') return 0

	const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
		acceptNode(node) {
			const parent = node.parentNode
			if (!parent || SKIP_TAGS[parent.nodeName]) return NodeFilter.FILTER_REJECT
			if (!node.nodeValue || node.nodeValue.length < 4) return NodeFilter.FILTER_REJECT
			return NodeFilter.FILTER_ACCEPT
		}
	})

	let touched = 0
	let node = walker.nextNode()
	while (node) {
		const next = rebrandText(node.nodeValue)
		if (next !== node.nodeValue) {
			node.nodeValue = next
			touched++
		}
		node = walker.nextNode()
	}
	return touched
}

/* ------------------------------------------------------------------ фракции */

const FACTIONS = [
	{
		id: 'scav',
		label: 'ДИКИЙ',
		tag: 'SCAV',
		desc: 'Участвуйте в рейде Диким, местным бандитом с неизвестным стартовым снаряжением. Это ваш Ларпов и ваши правила!',
		primary: false
	},
	{
		id: 'pmc',
		label: 'ЧВК',
		tag: 'ВАШ ОСНОВНОЙ ПЕРСОНАЖ',
		desc: 'Отправляйтесь в рейд вашим главным персонажем - оператором ЧВК ' + BRAND.pmc + ' и сделайте все возможное, чтобы совершить Побег из Ларпова живым.',
		primary: true
	}
]

/* ------------------------------------------------------------------ карты */

/*
 * Презентационный каталог локаций.
 *
 * id и duration зеркалят таблицу MAPS из src/world/index.js — она и решает,
 * что реально соберётся в buildMap(). Прямой импорт запрещён ARCHITECTURE.md
 * («Never import another subsystem's module»), поэтому таблица дублируется
 * здесь и сверяется с рантаймом в _syncCatalogue().
 *
 * available:false — у карты нет билдера в движке. БЕРЕГ отрисуется как
 * «НЕДОСТУПНО» (как ТЕРМИНАЛ в оригинале) и не даст уйти на шаг 3, вместо
 * того чтобы уронить рейд исключением из buildMap().
 */
const MAP_CATALOGUE = [
	{
		id: 'factory',
		label: 'ЗАВОД',
		en: 'Factory',
		duration: 25 * 60,
		size: 96,
		players: '7-8',
		available: true,
		needCard: null,
		palette: ['#4a3c28', '#12100c', '#8b7346'],
		desc: 'Территория и производственные помещения химического комбината №16 были незаконно сданы компании TerraGroup. В период Контрактных Войн здесь проходили бои между подразделениями ' + BRAND.pmc + ', определяющие контроль за заводским районом города Ларпова.'
	},
	{
		id: 'customs',
		label: 'ТАМОЖНЯ',
		en: 'Customs',
		duration: 35 * 60,
		size: 150,
		players: '9-12',
		available: true,
		needCard: null,
		palette: ['#4f4632', '#100f0b', '#9a8a5c'],
		desc: 'Промышленная зона и таможенный терминал на выезде из Ларпова. Через эти склады уходил весь контрабандный поток TerraGroup, поэтому за ржавые ангары и общежития до сих пор идёт самая плотная перестрелка.'
	},
	{
		id: 'woods',
		label: 'ЛЕС',
		en: 'Woods',
		duration: 40 * 60,
		size: 190,
		players: '8-14',
		available: true,
		needCard: null,
		palette: ['#2f3a26', '#0c0f0a', '#5f7444'],
		desc: 'Лесной массив западнее Ларпова с заброшенной лесопилкой в центре. Огромные дистанции, минимум укрытий на просеках и снайперы на высотах — самая медленная и самая нервная локация.'
	},
	{
		id: 'shoreline',
		label: 'БЕРЕГ',
		en: 'Shoreline',
		duration: 45 * 60,
		size: 0,
		players: '10-13',
		available: false,
		needCard: null,
		palette: ['#2b3b44', '#0a0e11', '#4f7080'],
		desc: 'Санаторный комплекс на побережье и подходы к нему. Локация зарезервирована: билдер берега в движке ещё не собран, поэтому высадка сюда заблокирована.'
	},
	{
		id: 'lab',
		label: 'ЛАБОРАТОРИЯ',
		en: 'The Lab',
		duration: 30 * 60,
		size: 110,
		players: '6-8',
		available: true,
		needCard: 'tgcard',
		palette: ['#3d3f4a', '#0b0c0f', '#7d8598'],
		desc: 'Закрытый исследовательский комплекс TerraGroup под центром Ларпова. Вход только по пропуску, охрана усилена, а выходы открываются лишь после включения общей тревоги.'
	},
	{
		id: 'interchange',
		label: 'РАЗВЯЗКА',
		en: 'Interchange',
		duration: 35 * 60,
		size: 160,
		players: '9-14',
		available: true,
		needCard: null,
		palette: ['#463a3a', '#100d0d', '#8b6f6f'],
		desc: 'Торговый центр «Ультра» и транспортная развязка над ним. Тесные торговые ряды, темнота внутри и самый жирный лут на квадратный метр во всём Ларпове.'
	}
]

/* ------------------------------------------------------- сжатые часы 1:9 */

/*
 * Одна минута игрового времени = ровно 9 секунд реального.
 * Отсюда множитель 60 / 9 = 6.666… игровых секунд на каждую реальную.
 * Вторая карточка времени — та же шкала со сдвигом на 12 часов.
 */
const REAL_SECONDS_PER_GAME_MINUTE = 9
const CLOCK_FACTOR = 60 / REAL_SECONDS_PER_GAME_MINUTE
const DAY_SECONDS = 86400
const HALF_DAY_SECONDS = 43200
const NIGHT_FROM_HOUR = 21
const NIGHT_TO_HOUR = 5

export function gameClockSeconds(nowMs, offsetSeconds) {
	const real = (Number(nowMs) || 0) / 1000
	const shifted = real * CLOCK_FACTOR + (Number(offsetSeconds) || 0)
	const wrapped = shifted % DAY_SECONDS
	return wrapped < 0 ? wrapped + DAY_SECONDS : wrapped
}

function pad2(n) {
	const v = Math.floor(Math.abs(n))
	return v < 10 ? '0' + v : String(v)
}

export function formatClock(totalSeconds) {
	const s = Math.floor(totalSeconds) % DAY_SECONDS
	const h = Math.floor(s / 3600)
	const m = Math.floor((s % 3600) / 60)
	return pad2(h) + ':' + pad2(m) + ':' + pad2(s % 60)
}

function isNightSeconds(totalSeconds) {
	const hour = Math.floor((Math.floor(totalSeconds) % DAY_SECONDS) / 3600)
	return hour >= NIGHT_FROM_HOUR || hour < NIGHT_TO_HOUR
}

function formatDuration(seconds) {
	const total = Math.max(0, Math.floor(Number(seconds) || 0))
	return Math.floor(total / 60) + ' MIN'
}

function formatStopwatch(ms) {
	const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000))
	return pad2(Math.floor(total / 60)) + ':' + pad2(total % 60)
}

/* ------------------------------------------- тренировочный режим (шаг 3) */

const AI_COUNT_OPTIONS = [
	{ value: 'asonline', label: 'Как в онлайне' },
	{ value: 'low', label: 'Мало' },
	{ value: 'high', label: 'Много' },
	{ value: 'horde', label: 'Очень много' }
]

const AI_DIFFICULTY_OPTIONS = [
	{ value: 'asonline', label: 'Как в онлайне' },
	{ value: 'easy', label: 'Легко' },
	{ value: 'normal', label: 'Нормально' },
	{ value: 'hard', label: 'Сложно' },
	{ value: 'impossible', label: 'Невозможно' }
]

const AI_COUNT_SCALE = { asonline: 1, low: 0.5, high: 1.6, horde: 2.4 }
const AI_DIFFICULTY_SCALE = { asonline: 1, easy: 0.6, normal: 1, hard: 1.4, impossible: 2 }

function defaultOfflineConfig() {
	return {
		aiCount: 'asonline',
		aiDifficulty: 'asonline',
		bosses: true,
		noDrain: false
	}
}

/* ------------------------------------------------------------------ стили */

const STYLE_ID = 'efl-lobby-wizard-style'
const NS = 'efl-lw'
const Z_INDEX = 9600

const CSS = `
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

.${NS}-head {
	flex: 0 0 auto;
	padding: 34px 48px 10px;
	text-align: center;
}
.${NS}-title {
	font-size: 40px;
	letter-spacing: .16em;
	text-transform: uppercase;
	font-weight: 400;
	color: #e8e3d6;
	text-shadow: 0 3px 22px rgba(0,0,0,.85);
}
.${NS}-zone {
	margin-top: 6px;
	font-size: 12px;
	letter-spacing: .42em;
	color: #6f6a5e;
}
.${NS}-steps {
	display: flex;
	gap: 10px;
	justify-content: center;
	margin-top: 18px;
}
.${NS}-pip {
	width: 46px;
	height: 3px;
	background: rgba(255,255,255,.1);
	position: relative;
	overflow: hidden;
}
.${NS}-pip.on { background: #9a8a5c; }
.${NS}-pip.done { background: rgba(154,138,92,.45); }

.${NS}-body {
	flex: 1 1 auto;
	min-height: 0;
	padding: 8px 48px;
	overflow-y: auto;
	overflow-x: hidden;
	scrollbar-width: thin;
	scrollbar-color: rgba(154,138,92,.5) transparent;
}
.${NS}-body::-webkit-scrollbar { width: 8px; }
.${NS}-body::-webkit-scrollbar-thumb { background: rgba(154,138,92,.45); }

.${NS}-foot {
	flex: 0 0 auto;
	padding: 14px 48px 34px;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
}
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
	transition: color 140ms ease, text-shadow 140ms ease, transform 140ms ease;
}
.${NS}-nav:hover { color: #fff8e2; text-shadow: 0 0 20px rgba(214,190,122,.5); }
.${NS}-nav:disabled { color: #4a473f; cursor: not-allowed; text-shadow: none; }
.${NS}-nav.primary { color: #e6dcc0; }
.${NS}-hint {
	min-height: 16px;
	font-size: 12px;
	letter-spacing: .12em;
	color: #8d5f4a;
	text-transform: uppercase;
}

/* ------------------------------------------------- шаг 1: персонаж */
.${NS}-chars {
	display: grid;
	grid-template-columns: repeat(2, minmax(240px, 460px));
	gap: 26px;
	justify-content: center;
	align-items: stretch;
	padding-top: 6px;
}
.${NS}-char {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 18px 20px 22px;
	border: 1px solid rgba(255,255,255,.07);
	background: linear-gradient(180deg, rgba(255,255,255,.035), rgba(0,0,0,.32));
	cursor: pointer;
	transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
}
.${NS}-char:hover { border-color: rgba(214,190,122,.4); transform: translateY(-2px); }
.${NS}-char.sel { border-color: #9a8a5c; background: linear-gradient(180deg, rgba(214,190,122,.1), rgba(0,0,0,.4)); }
.${NS}-char-art { width: 100%; height: 300px; display: flex; align-items: flex-end; justify-content: center; }
.${NS}-char-art svg { height: 100%; width: auto; }
.${NS}-char-name {
	margin-top: 14px;
	font-size: 26px;
	letter-spacing: .2em;
	color: #ddd6c4;
	text-transform: uppercase;
}
.${NS}-char.sel .${NS}-char-name {
	background: #cfc4a4;
	color: #1a1712;
	padding: 3px 26px;
}
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

/* ------------------------------------------------- шаг 2: локация */
.${NS}-loc { display: grid; grid-template-columns: 1fr 400px; gap: 30px; align-items: start; }
.${NS}-maps { display: grid; grid-template-columns: repeat(auto-fill, minmax(196px, 1fr)); gap: 14px; }
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
.${NS}-thumb { margin-top: 12px; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; border: 1px solid rgba(255,255,255,.08); background: #08090a; }
.${NS}-thumb svg { width: 100%; height: 100%; display: block; }
.${NS}-detail-name { margin-top: 14px; font-size: 30px; letter-spacing: .08em; color: #ece5d2; text-transform: uppercase; }
.${NS}-detail-desc { margin-top: 12px; font-size: 12.5px; line-height: 1.6; color: #9d978a; }
.${NS}-detail-meta { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 18px; padding-top: 13px; border-top: 1px solid rgba(255,255,255,.08); }
.${NS}-chip { display: flex; align-items: center; gap: 7px; font-size: 11.5px; letter-spacing: .14em; color: #ada699; text-transform: uppercase; }
.${NS}-chip svg { width: 14px; height: 14px; opacity: .75; }

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
.${NS}-box {
	flex: 0 0 auto;
	width: 15px;
	height: 15px;
	border: 1px solid #8b8474;
	position: relative;
	background: rgba(0,0,0,.5);
}
.${NS}-clock.sel .${NS}-box::after,
.${NS}-check.on .${NS}-box::after {
	content: '';
	position: absolute;
	inset: 3px;
	background: #d6be7a;
}
.${NS}-clock-val { font-size: 25px; letter-spacing: .06em; font-variant-numeric: tabular-nums; color: #ece5d2; }
.${NS}-clock-tag { margin-left: auto; font-size: 9.5px; letter-spacing: .18em; color: #7b7566; text-transform: uppercase; }
.${NS}-clock-note { margin-top: 10px; font-size: 10.5px; letter-spacing: .1em; color: #635e54; text-transform: uppercase; }

/* ------------------------------------------------- шаг 3: тренировка */
.${NS}-offline { max-width: 940px; margin: 0 auto; }
.${NS}-lede { font-size: 13.5px; line-height: 1.62; color: #a09a8d; }
.${NS}-toggle-row { margin-top: 22px; display: flex; align-items: center; gap: 18px; }
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
.${NS}-row-val { color: #cbc5b7; letter-spacing: .08em; }

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

/* модалка настроек ИИ */
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
.${NS}-x {
	background: #7a1d1d;
	border: 0;
	color: #f2e6e6;
	width: 22px;
	height: 18px;
	line-height: 1;
	font: inherit;
	font-size: 12px;
	cursor: pointer;
}
.${NS}-modal-in { padding: 22px 24px 26px; }
.${NS}-modal-h { font-size: 19px; letter-spacing: .1em; color: #e2dbc8; text-transform: uppercase; margin-bottom: 14px; }
.${NS}-field { display: flex; align-items: center; gap: 16px; padding: 9px 0; }
.${NS}-field-l { flex: 0 0 210px; font-size: 13.5px; color: #9b9588; }
.${NS}-sel {
	flex: 0 0 auto;
	min-width: 200px;
	padding: 7px 10px;
	border: 1px solid rgba(255,255,255,.14);
	background: #0e1013;
	color: #d4cebf;
	font: inherit;
	font-size: 13px;
	cursor: pointer;
}
.${NS}-sel:focus { outline: 1px solid #9a8a5c; }

/* ------------------------------------------------- шаг 4: снаряжение */
.${NS}-confirm { display: grid; grid-template-columns: 300px 1fr 300px; gap: 26px; align-items: stretch; min-height: 100%; }
.${NS}-silhouette { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; position: relative; }
.${NS}-silhouette::after {
	content: '';
	position: absolute;
	left: 50%;
	bottom: 16px;
	transform: translateX(-50%);
	width: 260px;
	height: 34px;
	background: radial-gradient(50% 50% at 50% 50%, rgba(0,0,0,.85), rgba(0,0,0,0));
}
.${NS}-silhouette svg { height: min(62vh, 560px); width: auto; position: relative; z-index: 1; filter: drop-shadow(0 22px 40px rgba(0,0,0,.85)); }
.${NS}-nick { margin-top: 12px; font-size: 15px; letter-spacing: .2em; color: #cdc7b9; text-transform: uppercase; z-index: 1; }
.${NS}-panel { border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.4); padding: 15px; align-self: start; }
.${NS}-panel-h { font-size: 11px; letter-spacing: .26em; color: #6f6a5e; text-transform: uppercase; margin-bottom: 11px; }
.${NS}-kv { display: flex; justify-content: space-between; gap: 14px; padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,.05); font-size: 12.5px; }
.${NS}-kv span:first-child { color: #85806f; }
.${NS}-kv span:last-child { color: #ccc6b8; text-align: right; }

/* ------------------------------------------------- шаг 5: высадка */
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
.${NS}-deploy-grid { margin-top: auto; display: grid; grid-template-columns: 1fr 340px; gap: 34px; align-items: end; }
.${NS}-stages { display: flex; flex-direction: column; gap: 6px; }
.${NS}-stage { display: flex; align-items: center; gap: 11px; font-size: 12.5px; letter-spacing: .12em; color: #5d584f; text-transform: uppercase; transition: color 180ms ease; }
.${NS}-stage.on { color: #e5dcc2; }
.${NS}-stage.done { color: #8a8474; }
.${NS}-stage-dot { width: 7px; height: 7px; border: 1px solid currentColor; }
.${NS}-stage.on .${NS}-stage-dot { background: #d6be7a; border-color: #d6be7a; }
.${NS}-stage.done .${NS}-stage-dot { background: currentColor; }
.${NS}-status { margin-top: 20px; font-size: 15px; letter-spacing: .18em; color: #ddd4bb; text-transform: uppercase; min-height: 20px; }
.${NS}-bar { margin-top: 12px; height: 3px; background: rgba(255,255,255,.09); overflow: hidden; }
.${NS}-bar-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #9a8a5c, #d6be7a); transition: width 260ms ease; }
.${NS}-watch { font-size: 13px; letter-spacing: .2em; color: #8a8474; font-variant-numeric: tabular-nums; text-transform: uppercase; }
.${NS}-sum { border-left: 1px solid rgba(255,255,255,.1); padding-left: 22px; }
.${NS}-err { margin-top: 16px; color: #d98a72; font-size: 13px; letter-spacing: .08em; }

@media (max-width: 1100px) {
	.${NS}-loc { grid-template-columns: 1fr; }
	.${NS}-confirm { grid-template-columns: 1fr; }
	.${NS}-deploy-grid { grid-template-columns: 1fr; }
	.${NS}-head { padding: 22px 22px 8px; }
	.${NS}-body { padding: 8px 22px; }
	.${NS}-foot { padding: 12px 22px 24px; }
}
`

function ensureStyles() {
	if (typeof document === 'undefined') return
	if (document.getElementById(STYLE_ID)) return
	const tag = document.createElement('style')
	tag.id = STYLE_ID
	tag.textContent = CSS
	document.head.appendChild(tag)
}

/* ------------------------------------------------------------ DOM хелперы */

function el(tag, cls, text) {
	const node = document.createElement(tag)
	if (cls) node.className = cls
	if (text != null) node.textContent = text
	return node
}

function svg(markup) {
	const holder = document.createElement('div')
	holder.innerHTML = markup
	return holder.firstElementChild
}

/** Безопасный вызов чужого метода: отсутствующий хук — это не ошибка. */
function call(target, method) {
	if (!target || typeof target[method] !== 'function') return undefined
	const args = Array.prototype.slice.call(arguments, 2)
	try {
		return target[method].apply(target, args)
	} catch (err) {
		if (typeof console !== 'undefined') console.warn('[EFL/lobby] ' + method + '() упал', err)
		return undefined
	}
}

/* ------------------------------------------------------------ процедурный арт */

/* Ни одного внешнего файла: всё рисуется инлайновым SVG (ARCHITECTURE.md,
 * пункт про отсутствие внешних ассетов). */

function silhouetteSvg(factionId, accent) {
	const gun = factionId === 'scav'
		? "<path d='M92 150 L188 138 L188 150 L150 156 L150 166 L136 166 L136 158 L92 162 Z' fill='#0d0f10' opacity='.92'/><rect x='120' y='166' width='10' height='26' fill='#0d0f10' opacity='.92'/>"
		: "<path d='M96 146 L196 132 L196 146 L156 152 L156 164 L140 164 L140 154 L96 158 Z' fill='#0d0f10' opacity='.92'/><rect x='124' y='164' width='11' height='30' fill='#0d0f10' opacity='.92'/><rect x='168' y='126' width='26' height='6' fill='#0d0f10' opacity='.9'/>"
	return "<svg viewBox='0 0 260 620' xmlns='http://www.w3.org/2000/svg' role='img' aria-label='силуэт оперативника'>" +
		"<defs>" +
		"<linearGradient id='lwBody" + factionId + "' x1='0' y1='0' x2='0' y2='1'>" +
		"<stop offset='0' stop-color='#3b3f44'/><stop offset='.45' stop-color='#23262a'/><stop offset='1' stop-color='#101214'/>" +
		"</linearGradient>" +
		"<linearGradient id='lwRim" + factionId + "' x1='0' y1='0' x2='1' y2='0'>" +
		"<stop offset='0' stop-color='" + accent + "' stop-opacity='.85'/><stop offset='.35' stop-color='" + accent + "' stop-opacity='0'/>" +
		"</linearGradient>" +
		"</defs>" +
		"<g fill='url(#lwBody" + factionId + "')'>" +
		"<ellipse cx='130' cy='58' rx='31' ry='36'/>" +
		"<path d='M112 92 L148 92 L156 116 L104 116 Z'/>" +
		"<path d='M86 116 L174 116 L186 214 L180 300 L80 300 L74 214 Z'/>" +
		"<path d='M74 130 L58 146 L52 226 L74 232 L82 150 Z'/>" +
		"<path d='M186 130 L202 146 L208 226 L186 232 L178 150 Z'/>" +
		"<path d='M92 300 L124 300 L126 434 L118 546 L92 546 L88 430 Z'/>" +
		"<path d='M136 300 L168 300 L172 430 L168 546 L142 546 L134 434 Z'/>" +
		"<path d='M82 546 L122 546 L124 566 L78 566 Z'/>" +
		"<path d='M138 546 L178 546 L182 566 L136 566 Z'/>" +
		"</g>" +
		"<path d='M96 128 L164 128 L170 196 L90 196 Z' fill='#191c1f' opacity='.9'/>" +
		"<rect x='104' y='140' width='52' height='13' fill='" + accent + "' opacity='.35'/>" +
		"<rect x='104' y='160' width='38' height='11' fill='" + accent + "' opacity='.22'/>" +
		"<ellipse cx='130' cy='54' rx='24' ry='15' fill='#0e1113' opacity='.85'/>" +
		"<path d='M86 116 L174 116 L178 150 L82 150 Z' fill='url(#lwRim" + factionId + ")'/>" +
		gun +
		"</svg>"
}

function mapThumbSvg(map) {
	const p = map.palette
	const id = 'lwT' + map.id
	let shapes = ''
	if (map.id === 'woods' || map.id === 'shoreline') {
		for (let i = 0; i < 11; i++) {
			const x = 12 + i * 26
			const h = 34 + ((i * 37) % 40)
			shapes += "<path d='M" + x + ' ' + (150 - h) + ' L' + (x + 13) + ' 150 L' + (x - 13) + " 150 Z' fill='" + p[1] + "' opacity='.85'/>"
		}
	} else {
		for (let i = 0; i < 8; i++) {
			const x = 8 + i * 34
			const h = 40 + ((i * 53) % 58)
			shapes += "<rect x='" + x + "' y='" + (150 - h) + "' width='26' height='" + h + "' fill='" + p[1] + "' opacity='.88'/>"
			shapes += "<rect x='" + (x + 5) + "' y='" + (156 - h) + "' width='5' height='5' fill='" + p[2] + "' opacity='.5'/>"
			shapes += "<rect x='" + (x + 15) + "' y='" + (166 - h) + "' width='5' height='5' fill='" + p[2] + "' opacity='.35'/>"
		}
	}
	return "<svg viewBox='0 0 280 158' xmlns='http://www.w3.org/2000/svg' role='img' aria-label='превью локации'>" +
		"<defs><linearGradient id='" + id + "' x1='0' y1='0' x2='0' y2='1'>" +
		"<stop offset='0' stop-color='" + p[0] + "'/><stop offset='1' stop-color='" + p[1] + "'/>" +
		"</linearGradient></defs>" +
		"<rect width='280' height='158' fill='url(#" + id + ")'/>" +
		"<circle cx='232' cy='34' r='15' fill='" + p[2] + "' opacity='.3'/>" +
		shapes +
		"<rect y='150' width='280' height='8' fill='" + p[1] + "'/>" +
		"<rect width='280' height='158' fill='none' stroke='rgba(0,0,0,.55)' stroke-width='2'/>" +
		"</svg>"
}

function gearSvg() {
	return "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' aria-hidden='true'>" +
		"<circle cx='12' cy='12' r='3.2'/>" +
		"<path d='M12 3.6v2.2M12 18.2v2.2M4.6 12H2.4M21.6 12h-2.2M6.7 6.7 5.2 5.2M18.8 18.8l-1.5-1.5M17.3 6.7l1.5-1.5M5.2 18.8l1.5-1.5'/>" +
		"</svg>"
}

function clockIconSvg() {
	return "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' aria-hidden='true'>" +
		"<circle cx='12' cy='12' r='8.4'/><path d='M12 7.2V12l3.4 2.1'/></svg>"
}

function peopleIconSvg() {
	return "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' aria-hidden='true'>" +
		"<circle cx='9' cy='8' r='3.1'/><path d='M3.4 19.4c0-3.1 2.5-5.6 5.6-5.6s5.6 2.5 5.6 5.6'/>" +
		"<circle cx='17.4' cy='8.6' r='2.4'/><path d='M16 13.9c2.6-.3 4.7 1.7 4.7 4.3'/></svg>"
}

function sunIconSvg() {
	return "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' aria-hidden='true'>" +
		"<circle cx='12' cy='12' r='4.2'/><path d='M12 2.6v2.4M12 19v2.4M2.6 12H5M19 12h2.4M5.6 5.6 7.3 7.3M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7'/></svg>"
}

function moonIconSvg() {
	return "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' aria-hidden='true'>" +
		"<path d='M20 14.4A8.4 8.4 0 0 1 9.6 4a8.4 8.4 0 1 0 10.4 10.4Z'/></svg>"
}

function alertSvg() {
	return "<svg class='" + NS + "-warn-i' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' aria-hidden='true'>" +
		"<path d='M12 3.2 22 20.4H2Z'/><path d='M12 9.4v5'/><circle cx='12' cy='17.4' r='.9' fill='currentColor'/></svg>"
}

/* ------------------------------------------------------------ корень меню */

const MENU_SELECTORS = ['.efl-menu', '.efl-mm', '#eflMainMenu', '#eflMenu', '[data-efl-menu]', '.eft-menu', '#eftMenu']

/**
 * Контейнер главного меню. Инстанс MainMenuSystem не обязан звать своё
 * поле root, поэтому идём по трём путям: известные поля, известные
 * селекторы и, самое надёжное, подъём от нажатой кнопки до прямого ребёнка
 * точки монтирования (main.js монтирует меню в document.body).
 */
function resolveMenuRoot(instance, fromNode) {
	const fields = ['root', 'el', 'node', 'container', 'dom', 'wrap', 'overlay']
	for (let i = 0; i < fields.length; i++) {
		const candidate = instance ? instance[fields[i]] : null
		if (candidate && candidate.nodeType === 1) return candidate
	}

	if (fromNode && fromNode.nodeType === 1) {
		let node = fromNode
		while (node && node.parentElement && node.parentElement !== document.body) {
			node = node.parentElement
		}
		if (node && node.nodeType === 1 && node !== document.body) return node
	}

	for (let i = 0; i < MENU_SELECTORS.length; i++) {
		const found = document.querySelector(MENU_SELECTORS[i])
		if (found) return found
	}
	return null
}

/* ============================================================ LobbyWizard */

export class LobbyWizard {
	constructor(options) {
		const o = options || {}
		this.engine = o.engine || (typeof window !== 'undefined' ? window.__ENGINE__ : null) || null
		this.ctx = o.ctx || (this.engine ? this.engine.ctx : null) || null
		this.mount = o.mount || (typeof document !== 'undefined' ? document.body : null)
		this.menuRoot = o.menuRoot || null

		this.open = false
		this.stepIndex = 0
		this.deploying = false

		this.maps = MAP_CATALOGUE.map((m) => Object.assign({}, m))

		this.state = {
			faction: 'pmc',
			mapId: 'factory',
			clockSlot: 0,
			night: false,
			training: true,
			offline: defaultOfflineConfig()
		}

		this.rootEl = null
		this.bodyEl = null
		this.hintEl = null
		this.nextEl = null
		this.backEl = null
		this.pips = []
		this.modalEl = null

		this._clockRaf = 0
		this._clockNodes = null
		this._clockCache = ['', '']
		this._watchTimer = 0
		this._watchStart = 0
		this._watchEl = null
		this._statusEl = null
		this._barEl = null
		this._stageEls = null
		this._onKeyDown = null

		this.steps = [
			{ id: 'character', title: 'ВЫБЕРИТЕ ПЕРСОНАЖА', render: () => this._stepCharacter() },
			{ id: 'location', title: 'ВЫБЕРИТЕ МЕСТО ДИСЛОКАЦИИ', render: () => this._stepLocation() },
			{ id: 'training', title: 'ТРЕНИРОВОЧНЫЙ РЕЖИМ ИГРЫ', render: () => this._stepTraining() },
			{ id: 'confirm', title: 'ПОДТВЕРЖДЕНИЕ', render: () => this._stepConfirm() },
			{ id: 'deploy', title: 'ВЫСАДКА НА МЕСТО ДИСЛОКАЦИИ', render: () => this._stepDeploy() }
		]
	}

	/* --------------------------------------------------------- подсистемы */

	/* registry.get() бросает для незарегистрированного id, peek() — нет. */
	_peek(id) {
		const ctx = this.ctx
		if (!ctx) return null
		if (typeof ctx.peek === 'function') {
			try {
				return ctx.peek(id) || null
			} catch (err) {
				return null
			}
		}
		return null
	}

	/* Карта доступна, если у движка есть билдер и в инвентаре лежит пропуск. */
	_syncCatalogue() {
		const world = this._peek('world')
		const table = world && world.constructor && world.constructor.MAPS ? world.constructor.MAPS : (world ? world.MAPS : null)
		const inv = this._peek('inventory')

		for (let i = 0; i < this.maps.length; i++) {
			const map = this.maps[i]
			const def = table ? table[map.id] : null
			if (def) {
				map.available = true
				if (Number(def.duration) > 0) map.duration = Number(def.duration)
				if (Number(def.size) > 0) map.size = Number(def.size)
				if (def.needCard !== undefined) map.needCard = def.needCard || null
			}
			map.locked = !map.available
			map.lockNote = map.available ? '' : 'НЕДОСТУПНО'

			if (map.available && map.needCard) {
				const has = this._hasItem(inv, map.needCard)
				if (!has) {
					map.locked = true
					map.lockNote = 'НУЖЕН ПРОПУСК'
				}
			}
		}

		const current = this._map(this.state.mapId)
		if (!current || current.locked) {
			const first = this.maps.find((m) => !m.locked)
			if (first) this.state.mapId = first.id
		}
	}

	_hasItem(inv, id) {
		if (!inv || !inv.all || !id) return false
		try {
			for (let i = 0; i < inv.all.length; i++) {
				const it = inv.all[i]
				if (!it || it.id !== id) continue
				if (typeof inv.onBody !== 'function') return true
				if (inv.onBody(it)) return true
			}
		} catch (err) {
			return false
		}
		return false
	}

	_map(id) {
		return this.maps.find((m) => m.id === id) || null
	}

	_faction() {
		return FACTIONS.find((f) => f.id === this.state.faction) || FACTIONS[1]
	}

	/* -------------------------------------------------------- жизненный цикл */

	async show(opts) {
		if (this.open) return this
		if (typeof document === 'undefined') return this

		const o = opts || {}
		ensureStyles()

		if (o.menuRoot) this.menuRoot = o.menuRoot
		if (!this.menuRoot) {
			const instance = this.engine ? this.engine.mainMenu : null
			this.menuRoot = resolveMenuRoot(instance, o.fromNode || null)
		}

		this.open = true
		this.stepIndex = 0
		this.deploying = false
		this._syncCatalogue()
		this._syncClockNight()

		await this._rotateMenuOut()
		this._buildShell()
		this._renderStep()

		/* Ребрендинг гоняем по уже собранному оверлею и по меню под ним. */
		applyGlobalRebranding(this.rootEl)
		if (this.menuRoot) applyGlobalRebranding(this.menuRoot)

		return this
	}

	_buildShell() {
		const root = el('div', NS)
		root.setAttribute('role', 'dialog')
		root.setAttribute('aria-modal', 'true')

		const head = el('div', NS + '-head')
		this.titleEl = el('div', NS + '-title', this.steps[0].title)
		head.appendChild(this.titleEl)
		head.appendChild(el('div', NS + '-zone', BRAND.zone))

		const pips = el('div', NS + '-steps')
		this.pips = []
		for (let i = 0; i < this.steps.length; i++) {
			const pip = el('div', NS + '-pip')
			pips.appendChild(pip)
			this.pips.push(pip)
		}
		head.appendChild(pips)

		this.bodyEl = el('div', NS + '-body')

		const foot = el('div', NS + '-foot')
		this.hintEl = el('div', NS + '-hint')
		this.nextEl = el('button', NS + '-nav primary', 'ДАЛЕЕ')
		this.nextEl.type = 'button'
		this.nextEl.addEventListener('click', () => this.next())
		this.backEl = el('button', NS + '-nav', 'НАЗАД')
		this.backEl.type = 'button'
		this.backEl.addEventListener('click', () => this.back())
		foot.appendChild(this.hintEl)
		foot.appendChild(this.nextEl)
		foot.appendChild(this.backEl)

		root.appendChild(head)
		root.appendChild(this.bodyEl)
		root.appendChild(foot)

		this.rootEl = root
		this.mount.appendChild(root)

		/* Один кадр на применение начальной opacity, иначе transition не сыграет. */
		requestAnimationFrame(() => {
			if (this.rootEl) this.rootEl.classList.add(NS + '-in')
		})

		this._onKey