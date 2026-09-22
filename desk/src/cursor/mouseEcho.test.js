import { describe, expect, it } from 'vitest';
import { echoOffset, yawFromOffset, PAD_HALF_EXTENT, MAX_YAW } from './mouseEcho.js';

describe('echoOffset', () => {
    it('leaves the mouse at rest when the pointer is centered', () => {
        const offset = echoOffset({ x: 0, y: 0 });
        expect(offset.x).toBeCloseTo(0);
        expect(offset.z).toBeCloseTo(0);
    });

    it('slides the mouse right as the pointer moves right', () => {
        expect(echoOffset({ x: 1, y: 0 }).x).toBeCloseTo(PAD_HALF_EXTENT);
    });

    it('pushes the mouse away from the camera as the pointer moves up the screen', () => {
        expect(echoOffset({ x: 0, y: 1 }).z).toBeCloseTo(-PAD_HALF_EXTENT);
    });

    it('never leaves the mousepad, however far the pointer travels', () => {
        const offset = echoOffset({ x: 9, y: -9 });
        expect(Math.abs(offset.x)).toBeCloseTo(PAD_HALF_EXTENT);
        expect(Math.abs(offset.z)).toBeCloseTo(PAD_HALF_EXTENT);
    });

    it('honours a custom pad size', () => {
        expect(echoOffset({ x: 1, y: 0 }, 0.5).x).toBeCloseTo(0.5);
    });
});

describe('yawFromOffset', () => {
    it('leaves the mouse square at rest', () => {
        expect(yawFromOffset(0)).toBeCloseTo(0);
    });

    it('pivots in opposite directions at opposite edges of the pad', () => {
        expect(yawFromOffset(PAD_HALF_EXTENT)).toBeCloseTo(-MAX_YAW);
        expect(yawFromOffset(-PAD_HALF_EXTENT)).toBeCloseTo(MAX_YAW);
    });

    it('clamps to the maximum yaw past the pad edge', () => {
        expect(Math.abs(yawFromOffset(10))).toBeCloseTo(MAX_YAW);
    });

    it('returns no yaw for a degenerate pad rather than dividing by zero', () => {
        expect(yawFromOffset(1, 0)).toBe(0);
    });
});
