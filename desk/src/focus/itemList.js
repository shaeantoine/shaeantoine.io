/** Every Work belonging to `categoryId`, in registry order. */
export function worksForCategory(works, categoryId) {
    return works.filter((work) => work.category === categoryId);
}

/** Clamped index step — no wraparound (see design doc's deferred items). */
export function nextIndex(current, length, direction) {
    const step = direction === 'next' ? 1 : -1;
    return Math.min(Math.max(current + step, 0), length - 1);
}
