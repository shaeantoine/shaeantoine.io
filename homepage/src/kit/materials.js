import * as THREE from 'three';

// Small stepped gradient so MeshToonMaterial reads as flat/toon-shaded
// (Godus/Polytopia reference) rather than smoothly lit.
const TOON_STEPS = 3;
let toonGradientMap = null;

function getToonGradientMap() {
    if (toonGradientMap) return toonGradientMap;

    const data = new Uint8Array(TOON_STEPS);
    for (let i = 0; i < TOON_STEPS; i++) {
        data[i] = Math.floor((i / (TOON_STEPS - 1)) * 255);
    }
    const texture = new THREE.DataTexture(data, TOON_STEPS, 1, THREE.RedFormat);
    texture.needsUpdate = true;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    toonGradientMap = texture;
    return toonGradientMap;
}

const materialCache = new Map();
const flatMaterialCache = new Map();

/**
 * Returns a shared MeshToonMaterial for a given color, reusing instances so
 * zones built from the same palette don't each allocate their own material.
 */
export function toonMaterial(color) {
    const key = typeof color === 'number' ? color : new THREE.Color(color).getHex();
    if (materialCache.has(key)) return materialCache.get(key);

    const material = new THREE.MeshToonMaterial({
        color: key,
        gradientMap: getToonGradientMap()
    });
    materialCache.set(key, material);
    return material;
}

/**
 * Same toon shading as `toonMaterial`, cached separately for geometry like
 * Globe's icosphere — the per-triangle facet look comes from the geometry's
 * own de-indexed, per-face normals, not from the material (MeshToonMaterial
 * has no flatShading property).
 */
export function toonMaterialFlat(color) {
    const key = typeof color === 'number' ? color : new THREE.Color(color).getHex();
    if (flatMaterialCache.has(key)) return flatMaterialCache.get(key);

    const material = new THREE.MeshToonMaterial({
        color: key,
        gradientMap: getToonGradientMap()
    });
    flatMaterialCache.set(key, material);
    return material;
}

const texturedMaterialCache = new Map();

/**
 * Shared toon material for geometry carrying its own diffuse map (see
 * loaders/obj.js, which applies each object pack's "shaded.png" palette) —
 * cached per-texture so repeated loads of the same country reuse one
 * material instance rather than allocating a new one per mount.
 */
export function toonMaterialTextured(map) {
    if (texturedMaterialCache.has(map)) return texturedMaterialCache.get(map);
    const material = new THREE.MeshToonMaterial({
        map,
        gradientMap: getToonGradientMap()
    });
    texturedMaterialCache.set(map, material);
    return material;
}
