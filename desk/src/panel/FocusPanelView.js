import { CATEGORY_LABELS } from '../content/schema.js';

function buildStatHtml(stat) {
    if (!stat) return '';
    return `
        <div class="stat-block">
            <span class="stat-value">${stat.value}</span>
            <span class="stat-label">${stat.label}</span>
        </div>`;
}

function buildQuoteHtml(quote) {
    if (!quote) return '';
    return `
        <blockquote class="quote-block">
            <p>${quote.text}</p>
            <cite>${quote.attribution}</cite>
        </blockquote>`;
}

function buildBioHtml(bio) {
    if (!bio) return '';
    return `<div class="bio-card">${bio}</div>`;
}

function buildLinksHtml(links) {
    if (!links || links.length === 0) return '';
    const items = links.map((link) => `<a class="link-pill" href="${link.href}">${link.label}</a>`).join('');
    return `<div class="link-row">${items}</div>`;
}

function buildConnectionsHtml(connections) {
    if (!connections || connections.length === 0) return '';
    const items = connections
        .map((c) => `<button class="connection-chip" type="button" data-work-id="${c.workId}">${c.sentence}</button>`)
        .join('');
    return `<div class="connection-row">${items}</div>`;
}

/**
 * String builder for the in-scene focus panel. Unlike the retired
 * EditorialView, this always includes prev/next arrows and an index
 * readout, and connections render as buttons (data-work-id) that trigger
 * cross-object navigation instead of anchors to a retired page route.
 */
export function buildFocusPanelHtml(work, { index, total }) {
    const { editorial } = work;
    const paragraphsHtml = editorial.body.map((p) => `<p class="editorial-body">${p}</p>`).join('');
    const kicker = CATEGORY_LABELS[work.category] ?? work.category;
    const prevDisabled = index === 0 ? 'disabled' : '';
    const nextDisabled = index === total - 1 ? 'disabled' : '';

    return `
        <button class="focus-panel-close" type="button" aria-label="Exit focus">&times;</button>
        <button class="focus-arrow" type="button" data-arrow="prev" ${prevDisabled} aria-label="Previous">&lsaquo;</button>
        <button class="focus-arrow" type="button" data-arrow="next" ${nextDisabled} aria-label="Next">&rsaquo;</button>
        <div class="focus-panel-scroll">
            <p class="editorial-kicker">${kicker}</p>
            <p class="focus-index">${index + 1} / ${total}</p>
            <h1 class="editorial-title">${work.title}</h1>
            <p class="editorial-credit">${editorial.credit}</p>
            ${buildStatHtml(editorial.stat)}
            ${paragraphsHtml}
            ${buildQuoteHtml(editorial.quote)}
            ${buildBioHtml(editorial.bio)}
            ${buildLinksHtml(editorial.links)}
            ${buildConnectionsHtml(work.connections)}
        </div>
    `;
}

/**
 * Renders a Work into the focus panel and wires arrows/close/connection
 * chips. Content-swap animation on next/prev is driven by the caller
 * (FocusController), not here — this just re-renders the new HTML.
 */
export function renderFocusPanel(panelEl, work, indexInfo, { onNext, onPrev, onNavigateToWork, onClose }) {
    panelEl.innerHTML = buildFocusPanelHtml(work, indexInfo);
    panelEl.querySelector('.focus-panel-close').addEventListener('click', onClose);
    panelEl.querySelector('[data-arrow="next"]').addEventListener('click', onNext);
    panelEl.querySelector('[data-arrow="prev"]').addEventListener('click', onPrev);
    panelEl.querySelectorAll('.connection-chip').forEach((chip) => {
        chip.addEventListener('click', () => onNavigateToWork(chip.dataset.workId));
    });
}
