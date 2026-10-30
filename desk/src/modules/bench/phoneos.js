/**
 * THE PHONE'S OS — a small, calm dumb-phone launcher on Shae's Pixel, whose
 * design is the idea: "the dumb-phone movement, plus AI: a way to rely on my
 * phone less", on "LineageOS, extended to collect my own data at the kernel".
 *
 *   lock      the photo's lock screen (screens.js drawLockScreen)
 *   launcher  grey on black, a small clock/battery line, five words in large
 *             Inter, left-aligned, no icons: log · assistant · camera · notes · about
 *   log       "what the kernel saw today": a 00–24 h timeline of pickups and
 *             app opens as thin ticks up to now, the total, "an illustrative day"
 *   assistant "held until 6pm", the held sources, "nothing urgent", one quiet
 *             button that lets them through (shows what was held); Shae's line;
 *             "the idea, sketched — not a shipped feature"
 *   camera    a low-res live viewfinder (phone.js renders it into VIEWFINDER),
 *             or, where it can't run, three photos from the camera roll
 *   notes     Shae's note, printed, and the thread to the board (tappable)
 *   about     "LineageOS · built by Shae", the kernel line, a decorative toggle
 *
 * Every app's title is a back control ("‹ log"), and the gesture bar at the
 * bottom goes back too: both return to the launcher.
 *
 * DOM-free and three-free (canvas 2D calls only), so node can import it:
 * everything is in MILLIMETRES on the glass (SCREEN.w × SCREEN.h, y down), the
 * same space as the screen canvas and a raycast's uv (x = u·w, y = (1 − v)·h).
 * The glass's own lines (the faulty panel) are drawn over all of this by
 * phone.js (screens.js drawGlass), so they stay put while screens slide.
 */

import { PHONE } from './layout.js';
import { rng } from '../../core/rng.js';
import { THREADS, PHONE_NOTE_TEXT, PHONE_SCREEN_LINE, OS } from './copy.js';
import { phoneClock } from './screens.js';

export const SCREEN = Object.freeze({ w: PHONE.screen.w, h: PHONE.screen.h, r: PHONE.screen.r });
const W = SCREEN.w;
const H = SCREEN.h;

export const APPS = Object.freeze(['log', 'assistant', 'camera', 'notes', 'about']);

/** Left text inset: clear of the panel's magenta lines (x 2.1–4.0 mm). */
export const MARGIN = 7;
const RIGHT = W - MARGIN;
const TEXT_W = W - 2 * MARGIN;

/** Type sizes, mm (at 16:10 the phone in hand shows ≈ 3.6 CSS px per mm). */
export const TYPE = Object.freeze({ row: 7.2, title: 5.2, lead: 5.6, body: 3.8, small: 3.2, status: 2.7 });

export const INK = Object.freeze({
    bg: '#000000',
    text: '#d4d4d4',
    bright: '#e8e8e8',
    dim: '#8e8e8e',
    faint: '#666666',
    rule: '#222222',
    calm: '#a8bdad'
});

/** The launcher's rows: text top, and a full-width hit band per app. */
export const LAUNCHER = (() => {
    const top = 40;
    const pitch = 14.5;
    return Object.freeze({
        top, pitch,
        rows: Object.freeze(APPS.map((app, i) => Object.freeze({
            app,
            textY: top + i * pitch,
            rect: Object.freeze({ x: 0, y: top + i * pitch - 3, w: W, h: pitch })
        })))
    });
})();

/**
 * The ways back (every app). The gesture bar alone was missed: a thin pill
 * reads as Android chrome, not as "back", least of all on a website. So each
 * app's title is also a back control — "‹ log" — with the whole band under
 * the status line as its hit area; the bar stays, hit generously.
 */
export const GESTURE = Object.freeze({
    bar: Object.freeze({ x: W / 2 - 9, y: H - 4.6, w: 18, h: 0.9 }),
    rect: Object.freeze({ x: 0, y: H - 13, w: W, h: 13 }),
    top: Object.freeze({ x: 0, y: 7, w: W, h: 10.5 })
});

/** Where each app's title (its back control) sits. */
const TITLE_Y = 11;

/**
 * The camera's viewfinder (1 : 2, as its 256 × 512 render target) and shutter.
 * Starts under the title so "‹ camera" isn't covered by the viewfinder mesh;
 * narrowed by as much as it moved down, so it — and the shutter — still end
 * where they did.
 */
const VIEWFINDER_W = W - 11.5;
export const VIEWFINDER = Object.freeze({ x: (W - VIEWFINDER_W) / 2, y: 18, w: VIEWFINDER_W, h: 2 * VIEWFINDER_W });
export const VIEWFINDER_PX = Object.freeze({ w: 256, h: 512 });
/** Where each camera-roll photo's crop centres (copy.js CAMERA_ROLL order): Amazon keeps the face. */
const ROLL_FOCUS_Y = Object.freeze([0.12, 0.5, 0.45]);
const SHUTTER = Object.freeze({ x: W / 2, y: VIEWFINDER.y + VIEWFINDER.h + 8.2, r: 4.2 });

/** Buttons and links inside apps (mm). */
export const TARGETS = Object.freeze({
    release: Object.freeze({ x: MARGIN, y: 75, w: TEXT_W, h: 9 }),
    logging: Object.freeze({ x: 0, y: 55, w: W, h: 12 }),
    thread: Object.freeze({ x: 0, y: 60, w: W, h: 38 })
});

/** The log's timeline: 00 at the top, 24 at the bottom. */
export const TIMELINE = Object.freeze({ top: 33, bottom: 103, axisX: 16.5, pickX: [19.5, 31], openX: [35, 41.5] });

// ---------------------------------------------------------------------------
// Screens, as data
// ---------------------------------------------------------------------------

/**
 * A screen: { kind: 'off' | 'lock' | 'launcher' | 'app', app?, revealed?,
 * logging?, camera?: 'live' | 'gallery' }. The key says when two screens
 * would paint the same (the clock aside).
 */
export function screenKey(screen) {
    if (!screen) return 'none';
    if (screen.kind !== 'app') return screen.kind;
    const extra = screen.app === 'assistant' ? `:${screen.revealed ? 'released' : 'held'}`
        : screen.app === 'about' ? `:${screen.logging === false ? 'off' : 'on'}`
            : screen.app === 'camera' ? `:${screen.camera ?? 'live'}` : '';
    return `app:${screen.app}${extra}`;
}

/** The route a screen lives at. */
export function screenHash(screen) {
    if (screen?.kind === 'lock') return '#bench/phone';
    if (screen?.kind === 'launcher') return '#bench/phone/open';
    if (screen?.kind === 'app') return `#bench/phone/open/${screen.app}`;
    return '#bench';
}

/** How one screen gives way to the next: unlock (swipe up), push / pop (slide), fade, or none. */
export function transitionFor(from, to) {
    const a = from?.kind ?? 'off';
    const b = to?.kind ?? 'off';
    if (a === 'off' || b === 'off' || screenKey(from) === screenKey(to)) return 'none';
    if (a === 'lock' && b !== 'lock') return 'unlock';
    if (b === 'lock') return 'fade';
    if (a === 'launcher' && b === 'app') return 'push';
    if (a === 'app' && b === 'launcher') return 'pop';
    if (a === 'app' && b === 'app') return from.app === to.app ? 'fade' : 'push';
    return 'fade';
}

/** Transition lengths, ms (the unlock stays ≤ 350). */
export const TRANSITION_MS = Object.freeze({ unlock: 300, push: 260, pop: 240, fade: 180 });

// ---------------------------------------------------------------------------
// Hit testing (mm on the glass)
// ---------------------------------------------------------------------------

const inside = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/**
 * What a tap at (x, y) mm does on `screen`: { to } (a route), { act } (in-app:
 * 'release' | 'logging'), { swallow: true } (the glass, nothing there), or
 * null (off the glass).
 */
export function hitScreen(screen, x, y) {
    if (!screen || !(x >= 0 && x <= W && y >= 0 && y <= H)) return null;
    if (screen.kind === 'off') return { swallow: true };
    if (screen.kind === 'lock') return { to: '#bench/phone/open' };
    if (screen.kind === 'launcher') {
        const row = LAUNCHER.rows.find((r) => inside(x, y, r.rect));
        return row ? { to: `#bench/phone/open/${row.app}` } : { swallow: true };
    }
    if (inside(x, y, GESTURE.top) || inside(x, y, GESTURE.rect)) return { to: '#bench/phone/open' };
    if (screen.app === 'assistant' && inside(x, y, TARGETS.release)) return { act: 'release' };
    if (screen.app === 'about' && inside(x, y, TARGETS.logging)) return { act: 'logging' };
    if (screen.app === 'notes' && inside(x, y, TARGETS.thread)) return { to: THREADS.phone.to };
    return { swallow: true };
}

// ---------------------------------------------------------------------------
// The log's day: seeded, the same on every load. NOT real data.
// ---------------------------------------------------------------------------

/** [minute of day, spread (min), pickups]: an early night check, the morning, work, lunch, the evening. */
const DAY_SHAPE = Object.freeze([
    [35, 10, 1], [7 * 60 + 10, 35, 6], [9 * 60 + 45, 55, 5], [12 * 60 + 45, 30, 4],
    [15 * 60 + 10, 60, 4], [18 * 60 + 35, 45, 5], [20 * 60 + 50, 50, 5], [23 * 60 + 5, 18, 1]
]);

/** { pickups: minutes[], opens: minutes[] } for an illustrative day (31 pickups). */
export function illustrativeDay(seed = 'bench-phone-log') {
    const r = rng(seed);
    const pickups = [];
    const opens = [];
    for (const [at, spread, count] of DAY_SHAPE) {
        for (let i = 0; i < count; i += 1) {
            const minute = Math.round(Math.min(1439, Math.max(0, at + r.signed(spread))));
            pickups.push(minute);
            const apps = r() < 0.25 ? 0 : r() < 0.7 ? 1 : 2;
            for (let k = 0; k < apps; k += 1) opens.push(Math.min(1439, minute + r.int(0, 4)));
        }
    }
    pickups.sort((a, b) => a - b);
    opens.sort((a, b) => a - b);
    return Object.freeze({ pickups: Object.freeze(pickups), opens: Object.freeze(opens) });
}

const DAY = illustrativeDay();

const minuteOf = (date) => date.getHours() * 60 + date.getMinutes();

/** The day so far, at `date`: what the log draws and counts. */
export function daySoFar(date) {
    const now = minuteOf(date);
    return {
        now,
        pickups: DAY.pickups.filter((m) => m <= now),
        opens: DAY.opens.filter((m) => m <= now)
    };
}

/** When held notifications come through next: 6pm, or (from 6pm) 9am. */
export function heldUntil(date) {
    return date.getHours() < 18 ? '6pm' : '9am';
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function roundRect(g, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + rr, y);
    g.arcTo(x + w, y, x + w, y + h, rr);
    g.arcTo(x + w, y + h, x, y + h, rr);
    g.arcTo(x, y + h, x, y, rr);
    g.arcTo(x, y, x + w, y, rr);
    g.closePath();
}

function text(art, g, value, options) {
    return art.draw.text(g, value, { face: 'inter', weight: 400, lineHeight: 1.3, color: INK.text, ...options });
}

/** The small line at the top: the time at the left, the punch-hole, a battery at the right. */
function statusLine(g, date, art) {
    const clock = phoneClock(date);
    g.save();
    g.font = art.fonts.font({ face: 'inter', size: TYPE.status, weight: 500 });
    g.fillStyle = INK.dim;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(clock.time, MARGIN, 4.7);
    g.fillStyle = '#0b0b0c';
    g.beginPath(); g.arc(W / 2, 4.5, 1.9, 0, Math.PI * 2); g.fill();
    // Battery: an outline, three-quarters full.
    const bx = RIGHT - 5.4;
    g.strokeStyle = INK.dim;
    g.lineWidth = 0.25;
    g.strokeRect(bx, 3.5, 4.6, 2.4);
    g.fillStyle = INK.dim;
    g.fillRect(bx + 4.6, 4.2, 0.45, 1.0);
    g.fillRect(bx + 0.5, 4.0, 3.6 * 0.75, 1.4);
    g.restore();
}

/** An app's title, drawn as its back control: a chevron, then the name. */
function title(g, label, art) {
    const mid = TITLE_Y + TYPE.title * 0.56;
    g.save();
    g.strokeStyle = INK.text;
    g.lineWidth = 0.55;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(MARGIN + 1.9, mid - 1.9);
    g.lineTo(MARGIN, mid);
    g.lineTo(MARGIN + 1.9, mid + 1.9);
    g.stroke();
    g.restore();
    text(art, g, label, { x: MARGIN + 4.2, y: TITLE_Y, size: TYPE.title, color: INK.text, lineHeight: 1.2 });
}

function gestureBar(g) {
    const b = GESTURE.bar;
    g.fillStyle = '#9a9a9a';
    roundRect(g, b.x, b.y, b.w, b.h, b.h / 2);
    g.fill();
}

function drawLauncher(g, screen, art) {
    const clock = phoneClock(screen.date);
    text(art, g, clock.date, { x: MARGIN, y: 16, size: TYPE.small, color: INK.faint });
    for (const row of LAUNCHER.rows) {
        text(art, g, OS.apps[row.app], { x: MARGIN, y: row.textY, size: TYPE.row, color: INK.text, lineHeight: 1.2 });
    }
}

function drawLog(g, screen, art) {
    const L = OS.log;
    title(g, OS.apps.log, art);
    text(art, g, L.heading, { x: MARGIN, y: 19, size: TYPE.body, color: INK.bright, maxWidth: TEXT_W, maxLines: 2 });
    const T = TIMELINE;
    const day = daySoFar(screen.date);
    const yOf = (minute) => T.top + ((T.bottom - T.top) * minute) / 1440;
    // Column heads.
    g.save();
    g.font = art.fonts.font({ face: 'inter', size: 2.6, weight: 500 });
    g.fillStyle = INK.faint;
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    g.fillText(L.pickups, T.pickX[0], T.top - 1.6);
    g.fillText('apps', T.openX[0], T.top - 1.6);
    // The axis, the six-hour rules and their labels.
    g.strokeStyle = INK.rule;
    g.lineWidth = 0.2;
    g.textBaseline = 'middle';
    for (let hour = 0; hour <= 24; hour += 6) {
        const y = yOf(hour * 60);
        g.beginPath(); g.moveTo(T.axisX, y); g.lineTo(RIGHT, y); g.stroke();
        g.fillText(String(hour).padStart(2, '0'), MARGIN - 1.2, y);
    }
    g.strokeStyle = '#3a3a3a';
    g.lineWidth = 0.25;
    g.beginPath(); g.moveTo(T.axisX, T.top); g.lineTo(T.axisX, T.bottom); g.stroke();
    // The ticks: one thin line per pickup, a shorter one per app opened.
    g.lineCap = 'butt';
    g.strokeStyle = '#cfcfcf';
    g.lineWidth = 0.24;
    for (const m of day.pickups) {
        const y = yOf(m);
        g.beginPath(); g.moveTo(T.pickX[0], y); g.lineTo(T.pickX[1], y); g.stroke();
    }
    g.strokeStyle = '#8a8a8a';
    g.lineWidth = 0.2;
    for (const m of day.opens) {
        const y = yOf(m);
        g.beginPath(); g.moveTo(T.openX[0], y); g.lineTo(T.openX[1], y); g.stroke();
    }
    // Now.
    const ny = yOf(day.now);
    g.strokeStyle = INK.calm;
    g.lineWidth = 0.22;
    g.setLineDash?.([0.9, 0.7]);
    g.beginPath(); g.moveTo(T.axisX - 1.2, ny); g.lineTo(RIGHT - 5, ny); g.stroke();
    g.setLineDash?.([]);
    g.fillStyle = INK.calm;
    g.textAlign = 'right';
    g.fillText(L.now, RIGHT, ny);
    g.restore();
    // The totals, and what this is.
    const total = text(art, g, L.total(day.pickups.length), { x: MARGIN, y: 108, size: 4.6, color: INK.bright });
    text(art, g, L.opened(day.opens.length), { x: MARGIN, y: total.bottom + 0.4, size: TYPE.small, color: INK.dim });
    const chip = { x: MARGIN, y: 123, h: 5.4 };
    g.save();
    g.font = art.fonts.font({ face: 'inter', size: TYPE.small, weight: 500 });
    chip.w = g.measureText(L.illustrative).width + 4.4;
    g.strokeStyle = '#4a4a4a';
    g.lineWidth = 0.25;
    roundRect(g, chip.x, chip.y, chip.w, chip.h, chip.h / 2);
    g.stroke();
    g.fillStyle = INK.dim;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(L.illustrative, chip.x + 2.2, chip.y + chip.h / 2 + 0.1);
    g.restore();
    return { pickups: day.pickups.length, opens: day.opens.length };
}

function drawAssistant(g, screen, art) {
    const A = OS.assistant;
    title(g, OS.apps.assistant, art);
    const lead = text(art, g, A.heldUntil(heldUntil(screen.date)), { x: MARGIN, y: 19, size: TYPE.lead, color: INK.bright, maxWidth: TEXT_W, maxLines: 2, lineHeight: 1.15 });
    text(art, g, A.calm, { x: MARGIN, y: lead.bottom + 1, size: TYPE.body, color: INK.calm });
    // The held sources (counts), or, let through, what each was holding.
    const top = 38;
    const pitch = 8.8;
    A.sources.forEach((source, i) => {
        const y = top + i * pitch;
        if (screen.revealed) {
            text(art, g, source.name, { x: MARGIN, y: y - 0.6, size: 3.4, color: INK.bright, lineHeight: 1.15 });
            text(art, g, source.detail, { x: MARGIN, y: y + 3.4, size: 3.0, color: INK.dim, lineHeight: 1.15, maxWidth: TEXT_W, maxLines: 1 });
        } else {
            text(art, g, source.name, { x: MARGIN, y: y + 1.2, size: TYPE.body, color: INK.text, lineHeight: 1.2 });
            text(art, g, String(source.count), { x: RIGHT, y: y + 1.2, size: TYPE.body, color: INK.dim, lineHeight: 1.2, align: 'right' });
        }
        g.fillStyle = INK.rule;
        g.fillRect(MARGIN, y + pitch - 0.9, TEXT_W, 0.18);
    });
    // One quiet button.
    const b = TARGETS.release;
    g.save();
    g.strokeStyle = '#5c5c5c';
    g.lineWidth = 0.28;
    roundRect(g, b.x, b.y, b.w, b.h, b.h / 2);
    g.stroke();
    g.restore();
    text(art, g, screen.revealed ? A.hold : A.release, {
        x: b.x + b.w / 2, y: b.y + (b.h - TYPE.body * 1.2) / 2, size: TYPE.body, color: INK.text, lineHeight: 1.2, align: 'center'
    });
    // Shae's line, set off by a thin rule.
    const quoteTop = 91;
    const quote = text(art, g, PHONE_NOTE_TEXT, { x: MARGIN + 2.4, y: quoteTop, size: 3.5, color: '#b4b4b4', maxWidth: TEXT_W - 2.4, maxLines: 5, lineHeight: 1.36 });
    g.fillStyle = '#3c3c3c';
    g.fillRect(MARGIN, quoteTop + 0.6, 0.4, quote.height - 1.2);
    text(art, g, A.sketch, { x: MARGIN, y: Math.max(quote.bottom + 3, 118), size: 3.0, color: INK.faint, maxWidth: TEXT_W, maxLines: 2, lineHeight: 1.3 });
}

function drawCamera(g, screen, art) {
    const v = VIEWFINDER;
    title(g, OS.apps.camera, art);
    if (screen.camera === 'gallery') {
        text(art, g, OS.camera.roll, { x: RIGHT, y: TITLE_Y + 1.4, size: 2.9, color: INK.faint, lineHeight: 1.2, align: 'right' });
        const gap = 1.2;
        const each = (v.h - gap * 2) / 3;
        (screen.photos ?? [null, null, null]).slice(0, 3).forEach((image, i) => {
            const y = v.y + i * (each + gap);
            g.fillStyle = '#111112';
            g.fillRect(v.x, y, v.w, each);
            if (image) {
                try {
                    art.draw.imageCover(g, image, v.x, y, v.w, each, { focusY: ROLL_FOCUS_Y[i] ?? 0.5 });
                } catch { /* leave the frame dark */ }
            }
        });
    } else {
        // The live viewfinder is a mesh laid exactly over this rect (phone.js).
        g.fillStyle = '#0a0a0b';
        g.fillRect(v.x, v.y, v.w, v.h);
    }
    // The shutter: a ring (it doesn't take pictures).
    g.save();
    g.strokeStyle = '#cfcfcf';
    g.lineWidth = 0.5;
    g.beginPath(); g.arc(SHUTTER.x, SHUTTER.y, SHUTTER.r, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#2a2a2a';
    g.beginPath(); g.arc(SHUTTER.x, SHUTTER.y, SHUTTER.r - 1.1, 0, Math.PI * 2); g.fill();
    g.restore();
}

function drawNotes(g, screen, art) {
    title(g, OS.apps.notes, art);
    text(art, g, PHONE_NOTE_TEXT, { x: MARGIN, y: 20, size: 4.4, color: INK.bright, maxWidth: TEXT_W, maxLines: 7, lineHeight: 1.36 });
    g.fillStyle = INK.rule;
    g.fillRect(MARGIN, TARGETS.thread.y - 3, TEXT_W, 0.2);
    const line = text(art, g, THREADS.phone.line, { x: MARGIN, y: TARGETS.thread.y + 2, size: 3.8, color: INK.dim, maxWidth: TEXT_W, maxLines: 5, lineHeight: 1.34 });
    const link = text(art, g, `→ ${THREADS.phone.label}`, { x: MARGIN, y: line.bottom + 2, size: 4.4, color: INK.bright, lineHeight: 1.2 });
    g.fillStyle = '#8a8a8a';
    g.fillRect(MARGIN + 5.6, link.bottom - 0.9, link.width - 5.6, 0.22);
    return { linkBottom: link.bottom };
}

function drawAbout(g, screen, art) {
    const A = OS.about;
    title(g, OS.apps.about, art);
    const name = text(art, g, A.name, { x: MARGIN, y: 20, size: 4.6, color: INK.bright, maxWidth: TEXT_W, maxLines: 2, lineHeight: 1.25 });
    text(art, g, A.line, { x: MARGIN, y: name.bottom + 2, size: TYPE.body, color: INK.dim, maxWidth: TEXT_W, maxLines: 3, lineHeight: 1.34 });
    const on = screen.logging !== false;
    const row = TARGETS.logging;
    g.fillStyle = INK.rule;
    g.fillRect(MARGIN, row.y, TEXT_W, 0.2);
    g.fillRect(MARGIN, row.y + row.h, TEXT_W, 0.2);
    text(art, g, A.logging(on), { x: MARGIN, y: row.y + (row.h - TYPE.body * 1.2) / 2, size: TYPE.body, color: INK.text, lineHeight: 1.2 });
    // The switch.
    const sw = { w: 8.4, h: 4.6 };
    const sx = RIGHT - sw.w;
    const sy = row.y + (row.h - sw.h) / 2;
    g.save();
    roundRect(g, sx, sy, sw.w, sw.h, sw.h / 2);
    if (on) {
        g.fillStyle = '#cfcfcf';
        g.fill();
    } else {
        g.strokeStyle = '#5c5c5c';
        g.lineWidth = 0.3;
        g.stroke();
    }
    g.fillStyle = on ? '#000000' : '#8a8a8a';
    g.beginPath();
    g.arc(on ? sx + sw.w - sw.h / 2 : sx + sw.h / 2, sy + sw.h / 2, sw.h / 2 - 0.7, 0, Math.PI * 2);
    g.fill();
    g.restore();
    // Shae's line, as the old home screen had it.
    text(art, g, PHONE_SCREEN_LINE, { x: MARGIN, y: row.y + row.h + 6, size: 3.2, color: INK.faint, maxWidth: TEXT_W, maxLines: 4, lineHeight: 1.36 });
}

const APP_PAINTERS = { log: drawLog, assistant: drawAssistant, camera: drawCamera, notes: drawNotes, about: drawAbout };

/**
 * Paints an unlocked screen's CONTENT (no glass) — the launcher or an app —
 * over black. `screen.date` is the clock. `art` is { fonts, draw }.
 */
export function drawOsScreen(g, w, h, screen, art) {
    g.fillStyle = INK.bg;
    g.fillRect(0, 0, w, h);
    statusLine(g, screen.date, art);
    if (screen.kind === 'launcher') {
        drawLauncher(g, screen, art);
        return { kind: 'launcher' };
    }
    const painter = APP_PAINTERS[screen.app];
    const info = painter ? painter(g, screen, art) : null;
    gestureBar(g);
    return { kind: 'app', app: screen.app, ...info };
}
