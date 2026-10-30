import * as THREE from 'three';
import { hitProxy } from '../../core/parts.js';
import { palette } from '../../core/palette.js';
import { loadGLTF } from '../../loaders/gltf.js';
import {
    OBJECT_ID, LABEL, POSITION, YAW, MAT, TAG, mm,
    benchShot, eegShot, drawerShot, phoneShot, tagHandPose, tagRestPose, worldToGroup, worldToGroupQuaternion,
    USB_PLUG, LED_FLICKER, TRACE, PHONE, PHONE_NOTE, ORGANISER,
    phoneRestPose, noteRestPose, phoneHandPoses
} from './layout.js';
import { dressMat, buildRig, buildTag, createTail } from './build.js';
import { buildUsb, buildScope, buildProbe, buildPhone, buildPhoneNote, buildOrganiser } from './kit.js';
import { createEog, stillTrace } from './eog.js';
import { TAG_LINE_SPOKEN, TAG_BACK, TAG_INK } from './art.js';
import { PHONE_NOTE_RECTS } from './screens.js';
import { THREADS, SCOPE_NOTE, PHONE_NOTE_TEXT, DRAWER_LABELS, OS } from './copy.js';
import { APPS, SCREEN, hitScreen, heldUntil } from './phoneos.js';
import { createPhoneOs } from './phone.js';

/**
 * BENCH — things Shae built, working. The real EEG rig from eeg.jpg on a green
 * cutting mat (a white breadboard, the red AD8232, a green Teensy 4.1 whose
 * orange LED blinks about once a second, leads out to three electrode pads), a
 * manila tag tied to the board's corner — and, v4, the rest of the bench:
 *
 *   #bench             leaning over the mat: the board, the scope (front left),
 *                      Shae's Pixel (front right, lying sideways on a note),
 *                      the parts organiser (back right);
 *                      the tag lifted off the mat and held up to read
 *   #bench/back        the tag turned over (and brought closer): the back note,
 *                      and a thread → #monitor/mlx
 *   #bench/eeg         powered on: the USB lead plugs into the Teensy, the LED
 *                      goes from its blink to a busy flicker, the scope comes on
 *                      and draws an EOG-like trace from your pointer (left /
 *                      right moves → steps; a readout says LEFT / RIGHT / —)
 *   #bench/phone       the Pixel picked up: its lock screen, your local time,
 *                      the faulty screen's lines; the note it lay on uncovered
 *   #bench/phone/open  unlocked (a short swipe up): a calm dumb-phone launcher
 *                      — log · assistant · camera · notes · about — and the
 *                      note brought up beside it (+ a thread → #bench/eeg)
 *   #bench/phone/open/<log|assistant|camera|notes|about>
 *                      an app (a quick slide in); the gesture bar at the
 *                      bottom goes back. Esc: app → launcher → lock → #bench.
 *                      The OS: phoneos.js (screens, hit areas), phone.js
 *                      (painting, slides, the camera's live viewfinder)
 *   #bench/drawer      the parts organiser; a drawer pulled out ("next" by
 *                      default — empty but for a slip with "?"). Also
 *                      #bench/drawer/<resistors|jumpers|headers|electrodes|next>
 *
 * What stays in the room: once powered, the LED keeps flickering (a timer,
 * not a frame loop: busy in #bench/eeg, slow everywhere else) and the scope stays on; the phone, once picked up, lies
 * back face-up with its screen lit; the tag lies the way you left it.
 *
 * Clicks on the phone always go to the phone (never the note under or beside
 * it), and a click on its glass is a tap at that point of the screen (uv → mm).
 * While the phone or note moves, or the screen slides, clicks are swallowed (a
 * double-click must not tap through). The phone views frame from phoneShot
 * (never closer than 3:2), and a resize re-frames whatever is showing.
 *
 * Geometry and shots: layout.js (DOM-free). Canvases: art.js, screens.js, phoneos.js.
 * Meshes: build.js (v3), kit.js (v4). The pointer's EOG: eog.js.
 */

const VISIT_TITLE = 'the EEG breadboard'; // verbatim: the receipt prints it
const VISIT = Object.freeze({ eeg: 'the scope, switched on', phone: 'the phone', drawer: 'the parts drawers' });

const HINTS = Object.freeze({
    front: 'click the tag to turn it over · or the scope, the phone, a drawer · esc to step back',
    back: 'click the arrow to follow it · click the tag to turn it back · esc to step back',
    eeg: 'move your pointer left and right · esc to step back',
    phone: 'click the screen to unlock it · esc to put it down',
    open: 'click an app to open it · or the arrow on the note to follow it · esc to lock the phone',
    drawer: 'click a drawer to pull it out · ↑ ↓ · esc to step back'
});
const BACK = 'click ‹ at the top to go back · esc to go back';
const APP_HINTS = Object.freeze({
    log: BACK,
    assistant: `click “${OS.assistant.release}” · ${BACK}`,
    camera: BACK,
    notes: `click the arrow line to follow it · ${BACK}`,
    about: `click the switch · ${BACK}`
});
/** The apps, spoken. `date` is the phone's clock; `mode` the camera's (live | gallery). */
const APP_LIVE = Object.freeze({
    log: () => `The log: ${OS.log.heading} — a timeline of pickups and app opens from midnight to now, and a total. Labelled: ${OS.log.illustrative}.`,
    assistant: ({ date, revealed }) => `The assistant: notifications ${OS.assistant.heldUntil(heldUntil(date))}; ${OS.assistant.calm}. ${revealed
        ? `Let through: ${OS.assistant.sources.map((s) => `${s.name}, ${s.detail}`).join('; ')}.`
        : `Held: ${OS.assistant.sources.map((s) => `${s.name} ${s.count}`).join(', ')}. A button: ${OS.assistant.release}.`} ${PHONE_NOTE_TEXT} ${OS.assistant.sketch}.`,
    camera: ({ mode }) => (mode === 'gallery'
        ? 'The camera roll: three of Shae\'s photos — the first day at Amazon, the SafetyCulture hackathon, the EEG board.'
        : 'The camera: a live, low-resolution viewfinder of the room behind the phone.'),
    notes: () => `Notes: ${PHONE_NOTE_TEXT} Then: ${THREADS.phone.line} A link to the board.`,
    about: ({ logging }) => `About: ${OS.about.name}, ${OS.about.line}. A switch: ${OS.about.logging(logging)}.`
});

const LIVE = Object.freeze({
    front: `The bench: an EEG breadboard on a cutting mat, a small oscilloscope, a phone and a parts organiser. A manila tag tied to the board reads: ${TAG_LINE_SPOKEN}`,
    back: `The back of the tag: ${TAG_BACK} Underneath: ${THREADS.tag.line} An arrow to the monitor.`,
    eeg: `Powered on: the Teensy's light flickers and the oscilloscope draws a trace from your pointer, labelled left or right. A sticky on the scope: ${SCOPE_NOTE}`,
    phone: 'Shae\'s Pixel, picked up: the lock screen shows the time and date; coloured lines run down its edges.',
    open: `Unlocked: a plain launcher, grey on black, five words — log, assistant, camera, notes, about. A note beside the phone: ${PHONE_NOTE_TEXT} Underneath: ${THREADS.phone.line} An arrow to the board.`,
    drawer: (slug) => slug === 'next'
        ? 'A small parts organiser: resistors, jumper wires, headers, electrodes, next. The drawer labelled next is out: empty, but for a slip of paper with a question mark.'
        : `A small parts organiser: resistors, jumper wires, headers, electrodes, next. The ${DRAWER_LABELS[slug] ?? 'drawer'} drawer is out.`
});

/**
 * A 1.5 cm hop at mid-turn (the brief's turn-over; core motion's TURN_LIFT),
 * half toward the camera and half straight up.
 */
const TURN_LIFT = 0.048;
const UP = new THREE.Vector3(0, 1, 0);
const PICK_ARC = 0.05;
const PUT_ARC = 0.035;
const PHONE_ARC = 0.06;

const LED_ON = new THREE.Color(3.2, 1.35, 0.22);   // linear, HDR: reads as lit after ACES
const LED_OFF = new THREE.Color(0.12, 0.08, 0.035);
const BLINK_MS = 500;                               // on 0.5 s, off 0.5 s: ≈ 1 Hz
const SCOPE_REPAINT_MS = 33;                        // the trace redraws at ≤ 30 fps while live
const CLOCK_MS = 15000;

const Y_TURN = (angle) => new THREE.Quaternion().setFromAxisAngle(UP, angle);

/** The mat, as a part: it gives the bench presence and a hitbox from the first frame. */
const MAT_PART = {
    type: 'box',
    args: [mm(MAT.w), mm(MAT.h), mm(MAT.d)],
    position: [0, mm(MAT.h) / 2, 0],
    color: palette.matGreen,
    material: { roughness: 0.85, metalness: 0 }
};

/** Everything mount() builds; null until then (and if mount fails, the routes still move the camera). */
let bench = null;

function findMat(group) {
    let found = null;
    group.traverse((node) => {
        if (found || !node.isMesh || node.geometry?.type !== 'BoxGeometry') return;
        const p = node.geometry.parameters;
        if (Math.abs(p.width - mm(MAT.w)) < 1e-6 && Math.abs(p.height - mm(MAT.h)) < 1e-6) found = node;
    });
    return found;
}

/** Parses a bench path into a view. Unknown paths → the tag, front. */
function parse(path) {
    const [head, sub, third] = path;
    if (head === 'back') return { view: 'tag', face: 'back' };
    if (head === 'eeg') return { view: 'eeg' };
    if (head === 'phone') {
        if (sub !== 'open') return { view: 'phone' };
        return { view: 'open', app: APPS.includes(third) ? third : null }; // unknown app → the launcher
    }
    if (head === 'drawer') {
        const slug = sub === 'shut' ? null : ORGANISER.drawers.includes(sub) ? sub : 'next';
        return { view: 'drawer', slug };
    }
    return { view: 'tag', face: 'front' };
}

// ---------------------------------------------------------------------------
// The tag
// ---------------------------------------------------------------------------

function updateTail() {
    if (!bench?.tail || !bench.tag) return;
    try {
        bench.tail.update(bench.tag.pivot);
    } catch (error) {
        bench.ctx.warn('string update failed', error);
    }
}

function setTagPose(target) {
    const { pivot } = bench.tag;
    pivot.position.copy(target.position);
    pivot.quaternion.copy(target.quaternion);
    updateTail();
    bench.ctx.invalidateShadows();
}

/** One running animation per thing: starting another cancels the last. */
function runOn(slot, start) {
    const running = bench.anims[slot];
    bench.anims[slot] = null;
    running?.cancel?.();
    const animation = start();
    bench.anims[slot] = animation;
    return Promise.resolve(animation).then((completed) => {
        if (bench.anims[slot] === animation) bench.anims[slot] = null;
        return completed;
    });
}

function moveTag(target, { preset, arc, instant }) {
    if (instant) {
        bench.anims.tag?.cancel?.();
        bench.anims.tag = null;
        setTagPose(target);
        return Promise.resolve(true);
    }
    return runOn('tag', () => bench.ctx.motion.moveObject(bench.tag.pivot, {
        position: target.position, quaternion: target.quaternion, preset, arc, instant: false, onUpdate: updateTail
    }));
}

/**
 * Turn the held tag over while it moves between the front's and the back's
 * hold (the back is held closer): its own vertical axis, a hop toward you.
 */
function turnTagTo(target, fromFace, toFace, hop) {
    const pivot = bench.tag.pivot;
    const p0 = pivot.position.clone();
    const a0 = fromFace === 'back' ? Math.PI : 0;
    const a1 = toFace === 'back' ? Math.PI : 0;
    const base0 = pivot.quaternion.clone().multiply(Y_TURN(-a0));
    const base1 = target.base;
    const q = new THREE.Quaternion();
    return runOn('tag', () => bench.ctx.motion.animate({
        from: 0, to: 1, preset: 'turn', instant: false,
        onUpdate: (e) => {
            pivot.position.lerpVectors(p0, target.position, e).addScaledVector(hop, bench.ctx.motion.arc(e, TURN_LIFT));
            q.slerpQuaternions(base0, base1, e).multiply(Y_TURN(a0 + (a1 - a0) * e));
            pivot.quaternion.copy(q);
            updateTail();
        }
    }));
}

function cameraFinal(ctx) {
    const camera = ctx.camera.object;
    return { pose: ctx.camera.finalPose(), aspect: camera.aspect, fov: camera.fov };
}

/** The tag's in-hand pose for the camera's final shot, in the bench group's frame. */
function tagHandTarget(ctx, face) {
    const { pose, aspect, fov } = cameraFinal(ctx);
    const hand = tagHandPose(pose, aspect, fov, face);
    const base = worldToGroupQuaternion(hand.quaternion);
    const quaternion = base.clone();
    if (face === 'back') quaternion.multiply(Y_TURN(Math.PI));
    return { position: worldToGroup(hand.position), quaternion, base, cameraLocal: worldToGroup(pose.position) };
}

function tagRestTarget(face) {
    return tagRestPose({ face, pose: face === 'back' ? TAG.left : TAG.rest });
}

function tagTo(ctx, view, face, instant) {
    if (!bench.tag) return Promise.resolve(true);
    if (view !== 'tag') {
        if (bench.tagWhere !== 'hand') return Promise.resolve(true);
        bench.tagWhere = 'rest';
        return moveTag(tagRestTarget(bench.face), { preset: 'put', arc: PUT_ARC, instant });
    }
    const target = tagHandTarget(ctx, face);
    let move;
    if (instant) {
        move = moveTag(target, { instant: true });
    } else if (bench.tagWhere === 'hand' && bench.face !== face) {
        const hop = target.cameraLocal.clone().sub(bench.tag.pivot.position).normalize().add(UP).normalize();
        move = turnTagTo(target, bench.face, face, hop);
    } else {
        move = moveTag(target, { preset: 'pick', arc: PICK_ARC, instant: false });
    }
    bench.tagWhere = 'hand';
    bench.face = face;
    return move;
}

// ---------------------------------------------------------------------------
// Power, the LED and the scope
// ---------------------------------------------------------------------------

function setLed(on) {
    if (!bench?.rig) return;
    bench.rig.ledMaterial.color.copy(on ? LED_ON : LED_OFF);
}

function startBlink(ctx) {
    let on = true;
    setLed(on);
    if (ctx.still || ctx.reducedMotion) return;
    bench.stopLed = ctx.every(BLINK_MS, () => {
        on = !on;
        setLed(on);
        ctx.invalidate();
    });
}

/** After power-on: a busy, irregular flicker — one frame per change, from a timer. */
function startFlicker(ctx) {
    bench.stopLed?.();
    bench.stopLed = null;
    setLed(true);
    if (ctx.still || ctx.reducedMotion) return;
    const random = ctx.rng('bench-led-flicker');
    let on = true;
    let tick = 0;
    bench.stopLed = ctx.every(LED_FLICKER.tickMs, () => {
        // Busy only while you're watching it (#bench/eeg). Anywhere else the
        // powered LED keeps an irregular but slow flicker (one chance per
        // ≈ 0.5 s), so the trace stays without ~7 full-room renders a second
        // for the rest of the visit.
        tick += 1;
        if (bench.view !== 'eeg' && tick % LED_FLICKER.idleEvery !== 0) return;
        const next = random() < LED_FLICKER.onChance;
        if (next === on) return;
        on = next;
        setLed(on);
        ctx.invalidate();
    });
}

function paintScope(state) {
    try {
        bench.scope?.paintScreen(state);
    } catch (error) {
        bench.ctx.warn('scope repaint failed', error);
    }
}

function paintScopeRest() {
    if (!bench.powered) {
        paintScope({ on: false });
        return;
    }
    if (bench.ctx.still) {
        const s = stillTrace(TRACE);
        paintScope({ on: true, samples: s.samples, readout: 'none' });
        return;
    }
    bench.eog.rest();
    paintScope({ on: true, samples: bench.eog.samples(), readout: 'none' });
}

function setUsbPlugged(plugged) {
    if (!bench.usb) return;
    bench.usb.group.position.x = plugged ? 0 : -mm(USB_PLUG.unplugged);
}

/** Plug in (a short slide with a millimetre's lift), then the LED and the scope come on. */
async function powerOn(ctx, instant) {
    if (bench.powered || bench.powering) return bench.powering ?? true;
    const run = async () => {
        if (!instant && bench.usb) {
            await ctx.motion.wait(ctx.motion.durations.camera * 0.5);
            const group = bench.usb.group;
            const from = group.position.x;
            await runOn('usb', () => ctx.motion.animate({
                from: 0, to: 1, preset: 'slide', instant: false,
                onUpdate: (e) => {
                    group.position.x = from * (1 - e);
                    group.position.y = ctx.motion.arc(e, mm(1.2));
                }
            }));
        }
        setUsbPlugged(true);
        if (bench.usb) bench.usb.group.position.y = 0;
        bench.powered = true;
        startFlicker(ctx);
        paintScopeRest();
        ctx.invalidateShadows();
    };
    bench.powering = run().finally(() => { bench.powering = null; });
    return bench.powering;
}

/** #bench/eeg's live trace: frames only while the pointer moves and the trace settles. */
function startLive(ctx) {
    stopLive();
    if (ctx.still) {
        const s = stillTrace(TRACE);
        paintScope({ on: true, samples: s.samples, readout: s.readout });
        return;
    }
    let since = Infinity;
    let settled = false;
    bench.stopTick = ctx.addTick((dt) => {
        if (!bench.powered || bench.view !== 'eeg') return false;
        const live = bench.eog.step(dt / 1000);
        since += dt;
        // Live: at most ~30 repaints a second. Settled: ONE last repaint, then
        // nothing — a repaint invalidates, and repainting on every frame the
        // LED's timer asks for would keep the room rendering at 60 fps.
        if (live ? since >= SCOPE_REPAINT_MS : !settled) {
            since = 0;
            paintScope({ on: true, samples: bench.eog.samples(), readout: bench.eog.readout() });
        }
        settled = !live;
        return live;
    });
}

function stopLive() {
    bench.stopTick?.();
    bench.stopTick = null;
}

// ---------------------------------------------------------------------------
// The phone and its note
// ---------------------------------------------------------------------------

/** What the phone's screen shows for where the bench is. */
function screenForView() {
    if (bench.view === 'phone') return { kind: 'lock' };
    if (bench.view === 'open') {
        return bench.app
            ? { kind: 'app', app: bench.app, revealed: bench.revealed, logging: bench.logging }
            : { kind: 'launcher' };
    }
    return { kind: bench.phoneTouched ? 'lock' : 'off' };
}

/** The camera app's viewfinder runs only while it is open (and has landed). */
function cameraWanted() {
    return Boolean(bench?.active && bench.view === 'open' && bench.app === 'camera');
}

/** Moves the screen to where the bench is (sliding unless `instant`), then starts or stops the viewfinder. */
function showScreen(instant) {
    if (!bench.os) return Promise.resolve(true);
    if (!cameraWanted()) bench.os.stopCamera(); // at once: never a frame of it on the way out
    let shown;
    try {
        shown = bench.os.show(screenForView(), { instant });
    } catch (error) {
        bench.ctx.warn('phone screen failed', error);
        return Promise.resolve(true);
    }
    return shown.then(() => {
        if (cameraWanted()) bench.os.startCamera();
        else bench.os.stopCamera();
    });
}

/** Keeps the lit phone's clock right: a repaint when the minute turns (never under ?still=1). */
function startClock(ctx) {
    if (bench.stopClock) return;
    let minute = ctx.now().getMinutes();
    bench.stopClock = ctx.every(CLOCK_MS, () => {
        const m = ctx.now().getMinutes();
        if (m === minute) return;
        minute = m;
        bench.os?.refresh();
    });
}

function toGroupPose(world) {
    return { position: worldToGroup(world.position), quaternion: worldToGroupQuaternion(world.quaternion) };
}

function moveItem(slot, object, target, { preset, arc, instant }) {
    if (instant) {
        bench.anims[slot]?.cancel?.();
        bench.anims[slot] = null;
        object.position.copy(target.position);
        object.quaternion.copy(target.quaternion);
        bench.ctx.invalidateShadows();
        return Promise.resolve(true);
    }
    return runOn(slot, () => bench.ctx.motion.moveObject(object, { position: target.position, quaternion: target.quaternion, preset, arc, instant: false }));
}

function phoneTo(ctx, view, instant) {
    const jobs = [];
    if (!bench.phone) return Promise.resolve(true);
    const inHand = view === 'phone' || view === 'open';
    const { pose, aspect, fov } = cameraFinal(ctx);
    if (inHand) {
        // The launcher and every app share one pose: moving between them moves nothing.
        const poseKey = `${view}:${aspect.toFixed(4)}`;
        if (bench.phonePoseKey !== poseKey || instant) {
            const poses = phoneHandPoses(pose, aspect, fov, { open: view === 'open' });
            const target = toGroupPose(poses.phone);
            const fromRest = bench.phoneWhere !== 'hand';
            jobs.push(moveItem('phone', bench.phone.pivot, target, { preset: fromRest ? 'pick' : 'slide', arc: fromRest ? PHONE_ARC : 0, instant }));
            if (bench.note) {
                if (view === 'open') {
                    jobs.push(moveItem('note', bench.note.pivot, toGroupPose(poses.note), { preset: 'pick', arc: PICK_ARC, instant }));
                    bench.noteWhere = 'hand';
                } else if (bench.noteWhere === 'hand') {
                    jobs.push(moveItem('note', bench.note.pivot, noteRestPose(), { preset: 'put', arc: PUT_ARC, instant }));
                    bench.noteWhere = 'rest';
                }
            }
            bench.phonePoseKey = poseKey;
        }
        bench.phoneWhere = 'hand';
        bench.phoneTouched = true;
        startClock(ctx);
    } else {
        if (bench.phoneWhere === 'hand') {
            jobs.push(moveItem('phone', bench.phone.pivot, phoneRestPose(), { preset: 'put', arc: PUT_ARC, instant }));
            bench.phoneWhere = 'rest';
        }
        bench.phonePoseKey = null;
        if (bench.note && bench.noteWhere === 'hand') {
            jobs.push(moveItem('note', bench.note.pivot, noteRestPose(), { preset: 'put', arc: PUT_ARC, instant }));
            bench.noteWhere = 'rest';
        }
    }
    jobs.push(showScreen(instant));
    return Promise.all(jobs);
}

// ---------------------------------------------------------------------------
// The organiser
// ---------------------------------------------------------------------------

function drawersTo(ctx, slug, instant) {
    if (!bench.organiser) return Promise.resolve(true);
    bench.openDrawer = slug;
    return Promise.all(bench.organiser.drawers.map((drawer) => {
        const open = drawer.slug === slug;
        if (drawer.open === open && !drawer.anim) return true;
        drawer.open = open;
        const z = open ? drawer.openZ : drawer.closedZ;
        if (instant) {
            drawer.anim?.cancel?.();
            drawer.anim = null;
            drawer.group.position.z = z;
            ctx.invalidateShadows();
            return true;
        }
        drawer.anim?.cancel?.();
        const from = drawer.group.position.z;
        const animation = ctx.motion.animate({
            from: 0, to: 1, preset: 'slide', instant: false,
            onUpdate: (e) => { drawer.group.position.z = from + (z - from) * e; }
        });
        drawer.anim = animation;
        return Promise.resolve(animation).then((done) => {
            if (drawer.anim === animation) drawer.anim = null;
            return done;
        });
    }));
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/** What's under the pointer: { kind, hit, slug? } — the nearest of everything the bench can act on. */
function pick(ctx, ndc) {
    if (!bench?.targets?.length) return null;
    const hits = ctx.raycast(ndc, bench.targets, false);
    // The phone wins: a ray that touches the phone anywhere never lands on the
    // note (tucked under its back edge at rest, beside it in hand).
    const onPhone = hits.some((hit) => bench.kinds.get(hit.object)?.kind === 'phone');
    for (const hit of hits) {
        const entry = bench.kinds.get(hit.object);
        if (!entry || (entry.kind === 'note' && onPhone)) continue;
        if (entry.kind === 'phone') return { ...entry, hit, screen: screenPoint(ctx, ndc) };
        return { ...entry, hit };
    }
    return null;
}

/** Where a ray meets the phone's glass, in screen mm (phoneos.js space), or null off the glass. */
function screenPoint(ctx, ndc) {
    const mesh = bench.phone?.screenMesh;
    if (!mesh) return null;
    return uvMm(ctx.raycast(ndc, [mesh], false)[0], SCREEN.w, SCREEN.h);
}

function refreshTargets() {
    const kinds = new Map();
    const add = (meshes, kind, extra = {}) => { for (const mesh of meshes ?? []) kinds.set(mesh, { kind, ...extra }); };
    if (bench.tag) add(bench.tag.meshes, 'tag');
    if (bench.phone) add(bench.phone.meshes, 'phone');
    if (bench.note) add(bench.note.meshes, 'note');
    if (bench.scope) add(bench.scope.meshes, 'scope');
    if (bench.probe) add(bench.probe.meshes, 'scope');
    if (bench.usb) bench.usb.group.traverse((node) => { if (node.isMesh) kinds.set(node, { kind: 'scope' }); });
    if (bench.rig) bench.rig.rig.traverse((node) => { if (node.isMesh && !kinds.has(node)) kinds.set(node, { kind: 'rig' }); });
    if (bench.organiser) {
        bench.organiser.group.traverse((node) => { if (node.isMesh) kinds.set(node, { kind: 'organiser' }); });
        for (const drawer of bench.organiser.drawers) add(drawer.meshes, 'drawer', { slug: drawer.slug });
    }
    bench.kinds = kinds;
    bench.targets = [...kinds.keys()];
}

/** A hit on a face's canvas, in that canvas's mm (uv → mm; canvases are drawn with their top at v = 1). */
function uvMm(hit, w, h) {
    if (!hit?.uv) return null;
    return { x: hit.uv.x * w, y: (1 - hit.uv.y) * h };
}

const inRect = (p, r, slack = 2) => p && p.x >= r.x - slack && p.x <= r.x + r.w + slack && p.y >= r.y - slack && p.y <= r.y + r.h + slack;

function onTagThread(target) {
    if (target?.kind !== 'tag' || bench.view !== 'tag' || bench.face !== 'back') return false;
    if (target.hit.object !== bench.tag.meshes[1]) return false; // the back
    return inRect(uvMm(target.hit, TAG.w, TAG.h), TAG_INK.thread);
}

function onPhoneThread(target) {
    if (target?.kind !== 'note' || bench.view !== 'open' || target.hit.object !== bench.note.front) return false;
    return inRect(uvMm(target.hit, PHONE_NOTE.size, PHONE_NOTE.size), PHONE_NOTE_RECTS.thread);
}

/** The action a click on `target` would take, or null. */
function actionFor(target) {
    if (!target) return null;
    const { view } = bench;
    switch (target.kind) {
    case 'tag':
        if (onTagThread(target)) return { to: THREADS.tag.to };
        if (view === 'tag') return { to: bench.face === 'back' ? '#bench' : '#bench/back' };
        return { to: '#bench' };
    case 'phone':
        if (view === 'phone') return { to: '#bench/phone/open' };
        if (view === 'open') {
            // A tap on the glass, at that point of the screen; the body takes nothing.
            const tap = target.screen && bench.os ? hitScreen(bench.os.screen(), target.screen.x, target.screen.y) : null;
            return tap ?? { swallow: true };
        }
        return { to: '#bench/phone' };
    case 'note':
        if (onPhoneThread(target)) return { to: THREADS.phone.to };
        if (view === 'open') return { swallow: true };
        return { to: '#bench/phone/open' };
    case 'scope':
    case 'rig':
        if (view === 'eeg') return { swallow: true };
        return { to: '#bench/eeg' };
    case 'drawer':
        if (view === 'drawer' && bench.openDrawer === target.slug) return { to: '#bench/drawer/shut', replace: true };
        return { to: `#bench/drawer/${target.slug}`, replace: view === 'drawer' };
    case 'organiser':
        return view === 'drawer' ? { swallow: true } : { to: '#bench/drawer' };
    default:
        return null;
    }
}

/** The camera's shot for a view at `aspect`. */
function shotFor(view, aspect) {
    if (view === 'eeg') return eegShot(aspect);
    if (view === 'drawer') return drawerShot(aspect);
    if (view === 'phone' || view === 'open') return phoneShot(aspect);
    return benchShot(aspect);
}

/** The phone or its note is on the move, or the screen is sliding between screens. */
function phoneSettling() {
    return Boolean(bench.anims.phone || bench.anims.note || bench.os?.busy());
}

/**
 * After a resize, re-frame whatever view is showing at the new aspect, in one
 * frame: the camera's shot, and anything held in hand (the tag, the phone and
 * its note). Nothing is re-announced; the screen doesn't change.
 */
function reframe(ctx) {
    if (!bench?.active || !bench.view) return undefined;
    const { view } = bench;
    const jobs = [ctx.camera.moveTo(shotFor(view, ctx.camera.object.aspect), { instant: true })];
    jobs.push(tagTo(ctx, view, bench.face, true));
    if (view === 'phone' || view === 'open') jobs.push(phoneTo(ctx, view, true));
    return Promise.all(jobs);
}

/** In-app taps that change the screen but not the route. */
function act(ctx, what) {
    if (what === 'release') bench.revealed = !bench.revealed;
    else if (what === 'logging') bench.logging = !bench.logging; // decorative: it only flips
    else return;
    showScreen(ctx.instant);
    speakApp(ctx);
}

function speakApp(ctx) {
    const { app } = bench;
    if (!app || !APP_LIVE[app]) return;
    ctx.live(APP_LIVE[app]({ date: ctx.now(), revealed: bench.revealed, logging: bench.logging, mode: bench.os?.camera().mode ?? null }));
}

// ---------------------------------------------------------------------------
// The phone's model
// ---------------------------------------------------------------------------

const MODEL_WAIT_MS = 6000;

function loadPhoneModel(ctx) {
    let timer = null;
    const load = loadGLTF(PHONE.url).catch((error) => {
        ctx.warn('pixel.glb failed to load; the phone is a plain slab', error);
        return null;
    });
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(undefined), MODEL_WAIT_MS); });
    return { first: Promise.race([load.finally(() => clearTimeout(timer)), timeout]), load };
}

export default {
    id: 'bench',
    objectIds: [OBJECT_ID],
    deskObjects: [
        {
            id: OBJECT_ID,
            label: LABEL,
            clickable: true,
            position: [...POSITION],
            rotation: [0, YAW, 0],
            // A couple of millimetres: the mat and everything on it rise together.
            hover: { lift: 0.01 },
            parts: [
                // Generous: the whole mat, and tall enough (60 mm) for the scope and most of the
                // organiser, so the bench is easy to hit from the establishing shot, where it is small.
                hitProxy([mm(MAT.w) + 0.02, mm(60), mm(MAT.d) + 0.02]),
                MAT_PART
            ]
        }
    ],
    states: [
        { hash: '#bench', note: 'leaning over the mat (34°): the EEG breadboard centred, the scope at the front left, the Pixel lying sideways face up (screen dark) at the front right, the written top half of a yellow note showing behind it, the parts organiser at the back right; the manila tag held up at the front centre: "Predicting eye movement from brain signals…"' },
        { hash: '#bench/back', note: 'the tag turned over and brought closer: "At university I worked with physicists…", then the thread "Caring what a model costs to run, from the other end of the scale." → the monitor' },
        { hash: '#bench/eeg', note: 'powered on: the USB lead in the Teensy, the LED lit, the scope on its stand with a yellow trace (a step up, back, a step down) and "LEFT"; the sticky "your cursor is standing in for your eyes"; clips on the AD8232' },
        { hash: '#bench/phone', note: 'the Pixel in hand (a little right of centre): lock screen with the time (21:40 in stills) and date, magenta lines down the left edge, green down the right; the yellow note it lay on uncovered on the mat' },
        { hash: '#bench/phone/open', note: 'unlocked, the phone at the left: a dumb-phone launcher, grey on black — a small clock/battery line, the date, then "log", "assistant", "camera", "notes", "about" in large type, left-aligned, no icons; the note at the right: "The dumb-phone movement, plus AI…" and the thread "The same argument, one layer down the stack…" → the board' },
        { hash: '#bench/phone/open/log', note: 'the log app: "what the kernel saw today", a 00–24 timeline of thin ticks (pickups, app opens) up to a dashed "now" line (21:40 in stills), "picked up 30 times" / "30 app opens", the chip "an illustrative day"; gesture bar at the bottom; the note beside the phone' },
        { hash: '#bench/phone/open/assistant', note: 'the assistant: "held until 9am" (6pm before 18:00 — stills are 21:40), "nothing urgent", messages 3 · email 7 · news 12 · calendar 1, a quiet outlined button "let them through", Shae\'s line "The dumb-phone movement, plus AI…" set off by a rule, and small: "the idea, sketched — not a shipped feature"' },
        { hash: '#bench/phone/open/camera', note: 'the camera: a live low-res (256 × 512) viewfinder of the bench seen from the phone\'s back, a shutter ring under it (without a renderer: "camera roll" — three photos: Amazon day one, the hackathon, the EEG board)' },
        { hash: '#bench/phone/open/notes', note: 'notes: "The dumb-phone movement, plus AI: a way to rely on my phone less. I still believe in that." in print, a rule, then "The same argument, one layer down the stack and considerably more personal." and an underlined "→ the board"' },
        { hash: '#bench/phone/open/about', note: 'about: "LineageOS · built by Shae", "extended to collect my own data at the kernel", a row "kernel logging: on" with its switch on, and small: "LineageOS, extended to collect my own data at the kernel."' },
        { hash: '#bench/drawer', note: 'the parts organiser: five labelled drawers (resistors, jumper wires, headers, electrodes, next), "next" pulled out: empty but for a slip with "?"' }
    ],

    async mount(ctx) {
        const group = ctx.deskScene.getObjectGroup(OBJECT_ID);
        if (!group) throw new Error(`desk object "${OBJECT_ID}" is missing`);
        bench = {
            ctx, group, rig: null, tag: null, tail: null, usb: null, scope: null, probe: null, phone: null, note: null, organiser: null,
            face: 'front', tagWhere: 'rest', view: null, active: false, pointerOver: false,
            anims: {}, stopLed: null, stopTick: null, stopClock: null,
            powered: false, powering: null, eog: createEog({ seconds: TRACE.seconds, samples: TRACE.samples }),
            phoneWhere: 'rest', noteWhere: 'rest', phoneTouched: false, phonePoseKey: null, openDrawer: null,
            os: null, app: null, revealed: false, logging: true,
            kinds: new Map(), targets: []
        };
        const phoneModel = loadPhoneModel(ctx);

        // Each piece fails on its own: a broken canvas must not take the board with it.
        const piece = (label, fn) => {
            try {
                fn();
            } catch (error) {
                ctx.warn(`${label} failed to build`, error);
            }
        };
        piece('the phone\'s OS', () => { bench.os = createPhoneOs(ctx); });
        piece('the mat print', () => {
            const mat = findMat(group);
            if (mat) dressMat(ctx, mat);
            else ctx.warn('mat part not found; left plain');
        });
        piece('the rig', () => {
            bench.rig = buildRig(ctx);
            group.add(bench.rig.rig);
        });
        piece('the tag', () => {
            const stringMaterial = bench.rig?.stringMaterial
                ?? new THREE.MeshStandardMaterial({ color: '#ece4d2', roughness: 0.95 });
            bench.tag = buildTag(ctx, stringMaterial);
            group.add(bench.tag.pivot);
            bench.tail = createTail(stringMaterial);
            group.add(bench.tail.mesh);
            setTagPose(tagRestTarget('front'));
        });
        piece('the USB lead', () => {
            bench.usb = buildUsb();
            group.add(bench.usb.group);
            setUsbPlugged(false);
        });
        piece('the scope', () => {
            bench.scope = buildScope(ctx);
            group.add(bench.scope.pivot);
        });
        piece('the probe', () => {
            if (!bench.scope) return;
            bench.probe = buildProbe(bench.scope);
            group.add(bench.probe.group);
        });
        piece('the organiser', () => {
            bench.organiser = buildOrganiser(ctx);
            group.add(bench.organiser.group);
        });
        piece('the phone note', () => {
            bench.note = buildPhoneNote(ctx);
            group.add(bench.note.pivot);
            const rest = noteRestPose();
            bench.note.pivot.position.copy(rest.position);
            bench.note.pivot.quaternion.copy(rest.quaternion);
        });

        // The Teensy's LED: steady in screenshots and for reduced motion; otherwise
        // ≈ 1 Hz until powered on, one frame per change (a timer + invalidate, never a held loop).
        startBlink(ctx);

        ctx.pointer.onMove((ndc) => {
            if (!bench.active) return;
            if (bench.view === 'eeg' && bench.powered && !ctx.still) {
                bench.eog.point(ndc.x);
                ctx.invalidate();
            }
            const action = actionFor(pick(ctx, ndc));
            const over = Boolean(action?.to || action?.act);
            if (over === bench.pointerOver) return;
            bench.pointerOver = over;
            ctx.setCursor(over ? 'pointer' : null);
        });

        // A resized viewport (a window dragged narrower, a phone turned) re-frames
        // the view and re-seats what is in hand — as the box does. DeskScene
        // updates the camera's aspect from a ResizeObserver, so wait a moment.
        let resizeTimer = null;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                try {
                    const done = reframe(ctx);
                    if (done) ctx.track(done, 'bench: re-frame after resize');
                } catch (error) {
                    ctx.warn('re-framing after a resize failed', error);
                }
            }, 160);
        });

        // Keep the veil up (never past the room's opening budget) until the Pixel has loaded.
        const model = await phoneModel.first;
        const placePhone = (m) => {
            const previous = bench.phone;
            bench.phone = buildPhone(ctx, m ?? null);
            if (previous) {
                bench.phone.pivot.position.copy(previous.pivot.position);
                bench.phone.pivot.quaternion.copy(previous.pivot.quaternion);
                group.remove(previous.pivot);
            } else {
                const rest = phoneRestPose();
                bench.phone.pivot.position.copy(rest.position);
                bench.phone.pivot.quaternion.copy(rest.quaternion);
            }
            group.add(bench.phone.pivot);
            bench.os?.attach(bench.phone); // the screen (and a running viewfinder) moves over to it
            refreshTargets();
            ctx.invalidateShadows();
        };
        piece('the phone', () => placePhone(model));
        if (model === undefined) {
            // Still on its way: swap the slab for the Pixel when it lands.
            ctx.track(phoneModel.load.then((m) => { if (m) piece('the phone', () => placePhone(m)); }), 'bench: pixel.glb');
        }
        refreshTargets();
        ctx.invalidateShadows();
    },

    async go(ctx, path, { instant }) {
        const { view, face = bench?.face ?? 'front', slug = null, app = null } = parse(path);
        ctx.visit.log(VISIT_TITLE);
        if (VISIT[view === 'open' ? 'phone' : view]) ctx.visit.log(VISIT[view === 'open' ? 'phone' : view]);
        const hintKey = view === 'tag' ? face : view;
        ctx.hint(app ? APP_HINTS[app] : HINTS[hintKey]);
        if (!app) ctx.live(view === 'drawer' ? LIVE.drawer(slug ?? 'none') : LIVE[hintKey]);

        const cameraMove = ctx.camera.moveTo(shotFor(view, ctx.camera.object.aspect), { instant });
        if (!bench) {
            await cameraMove;
            return;
        }
        bench.active = true;
        const previous = bench.view;
        bench.view = view;
        if (bench.app === 'assistant' && app !== 'assistant') bench.revealed = false; // held again next time
        bench.app = view === 'open' ? app : null;
        if (previous === 'eeg' && view !== 'eeg') {
            stopLive();
            paintScopeRest();
        }

        const jobs = [cameraMove];
        jobs.push(tagTo(ctx, view, face, instant));
        jobs.push(phoneTo(ctx, view, instant));
        jobs.push(drawersTo(ctx, view === 'drawer' ? slug : null, instant));
        if (view === 'eeg') {
            jobs.push(powerOn(ctx, instant).then(() => {
                if (bench.view === 'eeg') startLive(ctx);
            }));
        }
        if (app) speakApp(ctx);
        await Promise.all(jobs);
    },

    async leave(ctx, { instant }) {
        if (!bench) return;
        bench.active = false;
        if (bench.view === 'eeg') {
            stopLive();
            paintScopeRest();
        }
        bench.view = null;
        bench.app = null;
        bench.revealed = false;
        if (bench.pointerOver) {
            bench.pointerOver = false;
            ctx.setCursor(null);
        }
        // Put everything down the way it was left: the tag face up, or back up (a little
        // askew) if you read the back; the phone face up, lit if you woke it; drawers in.
        await Promise.all([
            tagTo(ctx, null, bench.face, instant),
            phoneTo(ctx, null, instant),
            drawersTo(ctx, null, instant)
        ]);
    },

    key(ctx, event) {
        if (!bench?.active) return false;
        const onPage = event.target === document.body || event.target === ctx.deskScene.renderer.domElement;
        const activate = onPage && (event.key === ' ' || event.key === 'Enter');
        const { view } = bench;
        if (event.key === 'Escape' && view === 'open') {
            // Back out of the phone one step at a time: app → launcher → lock.
            ctx.navigate(bench.app ? '#bench/phone/open' : '#bench/phone');
            return true;
        }
        if (event.key === 'Escape' && view !== 'tag') {
            ctx.navigate('#bench');
            return true;
        }
        if ((view === 'phone' || view === 'open') && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
            return true; // nothing to step through on the phone
        }
        if (view === 'tag' && bench.tag && (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || activate)) {
            ctx.navigate(bench.face === 'back' ? '#bench' : '#bench/back');
            return true;
        }
        if (view === 'phone' && activate) {
            ctx.navigate('#bench/phone/open');
            return true;
        }
        if (view === 'drawer' && (event.key === 'ArrowUp' || event.key === 'ArrowDown' || activate)) {
            const list = ORGANISER.drawers;
            const index = list.indexOf(bench.openDrawer);
            if (activate) {
                ctx.navigate(index < 0 ? '#bench/drawer/next' : '#bench/drawer/shut', { replace: true });
                return true;
            }
            const step = event.key === 'ArrowDown' ? 1 : -1;
            const next = index < 0 ? (step > 0 ? 0 : list.length - 1) : (index + step + list.length) % list.length;
            ctx.navigate(`#bench/drawer/${list[next]}`, { replace: true });
            return true;
        }
        return false;
    },

    click(ctx, ndc) {
        if (!bench?.active) return false;
        const target = pick(ctx, ndc);
        // While the phone or its note is moving, or the screen is mid-slide, a tap
        // lands somewhere it didn't aim: the second click of a double-click on the
        // lock screen would open whatever app rose under it, hit the note's thread
        // as it came up, or the board the phone just slid off. Swallow it (with the
        // phone in hand, any click); the next tap after the move counts.
        const inHand = bench.view === 'phone' || bench.view === 'open';
        if (phoneSettling() && (inHand || target?.kind === 'phone' || target?.kind === 'note')) return true;
        const action = actionFor(target);
        if (!action) return false;
        if (action.act) act(ctx, action.act);
        else if (action.to) ctx.navigate(action.to, action.replace ? { replace: true } : undefined);
        return true;
    },

    /** After a visit: the tag back up, the rig powered (the LED flickering), the phone face up and lit. */
    trail(ctx) {
        ctx.visit.log(VISIT_TITLE);
        ctx.visit.log(VISIT.eeg);
        ctx.visit.log(VISIT.phone);
        if (!bench || bench.active) return undefined;
        const jobs = [powerOn(ctx, true)];
        bench.phoneTouched = true;
        bench.os?.show({ kind: 'lock' }, { instant: true });
        startClock(ctx);
        if (bench.tag) {
            bench.face = 'back';
            bench.tagWhere = 'rest';
            jobs.push(moveTag(tagRestTarget('back'), { preset: 'put', arc: PUT_ARC, instant: ctx.instant }));
        }
        return Promise.all(jobs);
    }
};
