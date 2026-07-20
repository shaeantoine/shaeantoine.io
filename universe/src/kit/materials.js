import * as THREE from 'three';

const materialCache = new Map();
const flatMaterialCache = new Map();

/**
 * Returns a shared MeshStandardMaterial for a given color, reusing instances
 * so zones built from the same palette don't each allocate their own
 * material. Dielectric (metalness 0) — matches painted/organic props (walls,
 * terrain, foliage).
 */
export function standardMaterial(color) {
    const key = typeof color === 'number' ? color : new THREE.Color(color).getHex();
    if (materialCache.has(key)) return materialCache.get(key);

    const material = new THREE.MeshStandardMaterial({
        color: key,
        roughness: 0.8,
        metalness: 0
    });
    materialCache.set(key, material);
    return material;
}

/**
 * Same PBR material family as `standardMaterial`, cached separately for
 * faceted geometry like Globe/PlanetLoader's icospheres — lower roughness
 * and a touch of metalness give each flat facet a sharp, distinct specular
 * highlight (a "cut gem" look) instead of the old toon gradient's flat
 * color bands. The facet look itself still comes from the geometry's own
 * de-indexed, per-face normals, not from this material.
 */
export function standardMaterialFlat(color) {
    const key = typeof color === 'number' ? color : new THREE.Color(color).getHex();
    if (flatMaterialCache.has(key)) return flatMaterialCache.get(key);

    const material = new THREE.MeshStandardMaterial({
        color: key,
        roughness: 0.45,
        metalness: 0.15
    });
    flatMaterialCache.set(key, material);
    return material;
}

const globeMaterialCache = new Map();

/**
 * Same faceted-icosphere PBR family as `standardMaterialFlat`, but with
 * softer specular response — lower metalness and higher roughness — cached
 * separately since it's tuned specifically for Globe's low-poly Earth.
 * `standardMaterialFlat`'s sharper "cut gem" specular blows out an entire
 * facet at once at grazing light angles (each flat-shaded facet has one
 * constant normal, so there's no falloff across it), which reads as harsh
 * glare rather than a highlight on a body this size and this central to the
 * view. Spreading the highlight out keeps the faceted look without the
 * flash.
 */
export function standardMaterialGlobe(color) {
    const key = typeof color === 'number' ? color : new THREE.Color(color).getHex();
    if (globeMaterialCache.has(key)) return globeMaterialCache.get(key);

    const material = new THREE.MeshStandardMaterial({
        color: key,
        roughness: 0.75,
        metalness: 0.05
    });
    globeMaterialCache.set(key, material);
    return material;
}

const texturedMaterialCache = new Map();

/**
 * Shared PBR material for geometry carrying its own diffuse map (see
 * loaders/obj.js, which applies each object pack's baked palette) — cached
 * per-texture so repeated loads of the same country reuse one material
 * instance rather than allocating a new one per mount.
 */
export function standardMaterialTextured(map) {
    if (texturedMaterialCache.has(map)) return texturedMaterialCache.get(map);
    const material = new THREE.MeshStandardMaterial({
        map,
        roughness: 0.8,
        metalness: 0
    });
    texturedMaterialCache.set(map, material);
    return material;
}
