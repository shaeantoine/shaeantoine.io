import { describe, expect, it } from 'vitest';
import { computeExpandTransform } from './tileTransition.js';

describe('computeExpandTransform', () => {
    it('returns an identity transform when the tile already fills the viewport', () => {
        const tileRect = { left: 0, top: 0, width: 800, height: 600 };
        const viewportRect = { width: 800, height: 600 };
        expect(computeExpandTransform(tileRect, viewportRect)).toEqual({
            scaleX: 1,
            scaleY: 1,
            translateX: 0,
            translateY: 0
        });
    });

    it('computes scale and center-offset translation for a smaller, off-center tile', () => {
        const tileRect = { left: 100, top: 50, width: 200, height: 150 };
        const viewportRect = { width: 800, height: 600 };
        const transform = computeExpandTransform(tileRect, viewportRect);
        expect(transform.scaleX).toBeCloseTo(0.25);
        expect(transform.scaleY).toBeCloseTo(0.25);
        expect(transform.translateX).toBeCloseTo(-200);
        expect(transform.translateY).toBeCloseTo(-175);
    });
});
