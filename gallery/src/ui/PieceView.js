/**
 * Pure string builder
 */
export function buildPieceHtml(work) {
    const paragraphsHtml = work.piece.paragraphs.map((p) => `<p>${p}</p>`).join('');
    const connectionsHtml = work.connections
        .map((c) => `<a href="#/work/${c.workId}">${c.sentence}</a>`)
        .join('');

    return `
        <h1>${work.piece.heading}</h1>
        ${paragraphsHtml}
        <div class="connections">${connectionsHtml}</div>
    `;
}

/**
 * Renders a Work's full piece into the given container.
 */
export function renderPiece(container, work) {
    container.innerHTML = buildPieceHtml(work);
}
