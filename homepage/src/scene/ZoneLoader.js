import * as THREE from 'three';
import { buildProp } from '../kit/PropKit.js';
import { toonMaterial } from '../kit/materials.js';
import { loadGLTF } from '../loaders/gltf.js';
import { loadOBJ } from '../loaders/obj.js';
import { dissolveOut, resolveIn } from '../transition/DissolveEffect.js';
import { latLonToVector3, surfaceNormalAt } from '../util/sphereCoords.js';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Builds/tears down each slot's current-skin geometry from zones.json data.
 * The only module that touches both the kit (procedural props) and the
 * GLTFLoader (hand-authored geo assets) — everything else works with
 * higher-level slot/skin data or plain THREE.Object3D groups.
 */
export class ZoneLoader {
    constructor(scene, slots, globeRadius, islandScale = 1) {
        this.scene = scene;
        this.slots = slots;
        this.globeRadius = globeRadius;
        this.islandScale = islandScale;
        /** @type {Map<string, THREE.Group>} slotId -> currently-mounted group */
        this.mounted = new Map();
    }

    /** @returns the currently mounted THREE.Object3D per slot (for raycasting). */
    getPickableObjects() {
        return Array.from(this.mounted.values());
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
                    this.scene.remove(outgoing);
                    this.mounted.delete(slot.id);
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

        const landmark = await this._buildLandmark(skin);
        if (landmark) content.add(landmark);

        for (const propDescriptor of skin.props || []) {
            content.add(buildProp(propDescriptor));
        }

        this.scene.add(group);
        this.mounted.set(slot.id, group);
        return group;
    }

    async _buildShape(skin) {
        // Country/interest meshes are a Blender-exported .obj + baked toon
        // palette texture (homepage/assets/models/geo/<name>/); `shape.model`
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
        // zones.json assumes is "ground" (y=0), so this keeps that footprint
        // unchanged from the old flat pad rather than requiring every
        // hand-placed prop position to be retuned.
        const terrainGeometry = new THREE.CylinderGeometry(1.6, 1.5, 0.3, 8);
        terrainGeometry.translate(0, -0.15, 0);
        group.add(new THREE.Mesh(terrainGeometry, toonMaterial(skin.palette?.terrain ?? '#3a3a3a')));

        // Cliff underside — hangs below the terrain, tapering inward, so the
        // island reads as a small floating landmass (Polytopia-style) rather
        // than a flat disc. Colored from the skin's own accent rather than a
        // fixed rock color, so it ties into each zone's existing palette.
        const cliffGeometry = new THREE.CylinderGeometry(1.35, 0.9, 0.5, 8);
        cliffGeometry.translate(0, -0.55, 0);
        group.add(new THREE.Mesh(cliffGeometry, toonMaterial(skin.palette?.accent ?? '#6b5a45')));

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
