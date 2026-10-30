import { drawHandwriting, fitHandwriting } from '../../core/draw.js';
import { HAND } from '../../core/fonts.js';
import { palette } from '../../core/palette.js';

/**
 * Shae's hand, in the box: every handwritten thing is a NOTE with a stable id
 * and a rect (mm, on its face — layout.js NOTE_RECTS), typed in Shae Hand (the
 * font made from Shae's handwriting) and fitted into its rect, with its own
 * underlines and arrows where a painter draws them.
 */

export const HAND_WEIGHT = 600;

/**
 * Handwriting fitted into a box: the largest size up to `sizeMax` at which the
 * text fits (a one-line note set tighter — draw.js fitHandwriting), then drawn
 * centred (or top-aligned) in it — never overflowing. Returns the size used so
 * the caller can report it.
 */
export function handInBox(g, text, {
    x, y, w, h, sizeMax, sizeMin = 3.4, align = 'left', valign = 'middle', seed, color = palette.ink,
    lineHeight: spacing = HAND.lineHeight, slant = 0, weight = HAND_WEIGHT, wobble = HAND.wobble, tilt = HAND.tilt, stroke = 0
}) {
    // A few percent of slack for the wobble and per-line tilt.
    const maxWidth = w * 0.965;
    const fit = fitHandwriting(g, text, { maxWidth, maxHeight: h * 0.97, weight, lineHeight: spacing, sizeMax, sizeMin });
    const { lineHeight } = fit;
    const blockH = fit.lines.length * fit.size * lineHeight;
    const top = valign === 'top' ? y : valign === 'bottom' ? y + h - blockH : y + (h - blockH) / 2;
    const anchorX = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
    const res = drawHandwriting(g, fit.lines.join('\n'), {
        x: anchorX, y: top, size: fit.size, weight, lineHeight, color, align, seed,
        wobble, tilt, slant, stroke, maxLines: fit.lines.length, label: seed
    });
    return { size: fit.size, lines: fit.lines.length, fits: fit.fits, top, bottom: top + blockH, width: res.width, lineWidths: fit.lines };
}

const PEN_COLOR = { ink: palette.ink, red: palette.redPen, marker: palette.ink };

/** A marker draws wider than the pen the font was made with: this much of the size, all round. */
export const MARKER_STROKE = 0.045;

/**
 * The box's writer. `note(g, spec, fallback)`:
 *   spec      { id, text, x, y, w, h, size, weight, lineHeight, color, seed, align, valign, pen, … }
 *   fallback  () => result — the painter's own drawing of the note (defaults to handInBox(spec))
 * Returns the drawing's layout facts and `overflow`. `paint(draw)` paints now,
 * and again when the fonts land (ctx.paint).
 */
export function createHand(ctx) {
    const specFor = (spec) => ({
        face: 'hand', weight: HAND_WEIGHT, color: PEN_COLOR[spec.pen ?? 'ink'] ?? palette.ink, align: 'left', valign: 'middle', ...spec
    });

    /** A note typed: its own drawing (underlines, arrows) or Shae Hand fitted into its rect. */
    const typed = (g, full, fallback) => (fallback ? fallback() : handInBox(g, full.text, {
        x: full.x, y: full.y, w: full.w, h: full.h, sizeMax: full.size, sizeMin: full.sizeMin, align: full.align,
        valign: full.valign, seed: full.seed, color: full.color, lineHeight: full.lineHeight, slant: full.slant,
        weight: full.weight, wobble: full.wobble, tilt: full.tilt, stroke: full.pen === 'marker' ? MARKER_STROKE : 0
    }));

    function note(g, spec, fallback) {
        const drawn = typed(g, specFor(spec), fallback);
        return { ...(drawn ?? {}), overflow: drawn ? drawn.overflow === true || drawn.fits === false : false };
    }

    return { note, paint: (draw) => ctx.paint(draw) };
}

/** For painters called without a writer (node checks): every note typed. */
export const TYPED_ONLY = Object.freeze({
    note(g, spec, fallback) {
        const full = { weight: HAND_WEIGHT, color: PEN_COLOR[spec.pen ?? 'ink'], ...spec };
        const drawn = fallback ? fallback() : handInBox(g, full.text, { ...full, sizeMax: full.size, stroke: full.pen === 'marker' ? MARKER_STROKE : 0 });
        return { overflow: drawn ? drawn.fits === false : false, ...(drawn ?? {}) };
    },
    paint: (draw) => draw()
});
