import { describe, expect, it } from 'vitest';
import { validateWork } from '../schema.js';
import { softwarePlaceholder } from './software-placeholder.js';

describe('softwarePlaceholder', () => {
    it('satisfies the Work content schema', () => {
        expect(() => validateWork(softwarePlaceholder)).not.toThrow();
    });

    it('belongs to the software category', () => {
        expect(softwarePlaceholder.category).toBe('software');
    });
});
