import { on, emit } from '../util/EventBus.js';
import { STATES } from './states.js';
import { getBody, getLandmark, getLandmarks } from '../data/universe.js';

/**
 * The single source of truth for "what happens next." Every other module
 * (CameraRig, ZoneLoader, PlanetLoader, FocusPanel) only reacts to
 * the 'state:changed' events this emits — none of them decide transitions
 * themselves.
 *
 * Navigation is two levels deep: the outer solar system (SOLAR_ORBITING,
 * picking a planet), and an inner body orbit once a planet's been flown to
 * (CLUSTER_ORBITING for Earth specifically, BODY_ORBITING for every other
 * planet). `focusStack` tracks how deep the camera currently is: empty at
 * the solar level, one `{bodyId}` entry while orbiting/focused inside a
 * body. Landmark focus (a country slot or an orbiting satellite) is tracked
 * separately via `focusTarget = {kind, id, parentBodyId} | null` rather than
 * as its own focus-stack level — closing a focused landmark always returns
 * to orbiting the same body, never pops past it (see _onCloseRequested).
 *
 * Arrival at any body always lands in CLUSTER_ORBITING/BODY_ORBITING first —
 * no auto-selecting a first landmark. A landmark only becomes focused via
 * explicit pick (ui:pickLandmark, a dock click or 3D slot click) or cycle
 * (ui:cycleLandmark, prev/next while already focused).
 */
export class WorldStateMachine {
    constructor() {
        this.state = STATES.IDLE_LOADING;
        this.focusStack = [];
        this.selectedBodyId = null;
        this.focusTarget = null;

        this._pendingLandmarkId = null;

        on('input:pick', ({ id, kind }) => this._onPick(id, kind));
        on('ui:leaveCluster', () => this._onLeaveCluster());
        // Sustained zoom-out past CameraRig's elastic limit reads as the same
        // intent as the explicit leave-cluster button — see CameraRig's
        // _checkOvershootExit(). Scoped to CLUSTER_ORBITING/BODY_ORBITING;
        // _onLeaveCluster already no-ops outside those states.
        on('camera:overshootExit', () => this._onLeaveCluster());
        on('camera:flyToComplete', () => this._onFlyComplete());
        on('ui:sidebarClosed', () => this._onCloseRequested());
        on('ui:navigateToTarget', ({ bodyId, slotId }) => this._onNavigateToTarget(bodyId, slotId));
        on('ui:pickLandmark', ({ landmarkId }) => this._onPickLandmark(landmarkId));
        on('ui:cycleLandmark', ({ dir }) => this._onCycleLandmark(dir));
    }

    /** Call once initial scene/zone/planet setup is done to enter the interactive loop. */
    ready() {
        this._transition(STATES.SOLAR_ORBITING);
    }

    _isOrbitingBody() {
        return this.state === STATES.CLUSTER_ORBITING || this.state === STATES.BODY_ORBITING;
    }

    _isFocused() {
        return this.state === STATES.FOCUSED;
    }

    _onPick(id, kind) {
        if (this._isFocused()) {
            // Clicking a 'coreReveal' body's own sphere while one of its
            // landmarks is already focused reads as "show me the next one"
            // rather than "close" — that's the whole point of the sphere
            // (see PlanetLoader's class doc comment) — everywhere else,
            // clicking elsewhere (any other body/island, or the empty void)
            // still dismisses the open panel, same as the close button.
            if (kind === 'body' && id === this.selectedBodyId && this._coreLandmarks(id).length) {
                this._onCycleLandmark(1);
                return;
            }
            this._onCloseRequested();
            return;
        }
        if (!id) return;

        if (this.state === STATES.SOLAR_ORBITING && kind === 'body') {
            this.selectedBodyId = id;
            this._transition(STATES.FLYING_TO_PLANET);
        } else if (this.state === STATES.CLUSTER_ORBITING && kind === 'slot') {
            this._onPickLandmark(id);
        } else if (this.state === STATES.BODY_ORBITING && kind === 'body' && id === this.selectedBodyId) {
            const first = this._coreLandmarks(id)[0];
            if (first) this._onPickLandmark(first.id);
        }
    }

    /** @returns `bodyId`'s 'core'-kind landmarks (a 'coreReveal' body's one-at-a-time contents — see PlanetLoader), in authored order. */
    _coreLandmarks(bodyId) {
        return getLandmarks(bodyId).filter((l) => l.kind === 'core');
    }

    /**
     * Single funnel for Brief-link and planet-label-click navigation — converges
     * with the direct-3D-click path (_onPick) at the same FLYING_TO_PLANET
     * transition and _onFlyComplete handling below. Ignored mid-transition
     * to avoid stomping an in-flight tween; unwinds whatever's currently
     * focused/entered first so the fly-in always starts from a clean state.
     */
    _onNavigateToTarget(bodyId, slotId) {
        if ([STATES.FLYING_TO_PLANET, STATES.FLYING_TO_LANDMARK, STATES.RETURNING].includes(this.state)) {
            return;
        }
        if (this._isFocused()) this._onCloseRequested();
        if (this._isOrbitingBody()) this._onLeaveCluster();
        this.selectedBodyId = bodyId;
        this._pendingLandmarkId = slotId ?? null;
        this._transition(STATES.FLYING_TO_PLANET);
    }

    _onLeaveCluster() {
        if (!this._isOrbitingBody()) return;
        this.focusStack.pop();
        this._transition(STATES.RETURNING);
    }

    _onFlyComplete() {
        if (this.state === STATES.FLYING_TO_PLANET) {
            const body = getBody(this.selectedBodyId);
            this.focusStack.push({ bodyId: body.id });
            this._transition(body.contentTier === 'cluster' ? STATES.CLUSTER_ORBITING : STATES.BODY_ORBITING);
            if (this._pendingLandmarkId) {
                const landmarkId = this._pendingLandmarkId;
                this._pendingLandmarkId = null;
                this._onPickLandmark(landmarkId);
            }
        } else if (this.state === STATES.FLYING_TO_LANDMARK) {
            this._transition(STATES.FOCUSED);
        } else if (this.state === STATES.RETURNING) {
            this._onReturnComplete();
        }
    }

    /** Absolute jump to a specific landmark of the currently orbited body — used by 3D slot clicks and Flywheel picks alike. */
    _onPickLandmark(landmarkId) {
        if (!this._isOrbitingBody()) return;
        const landmark = getLandmark(this.selectedBodyId, landmarkId);
        this.focusTarget = { kind: landmark.kind, id: landmark.id, parentBodyId: this.selectedBodyId };
        this._transition(STATES.FLYING_TO_LANDMARK);
    }

    /**
     * Cycles to the next/previous landmark of the currently focused body —
     * ignored outside FOCUSED (e.g. mid-fly) to avoid stomping an in-flight
     * tween. Re-enters FLYING_TO_LANDMARK for the new target.
     */
    _onCycleLandmark(dir) {
        if (!this._isFocused() || !this.focusTarget) return;
        const landmarks = getLandmarks(this.focusTarget.parentBodyId).filter((l) => l.kind === this.focusTarget.kind);
        const currentIndex = landmarks.findIndex((l) => l.id === this.focusTarget.id);
        const nextIndex = (currentIndex + dir + landmarks.length) % landmarks.length;
        this.focusTarget = { ...this.focusTarget, id: landmarks[nextIndex].id };
        this._transition(STATES.FLYING_TO_LANDMARK);
    }

    _onReturnComplete() {
        const top = this._topFocus();
        if (!top) {
            this.selectedBodyId = null;
            this._transition(STATES.SOLAR_ORBITING);
        } else {
            this._transition(getBody(top.bodyId).contentTier === 'cluster' ? STATES.CLUSTER_ORBITING : STATES.BODY_ORBITING);
        }
    }

    /** Pops only the focused landmark, returning to orbiting the same body — never all the way back to solar. Leaving a body entirely is a separate intent (ui:leaveCluster). */
    _onCloseRequested() {
        if (!this._isFocused()) return;
        this.focusTarget = null;
        this._transition(STATES.RETURNING);
    }

    _topFocus() {
        return this.focusStack[this.focusStack.length - 1] ?? null;
    }

    _transition(newState) {
        this.state = newState;
        emit('state:changed', {
            state: this.state,
            selectedBodyId: this.selectedBodyId,
            focusTarget: this.focusTarget,
            focusStack: this.focusStack
        });
    }
}
