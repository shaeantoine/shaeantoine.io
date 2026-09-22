/**
 * Frame-rate-independent exponential approach of `current` toward `target`
 * over `dt` milliseconds, with `smoothingMs` controlling how quickly it
 * settles (larger = lazier). Used every render frame rather than a fixed
 * tween, since the target keeps moving with the cursor.
 */
export function dampedApproach(current, target, dt, smoothingMs = 220) {
    const t = 1 - Math.exp(-dt / smoothingMs);
    return current + (target - current) * t;
}
