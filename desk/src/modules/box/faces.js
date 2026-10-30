import { rng } from '../../core/rng.js';
import { palette } from '../../core/palette.js';
import { font } from '../../core/fonts.js';
import { drawText, drawHandwriting, fitHandwriting, grain, drawImageCover, wrap } from '../../core/draw.js';
import { PRINT_BORDER, NOTE_RECTS, DIVIDER_MM, tabLeftMm, CARD_STOCK } from './layout.js';
import { handInBox, TYPED_ONLY, MARKER_STROKE } from './hand.js';

// The handwritten notes' sizes below are caps, in mm of font size: the most a
// note may be written at, where its rect allows (it is fitted to the rect, so
// a longer note comes out smaller). They were set for Caveat, whose x-height
// is 0.40 em; Shae Hand's is 0.33, so they are 1.2× what they were, to write
// the same size of letter. Line heights are fonts.HAND's unless a note says.

export { handInBox };

/**
 * Every face the box's things carry, painted into canvases in MILLIMETRES of
 * the real object (a 4×6 print is 107.6 × 181.4 mm with its borders). Media
 * leads, words caption: the photo fills the print, one handwritten line sits
 * in the border, and the object's size is the word limit — handwriting is
 * shrunk to fit its space, never allowed to overflow it.
 *
 * Painters take a 2D context already scaled to mm (core/draw.js makeCanvas)
 * and never throw on a missing image: they paint the paper, and the image
 * arrives on the repaint.
 */

/** Newsprint for the clippings — core palette (#efe9dc). */
export const NEWSPRINT = palette.newsprint;
const NEWS_INK = palette.newsInk;

// ---------------------------------------------------------------------------
// Board, tape
// ---------------------------------------------------------------------------

/** Kraft board: a warm base, soft mottling, short fibres. Pixel canvas, tiled on the box. */
export function paintKraft(canvas) {
    const g = canvas.getContext('2d');
    const { width: W, height: H } = canvas;
    const r = rng('kraft');
    g.fillStyle = palette.kraft;
    g.fillRect(0, 0, W, H);
    // Mottling: big, faint blotches (wrapped so the tile repeats cleanly).
    for (let i = 0; i < 70; i += 1) {
        const x = r() * W;
        const y = r() * H;
        const rad = r.range(W * 0.04, W * 0.16);
        const light = r() > 0.5;
        for (const [ox, oy] of [[0, 0], [W, 0], [-W, 0], [0, H], [0, -H]]) {
            const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
            grad.addColorStop(0, light ? 'rgba(255,240,214,0.10)' : 'rgba(90,60,30,0.08)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = grad;
            g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
        }
    }
    // Fibres.
    g.lineCap = 'round';
    for (let i = 0; i < 2600; i += 1) {
        const x = r() * W;
        const y = r() * H;
        const len = r.range(2, 9);
        const a = r.signed(Math.PI);
        const light = r() > 0.55;
        g.strokeStyle = light ? `rgba(236,214,176,${r.range(0.10, 0.28)})` : `rgba(96,66,36,${r.range(0.08, 0.22)})`;
        g.lineWidth = r.range(0.5, 1.3);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        g.stroke();
    }
    // Fine tooth.
    const data = g.getImageData(0, 0, W, H);
    for (let i = 0; i < data.data.length; i += 4) {
        const n = (r() - 0.5) * 14;
        data.data[i] += n; data.data[i + 1] += n; data.data[i + 2] += n * 0.8;
    }
    g.putImageData(data, 0, 0);
}

/** A torn-ended strip of masking tape with "kept" on it in marker. mm canvas. Note box.label.kept. */
export function paintLabel(g, W, H, text, { hand = TYPED_ONLY } = {}) {
    const r = rng('label');
    g.clearRect(0, 0, W, H);
    // Torn ends: a zig-zag at each end, straight long edges (the roll's edge).
    const tear = (x0, dir) => {
        const pts = [];
        const steps = 9;
        for (let i = 0; i <= steps; i += 1) {
            pts.push([x0 + dir * r.range(0, 2.2), (i / steps) * H]);
        }
        return pts;
    };
    const left = tear(1.2, 1);
    const right = tear(W - 1.2, -1).reverse();
    g.beginPath();
    g.moveTo(left[0][0], 0);
    for (const [x, y] of left) g.lineTo(x, y);
    for (const [x, y] of right) g.lineTo(x, y);
    g.closePath();
    g.save();
    g.clip();
    g.fillStyle = palette.maskingTape;
    g.fillRect(0, 0, W, H);
    // Crepe texture: faint cross-grain streaks.
    for (let i = 0; i < 80; i += 1) {
        const x = r() * W;
        g.fillStyle = `rgba(${r() > 0.5 ? '255,250,235' : '150,130,95'},${r.range(0.04, 0.10)})`;
        g.fillRect(x, 0, r.range(0.2, 0.8), H);
    }
    grain(g, W, H, { seed: 'label-grain', amount: 0.06 });
    // "kept", marker-thick: the pen's letters, drawn wider.
    const rect = NOTE_RECTS.label;
    hand.note(g, { id: 'box.label.kept', text, ...rect, size: H * 0.86, weight: 700, pen: 'marker', align: 'center', seed: 'kept' }, () => handInBox(g, text, {
        ...rect, sizeMax: H * 0.86, align: 'center', color: palette.ink, seed: 'kept', wobble: 0.02, tilt: 0.01, slant: -0.03, stroke: MARKER_STROKE
    }));
    g.restore();
}

// ---------------------------------------------------------------------------
// Prints
// ---------------------------------------------------------------------------

/** Where the photo sits on a print, mm. */
export function photoRect(orientation, W) {
    const w = orientation === 'landscape' ? 152.4 : 101.6;
    const h = orientation === 'landscape' ? 101.6 : 152.4;
    return { x: (W - w) / 2, y: PRINT_BORDER.top, w, h };
}

export function paintPrintFront(g, W, H, { image, focus, line, orientation, seed, hand = TYPED_ONLY }) {
    g.fillStyle = palette.paper;
    g.fillRect(0, 0, W, H);
    const p = photoRect(orientation, W);
    if (image) {
        drawImageCover(g, image, p.x, p.y, p.w, p.h, { focusX: focus?.x ?? 0.5, focusY: focus?.y ?? 0.5 });
        // The faintest edge where emulsion meets border.
        g.strokeStyle = 'rgba(0,0,0,0.06)';
        g.lineWidth = 0.15;
        g.strokeRect(p.x, p.y, p.w, p.h);
    } else {
        g.fillStyle = '#d9d6cf';
        g.fillRect(p.x, p.y, p.w, p.h);
    }
    grain(g, W, H, { seed: `${seed}-front`, amount: 0.035 });
    // The line, in the deep bottom border (layout.js NOTE_RECTS.printLine). Note box.<id>.line.
    const rect = NOTE_RECTS.printLine(orientation);
    return hand.note(g, { id: `box.${seed}.line`, text: line, ...rect, size: 10.3, seed: `${seed}-line`, slant: -0.012 });
}

/** The neutral repeating "photo paper" backprint every lab print carries. */
function backprint(g, W, H) {
    g.save();
    g.fillStyle = 'rgba(70, 70, 66, 0.11)';
    g.font = font({ face: 'inter', size: 2.3, weight: 500 });
    g.translate(W / 2, H / 2);
    g.rotate(-0.42);
    const diag = Math.hypot(W, H);
    const phrase = 'photographic paper   ·   ';
    const unit = g.measureText(phrase).width;
    for (let y = -diag / 2, row = 0; y < diag / 2; y += 11, row += 1) {
        for (let x = -diag / 2 - (row % 2) * unit / 2; x < diag / 2; x += unit) g.fillText(phrase, x, y);
    }
    g.restore();
}

/** The plain back of a print filed behind the others: the lab's backprint, no words, no date. */
export function paintFillerBack(g, W, H) {
    g.fillStyle = palette.photoBack;
    g.fillRect(0, 0, W, H);
    backprint(g, W, H);
    grain(g, W, H, { seed: 'filler-back', amount: 0.05 });
    // Handled: a faint thumb-worn shadow along the top edge.
    const worn = g.createLinearGradient(0, 0, 0, 14);
    worn.addColorStop(0, 'rgba(90, 80, 60, 0.07)');
    worn.addColorStop(1, 'rgba(90, 80, 60, 0)');
    g.fillStyle = worn;
    g.fillRect(0, 0, W, 14);
}

/**
 * A hand-drawn arrow, left to right: a shaft with a little lift in it and an
 * open head, in the pen's colour. (x, y) is the tail, `len` its length, all mm.
 */
export function drawArrow(g, x, y, len, { color = palette.ink, width = 0.55, seed = 'arrow', rise = -0.6, head = 2.4 } = {}) {
    const r = rng(`arrow:${seed}`);
    const x1 = x + len;
    const y1 = y + rise;
    g.save();
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.globalAlpha = 0.92;
    g.beginPath();
    g.moveTo(x, y + r.signed(0.2));
    g.bezierCurveTo(x + len * 0.35, y - 0.9 + r.signed(0.3), x + len * 0.7, y1 + 0.7 + r.signed(0.3), x1, y1);
    g.stroke();
    // The head: two short strokes back from the tip, either side of the shaft's end direction.
    const a = Math.atan2(-0.7, len * 0.3) + r.signed(0.04);
    g.beginPath();
    g.moveTo(x1 - head * Math.cos(a - 0.5), y1 - head * Math.sin(a - 0.5));
    g.lineTo(x1, y1);
    g.lineTo(x1 - head * Math.cos(a + 0.55), y1 - head * Math.sin(a + 0.55));
    g.stroke();
    g.restore();
    return { x1, y1 };
}

/**
 * A thread line, in Shae Hand: the sentence, then on its own line a
 * drawn arrow and where it goes — the arrow is what you click.
 */
function drawThread(g, rect, { line, label, seed }) {
    const lineBox = { x: rect.x, y: rect.y, w: rect.w, h: rect.h * 0.66 };
    const text = handInBox(g, line, { ...lineBox, sizeMax: 8.3, valign: 'top', seed: `${seed}-thread`, slant: -0.01 });
    const size = Math.min(8.6, Math.max(6.2, text.size * 1.04));
    const rowTop = Math.min(text.bottom + 1.2, rect.y + rect.h - size * 1.12);
    const arrowY = rowTop + size * 0.62;
    const arrow = drawArrow(g, rect.x + 1.5, arrowY, 13, { seed, width: 0.5 });
    const labelBox = handInBox(g, label, {
        x: arrow.x1 + 2.2, y: rowTop, w: rect.x + rect.w - arrow.x1 - 2.2, h: size * 1.12,
        sizeMax: size, valign: 'top', seed: `${seed}-to`, slant: -0.01
    });
    return { size: text.size, fits: text.fits && labelBox.fits, bottom: rowTop + size * 1.12 };
}

export function paintPrintBack(g, W, H, { back, date, orientation, seed, thread = null, hand = TYPED_ONLY }) {
    g.fillStyle = palette.photoBack;
    g.fillRect(0, 0, W, H);
    backprint(g, W, H);
    grain(g, W, H, { seed: `${seed}-back`, amount: 0.05 });
    let result = null;
    if (back) {
        // Note box.<id>.back: top-aligned; with a thread it keeps the top 84 mm and the thread goes under it.
        const rect = NOTE_RECTS.printBack(orientation, { thread: Boolean(thread) });
        result = hand.note(g, {
            id: `box.${seed}.back`, text: back, ...rect, size: orientation === 'landscape' ? 10.1 : 9.5,
            valign: 'top', seed: `${seed}-back`, slant: -0.01
        });
    }
    if (thread) {
        // Note box.thread.<id>: the sentence, the arrow, where it goes — one note.
        const rect = NOTE_RECTS.printThread(orientation);
        hand.note(g, {
            id: `box.thread.${seed}`, text: `${thread.line} → ${thread.label}`, ...rect, size: 8.3, valign: 'top',
            seed: `${seed}-thread`, slant: -0.01
        }, () => drawThread(g, rect, { line: thread.line, label: thread.label, seed }));
    }
    // The date, small, in the bottom-right corner. Note box.<id>.date.
    const dateRect = NOTE_RECTS.printDate(orientation);
    hand.note(g, {
        id: `box.${seed}.date`, text: date, ...dateRect, size: back ? 7.4 : 8.9, align: 'right', seed: `${seed}-date`, slant: -0.03
    });
    return result;
}

// ---------------------------------------------------------------------------
// Newsprint
// ---------------------------------------------------------------------------

/**
 * A scissor-cut outline: each edge a few straight snips, slightly off square.
 * `mirror` flips it for the back face (BoxGeometry's -Z face reads correctly
 * from behind, so the back canvas is the front's mirror image).
 */
export function cutOutline(W, H, seed, { mirror = false } = {}) {
    const r = rng(`cut:${seed}`);
    const corners = [
        [r.range(0.3, 1.4), r.range(0.3, 1.4)],
        [W - r.range(0.3, 1.4), r.range(0.3, 1.4)],
        [W - r.range(0.3, 1.4), H - r.range(0.3, 1.4)],
        [r.range(0.3, 1.4), H - r.range(0.3, 1.4)]
    ];
    const pts = [];
    for (let e = 0; e < 4; e += 1) {
        const [ax, ay] = corners[e];
        const [bx, by] = corners[(e + 1) % 4];
        const len = Math.hypot(bx - ax, by - ay);
        const snips = Math.max(2, Math.round(len / 38));
        const nx = -(by - ay) / len;
        const ny = (bx - ax) / len;
        for (let i = 0; i < snips; i += 1) {
            const t = i / snips;
            const off = i === 0 ? 0 : r.signed(0.35);
            pts.push([ax + (bx - ax) * t + nx * off, ay + (by - ay) * t + ny * off]);
        }
    }
    return mirror ? pts.map(([x, y]) => [W - x, y]) : pts;
}

function clipTo(g, pts) {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i += 1) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    g.clip();
}

/** Plain newsprint (a clipping's back): the cut shape, the paper, its tooth. */
export function paintNewsprintBack(g, W, H, seed) {
    g.clearRect(0, 0, W, H);
    g.save();
    clipTo(g, cutOutline(W, H, seed, { mirror: true }));
    g.fillStyle = NEWSPRINT;
    g.fillRect(0, 0, W, H);
    // Ageing: a faint warm cast toward the edges.
    const grad = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(150,120,60,0.10)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    grain(g, W, H, { seed: `${seed}-back`, amount: 0.08 });
    g.restore();
}

/**
 * The ITE clipping's back (v4): bare newsprint, and a thread written on it in
 * ink — the sentence, a drawn arrow, where it goes (note box.thread.ite; the
 * whole rect is the link, index.js onThread). The cut outline is the front's,
 * mirrored, so the writing sits well inside it.
 */
export function paintIteBack(g, W, H, { thread = null, hand = TYPED_ONLY } = {}) {
    paintNewsprintBack(g, W, H, 'ite');
    if (!thread) return null;
    const rect = NOTE_RECTS.iteThread;
    return hand.note(g, {
        id: 'box.thread.ite', text: `${thread.line} → ${thread.label}`, ...rect, size: 8.8, valign: 'top',
        seed: 'ite-thread', slant: -0.01
    }, () => drawThread(g, rect, { line: thread.line, label: thread.label, seed: 'ite' }));
}

/**
 * A photo re-screened for newsprint: greyscale, ink that never reaches black
 * or paper white, and a 45° dot screen at ~0.9 mm (coarse enough to read as
 * halftone at arm's length, fine enough not to shout).
 */
export function halftone(g, image, x, y, w, h, { focusX = 0.5, focusY = 0.5, pitch = 0.9 } = {}) {
    if (!image) {
        g.fillStyle = '#c9c4b8';
        g.fillRect(x, y, w, h);
        return;
    }
    // Sample the cropped photo on a grid a little finer than the screen.
    const sw = Math.max(8, Math.round(w / (pitch * 0.5)));
    const sh = Math.max(8, Math.round(h / (pitch * 0.5)));
    const sample = document.createElement('canvas');
    sample.width = sw;
    sample.height = sh;
    const s = sample.getContext('2d', { willReadFrequently: true });
    drawImageCover(s, image, 0, 0, sw, sh, { focusX, focusY });
    const px = s.getImageData(0, 0, sw, sh).data;
    const lum = (u, v) => {
        const i = (Math.min(sh - 1, Math.max(0, Math.floor(v * sh))) * sw + Math.min(sw - 1, Math.max(0, Math.floor(u * sw)))) * 4;
        return (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
    };
    // A soft greyscale underlay so the dots sit on tone, not on bare paper —
    // made from the sample itself (ctx.filter isn't in every Safari).
    const grey = s.createImageData(sw, sh);
    for (let i = 0; i < px.length; i += 4) {
        const v = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
        const t = 255 - (255 - v) * 0.82; // flatter than the photo: newsprint ink
        grey.data[i] = t; grey.data[i + 1] = t; grey.data[i + 2] = t * 0.985; grey.data[i + 3] = 255;
    }
    s.putImageData(grey, 0, 0);
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    g.globalAlpha = 0.42;
    g.imageSmoothingEnabled = true;
    g.drawImage(sample, 0, 0, sw, sh, x, y, w, h);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = NEWS_INK;
    const a = Math.PI / 4;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const cx = x + w / 2;
    const cy = y + h / 2;
    const reach = Math.hypot(w, h) / 2 + pitch;
    g.beginPath(); // one path for every dot: one fill, not thousands
    for (let j = -reach; j <= reach; j += pitch) {
        for (let i = -reach; i <= reach; i += pitch) {
            const px2 = cx + i * ca - j * sa;
            const py2 = cy + i * sa + j * ca;
            if (px2 < x - pitch || px2 > x + w + pitch || py2 < y - pitch || py2 > y + h + pitch) continue;
            // Newsprint range: paper white ≈ 0.9, solid ≈ 0.12 coverage.
            const dark = 1 - lum((px2 - x) / w, (py2 - y) / h);
            const coverage = 0.04 + dark * 0.78;
            const rad = pitch * 0.5 * Math.sqrt(coverage) * 1.13;
            if (rad < 0.05) continue;
            g.moveTo(px2 + rad, py2);
            g.arc(px2, py2, rad, 0, Math.PI * 2);
        }
    }
    g.fill();
    g.restore();
}

/** Shared newsprint furniture: cut shape, paper, an ageing cast. Returns the cut outline. */
function newsprintGround(g, W, H, seed) {
    g.clearRect(0, 0, W, H);
    const outline = cutOutline(W, H, seed);
    clipTo(g, outline);
    g.fillStyle = NEWSPRINT;
    g.fillRect(0, 0, W, H);
    const grad = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(150,120,60,0.09)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    return outline;
}

/** The ITE clipping — Forbes Australia, 30 Under 30. Returns layout facts (mm) for the sticky. */
export function paintIteClipping(g, W, H, { image, headline, meta }) {
    g.save();
    newsprintGround(g, W, H, 'ite');
    const m = 8;
    // Section kicker rule.
    g.fillStyle = NEWS_INK;
    g.fillRect(m, m, W - 2 * m, 0.5);
    const head = drawText(g, headline, {
        x: m, y: m + 3, maxWidth: W - 2 * m, maxLines: 4, face: 'newsreader', size: 10.6, weight: 600,
        lineHeight: 1.08, color: NEWS_INK, label: 'ITE headline'
    });
    const metaBlock = drawText(g, meta, {
        x: m, y: head.bottom + 2.2, maxWidth: W - 2 * m, maxLines: 1, face: 'newsreader', size: 3.9, weight: 400,
        style: 'italic', color: '#3a3833', label: 'ITE meta'
    });
    const photoTop = metaBlock.bottom + 3.5;
    const photoH = H - m - photoTop;
    halftone(g, image, m, photoTop, W - 2 * m, photoH, { focusX: 0.5, focusY: 0.28 });
    grain(g, W, H, { seed: 'ite-grain', amount: 0.07 });
    g.restore();
    return { photoTop, photoH };
}

/** The Pura Link clipping — Forbes Australia. Returns where the date line ends (mm), for "+311 days". */
export function paintPuralinkClipping(g, W, H, { image, headline, meta, standfirst }) {
    g.save();
    newsprintGround(g, W, H, 'puralink');
    const m = 7.5;
    g.fillStyle = NEWS_INK;
    g.fillRect(m, m, W - 2 * m, 0.5);
    const head = drawText(g, headline, {
        x: m, y: m + 2.6, maxWidth: W - 2 * m, maxLines: 3, face: 'newsreader', size: 9.6, weight: 600,
        lineHeight: 1.07, color: NEWS_INK, label: 'Puralink headline'
    });
    const metaY = head.bottom + 1.8;
    const metaBlock = drawText(g, meta, {
        x: m, y: metaY, maxWidth: W - 2 * m, maxLines: 1, face: 'newsreader', size: 3.9, style: 'italic',
        color: '#3a3833', label: 'Puralink meta'
    });
    // Standfirst at the foot, photo between.
    g.font = font({ face: 'newsreader', size: 4.3, weight: 400 });
    const standLines = Math.min(3, wrap(g, standfirst, W - 2 * m).length);
    const standH = standLines * 4.3 * 1.28;
    const photoTop = metaBlock.bottom + 3;
    const photoH = H - m - standH - 3 - photoTop;
    halftone(g, image, m, photoTop, W - 2 * m, photoH, { focusX: 0.5, focusY: 0.3 });
    drawText(g, standfirst, {
        x: m, y: photoTop + photoH + 2.6, maxWidth: W - 2 * m, maxLines: 3, face: 'newsreader', size: 4.3,
        lineHeight: 1.28, color: NEWS_INK, label: 'Puralink standfirst'
    });
    grain(g, W, H, { seed: 'pl-grain', amount: 0.07 });
    g.restore();
    return { metaY, metaHeight: metaBlock.height, metaRight: m + metaBlock.width };
}

/** The Fluency clipping — the AFR's heavy top rule, headline, date, a set line. */
export function paintFluencyClipping(g, W, H, { headline, meta, setLine }) {
    g.save();
    newsprintGround(g, W, H, 'fluency');
    const m = 7.5;
    g.fillStyle = NEWS_INK;
    g.fillRect(m, m, W - 2 * m, 1.6);
    const head = drawText(g, headline, {
        x: m, y: m + 5, maxWidth: W - 2 * m, maxLines: 4, face: 'newsreader', size: 11, weight: 600,
        lineHeight: 1.06, color: NEWS_INK, label: 'Fluency headline'
    });
    const metaY = head.bottom + 3;
    const metaBlock = drawText(g, meta, {
        x: m, y: metaY, maxWidth: W - 2 * m, maxLines: 1, face: 'newsreader', size: 3.9, style: 'italic',
        color: '#3a3833', label: 'Fluency meta'
    });
    g.fillStyle = 'rgba(28,28,26,0.5)';
    g.fillRect(m, metaBlock.bottom + 2.6, 18, 0.35);
    drawText(g, setLine, {
        x: m, y: metaBlock.bottom + 4.4, maxWidth: W - 2 * m, maxLines: 2, face: 'newsreader', size: 4.5,
        weight: 500, color: NEWS_INK, label: 'Fluency set line'
    });
    grain(g, W, H, { seed: 'fl-grain', amount: 0.07 });
    g.restore();
    return { metaY, metaHeight: metaBlock.height, metaRight: m + metaBlock.width };
}

// ---------------------------------------------------------------------------
// Memos, stickies, red pen
// ---------------------------------------------------------------------------

/** Where the "XXX" placeholder sits in each memo scan (image px, 927 wide). */
const PLACEHOLDER_PX = {
    puralink: { x: 211, y: 330, w: 36, h: 20 },
    fluency: { x: 211, y: 334, w: 36, h: 20 }
};

/**
 * The memo: A4 folded in half, so the top half of the scan on an A5
 * landscape sheet, the fold along its bottom edge. The scan is multiplied onto
 * the paper (its white becomes this paper), the placeholder painted out, and
 * the red-pen date written in the blank lower left.
 */
export function paintMemo(g, W, H, { id, image, redPen, hand = TYPED_ONLY }) {
    g.fillStyle = palette.paper;
    g.fillRect(0, 0, W, H);
    if (image) {
        const iw = image.naturalWidth || image.width;
        const sh = iw * (H / W);
        g.save();
        g.globalCompositeOperation = 'multiply';
        g.drawImage(image, 0, 0, iw, sh, 0, 0, W, H);
        g.restore();
        const ph = PLACEHOLDER_PX[id];
        if (ph) {
            const k = W / iw;
            g.fillStyle = palette.paper;
            g.fillRect(ph.x * k, ph.y * k, ph.w * k, ph.h * k);
        }
    }
    grain(g, W, H, { seed: `${id}-memo`, amount: 0.04 });
    // The fold: a soft shadow and a hairline along the bottom edge.
    const fold = g.createLinearGradient(0, H - 5, 0, H);
    fold.addColorStop(0, 'rgba(0,0,0,0)');
    fold.addColorStop(1, 'rgba(60,50,40,0.10)');
    g.fillStyle = fold;
    g.fillRect(0, H - 5, W, 5);
    // Red pen, lower left. Note box.red.<id>.date (the underline is part of it).
    hand.note(g, { id: `box.red.${id}.date`, text: redPen, ...NOTE_RECTS.memoRed, size: 11, weight: 700, pen: 'red', seed: `${id}-red` }, () => {
        const room = NOTE_RECTS.memoRed;
        const { size } = fitHandwriting(g, redPen, { maxWidth: room.w * 0.9, maxHeight: room.h * 0.8, sizeMax: 11 });
        g.save();
        g.translate(22, 110);
        g.rotate(-0.045);
        const res = drawHandwriting(g, redPen, {
            x: 0, y: 0, size, weight: 700, color: palette.redPen, seed: `${id}-red`, wobble: 0.03, tilt: 0.008
        });
        g.strokeStyle = palette.redPen;
        g.globalAlpha = 0.88;
        g.lineWidth = 0.55;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(-1, res.bottom + 0.6);
        g.quadraticCurveTo(res.width * 0.5, res.bottom + 2.2, res.width + 2, res.bottom + 0.2);
        g.stroke();
        g.restore();
        return res;
    });
}

/**
 * The room's sticky stock (core/palette.js stickyYellow, lit by core/paper.js
 * stickyMaterial so it comes out sticky-note yellow after ACES, not olive or
 * cream). Falls back to the v1 yellow if the palette predates it.
 */
export const STICKY_STOCK = palette.stickyYellow ?? palette.sticky;

/** A sticky note: yellow, the adhesive band a shade glossier, the note handwritten. Note box.sticky.<seed>. */
export function paintSticky(g, W, H, { text, seed, hand = TYPED_ONLY }) {
    g.fillStyle = STICKY_STOCK;
    g.fillRect(0, 0, W, H);
    const band = g.createLinearGradient(0, 0, 0, H * 0.22);
    band.addColorStop(0, 'rgba(255,255,240,0.20)');
    band.addColorStop(1, 'rgba(255,255,240,0)');
    g.fillStyle = band;
    g.fillRect(0, 0, W, H * 0.22);
    // The curl's shade, warm (a grey shade would push the yellow toward olive).
    const shade = g.createLinearGradient(0, H * 0.55, 0, H);
    shade.addColorStop(0, 'rgba(150,90,0,0)');
    shade.addColorStop(1, 'rgba(150,90,0,0.08)');
    g.fillStyle = shade;
    g.fillRect(0, H * 0.55, W, H * 0.45);
    grain(g, W, H, { seed: `${seed}-sticky`, amount: 0.04 });
    return hand.note(g, {
        id: `box.sticky.${seed}`, text, ...NOTE_RECTS.sticky([W, H]), size: 11.5, seed: `${seed}-sticky-text`, slant: -0.02
    });
}

/** Red pen on a transparent decal: "+311 days", underlined. mm canvas. Note box.red.<id>.gap (the whole decal). */
export function paintRedNote(g, W, H, { text, seed, id, hand = TYPED_ONLY }) {
    g.clearRect(0, 0, W, H);
    hand.note(g, { id: `box.red.${id}.gap`, text, x: 0, y: 0, w: W, h: H, size: H * 0.74, weight: 700, pen: 'red', seed }, () => {
        const { size } = fitHandwriting(g, text, { maxWidth: W - 5, maxHeight: H * 0.9, sizeMax: H * 0.74 });
        const res = drawHandwriting(g, text, {
            x: 1.5, y: (H - size * 1.05) / 2 - H * 0.06, size, weight: 700, lineHeight: 1.05, color: palette.redPen, seed, wobble: 0.03, tilt: 0.01, slant: -0.03
        });
        g.save();
        g.strokeStyle = palette.redPen;
        g.globalAlpha = 0.85;
        g.lineWidth = 0.5;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(1, res.bottom + 0.2);
        g.quadraticCurveTo(res.width * 0.55, res.bottom + 1.6, Math.min(W - 1, res.width + 3), res.bottom - 0.4);
        g.stroke();
        g.restore();
        return res;
    });
}

// ---------------------------------------------------------------------------
// Chapter dividers, index cards
// ---------------------------------------------------------------------------

/**
 * A divider's outline, mm: the body, and a 1/3-cut tab on top at `position`
 * with rounded top corners and small fillets where it meets the body.
 * `mirror` flips it for the back face (read from behind, the tab is on the other side).
 */
export function dividerPath(g, position, { mirror = false } = {}) {
    const { w: W, body, tab } = DIVIDER_MM;
    const H = body + tab.h;
    const t0 = tabLeftMm(position);
    const t1 = t0 + tab.w;
    const r = tab.radius;
    const f = 1.6; // fillet
    const X = (x) => (mirror ? W - x : x);
    g.beginPath();
    g.moveTo(X(0.6), H);
    g.lineTo(X(0.6), tab.h + 0.8);
    g.quadraticCurveTo(X(0.6), tab.h, X(1.4), tab.h);
    g.lineTo(X(Math.max(1.4, t0 - f)), tab.h);
    g.quadraticCurveTo(X(t0), tab.h, X(t0 + 0.3), tab.h - f);
    g.lineTo(X(t0 + 0.9), r);
    g.quadraticCurveTo(X(t0 + 1.2), 0.2, X(t0 + r + 0.6), 0.2);
    g.lineTo(X(t1 - r - 0.6), 0.2);
    g.quadraticCurveTo(X(t1 - 1.2), 0.2, X(t1 - 0.9), r);
    g.lineTo(X(t1 - 0.3), tab.h - f);
    g.quadraticCurveTo(X(t1), tab.h, X(Math.min(W - 1.4, t1 + f)), tab.h);
    g.lineTo(X(W - 1.4), tab.h);
    g.quadraticCurveTo(X(W - 0.6), tab.h, X(W - 0.6), tab.h + 0.8);
    g.lineTo(X(W - 0.6), H);
    g.closePath();
}

function cardstock(g, W, H, color, seed) {
    g.fillStyle = color;
    g.fillRect(0, 0, W, H);
    // Board tooth: faint fibres and a fine grain.
    const r = rng(`stock:${seed}`);
    for (let i = 0; i < 180; i += 1) {
        g.fillStyle = `rgba(${r() > 0.5 ? '255,255,250' : '60,50,40'},${r.range(0.015, 0.04)})`;
        g.fillRect(r() * W, r() * H, r.range(2, 7), r.range(0.15, 0.35));
    }
    grain(g, W, H, { seed: `${seed}-grain`, amount: 0.045 });
}

/**
 * A chapter divider's face: coloured cardstock cut to its tab, the year on
 * the tab (note box.tab.<year>), the chapter line across the top of the body
 * (note box.chapter.<year>) — above the box's rim even when it stands flush.
 */
export function paintDividerFront(g, { year, position, color, line, hand = TYPED_ONLY }) {
    const { w: W, body, tab } = DIVIDER_MM;
    const H = body + tab.h;
    g.clearRect(0, 0, W, H);
    g.save();
    dividerPath(g, position);
    g.clip();
    cardstock(g, W, H, color, `divider-${year}`);
    // Handled: the tab a touch worn.
    const t0 = tabLeftMm(position);
    const worn = g.createLinearGradient(0, 0, 0, tab.h + 4);
    worn.addColorStop(0, 'rgba(70, 55, 35, 0.07)');
    worn.addColorStop(1, 'rgba(70, 55, 35, 0)');
    g.fillStyle = worn;
    g.fillRect(t0, 0, tab.w, tab.h + 4);
    const tabRect = NOTE_RECTS.tab(position);
    const tabResult = hand.note(g, { id: `box.tab.${year}`, text: year, ...tabRect, size: 11.3, align: 'center', seed: `tab-${year}`, slant: -0.02 });
    const lineResult = hand.note(g, {
        id: `box.chapter.${year}`, text: line, ...NOTE_RECTS.chapter, size: 11, valign: 'top', seed: `chapter-${year}`, slant: -0.012
    });
    g.restore();
    return { tab: tabResult, line: lineResult };
}

/** A divider's back: the same stock, cut to the mirrored outline, nothing written. */
export function paintDividerBack(g, { year, position, color }) {
    const { w: W, body, tab } = DIVIDER_MM;
    const H = body + tab.h;
    g.clearRect(0, 0, W, H);
    g.save();
    dividerPath(g, position, { mirror: true });
    g.clip();
    cardstock(g, W, H, color, `divider-${year}-back`);
    g.restore();
}

/** A 6 × 4 ruled index card: a red header rule, pale blue rules every quarter inch. */
function indexCard(g, W, H, seed) {
    g.fillStyle = CARD_STOCK.color;
    g.fillRect(0, 0, W, H);
    grain(g, W, H, { seed: `${seed}-card`, amount: 0.035 });
    g.save();
    g.lineWidth = 0.28;
    g.strokeStyle = CARD_STOCK.rule;
    g.globalAlpha = 0.75;
    for (let y = 20.3 + 6.35; y < H - 3; y += 6.35) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(W, y);
        g.stroke();
    }
    g.strokeStyle = CARD_STOCK.header;
    g.lineWidth = 0.34;
    g.globalAlpha = 0.85;
    g.beginPath();
    g.moveTo(0, 20.3);
    g.lineTo(W, 20.3);
    g.stroke();
    g.restore();
}

/** The opening card: "things I kept · start at the front". Note box.intro. */
export function paintIntroCard(g, W, H, { text, hand = TYPED_ONLY }) {
    indexCard(g, W, H, 'intro');
    return hand.note(g, { id: 'box.intro', text, ...NOTE_RECTS.intro, size: 15, valign: 'top', seed: 'intro', slant: -0.015 });
}

/**
 * The end card: the question, then a drawn arrow sweeping down to "now" —
 * one note (box.end), arrow and all. The arrow's rect comes back as `arrow`
 * (mm), though the whole card is what you click.
 */
export function paintEndCard(g, W, H, { question, hand = TYPED_ONLY }) {
    indexCard(g, W, H, 'end');
    const rect = NOTE_RECTS.end;
    return hand.note(g, { id: 'box.end', text: `${question}\n→ now`, ...rect, size: 15, valign: 'top', seed: 'end', slant: -0.015 }, () => {
        const q = handInBox(g, question, { x: rect.x, y: rect.y, w: rect.w, h: rect.h * 0.5, sizeMax: 15, valign: 'top', seed: 'end', slant: -0.015 });
        // The arrow: from under the question's start, a loose swoop down and right.
        const r = rng('end-arrow');
        const x0 = rect.x + 14;
        const y0 = Math.min(q.bottom + 4, rect.y + rect.h * 0.6);
        const x1 = rect.x + rect.w * 0.6;
        const y1 = y0 + 18;
        g.save();
        g.strokeStyle = palette.ink;
        g.lineWidth = 0.7;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.globalAlpha = 0.9;
        g.beginPath();
        g.moveTo(x0, y0);
        g.bezierCurveTo(x0 - 2 + r.signed(0.6), y0 + 13, x0 + 22, y1 + 1.5, x1, y1);
        g.stroke();
        g.beginPath();
        g.moveTo(x1 - 4.2, y1 - 3.4);
        g.lineTo(x1, y1);
        g.lineTo(x1 - 4.6, y1 + 2.6);
        g.stroke();
        g.restore();
        const now = handInBox(g, 'now', { x: x1 + 3, y: y1 - 9, w: rect.x + rect.w - x1 - 3, h: 17, sizeMax: 18, valign: 'middle', seed: 'end-now', slant: -0.03 });
        return { size: q.size, fits: q.fits && now.fits, arrow: { x: x0 - 3, y: y0 - 2, w: x1 - x0 + 8, h: y1 - y0 + 6 } };
    });
}
