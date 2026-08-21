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

function buildRelatedRailHtml(connections) {
    if (!connections || connections.length === 0) return '';
    const items = connections
        .map((c) => `<a class="related-rail-item" href="#/work/${c.workId}/read">${c.sentence}</a>`)
        .join('');
    return `<div class="related-rail">${items}</div>`;
}

/**
 * String builder for the full editorial detail page.
 */
export function buildEditorialHtml(work) {
    const { editorial } = work;
    const paragraphsHtml = editorial.body.map((p) => `<p class="editorial-body">${p}</p>`).join('');

    return `
        <button class="editorial-close" type="button" aria-label="Back to collection">&times;</button>
        <h1 class="editorial-title">${work.title}</h1>
        <p class="editorial-credit">${editorial.credit}</p>
        ${buildStatHtml(editorial.stat)}
        ${paragraphsHtml}
        ${buildQuoteHtml(editorial.quote)}
        ${buildBioHtml(editorial.bio)}
        ${buildLinksHtml(editorial.links)}
        ${buildRelatedRailHtml(work.connections)}
    `;
}

/**
 * Renders a Work's full editorial detail into `container` and wires the
 * close control. `onClose` is expected to navigate back to the canvas.
 */
export function renderEditorial(container, work, { onClose }) {
    container.innerHTML = buildEditorialHtml(work);
    container.querySelector('.editorial-close').addEventListener('click', onClose);
}
