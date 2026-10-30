/**
 * Seeded randomness. Anything on the site that varies — a print's skew on
 * the desk, a handwritten line's wobble — takes it from here, so every load
 * (and every screenshot) is identical. Never use Math.random in a module.
 *
 *   const r = rng('amazon');     // or rng(20260925)
 *   r()            -> [0, 1)
 *   r.range(a, b)  -> [a, b)
 *   r.signed(m)    -> [-m, m)
 *   r.int(a, b)    -> integer in [a, b]
 *   r.pick(array)
 */

function hashString(text) {
    // FNV-1a, 32-bit.
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

export function rng(seed = 1) {
    let state = (typeof seed === 'number' ? seed : hashString(String(seed))) >>> 0;
    if (state === 0) state = 0x9e3779b9;
    // mulberry32
    const next = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.range = (min, max) => min + (max - min) * next();
    next.signed = (magnitude = 1) => (next() * 2 - 1) * magnitude;
    next.int = (min, max) => Math.floor(min + (max - min + 1) * next());
    next.pick = (items) => items[Math.floor(next() * items.length)];
    return next;
}
