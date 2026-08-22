import { describe, expect, it } from 'vitest';
import { validateDeskLayout } from './deskSchema.js';
import { deskObjects } from './deskObjects.js';
import { works } from './works/index.js';

describe('deskObjects', () => {
    it('has 4 clickable category objects and at least 2 non-clickable atmosphere objects', () => {
        const clickable = deskObjects.filter((object) => object.clickable);
        const atmosphere = deskObjects.filter((object) => !object.clickable);
        expect(clickable).toHaveLength(4);
        expect(atmosphere.length).toBeGreaterThanOrEqual(2);
    });

    it('satisfies the desk layout schema and every clickable category has a matching Work', () => {
        expect(() => validateDeskLayout(deskObjects, works)).not.toThrow();
    });

    it('covers every category exactly once among clickable objects', () => {
        const categories = deskObjects.filter((object) => object.clickable).map((object) => object.category);
        expect(new Set(categories).size).toBe(categories.length);
    });
});
