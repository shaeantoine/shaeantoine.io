import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createRenderScheduler, invalidate, invalidateShadows } from './renderScheduler.js';

/**
 * Drives requestAnimationFrame by hand so each test can step the loop one
 * frame at a time and assert on exactly which frames rendered — the whole
 * point of the scheduler is the frames it *doesn't* draw, and that's only
 * observable with deterministic control of the clock.
 */
function installFrameClock() {
    let pending = [];
    let nextId = 1;
    let now = 0;

    vi.stubGlobal('requestAnimationFrame', (callback) => {
        const id = nextId++;
        pending.push({ id, callback });
        return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id) => {
        pending = pending.filter((entry) => entry.id !== id);
    });

    return {
        /** Runs every callback queued as of now, advancing the clock by 16 ms. */
        step(deltaMs = 16) {
            now += deltaMs;
            const due = pending;
            pending = [];
            for (const { callback } of due) callback(now);
        },
        get queued() {
            return pending.length;
        }
    };
}

describe('createRenderScheduler', () => {
    let clock;
    let render;
    let scheduler;

    beforeEach(() => {
        clock = installFrameClock();
        render = vi.fn();
        scheduler = createRenderScheduler(render);
    });

    afterEach(() => {
        scheduler.dispose();
        vi.unstubAllGlobals();
    });

    it('renders once on mount so the first frame is never missed', () => {
        clock.step();
        expect(render).toHaveBeenCalledTimes(1);
    });

    it('parks itself after the initial frame instead of looping', () => {
        clock.step();
        clock.step();
        clock.step();
        expect(render).toHaveBeenCalledTimes(1);
        expect(clock.queued).toBe(0);
    });

    it('renders exactly one frame per invalidate()', () => {
        clock.step(); // consume the mount frame
        render.mockClear();

        scheduler.invalidate();
        clock.step();
        clock.step();
        expect(render).toHaveBeenCalledTimes(1);
    });

    it('rebuilds shadows on the mount frame, since nothing has been drawn yet', () => {
        clock.step();
        expect(render).toHaveBeenCalledWith({ rebuildShadows: true });
    });

    it('does not rebuild shadows for a plain invalidate()', () => {
        clock.step();
        render.mockClear();

        scheduler.invalidate();
        clock.step();
        expect(render).toHaveBeenCalledWith({ rebuildShadows: false });
    });

    it('rebuilds shadows for invalidateShadows()', () => {
        clock.step();
        render.mockClear();

        scheduler.invalidateShadows();
        clock.step();
        expect(render).toHaveBeenCalledWith({ rebuildShadows: true });
    });

    it('clears the shadow flag after the frame that consumed it', () => {
        clock.step();
        scheduler.invalidateShadows();
        clock.step();
        render.mockClear();

        scheduler.invalidate();
        clock.step();
        expect(render).toHaveBeenCalledWith({ rebuildShadows: false });
    });

    it('keeps rendering while a tick asks for more frames', () => {
        clock.step();
        render.mockClear();

        let framesWanted = 3;
        scheduler.addTick(() => framesWanted-- > 0);

        clock.step();
        clock.step();
        clock.step();
        clock.step();
        clock.step();
        expect(render).toHaveBeenCalledTimes(3);
        expect(clock.queued).toBe(0);
    });

    it('stops when every tick has settled', () => {
        clock.step();
        const tick = vi.fn(() => false);
        scheduler.addTick(tick);
        clock.step();
        render.mockClear();
        tick.mockClear();

        clock.step();
        expect(tick).not.toHaveBeenCalled();
        expect(render).not.toHaveBeenCalled();
    });

    it('passes a clamped delta so a backgrounded tab does not teleport animations', () => {
        clock.step();
        // The clamp only applies within a continuous run — a tab backgrounded
        // mid-animation, where rAF stops firing but the loop is still armed.
        // An idle gap is handled separately, by restarting the clock.
        const tick = vi.fn(() => true);
        scheduler.addTick(tick);
        clock.step();
        tick.mockClear();

        clock.step(60_000); // an hour in a background tab
        expect(tick).toHaveBeenCalledWith(100);
    });

    it('restarts the clock after an idle gap rather than reporting the whole gap', () => {
        clock.step();
        const tick = vi.fn(() => false);
        scheduler.addTick(tick);
        clock.step(); // tick settles, loop parks
        tick.mockClear();

        scheduler.invalidate();
        clock.step(60_000);
        expect(tick).toHaveBeenCalledWith(16);
    });

    it('reports a real delta between consecutive frames of a continuous run', () => {
        clock.step();
        const deltas = [];
        let remaining = 2;
        scheduler.addTick((dt) => {
            deltas.push(dt);
            return remaining-- > 0;
        });

        clock.step(16);
        clock.step(32);
        clock.step(8);
        // The first is the cold-start assumption; the rest are measured.
        expect(deltas.slice(1)).toEqual([32, 8]);
    });

    it('lets a removed tick stop holding the loop open', () => {
        clock.step();
        const remove = scheduler.addTick(() => true);
        clock.step();
        remove();
        clock.step();
        render.mockClear();

        clock.step();
        expect(render).not.toHaveBeenCalled();
    });

    it('renders the frame a tick requested via invalidate() from inside itself', () => {
        clock.step();
        render.mockClear();

        // The cursor does exactly this: its tick calls invalidateShadows() the
        // moment the mouse echo moves, mid-frame.
        let fired = false;
        scheduler.addTick(() => {
            if (fired) return false;
            fired = true;
            scheduler.invalidateShadows();
            return false;
        });

        clock.step();
        expect(render).toHaveBeenCalledWith({ rebuildShadows: true });
    });

    it('draws nothing more once disposed', () => {
        clock.step();
        scheduler.dispose();
        render.mockClear();

        scheduler.invalidate();
        clock.step();
        expect(render).not.toHaveBeenCalled();
    });
});

describe('module-level invalidate', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('is a no-op before any scheduler is mounted', () => {
        // tween.js calls these unconditionally, including from unit tests that
        // never build a scene — throwing here would break every one of them.
        expect(() => invalidate()).not.toThrow();
        expect(() => invalidateShadows()).not.toThrow();
    });

    it('drives the currently mounted scheduler', () => {
        const clock = installFrameClock();
        const render = vi.fn();
        const scheduler = createRenderScheduler(render);
        clock.step();
        render.mockClear();

        invalidateShadows();
        clock.step();
        expect(render).toHaveBeenCalledWith({ rebuildShadows: true });

        scheduler.dispose();
    });

    it('stops driving a disposed scheduler', () => {
        const clock = installFrameClock();
        const render = vi.fn();
        const scheduler = createRenderScheduler(render);
        clock.step();
        scheduler.dispose();
        render.mockClear();

        invalidate();
        clock.step();
        expect(render).not.toHaveBeenCalled();
    });
});

/**
 * The frame-rate signal the quality governor reads.
 *
 * What makes it meaningful is the frames it *refuses* to report: a scene that
 * renders on demand spends most of its life parked, so the gap between one idle
 * nudge and the next describes how long the visitor sat still, not how fast
 * their machine is. @see scene/perfMonitor.js
 */
describe('createRenderScheduler sustained-frame reporting', () => {
    let clock;
    let render;
    let onSustainedFrame;
    let scheduler;

    beforeEach(() => {
        clock = installFrameClock();
        render = vi.fn();
        onSustainedFrame = vi.fn();
        scheduler = createRenderScheduler(render, { onSustainedFrame });
    });

    afterEach(() => {
        scheduler.dispose();
        vi.unstubAllGlobals();
    });

    it('reports nothing for the very first frame, which has no interval behind it', () => {
        clock.step();
        expect(render).toHaveBeenCalledTimes(1);
        expect(onSustainedFrame).not.toHaveBeenCalled();
    });

    it('reports the interval between two back-to-back rendered frames', () => {
        scheduler.addTick(() => true); // hold the loop open
        clock.step(16);
        clock.step(16);
        expect(onSustainedFrame).toHaveBeenCalledWith(16);
    });

    it('reports a slow frame at its true length rather than the clamped delta', () => {
        // dt handed to ticks is clamped to 100 ms so damped motion cannot
        // teleport; the perf signal must not be, or every slow frame would be
        // reported as merely the clamp.
        scheduler.addTick(() => true);
        clock.step(16);
        clock.step(180);
        expect(onSustainedFrame).toHaveBeenCalledWith(180);
    });

    it('does not report across an idle gap, where the interval is the visitor pausing', () => {
        clock.step(); // mount frame renders, then the loop parks
        onSustainedFrame.mockClear();

        invalidate();
        clock.step(5000);
        // This frame rendered, but the one before it was thousands of
        // milliseconds earlier and the loop was asleep in between.
        expect(onSustainedFrame).not.toHaveBeenCalled();
    });

    it('does not report a frame whose predecessor rendered nothing', () => {
        // A tick that asks for frames without dirtying anything still runs the
        // loop; only frames that actually drew are comparable.
        let wantsFrames = true;
        scheduler.addTick(() => wantsFrames);
        clock.step(16);
        onSustainedFrame.mockClear();

        wantsFrames = false;
        clock.step(16); // ticks run, nothing renders
        clock.step(16);
        expect(onSustainedFrame).not.toHaveBeenCalled();
    });

    it('reports every interval through a sustained run', () => {
        scheduler.addTick(() => true);
        for (let i = 0; i < 5; i += 1) clock.step(16);
        // Five frames, four intervals between them.
        expect(onSustainedFrame).toHaveBeenCalledTimes(4);
    });

    it('is optional — a scheduler without the callback behaves exactly as before', () => {
        const bare = createRenderScheduler(render);
        expect(() => {
            clock.step(16);
            clock.step(16);
        }).not.toThrow();
        bare.dispose();
    });
});

