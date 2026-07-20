import * as THREE from 'three';
import { on, emit } from '../util/EventBus.js';
import { tween } from '../util/tween.js';
import { latLonToVector3 } from '../util/sphereCoords.js';

const DRAG_ROTATE_SPEED = 0.005;
const ZOOM_SPEED = 0.02;
const FLY_DURATION_MS = 900;
// Post-release glide decay rate: velocity *= exp(-DAMPING_RATE * dt) each
// frame, chosen so ~90% of glide has drained after ~1/2.6s.
const DAMPING_RATE = 6.0;
const VELOCITY_EPSILON = 0.0001;

/**
 * Orbits a camera around a stack of "orbit frames" — spherical coordinates
 * around a `target` — and tweens to/from a focused point on demand. Only the
 * top of the stack is ever driven by input/auto-rotate; pushOrbitFrame()/
 * popOrbitFrame() move between nesting levels (solar system → inside a
 * cluster planet) without WorldStateMachine's other reactors needing to know
 * how many levels deep the camera actually is.
 *
 * Drag/zoom input only takes effect while `inputEnabled` is true —
 * WorldStateMachine toggles that as it enters/exits an orbiting state.
 */
export class CameraRig {
    constructor(camera, cameraConfig) {
        this.camera = camera;

        // Set only while inside a cluster body (today, always Earth) — see
        // enterCluster()/exitCluster(). flyToSlot() relies on these.
        this.globeRadius = null;
        this.islandScale = 1;

        const minPolar = cameraConfig.solarOrbitMinPolar;
        const maxPolar = cameraConfig.solarOrbitMaxPolar;
        const radius = cameraConfig.solarOrbitRadius;
        // The base frame — orbiting the sun — always stays at the bottom of
        // the stack; it's never pushed or popped.
        this.frames = [
            {
                target: new THREE.Vector3(0, 0, 0),
                radius,
                nominalRadius: radius,
                minPolar,
                maxPolar,
                minRadius: radius * 0.5,
                maxRadius: radius * 2.5,
                azimuth: 0,
                polar: (minPolar + maxPolar) / 2
            }
        ];

        this.azimuthAccum = 0;
        this.polarAccum = 0;
        this.azimuthVelocity = 0;
        this.polarVelocity = 0;
        this._dragActiveThisFrame = false;

        this.lookAtTarget = new THREE.Vector3();
        this.inputEnabled = true;
        this.autoRotate = true;
        this._cancelTween = null;

        this._unsubDrag = on('input:dragDelta', (d) => this._onDrag(d));
        this._unsubZoom = on('input:zoomDelta', (d) => this._onZoom(d));

        this._applyOrbitPosition();
    }

    dispose() {
        this._unsubDrag();
        this._unsubZoom();
        this._cancelTween?.();
    }

    setInputEnabled(enabled) {
        this.inputEnabled = enabled;
    }

    /** Resumes idle auto-rotate — called when returning to an orbiting state. */
    resumeAutoRotate() {
        this.autoRotate = true;
        this._clearMotion();
    }

    get _frame() {
        return this.frames[this.frames.length - 1];
    }

    /**
     * Pushes a new orbit frame onto the stack, seeded from the camera's
     * *current* position relative to `target` — so if the camera just
     * arrived via flyToPlanet(), there's no snap: the derived radius/polar/
     * azimuth exactly reproduce where the fly-in tween already left it.
     * `minPolar`/`maxPolar`/`minRadius`/`maxRadius`/`nominalRadius` bound
     * where input/auto-rotate can subsequently take it.
     */
    pushOrbitFrame({ target, minPolar, maxPolar, minRadius, maxRadius, nominalRadius }) {
        const offset = this.camera.position.clone().sub(target);
        const radius = offset.length();
        const polar = Math.acos(THREE.MathUtils.clamp(offset.y / radius, -1, 1));
        const azimuth = Math.atan2(offset.x, offset.z);
        this.frames.push({
            target: target.clone(),
            radius,
            nominalRadius: nominalRadius ?? radius,
            minPolar,
            maxPolar,
            minRadius,
            maxRadius,
            azimuth,
            polar: THREE.MathUtils.clamp(polar, minPolar, maxPolar)
        });
        this._clearMotion();
    }

    /** Pops back to the parent orbit frame. The base solar frame is never popped. */
    popOrbitFrame() {
        if (this.frames.length > 1) this.frames.pop();
        this._clearMotion();
    }

    /** Enters a cluster body's orbit (today, always Earth) — pushes its frame and records globeRadius/islandScale for flyToSlot(). */
    enterCluster({ target, globeRadius, islandScale, minPolar, maxPolar, nominalRadius }) {
        this.globeRadius = globeRadius;
        this.islandScale = islandScale ?? 1;

        // Distance at which the globe's silhouette exactly fills the
        // camera's vertical FOV — anything closer clips it against the
        // screen edges. Deriving min/max from this (rather than arbitrary
        // globeRadius multiples) keeps them correct if globeRadius or the
        // camera's fov ever change.
        const halfFovRad = THREE.MathUtils.degToRad(this.camera.fov / 2);
        const fitDistance = globeRadius / Math.sin(halfFovRad);

        this.pushOrbitFrame({
            target,
            minPolar,
            maxPolar,
            nominalRadius,
            minRadius: fitDistance * 0.6,
            maxRadius: fitDistance * 2.1
        });
    }

    /** Leaves the current cluster body's orbit, popping back to the parent (solar) frame. */
    exitCluster() {
        this.popOrbitFrame();
        this.globeRadius = null;
        this.islandScale = 1;
    }

    // Only accumulates pending rotation here — actually moving the camera
    // happens exclusively in update(), once per rendered frame. Applying
    // directly per pointermove (as before) ties camera motion to the
    // pointer event clock, which is irregular relative to the display's
    // repaint clock and reads as stutter; accumulating and applying once
    // per rAF tick keeps drag-tracking on the same regular clock as glide.
    _onDrag({ dx, dy }) {
        if (!this.inputEnabled) return;
        this.autoRotate = false;
        const frame = this._frame;
        const speedScale = frame.radius / frame.nominalRadius;
        this.azimuthAccum -= dx * DRAG_ROTATE_SPEED * speedScale;
        this.polarAccum -= dy * DRAG_ROTATE_SPEED * speedScale;
        this._dragActiveThisFrame = true;
    }

    _onZoom({ delta }) {
        if (!this.inputEnabled) return;
        const frame = this._frame;
        frame.radius = THREE.MathUtils.clamp(frame.radius + delta * ZOOM_SPEED, frame.minRadius, frame.maxRadius);
        this._applyOrbitPosition();
    }

    _applyOrbitPosition() {
        const frame = this._frame;
        // Always re-anchor to the frame's target — lookAtTarget gets
        // diverted to a focus point during a fly tween, and nothing else
        // resets it. Every caller of this method represents genuine orbit
        // state, so it's always correct to snap the gaze back here.
        this.lookAtTarget.copy(frame.target);
        const sinPolar = Math.sin(frame.polar);
        this.camera.position.set(
            frame.target.x + frame.radius * sinPolar * Math.sin(frame.azimuth),
            frame.target.y + frame.radius * Math.cos(frame.polar),
            frame.target.z + frame.radius * sinPolar * Math.cos(frame.azimuth)
        );
        this.camera.lookAt(this.lookAtTarget);
    }

    /** Called every frame by main.js. Advances idle auto-rotate, applies this frame's accumulated drag, or decays/applies post-release glide velocity. */
    update(dt) {
        const frame = this._frame;

        if (this.autoRotate) {
            frame.azimuth += dt * 0.05;
            this._applyOrbitPosition();
            return;
        }

        // A fly/return tween owns camera.position directly while
        // inputEnabled is false — don't let leftover glide fight it.
        if (!this.inputEnabled) return;

        if (this._dragActiveThisFrame) {
            const safeDt = Math.max(dt, 1e-4);
            frame.azimuth += this.azimuthAccum;
            const prevPolar = frame.polar;
            frame.polar = THREE.MathUtils.clamp(frame.polar + this.polarAccum, frame.minPolar, frame.maxPolar);

            // Glide velocity for once dragging stops: this frame's applied
            // rotation over this frame's duration.
            this.azimuthVelocity = this.azimuthAccum / safeDt;
            this.polarVelocity = (frame.polar - prevPolar) / safeDt;

            this.azimuthAccum = 0;
            this.polarAccum = 0;
            this._dragActiveThisFrame = false;

            this._applyOrbitPosition();
            return;
        }

        if (Math.abs(this.azimuthVelocity) < VELOCITY_EPSILON && Math.abs(this.polarVelocity) < VELOCITY_EPSILON) {
            return;
        }

        frame.azimuth += this.azimuthVelocity * dt;
        frame.polar = THREE.MathUtils.clamp(frame.polar + this.polarVelocity * dt, frame.minPolar, frame.maxPolar);
        const decay = Math.exp(-DAMPING_RATE * dt);
        this.azimuthVelocity *= decay;
        this.polarVelocity *= decay;

        this._applyOrbitPosition();
    }

    // Clears all pending/residual rotation state — used whenever something
    // else (a tween, or auto-rotate resuming, or a frame push/pop) is about
    // to take over camera motion, so no stale drag/glide state reappears
    // once it hands back.
    _clearMotion() {
        this.azimuthAccum = 0;
        this.polarAccum = 0;
        this.azimuthVelocity = 0;
        this.polarVelocity = 0;
        this._dragActiveThisFrame = false;
    }

    /**
     * Tweens the camera from wherever it is to look at `targetPosition` from
     * `distance` away, roughly along the current viewing direction. Emits
     * 'camera:flyToComplete' when done. Shared core for flyToSlot() and
     * flyToPlanet() — the only difference between them is how the target
     * point and distance are derived.
     */
    _flyToFocusPoint(targetPosition, distance) {
        this._cancelTween?.();
        this.inputEnabled = false;
        this.autoRotate = false;
        this._clearMotion();

        const fromPosition = this.camera.position.clone();
        const fromLookAt = this.lookAtTarget.clone();

        const direction = fromPosition.clone().sub(targetPosition).normalize();
        const toPosition = targetPosition.clone().add(direction.multiplyScalar(distance));

        this._cancelTween = tween({
            from: { x: fromPosition.x, y: fromPosition.y, z: fromPosition.z, lx: fromLookAt.x, ly: fromLookAt.y, lz: fromLookAt.z },
            to: { x: toPosition.x, y: toPosition.y, z: toPosition.z, lx: targetPosition.x, ly: targetPosition.y, lz: targetPosition.z },
            duration: FLY_DURATION_MS,
            onUpdate: (v) => {
                this.camera.position.set(v.x, v.y, v.z);
                this.lookAtTarget.set(v.lx, v.ly, v.lz);
                this.camera.lookAt(this.lookAtTarget);
            },
            onComplete: () => emit('camera:flyToComplete', {})
        });
    }

    /**
     * Flies to a slot's framing inside the current cluster body. `originOffset`
     * is the cluster body's world position (slots are authored in globe-local
     * lat/lon space, but the globe itself now sits at an orbit position rather
     * than the scene origin).
     */
    flyToSlot(slot, originOffset = new THREE.Vector3()) {
        // Island content (shape/landmark/props) is scaled up by islandScale
        // inside ZoneLoader — scale the focused framing the same way so it
        // stays proportionate rather than sitting too close/low against a
        // now-bigger island.
        const target = latLonToVector3(
            slot.position.lat,
            slot.position.lon,
            this.globeRadius + slot.cameraTargetHeight * this.islandScale
        ).add(originOffset);
        this._flyToFocusPoint(target, slot.cameraDistance * this.islandScale);
    }

    /** Flies to a planet body at `worldPosition` (see orbitCoords.js), framing it from body.cameraDistance away. */
    flyToPlanet(body, worldPosition) {
        const distance = body.cameraDistance ?? body.cluster?.orbitRadius ?? 12;
        this._flyToFocusPoint(worldPosition, distance);
    }

    /** Tweens back to the current (top-of-stack) orbit frame's framing. Emits 'camera:flyToComplete' when done. */
    returnToOrbit() {
        this._cancelTween?.();
        this._clearMotion();

        const fromPosition = this.camera.position.clone();
        const fromLookAt = this.lookAtTarget.clone();
        this._applyOrbitPosition();
        const toPosition = this.camera.position.clone();
        const toLookAt = this.lookAtTarget.clone();
        this.camera.position.copy(fromPosition);
        this.lookAtTarget.copy(fromLookAt);
        this.camera.lookAt(this.lookAtTarget);

        this._cancelTween = tween({
            from: { x: fromPosition.x, y: fromPosition.y, z: fromPosition.z, lx: fromLookAt.x, ly: fromLookAt.y, lz: fromLookAt.z },
            to: { x: toPosition.x, y: toPosition.y, z: toPosition.z, lx: toLookAt.x, ly: toLookAt.y, lz: toLookAt.z },
            duration: FLY_DURATION_MS,
            onUpdate: (v) => {
                this.camera.position.set(v.x, v.y, v.z);
                this.lookAtTarget.set(v.lx, v.ly, v.lz);
                this.camera.lookAt(this.lookAtTarget);
            },
            onComplete: () => emit('camera:flyToComplete', {})
        });
    }
}
