import { on, emit } from '../util/EventBus.js';
import { STATES, MODES } from './states.js';

/**
 * The single source of truth for "what happens next." Every other module
 * (CameraRig, ZoneLoader, Sidebar, ModeToggle) only reacts to the
 * 'state:changed' events this emits — none of them decide transitions
 * themselves.
 */
export class WorldStateMachine {
    constructor() {
        this.state = STATES.IDLE_LOADING;
        this.mode = MODES.GEOGRAPHY;
        this.selectedSlotId = null;
        this.pendingModeToggle = false;

        on('input:pick', ({ slotId }) => this._onPick(slotId));
        on('ui:toggleMode', () => this._onToggleMode());
        on('camera:flyToComplete', () => this._onFlyComplete());
        on('ui:sidebarClosed', () => this._onSidebarClosed());
        on('zones:transitionComplete', () => this._onTransitionComplete());
    }

    /** Call once initial scene/zone setup is done to enter the interactive loop. */
    ready() {
        this._transition(STATES.ORBITING);
    }

    _onPick(slotId) {
        if (this.state === STATES.FOCUSED) {
            // Clicking the globe outside the sidepanel dismisses it, same as the close button.
            this._onSidebarClosed();
            return;
        }
        if (this.state !== STATES.ORBITING || !slotId) return;
        this.selectedSlotId = slotId;
        this._transition(STATES.FLYING_TO_FOCUS);
    }

    _onToggleMode() {
        if (this.state === STATES.ORBITING) {
            this._transition(STATES.MODE_TRANSITIONING);
        } else if (this.state === STATES.FOCUSED) {
            // Resolved ambiguity: toggling while focused collapses to the
            // default orbit view first, then transitions — no in-place swap.
            this.pendingModeToggle = true;
            this._transition(STATES.RETURNING);
        }
        // Ignored during FLYING_TO_FOCUS, RETURNING, MODE_TRANSITIONING,
        // IDLE_LOADING — prevents re-entrant/overlapping transitions.
    }

    _onFlyComplete() {
        if (this.state === STATES.FLYING_TO_FOCUS) {
            this._transition(STATES.FOCUSED);
        } else if (this.state === STATES.RETURNING) {
            if (this.pendingModeToggle) {
                this.pendingModeToggle = false;
                this._transition(STATES.MODE_TRANSITIONING);
            } else {
                this.selectedSlotId = null;
                this._transition(STATES.ORBITING);
            }
        }
    }

    _onSidebarClosed() {
        if (this.state !== STATES.FOCUSED) return;
        this._transition(STATES.RETURNING);
    }

    _onTransitionComplete() {
        if (this.state !== STATES.MODE_TRANSITIONING) return;
        this.selectedSlotId = null;
        this._transition(STATES.ORBITING);
    }

    _transition(newState) {
        if (newState === STATES.MODE_TRANSITIONING) {
            this.mode = this.mode === MODES.GEOGRAPHY ? MODES.SHAES_WORLD : MODES.GEOGRAPHY;
        }
        this.state = newState;
        emit('state:changed', {
            state: this.state,
            mode: this.mode,
            selectedSlotId: this.selectedSlotId
        });
    }
}
