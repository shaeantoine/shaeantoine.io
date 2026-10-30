import { palette } from '../../core/palette.js';
import { rng } from '../../core/rng.js';
import { drawText, drawHandwriting, fitHandwriting, grain } from '../../core/draw.js';
import { HAND } from '../../core/fonts.js';
import { A4 } from './layout.js';
import { PAPERS } from './copy.js';
import { FIGURE_MM, FIGURE_LAYOUT, drawFigureAxes, plotPoint } from './figure.js';

/**
 * PAPER — the canvas painters, in millimetres of the A4 page (210 × 297).
 *
 *   paintTypesetCover   the triangulations paper's front page, set like a student paper
 *   paintMargin         the back of a document: Shae's one margin page
 *
 * Every handwritten thing is a NOTE (a rect, a colour and a seed; its id and pen
 * are labels, as in box/hand.js), typed in Shae Hand and
 * fitted to its rect, never overflowing it. Pens: ink (blue-black), red, and
 * PENCIL for the P vs NP prior and the figure's labels — graphite, a little
 * smudged (pencilled, below).
 */

export const PENCIL = '#77756f';

/** The one page every margin note is written on. Rects in page mm (x from the left, y from the top). */
export const RECTS = Object.freeze({
    line: Object.freeze({ x: 20, y: 24, w: 170, h: 46 }),
    lineOnly: Object.freeze({ x: 20, y: 30, w: 170, h: 62 }),
    note: Object.freeze({ x: 20, y: 80, w: 170, h: 64 }),
    aside: Object.freeze({ x: 100, y: 8, w: 96, h: 12 }),
    // The triangulations figure: its canvas sits here on the page.
    figure: Object.freeze({ x: 20, y: 152, w: FIGURE_MM.w, h: FIGURE_MM.h }),
    figureY: Object.freeze({ x: 122, y: 149, w: 68, h: 9 }),
    figureX: Object.freeze({ x: 150, y: 219.5, w: 40, h: 8.5 }),
    figureBound: Object.freeze({ x: 123, y: 212.3, w: 26, h: 7 }),
    figureLabel: Object.freeze({ x: 20, y: 238, w: 150, h: 10 }),
    // The P vs NP prior, in pencil.
    prior: Object.freeze({ x: 100, y: 160, w: 90, h: 15 }),
    loosely: Object.freeze({ x: 128, y: 176, w: 62, h: 10 }),
    thread: Object.freeze({ x: 20, y: 214, w: 170, h: 42 })
});

/** The sizes each note is set at (mm, the largest the fit may use). */
const SIZES = Object.freeze({ line: 11.5, lineOnly: 12.5, note: 8.8, aside: 7.6, prior: 9.8, loosely: 7.4, thread: 8.6, figure: 6.4 });

export const noteId = (paperId, part) => `paper.${paperId}.${part}`;

/**
 * A hand-drawn arrow, left to right: a shaft with a little lift and an open
 * head (the box draws its threads' arrows the same way). mm.
 */
function drawArrow(g, x, y, len, { color = palette.ink, width = 0.5, seed = 'arrow' } = {}) {
    const r = rng(`paper-arrow:${seed}`);
    const x1 = x + len;
    const y1 = y - 0.6;
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
    const a = Math.atan2(-0.7, len * 0.3) + r.signed(0.04);
    const head = 2.6;
    g.beginPath();
    g.moveTo(x1 - head * Math.cos(a - 0.5), y1 - head * Math.sin(a - 0.5));
    g.lineTo(x1, y1);
    g.lineTo(x1 - head * Math.cos(a + 0.55), y1 - head * Math.sin(a + 0.55));
    g.stroke();
    g.restore();
    return { x1, y1 };
}

/** Shae Hand fitted into a rect (the typed note), never overflowing. */
function handInBox(g, text, { x, y, w, h, size, sizeMin = 3.4, align = 'left', valign = 'top', seed, color = palette.ink, slant = 0 }) {
    const fit = fitHandwriting(g, text, { maxWidth: w * 0.965, maxHeight: h * 0.97, weight: 600, sizeMax: size, sizeMin });
    const blockH = fit.lines.length * fit.size * fit.lineHeight;
    const top = valign === 'top' ? y : valign === 'bottom' ? y + h - blockH : y + (h - blockH) / 2;
    const ax = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
    drawHandwriting(g, fit.lines.join('\n'), {
        x: ax, y: top, size: fit.size, weight: 600, lineHeight: fit.lineHeight, color, align, seed,
        wobble: HAND.wobble, tilt: HAND.tilt, slant, maxLines: fit.lines.length, label: seed
    });
    return { size: fit.size, fits: fit.fits, bottom: top + blockH };
}

/**
 * The writer: each note typed — Shae Hand fitted into its rect (handInBox),
 * or, given `fallback`, the note drawn its own way (the thread's sentence,
 * arrow and label).
 */
function writer() {
    return (g, spec, fallback) => (fallback ? fallback() : handInBox(g, spec.text, spec));
}

/** Pencil: graphite, a little smudged — the note drawn once soft and offset, then once crisp. */
function pencilled(g, draw) {
    g.save();
    g.globalAlpha = 0.22;
    if ('filter' in g) g.filter = `blur(${((g.getTransform?.().a ?? 5) * 0.18).toFixed(2)}px)`; // ≈ 0.18 mm
    g.translate(0.35, 0.28);
    draw();
    g.restore();
    g.save();
    g.globalAlpha = 0.8;
    draw();
    g.restore();
}

// ---------------------------------------------------------------------------
// The triangulations cover (typeset — swap for a render: see copy.js)
// ---------------------------------------------------------------------------

/** Where its title sits (fractions of the page height) and its cap height, for the reading distance. */
export const TYPESET = Object.freeze({ titleTop: 46, titleSize: 11.5, capEm: 0.68 });
export const TYPESET_CAP_PX = (TYPESET.titleSize * TYPESET.capEm / A4.h) * 1400; // as if a 1400 px render

export function paintTypesetCover(g, { title, lines, year }) {
    const W = A4.w;
    g.fillStyle = '#fbfaf6';
    g.fillRect(0, 0, W, A4.h);
    grain(g, W, A4.h, { seed: 'triangulations-cover', amount: 0.012 });
    const ink = '#1d1d1b';
    const t = drawText(g, title, {
        x: W / 2, y: TYPESET.titleTop, maxWidth: 164, maxLines: 3, face: 'newsreader', size: TYPESET.titleSize,
        weight: 500, lineHeight: 1.28, color: ink, align: 'center'
    });
    let y = t.bottom + 11;
    for (const line of lines) {
        const r = drawText(g, line, { x: W / 2, y, maxWidth: 160, face: 'newsreader', size: 4.6, weight: 400, color: ink, align: 'center' });
        y = r.bottom + 1.2;
    }
    drawText(g, year, { x: W / 2, y: y + 5, maxWidth: 60, face: 'newsreader', size: 4.6, weight: 400, color: ink, align: 'center' });
    drawText(g, '1', { x: W / 2, y: 278, maxWidth: 20, face: 'newsreader', size: 3.6, weight: 400, color: ink, align: 'center' });
    return { titleBand: [TYPESET.titleTop / A4.h, t.bottom / A4.h] };
}

// ---------------------------------------------------------------------------
// The margin page
// ---------------------------------------------------------------------------

function paperBack(g, seed) {
    g.fillStyle = palette.paper;
    g.fillRect(0, 0, A4.w, A4.h);
    grain(g, A4.w, A4.h, { seed: `paper-${seed}`, amount: 0.035 });
}

/** The thread (typed): the sentence, then on its own row a drawn arrow and where it goes. */
function drawThreadTyped(g, rect, { line, label, seed }) {
    const text = handInBox(g, line, { x: rect.x, y: rect.y, w: rect.w, h: rect.h * 0.62, size: SIZES.thread, seed: `${seed}-thread`, slant: -0.008 });
    const size = Math.min(9, Math.max(6.4, text.size * 1.04));
    const rowTop = Math.min(text.bottom + 1.6, rect.y + rect.h - size * 1.12);
    const arrow = drawArrow(g, rect.x + 1.5, rowTop + size * 0.62, 16, { seed });
    handInBox(g, label, { x: arrow.x1 + 2.4, y: rowTop, w: rect.x + rect.w - arrow.x1 - 2.4, h: size * 1.15, size, seed: `${seed}-to`, slant: -0.008 });
    return { fits: text.fits };
}

/** A red-pen bracket in the left margin, beside a passage — an annotation, not words. */
function redBracket(g, x, y0, y1, seed) {
    const r = rng(`bracket-${seed}`);
    g.save();
    g.strokeStyle = palette.redPen;
    g.globalAlpha = 0.85;
    g.lineWidth = 0.55;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x + 2.2, y0 + r.signed(0.3));
    g.quadraticCurveTo(x - 0.4, y0 + 1, x + r.signed(0.2), y0 + 4);
    g.quadraticCurveTo(x - 0.6 + r.signed(0.3), (y0 + y1) / 2, x + r.signed(0.2), y1 - 4);
    g.quadraticCurveTo(x - 0.4, y1 - 1, x + 2.2, y1 + r.signed(0.3));
    g.stroke();
    g.restore();
}

/**
 * The margin page for `id`. Returns { thread: rect|null } — the thread's rect
 * (page mm) is what a click follows.
 */
export function paintMargin(g, id) {
    const paper = PAPERS[id];
    const note = writer();
    paperBack(g, id);
    const out = { thread: null };

    if (paper.aside) {
        note(g, { id: noteId(id, 'aside'), text: paper.aside, ...RECTS.aside, size: SIZES.aside, pen: 'red', color: palette.redPen, align: 'right', valign: 'middle', seed: `${id}-aside`, slant: -0.03 });
    }
    const lineRect = paper.note ? RECTS.line : RECTS.lineOnly;
    note(g, { id: noteId(id, 'line'), text: paper.line, ...lineRect, size: paper.note ? SIZES.line : SIZES.lineOnly, seed: `${id}-line`, slant: -0.006 });
    if (paper.note) {
        note(g, { id: noteId(id, 'note'), text: paper.note, ...RECTS.note, size: SIZES.note, seed: `${id}-note`, slant: -0.004 });
    }

    if (paper.figure) {
        redBracket(g, 13.5, RECTS.note.y + 1, RECTS.note.y + RECTS.note.h - 6, id);
        const f = RECTS.figure;
        drawFigureAxes(g, f.x, f.y, { pencil: PENCIL, ink: palette.ink });
        const pencilNote = (part, rect, text, extra = {}) => pencilled(g, () => note(g, {
            id: noteId(id, part), text, ...rect, size: SIZES.figure, color: PENCIL, valign: 'middle', seed: `${id}-${part}`, ...extra
        }));
        pencilNote('figure.y', RECTS.figureY, paper.figure.yAxis);
        pencilNote('figure.x', RECTS.figureX, paper.figure.xAxis, { align: 'right' });
        pencilNote('figure.bound', RECTS.figureBound, paper.figure.bound);
        pencilNote('figure.label', RECTS.figureLabel, paper.figure.label, { size: 7 });
    }

    if (paper.pencil) {
        pencilled(g, () => {
            note(g, { id: noteId(id, 'prior'), text: paper.pencil.prior, ...RECTS.prior, size: SIZES.prior, color: PENCIL, valign: 'middle', seed: `${id}-prior`, slant: -0.05 });
            note(g, { id: noteId(id, 'loosely'), text: paper.pencil.loosely, ...RECTS.loosely, size: SIZES.loosely, color: PENCIL, valign: 'middle', seed: `${id}-loosely`, slant: -0.05 });
        });
    }

    if (paper.thread) {
        const t = paper.thread;
        const rect = RECTS.thread;
        note(g, { id: noteId(id, 'thread'), text: `${t.line} → ${t.label}`, ...rect, size: SIZES.thread, seed: `${id}-thread`, slant: -0.008 },
            () => drawThreadTyped(g, rect, { line: t.line, label: t.label, seed: id }));
        out.thread = rect;
    }
    return out;
}

/** For the figure overlay: where the curve's head sits, so node can check it clears the labels. */
export function figureHeadAt(ratio, t) {
    const [x, y] = plotPoint(t, ratio);
    return { x: RECTS.figure.x + x, y: RECTS.figure.y + y };
}

export { FIGURE_LAYOUT };
