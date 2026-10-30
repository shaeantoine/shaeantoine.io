import * as THREE from 'three';
import { tween, easeReach, easeInOutCubic, easeOutCubic, easeOutQuint } from '../scene/tween.js';
import { DOLLY_DURATION_MS } from '../scene/CameraRig.js';
import { invalidate, invalidateShadows } from '../scene/renderScheduler.js';
import { instant as INSTANT } from './flags.js';
import { track } from './track.js';

/**
 * The site's one motion vocabulary. Every move goes through here, so the
 * desk moves with one hand — and so ?still=1 / prefers-reduced-motion can make
 * all of it land in a single frame.
 *
 *   camera   900 ms  easeReach        (DOLLY_DURATION_MS, the site's lean-in)
 *   pick     700 ms  easeOutCubic     pick up / put down, with a small arc
 *   put      700 ms  easeOutCubic
 *   turn     520 ms  easeInOutCubic   turn over about the item's vertical axis, 1–2 cm lift mid-turn
 *   slide    420 ms  easeOutCubic     slide / reveal
 *   reveal   420 ms  easeOutCubic
 *   lid      600 ms  easeInOutCubic
 *   intro   1800 ms  easeOutQuint     (the camera's opening push-in only)
 *
 * Every function returns a Promise<boolean>: true when the move completed,
 * false when it was cancelled. The promise also carries `.cancel()`.
 */

export const easings = Object.freeze({
    reach: easeReach,
    outCubic: easeOutCubic,
    inOutCubic: easeInOutCubic,
    outQuint: easeOutQuint,
    linear: (t) => t
});

export const presets = Object.freeze({
    camera: Object.freeze({ duration: DOLLY_DURATION_MS, easing: easeReach }),
    pick: Object.freeze({ duration: 700, easing: easeOutCubic }),
    put: Object.freeze({ duration: 700, easing: easeOutCubic }),
    turn: Object.freeze({ duration: 520, easing: easeInOutCubic }),
    slide: Object.freeze({ duration: 420, easing: easeOutCubic }),
    reveal: Object.freeze({ duration: 420, easing: easeOutCubic }),
    lid: Object.freeze({ duration: 600, easing: easeInOutCubic }),
    intro: Object.freeze({ duration: 1800, easing: easeOutQuint })
});

export const durations = Object.freeze(Object.fromEntries(
    Object.entries(presets).map(([name, preset]) => [name, preset.duration])
));

/** Suggested lift at mid-turn: 1.5 cm at 3.2 units/m. */
export const TURN_LIFT = 0.048;

let active = 0;

/** How many animations are running right now (settled() waits for zero). */
export function activeCount() {
    return active;
}

function resolvePreset({ preset, duration, easing }) {
    const base = preset ? presets[preset] : null;
    if (preset && !base) console.warn(`[desk:motion] Unknown preset "${preset}"`);
    return {
        duration: duration ?? base?.duration ?? 420,
        easing: easing ?? base?.easing ?? easeOutCubic
    };
}

/**
 * Interpolates numbers (or objects of numbers) from `from` to `to`.
 *
 * @param {object} spec
 * @param {number|object} spec.from
 * @param {number|object} spec.to
 * @param {string} [spec.preset] one of `presets`
 * @param {number} [spec.duration]
 * @param {(t:number)=>number} [spec.easing]
 * @param {(value, t:number, eased:number) => void} spec.onUpdate  eased value(s); t is raw 0..1
 * @param {boolean} [spec.movesGeometry=true] false only for camera/material-only changes (skips the shadow rebuild)
 * @param {boolean} [spec.instant] force instant (defaults to still / reduced motion)
 * @returns {Promise<boolean> & { cancel(): void }}
 */
export function animate({ from, to, preset, duration, easing, onUpdate, movesGeometry = true, instant = INSTANT }) {
    const scalar = typeof from === 'number';
    const fromObj = scalar ? { v: from } : from;
    const toObj = scalar ? { v: to } : to;
    const timing = resolvePreset({ preset, duration, easing });
    const emit = (current, t, eased) => {
        try {
            onUpdate?.(scalar ? current.v : current, t, eased);
        } catch (error) {
            console.error('[desk:motion] onUpdate threw; finishing the animation early', error);
            throw error;
        }
    };

    let cancelTween = null;
    let settle = null;
    const promise = new Promise((resolve) => { settle = resolve; });
    let done = false;
    const finish = (completed) => {
        if (done) return;
        done = true;
        active -= 1;
        settle(completed);
    };
    active += 1;

    if (instant || !(timing.duration > 0)) {
        try {
            emit({ ...toObj }, 1, 1);
        } catch { /* logged */ }
        (movesGeometry ? invalidateShadows : invalidate)();
        finish(true);
    } else {
        // tween() hands onUpdate the eased values; we also want raw t and the
        // eased scalar for arcs, so ease 0..1 ourselves and lerp here.
        cancelTween = tween({
            from: { k: 0 },
            to: { k: 1 },
            duration: timing.duration,
            easing: (t) => t,
            movesGeometry,
            onUpdate: ({ k }) => {
                const eased = timing.easing(k);
                const current = {};
                for (const key of Object.keys(fromObj)) {
                    current[key] = fromObj[key] + (toObj[key] - fromObj[key]) * eased;
                }
                try {
                    emit(current, k, eased);
                } catch {
                    cancelTween?.();
                    finish(false);
                }
            },
            onComplete: () => finish(true)
        });
    }

    promise.cancel = () => {
        cancelTween?.();
        finish(false);
    };
    track(promise, 'animation');
    return promise;
}

/** 0 at both ends, `height` at the middle — for arcs and mid-turn lifts. */
export function arc(t, height) {
    return 4 * t * (1 - t) * height;
}

/**
 * Moves an Object3D to a new position / quaternion / scale (any subset), with
 * an optional arc that rises and falls along `arcAxis` (world +Y by default).
 * Positions are in the object's PARENT space, as three always is.
 *
 *   await motion.moveObject(print, { position, quaternion, preset: 'pick', arc: 0.03 })
 */
export function moveObject(object, {
    position,
    quaternion,
    scale,
    preset = 'pick',
    duration,
    easing,
    arc: arcHeight = 0,
    arcAxis = new THREE.Vector3(0, 1, 0),
    onUpdate,
    instant = INSTANT
} = {}) {
    const p0 = object.position.clone();
    const q0 = object.quaternion.clone();
    const s0 = object.scale.clone();
    const p1 = position ? toVector(position) : p0.clone();
    const q1 = quaternion ? toQuaternion(quaternion) : q0.clone();
    const s1 = scale !== undefined ? (typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : toVector(scale)) : s0.clone();
    const axis = toVector(arcAxis).normalize();
    return animate({
        from: 0,
        to: 1,
        preset,
        duration,
        easing,
        instant,
        onUpdate: (eased, t) => {
            object.position.lerpVectors(p0, p1, eased);
            if (arcHeight) object.position.addScaledVector(axis, arc(eased, arcHeight));
            object.quaternion.slerpQuaternions(q0, q1, eased);
            object.scale.lerpVectors(s0, s1, eased);
            onUpdate?.(eased, t);
        }
    });
}

/**
 * Turns an object by `angle` about one of its OWN axes (local, default +Y — a
 * print held up to the camera turns over like a card), lifting it by `lift`
 * (default 1.5 cm) along `liftAxis` at mid-turn. `liftAxis` is in the object's
 * PARENT space, default +Y; pass the direction toward the camera to have the
 * item come toward the viewer as it turns. Deterministic direction, unlike a
 * 180° slerp.
 *
 *   await motion.turnOver(print, { liftAxis: towardCamera })
 */
export function turnOver(object, {
    angle = Math.PI,
    axis = new THREE.Vector3(0, 1, 0),
    lift = TURN_LIFT,
    liftAxis = new THREE.Vector3(0, 1, 0),
    preset = 'turn',
    duration,
    easing,
    onUpdate,
    instant = INSTANT
} = {}) {
    const q0 = object.quaternion.clone();
    const p0 = object.position.clone();
    const localAxis = toVector(axis).normalize();
    const up = toVector(liftAxis).normalize();
    const step = new THREE.Quaternion();
    return animate({
        from: 0,
        to: 1,
        preset,
        duration,
        easing,
        instant,
        onUpdate: (eased, t) => {
            step.setFromAxisAngle(localAxis, angle * eased);
            object.quaternion.copy(q0).multiply(step);
            object.position.copy(p0).addScaledVector(up, arc(eased, lift));
            onUpdate?.(eased, t);
        }
    });
}

/** Resolves after `ms` (immediately when instant). Tracked. */
export function wait(ms, { instant = INSTANT } = {}) {
    if (instant || !(ms > 0)) return Promise.resolve();
    return track(new Promise((resolve) => setTimeout(resolve, ms)), 'wait');
}

function toVector(value) {
    if (value?.isVector3) return value.clone();
    if (Array.isArray(value)) return new THREE.Vector3().fromArray(value);
    return new THREE.Vector3(value.x, value.y, value.z);
}

function toQuaternion(value) {
    if (value?.isQuaternion) return value.clone();
    if (value?.isEuler) return new THREE.Quaternion().setFromEuler(value);
    if (Array.isArray(value) && value.length === 4) return new THREE.Quaternion().fromArray(value);
    if (Array.isArray(value)) return new THREE.Quaternion().setFromEuler(new THREE.Euler(...value));
    throw new TypeError('quaternion must be a Quaternion, Euler, [x,y,z,w] or [rx,ry,rz]');
}

export const motion = {
    instant: INSTANT,
    presets,
    durations,
    easings,
    TURN_LIFT,
    animate,
    moveObject,
    turnOver,
    arc,
    wait,
    active: activeCount
};
