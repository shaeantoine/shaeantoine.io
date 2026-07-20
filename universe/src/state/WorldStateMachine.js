import { on, emit } from '../util/EventBus.js';
import { STATES, MODES } from './states.js';
import { getBody } from '../data/universe.js';

/**
 * The single source of truth for "what happens next." Every other module
 * (CameraRig, ZoneLoader, PlanetLoader, Sidebar, ModeToggle) only reacts to
 * the 'state:changed' events this emits — none of them decide transitions
 * themselves.
 *
 * Navigation is two levels deep: the outer solar system (SOLAR_ORBITING,
 * picking a planet), and — only for the one body with contentTier
 * 'cluster' (today, always Earth) — an inner cluster orbit (CLUSTER_ORBITING,
 * picking a country, mirroring the site's original single-level geography/
 * shaesWorld toggle). `focusStack` tracks how deep the camera currently is:
 * empty at the solar level, one `{level:'solar', bodyId}` entry while a
 * non-cluster planet's sidebar is open, or one `{level:'cluster', bodyId,
 * slotId}` entry while inside Earth (slotId set only while a country's
 * sidebar is open).
 */
export class WorldStateMachine {
    constructor() {
        this.state = STATES.IDLE_LOADING;
        this.mode = MODES.GEOGRAPHY;
        this.focusStack = [];
        this.selectedBodyId = null;
        this.selectedSlotId = null;
        this.pendingModeToggle = false;

        this._pendingSlotId = null;

        on('input:pick', ({ id, kind }) => this._onPick(id, kind));
        on('ui:toggleMode', () => this._onToggleMode());
        on('ui:leaveCluster', () => this._onLeaveCluster());
        on('camera:flyToComplete', () => this._onFlyComplete());
        on('ui:sidebarClosed', () => this._onCloseRequested());
        on('zones:transitionComplete', () => this._onTransitionComplete());
        on('ui:navigateToTarget', ({ bodyId, slotId }) => this._onNavigateToTarget(bodyId, slotId));
        on('ui:pickSlot', ({ slotId }) => this._onPick(slotId, 'slot'));
    }

    /** Call once initial scene/zone/planet setup is done to enter the interactive loop. */
    ready() {
        this._transition(STATES.SOLAR_ORBITING);
    }

    _isFocused() {
        return this.state === STATES.PLANET_FOCUSED || this.state === STATES.SLOT_FOCUSED;
    }

    _onPick(id, kind) {
        if (this._isFocused()) {
            // Clicking elsewhere (on any body/island, or the empty void)
            // dismisses the open sidebar, same as the close button.
            this._onCloseRequested();
            return;
        }
        if (!id) return;

        if (this.state === STATES.SOLAR_ORBITING && kind === 'body') {
            this.selectedBodyId = id;
            this._transition(STATES.FLYING_TO_PLANET);
        } else if (this.state === STATES.CLUSTER_ORBITING && kind === 'slot') {
            this.selectedSlotId = id;
            this._transition(STATES.FLYING_TO_SLOT);
        }
    }

    /**
     * Single funnel for Brief-link and planet-label-click navigation — converges
     * with the direct-3D-click path (_onPick) at the same FLYING_TO_PLANET
     * transition and _onFlyComplete handling below. Ignored mid-transition
     * to avoid stomping an in-flight tween; unwinds whatever's currently
     * focused/entered first so the fly-in always starts from a clean state.
     */
    _onNavigateToTarget(bodyId, slotId) {
        if (
            [STATES.FLYING_TO_PLANET, STATES.FLYING_TO_SLOT, STATES.RETURNING, STATES.MODE_TRANSITIONING].includes(
                this.state
            )
        ) {
            return;
        }
        if (this._isFocused()) this._onCloseRequested();
        if (this.state === STATES.CLUSTER_ORBITING) this._onLeaveCluster();
        this.selectedBodyId = bodyId;
        this._pendingSlotId = slotId ?? null;
        this._transition(STATES.FLYING_TO_PLANET);
    }

    _onToggleMode() {
        if (this.state === STATES.CLUSTER_ORBITING) {
            this._transition(STATES.MODE_TRANSITIONING);
        } else if (this.state === STATES.SLOT_FOCUSED) {
            // Resolved ambiguity: toggling while a country is focused
            // collapses to the cluster orbit view first, then transitions —
            // no in-place swap.
            this.pendingModeToggle = true;
            this._topFocus().slotId = null;
            this.selectedSlotId = null;
            this._transition(STATES.RETURNING);
        }
        // Ignored at every other state — prevents re-entrant/overlapping
        // transitions, and toggling only ever makes sense inside Earth's
        // cluster (ModeToggle is hidden everywhere else).
    }

    _onLeaveCluster() {
        if (this.state !== STATES.CLUSTER_ORBITING) return;
        this.focusStack.pop();
        this._transition(STATES.RETURNING);
    }

    _onFlyComplete() {
        if (this.state === STATES.FLYING_TO_PLANET) {
            const body = getBody(this.selectedBodyId);
            if (body.contentTier === 'cluster') {
                this.focusStack.push({ level: 'cluster', bodyId: body.id, slotId: null });
                this._transition(STATES.CLUSTER_ORBITING);
                if (this._pendingSlotId) {
                    this.selectedSlotId = this._pendingSlotId;
                    this._pendingSlotId = null;
                    this._transition(STATES.FLYING_TO_SLOT);
                }
            } else {
                this.focusStack.push({ level: 'solar', bodyId: body.id });
                this._transition(STATES.PLANET_FOCUSED);
            }
        } else if (this.state === STATES.FLYING_TO_SLOT) {
            this._topFocus().slotId = this.selectedSlotId;
            this._transition(STATES.SLOT_FOCUSED);
        } else if (this.state === STATES.RETURNING) {
            this._onReturnComplete();
        }
    }

    _onReturnComplete() {
        if (this.pendingModeToggle) {
            this.pendingModeToggle = false;
            this._transition(STATES.MODE_TRANSITIONING);
            return;
        }
        const top = this._topFocus();
        if (!top) {
            this.selectedBodyId = null;
            this.selectedSlotId = null;
            this._transition(STATES.SOLAR_ORBITING);
        } else if (top.level === 'cluster') {
            this.selectedSlotId = null;
            this._transition(STATES.CLUSTER_ORBITING);
        }
    }

    _onCloseRequested() {
        if (this.state === STATES.PLANET_FOCUSED) {
            this.focusStack.pop();
            this.selectedBodyId = null;
            this._transition(STATES.RETURNING);
        } else if (this.state === STATES.SLOT_FOCUSED) {
            // Pop only the slot focus — stays inside the cluster. Leaving
            // Earth entirely is a separate intent (ui:leaveCluster).
            this._topFocus().slotId = null;
            this._transition(STATES.RETURNING);
        }
    }

    _onTransitionComplete() {
        if (this.state !== STATES.MODE_TRANSITIONING) return;
        this.selectedSlotId = null;
        this._transition(STATES.CLUSTER_ORBITING);
    }

    _topFocus() {
        return this.focusStack[this.focusStack.length - 1] ?? null;
    }

    _transition(newState) {
        if (newState === STATES.MODE_TRANSITIONING) {
            this.mode = this.mode === MODES.GEOGRAPHY ? MODES.SHAES_WORLD : MODES.GEOGRAPHY;
        }
        this.state = newState;
        emit('state:changed', {
            state: this.state,
            mode: this.mode,
            selectedBodyId: this.selectedBodyId,
            selectedSlotId: this.selectedSlotId,
            focusStack: this.focusStack
        });
    }
}
