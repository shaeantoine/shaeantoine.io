import * as THREE from 'three';
import { standardMaterial } from '../materials.js';

/**
 * A simple two-part tree: a cylindrical trunk and a low-poly cone canopy.
 * Two colors keep it readable as "tree" at small diorama scale.
 */
export function createTree({ trunkColor = 0x6b4a35, color: canopyColor = 0x4f7a4a } = {}) {
    const group = new THREE.Group();

    const trunkGeometry = new THREE.CylinderGeometry(0.05, 0.07, 0.5, 6);
    trunkGeometry.translate(0, 0.25, 0);
    const trunk = new THREE.Mesh(trunkGeometry, standardMaterial(trunkColor));
    group.add(trunk);

    const canopyGeometry = new THREE.ConeGeometry(0.35, 0.7, 6);
    canopyGeometry.translate(0, 0.85, 0);
    const canopy = new THREE.Mesh(canopyGeometry, standardMaterial(canopyColor));
    group.add(canopy);

    return group;
}
