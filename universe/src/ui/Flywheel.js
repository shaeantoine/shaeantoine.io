import { on, emit } from '../util/EventBus.js';
import { STATES } from '../state/states.js';
import { getLandmarks } from '../data/universe.js';

/**
 * Bottom-center cycling navigation for whatever body is currently being
 * orbited (CLUSTER_ORBITING/BODY_ORBITING) or focused within
 * (FLYING_TO_LANDMARK/FOCUSED): a plain ‹/› arrow on either side of a
 * center label. The label stays blank while merely orbiting — it only
 * names a landmark once the arrows have actually been used to land on one
 * (FLYING_TO_LANDMARK/FOCUSED) — so nothing reads as "focused" before the
 * user has taken an action to focus something.
 *
 * Clicking a side button while free-orbiting jumps straight to that
 * landmark (`ui:pickLandmark`) — CameraRig's orbit-sweep fly-to means this
 * reads as "orbit around to reach it" even if the camera starts on the far
 * side of the body. Clicking while already focused instead cycles relative
 * to the current landmark (`ui:cycleLandmark`), reusing the same relative
 * step the focus panel's own prev/next already emit.
 *
 * Rebuilt only when the orbited body actually changes, not on every
 * state:changed — cycling/focusing within the same body just moves the
 * cursor and re-renders the label.
 */
export class Flywheel {
    constructor(rootEl) {
        this.root = rootEl;
        this.root.innerHTML = `
            <button class="flywheel-prev" type="button" aria-label="Previous">‹</button>
            <span class="flywheel-current"></span>
            <button class="flywheel-next" type="button" aria-label="Next">›</button>
        `;
        this.prevBtn = this.root.querySelector('.flywheel-prev');
        this.currentEl = this.root.querySelector('.flywheel-current');
        this.nextBtn = this.root.querySelector('.flywheel-next');

        this._bodyId = null;
        this._landmarks = [];
        this._cursorIndex = 0;
        this._focused = false;

        this.prevBtn.addEventListener('click', () => this._step(-1));
        this.nextBtn.addEventListener('click', () => this._step(1));

        on('state:changed', ({ state, selectedBodyId, focusTarget }) => {
            if (state === STATES.CLUSTER_ORBITING || state === STATES.BODY_ORBITING) {
                this._rebuild(selectedBodyId);
                this._focused = false;
                this._render();
            } else if (state === STATES.FLYING_TO_LANDMARK || state === STATES.FOCUSED) {
                this._focused = true;
                if (focusTarget) {
                    const index = this._landmarks.findIndex((l) => l.id === focusTarget.id);
                    if (index !== -1) this._cursorIndex = index;
                }
                this._render();
            } else {
                this._rebuild(null);
            }
        });
    }

    _rebuild(bodyId) {
        if (bodyId === this._bodyId) return;
        this._bodyId = bodyId;
        this._landmarks = bodyId ? getLandmarks(bodyId) : [];
        this._cursorIndex = 0;
        this._focused = false;
        this.root.hidden = this._landmarks.length === 0;
        this._render();
    }

    _step(dir) {
        if (!this._landmarks.length) return;
        if (this._focused) {
            emit('ui:cycleLandmark', { dir });
            return;
        }
        const nextIndex = (this._cursorIndex + dir + this._landmarks.length) % this._landmarks.length;
        emit('ui:pickLandmark', { landmarkId: this._landmarks[nextIndex].id });
    }

    _render() {
        if (!this._landmarks.length) return;
        this.currentEl.textContent = this._focused ? this._landmarks[this._cursorIndex].label : '';

        // A lone landmark has no meaningful neighbor to cycle to.
        const single = this._landmarks.length <= 1;
        this.prevBtn.hidden = single;
        this.nextBtn.hidden = single;
    }
}
