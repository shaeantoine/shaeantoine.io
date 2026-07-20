import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const cache = new Map();
const loader = new GLTFLoader();

/**
 * Cached GLTFLoader wrapper — avoids re-fetching/re-parsing a country's
 * .glb every time the mode toggle swaps it out and back in. Returns a
 * cloned scene graph per call so callers can freely mutate/dispose their
 * own instance without corrupting the cached source.
 */
export function loadGLTF(url) {
    if (cache.has(url)) {
        return cache.get(url).then((gltf) => gltf.scene.clone(true));
    }

    const promise = loader.loadAsync(url);
    cache.set(url, promise);
    return promise.then((gltf) => gltf.scene.clone(true));
}

export function clearGLTFCache() {
    cache.clear();
}
