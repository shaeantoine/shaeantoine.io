import * as THREE from 'three';

const corner = new THREE.Vector3();

const BOX_CORNER_SIGNS = [
    [-1, -1, -1], [-1, -1, 1], [-1, 1, -1], [-1, 1, 1],
    [1, -1, -1], [1, -1, 1], [1, 1, -1], [1, 1, 1]
];

/**
 * Projects a world-space Box3 through a camera into a screen-space rect
 * ({left, top, width, height} in pixels).
 *
 * @param {THREE.Box3} box3 world-space bounding box of the object
 * @param {THREE.Camera} camera camera to project through (matrices must already be up to date)
 * @param {{width: number, height: number}} viewportSize viewport size in pixels
 */
export function projectToScreenRect(box3, camera, viewportSize) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const [sx, sy, sz] of BOX_CORNER_SIGNS) {
        corner.set(
            sx < 0 ? box3.min.x : box3.max.x,
            sy < 0 ? box3.min.y : box3.max.y,
            sz < 0 ? box3.min.z : box3.max.z
        ).project(camera);

        const px = (corner.x * 0.5 + 0.5) * viewportSize.width;
        const py = (1 - (corner.y * 0.5 + 0.5)) * viewportSize.height;
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
    }

    return {
        left: minX,
        top: minY,
        width: maxX - minX,
        height: maxY - minY
    };
}
