import { on, emit } from '../util/EventBus.js';
import { STATES } from '../state/states.js';

const VISIBLE_STATES = new Set([STATES.CLUSTER_ORBITING, STATES.BODY_ORBITING, STATES.FLYING_TO_LANDMARK, STATES.FOCUSED]);
const DISABLED_STATES = new Set([STATES.FLYING_TO_LANDMARK, STATES.FLYING_TO_PLANET, STATES.RETURNING]);

/**
 * Generalized, two-stage "back" button — every planet gets one (not just
 * Earth, as the old ClusterReturn did), and it mirrors the same two-stage
 * intent as Escape: while a landmark's FocusPanel is open, the first stage
 * just closes it and stays on the body ("← back"); once free-orbiting the
 * body with nothing focused, the second stage leaves it entirely for the
 * solar system ("← solar system"). Escape triggers the exact same
 * `_trigger()` logic via a keydown listener here, so there's a single owner
 * of "what does Escape do right now" instead of splitting it across this
 * button and FocusPanel.
 */
export class NavBack {
    constructor(buttonEl) {
        this.button = buttonEl;
        this._state = null;

        this.button.addEventListener('click', () => this._trigger());
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') this._trigger();
        });

        on('state:changed', ({ state, selectedBodyId }) => {
            this._state = state;
            this.button.hidden = selectedBodyId == null || !VISIBLE_STATES.has(state);
            this.button.disabled = DISABLED_STATES.has(state);
            if (state === STATES.FOCUSED || state === STATES.FLYING_TO_LANDMARK) {
                this.button.textContent = '← back';
            } else if (state === STATES.CLUSTER_ORBITING || state === STATES.BODY_ORBITING) {
                this.button.textContent = '← solar system';
            }
        });
    }

    _trigger() {
        if (this._state === STATES.FOCUSED) {
            emit('ui:sidebarClosed', {});
        } else if (this._state === STATES.CLUSTER_ORBITING || this._state === STATES.BODY_ORBITING) {
            emit('ui:leaveCluster', {});
        }
    }
}
