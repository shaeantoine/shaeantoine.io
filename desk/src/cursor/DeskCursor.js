import { dampedApproach } from '../focus/cursorTilt.js';
import { invalidate, invalidateShadows } from '../scene/renderScheduler.js';
import { echoOffset, yawFromOffset } from './mouseEcho.js';

const ECHO_SMOOTHING_MS = 260;

// How close to its target a damped value has to get before it stops asking for
// frames. Exponential approach never arrives exactly, so without a threshold
// the echo would hold the render loop open forever at amplitudes nobody can
// see. Per-quantity because the units are not comparable: world units and
// radians.
const SETTLED_WORLD = 0.0002;
const SETTLED_RADIANS = 0.0005;

const MOUSE_OBJECT_ID = 'mouse';

// How far the mouse has to drift before its shadow is worth re-rendering.
//
// THIS IS A DOLLY BUDGET, not a shadow-quality knob. `invalidateShadows()` is
// the expensive invalidation — it re-renders the key's 2048² depth map — and
// the echo is the one thing in the scene that moves continuously, so calling it
// per frame puts that pass on every frame of every camera move. CameraRig goes
// out of its way to avoid exactly that (`movesGeometry: false`, see tween.js);
// spending it here from the other side undoes the saving, and the pull-back out
// of focus is where it showed, because `setActive(true)` re-arms the echo on
// the same tick the camera starts moving.
//
// The value is in shadow texels. The key is a spot at ~11 units with a 0.3 rad
// half-angle, so its 2048² map lands ~300 texels per world unit over the desk —
// one texel is ~0.0033 units. At 0.01 the shadow trails the mouse by at most
// three texels, comfortably inside a PCFSoft kernel and a third of the 0.03
// normalBias already displacing it, while cutting the rebuilds across a full
// echo excursion from ~115 to ~23.
const SHADOW_REBUILD_DRIFT = 0.01;

// Yaw folded into that same drift measure: a rotation moves the silhouette by
// roughly the angle times the mouse's half-length, so this converts radians
// into the world units the threshold is expressed in.
const MOUSE_SHADOW_RADIUS = 0.06;

const NOOP_CURSOR = {
    setHover() {},
    setActive() {},
    update: () => false,
    dispose() {}
};

/**
 * The desk's response to the visitor's pointer. The native cursor is left
 * alone — it is the cursor — and the one flourish is the mouse on the desk
 * sliding in sympathy with the real one.
 *
 * Self-contained: it owns its listeners and reaches into the scene only to
 * nudge the mouse. Mount it after the scene exists, call `update(dt)` each
 * frame, and `setActive(false)` whenever the desk isn't the thing being looked
 * at.
 *
 * @param {{ deskScene: object, canvasEl: HTMLCanvasElement }} options
 */
export function createDeskCursor({ deskScene, canvasEl }) {
    // Same guard DeskScene keeps on this node: an HMR replay re-runs this
    // module with a fresh module-scope, so without stashing the live instance
    // on the DOM element a reload would stack a second set of listeners on top
    // of the first.
    canvasEl.__deskCursor?.dispose();

    // Touch has no pointer to echo.
    if (window.matchMedia?.('(pointer: coarse)').matches) return NOOP_CURSOR;

    const reduceMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    // Not literally 0: dampedApproach divides dt by this, and two rAF ticks
    // inside the same millisecond would make 0/0 a NaN that poisons the
    // mouse's position for the rest of the session.
    const smoothing = (ms) => (reduceMotion ? 1e-4 : ms);

    let hasPointer = false;
    let active = true;

    let mouseRest = null;
    const echo = { x: 0, z: 0, yaw: 0 };
    const echoNdc = { x: 0, y: 0 };
    // Where the echo was standing the last time its shadow was rendered. See
    // SHADOW_REBUILD_DRIFT.
    const shadowBuiltAt = { x: 0, z: 0, yaw: 0 };

    /**
     * @returns {boolean} whether the echo is still converging on its target,
     *          and so whether the render loop should stay awake for another
     *          frame.
     */
    function update(dt) {
        const visible = active && hasPointer;
        const group = deskScene.getObjectGroup(MOUSE_OBJECT_ID);
        if (!group) return false;
        if (!mouseRest) mouseRest = { x: group.position.x, z: group.position.z, yaw: group.rotation.y };

        const target = visible ? echoOffset(echoNdc) : { x: 0, z: 0 };
        const targetYaw = yawFromOffset(target.x);

        const moving =
            Math.abs(target.x - echo.x) > SETTLED_WORLD ||
            Math.abs(target.z - echo.z) > SETTLED_WORLD ||
            Math.abs(targetYaw - echo.yaw) > SETTLED_RADIANS;

        echo.x = dampedApproach(echo.x, target.x, dt, smoothing(ECHO_SMOOTHING_MS));
        echo.z = dampedApproach(echo.z, target.z, dt, smoothing(ECHO_SMOOTHING_MS));
        echo.yaw = dampedApproach(echo.yaw, targetYaw, dt, smoothing(ECHO_SMOOTHING_MS));

        // Only x/z/yaw — y is left alone so nothing here can fight the scene's
        // own hover lift if the mouse ever becomes clickable.
        group.position.x = mouseRest.x + echo.x;
        group.position.z = mouseRest.z + echo.z;
        group.rotation.y = mouseRest.yaw + echo.yaw;

        // The mouse is a real object in the scene, so its motion has to drag
        // the shadow map along with it — but only once it has actually gone
        // somewhere, and once more when it stops so the frame it comes to rest
        // on is exact rather than up to a threshold off. Returning `moving` is
        // what keeps the loop rendering in between; those frames just redraw
        // the scene without rebuilding depth.
        const drift =
            Math.hypot(echo.x - shadowBuiltAt.x, echo.z - shadowBuiltAt.z) +
            Math.abs(echo.yaw - shadowBuiltAt.yaw) * MOUSE_SHADOW_RADIUS;
        if (drift > SHADOW_REBUILD_DRIFT || (!moving && drift > 0)) {
            shadowBuiltAt.x = echo.x;
            shadowBuiltAt.z = echo.z;
            shadowBuiltAt.yaw = echo.yaw;
            invalidateShadows();
        }
        return moving;
    }

    // Both of these change a target the update tick damps toward, and either
    // can arrive while the render loop is parked. Waking it is what turns a
    // settled mouse back into a moving one.
    //
    // The coordinates arrive already normalised and already thinned to one
    // delivery per animation frame — this used to do its own
    // `getBoundingClientRect` per pointer event, which was a forced layout at
    // the mouse's report rate rather than the screen's.
    // @see cursor/pointerSource.js
    function onPointerMove(ndc) {
        echoNdc.x = ndc.x;
        echoNdc.y = ndc.y;
        hasPointer = true;
        invalidate();
    }

    function onPointerLeave() {
        hasPointer = false;
        invalidate();
    }

    const unsubscribeMove = deskScene.pointer.onMove(onPointerMove);
    const unsubscribeLeave = deskScene.pointer.onLeave(onPointerLeave);

    /** The one cursor change the desk makes: the standard hand over a hit. */
    function setHover(objectId) {
        canvasEl.style.cursor = objectId ? 'pointer' : '';
    }

    /** Focus mode owns the screen; the desk cursor stands down while it does. */
    function setActive(next) {
        active = next;
        // Focus is entered by clicking an object, so the pointer cursor is
        // still up at that moment and no pointermove is guaranteed to clear it.
        if (!active) setHover(null);
        invalidate();
    }

    function dispose() {
        unsubscribeMove();
        unsubscribeLeave();
        setHover(null);
        if (canvasEl.__deskCursor === instance) canvasEl.__deskCursor = null;
    }

    const instance = { setHover, setActive, update, dispose };
    canvasEl.__deskCursor = instance;
    return instance;
}
