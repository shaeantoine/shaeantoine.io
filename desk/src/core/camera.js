import { tween, easeReach, easeOutQuint } from '../scene/tween.js';
import { DOLLY_DURATION_MS } from '../scene/CameraRig.js';
import { invalidate } from '../scene/renderScheduler.js';
import { ESTABLISHING, INTRO_MS, toVec3, cameraQuaternion, establishingShot, introStart } from './framing.js';
import { instant as INSTANT } from './flags.js';
import { track } from './track.js';

/**
 * The live viewport's aspect, as DeskScene keeps it on the camera (the same
 * number ctx.poseInFront and every module's shot use). Falls back to the
 * window before the first layout.
 */
function viewportAspect(camera) {
    if (camera.aspect > 0 && Number.isFinite(camera.aspect)) return camera.aspect;
    if (typeof window !== 'undefined' && window.innerWidth > 0 && window.innerHeight > 0) {
        return window.innerWidth / window.innerHeight;
    }
    return 16 / 9;
}

/**
 * The site's camera. Replaces src/scene/CameraRig.js, the original site's
 * camera — never run both — and reproduces its establishing shot and opening push-in exactly
 * (same numbers, same curves; see framing.js for the constants) at 3:2 and
 * wider. Narrower viewports get framing.establishingShot(aspect): the same
 * line of sight, backed away until the desk's whole front edge fits (and, on
 * a portrait phone, craned down so the frame stays on the wall). While the
 * camera is at (or heading to) the establishing shot, a resize re-frames it.
 *
 * Unlike CameraRig it is addressed by pose ({ position, lookAt }) rather than
 * by object offset, because modules compose their own shots.
 *
 *   await ctx.camera.moveTo({ position: [x,y,z], lookAt: [x,y,z] })   // 900 ms easeReach
 *   ctx.camera.finalPose()   // where the camera is heading (or is), for poseInFront
 */
export function createDeskCamera(camera) {
    const initial = establishingShot(viewportAspect(camera), { fov: camera.fov });
    const current = {
        position: toVec3(initial.position),
        lookAt: toVec3(initial.lookAt)
    };
    const destination = {
        position: current.position.clone(),
        lookAt: current.lookAt.clone()
    };
    let cancelCurrent = null;
    let resolveCurrent = null;
    let moving = false;
    // True while the camera is at, or on its way to, the establishing shot —
    // the one shot the camera itself owns, and so the one it re-frames on resize.
    let atEstablishing = true;
    let reframePending = false;

    function apply() {
        camera.position.copy(current.position);
        camera.lookAt(current.lookAt);
        camera.updateMatrixWorld();
    }
    apply();

    function interrupt() {
        cancelCurrent?.();
        cancelCurrent = null;
        const resolve = resolveCurrent;
        resolveCurrent = null;
        moving = false;
        resolve?.(false);
    }

    /**
     * @param {{ position, lookAt }} pose arrays, {x,y,z} or Vector3s
     * @param {{ instant?: boolean, duration?: number, easing?: (t)=>number }} [options]
     * @returns {Promise<boolean>} true when it arrived, false if another move superseded it
     */
    function moveTo(pose, { instant = INSTANT, duration = DOLLY_DURATION_MS, easing = easeReach } = {}) {
        return go(pose, { instant, duration, easing, establishing: false });
    }

    function go(pose, { instant, duration, easing, establishing: isEstablishing }) {
        interrupt();
        atEstablishing = isEstablishing;
        const toPosition = toVec3(pose.position);
        const toLookAt = toVec3(pose.lookAt);
        destination.position.copy(toPosition);
        destination.lookAt.copy(toLookAt);

        if (instant || !(duration > 0)) {
            current.position.copy(toPosition);
            current.lookAt.copy(toLookAt);
            apply();
            invalidate();
            return Promise.resolve(true);
        }

        const from = {
            x: current.position.x, y: current.position.y, z: current.position.z,
            lx: current.lookAt.x, ly: current.lookAt.y, lz: current.lookAt.z
        };
        const to = {
            x: toPosition.x, y: toPosition.y, z: toPosition.z,
            lx: toLookAt.x, ly: toLookAt.y, lz: toLookAt.z
        };
        moving = true;
        const promise = new Promise((resolve) => { resolveCurrent = resolve; });
        cancelCurrent = tween({
            from,
            to,
            duration,
            easing,
            // Only the view matrix changes — no shadow rebuild (as CameraRig).
            movesGeometry: false,
            onUpdate(value) {
                current.position.set(value.x, value.y, value.z);
                current.lookAt.set(value.lx, value.ly, value.lz);
                apply();
            },
            onComplete() {
                moving = false;
                cancelCurrent = null;
                const resolve = resolveCurrent;
                resolveCurrent = null;
                resolve?.(true);
                if (reframePending) reframe();
            }
        });
        return track(promise, 'camera');
    }

    /** The establishing shot for the live viewport (CameraRig's (0, 2.5, 5) → (0, 1, 0) at 3:2 and wider). */
    function establishingPose() {
        const shot = establishingShot(viewportAspect(camera), { fov: camera.fov });
        return { position: shot.position, lookAt: shot.lookAt };
    }

    /** Moves to the establishing shot for the live viewport (and keeps it framed on resize). */
    function establishing({ instant = INSTANT, duration = DOLLY_DURATION_MS, easing = easeReach } = {}) {
        return go(establishingPose(), { instant, duration, easing, establishing: true });
    }

    /**
     * After a resize: if the camera is at the establishing shot, cut to the
     * new viewport's version of it (nothing to animate — the window changed,
     * not the view). If it is still travelling there, retarget when it lands.
     */
    function reframe() {
        reframePending = false;
        if (!atEstablishing) return;
        if (moving) {
            reframePending = true;
            return;
        }
        const pose = establishingPose();
        const position = toVec3(pose.position);
        const lookAt = toVec3(pose.lookAt);
        if (position.distanceToSquared(current.position) < 1e-10 && lookAt.distanceToSquared(current.lookAt) < 1e-10) return;
        destination.position.copy(position);
        destination.lookAt.copy(lookAt);
        current.position.copy(position);
        current.lookAt.copy(lookAt);
        apply();
        invalidate();
    }

    if (typeof window !== 'undefined') {
        // Two frames later: DeskScene updates camera.aspect from a ResizeObserver,
        // which runs after the first frame's rAF callbacks.
        let queued = false;
        window.addEventListener('resize', () => {
            if (queued) return;
            queued = true;
            requestAnimationFrame(() => requestAnimationFrame(() => {
                queued = false;
                reframe();
            }));
        });
    }

    /**
     * CameraRig.playIntro: snap back by INTRO_OFFSET and push in to the
     * establishing shot over 1800 ms, easeOutQuint, aim fixed (at 3:2 and
     * wider, exactly; narrower, framing.introStart scales the offset with the
     * pull-back). Call it at the instant the veil starts to dissolve. Just a
     * cut when instant.
     */
    function intro({ instant = INSTANT } = {}) {
        if (instant) return establishing({ instant: true });
        interrupt();
        const start = introStart(viewportAspect(camera), { fov: camera.fov });
        current.position.fromArray(start.position);
        current.lookAt.fromArray(start.lookAt);
        apply();
        return establishing({ instant: false, duration: INTRO_MS, easing: easeOutQuint });
    }

    function isMoving() {
        return moving;
    }

    /**
     * The pose the camera is heading to (or sits at when idle). Compute
     * "in hand" poses from THIS, not from camera.position, or an item placed
     * mid-dolly ends up where the camera was rather than where it will be.
     * @returns {{ position: THREE.Vector3, lookAt: THREE.Vector3, quaternion: THREE.Quaternion }}
     */
    function finalPose() {
        return {
            position: destination.position.clone(),
            lookAt: destination.lookAt.clone(),
            quaternion: cameraQuaternion(destination.position, destination.lookAt)
        };
    }

    /** The pose right now (mid-move if moving). */
    function currentPose() {
        return { position: current.position.clone(), lookAt: current.lookAt.clone() };
    }

    return {
        /** The THREE.PerspectiveCamera itself (fov 45, owned by DeskScene). */
        object: camera,
        moveTo,
        establishing,
        intro,
        isMoving,
        finalPose,
        currentPose,
        /** The establishing shot for the live viewport: { position, lookAt } (arrays). */
        establishingPose,
        /** CameraRig's shot (the 3:2-and-wider one). For the live viewport's, use establishingPose(). */
        ESTABLISHING
    };
}

