import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { neutralizeTransmission } from '../scene/materialOverrides.js';

const cache = new Map();
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

/** The parsed gltf for `url`, fetching it the first time and sharing it after. */
function fetchGLTF(url) {
    let promise = cache.get(url);
    if (!promise) {
        promise = loader.loadAsync(url).then((gltf) => {
            // Done here, on the cached source, rather than by each caller after
            // cloning: `clone(true)` shares material instances, so one pass over
            // the original settles it for every instance that will ever be built
            // from this file. See neutralizeTransmission for why a single
            // transmissive material is worth intercepting at all — it doubles
            // the cost of every frame it appears in.
            const converted = neutralizeTransmission(gltf.scene);
            if (converted > 0 && import.meta.env?.DEV) {
                console.info(`[gltf] ${url}: ${converted} transmissive material(s) rendered as alpha blend instead.`);
            }
            return gltf;
        });
        cache.set(url, promise);
    }
    return promise;
}

/**
 * Warms the cache without building anything from it.
 *
 * Separate from `loadGLTF` because the clone below is not free — it walks the
 * entire node graph — and the preloader wants the bytes fetched and parsed, not
 * a scene graph it is going to throw away. See loaders/preload.js.
 *
 * @returns {Promise<object>} the parsed gltf, which callers should not mutate
 */
export function preloadGLTF(url) {
    return fetchGLTF(url);
}

/**
 * Cached GLTFLoader wrapper — returns a cloned scene graph per call so
 * callers can freely mutate/dispose their own instance without corrupting
 * the cached source.
 */
export function loadGLTF(url) {
    return fetchGLTF(url).then((gltf) => gltf.scene.clone(true));
}
