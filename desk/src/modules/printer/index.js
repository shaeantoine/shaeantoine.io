import * as THREE from 'three';
import { hitProxy } from '../../core/parts.js';
import { palette } from '../../core/palette.js';
import { OBJECT_ID, POSITION, YAW, BODY, PAPER, PRINT, TORN, LABEL } from './spec.js';
import { buildDrapePath, buildLyingPath, createStrip, layDrape, layStrip, drapeFrame, lyingFrame } from './strip.js';
import { printerShot, tornPoints } from './shot.js';
import { buildPrinter } from './printerModel.js';
import {
    RECEIPT_MM, receiptData, sameReceipt, receiptText, drawStripReceipt, renderReceiptPNG, downloadCanvas, COPY
} from './receipt.js';

/**
 * PRINTER — "you". A small thermal receipt printer on the left of the desk.
 * "Before you go" (the header link, or clicking the printer) prints a visitor
 * receipt that feeds out of the slot, arches over the tear bar, hangs down the
 * front and lies forward on the desk with its tip curled. "Save receipt"
 * downloads it as a PNG.
 *
 *   #printer      camera turns to the printer; the receipt prints (≈ 1.6 s),
 *                 then stays out. Under ?still=1 it is simply out.
 *   (in #printer) clicking the printer tears the receipt off — it is laid on the
 *                 desk to the printer's left — and prints a fresh one. Coming
 *                 back to #printer after picking more things up does the same.
 *   trail         the receipt is out, draped over the front (#desk/after).
 *
 * Files: spec.js (every number), strip.js (the paper's path and geometry —
 * DOM-free), shot.js (the camera, computed — DOM-free), printerModel.js (the
 * body), receipt.js (words, layout, painting, PNG).
 *
 * NOTHING RUNS AT REST: no timers, no ticks. Frames are requested only by the
 * print / tear animations (core motion) and one-off repaints.
 */

const PAPER_BACK = palette.receiptBack;
const LED_ON = 1.3;
// A torn receipt is pulled forward off the tear bar (TEAR_PUSH, along the
// printer's front) and lifted (TEAR_LIFT) on its way to the desk — without the
// push, the part hanging down the front would pass through the body.
const TEAR_LIFT = 0.18;
const TEAR_PUSH = 0.22;

/** Speed profile of a thermal feed: a short spin-up, constant feed with a faint per-line pulse, a short stop. */
function feedEasing(duration) {
    const ta = 0.07;
    const td = 0.1;
    const vmax = 1 / (1 - ta / 2 - td / 2);
    const base = (t) => {
        if (t <= 0) return 0;
        if (t >= 1) return 1;
        if (t < ta) return (vmax * t * t) / (2 * ta);
        if (t < 1 - td) return vmax * (ta / 2 + (t - ta));
        const u = 1 - t;
        return 1 - (vmax * u * u) / (2 * td);
    };
    const pulses = Math.max(1, Math.round((duration / 1000) * PRINT.lineHz));
    const amplitude = 0.22;
    return (t) => {
        const b = base(t);
        return b + (amplitude * Math.sin(2 * Math.PI * pulses * b)) / (2 * Math.PI * pulses);
    };
}

const state = {
    ctx: null,
    group: null,
    printer: null,
    path: null,
    strip: null,
    meshes: [],
    frontMaterial: null,
    backMaterial: null,
    surface: null,      // the receipt's canvas (makeCanvas result)
    texture: null,
    data: null,         // what the receipt in the printer says
    visible: PAPER.restLength,
    printed: false,
    printing: null,     // Promise while feeding
    tearing: null,      // Promise while a torn receipt is being laid aside
    torn: null,         // { meshes, strip, texture, materials }
    active: false,
    saveButton: null,
    contactLinks: null,
    liveFromTrail: false,
    unsubscribers: []
};

// ---------------------------------------------------------------------------
// Receipt canvas
// ---------------------------------------------------------------------------

function newSurface(ctx) {
    // Framing in frame heights: the #printer shot shows at most ≈ 3.4 CSS px per
    // mm of paper (the top of the drop, at 3:2), so the full 269 mm would span
    // ≈ 0.95 frame heights and the 75 mm width ≈ 0.27. makeCanvas adds 1.25×.
    return ctx.makeCanvas(RECEIPT_MM.width, RECEIPT_MM.length, { framing: [0.29, 1.0] });
}

function grainFor(ctx, seed) {
    return (g, w, h) => ctx.draw.grain(g, w, h, { seed, amount: 0.022 });
}

/** (Re)paints the printer's current receipt from `state.data`, now and once fonts land. */
function repaint(ctx) {
    const { surface, texture, data } = state;
    ctx.fonts.paint(() => {
        drawStripReceipt(surface, data, { palette: ctx.palette, grain: grainFor(ctx, 'receipt') });
        if (texture) texture.needsUpdate = true;
    });
    ctx.invalidate();
}

// ---------------------------------------------------------------------------
// Paper
// ---------------------------------------------------------------------------

function paperMeshes(strip, front, back) {
    const a = new THREE.Mesh(strip.front, front);
    const b = new THREE.Mesh(strip.back, back);
    for (const m of [a, b]) {
        m.castShadow = true;
        m.receiveShadow = true;
    }
    a.name = 'receipt-front';
    b.name = 'receipt-back';
    return [a, b];
}

function setVisible(length) {
    state.visible = length;
    layDrape(state.strip, state.path, length);
}

function setLed(intensity) {
    if (state.printer?.led) state.printer.led.emissiveIntensity = intensity;
}

/**
 * Prints the receipt: redraw with what the visit says now, then feed the paper
 * from the tab to its full length. Re-entrant: a second call while feeding
 * returns the same promise.
 */
function printReceipt(ctx, { instant }) {
    if (state.printing) return state.printing;
    const run = (async () => {
        state.data = receiptData(ctx);
        repaint(ctx);
        state.printed = true;
        if (!instant) await ctx.motion.wait(PRINT.startDelayMs);
        const from = state.visible;
        await ctx.motion.animate({
            from,
            to: PAPER.length,
            duration: PRINT.durationMs * ((PAPER.length - from) / (PAPER.length - PAPER.restLength)),
            easing: feedEasing(PRINT.durationMs),
            instant,
            onUpdate: (length, t) => {
                setVisible(length);
                // The status LED flickers with the data while the head is printing.
                setLed(t >= 1 ? LED_ON : (Math.floor(t * 34) % 3 === 0 ? 0.25 : 1.7));
            }
        });
        setLed(LED_ON);
        ctx.invalidate();
        if (state.active) ctx.live(receiptText(state.data));
    })();
    state.printing = run.finally(() => { state.printing = null; });
    return state.printing;
}

function disposeTorn(ctx) {
    const torn = state.torn;
    if (!torn) return;
    for (const m of torn.meshes) m.removeFromParent();
    torn.strip.front.dispose();
    torn.strip.back.dispose();
    torn.materials.forEach((m) => m.dispose());
    torn.texture?.dispose();
    state.torn = null;
    ctx.invalidateShadows();
}

/**
 * Tears the printed receipt off and lays it on the desk to the printer's
 * left, then prints a fresh one. At most one torn receipt is kept.
 */
function tearAndReprint(ctx, { instant }) {
    if (state.tearing) return state.tearing;
    const run = (async () => {
        if (state.printing) await state.printing;
        disposeTorn(ctx);

        // The torn strip takes the old receipt's canvas; the printer gets a new one.
        const oldTexture = state.texture;
        const strip = createStrip({ headerTeeth: true });
        const front = new THREE.MeshStandardMaterial({ map: oldTexture, roughness: 0.58, metalness: 0 });
        const back = new THREE.MeshStandardMaterial({ color: PAPER_BACK, roughness: 0.82, metalness: 0 });
        const meshes = paperMeshes(strip, front, back);
        state.torn = { strip, meshes, materials: [front, back], texture: oldTexture };

        // Pose A: exactly where the printed paper hangs now (world space).
        const L = PAPER.length;
        const vOf = (s) => (L - s) / L;
        const count = strip.count * 3;
        const aFront = new Float32Array(count);
        const aBack = new Float32Array(count);
        const bFront = new Float32Array(count);
        const bBack = new Float32Array(count);
        layStrip(strip, { s0: 0, s1: L, vOf, frameAt: drapeFrame(state.path), frontOut: aFront, backOut: aBack });
        state.group.updateWorldMatrix(true, false);
        const m = state.group.matrixWorld;
        const v = new THREE.Vector3();
        for (const arr of [aFront, aBack]) {
            for (let i = 0; i < arr.length; i += 3) {
                v.set(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(m);
                arr[i] = v.x; arr[i + 1] = v.y; arr[i + 2] = v.z;
            }
        }
        // Pose B: lying on the desk.
        const lying = lyingFrame(buildLyingPath(), { centre: TORN.centre, heading: TORN.heading });
        layStrip(strip, { s0: 0, s1: L, vOf, frameAt: lying, frontOut: bFront, backOut: bBack });

        const fp = strip.front.attributes.position.array;
        const bp = strip.back.attributes.position.array;
        const forward = new THREE.Vector3(0, 0, 1).transformDirection(m).setY(0).normalize();
        const blend = (e) => {
            const lift = ctx.motion.arc(e, TEAR_LIFT);
            const push = ctx.motion.arc(e, TEAR_PUSH);
            const px = forward.x * push;
            const pz = forward.z * push;
            for (let i = 0; i < count; i += 3) {
                fp[i] = aFront[i] + (bFront[i] - aFront[i]) * e + px;
                fp[i + 1] = aFront[i + 1] + (bFront[i + 1] - aFront[i + 1]) * e + lift;
                fp[i + 2] = aFront[i + 2] + (bFront[i + 2] - aFront[i + 2]) * e + pz;
                bp[i] = aBack[i] + (bBack[i] - aBack[i]) * e + px;
                bp[i + 1] = aBack[i + 1] + (bBack[i + 1] - aBack[i + 1]) * e + lift;
                bp[i + 2] = aBack[i + 2] + (bBack[i + 2] - aBack[i + 2]) * e + pz;
            }
            for (const g of [strip.front, strip.back]) {
                g.attributes.position.needsUpdate = true;
                g.computeVertexNormals();
                g.computeBoundingSphere();
            }
        };
        blend(0);
        ctx.scene.add(...meshes);

        // The printer is left with a fresh tab and a fresh canvas.
        state.surface = newSurface(ctx);
        state.texture = ctx.canvasTexture(state.surface.canvas);
        state.frontMaterial.map = state.texture;
        state.frontMaterial.needsUpdate = true;
        state.printed = false;
        setVisible(PAPER.restLength);

        await ctx.motion.animate({ from: 0, to: 1, preset: 'put', instant, onUpdate: blend });
        // Settle on the exact lying pose, with analytic normals.
        layStrip(strip, { s0: 0, s1: L, vOf, frameAt: lying });
        ctx.invalidateShadows();
        await printReceipt(ctx, { instant });
    })();
    state.tearing = ctx.track(run.finally(() => { state.tearing = null; }), 'printer tear');
    return state.tearing;
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

async function saveReceipt(ctx) {
    const data = state.data ?? receiptData(ctx);
    await ctx.fonts.ready();
    const canvas = renderReceiptPNG(data, { palette: ctx.palette, grain: grainFor(ctx, 'receipt-png') });
    const ok = await downloadCanvas(canvas, 'shae-desk-receipt.png');
    if (!ok) ctx.warn('Could not encode the receipt as a PNG.');
}

/**
 * Shae's contact details as real links beside "Save receipt" — the receipt is
 * a picture, so its printed lines can't be clicked. Same list as the receipt
 * (receipt.js COPY.contacts), so the two can't disagree.
 */
const CONTACT_LABELS = Object.freeze({ email: 'Email', linkedin: 'LinkedIn', github: 'GitHub' });

function ensureContactLinks() {
    if (state.contactLinks?.every((a) => a.isConnected)) return;
    const row = document.getElementById('desk-actions');
    if (!row) return;
    state.contactLinks?.forEach((a) => a.remove());
    state.contactLinks = COPY.contacts.map(([label, value, href]) => {
        const a = document.createElement('a');
        a.className = 'desk-button desk-contact';
        a.href = href;
        a.textContent = CONTACT_LABELS[label] ?? label;
        a.title = value;
        if (!href.startsWith('mailto:')) {
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
        }
        a.addEventListener('click', (event) => event.stopPropagation());
        row.append(a);
        return a;
    });
}

function removeContactLinks() {
    state.contactLinks?.forEach((a) => a.remove());
    state.contactLinks = null;
}

function ensureSaveButton(ctx) {
    ensureContactLinks();
    if (state.saveButton?.isConnected) return;
    state.saveButton = ctx.addButton('Save receipt', () => {
        saveReceipt(ctx).catch((error) => ctx.warn('Save receipt failed', error));
    }, {
        id: 'printer-save-receipt',
        title: 'Download your receipt as a PNG'
    });
}

// ---------------------------------------------------------------------------
// The module
// ---------------------------------------------------------------------------

/** The #printer camera at the live aspect; `withTorn` widens it to hold the torn-off receipt as well. */
function shotFor(ctx, withTorn) {
    const camera = ctx.camera.object;
    return printerShot(camera.aspect, { fov: camera.fov, extra: withTorn ? tornPoints() : [] });
}

function hitsPrinter(ctx, ndc) {
    return ctx.raycast(ndc, state.printer?.bodyMeshes ?? [], false).length > 0;
}

function hitsReceipt(ctx, ndc) {
    return ctx.raycast(ndc, state.meshes, false).length > 0;
}

export default {
    id: 'printer',
    objectIds: [OBJECT_ID],
    deskObjects: [
        {
            id: OBJECT_ID,
            label: LABEL,
            clickable: true,
            position: [...POSITION],
            rotation: [0, YAW, 0],
            // 2.5 mm of real lift, the size of the thing.
            hover: { lift: 0.008 },
            parts: [
                hitProxy([BODY.width, BODY.height, BODY.depth]),
                // Stand-in if mount() fails; hidden once the real body is built.
                { type: 'box', args: [BODY.width, BODY.height, BODY.depth], position: [0, BODY.height / 2, 0], color: '#dcd8cf', material: { roughness: 0.5 } }
            ]
        }
    ],
    states: [
        { hash: '#printer', note: 'receipt printed: out of the slot, over the tear bar, down the front and forward on the desk, readable; "Save receipt" button' },
        { hash: '#printer/again', note: 'printed twice: the first receipt torn off and lying on the desk to the printer\'s left, a fresh one out of the slot' }
    ],

    async mount(ctx) {
        state.ctx = ctx;
        const group = ctx.deskScene.getObjectGroup(OBJECT_ID);
        if (!group) throw new Error(`desk object "${OBJECT_ID}" is missing`);
        state.group = group;

        state.printer = buildPrinter(ctx);
        group.add(state.printer.group);

        state.path = buildDrapePath();
        state.surface = newSurface(ctx);
        state.texture = ctx.canvasTexture(state.surface.canvas);
        state.data = receiptData(ctx);
        repaint(ctx);

        state.strip = createStrip();
        state.frontMaterial = new THREE.MeshStandardMaterial({ map: state.texture, roughness: 0.58, metalness: 0 });
        state.backMaterial = new THREE.MeshStandardMaterial({ color: PAPER_BACK, roughness: 0.82, metalness: 0 });
        state.meshes = paperMeshes(state.strip, state.frontMaterial, state.backMaterial);
        setVisible(PAPER.restLength);
        group.add(...state.meshes);

        // The real body is up: retire the stand-in box (the hit proxy stays, invisible).
        for (const child of group.children) {
            if (child === state.printer.group || state.meshes.includes(child)) continue;
            child.traverse((node) => {
                if (node.isMesh && node.material?.visible !== false) node.visible = false;
            });
        }

        // Pointer affordance inside the module: the printer itself is clickable (a fresh receipt).
        state.unsubscribers.push(ctx.pointer.onMove((ndc) => {
            if (!state.active) return;
            ctx.setCursor(hitsPrinter(ctx, ndc) && !state.printing && !state.tearing ? 'pointer' : null);
        }));
        // A receipt laid out by trail() tracks the log until someone looks at it
        // (another module's trail may log after this one's has run).
        state.unsubscribers.push(ctx.visit.onChange(() => {
            if (!state.liveFromTrail || state.printing) return;
            state.data = receiptData(ctx);
            repaint(ctx);
        }));

        ctx.invalidateShadows();
    },

    async go(ctx, path, { instant }) {
        state.active = true;
        state.liveFromTrail = false;
        ctx.hint('click the printer for a fresh one · esc to step back');
        ensureSaveButton(ctx);

        // Hold the torn receipt in the shot too once there is (or is about to be) one.
        const withTorn = path[0] === 'again' || Boolean(state.torn) || Boolean(state.tearing);
        const moving = ctx.camera.moveTo(shotFor(ctx, withTorn), { instant });

        let work;
        if (state.tearing) work = state.tearing;
        else if (state.printing) work = state.printing;
        else if (!state.printed) work = printReceipt(ctx, { instant });
        else if (!sameReceipt(state.data, receiptData(ctx))) work = tearAndReprint(ctx, { instant });
        else work = Promise.resolve();
        // #printer/again: "has printed twice" — make sure a torn receipt is lying beside the printer.
        if (path[0] === 'again') {
            work = work.then(() => (state.torn ? undefined : tearAndReprint(ctx, { instant })));
        }

        if (state.printed && !state.printing) ctx.live(receiptText(state.data));
        await Promise.all([moving, work]);
    },

    async leave(ctx) {
        state.active = false;
        state.saveButton?.remove();
        state.saveButton = null;
        removeContactLinks();
        ctx.setCursor(null);
    },

    key() {
        return false;
    },

    click(ctx, ndc) {
        if (hitsPrinter(ctx, ndc)) {
            if (!state.printing && !state.tearing) {
                // Lean back as the old one is laid aside, so you watch it land.
                ctx.camera.moveTo(shotFor(ctx, true), { instant: ctx.instant });
                tearAndReprint(ctx, { instant: ctx.instant }).catch((error) => ctx.warn('reprint failed', error));
            }
            return true;
        }
        // The receipt is part of the printer; a click on it is not a click on nothing.
        return hitsReceipt(ctx, ndc);
    },

    async trail(ctx) {
        if (state.printing) await state.printing;
        if (!state.printed) await printReceipt(ctx, { instant: true });
        else if (state.visible < PAPER.length) setVisible(PAPER.length);
        state.liveFromTrail = true;
        ctx.invalidateShadows();
    }
};
