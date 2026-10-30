/**
 * MONITOR v8/v9 — "A map of my desk": a large line drawing of the very desk
 * you are looking at, its six things labelled in plain words with leader
 * lines out to each, and "Short on time?". v9: it is the third part of the
 * home page (welcome.js lays out the page: hello, what this is, the map);
 * v8's bio, how-to strip and room button are gone from here (part 2 says it
 * in a few lines, part 1 is what the room sees). Every painter here works in
 * PAGE px (welcome.js PAGE: y from the top of the tall page), takes the box
 * it draws in, and pushes its click targets onto `hits` in page px.
 *
 *   - Every label, its leader and its drawn object are one click target; the
 *     one pointed at turns red (label, leader, object) and the other five dim.
 *   - A label is just its name ("My working life"); v8's italic glosses under
 *     the names are gone (Shae: "we don't need more than that").
 *   - On a phone (the portrait window) three labels sit above the drawing and
 *     three below.
 *
 * A port of the approved mockup's drawing code (the design panel's alt.mjs +
 * lib.mjs drawPlan, pins: false — scratch scripts, not kept; later mentions of
 * alt.mjs, lib.mjs or rec.mjs are provenance): the same coordinates, sizes and
 * colours. DOM-free and three-free: the painters
 * take a 2D context, so node can paint them.
 *
 * The drawn objects sit where the real ones are: the drawing was traced from
 * the 16:10 establishing shot, and each of the six is drawn moved by how far
 * its object has moved since (measureMapOffsets, off the modules' own layout),
 * its leader's end with it. At today's layout every offset is 0.
 *
 * Type: the serif is Charis SIL (FACES.charis), SIL's extension of Bitstream
 * Charter — the face the mockup was drawn in, with Charter's own outlines and
 * widths, so the mockup's line breaks hold. Charter has no ← →, so arrows are
 * set in Inter, segment by segment, as the mockup does. No handwriting face
 * anywhere on the page: the photo box's own label ("kept", Shae's hand on the
 * real box) is a drawing of it — the outline baked once from Shae Hand into
 * KEPT below, filled as a path.
 */

import { rr } from './apps.js';
import { MAP } from './copy.js';
import { FACES } from '../../core/fonts.js';

/** The paper and its inks (lib.mjs C, rec.mjs BAND / LINK), authored as the mockup was. */
export const MAP_COLORS = Object.freeze({
    paper: '#eee5d2',
    paperHi: '#f2ebde',
    ink: '#2a2623',
    ink2: '#5e564d',
    ink3: '#8a8073',
    rule: '#c4b9a6',
    tint: '#d6cbb8', // the desk top on the drawing
    tint2: '#cbbfaa',
    faint: '#ab9f8d',
    red: '#c8442e',
    link: '#a5402c', // the dot's red, darkened for small type on cream
    box: '#e3d9c5' // "Short on time?"
});
export { rr };
const C = MAP_COLORS;

const FAMILY = Object.freeze({ serif: FACES.charis, sans: FACES.inter });

/** The six labels (copy.js MAP.labels), in the landscape page's reading order. */
export const MAP_LABELS = MAP.labels;
const INDEX = Object.freeze(Object.fromEntries(MAP_LABELS.map((l, i) => [l.id, i])));

/** Reading order per layout, as indices into MAP_LABELS: ↑ ↓ step through it, ctx.live reads it. */
export const MAP_ORDER = Object.freeze({
    landscape: Object.freeze(['badge', 'bench', 'printer', 'screen', 'box', 'papers'].map((id) => INDEX[id])),
    portrait: Object.freeze(['badge', 'screen', 'box', 'bench', 'printer', 'papers'].map((id) => INDEX[id]))
});

/** Where each leader ends on the drawing (plan px): alt.mjs LABELS.at, and the phone's PA (the nearest edge of each thing). */
const LEADER_AT = Object.freeze({
    landscape: Object.freeze({ badge: [600, 640], bench: [440, 868], printer: [626, 960], screen: [1282, 640], box: [1654, 800], papers: [1660, 1030] }),
    portrait: Object.freeze({ badge: [600, 650], screen: [1000, 470], box: [1560, 726], bench: [460, 900], printer: [628, 1012], papers: [1640, 1066] })
});

// ---------------------------------------------------------------------------
// Type (lib.mjs text / measure): y is the top of the first line box; the
// baseline sits at the box's middle + 0.34 em, whatever the face's metrics.
// ---------------------------------------------------------------------------

const ARROWS = /[←→]/;

function setFont(g, { f = 'serif', size = 24, weight = 400, style = 'normal' }) {
    g.font = `${style} ${weight} ${size}px ${FAMILY[f] ?? f}`;
    if ('letterSpacing' in g) g.letterSpacing = '0px';
}

/**
 * `pretty` (v9.2, part 2's letter): a paragraph's last line is a "stub" if it
 * is one word alone, or shorter than `stub` of the measure. A stub is mended
 * by the narrowest-first search a typesetter does by hand — the paragraph set
 * again a step (`step`) narrower, down to `narrowest` of the measure, and the
 * first setting with as many lines and no stub is taken; failing that, the
 * last line takes the word before it (if that still fits). Line counts never
 * change, so a block measured by countLines is the block painted. In
 * Charter's widths it acts once on the home page — the phone's part 2,
 * paragraph 2 (welcome.js PAGE) — and otherwise only if the face measures
 * differently from the one the page was set in.
 */
const PRETTY = Object.freeze({ stub: 1 / 3, narrowest: 0.88, step: 0.01 });

/** Greedy lines of `words` no wider than maxW. */
function greedy(g, words, maxW) {
    const lines = [];
    let line = '';
    for (const word of words) {
        const t = line ? `${line} ${word}` : word;
        if (g.measureText(t).width > maxW && line) { lines.push(line); line = word; } else line = t;
    }
    lines.push(line);
    return lines;
}

/** A paragraph's greedy `lines` with its stub mended (PRETTY), or as they were. */
function mendStub(g, words, lines, maxW) {
    const fine = (ls) => ls.length < 2 || (ls[ls.length - 1].includes(' ') && g.measureText(ls[ls.length - 1]).width >= maxW * PRETTY.stub);
    if (fine(lines)) return lines;
    const steps = Math.round((1 - PRETTY.narrowest) / PRETTY.step);
    for (let i = 1; i <= steps; i += 1) {
        const narrower = greedy(g, words, maxW * (1 - i * PRETTY.step));
        if (narrower.length === lines.length && fine(narrower)) return narrower;
    }
    const before = lines[lines.length - 2].split(' ');
    const last = `${before[before.length - 1]} ${lines[lines.length - 1]}`;
    if (before.length > 1 && g.measureText(last).width <= maxW) return [...lines.slice(0, -2), before.slice(0, -1).join(' '), last];
    return lines;
}

/**
 * Lines of `s` no wider than maxW (greedy). `balance`: a paragraph that takes
 * two lines is broken where its two lines come out most even — a label reads
 * "Hardware / I’ve built", not "Hardware I’ve / built". `pretty`: no
 * paragraph ends on a stub (see PRETTY).
 */
function wrap(g, s, maxW, balance = false, pretty = false) {
    if (!Number.isFinite(maxW)) return s.split('\n');
    const out = [];
    for (const para of s.split('\n')) {
        const words = para.split(' ');
        const lines = greedy(g, words, maxW);
        if (pretty) {
            out.push(...mendStub(g, words, lines, maxW));
            continue;
        }
        if (balance && lines.length === 2) {
            let best = null;
            for (let i = 1; i < words.length; i += 1) {
                const a = words.slice(0, i).join(' ');
                const b = words.slice(i).join(' ');
                const widest = Math.max(g.measureText(a).width, g.measureText(b).width);
                if (widest <= maxW && (!best || widest < best.widest)) best = { a, b, widest };
            }
            if (best) { out.push(best.a, best.b); continue; }
        }
        out.push(...lines);
    }
    return out;
}

/** How many lines `s` wraps to at maxW (`pretty` never changes it). */
export function countLines(g, s, o, maxW) {
    g.save();
    setFont(g, o);
    const n = wrap(g, s, maxW).length;
    g.restore();
    return n;
}

/** Text, wrapped to maxW (`balance`, `pretty`: see wrap). Returns { bottom, width, lines }. */
export function text(g, s, { x = 0, y = 0, f = 'serif', size = 24, weight = 400, style = 'normal', color = C.ink, maxW = Infinity, lh = 1.35, align = 'left', track = 0, balance = false, pretty = false } = {}) {
    g.save();
    setFont(g, { f, size, weight, style });
    g.fillStyle = color;
    g.textBaseline = 'alphabetic';
    const lines = wrap(g, s, maxW, balance, pretty);
    const box = size * lh;
    let widest = 0;
    lines.forEach((ln, i) => {
        const base = y + i * box + box / 2 + size * 0.34;
        if (track) {
            const w = [...ln].reduce((a, ch) => a + g.measureText(ch).width + track, -track);
            let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
            g.textAlign = 'left';
            for (const ch of ln) { g.fillText(ch, cx, base); cx += g.measureText(ch).width + track; }
            widest = Math.max(widest, w);
        } else if (f !== 'sans' && ARROWS.test(ln)) {
            // The serif has no arrows: set them in Inter, the rest in the serif.
            const segs = ln.split(/([←→])/).filter(Boolean);
            const fs = g.font;
            const fa = `${style} ${Math.max(weight, 500)} ${size * 0.92}px ${FAMILY.sans}`;
            const wOf = (sg) => { g.font = ARROWS.test(sg) ? fa : fs; const m = g.measureText(sg).width; g.font = fs; return m; };
            const tw = segs.reduce((a, sg) => a + wOf(sg), 0);
            let cx = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
            g.textAlign = 'left';
            for (const sg of segs) { const m = wOf(sg); g.font = ARROWS.test(sg) ? fa : fs; g.fillText(sg, cx, base); g.font = fs; cx += m; }
            widest = Math.max(widest, tw);
        } else {
            g.textAlign = align;
            g.fillText(ln, x, base);
            widest = Math.max(widest, g.measureText(ln).width);
        }
    });
    g.restore();
    return { bottom: y + lines.length * box, width: widest, lines: lines.length };
}

export function measure(g, s, o = {}) {
    if ((o.f ?? 'serif') !== 'sans' && ARROWS.test(s)) {
        return s.split(/([←→])/).filter(Boolean).reduce((a, sg) => a + (ARROWS.test(sg)
            ? measure(g, sg, { ...o, f: 'sans', weight: Math.max(o.weight ?? 400, 500), size: (o.size ?? 24) * 0.92 })
            : measure(g, sg, o)), 0);
    }
    g.save();
    setFont(g, o);
    const w = g.measureText(s).width;
    g.restore();
    return w;
}

function poly(g, pts) {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
}

// ---------------------------------------------------------------------------
// Paper
// ---------------------------------------------------------------------------

const grainCache = new Map();
/** A faint paper grain (lib.mjs paperTexture, the same dots), drawn as two filled paths. */
export function paperTexture(g, x, y, w, h, seed = 5) {
    const key = `${x},${y},${w},${h},${seed}`;
    let dots = grainCache.get(key);
    if (!dots) {
        let s = seed;
        const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
        const light = [];
        const dark = [];
        for (let i = 0; i < (w * h) / 90; i += 1) {
            const list = rnd() > 0.5 ? light : dark;
            list.push(x + rnd() * w, y + rnd() * h);
        }
        dots = { light: Float32Array.from(light), dark: Float32Array.from(dark) };
        grainCache.set(key, dots);
    }
    g.save();
    for (const [list, color] of [[dots.light, 'rgba(255,255,255,0.05)'], [dots.dark, 'rgba(60,45,30,0.035)']]) {
        g.beginPath();
        for (let i = 0; i < list.length; i += 2) g.rect(list[i], list[i + 1], 1.4, 1.4);
        g.fillStyle = color;
        g.fill();
    }
    g.restore();
}

/** Paper and its grain over a rect (page px). */
export function paper(g, x, y, w, h, seed = 5) {
    g.fillStyle = C.paper;
    g.fillRect(x, y, w, h);
    paperTexture(g, x, y, w, h, seed);
}

// ---------------------------------------------------------------------------
// Small drawn things (rec.mjs). (v9.2: the drawn "← back" pill went with the
// line of part 2 that showed it.)
// ---------------------------------------------------------------------------

export function kicker(g, s, x, y, { size = 16, dot = false, color = C.ink2 } = {}) {
    if (dot) {
        g.fillStyle = C.red;
        g.beginPath();
        g.arc(x + 6, y + size * 0.62, 6, 0, Math.PI * 2);
        g.fill();
        x += 22;
    }
    return text(g, s, { x, y, f: 'sans', size, weight: 700, color, track: size * 0.2, lh: 1.25 });
}

/**
 * The photo box's label, "kept", as Shae wrote it on the real box: the
 * outline of the word in Shae Hand (the font's own outlines, kerned),
 * flattened and baked once into 1/1000 em, baseline at 0, y down — a drawing,
 * not type, so the page sets no handwriting face. Seven closed contours,
 * filled nonzero (the counters wind the other way).
 */
const KEPT = Object.freeze({
    width: 1918,
    contours: [
        '176 -14 162 -1 118 -18 81 -59 56 -134 51 -212 25 -239 51 -284 66 -369 48 -404 79 -507 77 -546 108 -814 117 -829 134 -836 149 -829 152 -798 113 -590 103 -499 108 -479 133 -465 249 -485 322 -483 340 -470 348 -440 342 -423 293 -381 213 -339 148 -293 133 -265 151 -258 203 -268 297 -271 388 -255 431 -217 477 -109 461 -98 441 -106 417 -134 391 -200 363 -217 241 -229 109 -210 95 -199 91 -158 114 -79 142 -33',
        '275 -431 240 -440 178 -435 120 -414 90 -381 101 -320 115 -315 132 -321 220 -387 254 -404',
        '582 -102 603 -84 658 -67 826 -58 894 -45 943 -49 955 -41 958 -25 913 3 786 -16 660 -12 580 -46 548 -72 513 -136 516 -168 531 -204 568 -254 619 -301 669 -327 699 -330 723 -321 746 -290 757 -250 753 -221 693 -150',
        '566 -173 621 -163 675 -185 716 -238 717 -277 692 -287 643 -267 574 -192',
        '1076 -159 1074 -121 1090 -10 1107 7 1109 19 1101 35 1081 42 1062 35 1047 17 1028 -83 1021 -249 990 -290 997 -321 1053 -353 1114 -367 1178 -369 1235 -351 1255 -320 1262 -291 1231 -227 1181 -175 1143 -150 1107 -146',
        '1087 -201 1105 -190 1127 -195 1175 -235 1203 -275 1206 -296 1199 -307 1151 -323 1072 -301 1069 -215',
        '1717 -10 1688 -1 1668 -13 1665 -88 1632 -191 1618 -209 1452 -224 1326 -221 1300 -232 1298 -251 1321 -266 1350 -271 1578 -267 1584 -279 1569 -307 1533 -342 1522 -363 1524 -378 1542 -387 1579 -370 1661 -266 1706 -258 1873 -254 1904 -245 1916 -226 1904 -213 1726 -208 1692 -193 1689 -181 1711 -139 1721 -70 1723 -21'
    ].map((s) => Object.freeze(s.split(' ').map(Number)))
});

/** "kept", centred on cx, its baseline at y, `size` px to the em, in `color`. */
function keptMark(g, cx, y, size, color) {
    const u = size / 1000;
    g.save();
    g.translate(cx - (KEPT.width * u) / 2, y);
    g.scale(u, u);
    g.beginPath();
    for (const c of KEPT.contours) {
        for (let i = 0; i < c.length; i += 2) (i ? g.lineTo(c[i], c[i + 1]) : g.moveTo(c[i], c[i + 1]));
        g.closePath();
    }
    g.fillStyle = color;
    g.fill();
    g.restore();
}

// ---------------------------------------------------------------------------
// The drawing of the desk (lib.mjs drawPlan, pins: false): traced from the
// 16:10 establishing shot, in that shot's px (PLAN_SRC). Each of the six is
// drawn moved by its offset (plan px), so it sits where its object really is.
// ---------------------------------------------------------------------------

export const PLAN_SRC = Object.freeze({ x0: 196, y0: 452, x1: 1806, y1: 1148 });

/** Each object's outline on the drawing (plan px, before its offset): its click target, as drawn. */
const OBJECT_SHAPES = Object.freeze({
    badge: [[574, 522], [626, 522], [626, 702], [574, 702]],
    bench: [[306, 834], [640, 796], [662, 882], [286, 928]],
    printer: [[566, 884], [674, 874], [686, 898], [686, 1014], [574, 1024], [572, 908]],
    screen: [[712, 460], [1288, 460], [1288, 782], [712, 782]],
    box: [[1436, 636], [1684, 636], [1684, 830], [1436, 830]],
    papers: [[1485, 905], [1656, 915], [1712, 1078], [1510, 1078]]
});
/** Which outline wins where two overlap: the one drawn on top. */
const OBJECT_PRIORITY = Object.freeze(['badge', 'printer', 'bench', 'papers', 'box', 'screen']);

function planTransform(box) {
    const S = PLAN_SRC;
    const k = Math.min(box.w / (S.x1 - S.x0), box.h / (S.y1 - S.y0));
    const ox = box.x + (box.w - (S.x1 - S.x0) * k) / 2 - S.x0 * k;
    const oy = box.y + (box.h - (S.y1 - S.y0) * k) / 2 - S.y0 * k;
    return { k, P: (x, y) => [ox + x * k, oy + y * k] };
}

/**
 * The drawing in `box` (window px), `hl` (an object id) lit red. `offsets`:
 * id → [dx, dy] plan px. Returns { k, P, at(id, x, y), outline(id) } —
 * `at` places a plan point on object `id` (its offset applied), `outline`
 * is its click outline in window px.
 */
function drawPlan(g, box, { hl = null, pinR = 15, pinSize = 17, offsets = null } = {}) {
    const { k, P } = planTransform(box);
    const offOf = (id) => offsets?.[id] ?? [0, 0];
    const at = (id, x, y) => { const [dx, dy] = offOf(id); return P(x + dx, y + dy); };
    let T = P; // the current object's transform
    const pp = (pts) => pts.map(([x, y]) => T(x, y));
    const L = (w) => Math.max(0.8, w * k * 2.9); // line weights scale with the drawing
    const hot = (id) => hl === id;
    const on = (id) => { T = id ? (x, y) => at(id, x, y) : P; };
    g.save();
    g.lineJoin = 'round';
    g.lineCap = 'round';
    const shape = (pts, { fill = null, stroke = C.ink, w = 1 } = {}) => {
        poly(g, pp(pts));
        if (fill) { g.fillStyle = fill; g.fill(); }
        if (stroke) { g.strokeStyle = stroke; g.lineWidth = L(w); g.stroke(); }
    };
    const rect = (x0, y0, x1, y1, o) => shape([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], o);
    const objFill = (id, base) => (hot(id) ? '#efc9b9' : base);
    const objStroke = (id) => (hot(id) ? C.red : C.ink);

    // The wall line and the back shelf.
    rect(282, 776, 1722, 800, { fill: C.tint2, stroke: C.faint, w: 0.8 });
    // Books (faint, not labelled).
    const books = (x0, x1, seed) => {
        let x = x0;
        let s = seed;
        while (x < x1) {
            s = (s * 9301 + 49297) % 233280;
            const bw = 20 + (s % 11);
            const top = 606 + ((s >> 3) % 40);
            const lean = ((s >> 5) % 7 === 0) ? 6 : 0;
            shape([[x, 776], [x + bw, 776], [x + bw + lean, top], [x + lean, top]], { fill: C.paperHi, stroke: C.faint, w: 0.7 });
            x += bw + 1;
        }
    };
    books(422, 712, 11);
    books(1290, 1462, 5);
    // The desk top and its edge.
    shape([[296, 800], [1708, 800], [1795, 1118], [208, 1118]], { fill: C.tint, stroke: C.ink, w: 0.9 });
    shape([[208, 1118], [1795, 1118], [1795, 1142], [208, 1142]], { fill: C.tint2, stroke: C.ink, w: 0.9 });
    // Keyboard, rest, mouse, mug, glass (faint, not labelled).
    shape([[840, 982], [1160, 982], [1170, 1048], [830, 1048]], { fill: C.paperHi, stroke: C.faint, w: 0.8 });
    for (let r = 1; r < 5; r += 1) {
        const y = 982 + r * 13.2;
        const [a, b] = [P(840 - r * 2, y), P(1160 + r * 2, y)];
        g.strokeStyle = 'rgba(138,128,115,0.55)';
        g.lineWidth = L(0.4);
        g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
    }
    g.beginPath(); rr(g, ...P(784, 1054), 434 * k, 56 * k, 26 * k); g.fillStyle = C.tint2; g.fill(); g.strokeStyle = C.faint; g.lineWidth = L(0.8); g.stroke();
    g.beginPath(); g.ellipse(...P(1268, 1028), 28 * k, 30 * k, 0, 0, Math.PI * 2); g.fillStyle = C.paperHi; g.fill(); g.strokeStyle = C.faint; g.stroke();
    rect(838, 802, 898, 914, { fill: 'rgba(255,255,255,0.25)', stroke: C.faint, w: 0.7 });
    g.beginPath(); g.ellipse(...P(800, 958), 50 * k, 10 * k, 0, 0, Math.PI * 2); g.fillStyle = C.tint2; g.fill();
    rect(752, 868, 850, 958, { fill: '#9b9184', stroke: C.faint, w: 0.7 });
    g.beginPath(); g.ellipse(...P(801, 868), 49 * k, 10 * k, 0, 0, Math.PI * 2); g.fillStyle = '#c9b89c'; g.fill(); g.strokeStyle = C.faint; g.stroke();
    g.beginPath(); g.arc(...P(752, 905), 22 * k, Math.PI * 0.5, Math.PI * 1.5); g.strokeStyle = '#9b9184'; g.lineWidth = L(2.2); g.stroke();

    // Hardware I've built: the cutting mat and the EEG board.
    on('bench');
    shape([[306, 834], [640, 796], [662, 882], [286, 928]], { fill: objFill('bench', '#c7c6b0'), stroke: objStroke('bench'), w: 1 });
    shape([[372, 850], [522, 832], [527, 852], [377, 871]], { fill: C.paperHi, stroke: objStroke('bench'), w: 0.7 });
    rect(380, 846, 412, 864, { fill: hot('bench') ? C.red : '#b0503f', stroke: null });
    rect(436, 841, 498, 853, { fill: C.ink2, stroke: null });
    for (const [x, y] of [[470, 822], [500, 818], [522, 832]]) {
        g.beginPath(); g.ellipse(...T(x, y), 16 * k, 8 * k, 0, 0, Math.PI * 2); g.fillStyle = C.paperHi; g.fill(); g.strokeStyle = objStroke('bench'); g.lineWidth = L(0.6); g.stroke();
    }
    g.beginPath(); g.moveTo(...T(377, 860)); g.quadraticCurveTo(...T(330, 840), ...T(380, 826)); g.quadraticCurveTo(...T(430, 812), ...T(470, 822)); g.strokeStyle = C.ink3; g.lineWidth = L(0.6); g.stroke();

    // What I'm up to: the monitor, and its sticky.
    on('screen');
    g.beginPath(); rr(g, ...T(712, 460), 576 * k, 322 * k, 7 * k); g.fillStyle = C.ink; g.fill();
    g.beginPath(); rr(g, ...T(724, 471), 552 * k, 300 * k, 3 * k); g.fillStyle = hot('screen') ? '#4a3a33' : '#3a3632'; g.fill();
    shape([[944, 782], [1056, 782], [1062, 880], [938, 880]], { fill: C.tint2, stroke: C.ink, w: 0.8 });
    g.beginPath(); rr(g, ...T(924, 878), 152 * k, 22 * k, 6 * k); g.fillStyle = C.tint2; g.fill(); g.strokeStyle = C.ink; g.lineWidth = L(0.8); g.stroke();
    shape([[1206, 470], [1276, 468], [1278, 538], [1208, 540]], { fill: '#d9c275', stroke: null });

    // The lamp (not one of the six; the badge hangs on its head bar).
    on(null);
    g.strokeStyle = C.ink; g.lineWidth = L(4.2);
    g.beginPath(); g.moveTo(...P(690, 798)); g.lineTo(...P(682, 520)); g.lineTo(...P(372, 548)); g.stroke();
    g.lineWidth = L(6.5); g.beginPath(); g.moveTo(...P(372, 548)); g.lineTo(...P(470, 539)); g.stroke();
    g.beginPath(); g.ellipse(...P(690, 806), 48 * k, 11 * k, 0, 0, Math.PI * 2); g.fillStyle = C.ink; g.fill();
    g.beginPath(); g.arc(...P(682, 520), 8 * k, 0, Math.PI * 2); g.fill();
    // My day job: the badge.
    on('badge');
    g.strokeStyle = hot('badge') ? C.red : C.ink2; g.lineWidth = L(1.6);
    g.beginPath(); g.moveTo(...T(592, 528)); g.lineTo(...T(600, 636)); g.lineTo(...T(608, 527)); g.stroke();
    g.beginPath(); rr(g, ...T(582, 638), 36 * k, 58 * k, 3 * k); g.fillStyle = objFill('badge', '#f3eee4'); g.fill(); g.strokeStyle = objStroke('badge'); g.lineWidth = L(0.9); g.stroke();
    rect(589, 648, 611, 668, { fill: C.tint2, stroke: null });
    rect(589, 676, 611, 680, { fill: C.ink3, stroke: null });

    // Say hello: the printer.
    on('printer');
    shape([[566, 884], [674, 874], [686, 898], [572, 908]], { fill: objFill('printer', '#efeae0'), stroke: objStroke('printer'), w: 0.9 });
    shape([[572, 908], [686, 898], [686, 1014], [574, 1024]], { fill: objFill('printer', '#e4ddcf'), stroke: objStroke('printer'), w: 0.9 });
    shape([[588, 890], [660, 884], [664, 892], [592, 898]], { fill: C.ink2, stroke: null });

    // My working life: the photo box, with its label (a drawing of the real box's handwritten "kept").
    on('box');
    rect(1482, 650, 1570, 726, { fill: '#c9cbb0', stroke: objStroke('box'), w: 0.7 });
    rect(1520, 636, 1612, 726, { fill: C.paperHi, stroke: objStroke('box'), w: 0.7 });
    rect(1570, 660, 1650, 726, { fill: '#e8dcc0', stroke: objStroke('box'), w: 0.7 });
    shape([[1436, 724], [1684, 724], [1684, 830], [1440, 830]], { fill: objFill('box', '#cdb58c'), stroke: objStroke('box'), w: 1 });
    rect(1532, 758, 1626, 786, { fill: '#ece4d4', stroke: null });
    {
        const size = Math.max(6, 24 * k * 1.5);
        const [cx, cy] = T(1579, 772);
        keptMark(g, cx, cy - 13 * k * 1.8 + size * 0.94, size, C.ink);
    }

    // My research: the papers, four clipped documents.
    on('papers');
    for (let i = 3; i >= 0; i -= 1) {
        const dx = -i * 5;
        const dy = -i * 7;
        shape([[1500 + dx, 940 + dy], [1656 + dx, 950 + dy], [1712 + dx, 1072 + dy], [1530 + dx, 1078 + dy]], { fill: objFill('papers', i === 0 ? '#f6f2ea' : '#ece6da'), stroke: objStroke('papers'), w: 0.7 });
    }
    for (let r = 0; r < 7; r += 1) {
        const t = 0.18 + r * 0.1;
        const a = [1505 + (1530 - 1500) * t + 14, 940 + (1078 - 940) * t];
        const b = [1650 + (1712 - 1656) * t - 18, 950 + (1072 - 950) * t];
        g.strokeStyle = 'rgba(94,86,77,0.45)';
        g.lineWidth = L(0.6);
        g.beginPath(); g.moveTo(...T(...a)); g.lineTo(...T(b[0] - (r === 6 ? 50 : 0), b[1])); g.stroke();
    }
    rect(1510, 930, 1540, 946, { fill: C.ink, stroke: null });

    // "You are here": the red dot on the drawn screen.
    {
        const [cx, cy] = at('screen', 1000, 640);
        for (const [r, a] of [[5, 0.12], [3.2, 0.2], [2, 0.35]]) {
            g.beginPath(); g.arc(cx, cy, pinR * 0.5 * r, 0, Math.PI * 2); g.fillStyle = `rgba(226,96,76,${a})`; g.fill();
        }
        g.beginPath(); g.arc(cx, cy, pinR * 0.55, 0, Math.PI * 2); g.fillStyle = '#e2604c'; g.fill();
        text(g, MAP.here, { x: cx, y: cy + pinR * 1.1, f: 'serif', style: 'italic', size: pinSize * 1.05, color: '#e9dfcf', align: 'center', lh: 1.2 });
    }
    g.restore();
    return { k, P, at, outline: (id) => OBJECT_SHAPES[id].map(([x, y]) => at(id, x, y)) };
}

// ---------------------------------------------------------------------------
// Labels and leaders (alt.mjs label / leader / leaderV)
// ---------------------------------------------------------------------------

const DIM_LEADER = 'rgba(138,128,115,0.35)';
const LEADER = 'rgba(94,86,77,0.7)';

/** A cubic's points, for its click target. */
function curvePoints(p0, p1, p2, p3, n = 24) {
    const out = [];
    for (let i = 0; i <= n; i += 1) {
        const t = i / n;
        const u = 1 - t;
        out.push([
            u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
            u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
        ]);
    }
    return out;
}

function leaderEnd(g, x1, y1, hot, r, hole) {
    g.fillStyle = hot ? C.red : C.ink;
    g.beginPath(); g.arc(x1, y1, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = C.paper;
    g.beginPath(); g.arc(x1, y1, hole, 0, Math.PI * 2); g.fill();
}

/** A leader leaving a label sideways (landscape). Returns its points. */
function leader(g, x0, y0, x1, y1, { hot = false, dimmed = false } = {}) {
    const mx = (x0 + x1) / 2;
    g.save();
    g.strokeStyle = hot ? C.red : dimmed ? DIM_LEADER : LEADER;
    g.lineWidth = hot ? 2.2 : 1.4;
    g.beginPath(); g.moveTo(x0, y0); g.bezierCurveTo(mx, y0, mx, y1, x1, y1); g.stroke();
    leaderEnd(g, x1, y1, hot, hot ? 5.5 : 4.2, hot ? 2.2 : 1.6);
    g.restore();
    return curvePoints([x0, y0], [mx, y0], [mx, y1], [x1, y1]);
}

/** A leader leaving a label up or down (phone). Returns its points. */
function leaderV(g, x0, y0, x1, y1, { hot = false, dimmed = false } = {}) {
    const my = (y0 + y1) / 2;
    g.save();
    g.strokeStyle = hot ? C.red : dimmed ? DIM_LEADER : LEADER;
    g.lineWidth = hot ? 2.2 : 1.3;
    g.beginPath(); g.moveTo(x0, y0); g.bezierCurveTo(x0, my, x1, my, x1, y1); g.stroke();
    leaderEnd(g, x1, y1, hot, hot ? 5 : 3.8, 1.5);
    g.restore();
    return curvePoints([x0, y0], [x0, my], [x1, my], [x1, y1]);
}

/** A landscape label: its name, bold — nothing else. */
function label(g, part, x, y, w, { align = 'left', size = 24, hot = false, dimmed = false } = {}) {
    const ink = hot ? C.red : dimmed ? C.ink3 : C.ink;
    const tx = align === 'right' ? x + w : x;
    const n = text(g, part.name, { x: tx, y, f: 'serif', size, weight: 700, color: ink, align, lh: 1.25, maxW: w });
    return { bottom: n.bottom, nameMid: y + (size * 1.25) / 2 };
}

/** One label + leader + drawn object: a single click target. */
function itemHit(id, labelRect, curve, outline) {
    const index = INDEX[id];
    return { kind: 'item', index, id, to: MAP_LABELS[index].to, rect: labelRect, curve, outline };
}

// ---------------------------------------------------------------------------
// The drawing with its labels: the live layer's whole content
// ---------------------------------------------------------------------------

/** The two label columns: the left one wide enough for "Hardware I’ve built" on one line, the right one for "My working life". */
const LAND = Object.freeze({ X: 52, colW: 222, colWR: 178, rowStep: 112, size: 24 });

function paintLandMap(g, w, { plan: M, hl = null, offsets = null, hits = null } = {}) {
    const dimmed = (id) => Boolean(hl) && hl !== id;
    const plan = drawPlan(g, M, { hl, pinR: 13, pinSize: 15, offsets });
    const { X, colW, colWR, rowStep, size } = LAND;
    const RX = w - X - colWR;
    const rowY = (i) => M.y + 4 + i * rowStep;
    const columns = [[['badge', 0], ['bench', 1], ['printer', 2]], [['screen', 0], ['box', 1], ['papers', 2]]];
    columns.forEach((col, side) => {
        for (const [id, i] of col) {
            const part = MAP_LABELS[INDEX[id]];
            const lx = side ? RX : X;
            const cw = side ? colWR : colW;
            const res = label(g, part, lx, rowY(i), cw, { align: side ? 'left' : 'right', size, hot: hl === id, dimmed: dimmed(id) });
            const x0 = side ? RX - 8 : X + colW + 8;
            const curve = leader(g, x0, res.nameMid, ...plan.at(id, ...LEADER_AT.landscape[id]), { hot: hl === id, dimmed: dimmed(id) });
            hits?.push(itemHit(id, { x: lx - 8, y: rowY(i) - 6, w: cw + 16, h: res.bottom - rowY(i) + 12 }, curve, plan.outline(id)));
        }
    });
}

const PHONE = Object.freeze({ X: 28, size: 20 });

function paintPhoneMap(g, w, { plan: M, hl = null, offsets = null, hits = null } = {}) {
    const X = PHONE.X;
    const W = w - 56;
    const cw = (W - 16) / 3;
    const top = ['badge', 'screen', 'box'];
    const bot = ['bench', 'printer', 'papers'];
    const lineH = PHONE.size * 1.2;
    // The top row's cells sit 14 px above the drawing, as tall as their longest name.
    const topLines = Math.max(...top.map((id) => countLines(g, MAP_LABELS[INDEX[id]].name, { f: 'serif', size: PHONE.size, weight: 700 }, cw)));
    const yTop = M.y - 14 - topLines * lineH;
    const cell = (id, cx, cy) => {
        const part = MAP_LABELS[INDEX[id]];
        const hot = hl === id;
        const dim = Boolean(hl) && !hot;
        return text(g, part.name, { x: cx, y: cy, f: 'serif', size: PHONE.size, weight: 700, color: hot ? C.red : dim ? C.ink3 : C.ink, lh: 1.2, maxW: cw, balance: true }).bottom;
    };
    let tb = yTop;
    const topBottoms = top.map((id, i) => { const b = cell(id, X + i * (cw + 8), yTop); tb = Math.max(tb, b); return b; });
    const plan = drawPlan(g, M, { hl, pinR: 10, pinSize: 12, offsets });
    const by = M.y + M.h + 14;
    const botBottoms = bot.map((id, i) => cell(id, X + i * (cw + 8), by + 6));
    const dimmed = (id) => Boolean(hl) && hl !== id;
    top.forEach((id, i) => {
        const cx = X + i * (cw + 8);
        const curve = leaderV(g, cx + 30, tb + 4, ...plan.at(id, ...LEADER_AT.portrait[id]), { hot: hl === id, dimmed: dimmed(id) });
        hits?.push(itemHit(id, { x: cx - 4, y: yTop - 4, w: cw + 8, h: topBottoms[i] - yTop + 8 }, curve, plan.outline(id)));
    });
    bot.forEach((id, i) => {
        const cx = X + i * (cw + 8);
        const curve = leaderV(g, cx + 30, by + 2, ...plan.at(id, ...LEADER_AT.portrait[id]), { hot: hl === id, dimmed: dimmed(id) });
        hits?.push(itemHit(id, { x: cx - 4, y: by + 2, w: cw + 8, h: botBottoms[i] - by + 2 }, curve, plan.outline(id)));
    });
}

// ---------------------------------------------------------------------------
// "Short on time?"
// ---------------------------------------------------------------------------

/** A link's words, italic in the link red, underlined; its click target the words (a little slop round them). */
function link(g, s, x, y, { size, align = 'left', hit = null, hits = null, lh = 1.3 }) {
    const r = text(g, s, { x, y, f: 'serif', size, style: 'italic', color: C.link, align, lh });
    const x0 = align === 'right' ? x - r.width : x;
    const arrow = s.endsWith('→') ? size * 1.1 : 0;
    g.fillStyle = 'rgba(165,64,44,0.45)';
    g.fillRect(x0, y + (size * lh + size * 1.0) / 2 - 1, r.width - arrow, 1.2);
    if (hit) hits?.push({ ...hit, rect: { x: x0 - 6, y: y - 4, w: r.width + 12, h: size * lh + 8 } });
    return r;
}

const SHORT_ROWS = () => {
    const S = MAP.short;
    return [
        { label: S.work.label, value: S.work.value, hit: { kind: 'link', id: 'box', to: S.work.to } },
        { label: S.email.label, value: S.email.value, hit: { kind: 'link', id: 'email', href: S.email.href } },
        { label: S.more.label, value: S.more.value, hit: { kind: 'link', id: 'printer', to: S.more.to } }
    ];
};

/** Landscape: one card the width of the map, the title then three columns (each a bold label over its link). Returns its bottom. */
function shortStrip(g, x, y, w, { size = 19, hits = null } = {}) {
    const pad = 22;
    const lh = 1.3;
    const h = pad * 2 + size * lh * 2 + 4;
    g.fillStyle = C.box;
    rr(g, x, y, w, h, 12);
    g.fill();
    kicker(g, MAP.short.title, x + pad + 4, y + h / 2 - 9, { size: 14 });
    const c0 = x + 230;
    const colW = (x + w - pad - c0) / 3;
    SHORT_ROWS().forEach((row, i) => {
        const cx = c0 + i * colW;
        text(g, row.label, { x: cx, y: y + pad, f: 'serif', size, weight: 700, color: C.ink, lh });
        link(g, row.value, cx, y + pad + size * lh + 4, { size, hit: row.hit, hits, lh });
    });
    return y + h;
}

/** Phone: a card, the title then three rows (label left, link right). Returns its bottom. */
function shortCard(g, x, y, w, { size = 18, hits = null } = {}) {
    const pad = 16;
    const rowH = size * 1.75;
    const h = pad + 22 + rowH * 3 + pad - 6;
    g.fillStyle = C.box;
    rr(g, x, y, w, h, 12);
    g.fill();
    kicker(g, MAP.short.title, x + pad, y + pad, { size: 13 });
    let yy = y + pad + 22;
    for (const row of SHORT_ROWS()) {
        const ty = yy + (rowH - size * 1.3) / 2;
        text(g, row.label, { x: x + pad, y: ty, f: 'serif', size, weight: 700, color: C.ink, lh: 1.3 });
        link(g, row.value, x + w - pad, ty, { size, align: 'right', hit: row.hit, hits });
        yy += rowH;
    }
    return y + h;
}

// ---------------------------------------------------------------------------
// The painters the page calls (welcome.js): page px, `box` the part's layout
// ---------------------------------------------------------------------------

/**
 * The map's part of the page (welcome.js PAGE[variant].map): the kicker, the
 * drawing and its labels unlit, and "Short on time?". Pushes its click
 * targets onto `hits` (page px):
 *   { kind: 'item', index, id, to, rect, curve, outline }  a label, its leader, its drawn object
 *   { kind: 'link', id: 'box' | 'email' | 'printer', to | href, rect }
 */
export function paintMapPart(g, box, { variant = 'landscape', offsets = null, hits = null } = {}) {
    const phone = variant === 'portrait';
    kicker(g, MAP.kicker, phone ? PHONE.X : LAND.X, box.kickerY, { size: phone ? 14 : 17 });
    if (phone) {
        paintPhoneMap(g, box.w, { plan: box.plan, offsets, hits });
        shortCard(g, PHONE.X, box.shortY, box.w - PHONE.X * 2, { hits });
    } else {
        paintLandMap(g, box.w, { plan: box.plan, offsets, hits });
        shortStrip(g, LAND.X, box.shortY, box.w - LAND.X * 2, { hits });
    }
}

/** The live layer (box.live, page px): the drawing and its labels, `hl` lit, on its own slice of paper. Repainted only when what is lit changes. */
export function paintMapLive(g, box, { variant = 'landscape', offsets = null, hl = null } = {}) {
    const live = box.live;
    g.save();
    g.beginPath();
    g.rect(0, 0, live.w, live.h);
    g.clip();
    g.translate(-live.x, -live.y);
    paper(g, live.x, live.y, live.w, live.h, 9);
    if (variant === 'portrait') paintPhoneMap(g, box.w, { plan: box.plan, hl, offsets });
    else paintLandMap(g, box.w, { plan: box.plan, hl, offsets });
    g.restore();
}

function inPoly(pts, x, y) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

function nearCurve(pts, x, y, tol) {
    for (let i = 1; i < pts.length; i += 1) {
        const [ax, ay] = pts[i - 1];
        const [bx, by] = pts[i];
        const dx = bx - ax;
        const dy = by - ay;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
        if (Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= tol) return true;
    }
    return false;
}

const inRect = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/**
 * What a window-local point is on (the hits paintMap returned), or null:
 * a link, a label, a drawn object (the one drawn on top where two overlap),
 * then a leader (within 7 px of it).
 */
export function mapHit(hits, x, y) {
    if (!hits) return null;
    const items = hits.filter((hit) => hit.kind === 'item');
    return hits.find((hit) => hit.kind === 'link' && inRect(hit.rect, x, y))
        ?? items.find((hit) => inRect(hit.rect, x, y))
        ?? OBJECT_PRIORITY.map((id) => items.find((hit) => hit.id === id)).find((hit) => hit && inPoly(hit.outline, x, y))
        ?? items.find((hit) => nearCurve(hit.curve, x, y, 7))
        ?? null;
}

// ---------------------------------------------------------------------------
// Words for screen readers
// ---------------------------------------------------------------------------

export const spoken = (s) => s.replace(/\s*[←→]\s*/g, ' ').replace(/\s+/g, ' ').replace(/\s+([.,:;”])/g, '$1').trim();

/** What the map's part says, in reading order (ctx.live). */
export function mapLiveText({ variant = 'landscape' } = {}) {
    const phone = variant === 'portrait';
    const S = MAP.short;
    const labels = MAP_ORDER[phone ? 'portrait' : 'landscape'].map((i) => {
        const l = MAP_LABELS[i];
        return `${l.name} (${l.object})`;
    }).join('; ');
    const drawing = `A line drawing of this desk, its six things labelled, with a red dot on the drawn screen: ${MAP.here}.`;
    const keys = 'Use the up and down arrows to choose a label and Enter to go there; left and right for the other apps.';
    return spoken(`${MAP.kicker}. ${drawing} ${labels}. ${S.title} ${S.work.label}: ${S.work.value}. ${S.email.label}: ${S.email.value}. ${S.more.label}: ${S.more.value}. ${keys}`);
}

// ---------------------------------------------------------------------------
// The drawn objects, at the objects' real positions
// ---------------------------------------------------------------------------

/** The desk object each label belongs to (the modules' own ids: bench/box/paper/badge layout.js, printer spec.js). */
export const MAP_OBJECT_IDS = Object.freeze({
    bench: 'eeg-bench',
    badge: 'current-badge',
    printer: 'receipt-printer',
    screen: 'studio-display',
    box: 'photo-box',
    papers: 'paper-door'
});

/**
 * The establishing shot's px (2880 x 1800, 16:10 at 2x) → the drawing's
 * (PLAN_SRC): the drawing was traced from that shot, scaled about the
 * monitor's bezel (measured: the bezel spans 1026…1841 x 665…1125 in the shot
 * and 712…1288 x 460…782 on the drawing).
 */
export function shotToPlan([x, y]) {
    return [712 + ((x - 1026) * 576) / 815, 460 + ((y - 665) * 322) / 460];
}

/**
 * Where each object's centre fell on the drawing (plan px) when it was traced
 * — its bounding-box centre at the layout the mockup drew, as the monitor's
 * mount sees it (before the other modules hang their own meshes on their
 * objects). An object measured anywhere else is drawn moved by the difference.
 */
export const TRACED_CENTRES = Object.freeze({
    bench: Object.freeze([470, 833]),
    badge: Object.freeze([600, 616]),
    printer: Object.freeze([620, 947]),
    screen: Object.freeze([1005, 666]),
    box: Object.freeze([1574, 731]),
    papers: Object.freeze([1613, 1001])
});

/**
 * Each drawn object's offset (plan px) from the real desk: each object's
 * world bounding-box centre (every mesh it is built from, the monitor's own
 * skipped) through `project(x, y, z) → [px, py]` (the 16:10 establishing
 * camera, in its 2880 x 1800 px), onto the drawing, less where it was traced.
 * An object that isn't on the desk (its module failed) stays where it was drawn.
 * `boundsOf(group)` → { min: [x, y, z], max: [x, y, z] } | null.
 */
export function measureMapOffsets(getGroup, boundsOf, project) {
    const offsets = {};
    for (const id of Object.keys(MAP_OBJECT_IDS)) {
        const b = boundsOf(getGroup(MAP_OBJECT_IDS[id]));
        if (!b) continue;
        const centre = [0, 1, 2].map((i) => (b.min[i] + b.max[i]) / 2);
        const [px, py] = shotToPlan(project(...centre));
        const [tx, ty] = TRACED_CENTRES[id];
        if (Number.isFinite(px) && Number.isFinite(py)) offsets[id] = [Math.round(px - tx), Math.round(py - ty)];
    }
    return offsets;
}
