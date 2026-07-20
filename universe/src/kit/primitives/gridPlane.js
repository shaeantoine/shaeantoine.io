import * as THREE from 'three';
import { standardMaterial } from '../materials.js';

/**
 * A flat ground pad with grid lines on top — the shared base for
 * Software Engineering's reinterpreted "Grid" zone. Deliberately built from
 * the same low-poly toon palette as every other zone (a tinted pad + thin
 * line overlay) rather than a literal black/neon Tron floor.
 */
export function createGridPlane({ padColor = 0x1c2b2e, color: lineColor = 0x6ad1c4, size = 2, divisions = 8 } = {}) {
    const group = new THREE.Group();

    const padGeometry = new THREE.CylinderGeometry(size, size, 0.1, 8);
    const pad = new THREE.Mesh(padGeometry, standardMaterial(padColor));
    group.add(pad);

    const grid = new THREE.GridHelper(size * 1.8, divisions, lineColor, lineColor);
    grid.position.y = 0.06;
    grid.material.transparent = true;
    grid.material.opacity = 0.6;
    // Unlit accent line, not lit geometry — stays a crisp, saturated line
    // color under the scene's ACES tone mapping instead of being muted.
    grid.material.toneMapped = false;
    group.add(grid);

    return group;
}
