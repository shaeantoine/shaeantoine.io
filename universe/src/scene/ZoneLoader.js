import * as THREE from 'three';
import { buildProp } from '../kit/PropKit.js';
import { standardMaterial } from '../kit/materials.js';
import { loadGLTF } from '../loaders/gltf.js';
import { loadOBJ } from '../loaders/obj.js';
import { dissolveOut, resolveIn } from '../transition/DissolveEffect.js';
import { latLonToVector3, surfaceNormalAt } from '../util/sphereCoords.js';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Builds/tears down each slot's current-skin geometry from universe.json's
 * cluster data, mounting into `parent` (Earth's own group, positioned at its
 * orbit location — not necessarily the scene root). The only module that
 * touches both the kit (procedural props) and the GLTFLoader (hand-authored
 * geo assets) — everything else works with higher-level slot/skin data or
 * plain THREE.Object3D groups.
 */
export class ZoneLoader {
    constructor(parent, slots, globeRadius, islandScale = 1) {
        this.parent = parent;
        this.slots = slots;
        this.globeRadius = globeRadius;
        this.islandScale = islandScale;
        /** @type {Map<string, THREE.Group>} slotId -> currently-mounted group */
        this.mounted = new Map();
        /** @type {Map<string, THREE.Mesh>} slotId -> that island's hover ring */
        this.rings = new Map();
        this.hoveredSlotId = null;
    }

    /** @returns the currently mounted THREE.Object3D per slot (for raycasting). */
    getPickableObjects() {
        return Array.from(this.mounted.values());
    }

    /** Shows the hover ring for `slotId` (or hides all rings if null). */
    setHovered(slotId) {
        if (slotId === this.hoveredSlotId) return;
        const prevRing = this.rings.get(this.hoveredSlotId);
        if (prevRing) prevRing.visible = false;
        this.hoveredSlotId = slotId;
        const nextRing = this.rings.get(slotId);
        if (nextRing) nextRing.visible = true;
    }

    /** Builds every slot's skin for `mode` with no transition — used on initial load. */
    async loadAll(mode) {
        await Promise.all(this.slots.map((slot) => this._mount(slot, mode)));
    }

    /** Swaps every slot from its current skin to `mode`'s skin via dissolve-out/resolve-in. */
    async transitionTo(mode) {
        await Promise.all(
            this.slots.map(async (slot) => {
                const outgoing = this.mounted.get(slot.id);
                if (outgoing) {
                    await dissolveOut(outgoing);
                    this.parent.remove(outgoing);
                    this.mounted.delete(slot.id);
                    this.rings.delete(slot.id);
                    if (this.hoveredSlotId === slot.id) this.hoveredSlotId = null;
                }
                const incoming = await this._mount(slot, mode);
                await resolveIn(incoming);
            })
        );
    }

    async _mount(slot, mode) {
        const skin = slot.skins[mode];
        const group = new THREE.Group();
        const { lat, lon } = slot.position;
        latLonToVector3(lat, lon, this.globeRadius, group.position);
        group.quaternion.setFromUnitVectors(UP, surfaceNormalAt(lat, lon));
        group.userData.slotId = slot.id;

        // A nested content group carries the permanent islandScale bump,
        // separate from `group`'s own scale — DissolveEffect animates
        // `group.scale` directly (0.7 <-> 1) on every mode toggle, so scaling
        // island content there instead avoids that tween clobbering it back
        // down to a literal 1.0 on the next transition.
        const content = new THREE.Group();
        content.scale.setScalar(this.islandScale);
        group.add(content);

        const base = await this._buildShape(skin);
        if (base) content.add(base);

        const ring = this._buildHighlightRing(base, skin.palette?.accent);
        content.add(ring);
        this.rings.set(slot.id, ring);

        const landmark = await this._buildLandmark(skin);
        if (landmark) content.add(landmark);

        for (const propDescriptor of skin.props || []) {
            content.add(buildProp(propDescriptor));
        }

        this.parent.add(group);
        this.mounted.set(slot.id, group);
        return group;
    }

    // Ground-flush ring, sized to the just-built shape's own footprint (measured
    // before it's parented, so the box reflects only its own scale/rotation —
    // not islandScale or the globe placement transform). Kept invisible until
    // hovered rather than built on demand, since sizing depends on `base`'s
    // geometry, which only exists right here in `_mount`.
    _buildHighlightRing(base, accentColor) {
        const box = new THREE.Box3();
        if (base) box.setFromObject(base);
        const footprint = box.isEmpty() ? new THREE.Vector3(3.2, 1, 3.2) : box.getSize(new THREE.Vector3());
        const radius = Math.max(footprint.x, footprint.z) / 2;

        const geometry = new THREE.RingGeometry(radius * 1.05, radius * 1.2, 48);
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
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.02;
        ring.renderOrder = 10;
        ring.visible = false;
        return ring;
    }

    async _buildShape(skin) {
        // Country/interest meshes are a Blender-exported .obj + baked toon
        // palette texture (universe/assets/models/geo/<name>/); `shape.model`
        // alone (no `palette`) is reserved for any future hand-authored .glb.
        if (skin.shape?.palette) {
            try {
                const model = await loadOBJ(skin.shape.model, skin.shape.palette);
                model.scale.setScalar(skin.shape.scale ?? 1);
                model.rotation.y = skin.shape.rotationY ?? 0;
                return model;
            } catch (err) {
                console.warn(`ZoneLoader: failed to load obj "${skin.shape.model}", using placeholder pad.`, err);
                return this._buildPlaceholderPad(skin);
            }
        }
        if (skin.shape?.model) {
            try {
                const model = await loadGLTF(skin.shape.model);
                model.scale.setScalar(skin.shape.scale ?? 1);
                model.rotation.y = skin.shape.rotationY ?? 0;
                return model;
            } catch (err) {
                console.warn(`ZoneLoader: failed to load shape "${skin.shape.model}", using placeholder pad.`, err);
                return this._buildPlaceholderPad(skin);
            }
        }
        if (skin.shape?.base === 'kit:groundPad') {
            return this._buildPlaceholderPad(skin);
        }
        return null;
    }

    _buildPlaceholderPad(skin) {
        const group = new THREE.Group();

        // Terrain top — the surface every prop/landmark position in
        // universe.json assumes is "ground" (y=0), so this keeps that footprint
        // unchanged from the old flat pad rather than requiring every
        // hand-placed prop position to be retuned.
        const terrainGeometry = new THREE.CylinderGeometry(1.6, 1.5, 0.3, 8);
        terrainGeometry.translate(0, -0.15, 0);
        group.add(new THREE.Mesh(terrainGeometry, standardMaterial(skin.palette?.terrain ?? '#3a3a3a')));

        // Cliff underside — hangs below the terrain, tapering inward, so the
        // island reads as a small floating landmass (Polytopia-style) rather
        // than a flat disc. Colored from the skin's own accent rather than a
        // fixed rock color, so it ties into each zone's existing palette.
        const cliffGeometry = new THREE.CylinderGeometry(1.35, 0.9, 0.5, 8);
        cliffGeometry.translate(0, -0.55, 0);
        group.add(new THREE.Mesh(cliffGeometry, standardMaterial(skin.palette?.accent ?? '#6b5a45')));

        group.scale.setScalar(skin.shape?.scale ?? 1);
        return group;
    }

    async _buildLandmark(skin) {
        if (!skin.landmark) return null;
        if (skin.landmark.model) {
            try {
                const model = await loadGLTF(skin.landmark.model);
                model.position.set(...(skin.landmark.position || [0, 0, 0]));
                return model;
            } catch (err) {
                console.warn(`ZoneLoader: failed to load landmark "${skin.landmark.model}", skipping.`, err);
                return null;
            }
        }
        if (skin.landmark.kit) {
            return buildProp(skin.landmark);
        }
        return null;
    }
}
