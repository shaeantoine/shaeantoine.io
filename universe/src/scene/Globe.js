import * as THREE from 'three';
import { standardMaterialGlobe } from '../kit/materials.js';

/**
 * The low-poly planet islands sit on. A faceted icosphere (flat-shaded, not
 * smoothly interpolated) with soft PBR specular per facet — a "cut gem" look
 * without the harsh, whole-facet glare a sharper specular would produce at
 * grazing light angles (see standardMaterialGlobe). Static — no update()
 * needed.
 */
export class Globe {
    constructor({ radius, color = '#3a7ca8' } = {}) {
        // IcosahedronGeometry is already non-indexed (each triangle owns its
        // own vertices), so computeVertexNormals naturally produces one flat
        // normal per face — the faceted "cut gem" look — with no extra step.
        const geometry = new THREE.IcosahedronGeometry(radius, 1);
        geometry.computeVertexNormals();

        this.mesh = new THREE.Mesh(geometry, standardMaterialGlobe(color));
    }
}
