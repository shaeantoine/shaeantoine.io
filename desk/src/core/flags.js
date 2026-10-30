/**
 * Page-level switches, read once from the URL.
 *
 *   ?still=1      screenshot mode: no veil delay, no intro, every transition
 *                 instant, seeded randomness, fixed clock, timers parked.
 *   ?now=ISO      fixes the clock (implied by ?still; default below).
 *   ?time=day     the room's lighting preset — read by src/scene/timeOfDay.js
 *                 itself, not here (morning | day | evening | night).
 *   ?motion=1     forces animation on even under prefers-reduced-motion
 *                 (for checking the choreography on a machine that asks for less).
 *   ?film=1       film mode: everything animates, but the clock is fixed
 *                 (default below) and the visit numbers are ?still=1's, so a
 *                 recording is the same every time.
 *                 Implies ?motion=1. Randomness is always seeded (core/rng.js).
 */

const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);

const truthy = (value) => value !== null && value !== '0' && value !== 'false';

export const DEFAULT_STILL_NOW = '2026-09-25T21:40:00';

/** Screenshot mode. */
export const still = truthy(params.get('still'));

/** Film mode: animated, but deterministic (fixed clock, fixed visit numbers). Never together with still. */
export const film = !still && truthy(params.get('film'));

/** Still or film: the page must look the same on every load (fixed clock, fixed visit numbers). */
export const deterministic = still || film;

/** The visitor asked for less motion (and did not override it with ?motion=1 or ?film=1). */
export const reducedMotion = !film && !truthy(params.get('motion'))
    && Boolean(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/** Every transition should land in one frame. */
export const instant = still || reducedMotion;

const nowParam = params.get('now') ?? (deterministic ? DEFAULT_STILL_NOW : null);
const fixedNow = nowParam ? new Date(nowParam) : null;
if (fixedNow && Number.isNaN(fixedNow.getTime())) {
    console.warn(`[desk] Ignoring ?now=${nowParam} — not a date.`);
}

/** The clock the site shows. Fixed under ?now=, ?still=1 or ?film=1. */
export function now() {
    if (fixedNow && !Number.isNaN(fixedNow.getTime())) return new Date(fixedNow.getTime());
    return new Date();
}

/** True when now() is pinned. */
export const clockFixed = Boolean(fixedNow && !Number.isNaN(fixedNow.getTime()));

export function param(name) {
    return params.get(name);
}
