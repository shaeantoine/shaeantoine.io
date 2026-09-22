import { describe, expect, it } from 'vitest';
import { dampedApproach } from './cursorTilt.js';

describe('dampedApproach', () => {
    it('returns the current value unchanged when dt is 0', () => {
        expect(dampedApproach(0, 10, 0)).toBeCloseTo(0);
    });

    it('moves partway toward the target for a finite dt', () => {
        const next = dampedApproach(0, 10, 50, 220);
        expect(next).toBeGreaterThan(0);
        expect(next).toBeLessThan(10);
    });

    it('converges to the target as dt grows large', () => {
        expect(dampedApproach(0, 10, 100000, 220)).toBeCloseTo(10, 2);
    });
});
