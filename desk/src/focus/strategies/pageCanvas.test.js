import { describe, expect, it } from 'vitest';
import { PAGE_CANVAS_HEIGHT, PAPER_STOCKS, drawPage, metricsFor } from './pageCanvas.js';

describe('PAPER_STOCKS', () => {
    it('keeps the academic stock in two columns', () => {
        // Two columns is the whole tell — see the file header. It is the one
        // metric a stock has to override to stop reading as a bound page, and
        // the one pagination and drawing must agree on or every line overruns.
        expect(metricsFor('manuscript').columns).toBe(2);
    });

    it('falls back to the only stock there is rather than to undefined', () => {
        // stockFor's fallback used to name a stock that has since been deleted,
        // which would have made every `stock.paper` read throw at first draw
        // rather than fail a test. Nothing here covers a bad id in production,
        // so this is the only place that catches it.
        expect(metricsFor('no-such-stock')).toEqual(metricsFor('manuscript'));
    });

    it('sets a rule under the title block, because that is what a printout has', () => {
        expect(PAPER_STOCKS.manuscript.rule).toBeTruthy();
    });
});

describe('drawPage', () => {
    // The same recording stub the other canvas suites use.
    function stubCanvas(width = 988, height = PAGE_CANVAS_HEIGHT) {
        const calls = [];
        const state = { font: '' };
        const ctx = new Proxy(state, {
            get(target, key) {
                if (key === 'measureText') return (text) => ({ width: text.length * 10 });
                if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
                if (typeof key === 'string') return (...args) => calls.push({ op: key, args });
                return target[key];
            },
            set(target, key, value) {
                target[key] = value;
                calls.push({ op: `set:${key}`, args: [value] });
                return true;
            }
        });
        return { canvas: { width, height, getContext: () => ctx }, calls };
    }

    const work = {
        title: 'Being Wrong in Public',
        date: '2026-07-18',
        editorial: { credit: 'Shae McKenna' }
    };
    const page = (overrides = {}) => ({
        work,
        isFirstPage: true,
        pageIndexInWork: 0,
        columns: [['one line of it']],
        lines: ['one line of it'],
        ...overrides
    });

    const textFor = (calls) => calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);
    const strokeCount = (calls) => calls.filter((c) => c.op === 'stroke').length;

    it('paints the stock, so a page is never drawn on a transparent ground', () => {
        const { canvas, calls } = stubCanvas();
        drawPage(canvas, page(), 'manuscript');
        expect(calls.find((c) => c.op === 'set:fillStyle').args[0]).toBe(PAPER_STOCKS.manuscript.paper);
    });

    it('draws a blank sheet when handed no page, which is what lies under the last one', () => {
        // A live path, not a defensive one: sheetStrategy draws its bed from
        // `pageAfter`, which returns null once there is nothing past the top
        // sheet. Losing this guard crashes the stack on its last page.
        const { canvas, calls } = stubCanvas();
        drawPage(canvas, null, 'manuscript');
        expect(textFor(calls)).toEqual([]);
        expect(calls.filter((c) => c.op === 'fillRect')).toHaveLength(1);
    });

    it('puts the title block only on the first page of a work', () => {
        const { canvas, calls } = stubCanvas();
        drawPage(canvas, page({ isFirstPage: false }), 'manuscript');
        expect(textFor(calls)).not.toContain(work.title);
        expect(textFor(calls)).not.toContain(work.editorial.credit);
    });

    it('rules under the title block, and only there', () => {
        // One stroke on a first page — the hairline under the masthead — and
        // none at all on a later one. This is the only coverage that the rule is
        // first-page-only; the contrast it used to be tested against was a
        // second stock, and there is no second stock now.
        const first = stubCanvas();
        drawPage(first.canvas, page(), 'manuscript');
        expect(strokeCount(first.calls)).toBe(1);

        const later = stubCanvas();
        drawPage(later.canvas, page({ isFirstPage: false }), 'manuscript');
        expect(strokeCount(later.calls)).toBe(0);
    });

    it('sets each column at its own x, and none of them past the margin', () => {
        const { canvas, calls } = stubCanvas();
        drawPage(canvas, page({ columns: [['left'], ['right']], lines: ['left', 'right'] }), 'manuscript');
        const body = calls.filter((c) => c.op === 'fillText' && ['left', 'right'].includes(c.args[0]));
        expect(body).toHaveLength(2);
        expect(body[1].args[1]).toBeGreaterThan(body[0].args[1]);
        expect(body[1].args[1]).toBeLessThan(988);
    });

    it('falls back to the flat line list for a page with no columns', () => {
        // pagination always emits columns now, but drawPage is also the thing
        // any future caller reaches for first.
        const { canvas, calls } = stubCanvas();
        drawPage(canvas, { ...page(), columns: undefined }, 'manuscript');
        expect(textFor(calls)).toContain('one line of it');
    });

    it('numbers the page from its index within the work', () => {
        const { canvas, calls } = stubCanvas();
        drawPage(canvas, page({ pageIndexInWork: 4, isFirstPage: false }), 'manuscript');
        expect(textFor(calls)).toContain('5');
    });
});
