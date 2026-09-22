import * as THREE from 'three';

/**
 * The sampling policy for a canvas that carries type.
 *
 * WHY THIS EXISTS. Every surface on this desk that shows text rasterises it into
 * a 2D canvas and uploads that as a texture, and each one used to decide for
 * itself how the result should be tagged and filtered. The two paper strategies
 * held byte-identical copies of the same five-line helper, which is exactly how
 * the two of them ended up as the only canvases in the app missing `colorSpace`
 * while `screenStrategy`, `IdleScreen` and `partMesh` all set it. A policy that
 * is stated in six places is a policy that holds in five. Only one of those two
 * strategies is left — `sheetStrategy`, for the paper stack — so this module is
 * now both the single statement of the policy and its only caller, which is the
 * shape it should have had from the start.
 *
 * THE COLOUR SPACE IS THE PART THAT WAS ACTUALLY BROKEN, and it is worth writing
 * down why, because the failure is silent and looks like a different bug.
 *
 * A `CanvasTexture` is born `NoColorSpace`: three's `Texture` constructor
 * defaults its last argument that way, and `CanvasTexture` forwards nine
 * arguments to `super` without ever passing a tenth. `NoColorSpace` means "these
 * bytes are already linear — do not decode them". A 2D canvas does not write
 * linear bytes; it writes sRGB.
 *
 * The one end-to-end measurement anybody took was on a cream notebook stock this
 * desk no longer carries, and it is kept for exactly that reason: its `#2b2620`
 * ink was uploaded as linear 0.169 when the value it encodes is linear 0.024 —
 * seven times too bright — and `OutputPass` then encoded the frame to sRGB a
 * second time on the way out. The ink reached the glass at rgb(100, 92, 81) on
 * rgb(226, 224, 220): 4.4:1, against the 12.7:1 the stock was authored at. The
 * surviving `manuscript` stock has the same fault in the same direction and
 * slightly worse — `#1d2024` uploads as linear 0.114 against a true 0.012, nine
 * times over, on a stock authored at 15.7:1.
 *
 * Note what that is and is not. It is not blur — the glyphs sit exactly where
 * they were drawn, with sharp edges. It is a contrast collapse of about two
 * thirds, and type that pale reads as soft and indistinct no matter how well
 * resolved it is. It also flattened the paper stocks into each other: while
 * there were three, cream, laser white and grey all arrived within two levels of
 * the same neutral, which is why they stopped looking like three kinds of paper.
 * With one stock left that symptom has nowhere to show itself, and the tag is no
 * less required — the ink is still nine times too bright without it.
 *
 * THE FILTERING IS DELIBERATELY UNCHANGED from what the two helpers already did,
 * and must not be "simplified" into `generateMipmaps = false`. A page canvas is
 * minified for most of its life — through the whole camera approach, and at the
 * reading shot too — and sampling a minified texture with LinearFilter and no
 * mip chain is precisely the recipe for aliasing: shimmer and crawl on the type
 * as the sheet turns. The softness that once talked someone into disabling the
 * chain came from somewhere else, the canvas being allocated far larger than the
 * pixels it covers, which pushes mip selection up into blurrier levels;
 * scene/textureBudget.js fixes that at the source by sizing the canvas to its
 * measured footprint, so the chain can stay on and do its job. Turning it off
 * would also silently disable anisotropy — `WebGLTextures.js` bails out of
 * `texParameterf(TEXTURE_MAX_ANISOTROPY_EXT)` entirely unless `minFilter` is one
 * of the two `*MipmapLinearFilter` values — and anisotropy is what keeps the
 * near edge sharp on a flat sheet under a raised camera, which is every sheet
 * on this desk.
 *
 * @param {THREE.Texture} texture a canvas-backed texture carrying type
 * @param {number} anisotropy the renderer's real maximum; 1 disables it
 * @returns {THREE.Texture} the same texture, for use inline in a material
 */
export function applyTextTexturePolicy(texture, anisotropy = 1) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = anisotropy;
    return texture;
}
