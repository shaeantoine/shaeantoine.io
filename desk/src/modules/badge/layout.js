import * as THREE from 'three';
import { LAMP } from '../props/layout.js';
import { badgeDims } from './dims.js';

/**
 * THE CURRENT BADGE, AS NUMBERS (DOM-free, so node can import it to check
 * the shot, the clearances and the establishing framing).
 *
 * Shae's badge from the day job (src/content/works/work.js appleEngineer)
 * hangs on a flat lanyard strap looped over the lamp's HEAD BAR, 28 cm along
 * it from the head's knuckle. Not the arms: both arms slope, and a strap
 * looped over a sloping bar slides down it; the head bar is level. There it
 * hangs over the back right corner of the bench's mat — its foot 0.64 above
 * the desk, 20 cm over anything on the mat — in front of the lamp's upper arm
 * (≥ 5 cm clear of the arm's bars, knuckles and springs at rest, swaying,
 * drawn forward and turning; node), and from the room against the book row.
 *
 * Frame: the desk object's group sits on the bar's axis at the loop, yawed
 * so its local +X runs along the bar (toward the knuckle), +Z is `across`
 * (horizontal, toward the room — the badge's face), +Y up.
 */

export const OBJECT_ID = 'current-badge';
export const LABEL = 'the day job';
export const VISIT_TITLE = 'the badge';

/** How far along the head bar (from its knuckle end) the strap is looped. */
export const ALONG = 0.28;
/** The group's yaw: local +Z = the head's `across`, local +X = back along the bar. */
export const YAW = Math.atan2(LAMP.head.across.x, LAMP.head.across.z);
/** The bar's axis at the loop (world): the group's origin. */
export const ORIGIN = Object.freeze(LAMP.head.start.clone().addScaledVector(LAMP.head.direction, ALONG).toArray());

/** The badge at the lanyard's own proportions (it is looked at close up). */
export const DIMS = badgeDims(1);

/**
 * The strap: a flat 15 mm lanyard ribbon, 0.7 mm thick, looped once over the
 * bar and pulled taut down to the hook. The hook (a small ring) hangs DROP
 * below the bar's axis; the badge's clip hangs from the ring.
 */
export const STRAP = Object.freeze({ width: 0.048, thickness: 0.0022, air: 0.0012, round: 0.005, color: '#2b2d31' });
export const DROP = 0.11;
export const RING = Object.freeze({ radius: 0.008, tube: 0.0017 });
/** The hook's point (group-local) and the badge's clip tip below it. */
export const HOOK = Object.freeze([0, -DROP, 0]);
export const TIP_Y = -DROP - 2 * RING.radius;

/**
 * The bar's cross-section in the group's (z = across, y = up) plane: the head
 * is 28 × 13 mm, tipped 30° toward the room (props/layout.js).
 */
export function barSection() {
    const { head } = LAMP;
    const up = new THREE.Vector2(-Math.sin(head.tilt), Math.cos(head.tilt));   // head's up, in (z, y)
    const side = new THREE.Vector2(Math.cos(head.tilt), Math.sin(head.tilt));  // across the bar's width
    const corners = [];
    for (const su of [-1, 1]) for (const ss of [-1, 1]) {
        corners.push(up.clone().multiplyScalar(su * head.height / 2).add(side.clone().multiplyScalar(ss * head.width / 2)));
    }
    return corners;
}

/**
 * The strap's path round the bar and down to the hook, in (z, y): the taut
 * loop is the convex hull of the bar's section (rounded, with air) and the
 * hook point. Returns the hull, starting and ending at the hook.
 */
export function strapPath() {
    const pts = [];
    const r = STRAP.round + STRAP.air + STRAP.thickness / 2;
    for (const c of barSection()) {
        for (let k = 0; k < 12; k += 1) {
            const a = (k / 12) * Math.PI * 2;
            pts.push(new THREE.Vector2(c.x + Math.cos(a) * r - Math.sign(c.x) * STRAP.round, c.y + Math.sin(a) * r - Math.sign(c.y) * STRAP.round));
        }
    }
    const hook = new THREE.Vector2(0, -DROP + RING.radius * 0.2);
    pts.push(hook);
    // Monotone-chain hull.
    const sorted = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for (const p of sorted) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
    const upper = [];
    for (const p of [...sorted].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
    const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
    const start = hull.findIndex((p) => p === hook);
    return [...hull.slice(start), ...hull.slice(0, start), hook];
}

/** The group's world matrix (for node checks). */
export function groupMatrix() {
    return new THREE.Matrix4().compose(new THREE.Vector3(...ORIGIN), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), YAW), new THREE.Vector3(1, 1, 1));
}

/** The badge's corners (group-local, hanging at rest), for the hit box, framing and clearance. */
export function badgeCornersLocal({ turned = 0 } = {}) {
    const w = DIMS.width / 2;
    const out = [];
    const c = Math.cos(turned);
    const s = Math.sin(turned);
    for (const x of [-w, w]) for (const y of [TIP_Y, TIP_Y + DIMS.bottom]) for (const z of [0, DIMS.depth]) {
        out.push(new THREE.Vector3(x * c + z * s, y, -x * s + z * c));
    }
    return out;
}

/** The hit volume: [size, centre] (group-local) round the hanging badge, a little deeper than it is. */
export function hitBox() {
    const w = DIMS.width + 0.02;
    const top = TIP_Y + 0.02;
    const bottom = TIP_Y + DIMS.bottom - 0.01;
    return { size: [w, top - bottom, 0.05], centre: [0, (top + bottom) / 2, 0.008] };
}

/** The card's centre (group-local, hanging at rest). */
export const CARD_CENTRE = Object.freeze([0, TIP_Y + DIMS.cardCentreY, DIMS.face / 2]);

/**
 * #badge: the badge is drawn toward you on its hook — its foot swung PULL
 * forward about the hook (the strap stays where it hangs) — and turned round.
 * Why drawn forward first: the lamp's upper arm crosses behind it, and a
 * badge turning round on the spot sweeps its edge 10 cm back — to within
 * 1 cm of the arm. Drawn forward 30° it turns with ≥ 7 cm to spare (node),
 * and then faces up at you, as a badge you've taken hold of does.
 */
export const PULL = 30 * Math.PI / 180;

/** A group-local point on the hanging badge, drawn forward by `pull` about the hook. */
export function pulled(point, pull = PULL) {
    const p = new THREE.Vector3(...point).sub(new THREE.Vector3(...HOOK));
    return p.applyAxisAngle(new THREE.Vector3(1, 0, 0), -pull).add(new THREE.Vector3(...HOOK));
}

/**
 * THE SHOT (#badge): along the drawn-forward badge's own normal (so square to
 * it) plus 4° more from above, close enough that the card fills ≈ 62% of the
 * frame's height — the clip, ring and strap run up out of the frame's top.
 * One distance at every aspect: on a phone the badge is then ≈ 86% of the
 * frame's width.
 */
export const SHOT = Object.freeze({ fill: 0.62, above: 4 * Math.PI / 180, fov: 45 });

export function badgeShot() {
    const M = groupMatrix();
    const Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), YAW);
    const centre = pulled(CARD_CENTRE).applyMatrix4(M);
    const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(1, 0, 0), -(PULL + SHOT.above)).applyQuaternion(Q);
    const frameHeight = DIMS.card[1] / SHOT.fill;
    const distance = frameHeight / 2 / Math.tan((SHOT.fov / 2) * Math.PI / 180);
    const position = centre.clone().addScaledVector(normal, distance);
    return { position: position.toArray(), lookAt: centre.toArray(), distance };
}

/**
 * The sway (a lamp hovered or clicked): a damped swing about the hook, along
 * the bar's axis, with a little twist — almost imperceptible, and over in
 * about 3 s. Radians and ms.
 */
export const SWAY = Object.freeze({ hover: 0.012, click: 0.028, periodMs: 1150, decayMs: 900, twist: 0.35, doneMs: 3200 });

/**
 * The trace a visit leaves: the badge left hanging most of the way turned round (its back to the room, at
 * an angle) — 20°, which swings its near edge 3.5 cm back: 5 cm short of the arm behind it.
 */
export const TRACE_TURN = Math.PI - 0.35;

/** The note on the back of the card (mm on the 59.4 × 93.75 mm card, from its top-left as you read the back). */
export const CARD_MM = Object.freeze([DIMS.card[0] / 0.0032, DIMS.card[1] / 0.0032]);
export const NOTE_RECT = Object.freeze({ x: 6.5, y: 12, w: CARD_MM[0] - 13, h: 62 });
