import { describe, expect, it } from 'vitest';
import { wrapLines, paginateWork, buildPageDeck } from './pagination.js';

// Fixed-width fake measurer so tests don't depend on real canvas font metrics.
const CHAR_WIDTH = 10;
const measureWidth = (text) => text.length * CHAR_WIDTH;

function makeWork(id, bodyParagraphs) {
    return {
        id,
        title: `Title ${id}`,
        editorial: { credit: 'Author', body: bodyParagraphs }
    };
}

describe('wrapLines', () => {
    it('packs words onto a line until the next one would overflow maxWidth', () => {
        const lines = wrapLines('one two three four', { measureWidth, maxWidth: CHAR_WIDTH * 8 });
        expect(lines).toEqual(['one two', 'three', 'four']);
    });

    it('never drops a word even if it alone exceeds maxWidth', () => {
        const lines = wrapLines('supercalifragilistic word', { measureWidth, maxWidth: CHAR_WIDTH * 5 });
        expect(lines).toEqual(['supercalifragilistic', 'word']);
    });
});

// One column, which is paginateWork's own destructuring default and no longer
// any stock on the desk — `manuscript` is the only entry left in PAPER_STOCKS
// and it sets two. The default is still part of the algorithm's contract, and
// removing it turns columnWidth into NaN, so it is still worth pinning.
const LAYOUT = {
    contentWidth: CHAR_WIDTH * 10, // 10 chars per line
    contentHeight: 100,
    headerHeight: 40,
    bodyFontSize: 1,
    bodyLineHeight: 20,
    paragraphSpacing: 0,
    measureWidth
};

describe('paginateWork', () => {
    it('splits a long body across multiple pages', () => {
        const longBody = ['one two three four five six seven eight nine ten eleven twelve'];
        const pages = paginateWork(makeWork('1', longBody), LAYOUT);
        expect(pages.length).toBeGreaterThan(1);
        expect(pages[0].totalPagesInWork).toBe(pages.length);
    });

    it('marks only the first page as isFirstPage and numbers pages in order', () => {
        const longBody = ['one two three four five six seven eight nine ten eleven twelve'];
        const pages = paginateWork(makeWork('1', longBody), LAYOUT);
        expect(pages[0].isFirstPage).toBe(true);
        pages.slice(1).forEach((page) => expect(page.isFirstPage).toBe(false));
        pages.forEach((page, index) => expect(page.pageIndexInWork).toBe(index));
    });

    it('reserves header height on the first page, fitting fewer lines than later pages', () => {
        const body = ['one two three four five six seven eight nine ten eleven twelve thirteen fourteen'];
        const pages = paginateWork(makeWork('1', body), LAYOUT);
        expect(pages.length).toBeGreaterThan(1);
        expect(pages[0].lines.length).toBeLessThan(pages[1].lines.length);
    });

    it('produces a single empty page for a work with no body text', () => {
        const pages = paginateWork(makeWork('1', []), LAYOUT);
        expect(pages).toHaveLength(1);
        expect(pages[0].lines).toEqual([]);
    });

    it('hands back the same content as columns and as a flat list', () => {
        const pages = paginateWork(makeWork('1', ['one two three four five six seven eight']), LAYOUT);
        for (const page of pages) {
            expect(page.columns.flat()).toEqual(page.lines);
        }
    });
});

describe('paginateWork in two columns', () => {
    // Two columns is what makes the academic printouts read as printouts rather
    // than as pages of a book — see PAPER_STOCKS in pageCanvas.js, where the one
    // surviving stock sets it. The measure halves, so everything about how much
    // fits changes with it.
    const TWO_UP = { ...LAYOUT, columns: 2, columnGutter: CHAR_WIDTH * 2 };
    const longBody = ['one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen'];

    it('wraps to one column, not to the full content width', () => {
        // The bug this exists for: measuring against the whole page and then
        // drawing in halves puts every line a column's width past its margin,
        // which looks like a font problem and is not one.
        const [page] = paginateWork(makeWork('1', ['alpha bravo charlie delta echo foxtrot']), TWO_UP);
        const columnWidth = (TWO_UP.contentWidth - TWO_UP.columnGutter) / 2;
        for (const line of page.lines) {
            // A single word wider than the measure is kept whole rather than
            // dropped, which wrapLines documents and guarantees; everything
            // else has to fit the column.
            if (line.split(' ').length === 1) continue;
            expect(measureWidth(line)).toBeLessThanOrEqual(columnWidth);
        }
    });

    it('fills the first column before starting the second', () => {
        const [page] = paginateWork(makeWork('1', longBody), TWO_UP);
        expect(page.columns).toHaveLength(2);
        expect(page.columns[0].length).toBeGreaterThan(0);
        expect(page.columns[1].length).toBeGreaterThan(0);
        // Nothing is reordered on its way into the columns.
        expect(page.columns[0].concat(page.columns[1])).toEqual(page.lines);
    });

    it('fits more on a page than one column would', () => {
        const oneUp = paginateWork(makeWork('1', longBody), { ...LAYOUT, contentWidth: TWO_UP.contentWidth });
        const twoUp = paginateWork(makeWork('1', longBody), TWO_UP);
        expect(twoUp.length).toBeLessThanOrEqual(oneUp.length);
        expect(twoUp[0].lines.length).toBeGreaterThan(oneUp[0].lines.length);
    });

    it('shortens every column on the first page, because the title block spans them', () => {
        const pages = paginateWork(makeWork('1', longBody), TWO_UP);
        expect(pages.length).toBeGreaterThan(1);
        for (const column of pages[0].columns) {
            expect(column.length).toBeLessThan(pages[1].columns[0].length);
        }
    });
});

describe('buildPageDeck', () => {
    it('flattens multiple works into one ordered deck tagged with their source work', () => {
        const workA = makeWork('a', ['short paragraph']);
        const workB = makeWork('b', ['one two three four five six seven eight nine ten eleven twelve']);
        const deck = buildPageDeck([workA, workB], LAYOUT);

        expect(deck.every((item) => item.work.id === 'a' || item.work.id === 'b')).toBe(true);
        const boundary = deck.findIndex((item) => item.work.id === 'b');
        expect(boundary).toBeGreaterThan(0);
        expect(deck.slice(0, boundary).every((item) => item.work.id === 'a')).toBe(true);
        expect(deck.slice(boundary).every((item) => item.work.id === 'b')).toBe(true);
    });
});
