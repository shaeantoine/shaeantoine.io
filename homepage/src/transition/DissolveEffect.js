import { tween } from '../util/tween.js';

const DURATION_MS = 500;

/**
 * Encapsulates the mode-toggle transition visual. v1 implementation is a
 * simple opacity + scale tween applied to every mesh in the group — swapped
 * for a shader-based dissolve later if the plain tween doesn't read well
 * enough. ZoneLoader only calls dissolveOut/resolveIn; it never needs to
 * know which implementation is behind them.
 *
 * Materials in the kit are shared/cached by color (see kit/materials.js), so
 * meshes here get their material cloned to a per-instance copy before opacity
 * is touched — otherwise fading one zone's mesh would fade every other object
 * in the scene sharing that same cached material.
 */
function ensureOwnMaterial(mesh) {
    if (!mesh.userData.hasOwnMaterial) {
        mesh.material = mesh.material.clone();
        mesh.userData.hasOwnMaterial = true;
    }
}

function setGroupOpacity(object3D, opacity) {
    object3D.traverse((child) => {
        if (!child.isMesh) return;
        ensureOwnMaterial(child);
        child.material.transparent = true;
        child.material.opacity = opacity;
    });
}

/** @returns {Promise<void>} resolves once the object has fully dissolved out. */
export function dissolveOut(object3D) {
    return new Promise((resolve) => {
        tween({
            from: { opacity: 1, scale: 1 },
            to: { opacity: 0, scale: 0.7 },
            duration: DURATION_MS,
            onUpdate: ({ opacity, scale }) => {
                setGroupOpacity(object3D, opacity);
                object3D.scale.setScalar(scale);
            },
            onComplete: resolve
        });
    });
}

/** @returns {Promise<void>} resolves once the object has fully resolved in. */
export function resolveIn(object3D) {
    setGroupOpacity(object3D, 0);
    object3D.scale.setScalar(0.7);

    return new Promise((resolve) => {
        tween({
            from: { opacity: 0, scale: 0.7 },
            to: { opacity: 1, scale: 1 },
            duration: DURATION_MS,
            onUpdate: ({ opacity, scale }) => {
                setGroupOpacity(object3D, opacity);
                object3D.scale.setScalar(scale);
            },
            onComplete: resolve
        });
    });
}
