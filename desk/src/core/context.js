import * as THREE from 'three';
import { invalidate, invalidateShadows } from '../scene/renderScheduler.js';
import { projectToScreenRect } from '../scene/projectToScreenRect.js';
import { still, film, deterministic, reducedMotion, instant, now } from './flags.js';
import { palette } from './palette.js';
import { fonts } from './fonts.js';
import { motion } from './motion.js';
import { media, mediaUrl, mediaTexture } from './media.js';
import { track } from './track.js';
import { rng } from './rng.js';
import { draw, makeCanvas, canvasTexture, drawText, drawHandwriting, fitText, fitHandwriting, drawNote, paint } from './draw.js';
import { visit } from './visit.js';
import { hint, live, overlay, addButton, setCursor } from './dom.js';
import { paperSheet, setPaperFace, FACE_UP, stickyMaterial, stickyLift, STICKY_LIGHT } from './paper.js';
import {
    poseInFront as poseInFrontPure, frameReport, makeCamera, frameHeightAt, distanceForFraction,
    fitShot, orbitShot, orientedBox, UNITS_PER_METRE, mm, cm, ESTABLISHING, establishingShot
} from './framing.js';

/**
 * A scheduler tick that cannot take the frame loop down: the scheduler runs
 * ticks before it renders, so one that throws every frame would freeze the
 * room. Logged, and removed after the third throw.
 */
function wrapTick(deskScene, label, fn) {
    let failures = 0;
    let remove = null;
    remove = deskScene.addTick((dt) => {
        try {
            return fn(dt) === true;
        } catch (error) {
            failures += 1;
            console.error(`[desk:${label}] tick threw (${failures}/3)`, error);
            if (failures >= 3) remove?.();
            return false;
        }
    });
    return remove;
}

/**
 * Builds `ctx`, the one object every module is handed. Shared by all modules;
 * each gets a thin per-module view (moduleId, log, warn) over it — see
 * `forModule`. Signatures are noted beside each entry below, or in the core
 * file it comes from.
 */
export function createContext({ deskScene, camera, navigate, currentRoute }) {
    const threeCamera = deskScene.camera;
    const anisotropy = deskScene.maxAnisotropy ?? 1;
    const raycaster = new THREE.Raycaster();
    const ndcVector = new THREE.Vector2();

    const ctx = {
        THREE,
        deskScene,
        scene: deskScene.scene,
        camera,

        /**
         * poseInFront(cameraPose = camera.finalPose(), options) — the "in hand"
         * pose. Aspect and fov default to the live viewport's. See framing.js.
         */
        poseInFront(cameraPose, options = {}) {
            return poseInFrontPure(cameraPose ?? camera.finalPose(), {
                aspect: threeCamera.aspect,
                fov: threeCamera.fov,
                ...options
            });
        },

        frame: {
            /** Where `target` (Object3D | Box3 | points) lands: through the live camera, or a hypothetical `pose`. */
            report(target, { pose, aspect } = {}) {
                const cam = pose ? makeCamera(pose, aspect ?? threeCamera.aspect, threeCamera.fov) : threeCamera;
                return frameReport(target, cam);
            },
            heightAt: (distance) => frameHeightAt(distance, threeCamera.fov),
            distanceForFraction: (height, fraction) => distanceForFraction(height, fraction, threeCamera.fov),
            /** framing.fitShot at the live aspect: the closest orbit shot where `target` fills `fill` of the height. */
            fit: (target, options = {}) => fitShot(target, { aspect: threeCamera.aspect, fov: threeCamera.fov, ...options }),
            orbit: orbitShot,
            orientedBox,
            /** The establishing shot at `aspect` (default: the live one) — CameraRig's at 3:2 and wider, backed away on narrower screens. */
            establishing: (aspect = threeCamera.aspect) => establishingShot(aspect, { fov: threeCamera.fov }),
            ESTABLISHING
        },

        motion,
        palette,
        fonts,
        draw,

        media,
        mediaUrl,
        mediaTexture: (name, options = {}) => mediaTexture(name, { anisotropy, ...options }),
        track,
        rng,

        makeCanvas: (logicalWidth, logicalHeight, options = {}) => makeCanvas(logicalWidth, logicalHeight, {
            bufferHeight: deskScene.getDrawingBufferHeight(),
            ...options
        }),
        canvasTexture: (canvas, options = {}) => canvasTexture(canvas, { anisotropy, ...options }),
        drawText,
        drawHandwriting,
        fitText,
        /** fitHandwriting(g, text, { maxWidth, maxHeight, sizeMax?, … }) → { size, lines, fits, lineHeight }: fitText for the hand, single lines set tighter. */
        fitHandwriting,
        /**
         * drawNote(g, { id, text, x, y, w, h, face?, size?, weight?, lineHeight?, color?, seed?, align?, valign?, pen?, fallback? })
         * → { overflow }: `text` (or `fallback`) in the handwriting face, fitted into the rect,
         * never overflowing. See draw.js.
         */
        drawNote,
        /** paint(draw): draw now, and again when the fonts land. */
        paint,
        /** paperSheet({ width, height, thickness, front, back, color, backColor, roughness }) → Mesh, upright, front +Z. */
        paperSheet,
        setPaperFace,
        FACE_UP,
        /** stickyMaterial({ map, light: 'monitor' | 'desk' | 'held' | number, side }) — a note that reads yellow under ACES. See paper.js. */
        stickyMaterial,
        stickyLift,
        STICKY_LIGHT,

        visit,
        hint,
        live,
        overlay: overlay(),
        addButton,
        setCursor,

        still,
        /** ?film=1: animated, with a fixed clock and the still visit numbers. */
        film,
        /** still || film — the page must look the same on every load. */
        deterministic,
        reducedMotion,
        instant,
        now,

        invalidate,
        invalidateShadows,
        /** fn(dt) → true to keep frames coming. Wrapped: removed after 3 throws. Returns unsubscribe. */
        addTick: (fn) => wrapTick(deskScene, 'tick', fn),

        /**
         * A timer that wakes the scene for one frame at a time — the way to
         * animate something slowly at rest (a blinking LED, a drifting dot at
         * ≤ 12 fps) without holding the frame loop open. Paused while the tab
         * is hidden; never fires under ?still=1 unless { inStill: true }.
         * Returns stop().
         */
        every(ms, fn, { inStill = false } = {}) {
            if (still && !inStill) return () => {};
            const id = setInterval(() => {
                if (document.hidden) return;
                try {
                    fn();
                } catch (error) {
                    console.error('[desk] every() callback threw; stopping it', error);
                    clearInterval(id);
                }
            }, ms);
            return () => clearInterval(id);
        },

        pointer: {
            /** cb(ndc) at most once per frame. Returns unsubscribe. */
            onMove(cb) {
                return deskScene.pointer.onMove((ndc) => {
                    try { cb(ndc); } catch (error) { console.error('[desk] pointer.onMove subscriber threw', error); }
                });
            },
            onLeave(cb) {
                return deskScene.pointer.onLeave?.(() => {
                    try { cb(); } catch (error) { console.error('[desk] pointer.onLeave subscriber threw', error); }
                }) ?? (() => {});
            },
            ndcForEvent: (event) => deskScene.pointer.ndcForEvent(event)
        },

        /** Intersections of the live camera's ray through `ndc` with `objects`. */
        raycast(ndc, objects, recursive = true) {
            threeCamera.updateMatrixWorld();
            ndcVector.set(ndc.x, ndc.y);
            raycaster.setFromCamera(ndcVector, threeCamera);
            const list = Array.isArray(objects) ? objects : [objects];
            return raycaster.intersectObjects(list.filter(Boolean), recursive);
        },

        /** CSS-pixel rect of an Object3D (world AABB) or Box3 through the live camera. */
        screenRect(target) {
            const box = target?.isBox3 ? target : new THREE.Box3().setFromObject(target);
            threeCamera.updateMatrixWorld();
            const canvas = deskScene.renderer.domElement;
            return projectToScreenRect(box, threeCamera, { width: canvas.clientWidth, height: canvas.clientHeight });
        },

        units: { perMetre: UNITS_PER_METRE, mm, cm },

        /** ctx.navigate('#box/amazon', { replace: false }) */
        navigate,
        /** { moduleId: string|null, path: string[], hash: string } */
        route: currentRoute
    };
    return ctx;
}

/** The per-module view: ctx plus moduleId / log / warn, and ticks labelled with the id. */
export function forModule(ctx, module) {
    const view = Object.create(ctx);
    view.moduleId = module.id;
    view.log = (...args) => console.info(`[desk:${module.id}]`, ...args);
    view.warn = (...args) => console.warn(`[desk:${module.id}]`, ...args);
    view.addTick = (fn) => wrapTick(ctx.deskScene, module.id, fn);
    return view;
}
