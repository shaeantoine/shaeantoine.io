/**
 * Computes the transform that visually places a viewport-sized
 * element exactly over a smaller tile's rect. Animating from this transform
 * to the identity (translate(0,0) scale(1,1)) grows the tile into fullscreen;
 * animating the reverse shrinks it back.
 */
export function computeExpandTransform(tileRect, viewportRect) {
    const scaleX = tileRect.width / viewportRect.width;
    const scaleY = tileRect.height / viewportRect.height;
    const tileCenterX = tileRect.left + tileRect.width / 2;
    const tileCenterY = tileRect.top + tileRect.height / 2;
    const viewportCenterX = viewportRect.width / 2;
    const viewportCenterY = viewportRect.height / 2;

    return {
        scaleX,
        scaleY,
        translateX: tileCenterX - viewportCenterX,
        translateY: tileCenterY - viewportCenterY
    };
}
