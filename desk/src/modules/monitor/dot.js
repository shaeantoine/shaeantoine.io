/**
 * The dot's light: the textures for the glowing dot and its trail.
 *
 * The dot is one additive quad on the screen (GLOW_EXTENT radii each way). Its
 * texture is the light's whole radial profile — a warm amber core, a red body
 * that ends at DOT_RADIUS, and a soft halo that has faded into the screen by
 * ~2.5 radii — stored as linear light divided by DOT_PEAK, so the material's
 * colour (DOT_PEAK, > 1) puts the core back above white and ACES rolls it off
 * like a real highlight. The composer's buffer is HalfFloat
 * (renderPipeline.js), so nothing clamps on the way.
 *
 * DOT_PROFILE is linear light ADDED on top of the screen's field, one entry per
 * 0.1 radii, solved in node against three's ACESFilmic curve (exposure 1.0)
 * over the field colour so that the eye sees, on screen:
 *
 *    r (radii)  0.0          0.3         0.6        0.9         1.2        1.6       2.0       2.5
 *    sRGB       255 214 150  250 150 84  228 74 52  184 44 45   104 43 40  71 42 39  56 42 38  49 42 38   (field 46 42 38)
 *
 * i.e. a point of light, not a sticker. The red has nowhere to hide on a dark
 * screen: G and B stop contributing inside the body, so the halo is pure red
 * light on warm glass.
 */

export const DOT_PEAK = 2.45;

/** Linear light per channel at r = 0, 0.1, 0.2 … radii (missing entries are 0). */
export const DOT_PROFILE = Object.freeze({
    r: [2.450, 2.025, 1.564, 1.212, 0.944, 0.784, 0.671, 0.565, 0.463, 0.354,
        0.231, 0.143, 0.100, 0.076, 0.057, 0.046, 0.037, 0.028, 0.024, 0.019,
        0.015, 0.012, 0.010, 0.008, 0.007, 0.005, 0.004, 0.003, 0.002, 0.001, 0],
    g: [0.576, 0.429, 0.276, 0.154, 0.084, 0.044, 0.021, 0.010, 0.003, 0],
    b: [0.099, 0.081, 0.056, 0.021, 0.005, 0]
});

/** The embers the trail is made of: a soft gaussian of red light, no core. Linear tint. */
export const EMBER_TINT = Object.freeze([1, 0.2, 0.07]);

function sampleTable(table, r) {
    const x = r * 10;
    const i = Math.floor(x);
    if (i >= table.length - 1) return table[table.length - 1] ?? 0;
    const a = table[i];
    const b = table[i + 1] ?? 0;
    return a + (b - a) * (x - i);
}

/** Linear light the dot adds at `r` radii from its centre, [r, g, b]. DOM-free, for node checks. */
export function dotLight(r) {
    return [sampleTable(DOT_PROFILE.r, r), sampleTable(DOT_PROFILE.g, r), sampleTable(DOT_PROFILE.b, r)];
}

const toSrgbByte = (v) => {
    const c = Math.min(1, Math.max(0, v));
    return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
};

/** A size x size canvas whose pixel at distance ρ (0..1 of the half-size) from the centre is `light(ρ)` (linear, 0..1), sRGB-encoded. */
function radialCanvas(size, light) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const g = canvas.getContext('2d');
    const image = g.createImageData(size, size);
    const half = size / 2;
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const rho = Math.hypot(x + 0.5 - half, y + 0.5 - half) / half;
            const [r, gg, b] = rho >= 1 ? [0, 0, 0] : light(rho);
            const i = (y * size + x) * 4;
            image.data[i] = toSrgbByte(r);
            image.data[i + 1] = toSrgbByte(gg);
            image.data[i + 2] = toSrgbByte(b);
            image.data[i + 3] = 255;
        }
    }
    g.putImageData(image, 0, 0);
    return canvas;
}

/** The dot: its profile out to `extent` radii, normalised by DOT_PEAK. */
export function glowTexture(ctx, extent) {
    const canvas = radialCanvas(256, (rho) => dotLight(rho * extent).map((v) => v / DOT_PEAK));
    return ctx.canvasTexture(canvas);
}

/** One ember: exp(-(r/w)²), its quad reaching `extent` widths. Peak 1 (in the red). */
export function emberTexture(ctx, extent) {
    const canvas = radialCanvas(64, (rho) => {
        const k = Math.exp(-((rho * extent) ** 2));
        return EMBER_TINT.map((c) => c * k);
    });
    return ctx.canvasTexture(canvas);
}
