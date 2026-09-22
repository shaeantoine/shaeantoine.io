import * as THREE from 'three';

/**
 * Fading a subtree, and putting it back the way it was.
 *
 * WHY "THE WAY IT WAS" IS THE HARD PART. A loaded model may legitimately ship
 * transparent materials — glass, a phone screen, a decal — so restoring "full
 * opacity" cannot mean a blanket opaque. Each material's own settings are
 * captured the first time it is faded and restored verbatim afterwards.
 *
 * The capture is stashed on the material rather than in a Map keyed by it:
 * materials are cloned per object instance at load (see DeskScene.attachModel),
 * so this rides along with the clone and cannot be orphaned by disposal. Same
 * reasoning as the hover emissive's `restEmissive` in DeskScene.
 *
 * Two callers need exactly this — the hardware bench swapping one project's
 * object for another's, and the books dissolving their closed .glb to make room
 * for an open one — and a second copy of it would be a second set of rules
 * about what "opaque" means.
 *
 * @param {THREE.Object3D} object3D
 * @param {number} opacity
 */
export function setSubtreeOpacity(object3D, opacity) {
    const opaque = opacity >= 0.999;
    object3D.userData.opacity = opacity;
    object3D.traverse((node) => {
        if (!node.isMesh) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
            if (material.userData.baseTransparent === undefined) {
                material.userData.baseTransparent = material.transparent;
                material.userData.baseOpacity = material.opacity;
            }
            material.transparent = opaque ? material.userData.baseTransparent : true;
            material.opacity = opaque ? material.userData.baseOpacity : opacity;
        }
    });
}
