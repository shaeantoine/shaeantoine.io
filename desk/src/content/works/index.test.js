import { describe, expect, it } from 'vitest';
import { validateWork } from '../schema.js';
import { works } from './index.js';

describe('works registry', () => {
    it('lists every Work and each satisfies the schema', () => {
        expect(works).toHaveLength(5);
        works.forEach((work) => expect(() => validateWork(work)).not.toThrow());
    });

    it('has no duplicate Work ids', () => {
        const ids = works.map((work) => work.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('covers all four categories', () => {
        const categories = new Set(works.map((work) => work.category));
        expect(categories).toEqual(new Set(['essays', 'software', 'diary', 'hardware']));
    });
});
