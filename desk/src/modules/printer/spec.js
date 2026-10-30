/**
 * PRINTER — the numbers. DOM-free, so node can import it (with strip.js and
 * shot.js) to check shots and clearances against core/framing.js.
 *
 * World units, 3.2 per metre (1 mm = 0.0032). The printer's LOCAL frame has
 * its origin on the desk under the centre of the body, front = +Z (toward the
 * visitor), top = +Y. The group is yawed by YAW about +Y.
 */

export const OBJECT_ID = 'receipt-printer';

/**
 * z is 0.10 behind the brief's 0.8: a draped receipt reaches 0.70 local in
 * front of the body's centre, and at 0.8 its tip would hang 3 cm over the
 * desk's front edge (z 1.44). At 0.70 the tip stops at z ≈ 1.40, and the
 * body's back corner at z 0.454 stays clear of the bench's region (z ≤ 0.35).
 */
export const POSITION = Object.freeze([-1.2, 0, 0.70]);
export const YAW = 0.35;

/** A compact 80 mm thermal printer: 106 × 94 × 125 mm. */
export const BODY = Object.freeze({
    width: 0.34,
    height: 0.30,
    depth: 0.40,
    radius: 0.026,      // 8 mm corner rounding
    plinth: 0.012       // the dark rubber base band (4 mm), inset 3 mm
});

/** The paper exit: a dark slot across the top, a serrated tear bar in front of it. */
export const SLOT = Object.freeze({
    z: 0.12,            // centre of the slot, local z (the front edge is at depth/2 = 0.20)
    width: 0.272,       // 85 mm
    gap: 0.011,         // 3.4 mm
    tearBarDepth: 0.0085,
    tearBarHeight: 0.0034,
    teeth: 34
});

/**
 * 80 mm thermal paper is 0.256 wide; the brief asks for ≈ 0.24 (75 mm), which
 * is the printed width of 80 mm stock — close enough that nobody measures.
 * Length is fixed; the layout flexes its gaps to fill it (receipt.js).
 */
export const PAPER = Object.freeze({
    width: 0.24,
    length: 0.86,           // 269 mm
    halfThickness: 0.00012, // front and back skins, each this far off the centre surface
    restLength: 0.045,      // the torn tab left standing in the slot (14 mm)
    tooth: 0.0042,          // serration depth on a torn end (1.3 mm)
    teeth: 24,              // across the width (3.1 mm pitch)
    cup: 0.0016,            // edges lift 0.5 mm toward the printed side
    restY: 0.0009,          // the paper's centre surface above the desk where it lies flat
    rows: 180               // along the length (≈ 1.5 mm apart when fully out)
});

/**
 * The drape, as a centreline in the printer's (z, y) plane. Out of the slot
 * heading straight up, over the tear bar in a tight arc (r1), a steep straight
 * run down in front of the body (heading dropDeg below horizontal), onto the
 * desk through a looser arc (r2), flat for whatever length is left with a
 * faint hump, and the last few centimetres curl up (r3, curlDeg) — thermal
 * paper remembers the roll.
 *
 * The printed face is on the OUTSIDE of the first arc, so it faces the room on
 * the drop and the ceiling on the desk, and the type reads upright to someone
 * in front: the header sits nearest the slot. (A real printer does this in
 * "upside-down" mode — ESC { in ESC/POS — which prints the last line first.)
 */
export const PATH = Object.freeze({
    inside: 0.03,       // paper drawn continuing down into the slot, so it never shows a raw edge
    r1: 0.055,
    dropDeg: 75,
    r2: 0.13,           // ≈ 4 cm: what 80 mm thermal paper bends to under its own weight
    r3: 0.055,
    curlDeg: 72,
    hump: 0.0035,       // 1.1 mm rise mid-way along the flat part
    extra: 0.05         // centreline continued past the tip (serrations, safety)
});

/** Extrusion: ~1.6 s at ≈ 170 mm/s, a thermal printer's real speed. */
export const PRINT = Object.freeze({
    durationMs: 1600,
    startDelayMs: 380,  // into the camera move, so the paper starts as the shot settles
    lineHz: 11          // the stepper's line-feed pulse, felt as a faint shimmer in the speed
});

/** Where a torn-off receipt is laid (world): left of the printer, clear of the bench (z > 0.35). */
export const TORN = Object.freeze({
    centre: Object.freeze([-1.84, 0, 0.92]),
    heading: 0.62       // radians about +Y: the direction the tip points, from +Z toward +X
});

/** The #printer shot, as orbit parameters about the printer + receipt. */
export const SHOT = Object.freeze({
    // v3: 32° → 44° and fill 0.76 → 0.84. At 32° the lamp's base sat on the
    // printer's top edge; from 44° it is above the frame (NDC y ≥ 1.01 at 16:10)
    // and the printer + receipt take 83% of the height (was 75%). The mug stands
    // 18 cm to the printer's right, so no orbit loses it without bringing in the
    // floor past the desk's front edge (azimuth +0.35: 7% floor), and it is
    // placed for #desk — it stays, at the top right (33% of the frame height,
    // 5% of its pixels), its steam rising out of the top of the frame.
    // 390×844: printer 76% of the height (was 65%), the mug out of frame.
    elevationDeg: 44,       // the drop (where the numbers are) still faces the lens; the lamp's base leaves the top
    azimuthOffset: -0.18,   // a touch from the window side, so the body shows its lit flank and the roll window
    fill: 0.84,
    maxWidthFill: 0.88,
    // The frame's safe area: the site header covers the top 72 px, the action
    // button + hint the bottom ~90 px (at 900 px tall).
    safeTop: 0.80,
    safeBottom: -0.76
});

export const LABEL = 'before you go';
