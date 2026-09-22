/**
 * Measuring whether the desk is actually smooth, and giving it somewhere to go
 * when it isn't.
 *
 * WHY THIS EXISTS. Every other performance decision in this codebase is a
 * static one: a resolution ceiling, a texture budget, an AO scale, frames
 * rendered on demand rather than on a loop. All of them are sound and all of
 * them are guesses made on one machine. Nothing here ever measured what a
 * visitor's machine actually delivered, which meant a scene running at 20 fps
 * on a mid-range laptop was indistinguishable, from inside the code, from one
 * running at 120 on an M-series Mac. THE_DESK_DESIGN.md asks for the desk to
 * stay "usable on mid-range hardware"; this is the first thing in the project
 * that can tell whether it is.
 *
 * WHAT IT MEASURES, AND WHY THAT PARTICULAR THING. The interval between
 * consecutively rendered frames — not the wall time of `composer.render()`,
 * which measures almost nothing useful. WebGL draw calls are asynchronous: the
 * CPU queues work and returns, so timing the call measures how fast we can fill
 * a queue, not how long the GPU took to drain it. The honest signal available
 * without the timer-query extension (which is unevenly supported and often
 * disabled outright) is how far apart the browser actually delivered frames,
 * because that is throttled by whatever is slowest — GPU, compositor or main
 * thread — and it is also, precisely, the thing a visitor perceives.
 *
 * It only counts frames that were rendered on BACK-TO-BACK animation frames.
 * The desk renders on demand (see renderScheduler.js), so most intervals in a
 * session are the gap between one idle nudge and the next, which says nothing
 * about how fast anything is. A run of consecutive frames — a camera dolly, the
 * mouse echo settling — is a period of sustained load, and is the only period
 * where the interval means what this wants it to mean.
 *
 * WHY THE MEDIAN. A mean is dragged around by a single garbage collection or a
 * texture upload; the median over a window of frames describes the steady state
 * that the run actually held. Variance is tracked separately, because a
 * juddering 60 fps reads as more broken than a steady 40 — but it is reported
 * rather than acted on, since one hitch is not evidence that the machine cannot
 * keep up.
 *
 * WHY DOWNGRADES ARE ONE-WAY. The obvious design lets quality climb back when
 * frames recover, and the obvious design oscillates: dropping quality makes
 * frames fast, fast frames restore quality, restored quality makes frames slow.
 * Every crossing is a visible change in the image. A machine that could not
 * hold the budget once will probably fail to hold it again, and a visitor is
 * far better served by one small degradation they never notice than by a
 * setting that breathes. The ratchet only turns one way for the life of the
 * page.
 */

/**
 * The per-frame interval above which the scene is judged not smooth, in ms.
 *
 * 20 ms is 50 fps. Not 16.7: a budget set at exactly 60 fps would trip on any
 * machine whose display runs at 60 Hz and which occasionally misses a frame,
 * which is most of them, and the difference between 60 and 50 is not something
 * anyone reports. Below about 50 fps, motion starts to read as motion rather
 * than as continuity, and that is the line worth defending.
 */
export const FRAME_BUDGET_MS = 20;

/**
 * How many consecutive rendered frames are needed before the governor will act.
 *
 * Long enough that a decision describes a sustained run rather than the first
 * moments of one — the frames right after an idle gap are the expensive ones
 * (caches cold, shaders possibly still resolving) and are not representative.
 * Short enough that at 50 fps a window fills in under a second, so a machine
 * that cannot cope finds its level within the opening camera move rather than
 * three interactions later.
 */
export const WINDOW_FRAMES = 45;

/** An interval long enough to be a tab switch or a breakpoint rather than a slow frame. */
const STALE_FRAME_MS = 250;

/** Intervals at or above this are counted as jank — a visible hitch, not a slow frame. */
export const JANK_FRAME_MS = 50;

/**
 * The ladder, in the order it is descended.
 *
 * ORDERED BY WHAT IS LEAST MISSED, not by what saves the most. Each rung gives
 * up strictly more than the one above it:
 *
 *   1. `full` — what every machine starts on.
 *   2. `coarse-ao` — the AO buffer drops from half to just over a third of the
 *      frame's linear size, which is another ~2x off the most expensive pass in
 *      the renderer and is very nearly invisible on a signal this soft. This is
 *      the rung that should catch most machines that need catching.
 *   3. `no-ao` — contact occlusion off entirely. A real loss: it is what makes
 *      objects look like they are resting on the desk rather than floating
 *      above it. But the image stays sharp, and it buys a whole scene-geometry
 *      pass plus two full-screen passes.
 *   4. `reduced-resolution` — the last resort, and last for a reason. Scaling
 *      the drawing buffer means the compositor resamples every pixel on screen,
 *      which is the exact "slightly soft" failure that DeskScene's area budget
 *      is written to avoid. It is still the right final move: at this point the
 *      alternative is not a crisp image, it is a crisp image at 20 fps.
 *
 * `renderScale` multiplies DeskScene's area budget; `aoScale` and
 * `ambientOcclusion` go to scene/renderPipeline.js.
 */
export const QUALITY_TIERS = [
    { name: 'full', aoScale: 0.5, ambientOcclusion: true, renderScale: 1 },
    { name: 'coarse-ao', aoScale: 0.35, ambientOcclusion: true, renderScale: 1 },
    { name: 'no-ao', aoScale: 0.35, ambientOcclusion: false, renderScale: 1 },
    { name: 'reduced-resolution', aoScale: 0.35, ambientOcclusion: false, renderScale: 0.8 }
];

/** The middle value of `values`, which this sorts a copy of rather than in place. */
export function median(values) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = sorted.length >> 1;
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
}

/**
 * The value at `fraction` through `values`, by nearest rank.
 *
 * Nearest rank rather than interpolated: with windows this small the
 * interpolated variant invents values that no frame actually took, and the
 * point of reading a p95 here is to name a real bad frame.
 */
export function percentile(values, fraction) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const rank = Math.ceil(fraction * sorted.length) - 1;
    return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

/**
 * A fixed-length ring of the most recent frame intervals, for reporting.
 *
 * Kept separate from the governor's own window because the two want different
 * things from the same numbers: the governor clears its window after every
 * decision so that the next one measures the effect of the last, while a
 * readout wants a continuous view of the recent past regardless of when
 * decisions happened.
 */
export function createFrameStats(capacity = 120) {
    const intervals = [];
    let jank = 0;
    let total = 0;

    return {
        record(dt) {
            total += 1;
            if (dt >= JANK_FRAME_MS) jank += 1;
            intervals.push(dt);
            if (intervals.length > capacity) intervals.shift();
        },
        /** Frames per second implied by the median interval; 0 before any samples. */
        fps() {
            const m = median(intervals);
            return m > 0 ? 1000 / m : 0;
        },
        median: () => median(intervals),
        p95: () => percentile(intervals, 0.95),
        worst: () => (intervals.length ? Math.max(...intervals) : 0),
        get jank() { return jank; },
        get total() { return total; },
        get size() { return intervals.length; }
    };
}

/**
 * Watches frame intervals and steps down the quality ladder when a full window
 * of them misses the budget.
 *
 * @param {object} [options]
 * @param {(tier: object, index: number) => void} [options.onChange] applied by
 *        the caller — this module decides, it does not touch the renderer.
 * @returns a governor. Feed it `record(dt)` once per rendered frame that
 *          followed another rendered frame; see the module note for why that
 *          qualifier is the whole measurement.
 */
export function createQualityGovernor({
    tiers = QUALITY_TIERS,
    budgetMs = FRAME_BUDGET_MS,
    windowFrames = WINDOW_FRAMES,
    onChange
} = {}) {
    let index = 0;
    let window = [];

    return {
        record(dt) {
            // A negative or absent delta is a caller bug; a very long one is the
            // tab having been in the background, or a debugger. Neither is
            // evidence about this machine's speed, and counting them would
            // downgrade a fast machine for being paused.
            if (!(dt > 0) || dt >= STALE_FRAME_MS) return;
            // Already at the bottom — keep serving frames, stop measuring for
            // decisions there is no longer any way to act on.
            if (index >= tiers.length - 1) return;

            window.push(dt);
            if (window.length < windowFrames) return;

            const held = median(window);
            // Cleared whatever the verdict, so the next window measures a fresh
            // run — and, after a downgrade, measures the downgrade.
            window = [];
            if (held <= budgetMs) return;

            index += 1;
            onChange?.(tiers[index], index);
        },
        /** Discard the window in progress — e.g. after a resize reallocates every target. */
        reset() {
            window = [];
        },
        get tier() { return tiers[index]; },
        get tierIndex() { return index; },
        get atFloor() { return index >= tiers.length - 1; }
    };
}
