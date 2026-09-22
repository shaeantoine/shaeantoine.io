import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { UNITS_PER_METER } from './surfaces.js';

// Ground-truth ambient occlusion is what makes an object look like it is
// sitting *in* the room rather than pasted on top of it: the darkening where
// the desk legs meet the carpet, in the gap under the monitor stand, in the
// seam between the skirting and the floor. Shadow maps can't produce this —
// they only handle direct light from the sun, and every one of those contacts
// is occluding *ambient* light from the environment map.
const AO_PARAMETERS = {
    // GTAO's radius is in world units, so it has to be derived from the scene
    // scale rather than hardcoded: ~0.16 m is the distance over which real
    // ambient occlusion is actually visible around a contact point.
    //
    // Being in WORLD units is also what makes AO_RESOLUTION_SCALE below safe to
    // change: with `screenSpaceRadius: false` the occlusion sweep covers the
    // same slice of the room whatever resolution it is evaluated at, so a
    // half-resolution AO buffer is the same picture sampled more coarsely, not
    // a different and tighter effect.
    radius: 0.16 * UNITS_PER_METER,
    distanceExponent: 1,
    thickness: 1,
    scale: 1.1,
    samples: 16,
    distanceFallOff: 1,
    screenSpaceRadius: false
};

// Poisson denoise applied to the raw AO buffer. Without it 16 samples reads as
// visible noise crawling across the carpet as the camera dollies.
//
// `radius` here IS in pixels, unlike the AO radius above, so it tracks
// AO_RESOLUTION_SCALE rather than being independent of it: at half resolution
// these 4 pixels reach as far across the image as 8 would at full. That is
// wider blur than was tuned for, and it is left alone deliberately — the extra
// smoothing is doing useful work covering the coarser sampling underneath it,
// and AO at this radius carries no detail fine enough to lose.
const DENOISE_PARAMETERS = {
    lumaPhi: 10,
    depthPhi: 2,
    normalPhi: 3,
    radius: 4,
    radiusExponent: 1,
    rings: 2,
    samples: 16
};

const MSAA_SAMPLES = 4;

/**
 * The fraction of the drawing buffer's linear dimensions that AO is evaluated
 * at.
 *
 * THE SINGLE LARGEST FRAME-TIME LEVER IN THIS FILE, and it is nearly free
 * visually. At 1.0 every rendered frame paid for, at full resolution: a second
 * complete pass over the scene's geometry (GTAOPass renders the whole scene
 * again with MeshNormalMaterial to build its depth/normal G-buffer), 16
 * occlusion samples per pixel, and 16 denoise taps per pixel. On a 5.7 MP
 * buffer — a 14" MacBook Pro at DPR 2, which does not even reach the area
 * budget in DeskScene — that is some 180 million dependent texture fetches per
 * frame, on top of rasterising every triangle in the room twice.
 *
 * At 0.5 all three of those shrink by 4x. What is given up is much less than
 * that ratio suggests, because ambient occlusion is a low-frequency signal:
 * it is a soft darkening that spans tens of pixels, it is then Poisson-denoised
 * (which is itself a blur), and it is finally composited by sampling the AO
 * buffer bilinearly over the full-resolution frame. Evaluating a blurry thing
 * at half resolution and smoothly upsampling it is close to the definition of a
 * free optimisation, and half-resolution AO is the ordinary choice in
 * real-time renderers for exactly this reason.
 *
 * WHAT IT DOES COST, so it is not discovered as a mystery later: the upsample
 * is plain bilinear rather than depth-aware, so at a hard depth discontinuity
 * — the silhouette of the monitor against the wall behind it — occlusion can
 * bleed by a pixel or two across the edge. On this scene the contacts that
 * matter are all shallow (objects resting ON surfaces, where the two sides of
 * the edge are at nearly the same depth), which is the case bilinear handles
 * cleanly. Raise this toward 1.0 if halos ever do become visible; the cost
 * scales with its square.
 */
export const AO_RESOLUTION_SCALE = 0.5;

/**
 * GTAOPass with its internal buffers decoupled from the frame's resolution.
 *
 * Everything the pass allocates and evaluates per pixel — the normal/depth
 * G-buffer, the AO buffer, the denoised AO buffer — is sized by `setSize`, so
 * scaling what is handed to `super.setSize` scales the entire expensive half of
 * the pass. What is NOT scaled is the pass's output: the final copy and blend
 * in `GTAOPass.render` draw into the composer's `writeBuffer`, whose size this
 * class never touches, so the frame stays full resolution and the AO buffer is
 * upsampled into it by the blend's own texture fetch.
 *
 * Subclassing rather than reaching into the instance because `setSize` is
 * called by EffectComposer on every resize, so the scaling has to live
 * somewhere that intercepts it rather than being applied once at construction.
 */
class ScaledGTAOPass extends GTAOPass {
    constructor(scene, camera, width, height, scale) {
        super(scene, camera, Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
        this.aoScale = scale;
    }

    setSize(width, height) {
        // Held so setAoScale can re-apply a new scale without the caller having
        // to know the frame's dimensions.
        this.frameWidth = width;
        this.frameHeight = height;
        super.setSize(
            Math.max(1, Math.round(width * this.aoScale)),
            Math.max(1, Math.round(height * this.aoScale))
        );
    }

    setAoScale(scale) {
        if (scale === this.aoScale) return;
        this.aoScale = scale;
        if (this.frameWidth) this.setSize(this.frameWidth, this.frameHeight);
    }
}

/**
 * Picks the intermediate buffer's format, and clamps its sample count to what
 * the driver will actually give us.
 *
 * BOTH OF THESE ARE SAFARI PROBLEMS, and both fail quietly rather than loudly.
 *
 * HalfFloat is what the ACES curve needs — an 8-bit intermediate would clamp
 * the scene to 0..1 *before* tone mapping and throw away exactly the highlight
 * range the curve exists to roll off. But rendering into a half-float target is
 * conditional on EXT_color_buffer_float in WebGL2, and a browser without it
 * does not throw: it produces an incomplete framebuffer and whatever that
 * happens to sample as. Falling back to 8-bit loses highlight rolloff and keeps
 * a picture, which is the right way round.
 *
 * `samples` has the same shape of problem. three clamps to MAX_SAMPLES
 * internally, but asking for more than the driver offers on a float target is
 * the specific combination WebKit has historically been worst at, so this reads
 * the real number rather than trusting 4 to be available.
 */
function bufferType(renderer) {
    const canRenderHalfFloat = Boolean(renderer.extensions.get('EXT_color_buffer_float'));
    if (!canRenderHalfFloat) {
        console.warn('[renderPipeline] No EXT_color_buffer_float — falling back to an 8-bit intermediate buffer; highlights will clip rather than roll off.');
    }
    return canRenderHalfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
}

function affordableSamples(renderer) {
    const gl = renderer.getContext();
    return Math.min(MSAA_SAMPLES, gl.getParameter(gl.MAX_SAMPLES) ?? MSAA_SAMPLES);
}

/**
 * Wraps the renderer in an EffectComposer that inserts a GTAO pass between the
 * scene render and output.
 *
 * The detail that is easy to get wrong here: `renderer.antialias` does nothing
 * once we render through a composer, since the canvas's own multisampled buffer
 * is no longer the render destination. MSAA has to be requested on the
 * composer's target instead — which is why DeskScene constructs the renderer
 * with `antialias: false`.
 *
 * OutputPass is what applies `renderer.toneMapping` and the sRGB conversion, so
 * those stay configured on the renderer and are picked up from there.
 *
 * ONLY ONE OF THE TWO COMPOSER TARGETS IS MULTISAMPLED, and this is worth the
 * paragraph because it is a large, invisible saving that the obvious reading of
 * the code argues against.
 *
 * EffectComposer keeps two same-sized targets and ping-pongs between them, and
 * it builds the second by *cloning* the one handed in — and `RenderTarget.copy`
 * copies `samples` along with everything else. So passing in a 4x multisampled
 * target silently allocates two of them. A multisampled half-float target costs
 * its resolve texture plus four times that again for the multisample
 * renderbuffer: on a 5.7 MP frame, 229 MB each, 458 MB for the pair.
 *
 * Only one of them ever needs it. MSAA only does anything for a target that
 * geometry is rasterised into, and exactly one pass in this chain rasterises
 * geometry — RenderPass. Every other pass is a full-screen quad, where
 * multisampling has nothing to antialias and costs a resolve. So the target
 * RenderPass draws into is multisampled and the other is not, which hands back
 * ~183 MB on that same 5.7 MP frame with no change to the image at all.
 *
 * WHICH of the two that is takes some care, and is the reason for the explicit
 * reset in `render` below. RenderPass is unusual among passes: it has
 * `needsSwap = false` and it renders into `readBuffer`, not `writeBuffer`. With
 * the chain below that works out to renderTarget2, and because the frame
 * performs an even number of swaps it lands back where it started and the
 * assignment is stable frame to frame. But that is a property of *this* pass
 * list: disabling the GTAO pass removes one swap, the parity flips, and the
 * scene would start alternating between the two targets — rendering geometry
 * into the un-multisampled one on every other frame, which would read as
 * aliased edges flickering on and off. Since `setAmbientOcclusionEnabled` makes
 * exactly that happen at runtime, the buffers are pinned at the top of every
 * frame instead of being left to work out. It costs two assignments and makes
 * the invariant true by construction rather than by counting.
 */
export function createRenderPipeline(renderer, scene, camera, { aoScale = AO_RESOLUTION_SCALE } = {}) {
    const size = renderer.getSize(new THREE.Vector2());
    const type = bufferType(renderer);
    const samples = affordableSamples(renderer);

    // Constructed WITHOUT multisampling, so that the clone EffectComposer makes
    // of it is un-multisampled too; the one that needs it is upgraded below.
    const renderTarget = new THREE.WebGLRenderTarget(size.x, size.y, { type, samples: 0 });

    const composer = new EffectComposer(renderer, renderTarget);
    // renderTarget2 is the one RenderPass draws into — see the note above, and
    // the reset in render() that keeps it that way. Assigning `samples` after
    // construction is safe because nothing has been rendered yet, so the target
    // has no GPU-side allocation to invalidate.
    composer.renderTarget2.samples = samples;

    composer.addPass(new RenderPass(scene, camera));

    const gtaoPass = new ScaledGTAOPass(scene, camera, size.x, size.y, aoScale);
    gtaoPass.output = GTAOPass.OUTPUT.Default;
    gtaoPass.updateGtaoMaterial(AO_PARAMETERS);
    gtaoPass.updatePdMaterial(DENOISE_PARAMETERS);
    composer.addPass(gtaoPass);

    composer.addPass(new OutputPass());

    return {
        /** Set GTAOPass.OUTPUT.AO while tuning to see the raw occlusion buffer. */
        gtaoPass,
        render() {
            // The invariant the single-multisampled-target saving rests on.
            // See the long note above: this pins RenderPass's destination to
            // renderTarget2 regardless of how many passes are enabled, rather
            // than relying on the swap count happening to be even.
            composer.writeBuffer = composer.renderTarget1;
            composer.readBuffer = composer.renderTarget2;
            composer.render();
        },
        setSize(width, height, pixelRatio) {
            composer.setPixelRatio(pixelRatio);
            composer.setSize(width, height);
        },
        /**
         * The one-line kill switch THE_DESK_DESIGN.md asks for, now reachable
         * at runtime so scene/perfMonitor.js can take it on a machine that
         * cannot afford the pass. Disabling it drops the contact occlusion and
         * keeps tone mapping and MSAA.
         */
        setAmbientOcclusionEnabled(enabled) {
            gtaoPass.enabled = enabled;
        },
        isAmbientOcclusionEnabled: () => gtaoPass.enabled,
        /** @see AO_RESOLUTION_SCALE. Reallocates the pass's buffers. */
        setAoScale(scale) {
            gtaoPass.setAoScale(scale);
        },
        getAoScale: () => gtaoPass.aoScale,
        dispose() {
            // Disposes renderTarget1/2 too — renderTarget1 is the target
            // handed in above, and renderTarget2 is its clone.
            composer.dispose();
        }
    };
}
