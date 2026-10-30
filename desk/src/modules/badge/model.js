import * as THREE from 'three';
import { buildLanyard, BADGE_FRONT } from '../../content/lanyard.js';
import { buildPartMesh } from '../../scene/partMesh.js';
import { drawBadge } from '../../scene/badgeCanvas.js';
import { badgeDims, lanyardArgs } from './dims.js';

export { badgeDims, badgeOutline, lanyardArgs } from './dims.js';

/**
 * THE BADGE, AS AN OBJECT — shared by the box (past badges clipped to their
 * keepsakes) and the badge module (the current one, hanging from the lamp).
 *
 * Built from src/content/lanyard.js buildLanyard, from each job's work.js
 * data: the same holder, punched slot, card and bulldog clip the original
 * site showed for each job. buildLanyard
 * authors a badge lying FLAT (thickness up +Y, the clip at the card's near
 * edge, +Z, which is the foot of the card's art). Here it stands UPRIGHT the
 * way a badge hangs: clip at the top, face to local +Z, the art turned half a
 * turn in its plane (the texture, not the card) so it still reads upright.
 *
 * Upright frame (what every caller places): the origin is the tip of the
 * clip (the point a lanyard's hook takes), the back of the holder lies in
 * z = 0 and the face is toward +Z; the badge hangs down −Y. dims.js says
 * where its parts end.
 */

/**
 * The badge's meshes, upright (see the header). `options.back` is a
 * THREE.Texture for the back of the card (a note seen through the holder),
 * `thin` scales its thickness. Returns { group, card, canvas, repaint }.
 *
 * Uses src/scene/partMesh.js (the site's own part builder) and repaints the
 * card's face once the fonts land (partMesh draws it once, at build time).
 */
export function buildBadge(ctx, work, { back = null, thin = 1, name = 'badge' } = {}) {
    const args = lanyardArgs(work);
    const { parts } = buildLanyard(args);
    const flat = new THREE.Group();
    let card = null;
    let canvas = null;
    let map = null;
    let badgePart = null;
    for (const part of parts) {
        const mesh = buildPartMesh(part, 4);
        flat.add(mesh);
        if (part.badge) {
            card = mesh;
            badgePart = part;
            const front = Array.isArray(mesh.material) ? mesh.material[4] : null;
            map = front?.map ?? null;
            canvas = map?.image ?? null;
            if (map) {
                // Clip at the top: the art turns half a turn in its plane to read upright.
                map.center.set(0.5, 0.5);
                map.rotation = Math.PI;
                map.needsUpdate = true;
            }
        }
    }
    flat.position.set(0, 0, -BADGE_FRONT);
    flat.scale.set(1, thin, 1);
    const upright = new THREE.Group();
    upright.name = name;
    // Flat +Y (the face) → +Z, flat +Z (the clip) → +Y: a half turn about Z after a quarter about X.
    upright.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
    upright.add(flat);
    const group = new THREE.Group();
    group.name = `${name}-root`;
    group.add(upright);

    if (back) {
        const d = badgeDims(thin);
        const material = new THREE.MeshStandardMaterial({ map: back, roughness: 0.42, metalness: 0 });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(...d.card), material);
        plane.rotation.y = Math.PI; // faces −Z, reads unmirrored from behind
        plane.position.set(0, d.cardCentreY, -0.0004);
        plane.castShadow = false;
        plane.receiveShadow = true;
        plane.name = `${name}-back`;
        group.add(plane);
    }

    const repaint = () => {
        if (!canvas || !badgePart) return;
        drawBadge(canvas, { ...badgePart.badge, color: badgePart.color });
        map.needsUpdate = true;
    };
    // partMesh drew it at once, possibly before Inter had loaded: again when it lands.
    ctx?.fonts?.paint ? ctx.fonts.paint(repaint) : repaint();
    return { group, card, canvas, repaint, args };
}
