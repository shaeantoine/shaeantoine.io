import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
    MM, mm, MAT_TOP, BOARD, BOARD_TOP, AD8232, AD8232_TOP, JACK, PLUG, TEENSY, TEENSY_TOP,
    MAIN_CABLE, LEADS, CABLE_R, LEAD_R, SPLITTER, SNAP, PADS, PAD_R, PAD_TOP,
    USB_SOCKET, USB_PLUG, USB_TAIL_X, USB_CABLE,
    SCOPE, scopePivot, PIN, GRABBER, PROBE_R,
    PHONE, PHONE_NOTE, NOTE_T,
    ORGANISER, DRAWER, drawerCentreY
} from './layout.js';
import { drapedPath, surfaceAt } from './drape.js';
import {
    drawScopeFace, drawScopeScreen, drawScopeNote, drawLockScreen, drawPhoneNote,
    drawDrawerFront, drawSlip, DRAWER_FRONT
} from './screens.js';
import { VIEWFINDER } from './phoneos.js';

/**
 * v4 meshes: the USB lead, the scope and its probe, the Pixel (pixel.glb) and
 * the note under it, the parts organiser. Group-local, mm × MM, like build.js.
 * Untextured static pieces are merged per material.
 */

const Y = new THREE.Vector3(0, 1, 0);
const at = (x, y, z) => [mm(x), mm(y), mm(z)];
const box = (w, h, d) => new THREE.BoxGeometry(mm(w), mm(h), mm(d));

function standard(color, { roughness = 0.6, metalness = 0, ...rest } = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...rest });
}

function artContext(ctx) {
    return { palette: ctx.palette, draw: ctx.draw, fonts: ctx.fonts, rng: ctx.rng, drawNote: ctx.drawNote };
}

/** A canvas in mm with its texture, painted through ctx.paint (repaints when the fonts land). */
function painted(ctx, [w, h], options, paint) {
    const surface = ctx.makeCanvas(w, h, options);
    const texture = ctx.canvasTexture(surface.canvas);
    const result = { texture, surface, info: null, w, h };
    result.repaint = (fn = paint) => {
        (ctx.paint ?? ctx.fonts.paint)(() => {
            surface.clear();
            result.info = fn(surface.g, w, h) ?? null;
            texture.needsUpdate = true;
        });
    };
    result.repaint();
    return result;
}

/** Collects static geometry per material and merges it (non-indexed, so any primitive mixes). */
function createBatch() {
    const buckets = new Map();
    return {
        add(material, geometry, { position = [0, 0, 0], quaternion, rotation, scale } = {}) {
            const matrix = new THREE.Matrix4();
            const q = quaternion ?? (rotation ? new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)) : new THREE.Quaternion());
            const s = scale ? new THREE.Vector3(...(Array.isArray(scale) ? scale : [scale, scale, scale])) : new THREE.Vector3(1, 1, 1);
            matrix.compose(new THREE.Vector3(...position), q, s);
            let g = geometry.index ? geometry.toNonIndexed() : geometry;
            if (g !== geometry) geometry.dispose();
            g.applyMatrix4(matrix);
            for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
            g.clearGroups();
            if (!buckets.has(material)) buckets.set(material, []);
            buckets.get(material).push(g);
        },
        build(name, { castShadow = true } = {}) {
            const group = new THREE.Group();
            group.name = name;
            for (const [material, geometries] of buckets) {
                const merged = mergeGeometries(geometries, false);
                geometries.forEach((g) => g.dispose());
                if (!merged) continue;
                const mesh = new THREE.Mesh(merged, material);
                mesh.castShadow = castShadow;
                mesh.receiveShadow = true;
                group.add(mesh);
            }
            buckets.clear();
            return group;
        }
    };
}

function alongQuaternion(direction) {
    return new THREE.Quaternion().setFromUnitVectors(Y, direction.clone().normalize());
}

/** A cylinder from a to b (mm Vector3s), radii r0 at a and r1 at b. */
function strut(batch, material, a, b, r0, r1 = r0, radial = 14) {
    const dir = b.clone().sub(a);
    const length = dir.length();
    // CylinderGeometry: radiusTop at +Y; +Y points a → b.
    batch.add(material, new THREE.CylinderGeometry(mm(r1), mm(r0), mm(length), radial), {
        position: at(...a.clone().add(b).multiplyScalar(0.5).toArray()),
        quaternion: alongQuaternion(dir)
    });
}

function tube(points, radius, { radial = 7, segments } = {}) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => p.clone().multiplyScalar(MM)), false, 'centripetal');
    return new THREE.TubeGeometry(curve, segments ?? Math.max(24, points.length * 2), mm(radius), radial, false);
}

// ---------------------------------------------------------------------------
// Draping a cable over the bench (surfaces, boards, other cables)
// ---------------------------------------------------------------------------

/** Rectangular tops the v3 drape doesn't know (mm): the AD8232, its jack, the Teensy and its chip. */
const EXTRA_TOPS = [
    { x0: AD8232.x - AD8232.w / 2, x1: AD8232.x + AD8232.w / 2, z0: AD8232.z - AD8232.d / 2, z1: AD8232.z + AD8232.d / 2, y: AD8232_TOP },
    { x0: AD8232.x + 3, x1: AD8232.x + 7, z0: AD8232.z, z1: AD8232.z + 4, y: AD8232_TOP + 0.9 },
    { x0: JACK.x - 3, x1: JACK.x + 3, z0: AD8232.z - AD8232.d / 2 - 1, z1: AD8232.z - AD8232.d / 2 + 11, y: AD8232_TOP + 5 },
    { x0: TEENSY.x - TEENSY.w / 2, x1: TEENSY.x + TEENSY.w / 2, z0: TEENSY.z - TEENSY.d / 2, z1: TEENSY.z + TEENSY.d / 2, y: TEENSY_TOP + 1.2 },
    { x0: PLUG.x - PLUG.bodyR, x1: PLUG.x + PLUG.bodyR, z0: PLUG.bodyStart - PLUG.bodyLength - PLUG.reliefLength, z1: PLUG.bodyStart, y: PLUG.y + PLUG.bodyR }
];

function surfaceWithBoards(x, z) {
    let y = surfaceAt(x, z);
    for (const t of EXTRA_TOPS) if (x >= t.x0 && x <= t.x1 && z >= t.z0 && z <= t.z1) y = Math.max(y, t.y);
    return y;
}

let obstacleCache = null;
/** The existing grey leads as draped points with radii (the same paths build.js tubes). */
function cableObstacles() {
    if (obstacleCache) return obstacleCache;
    const splitterY = MAT_TOP + SPLITTER.r;
    const list = [];
    for (const p of drapedPath(MAIN_CABLE, CABLE_R, { start: { y: PLUG.y, length: 24 }, end: { y: splitterY, length: 8 } })) list.push({ p, r: CABLE_R });
    for (const lead of LEADS) {
        for (const p of drapedPath(lead.points, LEAD_R, { start: { y: splitterY, length: 8 }, end: { y: SNAP.sleeveY, length: 14 } })) list.push({ p, r: LEAD_R });
    }
    const [fx, fz] = SPLITTER.from;
    const [tx, tz] = SPLITTER.to;
    for (let t = 0; t <= 1.001; t += 0.1) list.push({ p: new THREE.Vector3(fx + (tx - fx) * t, splitterY, fz + (tz - fz) * t), r: SPLITTER.r });
    obstacleCache = list;
    return list;
}

/**
 * A cable routed in plan through `points` and laid on whatever is under it —
 * the mat, the boards, the other leads — with its ends held at `startY` /
 * `endY` (mm) and never steeper than `slope` (a cable drapes; it doesn't
 * drop). Returns mm Vector3s every ~1.5 mm.
 */
export function drapeCable(points, radius, { startY, endY, slope = 1.0, step = 1.5, avoid = true } = {}) {
    const plan = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    const length = plan.getLength();
    const count = Math.max(8, Math.ceil(length / step));
    const ds = length / count;
    const obstacles = avoid ? cableObstacles() : [];
    const out = [];
    const ys = [];
    for (let i = 0; i <= count; i += 1) {
        const p = plan.getPointAt(i / count);
        let y = surfaceWithBoards(p.x, p.z) + radius;
        for (const o of obstacles) {
            const reach = o.r + radius;
            const dx = p.x - o.p.x;
            const dz = p.z - o.p.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < reach * reach) y = Math.max(y, o.p.y + Math.sqrt(reach * reach - d2));
        }
        out.push(p);
        ys.push(y);
    }
    if (startY !== undefined) ys[0] = Math.max(ys[0], startY);
    if (endY !== undefined) ys[count] = Math.max(ys[count], endY);
    for (let i = 1; i <= count; i += 1) ys[i] = Math.max(ys[i], ys[i - 1] - slope * ds);
    for (let i = count - 1; i >= 0; i -= 1) ys[i] = Math.max(ys[i], ys[i + 1] - slope * ds);
    return out.map((p, i) => new THREE.Vector3(p.x, ys[i], p.z));
}

// ---------------------------------------------------------------------------
// The USB lead
// ---------------------------------------------------------------------------

/**
 * The micro-USB lead, built plugged in; the module slides its group back by
 * USB_PLUG.unplugged mm (along -x) until the bench is powered on.
 */
export function buildUsb() {
    const group = new THREE.Group();
    group.name = 'bench-usb';
    const batch = createBatch();
    const rubber = standard('#1b1b1d', { roughness: 0.62 });
    const shellMetal = standard('#cfcfcc', { roughness: 0.3, metalness: 0.9 });
    const { shell, body, relief, cableR } = USB_PLUG;
    const y = USB_SOCKET.y;
    const z = USB_SOCKET.z;
    const shellEnd = USB_SOCKET.mouthX + shell.inside;
    batch.add(shellMetal, box(shell.length, shell.h, shell.w), { position: at(shellEnd - shell.length / 2, y, z) });
    const bodyEnd = shellEnd - shell.length;
    batch.add(rubber, new RoundedBoxGeometry(mm(body.length), mm(body.h), mm(body.w), 2, mm(1.3)), {
        position: at(bodyEnd - body.length / 2, y + 0.05, z)
    });
    const reliefEnd = bodyEnd - body.length;
    strut(batch, rubber, new THREE.Vector3(reliefEnd, y, z), new THREE.Vector3(USB_TAIL_X, y, z), relief.r0, relief.r1);
    const path = drapeCable(USB_CABLE, cableR, { startY: y, slope: 0.85 });
    // The first stretch leaves the relief level, along -x.
    path[0].set(USB_TAIL_X + 0.6, y, z);
    batch.add(rubber, tube(path, cableR, { radial: 8, segments: 180 }));
    group.add(batch.build('bench-usb-batched'));
    return { group, path };
}

// ---------------------------------------------------------------------------
// The scope, its probe and clips
// ---------------------------------------------------------------------------

/** Scope-case local (mm, before the tilt; pivot at the front bottom edge's middle) from face-canvas mm. */
function faceToCase(cx, cy, y) {
    return new THREE.Vector3(-SCOPE.w / 2 + cx, y, -SCOPE.d + cy);
}

export function buildScope(ctx) {
    const art = artContext(ctx);
    const pivot = new THREE.Group();
    pivot.name = 'bench-scope';
    const p = scopePivot();
    pivot.position.set(...at(p.x, MAT_TOP, p.z));
    pivot.rotation.y = SCOPE.yaw;
    const tilted = new THREE.Group();
    tilted.rotation.x = SCOPE.tilt;
    pivot.add(tilted);

    const batch = createBatch();
    const plate = standard('#26292f', { roughness: 0.35 });
    const brass = standard('#c9a458', { roughness: 0.35, metalness: 0.85 });
    const black = standard('#121214', { roughness: 0.5 });
    const silver = standard('#d3d3d0', { roughness: 0.28, metalness: 0.9 });
    const pcbEdge = standard('#1a3f73', { roughness: 0.45 });
    const cap = standard('#2a2a2c', { roughness: 0.45 });

    const { w, d, t } = SCOPE;
    const pcbY = t - 4.6;
    // Base plate and standoffs.
    batch.add(plate, box(w, 2, d), { position: at(0, 1, -d / 2) });
    for (const [sx, sz] of [[3, 3], [w - 3, 3], [3, d - 3], [w - 3, d - 3]]) {
        batch.add(brass, new THREE.CylinderGeometry(mm(1.9), mm(1.9), mm(pcbY - 2), 10), { position: at(-w / 2 + sx, 2 + (pcbY - 2) / 2, -d + sz) });
    }
    // The PCB, face textured.
    const face = painted(ctx, [w, d], { framing: [0.5, 0.34], oversample: 1.4 }, (g, W, H) => drawScopeFace(g, W, H, art));
    const pcbTop = standard('#ffffff', { roughness: 0.42, map: face.texture });
    const pcb = new THREE.Mesh(box(w, 1.6, d), [pcbEdge, pcbEdge, pcbTop, pcbEdge, pcbEdge, pcbEdge]);
    pcb.position.set(...at(0, pcbY + 0.8, -d / 2));
    pcb.castShadow = true;
    pcb.receiveShadow = true;
    tilted.add(pcb);
    const faceY = pcbY + 1.6;
    // The TFT module, raised on its header.
    const b = SCOPE.bezel;
    const tft = faceToCase(b.x + b.w / 2, b.y + b.h / 2, faceY + 1.6);
    batch.add(black, box(b.w, 3.2, b.h), { position: at(tft.x, tft.y, tft.z) });
    // Buttons and the slide switch.
    for (const [bx, by] of SCOPE.buttons) {
        const c = faceToCase(bx, by, faceY);
        batch.add(black, box(6, 3.4, 6), { position: at(c.x, faceY + 1.7, c.z) });
        batch.add(cap, new THREE.CylinderGeometry(mm(1.8), mm(1.8), mm(1.4), 16), { position: at(c.x, faceY + 4.1, c.z) });
    }
    {
        const s = SCOPE.slide;
        const c = faceToCase(s.x + s.w / 2, s.y + s.h / 2, faceY);
        batch.add(silver, box(s.w - 1, 2.6, s.h - 0.6), { position: at(c.x, faceY + 1.3, c.z) });
        batch.add(black, box(2.4, 2, 2.2), { position: at(c.x - 3.5, faceY + 3.3, c.z) });
    }
    // The BNC socket on the top (back) edge, pointing out along -z.
    const bncBase = faceToCase(SCOPE.bnc.x, 0, faceY - 2.5);
    const bncTip = bncBase.clone().add(new THREE.Vector3(0, 0, -SCOPE.bnc.length));
    strut(batch, silver, bncBase.clone().add(new THREE.Vector3(0, 0, 2)), bncTip, SCOPE.bnc.r, SCOPE.bnc.r * 0.78, 18);
    strut(batch, black, bncTip, bncTip.clone().add(new THREE.Vector3(0, 0, -9)), 3.4, 2.2, 14);
    tilted.add(batch.build('bench-scope-case'));

    // The stand: two legs from under the top edge down to the mat (in the untilted pivot frame).
    const legs = createBatch();
    const back = new THREE.Vector3(0, d * Math.sin(SCOPE.tilt) - 1, -d * Math.cos(SCOPE.tilt) + 4);
    for (const sx of [-w * 0.32, w * 0.32]) {
        strut(legs, plate, new THREE.Vector3(sx, back.y, back.z), new THREE.Vector3(sx, 0.8, back.z - 12), 1.5, 1.5, 8);
    }
    pivot.add(legs.build('bench-scope-stand'));

    // The screen: a canvas on the TFT, lit (unlit material, lifted a little over 1 so it reads as a backlit LCD).
    const s = SCOPE.screen;
    const screen = painted(ctx, [s.w, s.h], { framing: [0.34, 0.26], oversample: 1.6 }, (g, W, H) => drawScopeScreen(g, W, H, { on: false }, art));
    const screenMaterial = new THREE.MeshBasicMaterial({ map: screen.texture, color: new THREE.Color(1, 1, 1) });
    const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(mm(s.w), mm(s.h)), screenMaterial);
    const sc = faceToCase(s.x + s.w / 2, s.y + s.h / 2, faceY + 3.25);
    screenMesh.position.set(...at(sc.x, sc.y, sc.z));
    screenMesh.rotation.x = -Math.PI / 2;
    screenMesh.name = 'bench-scope-screen';
    tilted.add(screenMesh);

    // The sticky, on the face at the right, slightly askew and a millimetre over the edge.
    const st = SCOPE.sticky;
    const note = painted(ctx, [st.size, st.size], { framing: [0.24, 0.24], oversample: 1.5 }, (g, W, H) => drawScopeNote(g, W, H, art));
    const stickyMesh = new THREE.Mesh(new THREE.PlaneGeometry(mm(st.size), mm(st.size)), ctx.stickyMaterial({ map: note.texture, light: 'desk' }));
    const stc = faceToCase(st.x + st.size / 2, st.y + st.size / 2, faceY + 0.12);
    stickyMesh.position.set(...at(stc.x, stc.y, stc.z));
    stickyMesh.rotation.set(-Math.PI / 2, 0, st.roll);
    stickyMesh.castShadow = false;
    stickyMesh.receiveShadow = true;
    tilted.add(stickyMesh);

    pivot.updateMatrixWorld(true);
    // Where the probe's coax leaves the BNC's strain relief, in the bench group's frame (mm).
    const coaxStart = bncTip.clone().add(new THREE.Vector3(0, 0, -9))
        .multiplyScalar(MM).applyMatrix4(tilted.matrix).applyMatrix4(pivot.matrix).multiplyScalar(1 / MM);
    const coaxDir = new THREE.Vector3(0, 0, -1).applyQuaternion(tilted.quaternion).applyQuaternion(pivot.quaternion);

    const meshes = [];
    pivot.traverse((node) => { if (node.isMesh) meshes.push(node); });
    return {
        pivot, meshes, screen, screenMaterial, note, coaxStart, coaxDir,
        paintScreen(state) {
            screen.repaint((g, W, H) => drawScopeScreen(g, W, H, state, art));
            // A lit screen: the unlit colour lifted so ACES leaves the trace bright.
            screenMaterial.color.setScalar(state.on ? 1.35 : 1);
        }
    };
}

/**
 * The probe: coax from the scope's BNC, a Y, and two short leads up to
 * mini-grabbers hooked on the AD8232's OUTPUT (red) and GND (black) pins.
 */
export function buildProbe(scope) {
    const group = new THREE.Group();
    group.name = 'bench-probe';
    const batch = createBatch();
    const red = standard('#c4222c', { roughness: 0.45 });
    const blk = standard('#18181a', { roughness: 0.5 });
    const coaxMat = standard('#202022', { roughness: 0.55 });
    const metal = standard('#d0d0cc', { roughness: 0.3, metalness: 0.9 });

    // Lean toward the scope, fanned ±9°.
    const toScope = new THREE.Vector2(SCOPE.x - PIN.output[0], SCOPE.z - PIN.output[1]).normalize();
    const grabbers = [];
    [['output', red, -0.16], ['gnd', blk, 0.16]].forEach(([pin, material, fan]) => {
        const [px, pz] = PIN[pin];
        const plan = toScope.clone().rotateAround(new THREE.Vector2(), fan);
        const dir = new THREE.Vector3(plan.x * Math.sin(GRABBER.lean), Math.cos(GRABBER.lean), plan.y * Math.sin(GRABBER.lean));
        const tip = new THREE.Vector3(px, PIN.tipY - 1.5, pz);
        const hook = tip.clone().addScaledVector(dir, 3.5);
        const top = tip.clone().addScaledVector(dir, GRABBER.length);
        strut(batch, metal, tip, hook, 0.5, 0.7, 8);
        strut(batch, material, hook, top, GRABBER.r * 0.85, GRABBER.r, 16);
        strut(batch, material, top, top.clone().addScaledVector(dir, 4), GRABBER.r * 1.15, GRABBER.r * 0.7, 16); // the plunger cap
        grabbers.push({ top: top.clone().addScaledVector(dir, 4), dir, material });
    });

    // The Y where the two leads meet the coax, on the mat in front of the board's left end.
    const Ypt = new THREE.Vector3(-114, MAT_TOP + 2.2, 26);
    batch.add(blk, new THREE.CapsuleGeometry(mm(2.2), mm(6), 4, 12), {
        position: at(Ypt.x, Ypt.y, Ypt.z), quaternion: alongQuaternion(new THREE.Vector3(-0.8, 0, 0.6))
    });
    for (const g of grabbers) {
        const lift = g.top.clone().addScaledVector(g.dir, 5);
        const points = [[g.top.x, g.top.z], [lift.x, lift.z], [g.top.x - 8, 15], [-104, 21], [Ypt.x + 3, Ypt.z - 2]];
        const path = drapeCable(points, PROBE_R * 0.8, { startY: g.top.y, endY: Ypt.y, slope: 1.1, avoid: false });
        path[0].copy(g.top);
        batch.add(g.material, tube(path, PROBE_R * 0.8, { radial: 6, segments: 60 }));
    }
    // The coax: out of the BNC, down behind the scope, round to the Y.
    const s = scope.coaxStart;
    const out = s.clone().addScaledVector(scope.coaxDir, 5);
    const coaxPoints = [[s.x, s.z], [out.x, out.z], [s.x - 8, s.z - 10], [s.x - 12, 20], [s.x - 4, 12], [Ypt.x - 4, Ypt.z + 2]];
    const coax = drapeCable(coaxPoints, PROBE_R, { startY: s.y, endY: Ypt.y, slope: 1.15, avoid: false });
    coax[0].copy(s);
    coax[1].y = Math.max(coax[1].y, s.y + scope.coaxDir.y * 3);
    batch.add(coaxMat, tube(coax, PROBE_R, { radial: 7, segments: 90 }));
    group.add(batch.build('bench-probe-batched'));
    const meshes = [];
    group.traverse((node) => { if (node.isMesh) meshes.push(node); });
    return { group, meshes, coax };
}

// ---------------------------------------------------------------------------
// The Pixel
// ---------------------------------------------------------------------------

/**
 * The phone in a pivot (units, upright: width x, length y, screen +z): the
 * pixel.glb model scaled to 0.48 units long and centred, plus a canvas plane
 * on its glass (the OS paints it: phone.js) and, a hair in front of it, the
 * camera app's viewfinder plane (hidden until the camera runs). `model` is
 * the loaded scene (or null: a plain dark slab — the OS runs on it all the same).
 */
export function buildPhone(ctx, model) {
    const art = artContext(ctx);
    const pivot = new THREE.Group();
    pivot.name = 'bench-phone';
    const scale = mm(PHONE.length) / PHONE.nativeLength;
    if (model) {
        model.scale.setScalar(scale);
        model.position.set(0, -PHONE.nativeCentreY * scale, 0);
        model.traverse((node) => {
            if (!node.isMesh) return;
            node.castShadow = true;
            node.receiveShadow = true;
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            for (const m of materials) {
                // The model's own screen texture glows; ours is on top of the glass.
                if (m && 'emissiveIntensity' in m && m.emissiveMap) m.emissiveIntensity = 0;
            }
        });
        pivot.add(model);
    } else {
        const slab = new THREE.Mesh(new RoundedBoxGeometry(mm(PHONE.width), mm(PHONE.length), mm(PHONE.thickness), 3, mm(4)), standard('#2b2c2f', { roughness: 0.4, metalness: 0.3 }));
        slab.castShadow = true;
        slab.receiveShadow = true;
        pivot.add(slab);
    }
    const sc = PHONE.screen;
    const screen = painted(ctx, [sc.w, sc.h], { framing: [0.26, 0.62], oversample: 1.4 }, (g, W, H) => drawLockScreen(g, W, H, { on: false, date: ctx.now() }, art));
    const screenMaterial = new THREE.MeshBasicMaterial({ map: screen.texture, color: new THREE.Color(1, 1, 1) });
    const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(mm(sc.w), mm(sc.h)), screenMaterial);
    screenMesh.position.set(0, mm(sc.cy), mm(sc.z));
    screenMesh.name = 'bench-phone-screen';
    pivot.add(screenMesh);
    // The viewfinder: exactly over phoneos VIEWFINDER (mm on the glass, y down), 0.15 mm proud.
    const v = VIEWFINDER;
    const viewfinder = new THREE.Mesh(
        new THREE.PlaneGeometry(mm(v.w), mm(v.h)),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1) })
    );
    viewfinder.position.set(mm(v.x + v.w / 2 - sc.w / 2), mm(sc.cy + sc.h / 2 - (v.y + v.h / 2)), mm(sc.z + 0.15));
    viewfinder.name = 'bench-phone-viewfinder';
    viewfinder.visible = false;
    viewfinder.castShadow = false;
    viewfinder.receiveShadow = false;
    pivot.add(viewfinder);
    const meshes = [];
    pivot.traverse((node) => { if (node.isMesh) meshes.push(node); });
    return { pivot, meshes, screenMesh, screenMaterial, screen, viewfinder, hasModel: Boolean(model) };
}

/** The note under the phone: a 76 mm sticky, upright in its pivot (front +z), yellow both sides. */
export function buildPhoneNote(ctx) {
    const art = artContext(ctx);
    const pivot = new THREE.Group();
    pivot.name = 'bench-phone-note';
    const size = PHONE_NOTE.size;
    const face = painted(ctx, [size, size], { framing: [0.34, 0.34], oversample: 1.4 }, (g, W, H) => drawPhoneNote(g, W, H, art));
    const front = new THREE.Mesh(new THREE.PlaneGeometry(mm(size), mm(size)), ctx.stickyMaterial({ map: face.texture, light: 'desk' }));
    front.position.z = mm(NOTE_T / 2);
    front.castShadow = true;
    front.receiveShadow = true;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(mm(size), mm(size)), ctx.stickyMaterial({ light: 'desk', side: THREE.BackSide }));
    back.position.z = -mm(NOTE_T / 2);
    back.receiveShadow = true;
    pivot.add(front, back);
    return { pivot, meshes: [front, back], front, face };
}

// ---------------------------------------------------------------------------
// The parts organiser
// ---------------------------------------------------------------------------

function fillDrawer(slug, batch, materials, ctx) {
    const { trayW, trayD } = DRAWER;
    const floor = 1.1;
    const r = ctx.rng(`drawer-${slug}`);
    // Tray-local: x across (±trayW/2), z from 0 (inside the front) back to -trayD, y from the floor.
    const zSpan = [-trayD + 12, -6];
    const xSpan = [-trayW / 2 + 6, trayW / 2 - 6];
    const spot = () => [r.range(...xSpan), r.range(...zSpan)];
    if (slug === 'resistors') {
        for (let i = 0; i < 16; i += 1) {
            const [x, z] = spot();
            const yaw = r.range(0, Math.PI);
            const q = new THREE.Quaternion().setFromAxisAngle(Y, yaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
            const y = floor + 1.2 + (i % 3) * 0.4;
            batch.add(materials.beige, new THREE.CylinderGeometry(mm(1.1), mm(1.1), mm(6), 10), { position: at(x, y, z), quaternion: q });
            batch.add(materials.wire, new THREE.CylinderGeometry(mm(0.28), mm(0.28), mm(22), 5), { position: at(x, y, z), quaternion: q });
            for (const [k, band] of [[-1.6, 'brown'], [-0.5, 'black'], [0.6, 'red']]) {
                const offset = new THREE.Vector3(Math.cos(yaw) * k, 0, -Math.sin(yaw) * k);
                batch.add(materials[band], new THREE.CylinderGeometry(mm(1.16), mm(1.16), mm(0.5), 10), { position: at(x + offset.x, y, z + offset.z), quaternion: q });
            }
        }
    } else if (slug === 'jumpers') {
        const colours = ['red', 'orange', 'yellow', 'green', 'blue', 'black'];
        for (let i = 0; i < 18; i += 1) {
            const [x, z] = spot();
            const len = r.pick([5.08, 7.62, 10.16, 12.7, 20.32, 25.4]);
            const yaw = r.range(0, Math.PI);
            const q = new THREE.Quaternion().setFromAxisAngle(Y, yaw);
            batch.add(materials[colours[i % colours.length]], box(len, 0.9, 0.9), { position: at(x, floor + 0.5 + (i % 4) * 0.8, z), quaternion: q });
        }
    } else if (slug === 'headers') {
        for (let i = 0; i < 6; i += 1) {
            const [x, z] = spot();
            const pins = r.int(8, 20);
            const len = pins * 2.54;
            const yaw = r.range(-0.3, 0.3) + (i % 2) * 0.1;
            const q = new THREE.Quaternion().setFromAxisAngle(Y, yaw);
            const y = floor + 1.25 + (i % 2) * 2.6;
            batch.add(materials.black, box(len, 2.5, 2.5), { position: at(x, y, z), quaternion: q });
            for (let k = 0; k < pins; k += 1) {
                const off = (k - (pins - 1) / 2) * 2.54;
                batch.add(materials.gold, box(0.64, 8, 0.64), { position: at(x + Math.cos(yaw) * off, y + 1, z - Math.sin(yaw) * off), quaternion: q });
            }
        }
    } else if (slug === 'electrodes') {
        for (let i = 0; i < 6; i += 1) {
            const x = xSpan[0] + 10 + (i % 4) * 22 + r.signed(2);
            const z = -14 - Math.floor(i / 4) * 24 + r.signed(3);
            const y = floor + 0.6 + (i % 2) * 1.3;
            batch.add(materials.foam, new THREE.CylinderGeometry(mm(10.5), mm(10.5), mm(1.2), 28), { position: at(x, y, z) });
            batch.add(materials.gold, new THREE.CylinderGeometry(mm(2.4), mm(2.4), mm(1.6), 14), { position: at(x, y + 1.2, z) });
        }
    }
}

export function buildOrganiser(ctx) {
    const art = artContext(ctx);
    const group = new THREE.Group();
    group.name = 'bench-organiser';
    group.position.set(...at(ORGANISER.x, MAT_TOP, ORGANISER.z));
    group.rotation.y = ORGANISER.yaw;
    const { w, h, d, wall } = ORGANISER;
    const frame = standard('#3c4450', { roughness: 0.5 });
    const trayMat = standard('#dcdedb', { roughness: 0.5 });
    const shell = createBatch();
    shell.add(frame, box(w, wall, d), { position: at(0, h - wall / 2, 0) });
    shell.add(frame, box(w, wall, d), { position: at(0, wall / 2, 0) });
    shell.add(frame, box(wall, h, d), { position: at(-w / 2 + wall / 2, h / 2, 0) });
    shell.add(frame, box(wall, h, d), { position: at(w / 2 - wall / 2, h / 2, 0) });
    shell.add(frame, box(w, h, wall), { position: at(0, h / 2, -d / 2 + wall / 2) });
    for (let i = 1; i < ORGANISER.drawers.length; i += 1) {
        const y = drawerCentreY(i - 1) - MAT_TOP - DRAWER.pitch / 2;
        shell.add(frame, box(w - 2 * wall, 0.9, d - wall), { position: at(0, y, wall / 2) });
    }
    // Four little rubber feet.
    group.add(shell.build('bench-organiser-shell'));

    const materials = {
        beige: standard('#d8c39a', { roughness: 0.6 }),
        wire: standard('#bdbdb8', { roughness: 0.35, metalness: 0.8 }),
        brown: standard('#6b3f1f', { roughness: 0.6 }),
        black: standard('#161617', { roughness: 0.5 }),
        red: standard('#c52b2b', { roughness: 0.5 }),
        orange: standard('#e07a24', { roughness: 0.5 }),
        yellow: standard('#e2c23a', { roughness: 0.5 }),
        green: standard('#2f8a4e', { roughness: 0.5 }),
        blue: standard('#2f63b8', { roughness: 0.5 }),
        gold: standard('#d2ad5c', { roughness: 0.35, metalness: 0.85 }),
        foam: standard('#f1f1ee', { roughness: 0.95 })
    };
    const drawers = [];
    ORGANISER.drawers.forEach((slug, index) => {
        const drawer = new THREE.Group();
        drawer.name = `bench-drawer-${slug}`;
        const cy = drawerCentreY(index) - MAT_TOP;
        const closedZ = d / 2 - DRAWER.frontT / 2 + 0.4;
        drawer.position.set(0, mm(cy), mm(closedZ));
        const front = painted(ctx, [DRAWER_FRONT.w, DRAWER_FRONT.h], { framing: [0.4, 0.07], oversample: 1.5 }, (g, W, H) => drawDrawerFront(g, W, H, slug, art));
        const frontFace = standard('#ffffff', { roughness: 0.5, map: front.texture });
        const frontMesh = new THREE.Mesh(box(DRAWER.frontW, DRAWER.frontH, DRAWER.frontT), [trayMat, trayMat, trayMat, trayMat, frontFace, trayMat]);
        frontMesh.castShadow = true;
        frontMesh.receiveShadow = true;
        drawer.add(frontMesh);
        const tray = createBatch();
        const { trayW, trayH, trayD, wall: tw } = DRAWER;
        const baseY = -DRAWER.frontH / 2 + 0.3;
        const z0 = -DRAWER.frontT / 2;
        tray.add(trayMat, box(trayW, tw, trayD), { position: at(0, baseY + tw / 2, z0 - trayD / 2) });
        tray.add(trayMat, box(tw, trayH, trayD), { position: at(-trayW / 2 + tw / 2, baseY + trayH / 2, z0 - trayD / 2) });
        tray.add(trayMat, box(tw, trayH, trayD), { position: at(trayW / 2 - tw / 2, baseY + trayH / 2, z0 - trayD / 2) });
        tray.add(trayMat, box(trayW, trayH, tw), { position: at(0, baseY + trayH / 2, z0 - trayD + tw / 2) });
        // The finger pull under the label.
        tray.add(trayMat, box(18, 1.4, 3), { position: at(0, -DRAWER.frontH / 2 + 1.6, DRAWER.frontT / 2 + 1.5) });
        const contents = createBatch();
        const inner = new THREE.Group();
        inner.position.set(0, mm(baseY), mm(z0));
        fillDrawer(slug, contents, materials, ctx);
        inner.add(contents.build(`bench-drawer-${slug}-contents`));
        drawer.add(tray.build(`bench-drawer-${slug}-tray`), inner);
        let slip = null;
        if (slug === 'next') {
            const face = painted(ctx, [30, 20], { framing: [0.1, 0.07], oversample: 1.5 }, (g, W, H) => drawSlip(g, W, H, art));
            slip = ctx.paperSheet({ width: mm(30), height: mm(20), thickness: mm(0.2), front: face.texture });
            slip.rotation.set(-Math.PI / 2, 0, 0.12);
            slip.position.set(mm(-8), mm(baseY + tw + 0.15), mm(z0 - 30));
            drawer.add(slip);
        }
        const meshes = [];
        drawer.traverse((node) => { if (node.isMesh) meshes.push(node); });
        group.add(drawer);
        drawers.push({ slug, index, group: drawer, closedZ: mm(closedZ), openZ: mm(closedZ + ORGANISER.pull), meshes, front, open: false, anim: null });
    });
    const meshes = [];
    group.traverse((node) => { if (node.isMesh) meshes.push(node); });
    return { group, drawers, meshes };
}
