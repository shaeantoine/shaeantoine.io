/**
 * MONITOR v4 — the desktop: every number for the dock, the app windows, the
 * notes stuck on them and the shots that lean in to them. DOM-free and
 * three-free, so node can import it to check framing (see the numbers at the
 * bottom of this file).
 *
 * Spaces are layout.js's: SCREEN px (1787 x 1000, y down) for everything drawn
 * on the glass, PLANE for meshes, WORLD for cameras. Notes are sized in mm
 * (1 mm = 0.0032 units = 2.99 screen px).
 */

import {
    SCREEN_W, SCREEN_H, PX, ANCHOR, GROUP_POSITION, HOVER_LIFT, toPlane, planeToWorld, stickyScreenRect, TITLE_BAR_H
} from './layout.js';

export const MM = 0.0032;
/** Screen px per mm on the glass. */
export const PX_PER_MM = MM / PX;

// ---------------------------------------------------------------------------
// The apps, left to right in time order
// ---------------------------------------------------------------------------

/**
 * v6: the home app first (v8: the map, "start here"), set apart from the timeline by a thin separator; then
 * the timeline, in time order. ← → steps through the dock in this order.
 */
export const APP_ORDER = Object.freeze(['readme', 'walk', 'dot', 'mlx', 'apple', 'trash']);
/** The timeline apps (everything after the separator). */
export const TIMELINE = Object.freeze(APP_ORDER.slice(1));

// ---------------------------------------------------------------------------
// The dock (SCREEN px): a slim pill along the bottom, under the status row
// ---------------------------------------------------------------------------

const DOCK_CELL = 104;
const DOCK_PAD = 14;
/** The gap after the home app's cell, a thin line down its middle (v6). */
const DOCK_SEP = 26;
const DOCK_WIDTH = APP_ORDER.length * DOCK_CELL + DOCK_SEP + DOCK_PAD * 2;
export const DOCK = Object.freeze({
    cell: DOCK_CELL,
    pad: DOCK_PAD,
    sep: DOCK_SEP,
    icon: 50,
    iconTop: 8,
    labelTop: 61,
    labelSize: 14,
    runY: 81,
    width: DOCK_WIDTH,
    height: 86,
    x: Math.round((SCREEN_W - DOCK_WIDTH) / 2),
    y: 906
});

/** The left edge of app `i`'s cell, dock-local px (the cells after the first sit past the separator). */
export function dockCellX(i) {
    return DOCK.pad + DOCK.cell * i + (i >= 1 ? DOCK.sep : 0);
}

/** The separator's x, dock-local px. */
export const DOCK_SEP_X = DOCK_PAD + DOCK_CELL + DOCK_SEP / 2;

/** The app under dock-local px (x, y), or null (the separator's gap is nobody's). */
export function dockAppAt(x, y) {
    if (y < 0 || y > DOCK.height) return null;
    for (let i = 0; i < APP_ORDER.length; i += 1) {
        const x0 = dockCellX(i);
        if (x >= x0 && x < x0 + DOCK.cell) return APP_ORDER[i];
    }
    return null;
}

/** Centre of an app's icon in SCREEN px. */
export function dockIconCentre(app) {
    const i = Math.max(0, APP_ORDER.indexOf(app));
    return [DOCK.x + dockCellX(i) + DOCK.cell / 2, DOCK.y + DOCK.iconTop + DOCK.icon / 2];
}

// ---------------------------------------------------------------------------
// The clock, in the top bar left of the sticky (SCREEN px)
// ---------------------------------------------------------------------------

const STICKY_RECT = stickyScreenRect();
export const CLOCK = Object.freeze({ width: 240, height: TITLE_BAR_H, x: Math.floor(STICKY_RECT.x0 - 36 - 240), y: 0 });

// ---------------------------------------------------------------------------
// The windows (SCREEN px; the rect is the window itself, the canvas adds SHADOW all round)
// ---------------------------------------------------------------------------

export const SHADOW = 30;
export const WINDOW_TITLE_H = 44;

/**
 * Each window's rect, and its live rect (window-local px): the part that
 * animates, painted on its own small canvas so a run never re-uploads the
 * window, let alone the screen.
 */
/**
 * The home app ("Hello", v9: welcome.js; id 'readme'), in two layouts.
 * Landscape: the hero window, Catch The Dot's own rect, seen from the
 * desktop's shot (and from the door). Portrait (phones): a 520 x 834 window,
 * centred, framed on its own (appTargetRect), so it comes out at ≈ 0.7 CSS px
 * per screen px. Its body (under the title bar) is one part of the page high;
 * welcome.js PAGE has every number inside it.
 */
const DOT_DENSITY = (0.652 / 1000) * 1.25;
export const MAP_WINDOWS = Object.freeze({
    landscape: Object.freeze({ x: 264, y: 92, w: 1260, h: 770, density: DOT_DENSITY }),
    // Window-fitted at 390 px: ≈ 0.69 CSS px per screen px (frame heights: 0.69 / 844), with a little oversample.
    portrait: Object.freeze({ x: 634, y: 62, w: 520, h: 834, density: (0.70 / 844) * 1.15 })
});

/** Which map layout an aspect gets: portrait screens get the phone one. */
export function mapVariantFor(aspect) {
    return aspect < 1 ? 'portrait' : 'landscape';
}

export const WINDOWS = Object.freeze({
    readme: MAP_WINDOWS.landscape,
    // Catch The Dot: the hero window, centred, with the menu bar, the dock and
    // the "now" sticky clear around it (its right edge + shadow stops 12 px
    // short of the sticky; its shadow ends above the dock). Its live canvas is
    // the counter, bottom right on the status row. `density` is the focus
    // shot's (screen px → frame heights), x1.25: this window is seen from the
    // desktop's own shot, not leant in to.
    dot: Object.freeze({ x: 264, y: 92, w: 1260, h: 770, live: Object.freeze({ x: 1260 - 36 - 240, y: 700, w: 240, h: 48 }), density: DOT_DENSITY }),
    walk: Object.freeze({ x: 330, y: 132, w: 900, h: 650, live: Object.freeze({ x: 24, y: 104, w: 852, h: 380 }) }),
    mlx: Object.freeze({ x: 290, y: 100, w: 1000, h: 700, live: Object.freeze({ x: 24, y: 176, w: 952, h: 318 }) }),
    apple: Object.freeze({ x: 564, y: 214, w: 660, h: 456, live: null }),
    trash: Object.freeze({ x: 330, y: 176, w: 930, h: 444, live: Object.freeze({ x: 24, y: 196, w: 882, h: 226 }) })
});

/** An app's window rect: the map's depends on the layout (`variant`), every other app has one. */
export function windowRect(app, variant = 'landscape') {
    if (app === 'readme') return MAP_WINDOWS[variant] ?? MAP_WINDOWS.landscape;
    return WINDOWS[app];
}

/**
 * Inside the Catch The Dot window (window-local px): the field under the title
 * bar, and the status row near its foot — the one line bottom-left, the
 * counter bottom-right (the live canvas above), both on one baseline.
 */
export const GAME = Object.freeze({
    status: Object.freeze({ top: 700, height: 48, size: 28, lineHeight: 1.3, left: 36 }),
    /**
     * How far the dot's CENTRE keeps from the field's edges, in dot radii: its
     * visible halo reaches ~2 radii (dot.js), so at 2.1 the light, the trail
     * and a catch's ring stay inside the window.
     */
    edge: 2.1
});

/**
 * Where the dot's CENTRE may go, in SCREEN px: the Catch The Dot window's
 * field, clear of its title bar and its status row. Nothing else is on it,
 * so no exclusions (the sticky is outside the window).
 */
export function gameField(radius) {
    const win = WINDOWS.dot;
    const pad = radius * GAME.edge;
    return {
        minX: win.x + pad,
        maxX: win.x + win.w - pad,
        minY: win.y + WINDOW_TITLE_H + pad,
        maxY: win.y + GAME.status.top - 14 - radius,
        exclusions: []
    };
}

/** The Catch The Dot window's field (below its title bar), SCREEN px: where clicks play. */
export function gameRect() {
    const win = WINDOWS.dot;
    return { x0: win.x, x1: win.x + win.w, y0: win.y + WINDOW_TITLE_H, y1: win.y + win.h };
}

/** Buttons and click targets, window-local px. */
export const TARGETS = Object.freeze({
    close: Object.freeze({ x: 10, y: 6, w: 34, h: 32 }), // the first of the three dots
    walkRun: Object.freeze({ x: 900 - 24 - 108, y: 54, w: 108, h: 38 }),
    mlxRun: Object.freeze({ x: 1000 - 24 - 108, y: 124, w: 108, h: 38 }),
    mlxWhy: Object.freeze({ x: 24, y: 510, w: 96, h: 38 }),
    trashRow: Object.freeze({ x: 16, y: 66, w: 930 - 32, h: 96 }),
    appleLock: Object.freeze({ x: 330 - 48, y: 64, w: 96, h: 100 })
});

/** The MLX "why" paragraph's box (window-local), clear of the note on the window's right edge. */
export const MLX_WHY_BOX = Object.freeze({ x: 24, y: 556, w: 840, h: 124 });

// ---------------------------------------------------------------------------
// Notes (paper, in Shae's hand) — sizes in mm, placed in SCREEN px
// ---------------------------------------------------------------------------

/**
 * The yellow notes stuck on the glass, each the room's one sticky stock:
 *
 *   dot    3 x 2 in, stuck to the bottom of the screen at the lower left and
 *          hanging below the chin — Catch The Dot's thread. Always there.
 *   mlx    3 x 3 in on the MLX window's right edge — its thread.
 *   trash  3 x 3 in beside the Trash window, appearing once the run stalls.
 *
 * `at` is the note's top-left corner (SCREEN px, before its roll); `roll` in
 * radians (anticlockwise). `window` notes ride their window (open, close).
 * `ink` is the writing area (mm on the note).
 */
export const NOTES = Object.freeze({
    dot: Object.freeze({
        id: 'monitor.thread.dot', w: 76, h: 51, at: Object.freeze([70, 970]), roll: (-1.6 * Math.PI) / 180, window: null,
        ink: Object.freeze({ x: 4.5, y: 9, w: 67, h: 38 }), band: 12
    }),
    mlx: Object.freeze({
        id: 'monitor.thread.mlx', w: 76, h: 76, at: Object.freeze([1226, 612]), roll: (2.2 * Math.PI) / 180, window: 'mlx',
        ink: Object.freeze({ x: 5, y: 6, w: 66, h: 65 }), band: 16
    }),
    trash: Object.freeze({
        id: 'monitor.trash.note', w: 76, h: 76, at: Object.freeze([1232, 300]), roll: (-2.4 * Math.PI) / 180, window: 'trash',
        ink: Object.freeze({ x: 5, y: 6, w: 66, h: 65 }), band: 16
    })
});

/** A note's size in SCREEN px. */
export function notePx(note) {
    return [note.w * PX_PER_MM, note.h * PX_PER_MM];
}

/** A note's four corners in SCREEN px (rolled about its centre). */
export function noteCorners(note) {
    const [w, h] = notePx(note);
    const cx = note.at[0] + w / 2;
    const cy = note.at[1] + h / 2;
    const c = Math.cos(note.roll);
    const s = Math.sin(note.roll);
    // Screen y points down, so an anticlockwise roll (as seen) is -roll in these axes.
    return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [
        cx + x * c + y * s,
        cy - x * s + y * c
    ]);
}

// ---------------------------------------------------------------------------
// Shots (WORLD): leaning in to an app, or to Catch The Dot's note
// ---------------------------------------------------------------------------

function unionRect(rects) {
    return {
        x0: Math.min(...rects.map((r) => r.x0)),
        x1: Math.max(...rects.map((r) => r.x1)),
        y0: Math.min(...rects.map((r) => r.y0)),
        y1: Math.max(...rects.map((r) => r.y1))
    };
}

function rectOfPoints(points) {
    return unionRect(points.map(([x, y]) => ({ x0: x, x1: x, y0: y, y1: y })));
}

/**
 * What each shot frames, SCREEN px: an app's window, its note, and the dock
 * (so the other apps stay one click away). 'dot' is the Catch The Dot window;
 * 'screen' the whole screen (the bare desktop on a phone); 'note' the note
 * hanging under the chin.
 */
export function appTargetRect(app, { variant = 'landscape' } = {}) {
    const dock = { x0: DOCK.x, x1: DOCK.x + DOCK.width, y0: DOCK.y, y1: DOCK.y + DOCK.height };
    if (app === 'screen') return { x0: 0, x1: SCREEN_W, y0: 0, y1: SCREEN_H };
    if (app === 'note') {
        // The note hanging under the chin, leant in to (#monitor/note), with the
        // lower left of the screen, the caption and the dock's left half above it.
        return unionRect([{ x0: 20, x1: DOCK.x + DOCK.width, y0: 400, y1: 1000 }, rectOfPoints(noteCorners(NOTES.dot))]);
    }
    const win = windowRect(app, variant);
    // The map's phone layout is framed on the window alone (the dock, wider than it, is cropped at the sides).
    if (app === 'readme' && variant === 'portrait') return { x0: win.x, x1: win.x + win.w, y0: win.y, y1: win.y + win.h };
    const rects = [{ x0: win.x, x1: win.x + win.w, y0: win.y, y1: win.y + win.h }, dock];
    for (const note of Object.values(NOTES)) if (note.window === app) rects.push(rectOfPoints(noteCorners(note)));
    return unionRect(rects);
}

export const SHOT_FILL = Object.freeze({ height: 0.86, width: 0.92 });

/**
 * Straight on to the screen (along its normal, which is also the site's focus
 * shot's line of sight), at the distance where the target fills SHOT_FILL of
 * the frame's height, or of its width if that's tighter.
 */
export function appShot(app, { aspect = 1.6, fov = 45, groupPosition = GROUP_POSITION, lift = HOVER_LIFT, anchor = ANCHOR } = {}) {
    const r = appTargetRect(app, { variant: mapVariantFor(aspect) });
    const [cxp, cyp] = toPlane((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
    const centre = planeToWorld([cxp, cyp, 0], groupPosition, lift, anchor);
    const w = (r.x1 - r.x0) * PX;
    const h = (r.y1 - r.y0) * PX;
    const t = 2 * Math.tan(((fov / 2) * Math.PI) / 180);
    const distance = Math.max(h / (t * SHOT_FILL.height), w / (t * aspect * SHOT_FILL.width));
    const a = anchor.rotation?.[0] ?? 0;
    const normal = [0, -Math.sin(a), Math.cos(a)];
    return {
        position: centre.map((v, i) => v + normal[i] * distance),
        lookAt: centre,
        distance,
        target: r
    };
}

// ---------------------------------------------------------------------------
// FRAMING, COMPUTED (node + three, the real module against a stand-in
// DeskScene; a /tmp script). % of frame height · width of the
// window's canvas (window + 30 px shadow), and CSS px per screen px.
//
//                    16:10 (1440x900)            3:2 (1440x960)             390x844
//   #monitor/walk    73.7% h 65.4% w · 0.93      73.7 · 69.8% · 1.00        33.8 · 102% (shadow) · 0.40
//   #monitor/mlx     76.1% h 69.8% w · 0.90      76.1 · 74.5% · 0.96        27.7 · 86% · 0.31
//     its note       23.1% h (all in frame)      23.1%                      8.7%
//   #monitor/apple   59.2% h 53.3% w · 1.03      59.2 · 56.9% · 1.10        33.7 · 104% (shadow) · 0.55
//   #monitor/trash   55.1% h 69.6% w · 0.98      55.1 · 74.2% · 1.05        18.9 · 82% · 0.32
//     its note       25.6% h                     25.6%                      8.9%
//   #monitor         dock 5.6% h / 22.5% w (labels ≈ 8 CSS px: a quiet detail),
//                    hanging note 10.8% h (in frame; on a phone the site's own
//                    focus shot clips it, as it clips the screen)
//   The dock is in frame in every app shot at every aspect. Phones get the
//   same windows, width-fitted: 0.3–0.55 CSS px per screen px is too small to
//   read — a phone layout for the windows is future work.
//   The hanging note, display at rest: x -0.883…-0.636, y 0.298…0.468,
//   z -0.041…-0.006 (world): 0.061 clear of the glass, 0.165 of the lamp.
//
// v5, Catch The Dot's window (the window's own rect, no shadow; measured
// through the real main.js, /tmp/tweak-monitor/integ/t-frame-game.mjs):
//
//                    16:10 (1440x900)   3:2 (1350x900)   390x844
//   #monitor, /dot   50.0% h 51.2% w    50.0% h 54.6% w  25.9% h 91.9% w (window + dock width-fitted)
//     CSS px / px    0.585              0.585            0.284
//     dot body Ø     44.4 CSS px        44.4             21.6   (glow Ø 88.9 · 88.9 · 43.2)
//     caption        16.4 CSS px        16.4             8.0
//   #monitor/desktop the desktop's shot; on 390x844 the screen width-fitted
//                    (23.8% h 91.9% w)
//   #desk            window 18.4% h 19.1% w, dot body Ø 16.6 CSS px (4.7 on 390x844)
//   The window, its shadow and the dock all in frame at every aspect; the
//   window's right edge + shadow stops 12 px short of the "now" sticky.
// ---------------------------------------------------------------------------

export { SCREEN_W, SCREEN_H };
