import * as THREE from 'three';
import { sharedTexture } from '../loaders/texture.js';
import { invalidate } from './renderScheduler.js';

/**
 * World scale. The desk scene is NOT authored in metres — each model is
 * uniformly scaled to a `targetSize` in world units (see content/deskObjects.js),
 * and those targets imply roughly 3.2 world units per metre:
 *
 *   Studio Display  targetSize 2.0  / 0.62 m real  = 3.2
 *   IKEA desk       targetSize 6.0  / 1.60 m real  = 3.75
 *   Mech keyboard   targetSize 1.0  / 0.44 m real  = 2.3
 *
 * The models aren't perfectly consistent with each other, so this is the
 * average weighted toward the two that dominate the frame (desk + display).
 * Every surface below sizes its texture tiling in *metres* and converts here,
 * because real-world tiling density is what makes a material read at the right
 * scale — a carpet tiled "every 4 world units" means nothing on its own.
 */
export const UNITS_PER_METER = 3.2;

/**
 * Set a directory path here to load a real photo-sourced PBR set instead of
 * the procedural maps below — see scripts/fetch-textures.sh, which downloads
 * CC0 sets from ambientCG into exactly these paths.
 *
 * Each directory holds the four maps ambientCG ships in its 2K-JPG zips, under
 * their original names but recompressed to WebP by scripts/optimize-images.sh:
 * Color, NormalGL, Roughness and AmbientOcclusion. (NormalGL, not NormalDX —
 * three.js expects OpenGL-convention normals, where green points up. A DirectX
 * map will light every bump as a dent.)
 *
 * Left null, each surface generates its own seamless maps at runtime.
 */
export const SURFACE_SOURCES = {
    carpet: '/textures/carpet',
    plaster: '/textures/plaster'
};

/**
 * Which file fills which material slot, and in what colour space.
 *
 * Exported because the preloader has to request exactly this set and no other
 * — see loaders/preload.js. A second copy of these filenames there would be a
 * list that silently stops matching the moment a map is added here, and the
 * failure it produces is the specific one this whole change exists to remove:
 * one surface arriving a beat after the rest of the room.
 */
export const SURFACE_MAPS = [
    { slot: 'map', file: 'Color.webp', colorSpace: THREE.SRGBColorSpace },
    { slot: 'normalMap', file: 'NormalGL.webp', colorSpace: THREE.NoColorSpace },
    { slot: 'roughnessMap', file: 'Roughness.webp', colorSpace: THREE.NoColorSpace },
    { slot: 'aoMap', file: 'AmbientOcclusion.webp', colorSpace: THREE.NoColorSpace }
];

// ---------------------------------------------------------------------------
// Seamless procedural noise
// ---------------------------------------------------------------------------

function mulberry32(seed) {
    let a = seed;
    return function random() {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const smoothstep = (t) => t * t * (3 - 2 * t);

/**
 * Value noise on a lattice that wraps modulo `period`. Because the lattice is
 * periodic in UV space rather than pixel space, u=1 samples the exact same
 * lattice cell as u=0 — so every map this produces tiles seamlessly at any
 * resolution, which is the whole reason these are generated rather than
 * photographed. (The carpet.jpg this replaces was mirror-tiled, leaving a
 * visible symmetry seam down the middle of the floor.)
 */
function sampleLattice(grid, period, u, v) {
    const x = u * period;
    const y = v * period;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smoothstep(x - x0);
    const fy = smoothstep(y - y0);
    const xa = ((x0 % period) + period) % period;
    const ya = ((y0 % period) + period) % period;
    const xb = (xa + 1) % period;
    const yb = (ya + 1) % period;
    const n00 = grid[ya * period + xa];
    const n10 = grid[ya * period + xb];
    const n01 = grid[yb * period + xa];
    const n11 = grid[yb * period + xb];
    return (n00 * (1 - fx) + n10 * fx) * (1 - fy) + (n01 * (1 - fx) + n11 * fx) * fy;
}

/** Fractal sum of periodic value noise, returned as a size×size field in 0..1. */
function fbmField(size, { basePeriod, octaves, gain = 0.5, seed }) {
    const random = mulberry32(seed);
    const layers = [];
    let period = basePeriod;
    let amplitude = 1;
    let total = 0;
    for (let i = 0; i < octaves; i++) {
        const grid = new Float32Array(period * period);
        for (let j = 0; j < grid.length; j++) grid[j] = random();
        layers.push({ grid, period, amplitude });
        total += amplitude;
        period *= 2;
        amplitude *= gain;
    }

    const field = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
        const v = y / size;
        for (let x = 0; x < size; x++) {
            const u = x / size;
            let sum = 0;
            for (const layer of layers) sum += layer.amplitude * sampleLattice(layer.grid, layer.period, u, v);
            field[y * size + x] = sum / total;
        }
    }
    return field;
}

// ---------------------------------------------------------------------------
// Field → texture
// ---------------------------------------------------------------------------

function configureTexture(texture, { colorSpace, anisotropy }) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = colorSpace;
    // DataTexture defaults to NearestFilter with no mipmaps, which aliases
    // violently on a floor viewed at a grazing angle. Trilinear + anisotropy
    // is not optional for the carpet.
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
    return texture;
}

function dataTexture(data, size, options) {
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    return configureTexture(texture, options);
}

/**
 * Converts a heightfield into a tangent-space normal map by central
 * differences, wrapping at the edges so the normals stay seamless too.
 * `strength` is the height-to-width ratio — carpet wants a large value
 * (deep pile relief), plaster a small one (near-flat orange peel).
 */
function heightToNormalData(height, size, strength) {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
        const yPrev = ((y - 1 + size) % size) * size;
        const yNext = ((y + 1) % size) * size;
        const yRow = y * size;
        for (let x = 0; x < size; x++) {
            const xPrev = (x - 1 + size) % size;
            const xNext = (x + 1) % size;
            const dx = (height[yRow + xPrev] - height[yRow + xNext]) * strength;
            const dy = (height[yPrev + x] - height[yNext + x]) * strength;
            const length = Math.hypot(dx, dy, 1);
            const i = (yRow + x) * 4;
            data[i] = ((dx / length) * 0.5 + 0.5) * 255;
            data[i + 1] = ((dy / length) * 0.5 + 0.5) * 255;
            data[i + 2] = (1 / length) * 0.5 * 255 + 127.5;
            data[i + 3] = 255;
        }
    }
    return data;
}

/** Packs ambient-occlusion into R, roughness into G, metalness into B. */
function packOrmData(size, { ao, roughness, metalness = 0 }) {
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
        data[i * 4] = Math.max(0, Math.min(1, ao(i))) * 255;
        data[i * 4 + 1] = Math.max(0, Math.min(1, roughness(i))) * 255;
        data[i * 4 + 2] = metalness * 255;
        data[i * 4 + 3] = 255;
    }
    return data;
}

const srgbComponents = new THREE.Color();

/**
 * `shade` modulates the base colour per texel. Note the explicit SRGBColorSpace
 * read: THREE.Color decodes a hex literal into the *linear* working space, but
 * these bytes go into a texture tagged SRGBColorSpace, so taking `.r/.g/.b`
 * directly would encode a linear value as if it were sRGB and render the
 * surface far too dark.
 */
function albedoData(size, baseHex, shade) {
    const { r, g, b } = new THREE.Color(baseHex).getRGB(srgbComponents, THREE.SRGBColorSpace);
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
        const k = shade(i);
        data[i * 4] = Math.max(0, Math.min(1, r * k)) * 255;
        data[i * 4 + 1] = Math.max(0, Math.min(1, g * k)) * 255;
        data[i * 4 + 2] = Math.max(0, Math.min(1, b * k)) * 255;
        data[i * 4 + 3] = 255;
    }
    return data;
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

const CARPET_SIZE = 256;
export const CARPET_TILE_METERS = 0.5;
const CARPET_COLOR = 0xb3aca1; // warm oatmeal berber
const CARPET_NORMAL_STRENGTH = 2.6;

const PLASTER_SIZE = 256;
export const PLASTER_TILE_METERS = 1.5;
const PLASTER_COLOR = 0xe6e1d9; // warm off-white paint, a touch below {colors.canvas}
const PLASTER_NORMAL_STRENGTH = 2.0;

// Multiplier on whichever normal map ends up in the plaster material, procedural
// or photo-sourced. Left at 1 — amplifying it was an attempt to make relief
// visible on a wall lit head-on, which instead turned the back wall (which the
// beam rakes across at a shallow angle) into visible stucco. Plaster is nearly
// flat and should read that way; the walls looking different from each other
// was a lighting problem, not a missing-texture one. See lighting.js.
const PLASTER_NORMAL_SCALE = 1;

const BASEBOARD_COLOR = 0xf0ece5; // semi-gloss painted trim

/**
 * Loads a photo-sourced PBR set from `dir` and swaps each map into `material`
 * as it arrives, replacing whichever procedural map was already in that slot.
 * Called only when SURFACE_SOURCES names a directory.
 *
 * Each slot is assigned only *after* its file decodes, which matters more than
 * it looks. A texture whose request 404s is still a truthy value on the
 * material, so three compiles the shader with that map enabled and then binds
 * its zero-filled placeholder — the map samples pure black. For `aoMap` that is
 * catastrophic rather than cosmetic: the shader computes
 * `(texture2D(aoMap, uv).r - 1.0) * aoMapIntensity + 1.0`, which collapses to 0
 * and multiplies away the surface's entire image-based-lighting contribution,
 * leaving it lit only by direct light. ambientCG omits AmbientOcclusion from
 * plenty of near-flat materials, painted plaster among them, so a missing
 * map is a normal case to absorb rather than an error.
 *
 * The swap is still deferred through a promise even when the file is already
 * in hand, because that is what keeps this one code path correct in both
 * cases. On a preloaded set it resolves on the next microtask — the same tick
 * the room is built in, long before the first frame is drawn — so the surface
 * is never seen in its procedural state at all. Cold, it behaves as it always
 * did and asks for a frame when it lands.
 */
function applyTextureSet(material, dir, anisotropy) {
    for (const { slot, file, colorSpace } of SURFACE_MAPS) {
        sharedTexture(`${dir}/${file}`, {
            onLoad(texture) {
                material[slot] = configureTexture(texture, { colorSpace, anisotropy });
                material.needsUpdate = true;
                invalidate();
            },
            onError() {
                console.warn(`[surfaces] No ${file} in ${dir} — keeping the procedural map for ${slot}.`);
            }
        });
    }
}

/**
 * How many times a `tileMeters`-wide tile repeats across `units` world units.
 *
 * Tiling lives in the geometry's UVs rather than in `texture.repeat`, because
 * `repeat` is a property of the texture and the walls are different sizes.
 * Setting it per-wall would force a separate Texture — and therefore a separate
 * material, and therefore a separate download and decode of the whole PBR set —
 * for every wall in the room. Scaling UVs instead lets one plaster material
 * cover the back, left and right walls at a consistent real-world density.
 */
export function tileRepeats(units, tileMeters) {
    return units / UNITS_PER_METER / tileMeters;
}

function buildSurface({ source, size, anisotropy, build }) {
    const material = build({ size, anisotropy });
    if (source) applyTextureSet(material, source, anisotropy);
    return material;
}

export function createCarpetMaterial({ anisotropy }) {
    return buildSurface({
        source: SURFACE_SOURCES.carpet,
        size: CARPET_SIZE,
        anisotropy,
        build({ size }) {
            // Two scales, because that's how loop-pile carpet actually reads:
            // individual fibres catching a raking light, over the top of
            // broader tuft clumping that the vacuum and footfall leave behind.
            const fibre = fbmField(size, { basePeriod: 64, octaves: 3, seed: 1013 });
            const clump = fbmField(size, { basePeriod: 6, octaves: 3, seed: 7717 });

            const height = new Float32Array(size * size);
            for (let i = 0; i < height.length; i++) height[i] = fibre[i] * 0.62 + clump[i] * 0.38;

            const linear = { anisotropy, colorSpace: THREE.NoColorSpace };
            const orm = dataTexture(
                packOrmData(size, {
                    // Light gets trapped down between the tufts, so the low
                    // points of the clump field occlude hardest.
                    ao: (i) => 0.5 + clump[i] * 0.5,
                    roughness: (i) => 0.9 + fibre[i] * 0.1
                }),
                size,
                linear
            );

            return new THREE.MeshStandardMaterial({
                map: dataTexture(
                    albedoData(size, CARPET_COLOR, (i) => 0.88 + clump[i] * 0.14 + fibre[i] * 0.1),
                    size,
                    { anisotropy, colorSpace: THREE.SRGBColorSpace }
                ),
                normalMap: dataTexture(heightToNormalData(height, size, CARPET_NORMAL_STRENGTH), size, linear),
                aoMap: orm,
                roughnessMap: orm,
                metalness: 0
            });
        }
    });
}

export function createPlasterMaterial({ anisotropy }) {
    return buildSurface({
        source: SURFACE_SOURCES.plaster,
        size: PLASTER_SIZE,
        anisotropy,
        build({ size }) {
            // Painted plaster is almost flat — what stops it reading as a
            // rendered polygon is trowel undulation catching the raking sun
            // light, plus a hair of roughness mottling so the sheen isn't
            // perfectly uniform across four metres of wall.
            const trowel = fbmField(size, { basePeriod: 4, octaves: 4, seed: 4441 });
            const grain = fbmField(size, { basePeriod: 48, octaves: 2, seed: 9091 });

            const height = new Float32Array(size * size);
            for (let i = 0; i < height.length; i++) height[i] = trowel[i] * 0.85 + grain[i] * 0.15;

            const linear = { anisotropy, colorSpace: THREE.NoColorSpace };
            return new THREE.MeshStandardMaterial({
                map: dataTexture(
                    albedoData(size, PLASTER_COLOR, (i) => 0.97 + trowel[i] * 0.06),
                    size,
                    { anisotropy, colorSpace: THREE.SRGBColorSpace }
                ),
                normalMap: dataTexture(heightToNormalData(height, size, PLASTER_NORMAL_STRENGTH), size, linear),
                roughnessMap: dataTexture(
                    packOrmData(size, { ao: () => 1, roughness: (i) => 0.88 + trowel[i] * 0.1 }),
                    size,
                    linear
                ),
                // Survives the photo-set swap: applyTextureSet replaces map
                // slots but never touches normalScale.
                normalScale: new THREE.Vector2(PLASTER_NORMAL_SCALE, PLASTER_NORMAL_SCALE),
                metalness: 0
            });
        }
    });
}

/**
 * Painted MDF skirting. Deliberately smoother than the wall it sits against —
 * the specular break between matte plaster and semi-gloss trim is doing most
 * of the work of making the wall/floor junction read as built rather than as
 * two planes intersecting.
 */
export function createBaseboardMaterial() {
    return new THREE.MeshStandardMaterial({
        color: BASEBOARD_COLOR,
        roughness: 0.34,
        metalness: 0
    });
}
