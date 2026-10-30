/**
 * v4 canvases, drawn in MILLIMETRES of the real object: the scope's face and
 * its screen, the Pixel's lock screen (its OS's other screens: phoneos.js), the organiser's drawer fronts
 * and the slip in "next", and the two notes (the scope's sticky, the one under
 * the phone). Every handwritten line is typed in Shae Hand: the notes through
 * art.drawNote (fitted to their rect), the threads by drawThread's own layout.
 *
 * `art` is { palette, draw, fonts, rng, drawNote } (build.js artContext).
 */

import { SCOPE, TRACE, PHONE, DRAWER } from './layout.js';
import { THREADS, SCOPE_NOTE, PHONE_NOTE_TEXT, DRAWER_LABELS, NEXT_SLIP, READOUT } from './copy.js';

/** Each note's name: drawNote's label in its overflow warning — for a thread (drawThread), the seed of its hand. */
export const NOTE_IDS = Object.freeze({
    scope: 'bench.scope.sticky',
    phone: 'bench.phone.note',
    phoneThread: 'bench.thread.phone',
    tagThread: 'bench.thread.tag',
    slip: 'bench.drawer.slip',
    drawer: (slug) => `bench.drawer.${slug}`
});

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

// ---------------------------------------------------------------------------
// Threads (shared with the tag's back)
// ---------------------------------------------------------------------------

/** A hand-drawn arrow, left to right, from (x, y), `len` mm long. Returns its tip. */
export function drawArrow(g, x, y, len, { color, width = 0.4, rise = -0.5, head = 1.9, seed = 1 } = {}) {
    const wob = ((seed * 9301 + 49297) % 233280) / 233280 - 0.5;
    const x1 = x + len;
    const y1 = y + rise;
    g.save();
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.globalAlpha = 0.92;
    g.beginPath();
    g.moveTo(x, y + wob * 0.3);
    g.bezierCurveTo(x + len * 0.35, y - 0.7 + wob * 0.4, x + len * 0.7, y1 + 0.55, x1, y1);
    g.stroke();
    const a = Math.atan2(-0.55, len * 0.3);
    g.beginPath();
    g.moveTo(x1 - head * Math.cos(a - 0.5), y1 - head * Math.sin(a - 0.5));
    g.lineTo(x1, y1);
    g.lineTo(x1 - head * Math.cos(a + 0.55), y1 - head * Math.sin(a + 0.55));
    g.stroke();
    g.restore();
    return { x1, y1 };
}

/**
 * One thread note, typed in Shae Hand: the sentence, then on its own row a
 * drawn arrow and where it goes. The whole rect is the link. `id` seeds the
 * hand and the arrow's wobble. Returns { overflow }: whether the sentence
 * failed to fit its share of the rect even at the smallest size.
 */
export function drawThread(g, rect, { id, thread, sizeMax }, art) {
    const { palette, draw } = art;
    const lineBox = { w: rect.w, h: rect.h * 0.68 };
    const fit = draw.fitHandwriting(g, thread.line, { maxWidth: lineBox.w, maxHeight: lineBox.h, sizeMax, sizeMin: 2.4, weight: 500 });
    draw.handwriting(g, thread.line, {
        x: rect.x, y: rect.y, maxWidth: rect.w, size: fit.size, lineHeight: fit.lineHeight,
        color: palette.ink, seed: `${id}-line`, slant: -0.01
    });
    const size = Math.max(fit.size * 1.04, 2.6);
    const rowTop = Math.min(rect.y + fit.lines.length * fit.size * fit.lineHeight + size * 0.2, rect.y + rect.h - size * 1.1);
    const len = Math.min(12, rect.w * 0.22);
    const arrow = drawArrow(g, rect.x + 1, rowTop + size * 0.62, len, { color: palette.ink, width: Math.max(0.3, size * 0.075), head: size * 0.42, seed: id.length });
    draw.handwriting(g, thread.label, {
        x: arrow.x1 + size * 0.45, y: rowTop, maxWidth: rect.x + rect.w - arrow.x1 - size * 0.45, size,
        lineHeight: 1.06, color: palette.ink, seed: `${id}-to`, slant: -0.01
    });
    return { overflow: !fit.fits };
}

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

const PCB_BLUE = '#1f4f8f';
const SCOPE_SILK = '#e9eef5';

/** The scope's face (w × d mm): a blue PCB under clear acrylic, the screen's bezel, button silk. */
export function drawScopeFace(g, w, h, { draw, fonts, rng }) {
    g.fillStyle = PCB_BLUE;
    g.fillRect(0, 0, w, h);
    const r = rng('scope-pcb');
    g.strokeStyle = 'rgba(12, 40, 80, 0.5)';
    g.lineWidth = 0.25;
    for (let i = 0; i < 30; i += 1) {
        let x = r.range(60, w - 3);
        let y = r.range(3, h - 3);
        g.beginPath();
        g.moveTo(x, y);
        for (let s = 0; s < 3; s += 1) {
            if (s % 2 === 0) x += r.signed(8); else y += r.signed(6);
            g.lineTo(Math.min(w - 2, Math.max(60, x)), Math.min(h - 2, Math.max(2, y)));
        }
        g.stroke();
    }
    // Mounting holes and the acrylic's standoff screws.
    for (const [x, y] of [[3, 3], [w - 3, 3], [3, h - 3], [w - 3, h - 3]]) {
        g.fillStyle = '#c9ccd2';
        g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#6d727b';
        g.fillRect(x - 1, y - 0.15, 2, 0.3);
    }
    // The TFT module's black bezel.
    const b = SCOPE.bezel;
    g.fillStyle = '#0c0d10';
    roundRect(g, b.x, b.y, b.w, b.h, 1.2);
    g.fill();
    // Button and switch silk, generic.
    g.strokeStyle = SCOPE_SILK;
    g.lineWidth = 0.22;
    for (const [x, y] of SCOPE.buttons) {
        g.strokeRect(x - 3.6, y - 3.6, 7.2, 7.2);
    }
    const s = SCOPE.slide;
    g.strokeRect(s.x, s.y, s.w, s.h);
    g.fillStyle = SCOPE_SILK;
    g.font = fonts.font({ face: 'inter', size: 1.7, weight: 600 });
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.fillText('SEL', SCOPE.buttons[0][0], SCOPE.buttons[0][1] + 4.3);
    g.fillText('OK', SCOPE.buttons[1][0], SCOPE.buttons[1][1] + 4.3);
    g.fillText('AC · DC · GND', s.x + s.w / 2, s.y + s.h + 0.8);
    g.textAlign = 'left';
    g.fillText('CH1', SCOPE.bnc.x - 2.6, 1.2);
    draw.grain(g, w, h, { seed: 'scope-face', amount: 0.03 });
}

/**
 * The scope's 2.4" screen (48.96 × 36.72 mm): off (dark glass), or a scrolling
 * trace on a dotted grid with the classifier's readout at the bottom right.
 * `samples`: oldest → newest, screen half-heights. `readout`: left | right | none.
 */
export function drawScopeScreen(g, w, h, { on = false, samples = null, readout = 'none' } = {}, { fonts }) {
    if (!on) {
        g.fillStyle = '#07080a';
        g.fillRect(0, 0, w, h);
        return;
    }
    g.fillStyle = '#060b16';
    g.fillRect(0, 0, w, h);
    const top = 4.2;
    const plot = { x: 1.2, y: top, w: w - 2.4, h: h - top - 1.2 };
    // Grid: 8 × 6 divisions of dots, the centre lines a little brighter.
    g.fillStyle = 'rgba(96, 128, 178, 0.55)';
    for (let i = 0; i <= 8; i += 1) {
        for (let j = 0; j <= 30; j += 1) {
            const x = plot.x + (plot.w * i) / 8;
            const y = plot.y + (plot.h * j) / 30;
            g.fillRect(x - 0.1, y - 0.1, i === 4 ? 0.26 : 0.2, i === 4 ? 0.26 : 0.2);
        }
    }
    for (let j = 0; j <= 6; j += 1) {
        for (let i = 0; i <= 40; i += 1) {
            const x = plot.x + (plot.w * i) / 40;
            const y = plot.y + (plot.h * j) / 6;
            g.fillRect(x - 0.1, y - 0.1, j === 3 ? 0.26 : 0.2, j === 3 ? 0.26 : 0.2);
        }
    }
    // Status line.
    g.font = fonts.font({ face: 'inter', size: 2.1, weight: 600 });
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = '#ffd23c';
    g.fillText('CH1  AC', plot.x + 0.4, top / 2 + 0.2);
    g.textAlign = 'right';
    g.fillStyle = 'rgba(200, 214, 236, 0.85)';
    g.fillText(`${TRACE.seconds / 8 * 1000 | 0}ms`, plot.x + plot.w - 0.4, top / 2 + 0.2);
    // The trace.
    if (samples && samples.length > 1) {
        const mid = plot.y + plot.h / 2;
        const amp = plot.h / 2 * 0.92;
        const path = () => {
            g.beginPath();
            for (let i = 0; i < samples.length; i += 1) {
                const x = plot.x + (plot.w * i) / (samples.length - 1);
                const y = mid - samples[i] * amp;
                if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
            }
        };
        g.lineJoin = 'round';
        g.lineCap = 'round';
        g.strokeStyle = 'rgba(255, 210, 60, 0.22)';
        g.lineWidth = 0.9;
        path();
        g.stroke();
        g.strokeStyle = '#ffd84a';
        g.lineWidth = 0.34;
        path();
        g.stroke();
    }
    // The classifier's readout.
    const label = READOUT[readout] ?? READOUT.none;
    const box = { w: 13.5, h: 5.2 };
    const bx = plot.x + plot.w - box.w - 0.6;
    const by = plot.y + plot.h - box.h - 0.6;
    g.fillStyle = 'rgba(6, 11, 22, 0.86)';
    g.fillRect(bx, by, box.w, box.h);
    g.strokeStyle = readout === 'none' ? 'rgba(160, 176, 204, 0.6)' : 'rgba(120, 230, 170, 0.9)';
    g.lineWidth = 0.22;
    g.strokeRect(bx, by, box.w, box.h);
    g.textAlign = 'center';
    g.fillStyle = readout === 'none' ? 'rgba(190, 204, 226, 0.85)' : '#8ef0b8';
    g.font = fonts.font({ face: 'inter', size: 2.9, weight: 700 });
    g.fillText(label, bx + box.w / 2, by + box.h / 2 + 0.15);
}

/** The sticky on the scope (30 × 30 mm): the one line that says what the trace is. */
export function drawScopeNote(g, w, h, art) {
    const { palette, draw } = art;
    g.fillStyle = palette.stickyYellow;
    g.fillRect(0, 0, w, h);
    draw.grain(g, w, h, { seed: 'scope-note', amount: 0.05 });
    const rect = { x: 2.4, y: 2.6, w: w - 4.8, h: h - 5.2 };
    if (typeof art.drawNote === 'function') {
        return art.drawNote(g, { id: NOTE_IDS.scope, text: SCOPE_NOTE, ...rect, seed: 'scope-note', slant: -0.015 });
    }
    return null;
}

// ---------------------------------------------------------------------------
// The Pixel's screen
// ---------------------------------------------------------------------------

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "10:08" and "Tue, 12 Aug", as the photo's lock screen writes them, in the visitor's local time. */
export function phoneClock(date) {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return { time: `${hh}:${mm}`, date: `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}` };
}

function wallpaper(g, w, h, dim = 1) {
    const base = g.createLinearGradient(0, 0, w * 0.35, h);
    base.addColorStop(0, '#0a1430');
    base.addColorStop(0.42, '#1b4f8e');
    base.addColorStop(0.7, '#1d6aa8');
    base.addColorStop(1, '#0c1a36');
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    // The lighter diagonal band across the upper half.
    g.save();
    g.translate(w * 0.62, h * 0.2);
    g.rotate(-0.62);
    const band = g.createLinearGradient(0, -12, 0, 12);
    band.addColorStop(0, 'rgba(70, 150, 220, 0)');
    band.addColorStop(0.5, 'rgba(70, 150, 220, 0.42)');
    band.addColorStop(1, 'rgba(70, 150, 220, 0)');
    g.fillStyle = band;
    g.fillRect(-w, -12, w * 2.4, 24);
    g.restore();
    if (dim < 1) {
        g.fillStyle = `rgba(4, 8, 18, ${1 - dim})`;
        g.fillRect(0, 0, w, h);
    }
}

/** The status bar: the time at the left, the punch-hole camera, a battery at the right. */
function statusBar(g, w, clock, fonts) {
    g.fillStyle = '#e8ecf4';
    g.font = fonts.font({ face: 'inter', size: 2.5, weight: 600 });
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(clock.time, 4.2, 4.6);
    g.fillStyle = '#020305';
    g.beginPath(); g.arc(w / 2, 4.5, 1.9, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e8ecf4';
    g.fillRect(w - 6.4, 3.3, 2.1, 3.1);
    g.fillRect(w - 5.8, 2.9, 0.9, 0.4);
}

/**
 * The screen's faults, faithful to a photo of the real phone: two magenta lines down the left
 * edge (one bright, one faint), a green one down the right, a pink one across
 * the bottom.
 */
function faults(g, w, h) {
    const line = (x0, y0, x1, y1, color, width) => {
        g.strokeStyle = color;
        g.lineWidth = width;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
    };
    g.save();
    g.lineCap = 'butt';
    line(2.1, 1.5, 2.6, h - 5, '#ff3cf0', 0.42);
    line(3.5, 6, 4.0, h - 9, 'rgba(226, 70, 232, 0.7)', 0.24);
    line(w - 2.3, 2, w - 2.0, h - 6.5, '#3dffa6', 0.32);
    line(3, h - 5.6, w - 3.5, h - 6.4, '#ff66d6', 0.3);
    g.restore();
}

/** Rounded screen corners: outside them, the black of the glass. */
function screenMask(g, w, h) {
    g.save();
    g.fillStyle = '#030305';
    g.beginPath();
    // The outer rect wound against the rounded one, so the corners alone fill
    // under either fill rule (not every canvas honours 'evenodd'). The rounded
    // rect is traced here, not with roundRect(): that begins a new path, which
    // dropped the outer rect and blacked out the whole screen (v4's bug).
    g.moveTo(0, 0);
    g.lineTo(0, h);
    g.lineTo(w, h);
    g.lineTo(w, 0);
    g.closePath();
    const r = Math.min(PHONE.screen.r, w / 2, h / 2);
    g.moveTo(r, 0);
    g.arcTo(w, 0, w, h, r);
    g.arcTo(w, h, 0, h, r);
    g.arcTo(0, h, 0, 0, r);
    g.arcTo(0, 0, w, 0, r);
    g.closePath();
    g.fill('evenodd');
    g.restore();
}

/**
 * The glass itself, over whatever the screen shows: the faulty panel's lines
 * and the rounded corners. They belong to the panel, not the picture, so a
 * screen sliding in or out slides under them (phone.js draws this last).
 */
export function drawGlass(g, w, h) {
    faults(g, w, h);
    screenMask(g, w, h);
}

/** Off: black glass. Locked: wallpaper, big clock and date (+ the glass, unless `glass: false`). */
export function drawLockScreen(g, w, h, { on = false, date, glass = true }, { fonts }) {
    if (!on) {
        g.fillStyle = '#050507';
        g.fillRect(0, 0, w, h);
        return;
    }
    const clock = phoneClock(date);
    wallpaper(g, w, h, 0.92);
    statusBar(g, w, clock, fonts);
    g.fillStyle = '#ddd3f7';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.font = fonts.font({ face: 'inter', size: 15.5, weight: 400 });
    g.fillText(clock.time, w / 2, h * 0.37);
    g.font = fonts.font({ face: 'inter', size: 3.1, weight: 500 });
    g.fillStyle = '#e4dcf8';
    g.fillText(clock.date, w / 2, h * 0.37 + 6.2);
    // A small padlock above the bottom edge.
    g.strokeStyle = 'rgba(232, 236, 244, 0.85)';
    g.lineWidth = 0.4;
    const lx = w / 2;
    const ly = h - 16;
    g.strokeRect(lx - 2.2, ly, 4.4, 3.4);
    g.beginPath();
    g.arc(lx, ly, 1.5, Math.PI, 0);
    g.stroke();
    if (glass) drawGlass(g, w, h);
}

// The unlocked screens (launcher and apps) are phoneos.js's.

/**
 * The note under the phone (76 mm sticky): Shae's line at the top, then the
 * thread — the sentence, an arrow, "the board". Returns the thread's rect
 * (mm, canvas space) for the click.
 */
export const PHONE_NOTE_RECTS = Object.freeze({
    note: Object.freeze({ x: 5, y: 5, w: 66, h: 34 }),
    thread: Object.freeze({ x: 5, y: 43, w: 66, h: 28 })
});
export function drawPhoneNote(g, w, h, art) {
    const { palette, draw } = art;
    g.fillStyle = palette.stickyYellow;
    g.fillRect(0, 0, w, h);
    draw.grain(g, w, h, { seed: 'phone-note', amount: 0.05 });
    // The adhesive strip's faint sheen along the top.
    g.fillStyle = 'rgba(255, 255, 255, 0.07)';
    g.fillRect(0, 0, w, 14);
    const result = {};
    if (typeof art.drawNote === 'function') {
        result.note = art.drawNote(g, { id: NOTE_IDS.phone, text: PHONE_NOTE_TEXT, ...PHONE_NOTE_RECTS.note, valign: 'top', seed: 'phone-note', size: 6.6, slant: -0.01 });
    }
    result.thread = drawThread(g, PHONE_NOTE_RECTS.thread, { id: NOTE_IDS.phoneThread, thread: THREADS.phone, sizeMax: 5.6 }, art);
    return result;
}

// ---------------------------------------------------------------------------
// The organiser
// ---------------------------------------------------------------------------

export const DRAWER_FRONT = Object.freeze({ w: DRAWER.frontW, h: DRAWER.frontH });
const TAPE = '#e8dcc0';

/** A drawer front: pale plastic, a strip of masking tape, the label in Shae's hand. */
export function drawDrawerFront(g, w, h, slug, art) {
    const { draw } = art;
    g.fillStyle = '#e7e8e4';
    g.fillRect(0, 0, w, h);
    draw.grain(g, w, h, { seed: `drawer-${slug}`, amount: 0.025 });
    g.fillStyle = 'rgba(0, 0, 0, 0.06)';
    g.fillRect(0, h - 0.6, w, 0.6);
    const tape = { w: DRAWER.label.w, h: DRAWER.label.h };
    const tx = (w - tape.w) / 2 - 8;
    const ty = (h - tape.h) / 2 - 1.3;
    g.save();
    g.translate(tx + tape.w / 2, ty + tape.h / 2);
    g.rotate(slug === 'next' ? -0.02 : 0.008 * (slug.length % 3 - 1));
    g.fillStyle = TAPE;
    g.beginPath();
    // Torn ends.
    g.moveTo(-tape.w / 2, -tape.h / 2);
    g.lineTo(tape.w / 2, -tape.h / 2);
    for (let i = 0; i <= 6; i += 1) g.lineTo(tape.w / 2 + (i % 2 ? 0.5 : -0.1), -tape.h / 2 + (tape.h * i) / 6);
    g.lineTo(-tape.w / 2, tape.h / 2);
    for (let i = 6; i >= 0; i -= 1) g.lineTo(-tape.w / 2 + (i % 2 ? -0.5 : 0.1), -tape.h / 2 + (tape.h * i) / 6);
    g.closePath();
    g.fill();
    g.restore();
    const rect = { x: tx + 2, y: ty + 0.6, w: tape.w - 4, h: tape.h - 1.2 };
    if (typeof art.drawNote === 'function') {
        return art.drawNote(g, { id: NOTE_IDS.drawer(slug), text: DRAWER_LABELS[slug], ...rect, align: 'left', seed: `drawer-${slug}`, size: 6.4, slant: -0.01 });
    }
    return null;
}

/** The slip of paper in the "next" drawer: a question mark. */
export function drawSlip(g, w, h, art) {
    const { palette, draw } = art;
    g.fillStyle = palette.paper;
    g.fillRect(0, 0, w, h);
    draw.grain(g, w, h, { seed: 'slip', amount: 0.05 });
    if (typeof art.drawNote === 'function') {
        return art.drawNote(g, { id: NOTE_IDS.slip, text: NEXT_SLIP, x: 4, y: 2.5, w: w - 8, h: h - 5, align: 'center', seed: 'slip', size: 13 });
    }
    return null;
}
