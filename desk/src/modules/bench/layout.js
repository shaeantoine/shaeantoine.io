import * as THREE from 'three';
import { poseInFront, frameReport, makeCamera, orbitShot, toVec3, frameHeightAt, FOV } from '../../core/framing.js';

/**
 * THE BENCH, AS NUMBERS. No DOM in here, so node can import it and check every
 * shot before anyone has looked at one (see the module summary for the figures):
 *
 *   cd desk && node --input-type=module -e "
 *     import * as L from './src/modules/bench/layout.js';
 *     console.log(L.benchShot(16 / 9));"
 *
 * Units: everything below is in MILLIMETRES of the real object, in the bench
 * group's own frame — x along the mat's long edge (right), y up from the desk
 * top, z toward the mat's front edge (the viewer). `mm()` / `local()` convert
 * to world units (3.2 per metre). The group sits at POSITION, yawed by YAW, so
 * its front edge squarely faces the establishing camera (whose azimuth from the
 * bench is 0.364 rad).
 */

export const OBJECT_ID = 'eeg-bench';
export const LABEL = 'on the bench';

/** World units per millimetre (src/scene/surfaces.js: 3.2 units per metre). */
export const MM = 0.0032;
export const mm = (value) => value * MM;

export const POSITION = Object.freeze([-2.0, 0, -0.275]);
export const YAW = 0.35;

// ---------------------------------------------------------------------------
// The things on the bench (mm, group-local)
// ---------------------------------------------------------------------------

/** Self-healing cutting mat, 40 × 26 cm, 3 mm thick. */
export const MAT = Object.freeze({ w: 400, h: 3, d: 260 });
export const MAT_TOP = MAT.h;

/** White 830-point breadboard, 165 × 55 × 8.5 mm. Row 1 at its -x end, column a at its front (+z) edge. */
export const BOARD = Object.freeze({ x: -30, z: -10, w: 165, h: 8.5, d: 55 });
export const BOARD_TOP = MAT_TOP + BOARD.h;

/** The breadboard's front-right corner — where the tag's string is tied. */
export const TIE_CORNER = Object.freeze([BOARD.x + BOARD.w / 2, BOARD.z + BOARD.d / 2]);

/** Red SparkFun AD8232 breakout (35.6 × 28 mm) over rows 3–17, header on top, resting 1 mm up on its solder joints. */
export const AD8232 = Object.freeze({
    x: BOARD.x - BOARD.w / 2 + 10 + 17.8,
    z: BOARD.z - 4,
    w: 35.6, d: 28, t: 1.6,
    y: BOARD_TOP + 1 // PCB underside
});
export const AD8232_TOP = AD8232.y + AD8232.t;

/** The 3.5 mm jack on the AD8232's back edge, and the plug in it (axis along -z). */
export const JACK = Object.freeze({ x: AD8232.x - 4.3, axisY: AD8232_TOP + 2.5 });
// The jack's face stands 1 mm proud of the PCB's back edge; a 1.2 mm collar, then the plug.
export const PLUG = Object.freeze({
    x: JACK.x, y: JACK.axisY,
    collarZ: AD8232.z - AD8232.d / 2 - 1.6, collarLength: 1.2,
    bodyStart: AD8232.z - AD8232.d / 2 - 2.2, bodyLength: 15, bodyR: 4.2,
    reliefLength: 10
});
export const PLUG_TAIL_Z = PLUG.bodyStart - PLUG.bodyLength - PLUG.reliefLength;

/** Green Teensy 4.1 (61 × 18 mm) straddling the channel, rows ~21–45, on 2.5 mm headers. */
export const TEENSY = Object.freeze({
    x: BOARD.x + 6.5, z: BOARD.z,
    w: 61, d: 18, t: 1.6,
    y: BOARD_TOP + 2.5
});
export const TEENSY_TOP = TEENSY.y + TEENSY.t;

/** Its small orange LED (Teensy-local x -8, z +5.5 — the front side, so the camera sees it). */
export const LED = Object.freeze({ x: TEENSY.x - 8, z: TEENSY.z + 5.5, w: 1.6, h: 0.7, d: 0.9 });

/** Three foam electrode pads (44 mm) with snaps, clustered behind the board as in eeg.jpg. */
export const PAD_R = 22;
export const PAD_T = 1.2;
export const PAD_TOP = MAT_TOP + PAD_T;
export const PADS = Object.freeze([
    Object.freeze({ id: 'a', x: -2, z: -66, connector: Math.PI }),        // lead arrives from -x
    Object.freeze({ id: 'b', x: 46, z: -72, connector: Math.PI / 2 }),    // lead arrives from -z (behind)
    Object.freeze({ id: 'c', x: 18, z: -107, connector: Math.PI })
]);
/** The teal snap connector: cap over the stud, sleeve toward the lead. */
export const SNAP = Object.freeze({ capR: 5.2, capH: 4.2, sleeveLength: 10, sleeveY: PAD_TOP + 0.5 + 2.1 });

/** Grey leads, routed in plan (x, z) and draped onto whatever they lie across. */
export const CABLE_R = 1.35;
export const LEAD_R = 1.0;
export const SPLITTER = Object.freeze({ from: [-84, -112.5], to: [-70, -112], r: 2.6 });
export const MAIN_CABLE = Object.freeze([
    [PLUG.x, PLUG_TAIL_Z], [PLUG.x - 0.5, -62], [-91, -70], [-97, -77], [-110, -80], [-130, -80],
    [-149, -83], [-163, -91], [-168, -103], [-160, -114], [-140, -118], [-112, -116], SPLITTER.from
]);
/** Where a lead ends: 3 mm inside its connector's sleeve. */
function sleeveEnd(pad) {
    const reach = SNAP.capR + SNAP.sleeveLength - 3;
    return [pad.x + Math.cos(pad.connector) * reach, pad.z - Math.sin(pad.connector) * reach];
}
export const LEADS = Object.freeze([
    { pad: 'a', points: [SPLITTER.to, [-60, -104], [-48, -92], [-38, -80], [-30, -71], [-24, -67], sleeveEnd(PADS[0])] },
    { pad: 'c', points: [SPLITTER.to, [-50, -110], [-30, -108.5], [-12, -107.5], sleeveEnd(PADS[2])] },
    { pad: 'b', points: [SPLITTER.to, [-56, -118], [-35, -122], [-10, -124], [15, -124.5], [34, -121], [45, -112], [46, -100], sleeveEnd(PADS[1])] }
]);

/**
 * Manila shipping tag, 75 × 37.5 mm, card 0.3 mm. The hole end is the tag's
 * RIGHT (+x) as you read the front — the end nearest the knot, so the string
 * leaves it toward the board rather than trailing behind the card.
 *
 * It rests at the mat's front-centre: from the establishing camera the
 * receipt printer (≈ [-1.2, 0, 0.8], 0.30 tall) hides the mat's front-right
 * corner, which is where a tag would otherwise want to lie.
 */
export const TAG = Object.freeze({
    w: 75, h: 37.5, t: 0.3,
    clip: 7,          // the two corners cut off at the hole end
    holeX: 30.5,      // hole centre, tag-local, from the tag's centre
    holeR: 2.4,
    ringR: 6.6,       // the reinforcing patch
    rest: Object.freeze({ x: -8, z: 80, yaw: 0.25 }),
    // Put down after a visit: back up, turned half round and askew (hole end still toward the knot).
    left: Object.freeze({ x: -4, z: 86, yaw: Math.PI + 0.35 })
});
/** Where the string leaves the tag: the far side of the lark's-head loop round its end. */
export const TAG_STRING_EXIT = Object.freeze([TAG.w / 2 + 0.6, 0, 0]);
export const STRING_R = 0.5;
/**
 * The string's tail when the tag is held up (mm). Lying down, its slack is
 * art-directed rather than conserved (≈ 1.3 × the knot-to-tag gap), blended
 * by the tag's height — see drape.js stringLengthFor.
 */
export const STRING_LENGTH = 165;

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------

const UP = new THREE.Vector3(0, 1, 0);
const GROUP_QUATERNION = new THREE.Quaternion().setFromAxisAngle(UP, YAW);
const GROUP_QUATERNION_INVERSE = GROUP_QUATERNION.clone().invert();
const GROUP_ORIGIN = new THREE.Vector3(...POSITION);

/** mm, group-local → world Vector3 (the group at rest, i.e. not hover-lifted). */
export function local([x, y, z], out = new THREE.Vector3()) {
    return out.set(mm(x), mm(y), mm(z)).applyQuaternion(GROUP_QUATERNION).add(GROUP_ORIGIN);
}

/** World units → group-local UNITS (not mm) — what an Object3D parented to the group needs. */
export function worldToGroup(point, out = new THREE.Vector3()) {
    return out.copy(point).sub(GROUP_ORIGIN).applyQuaternion(GROUP_QUATERNION_INVERSE);
}
export function worldToGroupQuaternion(quaternion, out = new THREE.Quaternion()) {
    return out.copy(GROUP_QUATERNION_INVERSE).multiply(quaternion);
}
export function groupToWorldQuaternion(quaternion, out = new THREE.Quaternion()) {
    return out.copy(GROUP_QUATERNION).multiply(quaternion);
}

/** Corners (world) of a group-local, axis-aligned box given in mm: centre [x,y,z], size [w,h,d]. */
export function localBox([cx, cy, cz], [w, h, d]) {
    const corners = [];
    for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) {
        corners.push(local([cx + sx * w, cy + sy * h, cz + sz * d]));
    }
    return corners;
}

/** The breadboard's corners — what the focus shot is framed on. */
export function boardCorners() {
    return localBox([BOARD.x, MAT_TOP + BOARD.h / 2, BOARD.z], [BOARD.w, BOARD.h, BOARD.d]);
}
export function matCorners() {
    return localBox([0, MAT.h / 2, 0], [MAT.w, MAT.h, MAT.d]);
}
/** The whole rig on the mat (board + boards + plug + pads), for framing checks. */
export function rigCorners() {
    return localBox([-15, (MAT_TOP + 22) / 2, -52], [310, 22 - MAT_TOP, 160]);
}

/**
 * Tag rest pose, group-local UNITS: position + quaternion. Face up: front (+Z)
 * → +Y, top (+Y) → -Z (right way up from the establishing camera). Back up: the
 * same, turned over like a page about the tag's own vertical axis — the turn
 * the back is drawn for — so the back reads right way up too and the hole end
 * swaps to the right.
 */
export function tagRestPose({ face = 'front', pose = TAG.rest } = {}) {
    const quaternion = new THREE.Quaternion().setFromAxisAngle(UP, pose.yaw)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    if (face === 'back') quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI));
    const position = new THREE.Vector3(mm(pose.x), mm(MAT_TOP + TAG.t / 2 + 0.05), mm(pose.z));
    return { position, quaternion };
}

// ---------------------------------------------------------------------------
// The focus shot
// ---------------------------------------------------------------------------

/**
 * Leaning over a workbench, not a plan view. v1 shot from 50° above the mat,
 * square to its front edge, and the screenshot read as a diagram: the mat was
 * the whole frame, and the tag in hand was bigger on screen than the board.
 *
 * At 34° the board stands up off the mat and the desk beyond it fills the top
 * of the frame: the mat's back edge, the book row, the bookend and the wall at
 * the top left, and — at the top right — the props module's swing-arm lamp
 * (props/layout.js LAMP, base at [-1.24, 0, -0.74]): its weighted base on the
 * desk behind the mat's back-right corner and its lower arm rising out of the
 * frame (the head is over the mat, ≈ 1.3 up, above the frame). The lamp is
 * why the shot turns 14° toward the desk's front (azimuth 0.10, the mat's own
 * yaw being 0.35) and aims 38 mm right of v1's point: from the mat's own axis
 * the base was a sliver on the right edge. Now it is 100% in frame at 16:9,
 * 86% at 16:10 and 74% at 3:2 (cropped by the right edge, not clipped
 * to a sliver), with the board centre-left and the tag held lower right. The
 * turn also puts the mat's edges at an angle to the frame, which is most of
 * what stops it reading as a diagram.
 *
 * 0.40 of a 16:9 width (44.6% at 16:10, 47.5% at 3:2) is a little further back
 * than v1's 0.45 (0.94 from the aim, v1 0.79), and the held tag is smaller
 * (HAND below), so the board is the widest thing in the frame. As in v1 the
 * cable loop runs off the left edge.
 *
 * Portrait / narrow windows aim at the middle of the whole rig (the cable
 * loop's far end to the far pad) rather than right of the board, or the
 * board's left end runs off a phone.
 */
export const NARROW_ASPECT = 1.2;
export const SHOT = Object.freeze({
    elevation: THREE.MathUtils.degToRad(34),
    azimuth: YAW - 0.25,                         // 0.10
    // v4: the bench grew a scope (front left), the Pixel (right) and a parts
    // organiser (back right), so the shot frames all of them, not the board
    // alone: aimed at the mat's middle, as close as keeps the lot inside
    // 86% of the height / 94% of the width. The board lands ≈ 36% of a 16:10
    // width (v3: 44.6%), centred, the tag held up where it lay (front centre).
    lookAt: Object.freeze([2, 9, 5]),            // mm, group-local: the mat's middle
    fill: 0.86,
    maxWidthFill: 0.94,
    // v3's numbers, kept for the narrow fallback and the notes.
    boardWidth: 0.40,
    maxBoardWidth: 0.66
});

/** What #bench has to hold in frame (world corners): the board, the scope, the phone and the organiser. */
export function benchFrameCorners() {
    return [
        ...boardCorners(),
        ...scopeCorners(),
        ...phoneRestCorners(),
        ...yawedBox(PHONE_NOTE.rest, MAT_TOP, [PHONE_NOTE.size, 0.2, PHONE_NOTE.size]),
        ...organiserCorners()
    ];
}

/** The #bench camera pose at `aspect` (width / height): { position, lookAt } arrays, world units. */
export function benchShot(aspect = 16 / 9) {
    // Centred on what it holds (fitCentred, below): a fixed aim leaned the phone's
    // note off the right edge in portrait.
    return fitCentred(benchFrameCorners(), {
        elevation: SHOT.elevation, azimuth: SHOT.azimuth, fill: SHOT.fill, maxWidthFill: SHOT.maxWidthFill, aspect
    });
}

/**
 * The camera for the phone in hand (#bench/phone, #bench/phone/open…): the
 * #bench shot, but never closer than its 3:2 framing. On wider screens the
 * bench shot moves in (the mat's height binds, not its width) while the phone
 * is held at a fixed distance from the camera, so at 16:9 and wider the scope,
 * the tag and the mat's front edge came up in front of the phone's lower
 * quarter — over the launcher's last row and the gesture bar. From the 3:2
 * pose a wider screen only shows more of the room at the sides.
 */
export const PHONE_SHOT_MAX_ASPECT = 1.5;
export function phoneShot(aspect = 16 / 9) {
    return benchShot(Math.min(aspect, PHONE_SHOT_MAX_ASPECT));
}

/**
 * Where the tag is held in the #bench shot: lower right of the frame, below and
 * clear of the board (the string runs from the board's corner down to its hole
 * end), facing the camera, tipped back 8°, rolled a touch. Returns WORLD
 * position/quaternion (poseInFront's convention: front = local +Z, top = local +Y).
 *
 * 0.27 of the frame height as a card (≈ 29% as it lands on screen, roll and
 * perspective included); v1 held it at 0.36 (40%), which made the label bigger
 * than the thing it labels. In portrait it is held centred and 88% as wide as
 * the frame (v1: 60%), because there legibility is the constraint.
 */
export const HAND = Object.freeze({
    fraction: 0.25,
    ndc: Object.freeze([0, -0.6]),        // v4: front centre, where it lay (v3: lower right, where the phone is now)
    narrowNdc: Object.freeze([0, -0.5]),
    maxWidth: 0.88,       // of the frame width (binds only in portrait, below ≈ 0.62:1)
    tiltBack: THREE.MathUtils.degToRad(8),
    roll: THREE.MathUtils.degToRad(1.5),
    // v4: the back carries the note AND a thread line, so it is brought closer
    // to read (the way you would): 0.38 of the height, a little higher.
    back: Object.freeze({ fraction: 0.38, ndc: Object.freeze([0, -0.42]) })
});

export function tagHandPose(cameraPose, aspect = 16 / 9, fov = FOV, face = 'front') {
    const height = mm(TAG.h);
    const width = mm(TAG.w);
    const narrow = aspect < NARROW_ASPECT;
    const back = face === 'back' && !narrow;
    const [nx, ny] = narrow ? HAND.narrowNdc : back ? HAND.back.ndc : HAND.ndc;
    const base = poseInFront(cameraPose, {
        height, fraction: back ? HAND.back.fraction : HAND.fraction, width, maxWidthFraction: HAND.maxWidth,
        aspect, fov, tiltBack: HAND.tiltBack, roll: HAND.roll
    });
    const frameHeight = frameHeightAt(base.distance, fov);
    return poseInFront(cameraPose, {
        distance: base.distance,
        aspect, fov, tiltBack: HAND.tiltBack, roll: HAND.roll,
        right: nx * frameHeight * aspect / 2,
        down: -ny * frameHeight / 2
    });
}

/** The tag's own outline corners (world) for a pose — for frame reports. */
export function tagCorners({ position, quaternion }) {
    const corners = [];
    for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) {
        corners.push(new THREE.Vector3(mm(TAG.w) * sx, mm(TAG.h) * sy, 0).applyQuaternion(quaternion).add(toVec3(position)));
    }
    return corners;
}

// ===========================================================================
// v4 — the rest of the bench: power, a scope, the phone, a parts organiser
// ===========================================================================
//
// Everything below is mm, group-local, like the rest of this file. Clearances
// (plan, mm) as placed — checked in node against the real meshes:
//   scope ↔ tag at rest ≥ 20 · phone ↔ board ≥ 24 · phone ↔ organiser ≥ 20
//   organiser ↔ pad b ≥ 5 · organiser ↔ lamp base ≥ 26 · all inside the mat.

const DEG = Math.PI / 180;

/** A yawed rectangle's plan corners (mm): centre, size, yaw (a +yaw turn about +Y). */
export function planCorners({ x, z, yaw = 0 }, w, d) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
        const lx = (u * w) / 2;
        const lz = (v * d) / 2;
        return [x + lx * c + lz * s, z - lx * s + lz * c];
    });
}

/** Corners (world) of a yawed, group-local box in mm: plan centre, base y, size, yaw. */
export function yawedBox({ x, z, yaw = 0 }, y0, [w, h, d]) {
    const out = [];
    for (const [px, pz] of planCorners({ x, z, yaw }, w, d)) {
        out.push(local([px, y0, pz]), local([px, y0 + h, pz]));
    }
    return out;
}

// ---------------------------------------------------------------------------
// Power: a micro-USB lead into the Teensy
// ---------------------------------------------------------------------------

/** The Teensy's micro-USB receptacle (build.js: 5.6 deep × 2.6 × 7.6 wide at the board's -x end); its mouth faces -x. */
export const USB_SOCKET = Object.freeze({
    x: TEENSY.x - TEENSY.w / 2 + 2.0,
    mouthX: TEENSY.x - TEENSY.w / 2 + 2.0 - 2.8,
    y: TEENSY_TOP + 1.3,
    z: TEENSY.z
});
/**
 * The plug, plugged in (x along the lead, toward -x): a 6.4 mm metal shell,
 * 4.4 of it inside the socket; a 13 × 5.4 × 10.4 overmould whose underside
 * clears the AD8232's PCB (14.1) by 0.1 mm; a short strain relief.
 * Unplugged it lies back 6 mm (UNPLUGGED), on the same line — clear of the
 * AD8232's chip.
 */
export const USB_PLUG = Object.freeze({
    shell: Object.freeze({ inside: 4.4, length: 6.4, w: 6.9, h: 1.85 }),
    body: Object.freeze({ length: 13, h: 5.4, w: 10.4 }),
    relief: Object.freeze({ length: 6, r0: 2.5, r1: 1.9 }),
    cableR: 1.6,
    unplugged: 6
});
export const USB_TAIL_X = USB_SOCKET.mouthX + USB_PLUG.shell.inside - USB_PLUG.shell.length - USB_PLUG.body.length - USB_PLUG.relief.length;
/**
 * The lead, in plan from the strain relief: it bends back over the AD8232's
 * right edge, drops behind the board, crosses the three electrode leads just
 * after their splitter and runs off the mat's back edge to the books.
 */
export const USB_CABLE = Object.freeze([
    [USB_TAIL_X, USB_SOCKET.z], [USB_TAIL_X - 4, USB_SOCKET.z - 3.5], [USB_TAIL_X - 2.5, USB_SOCKET.z - 11],
    [-66, -29], [-60, -44], [-57, -64], [-56, -88], [-58, -112], [-61, -136], [-64, -170], [-66, -215], [-67, -262]
]);

/** The LED after power-on: a busy flicker (on/off ticks) instead of the 1 Hz blink. */
export const LED_FLICKER = Object.freeze({ tickMs: 70, onChance: 0.62, idleEvery: 7 }); // idleEvery: away from #bench/eeg, one chance per 7 ticks

// ---------------------------------------------------------------------------
// The scope: a DSO138-style kit scope, propped on its stand, facing the lens
// ---------------------------------------------------------------------------

/**
 * A small hobby oscilloscope in a clear case: 90 × 60 × 16 mm, a 2.4" TFT
 * (48.96 × 36.72 active) at the left of its face, two buttons and a slide
 * switch at the right, a BNC socket on its top edge. Propped at 30° on a fold
 * stand at the mat's front left, turned (yaw -0.25) square to the #bench/eeg
 * camera. (x, z) is its plan centre; the pivot is the middle of its front
 * bottom edge.
 */
export const SCOPE = Object.freeze({
    x: -122, z: 80, yaw: -0.25,
    w: 90, d: 60, t: 16,
    tilt: 30 * DEG,
    // Face canvas (mm, as the face is read: left = case left, top = case top edge).
    bezel: Object.freeze({ x: 4.5, y: 7, w: 56, h: 44 }),
    screen: Object.freeze({ x: 8, y: 10.6, w: 48.96, h: 36.72 }),
    buttons: Object.freeze([[73, 13], [83, 13]]),
    slide: Object.freeze({ x: 70, y: 22.5, w: 16, h: 5 }),
    sticky: Object.freeze({ x: 61, y: 29.5, size: 30, roll: -5 * DEG }),
    bnc: Object.freeze({ x: 14, r: 4.8, length: 11 })
});
/** Plan depth of the propped case, and its top edge's height. */
export const SCOPE_FOOT = SCOPE.d * Math.cos(SCOPE.tilt);
export const SCOPE_TOP = MAT_TOP + SCOPE.d * Math.sin(SCOPE.tilt) + SCOPE.t * Math.cos(SCOPE.tilt);
/** The scope's pivot (front bottom edge, middle), plan. */
export function scopePivot() {
    const back = SCOPE_FOOT / 2;
    return { x: SCOPE.x + Math.sin(SCOPE.yaw) * back, z: SCOPE.z + Math.cos(SCOPE.yaw) * back };
}
/** The propped case's corners (world): the tilted box, and the stand's feet behind it. */
export function scopeCorners() {
    const p = scopePivot();
    const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), SCOPE.tilt);
    const yaw = new THREE.Quaternion().setFromAxisAngle(UP, SCOPE.yaw);
    const out = [];
    const put = (v) => out.push(local([p.x + v.x, MAT_TOP + v.y, p.z + v.z]));
    for (const x of [-SCOPE.w / 2, SCOPE.w / 2]) {
        for (const y of [0, SCOPE.t]) for (const z of [-SCOPE.d, 0]) put(new THREE.Vector3(x, y, z).applyQuaternion(tilt).applyQuaternion(yaw));
        put(new THREE.Vector3(x * 0.64, 0, -SCOPE.d * Math.cos(SCOPE.tilt) - 8).applyQuaternion(yaw));
    }
    return out;
}
/** Header pins on the AD8232 (build.js): GND is pin 0, OUTPUT pin 2; tips 17.3 mm up. */
const HEADER_X = AD8232.x - 1.7;
const HEADER_Z = AD8232.z + AD8232.d / 2 - 2.5;
export const PIN = Object.freeze({
    gnd: Object.freeze([HEADER_X - 2.5 * 2.54, HEADER_Z]),
    output: Object.freeze([HEADER_X - 0.5 * 2.54, HEADER_Z]),
    tipY: AD8232_TOP + 3.2
});
/** Mini-grabber clips on those pins, leaning out toward the scope. */
export const GRABBER = Object.freeze({ r: 2.3, length: 19, lean: 38 * DEG });
export const PROBE_R = 1.35;

/** The scope's trace: a 3.2 s sweep of the screen (scrolling), and the EOG model (eog.js). */
export const TRACE = Object.freeze({ seconds: 3.2, samples: 256 });

// ---------------------------------------------------------------------------
// The phone: Shae's Pixel (assets/models/pixel.glb)
// ---------------------------------------------------------------------------

/**
 * pixel.glb (measured in node): 77.0 × 163.0 × 11.2 mm, standing up — long
 * axis +Y from 0 to 0.163, screen facing +Z, camera bar on the back. It is
 * scaled so its length is 0.48 units (150 mm on this desk's scale — the
 * brief's size), and centred. The screen's flat glass is ±33 mm × 3…160 mm
 * (native) at z 5.58; the canvas plane sits just proud of it.
 */
export const PHONE = Object.freeze({
    url: '/models/pixel.glb',
    nativeLength: 0.163,
    nativeCentreY: 0.0815,
    length: 150,                      // mm (0.48 units)
    width: 150 * 77.0 / 163.0,        // 70.9
    thickness: 150 * 11.2 / 163.0,    // 10.3
    back: 150 * 5.6 / 163.0,          // the camera bar's face below the centre plane (5.15)
    screen: Object.freeze({ w: 150 * 66 / 163, h: 150 * 157 / 163, cy: 150 * (81.5 - 81.5) / 163, z: 150 * 5.66 / 163, r: 150 * 7 / 163 }),
    // Lying sideways across the mat's front right, its top toward the board: the
    // bottom drawer, pulled out, clears it (lying lengthways, the drawer ran onto it).
    rest: Object.freeze({ x: 120, z: 84, yaw: Math.PI / 2 + 0.06 })
});
export const PHONE_UNITS = mm(PHONE.length);
/** The phone's rest pose, group-local units: face up, lying sideways (top toward the board). */
export function phoneRestPose() {
    const quaternion = new THREE.Quaternion().setFromAxisAngle(UP, PHONE.rest.yaw)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    const position = new THREE.Vector3(mm(PHONE.rest.x), mm(MAT_TOP + NOTE_T + PHONE.back + 0.05), mm(PHONE.rest.z));
    return { position, quaternion };
}
export function phoneRestCorners() {
    return yawedBox({ x: PHONE.rest.x, z: PHONE.rest.z, yaw: PHONE.rest.yaw }, MAT_TOP, [PHONE.width, PHONE.thickness, PHONE.length]);
}

/**
 * The note that lives under the phone: a 76 mm yellow sticky on the mat, half
 * tucked under its back edge (the written top half shows). Picking the phone up uncovers it;
 * unlocking the phone brings it up beside the phone.
 */
export const NOTE_T = 0.1;
export const PHONE_NOTE = Object.freeze({ size: 76, rest: Object.freeze({ x: 150, z: 40, yaw: -0.16 }) });
export function noteRestPose() {
    const quaternion = new THREE.Quaternion().setFromAxisAngle(UP, PHONE_NOTE.rest.yaw)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    return { position: new THREE.Vector3(mm(PHONE_NOTE.rest.x), mm(MAT_TOP + NOTE_T / 2 + 0.02), mm(PHONE_NOTE.rest.z)), quaternion };
}

/**
 * The phone in hand (#bench/phone, #bench/phone/open) from the bench camera:
 * 0.6 of the frame height, a touch right of centre; unlocked, it moves left
 * and the note comes up at its right. Portrait: the phone above, the note
 * below it.
 */
export const PHONE_HAND = Object.freeze({
    fraction: 0.6,
    ndc: Object.freeze([0.12, 0.02]),
    open: Object.freeze({ phone: Object.freeze([-0.24, 0.02]), note: Object.freeze([0.3, -0.06]), noteFraction: 0.33 }),
    // Portrait, unlocked: the phone above (0.5 of the height — its OS's type
    // wants it: launcher rows ≈ 20 CSS px at 390 × 844), the note below.
    narrow: Object.freeze({ fraction: 0.5, ndc: Object.freeze([0, 0.05]), phone: Object.freeze([0, 0.35]), phoneFraction: 0.5, note: Object.freeze([0, -0.56]), noteWidth: 0.6 }),
    maxWidth: 0.62,
    tiltBack: 6 * DEG,
    roll: -1.2 * DEG,
    noteRoll: 2.2 * DEG
});

function heldAt(cameraPose, { height, width, fraction, maxWidth, ndc, aspect, fov, tiltBack, roll }) {
    const base = poseInFront(cameraPose, { height, fraction, width, maxWidthFraction: maxWidth, aspect, fov, tiltBack, roll });
    const frameHeight = frameHeightAt(base.distance, fov);
    return poseInFront(cameraPose, {
        distance: base.distance, aspect, fov, tiltBack, roll,
        right: ndc[0] * frameHeight * aspect / 2,
        down: -ndc[1] * frameHeight / 2
    });
}

/** WORLD poses for the phone and its note in hand: { phone, note? }. */
export function phoneHandPoses(cameraPose, aspect = 16 / 9, fov = FOV, { open = false } = {}) {
    const narrow = aspect < NARROW_ASPECT;
    const H = PHONE_HAND;
    const height = mm(PHONE.length);
    const width = mm(PHONE.width);
    const noteSize = mm(PHONE_NOTE.size);
    const common = { aspect, fov, tiltBack: H.tiltBack };
    if (!open) {
        const phone = heldAt(cameraPose, {
            ...common, height, width, roll: H.roll, maxWidth: H.maxWidth,
            fraction: narrow ? H.narrow.fraction : H.fraction, ndc: narrow ? H.narrow.ndc : H.ndc
        });
        return { phone };
    }
    if (narrow) {
        const phone = heldAt(cameraPose, { ...common, height, width, roll: H.roll, maxWidth: H.maxWidth, fraction: H.narrow.phoneFraction, ndc: H.narrow.phone });
        const note = heldAt(cameraPose, { ...common, height: noteSize, width: noteSize, roll: H.noteRoll, maxWidth: H.narrow.noteWidth, fraction: 0.3, ndc: H.narrow.note });
        return { phone, note };
    }
    const phone = heldAt(cameraPose, { ...common, height, width, roll: H.roll, maxWidth: H.maxWidth, fraction: H.fraction, ndc: H.open.phone });
    // The note at the phone's distance, so the two keep their true sizes.
    const frameHeight = frameHeightAt(phone.distance, fov);
    const note = poseInFront(cameraPose, {
        distance: phone.distance, aspect, fov, tiltBack: H.tiltBack, roll: H.noteRoll,
        right: H.open.note[0] * frameHeight * aspect / 2, down: -H.open.note[1] * frameHeight / 2
    });
    return { phone, note };
}

/** Outline corners (world) of an upright w × h (mm) item at a pose (front +Z). */
export function itemCorners({ position, quaternion }, wMm, hMm) {
    const corners = [];
    for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) {
        corners.push(new THREE.Vector3(mm(wMm) * sx, mm(hMm) * sy, 0).applyQuaternion(quaternion).add(toVec3(position)));
    }
    return corners;
}

// ---------------------------------------------------------------------------
// The parts organiser: five little drawers at the mat's back right
// ---------------------------------------------------------------------------

/**
 * A small parts cabinet, 110 × 90 × 70 mm (w × h × d), drawers facing the
 * viewer, standing on the mat's back edge between pad b and the lamp's base.
 * Five drawers top to bottom; each pulls out 46 mm (18 left in the cabinet).
 */
export const ORGANISER = Object.freeze({
    x: 132, z: -92, yaw: -0.05,
    w: 110, h: 90, d: 70,
    wall: 2.2,
    pull: 46,
    drawers: Object.freeze(['resistors', 'jumpers', 'headers', 'electrodes', 'next'])
});
export const DRAWER = (() => {
    const pitch = (ORGANISER.h - 2 * ORGANISER.wall) / ORGANISER.drawers.length;
    return Object.freeze({
        pitch,
        frontW: ORGANISER.w - 2 * ORGANISER.wall - 1.6,
        frontH: pitch - 1.2,
        frontT: 2,
        trayW: ORGANISER.w - 2 * ORGANISER.wall - 2.4,
        trayH: pitch - 3.2,
        trayD: ORGANISER.d - ORGANISER.wall - 4,
        wall: 1.1,
        label: Object.freeze({ w: 50, h: 8.6 })
    });
})();
/** Drawer i's front-face centre height (mm above the desk). i = 0 is the top drawer. */
export function drawerCentreY(i) {
    return MAT_TOP + ORGANISER.h - ORGANISER.wall - DRAWER.pitch * (i + 0.5);
}
export function organiserCorners() {
    return yawedBox(ORGANISER, MAT_TOP, [ORGANISER.w, ORGANISER.h, ORGANISER.d]);
}
/** The organiser with one drawer pulled out (for the drawer shot's fit). */
export function organiserOpenCorners() {
    const c = [];
    const pulled = { x: ORGANISER.x + Math.sin(ORGANISER.yaw) * ORGANISER.pull / 2, z: ORGANISER.z + Math.cos(ORGANISER.yaw) * ORGANISER.pull / 2, yaw: ORGANISER.yaw };
    c.push(...yawedBox(pulled, MAT_TOP, [ORGANISER.w, ORGANISER.h, ORGANISER.d + ORGANISER.pull]));
    return c;
}

// ---------------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------------

/**
 * #bench/eeg — powered on: the scope, the AD8232 with the clips on its pins,
 * the plug in the Teensy and its LED, from 36° up, square to the scope's face.
 */
export const EEG_SHOT = Object.freeze({ elevation: 36 * DEG, azimuth: YAW + SCOPE.yaw, fill: 0.8, maxWidthFill: 0.9 });
export function eegFrameCorners() {
    return [
        ...scopeCorners(),
        ...localBox([AD8232.x, AD8232_TOP, AD8232.z], [AD8232.w, 6, AD8232.d]),
        ...localBox([LED.x + 4, TEENSY_TOP, LED.z], [10, 4, 6]),
        ...localBox([USB_TAIL_X, USB_SOCKET.y, USB_SOCKET.z], [8, 6, 10])
    ];
}
export function eegShot(aspect = 16 / 9) {
    return fitCentred(eegFrameCorners(), { ...EEG_SHOT, aspect });
}

/**
 * The closest orbit shot (elevation / azimuth fixed) that holds every corner
 * inside `fill` of the frame height and `maxWidthFill` of its width, CENTRED
 * on what it holds — fitShot aims at the corners' centroid, which perspective
 * pushes off-centre when the near end of the subject is much closer.
 */
export function fitCentred(corners, { elevation, azimuth, fill, maxWidthFill, aspect, fov = FOV }) {
    const centre = corners.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / corners.length);
    let lookAt = centre.clone();
    let best = null;
    for (let pass = 0; pass < 6; pass += 1) {
        const fits = (distance) => {
            const pose = orbitShot(lookAt, { distance, elevation, azimuth });
            const report = frameReport(corners, makeCamera(pose, aspect, fov));
            const ok = !report.behind
                && Math.max(-report.ndc.minY, report.ndc.maxY) <= fill
                && Math.max(-report.ndc.minX, report.ndc.maxX) <= maxWidthFill;
            return { pose, report, ok, distance };
        };
        let lo = 0.1;
        let hi = 20;
        best = fits(hi);
        for (let i = 0; i < 36; i += 1) {
            const mid = (lo + hi) / 2;
            const attempt = fits(mid);
            if (attempt.ok) { best = attempt; hi = mid; } else { lo = mid; }
        }
        // Re-aim at the middle of where the corners landed.
        const { ndc } = best.report;
        const cx = (ndc.minX + ndc.maxX) / 2;
        const cy = (ndc.minY + ndc.maxY) / 2;
        if (Math.abs(cx) < 0.005 && Math.abs(cy) < 0.005) break;
        const camera = makeCamera(best.pose, aspect, fov);
        const halfH = frameHeightAt(best.distance, fov) / 2;
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        lookAt = lookAt.clone().addScaledVector(right, cx * halfH * aspect).addScaledVector(up, cy * halfH);
    }
    return { position: best.pose.position, lookAt: best.pose.lookAt, distance: best.distance };
}

/** #bench/drawer — in front of the organiser, 34° up (you can see into a pulled drawer), a little off square. */
export const DRAWER_SHOT = Object.freeze({ elevation: 34 * DEG, azimuth: YAW + ORGANISER.yaw - 0.12, fill: 0.66, maxWidthFill: 0.8 });
export function drawerShot(aspect = 16 / 9) {
    return fitCentred(organiserOpenCorners(), { ...DRAWER_SHOT, aspect });
}
