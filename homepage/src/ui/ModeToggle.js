import { on, emit } from '../util/EventBus.js';
import { STATES, MODES } from '../state/states.js';

const LABELS = {
    [MODES.GEOGRAPHY]: "enter shae's world",
    [MODES.SHAES_WORLD]: 'return to geography'
};

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
            this.button.disabled =
                state === STATES.MODE_TRANSITIONING || state === STATES.FLYING_TO_FOCUS;
        });
    }
}
