import { FONT_FAMILY } from '../focus/strategies/screenCanvas.js';
import { stockFor } from '../focus/strategies/pageCanvas.js';
import { deviceScaleFor } from './textureBudget.js';

/**
 * The face of the printout on top of the paper stack — a title block, two
 * columns of body text and a figure — drawn to a canvas used as the top face
 * of one sheet.
 *
 * WHY THIS EXISTS AT ALL. The stack used to be blank sheets, and a blank sheet
 * is not an object: from the establishing shot it is a pale rectangle that
 * could be paper, a mousemat or a spill. Everything else clickable on this desk
 * announces itself — the monitor is lit and has a document open on it, the
 * bench is unmistakably a bench — and the research had nothing. A title block
 * and two ragged columns are what make a white rectangle read as a paper, at a
 * size where not one word of it resolves.
 *
 * THE BODY IS NOT TEXT, AND THAT IS DELIBERATE. It is rules: one per line, with
 * ragged paragraph ends, seeded off the title. At the distance this is ever
 * seen, real type would rasterise to the same grey mush at several times the
 * cost, and the moment anybody gets close enough to read it the focus strategy
 * has already laid real, paginated pages over the top (see
 * focus/strategies/sheetStrategy.js). What has to be honest here is the
 * *shape* of a page, and the title is honest because it comes from the Work.
 *
 * The imports are against the usual direction — palette from the page stock,
 * face from the screen canvas. Both are deliberate and narrow, for the reason
 * scene/idleScreenCanvas.js gives for the same import: this sheet and the
 * pages that later cover it are the same piece of paper, and a private copy of
 * the stock here would let the two drift into different colours.
 */

// Canvas pixels per world unit. An A5 sheet is 0.474 across and covers roughly
// 120 CSS px at the establishing shot, so this leaves a bit over 2x the device
// pixels it can ever occupy — the same margin the book spines are given, and
// for the same reason: enough for the mip chain to work with, no more.
export const SHEET_PIXELS_PER_UNIT = 1200;

const MARGIN_X = 0.085; // fraction of sheet width
const MARGIN_TOP = 0.072; // fractions of sheet height from here down
const MARGIN_BOTTOM = 0.055;

const TITLE_SIZE = 0.045;
const CREDIT_SIZE = 0.024;
const TITLE_TOP = 0.115; // where the title block's rule sits
const BODY_TOP = 0.155;

const COLUMN_GUTTER = 0.055; // fraction of sheet width
const LINE_HEIGHT = 0.0235; // fraction of sheet height
const RULE_THICKNESS = 0.0072;
const RULE_ALPHA = 0.34;

// Paragraphs run 4–9 lines and end short, which is the only thing separating
// a column of text from a barcode.
const MIN_PARAGRAPH = 4;
const MAX_PARAGRAPH = 9;
const PARAGRAPH_GAP = 0.6; // in line heights

const FIGURE_HEIGHT = 0.17; // fraction of sheet height
const FIGURE_AFTER_LINES = 5; // how far down the right column it sits

/**
 * Canvas dimensions for a sheet of this size.
 *
 * Sized per sheet rather than to one fixed shape, for the same reason the
 * spines and badges are: a shared canvas would set the type at a different
 * size on any sheet whose proportions were nudged.
 */
export function sheetCanvasSize(width, height, bufferHeight) {
    const density = SHEET_PIXELS_PER_UNIT * deviceScaleFor(bufferHeight);
    return {
        width: Math.max(96, Math.round(width * density)),
        height: Math.max(128, Math.round(height * density))
    };
}

/** Mulberry32, seeded off the title so one paper always greeks the same way. */
function createRandom(text) {
    let state = 0;
    for (let i = 0; i < text.length; i++) state = (state * 31 + text.charCodeAt(i)) >>> 0;
    return function random() {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** The largest size at which `text` fits `maxWidth`, never larger than `maxSize`. */
function fitFontSize(ctx, text, weight, maxWidth, maxSize) {
    const REFERENCE = 100;
    ctx.font = `${weight} ${REFERENCE}px ${FONT_FAMILY}`;
    const width = ctx.measureText(text).width;
    if (width === 0) return maxSize;
    return Math.min(maxSize, (maxWidth / width) * REFERENCE);
}

/**
 * One column of greeked body text.
 *
 * @returns {number} the y it stopped at, so the caller can slot a figure in
 */
function drawColumn(ctx, { x, top, bottom, width, lineHeight, ruleHeight, random, skip }) {
    let y = top;
    let remaining = 0;
    let index = 0;

    while (y + ruleHeight <= bottom) {
        if (remaining === 0) {
            remaining = MIN_PARAGRAPH + Math.floor(random() * (MAX_PARAGRAPH - MIN_PARAGRAPH + 1));
            if (index > 0) y += lineHeight * PARAGRAPH_GAP;
            if (y + ruleHeight > bottom) break;
        }
        // The last line of a paragraph stops somewhere between a third and
        // nine-tenths of the measure; every other line is full but for the
        // hairline of slop a justified column never quite has.
        const isLast = remaining === 1;
        const length = isLast ? width * (0.32 + random() * 0.58) : width * (0.97 + random() * 0.03);

        if (!skip?.(y, ruleHeight)) ctx.fillRect(x, y, Math.min(length, width), ruleHeight);
        y += lineHeight;
        remaining -= 1;
        index += 1;
    }

    return y;
}

/** A small plotted figure: a framed box, two axes and a rising curve. */
function drawFigure(ctx, { x, y, width, height, ink, random }) {
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1, height * 0.012);
    ctx.strokeRect(x, y, width, height);

    const padX = width * 0.14;
    const padY = height * 0.14;
    const plotLeft = x + padX;
    const plotRight = x + width - padX * 0.6;
    const plotTop = y + padY;
    const plotBottom = y + height - padY;

    ctx.globalAlpha = 0.65;
    ctx.beginPath();
    ctx.moveTo(plotLeft, plotTop);
    ctx.lineTo(plotLeft, plotBottom);
    ctx.lineTo(plotRight, plotBottom);
    ctx.stroke();

    // A curve that rises and flattens — the shape almost every convergence
    // plot in this field has, which is the point of drawing one at all.
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const value = 1 - Math.exp(-3.1 * t);
        const jitter = (random() - 0.5) * 0.07;
        const px = plotLeft + (plotRight - plotLeft) * t;
        const py = plotBottom - (plotBottom - plotTop) * Math.min(1, Math.max(0, value + jitter));
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
}

/**
 * @param {HTMLCanvasElement} canvas sized by sheetCanvasSize
 * @param {{ title: string, credit?: string, color: string, paper?: string }} sheet
 *        `paper` names a stock in pageCanvas.PAPER_STOCKS; `color` is the
 *        part's own colour and is only a fallback for the ground.
 */
export function drawSheet(canvas, { title, credit, color, paper = 'manuscript' }) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const stock = stockFor(paper);
    const random = createRandom(title ?? '');

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // The map replaces this face outright, so the ground has to be painted
    // here rather than left to the material's own colour.
    ctx.fillStyle = stock.paper ?? color;
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    const margin = width * MARGIN_X;
    const contentWidth = width - margin * 2;

    const titleSize = fitFontSize(ctx, title, '600', contentWidth, height * TITLE_SIZE);
    ctx.font = `600 ${titleSize}px ${FONT_FAMILY}`;
    ctx.fillStyle = stock.text;
    ctx.fillText(title, margin, height * MARGIN_TOP + titleSize);

    if (credit) {
        const creditSize = fitFontSize(ctx, credit, '400', contentWidth, height * CREDIT_SIZE);
        ctx.font = `400 ${creditSize}px ${FONT_FAMILY}`;
        ctx.fillStyle = stock.muted;
        ctx.fillText(credit, margin, height * MARGIN_TOP + titleSize + creditSize * 1.7);
    }

    // The rule under the title block — the single cue that says "this came out
    // of a printer" rather than "this is a page of a book".
    ctx.strokeStyle = stock.rule ?? stock.muted;
    ctx.lineWidth = Math.max(1, height * 0.0018);
    ctx.beginPath();
    ctx.moveTo(margin, height * TITLE_TOP);
    ctx.lineTo(width - margin, height * TITLE_TOP);
    ctx.stroke();

    const gutter = width * COLUMN_GUTTER;
    const columnWidth = (contentWidth - gutter) / 2;
    const lineHeight = height * LINE_HEIGHT;
    const ruleHeight = Math.max(1, height * RULE_THICKNESS);
    const top = height * BODY_TOP;
    const bottom = height * (1 - MARGIN_BOTTOM) - lineHeight;

    ctx.fillStyle = stock.text;
    ctx.globalAlpha = RULE_ALPHA;
    drawColumn(ctx, { x: margin, top, bottom, width: columnWidth, lineHeight, ruleHeight, random });

    // The figure interrupts the right column rather than sitting under it, the
    // way a single-column-wide figure actually lands in a two-column paper.
    const figureTop = top + lineHeight * FIGURE_AFTER_LINES;
    const figureHeight = height * FIGURE_HEIGHT;
    const figureBottom = figureTop + figureHeight;
    drawColumn(ctx, {
        x: margin + columnWidth + gutter,
        top,
        bottom,
        width: columnWidth,
        lineHeight,
        ruleHeight,
        random,
        skip: (y, lineDepth) => y + lineDepth > figureTop && y < figureBottom
    });
    ctx.globalAlpha = 1;

    drawFigure(ctx, {
        x: margin + columnWidth + gutter,
        y: figureTop,
        width: columnWidth,
        height: figureHeight,
        ink: stock.text,
        random
    });

    ctx.font = `400 ${height * 0.02}px ${FONT_FAMILY}`;
    ctx.fillStyle = stock.muted;
    ctx.textAlign = 'center';
    ctx.fillText('1', width / 2, height * (1 - MARGIN_BOTTOM * 0.5));
}
