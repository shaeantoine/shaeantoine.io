import * as THREE from 'three';
import { applyTextTexturePolicy } from '../scene/textTexture.js';
import { footprintScaleFor, MAX_CANVAS_PIXELS } from '../scene/textureBudget.js';
import { invalidate } from '../scene/renderScheduler.js';
import { font, HAND, loaded as fontsLoaded, whenLoaded as fontsWhenLoaded } from './fonts.js';
import { palette } from './palette.js';
import { rng } from './rng.js';
import { track } from './track.js';

/**
 * Canvases for things printed or written on, and the type that goes on them.
 *
 * Work in LOGICAL units of your choosing — millimetres of the real object are
 * the natural pick (a 4×6 print is 102 × 152 mm) — and let makeCanvas decide
 * how many pixels that deserves:
 *
 *   const { canvas, g } = makeCanvas(102, 152, { fill: 0.56, bufferHeight });
 *   g.fillStyle = palette.paper; g.fillRect(0, 0, 102, 152);
 *   drawHandwriting(g, 'Day one in tech.', { x: 6, y: 128, maxWidth: 90, size: 7, seed: 'amazon' });
 *   const texture = canvasTexture(canvas, { anisotropy });
 *
 * All text helpers take `y` as the TOP of the text block and lay lines out the
 * way CSS does (half-leading above and below), so a block drawn at y and one
 * drawn at `result.bottom` stack exactly.
 */

// ---------------------------------------------------------------------------
// Canvas + texture
// ---------------------------------------------------------------------------

/**
 * A canvas sized to how large the surface can appear, pre-scaled so you draw in
 * logical units.
 *
 * @param {number} logicalWidth
 * @param {number} logicalHeight
 * @param {object} [options]
 * @param {number} [options.fill=0.5] the largest fraction of the frame HEIGHT this
 *        surface fills in any shot (e.g. 0.56 for a print held in hand)
 * @param {[number, number]} [options.framing] or width/height directly, in frame
 *        heights (src/scene/textureBudget.js convention)
 * @param {number} [options.oversample=1.25] extra texels for crisp type
 * @param {number} [options.bufferHeight] DeskScene.getDrawingBufferHeight()
 * @param {number} [options.maxPixels] default 6 MP (the site's ceiling)
 * @returns {{ canvas: HTMLCanvasElement, g: CanvasRenderingContext2D, scale: number,
 *             width: number, height: number, clear(color?): void }}
 */
export function makeCanvas(logicalWidth, logicalHeight, {
    fill = 0.5,
    framing,
    oversample = 1.25,
    bufferHeight = 0,
    maxPixels = MAX_CANVAS_PIXELS
} = {}) {
    const frame = framing ?? [fill * (logicalWidth / logicalHeight), fill];
    const scale = footprintScaleFor(logicalWidth, logicalHeight, {
        framing: [frame[0] * oversample, frame[1] * oversample],
        bufferHeight,
        maxScale: 1e6, // logical units are the caller's; only the pixel ceiling limits
        maxPixels
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(logicalWidth * scale));
    canvas.height = Math.max(1, Math.round(logicalHeight * scale));
    const g = canvas.getContext('2d');
    g.setTransform(canvas.width / logicalWidth, 0, 0, canvas.height / logicalHeight, 0, 0);
    return {
        canvas,
        g,
        scale,
        width: logicalWidth,
        height: logicalHeight,
        clear(color) {
            g.save();
            g.setTransform(1, 0, 0, 1, 0, 0);
            if (color) {
                g.fillStyle = color;
                g.fillRect(0, 0, canvas.width, canvas.height);
            } else {
                g.clearRect(0, 0, canvas.width, canvas.height);
            }
            g.restore();
        }
    };
}

/** CanvasTexture tagged sRGB with the site's text sampling policy (mips + anisotropy). */
export function canvasTexture(canvas, { anisotropy = 1 } = {}) {
    return applyTextTexturePolicy(new THREE.CanvasTexture(canvas), anisotropy);
}

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

function setFont(g, { face, size, weight, style, letterSpacing }) {
    g.font = font({ face, size, weight, style });
    if ('letterSpacing' in g) g.letterSpacing = letterSpacing ? `${letterSpacing}px` : '0px';
}

/** Ascent/descent of the current font, falling back to typical proportions. */
function verticalMetrics(g, size) {
    const m = g.measureText('Hg');
    const ascent = m.fontBoundingBoxAscent ?? size * 0.8;
    const descent = m.fontBoundingBoxDescent ?? size * 0.2;
    return { ascent, descent };
}

/**
 * Greedy word wrap with the context's current font. Respects '\n'. A single
 * word wider than maxWidth gets a line to itself (never split).
 */
export function wrap(g, text, maxWidth = Infinity) {
    const lines = [];
    for (const paragraph of String(text).split('\n')) {
        const words = paragraph.split(/\s+/).filter(Boolean);
        if (words.length === 0) { lines.push(''); continue; }
        let line = words[0];
        for (let i = 1; i < words.length; i += 1) {
            const candidate = `${line} ${words[i]}`;
            if (g.measureText(candidate).width <= maxWidth) line = candidate;
            else { lines.push(line); line = words[i]; }
        }
        lines.push(line);
    }
    return lines;
}

/**
 * Wrapped text. Returns the layout so callers can stack blocks and detect
 * copy that does not fit its object (`overflow` — also logged as a warning,
 * because on this desk the object's size IS the word limit).
 *
 * @returns {{ lines: string[], lineCount: number, height: number, bottom: number,
 *             width: number, overflow: boolean }}
 */
export function drawText(g, text, {
    x = 0,
    y = 0,
    maxWidth = Infinity,
    maxLines = Infinity,
    face = 'inter',
    size = 16,
    weight = 400,
    style = 'normal',
    lineHeight = 1.3,
    color = palette.receiptInk,
    align = 'left',
    letterSpacing = 0,
    label
} = {}) {
    g.save();
    setFont(g, { face, size, weight, style, letterSpacing });
    let lines = wrap(g, text, maxWidth);
    const overflow = lines.length > maxLines;
    if (overflow) {
        console.warn(`[desk:draw] "${label ?? String(text).slice(0, 40)}…" needs ${lines.length} lines; ${maxLines} fit.`);
        lines = lines.slice(0, maxLines);
    }
    const { ascent, descent } = verticalMetrics(g, size);
    const lineBox = size * lineHeight;
    const halfLeading = (lineBox - (ascent + descent)) / 2;
    g.fillStyle = color;
    g.textAlign = align;
    g.textBaseline = 'alphabetic';
    let widest = 0;
    lines.forEach((line, i) => {
        const baseline = y + i * lineBox + halfLeading + ascent;
        g.fillText(line, x, baseline);
        widest = Math.max(widest, g.measureText(line).width);
    });
    g.restore();
    const height = lines.length * lineBox;
    return { lines, lineCount: lines.length, height, bottom: y + height, width: widest, overflow };
}

/**
 * Handwriting: Shae Hand (Shae's own letters), each line and word nudged a
 * little off the baseline and the line very slightly rotated, from a seed —
 * so the same note always wobbles the same way. Ink varies a touch per word.
 *
 * @param {object} options as drawText, plus:
 * @param {string|number} [options.seed] vary per note (e.g. the item id)
 * @param {number} [options.wobble=HAND.wobble] baseline wander, fraction of size
 * @param {number} [options.tilt=HAND.tilt] max per-line rotation, radians
 * @param {number} [options.slant=0] a constant rotation for the whole note, radians
 * @param {number} [options.stroke=0] a marker's extra width, fraction of size (the pen's own is the font's)
 */
export function drawHandwriting(g, text, {
    x = 0,
    y = 0,
    maxWidth = Infinity,
    maxLines = Infinity,
    face = 'hand',
    size = 32,
    weight = 500,
    lineHeight = HAND.lineHeight,
    color = palette.ink,
    align = 'left',
    seed = 'hand',
    wobble = HAND.wobble,
    tilt = HAND.tilt,
    slant = 0,
    stroke = 0,
    label
} = {}) {
    g.save();
    setFont(g, { face, size, weight, style: 'normal' });
    let lines = wrap(g, text, maxWidth);
    const overflow = lines.length > maxLines;
    if (overflow) {
        console.warn(`[desk:draw] handwritten "${label ?? String(text).slice(0, 40)}…" needs ${lines.length} lines; ${maxLines} fit.`);
        lines = lines.slice(0, maxLines);
    }
    const { ascent, descent } = verticalMetrics(g, size);
    const lineBox = size * lineHeight;
    const halfLeading = (lineBox - (ascent + descent)) / 2;
    const spaceWidth = g.measureText(' ').width;
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    g.fillStyle = color;
    if (stroke > 0) {
        g.strokeStyle = color;
        g.lineWidth = stroke * size;
        g.lineJoin = 'round';
        g.lineCap = 'round';
    }

    let widest = 0;
    lines.forEach((line, i) => {
        const r = rng(`${seed}:${i}`);
        const words = line.split(' ');
        const widths = words.map((word) => g.measureText(word).width);
        const lineWidth = widths.reduce((sum, w) => sum + w, 0) + spaceWidth * Math.max(0, words.length - 1);
        widest = Math.max(widest, lineWidth);
        let startX = x;
        if (align === 'center') startX = x - lineWidth / 2;
        if (align === 'right') startX = x - lineWidth;
        const baseline = y + i * lineBox + halfLeading + ascent + r.signed(wobble * size);
        g.save();
        g.translate(startX + r.signed(0.02 * size), baseline);
        g.rotate(slant + r.signed(tilt));
        let cursor = 0;
        words.forEach((word, w) => {
            g.globalAlpha = 0.86 + r() * 0.14;
            const lift = r.signed(wobble * 0.45 * size);
            if (stroke > 0) g.strokeText(word, cursor, lift);
            g.fillText(word, cursor, lift);
            cursor += widths[w] + spaceWidth * (0.9 + r() * 0.25);
        });
        g.restore();
    });
    g.restore();
    const height = lines.length * lineBox;
    return { lines, lineCount: lines.length, height, bottom: y + height, width: widest, overflow };
}

/**
 * The largest size (between sizeMin and sizeMax) at which `text` fits the box.
 * Use it to find out whether copy fits its object — not to shrink copy until it
 * does. @returns {{ size: number, lines: string[], fits: boolean }}
 */
export function fitText(g, text, {
    maxWidth,
    maxHeight,
    face = 'inter',
    weight = 400,
    style = 'normal',
    lineHeight = 1.3,
    sizeMax = 64,
    sizeMin = 4
} = {}) {
    g.save();
    let lo = sizeMin;
    let hi = sizeMax;
    let best = { size: sizeMin, lines: [], fits: false };
    for (let i = 0; i < 18; i += 1) {
        const size = (lo + hi) / 2;
        setFont(g, { face, size, weight, style });
        const lines = wrap(g, text, maxWidth);
        const fits = lines.length * size * lineHeight <= maxHeight
            && lines.every((line) => g.measureText(line).width <= maxWidth);
        if (fits) { best = { size, lines, fits: true }; lo = size; } else { hi = size; }
    }
    if (!best.fits) {
        setFont(g, { face, size: sizeMin, weight, style });
        best = { size: sizeMin, lines: wrap(g, text, maxWidth), fits: false };
    }
    g.restore();
    return best;
}

/**
 * fitText for handwriting: first at the hand's line height, and — if the text
 * comes out on one line — again at the tighter single-line height, which lets
 * a one-line note (a date, a tab, a label) be as large as its space allows
 * instead of leaving room for a second line that never comes.
 * @returns {{ size, lines, fits, lineHeight }} lineHeight: the one it fitted at
 */
export function fitHandwriting(g, text, {
    maxWidth,
    maxHeight,
    sizeMax,
    sizeMin = 3.4,
    face = 'hand',
    weight = 600,
    lineHeight = HAND.lineHeight,
    single = HAND.single
} = {}) {
    const many = fitText(g, text, { maxWidth, maxHeight, face, weight, lineHeight, sizeMax: sizeMax ?? maxHeight / lineHeight, sizeMin });
    if (many.lines.length > 1 || single >= lineHeight) return { ...many, lineHeight };
    const one = fitText(g, text, { maxWidth, maxHeight, face, weight, lineHeight: single, sizeMax: sizeMax ?? maxHeight / single, sizeMin });
    return one.fits && one.lines.length === 1 ? { ...one, lineHeight: single } : { ...many, lineHeight };
}

/**
 * Paper tooth: a faint seeded speckle multiplied over what's there. Cheap —
 * one small tile, patterned. Call before drawing type.
 */
export function grain(g, width, height, { seed = 'paper', amount = 0.05, tile = 96 } = {}) {
    const r = rng(seed);
    const tileCanvas = document.createElement('canvas');
    tileCanvas.width = tile;
    tileCanvas.height = tile;
    const t = tileCanvas.getContext('2d');
    const data = t.createImageData(tile, tile);
    for (let i = 0; i < data.data.length; i += 4) {
        const v = 255 - Math.round(r() * 255 * amount);
        data.data[i] = v; data.data[i + 1] = v; data.data[i + 2] = v; data.data[i + 3] = 255;
    }
    t.putImageData(data, 0, 0);
    g.save();
    g.globalCompositeOperation = 'multiply';
    // Pattern space is device pixels; undo the logical transform for it.
    const pattern = g.createPattern(tileCanvas, 'repeat');
    const m = g.getTransform();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = pattern;
    g.fillRect(0, 0, width * m.a, height * m.d);
    g.restore();
}

/**
 * Draws an image cover-fitted into a rect (cropping, never stretching), with
 * an optional focal point (0..1) deciding what survives the crop.
 */
export function drawImageCover(g, image, x, y, width, height, { focusX = 0.5, focusY = 0.5 } = {}) {
    const iw = image.naturalWidth || image.width;
    const ih = image.naturalHeight || image.height;
    if (!iw || !ih) return;
    const scale = Math.max(width / iw, height / ih);
    const sw = width / scale;
    const sh = height / scale;
    const sx = Math.min(iw - sw, Math.max(0, (iw - sw) * focusX));
    const sy = Math.min(ih - sh, Math.max(0, (ih - sh) * focusY));
    g.drawImage(image, sx, sy, sw, sh, x, y, width, height);
}

// ---------------------------------------------------------------------------
// Handwritten notes, in Shae Hand
// ---------------------------------------------------------------------------

const PEN_COLOURS = { ink: () => palette.ink, red: () => palette.redPen, marker: () => palette.ink };

/**
 * The typed note: the largest size of the handwriting face up to `size` (down
 * to `sizeMin`) at which the text fits the rect, set in it by align / valign —
 * the box module's handInBox, generalised. Never overflows: lines that can't
 * fit at sizeMin are dropped, and that is reported (overflow: true, and a warning).
 */
function drawTypedNote(g, { id, text, x, y, w, h, face, size, sizeMin, weight, lineHeight: spacing, color, seed, align, valign, slant, wobble, tilt, label }) {
    const fit = fitHandwriting(g, text, {
        maxWidth: w * 0.965, // a few percent of slack for the wobble and per-line tilt
        maxHeight: h * 0.97,
        face,
        weight,
        lineHeight: spacing,
        sizeMax: size,
        sizeMin: Math.min(sizeMin, size ?? Infinity)
    });
    const { lineHeight } = fit;
    let lines = fit.lines;
    const overflow = !fit.fits;
    if (overflow) {
        const room = Math.max(1, Math.floor((h * 0.97) / (fit.size * lineHeight)));
        if (lines.length > room) {
            console.warn(`[desk:draw] note "${label ?? id}" needs ${lines.length} lines at ${fit.size.toFixed(1)}; ${room} fit — the rest is left off (the object's size is the word limit).`);
            lines = lines.slice(0, room);
        }
    }
    const blockH = lines.length * fit.size * lineHeight;
    const top = valign === 'top' ? y : valign === 'bottom' ? y + h - blockH : y + (h - blockH) / 2;
    const anchorX = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
    drawHandwriting(g, lines.join('\n'), {
        x: anchorX,
        y: top,
        face,
        size: fit.size,
        weight,
        lineHeight,
        color,
        align: align === 'center' || align === 'right' ? align : 'left',
        seed,
        wobble,
        tilt,
        slant,
        maxLines: lines.length,
        label: label ?? id
    });
    return { size: fit.size, lines: lines.length, overflow };
}

/**
 * One handwritten note on an object.
 *
 *   drawNote(g, { id, text, x, y, w, h, face?, size?, weight?, lineHeight?, color?, seed?,
 *                 align?: 'left'|'center'|'right', valign?: 'top'|'middle'|'bottom',
 *                 pen?: 'ink'|'red'|'marker', sizeMin?, slant?, wobble?, tilt?, fallback?, label? })
 *     → { overflow: boolean }
 *
 * `fallback(g, rect)` if given (a module's own drawing, e.g. the monitor's
 * "now:" head), else `text` in the handwriting face (Shae Hand), fitted to the
 * rect (x, y, w, h — the note's writing area, in the canvas's units) and never
 * overflowing (defaults as the box's handInBox: weight 600, fonts.HAND's line
 * height, wobble and tilt, valign middle, size ≤ h, sizeMin 3.4; colour from
 * `pen`: ink / red pen / marker).
 *
 * Draw inside ctx.paint(…) so the canvas repaints when the fonts land.
 */
export function drawNote(g, {
    id,
    text = '',
    x = 0,
    y = 0,
    w,
    h,
    face = 'hand',
    size,
    sizeMin = 3.4,
    weight = 600,
    lineHeight = HAND.lineHeight,
    color,
    seed,
    align = 'left',
    valign = 'middle',
    pen = 'ink',
    slant = 0,
    wobble = HAND.wobble,
    tilt = HAND.tilt,
    fallback,
    label
} = {}) {
    const width = Number(w);
    const height = Number(h);
    if (typeof fallback === 'function') {
        const result = fallback(g, { x, y, w: width, h: height });
        return { overflow: result?.overflow === true || result?.fits === false };
    }
    if (!(width > 0 && height > 0)) return { overflow: Boolean(text) };
    const typed = drawTypedNote(g, {
        id,
        text,
        x,
        y,
        w: width,
        h: height,
        face,
        size,
        sizeMin,
        weight,
        lineHeight,
        color: color ?? (PEN_COLOURS[pen] ?? PEN_COLOURS.ink)(),
        seed: seed ?? id ?? 'note',
        align,
        valign,
        slant,
        wobble,
        tilt,
        label
    });
    return { overflow: typed.overflow };
}

/**
 * Paint now, and again once the fonts land if they have not yet (as
 * fonts.paint does, with this module's error labels). `draw` redraws its
 * canvas and sets `texture.needsUpdate`; the frame is requested afterwards.
 * The repaint is tracked, so __desk.settled() waits for it. Use it for every
 * canvas with handwriting on it.
 */
export function paint(drawFn) {
    const run = (label) => {
        try {
            drawFn();
        } catch (error) {
            console.error(`[desk:draw] ${label} failed`, error);
        }
    };
    run('paint');
    if (!fontsLoaded()) {
        track(fontsWhenLoaded().then(() => { run('font repaint'); invalidate(); }), 'font repaint');
    }
}

export const draw = { makeCanvas, canvasTexture, wrap, text: drawText, handwriting: drawHandwriting, fit: fitText, fitHandwriting, note: drawNote, paint, grain, imageCover: drawImageCover, font };
