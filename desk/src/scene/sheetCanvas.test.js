import { describe, expect, it } from 'vitest';
import { sheetCanvasSize, drawSheet, SHEET_PIXELS_PER_UNIT } from './sheetCanvas.js';

describe('sheetCanvasSize', () => {
    // @see badgeCanvas.test.js — the buffer height these constants were tuned
    // at, passed explicitly so the assertions do not depend on the display.
    const REFERENCE = 1890;

    it('sizes the canvas from the sheet, so nothing is stretched', () => {
        const size = sheetCanvasSize(0.474, 0.672, REFERENCE);
        expect(size.width).toBe(Math.round(0.474 * SHEET_PIXELS_PER_UNIT));
        expect(size.height).toBe(Math.round(0.672 * SHEET_PIXELS_PER_UNIT));
    });

    it('keeps the canvas aspect equal to the sheet aspect', () => {
        const size = sheetCanvasSize(0.474, 0.672, REFERENCE);
        // To within the rounding to whole pixels, which on a canvas this size
        // is worth less than a thousandth of the aspect.
        expect(size.width / size.height).toBeCloseTo(0.474 / 0.672, 2);
    });

    it('floors the dimensions so a tiny sheet still gets a usable canvas', () => {
        const size = sheetCanvasSize(0.001, 0.001);
        expect(size.width).toBeGreaterThanOrEqual(96);
        expect(size.height).toBeGreaterThanOrEqual(128);
    });
});

describe('drawSheet', () => {
    // Same recording stub as badgeCanvas.test.js and bookSpineCanvas.test.js,
    // for the same reason: there is no canvas in this environment, and the
    // value is in checking that the draw completes and lays the right marks
    // down in the right places.
    function stubCanvas(width, height) {
        const calls = [];
        const state = { font: '' };
        const ctx = new Proxy(state, {
            get(target, key) {
                if (key === 'measureText') return (text) => ({ width: text.length * (target.__size ?? 10) * 0.5 });
                if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
                if (typeof key === 'string') {
                    return (...args) => calls.push({ op: key, args, font: target.__size ?? null });
                }
                return target[key];
            },
            set(target, key, value) {
                if (key === 'font') target.__size = parseFloat(String(value).match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 10);
                target[key] = value;
                calls.push({ op: `set:${key}`, args: [value], font: target.__size ?? null });
                return true;
            }
        });
        return { canvas: { width, height, getContext: () => ctx }, calls };
    }

    const WIDTH = 569;
    const HEIGHT = 806;
    const PAPER = { title: 'Experimentally Bounding the Space of Triangulations', credit: 'Shae McKenna', color: '#f7f5f0' };

    const textFor = (calls) => calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);
    const rects = (calls) => calls.filter((c) => c.op === 'fillRect').map((c) => c.args);
    /** The body rules: every fill except the full-bleed ground. */
    const bodyRules = (calls) => rects(calls).filter(([, , , h]) => h < HEIGHT * 0.02);

    const draw = (overrides = {}) => {
        const { canvas, calls } = stubCanvas(WIDTH, HEIGHT);
        drawSheet(canvas, { ...PAPER, ...overrides });
        return calls;
    };

    it('paints the paper stock itself rather than relying on the material', () => {
        // The map replaces the front face outright, so a canvas that skipped
        // this would print onto a transparent ground.
        const calls = draw();
        const first = calls.find((c) => c.op === 'set:fillStyle');
        expect(first.args[0]).toBe('#fbfaf7'); // the manuscript stock's own paper
        const ground = rects(calls)[0];
        expect(ground).toEqual([0, 0, WIDTH, HEIGHT]);
    });

    it('prints the title and the credit, and nothing else in words', () => {
        // Everything below the title block is rules rather than type — see the
        // header of sheetCanvas.js. The page number is the one exception.
        expect(textFor(draw())).toEqual([PAPER.title, PAPER.credit, '1']);
    });

    it('never sets type wider than the sheet it is printed on', () => {
        const calls = draw({ title: 'A Very Long Title Indeed That Would Not Otherwise Fit Across A5' });
        for (const call of calls.filter((c) => c.op === 'fillText')) {
            expect(call.font).toBeLessThanOrEqual(WIDTH);
        }
    });

    it('sets a smaller title when the title is longer', () => {
        const titleSize = (title) => draw({ title }).find((c) => c.op === 'fillText').font;
        expect(titleSize('A Long Title About Triangulations And Their Bounds'))
            .toBeLessThan(titleSize('P vs NP'));
    });

    it('sets the body in two columns, which is what makes it read as a paper', () => {
        // One column of rules is a page of prose; two is a paper. This is the
        // single strongest cue on the object at establishing-shot distance, and
        // the one a well-meaning simplification would remove first.
        const columnXs = new Set(bodyRules(draw()).map(([x]) => Math.round(x)));
        expect(columnXs.size).toBe(2);
        const [left, right] = [...columnXs].sort((a, b) => a - b);
        expect(right).toBeGreaterThan(left + WIDTH * 0.3);
    });

    it('keeps every rule inside the margins', () => {
        for (const [x, y, w, h] of bodyRules(draw())) {
            expect(x).toBeGreaterThanOrEqual(WIDTH * 0.08);
            expect(x + w).toBeLessThanOrEqual(WIDTH * 0.92 + 1);
            expect(y + h).toBeLessThanOrEqual(HEIGHT);
        }
    });

    it('ends paragraphs short, so a column reads as text rather than a barcode', () => {
        const widths = bodyRules(draw()).map(([, , w]) => w);
        const longest = Math.max(...widths);
        expect(widths.some((w) => w < longest * 0.75)).toBe(true);
    });

    it('leaves a gap in the right-hand column for the figure', () => {
        // The figure interrupts the column rather than sitting under it, the
        // way a single-column-wide figure lands in a real two-column paper. If
        // the skip ever stops working, the rules draw straight through the plot.
        const rules = bodyRules(draw());
        const rightX = Math.max(...rules.map(([x]) => x));
        const rightColumn = rules.filter(([x]) => x === rightX).map(([, y]) => y).sort((a, b) => a - b);
        const gaps = rightColumn.slice(1).map((y, i) => y - rightColumn[i]);
        expect(Math.max(...gaps)).toBeGreaterThan(HEIGHT * 0.15);
    });

    it('draws the figure as a framed plot with axes', () => {
        const calls = draw();
        expect(calls.some((c) => c.op === 'strokeRect')).toBe(true);
        expect(calls.filter((c) => c.op === 'stroke').length).toBeGreaterThanOrEqual(3); // title rule, axes, curve
    });

    it('greeks the same paper the same way every time, and two papers differently', () => {
        // Seeded off the title: a stack that reshuffled its own body text
        // between loads would be the only thing in this scene that did.
        const signature = (title) => JSON.stringify(bodyRules(draw({ title })));
        expect(signature('The State of P vs NP')).toBe(signature('The State of P vs NP'));
        expect(signature('The State of P vs NP')).not.toBe(signature('Large Language Models'));
    });

    it('completes without a credit', () => {
        expect(() => draw({ credit: undefined })).not.toThrow();
        expect(textFor(draw({ credit: undefined }))).toEqual([PAPER.title, '1']);
    });
});
