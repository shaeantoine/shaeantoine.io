import * as THREE from 'three';
import { mm, orbitShot, toVec3, poseInFront, frameHeightAt, FOV } from '../../core/framing.js';

/**
 * PAPER — every number, DOM-free (so node can import it to check the shots).
 *
 * World units, 3.2 per metre. The stack stands where the room's paper stack
 * stood ([1.862, 0, 0.86], yaw −0.16), a little further back so the A4 sheets
 * keep 7 cm from the desk's front edge (z 1.44) and 7 cm from the box's pile
 * (z ≤ 0.25).
 *
 * Frames: the stack's GROUP (the desk object's group: origin POSITION, yaw
 * YAW) and, inside it, one pivot per document. A pivot is UPRIGHT in its own
 * frame — front = local +Z, top = local +Y (poseInFront's convention) — and
 * lies face-up on the desk by FACE_UP (−π/2 about X). Its child `flip` turns
 * about local +Y by π to show the back (Shae's margin page).
 */

export const OBJECT_ID = 'paper-door';
export const LABEL = 'things I wrote';
export const POSITION = Object.freeze([1.862, 0, 0.835]);
export const YAW = -0.16;

export const A4 = Object.freeze({ w: 210, h: 297 });
export const SHEET = Object.freeze({ w: mm(A4.w), h: mm(A4.h) });

/** Top of the stack to the bottom. Thickness: a clipped document, mm. */
export const DOCS = Object.freeze([
    Object.freeze({ id: 'triangulations', thickMm: 0.9, clipMm: -62 }),
    Object.freeze({ id: 'pvsnp', thickMm: 1.2, clipMm: -20 }),
    Object.freeze({ id: 'ansto', thickMm: 1.5, clipMm: 26 }),
    Object.freeze({ id: 'drai', thickMm: 1.0, clipMm: 66 })
]);
export const DOC_IDS = Object.freeze(DOCS.map((d) => d.id));

/**
 * The bulldog clip (a 32 mm one): on each document's top edge, staggered along
 * it so the four clips read as four documents. What it adds on top of / under
 * the page (mm) sets how far apart the documents lie in the stack.
 */
export const CLIP = Object.freeze({ w: 32, jaw: 13, plate: 0.7, spineR: 2.4, overhang: 1.2, wire: 0.55, loop: 17 });
/**
 * A clip stands proud of its page by about its spine's radius, so the document
 * above rests that much higher: 2.8 mm between one page and the next (the
 * clip's plate and folded handles stay 0.3 mm under the page above). Every
 * document is tipped 0.6° — its clipped top edge up, the way a clip props a
 * page — which also keeps the bottom clip's back plate off the desk.
 */
const CLIP_STACK_GAP_MM = 2.8;
export const DOC_TILT = 0.6 * Math.PI / 180;

/** Heights (mm above the desk) of each document's page plane at its centre — bottom doc first up. */
function slotHeightsMm() {
    const heights = new Array(DOCS.length);
    const edgeDrop = (A4.h / 2) * Math.sin(DOC_TILT);
    let y = 0.1 + edgeDrop; // the bottom doc's lower edge just clears the desk
    for (let i = DOCS.length - 1; i >= 0; i -= 1) {
        heights[i] = y + DOCS[i].thickMm / 2;
        y = heights[i] + DOCS[i].thickMm / 2 + CLIP_STACK_GAP_MM;
    }
    return heights;
}
export const SLOT_MM = Object.freeze(slotHeightsMm());
/** The top of the stack: the top document's raised edge and its clip's spine. */
export const STACK_TOP_MM = SLOT_MM[0] + (A4.h / 2) * Math.sin(DOC_TILT) + CLIP.spineR + CLIP.wire;

const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);
const FACE_UP_Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

/**
 * How each document lies: neat (as found — a real stack is never perfect) and
 * askew (put back after reading: the room's trace). x/z mm in the group,
 * yaw degrees. Chosen, not random, so they can be checked against the pile.
 */
export const REST = Object.freeze({
    neat: Object.freeze({
        triangulations: Object.freeze({ x: 0.8, z: -0.6, yaw: 0.3 }),
        pvsnp: Object.freeze({ x: -1.2, z: 0.9, yaw: -0.4 }),
        ansto: Object.freeze({ x: 1.4, z: 0.4, yaw: 0.5 }),
        drai: Object.freeze({ x: -0.6, z: -1.0, yaw: -0.2 })
    }),
    askew: Object.freeze({
        triangulations: Object.freeze({ x: 7, z: 1.5, yaw: 2.3 }),
        pvsnp: Object.freeze({ x: -6, z: 2.5, yaw: -1.9 }),
        ansto: Object.freeze({ x: 9, z: -1, yaw: 1.6 }),
        drai: Object.freeze({ x: -4, z: 2, yaw: -2.4 })
    })
});

/** A document's pose on the stack, in the GROUP's frame. */
export function restPose(id, { askew = false } = {}) {
    const index = DOC_IDS.indexOf(id);
    const r = (askew ? REST.askew : REST.neat)[id];
    const position = new THREE.Vector3(mm(r.x), mm(SLOT_MM[index]), mm(r.z));
    const quaternion = new THREE.Quaternion().setFromAxisAngle(UP, r.yaw * DEG)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), DOC_TILT))
        .multiply(FACE_UP_Q);
    return { position, quaternion };
}

/**
 * Where a document is slid to on its way out of (or back into) the stack from
 * under the ones above it: out to the right, the free side (the clip is on
 * the top edge), at its own height. Group frame.
 */
export const SLIDE_OUT_MM = 218;  // a whole sheet and its askew: clear of the stack before it rises
export const SLIDE_BACK_MM = -34; // and a little back, so its front edge stays on the desk (the group's x runs 9° toward the front)
export function slidePose(id, { askew = false } = {}) {
    const pose = restPose(id, { askew });
    pose.position.x += mm(SLIDE_OUT_MM);
    pose.position.z += mm(SLIDE_BACK_MM);
    return pose;
}

// ---------------------------------------------------------------------------
// Group ↔ world
// ---------------------------------------------------------------------------

const GROUP_ORIGIN = new THREE.Vector3(...POSITION);
const GROUP_Q = new THREE.Quaternion().setFromAxisAngle(UP, YAW);
const GROUP_Q_INV = GROUP_Q.clone().invert();

export function groupToWorld(point, out = new THREE.Vector3()) {
    return out.copy(point).applyQuaternion(GROUP_Q).add(GROUP_ORIGIN);
}
export function worldToGroup(point, out = new THREE.Vector3()) {
    return out.copy(point).sub(GROUP_ORIGIN).applyQuaternion(GROUP_Q_INV);
}
export function worldToGroupQuaternion(q, out = new THREE.Quaternion()) {
    return out.copy(GROUP_Q_INV).multiply(q);
}
export function groupToWorldQuaternion(q, out = new THREE.Quaternion()) {
    return out.copy(GROUP_Q).multiply(q);
}

/** World corners of a document's page (plus its clip's reach past the top edge) at a group-frame pose. */
export function sheetCorners({ position, quaternion }, { clipMm = null, lift = 0 } = {}) {
    const hw = SHEET.w / 2;
    const hh = SHEET.h / 2;
    const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    if (clipMm !== null) pts.push([mm(clipMm - CLIP.w / 2), hh + mm(CLIP.overhang + CLIP.spineR)], [mm(clipMm + CLIP.w / 2), hh + mm(CLIP.overhang + CLIP.spineR)]);
    return pts.map(([x, y]) => {
        const local = new THREE.Vector3(x, y, 0).applyQuaternion(quaternion).add(position);
        local.y += lift;
        return groupToWorld(local);
    });
}

/** The stack's footprint on the desk (world x/z, every document in every pose it rests in). */
export function stackFootprint() {
    let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    for (const doc of DOCS) {
        for (const askew of [false, true]) {
            for (const p of sheetCorners(restPose(doc.id, { askew }), { clipMm: doc.clipMm })) {
                minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
                minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
            }
        }
    }
    return { minX, maxX, minZ, maxZ };
}

/** Corners of the whole stack (world), for framing: the neat footprint, up to the clips' tops. */
export function stackCorners() {
    const corners = [];
    for (const doc of DOCS) {
        for (const p of sheetCorners(restPose(doc.id), { clipMm: doc.clipMm })) {
            corners.push(p.clone());
            corners.push(p.clone().setY(mm(STACK_TOP_MM)));
        }
    }
    return corners;
}

/** The middle of the stack's bounding box (world): what the #paper shot aims at. */
export function stackCentre() {
    const box = new THREE.Box3().setFromPoints(stackCorners());
    return box.getCenter(new THREE.Vector3());
}

/**
 * The mean of stackCorners() — biased toward the clipped top edge (two of each
 * document's six points are its clip). The reading shot's aim offsets were
 * measured from this point, so it keeps it.
 */
export function stackAnchor() {
    const corners = stackCorners();
    const c = corners.reduce((sum, p) => sum.add(p), new THREE.Vector3());
    return c.multiplyScalar(1 / corners.length);
}

// ---------------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------------

/**
 * #paper — looking down at the stack along its own bearing (so the top cover
 * comes out square, with no roll), steep enough that it reads: 58° above the
 * desk, the stack 84% of the frame's height (the top cover's title ≥ 14 CSS px at 16:10). Below 1.2:1 the camera backs off
 * until the stack is 88% of the width.
 */
export const STACK_SHOT = Object.freeze({ elevation: 58 * DEG, fill: 0.84, maxWidthFill: 0.88, aimX: -0.15 });

/**
 * Reading — a paper in hand. The camera comes down to 36° and back, aimed so
 * the stack lies at the lower right; the paper is held left of centre (over
 * the desk's middle, the display and keyboard beyond it), its front page 92%
 * of the frame's height. Covers with small titles are brought closer (see
 * READ.coverFill in copy.js' PAPERS — the Paging Dr. AI title is small).
 */
export const READ_SHOT = Object.freeze({
    elevation: 34 * DEG,
    distance: 2.55,
    // Where the camera aims, relative to the stack's centre (world): left and up.
    aim: Object.freeze([-0.62, 0.42, -0.12])
});

export const HOLD = Object.freeze({
    fill: 0.92,            // the margin page (and every cover whose title is big enough) — of the frame height
    ndcX: -0.36,           // left of centre
    tiltBack: 7 * DEG,
    roll: -1.2 * DEG,
    turnToLight: 6 * DEG,  // a touch toward the window (+x), as you'd tip a page to read it
    topNdc: 0.8,           // the page's top edge: under the header's two lines (≈ NDC 0.84 at 16:10)
    phoneFill: 0.88,       // of the frame WIDTH in portrait
    phoneTopNdc: 0.8       // held high in portrait: the stack shows beneath
});

export const PHONE_ASPECT = 0.8;

function orbit(target, distance, elevation, azimuth) {
    return orbitShot(target, { distance, elevation, azimuth });
}

/** The desk's front edge (world z), and the stretch of it the paper shots must keep below the frame. */
export const DESK_EDGE_Z = 1.44;
const EDGE_XS = [0.9, 1.3, 1.7, 2.1, 2.5, 2.9];

function cameraFor(pose, aspect, fov) {
    const cam = new THREE.PerspectiveCamera(fov, aspect, 0.1, 100);
    cam.position.copy(toVec3(pose.position));
    cam.lookAt(toVec3(pose.lookAt));
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    return cam;
}

function ndcBounds(points, cam) {
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    for (const p of points) {
        const q = p.clone().project(cam);
        minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y);
    }
    return { minX, maxX, minY, maxY };
}

/** Highest NDC y at which the desk's front edge crosses the frame (−∞ if it is below/outside it). */
function edgeTop(cam) {
    let top = -Infinity;
    for (const x of EDGE_XS) {
        const q = new THREE.Vector3(x, 0, DESK_EDGE_Z).project(cam);
        if (q.x >= -1 && q.x <= 1) top = Math.max(top, q.y);
    }
    return top;
}

/**
 * Aim a little behind `centre` (along the bearing, away from the camera) —
 * the least that puts the desk's front edge under the frame, so no floor shows
 * past it — and, for each aim, the distance at which `corners` fill `fill` of
 * the height (≤ maxWidthFill of the width).
 */
function aimedFit(corners, centre, { elevation, fill, maxWidthFill, aspect, fov }) {
    const back = new THREE.Vector3(-Math.sin(YAW), 0, -Math.cos(YAW));
    let best = null;
    for (let shift = 0; shift <= 0.6001; shift += 0.02) {
        const target = centre.clone().addScaledVector(back, shift);
        let lo = 0.3; let hi = 14;
        for (let i = 0; i < 36; i += 1) {
            const mid = (lo + hi) / 2;
            const b = ndcBounds(corners, cameraFor(orbit(target, mid, elevation, YAW), aspect, fov));
            if ((b.maxY - b.minY) / 2 <= fill && (b.maxX - b.minX) / 2 <= maxWidthFill && b.minY >= -0.99 && b.maxY <= 0.99) hi = mid; else lo = mid;
        }
        const pose = orbit(target, hi, elevation, YAW);
        best = { ...pose, distance: hi, shift };
        if (edgeTop(cameraFor(pose, aspect, fov)) <= -1.0) break;
    }
    return best;
}

export function stackShot(aspect = 16 / 10, fov = FOV) {
    // Aimed 15 cm left of the stack's centre: the frame's top right otherwise
    // reaches past the desk's right edge, to the floor (5.8% → 2.2% at 16:10).
    const centre = stackCentre().add(new THREE.Vector3(aspect < PHONE_ASPECT ? 0 : STACK_SHOT.aimX, 0, 0));
    return aimedFit(stackCorners(), centre, {
        elevation: STACK_SHOT.elevation, fill: STACK_SHOT.fill, maxWidthFill: STACK_SHOT.maxWidthFill, aspect, fov
    });
}

/**
 * The reading shot: the camera down to 34° and back, aimed left of and above
 * the stack so it lies at the lower right, beside the held page. On a portrait
 * phone the page is held high and centred and the stack shows beneath it.
 */
export const PHONE_READ = Object.freeze({ elevation: 46 * DEG, distance: 3.3, aimUp: 0.62 });

export function readShot(aspect = 16 / 10, fov = FOV) {
    const centre = stackAnchor();
    const back = new THREE.Vector3(-Math.sin(YAW), 0, -Math.cos(YAW));
    const phone = aspect < PHONE_ASPECT;
    const [ax, ay, az] = phone ? [0, PHONE_READ.aimUp, 0] : READ_SHOT.aim;
    const elevation = phone ? PHONE_READ.elevation : READ_SHOT.elevation;
    // Narrower than 16:10 the frame loses width: back off a little so the stack keeps its place on the right.
    const k = phone ? 1 : Math.sqrt(Math.max(1, (16 / 10) / Math.max(aspect, 1.2)));
    const distance = (phone ? PHONE_READ.distance : READ_SHOT.distance) * k;
    let pose = null;
    for (let shift = 0; shift <= 0.6001; shift += 0.02) {
        const target = centre.clone().add(new THREE.Vector3(ax, ay, az)).addScaledVector(back, shift);
        pose = { ...orbit(target, distance, elevation, YAW), distance, shift };
        if (edgeTop(cameraFor(pose, aspect, fov)) <= -1.0) break;
    }
    return pose;
}

/**
 * The in-hand pose (WORLD) for a document: `fill` of the frame's height (the
 * front page may ask for more, to bring a small title up to size — then the
 * page is centred on `focusY`, its title band, and may run off the frame's
 * top and bottom, which on those covers is blank paper).
 * @param {{position, lookAt}} cameraPose the reading shot
 * @param {object} options { aspect, fov, fill = HOLD.fill, focusY = 0.5 (0 top … 1 bottom of the page) }
 */
export function handPose(cameraPose, { aspect = 16 / 10, fov = FOV, fill = HOLD.fill, focusY = 0.5 } = {}) {
    const phone = aspect < PHONE_ASPECT;
    const tan = Math.tan((fov * DEG) / 2);
    let distance;
    if (phone) {
        // As wide as HOLD.phoneFill of the frame, whatever that makes the height.
        distance = SHEET.w / (HOLD.phoneFill * 2 * tan * aspect);
    } else {
        distance = (SHEET.h * Math.cos(HOLD.tiltBack)) / (fill * 2 * tan);
    }
    const frameH = frameHeightAt(distance, fov);
    const pageFrac = (SHEET.h * Math.cos(HOLD.tiltBack)) / frameH; // of the frame height
    // Vertical: centred on the frame; a page larger than the frame is centred on its focus band instead.
    // Its top edge just under the page header (HOLD.topNdc); a page larger than
    // the frame is centred on its focus band (its title) instead.
    let ndcY = HOLD.topNdc - pageFrac;
    if (!phone && pageFrac > 1.02) ndcY = (focusY - 0.5) * pageFrac * 2;
    if (phone) ndcY = HOLD.phoneTopNdc - pageFrac;
    const halfW = (frameH / 2) * aspect;
    const pageHalfNdcX = SHEET.w / 2 / halfW;
    const ndcX = phone ? 0 : Math.max(-0.96 + pageHalfNdcX, HOLD.ndcX);
    const pose = poseInFront(cameraPose, {
        distance, aspect, fov,
        tiltBack: HOLD.tiltBack,
        roll: phone ? 0 : HOLD.roll,
        right: ndcX * halfW,
        down: -ndcY * frameH / 2
    });
    pose.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(UP, phone ? 0 : HOLD.turnToLight));
    pose.pageFraction = pageFrac;
    return pose;
}

/** The notes page and the front at the reading distance of `fill`: handy for checks. */
export function worldSheetCorners(pose) {
    const hw = SHEET.w / 2;
    const hh = SHEET.h / 2;
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => new THREE.Vector3(x, y, 0).applyQuaternion(pose.quaternion).add(toVec3(pose.position)));
}

/**
 * How close a cover is held: the margin page's HOLD.fill, or closer if the
 * cover's title would come out under TITLE_CAP_CSS px at 16:10 (900 px tall).
 * capPx is the title's cap height on the 1400 px render; 6% for the tilt and
 * perspective.
 */
export const TITLE_CAP_CSS = 14.5;
export function frontFillFor(capPx) {
    if (!(capPx > 0)) return HOLD.fill;
    return Math.max(HOLD.fill, 1.06 * (TITLE_CAP_CSS * 1400) / (capPx * 900));
}
