const ASPECT_ROW_SPAN = {
    wide: 20,
    square: 28,
    tall: 40
};

const MAX_TILT_DEG = 4;
const PROXIMITY_RADIUS_PX = 220;

/**
 * String builder for the spatial canvas of Work nodes.
 */
export function buildCanvasHtml(works) {
    return works.map((work) => {
        const rowSpan = ASPECT_ROW_SPAN[work.previewAspect] ?? ASPECT_ROW_SPAN.square;
        return `
        <button class="canvas-node" type="button" data-work-id="${work.id}" style="grid-row-end: span ${rowSpan};">
            <img class="canvas-node-preview" src="${work.previewImage}" alt="${work.title}" />
            <div class="canvas-node-label">
                <span class="canvas-node-title">${work.title}</span>
                <span class="canvas-node-blurb">${work.blurb}</span>
            </div>
        </button>`;
    }).join('');
}

function applyProximityTilt(container, event) {
    container.querySelectorAll('.canvas-node').forEach((node) => {
        const rect = node.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dx = event.clientX - centerX;
        const dy = event.clientY - centerY;
        const distance = Math.hypot(dx, dy);

        if (distance > PROXIMITY_RADIUS_PX) {
            node.style.transform = '';
            return;
        }

        const proximity = 1 - distance / PROXIMITY_RADIUS_PX;
        const tiltX = (dy / rect.height) * MAX_TILT_DEG * proximity;
        const tiltY = (dx / rect.width) * -MAX_TILT_DEG * proximity;
        node.style.transform = `perspective(800px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
    });
}

/**
 * Mounts the spatial canvas into `container` and wires node interaction and
 * pointer-proximity tilt. For Coarse (touch) pointers the tilt is skipped
 * entirely and a tap directly calls `onEnter`
 */
export function renderCanvas(container, works, { onEnter }) {
    container.innerHTML = buildCanvasHtml(works);

    const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
    if (!isCoarsePointer) {
        container.addEventListener('pointermove', (event) => applyProximityTilt(container, event));
        container.addEventListener('pointerleave', () => {
            container.querySelectorAll('.canvas-node').forEach((node) => { node.style.transform = ''; });
        });
    }

    container.querySelectorAll('.canvas-node').forEach((node) => {
        node.addEventListener('click', () => onEnter(node.dataset.workId, node));
    });
}
