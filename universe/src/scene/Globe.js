import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { standardMaterialGlobe } from '../kit/materials.js';

// Kept as a fraction of radius (not an absolute distance) so the ripple
// stays proportionally visible if globeRadius ever changes. Islands stay
// pinned to the un-rippled radius (see ZoneLoader/latLonToVector3), so this
// reads as the surface moving beneath them rather than the islands
// themselves moving.
const RIPPLE_AMPLITUDE_RATIO = 0.03;
const RIPPLE_FREQUENCY_LAT = 6; // wave cycles from pole to pole
const RIPPLE_FREQUENCY_LON = 5; // wave cycles around the equator
const RIPPLE_SPEED = 1.8; // radians/sec the wave travels
const SUBDIVISIONS = 6; // icosphere detail — higher = rounder silhouette

/**
 * The low-poly planet islands sit on. A smooth, rounded sphere (vertices
 * merged and normals interpolated, not flat-shaded per facet) so the
 * surface reads like a droplet of water rather than a cut gem. Its surface
 * ripples in a slow, faint traveling wave (see update) — vertex normals are
 * recomputed every frame so shading stays correct as it moves.
 */
export class Globe {
    constructor({ radius, color = '#3a7ca8' } = {}) {
        // IcosahedronGeometry is non-indexed by default (each triangle owns
        // its own vertices), which is what produces the faceted look.
        // Merging shared vertices back into an indexed geometry lets
        // computeVertexNormals average normals across adjacent faces,
        // giving a smooth, rounded shading instead of flat facets. The
        // built-in uv/normal attributes have to go first: PolyhedronGeometry
        // gives every vertex along the antimeridian (and both poles) a
        // duplicate copy with a different uv, and mergeVertices hashes uv
        // alongside position — so those copies never weld and the seam
        // shows up as a lit crease running pole to pole. With only position
        // left to hash, every vertex at the same spot merges into one.
        const faceted = new THREE.IcosahedronGeometry(radius, SUBDIVISIONS);
        faceted.deleteAttribute('normal');
        faceted.deleteAttribute('uv');
        const geometry = mergeVertices(faceted);
        geometry.computeVertexNormals();

        this.mesh = new THREE.Mesh(geometry, standardMaterialGlobe(color));
        this.radius = radius;
        this.amplitude = radius * RIPPLE_AMPLITUDE_RATIO;
        this.time = 0;
        // Snapshot of each vertex's un-rippled position — every frame's
        // displacement is computed fresh from this, not accumulated onto the
        // previous frame's already-displaced position.
        this.basePositions = Float32Array.from(geometry.attributes.position.array);
        this._direction = new THREE.Vector3();
    }

    /** Advances the ripple. Called once per rendered frame from main.js. */
    update(dt) {
        this.time += dt;
        const position = this.mesh.geometry.attributes.position;
        const base = this.basePositions;

        for (let i = 0; i < position.count; i++) {
            const bx = base[i * 3];
            const by = base[i * 3 + 1];
            const bz = base[i * 3 + 2];
            this._direction.set(bx, by, bz).normalize();

            const lat = Math.asin(THREE.MathUtils.clamp(this._direction.y, -1, 1));
            const lon = Math.atan2(this._direction.z, this._direction.x);
            const wave = Math.sin(lat * RIPPLE_FREQUENCY_LAT + lon * RIPPLE_FREQUENCY_LON + this.time * RIPPLE_SPEED);
            const offset = wave * this.amplitude;

            position.setXYZ(
                i,
                bx + this._direction.x * offset,
                by + this._direction.y * offset,
                bz + this._direction.z * offset
            );
        }

        position.needsUpdate = true;
        this.mesh.geometry.computeVertexNormals();
    }
}
