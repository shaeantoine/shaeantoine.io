import { on } from './shared/EventBus.js';
import { validateWork } from './content/schema.js';
import { works } from './content/works/index.js';
import { createFragmentState } from './state/fragmentState.js';
import { renderPiece } from './ui/PieceView.js';
import { renderGrid } from './grid/GridView.js';
import { computeExpandTransform } from './transitions/tileTransition.js';

works.forEach(({ work }) => validateWork(work));

const STEP_ANIMATION_MS = 420;
const FADE_MS = 600;
const DEFAULT_TITLE = 'Shae McKenna — The Collection';

const gridEl = document.getElementById('grid');
const cloneEl = document.getElementById('tile-clone');
const canvas = document.getElementById('artwork-canvas');
const fragmentEl = document.getElementById('fragment');
const enterButton = document.getElementById('enter-piece');
const pieceEl = document.getElementById('piece');
const closeButton = document.getElementById('close-work');

let currentView = null; // 'grid' | 'work' | null (nothing mounted yet)
let currentWork = null; // { id, artwork, offInteract, enterPiece }
let gridOrigin = null; // { workId, rect, imageSrc } — the tile a Work was entered from
let pendingEnter = null; // { rect, imageSrc } captured synchronously on tile click

function findEntry(id) {
    return works.find(({ work }) => work.id === id);
}

function parseHash() {
    const match = window.location.hash.match(/^#\/work\/(.+)$/);
    if (match && findEntry(match[1])) {
        return { view: 'work', id: match[1] };
    }
    return { view: 'grid' };
}

function playTransform(fromTransform, toTransform, imageSrc) {
    cloneEl.src = imageSrc;
    cloneEl.hidden = false;
    const animation = cloneEl.animate(
        [
            { transform: `translate(${fromTransform.translateX}px, ${fromTransform.translateY}px) scale(${fromTransform.scaleX}, ${fromTransform.scaleY})` },
            { transform: `translate(${toTransform.translateX}px, ${toTransform.translateY}px) scale(${toTransform.scaleX}, ${toTransform.scaleY})` }
        ],
        { duration: STEP_ANIMATION_MS, easing: 'ease-in-out' }
    );
    return animation.finished.then(() => {
        cloneEl.hidden = true;
    });
}

const IDENTITY_TRANSFORM = { scaleX: 1, scaleY: 1, translateX: 0, translateY: 0 };

function playStepIn({ rect, imageSrc }) {
    const from = computeExpandTransform(rect, { width: window.innerWidth, height: window.innerHeight });
    return playTransform(from, IDENTITY_TRANSFORM, imageSrc);
}

function playStepOut({ rect, imageSrc }) {
    const to = computeExpandTransform(rect, { width: window.innerWidth, height: window.innerHeight });
    return playTransform(IDENTITY_TRANSFORM, to, imageSrc);
}

/**
 * Fallback for leaving a Work when there's no grid-origin tile to shrink
 * back into (arrived via a direct connection jump, or a deep link/reload
 * straight into #/work/:id) — a simple opacity crossfade instead.
 */
function fadeOutWork() {
    const activeEl = pieceEl.hidden ? canvas : pieceEl;
    if (activeEl === pieceEl) {
        pieceEl.classList.remove('visible');
    } else {
        canvas.style.opacity = '0';
    }
    return new Promise((resolve) => setTimeout(resolve, FADE_MS));
}

function mountGrid() {
    renderGrid(gridEl, works.map(({ work }) => work), {
        onEnter(id, tileEl) {
            const img = tileEl.querySelector('.tile-preview');
            pendingEnter = {
                rect: (img ?? tileEl).getBoundingClientRect(),
                imageSrc: img?.src ?? ''
            };
            window.location.hash = `#/work/${id}`;
        }
    });
    gridEl.hidden = false;
    currentView = 'grid';
}

function unmountGrid() {
    gridEl.hidden = true;
    gridEl.innerHTML = '';
    currentView = null;
}

function mountWork(id) {
    const entry = findEntry(id);
    const work = entry.work;
    const fragmentState = createFragmentState(work.fragments);
    const artwork = new entry.Artwork(canvas);

    const offInteract = on('artwork:interact', ({ targetId }) => {
        const fragment = fragmentState.reveal(targetId);
        if (!fragment) return;
        fragmentEl.textContent = fragment.text;
        fragmentEl.hidden = false;
    });

    function enterPiece() {
        artwork.setVisible(false);
        canvas.hidden = true;
        fragmentEl.hidden = true;
        enterButton.hidden = true;
        renderPiece(pieceEl, work);
        pieceEl.hidden = false;
        requestAnimationFrame(() => pieceEl.classList.add('visible'));
    }

    enterButton.addEventListener('click', enterPiece);
    enterButton.hidden = false;
    canvas.hidden = false;
    canvas.style.opacity = '0';
    requestAnimationFrame(() => {
        canvas.style.opacity = '1';
    });
    closeButton.hidden = false;
    document.title = work.title;

    currentWork = { id, artwork, offInteract, enterPiece };
    currentView = 'work';
}

function unmountWork() {
    if (!currentWork) return;
    currentWork.artwork.dispose();
    currentWork.offInteract();
    enterButton.removeEventListener('click', currentWork.enterPiece);
    canvas.hidden = true;
    fragmentEl.hidden = true;
    enterButton.hidden = true;
    closeButton.hidden = true;
    pieceEl.hidden = true;
    pieceEl.classList.remove('visible');
    pieceEl.innerHTML = '';
    document.title = DEFAULT_TITLE;
    currentWork = null;
    currentView = null;
}

async function applyRoute(route) {
    if (route.view === 'work') {
        const enteringFromGrid = currentView === 'grid' && pendingEnter;
        const enter = pendingEnter;
        pendingEnter = null;

        if (enteringFromGrid) {
            gridOrigin = { workId: route.id, rect: enter.rect, imageSrc: enter.imageSrc };
            await playStepIn(enter);
            unmountGrid();
        } else if (currentView === 'work' && currentWork?.id !== route.id) {
            gridOrigin = null;
            unmountWork();
        }

        if (!currentWork || currentWork.id !== route.id) {
            mountWork(route.id);
        }
    } else {
        if (currentView === 'work') {
            const origin = gridOrigin?.workId === currentWork?.id ? gridOrigin : null;
            if (origin) {
                await playStepOut(origin);
            } else {
                await fadeOutWork();
            }
            unmountWork();
            gridOrigin = null;
        }
        if (currentView !== 'grid') {
            mountGrid();
        }
    }
}

closeButton.addEventListener('click', () => {
    window.location.hash = '#/';
});

window.addEventListener('hashchange', () => {
    applyRoute(parseHash());
});

applyRoute(parseHash());
