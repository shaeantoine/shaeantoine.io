import * as THREE from 'three';
import { drawLockScreen, drawGlass } from './screens.js';
import { SCREEN, VIEWFINDER_PX, drawOsScreen, screenKey, transitionFor, TRANSITION_MS } from './phoneos.js';
import { PHONE, mm } from './layout.js';
import { CAMERA_ROLL } from './copy.js';
import { context2d } from '../../core/draw.js';

/**
 * The phone's OS, running: which screen the Pixel shows, the slides between
 * screens, and the camera app's live viewfinder. Screens and hit areas are
 * phoneos.js's (DOM-free); this paints them onto the phone's screen canvas
 * (kit.js buildPhone) and drives the one live thing.
 *
 * Painting. The final state of a screen is painted through ctx.paint (so a
 * late font repaints it), content first and then the glass (screens.js
 * drawGlass: the panel's magenta / green / pink lines and the rounded
 * corners), which never moves. A transition paints the outgoing and incoming
 * screens once each into two offscreen canvases and then, per frame, only
 * blits them into the screen canvas at their offsets (+ the glass) — a few
 * drawImage calls and one texture upload a frame, for ≤ 300 ms. Nothing
 * animates at rest.
 *
 * The viewfinder. A 256 × 512 half-float (8-bit where the GPU can't render
 * half-float) WebGLRenderTarget of the room, seen
 * from the phone's rear camera (its own position and orientation, the phone
 * itself hidden for the shot), rendered straight through the renderer — not
 * the post-processing pipeline — and shown on a plane laid exactly over the
 * camera app's viewfinder rect. Linear, like the scene, so the composer's
 * output pass tone-maps it once with everything else. At most 10 frames a
 * second (a timer requests one; a tick renders it just before the room's
 * frame), and ONLY while the camera app is open: stopCamera() drops the timer
 * and the tick. Under ?still=1 or reduced motion it renders one frame and
 * holds it. The renderer's target, cube face, mip level and shadow flag are
 * restored after every shot. Where there is no renderer to do this (or it
 * throws), the app falls back to three photos from the camera roll.
 */

const VIEWFINDER_MS = 100;                  // ≤ 10 fps
const LIT = 1.12;                           // the lit screen's colour, lifted so ACES leaves it bright
/** The rear camera's lens, phone-local units: on the camera bar, near the top of the back. */
const LENS = new THREE.Vector3(0, mm(PHONE.length * 0.36), -mm(PHONE.back + 0.8));
const LENS_FOV = 64;                        // vertical, degrees (portrait)

function offscreen(surface) {
    const canvas = document.createElement('canvas');
    canvas.width = surface.canvas.width;
    canvas.height = surface.canvas.height;
    // The screen canvas's size, unless the canvas cap refused it (core/draw.js
    // context2d shrinks it in place): the transform is read after, and blit
    // stretches a smaller buffer back over the screen.
    const g = context2d(canvas, { label: 'phone transition buffer' });
    g.setTransform(canvas.width / surface.width, 0, 0, canvas.height / surface.height, 0, 0);
    return { canvas, g };
}

/**
 * A transition buffer onto the screen canvas at (x, y). At its own size — the
 * three-argument drawImage, as it always was — when it is the screen's size,
 * which is every time but a refused one; else scaled to the screen's.
 */
function blit(g, source, x, y, cw, ch) {
    if (source.width === cw && source.height === ch) g.drawImage(source, x, y);
    else g.drawImage(source, x, y, cw, ch);
}

function clearCanvas({ canvas, g }) {
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.restore();
}

export function createPhoneOs(ctx) {
    const art = { palette: ctx.palette, draw: ctx.draw, fonts: ctx.fonts, rng: ctx.rng, drawNote: ctx.drawNote };
    let phone = null;
    let current = { kind: 'off' };
    let token = 0;
    let anim = null;
    let buffers = null;                     // { a, b } offscreen canvases, per phone
    let photos = null;                      // the camera roll, once asked for
    const cam = { rt: null, camera: null, stopTimer: null, removeTick: null, want: false, running: false, failed: false, frames: 0, session: 0 };

    // -------------------------------------------------------------------
    // Screens
    // -------------------------------------------------------------------

    function liveCapable() {
        if (cam.failed || !phone?.viewfinder) return false;
        const renderer = ctx.deskScene?.renderer;
        return Boolean(renderer && typeof renderer.render === 'function'
            && typeof renderer.setRenderTarget === 'function' && typeof renderer.getRenderTarget === 'function');
    }

    function ensurePhotos() {
        if (photos) return;
        photos = [null, null, null];
        const loads = CAMERA_ROLL.map((name, i) => Promise.resolve(ctx.media(name)).then((image) => { photos[i] = image; }, () => {}));
        ctx.track(Promise.all(loads).then(() => {
            if (current.kind === 'app' && current.app === 'camera' && current.camera === 'gallery' && !anim) paintFinal();
        }), 'bench: camera roll');
    }

    /** Fills in what the OS decides itself: the camera's mode (and its photos). */
    function describe(screen) {
        const next = { ...screen };
        if (next.kind === 'app' && next.app === 'camera') {
            next.camera = liveCapable() ? 'live' : 'gallery';
            if (next.camera === 'gallery') {
                ensurePhotos();
                next.photos = photos;
            }
        }
        return next;
    }

    function paintContent(g, screen) {
        const withClock = { ...screen, date: ctx.now() };
        if (screen.kind === 'off' || screen.kind === 'lock') {
            return drawLockScreen(g, SCREEN.w, SCREEN.h, { on: screen.kind === 'lock', date: withClock.date, glass: false }, art);
        }
        return drawOsScreen(g, SCREEN.w, SCREEN.h, withClock, art);
    }

    function setLit() {
        phone?.screenMaterial?.color.setScalar(current.kind === 'off' ? 1 : LIT);
    }

    /** The current screen, settled: content, then the glass. Repaints itself if a font lands late. */
    function paintFinal() {
        if (!phone) return;
        const mine = ++token;
        const target = phone;
        const screen = current;
        (ctx.paint ?? ctx.fonts.paint)(() => {
            if (mine !== token || target !== phone) return; // superseded
            const { surface, texture } = target.screen;
            surface.clear();
            target.screen.info = paintContent(surface.g, screen) ?? null;
            if (screen.kind !== 'off') drawGlass(surface.g, SCREEN.w, SCREEN.h);
            texture.needsUpdate = true;
        });
        setLit();
        ctx.invalidate();
    }

    /** One frame of a transition: `a` (outgoing) and `b` (incoming) at progress e, then the glass. */
    function compose(kind, e, a, b) {
        const { surface, texture } = phone.screen;
        const g = surface.g;
        const cw = surface.canvas.width;
        const ch = surface.canvas.height;
        g.save();
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalAlpha = 1;
        g.fillStyle = '#000000';
        g.fillRect(0, 0, cw, ch);
        if (kind === 'unlock') {
            // The lock screen swipes up and away; the launcher rises a little into place under it.
            g.globalAlpha = 0.35 + 0.65 * e;
            blit(g, b.canvas, 0, Math.round((1 - e) * ch * 0.05), cw, ch);
            g.globalAlpha = 1 - 0.35 * e;
            blit(g, a.canvas, 0, -Math.round(e * ch), cw, ch);
        } else if (kind === 'push') {
            g.globalAlpha = 1 - 0.6 * e;
            blit(g, a.canvas, -Math.round(e * cw * 0.3), 0, cw, ch);
            g.globalAlpha = 1;
            blit(g, b.canvas, Math.round((1 - e) * cw), 0, cw, ch);
        } else if (kind === 'pop') {
            g.globalAlpha = 0.4 + 0.6 * e;
            blit(g, b.canvas, -Math.round((1 - e) * cw * 0.3), 0, cw, ch);
            g.globalAlpha = 1;
            blit(g, a.canvas, Math.round(e * cw), 0, cw, ch);
        } else {
            blit(g, a.canvas, 0, 0, cw, ch);
            g.globalAlpha = e;
            blit(g, b.canvas, 0, 0, cw, ch);
        }
        g.restore();
        drawGlass(g, SCREEN.w, SCREEN.h);
        texture.needsUpdate = true;
    }

    /**
     * Show `screen` ({ kind, app?, revealed?, logging? }), sliding from what is
     * there unless `instant`. Resolves true once it has landed (false if a
     * later show() superseded it).
     */
    function show(screen, { instant = false } = {}) {
        const target = describe(screen);
        const previous = current;
        const same = screenKey(previous) === screenKey(target);
        current = target;
        if (!phone) return Promise.resolve(true);
        if (same) {
            if (anim) return anim.then(() => true);
            return Promise.resolve(true);
        }
        const running = anim;
        anim = null;
        running?.cancel?.();
        const kind = transitionFor(previous, target);
        if (instant || kind === 'none') {
            paintFinal();
            return Promise.resolve(true);
        }
        const mine = ++token;
        try {
            if (!buffers || buffers.phone !== phone) buffers = { phone, a: offscreen(phone.screen.surface), b: offscreen(phone.screen.surface) };
            clearCanvas(buffers.a);
            clearCanvas(buffers.b);
            paintContent(buffers.a.g, previous);
            paintContent(buffers.b.g, target);
        } catch (error) {
            ctx.warn('phone transition failed to prepare; landing without it', error);
            paintFinal();
            return Promise.resolve(true);
        }
        setLit();
        const { a, b } = buffers;
        const run = ctx.motion.animate({
            from: 0, to: 1, duration: TRANSITION_MS[kind], easing: ctx.motion.easings.outCubic,
            movesGeometry: false, instant: false,
            onUpdate: (e) => compose(kind, e, a, b)
        });
        anim = run;
        return run.then((done) => {
            if (anim === run) anim = null;
            if (done && mine === token) paintFinal();
            return done;
        });
    }

    /** Repaint what is showing (the clock turned a minute). Never mid-transition. */
    function refresh() {
        if (anim || current.kind === 'off') return;
        paintFinal();
    }

    /** A new phone (the Pixel landed after the slab): take the screen over to it. */
    function attach(next) {
        const wasRunning = cam.running;
        stopCamera();
        const running = anim;
        anim = null;
        running?.cancel?.();
        phone = next;
        buffers = null;
        if (current.kind === 'app' && current.app === 'camera') current = describe(current);
        paintFinal();
        if (wasRunning) startCamera();
    }

    // -------------------------------------------------------------------
    // The viewfinder
    // -------------------------------------------------------------------

    function fail(error) {
        ctx.warn('the live viewfinder failed; the camera shows the camera roll instead', error);
        cam.failed = true;
        stopCamera();
        if (current.kind === 'app' && current.app === 'camera') {
            current = describe(current);
            paintFinal();
        }
    }

    function renderViewfinder() {
        if (!cam.running || !phone) return;
        const renderer = ctx.deskScene.renderer;
        const pivot = phone.pivot;
        try {
            pivot.updateWorldMatrix(true, false);
            const camera = cam.camera;
            camera.position.copy(LENS).applyMatrix4(pivot.matrixWorld);
            pivot.getWorldQuaternion(camera.quaternion); // a camera looks down its -Z: the phone's back
            camera.updateMatrixWorld(true);
            const previous = renderer.getRenderTarget();
            const face = renderer.getActiveCubeFace?.() ?? 0;
            const level = renderer.getActiveMipmapLevel?.() ?? 0;
            const shadows = renderer.shadowMap?.needsUpdate;
            const visible = pivot.visible;
            pivot.visible = false;
            try {
                if (renderer.shadowMap) renderer.shadowMap.needsUpdate = false; // reuse the room's shadow maps
                renderer.setRenderTarget(cam.rt);
                renderer.clear?.();
                renderer.render(ctx.scene, camera);
            } finally {
                renderer.setRenderTarget(previous, face, level);
                pivot.visible = visible;
                if (renderer.shadowMap) renderer.shadowMap.needsUpdate = shadows;
            }
            cam.frames += 1;
        } catch (error) {
            fail(error);
        }
    }

    function startCamera() {
        if (cam.running) return true;
        if (!(current.kind === 'app' && current.app === 'camera' && current.camera === 'live') || !liveCapable()) return false;
        try {
            // Half-float where the GPU can render to it (as renderPipeline.js asks); 8-bit otherwise.
            const renderer = ctx.deskScene.renderer;
            const halfFloat = Boolean(renderer.extensions?.has?.('EXT_color_buffer_float') ?? renderer.extensions?.get?.('EXT_color_buffer_float'));
            cam.rt ??= new THREE.WebGLRenderTarget(VIEWFINDER_PX.w, VIEWFINDER_PX.h, { type: halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: true });
            cam.camera ??= new THREE.PerspectiveCamera(LENS_FOV, VIEWFINDER_PX.w / VIEWFINDER_PX.h, 0.02, 60);
        } catch (error) {
            fail(error);
            return false;
        }
        const viewfinder = phone.viewfinder;
        viewfinder.material.map = cam.rt.texture;
        viewfinder.material.needsUpdate = true;
        viewfinder.visible = true;
        cam.running = true;
        cam.want = false;
        cam.removeTick = ctx.addTick(() => {
            if (cam.want) {
                cam.want = false;
                renderViewfinder();
            }
            return false; // never holds the loop: the timer asks for each frame
        });
        if (!ctx.still && !ctx.reducedMotion) {
            cam.stopTimer = ctx.every(VIEWFINDER_MS, () => {
                cam.want = true;
                ctx.invalidate();
            });
        }
        // The first shot (the only one under ?still=1) waits for one room frame:
        // that frame rebuilds any shadow maps the phone's move dirtied, and the
        // shot reuses them — so a still never holds a stale shadow.
        const session = ++cam.session;
        const first = Promise.resolve(ctx.deskScene.whenDrawn?.()).then(() => {
            if (!cam.running || cam.session !== session) return;
            cam.want = true;
            ctx.invalidate();
        });
        ctx.track(first, 'bench: first viewfinder frame');
        return true;
    }

    function stopCamera() {
        cam.stopTimer?.();
        cam.stopTimer = null;
        cam.removeTick?.();
        cam.removeTick = null;
        cam.want = false;
        if (phone?.viewfinder) phone.viewfinder.visible = false;
        if (cam.running) {
            cam.running = false;
            ctx.invalidate();
        }
    }

    return {
        show,
        refresh,
        attach,
        startCamera,
        stopCamera,
        /** The screen showing (or landing). */
        screen: () => current,
        busy: () => Boolean(anim),
        camera: () => ({ running: cam.running, frames: cam.frames, timer: Boolean(cam.stopTimer), tick: Boolean(cam.removeTick), mode: current.camera ?? null, failed: cam.failed })
    };
}
