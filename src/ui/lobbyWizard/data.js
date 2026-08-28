/* ==========================================================================
 * Escape-From-Larpov · src/ui/lobbyWizard/data.js
 *
 * Данные и чистые функции визарда высадки: бренд, глобальный ребрендинг,
 * фракции, каталог локаций, сжатые часы 1:9 и дефолты тренировки.
 *
 * Здесь нет ни одного импорта чужой подсистемы и ни одного обращения к DOM,
 * кроме applyGlobalRebranding() — она по природе работает по живому дереву.
 * ========================================================================== */

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

/*
 * Таблица глобального ребрендинга Тарков → Ларпов.
 * Порядок важен: длинные формы идут раньше коротких, иначе «Побег из Таркова»
 * распадётся на два независимых совпадения и падежи собьются.
 */
const REBRAND_RULES = [
	[/Escape\s+from\s+Tarkov/gi, BRAND.en],
	[/Побег\s+из\s+Таркова/gi, BRAND.ru],
	[/ТАРКОВА/g, 'ЛАРПОВА'],
	[/ТАРКОВ/g, 'ЛАРПОВ'],
	[/Таркова/g, 'Ларпова'],
	[/Таркове/g, 'Ларпове'],
	[/Таркову/g, 'Ларпову'],
	[/Тарковом/g, 'Ларповом'],
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

/** Ребрендинг одной строки. Чистая функция, терпит null и undefined. */
export function rebrandText(input) {
	if (input == null) return ''
	let out = String(input)
	for (let i = 0; i < REBRAND_RULES.length; i++) {
		out = out.replace(REBRAND_RULES[i][0], REBRAND_RULES[i][1])
	}
	return out
}

/**
 * Глобальный ребрендинг живого DOM: заголовок документа плюс все текстовые
 * узлы поддерева. Запись идёт только когда строка реально изменилась — иначе
 * каждый проход дёргал бы reflow на всём меню.
 *
 * @returns {number} сколько текстовых узлов переименовано
 */
export function applyGlobalRebranding(root) {
	if (typeof document === 'undefined') return 0

	const title = rebrandText(document.title)
	if (title !== document.title) document.title = title
	if (/OVERWATCH|Tactical\s+Shooter/i.test(document.title)) {
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

/* ---------------------------------------------------------------- фракции */

/* Шаг 1. Тексты зафиксированы техзаданием и меняться не должны. */
export const FACTIONS = [
	{
		id: 'scav',
		label: 'ДИКИЙ',
		tag: 'SCAV · СЛУЧАЙНОЕ СНАРЯЖЕНИЕ',
		accent: '#8f7a3e',
		desc: 'Участвуйте в рейде Диким, местным бандитом с неизвестным стартовым снаряжением. Это ваш Ларпов и ваши правила!'
	},
	{
		id: 'pmc',
		label: 'ЧВК',
		tag: 'ВАШ ОСНОВНОЙ ПЕРСОНАЖ',
		accent: '#c9b478',
		desc: 'Отправляйтесь в рейд вашим главным персонажем - оператором ЧВК ' + BRAND.pmc + ' и сделайте все возможное, чтобы совершить Побег из Ларпова живым.'
	}
]

export function findFaction(id) {
	for (let i = 0; i < FACTIONS.length; i++) {
		if (FACTIONS[i].id === id) return FACTIONS[i]
	}
	return FACTIONS[1]
}

/* ------------------------------------------------------------------ карты */

/*
 * Презентационный каталог локаций.
 *
 * id и duration зеркалят таблицу MAPS из src/world/index.js — именно она решает,
 * что реально соберётся в world.buildMap(). Прямой импорт чужой подсистемы
 * запрещён ARCHITECTURE.md, поэтому таблица дублируется здесь и сверяется с
 * рантаймом в LobbyWizard._syncCatalogue().
 *
 * available:false — у локации нет билдера в движке. БЕРЕГ рисуется карточкой
 * «НЕДОСТУПНО» — ровно так же, как ТЕРМИНАЛ в оригинале, и не даёт уйти дальше
 * вместо того чтобы уронить рейд исключением из buildMap().
 */
export const MAP_CATALOGUE = [
	{
		id: 'factory',
		label: 'ЗАВОД',
		en: 'Factory',
		duration: 25 * 60,
		size: 96,
		players: '7-8',
		weather: 'ДЫМ',
		available: true,
		needCard: null,
		kind: 'urban',
		palette: ['#4a3c28', '#12100c', '#8b7346'],
		desc: 'Производственные цеха химического комбината №16, незаконно сданные TerraGroup. Тесные коридоры, два яруса галерей и самые короткие рейды во всём Ларпове.'
	},
	{
		id: 'customs',
		label: 'ТАМОЖНЯ',
		en: 'Customs',
		duration: 35 * 60,
		size: 150,
		players: '9-12',
		weather: 'ПАСМУРНО',
		available: true,
		needCard: null,
		kind: 'urban',
		palette: ['#4f4632', '#100f0b', '#9a8a5c'],
		desc: 'Промзона и таможенный терминал на выезде из Ларпова. Через эти склады шёл весь контрабандный поток, и за ржавые ангары до сих пор идёт самая плотная перестрелка.'
	},
	{
		id: 'woods',
		label: 'ЛЕС',
		en: 'Woods',
		duration: 40 * 60,
		size: 190,
		players: '8-14',
		weather: 'ВЕТЕР',
		available: true,
		needCard: null,
		kind: 'nature',
		palette: ['#2f3a26', '#0c0f0a', '#5f7444'],
		desc: 'Лесной массив западнее Ларпова с заброшенной лесопилкой в центре. Огромные дистанции, минимум укрытий на просеках и снайперы на высотах.'
	},
	{
		id: 'shoreline',
		label: 'БЕРЕГ',
		en: 'Shoreline',
		duration: 45 * 60,
		size: 0,
		players: '10-13',
		weather: 'ДОЖДЬ',
		available: false,
		needCard: null,
		kind: 'nature',
		palette: ['#2b3b44', '#0a0e11', '#4f7080'],
		desc: 'Санаторный комплекс на побережье и подходы к нему. Локация зарезервирована: билдер берега в движке ещё не собран, поэтому высадка заблокирована.'
	},
	{
		id: 'lab',
		label: 'ЛАБОРАТОРИЯ',
		en: 'The Lab',
		duration: 30 * 60,
		size: 110,
		players: '6-8',
		weather: 'ЗАКРЫТО',
		available: true,
		needCard: 'tgcard',
		kind: 'urban',
		palette: ['#3d3f4a', '#0b0c0f', '#7d8598'],
		desc: 'Закрытый исследовательский комплекс TerraGroup под центром Ларпова. Вход только по пропуску, охрана усилена, выходы открываются лишь после общей тревоги.'
	},
	{
		id: 'interchange',
		label: 'РАЗВЯЗКА',
		en: 'Interchange',
		duration: 35 * 60,
		size: 160,
		players: '9-14',
		weather: 'СУМЕРКИ',
		available: true,
		needCard: null,
		kind: 'urban',
		palette: ['#463a3a', '#100d0d', '#8b6f6f'],
		desc: 'Торговый центр «Ультра» и транспортная развязка над ним. Тесные торговые ряды, темнота внутри и самый жирный лут на квадратный метр.'
	}
]

/* ------------------------------------------------------- сжатые часы 1:9 */

/*
 * Строгое правило: ОДНА МИНУТА игрового времени = РОВНО 9 СЕКУНД
 * реального. Отсюда множитель сжатия 60 / 9 = 6.666… игровых секунд на
 * каждую реальную. Вторая карточка — та же шкала со сдвигом на 12 часов,
 * именно поэтому одна из них всегда дневная, а вторая ночная.
 *
 * Шкала считается от реального unix-времени, а не от момента открытия
 * экрана — часы не сбрасываются при каждом входе в визард.
 */
export const REAL_SECONDS_PER_GAME_MINUTE = 9
export const CLOCK_FACTOR = 60 / REAL_SECONDS_PER_GAME_MINUTE
export const DAY_SECONDS = 86400
export const HALF_DAY_SECONDS = 43200

const NIGHT_FROM_HOUR = 21
const NIGHT_TO_HOUR = 5

/** Игровое время в секундах от полуночи для реального nowMs и сдвига. */
export function gameClockSeconds(nowMs, offsetSeconds) {
	const real = (Number(nowMs) || 0) / 1000
	const shifted = real * CLOCK_FACTOR + (Number(offsetSeconds) || 0)
	const wrapped = shifted % DAY_SECONDS
	return wrapped < 0 ? wrapped + DAY_SECONDS : wrapped
}

export function pad2(n) {
	const v = Math.floor(Math.abs(Number(n) || 0))
	return v < 10 ? '0' + v : String(v)
}

/** HH:MM:SS — ровно в том виде, в каком оригинал показывает время суток. */
export function formatClock(totalSeconds) {
	const s = Math.floor(Number(totalSeconds) || 0) % DAY_SECONDS
	const safe = s < 0 ? s + DAY_SECONDS : s
	const h = Math.floor(safe / 3600)
	const m = Math.floor((safe % 3600) / 60)
	return pad2(h) + ':' + pad2(m) + ':' + pad2(safe % 60)
}

export function isNightSeconds(totalSeconds) {
	const s = Math.floor(Number(totalSeconds) || 0) % DAY_SECONDS
	const safe = s < 0 ? s + DAY_SECONDS : s
	const hour = Math.floor(safe / 3600)
	return hour >= NIGHT_FROM_HOUR || hour < NIGHT_TO_HOUR
}

export function formatDuration(seconds) {
	const total = Math.max(0, Math.floor(Number(seconds) || 0))
	return Math.floor(total / 60) + ' MIN'
}

/** Секундомер экрана загрузки: MM:SS. */
export function formatStopwatch(ms) {
	const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000))
	return pad2(Math.floor(total / 60)) + ':' + pad2(total % 60)
}

/* ------------------------------------------- тренировочный режим (шаг 3) */

export const AI_COUNT_OPTIONS = [
	{ value: 'asonline', label: 'Как в онлайне' },
	{ value: 'low', label: 'Мало' },
	{ value: 'high', label: 'Много' },
	{ value: 'horde', label: 'Очень много' }
]

export const AI_DIFFICULTY_OPTIONS = [
	{ value: 'asonline', label: 'Как в онлайне' },
	{ value: 'easy', label: 'Легко' },
	{ value: 'normal', label: 'Нормально' },
	{ value: 'hard', label: 'Сложно' },
	{ value: 'impossible', label: 'Невозможно' }
]

/* Коэффициенты уезжают в подсистему ИИ через опциональные сеттеры. */
export const AI_COUNT_SCALE = { asonline: 1, low: 0.5, high: 1.6, horde: 2.4 }
export const AI_DIFFICULTY_SCALE = { asonline: 1, easy: 0.6, normal: 1, hard: 1.4, impossible: 2 }

export function optionLabel(options, value) {
	for (let i = 0; i < options.length; i++) {
		if (options[i].value === value) return options[i].label
	}
	return options.length ? options[0].label : ''
}

export function defaultOfflineConfig() {
	return {
		aiCount: 'asonline',
		aiDifficulty: 'asonline',
		bosses: true,
		noDrain: false
	}
}
