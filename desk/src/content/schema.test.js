import { describe, expect, it } from 'vitest';
import { CATEGORY_LABELS } from './schema.js';

describe('CATEGORY_LABELS', () => {
    it('has a display label for every valid category', () => {
        expect(CATEGORY_LABELS).toEqual({
            software: 'Software',
            hardware: 'Hardware',
            work: 'Work',
            academia: 'Academia'
        });
    });
});
