import * as THREE from 'three';
import { BODY, SLOT, PAPER, PATH } from './spec.js';

/**
 * The receipt as geometry: a centreline, and a strip of paper laid along it.
 *
 * DOM-free (node imports it to check where the paper goes).
 *
 * THE CONVEYOR MODEL. The draped path is fixed in the printer's frame; the
 * paper slides along it. With `visible` metres of paper out of the slot, the
 * point `p` from the paper's tip sits at path position s = visible − p. So
 * "extruding" is one number growing, the tip leads, and every printed line
 * travels the same route the one before it did — out of the slot, over the
 * tear bar, down the front, onto the desk.
 *
 * TEXTURE. v = p / length: v = 0 at the tip (the canvas's bottom row — the
 * blank tail), v = 1 at the header end (the canvas's top row, nearest the
 * slot). u runs across the paper with local +X, so the type reads upright and
 * unmirrored to someone standing in front of the printer.
 *
 * FACES. Two skins (front: printed, back: plain) either side of the centre
 * surface, each single-sided with its own outward normal — which is what
 * GTAO's normal prepass and the shadow pass both handle correctly, and what a
 * DoubleSide sheet would not.
 */

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// Centrelines
// ---------------------------------------------------------------------------

/**
 * A dense 2D polyline (a, h) sampled by arc length, where a is "forward" and h
 * is "up". Built from straight runs and circular arcs by heading.
 */
function polylineBuilder(start, heading) {
    const A = [start[0]];
    const H = [start[1]];
    let a = start[0];
    let h = start[1];
    let phi = heading;
    const STEP = 0.0006;
    const marks = {};
    let length = 0;

    function push() {
        A.push(a);
        H.push(h);
    }
    return {
        straight(len) {
            const n = Math.max(1, Math.ceil(len / STEP));
            const da = (Math.cos(phi) * len) / n;
            const dh = (Math.sin(phi) * len) / n;
            for (let i = 0; i < n; i += 1) { a += da; h += dh; push(); }
            length += len;
            return this;
        },
        /** Turn to heading `to` along a circle of radius r (ccw if to > phi). */
        arc(r, to) {
            const sweep = to - phi;
            const len = Math.abs(sweep) * r;
            const n = Math.max(2, Math.ceil(len / STEP));
            const dir = Math.sign(sweep);
            // Centre: to the left of the tangent for a ccw turn, right for cw.
            const ca = a + dir * -Math.sin(phi) * r;
            const ch = h + dir * Math.cos(phi) * r;
            for (let i = 1; i <= n; i += 1) {
                const p = phi + (sweep * i) / n;
                a = ca + dir * Math.sin(p) * r;
                h = ch - dir * Math.cos(p) * r;
                push();
            }
            phi = to;
            length += len;
            return this;
        },
        /** A straight run along the current heading whose height is bumped by fn(u), u ∈ [0, 1]. */
        bumped(len, fn) {
            const n = Math.max(1, Math.ceil(len / STEP));
            const a0 = a;
            const h0 = h;
            for (let i = 1; i <= n; i += 1) {
                const u = i / n;
                a = a0 + Math.cos(phi) * len * u;
                h = h0 + Math.sin(phi) * len * u + fn(u);
                push();
            }
            h -= fn(1);
            length += len;
            return this;
        },
        mark(name) {
            marks[name] = length;
            return this;
        },
        get heading() { return phi; },
        get point() { return [a, h]; },
        build() {
            return sampler(A, H, marks);
        }
    };
}

/** Arc-length sampling of a polyline: at(s) → { a, h, ta, th }. */
function sampler(A, H, marks) {
    const S = new Float64Array(A.length);
    for (let i = 1; i < A.length; i += 1) S[i] = S[i - 1] + Math.hypot(A[i] - A[i - 1], H[i] - H[i - 1]);
    const total = S[S.length - 1];
    function locate(s) {
        let lo = 0;
        let hi = S.length - 1;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (S[mid] <= s) lo = mid; else hi = mid;
        }
        return lo;
    }
    function at(s, out = {}) {
        const c = Math.min(total, Math.max(0, s));
        const i = Math.min(S.length - 2, locate(c));
        const seg = S[i + 1] - S[i] || 1;
        const t = (c - S[i]) / seg;
        let ta = (A[i + 1] - A[i]) / seg;
        let th = (H[i + 1] - H[i]) / seg;
        const n = Math.hypot(ta, th) || 1;
        ta /= n; th /= n;
        // Past either end: extrapolate straight along the end tangent.
        const over = s - c;
        out.a = A[i] + (A[i + 1] - A[i]) * t + ta * over;
        out.h = H[i] + (H[i + 1] - H[i]) * t + th * over;
        out.ta = ta;
        out.th = th;
        return out;
    }
    return { at, total, marks };
}

/**
 * The drape in the printer's local (z, y) plane, s = 0 at the slot's lip.
 * `at(s)` → { a: z, h: y, ta, th }. `marks` gives the s where each stretch
 * ends (arch, drop, bend, flat, curl) for the receipt layout and for checks.
 */
export function buildDrapePath({ length = PAPER.length } = {}) {
    const H = BODY.height;
    const drop = PATH.dropDeg * DEG;
    const curl = PATH.curlDeg * DEG;
    const archLen = PATH.r1 * (Math.PI / 2 + drop);
    const archEndY = H + PATH.r1 * Math.cos(drop);
    const bendStartY = PAPER.restY + PATH.r2 * (1 - Math.cos(drop));
    const dropLen = (archEndY - bendStartY) / Math.sin(drop);
    const bendLen = PATH.r2 * drop;
    const curlLen = PATH.r3 * curl;
    const flatLen = length - archLen - dropLen - bendLen - curlLen;
    if (!(flatLen > 0.02)) throw new RangeError(`receipt too short to lie on the desk (flat ${flatLen.toFixed(3)})`);

    const b = polylineBuilder([SLOT.z, H - PATH.inside], Math.PI / 2)
        .straight(PATH.inside).mark('slot')
        .arc(PATH.r1, -drop).mark('arch')
        .straight(dropLen).mark('drop')
        .arc(PATH.r2, 0).mark('bend')
        .bumped(flatLen, (u) => PATH.hump * Math.sin(Math.PI * u) ** 2).mark('flat')
        .arc(PATH.r3, curl).mark('curl')
        .straight(PATH.extra);
    const path = b.build();
    const offset = path.marks.slot; // s is measured from the slot's lip
    const marks = Object.fromEntries(Object.entries(path.marks).map(([k, v]) => [k, v - offset]));
    return {
        at: (s, out) => path.at(s + offset, out),
        marks,
        length,
        start: -PATH.inside,
        lengths: { arch: archLen, drop: dropLen, bend: bendLen, flat: flatLen, curl: curlLen }
    };
}

/**
 * A torn-off receipt lying on the desk: the header end lifted a little, a
 * faint hump, the tip curled. (a, h) with a = 0 at the header end.
 */
export function buildLyingPath({ length = PAPER.length } = {}) {
    const headLift = 30 * DEG;
    const r0 = 0.06;
    const tipCurl = 48 * DEG;
    const r1 = 0.055;
    const flatLen = length - r0 * headLift - r1 * tipCurl;
    const startH = PAPER.restY + r0 * (1 - Math.cos(headLift));
    const path = polylineBuilder([0, startH], -headLift)
        .arc(r0, 0)
        .bumped(flatLen, (u) => 0.006 * Math.sin(Math.PI * u) ** 2)
        .arc(r1, tipCurl)
        .straight(PATH.extra)
        .build();
    // Extend backwards past a = 0 for the header's serrations.
    return {
        at: (s, out) => path.at(s, out),
        length,
        start: 0
    };
}

// ---------------------------------------------------------------------------
// The strip
// ---------------------------------------------------------------------------

/**
 * Allocates a paper strip: a rows × cols grid, serrations on the tip end (and
 * the header end when `headerTeeth`), front and back skins sharing UVs.
 * @returns {{ front: THREE.BufferGeometry, back: THREE.BufferGeometry, rows, cols, headerTeeth, count }}
 */
export function createStrip({ rows = PAPER.rows, cols = PAPER.teeth + 1, headerTeeth = false } = {}) {
    const teeth = cols - 1;
    const grid = rows * cols;
    const count = grid + teeth + (headerTeeth ? teeth : 0);
    const uv = new THREE.BufferAttribute(new Float32Array(count * 2), 2);

    const quads = [];
    for (let r = 0; r < rows - 1; r += 1) {
        for (let c = 0; c < cols - 1; c += 1) {
            const i = r * cols + c;
            // (r,c) → (r+1,c) → (r,c+1): faces along T × X = N, the printed side.
            quads.push(i, i + cols, i + 1, i + cols, i + cols + 1, i + 1);
        }
    }
    const tipRow = (rows - 1) * cols;
    for (let k = 0; k < teeth; k += 1) quads.push(tipRow + k, grid + k, tipRow + k + 1);
    if (headerTeeth) {
        for (let k = 0; k < teeth; k += 1) quads.push(k + 1, grid + teeth + k, k);
    }
    const reversed = [];
    for (let i = 0; i < quads.length; i += 3) reversed.push(quads[i], quads[i + 2], quads[i + 1]);

    const make = (index) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        g.setAttribute('uv', uv);
        g.setIndex(index);
        g.attributes.position.setUsage(THREE.DynamicDrawUsage);
        g.attributes.normal.setUsage(THREE.DynamicDrawUsage);
        return g;
    };
    return { front: make(quads), back: make(reversed), rows, cols, teeth, headerTeeth, count, grid };
}

const tmp = {};

/**
 * Lays a strip along a centreline.
 *
 * @param {object} strip createStrip()
 * @param {object} o
 * @param {number} o.s0 path position of the first row (header end)
 * @param {number} o.s1 path position of the last row (tip)
 * @param {(s:number) => number} o.vOf texture v for path position s
 * @param {(s:number, f:object) => void} o.frameAt fills f.{cx,cy,cz, tx,ty,tz, xx,xy,xz} — centre,
 *        unit tangent toward the tip, unit across-axis (N = T × X is the printed side)
 * @param {Float32Array} [o.frontOut] write here instead of the geometry (for morphs)
 * @param {Float32Array} [o.backOut]
 */
export function layStrip(strip, { s0, s1, vOf, frameAt, frontOut, backOut, width = PAPER.width, halfThickness = PAPER.halfThickness, cup = PAPER.cup, tooth = PAPER.tooth }) {
    const { rows, cols, teeth, grid, headerTeeth } = strip;
    const fp = frontOut ?? strip.front.attributes.position.array;
    const bp = backOut ?? strip.back.attributes.position.array;
    const fn = strip.front.attributes.normal.array;
    const bn = strip.back.attributes.normal.array;
    const uv = strip.front.attributes.uv.array;
    const f = tmp;

    const put = (index, s, x, v) => {
        frameAt(s, f);
        // N = T × X
        const nx = f.ty * f.xz - f.tz * f.xy;
        const ny = f.tz * f.xx - f.tx * f.xz;
        const nz = f.tx * f.xy - f.ty * f.xx;
        const q = (2 * x) / width;
        const k = cup * q * q;
        const slope = (8 * cup * x) / (width * width);
        const px = f.cx + x * f.xx + k * nx;
        const py = f.cy + x * f.xy + k * ny;
        const pz = f.cz + x * f.xz + k * nz;
        let mx = nx - slope * f.xx;
        let my = ny - slope * f.xy;
        let mz = nz - slope * f.xz;
        const ml = Math.hypot(mx, my, mz) || 1;
        mx /= ml; my /= ml; mz /= ml;
        const o = index * 3;
        fp[o] = px + halfThickness * nx; fp[o + 1] = py + halfThickness * ny; fp[o + 2] = pz + halfThickness * nz;
        bp[o] = px - halfThickness * nx; bp[o + 1] = py - halfThickness * ny; bp[o + 2] = pz - halfThickness * nz;
        if (!frontOut) {
            fn[o] = mx; fn[o + 1] = my; fn[o + 2] = mz;
            bn[o] = -mx; bn[o + 1] = -my; bn[o + 2] = -mz;
        }
        const u = (x + width / 2) / width;
        uv[index * 2] = u;
        uv[index * 2 + 1] = Math.min(1, Math.max(0, v));
    };

    for (let r = 0; r < rows; r += 1) {
        const s = s0 + ((s1 - s0) * r) / (rows - 1);
        const v = vOf(s);
        for (let c = 0; c < cols; c += 1) put(r * cols + c, s, -width / 2 + (width * c) / (cols - 1), v);
    }
    const pitch = width / teeth;
    for (let k = 0; k < teeth; k += 1) put(grid + k, s1 + tooth, -width / 2 + pitch * (k + 0.5), vOf(s1 + tooth));
    if (headerTeeth) {
        for (let k = 0; k < teeth; k += 1) put(grid + teeth + k, s0 - tooth, -width / 2 + pitch * (k + 0.5), vOf(s0 - tooth));
    }
    if (!frontOut) {
        for (const g of [strip.front, strip.back]) {
            g.attributes.position.needsUpdate = true;
            g.attributes.normal.needsUpdate = true;
            g.computeBoundingSphere();
            g.computeBoundingBox();
        }
        strip.front.attributes.uv.needsUpdate = true;
    }
}

/** frameAt for the drape, in the printer's local frame (X across = local +X). */
export function drapeFrame(path) {
    const p = {};
    return (s, f) => {
        path.at(s, p);
        f.cx = 0; f.cy = p.h; f.cz = p.a;
        f.tx = 0; f.ty = p.th; f.tz = p.ta;
        f.xx = 1; f.xy = 0; f.xz = 0;
    };
}

/**
 * The drape with `visible` of paper out of the slot. Rows run from inside the
 * slot to the tip; the paper's own coordinate slides with `visible`.
 */
export function layDrape(strip, path, visible, { length = PAPER.length } = {}) {
    layStrip(strip, {
        s0: path.start,
        s1: visible,
        vOf: (s) => (visible - s) / length,
        frameAt: drapeFrame(path)
    });
}

/**
 * frameAt for a receipt lying on the desk in WORLD space: header end at
 * `centre − dir·length/2`, tip toward `dir` (heading radians about +Y, from +Z).
 */
export function lyingFrame(path, { centre, heading, length = PAPER.length }) {
    const dx = Math.sin(heading);
    const dz = Math.cos(heading);
    // X = Up × Dir, so that N = T × X points up where the paper lies flat.
    const xx = dz;
    const xz = -dx;
    const p = {};
    return (s, f) => {
        path.at(s, p);
        const along = p.a - length / 2;
        f.cx = centre[0] + dx * along; f.cy = centre[1] + p.h; f.cz = centre[2] + dz * along;
        f.tx = dx * p.ta; f.ty = p.th; f.tz = dz * p.ta;
        f.xx = xx; f.xy = 0; f.xz = xz;
    };
}

/** Local → world for the printer's frame (yaw about +Y, then translate). */
export function toWorld([x, y, z], position, yaw) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return [position[0] + c * x + s * z, position[1] + y, position[2] - s * x + c * z];
}
