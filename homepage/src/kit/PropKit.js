import { createHill } from './primitives/hill.js';
import { createRock } from './primitives/rock.js';
import { createTree } from './primitives/tree.js';
import { createBuilding } from './primitives/building.js';
import { createGridPlane } from './primitives/gridPlane.js';
import { createColumn } from './primitives/column.js';

const FACTORIES = {
    hill: createHill,
    rock: createRock,
    tree: createTree,
    building: createBuilding,
    gridPlane: createGridPlane,
    column: createColumn
};

/**
 * Pure factory: turns a prop descriptor from zones.json into a positioned
 * THREE.Object3D. Holds no state of its own — callers (ZoneLoader) own the
 * resulting object's lifecycle.
 *
 * @param {{kit: string, position?: number[], scale?: number, rotationY?: number, paletteOverride?: number|string}} descriptor
 */
export function buildProp(descriptor) {
    const factory = FACTORIES[descriptor.kit];
    if (!factory) {
        throw new Error(`PropKit: unknown kit primitive "${descriptor.kit}"`);
    }

    const options = descriptor.paletteOverride
        ? { color: descriptor.paletteOverride }
        : {};
    const object = factory(options);

    const [x = 0, y = 0, z = 0] = descriptor.position || [];
    object.position.set(x, y, z);

    const scale = descriptor.scale ?? 1;
    object.scale.setScalar(scale);

    if (descriptor.rotationY) {
        object.rotation.y = descriptor.rotationY;
    }

    return object;
}

export const KNOWN_KITS = Object.keys(FACTORIES);
