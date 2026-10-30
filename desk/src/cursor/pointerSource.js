/**
 * One pointer listener for the whole desk.
 *
 * WHAT THIS REPLACES. Three modules independently attached `pointermove` to the
 * same canvas — DeskScene for hover raycasting, DeskCursor for the mouse echo,
 * the original site's IdleScreen for waking the monitor's caret — and two of
 * them called `getBoundingClientRect()` inside the handler. That is two forced
 * layouts per pointer event, on an element whose box provably cannot have
 * changed between them, plus a raycast, all running at whatever rate the
 * mouse reports rather than at the rate anything is drawn. A 1000 Hz gaming
 * mouse can deliver pointer events far faster than frames, and every one of
 * those was paying the full cost of a frame's worth of pointer work for a frame
 * that would never be rendered.
 *
 * TWO FIXES, AND THE SECOND IS THE ONE THAT MATTERS. Coalescing to one
 * animation frame means the work happens once per frame the browser will
 * actually draw, whatever the input device's rate — which is not a small
 * constant factor, it is the difference between bounded and unbounded. Caching
 * the rect means the layout is read once per resize rather than once per event.
 *
 * The rect is safe to cache because `.desk-canvas` is `position: fixed; inset:
 * 0` (see style.css), so it moves only when the viewport changes shape — but
 * this does not rely on that: it invalidates on resize and scroll, and
 * DeskScene's ResizeObserver invalidates it too, which covers the case where
 * the canvas's box changes without the window doing so.
 *
 * NOTHING HERE DECIDES WHAT A POINTER MEANS. It converts events to normalised
 * device coordinates and hands them out; hover, echo and whatever a module
 * does with ctx.pointer are still each subscriber's business.
 */

/**
 * @param {HTMLCanvasElement} canvasEl
 */
export function createPointerSource(canvasEl) {
    const moveSubscribers = new Set();
    const leaveSubscribers = new Set();

    let rect = null;
    let pendingX = 0;
    let pendingY = 0;
    let hasPending = false;
    let rafId = null;
    let disposed = false;

    function currentRect() {
        rect ??= canvasEl.getBoundingClientRect();
        return rect;
    }

    /** Drop the cached box; the next read measures again. */
    function invalidateRect() {
        rect = null;
    }

    /**
     * Canvas-relative normalised device coordinates for a client point:
     * -1..1 on each axis, y up. The form every raycast and every pointer-driven
     * animation in the app wants.
     */
    function ndcFor(clientX, clientY) {
        const box = currentRect();
        return {
            x: ((clientX - box.left) / box.width) * 2 - 1,
            y: -((clientY - box.top) / box.height) * 2 + 1
        };
    }

    function flush() {
        rafId = null;
        if (!hasPending || disposed) return;
        hasPending = false;
        const ndc = ndcFor(pendingX, pendingY);
        // Copied before iterating, so a subscriber may unsubscribe from inside
        // its own callback — the same rule renderScheduler's tick set follows.
        for (const subscriber of [...moveSubscribers]) subscriber(ndc);
    }

    function onPointerMove(event) {
        // Only the latest position matters. Everything between this event and
        // the next frame is a position the visitor's pointer has already left.
        pendingX = event.clientX;
        pendingY = event.clientY;
        hasPending = true;
        if (rafId === null) rafId = requestAnimationFrame(flush);
    }

    function onPointerLeave() {
        // Not coalesced: leaving is a single edge rather than a stream, and a
        // queued move must not be delivered after it and re-assert a pointer
        // that is no longer over the canvas.
        hasPending = false;
        for (const subscriber of [...leaveSubscribers]) subscriber();
    }

    canvasEl.addEventListener('pointermove', onPointerMove);
    canvasEl.addEventListener('pointerleave', onPointerLeave);
    // Passive: neither handler can cancel anything, and saying so keeps scroll
    // off the main thread's critical path.
    window.addEventListener('resize', invalidateRect, { passive: true });
    window.addEventListener('scroll', invalidateRect, { passive: true, capture: true });

    return {
        /**
         * @param {(ndc: {x: number, y: number}) => void} subscriber called at
         *        most once per animation frame, with the latest position.
         * @returns {() => void} unsubscribe
         */
        onMove(subscriber) {
            moveSubscribers.add(subscriber);
            return () => moveSubscribers.delete(subscriber);
        },
        /** @returns {() => void} unsubscribe */
        onLeave(subscriber) {
            leaveSubscribers.add(subscriber);
            return () => leaveSubscribers.delete(subscriber);
        },
        /**
         * For handlers that are NOT coalesced because they must not be —
         * clicks, where deferring to the next frame would be a dropped
         * interaction. They share the cached rect and so still avoid the layout.
         */
        ndcForEvent(event) {
            return ndcFor(event.clientX, event.clientY);
        },
        invalidateRect,
        dispose() {
            disposed = true;
            if (rafId !== null) cancelAnimationFrame(rafId);
            rafId = null;
            canvasEl.removeEventListener('pointermove', onPointerMove);
            canvasEl.removeEventListener('pointerleave', onPointerLeave);
            window.removeEventListener('resize', invalidateRect);
            window.removeEventListener('scroll', invalidateRect, { capture: true });
            moveSubscribers.clear();
            leaveSubscribers.clear();
        }
    };
}
