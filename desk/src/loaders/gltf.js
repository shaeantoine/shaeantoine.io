import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { neutralizeTransmission } from '../scene/materialOverrides.js';
import { phoneTier } from '../core/flags.js';

const cache = new Map();
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

/**
 * The longest side, in texels, the phone tier (core/flags.js `tier`) lets an
 * image embedded in a GLB keep. The desktop keeps whatever the file carries.
 *
 * WHY THE PHONE NEEDS ONE. The props on this desk were exported with the
 * textures their authors shipped, and three of them carry 2048² maps on
 * objects that are a few hundred pixels across even on a laptop: borg_cube
 * (3, on a twelve-triangle cube), tron_disc (4) and the bench's pixel phone
 * (1). Uploaded as RGBA8 with mipmaps that is 22 MB each, ~180 MB for the eight
 * — most of the ~300 MB the GLBs cost on the GPU, before counting the decoded
 * copies three keeps of each. At 1024 they are a quarter of that, and on a
 * phone's frame, where the largest of those props spans perhaps 200 pixels,
 * the extra texels were only ever filling mip levels nobody sampled.
 *
 * Why not fix the files instead: the right fix is smaller maps in the assets
 * themselves (scripts/optimize-models.sh), and it would take this out of the
 * phone's load entirely. Until then this is the version that cannot be undone
 * by re-exporting a model, and the desktop's look is untouched by either.
 */
const PHONE_MAX_TEXTURE_SIZE = 1024;

/** An image's own size: an <img>'s natural one (its width/height are layout), anything else's width/height. */
function imageSize(image) {
    return {
        width: image.naturalWidth || image.width || 0,
        height: image.naturalHeight || image.height || 0
    };
}

/**
 * `image` redrawn into a canvas at most `maxSize` on its longer side, aspect
 * kept — or null if it is already that small, or the browser will not give a
 * canvas to draw it in.
 *
 * THE SAME MOVE three makes itself when an image exceeds MAX_TEXTURE_SIZE
 * (WebGLTextures.resizeImage), made once here at load rather than on every
 * upload, and at a size chosen for the phone rather than for the GPU's limit.
 * Both of the loader's image paths come through: GLTFLoader decodes embedded
 * images to an ImageBitmap where it trusts createImageBitmap, and to an
 * HTMLImageElement where it does not — Safari before 17, and every iOS browser
 * that is not Safari itself (Chrome and Firefox on iOS carry no `Version/` in
 * their user agent, so three takes them for old Safari). drawImage takes
 * either.
 *
 * A NULL CONTEXT IS A REAL CASE ON iOS, not a formality: Safari caps the memory
 * of all a tab's 2D canvases together, and past it getContext('2d') returns
 * null. Keeping the full-size original is the right failure — a heavier
 * texture, not a missing one.
 *
 * What the redraw does to the pixels, so it is not a surprise: a 2D canvas
 * stores premultiplied alpha, and three uploads with premultiplyAlpha off, so
 * the browser un-premultiplies on the way to the GPU — colour under fully
 * transparent texels comes back black, and colour under faint alpha loses
 * precision. Every map this currently catches is opaque, so none of that
 * applies to them. (The soldering station's alpha map would be caught; it is
 * not on the desk.) No colour conversion happens either way: the images carry
 * no colour profile, so drawImage copies the bytes as decoded, and the
 * texture's own colorSpace still tells three how to read them.
 */
function downscaledCanvas(image, maxSize) {
    const { width, height } = imageSize(image);
    const longer = Math.max(width, height);
    if (!(longer > maxSize) || typeof document === 'undefined') return null;
    const scale = maxSize / longer;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
}

/**
 * `canvas`'s pixels as an ImageBitmap, with the canvas emptied — or the canvas
 * itself, untouched, where the browser will not make one.
 *
 * WHY NOT LEAVE THE CANVAS AS THE IMAGE, when three uploads one just as
 * happily: iOS counts every live canvas against the per-tab cap described on
 * downscaledCanvas, and this one could never be let go. three uploads a Source
 * once per sampler, and a clone with a different sampler shares the Source, so
 * the pixels must stay readable for as long as the page might build one — the
 * life of the page. Eight of them at 1024² are 32 MB of that cap, held for good
 * and claimed first (the models preload before anything else is built), on a
 * tablet whose own hundred-odd canvases need most of what is left. An
 * ImageBitmap is not a canvas and is not counted.
 *
 * NOTHING ABOUT THE UPLOAD CHANGES. `premultiplyAlpha: 'none'` gives three the
 * same un-premultiplied texels it read back out of the canvas (it uploads with
 * premultiplyAlpha off, as above); `colorSpaceConversion: 'none'` keeps the
 * bytes as drawImage left them; and flipY, which WebGL ignores for a bitmap, is
 * false on every glTF texture, so the bitmap lands the way the canvas did — the
 * same reason GLTFLoader can hand three either.
 *
 * Zeroing the canvas's size frees its backing store now, rather than whenever
 * the collector gets to the element.
 */
async function releasedAsBitmap(canvas) {
    if (typeof createImageBitmap !== 'function') return canvas;
    try {
        const bitmap = await createImageBitmap(canvas, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        canvas.width = 0;
        canvas.height = 0;
        return bitmap;
    } catch {
        return canvas; // refused or unsupported: the canvas still draws, it only costs the cap
    }
}

/**
 * Caps every image `root`'s materials sample at `maxSize`, before any of them
 * has been uploaded. Resolves to how many images it redrew.
 *
 * PER SOURCE, NOT PER TEXTURE. GLTFLoader gives each glTF texture its own
 * Texture, but two that point at one image share a THREE.Source — a clone, with
 * a different sampler or transform — so the image is redrawn once and every
 * texture over it picks the result up through the Source. Each texture keeps
 * everything else it was given: colorSpace, flipY (false, as glTF wants — see
 * releasedAsBitmap for why that reads the same off a bitmap as off a canvas),
 * wrapping, filtering, channel and transform all live on the Texture, and only
 * the Source's data changes.
 *
 * Done on the cached original, which every scene built from this file shares
 * textures with (loadGLTF's clone shares materials; DeskScene's clones of those
 * share their maps), and before anything renders: so nothing is uploaded at
 * the old size and then again at the new one.
 *
 * ONE AT A TIME, ON PURPOSE. Each image is redrawn, turned into a bitmap and its
 * canvas emptied before the next canvas exists, so wherever bitmaps can be made
 * the cap never holds more than one 4 MB canvas at once rather than all eight.
 *
 * THE ORIGINAL IS RELEASED, which is half of the point: an ImageBitmap is
 * close()d, freeing its decoded pixels now rather than whenever the collector
 * gets to it (three keeps nothing else pointing at it), and an <img> is simply
 * no longer referenced once the Source holds the smaller copy.
 *
 * Exported so it can be checked outside a browser; the app reaches it only
 * through fetchGLTF, on the phone tier.
 */
export async function capTextureImages(root, maxSize = PHONE_MAX_TEXTURE_SIZE) {
    const sources = new Map(); // THREE.Source -> the Textures drawing from it
    root.traverse((node) => {
        const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
        for (const material of materials) {
            for (const value of Object.values(material)) {
                if (!value?.isTexture || !value.source) continue;
                const textures = sources.get(value.source) ?? new Set();
                textures.add(value);
                sources.set(value.source, textures);
            }
        }
    });

    let capped = 0;
    for (const [source, textures] of sources) {
        const original = source.data;
        if (!original) continue;
        const canvas = downscaledCanvas(original, maxSize);
        if (!canvas) continue;
        source.data = await releasedAsBitmap(canvas);
        for (const texture of textures) texture.needsUpdate = true;
        original.close?.();
        capped += 1;
    }
    return capped;
}

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
            // The phone tier's texture cap, for the same reason and in the same
            // place — and awaited, so no caller is handed the gltf, and nothing
            // is uploaded from it, until every image is at its capped size.
            // Skipped entirely on a desktop, which gets the gltf back in this
            // same callback as before. @see PHONE_MAX_TEXTURE_SIZE
            if (!phoneTier) return gltf;
            return capTextureImages(gltf.scene, PHONE_MAX_TEXTURE_SIZE).then((capped) => {
                if (capped > 0 && import.meta.env?.DEV) {
                    console.info(`[gltf] ${url}: ${capped} image(s) redrawn at ${PHONE_MAX_TEXTURE_SIZE} for the phone tier.`);
                }
                return gltf;
            });
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
