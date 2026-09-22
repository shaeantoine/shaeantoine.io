import * as THREE from 'three';
import { tween, easeInOutCubic } from '../../scene/tween.js';
import { createScreenCanvas, createMeasurer, drawScreen } from './screenCanvas.js';

const TRANSITION_MS = 240;

/**
 * In-place "screen content changes" — no positional movement, just a
 * material opacity crossfade dipping through black, with the same canvas
 * redrawn underneath at the midpoint (see screenCanvas.js for the actual
 * project readout).
 */
export function createScreenStrategy() {
    let group = null;
    let mesh = null;
    let canvas = null;
    let measureWidth = null;
    let redrawnForTransition = false;

    function mount(parentGroup, anchor, firstWork, { bufferHeight = 0 } = {}) {
        group = parentGroup;
        measureWidth = createMeasurer();

        const aspect = anchor.size[0] / anchor.size[1];
        canvas = createScreenCanvas(aspect, { framing: anchor.framing, bufferHeight });
        drawScreen(canvas, firstWork, measureWidth);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        // The screen is viewed at a steep, oblique angle (see the focus
        // camera's offset) — the texture gets minified far more in one
        // direction than the other, which plain bilinear filtering can't
        // represent and reads as soft/blurry. Anisotropic filtering is the
        // real fix for that, and it only kicks in with mipmaps enabled, so
        // this keeps the (default) mipmap chain rather than disabling it.
        texture.anisotropy = 16; // clamped internally to the GPU's real max
        // `toneMapped: false` IS INERT, HERE AND EVERYWHERE ELSE IN THIS APP,
        // and the note that used to carry this explanation said otherwise. three
        // only consults `material.toneMapped` when it is rendering straight to
        // the canvas — WebGLRenderer.js gates on `_currentRenderTarget === null`
        // — and scene/renderPipeline.js always renders through an
        // EffectComposer, so a target is always bound and no material tone maps.
        // OutputPass then applies `renderer.toneMapping` to the whole composited
        // frame, type included. The flag is left on for the day this stops going
        // through a composer; it is not what keeps text out of the curve,
        // because nothing does.
        //
        // THIS PANEL IS THE SURFACE THE CURVE COSTS MOST, which is why the full
        // version of the argument lives here: #FAFAFA reaches the glass at 212
        // under ACES, so the "display" is a grey rectangle rather than a white
        // one. sheetStrategy.js and scene/IdleScreen.js set the same flag for the
        // same non-reason and point back at this note.
        mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(...anchor.size),
            new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
        );
        mesh.position.set(...anchor.position);
        if (anchor.rotation) mesh.rotation.set(...anchor.rotation);
        group.add(mesh);
    }

    function transitionTo(nextWork) {
        return new Promise((resolve) => {
            redrawnForTransition = false;
            tween({
                from: { t: 0 },
                to: { t: 1 },
                duration: TRANSITION_MS,
                easing: easeInOutCubic,
                onUpdate({ t }) {
                    // dip through black at the midpoint, then reveal the redrawn canvas
                    mesh.material.opacity = t < 0.5 ? 1 - t * 2 : (t - 0.5) * 2;
                    mesh.material.transparent = true;
                    if (t >= 0.5 && !redrawnForTransition) {
                        drawScreen(canvas, nextWork, measureWidth);
                        mesh.material.map.needsUpdate = true;
                        redrawnForTransition = true;
                    }
                },
                onComplete() {
                    mesh.material.opacity = 1;
                    resolve();
                }
            });
        });
    }

    function unmount() {
        if (!mesh) return;
        group.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.map?.dispose();
        mesh.material.dispose();
        mesh = null;
        group = null;
        canvas = null;
    }

    return { mount, transitionTo, unmount };
}
