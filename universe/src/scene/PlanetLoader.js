import * as THREE from 'three';
import { standardMaterialFlat } from '../kit/materials.js';
import { orbitToVector3 } from '../util/orbitCoords.js';

/**
 * Builds/positions every non-cluster planet body (i.e. everything except
 * Earth, which ZoneLoader/Globe still own). Phase 0 only ships the
 * 'placeholder' render recipe — a flat-shaded icosphere standing in for the
 * bespoke PlanetKit shader recipes that are fast-follow work once this
 * navigation scaffolding is proven out.
 */
export class PlanetLoader {
    constructor(parent, bodies) {
        this.parent = parent;
        this.bodies = bodies;
        /** @type {Map<string, THREE.Group>} bodyId -> mounted group */
        this.mounted = new Map();
        /** @type {Map<string, THREE.Vector3>} bodyId -> world position */
        this.worldPositions = new Map();
        /** @type {Map<string, THREE.Mesh>} bodyId -> that planet's hover ring */
        this.rings = new Map();
        this.hoveredBodyId = null;
    }

    /** @returns the currently mounted THREE.Object3D per body (for raycasting). */
    getPickableObjects() {
        return Array.from(this.mounted.values());
    }

    /** The world-space position a given body was placed at (see orbitCoords.js). */
    getWorldPosition(bodyId) {
        return this.worldPositions.get(bodyId);
    }

    /** Shows the hover ring for `bodyId` (or hides all rings if null). */
    setHovered(bodyId) {
        if (bodyId === this.hoveredBodyId) return;
        const prevRing = this.rings.get(this.hoveredBodyId);
        if (prevRing) prevRing.visible = false;
        this.hoveredBodyId = bodyId;
        const nextRing = this.rings.get(bodyId);
        if (nextRing) nextRing.visible = true;
    }

    /** Builds every body's group with no transition — used on initial load. */
    loadAll() {
        for (const body of this.bodies) {
            this._mount(body);
        }
    }

    _mount(body) {
        const group = new THREE.Group();
        const position = orbitToVector3(body.orbit.radius, body.orbit.phaseDeg);
        group.position.copy(position);
        group.userData.bodyId = body.id;

        const base = this._buildRecipe(body.renderRecipe);
        group.add(base);

        const ring = this._buildHighlightRing(base, body.renderRecipe.palette?.accent);
        group.add(ring);
        this.rings.set(body.id, ring);

        this.parent.add(group);
        this.mounted.set(body.id, group);
        this.worldPositions.set(body.id, position.clone());
    }

    _buildRecipe(recipe) {
        const radius = recipe.radius ?? 2;
        const color = recipe.palette?.core ?? '#888888';
        // Same faceted-icosphere approach as Globe/Sun, for now — a distinct
        // per-planet shader (Tron grid, etc.) is fast-follow, not Phase 0.
        const geometry = new THREE.IcosahedronGeometry(radius, 1);
        geometry.computeVertexNormals();
        return new THREE.Mesh(geometry, standardMaterialFlat(color));
    }

    // Sized to the just-built base mesh's own footprint. Kept invisible
    // until hovered — a placeholder discoverability affordance, superseded
    // by the always-visible glow/label in AmbientAffordance.js (Phase 2).
    _buildHighlightRing(base, accentColor) {
        const box = new THREE.Box3().setFromObject(base);
        const footprint = box.getSize(new THREE.Vector3());
        const radius = Math.max(footprint.x, footprint.z) / 2;

        const geometry = new THREE.RingGeometry(radius * 1.3, radius * 1.5, 48);
        const material = new THREE.MeshBasicMaterial({
            color: accentColor ?? '#ffe066',
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        // Keeps the highlight a pure accent color under the scene's ACES
        // tone mapping, rather than being darkened/desaturated like lit
        // geometry.
        material.toneMapped = false;
        const ring = new THREE.Mesh(geometry, material);
        ring.rotation.x = Math.PI / 2;
        ring.renderOrder = 10;
        ring.visible = false;
        return ring;
    }
}
