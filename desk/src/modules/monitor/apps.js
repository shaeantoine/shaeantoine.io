/**
 * MONITOR v4 — the painters for the desktop: the dock, the clock and the app
 * windows (each a static canvas plus a small live canvas for the part that
 * animates); the paper notes are notepaper.js. DOM-free: every painter takes a 2D context
 * and `kit` (ctx, or anything with drawText / fitHandwriting /
 * drawHandwriting / draw / palette), so node can paint them too.
 *
 * Colours are authored for what ACES makes of them (see screen.js): the
 * windows sit a shade above the charcoal field, text is a warm light grey,
 * and nothing on a window is brighter than the dot's core.
 */

import { WINDOWS, WINDOW_TITLE_H, SHADOW, TARGETS, DOCK, APP_ORDER, CLOCK, MLX_WHY_BOX, GAME, dockCellX, DOCK_SEP_X } from './desktop.js';
import { APPS, WALK, MLX, APPLE, TRASH } from './copy.js';
import { paintBackdrop, SCREEN_COLORS, CAPTION } from './screen.js';

export const MONO = '"SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace';

export const WIN = Object.freeze({
    body: '#4a4641', //     → ~64 on screen: a step above the field
    bar: '#57524c',
    divider: '#35322f',
    edge: 'rgba(255, 246, 232, 0.10)',
    terminal: '#262422', // walk.py is a terminal: darker than the desktop
    text: '#ddd4c7',
    dim: '#aaa195',
    faint: '#857d73',
    dots: '#6f6963',
    button: '#625c55',
    buttonText: '#ece4d8',
    prompt: '#bfcfae', // a muted terminal green
    path: 'rgba(230, 218, 200, 0.40)',
    warm: '#e0a46a', // compute
    red: '#e2604c', // the dot's red, for the few things that are "it"
    track: '#3b3834'
});

// ---------------------------------------------------------------------------
// Small drawing helpers (plain paths, so any 2D context can take them)
// ---------------------------------------------------------------------------

export function rr(g, x, y, w, h, r) {
    const q = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + q, y);
    g.lineTo(x + w - q, y);
    g.quadraticCurveTo(x + w, y, x + w, y + q);
    g.lineTo(x + w, y + h - q);
    g.quadraticCurveTo(x + w, y + h, x + w - q, y + h);
    g.lineTo(x + q, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - q);
    g.lineTo(x, y + q);
    g.quadraticCurveTo(x, y, x + q, y);
    g.closePath();
}

function text(kit, g, value, options) {
    return kit.drawText(g, value, { face: 'inter', weight: 400, lineHeight: 1.3, ...options });
}

function button(kit, g, rect, label, { hover = false, pressed = false } = {}) {
    g.save();
    g.fillStyle = pressed ? WIN.bar : hover ? '#6d665e' : WIN.button;
    rr(g, rect.x, rect.y, rect.w, rect.h, 9);
    g.fill();
    g.strokeStyle = WIN.edge;
    g.lineWidth = 1.5;
    g.stroke();
    g.restore();
    text(kit, g, label, { x: rect.x + rect.w / 2, y: rect.y + (rect.h - 19 * 1.3) / 2, size: 19, weight: 600, color: WIN.buttonText, align: 'center', maxLines: 1, label });
}

/** A padlock: shackle and body, centred on (cx, cy), `s` its body width. */
export function padlock(g, cx, cy, s, color) {
    g.save();
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = s * 0.13;
    g.lineCap = 'round';
    const bodyTop = cy - s * 0.08;
    g.beginPath();
    g.moveTo(cx - s * 0.3, bodyTop);
    g.lineTo(cx - s * 0.3, cy - s * 0.38);
    g.arc(cx, cy - s * 0.38, s * 0.3, Math.PI, 0);
    g.lineTo(cx + s * 0.3, bodyTop);
    g.stroke();
    rr(g, cx - s / 2, bodyTop, s, s * 0.72, s * 0.12);
    g.fill();
    // The keyhole, cut in the body's own shade of the window.
    g.fillStyle = 'rgba(0, 0, 0, 0.45)';
    g.beginPath();
    g.arc(cx, bodyTop + s * 0.3, s * 0.08, 0, Math.PI * 2);
    g.fill();
    g.fillRect(cx - s * 0.03, bodyTop + s * 0.3, s * 0.06, s * 0.2);
    g.restore();
}

/** A folder, (x, y) top-left, w wide. */
function folder(g, x, y, w, color) {
    const h = w * 0.74;
    g.save();
    g.fillStyle = color;
    rr(g, x, y, w * 0.44, h * 0.3, w * 0.06);
    g.fill();
    rr(g, x, y + h * 0.14, w, h * 0.86, w * 0.08);
    g.fill();
    g.fillStyle = 'rgba(255, 255, 255, 0.10)';
    g.fillRect(x + w * 0.04, y + h * 0.3, w * 0.92, h * 0.05);
    g.restore();
}

/** A wire trash basket with a crumpled sheet in it (it holds one item). */
function trashCan(g, cx, top, s, color) {
    g.save();
    g.strokeStyle = color;
    g.lineWidth = s * 0.06;
    g.lineJoin = 'round';
    // The sheet, peeking over the rim.
    g.fillStyle = '#d9d1c4';
    g.beginPath();
    g.moveTo(cx - s * 0.22, top + s * 0.2);
    g.lineTo(cx - s * 0.1, top + s * 0.02);
    g.lineTo(cx + s * 0.05, top + s * 0.12);
    g.lineTo(cx + s * 0.2, top + s * 0.0);
    g.lineTo(cx + s * 0.26, top + s * 0.2);
    g.closePath();
    g.fill();
    // The basket.
    g.beginPath();
    g.moveTo(cx - s * 0.38, top + s * 0.16);
    g.lineTo(cx + s * 0.38, top + s * 0.16);
    g.lineTo(cx + s * 0.3, top + s);
    g.lineTo(cx - s * 0.3, top + s);
    g.closePath();
    g.fillStyle = 'rgba(40, 37, 34, 0.55)';
    g.fill();
    g.stroke();
    g.lineWidth = s * 0.035;
    for (const k of [-0.16, 0, 0.16]) {
        g.beginPath();
        g.moveTo(cx + k * 1.9, top + s * 0.26);
        g.lineTo(cx + k * 1.5, top + s * 0.92);
        g.stroke();
    }
    g.restore();
}

// ---------------------------------------------------------------------------
// Window chrome
// ---------------------------------------------------------------------------

/** The canvas a window paints into: the window plus SHADOW all round (logical px). `rect`: the map's layout (desktop.js windowRect). */
export function windowCanvasSize(app, rect = WINDOWS[app]) {
    return [rect.w + SHADOW * 2, rect.h + SHADOW * 2];
}

/**
 * Shadow, body, title bar, the three dots (the first closes it) and the title.
 * Leaves the context translated to the window's top-left (restore() after).
 */
export function chrome(g, kit, app, { body = WIN.body, rect = WINDOWS[app] } = {}) {
    const win = rect;
    const [W, H] = windowCanvasSize(app, rect);
    g.clearRect(0, 0, W, H);
    g.save();
    g.translate(SHADOW, SHADOW);
    // A soft shadow: rings of low alpha stepping out (no canvas blur, so any context can do it).
    for (let i = 10; i >= 1; i -= 1) {
        const spread = (i / 10) * SHADOW * 0.95;
        g.fillStyle = `rgba(8, 6, 4, ${0.028 * (1 - i / 11)})`;
        rr(g, -spread, -spread + SHADOW * 0.25, win.w + spread * 2, win.h + spread * 2, 16 + spread);
        g.fill();
    }
    g.fillStyle = body;
    rr(g, 0, 0, win.w, win.h, 14);
    g.fill();
    // Title bar (clipped to the rounded top).
    g.save();
    rr(g, 0, 0, win.w, win.h, 14);
    g.clip();
    g.fillStyle = WIN.bar;
    g.fillRect(0, 0, win.w, WINDOW_TITLE_H);
    g.fillStyle = WIN.divider;
    g.fillRect(0, WINDOW_TITLE_H - 1, win.w, 1.5);
    g.restore();
    g.strokeStyle = WIN.edge;
    g.lineWidth = 1.5;
    rr(g, 0.75, 0.75, win.w - 1.5, win.h - 1.5, 14);
    g.stroke();
    for (let i = 0; i < 3; i += 1) {
        g.fillStyle = i === 0 ? '#8a6a62' : WIN.dots; // the close dot, a touch warmer
        g.beginPath();
        g.arc(26 + i * 22, WINDOW_TITLE_H / 2, 6.5, 0, Math.PI * 2);
        g.fill();
    }
    text(kit, g, APPS[app].title, {
        x: win.w / 2, y: (WINDOW_TITLE_H - 20 * 1.3) / 2, size: 20, weight: 500, color: WIN.dim, align: 'center', maxLines: 1, label: `${app} title`
    });
    return win;
}

// ---------------------------------------------------------------------------
// Catch The Dot (the dot, its trail and ripples are meshes over this window)
// ---------------------------------------------------------------------------

function statusTextTop() {
    const s = GAME.status;
    return (s.height - s.size * s.lineHeight) / 2;
}

/**
 * The window: its chrome, the dark field the dot drifts on, and the one line
 * bottom-left on the status row. Painted once; the counter is the live canvas
 * (paintGameCounter), so a catch re-uploads 240 x 48 px, not this.
 */
export function paintGame(g, kit) {
    const win = chrome(g, kit, 'dot', { body: SCREEN_COLORS.gameField });
    const s = GAME.status;
    const live = win.live;
    text(kit, g, CAPTION, {
        x: s.left,
        y: s.top + statusTextTop(),
        size: s.size,
        lineHeight: s.lineHeight,
        weight: 400,
        color: SCREEN_COLORS.caption,
        maxWidth: live.x - s.left - 40,
        maxLines: 1,
        label: 'game caption'
    });
    g.restore();
    return win;
}

/** "caught N", right-aligned in the live canvas (WINDOWS.dot.live), on the field's own colour. */
export function paintGameCounter(g, kit, caught) {
    const { w, h } = WINDOWS.dot.live;
    const s = GAME.status;
    g.fillStyle = SCREEN_COLORS.gameField;
    g.fillRect(0, 0, w, h);
    text(kit, g, `caught ${caught}`, {
        x: w, y: statusTextTop(), size: s.size, lineHeight: s.lineHeight, weight: 500, color: SCREEN_COLORS.counter, align: 'right', maxLines: 1, label: 'counter'
    });
}

// ---------------------------------------------------------------------------
// walk.py (2019)
// ---------------------------------------------------------------------------

export const WALK_SIM = Object.freeze({ paths: 40, steps: 180, start: 100, mu: 0.05, sigma: 0.32, years: 1 });

/**
 * ~40 geometric random walks from one start (S_t+1 = S_t · exp((μ − σ²/2)dt + σ√dt Z)).
 * `rand` is a seeded [0,1) source (ctx.rng). Returns { paths: Float32Array[], min, max }.
 */
export function walkPaths(rand, sim = WALK_SIM) {
    const dt = sim.years / sim.steps;
    const drift = (sim.mu - (sim.sigma * sim.sigma) / 2) * dt;
    const vol = sim.sigma * Math.sqrt(dt);
    let spare = null;
    const gauss = () => {
        if (spare !== null) { const v = spare; spare = null; return v; }
        const u = Math.max(1e-12, rand());
        const v = rand();
        const r = Math.sqrt(-2 * Math.log(u));
        spare = r * Math.sin(2 * Math.PI * v);
        return r * Math.cos(2 * Math.PI * v);
    };
    const paths = [];
    let min = sim.start;
    let max = sim.start;
    for (let p = 0; p < sim.paths; p += 1) {
        const path = new Float32Array(sim.steps + 1);
        path[0] = sim.start;
        for (let i = 1; i <= sim.steps; i += 1) {
            path[i] = path[i - 1] * Math.exp(drift + vol * gauss());
            if (path[i] < min) min = path[i];
            if (path[i] > max) max = path[i];
        }
        paths.push(path);
    }
    return { paths, min, max, start: sim.start };
}

export function paintWalk(g, kit, { hoverRun = false, ran = false } = {}) {
    const win = chrome(g, kit, 'walk', { body: WIN.terminal });
    const live = win.live;
    text(kit, g, WALK.command, { x: 24, y: 60, size: 21, face: MONO, color: WIN.prompt, maxLines: 1, label: 'walk command' });
    button(kit, g, TARGETS.walkRun, 'run ▸', { hover: hoverRun });
    // The live area's frame (the live canvas draws inside it).
    g.strokeStyle = 'rgba(255, 246, 232, 0.06)';
    g.lineWidth = 1.5;
    rr(g, live.x - 0.75, live.y - 0.75, live.w + 1.5, live.h + 1.5, 6);
    g.stroke();
    if (ran) text(kit, g, WALK.output(WALK_SIM.paths), { x: 24, y: live.y + live.h + 12, size: 18, face: MONO, color: WIN.faint, maxLines: 1, label: 'walk output' });
    const cap = text(kit, g, WALK.caption, { x: 24, y: 540, size: 22, color: WIN.text, maxWidth: win.w - 48, maxLines: 2, lineHeight: 1.35, label: 'walk caption' });
    text(kit, g, WALK.standIn, { x: 24, y: cap.bottom + 10, size: 16, style: 'italic', color: WIN.faint, maxLines: 1, label: 'walk stand-in' });
    g.restore();
}

/** The fan, drawn up to `progress` (0..1) of its steps. */
export function paintWalkLive(g, kit, sim, progress) {
    const { w, h } = WINDOWS.walk.live;
    g.fillStyle = WIN.terminal;
    g.fillRect(0, 0, w, h);
    const x0 = 34;
    const x1 = w - 18;
    const pad = 0.1;
    const lo = Math.log(sim.min);
    const hi = Math.log(sim.max);
    const span = hi - lo || 1;
    const yOf = (v) => h - 16 - ((Math.log(v) - lo) / span) * (1 - pad) * (h - 32) - pad * 0.5 * (h - 32);
    // The start level, dashed.
    g.save();
    g.strokeStyle = 'rgba(255, 246, 232, 0.08)';
    g.lineWidth = 1.2;
    const ys = yOf(sim.start);
    for (let x = x0; x < x1; x += 14) {
        g.beginPath();
        g.moveTo(x, ys);
        g.lineTo(Math.min(x + 7, x1), ys);
        g.stroke();
    }
    g.restore();
    const steps = sim.paths[0].length - 1;
    const upto = Math.max(0, Math.min(1, progress)) * steps;
    const whole = Math.floor(upto);
    const frac = upto - whole;
    const dx = (x1 - x0) / steps;
    g.save();
    g.lineWidth = 1.6;
    g.lineJoin = 'round';
    g.strokeStyle = WIN.path;
    for (const path of sim.paths) {
        if (upto <= 0) break;
        g.beginPath();
        g.moveTo(x0, yOf(path[0]));
        for (let i = 1; i <= whole; i += 1) g.lineTo(x0 + i * dx, yOf(path[i]));
        if (whole < steps && frac > 0) {
            const v = path[whole] + (path[whole + 1] - path[whole]) * frac;
            g.lineTo(x0 + upto * dx, yOf(v));
        }
        g.stroke();
    }
    g.restore();
    // The one start, a small warm point.
    g.fillStyle = WIN.red;
    g.beginPath();
    g.arc(x0, ys, 5, 0, Math.PI * 2);
    g.fill();
}

// ---------------------------------------------------------------------------
// MLX
// ---------------------------------------------------------------------------

/** Illustrative timing, fractions of MLX_RUN_MS: a copy lane and a shared-memory lane. */
export const MLX_TIMES = Object.freeze({
    copy: Object.freeze({ toGpu: [0, 0.3], compute: [0.3, 0.72], back: [0.72, 1] }),
    unified: Object.freeze({ compute: [0, 0.42] })
});
export const MLX_RUN_MS = 2600;

export function paintMlx(g, kit, { hoverRun = false, hoverWhy = false, whyOpen = 0 } = {}) {
    const win = chrome(g, kit, 'mlx');
    text(kit, g, MLX.line, { x: 24, y: 62, size: 23, weight: 500, color: WIN.text, maxWidth: 830, maxLines: 2, lineHeight: 1.32, label: 'mlx line' });
    button(kit, g, TARGETS.mlxRun, 'run ▸', { hover: hoverRun });
    text(kit, g, MLX.illustrative, {
        x: TARGETS.mlxRun.x - 16, y: TARGETS.mlxRun.y + (TARGETS.mlxRun.h - 16 * 1.3) / 2, size: 16, style: 'italic', color: WIN.faint, align: 'right', maxLines: 1, label: 'illustrative'
    });
    // The "why" toggle: a quiet text button with a chevron that turns.
    const why = TARGETS.mlxWhy;
    g.save();
    g.fillStyle = hoverWhy || whyOpen > 0 ? '#57524c' : 'rgba(0,0,0,0)';
    rr(g, why.x, why.y, why.w, why.h, 9);
    g.fill();
    g.restore();
    text(kit, g, 'why', { x: why.x + 14, y: why.y + (why.h - 19 * 1.3) / 2, size: 19, weight: 600, color: WIN.dim, maxLines: 1, label: 'why' });
    g.save();
    g.strokeStyle = WIN.dim;
    g.lineWidth = 2;
    g.lineCap = 'round';
    g.translate(why.x + why.w - 22, why.y + why.h / 2);
    g.rotate((Math.PI / 2) * whyOpen);
    g.beginPath();
    g.moveTo(-3, -6);
    g.lineTo(3, 0);
    g.lineTo(-3, 6);
    g.stroke();
    g.restore();
    if (whyOpen > 0) {
        g.save();
        g.globalAlpha = whyOpen;
        text(kit, g, MLX.why, { x: MLX_WHY_BOX.x, y: MLX_WHY_BOX.y + (1 - whyOpen) * 8, size: 20, color: WIN.dim, maxWidth: MLX_WHY_BOX.w, maxLines: 5, lineHeight: 1.4, label: 'mlx why' });
        g.restore();
    }
    g.restore();
    return win;
}

const LANE_H = 159;
const TRACK = Object.freeze({ x: 404, w: 548, y: 78, h: 22 });

function phase(t, [a, b]) {
    return Math.max(0, Math.min(1, (t - a) / (b - a)));
}

/** An array: a 4 x 3 block of cells, `lit` of them warm (compute), at (x, y). */
function arrayBlock(g, x, y, lit) {
    const cw = 15;
    const gap = 3;
    for (let r = 0; r < 3; r += 1) {
        for (let c = 0; c < 4; c += 1) {
            const i = r * 4 + c;
            g.fillStyle = i < lit ? WIN.warm : '#8f877c';
            g.fillRect(x + c * (cw + gap), y + r * (cw + gap), cw, cw);
        }
    }
}
const BLOCK_W = 4 * 15 + 3 * 3;
const BLOCK_H = 3 * 15 + 2 * 3;

function memoryBox(kit, g, x, y, w, h, label) {
    g.save();
    g.strokeStyle = 'rgba(255, 246, 232, 0.16)';
    g.lineWidth = 1.5;
    rr(g, x, y, w, h, 8);
    g.stroke();
    g.restore();
    text(kit, g, label, { x: x + 10, y: y + 6, size: 14, color: WIN.faint, maxLines: 1, label });
}

function trackSegment(g, t0, t1, fill, hatched) {
    const x = TRACK.x + TRACK.w * t0;
    const w = TRACK.w * (t1 - t0);
    if (w <= 0.5) return;
    g.save();
    rr(g, x, TRACK.y, w, TRACK.h, 5);
    g.fillStyle = fill;
    g.fill();
    if (hatched) {
        g.clip();
        g.strokeStyle = 'rgba(38, 36, 34, 0.55)';
        g.lineWidth = 3;
        for (let k = x - TRACK.h; k < x + w; k += 10) {
            g.beginPath();
            g.moveTo(k, TRACK.y + TRACK.h);
            g.lineTo(k + TRACK.h, TRACK.y);
            g.stroke();
        }
    }
    g.restore();
}

function segmentLabel(kit, g, t0, t1, label, shown) {
    if (!shown) return;
    text(kit, g, label, { x: TRACK.x + TRACK.w * (t0 + t1) / 2, y: TRACK.y + TRACK.h + 8, size: 14, color: WIN.faint, align: 'center', maxLines: 1, label });
}

function doneMark(kit, g, t) {
    const x = TRACK.x + TRACK.w * t;
    g.save();
    g.strokeStyle = WIN.text;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, TRACK.y - 6);
    g.lineTo(x, TRACK.y + TRACK.h + 4);
    g.stroke();
    g.restore();
    text(kit, g, MLX.done, { x: Math.min(x, TRACK.x + TRACK.w), y: TRACK.y - 30, size: 16, weight: 600, color: WIN.text, align: t > 0.9 ? 'right' : 'center', maxLines: 1, label: 'done' });
}

/** Both lanes at run time `t` (0..1 of MLX_RUN_MS; 1 = finished). */
export function paintMlxLive(g, kit, t) {
    const { w, h } = WINDOWS.mlx.live;
    g.fillStyle = WIN.body;
    g.fillRect(0, 0, w, h);
    const L = MLX.lanes;
    const T = MLX_TIMES;

    // Lane 1: most frameworks — copy in, compute, copy back.
    g.save();
    text(kit, g, L.copy.name, { x: 0, y: 6, size: 19, weight: 600, color: WIN.text, maxLines: 1, label: 'lane copy' });
    memoryBox(kit, g, 0, 40, 170, 100, L.copy.cpu);
    memoryBox(kit, g, 200, 40, 170, 100, L.copy.gpu);
    const inT = phase(t, T.copy.toGpu);
    const backT = phase(t, T.copy.back);
    const ease = (k) => k * k * (3 - 2 * k);
    const cpuX = 50;
    const gpuX = 250;
    const bx = cpuX + (gpuX - cpuX) * ease(inT) - (gpuX - cpuX) * ease(backT);
    // The copy itself: a faint bar between the two boxes while data is on the move.
    if ((inT > 0 && inT < 1) || (backT > 0 && backT < 1)) {
        g.fillStyle = 'rgba(224, 164, 106, 0.22)';
        g.fillRect(170, 84, 30, 12);
    }
    const lit1 = Math.round(12 * phase(t, T.copy.compute));
    arrayBlock(g, bx, 72, lit1);
    g.fillStyle = WIN.track;
    rr(g, TRACK.x, TRACK.y, TRACK.w, TRACK.h, 5);
    g.fill();
    trackSegment(g, T.copy.toGpu[0], T.copy.toGpu[0] + (T.copy.toGpu[1] - T.copy.toGpu[0]) * inT, '#8f877c', true);
    trackSegment(g, T.copy.compute[0], T.copy.compute[0] + (T.copy.compute[1] - T.copy.compute[0]) * phase(t, T.copy.compute), WIN.warm, false);
    trackSegment(g, T.copy.back[0], T.copy.back[0] + (T.copy.back[1] - T.copy.back[0]) * backT, '#8f877c', true);
    segmentLabel(kit, g, ...T.copy.toGpu, L.copy.toGpu, t > 0);
    segmentLabel(kit, g, ...T.copy.compute, L.copy.compute, t >= T.copy.compute[0]);
    segmentLabel(kit, g, ...T.copy.back, L.copy.back, t >= T.copy.back[0]);
    if (t >= 1) doneMark(kit, g, 1);
    g.restore();

    // Lane 2: MLX on Apple silicon — one memory, compute from the first moment.
    g.save();
    g.translate(0, LANE_H);
    g.fillStyle = 'rgba(255, 246, 232, 0.05)';
    g.fillRect(0, -1, w, 1.5);
    text(kit, g, L.unified.name, { x: 0, y: 10, size: 19, weight: 600, color: WIN.text, maxLines: 1, label: 'lane unified' });
    memoryBox(kit, g, 0, 44, 370, 100, L.unified.memory);
    text(kit, g, L.unified.cpu, { x: 70, y: 118, size: 14, weight: 600, color: WIN.dim, align: 'center', maxLines: 1, label: 'cpu' });
    text(kit, g, L.unified.gpu, { x: 300, y: 118, size: 14, weight: 600, color: WIN.dim, align: 'center', maxLines: 1, label: 'gpu' });
    const lit2 = Math.round(12 * phase(t, T.unified.compute));
    arrayBlock(g, 185 - BLOCK_W / 2, 70, lit2);
    g.fillStyle = WIN.track;
    rr(g, TRACK.x, TRACK.y, TRACK.w, TRACK.h, 5);
    g.fill();
    const c = T.unified.compute;
    trackSegment(g, c[0], c[0] + (c[1] - c[0]) * phase(t, c), WIN.warm, false);
    segmentLabel(kit, g, ...c, L.unified.compute, t > 0);
    if (t >= c[1]) doneMark(kit, g, c[1]);
    g.restore();

    // The clock both lanes share.
    if (t > 0 && t < 1) {
        const x = TRACK.x + TRACK.w * t;
        g.fillStyle = 'rgba(255, 246, 232, 0.35)';
        g.fillRect(x - 0.75, TRACK.y - 10, 1.5, LANE_H + TRACK.h + 20);
    }
    void BLOCK_H;
}

// ---------------------------------------------------------------------------
// Apple
// ---------------------------------------------------------------------------

export function paintApple(g, kit, { shake = 0 } = {}) {
    const win = chrome(g, kit, 'apple');
    // Something is there, behind frosted glass: soft shapes of a window you can't read.
    g.save();
    const shapes = [[40, 76, 180, 18], [40, 108, 240, 12], [40, 130, 200, 12], [330, 76, 290, 150], [40, 170, 250, 110], [40, 300, 580, 12], [40, 322, 520, 12], [40, 344, 560, 12], [40, 380, 300, 40]];
    g.fillStyle = 'rgba(255, 246, 232, 0.07)';
    for (const [x, y, w, h] of shapes) {
        rr(g, x, y, w, h, 6);
        g.fill();
    }
    g.fillStyle = 'rgba(74, 70, 65, 0.8)';
    g.fillRect(1, WINDOW_TITLE_H, win.w - 2, win.h - WINDOW_TITLE_H - 1);
    g.restore();
    const lock = TARGETS.appleLock;
    padlock(g, lock.x + lock.w / 2 + shake, lock.y + 56, 56, '#cfc6b9');
    const role = text(kit, g, APPLE.role, { x: win.w / 2, y: 188, size: 25, weight: 600, color: WIN.text, align: 'center', maxLines: 1, label: 'apple role' });
    const line = text(kit, g, APPLE.line, { x: win.w / 2, y: role.bottom + 12, size: 22, color: WIN.dim, align: 'center', maxLines: 1, label: 'apple line' });
    text(kit, g, APPLE.small, { x: win.w / 2, y: line.bottom + 34, size: 17, color: WIN.faint, align: 'center', maxWidth: 500, maxLines: 2, lineHeight: 1.4, label: 'apple small' });
    g.restore();
}

// ---------------------------------------------------------------------------
// Trash
// ---------------------------------------------------------------------------

export const TRASH_RUN = Object.freeze({ crawlMs: 2300, fanMs: 700, stallAt: 0.03, noteAtMs: 2900 });

export function paintTrash(g, kit, { hoverRow = false, opened = false } = {}) {
    const win = chrome(g, kit, 'trash');
    text(kit, g, TRASH.count, { x: win.w - 24, y: (WINDOW_TITLE_H - 15 * 1.3) / 2, size: 15, color: WIN.faint, align: 'right', maxLines: 1, label: 'trash count' });
    const row = TARGETS.trashRow;
    if (hoverRow || opened) {
        g.fillStyle = opened ? 'rgba(255, 246, 232, 0.07)' : 'rgba(255, 246, 232, 0.05)';
        rr(g, row.x, row.y, row.w, row.h, 10);
        g.fill();
    }
    folder(g, row.x + 22, row.y + 24, 62, '#9d8f7c');
    text(kit, g, TRASH.folder, { x: row.x + 106, y: row.y + 16, size: 23, weight: 600, color: WIN.text, maxLines: 1, label: 'trash folder' });
    text(kit, g, TRASH.question, { x: row.x + 106, y: row.y + 52, size: 18, color: WIN.dim, maxLines: 1, maxWidth: row.w - 130, label: 'trash question' });
    g.fillStyle = WIN.divider;
    g.fillRect(24, row.y + row.h + 12, win.w - 48, 1.5);
    g.restore();
}

/** The run at `ms` since it started (Infinity = the stalled end). Before a run, an empty panel. */
export function trashRunState(ms) {
    if (!(ms >= 0)) return null;
    const k = Math.min(1, ms / TRASH_RUN.crawlMs);
    const crawl = 1 - Math.pow(1 - k, 3);
    return {
        progress: TRASH_RUN.stallAt * crawl,
        fans: Math.min(1, 1 - Math.pow(1 - Math.min(1, ms / TRASH_RUN.fanMs), 3)),
        stalled: ms >= TRASH_RUN.crawlMs
    };
}

export function paintTrashLive(g, kit, ms) {
    const { w, h } = WINDOWS.trash.live;
    g.fillStyle = WIN.body;
    g.fillRect(0, 0, w, h);
    const s = trashRunState(ms);
    if (!s) return;
    // Running: a steady amber point, not a spinner (nothing here needs frames once it stalls).
    g.fillStyle = WIN.warm;
    g.beginPath();
    g.arc(8, 22, 6, 0, Math.PI * 2);
    g.fill();
    text(kit, g, TRASH.running, { x: 26, y: 8, size: 20, face: MONO, color: WIN.text, maxLines: 1, label: 'trash running' });
    const barW = 620;
    text(kit, g, TRASH.progress, { x: 0, y: 70, size: 15, color: WIN.faint, maxLines: 1, label: 'progress' });
    g.fillStyle = WIN.track;
    rr(g, 0, 96, barW, 16, 8);
    g.fill();
    const fill = Math.max(s.progress > 0 ? 8 : 0, barW * s.progress);
    if (fill > 0) {
        g.fillStyle = '#cfc6b9';
        rr(g, 0, 96, fill, 16, 8);
        g.fill();
    }
    text(kit, g, `${Math.round(s.progress * 100)}%`, { x: barW + 20, y: 92, size: 19, face: MONO, color: WIN.text, maxLines: 1, label: 'percent' });
    text(kit, g, TRASH.fans, { x: 0, y: 150, size: 15, color: WIN.faint, maxLines: 1, label: 'fans' });
    const bars = 20;
    const lit = Math.round(bars * s.fans);
    for (let i = 0; i < bars; i += 1) {
        const x = i * (barW / bars);
        const on = i < lit;
        const heat = i / (bars - 1);
        g.fillStyle = on ? (heat > 0.8 ? WIN.red : heat > 0.5 ? WIN.warm : '#b9ad9b') : WIN.track;
        g.fillRect(x, 178, barW / bars - 5, 30);
    }
    if (s.fans >= 1) text(kit, g, TRASH.max, { x: barW + 20, y: 180, size: 19, face: MONO, color: WIN.red, maxLines: 1, label: 'max' });
}

// ---------------------------------------------------------------------------
// The dock and the clock (each its own small canvas on its slice of the screen)
// ---------------------------------------------------------------------------

/** The dock's icon (v8, the map's): a tiny drawn desk on a cream card, the screen on it carrying the red dot. */
function mapIcon(g, x, y, s) {
    const u = s / 50;
    g.save();
    g.fillStyle = '#e9e1d3';
    rr(g, x + 4 * u, y + 9 * u, 42 * u, 32 * u, 4 * u);
    g.fill();
    g.strokeStyle = '#6f6963';
    g.lineWidth = 1.4 * u;
    g.beginPath();
    g.moveTo(x + 10 * u, y + 33 * u);
    g.lineTo(x + 40 * u, y + 33 * u);
    g.lineTo(x + 36 * u, y + 24 * u);
    g.lineTo(x + 14 * u, y + 24 * u);
    g.closePath();
    g.stroke();
    g.fillStyle = '#3a3632';
    g.fillRect(x + 19 * u, y + 14 * u, 12 * u, 8 * u);
    g.fillStyle = '#e2604c';
    g.beginPath();
    g.arc(x + 25 * u, y + 18 * u, 2 * u, 0, Math.PI * 2);
    g.fill();
    g.restore();
}

function dockIcon(g, kit, app, x, y, s) {
    g.save();
    if (app === 'readme') {
        mapIcon(g, x, y, s);
        g.restore();
        return;
    }
    if (app === 'trash') {
        trashCan(g, x + s / 2, y + s * 0.08, s * 0.84, '#bdb4a8');
        g.restore();
        return;
    }
    const bg = { walk: '#1f1d1b', dot: '#2a2724', mlx: '#5b554e', apple: '#5b554e' }[app];
    g.fillStyle = bg;
    rr(g, x, y, s, s, s * 0.22);
    g.fill();
    g.strokeStyle = 'rgba(255, 246, 232, 0.12)';
    g.lineWidth = 1.2;
    g.stroke();
    if (app === 'walk') {
        kit.drawText(g, '>_', { x: x + s * 0.16, y: y + s * 0.1, size: s * 0.34, face: MONO, weight: 600, color: WIN.prompt, maxLines: 1, label: 'walk icon' });
        g.strokeStyle = 'rgba(230, 218, 200, 0.6)';
        g.lineWidth = 1.6;
        for (const [a, b] of [[-0.18, -0.1], [0.02, 0.06], [0.16, 0.2]]) {
            g.beginPath();
            g.moveTo(x + s * 0.18, y + s * 0.7);
            g.lineTo(x + s * 0.5, y + s * (0.7 + a));
            g.lineTo(x + s * 0.84, y + s * (0.7 + b - 0.12));
            g.stroke();
        }
    } else if (app === 'dot') {
        for (const [r, a] of [[0.34, 0.08], [0.24, 0.18], [0.15, 0.55]]) {
            g.fillStyle = `rgba(226, 96, 76, ${a})`;
            g.beginPath();
            g.arc(x + s / 2, y + s / 2, s * r, 0, Math.PI * 2);
            g.fill();
        }
        g.fillStyle = '#f6d7b8';
        g.beginPath();
        g.arc(x + s / 2, y + s / 2, s * 0.06, 0, Math.PI * 2);
        g.fill();
    } else if (app === 'mlx') {
        kit.drawText(g, 'MLX', { x: x + s / 2, y: y + s * 0.3, size: s * 0.3, weight: 700, color: '#ece4d8', align: 'center', maxLines: 1, label: 'mlx icon' });
    } else if (app === 'apple') {
        padlock(g, x + s / 2, y + s * 0.56, s * 0.42, '#ece4d8');
    }
    g.restore();
}

/**
 * The dock: the map ("start here"), a thin separator, then five apps in time order, each
 * with its name under it, a small light under the ones opened this visit,
 * and a touch brighter under the one that is open now.
 */
export function paintDock(g, kit, { open = new Set(['readme']), current = null, hover = null } = {}) {
    paintBackdrop(g, { x: DOCK.x, y: DOCK.y });
    g.save();
    g.fillStyle = 'rgba(255, 248, 236, 0.055)';
    rr(g, 2, 2, DOCK.width - 4, DOCK.height - 4, 22);
    g.fill();
    g.strokeStyle = 'rgba(255, 248, 236, 0.09)';
    g.lineWidth = 1.5;
    g.stroke();
    // The separator between the map and the timeline.
    g.fillStyle = 'rgba(255, 248, 236, 0.16)';
    g.fillRect(DOCK_SEP_X - 0.75, 14, 1.5, DOCK.height - 28);
    g.restore();
    APP_ORDER.forEach((app, i) => {
        const cx = dockCellX(i) + DOCK.cell / 2;
        const lift = hover === app ? 3 : 0;
        dockIcon(g, kit, app, cx - DOCK.icon / 2, DOCK.iconTop - lift, DOCK.icon);
        kit.drawText(g, APPS[app].dock, {
            x: cx, y: DOCK.labelTop, size: DOCK.labelSize, weight: 500, color: hover === app ? '#c9c0b3' : '#8e857a', align: 'center', maxLines: 1, label: `dock ${app}`
        });
        if (open.has(app) || current === app) {
            const now = current === app;
            g.fillStyle = now ? '#e8dfd2' : '#b4aa9c';
            g.beginPath();
            g.arc(cx, DOCK.runY, now ? 3 : 2.6, 0, Math.PI * 2);
            g.fill();
        }
    });
}

/** "Tue 21:40" in the visitor's own time (the fixed clock under ?still / ?film). */
export function clockText(date) {
    const day = date.toLocaleDateString('en-AU', { weekday: 'short' });
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${day} ${hh}:${mm}`;
}

export function paintClock(g, kit, value, color) {
    paintBackdrop(g, { x: CLOCK.x, y: CLOCK.y });
    kit.drawText(g, value, { x: CLOCK.width, y: (CLOCK.height - 22 * 1.3) / 2, size: 22, weight: 500, color, align: 'right', maxLines: 1, label: 'clock' });
}
