/**
 * Helpers for a module's `deskObjects` entries (the same shape as
 * src/content/deskObjects.js — scene/DeskScene.js is what reads the fields).
 *
 * WHY A HIT PROXY. DeskScene freezes each clickable object's hover/click box
 * from its `parts` the moment the scene is built — before any module mounts.
 * A module that builds its real meshes in mount() (the usual case: they need
 * canvases, media, fonts) would otherwise get a 1 cm hitbox at its origin. So
 * give the entry an invisible box the size of the object: it defines the
 * hitbox and the tooltip anchor, and renders nothing (material.visible=false
 * also keeps it out of the shadow map).
 */

/**
 * @param {[number, number, number]} size world units (x, y, z) in the object's local frame
 * @param {{ position?: number[], rotation?: number[] }} [options] default: resting on y=0
 */
export function hitProxy(size, { position, rotation } = {}) {
    return {
        type: 'box',
        args: [...size],
        position: position ?? [0, size[1] / 2, 0],
        ...(rotation ? { rotation } : {}),
        color: '#000000',
        material: { visible: false }
    };
}
