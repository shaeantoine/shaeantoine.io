import { describe, expect, it } from 'vitest';
import { validateWork } from '../schema.js';
import { firstWork } from './first-work.js';

describe('firstWork', () => {
    it('satisfies the Work content schema', () => {
        expect(() => validateWork(firstWork)).not.toThrow();
    });

    it('has non-empty editorial body copy', () => {
        expect(firstWork.editorial.body.length).toBeGreaterThan(0);
    });

    it('belongs to the essays category', () => {
        expect(firstWork.category).toBe('essays');
    });
});
