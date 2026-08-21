import { describe, expect, it } from 'vitest';
import { validateWork } from '../schema.js';
import { secondWork } from './second-work.js';

describe('secondWork', () => {
    it('satisfies the Work content schema', () => {
        expect(() => validateWork(secondWork)).not.toThrow();
    });

    it('has non-empty editorial body copy', () => {
        expect(secondWork.editorial.body.length).toBeGreaterThan(0);
    });

    it('belongs to the essays category', () => {
        expect(secondWork.category).toBe('essays');
    });
});
