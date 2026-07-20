import { on, emit } from '../util/EventBus.js';
import { STATES, MODES } from '../state/states.js';

const LABELS = {
    [MODES.GEOGRAPHY]: "enter shae's world",
    [MODES.SHAES_WORLD]: 'return to geography'
};

// Only meaningful while inside Earth's cluster — hidden everywhere else
// (the solar view, or another planet's panel) since there's nothing there
// to toggle a mode on. Also hidden during SLOT_FOCUSED: the button shares
// the bottom-right corner with the open Sidebar, and toggling mode while a
// specific country's content is showing isn't a meaningful action anyway
// (WorldStateMachine collapses back to CLUSTER_ORBITING first regardless).
const INSIDE_CLUSTER_STATES = new Set([
    STATES.CLUSTER_ORBITING,
    STATES.FLYING_TO_SLOT,
    STATES.MODE_TRANSITIONING
]);

/**
 * The mode-toggle button. Purely presentational — emits 'ui:toggleMode' and
 * lets WorldStateMachine decide whether the toggle is actually honored right
 * now. Disabled while a transition is already in flight, per the plan's
 * guard against re-entrant/mashed toggles.
 */
export class ModeToggle {
    constructor(buttonEl) {
        this.button = buttonEl;
        this.button.addEventListener('click', () => emit('ui:toggleMode', {}));

        on('state:changed', ({ state, mode }) => {
            this.button.textContent = LABELS[mode];
            this.button.hidden = !INSIDE_CLUSTER_STATES.has(state);
            this.button.disabled = state === STATES.MODE_TRANSITIONING || state === STATES.FLYING_TO_SLOT;
        });
    }
}
