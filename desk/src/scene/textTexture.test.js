import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyTextTexturePolicy } from './textTexture.js';

/**
 * These run in node with no DOM, so they exercise the policy against a plain
 * THREE.Texture rather than a real CanvasTexture. That is the whole reason the
 * policy is a function in its own module: as a private helper copied into two
 * strategies it could only be reached through `mount`, which needs a canvas,
 * which is why nothing ever guarded it and why the two copies drifted.
 */
describe('applyTextTexturePolicy', () => {
    it('tags the texture sRGB', () => {
        // THE ASSERTION THAT MATTERS, and the regression this module was written
        // for. An untagged canvas texture is treated as linear, so sRGB ink
        // bytes are uploaded ~7x too bright and OutputPass encodes them a second
        // time — the notebook's #2b2620 reached the glass at rgb(100, 92, 81),
        // collapsing the page from 12.7:1 to 4.4:1. Sharp, and unreadably pale.
        expect(applyTextTexturePolicy(new THREE.Texture()).colorSpace).toBe(THREE.SRGBColorSpace);
    });

    it('does not rely on the constructor default, which is NoColorSpace', () => {
        // Guards the assumption the bug rested on: three's Texture defaults its
        // colorSpace argument to NoColorSpace and CanvasTexture never passes
        // one. If a future three ever changed that, the tag here stays correct
        // and this test says why it is still needed.
        expect(new THREE.Texture().colorSpace).toBe(THREE.NoColorSpace);
        expect(new THREE.CanvasTexture(null).colorSpace).toBe(THREE.NoColorSpace);
    });

    it('keeps the mipmap chain, because anisotropy is silently dropped without it', () => {
        // three only calls texParameterf(TEXTURE_MAX_ANISOTROPY_EXT) when
        // minFilter is NearestMipmapLinear or LinearMipmapLinear. Setting
        // generateMipmaps = false here would disable anisotropic filtering
        // without touching the anisotropy value, which is the kind of change
        // that looks free in a diff.
        const texture = applyTextTexturePolicy(new THREE.Texture(), 16);
        expect(texture.generateMipmaps).toBe(true);
        expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
        expect(texture.magFilter).toBe(THREE.LinearFilter);
    });

    it('passes the renderer maximum through, and defaults to 1 rather than throwing', () => {
        expect(applyTextTexturePolicy(new THREE.Texture(), 16).anisotropy).toBe(16);
        expect(applyTextTexturePolicy(new THREE.Texture()).anisotropy).toBe(1);
    });

    it('returns the same texture, so it can wrap a constructor inline', () => {
        const texture = new THREE.Texture();
        expect(applyTextTexturePolicy(texture)).toBe(texture);
    });
});
