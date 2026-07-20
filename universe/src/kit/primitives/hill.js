import * as THREE from 'three';
import { standardMaterial } from '../materials.js';

/**
 * A soft, rounded hill — a low-poly cone with few radial segments so facets
 * are visible (the "sculpted clay diorama" look), flattened at the base.
 */
export function createHill({ color = 0x8fae7a } = {}) {
    const geometry = new THREE.ConeGeometry(1, 0.6, 7, 1);
    geometry.translate(0, 0.3, 0);
    return new THREE.Mesh(geometry, standardMaterial(color));
}
