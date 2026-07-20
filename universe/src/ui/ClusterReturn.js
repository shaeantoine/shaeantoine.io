import { on, emit } from '../util/EventBus.js';
import { STATES } from '../state/states.js';

// Same "inside Earth's cluster" scope as ModeToggle — visible only there,
// since leaving the cluster is meaningless from the solar view or another
// planet's panel.
const INSIDE_CLUSTER_STATES = new Set([
    STATES.CLUSTER_ORBITING,
    STATES.FLYING_TO_SLOT,
    STATES.SLOT_FOCUSED,
    STATES.MODE_TRANSITIONING
]);

/**
 * The "back to the solar system" button. Purely presentational — emits
 * 'ui:leaveCluster' and lets WorldStateMachine decide whether to honor it
 * (only while CLUSTER_ORBITING; ignored mid-transition or while a country's
 * sidebar is open, matching ModeToggle's re-entrancy guard).
 */
export class ClusterReturn {
    constructor(buttonEl) {
        this.button = buttonEl;
        this.button.addEventListener('click', () => emit('ui:leaveCluster', {}));

        on('state:changed', ({ state }) => {
            this.button.hidden = !INSIDE_CLUSTER_STATES.has(state);
            this.button.disabled = state !== STATES.CLUSTER_ORBITING;
        });
    }
}
