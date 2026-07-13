import * as THREE from 'three';
import { toonMaterial } from '../materials.js';

/**
 * A chunky, irregular rock — a low-detail icosahedron so facets stay sharp
 * and visible rather than reading as a smooth sphere.
 */
export function createRock({ color = 0x8a8a86 } = {}) {
    const geometry = new THREE.IcosahedronGeometry(0.4, 0);
    geometry.translate(0, 0.25, 0);
    return new THREE.Mesh(geometry, toonMaterial(color));
}
