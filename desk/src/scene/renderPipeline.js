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
function targetOptions(renderer) {
    const gl = renderer.getContext();
    const canRenderHalfFloat = Boolean(renderer.extensions.get('EXT_color_buffer_float'));
    if (!canRenderHalfFloat) {
        console.warn('[renderPipeline] No EXT_color_buffer_float — falling back to an 8-bit intermediate buffer; highlights will clip rather than roll off.');
    }
    return {
        type: canRenderHalfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
        samples: Math.min(MSAA_SAMPLES, gl.getParameter(gl.MAX_SAMPLES) ?? MSAA_SAMPLES)
    };
}

/**
 * GTAO costs a full-screen depth+normal prepass plus the AO and denoise passes
 * every frame. THE_DESK_DESIGN.md calls baked lighting "the single biggest
 * performance lever for keeping the desk usable on mid-range hardware", so
 * this stays a one-line kill switch: set false and the composer renders the
 * scene straight through to output, keeping tone mapping and MSAA but dropping
 * the contact occlusion.
 */
const AMBIENT_OCCLUSION_ENABLED = true;

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
 */
export function createRenderPipeline(renderer, scene, camera) {
    const size = renderer.getSize(new THREE.Vector2());

    const renderTarget = new THREE.WebGLRenderTarget(size.x, size.y, targetOptions(renderer));

    const composer = new EffectComposer(renderer, renderTarget);
    composer.addPass(new RenderPass(scene, camera));

    let gtaoPass = null;
    if (AMBIENT_OCCLUSION_ENABLED) {
        gtaoPass = new GTAOPass(scene, camera, size.x, size.y);
        gtaoPass.output = GTAOPass.OUTPUT.Default;
        gtaoPass.updateGtaoMaterial(AO_PARAMETERS);
        gtaoPass.updatePdMaterial(DENOISE_PARAMETERS);
        composer.addPass(gtaoPass);
    }

    composer.addPass(new OutputPass());

    return {
        /** Set GTAOPass.OUTPUT.AO while tuning to see the raw occlusion buffer. */
        gtaoPass,
        render() {
            composer.render();
        },
        setSize(width, height, pixelRatio) {
            composer.setPixelRatio(pixelRatio);
            composer.setSize(width, height);
        },
        dispose() {
            // Disposes renderTarget1/2 too — renderTarget1 is the target
            // handed in above, and renderTarget2 is its clone.
            composer.dispose();
        }
    };
}
