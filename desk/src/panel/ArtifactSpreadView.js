import { CATEGORY_LABELS } from '../content/schema.js';

/**
 * The hardware object's editorial spread: the project's text set as a column
 * beside the object rather than in a panel over it.
 *
 * Real DOM rather than a canvas texture painted into the scene, which is what
 * the design doc asks for ("on-object labels rendered as HTML overlays, not
 * baked into the 3D textures — keeps text crisp and accessible regardless of
 * render quality or device"). The practical difference is large: the type
 * stays sharp at any pixel ratio, it can be selected and read by a screen
 * reader, and the links are real links rather than painted glyphs that only
 * look like them.
 */

function buildMetaHtml(work) {
    const parts = [work.editorial.credit, work.date].filter(Boolean);
    if (parts.length === 0) return '';
    return `<p class="spread-meta">${parts.join(' · ')}</p>`;
}

function buildStatHtml(stat) {
    if (!stat) return '';
    return `
        <p class="spread-stat">
            <span class="spread-stat-value">${stat.value}</span>
            <span class="spread-stat-label">${stat.label}</span>
        </p>`;
}

function buildQuoteHtml(quote) {
    if (!quote) return '';
    return `
        <blockquote class="spread-quote">
            <p>${quote.text}</p>
            <cite>${quote.attribution}</cite>
        </blockquote>`;
}

function buildLinksHtml(links) {
    if (!links || links.length === 0) return '';
    const items = links
        .map((link) => `<a class="spread-link" href="${link.href}">${link.label}</a>`)
        .join('');
    return `<div class="spread-links">${items}</div>`;
}

function buildConnectionsHtml(connections) {
    if (!connections || connections.length === 0) return '';
    const items = connections
        .map((connection) => `<button class="spread-connection" type="button" data-work-id="${connection.workId}">${connection.sentence}</button>`)
        .join('');
    return `<div class="spread-connections">${items}</div>`;
}

/**
 * @param {object} work
 * @param {{index: number, total: number}} position
 */
export function buildArtifactSpreadHtml(work, { index, total }) {
    const { editorial } = work;
    const kicker = CATEGORY_LABELS[work.category] ?? work.category;
    // The arrows already say whether there's more in either direction, but not
    // how much — and with one object on the desk at a time, nothing else does.
    const counter = total > 1 ? `<span class="spread-count">${index + 1} / ${total}</span>` : '';

    return `
        <p class="spread-eyebrow">${kicker}${counter}</p>
        <h2 class="spread-title">${work.title}</h2>
        ${buildMetaHtml(work)}
        <hr class="spread-rule">
        <div class="spread-body">${editorial.body.map((paragraph) => `<p>${paragraph}</p>`).join('')}</div>
        ${buildStatHtml(editorial.stat)}
        ${buildQuoteHtml(editorial.quote)}
        ${buildLinksHtml(editorial.links)}
        ${buildConnectionsHtml(work.connections)}
    `;
}

/**
 * Renders a Work into the spread and wires its connection chips. The
 * crossfade between projects is the caller's (main.js drives it in step with
 * the object swap), so this only ever paints the new content.
 */
export function renderArtifactSpread(spreadEl, work, indexInfo, { onNavigateToWork }) {
    spreadEl.innerHTML = buildArtifactSpreadHtml(work, indexInfo);
    spreadEl.querySelectorAll('.spread-connection').forEach((chip) => {
        chip.addEventListener('click', () => onNavigateToWork(chip.dataset.workId));
    });
}
