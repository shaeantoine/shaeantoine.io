import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createPointerSource } from './pointerSource.js';

/**
 * A canvas stand-in that records its listeners so tests can fire events at it,
 * and counts how often its box is measured — the layout read is the cost this
 * module exists to remove, so it is the thing worth asserting on.
 */
function createFakeCanvas() {
    const listeners = new Map();
    let rectReads = 0;

    return {
        addEventListener(type, handler) {
            listeners.set(type, handler);
        },
        removeEventListener(type) {
            listeners.delete(type);
        },
        getBoundingClientRect() {
            rectReads += 1;
            return { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 };
        },
        emit(type, detail) {
            listeners.get(type)?.(detail);
        },
        has(type) {
            return listeners.has(type);
        },
        get rectReads() {
            return rectReads;
        }
    };
}

function installFrameClock() {
    let pending = [];
    let nextId = 1;
    vi.stubGlobal('requestAnimationFrame', (callback) => {
        const id = nextId++;
        pending.push({ id, callback });
        return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id) => {
        pending = pending.filter((entry) => entry.id !== id);
    });
    return {
        step() {
            const due = pending;
            pending = [];
            for (const { callback } of due) callback(performance.now());
        },
        get queued() {
            return pending.length;
        }
    };
}

describe('createPointerSource', () => {
    let canvas;
    let clock;
    let source;

    beforeEach(() => {
        canvas = createFakeCanvas();
        clock = installFrameClock();
        vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
        source = createPointerSource(canvas);
    });

    afterEach(() => {
        source.dispose();
        vi.unstubAllGlobals();
    });

    it('converts client coordinates to normalised device coordinates', () => {
        const seen = [];
        source.onMove((ndc) => seen.push(ndc));
        canvas.emit('pointermove', { clientX: 100, clientY: 50 });
        clock.step();
        // Dead centre of a 200x100 box.
        expect(seen).toEqual([{ x: 0, y: 0 }]);
    });

    it('puts the origin at the bottom left, y up, the way a raycast wants it', () => {
        const seen = [];
        source.onMove((ndc) => seen.push(ndc));
        canvas.emit('pointermove', { clientX: 0, clientY: 100 });
        clock.step();
        expect(seen[0]).toEqual({ x: -1, y: -1 });
    });

    it('delivers at most once per animation frame however many events arrive', () => {
        const subscriber = vi.fn();
        source.onMove(subscriber);
        for (let i = 0; i < 20; i += 1) canvas.emit('pointermove', { clientX: i, clientY: i });
        clock.step();
        expect(subscriber).toHaveBeenCalledTimes(1);
    });

    it('delivers the newest position, not the one that opened the frame', () => {
        const seen = [];
        source.onMove((ndc) => seen.push(ndc));
        canvas.emit('pointermove', { clientX: 0, clientY: 0 });
        canvas.emit('pointermove', { clientX: 200, clientY: 0 });
        clock.step();
        expect(seen).toHaveLength(1);
        expect(seen[0].x).toBe(1);
    });

    it('only schedules one frame for a burst of events', () => {
        source.onMove(() => {});
        canvas.emit('pointermove', { clientX: 1, clientY: 1 });
        canvas.emit('pointermove', { clientX: 2, clientY: 2 });
        canvas.emit('pointermove', { clientX: 3, clientY: 3 });
        expect(clock.queued).toBe(1);
    });

    it('reads the canvas box once across many events rather than once per event', () => {
        source.onMove(() => {});
        for (let i = 0; i < 10; i += 1) {
            canvas.emit('pointermove', { clientX: i, clientY: i });
            clock.step();
        }
        expect(canvas.rectReads).toBe(1);
    });

    it('measures again after the box is invalidated', () => {
        source.onMove(() => {});
        canvas.emit('pointermove', { clientX: 1, clientY: 1 });
        clock.step();
        source.invalidateRect();
        canvas.emit('pointermove', { clientX: 2, clientY: 2 });
        clock.step();
        expect(canvas.rectReads).toBe(2);
    });

    it('fans one event out to every subscriber', () => {
        const first = vi.fn();
        const second = vi.fn();
        source.onMove(first);
        source.onMove(second);
        canvas.emit('pointermove', { clientX: 10, clientY: 10 });
        clock.step();
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(1);
    });

    it('stops delivering to an unsubscribed subscriber', () => {
        const subscriber = vi.fn();
        const unsubscribe = source.onMove(subscriber);
        unsubscribe();
        canvas.emit('pointermove', { clientX: 10, clientY: 10 });
        clock.step();
        expect(subscriber).not.toHaveBeenCalled();
    });

    it('lets a subscriber unsubscribe from inside its own callback', () => {
        const calls = [];
        const unsubscribe = source.onMove(() => {
            calls.push('first');
            unsubscribe();
        });
        source.onMove(() => calls.push('second'));
        canvas.emit('pointermove', { clientX: 10, clientY: 10 });
        clock.step();
        expect(calls).toEqual(['first', 'second']);
    });

    it('reports a leave immediately rather than waiting for a frame', () => {
        const onLeave = vi.fn();
        source.onLeave(onLeave);
        canvas.emit('pointerleave', {});
        expect(onLeave).toHaveBeenCalledTimes(1);
    });

    it('drops a queued move when the pointer leaves, so a stale position cannot land after it', () => {
        const onMove = vi.fn();
        source.onMove(onMove);
        canvas.emit('pointermove', { clientX: 10, clientY: 10 });
        canvas.emit('pointerleave', {});
        clock.step();
        expect(onMove).not.toHaveBeenCalled();
    });

    it('converts an event directly for callers that must not be deferred', () => {
        expect(source.ndcForEvent({ clientX: 200, clientY: 0 })).toEqual({ x: 1, y: 1 });
    });

    it('shares the cached box with the uncoalesced path', () => {
        source.ndcForEvent({ clientX: 1, clientY: 1 });
        source.ndcForEvent({ clientX: 2, clientY: 2 });
        expect(canvas.rectReads).toBe(1);
    });

    it('detaches from the canvas on dispose', () => {
        source.dispose();
        expect(canvas.has('pointermove')).toBe(false);
        expect(canvas.has('pointerleave')).toBe(false);
    });

    it('does not deliver a frame that was already queued when it was disposed', () => {
        const subscriber = vi.fn();
        source.onMove(subscriber);
        canvas.emit('pointermove', { clientX: 10, clientY: 10 });
        source.dispose();
        clock.step();
        expect(subscriber).not.toHaveBeenCalled();
    });
});
