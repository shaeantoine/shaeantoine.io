import { describe, expect, it } from 'vitest';
import { validateWork } from '../schema.js';
import { firstWork } from './first-work.js';

describe('firstWork', () => {
    it('satisfies the Work content schema', () => {
        expect(() => validateWork(firstWork)).not.toThrow();
    });

    it('has one fragment per artwork object (object-0 through object-4)', () => {
        const targetIds = firstWork.fragments.map((f) => f.targetId);
        expect(targetIds).toEqual(['object-0', 'object-1', 'object-2', 'object-3', 'object-4']);
    });
});
