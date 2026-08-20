/** Ease-in-out cubic for smooth start/stop for camera fly-to tweens. */
export function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Hand-rolled tween: interpolates a plain object's numeric fields from
 * `from` to `to` over `duration` ms, calling `onUpdate` each frame and
 * `onComplete` once. Returns a `cancel()` fn.
 */
export function tween({ from, to, duration, easing = easeInOutCubic, onUpdate, onComplete }) {
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

        if (t < 1) {
            raf = requestAnimationFrame(step);
        } else {
            onComplete?.();
        }
    }

    raf = requestAnimationFrame(step);

    return function cancel() {
        cancelled = true;
        if (raf) cancelAnimationFrame(raf);
    };
}
