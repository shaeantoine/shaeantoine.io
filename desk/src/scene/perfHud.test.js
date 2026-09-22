import { describe, expect, it } from 'vitest';
import { estimateTargetBytes } from './perfHud.js';

/**
 * These assert the shape of the render-target budget rather than exact byte
 * counts, so they document the two decisions the numbers exist to justify —
 * multisampling one composer target instead of two, and evaluating AO below
 * frame resolution — and fail if either is quietly undone.
 * @see scene/renderPipeline.js
 */
describe('estimateTargetBytes', () => {
    // A 14" MacBook Pro at DPR 2, which is under DeskScene's area budget and so
    // renders at its display's true resolution.
    const frame = { width: 3024, height: 1890, samples: 4, halfFloat: true };

    it('is dominated by the one multisampled target', () => {
        const total = estimateTargetBytes({ ...frame, aoEnabled: false, aoScale: 0.5 });
        const pixels = frame.width * frame.height;
        const multisampleBuffer = pixels * 8 * 4;
        expect(multisampleBuffer / total).toBeGreaterThan(0.6);
    });

    it('would be far larger if both composer targets were multisampled', () => {
        const actual = estimateTargetBytes({ ...frame, aoEnabled: true, aoScale: 0.5 });
        // What the previous arrangement cost: renderTarget2's multisample
        // renderbuffer allocated a second time for renderTarget1, which only
        // ever receives full-screen quads.
        const pixels = frame.width * frame.height;
        const ifBothMultisampled = actual + pixels * 8 * 4;
        expect(ifBothMultisampled - actual).toBeGreaterThan(150e6);
    });

    it('charges nothing for AO when it is off', () => {
        const on = estimateTargetBytes({ ...frame, aoEnabled: true, aoScale: 0.5 });
        const off = estimateTargetBytes({ ...frame, aoEnabled: false, aoScale: 0.5 });
        expect(off).toBeLessThan(on);
    });

    it('scales the AO buffers by the square of the AO scale', () => {
        const base = estimateTargetBytes({ ...frame, aoEnabled: false, aoScale: 1 });
        const half = estimateTargetBytes({ ...frame, aoEnabled: true, aoScale: 0.5 }) - base;
        const full = estimateTargetBytes({ ...frame, aoEnabled: true, aoScale: 1 }) - base;
        expect(half / full).toBeCloseTo(0.25, 2);
    });

    it('halves with an 8-bit intermediate, which is the Safari fallback path', () => {
        const halfFloat = estimateTargetBytes({ ...frame, aoEnabled: false, aoScale: 0.5 });
        const byte = estimateTargetBytes({ ...frame, halfFloat: false, aoEnabled: false, aoScale: 0.5 });
        expect(byte).toBeCloseTo(halfFloat / 2, -3);
    });

    it('grows with the square of the frame’s linear size', () => {
        const full = estimateTargetBytes({ ...frame, aoEnabled: true, aoScale: 0.5 });
        const scaled = estimateTargetBytes({
            ...frame,
            width: Math.round(frame.width * 0.8),
            height: Math.round(frame.height * 0.8),
            aoEnabled: true,
            aoScale: 0.5
        });
        expect(scaled / full).toBeCloseTo(0.64, 2);
    });
});
