import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KEYBOARD, WRIST_REST, COLORS, keyList, mm } from './layout.js';

/**
 * The white low-profile keyboard and the black fabric wrist rest in front of
 * it — the real desk's (from a photo of it). Built into the 'keyboard' desk group
 * (whose .glb this module switches off; see index.js), keyboard-local: x right,
 * z toward the visitor, y up from the desk.
 *
 * THE KEYCAPS ARE ONE MERGED MESH, NOT AN InstancedMesh. Both are one draw
 * call; the merged mesh is the one that can do this job without a shader
 * patch: every cap is tapered by the same absolute 1.2 mm (instancing one cap
 * and scaling it would stretch the taper across a 6.25u space bar), and every
 * cap's top carries its own UVs into one legend canvas, so the legends are on
 * the caps themselves rather than on a floating decal. 84 caps × 10 triangles.
 *
 * The frame is a light-grey DIELECTRIC, not metalness 1: a metal top faces the
 * ceiling panel of this room's environment (dim by day) and would render as a
 * dark grey slab; the real board reads as pale. Fabric gets a little sheen.
 */

/**
 * The caps: tapered boxes (no bottom face), keyboard-local, with the top face's
 * UVs mapped into the legend canvas (canvas top = the keyboard's back edge) and
 * the sides' UVs parked on a blank bezel texel.
 */
function buildCapGeometry(keys) {
    const { widthMm, depthMm, caseHeightMm, cap } = KEYBOARD;
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const uvOf = (xMm, zMm) => [(xMm + widthMm / 2) / widthMm, 1 - (zMm + depthMm / 2) / depthMm];
    const blank = uvOf(-widthMm / 2 + 0.8, -depthMm / 2 + 0.8);
    const y0 = mm(caseHeightMm);
    const y1 = mm(caseHeightMm + cap.heightMm);

    const quad = (corners, normal, uvList) => {
        const start = positions.length / 3;
        corners.forEach((c, i) => {
            positions.push(c[0], c[1], c[2]);
            normals.push(normal.x, normal.y, normal.z);
            uvs.push(...uvList[i]);
        });
        indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    };

    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    const n = new THREE.Vector3();
    const faceNormal = (a, b, c) => {
        e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        e2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
        return n.crossVectors(e1, e2).normalize().clone();
    };

    for (const key of keys) {
        const hw = (key.w - cap.gapMm) / 2;          // bottom half-width, mm
        const hd = (19.05 - cap.gapMm) / 2;          // bottom half-depth
        const tw = hw - cap.insetMm;                 // top
        const td = hd - cap.insetMm;
        const b = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [mm(key.x + x), y0, mm(key.z + z)]);
        const t = [[-tw, -td], [tw, -td], [tw, td], [-tw, td]].map(([x, z]) => [mm(key.x + x), y1, mm(key.z + z)]);
        const topUv = [[-tw, -td], [tw, -td], [tw, td], [-tw, td]].map(([x, z]) => uvOf(key.x + x, key.z + z));
        // Top (counter-clockwise seen from above: back-left, back-right… wound for +Y).
        const top = [t[3], t[2], t[1], t[0]];
        quad(top, new THREE.Vector3(0, 1, 0), [topUv[3], topUv[2], topUv[1], topUv[0]]);
        // Four sides, each wound to face outward.
        const sides = [
            [b[0], t[0], t[1], b[1]], // back (-z)
            [b[1], t[1], t[2], b[2]], // right (+x)
            [b[2], t[2], t[3], b[3]], // front (+z)
            [b[3], t[3], t[0], b[0]]  // left (-x)
        ];
        for (const side of sides) quad(side, faceNormal(side[0], side[1], side[2]), [blank, blank, blank, blank]);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
}

function drawArrow(g, cx, cy, size, direction) {
    const r = size / 2;
    const turns = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };
    g.save();
    g.translate(cx, cy);
    g.rotate(turns[direction] ?? 0);
    g.beginPath();
    g.moveTo(0, -r);
    g.lineTo(r * 0.85, r * 0.6);
    g.lineTo(-r * 0.85, r * 0.6);
    g.closePath();
    g.fill();
    g.restore();
}

/** Paints every legend into the canvas, in keyboard millimetres. */
function paintLegends(surface, keys, fonts) {
    const { g, width, height } = surface;
    const { cap } = KEYBOARD;
    g.save();
    g.fillStyle = COLORS.keycap;
    g.fillRect(0, 0, width, height);
    g.fillStyle = COLORS.legend;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const key of keys) {
        const cx = key.x + width / 2;
        const cy = key.z + height / 2;
        if (key.options.arrow) {
            drawArrow(g, cx, cy, 2.6, key.options.arrow);
            continue;
        }
        if (!key.legend) continue;
        const small = key.options.small || key.legend.length > 1;
        g.font = fonts.font({ face: 'inter', size: small ? 2.25 : 4.4, weight: small ? 500 : 500 });
        const maxWidth = key.w - cap.gapMm - 2 * cap.insetMm - 1.4;
        g.fillText(key.legend, cx, cy + (small ? 0 : 0.15), maxWidth);
    }
    g.restore();
}

/** A rounded rectangle in the XY plane, centred. */
function roundedRect(width, depth, radius) {
    const shape = new THREE.Shape();
    const x = -width / 2;
    const y = -depth / 2;
    shape.moveTo(x + radius, y);
    shape.lineTo(x + width - radius, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + radius);
    shape.lineTo(x + width, y + depth - radius);
    shape.quadraticCurveTo(x + width, y + depth, x + width - radius, y + depth);
    shape.lineTo(x + radius, y + depth);
    shape.quadraticCurveTo(x, y + depth, x, y + depth - radius);
    shape.lineTo(x, y + radius);
    shape.quadraticCurveTo(x, y, x + radius, y);
    return shape;
}

/**
 * @param {object} ctx the module's ctx (for the legend canvas and fonts)
 * @param {THREE.Group} group the 'keyboard' desk group
 * @returns {{ meshes: THREE.Mesh[], triangles: number, dispose(): void }}
 */
export function buildKeyboard(ctx, group) {
    const keys = keyList();
    const meshes = [];

    const caseMesh = new THREE.Mesh(
        new RoundedBoxGeometry(KEYBOARD.width, KEYBOARD.caseHeight, KEYBOARD.depth, 2, mm(KEYBOARD.caseRadiusMm)),
        new THREE.MeshStandardMaterial({ color: COLORS.keyboardCase, roughness: 0.42, metalness: 0 })
    );
    caseMesh.position.y = KEYBOARD.caseHeight / 2;
    caseMesh.name = 'keyboard:case';
    meshes.push(caseMesh);

    const capMaterial = new THREE.MeshStandardMaterial({ color: COLORS.keycap, roughness: 0.58, metalness: 0 });
    let texture = null;
    try {
        // The keyboard's largest appearance is the corner of the #printer shot
        // (≈ 0.25 of the frame height across its depth); legends are the
        // subtlest type in the room, so this is budgeted low.
        const surface = ctx.makeCanvas(KEYBOARD.widthMm, KEYBOARD.depthMm, { framing: [0.6, 0.6 * KEYBOARD.depthMm / KEYBOARD.widthMm] });
        texture = ctx.canvasTexture(surface.canvas);
        ctx.fonts.paint(() => {
            paintLegends(surface, keys, ctx.fonts);
            texture.needsUpdate = true;
            ctx.invalidate();
        });
        capMaterial.map = texture;
        capMaterial.color.set(0xffffff); // the canvas carries the cap colour
    } catch (error) {
        ctx.warn('keyboard legends unavailable; plain caps', error);
    }
    const capMesh = new THREE.Mesh(buildCapGeometry(keys), capMaterial);
    capMesh.name = 'keyboard:caps';
    meshes.push(capMesh);

    const { shape, bevel, core, localZ } = WRIST_REST;
    const extruded = new THREE.ExtrudeGeometry(roundedRect(shape.width, shape.depth, shape.radius), {
        depth: core,
        bevelEnabled: true,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: 4,
        curveSegments: 10
    });
    extruded.rotateX(-Math.PI / 2);        // extrusion (+Z) → up (+Y); plan y → -z
    extruded.translate(0, bevel, localZ);  // bottom bevel onto the desk
    // ExtrudeGeometry is flat-shaded (non-indexed, one normal per face): weld it
    // by position and re-derive the normals so the foam's rounded edge is smooth.
    extruded.deleteAttribute('normal');
    extruded.deleteAttribute('uv');
    const restGeometry = mergeVertices(extruded, 1e-5);
    extruded.dispose();
    restGeometry.computeVertexNormals();
    const rest = new THREE.Mesh(restGeometry, new THREE.MeshPhysicalMaterial({
        color: COLORS.wristRest,
        roughness: 0.9,
        metalness: 0,
        sheen: 0.6,
        sheenRoughness: 0.55,
        sheenColor: new THREE.Color(0x5c5c5c)
    }));
    rest.name = 'keyboard:wrist-rest';
    meshes.push(rest);

    for (const mesh of meshes) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
    }

    const triangles = meshes.reduce((sum, mesh) => {
        const g = mesh.geometry;
        return sum + (g.index ? g.index.count : g.attributes.position.count) / 3;
    }, 0);

    return {
        meshes,
        triangles,
        keys: keys.length,
        dispose() {
            for (const mesh of meshes) {
                group.remove(mesh);
                mesh.geometry.dispose();
                mesh.material.dispose();
            }
            texture?.dispose();
        }
    };
}
