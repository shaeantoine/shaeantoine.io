import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
    MM, mm, MAT, MAT_TOP, BOARD, BOARD_TOP, AD8232, AD8232_TOP, JACK, PLUG,
    TEENSY, TEENSY_TOP, LED, PADS, PAD_R, PAD_T, PAD_TOP, SNAP, CABLE_R, LEAD_R, SPLITTER,
    MAIN_CABLE, LEADS, TAG, TAG_STRING_EXIT, STRING_R, STRING_LENGTH
} from './layout.js';
import { drapedPath, cornerLoopPoints, stringTail, stringLengthFor, footprint, KNOT } from './drape.js';
import {
    drawMat, drawBreadboard, drawAD8232, drawTeensy, drawChipTop, drawPad, drawTagFront, drawTagBack,
    MANILA, CANVAS_SIZES
} from './art.js';

/**
 * Builds the bench's meshes (everything but the mat itself, which is a
 * deskObjects part so it exists — and gives the bench its hitbox — before any
 * module mounts; see index.js). All positions are group-local, in mm × MM.
 *
 * Untextured parts that share a material are merged into one mesh each, so the
 * dozens of little pieces (headers, chips, the jack, snaps, leads) cost a
 * handful of draw calls rather than one each.
 */

const Y = new THREE.Vector3(0, 1, 0);

/** The breadboard's texel density at its closest shot (≈ 0.8 frame heights wide), shared by the boards. */
const BOARD_FRAMING = 0.8;
const framingFor = (widthMm, depthMm, scale = 1) => [
    (widthMm / BOARD.w) * BOARD_FRAMING * scale,
    (depthMm / BOARD.w) * BOARD_FRAMING * scale
];

function standard(color, { roughness = 0.6, metalness = 0, ...rest } = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...rest });
}

/** A box whose +Y face carries `top` (materials: +x, -x, +y, -y, +z, -z). */
function topFaced(side, top) {
    return [side, side, top, side, side, side];
}

/** Collects static geometry per material, then merges it: one mesh per material. */
function createBatch() {
    const buckets = new Map();
    return {
        add(material, geometry, { position = [0, 0, 0], quaternion, rotation, scale } = {}) {
            const g = geometry; // every primitive used here is indexed, with position/normal/uv
            const matrix = new THREE.Matrix4();
            const q = quaternion ?? (rotation ? new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)) : new THREE.Quaternion());
            const s = scale ? new THREE.Vector3(...(Array.isArray(scale) ? scale : [scale, scale, scale])) : new THREE.Vector3(1, 1, 1);
            matrix.compose(new THREE.Vector3(...position), q, s);
            g.applyMatrix4(matrix);
            if (!buckets.has(material)) buckets.set(material, []);
            buckets.get(material).push(g);
        },
        build(name) {
            const group = new THREE.Group();
            group.name = name;
            for (const [material, geometries] of buckets) {
                const merged = mergeGeometries(geometries.map((g) => {
                    // mergeGeometries needs identical attribute sets; drop groups.
                    g.clearGroups();
                    return g;
                }), false);
                geometries.forEach((g) => g.dispose());
                if (!merged) continue;
                const mesh = new THREE.Mesh(merged, material);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                group.add(mesh);
            }
            buckets.clear();
            return group;
        }
    };
}

const at = (x, y, z) => [mm(x), mm(y), mm(z)];
const boxGeometry = (w, h, d) => new THREE.BoxGeometry(mm(w), mm(h), mm(d));

function horizontalQuaternion(dx, dz) {
    // CylinderGeometry's axis is +Y; lay it along (dx, 0, dz).
    return new THREE.Quaternion().setFromUnitVectors(Y, new THREE.Vector3(dx, 0, dz).normalize());
}

function tube(points, radius, { closed = false, segments, radial = 6 } = {}) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => p.clone().multiplyScalar(MM)), closed, 'centripetal');
    return new THREE.TubeGeometry(curve, segments ?? Math.max(16, points.length * 2), mm(radius), radial, closed);
}

// ---------------------------------------------------------------------------
// Painted surfaces
// ---------------------------------------------------------------------------

/**
 * A canvas + texture drawn in mm, painted through ctx.paint: drawn now and
 * again when the fonts land, so its text (the tag's Shae Hand, the boards'
 * silkscreen) never stays in a fallback font.
 */
function paintedTexture(ctx, [w, h], options, paint) {
    const surface = ctx.makeCanvas(w, h, options);
    const texture = ctx.canvasTexture(surface.canvas);
    const result = { texture, surface, info: null };
    (ctx.paint ?? ctx.fonts.paint)(() => {
        surface.clear();
        result.info = paint(surface.g, w, h) ?? null;
        texture.needsUpdate = true;
    });
    return result;
}

function artContext(ctx) {
    return { palette: ctx.palette, draw: ctx.draw, fonts: ctx.fonts, rng: ctx.rng, drawNote: ctx.drawNote };
}

/** Upgrades the deskObjects mat part (plain green) with its printed grid and a darker core at the edges. */
export function dressMat(ctx, matMesh) {
    const art = artContext(ctx);
    // At 34° the mat's near half comes to ≈ 0.6 from the lens (frame bottom): a finer grid
    // than v1's [1.2, 0.78] needed from 50° above. 4.4 MP at an 1800 px buffer (was 3.0);
    // the smaller held tag gives 1 MP of that back.
    const { texture } = paintedTexture(ctx, [MAT.w, MAT.d], { framing: [1.45, 0.94], oversample: 1 }, (g, w, h) => drawMat(g, w, h, art));
    const base = Array.isArray(matMesh.material) ? matMesh.material[0] : matMesh.material;
    const top = base.clone();
    top.color.set('#ffffff');
    top.map = texture;
    top.roughness = 0.82;
    const edge = base.clone();
    edge.color.set('#223f37');
    edge.roughness = 0.9;
    matMesh.material = topFaced(edge, top);
    return texture;
}

// ---------------------------------------------------------------------------
// The rig: breadboard, AD8232, Teensy, pads, plug and leads
// ---------------------------------------------------------------------------

export function buildRig(ctx) {
    const art = artContext(ctx);
    const rig = new THREE.Group();
    rig.name = 'bench-rig';
    const textures = [];
    const add = (mesh) => {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        rig.add(mesh);
        return mesh;
    };

    const white = standard('#f0eee7', { roughness: 0.55 });
    const black = standard('#161617', { roughness: 0.5 });
    const silver = standard('#d2d2d0', { roughness: 0.32, metalness: 0.9 });
    const brass = standard('#c9a458', { roughness: 0.35, metalness: 0.85 });
    const grey = standard('#c3c3c0', { roughness: 0.55 });
    const teal = standard('#1f9a8b', { roughness: 0.42 });
    const cream = standard('#e9e3d3', { roughness: 0.5 });
    const foam = standard('#f1f1ee', { roughness: 0.95 });

    // Breadboard.
    const boardArt = paintedTexture(ctx, CANVAS_SIZES.board, { framing: framingFor(BOARD.w, BOARD.d) }, (g, w, h) => drawBreadboard(g, w, h, art));
    textures.push(boardArt.texture);
    const boardTop = standard('#ffffff', { roughness: 0.55, map: boardArt.texture });
    const board = add(new THREE.Mesh(boxGeometry(BOARD.w, BOARD.h, BOARD.d), topFaced(white, boardTop)));
    board.position.set(...at(BOARD.x, MAT_TOP + BOARD.h / 2, BOARD.z));
    board.name = 'breadboard';

    const batch = createBatch();
    // Dovetail tabs on the front edge (eeg.jpg: at rows ~6 and ~34).
    for (const x of [BOARD.x - 68, BOARD.x + 2.8]) {
        batch.add(white, boxGeometry(6, 5.5, 2.4), { position: at(x, MAT_TOP + 3.6, BOARD.z + BOARD.d / 2 + 1.2) });
    }

    // AD8232 breakout.
    const adArt = paintedTexture(ctx, CANVAS_SIZES.ad8232, { framing: framingFor(AD8232.w, AD8232.d), oversample: 1.6 }, (g, w, h) => drawAD8232(g, w, h, art));
    textures.push(adArt.texture);
    const red = standard('#c42330', { roughness: 0.42 });
    const adTop = standard('#ffffff', { roughness: 0.42, map: adArt.texture });
    const ad = add(new THREE.Mesh(boxGeometry(AD8232.w, AD8232.t, AD8232.d), topFaced(red, adTop)));
    ad.position.set(...at(AD8232.x, AD8232.y + AD8232.t / 2, AD8232.z));
    ad.name = 'ad8232';
    // Header on top along the front edge, six pin tips.
    const headerX = AD8232.x - 1.7;
    const headerZ = AD8232.z + AD8232.d / 2 - 2.5;
    batch.add(black, boxGeometry(6 * 2.54, 2.5, 2.5), { position: at(headerX, AD8232_TOP + 1.25, headerZ) });
    for (let i = 0; i < 6; i += 1) {
        batch.add(brass, boxGeometry(0.64, 0.7, 0.64), { position: at(headerX + (i - 2.5) * 2.54, AD8232_TOP + 2.85, headerZ) });
    }
    // Pins below the board edge, into the breadboard (seen from the side).
    for (let i = 0; i < 6; i += 1) {
        batch.add(brass, boxGeometry(0.64, 1.0, 0.64), { position: at(headerX + (i - 2.5) * 2.54, BOARD_TOP + 0.5, headerZ) });
    }
    // The AD8232 itself, and the 3.5 mm jack with its collar.
    batch.add(black, boxGeometry(4, 0.9, 4), { position: at(AD8232.x + 5, AD8232_TOP + 0.45, AD8232.z + 2) });
    const jackBack = AD8232.z - AD8232.d / 2;
    batch.add(black, boxGeometry(6, 5, 12), { position: at(JACK.x, AD8232_TOP + 2.5, jackBack + 6 - 1) });
    batch.add(silver, new THREE.CylinderGeometry(mm(3.1), mm(3.1), mm(PLUG.collarLength), 20), {
        position: at(JACK.x, JACK.axisY, PLUG.collarZ), quaternion: horizontalQuaternion(0, 1)
    });
    // The plug: moulded grey body, then a tapering strain relief.
    batch.add(grey, new THREE.CylinderGeometry(mm(PLUG.bodyR), mm(PLUG.bodyR), mm(PLUG.bodyLength), 24), {
        position: at(PLUG.x, PLUG.y, PLUG.bodyStart - PLUG.bodyLength / 2), quaternion: horizontalQuaternion(0, 1)
    });
    for (let i = 0; i < 4; i += 1) {
        // Grip ridges.
        batch.add(grey, new THREE.CylinderGeometry(mm(PLUG.bodyR + 0.35), mm(PLUG.bodyR + 0.35), mm(1.2), 24), {
            position: at(PLUG.x, PLUG.y, PLUG.bodyStart - 3 - i * 3), quaternion: horizontalQuaternion(0, 1)
        });
    }
    batch.add(grey, new THREE.CylinderGeometry(mm(CABLE_R + 0.3), mm(3.0), mm(PLUG.reliefLength), 18), {
        // CylinderGeometry: radiusTop at +Y. Point +Y down the cable (-z) so the thin end leads out.
        position: at(PLUG.x, PLUG.y, PLUG.bodyStart - PLUG.bodyLength - PLUG.reliefLength / 2), quaternion: horizontalQuaternion(0, -1)
    });

    // Teensy 4.1.
    const teensyArt = paintedTexture(ctx, CANVAS_SIZES.teensy, { framing: framingFor(TEENSY.w, TEENSY.d), oversample: 1.6 }, (g, w, h) => drawTeensy(g, w, h, art));
    textures.push(teensyArt.texture);
    const green = standard('#2a7359', { roughness: 0.42 });
    const teensyTop = standard('#ffffff', { roughness: 0.42, map: teensyArt.texture });
    const teensy = add(new THREE.Mesh(boxGeometry(TEENSY.w, TEENSY.t, TEENSY.d), topFaced(green, teensyTop)));
    teensy.position.set(...at(TEENSY.x, TEENSY.y + TEENSY.t / 2, TEENSY.z));
    teensy.name = 'teensy';
    for (const side of [-1, 1]) {
        batch.add(black, boxGeometry(TEENSY.w, 2.5, 2.5), { position: at(TEENSY.x, BOARD_TOP + 1.25, TEENSY.z + side * (TEENSY.d / 2 - 1.27)) });
    }
    const tl = (x, z) => [TEENSY.x + x, TEENSY.z + z];
    {
        const [x, z] = tl(-TEENSY.w / 2 + 2.8 - 0.8, 0);
        batch.add(silver, boxGeometry(5.6, 2.6, 7.6), { position: at(x, TEENSY_TOP + 1.3, z) }); // micro-USB
    }
    {
        const [x, z] = tl(-20.5, -4.7);
        batch.add(black, boxGeometry(4, 0.9, 4), { position: at(x, TEENSY_TOP + 0.45, z) });
    }
    {
        const [x, z] = tl(12.7, 2);
        batch.add(black, boxGeometry(3, 0.8, 3), { position: at(x, TEENSY_TOP + 0.4, z) });
    }
    {
        const [x, z] = tl(15.3, -3);
        batch.add(cream, boxGeometry(3.4, 1.3, 3), { position: at(x, TEENSY_TOP + 0.65, z) }); // the program button
        batch.add(cream, new THREE.CylinderGeometry(mm(0.9), mm(0.9), mm(0.5), 14), { position: at(x, TEENSY_TOP + 1.55, z) });
    }
    {
        const [x, z] = tl(25, 0);
        batch.add(silver, boxGeometry(11, 1.6, 12.5), { position: at(x, TEENSY_TOP + 0.8, z) }); // microSD socket
    }
    // The i.MX RT1062, with its etched top.
    const chipArt = paintedTexture(ctx, CANVAS_SIZES.chip, { framing: framingFor(10, 10), oversample: 2 }, (g, w, h) => drawChipTop(g, w, h, art));
    textures.push(chipArt.texture);
    const chipTop = standard('#ffffff', { roughness: 0.5, map: chipArt.texture });
    const chip = add(new THREE.Mesh(boxGeometry(10, 1.2, 10), topFaced(black, chipTop)));
    chip.position.set(...at(TEENSY.x, TEENSY_TOP + 0.6, TEENSY.z - 1));

    // The LED: unlit material (so the hover tint never touches it), HDR orange when on.
    const ledMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.32, 0.2, 0.08) });
    const led = add(new THREE.Mesh(boxGeometry(LED.w, LED.h, LED.d), ledMaterial));
    led.position.set(...at(LED.x, TEENSY_TOP + LED.h / 2, LED.z));
    led.castShadow = false;
    led.name = 'teensy-led';

    // Electrode pads with snaps and their teal connectors.
    PADS.forEach((pad, index) => {
        const padArt = paintedTexture(ctx, CANVAS_SIZES.pad, { framing: framingFor(44, 44), oversample: 1.2 },
            (g, size) => drawPad(g, size, { printedLiner: pad.id === 'c', seed: `pad-${pad.id}`, rng: ctx.rng }));
        textures.push(padArt.texture);
        const top = standard('#ffffff', { roughness: 0.92, map: padArt.texture });
        const disc = add(new THREE.Mesh(new THREE.CylinderGeometry(mm(PAD_R), mm(PAD_R), mm(PAD_T), 56), [foam, top, foam]));
        disc.position.set(...at(pad.x, MAT_TOP + PAD_T / 2, pad.z));
        // A pad is peeled off a liner, not placed square: a small seeded twist.
        disc.rotation.y = (index * 1.7) % Math.PI;
        batch.add(brass, new THREE.CylinderGeometry(mm(5.4), mm(5.4), mm(0.5), 28), { position: at(pad.x, PAD_TOP + 0.25, pad.z) });
        batch.add(teal, new THREE.CylinderGeometry(mm(SNAP.capR - 0.7), mm(SNAP.capR), mm(SNAP.capH), 28), {
            position: at(pad.x, PAD_TOP + 0.5 + SNAP.capH / 2, pad.z)
        });
        batch.add(teal, new THREE.SphereGeometry(mm(SNAP.capR - 0.7), 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), {
            position: at(pad.x, PAD_TOP + 0.5 + SNAP.capH, pad.z), scale: [1, 0.35, 1]
        });
        const dx = Math.cos(pad.connector);
        const dz = -Math.sin(pad.connector);
        batch.add(teal, new THREE.CylinderGeometry(mm(LEAD_R + 0.9), mm(3.1), mm(SNAP.sleeveLength), 18), {
            position: at(pad.x + dx * (SNAP.capR + SNAP.sleeveLength / 2 - 1.5), SNAP.sleeveY, pad.z + dz * (SNAP.capR + SNAP.sleeveLength / 2 - 1.5)),
            quaternion: horizontalQuaternion(dx, dz)
        });
    });

    // Leads: the main cable from the plug droops to the mat, loops, and splits three ways.
    const splitterY = MAT_TOP + SPLITTER.r;
    batch.add(grey, tube(drapedPath(MAIN_CABLE, CABLE_R, {
        start: { y: PLUG.y, length: 24 },
        end: { y: splitterY, length: 8 }
    }), CABLE_R, { radial: 8 }));
    {
        const [fx, fz] = SPLITTER.from;
        const [tx, tz] = SPLITTER.to;
        const length = Math.hypot(tx - fx, tz - fz);
        batch.add(grey, new THREE.CapsuleGeometry(mm(SPLITTER.r), mm(length - 2 * SPLITTER.r), 4, 14), {
            position: at((fx + tx) / 2, splitterY, (fz + tz) / 2), quaternion: horizontalQuaternion(tx - fx, tz - fz)
        });
    }
    for (const lead of LEADS) {
        batch.add(grey, tube(drapedPath(lead.points, LEAD_R, {
            start: { y: splitterY, length: 8 },
            end: { y: SNAP.sleeveY, length: 14 }
        }), LEAD_R, { radial: 7 }));
    }

    // String round the board's corner, and the knot.
    const stringMaterial = standard('#ece4d2', { roughness: 0.95 });
    batch.add(stringMaterial, tube(cornerLoopPoints(), STRING_R, { closed: true, segments: 40, radial: 5 }));
    batch.add(stringMaterial, new THREE.SphereGeometry(mm(1.25), 10, 8), { position: [KNOT.x * MM, KNOT.y * MM, KNOT.z * MM] });

    rig.add(batch.build('bench-batched'));

    return { rig, led, ledMaterial, stringMaterial, textures };
}

// ---------------------------------------------------------------------------
// The tag
// ---------------------------------------------------------------------------

function tagShape() {
    const w = mm(TAG.w) / 2;
    const h = mm(TAG.h) / 2;
    const c = mm(TAG.clip);
    const shape = new THREE.Shape();
    shape.moveTo(-w, -h);
    shape.lineTo(w - c, -h);
    shape.lineTo(w, -h + c);
    shape.lineTo(w, h - c);
    shape.lineTo(w - c, h);
    shape.lineTo(-w, h);
    shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(mm(TAG.holeX), 0, mm(TAG.holeR), 0, Math.PI * 2, true);
    shape.holes.push(hole);
    return shape;
}

function planarUV(geometry, mirror) {
    const w = mm(TAG.w);
    const h = mm(TAG.h);
    const position = geometry.attributes.position;
    const uv = new Float32Array(position.count * 2);
    for (let i = 0; i < position.count; i += 1) {
        const x = position.getX(i);
        const y = position.getY(i);
        uv[i * 2] = mirror ? (w / 2 - x) / w : (x + w / 2) / w;
        uv[i * 2 + 1] = (y + h / 2) / h;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/**
 * The tag: an upright card (front = local +Z, top = local +Y — poseInFront's
 * convention) with a real hole and clipped corners at its +x end, a
 * lark's-head loop of string round that end, in a pivot group the module poses.
 */
export function buildTag(ctx, stringMaterial) {
    const art = artContext(ctx);
    const pivot = new THREE.Group();
    pivot.name = 'bench-tag';
    const framing = { fill: 0.30, oversample: 1.4 }; // held at 0.27 of the frame height (layout.js HAND)
    const front = paintedTexture(ctx, CANVAS_SIZES.tag, framing, (g, w, h) => drawTagFront(g, w, h, art));
    const back = paintedTexture(ctx, CANVAS_SIZES.tag, framing, (g, w, h) => drawTagBack(g, w, h, art));

    const shape = tagShape();
    const t = mm(TAG.t);
    const frontGeometry = new THREE.ShapeGeometry(shape, 16);
    planarUV(frontGeometry, false);
    const backGeometry = frontGeometry.clone();
    planarUV(backGeometry, true);

    const card = { roughness: 0.9, metalness: 0 };
    // A single-sided plane only casts from its back by default (three's shadowSide); the card
    // must shadow the mat whichever way up it is, so cast from both.
    const frontMesh = new THREE.Mesh(frontGeometry, standard('#ffffff', { ...card, map: front.texture, shadowSide: THREE.DoubleSide }));
    frontMesh.position.z = t / 2;
    frontMesh.castShadow = true;
    frontMesh.receiveShadow = true;
    const backMesh = new THREE.Mesh(backGeometry, standard('#ffffff', { ...card, map: back.texture, side: THREE.BackSide }));
    backMesh.position.z = -t / 2;
    backMesh.receiveShadow = true;
    const edgeGeometry = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 16 });
    edgeGeometry.translate(0, 0, -t / 2);
    const edgeMesh = new THREE.Mesh(edgeGeometry, [new THREE.MeshBasicMaterial({ visible: false }), standard(MANILA, { roughness: 0.95 })]);
    edgeMesh.castShadow = true;
    pivot.add(frontMesh, backMesh, edgeMesh);

    // Lark's head: a flattened loop through the hole and round the end.
    const loopRadius = (TAG.w / 2 - TAG.holeX) / 2 + 0.05; // half the hole→end distance
    const loopGeometry = new THREE.TorusGeometry(mm(loopRadius), mm(STRING_R), 6, 28);
    loopGeometry.rotateX(Math.PI / 2);
    loopGeometry.scale(1, 1, 0.28);
    const loop = new THREE.Mesh(loopGeometry, stringMaterial);
    loop.position.x = mm((TAG.holeX + TAG.w / 2) / 2);
    loop.castShadow = true;
    pivot.add(loop);

    return {
        pivot,
        meshes: [frontMesh, backMesh, edgeMesh],
        textures: [front.texture, back.texture],
        fits: () => ({ front: front.info, back: back.info })
    };
}

// ---------------------------------------------------------------------------
// The string's tail (rebuilt whenever the tag moves)
// ---------------------------------------------------------------------------

export function createTail(stringMaterial) {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), stringMaterial);
    mesh.name = 'bench-tag-string';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const exit = new THREE.Vector3();
    const out = new THREE.Vector3();
    const axisX = new THREE.Vector3();
    let last = null;

    /** Re-solve the tail for the tag pivot's current (group-local) transform. */
    function update(pivot) {
        exit.set(...TAG_STRING_EXIT.map(mm)).applyQuaternion(pivot.quaternion).add(pivot.position).multiplyScalar(1 / MM);
        out.set(1, 0, 0).applyQuaternion(pivot.quaternion);
        let tagFootprint = null;
        if (pivot.position.y < mm(MAT_TOP + 3)) {
            axisX.set(1, 0, 0).applyQuaternion(pivot.quaternion);
            tagFootprint = footprint({ x: pivot.position.x / MM, z: pivot.position.z / MM, yaw: Math.atan2(-axisX.z, axisX.x) }, TAG.w, TAG.h);
        }
        const solved = stringTail(exit, out, stringLengthFor(exit, STRING_LENGTH), { tag: tagFootprint });
        const geometry = tube(solved.points, STRING_R, { segments: 56, radial: 5 });
        mesh.geometry.dispose();
        mesh.geometry = geometry;
        last = solved;
        return solved;
    }

    return { mesh, update, last: () => last };
}

