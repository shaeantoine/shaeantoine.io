import * as THREE from 'three';

/**
 * PROPS, AS NUMBERS — the things that make the desk Shae's own desk (as in
 * the photos of the real desk): the black swing-arm bar lamp, the white
 * low-profile keyboard with a black fabric wrist rest, and a dark matte mug of
 * coffee with steam coming off it. No DOM in here, so node can import it and
 * check every footprint and shot:
 *
 *   cd desk && node --input-type=module -e "
 *     import * as L from './src/modules/props/layout.js';
 *     console.log(L.LAMP.joints, L.lampHitBox());"
 *
 * World units, 3.2 per metre (1 mm = 0.0032). Desk top is y = 0. Sizes are
 * given in millimetres of the real object and converted with mm().
 *
 * NEIGHBOURS (measured from the real meshes; keep these clear if anything moves)
 *   studio-display  foot plate x ±0.244, z -0.602…0.102 (y < 0.06); panel
 *                   x ±1.000, z -0.262…-0.039, bottom edge y 0.389
 *   book row        z ≤ -0.991 (front face), y ≤ 0.692
 *   bench mat       [-2.0, 0, -0.275] yaw 0.35, 400 × 260 mm: right edge runs
 *                   (-1.541, -0.885) → (-1.256, -0.104)
 *   printer         body hull x -1.421…-0.979, z 0.461…0.939; the draped
 *                   receipt reaches x -0.847, z 1.399
 *   mouse           x 0.722…0.878, z 0.850…1.150
 *   desk front edge z 1.5
 */

export const MM = 0.0032;
export const mm = (value) => value * MM;

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = v3(0, 1, 0);

// ---------------------------------------------------------------------------
// Materials (physical colours of objects — the paper/ink palette is core/palette.js)
// ---------------------------------------------------------------------------

export const COLORS = Object.freeze({
    lampBlack: '#141414',     // powder-coated steel
    lampSteel: '#a9abad',     // springs and joint bolts
    diffuserOff: '#3d3a36',   // the frosted strip, unlit (sRGB)
    lampLight: 0xffcf98,      // ≈ 3000 K
    keyboardCase: '#d2d4d6',  // light-grey anodised frame (dielectric: see keyboard.js)
    keycap: '#e7e5df',        // off-white PBT
    legend: '#8d8b86',        // subtle grey legends
    wristRest: '#171717',     // black lycra over foam
    mug: '#2b2c2e',           // charcoal matte stoneware
    latte: '#cdb18c',         // milk foam
    steam: '#f3efe8'          // the wisps: a warm white, screened over the room (steam.js)
});

// ---------------------------------------------------------------------------
// The lamp: a black swing-arm bar lamp on a weighted round base
// ---------------------------------------------------------------------------

/** The lamp's group origin: the centre of its base, on the desk. */
export const LAMP_ORIGIN = Object.freeze([-1.24, 0, -0.74]);

/**
 * THE HEAD'S HEIGHT IS SET BY THE ESTABLISHING SHOT, not by the lamp: at y 1.17
 * the bar lands at NDC y 0.115…0.152 (≈ 40 px under the Whiplash poster's frame
 * and ≈ 40 px over the left flank's book tops at 1440 × 900) — the clear band of
 * wall between them. At 1.32 it kissed the poster's bottom edge.
 *
 * The arm lives in one vertical plane through the base (a real swing arm pivots
 * about horizontal axes and swivels on its post), running along ARM_DIRECTION —
 * almost exactly -x, so from the establishing camera the arm is seen broadside
 * and draws its Z. The elbow goes LEFT, over the mat's back-right corner: the
 * other way it would hide behind the display (a point at x -1.05, z -0.8
 * projects inside the panel from the camera). The head swivels at its knuckle
 * to run parallel to the mat's long edge (yaw 0.35) and hangs over the mat's
 * back third, tilted 30° toward the room so its diffuser strip catches the
 * camera and the light falls forward onto the board.
 */
const ARM_DIRECTION = v3(-0.34, 0, -0.06).normalize();

export const LAMP = (() => {
    const origin = v3(...LAMP_ORIGIN);
    const base = { radiusBottom: mm(60), radiusTop: mm(56), height: mm(14) };
    const bossHeight = mm(8);
    const pivot = origin.clone().add(v3(0, mm(50), 0));                                  // P0, the lower knuckle
    const elbow = pivot.clone().addScaledVector(ARM_DIRECTION, 0.345).add(v3(0, 0.51, 0)); // P1
    const top = pivot.clone().add(v3(0, 1.05, 0));                                        // P2, the head knuckle
    const axis = ARM_DIRECTION.clone().cross(UP).normalize();                             // the knuckles' pivot axis

    const headYaw = 0.35;                                  // parallel to the mat's long edge
    const direction = v3(-Math.cos(headYaw), 0, Math.sin(headYaw)); // along the bar, away from the knuckle
    const across = v3(Math.sin(headYaw), 0, Math.cos(headYaw));     // horizontal, toward the room
    const tilt = THREE.MathUtils.degToRad(30);
    const head = { length: mm(340), height: mm(13), width: mm(28), neck: mm(14), drop: mm(13) };
    const headStart = top.clone().addScaledVector(direction, head.neck).add(v3(0, -head.drop, 0));
    const headCentre = headStart.clone().addScaledVector(direction, head.length / 2);
    // The head's orientation: local +X along the bar, local -Y the diffuser's normal.
    const down = v3(0, -Math.cos(tilt), 0).addScaledVector(across, Math.sin(tilt));
    const headUp = down.clone().negate();
    const headSide = direction.clone().cross(headUp).normalize();
    const headBasis = new THREE.Matrix4().makeBasis(direction, headUp, headSide);
    const headQuaternion = new THREE.Quaternion().setFromRotationMatrix(headBasis);
    const strip = { length: mm(318), width: mm(20), thickness: mm(1.2) };
    const stripCentre = headCentre.clone().addScaledVector(down, head.height / 2 + strip.thickness / 2);

    // The pool: aimed forward-down at the breadboard (bench layout: board centre
    // ≈ (-2.10, 0.04, -0.27) world), a touch in front of it so the tag's resting
    // place is lit too.
    const lightPosition = headCentre.clone().addScaledVector(down, head.height / 2 + mm(4));
    const lightTarget = v3(-2.05, 0.01, -0.22);

    return Object.freeze({
        origin, base, bossHeight,
        post: { radius: mm(6.5) },
        joints: { pivot, elbow, top },
        axis,
        bar: { thickness: mm(3.2), depth: mm(8), separation: mm(13) }, // twin flat bars per arm
        knuckle: { radius: mm(8), length: mm(24), bolt: mm(3.6), boltLength: mm(29) },
        spring: { radius: mm(4.2), wire: mm(0.75), pitch: mm(1.7), offset: mm(11) },
        springs: [
            { from: 'pivot', to: 'elbow', start: 0.08, end: 0.52 },
            { from: 'elbow', to: 'top', start: 0.1, end: 0.48 }
        ],
        head: { ...head, direction, across, down, tilt, start: headStart, centre: headCentre, quaternion: headQuaternion },
        strip: { ...strip, centre: stripCentre },
        light: {
            position: lightPosition,
            target: lightTarget,
            color: COLORS.lampLight,
            // Candela, decay 2 (the room's units). From 1.2 away (19.5° off
            // vertical) this is ≈ 2.7 on the board: a little over the midday
            // sun's irradiance on the desk (780 cd from 12.9 units at N·L 0.46
            // ≈ 2.2), so it reads by day and pools strongly at night (the
            // overhead gives the desk ≈ 1.9).
            intensity: 4,
            angle: 0.8,
            penumbra: 0.85
        },
        // The diffuser, lit: linear, HDR (×3 of a warm white reads as a lit
        // strip after ACES rather than as cream paint).
        stripOn: { color: 0xfff1dc, scale: 3.2 },
        fadeMs: 250
    });
})();

/** World → the lamp group's local frame (the group is unrotated). */
export function lampLocal(point) {
    return point.clone().sub(LAMP.origin);
}

/**
 * The lamp's hover / click volume, WORLD, as an axis-aligned box: the head and
 * its knuckle — the bar you would reach for, standing clear against the wall.
 * DeskScene gives an object ONE box (the AABB of its parts), so the arm and
 * base are left out on purpose: a box round the whole L-shaped lamp would sit
 * in front of the bench's mat on screen and steal its clicks, and it would
 * turn the empty air above the mat in #bench into a light switch.
 */
export function lampHitBox(pad = mm(8)) {
    const { head, joints, knuckle } = LAMP;
    const box = new THREE.Box3();
    const corners = [];
    for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) {
        corners.push(v3(sx * head.length, sy * head.height, sz * head.width).applyQuaternion(head.quaternion).add(head.centre));
    }
    box.setFromPoints(corners);
    box.expandByPoint(joints.top.clone().add(v3(0, knuckle.radius, 0)));
    box.expandByScalar(pad);
    return box;
}

/** lampHitBox() as a hitProxy for the lamp's deskObjects entry: [size, localCentre]. */
export function lampHitProxy() {
    const box = lampHitBox();
    const size = box.getSize(v3(0, 0, 0)).toArray();
    const centre = lampLocal(box.getCenter(v3(0, 0, 0))).toArray();
    return { size, centre };
}

// ---------------------------------------------------------------------------
// The keyboard: white low-profile 75%, and a black fabric wrist rest
// ---------------------------------------------------------------------------

/** 1u, the key pitch. */
export const KEY_U = 19.05;

/**
 * A 75% layout (Mac legends), row 0 at the back. Each row sums to 16u. A key is
 * [legend, width in u] or [legend, width, { small, arrow }].
 */
export const KEY_ROWS = Object.freeze([
    [['esc', 1, { small: true }], ['F1', 1, { small: true }], ['F2', 1, { small: true }], ['F3', 1, { small: true }], ['F4', 1, { small: true }],
        ['F5', 1, { small: true }], ['F6', 1, { small: true }], ['F7', 1, { small: true }], ['F8', 1, { small: true }], ['F9', 1, { small: true }],
        ['F10', 1, { small: true }], ['F11', 1, { small: true }], ['F12', 1, { small: true }], ['', 1], ['del', 1, { small: true }], ['', 1]],
    [['~', 1], ['1', 1], ['2', 1], ['3', 1], ['4', 1], ['5', 1], ['6', 1], ['7', 1], ['8', 1], ['9', 1], ['0', 1], ['-', 1], ['=', 1],
        ['delete', 2, { small: true }], ['pgup', 1, { small: true }]],
    [['tab', 1.5, { small: true }], ['Q', 1], ['W', 1], ['E', 1], ['R', 1], ['T', 1], ['Y', 1], ['U', 1], ['I', 1], ['O', 1], ['P', 1],
        ['[', 1], [']', 1], ['\\', 1.5], ['pgdn', 1, { small: true }]],
    [['caps lock', 1.75, { small: true }], ['A', 1], ['S', 1], ['D', 1], ['F', 1], ['G', 1], ['H', 1], ['J', 1], ['K', 1], ['L', 1],
        [';', 1], ["'", 1], ['return', 2.25, { small: true }], ['home', 1, { small: true }]],
    [['shift', 2.25, { small: true }], ['Z', 1], ['X', 1], ['C', 1], ['V', 1], ['B', 1], ['N', 1], ['M', 1], [',', 1], ['.', 1], ['/', 1],
        ['shift', 1.75, { small: true }], ['up', 1, { arrow: 'up' }], ['end', 1, { small: true }]],
    [['control', 1.25, { small: true }], ['option', 1.25, { small: true }], ['command', 1.25, { small: true }], ['', 6.25],
        ['command', 1, { small: true }], ['fn', 1, { small: true }], ['control', 1, { small: true }],
        ['left', 1, { arrow: 'left' }], ['down', 1, { arrow: 'down' }], ['right', 1, { arrow: 'right' }]]
]);

export const KEYBOARD = (() => {
    const bezel = { side: 3.8, back: 4.2, front: 4.2 };
    const widthMm = 16 * KEY_U + 2 * bezel.side;               // 312.4 mm
    const depthMm = KEY_ROWS.length * KEY_U + bezel.back + bezel.front; // 122.7 mm
    return Object.freeze({
        // Centred where the old keyboard was (x 0, z 1.0), 7 cm further back
        // so the wrist rest fits in front with 3 cm to the desk's edge.
        position: Object.freeze([0, 0, 0.93]),
        bezel,
        widthMm,
        depthMm,
        caseHeightMm: 10.5,
        caseRadiusMm: 2.5,
        cap: Object.freeze({ gapMm: 1.5, insetMm: 1.2, heightMm: 4.5 }),
        width: mm(widthMm),
        depth: mm(depthMm),
        caseHeight: mm(10.5)
    });
})();

/** Every key: { legend, row, x, z, w (mm, keyboard-local, centre), options }. */
export function keyList() {
    const keys = [];
    const left = -KEYBOARD.widthMm / 2 + KEYBOARD.bezel.side;
    const back = -KEYBOARD.depthMm / 2 + KEYBOARD.bezel.back;
    KEY_ROWS.forEach((row, r) => {
        let column = 0;
        for (const [legend, width, options = {}] of row) {
            keys.push({
                legend,
                row: r,
                x: left + (column + width / 2) * KEY_U,
                z: back + (r + 0.5) * KEY_U,
                w: width * KEY_U,
                options
            });
            column += width;
        }
        if (Math.abs(column - 16) > 1e-9) throw new Error(`keyboard row ${r} is ${column}u, not 16u`);
    });
    return keys;
}

export const WRIST_REST = (() => {
    const bevel = mm(4.5);
    const shape = { width: 1.2, depth: 0.22, radius: 0.085 };   // plan, before the bevel
    const footprint = { width: shape.width + 2 * bevel, depth: shape.depth + 2 * bevel };
    const z = KEYBOARD.position[2] + KEYBOARD.depth / 2 + mm(10) + footprint.depth / 2;
    return Object.freeze({
        shape,
        bevel,
        core: mm(11),                 // extruded height between the bevels
        height: mm(11) + 2 * bevel,   // 20 mm
        footprint,
        // Keyboard-group local: centred behind nothing, in front of the keyboard.
        localZ: z - KEYBOARD.position[2],
        worldZ: z
    });
})();

// ---------------------------------------------------------------------------
// The mug — left of the display's foot, as on the real desk — and its steam
// ---------------------------------------------------------------------------
//
// Placed for the establishing shot (16:10 figures): the lamp's base projects to
// NDC x -0.349…-0.254, y -0.320…-0.245, and the mug stands in front of the
// display's foot and right of the base, its top 0.039 under the base and its
// handle 0.063 right of the printer. Its steam rises in front of the display's
// dark lower-left corner. (It used to share the spot with a glass of water, by
// the display's foot; the glass is gone.)
export const MUG = Object.freeze({
    position: Object.freeze([-0.62, 0, 0.46]),
    radius: mm(42),
    height: mm(95),
    wall: mm(4),
    base: mm(6),
    fill: mm(80),                // the latte's surface, from the desk
    // heading: the mug group's yaw, which turns the handle (built on local +X) to
    // point left and 20° back, away from the printer — (cos h, 0, -sin h) = (-0.94, 0, -0.34).
    handle: Object.freeze({ radius: mm(26), tube: mm(5.5), heading: THREE.MathUtils.degToRad(160) })
});

/**
 * THE STEAM (steam.js) is not geometry: it is a small DOM layer over the canvas,
 * pinned to the mug's rim through the live camera, so the room never renders a
 * frame for it. Its own coordinates are MILLIMETRES of the real mug (one CSS px
 * of the layer = 1 mm at the rim; steam.js maps them to the screen with one
 * matrix per camera pose), with the rim's centre at the bottom middle of `box`.
 *
 * Four wisps, each a soft S-stroke that rises, sways, widens and dissolves, on
 * unequal periods (8.3–13.9 s) so the pattern never visibly repeats, over a
 * faint haze just above the coffee. Every wisp is gone by ~11 cm above the rim.
 * `phase` is where each one sits in its cycle at time 0 — the frame ?still=1
 * holds, and where a fresh start (or a return from off-screen) picks up.
 */
export const STEAM = Object.freeze({
    /** Mug-local: the rim's centre, where the steam's base sits. */
    base: Object.freeze([0, MUG.height, 0]),
    /** The occlusion probe: this far above the rim's centre. */
    probeLift: mm(6),
    /** The layer, in mm. The rim's centre is at (width / 2, height). */
    box: Object.freeze({ width: 150, height: 130 }),
    /** Hide below this projected coffee diameter (CSS px). */
    minPx: 8,
    /** From above, steam foreshortens; never flatter than this (vertical ÷ horizontal scale). */
    minVerticalRatio: 0.3,
    /** The layer's opacity per time of day: stronger against the dark, gentler by day. */
    strength: Object.freeze({ morning: 0.3, day: 0.26, evening: 0.36, night: 0.42 }),
    /** prefers-reduced-motion: one wisp, held still, this much fainter. */
    reducedScale: 0.6,
    fadeInMs: 800,
    /** Occlusion re-tested at most this often while the camera travels (and always when it lands)… */
    occlusionEveryMs: 120,
    /** …and, with the camera still, at most this often on frames the room draws anyway. */
    occlusionRestMs: 500,
    /** Routes whose shot doesn't want steam even with the mug in frame (none yet). */
    quietRoutes: Object.freeze([]),
    wisps: Object.freeze([
        // x: the wisp's foot, mm right of the rim's centre; w × h: its own box, mm.
        { path: 'M20 72 C 14 60, 25 50, 19 38 S 13 18, 21 4', w: 40, h: 72, x: -12, keyframes: 'a', duration: 9.7, phase: 0.42, weight: 1 },
        { path: 'M22 70 C 28 58, 17 47, 23 35 S 30 14, 20 2', w: 44, h: 70, x: 10, keyframes: 'b', duration: 11.3, phase: 0.71, weight: 0.9 },
        { path: 'M18 64 C 13 54, 22 44, 16 32 S 12 14, 19 3', w: 36, h: 64, x: -2, keyframes: 'c', duration: 8.3, phase: 0.14, weight: 0.8 },
        { path: 'M24 76 C 31 62, 18 52, 26 40 S 34 18, 25 4', w: 48, h: 76, x: 17, keyframes: 'a', duration: 13.9, phase: 0.86, weight: 0.55 }
    ].map(Object.freeze)),
    /**
     * Keyframes: at (0…1) → x, y (mm, y down), sx, sy (scale about the wisp's
     * foot), k (skewX, degrees), o (opacity). Each rises 32–38 mm while its
     * shape stretches 10–15%, so the top dissolves at 9–11 cm.
     */
    keyframes: Object.freeze({
        a: [[0, 0, 8, 0.6, 0.55, 0, 0], [0.16, -1, 2, 0.78, 0.75, -2, 0.9], [0.45, -4, -12, 0.98, 0.92, -6, 0.72], [0.75, 2, -26, 1.25, 1.04, 3, 0.34], [1, 6, -38, 1.55, 1.12, 8, 0]],
        b: [[0, 0, 8, 0.6, 0.55, 0, 0], [0.18, 1, 2, 0.8, 0.76, 2, 0.85], [0.48, 5, -13, 1.0, 0.93, 6, 0.66], [0.78, -1, -27, 1.28, 1.05, -4, 0.3], [1, -5, -37, 1.5, 1.1, -7, 0]],
        c: [[0, 0, 6, 0.5, 0.5, 0, 0], [0.2, 1, 0, 0.7, 0.72, 3, 0.8], [0.5, 4, -12, 0.9, 0.9, 6, 0.6], [0.8, 0, -24, 1.15, 1.0, -3, 0.25], [1, -3, -32, 1.35, 1.05, -6, 0]]
    }),
    /** The haze over the coffee: an ellipse, mm, breathing on its own period. */
    haze: Object.freeze({ w: 82, h: 30, lift: 4, duration: 7.3, phase: 0.3 })
});

/** Plan footprints (world) for clearance checks: circles, and the mug's handle as a capsule end. */
export function footprints() {
    const handleDir = v3(Math.cos(MUG.handle.heading), 0, -Math.sin(MUG.handle.heading));
    const mugCentre = v3(...MUG.position);
    const handleTip = mugCentre.clone().addScaledVector(handleDir, MUG.radius + MUG.handle.radius + MUG.handle.tube);
    return {
        mug: { centre: [MUG.position[0], MUG.position[2]], radius: MUG.radius, handleTip: [handleTip.x, handleTip.z] },
        lampBase: { centre: [LAMP_ORIGIN[0], LAMP_ORIGIN[2]], radius: LAMP.base.radiusBottom },
        keyboard: {
            x: [-KEYBOARD.width / 2, KEYBOARD.width / 2],
            z: [KEYBOARD.position[2] - KEYBOARD.depth / 2, KEYBOARD.position[2] + KEYBOARD.depth / 2]
        },
        wristRest: {
            x: [-WRIST_REST.footprint.width / 2, WRIST_REST.footprint.width / 2],
            z: [WRIST_REST.worldZ - WRIST_REST.footprint.depth / 2, WRIST_REST.worldZ + WRIST_REST.footprint.depth / 2]
        }
    };
}

// ---------------------------------------------------------------------------
// The two loud accents, turned down (not removed — they're Shae's choices)
// ---------------------------------------------------------------------------

/**
 * emissiveIntensity per time of day. borg_cube.glb ships emissiveStrength 10
 * (KHR_materials_emissive_strength) over a green circuit map — the loudest
 * thing on the desk after the monitor; tron_disc.glb ships 1.0 on its ring.
 * A faint glow by day, a little more after dark, where a faint glow is what
 * a small light looks like.
 */
export const ACCENTS = Object.freeze({
    'bookend-cube': Object.freeze({ morning: 0.35, day: 0.35, evening: 0.55, night: 0.8 }),
    'bookend-disc': Object.freeze({ morning: 0.28, day: 0.28, evening: 0.38, night: 0.5 })
});
