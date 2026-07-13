import * as THREE from 'three';
import { toonMaterialFlat } from '../kit/materials.js';

/**
 * The low-poly planet islands sit on. A faceted icosphere (flat-shaded, not
 * smoothly interpolated) for the Polytopia-style "toy planet" look. Static —
 * no update() needed.
 */
export class Globe {
    constructor({ radius, color = '#3a7ca8' } = {}) {
        // IcosahedronGeometry is already non-indexed (each triangle owns its
        // own vertices), so computeVertexNormals naturally produces one flat
        // normal per face — the faceted "toy planet" look — with no extra step.
        const geometry = new THREE.IcosahedronGeometry(radius, 1);
        geometry.computeVertexNormals();

        this.mesh = new THREE.Mesh(geometry, toonMaterialFlat(color));
    }
}
