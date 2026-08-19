import { on, emit } from '../util/EventBus.js';
import { STATES } from '../state/states.js';
import { getBody, getLandmark, getLandmarks } from '../data/universe.js';

// Landmark kinds cyclable via prev/next (arrows or the ‹/› keys) — a slot
// (country island) is picked via the flywheel or 3D click instead, never
// cycled, so it's deliberately excluded.
const CYCLABLE_KINDS = ['satellite', 'core'];

/**
 * The single focused-content panel for a country island (kind 'slot'), a
 * planet's orbiting object (kind 'satellite'), or a 'coreReveal' body's
 * currently-shown object (kind 'core') — merge of the old Sidebar
 * (fixed-edge, no connector) and SatellitePopup (connector-to-object)
 * components, standardized on the former's fixed positioning: a single
 * right-edge dock (see focusPanel.css's `.focus-panel`) rather than a live
 * projection of the focused landmark's world position, so it never overlaps
 * the object it describes and needs no per-frame reprojection or tether back
 * to it.
 *
 * Driven entirely by WorldStateMachine's FOCUSED state + `focusTarget`
 * (`{kind, id, parentBodyId}`) — About Me has no FOCUSED entry
 * point yet (a landmark-less body), so this panel never opens for it in
 * this pass.
 */
export class FocusPanel {
    constructor(rootEl) {
        this.root = rootEl;
        this.root.innerHTML = `
            <button class="focus-panel-close" type="button" aria-label="Close">close ×</button>
            <div class="focus-panel-content"></div>
            <div class="focus-panel-nav" hidden>
                <button class="focus-panel-prev" type="button" aria-label="Previous object">‹ prev</button>
                <button class="focus-panel-next" type="button" aria-label="Next object">next ›</button>
            </div>
        `;
        this.contentEl = this.root.querySelector('.focus-panel-content');
        this.navEl = this.root.querySelector('.focus-panel-nav');

        this.isOpen = false;
        this._kind = null;
        this._bodyId = null;
        this._landmarkId = null;

        this.root.querySelector('.focus-panel-close').addEventListener('click', () => {
            emit('ui:sidebarClosed', {});
        });
        this.root.querySelector('.focus-panel-prev').addEventListener('click', () => {
            emit('ui:cycleLandmark', { dir: -1 });
        });
        this.root.querySelector('.focus-panel-next').addEventListener('click', () => {
            emit('ui:cycleLandmark', { dir: 1 });
        });

        document.addEventListener('keydown', (event) => {
            if (!this.isOpen) return;
            if (!CYCLABLE_KINDS.includes(this._kind)) return;
            if (event.key === 'ArrowLeft') emit('ui:cycleLandmark', { dir: -1 });
            else if (event.key === 'ArrowRight') emit('ui:cycleLandmark', { dir: 1 });
        });

        on('state:changed', ({ state, focusTarget }) => {
            if (state === STATES.FOCUSED && focusTarget) {
                this._show(focusTarget.kind, focusTarget.parentBodyId, focusTarget.id);
            } else {
                this._close();
            }
        });
    }

    _show(kind, bodyId, landmarkId) {
        const landmark = getLandmark(bodyId, landmarkId);
        this._kind = kind;
        this._bodyId = bodyId;
        this._landmarkId = landmarkId;
        this._populate(landmark);
        this.root.hidden = false;
        this._open();
    }

    _populate(landmark) {
        const parentBody = getBody(this._bodyId);
        const accent =
            landmark.accent ?? landmark.skin?.palette?.accent ?? parentBody.renderRecipe.palette?.accent ?? '#ffffff';
        this.root.style.setProperty('--focus-accent', accent);

        const { title, subtitle, body } = landmark.content;
        const bodyHtml = (body || [])
            .map(
                (entry) => `
                <div class="focus-panel-entry">
                    ${entry.period ? `<span class="focus-panel-period">${entry.period}</span>` : ''}
                    <p>${entry.text}</p>
                </div>
            `
            )
            .join('');
        this.contentEl.innerHTML = `
            <h3>${title}</h3>
            ${subtitle ? `<p class="focus-panel-subtitle">${subtitle}</p>` : ''}
            ${bodyHtml}
        `;

        // Cycling is satellite/core-only for now — country slots are picked
        // via the flywheel or 3D click, not cycled — and only when there's
        // actually something to cycle to.
        const siblingCount = getLandmarks(this._bodyId).filter((l) => l.kind === this._kind).length;
        this.navEl.hidden = !CYCLABLE_KINDS.includes(this._kind) || siblingCount <= 1;
    }

    _open() {
        this.isOpen = true;
        requestAnimationFrame(() => {
            this.root.classList.add('open');
        });
    }

    _close() {
        this.isOpen = false;
        this._kind = null;
        this._bodyId = null;
        this._landmarkId = null;
        this.root.classList.remove('open');
    }
}
