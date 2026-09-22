import * as THREE from 'three';

/**
 * One Texture per URL, shared, with a promise for anyone who needs to know
 * when it is actually drawable.
 *
 * WHY THIS EXISTS. Three's TextureLoader hands back a Texture immediately and
 * fills in its image whenever the file happens to decode, which is exactly the
 * behaviour that produced the load cascade: every surface in the room asked
 * for its own maps independently and each one changed appearance the moment
 * its own bytes landed, so the floor, the walls and each poster arrived in
 * whatever order the network served them. Nothing was wrong with any single
 * one of those handoffs; what was missing was a way to ask *whether they had
 * all happened yet*, which is what the promise here is for. See
 * loaders/preload.js, which is the only caller that waits on it, and
 * main.js, which holds the scene behind the veil until it resolves.
 *
 * Sharing one Texture per URL rather than loading a fresh one per call site is
 * the second half of it: a preloaded URL is then already decoded and already
 * uploaded, so the mesh that asks for it is drawable on the frame it is built.
 * It also collapses the two plants and any repeated artwork
 * down to a single GPU upload apiece.
 *
 * The catch worth knowing about: because the instance is shared, so is its
 * configuration. Every caller of a given URL has to want the same colour
 * space, wrapping and filtering. That holds today — a file is either artwork
 * (sRGB, clamped) or a PBR map (linear, tiled), never both — and it is the one
 * assumption to check before pointing two different kinds of surface at the
 * same file.
 *
 * Mirrors the shape of loaders/gltf.js deliberately; the two are the same idea
 * applied to the two kinds of asset this scene loads.
 */

const loader = new THREE.TextureLoader();
const textures = new Map(); // url -> Texture, from the moment it is requested
const loads = new Map(); // url -> Promise<Texture>, resolved once decoded

/**
 * Starts `url` loading if nothing has yet, and resolves once it is decoded and
 * ready to draw. Rejects if the file cannot be fetched — callers that treat a
 * missing file as survivable (an optional PBR map; the preloader) handle that
 * themselves rather than having it swallowed here.
 *
 * @returns {Promise<THREE.Texture>}
 */
export function loadTexture(url) {
    const existing = loads.get(url);
    if (existing) return existing;

    const promise = new Promise((resolve, reject) => {
        const texture = loader.load(url, () => resolve(texture), undefined, reject);
        textures.set(url, texture);
    });
    loads.set(url, promise);
    return promise;
}

/**
 * The shared Texture for `url`, returned synchronously, with its load started
 * if it had not been already.
 *
 * Already decoded when the URL was preloaded, which is the case that matters:
 * the mesh built around it draws correctly on its very first frame. When it
 * was not — a badge or a card built by a focus strategy long after load — the
 * texture fills itself in later, and `onLoad` is where the caller asks for the
 * frame that will show it.
 *
 * @param {string} url
 * @param {{ onLoad?: (texture: THREE.Texture) => void, onError?: (error: unknown) => void }} [handlers]
 */
export function sharedTexture(url, { onLoad, onError } = {}) {
    loadTexture(url).then(
        (texture) => onLoad?.(texture),
        (error) => {
            if (onError) onError(error);
            else console.error(`Failed to load texture "${url}"`, error);
        }
    );
    return textures.get(url);
}
