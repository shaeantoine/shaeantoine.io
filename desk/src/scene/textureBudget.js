/**
 * How large a canvas-backed texture is allowed to be.
 *
 * WHY THIS EXISTS. Every canvas in this app — the monitor's resting screen, the
 * focused screen, the three page planes — used to be allocated at a hardcoded
 * `RESOLUTION_SCALE = 3`. That reads as a small number and is not one. The
 * display's canvas is 1787 x 1000 logical, so 3x is 5361 x 3000: sixteen
 * megapixels, 64 MB of RGBA on the CPU and another 64 MB (85 with mips) once
 * it's uploaded. The book allocates three of those at 3024 x 4200 apiece. A
 * desk with the monitor resting and a book open was asking for something like
 * 300 MB of texture memory to show two pages of prose.
 *
 * Chrome mostly absorbs that. Safari does not — its per-tab GPU budget is
 * tighter, and the failure mode is not an error but degradation: evicted
 * textures, stalled uploads, and a scene that feels heavy for reasons nothing
 * in the code points at.
 *
 * THE FIX IS NOT "PICK A SMALLER CONSTANT", because the right number genuinely
 * differs per machine and per surface. So the scale is derived from two bounds
 * and the smaller wins:
 *
 *   1. The pixels the surface actually covers on screen, measured. A texture
 *      with more texels than that is minified — sampled from a blurrier mip
 *      level — so oversampling does not buy sharpness, it spends memory to
 *      lose some. Fewer texels is worse still: that is magnification.
 *   2. A flat ceiling on total texels, which is what keeps a big display from
 *      talking us into a 60 MB texture. Past this point the honest answer is
 *      that the scene is memory-bound and a sharper page is not worth it.
 *
 * THE FIRST BOUND USED TO BE A GUESS AND IS NOW A MEASUREMENT, which is the
 * substantive change since. It was a hand-written `coverage` fraction of the
 * viewport's WIDTH — 0.5 for a book page, 0.92 for the monitor — and both were
 * wrong in the same structural way. three's fov is vertical, so an object's
 * size in pixels depends on the buffer's HEIGHT and its own angular size,
 * never on the window's width; a width fraction therefore holds at one window
 * shape and drifts at every other, and drifts OPEN in a tall one, handing back
 * fewer texels than the surface covers. `anchor.framing` replaces it with both
 * extents measured off the real focus camera, in units of buffer height, by
 * `node scripts/analyze-focus-cameras.mjs`.
 *
 * Surfaces that no focus camera frames — the badge, the book spines, the
 * resting top sheet — keep their own pixels-per-world-unit constants and take
 * `deviceScaleFor` instead, which is the same idea with the angular size baked
 * into the constant rather than measured.
 */
/**
 * Ceiling on a single canvas texture, in pixels. 6 MP is ~24 MB as RGBA,
 * ~32 MB once mipmapped.
 *
 * RAISED FROM 4.2 MP, AND PAID FOR BY THE PAGES. Sizing canvases from their
 * measured footprint rather than from a guessed fraction of the window took the
 * three page canvases from 3.2 MP each to about 1.1 — some 6 MP back on the one
 * object that allocates three at once — and the old ceiling was the only thing
 * left under-resolving the monitor. At a 2880-pixel-tall buffer the focused
 * readout wants 1.88x its logical size and 4.2 MP could only give it 1.53,
 * which is a 0.82 texel:pixel ratio: outright magnification, on the largest
 * piece of type in the scene.
 *
 * It is still a ceiling and it still binds on the densest displays. That is the
 * intended behaviour — past this point the honest answer is that the scene is
 * memory-bound and a sharper panel is not worth another 8 MB, especially on
 * Safari, whose per-tab GPU budget is tighter and whose failure mode is not an
 * error but eviction, stalled uploads, and a scene that feels heavy for reasons
 * nothing in the code points at.
 */
export const MAX_CANVAS_PIXELS = 6e6;

/**
 * The thinnest stroke any of these canvases draws, in logical units.
 *
 * WHY IT SETS THE FLOOR. Sizing a canvas to its footprint lets the scale fall
 * well below 1 — a book page on a 1080p display at DPR 1 wants about 0.5 — and
 * nothing about type objects to that: glyphs are filled shapes and scale
 * cleanly. Hairlines do not. `pageCanvas` rules its margins and underlines its
 * headers at 1.5 and 2 logical units, and once `1.5 * scale` drops under one
 * device pixel the browser renders it as a partial-coverage grey smear that
 * fades in and out down the page.
 *
 * So the floor is the scale at which the thinnest of those still lands on a
 * whole device pixel. Below it the canvas is deliberately over-resolved for
 * what it covers, which costs memory and a little mip blur and is much the
 * lesser problem.
 */
const MIN_HAIRLINE_UNITS = 1.5;
const MIN_SCALE = 1 / MIN_HAIRLINE_UNITS;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * What to assume when a caller has no framing for a surface.
 *
 * Half the frame each way is a middling shot — not a subject filling the view,
 * not a detail in the corner. Anything that actually carries type should be
 * passing a measured number instead; this exists so a new surface renders
 * plausibly before anyone has run the analyzer for it, rather than dividing by
 * undefined.
 */
const DEFAULT_FRAMING = [0.5, 0.5];

/**
 * The buffer height to use when the scene has not published one yet.
 *
 * DeskScene's real value is authoritative because it is post-clamp, but it is
 * zero until the first layout, and a canvas built in that window would be
 * sized from nothing. The window's own device height is the right guess: it is
 * what the buffer will be unless the area budget engages.
 */
function fallbackBufferHeight() {
    if (typeof window === 'undefined') return 1080;
    return (window.innerHeight || 1080) * (window.devicePixelRatio || 1);
}

/**
 * Physical pixels per logical unit for a canvas covering `framing` of the frame.
 *
 * WHAT REPLACED `coverage`, AND WHY IT HAD TO. The old form took a fraction of
 * the viewport's WIDTH, guessed per call site — 0.5 for a book page, 0.92 for
 * the monitor — and both were wrong in the same structural way. three's fov is
 * vertical, so the drawing buffer's HEIGHT is what spans a fixed 45°; pixels
 * per degree is height/45 on both axes, and an object's extent in pixels
 * therefore depends only on its angular size. A fraction of width changes with
 * every window shape, so one constant could be right at one aspect and nowhere
 * else — and it failed OPEN in a tall window, allocating fewer texels than the
 * surface covered, which is outright bilinear magnification.
 *
 * `framing` is that angular size, measured rather than guessed: both extents in
 * units of the buffer's height, printed by
 * `node scripts/analyze-focus-cameras.mjs`. It is a property of the shot, so it
 * goes stale if a focus camera is retuned and nothing at runtime can tell.
 *
 * THE LARGER AXIS WINS. A page seen at 30° off-normal is foreshortened
 * vertically and not horizontally, so its footprint is a different shape from
 * its canvas; satisfying only the smaller axis would under-resolve the other.
 * The surplus on the foreshortened axis is what anisotropic filtering is for.
 *
 * THE MEMORY CEILING BEATS THE FLOOR. `maxPixels` is applied last and outside
 * `minScale` deliberately: a floor that can push a canvas past the ceiling is
 * not a ceiling, and this module exists to stop Safari's texture budget being
 * blown by type nobody can resolve.
 *
 * @param {number} logicalWidth
 * @param {number} logicalHeight
 * @param {object} options
 * @param {[number, number]} options.framing width and height on screen, in
 *        units of the drawing buffer's height.
 * @param {number} options.bufferHeight the budgeted drawing buffer's height in
 *        device pixels — DeskScene's, after its area clamp, not the window's.
 * @param {number} [options.maxScale]
 * @param {number} [options.maxPixels]
 * @param {number} [options.minScale]
 */
export function footprintScaleFor(logicalWidth, logicalHeight, {
    framing,
    bufferHeight,
    maxScale = 3,
    maxPixels = MAX_CANVAS_PIXELS,
    minScale = MIN_SCALE
} = {}) {
    const [frameWidth, frameHeight] = framing ?? DEFAULT_FRAMING;
    const height = bufferHeight || fallbackBufferHeight();
    const wanted = Math.max(
        (frameWidth * height) / logicalWidth,
        (frameHeight * height) / logicalHeight
    );
    const affordable = Math.sqrt(maxPixels / (logicalWidth * logicalHeight));
    return Math.min(affordable, maxScale, Math.max(minScale, wanted));
}

/**
 * A canvas sized from `footprintScaleFor`, plus the scale it was given — every
 * draw routine works in logical units and derives its transform from the ratio.
 */
export function createFootprintCanvas(logicalWidth, logicalHeight, options) {
    const scale = footprintScaleFor(logicalWidth, logicalHeight, options);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(logicalWidth * scale);
    canvas.height = Math.round(logicalHeight * scale);
    return { canvas, scale };
}

/**
 * The multiplier for a canvas whose size is already chosen in world units.
 *
 * The badge, the book spines and the resting top sheet are not framed by a
 * focus camera — the spines are never focused at all, and the other two are
 * read at the establishing shot — so they size themselves from a
 * pixels-per-world-unit constant tuned against how large they can ever appear.
 * That reasoning is sound and is left alone. What it was missing is that the
 * constants were tuned on one display and then applied to every display: the
 * same 456 x 720 badge on a 1x laptop, where it is twice the texels it can use,
 * and on a 3x panel, where it is two thirds of them.
 *
 * This tracks the buffer instead, so the tuned size holds its meaning: 1.0 at
 * the reference, more on a denser display, less on a sparser one.
 *
 * @param {number} bufferHeight the budgeted drawing buffer height, device px
 * @param {number} [reference] the buffer height the constants were tuned at —
 *        a 1512 x 945 laptop at DPR 2, which is where they measure ~1:1.
 */
export function deviceScaleFor(bufferHeight, reference = 1890) {
    return clamp((bufferHeight || fallbackBufferHeight()) / reference, 0.5, 2);
}
