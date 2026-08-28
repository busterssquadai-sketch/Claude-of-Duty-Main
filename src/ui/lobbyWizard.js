/* ==========================================================================
 * Escape-From-Larpov · src/ui/lobbyWizard.js
 *
 * ПУБЛИЧНАЯ ТОЧКА ВХОДА визарда высадки и МОСТ в главное меню.
 *
 * Пять шагов пути от главного меню до рейда живут в ./lobbyWizard/wizard.js:
 *
 *   1. ВЫБЕРИТЕ ПЕРСОНАЖА         — ДИКИЙ / ЧВК, колонки с описаниями
 *   2. ВЫБЕРИТЕ МЕСТО ДИСЛОКАЦИИ  — ЗАВОД / ТАМОЖНЯ / ЛЕС / РАЗВЯЗКА /
 *                                   ЛАБОРАТОРИЯ плюс сжатые часы 1:9
 *   3. ТРЕНИРОВОЧНЫЙ РЕЖИМ ИГРЫ   — чекбокс и модалка шестерёнки
 *   4. ПОДТВЕРЖДЕНИЕ              — силуэт во всю высоту и ГОТОВ
 *   5. ВЫСАДКА НА МЕСТО ДИСЛОКАЦИИ — runRaidPrewarm() перед STATE.GAMEPLAY
 *
 * РАЗДЕЛЕНИЕ ОТВЕТСТВЕННОСТИ. Здесь сознательно нет ни одного шага: класс
 * лежит в ./lobbyWizard/wizard.js, данные, бренд и часы — в
 * ./lobbyWizard/data.js, весь CSS — в ./lobbyWizard/style.js, процедурный
 * SVG — в ./lobbyWizard/art.js. Второй экземпляр класса в этом файле означал
 * бы две расходящиеся копии одного экрана, поэтому модуль держит ровно
 * четыре вещи:
 *
 *   - реэкспорт публичной поверхности для внешних импортёров;
 *   - жизненный цикл единственного живого визарда (activeWizard);
 *   - resolveMenuRoot() — поиск контейнера меню, который надо повернуть;
 *   - делегированный мост с клика «ПОБЕГ ИЗ ЛАРПОВА» в openLobbyWizard().
 *
 * ЗАЧЕМ МОСТ ПЕРЕХВАТЫВАЕТ КЛИК. Штатный обработчик меню уходит в
 * engine.startRaid(), а тот выставляет STATE.GAMEPLAY сразу после
 * raid.start() — то есть ДО компиляции шейдеров и до пре-пула трассеров.
 * Ровно это давало многосекундный стоп на первом выстреле и на первой
 * очереди бота. Поэтому слушатель висит в фазе ПЕРЕХВАТА и гасит событие, а
 * высадкой дальше правит шаг 5: он ждёт runRaidPrewarm() и только потом
 * отдаёт движку enterGameplay().
 *
 * ARCHITECTURE.md. Правило 1: этот файл живёт в src/ui/ и не трогает чужие
 * каталоги. Правило 2: чужие подсистемы не импортируются — world, raid, ai,
 * inventory и meta визард берёт через ctx.peek() в рантайме. Наружу отсюда
 * торчит только STATE из core/engine.js, где он и заморожен, — строковые
 * литералы состояний в src/ui/ запрещены.
 * ========================================================================== */

import { STATE } from '../core/engine.js'
import { LobbyWizard } from './lobbyWizard/wizard.js'
import { NS, removeStyles } from './lobbyWizard/style.js'

/* --------------------------------------------------------------------------
 * Публичная поверхность модуля.
 *
 * Внешние импортёры (dev-харнессы, ui/preview.mjs, будущие кнопки меню)
 * должны видеть визард целиком через один путь, не зная о внутреннем
 * каталоге ./lobbyWizard/. Реэкспорт держит этот контракт.
 * ----------------------------------------------------------------------- */

export { LobbyWizard }
export { STEPS } from './lobbyWizard/wizard.js'
export { NS, STYLE_ID, Z_INDEX, ensureStyles, removeStyles } from './lobbyWizard/style.js'
export {
	BRAND,
	rebrandText,
	applyGlobalRebranding,
	FACTIONS,
	findFaction,
	MAP_CATALOGUE,
	REAL_SECONDS_PER_GAME_MINUTE,
	CLOCK_FACTOR,
	DAY_SECONDS,
	HALF_DAY_SECONDS,
	gameClockSeconds,
	formatClock,
	isNightSeconds,
	formatDuration,
	formatStopwatch,
	AI_COUNT_OPTIONS,
	AI_DIFFICULTY_OPTIONS,
	AI_COUNT_SCALE,
	AI_DIFFICULTY_SCALE,
	optionLabel,
	defaultOfflineConfig
} from './lobbyWizard/data.js'

/* ------------------------------------------------------------- константы */

/* Корни чужих оверлеев и самого визарда — клики внутри них мост не трогает. */
const SKIP_ROOTS = '.efl-esc, .efl-set, #eftInv, .' + NS

/* Кандидаты в контейнер главного меню, если инстанс не отдал свой узел. */
const MENU_SELECTORS = ['.efl-mm', '.efl-menu', '#eflMainMenu', '[data-efl-main-menu]']

/*
 * Подпись кнопки запуска рейда.
 *
 * Ловим и ребрендированную, и исходную форму: applyGlobalRebranding() и
 * core/branding.js переписывают живой DOM меню, но на первом клике
 * ребрендинг мог ещё не дойти до этого узла, а MENU_ITEMS в mainMenu.js
 * по-прежнему отдаёт английский заголовок. Пропустить клик из-за падежа
 * нельзя — игрок останется на неработающей кнопке.
 */
const LAUNCH_RE = /побег\s+из\s+(ларпова|таркова)|escape\s+from\s+(larpov|tarkov)/i

/* Машинные метки действия: MENU_ACTION.RAID из mainMenu.js — это 'raid'. */
const LAUNCH_ACTS = /^(play|raid|deploy|start|startraid|launch|escape)$/i

const LAUNCH_ATTRS = [
	'data-act',
	'data-action',
	'data-nav',
	'data-screen',
	'data-menu',
	'data-role',
	'data-view',
	'id',
	'aria-label'
]

/* Сколько родителей проходим от кликнутого узла вверх. */
const MAX_WALK = 8

/* Длиннее этого текст считаем контейнером, а не подписью кнопки. */
const MAX_LABEL = 60

/* --------------------------------------------------------------- хелперы */

function logWarn(message, err) {
	if (typeof console === 'undefined') return
	if (err) console.warn('[EFL/lobby] ' + message, err)
	else console.warn('[EFL/lobby] ' + message)
}

function logError(message, err) {
	if (typeof console === 'undefined') return
	console.error('[EFL/lobby] ' + message, err)
}

/** Движок из аргумента, иначе дев-хендл из main.js. */
function resolveEngine(engine) {
	if (engine) return engine
	if (typeof window !== 'undefined' && window.__ENGINE__) return window.__ENGINE__
	return null
}

/**
 * Пускать визард можно только со стартового экрана.
 *
 * Молчащий движок (дев-харнесс без state) не блокируем: там визард
 * поднимают вручную.
 */
function stateAllowsWizard(engine) {
	if (!engine || typeof engine.state !== 'string') return true
	return engine.state === STATE.MENU || engine.state === STATE.BOOT
}

function attrOf(node, name) {
	if (!node || typeof node.getAttribute !== 'function') return null
	const raw = node.getAttribute(name)
	return raw == null ? null : String(raw)
}

/**
 * Ищет контейнер главного меню, который надо повернуть на 90° влево.
 *
 * MainMenuSystem монтируется в document.body из main.js, поэтому сначала
 * смотрим поля инстанса, потом поднимаемся от кликнутого узла до прямого
 * ребёнка body, и только потом пробуем селекторы. Порядок важен: селектор
 * может поймать вложенную панель вместо корня, и тогда повернётся половина
 * экрана.
 */
export function resolveMenuRoot(instance, fromNode) {
	const fields = ['root', 'el', 'node', 'container', 'dom', 'wrap', 'overlay']
	for (let i = 0; i < fields.length; i++) {
		const candidate = instance ? instance[fields[i]] : null
		if (candidate && candidate.nodeType === 1) return candidate
	}
	if (fromNode && fromNode.nodeType === 1 && typeof document !== 'undefined' && document.body) {
		let node = fromNode
		let guard = 0
		while (node && node.parentNode && node.parentNode !== document.body && guard < 24) {
			node = node.parentNode
			guard++
		}
		if (node && node.nodeType === 1 && node.parentNode === document.body) return node
	}
	if (typeof document === 'undefined') return null
	for (let i = 0; i < MENU_SELECTORS.length; i++) {
		const found = document.querySelector(MENU_SELECTORS[i])
		if (found) return found
	}
	return null
}

/* ====================================================================== */
/*                     жизненный цикл живого визарда                      */
/* ====================================================================== */

let activeWizard = null
let bridgeInstalled = false
let bridgeHandler = null

/** Живой визард или null. Разрушенный экземпляр наружу не отдаём. */
export function getActiveLobbyWizard() {
	if (activeWizard && activeWizard.destroyed) activeWizard = null
	return activeWizard
}

export function isLobbyWizardOpen() {
	return !!getActiveLobbyWizard()
}

/**
 * Открывает визард. Повторный вызов возвращает живой экземпляр.
 *
 * show() асинхронный (он ждёт поворот меню), поэтому промис здесь
 * обязательно перехватывается: незакрытый reject в обработчике клика — это
 * unhandledrejection и мёртвая кнопка без единой строки в консоли.
 *
 * @returns {LobbyWizard|null} экземпляр либо null, если открыть нельзя
 */
export function openLobbyWizard(engine, opts) {
	const live = getActiveLobbyWizard()
	if (live) return live
	if (typeof document === 'undefined') return null

	const o = opts || {}
	const resolved = resolveEngine(engine)
	if (!resolved) {
		logWarn('движок не найден — визард высадки не открыт')
		return null
	}
	if (!stateAllowsWizard(resolved)) return null

	const menuRoot = o.menuRoot || resolveMenuRoot(resolved.mainMenu || null, o.fromNode || null)

	let wizard = null
	try {
		wizard = new LobbyWizard(resolved, {
			menuRoot: menuRoot,
			mount: o.mount || document.body,
			/* Единственный владелец ссылки — этот модуль. Класс сообщает о
			 * своей смерти сам, поэтому activeWizard не переживает dispose(). */
			onDispose: function (dead) {
				if (activeWizard === dead) activeWizard = null
			}
		})
	} catch (err) {
		logError('LobbyWizard не создан', err)
		return null
	}

	activeWizard = wizard

	Promise.resolve()
		.then(function () {
			return wizard.show()
		})
		.catch(function (err) {
			logError('визард высадки не отрисовался', err)
			try {
				wizard.dispose()
			} catch (inner) {
				/* теардаун не имеет права бросать поверх исходной ошибки */
			}
			if (activeWizard === wizard) activeWizard = null
		})

	return wizard
}

/**
 * Закрывает визард.
 *
 * @param opts.restoreMenu вернуть меню поворотом обратно (по умолчанию да)
 */
export function closeLobbyWizard(opts) {
	const wizard = getActiveLobbyWizard()
	activeWizard = null
	if (!wizard) return false
	const o = opts || {}
	try {
		wizard.close({ restoreMenu: o.restoreMenu !== false })
	} catch (err) {
		logError('закрытие визарда упало', err)
		try {
			wizard.dispose()
		} catch (inner) {
			/* см. выше */
		}
		return false
	}
	return true
}

/* ====================================================================== */
/*                             мост в меню                                */
/* ====================================================================== */

/** Похож ли узел на кнопку выхода в рейд. */
function looksLikeLaunch(node) {
	if (!node || node.nodeType !== 1) return false

	const text = (node.textContent || '').replace(/\s+/g, ' ').trim()
	if (text && text.length <= MAX_LABEL && LAUNCH_RE.test(text)) return true

	for (let i = 0; i < LAUNCH_ATTRS.length; i++) {
		const raw = attrOf(node, LAUNCH_ATTRS[i])
		if (!raw) continue
		const trimmed = raw.trim()
		if (LAUNCH_ACTS.test(trimmed)) return true
		if (LAUNCH_RE.test(trimmed)) return true
	}
	return false
}

/** Ближайший вверх по дереву узел запуска рейда, либо null. */
function findLaunchNode(target) {
	let node = target
	for (let i = 0; i < MAX_WALK; i++) {
		if (!node || node.nodeType !== 1) return null
		if (typeof document !== 'undefined' && node === document.body) return null
		if (looksLikeLaunch(node)) return node
		node = node.parentElement
	}
	return null
}

function onDocumentClick(e) {
	if (!e || e.defaultPrevented) return
	/* Только основная кнопка мыши: контекстное меню рейд не запускает. */
	if (typeof e.button === 'number' && e.button !== 0) return
	if (isLobbyWizardOpen()) return

	const target = e.target
	if (!target || target.nodeType !== 1) return
	if (typeof target.closest === 'function' && target.closest(SKIP_ROOTS)) return

	const hit = findLaunchNode(target)
	if (!hit) return

	const engine = resolveEngine(null)
	if (!stateAllowsWizard(engine)) return

	/*
	 * Порядок намеренный: сначала пробуем открыть, гасим событие только
	 * после успеха. Если визард почему-то не поднялся, клик уходит штатному
	 * обработчику меню и рейд всё равно стартует через engine.startRaid() —
	 * без преварма, но и без мёртвой кнопки.
	 */
	const wizard = openLobbyWizard(engine, {
		menuRoot: resolveMenuRoot(engine ? engine.mainMenu : null, hit),
		fromNode: hit
	})
	if (!wizard) return

	e.preventDefault()
	if (typeof e.stopPropagation === 'function') e.stopPropagation()
	/* Меню вешает свой хендлер на этот же узел — глушим и соседей. */
	if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation()
}

/**
 * Ставит делегированный обработчик клика по «ПОБЕГ ИЗ ЛАРПОВА».
 *
 * Обработчик висит на фазе ПЕРЕХВАТА, чтобы опередить штатный хендлер меню,
 * который ушёл бы в startRaid() без преварма. Делегирование — потому что
 * MainMenuSystem перерисовывает свой DOM целиком при смене темы, и прямая
 * подписка на узел кнопки умерла бы вместе с ним.
 *
 * main.js этот модуль не импортирует и правится лидом, поэтому мост
 * ставится сам при импорте (см. низ файла).
 *
 * @returns {boolean} true, если слушатель поставлен именно этим вызовом
 */
export function applyLobbyWizardBridge() {
	if (bridgeInstalled || typeof document === 'undefined') return false
	bridgeInstalled = true
	bridgeHandler = onDocumentClick
	document.addEventListener('click', bridgeHandler, true)
	return true
}

/** Снимает мост. Нужен дев-харнессам и hot-reload. */
export function removeLobbyWizardBridge() {
	if (!bridgeInstalled || typeof document === 'undefined') return false
	if (bridgeHandler) document.removeEventListener('click', bridgeHandler, true)
	bridgeHandler = null
	bridgeInstalled = false
	return true
}

/**
 * Полный теардаун подсистемы визарда: живой экран, мост и тег стилей.
 *
 * «Dispose what you create» из ARCHITECTURE.md: <style> впрыскивает
 * ensureStyles(), значит снять его обязан этот модуль, а не сборщик мусора.
 */
export function disposeLobbyWizardUi() {
	closeLobbyWizard({ restoreMenu: false })
	removeLobbyWizardBridge()
	removeStyles()
}

/* ------------------------------------------------------- автоустановка */

applyLobbyWizardBridge()

/*
 * Дев-хендл рядом с window.__ENGINE__ из main.js: без него визард нельзя
 * поднять из консоли, не зная пути импорта. Ничего не переопределяем, если
 * хендл уже занят.
 */
if (typeof window !== 'undefined' && !window.__eflLobbyWizard) {
	window.__eflLobbyWizard = {
		open: openLobbyWizard,
		close: closeLobbyWizard,
		active: getActiveLobbyWizard,
		dispose: disposeLobbyWizardUi
	}
}

export default openLobbyWizard
