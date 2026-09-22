import { invalidateShadows } from './renderScheduler.js';

/**
 * Per-object material tuning for loaded .glb assets.
 *
 * Downloaded models are routinely careless about their PBR values — a flat
 * `roughness: 1.0, metalness: 0.0` on every submesh is the most common export
 * default, and under image-based lighting that reads as unfired clay no matter
 * how good the scene's lighting is. The model itself is usually fine; only the
 * numbers are wrong. Re-authoring them in Blender to fix a scalar would be
 * absurd, so desk objects can override them at load time instead.
 *
 * The single most useful knob here is `envMapIntensity`: it scales how much of
 * the room's environment map a surface picks up, which is most of what decides
 * whether an object looks like it is sitting *in* the room or composited on
 * top of it.
 */

/**
 * Scalar fields a desk object may override, and their valid ranges.
 *
 * Restricted deliberately rather than accepting an arbitrary `Object.assign`:
 * three.js material fields are a mix of primitives and class instances, and
 * assigning a hex number over `.color` (a THREE.Color) would silently destroy
 * the material with no error anywhere. Every field here is a plain number.
 */
export const MATERIAL_OVERRIDE_FIELDS = {
    roughness: { min: 0, max: 1 },
    metalness: { min: 0, max: 1 },
    // Unbounded above: pushing a dull material past 1 is a legitimate way to
    // make it pick up more of the window than it physically would.
    envMapIntensity: { min: 0, max: Infinity },
    aoMapIntensity: { min: 0, max: Infinity }
};

/**
 * Applies `overrides` to every material under `root`.
 *
 * Fields the material doesn't have are skipped rather than added — a glb that
 * arrives with a MeshBasicMaterial has no `roughness`, and bolting one on
 * would do nothing except make the override look like it had been honoured.
 *
 * @param {THREE.Object3D} root
 * @param {Record<string, number> | undefined} overrides
 */
export function applyMaterialOverrides(root, overrides) {
    if (!overrides) return;
    root.traverse((node) => {
        if (!node.isMesh) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
            for (const [field, value] of Object.entries(overrides)) {
                if (!(field in material)) continue;
                material[field] = value;
            }
        }
    });
    // No `needsUpdate` anywhere above: every overridable field is a shader
    // uniform, so setting it would force a pointless program recompile.
    invalidateShadows();
}

/**
 * What a fully-transmissive material is rendered at once its transmission has
 * been taken away. Eyes-on rather than derived — turn it down for more obviously
 * glassy, up for more solid.
 */
const TRANSMISSION_FALLBACK_OPACITY = 0.3;

/**
 * Set true to let `KHR_materials_transmission` through untouched, and read the
 * note below before you do.
 */
const ALLOW_REFRACTIVE_TRANSMISSION = false;

/**
 * Trades real refraction for alpha blending on any material that asks for it.
 *
 * WHY THIS IS WORTH A WHOLE PASS OVER EVERY MODEL. three implements
 * `material.transmission > 0` by rendering the entire scene a *second* time,
 * every frame, into a half-float target — and then generating a full mipmap
 * chain over it so rough transmission has something blurry to sample. It is by
 * some distance the most expensive single feature in the renderer, and the
 * price is paid per frame for as long as one transmissive material is in view.
 *
 * soldering_station.glb ships exactly one: a material named `Glass`, at
 * `transmissionFactor: 1`. It sits on the desk, so it is in view at the
 * establishing shot and in view during every dolly — which means the desk was
 * rendering itself twice, forever, for a refraction nobody can identify on a
 * prop that covers a few hundred pixels.
 *
 * The material is already `alphaMode: BLEND`, so the honest cheap version of it
 * is the one it half-declares anyway: transparent, at a fixed opacity. What is
 * lost is refraction and the background distortion behind the glass. What is
 * kept is that you can see through it.
 *
 * APPLIED ONCE PER ASSET, at the cache (see loaders/gltf.js), not per instance
 * — `scene.clone(true)` shares material instances, so doing it to the cached
 * source means every clone is born with it and no caller has to remember.
 *
 * `needsUpdate` is genuinely required here, unlike in `applyMaterialOverrides`:
 * `transmission` is not only a uniform, it gates the `USE_TRANSMISSION` shader
 * define, and dropping it to zero has to recompile the program rather than just
 * rebind a value.
 *
 * @param {THREE.Object3D} root
 * @returns {number} how many materials were converted — dev logging only
 */
export function neutralizeTransmission(root) {
    if (ALLOW_REFRACTIVE_TRANSMISSION) return 0;
    let converted = 0;
    root.traverse((node) => {
        if (!node.isMesh) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
            if (!(material.transmission > 0)) continue;
            // Scaled by the factor it asked for, so a partly-transmissive
            // material stays partly transparent rather than snapping to the
            // same value as a fully glass one.
            material.opacity = Math.min(
                material.opacity,
                1 - material.transmission * (1 - TRANSMISSION_FALLBACK_OPACITY)
            );
            material.transparent = true;
            material.transmission = 0;
            // Never sampled once transmission is 0, and nulling it keeps three
            // from ever uploading it — textures are sent to the GPU lazily, on
            // first use, so an unreferenced map costs nothing at all.
            material.transmissionMap = null;
            material.needsUpdate = true;
            converted += 1;
        }
    });
    return converted;
}

/**
 * Logs what each loaded model actually shipped with, so the values above can
 * be chosen by reading rather than guessing. Dev-only — this is the tool for
 * answering "is this asset worth keeping or is it beyond saving", and the
 * answer is usually visible in whether it has real texture maps or just flat
 * scalars.
 */
export function logMaterialInventory(url, root) {
    const rows = [];
    root.traverse((node) => {
        if (!node.isMesh) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
            rows.push({
                mesh: node.name || '(unnamed)',
                material: material.name || '(unnamed)',
                type: material.type,
                roughness: material.roughness,
                metalness: material.metalness,
                maps: ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']
                    .filter((slot) => material[slot])
                    .join(', ') || 'none',
                triangles: node.geometry?.index
                    ? node.geometry.index.count / 3
                    : (node.geometry?.attributes.position.count ?? 0) / 3
            });
        }
    });
    console.groupCollapsed(`[materials] ${url} — ${rows.length} material(s)`);
    console.table(rows);
    console.groupEnd();
}
