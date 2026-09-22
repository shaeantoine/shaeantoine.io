import { describe, expect, it } from 'vitest';
import { deskAssetManifest } from './preload.js';
import { SURFACE_MAPS } from '../scene/surfaces.js';
import { deskObjects } from '../content/deskObjects.js';

describe('deskAssetManifest', () => {
    const noSurfaces = { carpet: null, plaster: null };

    it('collects every model url on the desk', () => {
        const { models } = deskAssetManifest([
            { id: 'a', position: [0, 0, 0], model: { url: '/models/a.glb' } },
            { id: 'b', position: [0, 0, 0], model: { url: '/models/b.glb' } }
        ], noSurfaces);

        expect(models).toEqual(['/models/a.glb', '/models/b.glb']);
    });

    it('collects every part texture, across objects', () => {
        const { textures } = deskAssetManifest([
            { id: 'wall', position: [0, 0, 0], parts: [{ texture: '/art/one.webp' }, { color: '#fff' }] },
            { id: 'shelf', position: [0, 0, 0], parts: [{ texture: '/art/two.webp' }] }
        ], noSurfaces);

        expect(textures).toEqual(['/art/one.webp', '/art/two.webp']);
    });

    it('asks for each repeated asset once', () => {
        // The layout genuinely repeats assets — plant.glb is both shelf plants.
        // A duplicate costs nothing to fetch but would be counted twice in the
        // progress fraction, so the bar would stall at the end while two
        // already-resolved requests reported in.
        const { models, textures } = deskAssetManifest([
            { id: 'a', position: [0, 0, 0], model: { url: '/models/same.glb' } },
            { id: 'b', position: [0, 0, 0], model: { url: '/models/same.glb' } },
            { id: 'c', position: [0, 0, 0], parts: [{ texture: '/art/same.webp' }, { texture: '/art/same.webp' }] }
        ], noSurfaces);

        expect(models).toEqual(['/models/same.glb']);
        expect(textures).toEqual(['/art/same.webp']);
    });

    it('asks for the full PBR set of every configured surface', () => {
        const { textures } = deskAssetManifest([], { carpet: '/textures/carpet' });

        expect(textures).toEqual(SURFACE_MAPS.map(({ file }) => `/textures/carpet/${file}`));
    });

    it('skips a surface that is staying procedural', () => {
        // A null source means surfaces.js generates its maps at runtime and
        // never issues a request, so asking for four files that were never
        // going to be fetched would hold the veil up on four 404s.
        const { textures } = deskAssetManifest([], { carpet: null, plaster: '/textures/plaster' });

        expect(textures.every((url) => url.startsWith('/textures/plaster/'))).toBe(true);
        expect(textures).toHaveLength(SURFACE_MAPS.length);
    });

    it('tolerates an object with neither a model nor parts', () => {
        expect(() => deskAssetManifest([{ id: 'empty', position: [0, 0, 0] }], noSurfaces)).not.toThrow();
    });

    /**
     * The regression that actually matters, and the reason this file pins the
     * real layout rather than only fixtures.
     *
     * The manifest exists so that nothing in the resting scene is fetched after
     * the veil comes down. It is derived from deskObjects rather than listed
     * precisely so it cannot fall behind — but "derived" is only true while the
     * derivation covers every way an asset can be named in that file. A future
     * field that points at a file (a decal, a second texture slot) would be
     * loaded by the scene and missed here, and the symptom would not be an
     * error: it would be one object quietly going back to arriving late on its
     * own, which is the bug this whole path was built to remove.
     */
    it('covers every asset the real layout references', () => {
        const { models, textures } = deskAssetManifest(deskObjects);

        const referenced = { models: new Set(), textures: new Set() };
        for (const object of deskObjects) {
            if (object.model?.url) referenced.models.add(object.model.url);
            for (const part of object.parts ?? []) {
                if (part.texture) referenced.textures.add(part.texture);
            }
        }

        expect(new Set(models)).toEqual(referenced.models);
        for (const url of referenced.textures) expect(textures).toContain(url);
    });
});
