import * as THREE from 'three';
import { standardMaterialFlat } from '../kit/materials.js';
import { orbitToVector3 } from '../util/orbitCoords.js';
import { BLOOM_LAYER } from './SceneManager.js';

/**
 * Builds/positions every non-cluster planet body (i.e. everything except
 * Earth, which ZoneLoader/Globe still own). Most bodies still use the
 * 'placeholder' render recipe (a flat-shaded icosphere); bespoke recipes like
 * 'grid' (CS) are filled in per-planet as each one earns its own look.
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
        if (recipe.type === 'grid') {
            return this._buildGridRecipe(recipe);
        }
        const radius = recipe.radius ?? 2;
        const color = recipe.palette?.core ?? '#888888';
        // Same faceted-icosphere approach as Globe/Sun — the shared fallback
        // for any body that hasn't earned a bespoke recipe yet.
        const geometry = new THREE.IcosahedronGeometry(radius, 1);
        geometry.computeVertexNormals();
        return new THREE.Mesh(geometry, standardMaterialFlat(color));
    }

    // Tron Legacy's Grid, reinterpreted: a dark core with the same facets
    // pulled out into a glowing geodesic wireframe. First bespoke per-planet
    // recipe (CS) — everything else still falls through to the flat-shaded
    // placeholder above.
    _buildGridRecipe(recipe) {
        const radius = recipe.radius ?? 2;
        const coreColor = recipe.palette?.core ?? '#1c2b2e';
        const accentColor = recipe.palette?.accent ?? '#6ad1c4';
        const group = new THREE.Group();

        const coreGeometry = new THREE.IcosahedronGeometry(radius, 1);
        coreGeometry.computeVertexNormals();
        group.add(new THREE.Mesh(coreGeometry, standardMaterialFlat(coreColor)));

        // Pulled out fractionally so the lines don't z-fight the core mesh
        // underneath. Unlit + on the bloom layer, same as the grid-line
        // accents elsewhere in the kit — this is where the "glow" lives, not
        // in the core material.
        const wireGeometry = new THREE.EdgesGeometry(coreGeometry);
        const wireMaterial = new THREE.LineBasicMaterial({ color: accentColor, toneMapped: false });
        const wireframe = new THREE.LineSegments(wireGeometry, wireMaterial);
        wireframe.scale.setScalar(1.01);
        wireframe.layers.enable(BLOOM_LAYER);
        group.add(wireframe);

        return group;
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
