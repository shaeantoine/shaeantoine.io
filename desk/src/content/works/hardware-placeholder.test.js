import { describe, expect, it } from 'vitest';
import { validateWork } from '../schema.js';
import { hardwarePlaceholder } from './hardware-placeholder.js';

describe('hardwarePlaceholder', () => {
    it('satisfies the Work content schema', () => {
        expect(() => validateWork(hardwarePlaceholder)).not.toThrow();
    });

    it('belongs to the hardware category', () => {
        expect(hardwarePlaceholder.category).toBe('hardware');
    });
});
