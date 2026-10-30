import * as THREE from 'three';
import {
    MAT, MAT_TOP, BOARD, BOARD_TOP, PADS, PAD_R, PAD_TOP, TAG, TIE_CORNER, STRING_R
} from './layout.js';

/**
 * Cables and string that lie on things. Pure maths (mm, group-local), no DOM:
 * the leads are routed in PLAN and then draped over whatever is under them —
 * the mat, a pad, the tag — so a lead that crosses a pad rides up over it
 * rather than through it. The tag's string is solved for a fixed length
 * between the knot on the board and the tag, so it lies slack on the mat when
 * the tag is down and hangs in a sag when the tag is held up.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** A rectangle footprint lying on the mat (the tag at rest): centre, half sizes, yaw. */
export function footprint({ x, z, yaw }, w, d) {
    return { x, z, yaw, hw: w / 2, hd: d / 2 };
}

function insideFootprint(f, x, z) {
    const dx = x - f.x;
    const dz = z - f.z;
    // Into the footprint's frame (a +yaw rotation about +Y maps local +x to (cos, -sin)).
    const u = dx * Math.cos(f.yaw) - dz * Math.sin(f.yaw);
    const v = dx * Math.sin(f.yaw) + dz * Math.cos(f.yaw);
    return Math.abs(u) <= f.hw && Math.abs(v) <= f.hd;
}

/** Height of the top surface at (x, z): the mat, the breadboard, a pad, or the lying tag. */
export function surfaceAt(x, z, { tag = null } = {}) {
    let y = Math.abs(x) <= MAT.w / 2 && Math.abs(z) <= MAT.d / 2 ? MAT_TOP : 0;
    if (Math.abs(x - BOARD.x) <= BOARD.w / 2 && Math.abs(z - BOARD.z) <= BOARD.d / 2) y = Math.max(y, BOARD_TOP);
    for (const pad of PADS) {
        if ((x - pad.x) ** 2 + (z - pad.z) ** 2 <= PAD_R * PAD_R) y = Math.max(y, PAD_TOP);
    }
    if (tag && insideFootprint(tag, x, z)) y = Math.max(y, MAT_TOP + TAG.t + 0.05);
    return y;
}

const smooth = (t) => t * t * (3 - 2 * t);

/**
 * A lead routed through `points` ([x, z] pairs, mm) and draped: each sample
 * sits on the surface below it. `start`/`end` lift the first/last stretch off
 * the surface to a fixed height (a plug, a connector) and ease it down.
 *
 * @returns {THREE.Vector3[]} mm, group-local, ~every 2 mm
 */
export function drapedPath(points, radius, { start, end, step = 2 } = {}) {
    const plan = new THREE.CatmullRomCurve3(points.map(([x, z]) => V(x, 0, z)), false, 'centripetal');
    const length = plan.getLength();
    const count = Math.max(8, Math.ceil(length / step));
    const out = [];
    for (let i = 0; i <= count; i += 1) {
        const t = i / count;
        const p = plan.getPointAt(t);
        const s = t * length;
        let y = surfaceAt(p.x, p.z) + radius;
        if (start && s < start.length) y = Math.max(y, start.y + (y - start.y) * smooth(s / start.length));
        if (end && length - s < end.length) y = Math.max(y, end.y + (y - end.y) * smooth((length - s) / end.length));
        out.push(V(p.x, y, p.z));
    }
    return out;
}

// ---------------------------------------------------------------------------
// The tag's string
// ---------------------------------------------------------------------------

/** The knot: on the breadboard's front face, just in from its front-right corner. */
export const KNOT = Object.freeze(V(TIE_CORNER[0] - 6, MAT_TOP + BOARD.h * 0.55, TIE_CORNER[1] + 0.9));
/** The direction the string leaves the knot in: out of the front face, a little right, a little down. */
const KNOT_OUT = V(0.35, -0.25, 1).normalize();

/**
 * The closed loop of string round the board's corner (mm, group-local): over
 * the top across the corner, down both faces, back under.
 */
export function cornerLoopPoints() {
    const [cx, cz] = TIE_CORNER;
    const inset = 6;
    const r = STRING_R;
    const top = BOARD_TOP + r * 0.8;
    const mid = MAT_TOP + BOARD.h / 2;
    const under = MAT_TOP + r;
    return [
        V(cx - inset, top, cz + r * 0.6),
        V(cx - inset / 2, top + 0.1, cz - inset / 2),
        V(cx + r * 0.6, top, cz - inset),
        V(cx + r * 0.9, mid, cz - inset),
        V(cx + r * 0.6, under, cz - inset),
        V(cx - inset / 2, under, cz - inset / 2),
        V(cx - inset, under, cz + r * 0.6),
        V(cx - inset, mid, cz + r * 0.9)
    ];
}

function bezier(p0, p1, p2, p3, t, out) {
    const u = 1 - t;
    return out.set(0, 0, 0)
        .addScaledVector(p0, u * u * u)
        .addScaledVector(p1, 3 * u * u * t)
        .addScaledVector(p2, 3 * u * t * t)
        .addScaledVector(p3, t * t * t);
}

function tailSamples(exit, exitOut, reach, { tag, count }) {
    const down = V(0, -1, 0);
    const c1 = KNOT.clone().addScaledVector(KNOT_OUT, reach * 0.55).addScaledVector(down, reach * 0.45);
    const c2 = exit.clone().addScaledVector(exitOut, reach * 0.45).addScaledVector(down, reach * 0.7);
    const points = [];
    const p = V(0, 0, 0);
    for (let i = 0; i <= count; i += 1) {
        bezier(KNOT, c1, c2, exit, i / count, p);
        const floor = surfaceAt(p.x, p.z, { tag }) + STRING_R;
        points.push(V(p.x, Math.max(p.y, floor), p.z));
    }
    return points;
}

function polylineLength(points) {
    let length = 0;
    for (let i = 1; i < points.length; i += 1) length += points[i].distanceTo(points[i - 1]);
    return length;
}

/**
 * How long the tail is for a given exit point: ≈ 1.3 × the gap while the tag
 * lies on the mat (a lazy curve, never a self-crossing loop), `held` mm (or
 * 12% more than the gap) once it is up in the air, eased by its height.
 */
export function stringLengthFor(exit, held) {
    const direct = KNOT.distanceTo(exit);
    const lying = direct * 1.3;
    const up = Math.max(held, direct * 1.12);
    const t = smooth(Math.min(1, Math.max(0, (exit.y - MAT_TOP) / 30)));
    return lying + (up - lying) * t;
}

/**
 * The string's tail from the knot to where it leaves the tag, `length` mm
 * long: a curve that bellies out of the knot and the tag's end and droops
 * under gravity, clamped to whatever is below it (so its slack lies on the mat).
 *
 * @param {THREE.Vector3} exit   mm, group-local — the far side of the loop round the tag's end
 * @param {THREE.Vector3} exitOut unit vector: the way the string leaves the tag (its -x, in group axes)
 * @param {number} length mm
 * @param {{ tag?: object }} [options] the lying tag's footprint, so the string rides over it
 * @returns {{ points: THREE.Vector3[], length: number, taut: boolean }}
 */
export function stringTail(exit, exitOut, length, { tag = null, count = 40 } = {}) {
    const direct = KNOT.distanceTo(exit);
    if (direct >= length * 0.98) {
        const points = tailSamples(exit, exitOut, direct * 0.05, { tag, count });
        return { points, length: polylineLength(points), taut: true };
    }
    let lo = 0;
    let hi = length * 1.5;
    let best = null;
    for (let i = 0; i < 26; i += 1) {
        const reach = (lo + hi) / 2;
        const points = tailSamples(exit, exitOut, reach, { tag, count });
        const l = polylineLength(points);
        best = { points, length: l, taut: false };
        if (l > length) hi = reach; else lo = reach;
    }
    return best;
}
