import { describe, expect, it, vi } from 'vitest';
import {
    FRAME_BUDGET_MS,
    JANK_FRAME_MS,
    QUALITY_TIERS,
    WINDOW_FRAMES,
    createFrameStats,
    createQualityGovernor,
    median,
    percentile
} from './perfMonitor.js';

describe('median', () => {
    it('is 0 for no samples, so a readout before any frame reads as unknown rather than NaN', () => {
        expect(median([])).toBe(0);
    });

    it('takes the middle of an odd-length set', () => {
        expect(median([30, 10, 20])).toBe(20);
    });

    it('averages the two middles of an even-length set', () => {
        expect(median([10, 20, 30, 40])).toBe(25);
    });

    it('does not reorder the caller’s array', () => {
        const values = [30, 10, 20];
        median(values);
        expect(values).toEqual([30, 10, 20]);
    });

    it('is unmoved by a single outlier, which is the reason it is used', () => {
        // One 500 ms garbage collection in an otherwise 16 ms run must not be
        // read as "this machine cannot keep up".
        expect(median([16, 16, 16, 16, 500])).toBe(16);
    });
});

describe('percentile', () => {
    it('reports a value that actually occurred rather than interpolating', () => {
        const values = [10, 20, 30, 40, 100];
        expect(values).toContain(percentile(values, 0.95));
    });

    it('returns the maximum at the top of the range', () => {
        expect(percentile([10, 20, 30, 40, 100], 1)).toBe(100);
    });

    it('returns the minimum at the bottom of the range', () => {
        expect(percentile([10, 20, 30, 40, 100], 0)).toBe(10);
    });

    it('is 0 for no samples', () => {
        expect(percentile([], 0.95)).toBe(0);
    });
});

describe('createFrameStats', () => {
    it('converts the median interval to frames per second', () => {
        const stats = createFrameStats();
        for (let i = 0; i < 5; i += 1) stats.record(20);
        expect(stats.fps()).toBeCloseTo(50, 5);
    });

    it('reads as 0 fps before anything has been recorded', () => {
        expect(createFrameStats().fps()).toBe(0);
    });

    it('counts frames at or over the jank threshold, and keeps counting past the window', () => {
        const stats = createFrameStats(4);
        stats.record(16);
        stats.record(JANK_FRAME_MS);
        stats.record(JANK_FRAME_MS + 200);
        expect(stats.jank).toBe(2);
        expect(stats.total).toBe(3);
    });

    it('bounds what it retains, so a long session cannot grow the buffer without limit', () => {
        const stats = createFrameStats(10);
        for (let i = 0; i < 100; i += 1) stats.record(16);
        expect(stats.size).toBe(10);
        // The lifetime counters are not windowed — they describe the session.
        expect(stats.total).toBe(100);
    });

    it('forgets old intervals, so the median tracks the recent past', () => {
        const stats = createFrameStats(4);
        for (let i = 0; i < 4; i += 1) stats.record(100);
        for (let i = 0; i < 4; i += 1) stats.record(10);
        expect(stats.median()).toBe(10);
    });
});

describe('createQualityGovernor', () => {
    const slow = FRAME_BUDGET_MS + 15;
    const fast = 8;

    function feed(governor, intervalMs, frames = WINDOW_FRAMES) {
        for (let i = 0; i < frames; i += 1) governor.record(intervalMs);
    }

    it('starts on the top tier and stays there while frames are inside budget', () => {
        const onChange = vi.fn();
        const governor = createQualityGovernor({ onChange });
        feed(governor, fast, WINDOW_FRAMES * 4);
        expect(onChange).not.toHaveBeenCalled();
        expect(governor.tier.name).toBe('full');
    });

    it('waits for a full window before acting, so one bad moment cannot downgrade', () => {
        const onChange = vi.fn();
        const governor = createQualityGovernor({ onChange });
        feed(governor, slow, WINDOW_FRAMES - 1);
        expect(onChange).not.toHaveBeenCalled();
        governor.record(slow);
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('steps down one rung per over-budget window rather than jumping to the floor', () => {
        const onChange = vi.fn();
        const governor = createQualityGovernor({ onChange });
        feed(governor, slow);
        expect(governor.tier.name).toBe(QUALITY_TIERS[1].name);
        feed(governor, slow);
        expect(governor.tier.name).toBe(QUALITY_TIERS[2].name);
        expect(onChange).toHaveBeenCalledTimes(2);
    });

    it('stops at the bottom of the ladder instead of running off the end', () => {
        const governor = createQualityGovernor();
        for (let i = 0; i < QUALITY_TIERS.length + 5; i += 1) feed(governor, slow);
        expect(governor.tierIndex).toBe(QUALITY_TIERS.length - 1);
        expect(governor.atFloor).toBe(true);
    });

    it('never climbs back, because a setting that breathes is worse than one that is slightly low', () => {
        const governor = createQualityGovernor();
        feed(governor, slow);
        const downgraded = governor.tier.name;
        feed(governor, fast, WINDOW_FRAMES * 5);
        expect(governor.tier.name).toBe(downgraded);
    });

    it('measures the effect of a downgrade before considering another', () => {
        const onChange = vi.fn();
        const governor = createQualityGovernor({ onChange });
        feed(governor, slow);
        expect(onChange).toHaveBeenCalledTimes(1);
        // The window is cleared on every decision, so these fast frames are a
        // fresh measurement rather than being mixed with the slow ones that
        // triggered the first step.
        feed(governor, fast);
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('ignores intervals long enough to be a backgrounded tab', () => {
        const onChange = vi.fn();
        const governor = createQualityGovernor({ onChange });
        feed(governor, 5000);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('ignores non-positive intervals', () => {
        const onChange = vi.fn();
        const governor = createQualityGovernor({ onChange });
        feed(governor, 0);
        feed(governor, -16);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('discards the window in progress on reset, so a resize is not measured', () => {
        const onChange = vi.fn();
        const governor = createQualityGovernor({ onChange });
        feed(governor, slow, WINDOW_FRAMES - 1);
        governor.reset();
        governor.record(slow);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('hands the tier to the caller rather than touching a renderer itself', () => {
        const onChange = vi.fn();
        const governor = createQualityGovernor({ onChange });
        feed(governor, slow);
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({ name: expect.any(String), aoScale: expect.any(Number) }),
            1
        );
    });
});

describe('QUALITY_TIERS', () => {
    it('descends — each rung gives up at least as much as the one above it', () => {
        for (let i = 1; i < QUALITY_TIERS.length; i += 1) {
            const above = QUALITY_TIERS[i - 1];
            const below = QUALITY_TIERS[i];
            const cost = (tier) =>
                tier.renderScale * tier.renderScale * (1 + (tier.ambientOcclusion ? tier.aoScale : 0));
            expect(cost(below)).toBeLessThan(cost(above));
        }
    });

    it('starts at full quality, so no machine is degraded before it is measured', () => {
        expect(QUALITY_TIERS[0]).toMatchObject({ renderScale: 1, ambientOcclusion: true });
    });
});
