import * as THREE from 'three';
import { track } from './track.js';
import { invalidate } from '../scene/renderScheduler.js';

/**
 * Images the site ships in src/media, by file name.
 *
 *   await ctx.media('amazon_first_day')        // -> HTMLImageElement, decoded
 *   ctx.mediaUrl('memo_puralink.jpg')          // -> a URL that works in dev and build
 *   ctx.mediaTexture('stanford')               // -> THREE.Texture, sRGB, fills in when decoded
 *
 * The extension is optional (.jpg assumed). The template-literal `new URL` is
 * what Vite rewrites at build time into a glob over src/media, so the files
 * are fingerprinted into dist/assets; in dev it resolves natively.
 */

const images = new Map(); // name -> Promise<HTMLImageElement>
const textures = new Map(); // name -> THREE.Texture

function fileName(name) {
    return /\.[a-z0-9]+$/i.test(name) ? name : `${name}.jpg`;
}

export function mediaUrl(name) {
    const file = fileName(name);
    return new URL(`../media/${file}`, import.meta.url).href;
}

/** @returns {Promise<HTMLImageElement>} decoded; rejects if the file is missing. */
export function media(name) {
    const file = fileName(name);
    const existing = images.get(file);
    if (existing) return existing;
    const promise = new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => {
            (image.decode ? image.decode().catch(() => undefined) : Promise.resolve()).then(() => resolve(image));
        };
        image.onerror = () => reject(new Error(`[desk:media] Could not load ${file}`));
        image.src = mediaUrl(file);
    });
    images.set(file, promise);
    track(promise.catch((error) => console.error(error.message)), `media ${file}`);
    return promise;
}

/**
 * A texture for a media file, returned at once and filled in when the image
 * decodes (requesting a frame). Shared per file: don't mutate its wrapping or
 * repeat — clone() it if you need different sampling.
 */
export function mediaTexture(name, { anisotropy = 1 } = {}) {
    const file = fileName(name);
    const existing = textures.get(file);
    if (existing) return existing;
    const texture = new THREE.Texture();
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropy;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    textures.set(file, texture);
    media(file).then((image) => {
        texture.image = image;
        texture.needsUpdate = true;
        invalidate();
    }, () => { /* already logged by media() */ });
    return texture;
}
