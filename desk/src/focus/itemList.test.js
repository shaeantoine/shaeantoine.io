import { describe, expect, it } from 'vitest';
import { worksForCategory, nextIndex } from './itemList.js';

const works = [
    { id: '1', category: 'academia' },
    { id: '2', category: 'academia' },
    { id: '3', category: 'software' }
];

describe('worksForCategory', () => {
    it('returns only Works matching the category, in registry order', () => {
        expect(worksForCategory(works, 'academia').map((w) => w.id)).toEqual(['1', '2']);
    });

    it('returns an empty array for a category with no Works', () => {
        expect(worksForCategory(works, 'hardware')).toEqual([]);
    });
});

describe('nextIndex', () => {
    it('advances by one on "next"', () => {
        expect(nextIndex(0, 3, 'next')).toBe(1);
    });

    it('retreats by one on "prev"', () => {
        expect(nextIndex(1, 3, 'prev')).toBe(0);
    });

    it('clamps at the last index on "next"', () => {
        expect(nextIndex(2, 3, 'next')).toBe(2);
    });

    it('clamps at 0 on "prev"', () => {
        expect(nextIndex(0, 3, 'prev')).toBe(0);
    });
});
