import { describe, expect, it } from 'vitest';
import { buildBookRow, BOOK_ROW_DEFAULTS } from './bookRow.js';

const row = (overrides = {}) => buildBookRow({ from: -2, to: 2, z: -1.19, seed: 1, ...overrides });

describe('buildBookRow', () => {
    it('deals the same row every time for a given seed', () => {
        // Load-bearing, not a nicety. An unseeded row would reshuffle on every
        // reload — you could never say what your own desk looked like — and
        // every assertion below would be meaningless.
        expect(buildBookRow({ from: -2, to: 2, z: -1.19, seed: 7 }))
            .toEqual(buildBookRow({ from: -2, to: 2, z: -1.19, seed: 7 }));
    });

    it('deals a different row for a different seed', () => {
        expect(row({ seed: 1 })).not.toEqual(row({ seed: 2 }));
    });

    it('fills the run without overshooting either end', () => {
        // The right end is where a bookend stands. A book pushed past it would
        // intersect the model rather than lean on it.
        const books = row();
        for (const book of books) {
            const half = book.args[0] / 2;
            expect(book.position[0] - half).toBeGreaterThanOrEqual(-2);
            expect(book.position[0] + half).toBeLessThanOrEqual(2);
        }
    });

    it('leaves no room for another book at the end of the run', () => {
        // The complement of the check above: stopping early is as wrong as
        // overshooting, and would show as a gap beside one bookend.
        const books = row();
        const last = books[books.length - 1];
        const used = last.position[0] + last.args[0] / 2;
        expect(2 - used).toBeLessThan(BOOK_ROW_DEFAULTS.maxThickness + BOOK_ROW_DEFAULTS.spacing);
    });

    it('packs books in order without overlapping', () => {
        const books = row();
        for (let i = 1; i < books.length; i++) {
            const previousRight = books[i - 1].position[0] + books[i - 1].args[0] / 2;
            const currentLeft = books[i].position[0] - books[i].args[0] / 2;
            expect(currentLeft).toBeGreaterThanOrEqual(previousRight);
        }
    });

    it('rests every book on the desktop whatever its height', () => {
        // Parts are centred on their position, so a book's y has to track its
        // own height. A fixed y would sink the short ones and float the tall.
        for (const book of row()) {
            expect(book.position[1]).toBeCloseTo(book.args[1] / 2, 10);
        }
    });

    it('lines every book up on the same front-to-back centre', () => {
        for (const book of row()) expect(book.position[2]).toBe(-1.19);
    });

    it('keeps every dimension inside its configured range', () => {
        const { minThickness, maxThickness, minHeight, maxHeight, minDepth, maxDepth, maxYaw } = BOOK_ROW_DEFAULTS;
        for (const book of row()) {
            const [thickness, height, depth] = book.args;
            expect(thickness).toBeGreaterThanOrEqual(minThickness);
            expect(thickness).toBeLessThanOrEqual(maxThickness);
            expect(height).toBeGreaterThanOrEqual(minHeight);
            expect(height).toBeLessThanOrEqual(maxHeight);
            expect(depth).toBeGreaterThanOrEqual(minDepth);
            expect(depth).toBeLessThanOrEqual(maxDepth);
            expect(Math.abs(book.rotation[1])).toBeLessThanOrEqual(maxYaw);
        }
    });

    it('varies the heights rather than producing a flat wall', () => {
        // The silhouette is the whole point of the row; a run of equal-height
        // boxes reads as a plinth, not as books.
        const heights = row().map((book) => book.args[1]);
        expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.15);
    });

    it('emits parts the desk schema already understands', () => {
        for (const book of row()) {
            expect(book.type).toBe('box');
            expect(book.args).toHaveLength(3);
            expect(book.color).toMatch(/^#[0-9a-f]{6}$/i);
        }
    });

    it('returns nothing when the run is too short for a single book', () => {
        expect(buildBookRow({ from: 0, to: 0.01, z: 0, seed: 1 })).toEqual([]);
    });

    it('honours an overridden distribution', () => {
        const fat = buildBookRow({ from: -2, to: 2, z: 0, seed: 1, minThickness: 0.3, maxThickness: 0.35 });
        expect(fat.length).toBeLessThan(row().length);
        for (const book of fat) expect(book.args[0]).toBeGreaterThanOrEqual(0.3);
    });
});

describe('buildBookRow — lettered spines', () => {
    const titles = Array.from({ length: 6 }, (_, i) => ({ title: `Title ${i}`, author: `Author ${i}` }));
    const lettered = (books) => books.filter((book) => book.spine);
    const occluded = [-0.5, 0.5];

    it('leaves every book plain when given no titles', () => {
        expect(lettered(row())).toHaveLength(0);
    });

    it('never letters a book the monitor hides', () => {
        // The whole point of passing `occluded`: a title spent on a spine
        // behind the display is a title nobody will ever see.
        for (const book of lettered(row({ titles, occluded }))) {
            const x = book.position[0];
            expect(x < occluded[0] || x > occluded[1]).toBe(true);
        }
    });

    it('hands the titles out in order, left to right', () => {
        const books = lettered(row({ titles, occluded }));
        expect(books.map((b) => b.spine.title)).toEqual(titles.slice(0, books.length).map((t) => t.title));
        for (let i = 1; i < books.length; i++) {
            expect(books[i].position[0]).toBeGreaterThan(books[i - 1].position[0]);
        }
    });

    it('uses no title twice', () => {
        const used = lettered(row({ titles, occluded })).map((b) => b.spine.title);
        expect(new Set(used).size).toBe(used.length);
    });

    it('stops once the titles run out rather than repeating them', () => {
        expect(lettered(row({ titles: titles.slice(0, 2), occluded }))).toHaveLength(2);
    });

    it('gives a lettered book a spine wide enough to letter', () => {
        // Cap height on a spine is capped by its width, so the thinnest books
        // in the range would render a title as a grey smear.
        for (const book of lettered(row({ titles, occluded }))) {
            expect(book.args[0]).toBeGreaterThanOrEqual(BOOK_ROW_DEFAULTS.titledMinThickness);
        }
    });

    it('stands lettered books straighter than their neighbours', () => {
        for (const book of lettered(row({ titles, occluded }))) {
            expect(Math.abs(book.rotation[1])).toBeLessThanOrEqual(BOOK_ROW_DEFAULTS.titledMaxYaw);
        }
    });

    it('still packs without overlapping once spines are widened', () => {
        // Widening a book after its position is chosen is the obvious way to
        // introduce an overlap, so this re-checks the packing invariant with
        // titles in play.
        const books = row({ titles, occluded });
        for (let i = 1; i < books.length; i++) {
            const previousRight = books[i - 1].position[0] + books[i - 1].args[0] / 2;
            expect(books[i].position[0] - books[i].args[0] / 2).toBeGreaterThanOrEqual(previousRight);
        }
    });

    it('stays deterministic with titles in play', () => {
        expect(row({ titles, occluded })).toEqual(row({ titles, occluded }));
    });
});
