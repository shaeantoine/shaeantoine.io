import * as THREE from 'three';
import { mm } from '../../core/framing.js';
import { SHEET, CLIP, DOCS } from './layout.js';
import { RECTS } from './faces.js';
import { FIGURE_MM } from './figure.js';

/**
 * PAPER — meshes. A document is:
 *
 *   pivot (Group)       its pose: on the stack, or in hand
 *     flip (Group)      rotation.y 0 (front) or π (the margin page)
 *       sheet           ctx.paperSheet: front = the real front page, back = Shae's margin page
 *       under           a sliver of the pages beneath, peeking past the right and bottom edges
 *       clip            a 32 mm bulldog clip on the top edge
 *       figure          (triangulations) the live figure's transparent plane, just off the back
 */

const BLACK_STEEL = { color: '#1b1b1d', roughness: 0.42, metalness: 0.55 };
const WIRE = { color: '#c8c8c6', roughness: 0.28, metalness: 0.95 };

function cylinderBetween(a, b, radius, material) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const length = dir.length();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), material);
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return mesh;
}

/**
 * A bulldog clip in the document's frame, on its top edge at x = `atMm`: the
 * spine just past the edge, a jaw plate on each face converging on the page,
 * and each wire handle folded down flat over its plate.
 */
export function buildClip(thicknessMm, atMm, materials) {
    const group = new THREE.Group();
    group.name = 'paper-clip';
    group.position.set(mm(atMm), SHEET.h / 2, 0);
    const t = thicknessMm / 2;
    const w = mm(CLIP.w);
    const r = mm(CLIP.spineR);
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 18), materials.steel);
    spine.rotation.z = Math.PI / 2;
    spine.position.y = mm(CLIP.overhang);
    group.add(spine);
    const len = CLIP.jaw + CLIP.overhang;
    for (const side of [1, -1]) {
        const top = CLIP.spineR - CLIP.plate / 2;
        const bottom = t + CLIP.plate / 2;
        const plate = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, mm(len), mm(CLIP.plate)), materials.steel);
        plate.position.set(0, mm(CLIP.overhang - len / 2), side * mm((top + bottom) / 2));
        plate.rotation.x = side * Math.atan((top - bottom) / len);
        group.add(plate);
        // The handle: two legs from the spine's ends, folded down over the plate, and the bar across.
        const z0 = side * mm(CLIP.spineR + CLIP.wire * 0.6);
        const z1 = side * mm(t + CLIP.wire);
        const x = w / 2 - mm(2.4);
        const y0 = mm(CLIP.overhang);
        const y1 = -mm(CLIP.loop);
        const wr = mm(CLIP.wire / 2);
        const a0 = new THREE.Vector3(-x, y0, z0); const a1 = new THREE.Vector3(-x * 0.86, y1, z1);
        const b0 = new THREE.Vector3(x, y0, z0); const b1 = new THREE.Vector3(x * 0.86, y1, z1);
        group.add(cylinderBetween(a0, a1, wr, materials.wire));
        group.add(cylinderBetween(b0, b1, wr, materials.wire));
        group.add(cylinderBetween(a1, b1, wr, materials.wire));
    }
    group.traverse((node) => {
        if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }
    });
    return group;
}

/** One material set for every clip (shared). */
export function clipMaterials() {
    return {
        steel: new THREE.MeshStandardMaterial(BLACK_STEEL),
        wire: new THREE.MeshStandardMaterial(WIRE)
    };
}

/**
 * A document. `front` is its cover texture; `back` is set later
 * (setPaperFace) when its margin page is first painted.
 */
export function buildDocument(ctx, doc, { front, clipMats }) {
    const pivot = new THREE.Group();
    pivot.name = `paper-${doc.id}`;
    const flip = new THREE.Group();
    pivot.add(flip);
    const thickness = mm(doc.thickMm);
    const sheet = ctx.paperSheet({
        width: SHEET.w, height: SHEET.h, thickness, front, color: ctx.palette.paper, backColor: ctx.palette.paper,
        roughness: 0.9, backRoughness: 0.9
    });
    sheet.name = `paper-${doc.id}-sheet`;
    flip.add(sheet);
    // The pages beneath: a sliver along the right and bottom edges.
    const under = new THREE.Mesh(
        new THREE.BoxGeometry(SHEET.w, SHEET.h, thickness * 0.4),
        new THREE.MeshStandardMaterial({ color: '#ece9e1', roughness: 0.92, metalness: 0 })
    );
    under.position.set(mm(0.9), -mm(1.1), 0);
    under.rotation.z = -0.004;
    under.castShadow = true;
    under.receiveShadow = true;
    flip.add(under);
    const clip = buildClip(doc.thickMm, doc.clipMm, clipMats);
    flip.add(clip);
    return { id: doc.id, pivot, flip, sheet, under, clip, meshes: [sheet, under, ...clip.children], thickness };
}

/**
 * The live figure's plane, on the BACK of `document` (the triangulations
 * margin page), transparent: only the mesh and the curve are drawn on it; the
 * axes and labels are on the page itself.
 */
export function buildFigurePlane(document, texture) {
    const material = new THREE.MeshStandardMaterial({
        map: texture, transparent: true, depthWrite: false, roughness: 0.9, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(mm(FIGURE_MM.w), mm(FIGURE_MM.h)), material);
    const f = RECTS.figure;
    // Page mm → the sheet's frame, seen from behind (x mirrored): see onBack() in index.js.
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    plane.position.set(mm(210 / 2 - cx), mm(297 / 2 - cy), -document.thickness / 2 - mm(0.12));
    plane.rotation.y = Math.PI;
    plane.renderOrder = 2;
    plane.visible = false;
    document.flip.add(plane);
    return plane;
}

export { DOCS };
