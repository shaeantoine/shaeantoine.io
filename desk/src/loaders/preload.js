import { preloadGLTF } from './gltf.js';
import { loadTexture } from './texture.js';
import { SURFACE_SOURCES, SURFACE_MAPS } from '../scene/surfaces.js';

/**
 * Fetching everything the opening shot needs, before any of it is put on
 * screen.
 *
 * THE PROBLEM THIS SOLVES. Every asset in this scene used to be requested by
 * the thing that needed it, at the moment it was built, and shown the instant
 * it arrived: `attachModel` added each .glb on its own `.then`, `applyTextureSet`
 * assigned each PBR map on its own callback, and each poster's artwork landed
 * on its own. Individually all of that is correct. Collectively it is a
 * cascade — the desk appears, then the room snaps into existence underneath it
 * when the desk's height finally reports the floor, then the monitor, then the
 * books, then a beat later the carpet changes texture, then the walls, then
 * each poster lights up in whatever order the network felt like. Twenty-three
 * files — eight models and fifteen textures, the count the manifest below
 * derives — twenty-three separate moments of the page changing.
 *
 * No amount of per-asset polish fixes that, because the problem is not how any
 * one object arrives — it is that there was never a point in time at which the
 * room was *finished*. This module is that point. It warms the same two caches
 * the scene loads through (loaders/gltf.js and loaders/texture.js), so that
 * when DeskScene is built afterwards every request it makes is already in
 * hand, and the whole room resolves inside a single tick.
 *
 * WHAT IS DELIBERATELY NOT IN HERE. Anything a visitor reaches by clicking: the
 * hardware bench's swappable project models, a work's preview image. Those are
 * fetched by their focus strategies on demand, which is right — they are not
 * part of the first impression, and pulling them forward would hold the veil up
 * for assets most visits never see.
 */

/**
 * Every file the resting scene will ask for, derived from the layout rather
 * than listed.
 *
 * Listing them would be a second copy of the truth, and the way that copy
 * fails is silent: a poster added to deskObjects.js and forgotten here does not
 * break, it just goes back to arriving late on its own — which is precisely the
 * bug this exists to prevent, reintroduced one asset at a time. Same reasoning
 * as the `referenced` sweep in scripts/optimize-models.sh.
 *
 * Deduplicated, because the layout genuinely repeats assets — plant.glb is both
 * shelf plants — and a duplicate would be counted twice in the progress
 * fraction while costing nothing to load. One repeat is enough to need this:
 * the set is not an optimisation, it is what keeps the fraction honest.
 *
 * @param {object[]} deskObjects from content/deskObjects.js
 * @param {Record<string, string|null>} [surfaceSources] from scene/surfaces.js
 * @returns {{ models: string[], textures: string[] }}
 */
export function deskAssetManifest(deskObjects, surfaceSources = SURFACE_SOURCES) {
    const models = new Set();
    const textures = new Set();

    for (const object of deskObjects) {
        if (object.model?.url) models.add(object.model.url);
        for (const part of object.parts ?? []) {
            if (part.texture) textures.add(part.texture);
        }
    }

    for (const dir of Object.values(surfaceSources)) {
        if (!dir) continue; // that surface is staying procedural; nothing to fetch
        for (const { file } of SURFACE_MAPS) textures.add(`${dir}/${file}`);
    }

    return { models: [...models], textures: [...textures] };
}

/**
 * Fetches the whole manifest, reporting progress as a 0..1 fraction.
 *
 * NOTHING HERE REJECTS, and that is a decision rather than an oversight. A
 * missing file is survivable everywhere it can happen — an absent
 * AmbientOcclusion map is the normal case for painted plaster and
 * `applyTextureSet` is written to keep the procedural one, a model that 404s
 * leaves a gap on the desk and `attachModel` logs it — but a rejection here
 * would take down the reveal itself and leave the visitor looking at a loading
 * screen forever. A room with one prop missing is a far better failure than no
 * room at all, so every outcome counts as progress and the failures are left
 * to be reported by the code that actually knows what to do about them.
 *
 * Progress is counted per file rather than weighted by size. It is not a
 * truthful picture of bytes — the desk model is thirty times the weight of the
 * mouse — and it does not need to be: the bar it drives is eased over its own
 * transition (see .loading-veil-bar), so what a visitor reads is steady
 * forward motion, not a measurement.
 *
 * @param {object[]} deskObjects
 * @param {{ onProgress?: (fraction: number, loaded: number, total: number) => void }} [options]
 * @returns {Promise<{ total: number }>}
 */
export function preloadDeskAssets(deskObjects, { onProgress } = {}) {
    const { models, textures } = deskAssetManifest(deskObjects);
    const total = models.length + textures.length;

    let loaded = 0;
    const settled = () => {
        loaded += 1;
        onProgress?.(loaded / total, loaded, total);
    };

    if (total === 0) {
        onProgress?.(1, 0, 0);
        return Promise.resolve({ total });
    }

    const requests = [
        ...models.map((url) => preloadGLTF(url)),
        ...textures.map((url) => loadTexture(url))
    ].map((request) => request.then(settled, settled));

    return Promise.all(requests).then(() => ({ total }));
}
