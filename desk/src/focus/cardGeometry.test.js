import { describe, expect, it } from 'vitest';
import { cardDimensionsForAspect } from './cardGeometry.js';

describe('cardDimensionsForAspect', () => {
    it('returns a wider-than-tall size for "wide"', () => {
        const { width, height } = cardDimensionsForAspect('wide', 1);
        expect(width).toBeGreaterThan(height);
    });

    it('returns a taller-than-wide size for "tall"', () => {
        const { width, height } = cardDimensionsForAspect('tall', 1);
        expect(height).toBeGreaterThan(width);
    });

    it('returns an equal size for "square"', () => {
        const { width, height } = cardDimensionsForAspect('square', 1);
        expect(width).toBeCloseTo(height);
    });

    it('scales linearly with the baseSize argument', () => {
        const small = cardDimensionsForAspect('square', 1);
        const big = cardDimensionsForAspect('square', 2);
        expect(big.width).toBeCloseTo(small.width * 2);
    });
});
