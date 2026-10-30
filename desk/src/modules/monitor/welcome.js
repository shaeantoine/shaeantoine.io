/**
 * MONITOR v9 — "Hello": the home app's one tall page (Shae: "a simple initial
 * page which says 'Click me!' and maybe an animation … then the user can
 * scroll down and get a bit of an explanation for the site and then scroll
 * some more to see the navigation"). Three parts, each exactly one window
 * high, generous whitespace on purpose:
 *
 *   1. hello      the photo (Shae with a takeaway coffee) and "Click me!" —
 *                 what the room sees on the monitor every visit. Set as type,
 *                 the page's serif, large, with a red marker underline: no
 *                 button, no red dot, no steam (Shae, on v9's first cut: "we
 *                 shouldn't start the site with an ugly black button"; the
 *                 steam off the cup was "a weird detail"). The one motion is
 *                 the underline: now and then it fades and draws itself in
 *                 again. The photo is a click target too ("me"). Up close, a
 *                 "scroll ↓" cue under it.
 *   2. about      Shae's own words (v9.2, verbatim: copy.js WELCOME.about) —
 *                 what the site is, that it is a model of the real desk, to
 *                 click around and be curious, and that the map is on the
 *                 next page — set as a short letter in the page's serif; at
 *                 its foot the same small "scroll ↓" as part 1's, on to the map.
 *   3. map        map.js: the drawing of the desk with its six labels, and
 *                 "Short on time?".
 *
 * DOM-free and three-free, like map.js: PAGE is every number (page px: x
 * across the window, y down from the top of the page; the window shows
 * [scroll, scroll + viewH] of it under its title bar), the painters take a 2D
 * context. windows.js paints the page once into one tall canvas and scrolls
 * it by texture offset; what moves or lights up is a LAYER — a small canvas
 * of its own over the page, at a page rect, clipped to the window by its
 * plane's size and its texture's offset/repeat (never a repaint): the map's
 * live drawing (hover), "Click me!" (red under the pointer), its underline
 * (the animation), the scroll cue (the room ⇄ up close crossfade) and the
 * scrollbar.
 */

import { WINDOW_TITLE_H } from './desktop.js';
import { WELCOME } from './copy.js';
import {
    MAP_COLORS as C, text, measure, countLines, paper, rr, paintMapPart, mapHit, mapLiveText, spoken
} from './map.js';

/** The photo: src/media/shae_casual.jpg, a 3:4 crop (720 x 960) of shae_casual.JPG (900 x 1600: x 0…720, y 480…1440). */
export const PHOTO = Object.freeze({
    file: 'shae_casual.jpg',
    aspect: 3 / 4
});

/**
 * The animation: the underline under "Click me!" (≤ 12 fps, ctx.every; paused
 * after idleMs without the pointer moving). One cycle: held (holdMs), faded
 * out (fadeMs), a beat with none, drawn in left to right (drawMs). Its still
 * frame — ?still=1, reduced motion, paused — is the underline drawn.
 */
export const HELLO = Object.freeze({
    frameMs: 90,
    idleMs: 10000,
    periodMs: 4200,
    drawMs: 800,
    holdMs: 2400,
    fadeMs: 600
});

export const SECTIONS = Object.freeze(['hello', 'about', 'map']);

const SCROLLBAR = Object.freeze({ w: 8, inset: 4, margin: 7 });

function pageLayout({ W, viewH, photo, words, underline, cue, about, map }) {
    const s = (i) => i * viewH;
    const trackH = viewH - SCROLLBAR.margin * 2;
    const thumbH = Math.round(trackH * (viewH / (viewH * SECTIONS.length)));
    const lineH = words.size * 1.2;
    return Object.freeze({
        W,
        viewTop: WINDOW_TITLE_H,
        viewH,
        pageH: viewH * SECTIONS.length,
        sectionTop: s,
        photo: Object.freeze(photo),
        // "Click me!": centred on cx, its line box from y (lh 1.2); its layer a little larger all round.
        words: Object.freeze({ ...words, lineH }),
        wordsLayer: Object.freeze({ x: words.cx - words.layerW / 2, y: words.y - 10, w: words.layerW, h: Math.round(lineH + 20) }),
        underline: Object.freeze(underline),
        cue: Object.freeze(cue),
        about: Object.freeze({ ...about, top: s(1) }),
        map: Object.freeze({
            ...map,
            kickerY: s(2) + map.kickerY,
            plan: Object.freeze({ ...map.plan, y: s(2) + map.plan.y }),
            live: Object.freeze({ ...map.live, y: s(2) + map.plan.y + map.live.dy }),
            shortY: s(2) + map.shortY,
            w: W
        }),
        // The scrollbar, in VIEW px (y from the top of the window's body): fixed, not on the page.
        bar: Object.freeze({ x: W - SCROLLBAR.inset - SCROLLBAR.w, y: SCROLLBAR.margin, w: SCROLLBAR.w, h: thumbH, track: trackH - thumbH })
    });
}

/**
 * The page, per window layout (desktop.js MAP_WINDOWS: landscape 1260 x 770,
 * portrait 520 x 834; the body under the 44 px title bar is one part high).
 * "Click me!" is Charis bold: 485 px wide at 112 px, 363 at 84; each
 * underline runs just inside the words, ~28 px under the baseline.
 *
 * Part 2 (`about`, v9.2) is a letter: a column (x, w), its type size,
 * leading (lh) and the space between paragraphs (gap, em), and how far above
 * the part's middle the block sits (lift). The column is centred on its
 * widest line, so the margins either side of the type match (measured off
 * the ink: landscape 191 | 192, the phone 32 | 34). Set in Charter's widths
 * (Charis SIL's): landscape 32 px in 880 — 58–64 characters a full line, 8
 * lines, 18.7 CSS px up close at 1440x900 (22.5 at 1920x1080) —, the phone
 * 23 px in 468 — 39–46, 11 lines, 15.8 CSS px. Landscape needs no help: every
 * paragraph keeps its line count and ends on a line at least 72% of the
 * measure across ±2% of those widths (the margin for a face that kerns a
 * little differently). On the phone "…You might find" fits its line with
 * 0.7 px to spare, which would leave paragraph 2 ending on "and be curious!"
 * (a third of the measure), so map.js's stub guard (`pretty`) sets it again
 * 2% narrower ("… You might / find …", ending "around and be curious!"); with
 * the guard, the phone's paragraphs end on lines at least 49% of the measure
 * across the same ±2%. The cue at its foot is part 1's, at the same place in
 * the part.
 */
export const PAGE = Object.freeze({
    landscape: pageLayout({
        W: 1260,
        viewH: 726,
        photo: { x: 128, y: 62, w: 450, h: 600 },
        words: { cx: 918, y: 290, size: 112, layerW: 600 },
        underline: { x: 682, y: 408, w: 472, h: 30 },
        cue: { x: 570, y: 650, w: 120, h: 64 },
        about: { x: 190, w: 880, size: 32, lh: 1.45, gap: 0.8, lift: 24 },
        // The map's part (y from the part's top): v8's drawing with room round it, nudged right for the wider left labels.
        map: { kickerY: 56, plan: { x: 280, y: 132, w: 742, h: 334 }, live: { x: 36, dy: -7, w: 1188, h: 348 }, shortY: 548 }
    }),
    portrait: pageLayout({
        W: 520,
        viewH: 790,
        photo: { x: 86, y: 54, w: 348, h: 464 },
        words: { cx: 260, y: 548, size: 84, layerW: 460 },
        underline: { x: 84, y: 637, w: 352, h: 26 },
        cue: { x: 200, y: 712, w: 120, h: 64 },
        about: { x: 32, w: 468, size: 23, lh: 1.45, gap: 0.8, lift: 30 },
        map: { kickerY: 56, plan: { x: 22, y: 184, w: 476, h: 214 }, live: { x: 14, dy: -63.35, w: 492, h: 352 }, shortY: 532 }
    })
});

export function pageOf(variant) {
    return PAGE[variant] ?? PAGE.landscape;
}

// ---------------------------------------------------------------------------
// The page (painted once; again when the fonts or the photo land)
// ---------------------------------------------------------------------------

/** A soft shadow under a rounded rect: rings of low alpha stepping out (no canvas blur, so any context can do it). */
function softShadow(g, r, radius, { spread = 22, drop = 8, alpha = 0.05 } = {}) {
    for (let i = 8; i >= 1; i -= 1) {
        const k = (i / 8) * spread;
        g.fillStyle = `rgba(60, 40, 20, ${alpha * (1 - i / 9)})`;
        rr(g, r.x - k, r.y - k + drop, r.w + k * 2, r.h + k * 2, radius + k);
        g.fill();
    }
}

function paintPhoto(g, r, photo) {
    softShadow(g, r, 18, { spread: 26, drop: 12, alpha: 0.06 });
    g.save();
    rr(g, r.x, r.y, r.w, r.h, 18);
    g.clip();
    if (photo) {
        // cover-fit the crop into the rect (it is the rect's aspect already)
        const k = Math.max(r.w / photo.width, r.h / photo.height);
        const w = photo.width * k;
        const h = photo.height * k;
        g.drawImage(photo, r.x + (r.w - w) / 2, r.y + (r.h - h) / 2, w, h);
    } else {
        // Still loading (or missing): a warm blank, the photo's own tones, never a broken image.
        g.fillStyle = '#b9a58a';
        g.fillRect(r.x, r.y, r.w, r.h);
    }
    g.restore();
    g.strokeStyle = 'rgba(42,38,35,0.12)';
    g.lineWidth = 1.5;
    rr(g, r.x + 0.75, r.y + 0.75, r.w - 1.5, r.h - 1.5, 18);
    g.stroke();
}

/** A drawn ↓ (Charter and the canvas fallbacks don't all have one). */
function downArrow(g, cx, y, size, color) {
    g.save();
    g.strokeStyle = color;
    g.lineWidth = Math.max(1.5, size * 0.11);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(cx, y);
    g.lineTo(cx, y + size);
    g.moveTo(cx - size * 0.34, y + size * 0.64);
    g.lineTo(cx, y + size);
    g.lineTo(cx + size * 0.34, y + size * 0.64);
    g.stroke();
    g.restore();
}

/**
 * Part 2: Shae's own words (copy.js WELCOME.about, verbatim), set as a short
 * letter — the page's serif, left-aligned in a column centred on its widest
 * line, the block centred in the part a little above its middle — and at its
 * foot part 1's small "scroll ↓", painted on the page: a click goes on to the
 * map. Returns its click target through `hits`.
 */
function paintAbout(g, P, { hits }) {
    const { x, w, size, lh, gap, lift, top } = P.about;
    const body = { f: 'serif', size, color: C.ink, lh, maxW: w, pretty: true };
    const { paragraphs } = WELCOME.about;
    // Measure the block, then centre it in the part, `lift` above the middle.
    const lines = paragraphs.reduce((n, s) => n + countLines(g, s, body, w), 0);
    const blockH = lines * size * lh + (paragraphs.length - 1) * gap * size;
    let y = top + Math.round((P.viewH - blockH) / 2) - lift;
    for (const s of paragraphs) y = text(g, s, { x, y, ...body }).bottom + gap * size;
    // The way on, at its foot: part 1's cue, at the same place in this part.
    const cue = { ...P.cue, y: top + P.cue.y };
    paintCue(g, P, { at: [cue.x, cue.y] });
    hits?.push({ kind: 'scroll', id: 'next', to: 2, rect: cue });
}

/**
 * The whole page (W x pageH, page px): paper, the photo, part 2, the map's
 * part. `layers`: which parts are layers of their own (windows.js), so not
 * painted here — { words, underline } (if a layer failed, that part is
 * painted on the page, still). Returns { hits } (page px).
 */
export function paintPage(g, { variant = 'landscape', offsets = null, photo = null, layers = { words: true, underline: true } } = {}) {
    const P = pageOf(variant);
    const hits = [];
    paper(g, 0, 0, P.W, P.pageH, 5);
    paintPhoto(g, P.photo, photo);
    if (!layers?.words) paintClickMe(g, P, { at: [P.words.cx, P.words.y] });
    if (!layers?.underline) paintUnderline(g, P.underline);
    // "Click me!" and its underline, the photo ("me") and the cue all go on to part 2.
    const tw = measure(g, WELCOME.clickMe, { f: 'serif', size: P.words.size, weight: 700 });
    const bottom = P.underline.y + P.underline.h;
    hits.push({ kind: 'scroll', id: 'clickme', to: 1, rect: { x: P.words.cx - tw / 2 - 20, y: P.words.y - 6, w: tw + 40, h: bottom - P.words.y + 12 } });
    hits.push({ kind: 'scroll', id: 'photo', to: 1, rect: { ...P.photo } });
    hits.push({ kind: 'scroll', id: 'cue', to: 1, rect: { ...P.cue } });
    paintAbout(g, P, { hits });
    paintMapPart(g, P.map, { variant, offsets, hits });
    return { hits };
}

// ---------------------------------------------------------------------------
// The layers (each its own small canvas; `g` is that canvas, layer px)
// ---------------------------------------------------------------------------

/** "Click me!", the page's serif, large; red under the pointer. `at`: the centre of its line box's top, in g's px. */
export function paintClickMe(g, P, { at = [P.words.cx - P.wordsLayer.x, P.words.y - P.wordsLayer.y], hot = false } = {}) {
    const [cx, y] = at;
    text(g, WELCOME.clickMe, { x: cx, y, f: 'serif', size: P.words.size, weight: 700, color: hot ? C.red : C.ink, align: 'center', lh: 1.2 });
}

/** The underline under "Click me!": one stroke of a red marker filling `r`, gently bowed and tapered at both ends. */
export function paintUnderline(g, r) {
    const n = 48;
    const top = [];
    const bot = [];
    const thick = r.h * 0.3;
    for (let i = 0; i <= n; i += 1) {
        const u = i / n;
        const x = r.x + 4 + (r.w - 8) * u;
        const y = r.y + r.h / 2 + 3 - Math.sin(u * Math.PI) * r.h * 0.18 + (u - 0.5) * r.h * 0.12;
        const half = (thick / 2) * Math.pow(Math.sin(Math.PI * (0.03 + u * 0.94)), 0.55);
        top.push([x, y - half]);
        bot.push([x, y + half]);
    }
    g.save();
    g.beginPath();
    top.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    for (let i = bot.length - 1; i >= 0; i -= 1) g.lineTo(bot[i][0], bot[i][1]);
    g.closePath();
    g.fillStyle = C.red;
    g.fill();
    g.restore();
}

/**
 * The scroll cue — "scroll" and a drawn ↓ — in a P.cue-sized box whose top
 * left is `at` (g's px): part 1's own layer (up close only: at its origin),
 * and painted on the page at the foot of part 2.
 */
export function paintCue(g, P, { at = [0, 0] } = {}) {
    const { w } = P.cue;
    const [x, y] = at;
    const size = 18;
    text(g, WELCOME.scroll, { x: x + w / 2, y: y + 4, f: 'sans', size, weight: 500, color: C.ink3, align: 'center', lh: 1.3 });
    downArrow(g, x + w / 2, y + 4 + size * 1.3 + 4, size * 1.05, C.ink3);
}

/** The scrollbar's thumb, macOS's overlay kind: a dark translucent capsule. */
export function paintThumb(g, P) {
    const { w, h } = P.bar;
    g.fillStyle = 'rgba(42, 38, 35, 0.42)';
    rr(g, 0.5, 0.5, w - 1, h - 1, (w - 1) / 2);
    g.fill();
}

// ---------------------------------------------------------------------------
// The animation, as numbers: where the underline is at time t (ms)
// ---------------------------------------------------------------------------

/**
 * The underline's pose at `t` ms: how much of it is drawn, left to right
 * (`reveal`, 0…1), and its opacity. t = 0 is the start of the hold, so
 * starting (or waking) the animation never jumps from the still frame.
 * `still`: the held frame, the underline drawn.
 */
export function helloPose(t, { still = false } = {}) {
    if (still) return { underline: { reveal: 1, opacity: 1 } };
    const { periodMs, drawMs, holdMs, fadeMs } = HELLO;
    const p = (((t + drawMs) % periodMs) + periodMs) % periodMs;
    if (p < drawMs) return { underline: { reveal: 1 - Math.pow(1 - p / drawMs, 3), opacity: 1 } };
    if (p < drawMs + holdMs) return { underline: { reveal: 1, opacity: 1 } };
    const f = (p - drawMs - holdMs) / fadeMs;
    if (f < 1) return { underline: { reveal: 1, opacity: 1 - f } };
    return { underline: { reveal: 0, opacity: 0 } };
}

// ---------------------------------------------------------------------------
// Hits and words
// ---------------------------------------------------------------------------

/** What a page point is on (paintPage's hits, page px), or null: "Click me!", the photo, the cues ('scroll'), a map label or link. */
export function pageHit(hits, x, y) {
    if (!hits) return null;
    const inRect = (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    return hits.find((h) => h.kind === 'scroll' && inRect(h.rect)) ?? mapHit(hits.filter((h) => h.kind !== 'scroll'), x, y);
}

/** What part `i` says (ctx.live), in reading order; `all`: the whole page, on the first look. Part 2 is Shae's three paragraphs, as written. */
export function pageLiveText(i, { variant = 'landscape', all = false } = {}) {
    const parts = [
        `${WELCOME.photo} Beside it, underlined: “${WELCOME.clickMe}” Scroll down, or press the down arrow, for more.`,
        WELCOME.about.paragraphs.join(' '),
        mapLiveText({ variant })
    ];
    if (all) return spoken(`Hello, on the monitor: one page in three parts. ${parts.join(' ')}`);
    return spoken(parts[i] ?? parts[0]);
}
