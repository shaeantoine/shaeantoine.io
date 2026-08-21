import { describe, expect, it } from 'vitest';
import { validateWork } from '../schema.js';
import { works } from './index.js';

describe('works registry', () => {
    it('lists every Work paired with its Artwork class', () => {
        expect(works).toHaveLength(2);
        works.forEach(({ work, Artwork }) => {
            expect(() => validateWork(work)).not.toThrow();
            expect(typeof Artwork).toBe('function');
        });
    });

    it('has no duplicate Work ids', () => {
        const ids = works.map(({ work }) => work.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});
