import { works } from './content/works/index.js';
import { validateWork } from './content/schema.js';
import { renderCanvas } from './canvas/CanvasView.js';
import { renderModal } from './modal/ModalView.js';
import { renderEditorial } from './editorial/EditorialView.js';
import { computeExpandTransform } from './transitions/tileTransition.js';

works.forEach((work) => validateWork(work));

const MODAL_ANIMATION_MS = 350;
const HEADER_SCROLL_THRESHOLD_PX = 40;
const DEFAULT_TITLE = "Shae McKenna's Collection";

const headerEl = document.getElementById('site-header');
const canvasEl = document.getElementById('canvas');
const loadingVeilEl = document.getElementById('loading-veil');
const modalOverlayEl = document.getElementById('modal-overlay');
const modalPanelEl = document.getElementById('modal-panel');
const editorialEl = document.getElementById('editorial');
const cursorRingEl = document.getElementById('cursor-ring');

let currentModalWorkId = null;
let currentEditorialWorkId = null;
let canvasMounted = false;
let modalOrigin = null; // { rect } of the node a modal was opened from, for the origin-anchored transition

function findWork(id) {
    return works.find((work) => work.id === id);
}

function parseHash() {
    const readMatch = window.location.hash.match(/^#\/work\/(.+)\/read$/);
    if (readMatch && findWork(readMatch[1])) {
        return { view: 'editorial', id: readMatch[1] };
    }
    const modalMatch = window.location.hash.match(/^#\/work\/(.+)$/);
    if (modalMatch && findWork(modalMatch[1])) {
        return { view: 'modal', id: modalMatch[1] };
    }
    return { view: 'canvas' };
}

function onCanvasScroll() {
    headerEl.classList.toggle('scrolled', canvasEl.scrollTop > HEADER_SCROLL_THRESHOLD_PX);
}

function mountCanvas() {
    if (canvasMounted) return;
    renderCanvas(canvasEl, works, {
        onEnter(id, nodeEl) {
            modalOrigin = { rect: nodeEl.getBoundingClientRect() };
            window.location.hash = `#/work/${id}`;
        }
    });
    canvasEl.hidden = false;
    headerEl.hidden = false;
    onCanvasScroll();
    canvasEl.addEventListener('scroll', onCanvasScroll);
    canvasMounted = true;
}

function unmountCanvas() {
    if (!canvasMounted) return;
    canvasEl.removeEventListener('scroll', onCanvasScroll);
    canvasEl.hidden = true;
    headerEl.hidden = true;
    headerEl.classList.remove('scrolled');
    canvasMounted = false;
}

function applyModalOriginTransform(fromRect) {
    if (!fromRect) return;
    const panelRect = modalPanelEl.getBoundingClientRect();
    const transform = computeExpandTransform(fromRect, { width: panelRect.width, height: panelRect.height });
    modalPanelEl.style.transformOrigin = 'center center';
    modalPanelEl.animate(
        [
            { transform: `translate(${transform.translateX}px, ${transform.translateY}px) scale(${transform.scaleX}, ${transform.scaleY})`, opacity: 0.4 },
            { transform: 'translate(0, 0) scale(1, 1)', opacity: 1 }
        ],
        { duration: MODAL_ANIMATION_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
    );
}

function openModal(id) {
    const work = findWork(id);
    modalOverlayEl.hidden = false;
    modalPanelEl.hidden = false;
    renderModal(modalPanelEl, work, {
        onClose() {
            window.location.hash = '#/';
        }
    });
    requestAnimationFrame(() => {
        modalOverlayEl.classList.add('visible');
        applyModalOriginTransform(modalOrigin?.rect ?? null);
    });
    document.title = work.title;
    currentModalWorkId = id;
}

function closeModal() {
    if (!currentModalWorkId) return;
    modalOverlayEl.classList.remove('visible');
    setTimeout(() => {
        modalOverlayEl.hidden = true;
        modalPanelEl.hidden = true;
        modalPanelEl.innerHTML = '';
    }, MODAL_ANIMATION_MS);
    document.title = DEFAULT_TITLE;
    currentModalWorkId = null;
    modalOrigin = null;
}

function mountEditorial(id) {
    const work = findWork(id);
    unmountCanvas();
    renderEditorial(editorialEl, work, {
        onClose() {
            window.location.hash = '#/';
        }
    });
    editorialEl.hidden = false;
    document.title = work.title;
    currentEditorialWorkId = id;
}

function unmountEditorial() {
    if (!currentEditorialWorkId) return;
    editorialEl.hidden = true;
    editorialEl.innerHTML = '';
    document.title = DEFAULT_TITLE;
    currentEditorialWorkId = null;
}

function applyRoute(route) {
    if (route.view === 'editorial') {
        if (currentModalWorkId) closeModal();
        if (!currentEditorialWorkId || currentEditorialWorkId !== route.id) {
            unmountEditorial();
            mountEditorial(route.id);
        }
        return;
    }

    if (currentEditorialWorkId) {
        unmountEditorial();
        mountCanvas();
    }

    if (route.view === 'modal') {
        mountCanvas();
        if (!currentModalWorkId || currentModalWorkId !== route.id) {
            if (currentModalWorkId) closeModal();
            openModal(route.id);
        }
        return;
    }

    if (currentModalWorkId) closeModal();
    mountCanvas();
}

function initCursorRing() {
    const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
    if (isCoarsePointer) return;

    cursorRingEl.hidden = false;
    window.addEventListener('pointermove', (event) => {
        cursorRingEl.style.left = `${event.clientX}px`;
        cursorRingEl.style.top = `${event.clientY}px`;
    });
    document.addEventListener('pointerover', (event) => {
        cursorRingEl.classList.toggle('expanded', Boolean(event.target.closest('a, button')));
    });
}

modalOverlayEl.addEventListener('click', (event) => {
    if (event.target === modalOverlayEl) window.location.hash = '#/';
});

window.addEventListener('hashchange', () => {
    applyRoute(parseHash());
});

initCursorRing();
applyRoute(parseHash());

requestAnimationFrame(() => {
    loadingVeilEl.classList.add('fading');
    setTimeout(() => { loadingVeilEl.hidden = true; }, 400);
});
