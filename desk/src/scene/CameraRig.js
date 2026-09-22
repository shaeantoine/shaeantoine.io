import { tween, easeReach, easeOutQuint } from './tween.js';

// Tunable once the scene actually renders:
const ESTABLISHING_POSITION = { x: 0, y: 2.5, z: 5.0 };
const ESTABLISHING_LOOK_AT = { x: 0, y: 1, z: 0 };

/**
 * How long a dolly takes, in and out.
 *
 * Exported because it is not only the camera's business: the sheet strategy's
 * approach runs alongside this move and has to land with it, the lanyard's
 * badge stands up inside it, and main.js holds its chrome reveal until the rig
 * reports it has settled. One constant, imported, rather than three copies that
 * agree today.
 *
 * WHY 900 AND NOT 440. The old value was picked to make a click feel answered,
 * and it does — but what it answers with is a cut with some blur on it. Every
 * one of these moves is somebody leaning in to look at a thing on a desk, and
 * they are not short moves: the establishing shot is 3.4 to 4.3 units from where
 * the four focus cameras stand, which at this scene's 3.2 units to the metre is
 * 1.06 to 1.34 m of room. Crossing that in 440 ms averages 2.4–3.0 m/s, several
 * times faster than a person leans, and the tell is that the shot arrives before
 * the eye has followed it — the object reads as having been teleported to rather
 * than approached. At 900 ms it averages 1.18–1.49 m/s, which is a lean.
 *
 * This is still the most load-bearing number for how the desk feels, and it is
 * not a rendering cost — nudge it here and everything timed against it follows.
 *
 * The responsiveness the short duration was buying has not been given up, it
 * has been moved: the object is already raised under the cursor before the
 * click, the cursor changes state on the click itself and the vignette starts
 * on the frame after, so the click is acknowledged before the camera has gone
 * anywhere and the camera is free to take the time the movement takes. See
 * easeReach in scene/tween.js for the other half of this.
 */
export const DOLLY_DURATION_MS = 900;

/**
 * The opening move: where the camera stands when the room is first uncovered,
 * as an offset from the establishing shot, and how long it takes to arrive.
 *
 * WHY THERE IS A MOVE AT ALL. Everything else in this change is about making
 * the room appear all at once instead of in pieces — but "all at once" on a
 * still frame is a cut, and a cut to a static 3D scene is the thing that makes
 * it read as a rendered image rather than a place. A slow push-in costs
 * nothing, plays under the veil's dissolve, and does two useful jobs: it tells
 * the visitor the scene is live and interactive before they have touched
 * anything, and it gives the eye somewhere to travel while the dissolve
 * finishes.
 *
 * WHY THESE NUMBERS. Back 0.95 and up 0.30 against an establishing distance of
 * ~5.5 is about a 17% change in depth — enough that the desk visibly grows into
 * the frame, small enough that nothing important is outside it at the start
 * (the poster wall's ±4.3 is the binding constraint, and it stays in frame at
 * the pulled-back position on a 3:2 viewport). Twice the DOLLY_DURATION_MS
 * focus move by design: a dolly answers a click and should be over quickly,
 * whereas this one is nobody's request and should feel like weather rather than
 * a transition.
 *
 * Aimed at the same point throughout. Moving the look-at as well would swing
 * the horizon and read as a handheld camera, which is a different and much
 * busier idea than this one.
 */
const INTRO_OFFSET = { x: 0, y: 0.30, z: 0.95 };
const INTRO_DURATION_MS = 1800;

function animateCameraTo(camera, lookAtTarget, toPosition, toLookAt, onComplete, {
    duration = DOLLY_DURATION_MS,
    easing = easeReach
} = {}) {
    const from = {
        x: camera.position.x, y: camera.position.y, z: camera.position.z,
        lx: lookAtTarget.x, ly: lookAtTarget.y, lz: lookAtTarget.z
    };
    const to = {
        x: toPosition.x, y: toPosition.y, z: toPosition.z,
        lx: toLookAt.x, ly: toLookAt.y, lz: toLookAt.z
    };
    return tween({
        from,
        to,
        duration,
        // Not an ease-out and not a symmetric ease-in-out: the asymmetric
        // reaching curve, which accelerates for the first third and then spends
        // the remaining two thirds arriving. See easeReach in scene/tween.js for
        // why that is the shape of the movement this is standing in for, and why
        // starting from rest no longer costs the click its acknowledgement.
        easing,
        // Nothing in the world moves during a dolly — only the view matrix
        // changes — and the shadow map is rendered from the window, not the
        // camera. Skipping its rebuild takes a 2048² depth pass out of the
        // most frequent animation in the app.
        movesGeometry: false,
        onUpdate(current) {
            camera.position.set(current.x, current.y, current.z);
            lookAtTarget.x = current.lx;
            lookAtTarget.y = current.ly;
            lookAtTarget.z = current.lz;
            camera.lookAt(lookAtTarget.x, lookAtTarget.y, lookAtTarget.z);
        },
        onComplete
    });
}

/**
 * Wraps `camera`, setting it to a fixed wide establishing shot immediately,
 * and exposes `focusOn`/`reset` to animate between that shot and a
 * per-object tuned close-up. Unlike the retired category-level dolly (a
 * single fixed distance applied uniformly to every object), `focusOn` takes
 * the clicked object's own `focus.camera` offset/lookAtOffset — the monitor
 * needs a tight, face-on shot to sell its screen, standing 1.98 units out at
 * 8° above the desk; the paper stack needs one at 62°, close in at 1.10,
 * because its page is lying flat on the desk and there is no other way to see
 * it. One fixed distance can't express that difference, so the offset now comes
 * from the object's own config. Both pairs of figures are what
 * scripts/analyze-focus-cameras.mjs prints for those two objects.
 *
 * The offsets are world-space vectors and they translate with the object but do
 * NOT rotate with it: `focusOn` adds them componentwise to the world position
 * DeskScene reports, which is the object group's origin, a point the group's own
 * yaw does not move. So respacing the desk costs nothing here; changing a yaw
 * invalidates every shot on that object.
 */
export function createCameraRig(camera) {
    const lookAtTarget = { ...ESTABLISHING_LOOK_AT };
    camera.position.set(ESTABLISHING_POSITION.x, ESTABLISHING_POSITION.y, ESTABLISHING_POSITION.z);
    camera.lookAt(lookAtTarget.x, lookAtTarget.y, lookAtTarget.z);

    let cancelCurrent = null;
    // Screen-space chrome pinned to an object can't be placed meaningfully
    // while the view matrix is still changing under it, so callers get to ask
    // whether the shot has settled. See main.js's arrow reveal.
    let moving = false;

    function settle() {
        moving = false;
        cancelCurrent = null;
    }

    function focusOn(objectWorldPosition, { offset, lookAtOffset }) {
        cancelCurrent?.();
        const toPosition = {
            x: objectWorldPosition.x + offset[0],
            y: objectWorldPosition.y + offset[1],
            z: objectWorldPosition.z + offset[2]
        };
        const toLookAt = {
            x: objectWorldPosition.x + lookAtOffset[0],
            y: objectWorldPosition.y + lookAtOffset[1],
            z: objectWorldPosition.z + lookAtOffset[2]
        };
        moving = true;
        cancelCurrent = animateCameraTo(camera, lookAtTarget, toPosition, toLookAt, settle);
    }

    function reset() {
        cancelCurrent?.();
        moving = true;
        cancelCurrent = animateCameraTo(camera, lookAtTarget, ESTABLISHING_POSITION, ESTABLISHING_LOOK_AT, settle);
    }

    /**
     * Snaps back to the opening position and pushes in to the establishing
     * shot. Called at the instant the loading veil starts to dissolve, which is
     * why the snap is free: at that moment the veil is still fully opaque, so
     * the only thing ever seen is the move.
     *
     * Skipped entirely for a visitor who has asked for reduced motion, and for
     * a deep link into a focused object — that arrives mid-dolly already, and
     * two camera moves fighting over the same frames is worse than neither.
     */
    function playIntro() {
        cancelCurrent?.();
        camera.position.set(
            ESTABLISHING_POSITION.x + INTRO_OFFSET.x,
            ESTABLISHING_POSITION.y + INTRO_OFFSET.y,
            ESTABLISHING_POSITION.z + INTRO_OFFSET.z
        );
        camera.lookAt(lookAtTarget.x, lookAtTarget.y, lookAtTarget.z);
        moving = true;
        cancelCurrent = animateCameraTo(
            camera, lookAtTarget, ESTABLISHING_POSITION, ESTABLISHING_LOOK_AT, settle,
            { duration: INTRO_DURATION_MS, easing: easeOutQuint }
        );
    }

    /** True while a dolly is in flight, from the first frame of the move to the last. */
    function isMoving() {
        return moving;
    }

    return { focusOn, reset, playIntro, isMoving };
}

