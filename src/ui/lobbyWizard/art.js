/* ==========================================================================
 * Escape-From-Larpov · src/ui/lobbyWizard/art.js
 *
 * Процедурная графика визарда и мелкие DOM-хелперы.
 *
 * Ни одного внешнего ассета и ни одного CDN: силуэт оперативника,
 * превью локаций, фон высадки и все иконки рисуются инлайновым SVG по
 * палитре из каталога. Геометрия детерминированная — Math.random() запрещён
 * ARCHITECTURE.md, поэтому разброс строится на целочисленных остатках.
 * ========================================================================== */

import { NS } from './style.js'

/* ---------------------------------------------------------------- хелперы */

/** Элемент с классом и текстом. Текст идёт через textContent, не через innerHTML. */
export function el(tag, cls, text) {
	const node = document.createElement(tag)
	if (cls) node.className = cls
	if (text != null) node.textContent = text
	return node
}

/** Кнопка с type=button, чтобы никогда не сабмитить родительскую форму. */
export function button(cls, text, onClick) {
	const node = el('button', cls, text)
	node.type = 'button'
	if (typeof onClick === 'function') node.addEventListener('click', onClick)
	return node
}

/** Парсит SVG-разметку в живой узел. Вся разметка — наша, без ввода извне. */
export function svg(markup) {
	const holder = document.createElement('div')
	holder.innerHTML = markup
	return holder.firstElementChild
}

/** Безопасный вызов чужого метода: отсутствующий хук — это не ошибка. */
export function call(target, method) {
	if (!target || typeof target[method] !== 'function') return undefined
	const args = Array.prototype.slice.call(arguments, 2)
	try {
		return target[method].apply(target, args)
	} catch (err) {
		if (typeof console !== 'undefined') console.warn('[EFL/lobby] ' + method + '() упал', err)
		return undefined
	}
}

/* ------------------------------------------------------------------ силуэт */

/**
 * Полноростовый силуэт оперативника для шагов 1 и 4.
 * Свет идёт слева (rim-градиент), корпус обьёмный за счёт вертикального
 * градиента и drop-shadow в CSS.
 */
export function silhouetteSvg(factionId, accent) {
	const uid = 'lw' + factionId
	const gun = factionId === 'scav'
		? "<path d='M92 150 L188 138 L188 150 L150 156 L150 166 L136 166 L136 158 L92 162 Z' fill='#0d0f10' opacity='.92'/>" +
		  "<rect x='120' y='166' width='10' height='26' fill='#0d0f10' opacity='.92'/>"
		: "<path d='M96 146 L196 132 L196 146 L156 152 L156 164 L140 164 L140 154 L96 158 Z' fill='#0d0f10' opacity='.92'/>" +
		  "<rect x='124' y='164' width='11' height='30' fill='#0d0f10' opacity='.92'/>" +
		  "<rect x='168' y='125' width='26' height='6' fill='#0d0f10' opacity='.9'/>"
	return "<svg viewBox='0 0 260 620' xmlns='http://www.w3.org/2000/svg' role='img' aria-label='силуэт оперативника'>" +
		"<defs>" +
		"<linearGradient id='" + uid + "body' x1='0' y1='0' x2='0' y2='1'>" +
		"<stop offset='0' stop-color='#3b3f44'/><stop offset='.45' stop-color='#23262a'/><stop offset='1' stop-color='#101214'/>" +
		"</linearGradient>" +
		"<linearGradient id='" + uid + "rim' x1='0' y1='0' x2='1' y2='0'>" +
		"<stop offset='0' stop-color='" + accent + "' stop-opacity='.8'/><stop offset='.38' stop-color='" + accent + "' stop-opacity='0'/>" +
		"</linearGradient>" +
		"</defs>" +
		"<g fill='url(#" + uid + "body)'>" +
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
		"<rect x='104' y='140' width='52' height='13' fill='" + accent + "' opacity='.32'/>" +
		"<rect x='104' y='160' width='38' height='11' fill='" + accent + "' opacity='.2'/>" +
		"<ellipse cx='130' cy='54' rx='24' ry='15' fill='#0e1113' opacity='.85'/>" +
		"<path d='M86 116 L174 116 L178 150 L82 150 Z' fill='url(#" + uid + "rim)'/>" +
		gun +
		"</svg>"
}

/* ------------------------------------------------------------- превью карт */

function skyline(palette, count, width, base) {
	let out = ''
	for (let i = 0; i < count; i++) {
		const x = 8 + i * width
		const h = 40 + ((i * 53) % 58)
		out += "<rect x='" + x + "' y='" + (base - h) + "' width='" + (width - 8) + "' height='" + h + "' fill='" + palette[1] + "' opacity='.88'/>"
		out += "<rect x='" + (x + 5) + "' y='" + (base - h + 6) + "' width='5' height='5' fill='" + palette[2] + "' opacity='.5'/>"
		out += "<rect x='" + (x + 15) + "' y='" + (base - h + 16) + "' width='5' height='5' fill='" + palette[2] + "' opacity='.32'/>"
	}
	return out
}

function treeline(palette, count, width, base) {
	let out = ''
	for (let i = 0; i < count; i++) {
		const x = 12 + i * width
		const h = 34 + ((i * 37) % 42)
		out += "<path d='M" + x + ' ' + (base - h) + ' L' + (x + 13) + ' ' + base + ' L' + (x - 13) + ' ' + base + " Z' fill='" + palette[1] + "' opacity='.85'/>"
	}
	return out
}

/** Превью-бокс локации (16:9), впрыскивается при клике на карточку. */
export function mapThumbSvg(map) {
	const p = map.palette
	const uid = 'lwT' + map.id
	const shapes = map.kind === 'nature'
		? treeline(p, 11, 26, 150)
		: skyline(p, 8, 34, 150)
	return "<svg viewBox='0 0 280 158' xmlns='http://www.w3.org/2000/svg' role='img' aria-label='превью локации'>" +
		"<defs><linearGradient id='" + uid + "' x1='0' y1='0' x2='0' y2='1'>" +
		"<stop offset='0' stop-color='" + p[0] + "'/><stop offset='1' stop-color='" + p[1] + "'/>" +
		"</linearGradient></defs>" +
		"<rect width='280' height='158' fill='url(#" + uid + ")'/>" +
		"<circle cx='232' cy='34' r='15' fill='" + p[2] + "' opacity='.3'/>" +
		shapes +
		"<rect y='150' width='280' height='8' fill='" + p[1] + "'/>" +
		"<rect width='280' height='158' fill='none' stroke='rgba(0,0,0,.55)' stroke-width='2'/>" +
		"</svg>"
}

/** Широкий фон экрана высадки: та же палитра, другой масштаб. */
export function deployBackdropSvg(map) {
	const p = map.palette
	const uid = 'lwD' + map.id
	const shapes = map.kind === 'nature'
		? treeline(p, 26, 38, 560)
		: skyline(p, 20, 50, 560)
	return "<svg viewBox='0 0 1000 600' preserveAspectRatio='xMidYMax slice' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'>" +
		"<defs><linearGradient id='" + uid + "' x1='0' y1='0' x2='0' y2='1'>" +
		"<stop offset='0' stop-color='" + p[0] + "'/><stop offset='1' stop-color='" + p[1] + "'/>" +
		"</linearGradient></defs>" +
		"<rect width='1000' height='600' fill='url(#" + uid + ")'/>" +
		"<circle cx='820' cy='120' r='54' fill='" + p[2] + "' opacity='.22'/>" +
		shapes +
		"<rect y='560' width='1000' height='40' fill='" + p[1] + "'/>" +
		"</svg>"
}

/* ------------------------------------------------------------------ иконки */

const STROKE = "fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' aria-hidden='true'"

export function gearIcon() {
	return "<svg viewBox='0 0 24 24' " + STROKE + ">" +
		"<circle cx='12' cy='12' r='3.2'/>" +
		"<path d='M12 3.6v2.2M12 18.2v2.2M4.6 12H2.4M21.6 12h-2.2M6.7 6.7 5.2 5.2M18.8 18.8l-1.5-1.5M17.3 6.7l1.5-1.5M5.2 18.8l1.5-1.5'/>" +
		"</svg>"
}

export function clockIcon() {
	return "<svg viewBox='0 0 24 24' " + STROKE + "><circle cx='12' cy='12' r='8.4'/><path d='M12 7.2V12l3.4 2.1'/></svg>"
}

export function peopleIcon() {
	return "<svg viewBox='0 0 24 24' " + STROKE + ">" +
		"<circle cx='9' cy='8' r='3.1'/><path d='M3.4 19.4c0-3.1 2.5-5.6 5.6-5.6s5.6 2.5 5.6 5.6'/>" +
		"<circle cx='17.4' cy='8.6' r='2.4'/><path d='M16 13.9c2.6-.3 4.7 1.7 4.7 4.3'/></svg>"
}

export function gridIcon() {
	return "<svg viewBox='0 0 24 24' " + STROKE + ">" +
		"<rect x='3.4' y='3.4' width='7' height='7'/><rect x='13.6' y='3.4' width='7' height='7'/>" +
		"<rect x='3.4' y='13.6' width='7' height='7'/><rect x='13.6' y='13.6' width='7' height='7'/></svg>"
}

export function sunIcon() {
	return "<svg viewBox='0 0 24 24' " + STROKE + ">" +
		"<circle cx='12' cy='12' r='4.2'/>" +
		"<path d='M12 2.6v2.4M12 19v2.4M2.6 12H5M19 12h2.4M5.6 5.6 7.3 7.3M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7'/>" +
		"</svg>"
}

export function moonIcon() {
	return "<svg viewBox='0 0 24 24' " + STROKE + "><path d='M20 14.4A8.4 8.4 0 0 1 9.6 4a8.4 8.4 0 1 0 10.4 10.4Z'/></svg>"
}

export function alertIcon() {
	return "<svg class='" + NS + "-warn-i' viewBox='0 0 24 24' " + STROKE + ">" +
		"<path d='M12 3.2 22 20.4H2Z'/><path d='M12 9.4v5'/><circle cx='12' cy='17.4' r='.9' fill='currentColor'/></svg>"
}

/** Иконка погоды для статус-бара шага 4 и карточек времени. */
export function daylightIcon(night) {
	return night ? moonIcon() : sunIcon()
}
