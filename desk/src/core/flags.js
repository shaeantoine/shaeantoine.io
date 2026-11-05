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
 *   ?tier=phone   the device tier, forced (phone | desktop). Normally decided
 *                 from the primary pointer — see `tier` below.
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

const TIERS = ['phone', 'desktop'];
const tierParam = params.get('tier');
if (tierParam !== null && !TIERS.includes(tierParam)) {
    console.warn(`[desk] Ignoring ?tier=${tierParam} — expected phone or desktop.`);
}

/**
 * 'phone' | 'desktop': how much memory the room may assume it has. Decided
 * once, here, before anything is built, and never revisited — every allocation
 * it steers (the drawing buffer, the composer's samples, the AO pass, the
 * shadow maps, the canvases, the GLB textures) is made once at boot.
 *
 * WHY A TIER EXISTS AT ALL. Every budget in the engine was tuned on a laptop,
 * and a DPR-3 phone met each of them at its most expensive: the full device
 * ratio, 4x MSAA on a half-float target, GTAO, a 2048² key shadow, 2048²
 * textures on props a few hundred pixels across, and canvases sized from a
 * buffer taller than the laptop's. Added up at 390 x 844 @3 that came to about
 * 1.9 GB for one tab, and iOS Safari ends a tab that size by reloading it — the
 * loading bar nearly finishes, then "A problem occurred". None of those
 * budgets is wrong for a laptop, so the answer is a second set rather than
 * lower numbers for everyone.
 *
 * WHY THE POINTER, AND NOT THE SCREEN OR THE USER AGENT. `pointer: coarse` is
 * the primary input being a finger, which is the one signal that tracks "this
 * is a phone or a tablet" without sniffing a UA string or guessing from a size:
 * a narrow desktop window is still a desktop, with a desktop's memory, and an
 * iPad's UA claims to be a Mac while its primary pointer is still a finger.
 * Touch laptops report their trackpad, so they stay desktop. Tablets landing
 * on the phone tier is deliberate — the iOS limits that end the phone's tab are
 * the same process limits on an iPad, at a larger screen.
 *
 * `?tier=phone` is how to see the phone tier on a Mac (and how the node harness
 * forces it); `?tier=desktop` gives a phone the full renderer, for comparing.
 */
export const tier = TIERS.includes(tierParam)
    ? tierParam
    : (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches ? 'phone' : 'desktop');

/** tier === 'phone'. What the engine files test. */
export const phoneTier = tier === 'phone';

export function param(name) {
    return params.get(name);
}
