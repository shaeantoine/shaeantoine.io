/**
 * MONITOR — every number the module places things with, and nothing that
 * touches the DOM or three, so node can import it to check the shots
 * (the computed framing is at the bottom of this file).
 *
 * Three coordinate spaces, and which one each constant is in:
 *
 *   WORLD      the room. 3.2 units per metre.
 *   PLANE      the screen plane's own frame, centred on the anchor: x right,
 *              y up, z out of the glass toward the viewer. Everything on the
 *              monitor (dot, counter, sticky) is a child of the screen mesh,
 *              so it is placed here and rides the display's hover lift.
 *   SCREEN px  the screen canvas's logical pixels: 1787 x 1000, origin top
 *              left, y down. The game lives here. 1 px = 0.00107 units.
 */

export const DISPLAY_ID = 'studio-display';

/**
 * Fallbacks only: index.js reads the live entry out of src/content/deskObjects.js
 * (position, focus.camera, focus.anchor) so the monitor can never drift from
 * the site's measured anchor. These are the values it held when this was written.
 */
export const GROUP_POSITION = Object.freeze([0, 0, -0.25]);
export const ANCHOR = Object.freeze({
    position: Object.freeze([0, 0.961, 0.138]),
    rotation: Object.freeze([-0.1395, 0, 0]),
    size: Object.freeze([1.912, 1.070]),
    framing: Object.freeze([1.165, 0.652])
});
export const FOCUS_CAMERA = Object.freeze({
    offset: Object.freeze([0, 1.24, 2.10]),
    lookAtOffset: Object.freeze([0, 0.961, 0.138])
});

/**
 * DeskScene's default hover lift (the display entry names none). The module
 * holds the display up while it is focused (liftWhileActive: src/main.js
 * calls DeskScene.holdLift), as the original site held a focused object, and
 * aims the camera at the RAISED position — which is what the original site's
 * focusOn(getObjectWorldPosition) ended up doing.
 */
export const HOVER_LIFT = 0.06;

/** The focus shot for a display whose group sits at `groupPosition`, raised by `lift`. */
export function focusShot(groupPosition = GROUP_POSITION, camera = FOCUS_CAMERA, lift = HOVER_LIFT) {
    const base = [groupPosition[0], groupPosition[1] + lift, groupPosition[2]];
    return {
        position: base.map((v, i) => v + camera.offset[i]),
        lookAt: base.map((v, i) => v + camera.lookAtOffset[i])
    };
}

// ---------------------------------------------------------------------------
// The display model, measured (models-src/apple_studio_display.glb, placed at
// targetSize 2.0 the way attachModel does). Offsets are along the ANCHOR
// plane's axes from the anchor centre.
// ---------------------------------------------------------------------------

/** The emissive quad's half-extents: 1.9116 x 1.0700. */
export const SCREEN_HALF = Object.freeze([0.9558, 0.5350]);
/** The head's outer silhouette: the bezel runs 0.044 wide on the sides and top, 0.030 at the chin. */
export const HEAD_EXTENT = Object.freeze({ right: 1.0000, top: 0.5805, bottom: -0.5640 });
/**
 * The cover glass sits 0.0031 in front of the emissive quad; the site's anchor
 * sits 0.0105 in front of it. So in PLANE space the glass is at z = -0.0074 —
 * the screen canvas floats 2.3 mm (real) proud of the glass, as on the original site.
 */
export const GLASS_Z = -0.0074;

// ---------------------------------------------------------------------------
// Screen canvas (SCREEN px)
// ---------------------------------------------------------------------------

/** src/scene/screenCanvas.js: SCREEN_CANVAS_HEIGHT and canvasWidthForAspect(1.912 / 1.070). */
export const SCREEN_W = 1787;
export const SCREEN_H = 1000;
/** World units per screen px (identical on both axes to 0.1%). */
export const PX = ANCHOR.size[1] / SCREEN_H;

export const TITLE_BAR_H = 58; // the desktop's menu bar (the original site's idle-screen MENUBAR_HEIGHT — the same machine)
/**
 * v5: Catch The Dot is a window like the others (desktop.js WINDOWS.dot): its
 * caption, its counter and the dot's field (desktop.js gameField) live in it,
 * so the screen-wide status row and playfield that were here are gone.
 */

export const DOT_RADIUS = 38; // the lit body: 7.6% of the screen's height across, ~45 CSS px focused, ~16 px from the door
/** A click this close to the centre counts. Generous: it is a calm game. */
export const HIT_RADIUS = DOT_RADIUS * 1.4;

/**
 * The dot is a point of light on a dark screen, not a red disc: one additive
 * quad whose texture is the light's whole radial profile (dot.js). The quad
 * reaches GLOW_EXTENT radii from the centre; past ~2 radii the halo is within a
 * few levels of the screen, so the eye sees a lit body with a soft bloom.
 */
export const GLOW_EXTENT = 3;
/**
 * The faint trail it leaves while it drifts: COUNT soft red embers laid along
 * the path it actually took, SPACING screen px apart (so 4.1 radii long), each
 * dimmer and narrower than the one before. Sampled by distance, never by time,
 * so it is the same shape at 26 px/s and at 120 px/s. It fades with the dot's
 * speed, so a dot gliding to a stop takes its trail with it and a stopped dot
 * (nothing is moving, nothing is drawn) has none — except under ?still=1,
 * where the still frame is "mid-drift" and the trail is there, pre-rolled.
 */
export const TRAIL = Object.freeze({
    count: 12,
    spacing: 13, // screen px between embers
    sample: 4, // record the path every 4 px
    amplitude: 0.075, // linear light added at the first ember's centre (x its red tint)
    width: 0.55, // the first ember's gaussian width, in dot radii
    narrowing: 0.45, // the last ember is 55% as wide
    falloff: 1.6, // brightness ~ (1 - t)^falloff along the trail
    extent: 3 // each ember's quad reaches 3 widths
});
/** A slow breath in the dot's brightness, only ever applied on frames the drift already draws (never in still / reduced motion). */
export const BREATH = Object.freeze({ amplitude: 0.07, periodMs: 3200 });

/** Screen px -> PLANE x/y. */
export function toPlane(x, y) {
    return [(x / SCREEN_W - 0.5) * ANCHOR.size[0], (0.5 - y / SCREEN_H) * ANCHOR.size[1]];
}

/** PLANE x/y -> screen px. */
export function toScreen(px, py) {
    return [(px / ANCHOR.size[0] + 0.5) * SCREEN_W, (0.5 - py / ANCHOR.size[1]) * SCREEN_H];
}

// ---------------------------------------------------------------------------
// The sticky note (PLANE space)
// ---------------------------------------------------------------------------

const MM = 0.0032;

/**
 * A 76 mm (3 in) note stuck across the screen's top-right corner: its top edge
 * 0.022–0.027 units (7–8 mm) up onto the 14 mm top bezel, its right edge just
 * onto the side bezel, turned 2.5° anticlockwise, the free end curling off the
 * glass. It sits 1.6 thousandths of a unit in front of the screen plane
 * (0.5 mm), i.e. 0.009 in front of the glass where it overhangs the bezel —
 * invisible at the 9° the establishing camera meets the screen at.
 *
 * STICKY_MM is the one number to change (e.g. 102, a 4 in note): the note,
 * its canvas, its ink and the dot's no-go zone all follow, and the corner
 * stays pinned to the bezel.
 */
export const STICKY_MM = 76;

/** Where the note's top-right corner sits (before its roll), PLANE x/y: 0.012 onto the side bezel, 0.022 onto the top one. */
const STICKY_TOP_RIGHT = [0.968, 0.557];

export const STICKY = Object.freeze({
    size: STICKY_MM * MM, // 0.2432 at 76 mm
    centre: Object.freeze([STICKY_TOP_RIGHT[0] - (STICKY_MM * MM) / 2, STICKY_TOP_RIGHT[1] - (STICKY_MM * MM) / 2]),
    z: 0.0016,
    roll: (2.5 * Math.PI) / 180,
    band: 16 * MM, // the adhesive strip along the top: flat on the glass
    curl: 0.012, // the free edge lifts 3.75 mm
    cornerCurl: 0.006, // and the bottom-right corner a further 1.9 mm
    segments: 16
});

/** The sticky's four corners in PLANE x/y (top-left, top-right, bottom-right, bottom-left). */
export function stickyCorners(sticky = STICKY) {
    const h = sticky.size / 2;
    const c = Math.cos(sticky.roll);
    const s = Math.sin(sticky.roll);
    return [[-h, h], [h, h], [h, -h], [-h, -h]].map(([x, y]) => [
        sticky.centre[0] + x * c - y * s,
        sticky.centre[1] + x * s + y * c
    ]);
}

/** The sticky's footprint on the screen, as an axis-aligned rect in screen px. */
export function stickyScreenRect(sticky = STICKY) {
    const points = stickyCorners(sticky).map(([x, y]) => toScreen(x, y));
    return {
        x0: Math.min(...points.map((p) => p[0])),
        x1: Math.max(...points.map((p) => p[0])),
        y0: Math.min(...points.map((p) => p[1])),
        y1: Math.max(...points.map((p) => p[1]))
    };
}

/** Where the dot sits in ?still=1 (and where it starts on a live load): left of centre, a little low, inside the Catch The Dot window's field. */
export const STILL_DOT = Object.freeze({ x: 0.36 * SCREEN_W, y: 0.56 * SCREEN_H, heading: -0.52 });
export const STILL_CAUGHT = 3;

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

/** Screen px per second. At rest the drift is barely there (~6 CSS px/s from the door). */
export const REST_SPEED = 26;
export const PLAY_SPEED = 120;
/** How long after the last pointer movement a focused game keeps its frame loop open. */
export const PLAY_IDLE_MS = 6000;
/** At rest the dot keeps drifting this long after load / leaving / the pointer going away. */
export const AWAKE_MS = 20000;
/** ≤ 12 fps at rest. */
export const REST_FRAME_MS = 84;

// ---------------------------------------------------------------------------
// Leaning in to read the note (#monitor/now)
// ---------------------------------------------------------------------------

/** How much of the frame height the note fills when you lean in to read it. */
export const NOTE_SHOT_FILL = 0.5;
/** On portrait screens the note is held back until it fills at most this much of the width. */
export const NOTE_SHOT_MAX_WIDTH = 0.84;
/** The lean-in comes from a little left of and below square, so the curl reads as a curl (radians). */
export const NOTE_SHOT_YAW = (12 * Math.PI) / 180;
export const NOTE_SHOT_DROP = (5 * Math.PI) / 180;

/** PLANE (x, y, z) -> WORLD, for a display group at `groupPosition` raised by `lift`. No three needed. */
export function planeToWorld([x, y, z], groupPosition = GROUP_POSITION, lift = HOVER_LIFT, anchor = ANCHOR) {
    const a = anchor.rotation?.[0] ?? 0; // the anchor is tilted about X only
    return [
        groupPosition[0] + anchor.position[0] + x,
        groupPosition[1] + lift + anchor.position[1] + y * Math.cos(a) - z * Math.sin(a),
        groupPosition[2] + anchor.position[2] + y * Math.sin(a) + z * Math.cos(a)
    ];
}

/**
 * The lean-in shot: the camera NOTE_SHOT_FILL of a frame-height away from the
 * note's centre (vertical fov 45°), along the screen's normal swung
 * NOTE_SHOT_YAW to the left and NOTE_SHOT_DROP down, aimed at the note.
 */
export function noteShot(groupPosition = GROUP_POSITION, lift = HOVER_LIFT, anchor = ANCHOR, fov = 45, aspect = Infinity) {
    const a = anchor.rotation?.[0] ?? 0;
    const centre = planeToWorld([STICKY.centre[0], STICKY.centre[1], STICKY.z + STICKY.curl * 0.3], groupPosition, lift, anchor);
    const normal = [0, -Math.sin(a), Math.cos(a)];
    const up = [0, Math.cos(a), Math.sin(a)];
    const right = [1, 0, 0];
    const dir = [0, 1, 2].map((i) => normal[i] * Math.cos(NOTE_SHOT_YAW) * Math.cos(NOTE_SHOT_DROP)
        - right[i] * Math.sin(NOTE_SHOT_YAW) - up[i] * Math.sin(NOTE_SHOT_DROP));
    const length = Math.hypot(...dir);
    const t = 2 * Math.tan(((fov / 2) * Math.PI) / 180);
    // Height-filled; on narrow (portrait) screens backed off so the note fits the width too.
    const distance = Math.max(STICKY.size / (NOTE_SHOT_FILL * t), STICKY.size / (NOTE_SHOT_MAX_WIDTH * t * aspect));
    return {
        position: centre.map((v, i) => v + (dir[i] / length) * distance),
        lookAt: centre,
        distance
    };
}

// ---------------------------------------------------------------------------
// FRAMING, COMPUTED (node + three, fov 45, frameReport; /tmp script, as
// before). Re-run if any number above changes. % of frame height; CSS px at
// 1440 x 900 (16:10) / 1600 x 900 (16:9) / 1440 x 960 (3:2).
// None of the camera poses changed in the dark-screen pass; the dot's numbers
// are new. "Glow" is the halo out to 2 radii, where it is still ~10 levels
// over the field (dot.js); the quad reaches 3 radii but is invisible past 2.5.
//
//   #desk (establishing, (0, 2.5, 5) -> (0, 1, 0)):
//     screen 23.9% (395 x 215 / 395 x 215 / 422 x 229 px) · sticky 52 x 53 /
//     51 x 53 / 55 x 57 px · dot body Ø 17 / 16 / 17 px, glow Ø 33 / 34 / 36 px
//     · trail ≈ 34 / 34 / 36 px · all in frame. Text unreadable here by design.
//   #monitor ((0, 1.30, 1.85) -> (0, 1.021, -0.112), display raised 0.06):
//     screen 65.2% (1048 x 587 / 1048 x 587 / 1119 x 626 px) · sticky 15.8%
//     (144 x 142 / 144 x 142 / 154 x 152 px) · dot body Ø 45 / 45 / 48 px,
//     glow Ø 89 / 90 / 95 px · trail ≈ 91 / 91 / 98 px · caption + counter
//     16.4 / 16.4 / 17.5 px Inter · "now:" ≈ 21 px, the line ≈ 18 px (measured in Caveat, before Shae Hand).
//   #monitor/now (noteShot: 0.587 from the note, 12° left, 5° down):
//     sticky 53.9% (482 x 485 / 483 x 485 / 516 x 517 px) · the line ≈ 61 /
//     61 / 65 px (in Caveat). The dot is off frame (the game waits).
//   Portrait 390 x 844, CameraRig's establishing shot: screen 371 x 202 px,
//   dot body Ø 16 px / glow Ø 31 px. If core/camera.js adopts
//   framing.establishingShot(aspect) (pulled back to hold the whole desk):
//   screen 111 x 62 px, dot body Ø 4.7 px / glow Ø 9.4 px — still a point of
//   light. #monitor is 252% of the frame's width (the original site's own focus
//   shot, unchanged) and #monitor/now clips the note's sides (116%).
// ---------------------------------------------------------------------------
