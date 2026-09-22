/**
 * Render-on-demand frame scheduling.
 *
 * The desk is a static scene: nothing moves unless the visitor moves it. A
 * plain `requestAnimationFrame(render)` loop therefore spends most of its life
 * re-rendering an identical image — which on this scene is not cheap, because
 * every one of those frames pays for a GTAO depth/normal prepass, 16 AO
 * samples, a Poisson denoise, and (before this) a 2048² shadow map rebuild.
 *
 * So frames are requested rather than assumed. Anything that changes what the
 * scene looks like calls `invalidate()`; the loop renders one frame and then
 * stops itself entirely. An idle desk costs zero GPU time.
 *
 * Two levels of invalidation, because they have very different costs:
 *
 *   - `invalidate()`        — re-render. Use when only the camera moved, or a
 *                             material/texture changed. Shadow maps are
 *                             light-relative, so a camera dolly does not
 *                             require rebuilding them.
 *   - `invalidateShadows()` — re-render *and* rebuild the shadow map. Use when
 *                             geometry actually moved in world space.
 *
 * Both are module-level functions delegating to whichever scheduler is
 * currently mounted. That indirection is deliberate: `tween.js` is the single
 * chokepoint every animation in the app runs through, and threading a
 * scheduler reference down into every tween call site would make it possible
 * to forget one — and a forgotten one is an animation that silently doesn't
 * render. There is only ever one desk canvas, so one active scheduler.
 */

// Long enough to cover a frame at any sane refresh rate; only used for the
// very first frame after an idle gap, where there's no previous timestamp.
const ASSUMED_FIRST_DT_MS = 16;

// A tab restored after minutes in the background reports an enormous delta.
// Clamping keeps damped animations from teleporting to their target on the
// first frame back.
const MAX_DT_MS = 100;

let activeScheduler = null;

/** Request one more rendered frame. No-op before a scheduler is mounted. */
export function invalidate() {
    activeScheduler?.invalidate();
}

/** Request one more rendered frame, rebuilding shadow maps with it. */
export function invalidateShadows() {
    activeScheduler?.invalidateShadows();
}

/**
 * @param {(options: { rebuildShadows: boolean }) => void} render
 *        Draws one frame. `rebuildShadows` is true when geometry has moved
 *        since the last rendered frame.
 * @param {object} [options]
 * @param {(intervalMs: number) => void} [options.onSustainedFrame]
 *        Called with the raw interval since the previous frame, but ONLY when
 *        that previous animation frame also rendered. That qualifier is the
 *        entire value of the signal: this loop spends most of its life parked,
 *        so the gap between one idle nudge and the next says nothing about how
 *        fast the machine is, while the gap inside a continuous run — a dolly,
 *        the mouse echo settling — is exactly the frame rate a visitor sees.
 *        The interval is deliberately NOT clamped by MAX_DT_MS: a consumer
 *        measuring slowness needs to see a slow frame at its real length.
 *        @see scene/perfMonitor.js
 */
export function createRenderScheduler(render, { onSustainedFrame } = {}) {
    const ticks = new Set();

    let rafId = null;
    let idle = true;
    let disposed = false;
    let dirty = true;
    let shadowsDirty = true;
    let lastTime = null;
    // Whether the immediately preceding animation frame drew anything. Reset on
    // every cold start so the first frame out of an idle gap — the expensive
    // one, with caches cold — is never treated as part of a sustained run.
    let renderedPreviousFrame = false;

    function ensureRunning() {
        if (disposed) return;
        // Only restart the clock on a cold start. Doing it unconditionally
        // would reset dt to the assumed value every time something invalidated
        // mid-animation, quietly corrupting every damped approach in the app.
        if (idle) {
            lastTime = null;
            renderedPreviousFrame = false;
            idle = false;
        }
        if (rafId === null) rafId = requestAnimationFrame(frame);
    }

    function frame(now) {
        rafId = null;
        if (disposed) return;

        const elapsed = lastTime === null ? null : now - lastTime;
        const dt = elapsed === null ? ASSUMED_FIRST_DT_MS : Math.min(elapsed, MAX_DT_MS);
        lastTime = now;

        // Copied before iterating: a tick is allowed to remove itself.
        let wantsMore = false;
        for (const tick of [...ticks]) {
            if (tick(dt) === true) wantsMore = true;
        }

        const rendered = dirty || wantsMore;
        if (rendered) {
            render({ rebuildShadows: shadowsDirty });
            dirty = false;
            shadowsDirty = false;
        }

        // Reported after the draw is queued rather than before, so the interval
        // being measured is one that already includes a full frame's work.
        if (rendered && renderedPreviousFrame && elapsed !== null) onSustainedFrame?.(elapsed);
        renderedPreviousFrame = rendered;

        // A tick may have re-armed the loop by calling invalidate(), in which
        // case rafId is already set and must not be double-scheduled.
        if (wantsMore || dirty) {
            if (rafId === null) rafId = requestAnimationFrame(frame);
        } else if (rafId === null) {
            idle = true;
        }
    }

    const instance = {
        invalidate() {
            dirty = true;
            ensureRunning();
        },
        invalidateShadows() {
            shadowsDirty = true;
            dirty = true;
            ensureRunning();
        },
        /**
         * Registers a per-frame callback, called with the frame delta in ms.
         * Return `true` from it to keep the loop alive for another frame —
         * that's how continuously-damped motion (the mouse echo) holds the
         * loop open until it has settled, and releases it once it has.
         * Returns a function that unregisters the tick.
         */
        addTick(tick) {
            ticks.add(tick);
            ensureRunning();
            return () => ticks.delete(tick);
        },
        dispose() {
            disposed = true;
            if (rafId !== null) cancelAnimationFrame(rafId);
            rafId = null;
            ticks.clear();
            if (activeScheduler === instance) activeScheduler = null;
        }
    };

    activeScheduler = instance;
    // Armed immediately: `dirty` starts true because the canvas has never been
    // drawn, and without this nothing would schedule that first frame — the
    // scene would stay blank until some unrelated event happened to invalidate.
    ensureRunning();
    return instance;
}
