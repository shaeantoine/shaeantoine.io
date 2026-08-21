const ASPECT_ROW_SPAN = {
    wide: 20,
    square: 28,
    tall: 40
};

/**
 * String builder for the grid of Work tiles
 */
export function buildGridHtml(works) {
    return works.map((work) => {
        const rowSpan = ASPECT_ROW_SPAN[work.previewAspect] ?? ASPECT_ROW_SPAN.square;
        return `
        <button class="tile" type="button" data-work-id="${work.id}" style="grid-row-end: span ${rowSpan};">
            <img class="tile-preview" src="${work.previewImage}" alt="${work.title}" />
            <div class="tile-overlay">
                <h2>${work.title}</h2>
                <p>${work.blurb}</p>
            </div>
        </button>`;
    }).join('');
}

/**
 * Mounts the grid into `container` and wires tile interaction.
 * On coarse (touch) pointers, the first tap reveals a tile's overlay; a
 * second tap on an already-revealed tile calls `onEnter`. On fine pointers
 * (mouse), hover reveals the overlay via CSS and any click calls `onEnter`.
 */
export function renderGrid(container, works, { onEnter }) {
    container.innerHTML = buildGridHtml(works);

    container.querySelectorAll('.tile').forEach((tile) => {
        tile.addEventListener('click', (event) => {
            const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
            if (isCoarsePointer && !tile.classList.contains('revealed')) {
                event.preventDefault();
                tile.classList.add('revealed');
                return;
            }
            onEnter(tile.dataset.workId, tile);
        });
    });
}
