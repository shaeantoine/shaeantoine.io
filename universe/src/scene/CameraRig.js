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
// How far past a frame's min/maxRadius the camera can rubber-band into, as a
// fraction of the frame's own hard range — beyond this, resistance saturates
// and further zoom-out has no visible effect.
const ELASTIC_RANGE_FRACTION = 0.35;
// Sustained overshoot past this fraction of the elastic range, held for
// longer than RETURN_TRIGGER_MS, reads as "the user is trying to zoom out of
// this" rather than a casual overscroll — fires camera:overshootExit.
const RETURN_TRIGGER_FRACTION = 0.6;
const RETURN_TRIGGER_MS = 550;

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
        // How long frame.radius has sat sustained past the outer soft limit
        // — see _checkOvershootExit(), driven from update(dt).
        this._overshootMs = 0;

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

    /**
     * Enters free orbit around a landmark-bearing panel planet (today, CS) —
     * like enterCluster(), but the fit distance is derived from the
     * outermost satellite's orbit radius rather than a globe radius, so the
     * whole satellite system stays in frame at the frame's nominal radius.
     */
    enterOrbitCluster({ target, coreRadius, outermostOrbitRadius, minPolar, maxPolar, nominalRadius }) {
        const halfFovRad = THREE.MathUtils.degToRad(this.camera.fov / 2);
        const fitRadius = Math.max(coreRadius, outermostOrbitRadius);
        const fitDistance = fitRadius / Math.sin(halfFovRad);

        this.pushOrbitFrame({
            target,
            minPolar,
            maxPolar,
            nominalRadius: nominalRadius ?? fitDistance,
            minRadius: fitDistance * 0.5,
            maxRadius: fitDistance * 1.6
        });
    }

    /** Enters free orbit around a landmark-less panel planet (About Me) at a fixed viewing distance. */
    enterPlanetOrbit({ target, cameraDistance, minPolar, maxPolar }) {
        this.pushOrbitFrame({
            target,
            minPolar,
            maxPolar,
            nominalRadius: cameraDistance,
            minRadius: cameraDistance * 0.6,
            maxRadius: cameraDistance * 2.1
        });
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

    // Rather than a hard clamp at min/maxRadius, zooming past either bound
    // rubber-bands: resistance grows exponentially with how far past the
    // bound the frame already sits, so the first bit of overscroll moves
    // fairly freely and the last bit feels like hitting a wall. Zooming back
    // toward the bound isn't clamped either — it just isn't resisted, so the
    // same math naturally pulls the frame back under the bound once the user
    // reverses direction (see update()'s overshoot-exit check for what
    // happens if they instead hold deep in the outer band).
    _onZoom({ delta }) {
        if (!this.inputEnabled) return;
        const frame = this._frame;
        const rawDelta = delta * ZOOM_SPEED;
        const elasticRange = (frame.maxRadius - frame.minRadius) * ELASTIC_RANGE_FRACTION;

        let nextRadius = frame.radius + rawDelta;

        if (nextRadius > frame.maxRadius) {
            const overshoot = Math.max(0, frame.radius - frame.maxRadius);
            const resistance = Math.exp(-overshoot / elasticRange);
            nextRadius = Math.min(frame.radius + rawDelta * resistance, frame.maxRadius + elasticRange);
        } else if (nextRadius < frame.minRadius) {
            const overshoot = Math.max(0, frame.minRadius - frame.radius);
            const resistance = Math.exp(-overshoot / elasticRange);
            nextRadius = Math.max(frame.radius + rawDelta * resistance, frame.minRadius - elasticRange);
        }

        frame.radius = nextRadius;
        this._applyOrbitPosition();
    }

    // Sustained zoom-out deep into the outer elastic band reads as "leave
    // this frame," not just an overscroll — emits camera:overshootExit once,
    // then resets so it can fire again on a later approach. Only the outer
    // (zoom-out) band triggers this; zooming in past the inner limit is
    // never treated as an exit gesture.
    _checkOvershootExit(dt) {
        const frame = this._frame;
        const elasticRange = (frame.maxRadius - frame.minRadius) * ELASTIC_RANGE_FRACTION;
        const overshoot = frame.radius - frame.maxRadius;

        if (overshoot > elasticRange * RETURN_TRIGGER_FRACTION) {
            this._overshootMs += dt * 1000;
            if (this._overshootMs > RETURN_TRIGGER_MS) {
                this._overshootMs = 0;
                emit('camera:overshootExit', {});
            }
        } else {
            this._overshootMs = 0;
        }
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

        // A fly/return tween owns camera.position directly while
        // inputEnabled is false — don't let leftover glide fight it, and
        // there's no user-driven overshoot to track mid-tween either.
        if (!this.inputEnabled) return;

        this._checkOvershootExit(dt);

        if (this.autoRotate) {
            frame.azimuth += dt * 0.05;
            this._applyOrbitPosition();
            return;
        }

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
        this._overshootMs = 0;
    }

    /**
     * Shared tween core: moves the camera from wherever it is to
     * `toPosition`, panning lookAt from wherever it was to `toLookAt` over
     * the same duration. Emits 'camera:flyToComplete' when done.
     * `_flyToFocusPoint` reduces to this once it's picked its own
     * `toPosition`/`toLookAt`.
     */
    _flyTo(toPosition, toLookAt) {
        this._cancelTween?.();
        this.inputEnabled = false;
        this.autoRotate = false;
        this._clearMotion();

        const fromPosition = this.camera.position.clone();
        const fromLookAt = this.lookAtTarget.clone();

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

    /**
     * Tweens the camera from wherever it is to look at `targetPosition` from
     * `distance` away, roughly along the current viewing direction. Only
     * used by flyToPlanet() now — leaving the solar frame for a body's
     * location isn't an "orbit around something" motion, so there's no
     * frame to sweep. flyToLandmark() below is the frame-aware sibling used
     * once a body's orbit frame already exists.
     */
    _flyToFocusPoint(targetPosition, distance) {
        const fromPosition = this.camera.position.clone();
        const direction = fromPosition.clone().sub(targetPosition).normalize();
        const toPosition = targetPosition.clone().add(direction.multiplyScalar(distance));
        this._flyTo(toPosition, targetPosition);
    }

    /**
     * Flies to a landmark (a country slot or an orbiting satellite) of the
     * body currently at the top of the orbit-frame stack, by sweeping the
     * frame's own azimuth/polar/radius toward the landmark's bearing rather
     * than cutting a straight line across space — so if the camera starts
     * on the far side of the body, it visibly orbits around to reach the
     * landmark instead of appearing to clip through the body. `lookAtPosition`
     * is the landmark's own world position (what the camera ends up looking
     * at); `distance` is how far beyond it (along the same bearing) the
     * camera parks.
     *
     * Shared core for flyToSlot()/flyToSatellite() — the only difference
     * between them is how `lookAtPosition`/`distance` are derived.
     */
    flyToLandmark(lookAtPosition, distance) {
        this._cancelTween?.();
        this.inputEnabled = false;
        this.autoRotate = false;
        this._clearMotion();

        const frame = this._frame;
        const offset = lookAtPosition.clone().sub(frame.target);
        const radiusFromCenter = offset.length();
        const toPolar = Math.acos(THREE.MathUtils.clamp(offset.y / radiusFromCenter, -1, 1));
        const rawToAzimuth = Math.atan2(offset.x, offset.z);

        // Shortest signed path from the frame's current azimuth to the
        // landmark's — without this, a naive lerp could sweep the "long way"
        // around whenever the raw angle difference exceeds half a turn.
        const rawDelta = rawToAzimuth - frame.azimuth;
        const shortestDelta = rawDelta - Math.round(rawDelta / (2 * Math.PI)) * 2 * Math.PI;
        const toAzimuth = frame.azimuth + shortestDelta;
        const toRadius = radiusFromCenter + distance;

        const fromAzimuth = frame.azimuth;
        const fromPolar = frame.polar;
        const fromRadius = frame.radius;
        const fromLookAt = this.lookAtTarget.clone();

        this._cancelTween = tween({
            from: { azimuth: fromAzimuth, polar: fromPolar, radius: fromRadius, lx: fromLookAt.x, ly: fromLookAt.y, lz: fromLookAt.z },
            to: { azimuth: toAzimuth, polar: toPolar, radius: toRadius, lx: lookAtPosition.x, ly: lookAtPosition.y, lz: lookAtPosition.z },
            duration: FLY_DURATION_MS,
            onUpdate: (v) => {
                frame.azimuth = v.azimuth;
                frame.polar = v.polar;
                frame.radius = v.radius;
                const sinPolar = Math.sin(v.polar);
                this.camera.position.set(
                    frame.target.x + v.radius * sinPolar * Math.sin(v.azimuth),
                    frame.target.y + v.radius * Math.cos(v.polar),
                    frame.target.z + v.radius * sinPolar * Math.cos(v.azimuth)
                );
                this.lookAtTarget.set(v.lx, v.ly, v.lz);
                this.camera.lookAt(this.lookAtTarget);
            },
            onComplete: () => {
                // Deliberately leaves frame.radius at the close-up toRadius,
                // matching where the camera actually is — resetting it to
                // nominalRadius here (as an earlier version did) desynced
                // frame.radius from the real camera position, so cycling
                // straight to another landmark would read fromRadius as the
                // wide nominal distance and jump the camera out to it before
                // tweening back in. See resetFrameRadius() for the one place
                // that reset genuinely belongs: right before returnToOrbit()
                // when actually leaving a focused landmark for free orbit.
                emit('camera:flyToComplete', {});
            }
        });
    }

    /** Resets the current top orbit frame's radius to its nominal (wide) framing — call right before returnToOrbit() when closing a focused landmark's panel, so the zoom-out tweens smoothly from the landmark's close radius rather than snapping. */
    resetFrameRadius() {
        this._frame.radius = this._frame.nominalRadius;
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
        this.flyToLandmark(target, slot.cameraDistance * this.islandScale);
    }

    /** Flies to a planet body at `worldPosition` (see orbitCoords.js), framing it from body.cameraDistance away. */
    flyToPlanet(body, worldPosition) {
        const distance = body.cameraDistance ?? body.cluster?.orbitRadius ?? 12;
        this._flyToFocusPoint(worldPosition, distance);
    }

    /**
     * Camera-to-object distance needed so a bounding sphere of `boundingRadius`
     * fits inside the camera's vertical field of view, with `marginFactor`
     * extra breathing room beyond a tight fit (1 = sphere exactly touches the
     * frame's top/bottom edges). Lets flyToSatellite's framing scale with
     * each satellite's real rendered size (boundingRadius is measured post-
     * scale, from PlanetLoader.getSatelliteBoundingRadius) instead of one
     * fixed distance shared across every satellite regardless of size — the
     * mismatch that clipped CS's larger satellites when framed at Earth
     * islands' fixed close-up distance.
     */
    framingDistanceFor(boundingRadius, marginFactor = 1.6) {
        const halfFovRad = THREE.MathUtils.degToRad(this.camera.fov / 2);
        return (boundingRadius / Math.sin(halfFovRad)) * marginFactor;
    }

    /** Flies to an orbiting satellite's current world position, framing it from `distance` away — pass CameraRig.framingDistanceFor(boundingRadius) so the framing scales with the satellite's real size; the default only covers a caller that has no bounding radius to give. */
    flyToSatellite(worldPosition, distance = 6) {
        this.flyToLandmark(worldPosition, distance);
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
