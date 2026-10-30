/**
 * Work in flight that a screenshot (or a test) has to wait for.
 *
 * `track(promise, label)` registers anything asynchronous whose result changes
 * the picture — an image decoding, a canvas waiting on a font, a module's
 * route transition. `__desk.settled()` (see main.js) waits until nothing is
 * tracked, no animation or camera move is running, and two frames have been
 * drawn after that. Media, fonts, animations and routes are tracked by the core
 * automatically; a module only needs `ctx.track` for its own async work.
 */

const pending = new Map(); // promise -> label
let sequence = 0;

export function track(promise, label = 'work') {
    if (!promise || typeof promise.then !== 'function') return promise;
    const key = promise;
    pending.set(key, `${label}#${(sequence += 1)}`);
    const done = () => { pending.delete(key); };
    promise.then(done, done);
    return promise;
}

/** Labels of everything still outstanding, for diagnostics. */
export function outstanding() {
    return [...pending.values()];
}

export function hasPending() {
    return pending.size > 0;
}

/** Resolves once everything tracked right now has settled (never rejects). */
export function drain() {
    return Promise.allSettled([...pending.keys()]).then(() => undefined);
}
