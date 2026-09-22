const ASPECT_RATIOS = {
    wide: 4 / 3,
    tall: 3 / 4,
    square: 1
};

/** Plane width/height (world units) for a Work's previewAspect, scaled by baseSize. */
export function cardDimensionsForAspect(previewAspect, baseSize) {
    const ratio = ASPECT_RATIOS[previewAspect] ?? 1;
    return ratio >= 1
        ? { width: baseSize, height: baseSize / ratio }
        : { width: baseSize * ratio, height: baseSize };
}
