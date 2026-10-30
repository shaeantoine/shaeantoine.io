import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { LAMP, COLORS, lampLocal } from './layout.js';

/**
 * The lamp's meshes and light (layout.js has every number). Built in the lamp
 * group's local frame — the group sits at the base's centre, unrotated.
 *
 * Three draw calls: every black part merged into one mesh, the steel (springs
 * and knuckle bolts) into another, and the diffuser strip on its own, because
 * it is the one surface that changes. The strip is a MeshBasicMaterial on
 * purpose: DeskScene's hover tint saves and restores each material's emissive
 * (colour AND intensity) the first time it is hovered, so an emissive strip
 * that was off at the first hover would be switched back off by every
 * un-hover after that. A basic material has no emissive; the tint skips it.
 *
 * The light is a SpotLight without a shadow map, always in the scene and faded
 * by intensity alone — toggling `visible` (or adding it on first use) changes
 * the scene's light count, which recompiles every lit material in the room: a
 * visible hitch on the click that turns it on.
 */

const DEFAULT_RADIAL = 20;

/** A basis whose +Y runs from `a` to `b`; returns { matrix, length }. */
function segmentMatrix(a, b, side, { offset = new THREE.Vector3() } = {}) {
    const along = b.clone().sub(a);
    const length = along.length();
    along.normalize();
    const x = side.clone().sub(along.clone().multiplyScalar(side.dot(along))).normalize();
    const z = x.clone().cross(along).normalize();
    const matrix = new THREE.Matrix4().makeBasis(x, along, z);
    matrix.setPosition(a.clone().add(b).multiplyScalar(0.5).add(offset));
    return { matrix, length, x, z, along };
}

/** A cylinder along `axis` centred at `centre`. */
function cylinderAlong(centre, axis, radius, length, segments = DEFAULT_RADIAL) {
    const geometry = new THREE.CylinderGeometry(radius, radius, length, segments);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize());
    geometry.applyQuaternion(quaternion);
    geometry.translate(centre.x, centre.y, centre.z);
    return geometry;
}

/** A tight coil spring: a helix of `wire` round an axis from `start` to `end`. */
class Helix extends THREE.Curve {
    constructor(start, end, radius, pitch, u, w) {
        super();
        this.start = start;
        this.axis = end.clone().sub(start);
        this.length = this.axis.length();
        this.axis.normalize();
        this.radius = radius;
        this.turns = Math.max(1, Math.round(this.length / pitch));
        this.u = u;
        this.w = w;
    }

    getPoint(t, target = new THREE.Vector3()) {
        const angle = t * this.turns * Math.PI * 2;
        return target.copy(this.start)
            .addScaledVector(this.axis, t * this.length)
            .addScaledVector(this.u, Math.cos(angle) * this.radius)
            .addScaledVector(this.w, Math.sin(angle) * this.radius);
    }
}

/**
 * mergeGeometries wants one shape: the same attributes, and all indexed or
 * none. RoundedBoxGeometry (the head) is non-indexed, so a set containing it
 * goes non-indexed (same triangles, more vertices); the steel stays indexed.
 */
function merge(geometries) {
    const indexed = geometries.every((g) => g.index);
    const ready = geometries.map((geometry) => {
        for (const name of Object.keys(geometry.attributes)) {
            if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
        }
        if (!geometry.attributes.uv) {
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
        }
        return indexed || !geometry.index ? geometry : geometry.toNonIndexed();
    });
    const merged = mergeGeometries(ready, false);
    for (const g of new Set([...geometries, ...ready])) g.dispose();
    if (!merged) throw new Error('lamp geometry failed to merge');
    return merged;
}

/**
 * @returns {{ meshes: THREE.Mesh[], light: THREE.SpotLight, setLevel(level:number): void, triangles: number }}
 */
export function buildLamp(group) {
    const L = LAMP;
    const P0 = lampLocal(L.joints.pivot);
    const P1 = lampLocal(L.joints.elbow);
    const P2 = lampLocal(L.joints.top);
    const axis = L.axis.clone();

    const black = [];
    const steel = [];

    // Base: a weighted disc with a slight chamfer, a boss, and the post up to the lower knuckle.
    const base = new THREE.CylinderGeometry(L.base.radiusTop, L.base.radiusBottom, L.base.height, 56);
    base.translate(0, L.base.height / 2, 0);
    black.push(base);
    const boss = new THREE.CylinderGeometry(L.post.radius * 2.2, L.post.radius * 2.5, L.bossHeight, 24);
    boss.translate(0, L.base.height + L.bossHeight / 2, 0);
    black.push(boss);
    const postBottom = L.base.height + L.bossHeight;
    const post = new THREE.CylinderGeometry(L.post.radius, L.post.radius, P0.y - postBottom, 16);
    post.translate(0, postBottom + (P0.y - postBottom) / 2, 0);
    black.push(post);

    // Knuckles at the three joints, each with a steel bolt through it.
    for (const joint of [P0, P1, P2]) {
        black.push(cylinderAlong(joint, axis, L.knuckle.radius, L.knuckle.length));
        steel.push(cylinderAlong(joint, axis, L.knuckle.bolt, L.knuckle.boltLength, 12));
    }

    // The arms: twin flat bars either side of the pivot plane.
    for (const [a, b] of [[P0, P1], [P1, P2]]) {
        for (const sign of [-1, 1]) {
            const { matrix, length } = segmentMatrix(a, b, axis, { offset: axis.clone().multiplyScalar(sign * L.bar.separation / 2) });
            const bar = new THREE.BoxGeometry(L.bar.thickness, length, L.bar.depth);
            bar.applyMatrix4(matrix);
            black.push(bar);
        }
    }

    // Springs alongside each arm, on its underside.
    const joints = { pivot: P0, elbow: P1, top: P2 };
    for (const spec of L.springs) {
        const a = joints[spec.from];
        const b = joints[spec.to];
        const along = b.clone().sub(a).normalize();
        let under = axis.clone().cross(along).normalize();
        if (under.y > 0) under.negate();
        const start = a.clone().lerp(b, spec.start).addScaledVector(under, L.spring.offset);
        const end = a.clone().lerp(b, spec.end).addScaledVector(under, L.spring.offset);
        const helix = new Helix(start, end, L.spring.radius, L.spring.pitch, under, axis);
        // 6 segments a turn and a 3-sided wire: at its largest (the left margin of
        // #monitor) the coil is a few pixels across, and it reads as a coil.
        steel.push(new THREE.TubeGeometry(helix, helix.turns * 6, L.spring.wire, 3, false));
        // The hooks: short straight wires from each end of the coil back to the arm.
        steel.push(cylinderAlong(start.clone().addScaledVector(under, -L.spring.offset / 2), under, L.spring.wire * 1.2, L.spring.offset, 6));
        steel.push(cylinderAlong(end.clone().addScaledVector(under, -L.spring.offset / 2), under, L.spring.wire * 1.2, L.spring.offset, 6));
    }

    // The head: a slim bar, softly rounded, hung from the top knuckle by a short neck.
    const headCentre = lampLocal(L.head.centre);
    const head = new RoundedBoxGeometry(L.head.length, L.head.height, L.head.width, 2, L.head.height * 0.3);
    head.applyQuaternion(L.head.quaternion);
    head.translate(headCentre.x, headCentre.y, headCentre.z);
    black.push(head);
    const headUp = L.head.down.clone().negate();
    const neckFoot = lampLocal(L.head.start).addScaledVector(L.head.direction, L.head.neck * 0.6).addScaledVector(headUp, L.head.height / 2);
    const { matrix: neckMatrix, length: neckLength } = segmentMatrix(neckFoot, P2, axis);
    const neck = new THREE.CylinderGeometry(L.post.radius * 0.8, L.post.radius * 0.8, neckLength, 12);
    neck.applyMatrix4(neckMatrix);
    black.push(neck);

    const blackMaterial = new THREE.MeshStandardMaterial({ color: COLORS.lampBlack, roughness: 0.5, metalness: 0 });
    const steelMaterial = new THREE.MeshStandardMaterial({ color: COLORS.lampSteel, roughness: 0.35, metalness: 1 });

    const blackMesh = new THREE.Mesh(merge(black), blackMaterial);
    blackMesh.name = 'lamp:body';
    const steelMesh = new THREE.Mesh(merge(steel), steelMaterial);
    steelMesh.name = 'lamp:steel';

    // The diffuser strip under the head.
    const stripCentre = lampLocal(L.strip.centre);
    const stripGeometry = new THREE.BoxGeometry(L.strip.length, L.strip.thickness, L.strip.width);
    stripGeometry.applyQuaternion(L.head.quaternion);
    stripGeometry.translate(stripCentre.x, stripCentre.y, stripCentre.z);
    const off = new THREE.Color(COLORS.diffuserOff);
    const on = new THREE.Color(L.stripOn.color).multiplyScalar(L.stripOn.scale);
    const stripMaterial = new THREE.MeshBasicMaterial({ color: off.clone() });
    const stripMesh = new THREE.Mesh(stripGeometry, stripMaterial);
    stripMesh.name = 'lamp:diffuser';

    const meshes = [blackMesh, steelMesh, stripMesh];
    for (const mesh of meshes) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
    }
    stripMesh.castShadow = false;

    const light = new THREE.SpotLight(L.light.color, 0, 0, L.light.angle, L.light.penumbra, 2);
    light.name = 'lamp:light';
    light.castShadow = false;
    light.position.copy(lampLocal(L.light.position));
    light.target.position.copy(lampLocal(L.light.target));
    group.add(light);
    group.add(light.target);

    const triangles = meshes.reduce((sum, mesh) => {
        const g = mesh.geometry;
        return sum + (g.index ? g.index.count : g.attributes.position.count) / 3;
    }, 0);

    return {
        meshes,
        light,
        triangles,
        /** 0 = off, 1 = on; anything between is the fade. */
        setLevel(level) {
            const t = Math.min(1, Math.max(0, level));
            light.intensity = L.light.intensity * t;
            stripMaterial.color.copy(off).lerp(on, t);
        }
    };
}
