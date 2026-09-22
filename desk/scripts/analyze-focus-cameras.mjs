/**
 * What every focus camera actually frames — and what its offsets should be for
 * a shot you can describe in words instead of in six numbers.
 *
 *     node scripts/analyze-focus-cameras.mjs
 *     node scripts/analyze-focus-cameras.mjs --sweep   # a range of distances
 *
 * WHY THIS EXISTS. A `focus.camera` is two triples of world-space coordinates,
 * and nothing about reading them tells you any of the things the eye is
 * actually judging: whether the print arrives on screen the right way up,
 * whether the camera is square enough to the surface to read it, how far away
 * it stands, and whether the words on it survive that distance. Every one of
 * those was wrong somewhere on this desk at once, and every individual number
 * looked defensible on its own line.
 *
 * THE BEARING IS NOT A FREE CHOICE. A sheet mesh is a plane laid flat in the
 * object's own frame, which sends the top of its type to that frame's local -z.
 * So for anything printed the camera has to stand along that axis — the
 * object's own yaw — or the type arrives rotated by exactly how far off it you
 * stood. Tipping the object up does not change this: both printed objects that
 * lie on the desk tip about their local X, which leaves the compass bearing
 * alone. For the badge, which stands all the way up to meet the camera, the
 * bearing given below is the card's face normal instead.
 *
 * WHAT IS LEFT TO PICK is the height and the distance, and those two are a
 * trade rather than a preference. Standing back is what stops a 45° lens
 * keystoning a page and filling the frame with one surface; standing close is
 * the only thing keeping the body type legible, because on a `sheets` object
 * the words are drawn on the paper and nowhere else. The
 * `body type ...px @900` column is that second half, and the floor it is held
 * to lives in deskObjects.test.js.
 */
import * as THREE from 'three';
import { deskObjects } from '../src/content/deskObjects.js';
import { metricsFor, PAGE_CANVAS_HEIGHT } from '../src/focus/strategies/pageCanvas.js';

const FOV = 45;
const ASPECT = 16 / 9;

/**
 * Extents of the model-backed props that have no printed face, per unit of
 * `targetSize`, so their framing can be reported alongside everything else.
 * From `node scripts/measure-models.mjs`, which reads the .glb's own bounds.
 */
const MEASURED = {
    '/models/soldering_station.glb': [1.000, 0.986, 0.442]
};

const round = (value) => Number(value.toFixed(3));
const deg = THREE.MathUtils.radToDeg;

/**
 * The presented pose, as an Object3D whose children are carried up with it.
 *
 * Both the badge and the paper stack tip up about `anchor.present.pivot` when
 * focused, and this is focus/pose.js's `p -> P + R(p - P)` written out: give
 * the group the rotation and put its origin at P - R·P.
 */
function presentedPose(present) {
    const pose = new THREE.Object3D();
    if (!present) return pose;
    pose.rotation.set(...present.rotation);
    pose.position
        .set(...present.pivot)
        .sub(new THREE.Vector3(...present.pivot).applyEuler(pose.rotation));
    return pose;
}

/**
 * The face a visitor is meant to read, as a child of the object's own group and
 * built the way the focus strategy builds it. For the bench, which shows an
 * object rather than a page, it is that object's bounding box instead — flagged
 * `unprinted`, since a box has no "up" to hold level and no face to be square to.
 */
function readableFace(object) {
    const { visual, anchor } = object.focus;
    const group = new THREE.Object3D();
    group.position.set(...object.position);
    group.rotation.set(...object.rotation);
    const face = new THREE.Object3D();

    if (visual === 'screen') {
        face.position.set(...anchor.position);
        face.rotation.set(...anchor.rotation);
        face.userData.size = anchor.size;
        group.add(face);
    } else if (visual === 'sheets') {
        group.position.add(new THREE.Vector3(...(anchor.approach ?? [0, 0, 0])));
        face.position.set(0, anchor.height, 0);
        face.rotation.set(-Math.PI / 2, 0, 0);
        face.userData.size = anchor.size;
        // The pages hang inside the pose group, so the whole sheaf tips up
        // together — @see sheetStrategy's `stage`.
        const pose = presentedPose(anchor.present);
        pose.add(face);
        group.add(pose);
    } else if (visual === 'artifact' && anchor.present) {
        const card = object.parts.find((part) => part.badge);
        const pose = presentedPose(anchor.present);
        face.position.set(...card.position);
        face.rotation.set(...card.rotation);
        face.userData.size = [card.args[0], card.args[1]];
        pose.add(face);
        group.add(pose);
    } else {
        // No print, so no "up" and nothing to be square to — but it still has to
        // be the same size in frame as everything else, so it gets the object's
        // own bounding box, resting on the spot the artifact stands on.
        const [width, height, depth] = MEASURED[object.model.url];
        const scale = object.model.targetSize;
        face.position.set(...(anchor.position ?? [0, 0, 0]));
        face.position.y += (height * scale) / 2;
        face.userData.size = [width * scale, height * scale, depth * scale];
        face.userData.unprinted = true;
        group.add(face);
    }

    group.updateMatrixWorld(true);
    return face;
}

function cameraFor(object, offset, lookAtOffset) {
    const origin = new THREE.Vector3(...object.position);
    const camera = new THREE.PerspectiveCamera(FOV, ASPECT, 0.1, 100);
    camera.position.copy(origin).add(new THREE.Vector3(...offset));
    camera.lookAt(origin.clone().add(new THREE.Vector3(...lookAtOffset)));
    camera.updateMatrixWorld(true);
    return camera;
}

/** Where the face's own corners land in NDC, as a box. */
function projected(face, camera) {
    const [width, height, depth = 0] = face.userData.size;
    const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (const sx of [-0.5, 0.5]) {
        for (const sy of [-0.5, 0.5]) {
            for (const sz of depth ? [-0.5, 0.5] : [0]) {
                const corner = face
                    .localToWorld(new THREE.Vector3(sx * width, sy * height, sz * depth))
                    .project(camera);
                box.minX = Math.min(box.minX, corner.x); box.maxX = Math.max(box.maxX, corner.x);
                box.minY = Math.min(box.minY, corner.y); box.maxY = Math.max(box.maxY, corner.y);
            }
        }
    }
    return box;
}

function measure(object, offset, lookAtOffset) {
    const face = readableFace(object);
    const camera = cameraFor(object, offset, lookAtOffset);

    const centre = face.getWorldPosition(new THREE.Vector3());
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(face.matrixWorld);
    const up = new THREE.Vector3(0, 1, 0).transformDirection(face.matrixWorld);
    const toCamera = camera.position.clone().sub(centre);
    const distance = toCamera.length();
    toCamera.normalize();

    const offNormal = deg(Math.acos(THREE.MathUtils.clamp(toCamera.dot(normal), -1, 1)));
    const onScreen = centre.clone().addScaledVector(up, 0.01).project(camera).sub(centre.clone().project(camera));
    const roll = deg(Math.atan2(onScreen.x * ASPECT, onScreen.y));

    const { minX, maxX, minY, maxY } = projected(face, camera);

    const print = face.userData.unprinted
        ? '   (unprinted)         '
        : ` roll=${roll.toFixed(0).padStart(4)}° off-normal=${offNormal.toFixed(0).padStart(3)}°`;

    return `${object.id.padEnd(15)} ${object.focus.visual.padEnd(9)}` +
        ` d=${distance.toFixed(2)}` +
        print +
        ` elev=${deg(Math.asin(toCamera.y)).toFixed(0).padStart(3)}°` +
        ` fills ${(((maxX - minX) / 2) * 100).toFixed(0).padStart(3)}% w x ${(((maxY - minY) / 2) * 100).toFixed(0).padStart(3)}% h` +
        `  cam=(${camera.position.toArray().map(round).join(', ')})`;
}

/**
 * The offsets for reading `object` from `distance`, standing on the only
 * bearing that keeps its print upright.
 *
 * For anything lying flat that is the object's own yaw, horizontally. For the
 * badge, which is stood up to meet the camera, it is the card's face normal.
 * `shift` slides the aim along screen-right to leave room for the editorial
 * spread, and scales with the distance because the frame does. It is negative
 * for the objects whose spread sits on the LEFT of the viewport, which is both
 * of them — the aim goes screen-left so the object swings screen-right.
 */
function solve(object, { elevation, distance, shift = 0 }) {
    const centre = readableFace(object).getWorldPosition(new THREE.Vector3())
        .sub(new THREE.Vector3(...object.position));

    const bearing = elevation === undefined
        ? new THREE.Vector3(0, 0, 1).transformDirection(readableFace(object).matrixWorld) // the badge's own normal
        : new THREE.Vector3(Math.sin(object.rotation[1]), 0, Math.cos(object.rotation[1]))
            .multiplyScalar(Math.cos(elevation))
            .add(new THREE.Vector3(0, Math.sin(elevation), 0));

    // Screen-right of the UNSHIFTED shot: the camera stands on the bearing and
    // only the aim slides, which keeps `camera - centre` exactly along it.
    const right = new THREE.Vector3().crossVectors(bearing.clone().negate(), new THREE.Vector3(0, 1, 0)).normalize();
    const aim = centre.clone().addScaledVector(right, shift);
    const offset = centre.clone().addScaledVector(bearing, distance);

    return `${object.id}: ${distance} out` +
        (elevation === undefined ? ' along its own normal' : ` at ${deg(elevation).toFixed(0)}°`) +
        (shift ? `, aim shifted ${shift}` : '') + '\n' +
        `    camera: { offset: [${offset.toArray().map(round).join(', ')}],` +
        ` lookAtOffset: [${aim.toArray().map(round).join(', ')}] }\n` +
        `    ${measure(object, offset.toArray(), aim.toArray())}`;
}

/**
 * The body type on a page canvas, in CSS pixels, at a reference viewport.
 *
 * THE COUNTERWEIGHT TO PULLING BACK. The words on the paper stack are drawn on
 * the page rather than set in the DOM beside it, so distance and legibility are
 * the same knob turned opposite ways: every unit the camera retreats takes type
 * off the page. This is what says where the floor is.
 */
function typeHeight(object, viewportHeight = 900) {
    const stock = object.focus.anchor.paper;
    if (!stock) return null;
    const face = readableFace(object);
    const camera = cameraFor(object, object.focus.camera.offset, object.focus.camera.lookAtOffset);
    const box = projected(face, camera);
    const share = (box.maxY - box.minY) / 2;
    return (metricsFor(stock).bodyFontSize / PAGE_CANVAS_HEIGHT) * share * viewportHeight;
}

/**
 * The face's on-screen footprint, in units of the drawing buffer's HEIGHT.
 *
 * WHAT THIS IS FOR. `anchor.framing` feeds scene/textureBudget.js, which sizes
 * every canvas of type from the pixels it will actually cover rather than from
 * a guessed fraction of the window. These two numbers are what it needs, and
 * they are printed here because they are derived from the focus camera: retune
 * a distance above and these go stale, in a way nothing at runtime can detect.
 *
 * BOTH ARE MEASURED AGAINST HEIGHT, and that is what makes them constants
 * rather than per-window values. three's fov is vertical, so the buffer's
 * height always spans 45° no matter how wide the window is; pixels per degree
 * is therefore height/45 on both axes, and an object's extent in pixels is
 * fixed by its angular size alone. A fraction of WIDTH — which is what the
 * `coverage` arguments these replaced were — changes with every window shape,
 * which is why a single one of them could only ever be right at one aspect.
 */
function framing(object) {
    const face = readableFace(object);
    const { offset, lookAtOffset } = object.focus.camera;
    const box = projected(face, cameraFor(object, offset, lookAtOffset));
    // Widths come back as a fraction of the buffer's WIDTH, so they carry the
    // aspect they were measured at and have to be converted out of it.
    return [round(((box.maxX - box.minX) / 2) * ASPECT), round((box.maxY - box.minY) / 2)];
}

console.log('\nwhat each focus camera frames today\n');
for (const object of deskObjects.filter((entry) => entry.clickable)) {
    const { offset, lookAtOffset } = object.focus.camera;
    const type = typeHeight(object);
    console.log('  ' + measure(object, offset, lookAtOffset) + (type ? `  body type ${type.toFixed(1)}px @900` : ''));
}

// `anchor.framing`, for pasting into content/deskObjects.js alongside the
// camera.
console.log('\nfootprint in frame heights, for anchor.framing\n');
for (const object of deskObjects.filter((entry) => entry.clickable && entry.focus.anchor?.size)) {
    const [w, h] = framing(object);
    console.log(`  ${object.id.padEnd(15)} framing: [${w}, ${h}]`);
}

/**
 * The same footprint, from the shot the desk actually sits at.
 *
 * The monitor carries type in two places and they are framed completely
 * differently: the focused readout above, and the resting screen that is up
 * whenever nothing is focused. Both used to be allocated from the same
 * `coverage: 0.92`, so the resting one — which covers about a fifth of the
 * height the focused one does — was allocated for a shot it is never seen at.
 */
const ESTABLISHING = { position: [0, 2.5, 5.0], lookAt: [0, 1, 0] };

console.log('\nfootprint at the establishing shot, for the resting surfaces\n');
for (const object of deskObjects.filter((entry) => entry.clickable && entry.focus.anchor?.size)) {
    const face = readableFace(object);
    const camera = new THREE.PerspectiveCamera(FOV, ASPECT, 0.1, 100);
    camera.position.set(...ESTABLISHING.position);
    camera.lookAt(...ESTABLISHING.lookAt);
    camera.updateMatrixWorld(true);
    const box = projected(face, camera);
    console.log(`  ${object.id.padEnd(15)} framing: [${round(((box.maxX - box.minX) / 2) * ASPECT)}, ` +
        `${round((box.maxY - box.minY) / 2)}]`);
}

// Retuning: change a distance here (or pass --sweep to see a range), run it,
// and paste the pair it prints into content/deskObjects.js. The `lookAtOffset`
// it gives you already carries `anchor.approach`, which is why it is not simply
// the readable face's own centre.
console.log('\nsolved, for the objects whose bearing is fixed for them\n');
const find = (id) => deskObjects.find((entry) => entry.id === id);
const SWEEP = process.argv.includes('--sweep');
for (const d of SWEEP ? [1.0, 1.1, 1.2, 1.24] : [1.13]) {
    console.log('  ' + solve(find('paper-stack'), { elevation: THREE.MathUtils.degToRad(38), distance: d }));
}
for (const d of SWEEP ? [0.9, 1.0, 1.1, 1.25] : [1.1]) {
    console.log('  ' + solve(find('lanyard'), { distance: d, shift: round(-0.2028 * (d / 0.68)) }));
}
console.log();
