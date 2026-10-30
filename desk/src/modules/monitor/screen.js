import { SCREEN_W, SCREEN_H, TITLE_BAR_H } from './layout.js';

/**
 * What the display shows behind its windows: the desktop's wallpaper — the
 * warm charcoal field, calm, with nothing on it — and the menu bar along the
 * top (the clock is its own small canvas, desktop.js CLOCK). v5: Catch The
 * Dot is a window like the others (apps.js paintGame), so its title, caption
 * and counter moved into that window; the three window dots went with it.
 *
 * WHY DARK. In the first screenshots the light-grey panel (#FAFAFA → 225 on
 * screen under ACES) was the brightest, largest surface in the room and said
 * nothing; the posters and the prints are what should win. So the screen is a
 * warm charcoal, and the one bright thing on it is the dot, which is a light
 * (dot.js), not a red disc.
 *
 * THE COLOURS ARE CHOSEN FOR WHAT THEY BECOME, NOT FOR THEIR HEX. The frame is
 * ACES tone mapped after everything (renderPipeline → OutputPass; see the
 * table in DeskScene.js), and ACES crushes darks hard: authored #141414 lands
 * at 4. Each value below was solved in node against three's ACESFilmic curve
 * (exposure 1.0, `day`) so it lands on the display value in its comment; at
 * night (exposure 1.1) everything reads ~4 levels lighter.
 *
 * Nothing here is ever repainted: the dock and the clock are their own small
 * canvases that paint their slice of this backdrop (paintBackdrop with their
 * origin) so they are one surface with it, and every window is its own plane
 * in front (windows.js). So the 3.8 MP screen canvas is uploaded once.
 */

export const CAPTION = 'A game where you catch a dot. No second feature, no roadmap.';
export const TITLE = 'Catch The Dot';

/** Authored → on screen (sRGB, day). */
export const SCREEN_COLORS = Object.freeze({
    fieldCentre: '#3d3a36', // → 47 43 39: a backlit panel is a touch brighter in the middle
    fieldEdge: '#33302d', //   → 34 31 28
    titleBar: '#43403d', //    → 55 51 47
    divider: '#282624', //     → 22 20 18
    title: '#746e67', //       → 124 117 108 (the menu-bar clock)
    caption: '#6e6861', //     → 116 108 99 (Catch The Dot's line, in its window)
    counter: '#8e857a', //     → 157 147 135: the one number, a shade up from the caption
    gameField: '#2f2c29' //    Catch The Dot's field: a step darker than the wallpaper, so its window reads as a window and the dot as a light
});

/**
 * The window light on the glass: a faint lift falling from the top-left (the
 * window is to the left of the desk). Adds ~4 levels at the corner, nothing
 * past the middle. It is the difference between a dark screen and a hole.
 */
const SHEEN = Object.freeze({ color: [255, 244, 228], alpha: 0.03, reach: 0.62 });

/**
 * The whole desktop — wallpaper, menu bar, lift and sheen — drawn in SCREEN px
 * with `origin` at the canvas's top-left, so any canvas can paint its own
 * slice of it and match the screen exactly.
 */
export function paintBackdrop(g, origin = { x: 0, y: 0 }) {
    const c = SCREEN_COLORS;
    g.save();
    g.translate(-origin.x, -origin.y);

    // The field, lifted toward the middle like a real backlight.
    const cx = SCREEN_W * 0.5;
    const cy = TITLE_BAR_H + (SCREEN_H - TITLE_BAR_H) * 0.46;
    const lift = g.createRadialGradient(cx, cy, 0, cx, cy, SCREEN_W * 0.6);
    lift.addColorStop(0, c.fieldCentre);
    lift.addColorStop(0.55, mix(c.fieldCentre, c.fieldEdge, 0.45));
    lift.addColorStop(1, c.fieldEdge);
    g.fillStyle = lift;
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);

    // The menu bar.
    g.fillStyle = c.titleBar;
    g.fillRect(0, 0, SCREEN_W, TITLE_BAR_H);
    g.fillStyle = c.divider;
    g.fillRect(0, TITLE_BAR_H - 1, SCREEN_W, 2);

    // Window light across the glass, from the top-left.
    const [r, gg, b] = SHEEN.color;
    const sheen = g.createLinearGradient(0, 0, SCREEN_W * SHEEN.reach, SCREEN_H * SHEEN.reach * 1.4);
    sheen.addColorStop(0, `rgba(${r}, ${gg}, ${b}, ${SHEEN.alpha})`);
    sheen.addColorStop(1, `rgba(${r}, ${gg}, ${b}, 0)`);
    g.fillStyle = sheen;
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    g.restore();
}

/**
 * A dither of at most ~1 level, so the field's slow lift never shows as rings
 * (ten authored levels across a 1000 px radius land ~1.3 display levels apart
 * after ACES).
 */
function dither(g, width, height, draw) {
    draw?.grain?.(g, width, height, { seed: 'monitor:screen-dither', amount: 0.03 });
}

/** @param {{ g: CanvasRenderingContext2D }} surface ctx.makeCanvas(SCREEN_W, SCREEN_H) */
export function drawScreen({ g }, { draw }) {
    paintBackdrop(g);
    dither(g, SCREEN_W, SCREEN_H, draw);
}

/** '#rrggbb' a → b by t, as '#rrggbb'. */
function mix(a, b, t) {
    const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
    const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
    return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

export { SCREEN_W, SCREEN_H };
