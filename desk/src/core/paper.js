import * as THREE from 'three';
import { palette } from './palette.js';
import { mm } from './framing.js';

/**
 * Paper, as the room's one kind of paper: a thin box with a front and a back.
 *
 * Built UPRIGHT in its own frame — front facing local +Z, top toward local +Y —
 * which is the orientation poseInFront() hands back, so a sheet can go from the
 * desk to "in hand" by animating one quaternion. To lay it face-up on the desk,
 * rotate it -PI/2 about X (front → +Y, top → -Z: right way up from the
 * establishing camera).
 *
 * Turning it over about its local +Y (motion.turnOver's default) shows the back
 * face upright and unmirrored: BoxGeometry's -Z face is UV-mapped to read
 * correctly from behind.
 *
 *   const print = paperSheet({ width: 0.345, height: 0.56, front: frontTexture, back: backTexture,
 *                              roughness: 0.45 });   // lustre photo paper
 */

const FRONT = 4; // BoxGeometry groups: +x, -x, +y, -y, +z, -z
const BACK = 5;

/**
 * @param {object} options
 * @param {number} options.width   world units
 * @param {number} options.height  world units
 * @param {number} [options.thickness]  default 0.3 mm
 * @param {THREE.Texture} [options.front]
 * @param {THREE.Texture} [options.back]
 * @param {string} [options.color]      the front's colour where there is no texture, and the edges
 * @param {string} [options.backColor]
 * @param {number} [options.roughness=0.88]   ~0.4 for lustre photo paper, ~0.9 for bond / newsprint / card
 * @param {number} [options.backRoughness]
 * @returns {THREE.Mesh} castShadow/receiveShadow on; materials [edge ×4, front, back]
 */
export function paperSheet({
    width,
    height,
    thickness = mm(0.3),
    front = null,
    back = null,
    color = palette.paper,
    backColor = palette.photoBack,
    roughness = 0.88,
    backRoughness = 0.9
}) {
    const edge = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 });
    const frontMaterial = new THREE.MeshStandardMaterial({
        color: front ? '#ffffff' : color,
        map: front,
        roughness,
        metalness: 0
    });
    const backMaterial = new THREE.MeshStandardMaterial({
        color: back ? '#ffffff' : backColor,
        map: back,
        roughness: backRoughness,
        metalness: 0
    });
    const materials = [edge, edge, edge, edge, edge, edge];
    materials[FRONT] = frontMaterial;
    materials[BACK] = backMaterial;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, thickness), materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.paper = { width, height, thickness };
    return mesh;
}

/** Swap a sheet's front or back texture (e.g. after a repaint into a new canvas). */
export function setPaperFace(mesh, face, texture) {
    const material = mesh.material[face === 'back' ? BACK : FRONT];
    material.map = texture;
    material.color.set(texture ? '#ffffff' : material.color);
    material.needsUpdate = true;
}

/** The rotation that lays an upright sheet face-up on the desk. */
export const FACE_UP = Object.freeze([-Math.PI / 2, 0, 0]);

// ---------------------------------------------------------------------------
// Sticky notes
// ---------------------------------------------------------------------------

/**
 * How much light reaches a sticky, as an exposure factor: the rendered colour
 * is ACES(albedo × E). Measured from the v1 screenshots (Chrome, M4 Pro,
 * time=day) by inverting three's ACESFilmicToneMapping on the notes' pixels —
 * the fit lands within 2° of hue on all three:
 *
 *   monitor  0.19   the "now" note on the bezel: rgb(125, 111, 48), olive
 *   desk     0.40   a note on something lying on the desk (the ITE clipping): rgb(173, 162, 98), khaki
 *   held     0.74   a note on something held up to the camera (the Pura Link memo): rgb(207, 197, 140), cream
 *
 * Other places: pass a number. Night and evening are dimmer than these; the
 * lift is tuned for day and will glow a little after dark.
 */
export const STICKY_LIGHT = Object.freeze({ monitor: 0.19, desk: 0.40, held: 0.74 });

/**
 * The exposure at which palette.stickyYellow comes out sticky-note yellow
 * after ACES: rgb(221, 201, 97), hue 50°, saturation 0.56, value 0.87. (At
 * 0.6 it is rgb(208, 184, 76); at 1.0, rgb(229, 212, 115).) Ink stays ink:
 * #1f2a44 at this exposure is rgb(8, 19, 44).
 */
export const STICKY_EXPOSURE = 0.8;

/** The emissive lift a sticky needs at `light` (a STICKY_LIGHT key or a measured number) to reach STICKY_EXPOSURE. */
export function stickyLift(light = 'desk') {
    const e = typeof light === 'number' ? light : (STICKY_LIGHT[light] ?? STICKY_LIGHT.desk);
    return Math.max(0, STICKY_EXPOSURE - e);
}

/**
 * The material for a sticky note that reads yellow in this room.
 *
 * Paint the note's canvas with palette.stickyYellow (ink in palette.ink) and
 * pass it as `map`; the same texture is the emissive map, so the paper is
 * lifted and the ink is not (emissive = white × map × lift, which is exactly
 * a higher exposure on the paper: ACES(albedo × (E + lift))). Without a map
 * (the plain back of a note) it is flat stickyYellow, lifted the same way.
 *
 * Because it is self-lit, the desk's hover tint leaves it alone (DeskScene
 * skips materials whose rest emissive isn't black).
 *
 *   const front = new THREE.Mesh(geometry, stickyMaterial({ map: texture, light: 'monitor' }));
 *   const back  = new THREE.Mesh(geometry, stickyMaterial({ light: 'monitor', side: THREE.BackSide }));
 *
 * @param {object} [options]
 * @param {THREE.Texture} [options.map]  the painted note (sRGB canvas texture)
 * @param {'monitor'|'desk'|'held'|number} [options.light='desk']  where it lives (STICKY_LIGHT)
 * @param {number} [options.lift]  override the computed emissive intensity
 * @param {number} [options.roughness=0.86]
 * @param {THREE.Side} [options.side=THREE.FrontSide]
 * @returns {THREE.MeshStandardMaterial}
 */
export function stickyMaterial({ map = null, light = 'desk', lift, roughness = 0.86, side = THREE.FrontSide } = {}) {
    const intensity = lift ?? stickyLift(light);
    const material = new THREE.MeshStandardMaterial({
        color: map ? '#ffffff' : palette.stickyYellow,
        map,
        emissive: map ? '#ffffff' : palette.stickyYellow,
        emissiveMap: map,
        emissiveIntensity: intensity,
        roughness,
        metalness: 0,
        side
    });
    material.userData.sticky = { light, lift: intensity };
    return material;
}
