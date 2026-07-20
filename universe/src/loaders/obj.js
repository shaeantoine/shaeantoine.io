import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { standardMaterialTextured } from '../kit/materials.js';

const cache = new Map();
const loader = new OBJLoader();
const textureLoader = new THREE.TextureLoader();
const textureCache = new Map();

function loadTexture(url) {
    if (textureCache.has(url)) return textureCache.get(url);
    const promise = textureLoader.loadAsync(url).then((texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    });
    textureCache.set(url, promise);
    return promise;
}

/**
 * Temporary preview-only counterpart to loadGLTF — loads a raw, undecimated
 * .obj (no material data) and applies the object pack's own "shaded.png"
 * texture as a PBR diffuse map (a baked-per-country palette from the source
 * tool — distinct from the photoreal "texture_diffuse.png" satellite
 * imagery, which is unused here).
 * Lets ZoneLoader.previewModel point straight at a Blender export-in-progress
 * without waiting for a final .glb. Remove once real .glb assets land
 * (carrying their own baked textures).
 */
export function loadOBJ(url, paletteUrl) {
    const cacheKey = `${url}|${paletteUrl}`;
    if (cache.has(cacheKey)) {
        return cache.get(cacheKey).then((obj) => obj.clone(true));
    }

    const promise = Promise.all([loader.loadAsync(url), loadTexture(paletteUrl)]).then(
        ([obj, texture]) => {
            const material = standardMaterialTextured(texture);
            obj.traverse((child) => {
                if (child.isMesh) child.material = material;
            });
            return obj;
        }
    );
    cache.set(cacheKey, promise);
    return promise.then((obj) => obj.clone(true));
}

export function clearOBJCache() {
    cache.clear();
}
