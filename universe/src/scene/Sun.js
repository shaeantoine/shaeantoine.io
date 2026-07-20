import * as THREE from 'three';
import { BLOOM_LAYER } from './SceneManager.js';

// A pale near-white gold, well above the color range any lit planet's
// specular highlight tone-maps to — brightness here comes from
// EMISSIVE_INTENSITY pushing the render into the composer's bloom pass (see
// SceneManager), not from saturation, so the sun still reads as *color*
// rather than a plain white blob. Kept modest (not e.g. 2.5+): UnrealBloomPass
// blends blurred mip levels that span a large fraction of the frame by
// design, so an overly bright source here washes out the whole scene once
// composited and tone-mapped, rather than staying a glow near the sun's disc.
const EMISSIVE_INTENSITY = 1.3;

/**
 * The sun sits at the scene origin — self-illuminated (MeshBasicMaterial,
 * not lit by any light) since it's a light source, not something lit by
 * one. Placed on SceneManager's BLOOM_LAYER, so the render's selective-bloom
 * pass wraps it in a soft glow and guarantees it reads as the single
 * brightest object in the scene, regardless of how bright any lit planet's
 * specular highlight happens to tone-map. Static, like Globe — no update()
 * needed.
 */
export class Sun {
    constructor({ radius, color = '#fff3c4' } = {}) {
        const geometry = new THREE.IcosahedronGeometry(radius, 1);
        // Color scaled above 1.0 (rather than left at 1.0 with a plain
        // MeshBasicMaterial) so the bloom pass's luminosity threshold picks
        // it up as "bright" even before the composite/tone-map step.
        const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(color).multiplyScalar(EMISSIVE_INTENSITY),
            // Self-illuminated light source, not lit geometry — scene fog
            // otherwise dims it below the bloom pass's luminance threshold
            // at solar-orbit viewing distance, making the glow vanish
            // exactly when it should be most visible (see SkyDome.js for
            // the same reasoning).
            fog: false
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.layers.enable(BLOOM_LAYER);
    }
}
