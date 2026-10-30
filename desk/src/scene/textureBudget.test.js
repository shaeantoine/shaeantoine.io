import { describe, expect, it } from 'vitest';
import { footprintScaleFor, deviceScaleFor, MAX_CANVAS_PIXELS } from './textureBudget.js';

/**
 * These run in node with no window, so every case passes `bufferHeight`
 * explicitly. That is also how the app calls it — DeskScene publishes the real
 * post-clamp height — and the window fallback inside exists only for the gap
 * before the first layout.
 */
describe('footprintScaleFor', () => {
    // A 1512 x 945 laptop at DPR 2, the display the scene is tuned against.
    const BUFFER = 1890;

    // The monitor's focused readout and one sheet of the academic paper stack,
    // as measured off their focus cameras. The page pair used
    // to be the essay notebook's leaf ([1008, 1400] at framing [0.47, 0.505]);
    // it was re-taken from the paper stack when that object was removed, because
    // a fixture named after a surface that no longer exists is the kind of thing
    // nobody re-derives later. The assertions here are about the function's
    // behaviour rather than these magnitudes, so the swap changes no outcome —
    // it only keeps the numbers traceable to something you can still measure.
    const SCREEN = { logical: [1787, 1000], framing: [1.165, 0.652] };
    const PAGE = { logical: [987, 1400], framing: [0.607, 0.665] };

    /** Texels per device pixel on each axis at `bufferHeight`. */
    function texelRatio({ logical, framing }, bufferHeight, options) {
        const scale = footprintScaleFor(logical[0], logical[1], { framing, bufferHeight, ...options });
        return [
            (logical[0] * scale) / (framing[0] * bufferHeight),
            (logical[1] * scale) / (framing[1] * bufferHeight)
        ];
    }

    it('lands the binding axis at 1:1 with the pixels it covers', () => {
        // THE ASSERTION THAT MATTERS. A canvas with more texels than the pixels
        // it occupies is minified, and a minified texture is sampled from a
        // blurrier mip level — which is the softness this module exists to
        // remove, not a saving. Fewer texels is worse still: that is outright
        // bilinear magnification.
        const [screenX, screenY] = texelRatio(SCREEN, BUFFER);
        expect(Math.min(screenX, screenY)).toBeCloseTo(1, 2);
        const [pageX, pageY] = texelRatio(PAGE, BUFFER);
        expect(Math.min(pageX, pageY)).toBeCloseTo(1, 2);
    });

    it('never under-resolves the other axis', () => {
        // A page seen at 30° off-normal is foreshortened vertically and not
        // horizontally, so its footprint is a different shape from its canvas.
        // Satisfying the smaller axis would starve the larger one; the surplus
        // is what anisotropic filtering is for.
        for (const ratio of [...texelRatio(SCREEN, BUFFER), ...texelRatio(PAGE, BUFFER)]) {
            expect(ratio).toBeGreaterThanOrEqual(0.99);
        }
    });

    it('holds that ratio across displays, which a width fraction could not', () => {
        // WHAT REPLACED `coverage`. The old form took a fraction of viewport
        // WIDTH, so the same constant resolved differently in a wide window and
        // a tall one — and failed open in the tall one, allocating fewer texels
        // than the surface covered. three's fov is vertical, so height is the
        // axis that does not move.
        //
        // The tolerance widens at the top end on purpose: MAX_CANVAS_PIXELS is
        // allowed to bind on a very dense display, and 0.95 is the point past
        // which that stops being a rounding difference and starts being
        // magnification. @see MAX_CANVAS_PIXELS for why the ceiling stays.
        for (const bufferHeight of [1080, 1890, 2880]) {
            const [x, y] = texelRatio(SCREEN, bufferHeight);
            expect(Math.min(x, y)).toBeGreaterThan(0.95);
            expect(Math.min(x, y)).toBeLessThan(1.05);
        }
    });

    it('keeps the memory ceiling above the device-pixel floor', () => {
        // The ceiling has to win. A floor that can push a canvas past
        // MAX_CANVAS_PIXELS is not a ceiling, and Safari's texture budget is
        // the reason there is one at all.
        const scale = footprintScaleFor(1787, 1000, {
            framing: [1.165, 0.652],
            bufferHeight: 20000, // a 5K panel's worth and then some
            minScale: 8
        });
        expect(1787 * scale * 1000 * scale).toBeLessThanOrEqual(MAX_CANVAS_PIXELS + 1);
    });

    it('keeps the thinnest hairline on a whole device pixel', () => {
        // pageCanvas rules margins at 1.5 logical units. Below 1/1.5 that is a
        // sub-pixel stroke, which renders as a grey smear that fades in and out
        // down the page — the one thing that stops the scale following the
        // footprint all the way down on a sparse display.
        const scale = footprintScaleFor(1008, 1400, { framing: [0.47, 0.505], bufferHeight: 400 });
        expect(1.5 * scale).toBeGreaterThanOrEqual(1);
    });

    it('survives a surface nobody has measured yet', () => {
        expect(footprintScaleFor(1000, 1000, { bufferHeight: 1890 })).toBeGreaterThan(0);
    });
});

describe('deviceScaleFor', () => {
    it('is 1 at the display the fixed densities were tuned on', () => {
        expect(deviceScaleFor(1890)).toBeCloseTo(1, 3);
    });

    it('tracks the buffer either way, within sane bounds', () => {
        expect(deviceScaleFor(3780)).toBeCloseTo(2, 3);
        expect(deviceScaleFor(945)).toBeCloseTo(0.5, 3);
        // Clamped: a badge is not worth 4x the texels whatever the panel says.
        expect(deviceScaleFor(100000)).toBe(2);
        expect(deviceScaleFor(10)).toBe(0.5);
    });
});
