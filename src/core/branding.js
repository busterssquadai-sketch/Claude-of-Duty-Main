/* ==========================================================================
 * Escape-From-Larpov · src/core/branding.js
 *
 * Тотальный ребрендинг UI-слоя: Tarkov -> Larpov, ТАРКОВ -> ЛАРПОВ.
 *
 * ПОЧЕМУ ЭТО РАНТАЙМ-ПРОХОД, А НЕ ПРАВКА ФАЙЛОВ
 * Строки бренда рассыпаны по ui/mainMenu.js (84 КБ), ui/settingsMenu.js
 * (57 КБ), ui/raidResult.js (34 КБ) и ui/escapeMenu.js (38 КБ). Точечная
 * правка четырёх больших файлов даёт нечитаемый диф и ломается на каждом
 * следующем ре-рендере меню, которое пересобирает свой DOM целиком.
 *
 * Один проход по текстовым узлам плюс MutationObserver накрывает ВСЁ, что
 * попадает на экран, включая то, что нарисуют позже, и не зависит от того,
 * в каком именно файле лежит исходная подпись.
 *
 * Правила упорядочены от длинных к коротким: иначе «Побег из Таркова»
 * распалось бы на «Побег из» + отдельно склеенный корень и падежи бы
 * потерялись.
 * ========================================================================== */

export const BRAND = {
	short: 'ЛАРПОВ',
	shortGen: 'ЛАРПОВА',
	title: 'ПОБЕГ ИЗ ЛАРПОВА',
	titleMixed: 'Побег из Ларпова',
	latin: 'Larpov',
	latinFull: 'Escape from Larpov',
	abbr: 'EFL',
	studio: 'BSQ'
}

/* Порядок значим. Сначала целые названия, потом падежи, потом корень. */
const RULES = [
	[/Escape\s+from\s+Tarkov/g, 'Escape from Larpov'],
	[/ESCAPE\s+FROM\s+TARKOV/g, 'ESCAPE FROM LARPOV'],
	[/escape\s+from\s+tarkov/g, 'escape from larpov'],
	[/ПОБЕГ\s+ИЗ\s+ТАРКОВА/g, 'ПОБЕГ ИЗ ЛАРПОВА'],
	[/Побег\s+из\s+Таркова/g, 'Побег из Ларпова'],
	[/побег\s+из\s+таркова/g, 'побег из ларпова'],
	[/ТАРКОВСК/g, 'ЛАРПОВСК'],
	[/Тарковск/g, 'Ларповск'],
	[/тарковск/g, 'ларповск'],
	[/ТАРКОВА/g, 'ЛАРПОВА'],
	[/Таркова/g, 'Ларпова'],
	[/таркова/g, 'ларпова'],
	[/ТАРКОВЕ/g, 'ЛАРПОВЕ'],
	[/Тарков[еЕ]/g, 'Ларпове'],
	[/таркове/g, 'ларпове'],
	[/ТАРКОВУ/g, 'ЛАРПОВУ'],
	[/Таркову/g, 'Ларпову'],
	[/таркову/g, 'ларпову'],
	[/ТАРКОВОМ/g, 'ЛАРПОВОМ'],
	[/Тарковом/g, 'Ларповом'],
	[/тарковом/g, 'ларповом'],
	[/ТАРКОВ/g, 'ЛАРПОВ'],
	[/Тарков/g, 'Ларпов'],
	[/тарков/g, 'ларпов'],
	[/TARKOV/g, 'LARPOV'],
	[/Tarkov/g, 'Larpov'],
	[/tarkov/g, 'larpov'],
	[/\bBSG\b/g, 'BSQ'],
	[/\bEFT\b/g, 'EFL']
]

/* Узлы, внутри которых текст трогать нельзя: это код, стили или ввод. */
const SKIP_TAGS = new Set([
	'SCRIPT',
	'STYLE',
	'CODE',
	'PRE',
	'TEXTAREA',
	'INPUT',
	'SELECT',
	'OPTION',
	'NOSCRIPT',
	'CANVAS',
	'SVG'
])

/* Атрибуты, которые видит пользователь, а значит тоже подлежат ребрендингу. */
const TEXT_ATTRS = ['title', 'aria-label', 'placeholder', 'alt', 'data-label', 'data-title', 'data-tip']

let applied = false
let observer = null
let scheduled = false
const pending = new Set()

/** Чистая замена по таблице. Идемпотентна: «Ларпов» правилам не подходит. */
export function rebrandText(value) {
	if (typeof value !== 'string' || value.length === 0) return value
	let out = value
	for (let i = 0; i < RULES.length; i++) {
		const rule = RULES[i]
		if (rule[0].test(out)) out = out.replace(rule[0], rule[1])
		rule[0].lastIndex = 0
	}
	return out
}

function skipElement(node) {
	if (!node || node.nodeType !== 1) return false
	if (SKIP_TAGS.has(node.tagName)) return true
	/* Визард уже написан на Ларпове — второй проход по нему бесполезен. */
	if (node.getAttribute && node.getAttribute('data-efl-brand') === 'off') return true
	return false
}

function rebrandAttributes(node) {
	if (!node || node.nodeType !== 1 || typeof node.getAttribute !== 'function') return
	for (let i = 0; i < TEXT_ATTRS.length; i++) {
		const name = TEXT_ATTRS[i]
		const cur = node.getAttribute(name)
		if (cur == null || cur === '') continue
		const next = rebrandText(cur)
		if (next !== cur) node.setAttribute(name, next)
	}
}

/**
 * Обход поддерева по текстовым узлам.
 *
 * TreeWalker, а не innerHTML: перезапись разметки убила бы обработчики
 * событий, которые меню навешивает напрямую на свои кнопки.
 */
export function rebrandTree(root) {
	if (!root || typeof document === 'undefined') return 0
	if (root.nodeType === 3) {
		const next = rebrandText(root.nodeValue)
		if (next !== root.nodeValue) {
			root.nodeValue = next
			return 1
		}
		return 0
	}
	if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return 0
	if (skipElement(root)) return 0

	let changed = 0
	if (root.nodeType === 1) rebrandAttributes(root)

	const walker = document.createTreeWalker(root, 0x01 | 0x04, {
		acceptNode(node) {
			if (node.nodeType === 1) {
				return skipElement(node) ? 2 /* REJECT */ : 3 /* SKIP */
			}
			const v = node.nodeValue
			if (!v || v.length < 3) return 3
			return 1 /* ACCEPT */
		}
	})

	const elements = []
	let node = walker.nextNode()
	while (node) {
		const next = rebrandText(node.nodeValue)
		if (next !== node.nodeValue) {
			node.nodeValue = next
			changed++
		}
		if (node.parentElement) elements.push(node.parentElement)
		node = walker.nextNode()
	}

	/* Атрибуты обходим отдельным дешёвым проходом по элементам. */
	if (typeof root.querySelectorAll === 'function') {
		const all = root.querySelectorAll('[title],[aria-label],[placeholder],[alt],[data-label],[data-title],[data-tip]')
		for (let i = 0; i < all.length; i++) {
			if (skipElement(all[i])) continue
			rebrandAttributes(all[i])
		}
	}
	void elements
	return changed
}

function flush() {
	scheduled = false
	const list = Array.from(pending)
	pending.clear()
	for (let i = 0; i < list.length; i++) {
		const node = list[i]
		if (!node || !node.isConnected) continue
		try {
			rebrandTree(node)
		} catch (err) {
			/* один плохой узел не должен глушить весь проход */
		}
	}
}

function schedule(node) {
	if (!node) return
	pending.add(node)
	if (scheduled) return
	scheduled = true
	if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush)
	else setTimeout(flush, 16)
}

/**
 * Ставит проход и держит его: меню перерисовывает свой DOM целиком, поэтому
 * одного разового прохода по document мало.
 */
export function applyBranding() {
	if (applied || typeof document === 'undefined') return false
	applied = true

	const run = () => {
		try {
			if (document.title) document.title = rebrandText(document.title)
			rebrandTree(document.body || document.documentElement)
		} catch (err) {
			if (typeof console !== 'undefined') console.warn('[EFL/brand] первый проход не прошёл', err)
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', run, { once: true })
	} else {
		run()
	}

	if (typeof MutationObserver !== 'function') return true

	observer = new MutationObserver((records) => {
		for (let i = 0; i < records.length; i++) {
			const rec = records[i]
			if (rec.type === 'characterData') {
				schedule(rec.target.parentElement || rec.target)
				continue
			}
			if (rec.type === 'attributes') {
				schedule(rec.target)
				continue
			}
			const added = rec.addedNodes
			for (let k = 0; k < added.length; k++) schedule(added[k])
		}
	})

	const attach = () => {
		const root = document.body || document.documentElement
		if (!root) return
		observer.observe(root, {
			subtree: true,
			childList: true,
			characterData: true,
			attributes: true,
			attributeFilter: TEXT_ATTRS
		})
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true })
	else attach()

	return true
}

export function stopBranding() {
	if (observer) observer.disconnect()
	observer = null
	applied = false
	pending.clear()
	return true
}

export default applyBranding
