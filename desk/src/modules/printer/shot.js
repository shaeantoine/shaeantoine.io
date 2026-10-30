import * as THREE from 'three';
import { fitShot, frameReport, makeCamera, FOV } from '../../core/framing.js';
import { POSITION, YAW, BODY, PAPER, SHOT, TORN } from './spec.js';
import { buildDrapePath, buildLyingPath, lyingFrame, toWorld } from './strip.js';

/**
 * The #printer shot, computed (DOM-free, so node can import it to check it).
 *
 * The target is the body plus the fully printed receipt: the camera fits them
 * together at SHOT.fill of the frame height (or SHOT.maxWidthFill of its
 * width on narrow screens), from SHOT.elevationDeg, facing the printer.
 */

const DEG = Math.PI / 180;

/** The body's 8 corners (world). */
export function bodyCorners() {
    const out = [];
    for (const x of [-BODY.width / 2, BODY.width / 2]) {
        for (const y of [0, BODY.height]) {
            for (const z of [-BODY.depth / 2, BODY.depth / 2]) out.push(toWorld([x, y, z], POSITION, YAW));
        }
    }
    return out;
}

/** Points along both edges of the fully printed receipt (world), every ~1 cm. */
export function receiptPoints({ length = PAPER.length, step = 0.03 } = {}) {
    const path = buildDrapePath({ length });
    const out = [];
    const p = {};
    for (let s = 0; s <= length + 1e-9; s += step) {
        path.at(s, p);
        for (const x of [-PAPER.width / 2, PAPER.width / 2]) out.push(toWorld([x, p.h, p.a], POSITION, YAW));
    }
    return out;
}

/** Points along both edges of a torn-off receipt lying where tearAndReprint lays it (world). */
export function tornPoints({ length = PAPER.length, step = 0.03 } = {}) {
    const frameAt = lyingFrame(buildLyingPath({ length }), { centre: TORN.centre, heading: TORN.heading, length });
    const out = [];
    const f = {};
    for (let s = 0; s <= length + 1e-9; s += step) {
        frameAt(s, f);
        for (const k of [-0.5, 0.5]) {
            out.push(new THREE.Vector3(f.cx + f.xx * k * PAPER.width, f.cy + f.xy * k * PAPER.width, f.cz + f.xz * k * PAPER.width));
        }
    }
    return out;
}

/** Everything the shot must hold (plus any `extra` world points, e.g. the torn receipt). */
export function shotTarget(extra = []) {
    return [...bodyCorners(), ...receiptPoints()].map((p) => new THREE.Vector3(...p)).concat(extra);
}

/**
 * The shot for a viewport of `aspect`: fitShot's distance search, with the
 * aim walked (a few fixed-point steps) until the target's projection is
 * centred in the frame's SAFE AREA — the site header covers the top 72 px and
 * the action row + hint the bottom ~90 px, so the usable band is NDC y
 * SHOT.safeBottom … SHOT.safeTop, centred slightly above the middle. Without
 * the walk the near end of the receipt (lower in frame, and closer) spills off
 * the bottom while the printer's top sits well below the header.
 *
 * `extra`: more world points to hold — tornPoints() once a receipt has been
 * torn off, so the one lying to the printer's left stays in the shot
 * (#printer/again: printer 76% of the frame height, the torn receipt fully in
 * frame at x −0.66…−0.26 NDC at 16:9, −0.78…−0.30 at 3:2; checked in node).
 */
export function printerShot(aspect = 16 / 9, { fov = FOV, extra = [] } = {}) {
    const target = shotTarget(extra);
    const box = new THREE.Box3().setFromPoints(target);
    let look = box.getCenter(new THREE.Vector3());
    const safeCentre = (SHOT.safeTop + SHOT.safeBottom) / 2;
    const options = {
        elevation: SHOT.elevationDeg * DEG,
        azimuth: YAW + SHOT.azimuthOffset,
        fill: SHOT.fill,
        maxWidthFill: SHOT.maxWidthFill,
        aspect,
        fov
    };
    let shot = null;
    let report = null;
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    for (let i = 0; i < 14; i += 1) {
        shot = fitShot(target, { ...options, lookAt: look });
        const camera = makeCamera(shot, aspect, fov);
        report = frameReport(target, camera);
        const halfHeight = Math.tan((fov * DEG) / 2) * shot.distance;
        right.set(1, 0, 0).applyQuaternion(camera.quaternion);
        up.set(0, 1, 0).applyQuaternion(camera.quaternion);
        const dx = report.centre.x;
        const dy = report.centre.y - safeCentre;
        if (Math.abs(dx) < 0.004 && Math.abs(dy) < 0.004) break;
        look = look.clone()
            .addScaledVector(right, dx * halfHeight * aspect * 0.9)
            .addScaledVector(up, dy * halfHeight * 0.9);
    }
    return { position: shot.position, lookAt: shot.lookAt, distance: shot.distance, report };
}

/** frameReport of the shot target through a pose (for checks). */
export function reportShot(pose, aspect) {
    return frameReport(shotTarget(), makeCamera(pose, aspect));
}
