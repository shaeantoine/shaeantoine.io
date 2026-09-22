#!/usr/bin/env node
/**
 * Bounding boxes for the .glb files in models-src, at the `targetSize` the
 * desk actually places them at.
 *
 * WHY THIS EXISTS. deskObjects.js places props by hand, and the layout tests
 * check that they do not intersect. Both need to know how big each model
 * actually is, and the tempting shortcut — treating `targetSize` as the
 * footprint on every axis — is wrong in a way that matters: targetSize is the
 * LARGEST dimension, and the soldering station is 1.000 x 0.475 x 0.697, so
 * assuming a square footprint over-reserves more than half a unit of desk
 * depth. That phantom depth is enough to make a perfectly good arrangement
 * look like it collides.
 *
 * Reads the JSON chunk out of the binary container, walks the scene's node
 * hierarchy, and takes the union of every mesh primitive's POSITION accessor
 * min/max carried through its node's world matrix. No renderer, no DOM, no
 * three.js — so this runs anywhere node does.
 *
 * THE NODE WALK IS NOT OPTIONAL, and this script did not always do it. Taking
 * the union of raw accessor bounds — which is in each primitive's own space —
 * silently transposes the axes of any model whose root node carries a
 * rotation, and four of the seven placed models here are Sketchfab exports
 * whose root is turned +90 degrees about X. Those read as
 *
 *     soldering_station   1.000 x 0.986 x 0.442   (wrong: height and depth swapped)
 *     keyboard_mechanical 1.000 x 0.451 x 0.090   (wrong)
 *     computer_mouse      0.109 x 0.300 x 0.124   (wrong)
 *     tron_disc           0.600 x 0.600 x 0.059   (wrong)
 *
 * against the transform-aware truth of 1.000 x 0.475 x 0.697,
 * 1.000 x 0.090 x 0.451, 0.157 x 0.100 x 0.300 and 0.600 x 0.059 x 0.600. The
 * soldering station is the one that cost something: deskObjects.test.js pinned
 * its ground footprint at 1.000 x 0.442 when it is really 1.000 x 0.697, which
 * under its 0.6 yaw understated its width by 0.144 and its depth by 0.211 —
 * enough to derive the whole desk's spacing unit from a number that was 0.072
 * too large. `attachModel` scales and rests every model with
 * `THREE.Box3().setFromObject`, which is transform-aware, so the scene was
 * always right and only the measurement was wrong. That is the worst shape a
 * bug like this can have: nothing renders incorrectly, and every constant
 * derived from the tool is quietly off.
 *
 * `plant` remains the known-good control — it reports 0.848 wide per unit deep,
 * and the shelf-plant test has independently used 0.849 since long before this
 * script existed. `apple_studio_display` and `borg_cube` are the other control:
 * both bake their transforms, so their numbers did not move when this was
 * fixed.
 *
 *     node scripts/measure-models.mjs
 *     node scripts/measure-models.mjs soldering_station 0.9
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const MODELS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'models-src');

// The sizes deskObjects.js actually asks for, so the default run reports the
// numbers as placed rather than as authored. A model left out of this map is
// still measured, just per unit of its largest axis — which is the right
// reading for anything in models-src that the desk does not currently place.
const PLACED_AT = {
    ikea_desk_final: 6,
    apple_studio_display: 2.0,
    soldering_station: 1,
    keyboard_mechanical: 1,
    computer_mouse: 0.3,
    borg_cube: 0.52,
    tron_disc: 0.60,
    plant: 0.48,
    pixel: 0.5
};

/**
 * Column-major 4x4 multiply, and a node's local transform as one.
 *
 * glTF gives a node either a baked `matrix` or a TRS triple; three's
 * `Node.updateMatrix` composes the triple as T * R * S, so that is what this
 * reproduces. Both are column-major, same as three and same as the spec.
 */
function multiply(a, b) {
    const out = new Array(16).fill(0);
    for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 4; row++) {
            for (let k = 0; k < 4; k++) out[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
        }
    }
    return out;
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function localMatrix(node) {
    if (node.matrix) return node.matrix.slice();
    const [tx, ty, tz] = node.translation ?? [0, 0, 0];
    const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
    const [sx, sy, sz] = node.scale ?? [1, 1, 1];
    const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
    const xx = qx * x2, xy = qx * y2, xz = qx * z2;
    const yy = qy * y2, yz = qy * z2, zz = qz * z2;
    const wx = qw * x2, wy = qw * y2, wz = qw * z2;
    return [
        (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
        (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
        (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
        tx, ty, tz, 1
    ];
}

function transformPoint(m, [x, y, z]) {
    return [
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14]
    ];
}

function measure(path) {
    const buf = readFileSync(path);
    if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path} is not a binary glTF`);
    const jsonLength = buf.readUInt32LE(12);
    const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));

    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];

    // Accessor bounds are an axis-aligned box in the primitive's OWN space, so
    // once a node transform is in play the box has to be carried through it by
    // its eight corners and re-bounded. Transforming only min and max would be
    // wrong under any rotation: those two corners are not the extremes of the
    // rotated box.
    const visit = (nodeIndex, parentMatrix) => {
        const node = json.nodes?.[nodeIndex];
        if (!node) return;
        const matrix = multiply(parentMatrix, localMatrix(node));
        if (node.mesh !== undefined) {
            for (const primitive of json.meshes?.[node.mesh]?.primitives ?? []) {
                const accessor = json.accessors?.[primitive.attributes?.POSITION];
                if (!accessor?.min || !accessor?.max) continue;
                const [ax, ay, az] = accessor.min;
                const [bx, by, bz] = accessor.max;
                for (const corner of [
                    [ax, ay, az], [ax, ay, bz], [ax, by, az], [ax, by, bz],
                    [bx, ay, az], [bx, ay, bz], [bx, by, az], [bx, by, bz]
                ]) {
                    const world = transformPoint(matrix, corner);
                    for (let axis = 0; axis < 3; axis++) {
                        min[axis] = Math.min(min[axis], world[axis]);
                        max[axis] = Math.max(max[axis], world[axis]);
                    }
                }
            }
        }
        for (const child of node.children ?? []) visit(child, matrix);
    };

    const scene = json.scenes?.[json.scene ?? 0];
    for (const root of scene?.nodes ?? []) visit(root, IDENTITY);

    if (!Number.isFinite(min[0])) throw new Error(`${path} has no POSITION accessor bounds`);
    return max.map((value, axis) => value - min[axis]);
}

const [onlyName, onlySize] = process.argv.slice(2);
const names = onlyName
    ? [onlyName.replace(/\.glb$/, '')]
    : readdirSync(MODELS_DIR).filter((file) => file.endsWith('.glb')).map((file) => file.replace(/\.glb$/, ''));

const fmt = (values) => values.map((value) => value.toFixed(3).padStart(7)).join(' x ');

console.log('model                  targetSize   width x height x depth   (x, y, z as placed)');
for (const name of names.sort()) {
    const size = measure(join(MODELS_DIR, `${name}.glb`));
    const largest = Math.max(...size);
    const targetSize = onlySize ? Number(onlySize) : PLACED_AT[name];
    if (!targetSize) {
        console.log(`${name.padEnd(22)}    (unplaced)  ${fmt(size.map((v) => v / largest))}   per unit of its largest axis`);
        continue;
    }
    console.log(`${name.padEnd(22)}${String(targetSize).padStart(10)}   ${fmt(size.map((v) => (v / largest) * targetSize))}`);
}
