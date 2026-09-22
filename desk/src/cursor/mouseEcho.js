/**
 * Pure math for the desk mouse's sympathetic motion.
 *
 * The mouse on the desk echoes the visitor's real one. It deliberately isn't
 * the pointer: it's pinned to the desktop plane and so could never reach the
 * display or the paper stack, and making it the hit-target would wreck precision.
 * It just slides a few centimetres around an invisible mousepad, which is
 * enough for the "wait, did that just—" moment that sells the whole conceit.
 */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Half-width/depth of the mousepad the echo is confined to, in world units. */
export const PAD_HALF_EXTENT = 0.16;

/** A real mouse pivots slightly as it's dragged sideways. */
export const MAX_YAW = 0.18;

/**
 * Maps a normalized pointer position (-1..1 per axis, canvas-relative) to an
 * offset from the mouse's rest position on the desktop.
 *
 * Screen-up is scene-away, hence the inverted z: NDC y of +1 (top of the
 * viewport) pushes the mouse to -z, further from the camera.
 *
 * @returns {{ x: number, z: number }}
 */
export function echoOffset(pointerNdc, halfExtent = PAD_HALF_EXTENT) {
    return {
        x: clamp(pointerNdc.x, -1, 1) * halfExtent,
        z: -clamp(pointerNdc.y, -1, 1) * halfExtent
    };
}

/**
 * Yaw to apply at a given sideways offset. Negated so the mouse's nose swings
 * away from the direction of travel, the way one pivots under a palm — flip
 * the sign if it reads better the other way, it's purely a taste knob.
 */
export function yawFromOffset(offsetX, halfExtent = PAD_HALF_EXTENT, maxYaw = MAX_YAW) {
    if (halfExtent <= 0) return 0;
    return -clamp(offsetX / halfExtent, -1, 1) * maxYaw;
}
