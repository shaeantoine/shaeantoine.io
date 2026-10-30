import { FONT_FAMILY } from './screenCanvas.js';
import { deviceScaleFor } from './textureBudget.js';

/**
 * Lettering for a single book spine, drawn to a canvas used as the front face
 * of one book in the row.
 *
 * A spine is a very tall, very narrow surface — around 0.11 by 0.58 world
 * units, so about 1 : 5 — and the type runs down it rather than across. Nearly
 * everything here follows from that one fact: the canvas is sized from the
 * book's own dimensions rather than a fixed shape, the whole text block is
 * drawn under a quarter-turn, and the title's size is solved for rather than
 * chosen, because a six-character title and a thirty-eight-character one have
 * to share a layout.
 *
 * Reading direction is top-to-bottom, which is the Anglo convention: shelve
 * the book upright and you tilt your head to the right to read it.
 */

// Canvas pixels per world unit. A spine is ~18 screen px wide at the
// establishing shot on a 900px viewport, so at 900 px/unit a 0.11 spine gets a
// 99 px canvas — a bit over 2x the device pixels it will ever occupy on a
// retina display, which is enough for the mipmap chain to have something to
// work with without paying for detail nobody can resolve.
export const SPINE_PIXELS_PER_UNIT = 900;

// Type is inset from both long edges of the spine. Real binding leaves more
// margin than feels right on screen, and crowding the edges is what makes
// lettering read as a decal rather than as stamping.
const TEXT_WIDTH_FRACTION = 0.62;

// Where the title's run starts and ends down the spine, and where the author
// sits. Leaving the bottom fifth to the author is the ordinary arrangement.
const TITLE_START = 0.08;
const TITLE_END = 0.74;
const AUTHOR_END = 0.94;
const AUTHOR_SCALE = 0.58;

// Two rules across the spine, as on a cloth binding. They cost two fillRects
// and do a surprising amount of the work of making this read as a book at a
// size where the type does not resolve.
const RULE_POSITIONS = [0.035, 0.965];
const RULE_THICKNESS = 0.012;

/**
 * Canvas dimensions for a spine of this size.
 *
 * Sized per book rather than to one fixed shape: the books vary from 0.065 to
 * 0.155 thick, so a shared canvas would stretch the type differently on every
 * one of them.
 */
export function spineCanvasSize(thickness, height, bufferHeight) {
    const density = SPINE_PIXELS_PER_UNIT * deviceScaleFor(bufferHeight);
    return {
        width: Math.max(24, Math.round(thickness * density)),
        height: Math.max(48, Math.round(height * density))
    };
}

/** Perceived lightness of a #rrggbb string, 0..1. */
export function luminanceOf(hex) {
    const value = parseInt(hex.slice(1), 16);
    const r = ((value >> 16) & 255) / 255;
    const g = ((value >> 8) & 255) / 255;
    const b = (value & 255) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Ink for a given binding colour: warm off-white on dark cloth, near-black on
 * light. The warm tint stands in for foil, which is what most of these would
 * actually be stamped with, and it keeps the spines from reading as printed
 * white text.
 */
export function inkFor(hex) {
    return luminanceOf(hex) > 0.45 ? '#241f1a' : '#e8e0cf';
}

/**
 * The largest font size at which `text` fits `maxLength`, never larger than
 * `maxSize`.
 *
 * Measured at a reference size and scaled rather than searched: text advance is
 * linear in font size, so one measurement answers it exactly.
 */
function fitFontSize(ctx, text, weight, maxLength, maxSize) {
    const REFERENCE = 100;
    ctx.font = `${weight} ${REFERENCE}px ${FONT_FAMILY}`;
    const width = ctx.measureText(text).width;
    if (width === 0) return maxSize;
    return Math.min(maxSize, (maxLength / width) * REFERENCE);
}

/**
 * @param {HTMLCanvasElement} canvas sized by spineCanvasSize
 * @param {{ title: string, author?: string, color: string }} spine
 */
export function drawBookSpine(canvas, { title, author, color }) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);

    // A spine is round, not flat. Darkening both long edges is the cheapest
    // possible stand-in for that curvature and it survives being shrunk to
    // eighteen pixels, where an actual rounded mesh would not.
    const shading = ctx.createLinearGradient(0, 0, width, 0);
    shading.addColorStop(0, 'rgba(0, 0, 0, 0.34)');
    shading.addColorStop(0.32, 'rgba(0, 0, 0, 0)');
    shading.addColorStop(0.72, 'rgba(255, 255, 255, 0.06)');
    shading.addColorStop(1, 'rgba(0, 0, 0, 0.30)');
    ctx.fillStyle = shading;
    ctx.fillRect(0, 0, width, height);

    const ink = inkFor(color);
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.55;
    for (const position of RULE_POSITIONS) {
        ctx.fillRect(
            width * 0.18,
            height * position - (height * RULE_THICKNESS) / 2,
            width * 0.64,
            Math.max(1, height * RULE_THICKNESS)
        );
    }
    ctx.globalAlpha = 1;

    // Everything below is drawn a quarter turn clockwise. In this frame the
    // first coordinate runs *down* the spine and the second runs across it,
    // with zero on the spine's centre line — so `textBaseline: middle` at zero
    // centres the type between the long edges whatever size it ends up.
    ctx.translate(width / 2, 0);
    ctx.rotate(Math.PI / 2);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    const maxTypeSize = width * TEXT_WIDTH_FRACTION;

    const titleSize = fitFontSize(ctx, title, '600', height * (TITLE_END - TITLE_START), maxTypeSize);
    ctx.font = `600 ${titleSize}px ${FONT_FAMILY}`;
    ctx.fillStyle = ink;
    ctx.fillText(title, height * TITLE_START, 0);

    if (!author) return;

    // Anchored to the foot of the spine rather than run on from the title, so
    // the gap between them absorbs the difference between a short title and a
    // long one instead of the author drifting up and down the spine.
    const authorSize = fitFontSize(ctx, author, '500', height * 0.2, maxTypeSize * AUTHOR_SCALE);
    ctx.font = `500 ${authorSize}px ${FONT_FAMILY}`;
    ctx.globalAlpha = 0.82;
    ctx.textAlign = 'right';
    ctx.fillText(author, height * AUTHOR_END, 0);
}
