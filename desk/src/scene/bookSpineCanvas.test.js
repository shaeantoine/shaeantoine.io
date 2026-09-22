import { describe, expect, it } from 'vitest';
import { spineCanvasSize, luminanceOf, inkFor, drawBookSpine, SPINE_PIXELS_PER_UNIT } from './bookSpineCanvas.js';

describe('spineCanvasSize', () => {
    // @see badgeCanvas.test.js — the buffer height these constants were tuned
    // at, passed explicitly so the assertions do not depend on the display.
    const REFERENCE = 1890;

    it('sizes the canvas from the book, so type is never stretched', () => {
        // Books run 0.065 to 0.155 thick. One shared canvas shape would squash
        // the lettering differently on every one of them.
        const { width, height } = spineCanvasSize(0.11, 0.58, REFERENCE);
        expect(width).toBe(Math.round(0.11 * SPINE_PIXELS_PER_UNIT));
        expect(height).toBe(Math.round(0.58 * SPINE_PIXELS_PER_UNIT));
    });

    it('keeps the canvas aspect equal to the spine aspect', () => {
        const { width, height } = spineCanvasSize(0.098, 0.70);
        expect(width / height).toBeCloseTo(0.098 / 0.70, 2);
    });

    it('floors the dimensions so a very thin book still gets a usable canvas', () => {
        const { width, height } = spineCanvasSize(0.001, 0.001);
        expect(width).toBeGreaterThanOrEqual(24);
        expect(height).toBeGreaterThanOrEqual(48);
    });
});

describe('inkFor', () => {
    it('stamps dark bindings in warm off-white and light ones in near-black', () => {
        expect(inkFor('#2b2b2e')).toBe('#e8e0cf');
        expect(inkFor('#a1937c')).toBe('#241f1a');
    });

    it('gives every spine colour in the row readable contrast', () => {
        // The palette is tuned by eye; this catches a future colour landing in
        // the band where neither ink reads.
        const palette = ['#4a4238', '#2f3a35', '#6b4a3a', '#3b3f4a', '#7d7364',
            '#2b2b2e', '#5c4a52', '#8a8069', '#39463f', '#6e5a45', '#454d57', '#a1937c'];
        for (const color of palette) {
            const contrast = Math.abs(luminanceOf(color) - luminanceOf(inkFor(color)));
            expect(contrast).toBeGreaterThan(0.25);
        }
    });
});

describe('luminanceOf', () => {
    it('reads black and white as the ends of the range', () => {
        expect(luminanceOf('#000000')).toBeCloseTo(0, 6);
        expect(luminanceOf('#ffffff')).toBeCloseTo(1, 6);
    });

    it('weights green above red above blue, as perception does', () => {
        expect(luminanceOf('#00ff00')).toBeGreaterThan(luminanceOf('#ff0000'));
        expect(luminanceOf('#ff0000')).toBeGreaterThan(luminanceOf('#0000ff'));
    });
});

describe('drawBookSpine', () => {
    // A recording stub: enough 2D context surface to run the draw and report
    // what it asked for. There is no canvas in this environment, and the value
    // here is checking the draw completes and lays type down at all.
    //
    // Each call records the font that was *active* when it happened, rather
    // than every font ever assigned — fitFontSize assigns a 100px reference
    // purely to measure against, and reading that back as the chosen size is
    // the obvious way to write this test wrong.
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

    const textFor = (calls) => calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);
    const typeSizes = (calls) => calls.filter((c) => c.op === 'fillText').map((c) => c.font);

    it('draws the title and the author', () => {
        const { canvas, calls } = stubCanvas(99, 522);
        drawBookSpine(canvas, { title: 'Demons', author: 'Dostoevsky', color: '#2b2b2e' });
        expect(textFor(calls)).toEqual(['Demons', 'Dostoevsky']);
    });

    it('omits the author line when there is no author', () => {
        const { canvas, calls } = stubCanvas(99, 522);
        drawBookSpine(canvas, { title: 'Demons', color: '#2b2b2e' });
        expect(textFor(calls)).toEqual(['Demons']);
    });

    it('turns the type a quarter clockwise so it reads down the spine', () => {
        const { canvas, calls } = stubCanvas(99, 522);
        drawBookSpine(canvas, { title: 'Demons', color: '#2b2b2e' });
        const rotate = calls.find((c) => c.op === 'rotate');
        expect(rotate.args[0]).toBeCloseTo(Math.PI / 2, 6);
    });

    it('paints the binding colour itself rather than relying on the material', () => {
        // The map replaces the front face outright, so a canvas that skipped
        // this would put the lettering on a transparent ground.
        const { canvas, calls } = stubCanvas(99, 522);
        drawBookSpine(canvas, { title: 'Demons', color: '#2b2b2e' });
        const firstFill = calls.find((c) => c.op === 'set:fillStyle');
        expect(firstFill.args[0]).toBe('#2b2b2e');
    });

    it('sets a smaller type size for a longer title', () => {
        // The one behaviour that makes a single layout hold both "Demons" and
        // "One Day in the Life of Ivan Denisovich".
        const titleSize = (title) => {
            const { canvas, calls } = stubCanvas(99, 522);
            drawBookSpine(canvas, { title, color: '#2b2b2e' });
            return typeSizes(calls)[0];
        };
        expect(titleSize('One Day in the Life of Ivan Denisovich')).toBeLessThan(titleSize('Demons'));
    });

    it('never sets type wider than the spine it is stamped on', () => {
        // A short title wants to be enormous; the spine's width is what stops
        // it, and without that cap the lettering runs off both long edges.
        const width = 99;
        const { canvas, calls } = stubCanvas(width, 522);
        drawBookSpine(canvas, { title: 'Hi', author: 'X', color: '#2b2b2e' });
        for (const size of typeSizes(calls)) {
            expect(size).toBeLessThanOrEqual(width);
        }
    });
});
