import { describe, expect, it } from 'vitest';
import { validateWork } from '../schema.js';
import { diaryPlaceholder } from './diary-placeholder.js';

describe('diaryPlaceholder', () => {
    it('satisfies the Work content schema', () => {
        expect(() => validateWork(diaryPlaceholder)).not.toThrow();
    });

    it('belongs to the diary category', () => {
        expect(diaryPlaceholder.category).toBe('diary');
    });
});
