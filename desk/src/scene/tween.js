import { invalidate, invalidateShadows } from './renderScheduler.js';

/** Ease-in-out cubic for smooth start/stop for camera fly-to tweens. */
export function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Ease-out quintic: leaves at speed and decelerates the whole way.
 *
 * For moves that are already in progress when the visitor first sees them. An
 * ease-in-out spends its first third accelerating, which reads as the motion
 * *starting* — fine when the visitor caused it by clicking, wrong for the
 * opening shot, where the room should feel like it has been settling all along
 * and is coming to rest. Quintic rather than cubic because the tail is what
 * sells it: five-sixths of the move is over in the first third of the
 * duration, leaving a long, almost imperceptible settle.
 */
export function easeOutQuint(t) {
    return 1 - Math.pow(1 - t, 5);
}

/**
 * Ease-out cubic: full speed on the first frame, decelerating into the target.
 *
 * The curve for anything that is a *response* to an input. A symmetric
 * ease-in-out spends its opening frames barely moving, and at the durations
 * this app uses that reads as the click not having registered. Use this for
 * short object swaps; camera moves now take easeReach instead.
 */
export function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

/**
 * The curve of somebody leaning in to look at something.
 *
 * 3t⁴ - 8t³ + 6t², whose derivative is 12t(1 - t)² — zero speed at both ends,
 * peak speed one third of the way in, and a long decelerating tail. That
 * asymmetric bell is what a visually-guided human movement measures like: a
 * short push to get going, then a much longer settle as the eye closes the last
 * of the gap. A symmetric ease-in-out is the same idea with the two halves
 * equal, which is why it reads as a machine travelling between two points
 * rather than as a person arriving somewhere.
 *
 * WHY NOT easeOutCubic, WHICH THIS REPLACED ON THE DOLLY. That curve leaves at
 * full speed on frame one, which is the right answer at 440 ms — the move is
 * over before it can look like anything, and committing instantly is what makes
 * it feel answered. It is the wrong answer at 900 ms: a camera that starts at
 * full speed and never accelerates has no weight, and over that long you have
 * time to notice. The responsiveness that bought is paid for elsewhere now —
 * the object lifts and the vignette starts on the same frame as the click, so
 * the click is acknowledged before the camera has gone anywhere.
 *
 * It is still not slow off the mark: 5% of the distance is covered in the first
 * tenth of the duration and 18% in the first fifth, against 0.4% and 3% for
 * easeInOutCubic.
 */
export function easeReach(t) {
    return t * t * (6 + t * (3 * t - 8));
}

/**
 * Hand-rolled tween: interpolates a plain object's numeric fields from
 * `from` to `to` over `duration` ms, calling `onUpdate` each frame and
 * `onComplete` once. Returns a `cancel()` fn.
 *
 * Every animation in the app runs through here, which makes this the one
 * place that has to talk to the render scheduler — a tween whose frames
 * weren't requested would run its numbers perfectly and draw nothing.
 *
 * `movesGeometry` is the caller's promise about what it's animating, and it
 * is worth getting right: a camera dolly changes only the view matrix, and
 * shadow maps are rendered from the light rather than the camera, so the most
 * frequent animation in the whole app (the 900 ms focus dolly) can skip the
 * 2048² shadow rebuild entirely. It defaults to true so that forgetting to
 * think about it produces a correct frame rather than a stale shadow.
 */
export function tween({ from, to, duration, easing = easeInOutCubic, onUpdate, onComplete, movesGeometry = true }) {
    const requestFrame = movesGeometry ? invalidateShadows : invalidate;
    const start = performance.now();
    let raf = null;
    let cancelled = false;

    function step(now) {
        if (cancelled) return;
        const elapsed = now - start;
        const t = Math.min(1, elapsed / duration);
        const eased = easing(t);

        const current = {};
        for (const key of Object.keys(from)) {
            current[key] = from[key] + (to[key] - from[key]) * eased;
        }
        onUpdate(current, t);
        requestFrame();

        if (t < 1) {
            raf = requestAnimationFrame(step);
        } else {
            onComplete?.();
            // onComplete routinely does its own scene surgery — swapping a
            // finished page canvas in, disposing an outgoing card — after the
            // last interpolated frame has already been requested.
            requestFrame();
        }
    }

    raf = requestAnimationFrame(step);

    return function cancel() {
        cancelled = true;
        if (raf) cancelAnimationFrame(raf);
    };
}
