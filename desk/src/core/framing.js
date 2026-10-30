import * as THREE from 'three';

/**
 * Camera maths with no DOM in it, so it runs in the browser AND in node.
 *
 * Nobody can render in the sandbox this site is built in, so every shot is
 * computed rather than eyeballed. This file is the one place that computation
 * lives: the site's camera controller (core/camera.js) and `ctx.poseInFront`
 * use it at runtime, and a module author can import it from node to check a
 * shot before anyone has looked at it:
 *
 *   cd desk && node --input-type=module -e "
 *     import * as F from './src/core/framing.js';
 *     const box = F.orientedBox({ centre: [2.05, 0.19, -0.30], size: [1.06, 0.38, 0.64], yaw: -0.35 });
 *     console.table(F.reportAcrossAspects(box, F.ESTABLISHING));
 *   "
 *
 * The constants below restate src/scene/CameraRig.js and DeskScene.js, which
 * do not export them. They must match those files exactly — the site's camera
 * is the original site's view of the room, not a new one.
 */

/** DeskScene: `new THREE.PerspectiveCamera(45, aspect, 0.1, 100)`. Vertical FOV, degrees. */
export const FOV = 45;
export const NEAR = 0.1;
export const FAR = 100;

/** CameraRig: ESTABLISHING_POSITION / ESTABLISHING_LOOK_AT. */
export const ESTABLISHING = Object.freeze({
    position: Object.freeze([0, 2.5, 5.0]),
    lookAt: Object.freeze([0, 1, 0])
});

/** CameraRig: INTRO_OFFSET / INTRO_DURATION_MS (eased with easeOutQuint, aim fixed). */
export const INTRO_OFFSET = Object.freeze([0, 0.30, 0.95]);
export const INTRO_MS = 1800;

/**
 * The room the camera must stay inside, restated: src/scene/room.js
 * (BACK_WALL_Z −2.2, WALL_HEIGHT 10, ROOM_DEPTH 12, ROOM_WIDTH 18, no ceiling)
 * and the floor DeskScene gives it from ikea_desk_final.glb (measured: −2.682).
 * Above the back wall's top there is only scene.background.
 */
export const ROOM = Object.freeze({ backWallZ: -2.2, floorY: -2.682, wallTopY: -2.682 + 10, floorFrontZ: -2.2 + 12, halfWidth: 9 });

/** The desk's front edge (the desk model spans x ±3, z ±1.5; top at y 0). */
export const DESK_FRONT_EDGE = Object.freeze([Object.freeze([-3, 0, 1.5]), Object.freeze([3, 0, 1.5])]);

/**
 * How the establishing shot adapts to narrow viewports.
 *
 * At `keepAspect` and wider it is CameraRig's shot, exactly. At `fitAspect`
 * and narrower the camera backs away along the same line of sight (up and
 * back, aim unchanged) until the desk's whole front edge fits the frame's
 * width, `margin` in from each side (NDC). In between, the pull-back is
 * blended in (smoothstep), so dragging a window across 3:2 never makes the
 * room jump. If backing away would lift the frame's top edge past the back
 * wall's top (portrait phones), the whole shot is craned straight down by the
 * excess (a pure translation: same direction, aim lowered by as much), so the
 * frame never shows the void above the wall. `wallMargin` is how far below the
 * wall's top the frame's top edge is kept.
 */
export const ESTABLISHING_FIT = Object.freeze({ keepAspect: 1.5, fitAspect: 1.4, margin: 0.04, wallMargin: 0.35 });

function smoothstep(edge0, edge1, x) {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

/** ESTABLISHING pulled back by `k` along its line of sight (1 = as is), then lowered by `crane`. */
function pulledBack(k, crane = 0) {
    const look = toVec3(ESTABLISHING.lookAt);
    const eye = toVec3(ESTABLISHING.position).sub(look).multiplyScalar(k).add(look);
    eye.y -= crane;
    look.y -= crane;
    return { position: eye, lookAt: look };
}

/** Largest |NDC x| of the desk's front corners through `pose`. */
function frontEdgeNdcX(pose, aspect, fov) {
    const camera = makeCamera(pose, aspect, fov);
    let widest = 0;
    for (const corner of DESK_FRONT_EDGE) widest = Math.max(widest, Math.abs(toVec3(corner).project(camera).x));
    return widest;
}

/** Where the frame's top edge meets the back wall's plane (world y), for a camera at `pose`. */
function frameTopOnBackWall(pose, aspect, fov) {
    const camera = makeCamera(pose, aspect, fov);
    const origin = camera.position.clone();
    const direction = new THREE.Vector3(0, 1, 0.5).unproject(camera).sub(origin).normalize();
    if (direction.z >= 0) return Infinity;
    const t = (ROOM.backWallZ - origin.z) / direction.z;
    return origin.y + direction.y * t;
}

/** How far `pose` must come straight down so the frame's top edge stays `wallMargin` below the wall's top. */
function craneFor(pose, aspect, fov) {
    return Math.max(0, frameTopOnBackWall(pose, aspect, fov) - (ROOM.wallTopY - ESTABLISHING_FIT.wallMargin));
}

const round6 = (v) => Math.round(v * 1e6) / 1e6;

/**
 * The establishing shot for a viewport of `aspect` (see ESTABLISHING_FIT).
 * @returns {{ position: number[], lookAt: number[], pullBack: number, crane: number }}
 *          pullBack: the distance factor along the line of sight (1 = CameraRig's);
 *          crane: how far the whole shot was lowered to keep the frame on the wall
 */
export function establishingShot(aspect = 16 / 9, { fov = FOV } = {}) {
    const { keepAspect, fitAspect, margin } = ESTABLISHING_FIT;
    if (!(aspect > 0) || aspect >= keepAspect) {
        return { position: [...ESTABLISHING.position], lookAt: [...ESTABLISHING.lookAt], pullBack: 1, crane: 0 };
    }
    const blend = smoothstep(keepAspect, fitAspect, aspect);
    // The pull-back that sits the front corners `margin` inside the frame, and
    // the crane that keeps the top on the wall, depend a little on each other:
    // a few fixed-point passes settle both (they converge in two or three).
    let k = 1;
    let crane = 0;
    for (let pass = 0; pass < 5; pass += 1) {
        let lo = 1;
        let hi = 1;
        while (frontEdgeNdcX(pulledBack(hi, crane), aspect, fov) > 1 - margin && hi < 64) hi *= 1.5;
        for (let i = 0; i < 48; i += 1) {
            const mid = (lo + hi) / 2;
            if (frontEdgeNdcX(pulledBack(mid, crane), aspect, fov) > 1 - margin) lo = mid; else hi = mid;
        }
        k = 1 + (hi - 1) * blend;
        const next = craneFor(pulledBack(k, 0), aspect, fov);
        if (Math.abs(next - crane) < 1e-5) { crane = next; break; }
        crane = next;
    }
    const pose = pulledBack(k, crane);
    return { position: pose.position.toArray().map(round6), lookAt: pose.lookAt.toArray().map(round6), pullBack: round6(k), crane: round6(crane) };
}

/**
 * Where the opening push-in starts for a viewport of `aspect`: CameraRig's
 * INTRO_OFFSET behind the establishing shot — exactly, aim unchanged, at 3:2
 * and wider. Narrower, the offset is scaled by the same pull-back, so the move
 * is the same ~17% of the distance and the desk grows into the frame the same
 * way; and if that would put the frame's top edge above the back wall, the
 * start is lowered (position and aim together) so the push-in rises by that
 * much as it comes in — a translation, never a tilt.
 * @returns {{ position: number[], lookAt: number[] }}
 */
export function introStart(aspect = 16 / 9, { fov = FOV } = {}) {
    const shot = establishingShot(aspect, { fov });
    const position = toVec3(shot.position).add(toVec3(INTRO_OFFSET).multiplyScalar(shot.pullBack));
    const lookAt = toVec3(shot.lookAt);
    if (shot.pullBack !== 1) {
        const crane = craneFor({ position, lookAt }, aspect, fov);
        position.y -= crane;
        lookAt.y -= crane;
    }
    return { position: position.toArray().map(round6), lookAt: lookAt.toArray().map(round6) };
}

/** src/scene/surfaces.js UNITS_PER_METER. 1 mm = 0.0032 units. */
export const UNITS_PER_METRE = 3.2;
export const mm = (millimetres) => (millimetres / 1000) * UNITS_PER_METRE;
export const cm = (centimetres) => (centimetres / 100) * UNITS_PER_METRE;

/** The viewports the site is checked at (16:10 is 1440 x 900, the size the ?still=1 screenshots were taken at). */
export const ASPECTS = Object.freeze({ '16:9': 16 / 9, '16:10': 16 / 10, '3:2': 3 / 2, '4:3': 4 / 3, 'mobile 390x844': 390 / 844 });

const UP = new THREE.Vector3(0, 1, 0);

/** [x,y,z] | {x,y,z} | Vector3 -> a new (or the given `out`) Vector3. */
export function toVec3(value, out = new THREE.Vector3()) {
    if (Array.isArray(value)) return out.fromArray(value);
    if (value?.isVector3) return out.copy(value);
    if (value && typeof value === 'object') return out.set(value.x ?? 0, value.y ?? 0, value.z ?? 0);
    throw new TypeError(`Expected a 3-vector, got ${JSON.stringify(value)}`);
}

/** The world orientation of a camera standing at `position` aimed at `lookAt` (up = +Y). */
export function cameraQuaternion(position, lookAt, out = new THREE.Quaternion()) {
    const m = new THREE.Matrix4().lookAt(toVec3(position), toVec3(lookAt), UP);
    return out.setFromRotationMatrix(m);
}

/** A throwaway PerspectiveCamera at `pose`, matching DeskScene's lens. */
export function makeCamera(pose, aspect = 16 / 9, fov = FOV) {
    const camera = new THREE.PerspectiveCamera(fov, aspect, NEAR, FAR);
    camera.position.copy(toVec3(pose.position));
    camera.lookAt(toVec3(pose.lookAt));
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    return camera;
}

/** Height of the visible frame at `distance` in front of a camera with vertical `fov`. */
export function frameHeightAt(distance, fov = FOV) {
    return 2 * distance * Math.tan(THREE.MathUtils.degToRad(fov) / 2);
}

/** The distance at which something `height` tall fills `fraction` of the frame height. */
export function distanceForFraction(height, fraction, fov = FOV) {
    return height / (fraction * 2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
}

/**
 * Where to hold an item so it is "in hand": in front of the camera, facing it,
 * slightly below centre, tipped back.
 *
 * The returned quaternion orients an object whose FRONT faces its local +Z and
 * whose TOP is its local +Y — i.e. a THREE.PlaneGeometry as constructed. A print
 * built lying face-up on the desk (rotated -PI/2 about X) needs that turn
 * undone first; the simplest way is to build the print's meshes in a child
 * group that is upright in its parent, and pose the parent.
 *
 * Give EITHER `distance`, OR `height` + `fraction` (and optionally `width` +
 * `maxWidthFraction`, which pushes the item back on narrow viewports so it
 * never overflows the frame sideways).
 *
 * @param {{ position, lookAt }} cameraPose the camera's FINAL pose for the shot
 * @param {object} [options]
 * @param {number} [options.distance] along the view axis, world units
 * @param {number} [options.height] the item's height, world units
 * @param {number} [options.fraction=0.56] how much of the frame height it should fill
 * @param {number} [options.width] the item's width, world units
 * @param {number} [options.maxWidthFraction=0.88] the most of the frame width it may fill
 * @param {number} [options.aspect=16/9] the viewport's width / height
 * @param {number} [options.fov=45]
 * @param {number} [options.down=0] world units below the view axis (camera-local)
 * @param {number} [options.downFraction] …or as a fraction of the frame height at that distance
 * @param {number} [options.right=0] world units right of the view axis (camera-local)
 * @param {number} [options.tiltBack=0.14] radians the top leans away from the camera (~8°)
 * @param {number} [options.roll=0] radians about the view axis, for a hand-held skew
 * @returns {{ position: THREE.Vector3, quaternion: THREE.Quaternion, distance: number,
 *             frameHeight: number, heightFraction: number|null }}
 */
export function poseInFront(cameraPose, {
    distance,
    height,
    fraction = 0.56,
    width,
    maxWidthFraction = 0.88,
    aspect = 16 / 9,
    fov = FOV,
    down = 0,
    downFraction,
    right = 0,
    tiltBack = THREE.MathUtils.degToRad(8),
    roll = 0
} = {}) {
    const eye = toVec3(cameraPose.position);
    const target = toVec3(cameraPose.lookAt);
    const q = cameraQuaternion(eye, target);
    const forward = target.clone().sub(eye).normalize();
    const rightAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const upAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(q);

    let d = distance;
    if (d === undefined) {
        if (height === undefined) throw new TypeError('poseInFront needs `distance`, or `height` + `fraction`.');
        // A tipped-back item projects a little shorter than it is.
        d = distanceForFraction(height * Math.cos(tiltBack), fraction, fov);
    }
    if (width !== undefined) {
        const tan = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
        const minForWidth = width / (maxWidthFraction * 2 * tan * aspect);
        d = Math.max(d, minForWidth);
    }

    const frameHeight = frameHeightAt(d, fov);
    const drop = downFraction !== undefined ? downFraction * frameHeight : down;

    const position = eye.clone()
        .addScaledVector(forward, d)
        .addScaledVector(rightAxis, right)
        .addScaledVector(upAxis, -drop);

    const quaternion = q.clone()
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -tiltBack));

    return {
        position,
        quaternion,
        distance: d,
        frameHeight,
        heightFraction: height === undefined ? null : (height * Math.cos(tiltBack)) / frameHeight
    };
}

/**
 * The 8 corners of a box that is yawed about +Y — the shape of almost every
 * object on this desk. `centre` is the box's centre (not its base).
 */
export function orientedBox({ centre, size, yaw = 0, rotation }) {
    const c = toVec3(centre);
    const [sx, sy, sz] = size;
    const q = rotation
        ? new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation))
        : new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    const corners = [];
    for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
        corners.push(new THREE.Vector3(x * sx, y * sy, z * sz).applyQuaternion(q).add(c));
    }
    return corners;
}

/** The world-space corner points of a target: Box3 | Vector3[] | Object3D (tight, per mesh). */
export function cornersOf(target) {
    if (Array.isArray(target)) return target.map((p) => toVec3(p));
    if (target?.isBox3) {
        const { min, max } = target;
        const out = [];
        for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
            out.push(new THREE.Vector3(x, y, z));
        }
        return out;
    }
    if (target?.isObject3D) {
        target.updateWorldMatrix(true, true);
        const out = [];
        target.traverse((node) => {
            if (!node.isMesh || !node.geometry) return;
            if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
            const { min, max } = node.geometry.boundingBox;
            for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
                out.push(new THREE.Vector3(x, y, z).applyMatrix4(node.matrixWorld));
            }
        });
        return out;
    }
    throw new TypeError('cornersOf expects a Box3, an array of points, or an Object3D');
}

/**
 * Where a target lands in a camera's frame.
 *
 * NDC runs -1..1 on both axes (y up). `heightFraction` / `widthFraction` are
 * the target's projected extent as a fraction of the frame; `inFrame` is true
 * when every corner is in front of the camera and inside the frame.
 *
 * @param {THREE.Box3|THREE.Vector3[]|THREE.Object3D} target
 * @param {THREE.PerspectiveCamera} camera with an up-to-date matrixWorld
 */
export function frameReport(target, camera) {
    camera.updateMatrixWorld(true);
    const corners = cornersOf(target);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let behind = false;
    const view = new THREE.Vector3();
    for (const corner of corners) {
        view.copy(corner).applyMatrix4(camera.matrixWorldInverse);
        if (view.z > -camera.near) behind = true;
        const p = corner.clone().project(camera);
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const round = (v) => Math.round(v * 1000) / 1000;
    return {
        ndc: { minX: round(minX), maxX: round(maxX), minY: round(minY), maxY: round(maxY) },
        widthFraction: round((maxX - minX) / 2),
        heightFraction: round((maxY - minY) / 2),
        centre: { x: round((minX + maxX) / 2), y: round((minY + maxY) / 2) },
        inFrame: !behind && minX >= -1 && maxX <= 1 && minY >= -1 && maxY <= 1,
        behind
    };
}

/** frameReport at each of ASPECTS (or the ones given), for a pose — handy with console.table. */
export function reportAcrossAspects(target, pose, aspects = ASPECTS) {
    const rows = {};
    for (const [name, aspect] of Object.entries(aspects)) {
        const r = frameReport(target, makeCamera(pose, aspect));
        rows[name] = {
            'h%': Math.round(r.heightFraction * 1000) / 10,
            'w%': Math.round(r.widthFraction * 1000) / 10,
            minX: r.ndc.minX, maxX: r.ndc.maxX, minY: r.ndc.minY, maxY: r.ndc.maxY,
            inFrame: r.inFrame
        };
    }
    return rows;
}

/**
 * A camera pose on a sphere around `target`: `elevation` above the horizontal,
 * `azimuth` round from +Z (the establishing side of the desk; positive swings
 * toward +X). Radians.
 * @returns {{ position: number[], lookAt: number[] }}
 */
export function orbitShot(target, { distance = 1.6, elevation = THREE.MathUtils.degToRad(30), azimuth = 0 } = {}) {
    const t = toVec3(target);
    const direction = new THREE.Vector3(
        Math.sin(azimuth) * Math.cos(elevation),
        Math.sin(elevation),
        Math.cos(azimuth) * Math.cos(elevation)
    );
    return { position: t.clone().addScaledVector(direction, distance).toArray(), lookAt: t.toArray() };
}

/**
 * The closest orbitShot at which `target` fills no more than `fill` of the
 * frame height and `maxWidthFill` of its width at `aspect` — i.e. a computed
 * framing, not a guessed one. Aim defaults to the centre of the target's corners.
 *
 * @returns {{ position: number[], lookAt: number[], distance: number, report: object }}
 */
export function fitShot(target, {
    elevation = THREE.MathUtils.degToRad(30),
    azimuth = 0,
    fill = 0.6,
    maxWidthFill = 0.9,
    aspect = 16 / 9,
    fov = FOV,
    lookAt
} = {}) {
    const corners = cornersOf(target);
    const centre = lookAt
        ? toVec3(lookAt)
        : corners.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / corners.length);
    const fits = (distance) => {
        const pose = orbitShot(centre, { distance, elevation, azimuth });
        const report = frameReport(corners, makeCamera(pose, aspect, fov));
        return { pose, report, ok: !report.behind && report.heightFraction <= fill && report.widthFraction <= maxWidthFill };
    };
    let lo = 0.15;
    let hi = 40;
    let best = fits(hi);
    for (let i = 0; i < 40; i += 1) {
        const mid = (lo + hi) / 2;
        const attempt = fits(mid);
        if (attempt.ok) { best = attempt; hi = mid; } else { lo = mid; }
    }
    return { ...best.pose, distance: hi, report: best.report };
}
