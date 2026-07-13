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
 * Orbits a camera around the globe (spherical coordinates around
 * `orbitTarget`, the globe center), and tweens to/from a focused slot's
 * framing on demand. Drag/zoom input only takes effect while `inputEnabled`
 * is true — WorldStateMachine toggles that as it enters/exits ORBITING.
 */
export class CameraRig {
    constructor(camera, cameraConfig) {
        this.camera = camera;
        this.orbitTarget = new THREE.Vector3(...cameraConfig.clusterOrbitTarget);
        this.minPolar = cameraConfig.clusterOrbitMinPolar;
        this.maxPolar = cameraConfig.clusterOrbitMaxPolar;
        this.globeRadius = cameraConfig.globeRadius;
        this.islandScale = cameraConfig.islandScale ?? 1;

        this.azimuth = 0;
        this.polar = (this.minPolar + this.maxPolar) / 2;
        this.radius = cameraConfig.clusterOrbitRadius;
        this.nominalRadius = cameraConfig.clusterOrbitRadius;
        this.azimuthAccum = 0;
        this.polarAccum = 0;
        this.azimuthVelocity = 0;
        this.polarVelocity = 0;
        this._dragActiveThisFrame = false;

        // Distance at which the globe's silhouette exactly fills the
        // camera's vertical FOV — anything closer clips it against the
        // screen edges. Deriving min/max from this (rather than arbitrary
        // globeRadius multiples) keeps them correct if globeRadius or the
        // camera's fov ever change.
        const halfFovRad = THREE.MathUtils.degToRad(camera.fov / 2);
        const fitDistance = this.globeRadius / Math.sin(halfFovRad);
        this.minRadius = fitDistance * 0.6;
        this.maxRadius = fitDistance * 2.1;

        this.lookAtTarget = this.orbitTarget.clone();
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

    /** Resumes idle auto-rotate — called when returning to the default orbit view. */
    resumeAutoRotate() {
        this.autoRotate = true;
        this._clearMotion();
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
        const speedScale = this.radius / this.nominalRadius;
        this.azimuthAccum -= dx * DRAG_ROTATE_SPEED * speedScale;
        this.polarAccum -= dy * DRAG_ROTATE_SPEED * speedScale;
        this._dragActiveThisFrame = true;
    }

    _onZoom({ delta }) {
        if (!this.inputEnabled) return;
        this.radius = THREE.MathUtils.clamp(
            this.radius + delta * ZOOM_SPEED,
            this.minRadius,
            this.maxRadius
        );
        this._applyOrbitPosition();
    }

    _applyOrbitPosition() {
        // Always re-anchor to the globe center — lookAtTarget gets diverted
        // to a slot's position during flyToSlot(), and nothing else resets
        // it. Every caller of this method represents genuine orbit state, so
        // it's always correct to snap the gaze back here.
        this.lookAtTarget.copy(this.orbitTarget);
        const sinPolar = Math.sin(this.polar);
        this.camera.position.set(
            this.orbitTarget.x + this.radius * sinPolar * Math.sin(this.azimuth),
            this.orbitTarget.y + this.radius * Math.cos(this.polar),
            this.orbitTarget.z + this.radius * sinPolar * Math.cos(this.azimuth)
        );
        this.camera.lookAt(this.lookAtTarget);
    }

    /** Called every frame by main.js. Advances idle auto-rotate, applies this frame's accumulated drag, or decays/applies post-release glide velocity. */
    update(dt) {
        if (this.autoRotate) {
            this.azimuth += dt * 0.05;
            this._applyOrbitPosition();
            return;
        }

        // A flyToSlot/returnToOrbit tween owns camera.position directly while
        // inputEnabled is false — don't let leftover glide fight it.
        if (!this.inputEnabled) return;

        if (this._dragActiveThisFrame) {
            const safeDt = Math.max(dt, 1e-4);
            this.azimuth += this.azimuthAccum;
            const prevPolar = this.polar;
            this.polar = THREE.MathUtils.clamp(this.polar + this.polarAccum, this.minPolar, this.maxPolar);

            // Glide velocity for once dragging stops: this frame's applied
            // rotation over this frame's duration.
            this.azimuthVelocity = this.azimuthAccum / safeDt;
            this.polarVelocity = (this.polar - prevPolar) / safeDt;

            this.azimuthAccum = 0;
            this.polarAccum = 0;
            this._dragActiveThisFrame = false;

            this._applyOrbitPosition();
            return;
        }

        if (Math.abs(this.azimuthVelocity) < VELOCITY_EPSILON && Math.abs(this.polarVelocity) < VELOCITY_EPSILON) {
            return;
        }

        this.azimuth += this.azimuthVelocity * dt;
        this.polar = THREE.MathUtils.clamp(this.polar + this.polarVelocity * dt, this.minPolar, this.maxPolar);
        const decay = Math.exp(-DAMPING_RATE * dt);
        this.azimuthVelocity *= decay;
        this.polarVelocity *= decay;

        this._applyOrbitPosition();
    }

    // Clears all pending/residual rotation state — used whenever something
    // else (a tween, or auto-rotate resuming) is about to take over camera
    // motion, so no stale drag/glide state reappears once it hands back.
    _clearMotion() {
        this.azimuthAccum = 0;
        this.polarAccum = 0;
        this.azimuthVelocity = 0;
        this.polarVelocity = 0;
        this._dragActiveThisFrame = false;
    }

    /**
     * Tweens the camera from its current orbit framing to look at a slot's
     * `cameraTarget` from `cameraDistance` away, roughly along the current
     * viewing direction. Emits 'camera:flyToComplete' when done.
     */
    flyToSlot(slot) {
        this._cancelTween?.();
        this.inputEnabled = false;
        this.autoRotate = false;
        this._clearMotion();

        const fromPosition = this.camera.position.clone();
        const fromLookAt = this.lookAtTarget.clone();

        // Island content (shape/landmark/props) is scaled up by islandScale
        // inside ZoneLoader — scale the focused framing the same way so it
        // stays proportionate rather than sitting too close/low against a
        // now-bigger island.
        const target = latLonToVector3(
            slot.position.lat,
            slot.position.lon,
            this.globeRadius + slot.cameraTargetHeight * this.islandScale
        );
        const direction = fromPosition.clone().sub(target).normalize();
        const toPosition = target.clone().add(direction.multiplyScalar(slot.cameraDistance * this.islandScale));

        this._cancelTween = tween({
            from: { x: fromPosition.x, y: fromPosition.y, z: fromPosition.z, lx: fromLookAt.x, ly: fromLookAt.y, lz: fromLookAt.z },
            to: { x: toPosition.x, y: toPosition.y, z: toPosition.z, lx: target.x, ly: target.y, lz: target.z },
            duration: FLY_DURATION_MS,
            onUpdate: (v) => {
                this.camera.position.set(v.x, v.y, v.z);
                this.lookAtTarget.set(v.lx, v.ly, v.lz);
                this.camera.lookAt(this.lookAtTarget);
            },
            onComplete: () => emit('camera:flyToComplete', {})
        });
    }

    /** Tweens back to the default cluster-orbit framing. Emits 'camera:flyToComplete' when done. */
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
