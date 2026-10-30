import * as THREE from 'three';
import { hitProxy } from '../../core/parts.js';
import { mm } from '../../core/framing.js';
import {
    OBJECT_ID, BOX_POSITION, BOX_YAW, OUTER, ITEMS, fileTop,
    slotPose, dividerPose, isKeepsake, isCard, isDivider, TRAIL_IDS, SHEETS_MM, DIVIDER_MM, tabLeftMm,
    pilePose, pileRects, pileLayerHeight, pileWorldPose, footprint, asidePose, asideRects, pileBadgeFootprint, pileBadgeBase, PILE_BADGE_HEIGHT,
    boxShot, portraitShot, shotZoom, PORTRAIT_ASPECT, TALL_MEMO_ASPECT, handPose,
    carryControls, carryPoint, passCurve, passTurn, liftCurve, liftTurn, putClearY, putTurn, READING_LIGHT, toUnits,
    exitsOverFlicked, liftPath, passPath, exitBackPath, putPath
} from './layout.js';
import { liveText, TITLES, END } from './copy.js';
import { buildBox, buildItem, stickyLiftFor } from './build.js';

/**
 * BOX — "kept". A kraft photo box, masking tape on its front: the past lives
 * in it as keepsakes, in three chapters. Its lid is already off, tucked under
 * it, and the file stands in it: an index card at the front, three tabbed
 * dividers (2022 · 2023 · 2024) between the prints, the memos and the ITE
 * clipping towards the back, an end card last.
 *
 * Go to it and the opening card comes up into your hand ("things I kept ·
 * start at the front"). → sets it aside and pulls the 2022 divider up proud:
 * its chapter line reads where it stands. → again flicks the divider forward
 * onto the box's front rim, the way you go through a card file, and lifts the
 * print behind it. Prints turn over (click, Space, Enter) for the note on the
 * back — and three backs end in a thread line with an arrow: click the arrow
 * and it hands you to the harbour, the monitor, or the memos. Memos come out
 * with a newspaper clipping clipped behind them — turn one and the clipping
 * slides out in front: what I wrote, then what happened, and how long it took.
 * Whatever you've looked at stays on the desk in front of the box: the room
 * keeps your trail. After the last memo, the end card: "what the hell is
 * worthy of solving? → now" — follow it and the camera turns to the monitor's
 * "now" note. Past, then present.
 *
 * Paths:
 *   []                     the opening card in hand (on re-entry with a trail already
 *                          on the desk: the next thing still in the box)
 *   [id]                   that card or keepsake in hand, front; a divider: pulled up proud
 *   [id, 'back'|'turned']  a keepsake turned over / its clipping out
 *   ['end']                the end card in hand
 *   ['trail']              the first five prints on the desk, hands empty
 *   ['open']               everything out, hands empty
 * Unknown paths fall back to [].
 *
 * Where things go: keepsakes → the pile in front of the box; the opening
 * card → set aside on the desk to the left; the end card → back into its slot
 * at the back of the file; dividers never leave the box (flush · proud ·
 * flicked). Everything before where you are has been passed: dividers
 * flicked, keepsakes on the pile — so every state loads the same fresh, and a
 * jump (a thread, a deep link) passes what's in between the way → would.
 *
 * One camera for every box state (layout.js SHOT, checked in node): the
 * things move, not the room. It needs a longer lens than the room's: while
 * the box is active the camera's ZOOM is raised (layout.js shotZoom; never its
 * fov, which other modules read) and eased back on leave. A shadowless warm
 * reading light (layout.js READING_LIGHT) eases up with the camera and down
 * as it leaves. What you hold doesn't take the room's shadows while it's in
 * your hand (the display's shadow edge would cross it diagonally); it takes
 * them again as it goes down.
 */

const ENTRY_LIFT_DELAY_MS = 260;   // the camera is on its way in by then
const SWAP_LIFT_DELAY_MS = 170;    // the next one follows the last one down
const PASS_STAGGER_MS = 70;
const PASS_CLEAR_MS = 330;         // a passed sheet is up and away by then: a divider behind it may tip
const FLICK_PRESET = 'slide';      // the card-file flick (420 ms)
/**
 * The sheet behind a flicking divider starts out of the file this far into
 * the flick (315 ms). It comes out leaning on the divider's back (layout.js
 * exitPlan), so the divider must be all but down: checked in node against the
 * flick's own easing, from flush and from proud — a lift clears it from 240 ms,
 * a pass from 270 ms. (0.35 served the first v3 exit, straight up the file.)
 */
const FLICK_EXIT_AFTER = 0.75;

const HINT_ITEM = 'click to turn it over · ← → for the others · esc to step back';
const HINT_THREAD = 'click the arrow to follow it · ← → · esc to step back';
const HINT_INTRO = 'click or → to start at the front · esc to step back';
const HINT_DIVIDER = "click or → for what's behind it · ← to go back · esc to step back";
const HINT_END = 'click or → to follow it to now · ← for the others · esc to step back';
const HINT_OPEN = '→ for the next one · esc to step back';
const HINT_DONE = "that's everything · ← to go back through · esc to step back";

let S = null; // module state, built in mount()

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** The built entries, in file order (anything that failed to build is left out). */
const list = () => S.list;
const posOf = (id) => S.list.findIndex((it) => it.id === id);

function hashFor(id, turned = false) {
    const it = S.items[id];
    if (!it) return '#box';
    if (!turned || !isKeepsake(it.item)) return `#box/${id}`;
    return `#box/${id}/${it.item.kind === 'memo' ? 'turned' : 'back'}`;
}

function targetFor(it, turned = false) {
    if (!it) return { mode: 'open', id: null, turned: false };
    if (isDivider(it.item)) return { mode: 'divider', id: it.id, turned: false };
    return { mode: 'item', id: it.id, turned: turned && isKeepsake(it.item) };
}

function parsePath(path) {
    const [head, sub] = path ?? [];
    if (head === 'trail') return { mode: 'trail', id: null, turned: false };
    if (head === 'open') return { mode: 'open', id: null, turned: false };
    if (head && S.items[head]) return targetFor(S.items[head], sub === 'back' || sub === 'turned');
    return { ...targetFor(S.list[0]), root: true };
}

/**
 * Where a target stands in the file: everything before it has been passed.
 * Trail: just after the fifth print. Open: past the end.
 */
function positionOf(target) {
    if (!target) return 0;
    if (target.mode === 'trail') return Math.max(...TRAIL_IDS.map(posOf)) + 1;
    if (target.mode === 'open') return S.list.length;
    return Math.max(0, posOf(target.id));
}

/** Has this entry been gone past (flicked, on the pile, set aside)? */
function isDone(it) {
    if (isDivider(it.item)) return it.divider.state === 'flicked';
    if (it.id === 'end') return false; // it goes back into the box
    return it.location === 'pile' || it.location === 'aside';
}

function cancelAnims(it) {
    for (const anim of it.anims) anim.cancel?.();
    it.anims.clear();
    it.token = (it.token ?? 0) + 1; // voids any delayed follow-up still waiting to start
}

function keep(it, anim) {
    it.anims.add(anim);
    anim.then(() => it.anims.delete(anim));
    return anim;
}

function wait(ctx, ms, instant) {
    return ctx.motion.wait(ms, { instant });
}

/** Held things don't take the room's shadows (the display's edge would cross them); everything else does. */
function setShadowed(it, on) {
    if (it.shadowed === on) return;
    it.shadowed = on;
    it.root.traverse((node) => { if (node.isMesh) node.receiveShadow = on; });
}

// ---------------------------------------------------------------------------
// The pile: each thing lands on whatever it overlaps
// ---------------------------------------------------------------------------

/** World-space footprint of something lying on the desk (a keepsake on the pile, or the card set aside), as a convex polygon in xz. */
function pileFootprint(id) {
    const it = S.items[id];
    if (it && isCard(it.item)) return footprint(asidePose(id), asideRects(id));
    return footprint(pilePose(id), pileRects(id).slice(0, 1));
}

function overlaps(a, b) {
    for (const poly of [a, b]) {
        for (let i = 0; i < poly.length; i += 1) {
            const [x1, z1] = poly[i];
            const [x2, z2] = poly[(i + 1) % poly.length];
            const ax = -(z2 - z1);
            const az = x2 - x1;
            let aMin = Infinity; let aMax = -Infinity; let bMin = Infinity; let bMax = -Infinity;
            for (const [x, z] of a) { const v = x * ax + z * az; aMin = Math.min(aMin, v); aMax = Math.max(aMax, v); }
            for (const [x, z] of b) { const v = x * ax + z * az; bMin = Math.min(bMin, v); bMax = Math.max(bMax, v); }
            if (aMax < bMin || bMax < aMin) return false;
        }
    }
    return true;
}

/**
 * Height of the pile's top under `id`'s footprint (the underside it should
 * land at). v4: badges lie on the pile beside their sheets, so an item lands
 * on whatever its sheet overlaps — another's sheet, or another's badge — and
 * no lower than its own badge (held `pileBadgeBase` above its layer) needs to
 * clear what that overlaps.
 */
function pileHeightFor(id) {
    const sheet = pileFootprint(id);
    const mineBadge = S.items[id]?.badge ? pileBadgeFootprint(id) : null;
    const base = mineBadge ? pileBadgeBase(id) : 0;
    let top = 0.0006;
    for (const other of S.pileOrder) {
        if (other === id) continue;
        const o = S.items[other];
        const polys = [pileFootprint(other)];
        const heights = [o.pileY + pileLayerHeight(o.item)];
        if (o.badge) { polys.push(pileBadgeFootprint(other)); heights.push(o.pileY + pileBadgeBase(other) + PILE_BADGE_HEIGHT); }
        polys.forEach((poly, k) => {
            // My sheet lands on it; my badge (which stands `base` above my layer) must clear it too.
            if (overlaps(sheet, poly)) top = Math.max(top, heights[k]);
            if (mineBadge && overlaps(mineBadge, poly)) top = Math.max(top, heights[k] + 0.0004 - base);
        });
    }
    return top;
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

/**
 * Detach an item from the box into world space (keeps where it is). If the
 * box was hover-tinted when the item left it, DeskScene would only ever
 * restore the box's own meshes — so put the item's materials back here.
 */
function toWorld(it) {
    if (it.root.parent === S.world) return;
    it.root.traverse((node) => {
        const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
        for (const m of materials) {
            const rest = m.userData?.restEmissive;
            if (rest && m.emissive) { m.emissive.setHex(rest.hex); m.emissiveIntensity = rest.intensity; }
        }
    });
    S.world.attach(it.root);
}

/** Back into the box's file group (the end card going home), keeping where it is. */
function toFile(it) {
    if (it.root.parent === S.box.file) return;
    S.box.file.attach(it.root);
}

// --- sticky notes: lit for where they are -----------------------------------

/**
 * A sticky's self-lift is tuned to its light (core/paper.js STICKY_LIGHT): on
 * the desk it needs more than held up to the camera, or it reads khaki there
 * and bleached here. So the lift travels with the carry: `stickyFade` returns
 * an update(e) that eases every sticky on the item toward `light`.
 */
function stickyFade(ctx, it, light) {
    if (!it.stickies.length || it.stickyLight === light) return null;
    it.stickyLight = light;
    const to = stickyLiftFor(ctx, light);
    const from = it.stickies.map((m) => m.emissiveIntensity);
    return (e) => {
        it.stickies.forEach((m, i) => {
            m.emissiveIntensity = from[i] + (to - from[i]) * e;
            if (m.userData.restEmissive) m.userData.restEmissive.intensity = m.emissiveIntensity;
        });
    };
}

function setStickyLight(ctx, it, light) {
    const fade = stickyFade(ctx, it, light);
    fade?.(1);
}

/**
 * Put something down (or re-seat it in hand): a cubic Bézier to a world pose,
 * with `arrive: 'down'` settling it onto the desk from above. Returns a
 * cancellable promise; the start is read after any delay, so a superseded
 * move sets off from wherever the item has got to. (Lifts use carryAlong.)
 */
function carry(ctx, it, target, { preset = 'put', arrive = null, instant, delay = 0, light = null, shadowAt = null }) {
    const clearY = arrive === 'down' ? putClearY(it.index) : 0;
    let inner = null;
    let cancelled = false;
    const promise = (async () => {
        if (delay) await wait(ctx, delay, instant);
        if (cancelled) return false;
        toWorld(it);
        it.exitS = null;
        const p0 = it.root.position.clone();
        const q0 = it.root.quaternion.clone();
        const p3 = target.position.clone();
        const q1 = target.quaternion.clone();
        const { c1, c2 } = carryControls(p0, p3, { arrive, clearY });
        const fade = light ? stickyFade(ctx, it, light) : null;
        const tmp = new THREE.Vector3();
        inner = ctx.motion.animate({
            from: 0, to: 1, preset, instant,
            onUpdate: (e) => {
                it.root.position.copy(carryPoint(p0, c1, c2, p3, e, tmp));
                it.root.quaternion.slerpQuaternions(q0, q1, arrive === 'down' ? putTurn(e) : e);
                fade?.(e);
                if (shadowAt !== null && e >= shadowAt) setShadowed(it, true);
            }
        });
        return inner;
    })();
    promise.cancel = () => { cancelled = true; inner?.cancel(); };
    return keep(it, promise);
}

/**
 * Carry along a prepared curve (by arc length), turning as `turn(curve, e)`
 * says; `reverse` runs the curve backwards (the end card going home along the
 * way it came out). `makeCurve(p0, p3, from, to)` may instead return a
 * layout.js PosePath, which carries its own turn (the moves out of the file
 * past flicked dividers, and the put-down): then `it.exitS` follows where the
 * sheet is along the exit (null once it's out), so a move that interrupts it
 * can carry on out the same way. `shadow` = [at, on]: switch the room's
 * shadows on or off this far along. `onStart` runs once the delay is over and
 * the sheet sets off. Cancellable.
 */
function carryAlong(ctx, it, makeCurve, target, { preset = 'pick', turn = (curve, e) => e, instant, delay = 0, after = null, exit = false, zone = false, light = null, shadow = null, reverse = false, onStart = null, onDone = null }) {
    let inner = null;
    let cancelled = false;
    // Out through the V between the flicked dividers and the file (or home down it) — or, `zone`, down
    // through the space in front of the box: known from now, so what comes out after it, or a divider
    // standing back up behind it, can wait for it (go()).
    const exitMove = exit || zone ? beginExitMove(it) : null;
    if (exitMove && !exit) exitMove.leftExit();
    const promise = (async () => {
        if (delay || (after && !instant)) await Promise.all([delay ? wait(ctx, delay, instant) : null, instant ? null : after]);
        if (cancelled) return false;
        onStart?.();
        toWorld(it);
        const q0 = it.root.quaternion.clone();
        const q1 = target.quaternion.clone();
        const from = { position: it.root.position.clone(), quaternion: q0.clone() };
        const curve = reverse
            ? makeCurve(target.position.clone(), it.root.position.clone())
            : makeCurve(it.root.position.clone(), target.position.clone(), from, target);
        const posed = typeof curve.at === 'function';
        it.exitS = posed ? curve.exitAt(0) : null; // from the moment it sets off, not its first frame
        let wasIn = it.exitS !== null;
        const fade = light ? stickyFade(ctx, it, light) : null;
        const tmp = new THREE.Vector3();
        inner = ctx.motion.animate({
            from: 0, to: 1, preset, instant,
            onUpdate: (e) => {
                if (posed) {
                    curve.at(e, it.root.position, it.root.quaternion);
                    it.exitS = curve.exitAt(e);
                } else {
                    const at = reverse ? 1 - e : e;
                    it.root.position.copy(curve.getPointAt(at, tmp));
                    // Reversed, the turn runs backwards too: it faces the file again before it slides in.
                    const k = reverse ? 1 - turn(curve, at) : turn(curve, e);
                    it.root.quaternion.slerpQuaternions(q0, q1, k);
                }
                if (exitMove) {
                    if (it.exitS !== null) wasIn = true;
                    else if (exit ? wasIn && !inFront(it) : isLow(it)) exitMove.done();
                    else if (wasIn) exitMove.leftExit();
                }
                fade?.(e);
                if (shadow && e >= shadow[0]) setShadowed(it, shadow[1]);
            }
        });
        const ok = await inner;
        if (ok && onDone) onDone();
        return ok;
    })();
    promise.cancel = () => { cancelled = true; inner?.cancel(); };
    if (exitMove) promise.then(() => exitMove.done());
    return keep(it, promise);
}

/**
 * `it` is on its way out through the exit (or home down it). `out` resolves
 * once it has left the exit (a divider behind it may stand back up, one in
 * front of it may flick); `clear` once it is also out of the way in front of
 * the box — past the tabs and the hand's side, or down low — so the next sheet
 * can come out over the tabs. Both resolve when the move ends or is stopped.
 */
function beginExitMove(it) {
    it.exitMove?.done();
    let out;
    let clear;
    const move = {
        out: new Promise((r) => { out = r; }),
        clear: new Promise((r) => { clear = r; }),
        leftExit: () => out(true),
        done: () => { out(true); clear(true); if (it.exitMove === move) it.exitMove = null; }
    };
    it.exitMove = move;
    return move;
}

/** Is `it` in the way in front of and above the box, where a sheet comes out over the tabs toward the hand? */
function inFront(it) {
    const p = S.box.file.worldToLocal(it.root.getWorldPosition(new THREE.Vector3()));
    return Math.abs(p.x) < 0.5 && p.z > -0.25 && p.z < 0.95 && p.y > 0.3;
}

/** Is `it` (going down to the pile) below where anything comes out of the box or up to a hand held high? */
function isLow(it) {
    return S.box.file.worldToLocal(it.root.getWorldPosition(new THREE.Vector3())).y < 0.3;
}

/**
 * What a sheet coming out of the file past the flicked dividers waits for:
 * every sheet in front of it still coming out (clear of the front of the box),
 * and the flick of every divider in front of it (far enough through).
 */
function frontClear(it) {
    const waits = [];
    for (const other of list()) {
        if (other === it || other.index > it.index) continue;
        if (other.exitMove) waits.push(other.exitMove.clear);
        if (other.divider?.lead) waits.push(other.divider.lead);
    }
    return waits.length ? Promise.all(waits) : null;
}

/**
 * Held high above the box (a phone's portrait shot: the hand is over the box,
 * against the wall), the way up to your hand and the way down to the pile both
 * run through the space in front of the box: there a lift waits for anything
 * still coming out or going down through it, and a put-down counts as going
 * down through it. Box-local height of the hand beyond which that holds (it
 * is ≈ 0.56 in landscape, 0.9 at 1:1, 1.07 at 3:4, 2.45 on a phone).
 */
const HIGH_HAND_Y = 1.0;
const heldHigh = (pose) => S.box.file.worldToLocal(pose.position.clone()).y > HIGH_HAND_Y;

/** Everything else still coming out or going down in front of the box. */
function allClear(it) {
    const waits = list().filter((other) => other !== it && other.exitMove).map((other) => other.exitMove.clear);
    return waits.length ? Promise.all(waits) : null;
}

/** What a divider flicking forward waits for: every sheet in front of it out of the exit (the V it tips into). */
function exitsInFront(divider) {
    const waits = list().filter((other) => other.index < divider.index && other.exitMove).map((other) => other.exitMove.out);
    return waits.length ? Promise.all(waits) : null;
}

/** The file's world matrix now (the frame the exit paths are solved in). */
function fileMatrix() {
    S.box.file.updateWorldMatrix(true, false);
    return S.box.file.matrixWorld.clone();
}

/**
 * From the file straight to its place (the pile, or aside) — or on from part
 * way out (`it.exitS`): past the flicked dividers (layout.js passPath), or, for
 * the opening card, up out of the file, over the front wall, down (passCurve).
 */
function carryOut(ctx, it, target, { instant, delay = 0 }) {
    if (exitsOverFlicked(it.index)) {
        // From its slot it waits for what's in front of it to be out of the way; caught part way out, it carries on.
        const fromSlot = it.exitS == null;
        return carryAlong(ctx, it, () => passPath(it.index, target, { from: it.exitS ?? 0, toWorld: fileMatrix() }), target, {
            preset: 'put', instant, delay, after: fromSlot ? frontClear(it) : null, exit: true, light: 'desk'
        });
    }
    return carryAlong(ctx, it, (p0, p3) => passCurve(p0, p3, it.item, it.index), target, {
        preset: 'put', turn: passTurn, instant, delay, light: 'desk'
    });
}

/** Turn an item over (or back): the flip group about the item's own vertical axis, lifting toward you mid-turn. */
function setFlip(ctx, it, turned, { instant, preset = 'turn' } = {}) {
    const target = turned ? Math.PI : 0;
    const from = it.flip.rotation.y;
    if (Math.abs(from - target) < 1e-4) {
        it.flip.position.z = 0;
        return Promise.resolve(true);
    }
    return keep(it, ctx.motion.animate({
        from, to: target, preset, instant,
        onUpdate: (angle) => {
            it.flip.rotation.y = angle;
            const k = Math.abs(angle - from) / Math.PI;
            it.flip.position.z = ctx.motion.arc(Math.min(1, Math.max(0, k)), ctx.motion.TURN_LIFT); // 1.5 cm toward you mid-turn
        }
    }));
}

// --- dividers: flush, proud, flicked ---------------------------------------------

const DIVIDER_H = toUnits(SHEETS_MM.divider)[1];

/** A divider pose as { pivot (its bottom edge's centre), q, lift (up its own plane) }, box-local. */
function dividerParams(it, state) {
    const pose = dividerPose(it.index, state);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(pose.quaternion);
    if (state === 'proud') {
        const flush = dividerPose(it.index, 'flush');
        const lift = pose.position.clone().sub(flush.position).dot(up);
        return { pivot: pose.position.clone().addScaledVector(up, -(DIVIDER_H / 2 + lift)), q: pose.quaternion.clone(), lift };
    }
    return { pivot: pose.position.clone().addScaledVector(up, -DIVIDER_H / 2), q: pose.quaternion.clone(), lift: 0 };
}

function applyDivider(it, p) {
    it.divider.params = { pivot: p.pivot.clone(), q: p.q.clone(), lift: p.lift };
    it.root.quaternion.copy(p.q);
    it.root.position.copy(p.pivot).addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(p.q), DIVIDER_H / 2 + p.lift);
}

/**
 * Take a divider to `state`, pivoting on its bottom edge (the flick) and
 * sliding up or down its own plane (proud / flush) together, so its foot
 * never leaves the box's floor while it tips.
 */
function setDivider(ctx, it, state, { instant, delay = 0, after = null, lead = 0 } = {}) {
    it.divider.state = state;
    // When this move sets off (performance.now() ms): go() times what stands behind a flick still running from it.
    it.divider.movesAt = performance.now() + (instant ? 0 : delay);
    // …and `lead` ms after a flick sets off, what stands behind it may start out (frontClear).
    let leadDone = null;
    it.divider.lead = state === 'flicked' && lead > 0 && !instant ? new Promise((r) => { leadDone = r; }) : null;
    const myLead = it.divider.lead;
    const release = () => { leadDone?.(true); if (it.divider.lead === myLead) it.divider.lead = null; };
    const to = dividerParams(it, state);
    const now = it.divider.params;
    if (now && now.pivot.distanceTo(to.pivot) < 1e-5 && now.q.angleTo(to.q) < 1e-5 && Math.abs(now.lift - to.lift) < 1e-5) { release(); return Promise.resolve(true); }
    let inner = null;
    let cancelled = false;
    const promise = (async () => {
        if (delay || (after && !instant)) await Promise.all([delay ? wait(ctx, delay, instant) : null, instant ? null : after]);
        if (cancelled) { release(); return false; }
        it.divider.movesAt = performance.now();
        if (leadDone) wait(ctx, lead, instant).then(release);
        const from = it.divider.params ?? dividerParams(it, 'flush');
        const pivot = new THREE.Vector3();
        const q = new THREE.Quaternion();
        inner = ctx.motion.animate({
            from: 0, to: 1, preset: state === 'flicked' || from.q.angleTo(to.q) > 0.05 ? FLICK_PRESET : 'slide', instant,
            onUpdate: (e) => applyDivider(it, {
                pivot: pivot.lerpVectors(from.pivot, to.pivot, e), q: q.slerpQuaternions(from.q, to.q, e), lift: from.lift + (to.lift - from.lift) * e
            })
        });
        return inner;
    })();
    promise.cancel = () => { cancelled = true; inner?.cancel(); release(); };
    return keep(it, promise);
}

// --- memo arrangements ------------------------------------------------------

/** A portrait screen: turned memos stack their clipping below instead of beside (layout.js turnedTall). */
const isTall = () => (S?.aspect ?? 16 / 9) < TALL_MEMO_ASPECT;

function arrangementValues(it, name) {
    const L = it.layout;
    const z = L.z;
    const T = isTall() ? L.turnedTall : L.turned;
    const A = {
        front: { mx: L.front.memo.x, my: L.front.memo.y, mz: z.memo, cx: L.front.clipping.x, cy: L.front.clipping.y, cz: z.clippingBehind, cs: L.front.clipping.spin, red: 0 },
        turned: { mx: T.memo.x, my: T.memo.y, mz: z.memoBack, cx: T.clipping.x, cy: T.clipping.y, cz: z.clippingFront, cs: T.clipping.spin, red: 1 },
        pile: { mx: L.pile.memo.x, my: L.pile.memo.y, mz: z.memo, cx: L.pile.clipping.x, cy: L.pile.clipping.y, cz: z.clippingBehind, cs: L.pile.clipping.spin, red: 0 }
    };
    // Waypoints: the clipping parked clear of the memo on the right, behind or in front.
    A.outBehind = { ...A.front, cx: L.clearX, cy: L.front.clipping.y, cs: 0.0 };
    A.outFront = { ...A.turned, cx: L.clearX - 0.04, cy: T.clipping.y, cs: 0.01, red: 0 };
    return A[name];
}

function applyArrangement(it, v) {
    const { memoGroup, clippingGroup, decal } = it.memo;
    memoGroup.position.set(v.mx, v.my, v.mz);
    clippingGroup.position.set(v.cx, v.cy, v.cz);
    clippingGroup.rotation.z = v.cs;
    decal.material.opacity = v.red;
    decal.visible = v.red > 0.01;
    it.arrValue = { ...v };
}

/** Is the clipping in front of the memo right now (whatever arrangement it is heading for)? */
const clippingInFront = (it) => Boolean(it.arrValue) && it.arrValue.cz > it.arrValue.mz;

/**
 * The route between arrangements that never pushes one sheet through the
 * other: the clipping only changes sides of the memo while parked clear of it
 * on the right. Planned from where the sheets actually are, so a turn
 * interrupted halfway still routes round rather than through.
 */
function arrangementRoute(it, to) {
    const inFront = clippingInFront(it);
    if (to === 'turned') return inFront ? ['turned'] : ['outBehind', 'turned'];
    return inFront ? ['outFront', to] : [to];
}

function arrange(ctx, it, name, { instant, phase = 'slide' } = {}) {
    if (!it.memo) return Promise.resolve(true);
    const route = arrangementRoute(it, name);
    it.arr = name;
    if (instant || route.length === 0) {
        applyArrangement(it, arrangementValues(it, name));
        ctx.invalidateShadows();
        return Promise.resolve(true);
    }
    const run = async () => {
        for (const step of route) {
            const from = { ...it.arrValue };
            const to = arrangementValues(it, step);
            // When the clipping changes sides of the memo, it changes depth
            // first (while it is clear to the right), then slides across.
            const crosses = Math.sign(from.cz - from.mz) !== Math.sign(to.cz - to.mz);
            const ok = await keep(it, ctx.motion.animate({
                from: 0, to: 1, preset: step === 'turned' ? 'reveal' : phase,
                onUpdate: (e) => {
                    const depth = crosses ? Math.min(1, e / 0.4) : e;
                    const across = crosses ? Math.max(0, (e - 0.25) / 0.75) : e;
                    const lerp = (a, b, t) => a + (b - a) * t;
                    applyArrangement(it, {
                        mx: lerp(from.mx, to.mx, e), my: lerp(from.my, to.my, e), mz: lerp(from.mz, to.mz, depth),
                        cx: lerp(from.cx, to.cx, across), cy: lerp(from.cy, to.cy, across), cz: lerp(from.cz, to.cz, depth),
                        cs: lerp(from.cs, to.cs, across),
                        red: to.red > from.red ? lerp(from.red, to.red, Math.max(0, (e - 0.45) / 0.55)) : lerp(from.red, to.red, Math.min(1, e / 0.3))
                    });
                }
            }));
            if (!ok) return false;
        }
        return true;
    };
    return run();
}

/** Show an item's front or back while it is in hand. */
function setTurned(ctx, it, turned, { instant }) {
    it.turned = turned;
    if (it.item.kind === 'memo') return arrange(ctx, it, turned ? 'turned' : 'front', { instant });
    return setFlip(ctx, it, turned, { instant });
}

// --- whole-item moves -------------------------------------------------------

/** Where a card or keepsake rests when it isn't in hand (and isn't in the file). */
function restFor(it) {
    if (it.id === 'end') return 'box';
    return isCard(it.item) ? 'aside' : 'pile';
}

function lift(ctx, it, { instant, delay = 0 }) {
    const from = it.location;
    it.location = 'hand';
    const order = S.pileOrder.indexOf(it.id);
    S.pileOrder = S.pileOrder.filter((id) => id !== it.id);
    // Until the carry sets off (after `delay`) nothing has moved: a go() or a
    // leave() in that time undoes the lift (abortPendingLift) rather than
    // "putting down" a sheet that is still standing in the file. Only for a
    // sheet lifted from rest: one caught moving (a pass or a put still on its
    // way) has already left its place, and is put down from where it is.
    const rest = from === 'box' ? slotPose(it.index) : (from === 'pile' || from === 'aside') ? pileWorldPose(it.id, it.pileY ?? 0) : null;
    const atRest = rest !== null && it.root.parent === (from === 'box' ? S.box.file : S.world)
        && it.root.position.distanceTo(rest.position) < 1e-4 && it.root.quaternion.angleTo(rest.quaternion) < 1e-4;
    it.liftPending = atRest ? { from, order } : null;
    const pose = heldPose(ctx, it);
    // Out of the file past flicked dividers — from its slot, or on from part way out (a pass cut short,
    // the end card caught on its way home). Anything else caught in the air rises from where it is.
    const inFile = from === 'box' && atRest;
    const overFlicked = exitsOverFlicked(it.index) && (inFile || it.exitS != null);
    const inAir = !atRest && !overFlicked; // caught on its way down: straight back up to your hand, no climb
    const makeCurve = overFlicked
        ? (p0, p3, start, end) => liftPath(it.index, end, { from: it.exitS ?? 0, toWorld: fileMatrix() })
        : inAir
            ? (p0, p3) => new THREE.CubicBezierCurve3(p0, ...Object.values(carryControls(p0, p3)), p3)
            : (p0, p3) => liftCurve(p0, p3, { from: inFile ? 'box' : 'pile', index: it.index });
    const arrival = carryAlong(ctx, it, makeCurve, pose, {
        preset: 'pick', turn: liftTurn, instant, delay, light: 'held', shadow: [0.5, false],
        exit: overFlicked,
        after: heldHigh(pose) ? allClear(it) : (overFlicked && it.exitS == null ? frontClear(it) : null),
        onStart: () => {
            it.liftPending = null;
            if (TITLES[it.id]) ctx.visit.log(TITLES[it.id]);
        }
    });
    // A go() that turns it over while it's still on its way waits for this (index.js go()).
    it.arrival = arrival;
    arrival.then(() => { if (it.arrival === arrival) it.arrival = null; });
    const moves = [arrival];
    // Off the pile, the clipping slides back out to peek — once the memo is up
    // and clear of the box, not while it is still lying a centimetre from it.
    if (it.memo && from === 'pile') {
        const token = it.token;
        moves.push(wait(ctx, delay + 320, instant).then(() => (
            it.token === token && it.location === 'hand' ? arrange(ctx, it, it.turned ? 'turned' : 'front', { instant }) : true
        )));
    }
    return Promise.all(moves).then((results) => results.every(Boolean));
}

/**
 * A lift whose carry hasn't set off yet, undone: back where it was (in the
 * file, on the pile, set aside), nothing moved, nothing logged. The first v3
 * put such a sheet "down" from where it stood — straight out through the
 * dividers in front of it, or, for the end card, up out of the file and back.
 * Returns true if there was one.
 */
function abortPendingLift(it) {
    const pending = it.liftPending;
    if (!pending || it.location !== 'hand') return false;
    cancelAnims(it);
    it.liftPending = null;
    it.arrival = null;
    it.location = pending.from;
    if ((pending.from === 'pile' || pending.from === 'aside') && !S.pileOrder.includes(it.id)) {
        S.pileOrder.splice(pending.order < 0 ? S.pileOrder.length : Math.min(pending.order, S.pileOrder.length), 0, it.id);
    }
    return true;
}

/** The end card back into its slot at the back of the file, along the way it came out. */
function putBack(ctx, it, { instant, delay = 0 }) {
    it.location = 'box';
    it.turned = false;
    const slot = slotPose(it.index);
    const world = S.box.file.localToWorld(slot.position.clone());
    const q = S.box.file.getWorldQuaternion(new THREE.Quaternion()).multiply(slot.quaternion);
    const home = () => {
        toFile(it);
        it.exitS = null;
        it.root.position.copy(slot.position);
        it.root.quaternion.copy(slot.quaternion);
    };
    if (exitsOverFlicked(it.index)) {
        // Back past the flicked dividers: the lift's way reversed — or, caught part way out, back down it.
        return carryAlong(ctx, it, (p0, p3, start) => (it.exitS != null
            ? exitBackPath(it.index, it.exitS, { toWorld: fileMatrix() })
            : liftPath(it.index, start, { toWorld: fileMatrix() }).reversed()), { position: world, quaternion: q }, {
            preset: 'put', instant, delay, exit: true, shadow: [0.5, true], onDone: home
        });
    }
    return carryAlong(ctx, it, (p0, p3) => liftCurve(p0, p3, { from: 'box', index: it.index }), { position: world, quaternion: q }, {
        preset: 'put', turn: liftTurn, instant, delay, shadow: [0.5, true], reverse: true, onDone: home
    });
}

/** How long a put-down waits before it leaves your hand: a turned memo tucks its clipping back behind first. */
function putDownDelay(ctx, it, instant) {
    return Boolean(it.memo) && clippingInFront(it) && !instant ? ctx.motion.durations.slide : 0;
}

function putDown(ctx, it, { instant, delay = 0, passing = false }) {
    const from = it.location;
    const rest = restFor(it);
    if (rest === 'box') return putBack(ctx, it, { instant, delay });
    it.location = rest;
    // The pile and the card set aside share the desk: each lands on whatever it overlaps.
    S.pileOrder = S.pileOrder.filter((id) => id !== it.id);
    it.pileY = pileHeightFor(it.id);
    S.pileOrder.push(it.id);
    if (passing && TITLES[it.id]) ctx.visit.log(TITLES[it.id]);
    const target = pileWorldPose(it.id, it.pileY);
    // A turned memo tucks its clipping back behind first: it swings out to the
    // side (in the air, in front of you), and only then does the memo go down.
    const tuck = putDownDelay(ctx, it, instant);
    // Still in the file, or caught part way out of it (a lift cut short): on out the way it was going.
    const moves = [from === 'box' || it.exitS != null
        ? carryOut(ctx, it, target, { instant, delay })
        : carryAlong(ctx, it, (p0, p3, start) => putPath(start, target, it.index), target, {
            preset: 'put', instant, delay: delay + tuck, zone: heldHigh({ position: it.root.getWorldPosition(new THREE.Vector3()) }), light: 'desk', shadow: [0.5, true]
        })];
    it.turned = false;
    if (it.item.kind === 'memo') moves.push(arrange(ctx, it, 'pile', { instant }));
    else moves.push(setFlip(ctx, it, false, { instant, preset: 'put' }));
    return Promise.all(moves).then((results) => results.every(Boolean));
}

// --- the lens and the reading light ---------------------------------------------

/**
 * The box shot's longer lens (layout.js SHOT, shotZoom): camera.zoom, eased
 * with the camera move so the two read as one lean-in, and eased back to the
 * room's own zoom on leave. Zoom rather than fov because the other modules
 * compose their shots from camera.fov when they're entered.
 */
function setLens(ctx, zoom, { instant, preset = 'camera' } = {}) {
    const cam = ctx.camera.object;
    S.lensAnim?.cancel?.();
    S.lensZoom = zoom;
    const from = cam.zoom;
    if (Math.abs(from - zoom) < 1e-4) return Promise.resolve(true);
    S.lensAnim = ctx.motion.animate({
        from, to: zoom, preset, instant, movesGeometry: false,
        onUpdate: (value) => {
            cam.zoom = value;
            cam.updateProjectionMatrix();
        }
    });
    return S.lensAnim;
}

/** The reading light up (with the camera move in) or down (with the move out). Never on at the desk. */
function setReadingLight(ctx, on, { instant } = {}) {
    const light = S.light;
    if (!light) return Promise.resolve(true);
    S.lightAnim?.cancel?.();
    const to = on ? READING_LIGHT.intensity : 0;
    if (Math.abs(light.intensity - to) < 1e-4) return Promise.resolve(true);
    S.lightAnim = ctx.motion.animate({
        from: light.intensity, to, preset: 'camera', instant, movesGeometry: false,
        onUpdate: (value) => { light.intensity = value; }
    });
    return S.lightAnim;
}

/** The zoom the box shot wants at the live aspect. */
function lensFor(ctx) {
    return shotZoom(ctx.camera.object.aspect || 16 / 9, ctx.camera.object.fov);
}

/** The in-hand pose at the live aspect and the box shot's lens. */
function heldPose(ctx, it) {
    return handPose(ctx.camera.finalPose(), it.item, {
        aspect: ctx.camera.object.aspect, fov: ctx.camera.object.fov, zoom: S.lensZoom ?? lensFor(ctx)
    });
}

// ---------------------------------------------------------------------------
// Snapping (instant states and trail)
// ---------------------------------------------------------------------------

/** Straight to where it rests (the pile, aside, or its slot), no motion. Keeps its layer if it's already there. */
function snapToRest(ctx, it) {
    abortPendingLift(it);
    cancelAnims(it);
    it.exitS = null;
    it.arrival = null;
    const rest = restFor(it);
    it.turned = false;
    it.flip.rotation.y = 0;
    it.flip.position.z = 0;
    if (it.memo) { it.arr = 'pile'; applyArrangement(it, arrangementValues(it, 'pile')); }
    setShadowed(it, true);
    if (rest === 'box') {
        it.location = 'box';
        toFile(it);
        const slot = slotPose(it.index);
        it.root.position.copy(slot.position);
        it.root.quaternion.copy(slot.quaternion);
        return;
    }
    toWorld(it);
    if (it.location !== rest) {
        it.location = rest;
        S.pileOrder = S.pileOrder.filter((id) => id !== it.id);
        it.pileY = pileHeightFor(it.id);
        S.pileOrder.push(it.id);
    }
    const pose = pileWorldPose(it.id, it.pileY);
    it.root.position.copy(pose.position);
    it.root.quaternion.copy(pose.quaternion);
    setStickyLight(ctx, it, 'desk');
    if (TITLES[it.id]) ctx.visit.log(TITLES[it.id]);
}

function snapDivider(it, state) {
    cancelAnims(it);
    it.divider.state = state;
    applyDivider(it, dividerParams(it, state));
}

// ---------------------------------------------------------------------------
// Framing
// ---------------------------------------------------------------------------

function shotFor(ctx) {
    const aspect = ctx.camera.object.aspect || 16 / 9;
    // Landscape: the one box shot, with the lens lensFor() sets. A portrait
    // phone keeps the room's lens and backs off until the box and its trail fit.
    return aspect >= PORTRAIT_ASPECT ? boxShot() : portraitShot(aspect, ctx.camera.object.fov);
}

function describe(ctx, target) {
    if (target.mode === 'item') {
        const it = S.items[target.id];
        const hint = it.id === 'intro' ? HINT_INTRO
            : it.id === 'end' ? HINT_END
                : target.turned && it.thread ? HINT_THREAD : HINT_ITEM;
        ctx.hint(hint);
        ctx.live(liveText(target.id, target.turned));
        return;
    }
    if (target.mode === 'divider') {
        ctx.hint(HINT_DIVIDER);
        ctx.live(liveText(target.id, false));
        return;
    }
    const left = list().filter((it) => isKeepsake(it.item) && it.location === 'box').length;
    ctx.hint(left ? HINT_OPEN : HINT_DONE);
    ctx.live(left
        ? `The photo box, its lid tucked under it. ${left} ${left === 1 ? 'thing' : 'things'} still standing in it; the rest are on the desk in front of it.`
        : 'The photo box, nothing left in it but its dividers, the end card and the backs of other prints. Everything else is on the desk in front of it.');
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

function neighbour(dir) {
    const t = S.target;
    if (!t) return null;
    const P = positionOf(t);
    if (t.mode === 'trail' || t.mode === 'open') {
        const i = dir > 0 ? P : P - 1;
        return list()[i]?.id ?? null;
    }
    const i = P + dir;
    if (i < 0) return null;
    if (i >= list().length) return dir > 0 ? 'now' : null;
    return list()[i].id;
}

function step(ctx, dir) {
    const next = neighbour(dir);
    if (!next) return;
    if (next === 'now') { ctx.navigate(END.route); return; }
    ctx.navigate(hashFor(next));
}

/** Space / Enter / a click on what you hold: turn a keepsake; a card or a divider moves you on. */
function activate(ctx) {
    const t = S.target;
    if (t?.mode !== 'item') { step(ctx, 1); return; }
    if (t.id === 'end') { ctx.navigate(END.route); return; }
    const it = S.items[t.id];
    if (!isKeepsake(it.item)) { step(ctx, 1); return; }
    ctx.navigate(hashFor(t.id, !t.turned));
}

/** Follow a thread: to a keepsake (lifted from wherever it is) or to a route. */
function follow(ctx, thread) {
    if (!thread) return;
    if (thread.to.startsWith('#')) ctx.navigate(thread.to);
    else ctx.navigate(hashFor(thread.to));
}

/**
 * Where `hit` lands on a divider, in mm from the top-left of its front face
 * (the cut outline is the same seen from either side), or null if `hit` isn't
 * on the divider's sheet.
 */
function onDivider(it, hit) {
    const sheet = it?.divider?.sheet;
    if (!sheet || hit?.object !== sheet || !hit.point) return null;
    const local = sheet.worldToLocal(hit.point.clone());
    const [W, H] = SHEETS_MM.divider;
    return { x: W / 2 + local.x / mm(1), y: H / 2 - local.y / mm(1) };
}

/** Is a divider hit (mm, onDivider) on its tab — `slack` mm round it? */
function inTab(it, at, slack = 0) {
    const left = tabLeftMm(it.item.tab);
    return at.y <= DIVIDER_MM.tab.h + slack && at.x >= left - slack && at.x <= left + DIVIDER_MM.tab.w + slack;
}

/** Is a divider hit (mm) on card at all? Beside the tab, along its top, there is none: the outline lives in the faces' alpha. */
function onCard(it, at) {
    return at.y > DIVIDER_MM.tab.h || inTab(it, at, 0.5);
}

/** What a ray through `ndc` meets first: an item, the box, the desk, another module's object, or nothing. */
function pick(ctx, ndc, { desk = true } = {}) {
    const targets = [S.world, S.box.root, desk ? S.desk : null, ...S.otherHitboxes()].filter(Boolean);
    const hits = ctx.raycast(ndc, targets, true);
    for (const hit of hits) {
        let node = hit.object;
        if (node.userData.visualGroup) return { kind: 'other' }; // DeskScene's hitbox for another object
        const material = Array.isArray(node.material) ? node.material[hit.face?.materialIndex ?? 0] : node.material;
        if (node.isMesh && material && material.visible === false) continue;
        // A divider's sheet is a full rectangle cut to its tab by alpha, which a ray
        // doesn't see: past the bare card beside the tab to whatever is behind it.
        const divider = S.items[node.userData.boxItem];
        const at = divider?.divider ? onDivider(divider, hit) : null;
        if (at && !onCard(divider, at)) continue;
        while (node) {
            if (node.userData.boxItem) return { kind: 'item', id: node.userData.boxItem, hit, at };
            if (node === S.box.root) return { kind: 'box' };
            if (node === S.desk) return { kind: 'desk' };
            node = node.parent;
        }
        return { kind: 'other' };
    }
    return { kind: 'none' };
}

/** Is `hit` on the thread line of what you're holding, turned over? (Its rect on the back face, 3 mm of slack.) */
function onThread(it, hit) {
    if (!it?.thread || !it.turned || it.location !== 'hand' || !hit?.point) return false;
    const sheet = it.content.children[0];
    if (!sheet) return false;
    const local = sheet.worldToLocal(hit.point.clone());
    if (local.z > 0) return false; // the front
    const [W, H] = it.thread.sizeMm;
    const xMm = W / 2 - local.x / mm(1);
    const yMm = H / 2 - local.y / mm(1);
    const r = it.thread.rect;
    return xMm >= r.x - 3 && xMm <= r.x + r.w + 3 && yMm >= r.y - 3 && yMm <= r.y + r.h + 3;
}

// ---------------------------------------------------------------------------
// The module
// ---------------------------------------------------------------------------

export default {
    id: 'box',
    objectIds: [OBJECT_ID],
    deskObjects: [
        {
            id: OBJECT_ID,
            label: 'things I kept',
            clickable: true,
            position: [...BOX_POSITION],
            rotation: [0, BOX_YAW, 0],
            hover: { lift: 0.012 },
            // The real box is built in mount(); this invisible block is its
            // hitbox and tooltip anchor (DeskScene freezes those at build time):
            // the box and the file standing in it, up to the dividers' tabs.
            parts: [hitProxy([OUTER[0], fileTop(), OUTER[2]])]
        }
    ],
    states: [
        { hash: '#box', note: 'the opening index card in hand (left of centre): "things I kept · start at the front"; the box beside it, the file standing in it with three coloured tabs rising above the prints (2022 left, 2023 centre, 2024 right), "kept" tape on its front; no monitor, no floor' },
        { hash: '#box/amazon', note: 'Amazon print in hand, front; its Amazon badge binder-clipped over the top left corner, hanging off the left edge (the line along the bottom border clear); the 2022 divider flicked forward onto the box\'s front rim, the opening card set aside on the desk at the left' },
        { hash: '#box/amazon/back', note: 'Amazon print in hand, turned over: back note, then the thread line "Both were about learning to make a case to people who could say no." with a drawn arrow to "the harbour", and "Amazon · Dec 2022"' },
        { hash: '#box/ch-2023', note: 'hands empty: the 2023 divider (dusty blue, centre tab) pulled up proud in the file, "No computer science degree, so I had something to prove." reading on it; the 2022 divider flicked forward in front of it; Amazon on the desk' },
        { hash: '#box/apple-intern', note: 'Apple intern print in hand, front, its Apple intern badge clipped top left; the 2022 and 2023 dividers flicked forward, Amazon (and its badge) on the desk in front of the box' },
        { hash: '#box/deloitte', note: 'Deloitte print in hand, front, its Deloitte badge clipped top left' },
        { hash: '#box/ite', note: 'the ITE clipping in hand (Forbes Australia, 30 Under 30), the Inspire Tomorrow badge clipped top left, the yellow sticky lower right' },
        { hash: '#box/ite/back', note: 'the ITE clipping turned over: bare newsprint, the clip\'s back jaw top right, and in ink "I\'ve been on the wrong end of an unevenly distributed education." with a drawn arrow to "Paging Dr. AI" (click → #paper/drai)' },
        { hash: '#box/trophy', note: 'SafetyCulture hackathon print in hand, front (the trophy plate in frame)' },
        { hash: '#box/puralink', note: 'Pura Link memo in hand: sticky, red "10 Nov 2024", the NextGen badge clipped over its top right corner, a clipping clipped behind peeking out right; all three dividers flicked' },
        { hash: '#box/puralink/turned', note: 'the clipping slid out in front of the memo, red "+311 days" beside its date' },
        { hash: '#box/fluency/turned', note: 'the Fluency clipping out in front, red "+426 days"' },
        { hash: '#box/end', note: 'the end card in hand: "what the hell is worthy of solving?", a drawn arrow sweeping down to "now"; everything else on the desk' },
        { hash: '#box/trail', note: 'hands empty: the box and its file, the dividers flicked forward, the five prints left on the desk in front of it (the badges still clipped to theirs), the opening card set aside' }
    ],

    async mount(ctx) {
        const group = ctx.deskScene.getObjectGroup(OBJECT_ID);
        if (!group) throw new Error(`desk object "${OBJECT_ID}" is missing`);
        const box = buildBox(ctx);
        group.add(box.root);

        const world = new THREE.Group();
        world.name = 'box-loose-items';
        ctx.scene.add(world);

        const items = {};
        const built = [];
        for (const [index, item] of ITEMS.entries()) {
            try {
                const it = buildItem(ctx, item, index);
                if (isDivider(item)) {
                    applyDivider(it, dividerParams(it, 'flush'));
                } else {
                    const slot = slotPose(it.index);
                    it.root.position.copy(slot.position);
                    it.root.quaternion.copy(slot.quaternion);
                }
                if (it.memo) { it.arr = 'front'; applyArrangement(it, arrangementValues(it, 'front')); }
                it.shadowed = true;
                box.file.add(it.root);
                items[item.id] = it;
                built.push(it);
            } catch (error) {
                ctx.warn(`could not build "${item.id}"; the box carries on without it`, error);
            }
        }

        // The reading light: always in the scene (intensity 0 at the desk), so
        // easing it never changes the light count or recompiles a shader.
        let light = null;
        try {
            light = new THREE.SpotLight(READING_LIGHT.color, 0, 0, READING_LIGHT.angle, READING_LIGHT.penumbra, READING_LIGHT.decay);
            light.name = 'box:reading-light';
            light.castShadow = false;
            light.position.fromArray(READING_LIGHT.position);
            light.target.position.fromArray(READING_LIGHT.target);
            light.target.name = 'box:reading-light-target';
            ctx.scene.add(light, light.target);
        } catch (error) {
            ctx.warn('reading light unavailable; the box shot keeps the room light', error);
            light = null;
        }

        // Anything that failed to build is left out of the order entirely.
        S = {
            box, world, items, list: built, pileOrder: [], light, lightAnim: null,
            target: null, active: false, seq: 0,
            // The room's own zoom (DeskScene's camera: 1), restored on leave.
            restZoom: ctx.camera.object.zoom || 1, lensZoom: null, lensAnim: null,
            desk: ctx.deskScene.getObjectGroup('gaming-desk'),
            otherHitboxes: () => ctx.scene.children.filter((node) => node.userData?.visualGroup && node.userData.deskObjectId !== OBJECT_ID)
        };

        // A resized viewport re-frames the box and re-seats whatever is in hand.
        let resizeTimer = null;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (!S.active || !S.target) return;
                try {
                    S.aspect = ctx.camera.object.aspect;
                    ctx.camera.moveTo(shotFor(ctx), { instant: true });
                    setLens(ctx, lensFor(ctx), { instant: true });
                    const held = list().find((it) => it.location === 'hand');
                    if (held && held.anims.size === 0) {
                        const pose = heldPose(ctx, held);
                        held.root.position.copy(pose.position);
                        held.root.quaternion.copy(pose.quaternion);
                        // A turned memo re-lays for the new shape (beside ↔ below).
                        if (held.memo && held.arr === 'turned') applyArrangement(held, arrangementValues(held, 'turned'));
                        ctx.invalidateShadows();
                    }
                } catch (error) {
                    ctx.warn('re-framing after a resize failed', error);
                }
            }, 160);
        });

        S.unsubscribeMove = ctx.pointer.onMove((ndc) => {
            if (!S.active) return;
            const hit = pick(ctx, ndc, { desk: false });
            ctx.setCursor(hit.kind === 'item' || hit.kind === 'box' ? 'pointer' : null);
        });
        ctx.invalidateShadows();
    },

    async go(ctx, path, { instant }) {
        const seq = (S.seq += 1);
        const entering = !S.active;
        S.active = true;
        const target = parsePath(path);

        // Coming back to the box with a trail already on the desk: carry on
        // from the next thing still in the box rather than starting over.
        if (entering && target.root && list().some(isDone)) {
            const next = list().find((it) => !isDone(it) && it.location !== 'hand');
            ctx.navigate(next ? hashFor(next.id) : '#box/open', { replace: true });
            return;
        }

        S.target = target;
        S.aspect = ctx.camera.object.aspect;
        ctx.camera.moveTo(shotFor(ctx), { instant });
        const jobs = [setLens(ctx, lensFor(ctx), { instant }), setReadingLight(ctx, true, { instant })];

        const P = positionOf(target);
        const heldId = target.mode === 'item' ? target.id : null;
        const base = entering ? ENTRY_LIFT_DELAY_MS : 0;
        const flickLead = ctx.motion.durations[FLICK_PRESET] * FLICK_EXIT_AFTER;
        const now = performance.now();
        let putting = false;
        let departs = 0; // the latest a put-down leaves your hand (a turned memo tucks first)
        // The front-to-back cascade: a divider flicks once what stood in front
        // of it is up and away; what stood behind a flicking divider starts out
        // once the flick is nearly down (it leans on the divider's back).
        let clearAt = base;
        let lastPass = -Infinity;
        let lastFlick = -Infinity;
        const unflicks = []; // dividers standing back up: after the moves below have started (see there)
        // A lift that hasn't set off yet is undone (it never left) before anything lands on the pile.
        for (const it of list()) if (it.id !== heldId) abortPendingLift(it);

        for (const [i, it] of list().entries()) {
            if (it.id === heldId) continue;
            if (isDivider(it.item)) {
                const want = i < P ? 'flicked' : (i === P && target.mode === 'divider' ? 'proud' : 'flush');
                if (it.divider.state === want && (it.anims.size === 0 || !instant)) {
                    // Already there, or on its way: leave it be. The first v3 restarted a
                    // flick still running (every quick press did), which held everything
                    // behind it back by another flick each time — so at a quick pace the
                    // next press always caught a print still in the file.
                    if (want === 'flicked' && it.anims.size) {
                        const at = (it.divider.movesAt ?? now) - now; // ≤ 0 once it has set off
                        lastFlick = Math.max(lastFlick, at);
                        clearAt = Math.max(clearAt, at + flickLead);
                    }
                    continue;
                }
                cancelAnims(it);
                if (want === 'flicked') {
                    const at = Math.max(clearAt, lastPass + PASS_CLEAR_MS);
                    // …and not before what stood in front of it is out of the V it tips into.
                    jobs.push(setDivider(ctx, it, 'flicked', { instant, delay: at, after: exitsInFront(it), lead: flickLead }));
                    lastFlick = at;
                    clearAt = at + flickLead;
                } else if (!instant && it.divider.params && it.divider.params.q.angleTo(dividerParams(it, want).q) > 1e-3) {
                    unflicks.push([it, want]); // it tips back up (from flicked, or part way): see below
                } else {
                    jobs.push(setDivider(ctx, it, want, { instant }));
                }
                continue;
            }
            if (it.location === 'hand') {
                cancelAnims(it);
                putting = true;
                departs = Math.max(departs, putDownDelay(ctx, it, instant));
                jobs.push(putDown(ctx, it, { instant }));
            } else if (it.location === 'box' && i < P && it.id !== 'end') {
                cancelAnims(it);
                const at = Math.max(clearAt, lastPass + PASS_STAGGER_MS);
                lastPass = at;
                clearAt = at + PASS_STAGGER_MS;
                jobs.push(putDown(ctx, it, { instant, delay: at, passing: true }));
            }
        }

        if (heldId) {
            const it = S.items[heldId];
            if (it.location !== 'hand') {
                cancelAnims(it);
                const delay = Math.max(
                    base, putting ? departs + SWAP_LIFT_DELAY_MS : 0,
                    lastPass + 2 * PASS_STAGGER_MS + 30,
                    lastFlick + flickLead
                );
                const arrived = lift(ctx, it, { instant, delay: Number.isFinite(delay) ? delay : 0 });
                jobs.push(arrived.then((ok) => {
                    if (seq !== S.seq || !ok) return false;
                    return setTurned(ctx, it, target.turned, { instant });
                }));
            } else {
                // Already in hand: re-seat (a resized viewport moves the pose) and turn.
                const pose = heldPose(ctx, it);
                if (it.root.position.distanceTo(pose.position) > 1e-3 && it.anims.size === 0) {
                    jobs.push(carry(ctx, it, pose, { preset: 'slide', instant }));
                }
                if (it.turned !== target.turned) {
                    // Still on its way up (a quick Space after →): turn it once it's in hand, not
                    // while it is still coming out of the file.
                    const turn = () => setTurned(ctx, it, target.turned, { instant });
                    jobs.push(it.arrival && !instant ? it.arrival.then((ok) => (ok && seq === S.seq ? turn() : false)) : turn());
                }
            }
        }

        // A divider standing back up (going ←) waits for anything behind it that is
        // still in the V it closes — the end card going home down the back of it, a
        // print caught part way out — to be clear of it.
        for (const [it, want] of unflicks) {
            const behind = list().filter((other) => other.index > it.index && other.exitMove).map((other) => other.exitMove.out);
            jobs.push(setDivider(ctx, it, want, { instant, after: behind.length ? Promise.all(behind) : null }));
        }

        // Locations are settled synchronously above (the moves only animate
        // them), so the hint and the live text can describe where things end up.
        describe(ctx, target);
        if (instant) ctx.invalidateShadows();
        await Promise.all(jobs);
    },

    async leave(ctx, { instant }) {
        S.active = false;
        S.seq += 1;
        ctx.setCursor(null);
        // Back to the room's lens and light, eased alongside whatever camera
        // move comes next (the next module has already composed its shot at camera.fov).
        const jobs = [setLens(ctx, S.restZoom, { instant }), setReadingLight(ctx, false, { instant })];
        // A lift that hasn't set off yet never left: it stays where it was (and isn't counted as seen).
        for (const it of Object.values(S.items)) abortPendingLift(it);
        for (const it of Object.values(S.items)) {
            if (isDivider(it.item)) {
                if (it.divider.state === 'proud') jobs.push(setDivider(ctx, it, 'flush', { instant }));
                continue;
            }
            if (it.location !== 'hand') continue;
            cancelAnims(it);
            jobs.push(putDown(ctx, it, { instant }));
        }
        S.target = null;
        await Promise.all(jobs);
    },

    key(ctx, event) {
        if (event.key === 'ArrowRight') { step(ctx, 1); return true; }
        if (event.key === 'ArrowLeft') { step(ctx, -1); return true; }
        if (event.key === ' ' || event.key === 'Enter') { activate(ctx); return true; }
        return false;
    },

    click(ctx, ndc) {
        const hit = pick(ctx, ndc);
        if (hit.kind === 'item') {
            const it = S.items[hit.id];
            if (it.location === 'hand') {
                if (onThread(it, hit.hit)) follow(ctx, it.thread);
                else activate(ctx);
            } else if (it.location === 'pile') {
                ctx.navigate(hashFor(it.id)); // a keepsake on the desk: back into your hand (as v1)
            } else if (isDivider(it.item) && it.divider.state === 'flush' && hit.at && inTab(it, hit.at, 3)) {
                // A tab still standing ahead is a way in: go to that chapter. Only the
                // tab itself — its card below the tab reads as the box, and the dividers
                // you've been past lie flicked over the front of the box, where you click
                // for the next one (the first v3 sent that click back to their chapter).
                ctx.navigate(hashFor(it.id));
            } else {
                // Anything else of the box — the file, a divider (flicked, proud, or its
                // card), the opening card set aside on the desk — is the next one out, as v1.
                step(ctx, 1);
            }
            return true;
        }
        if (hit.kind === 'box' || hit.kind === 'desk') {
            step(ctx, 1);
            return true;
        }
        return false; // another module's object, or nothing: the router's call
    },

    trail(ctx) {
        // What a visit through the first five prints leaves: the opening card
        // set aside, the dividers before Stanford flicked, the five prints (and
        // anything else already looked at) on the desk. Instant and idempotent.
        if (!S) return;
        const P = Math.max(...TRAIL_IDS.map(posOf)) + 1;
        for (const [i, it] of list().entries()) {
            if (isDivider(it.item)) {
                const want = i < P ? 'flicked' : 'flush';
                if (it.divider.state !== want || it.anims.size) snapDivider(it, want);
                continue;
            }
            if (it.location === 'hand' || it.location === 'pile' || it.location === 'aside' || (i < P && it.id !== 'end')) snapToRest(ctx, it);
        }
        ctx.invalidateShadows();
    }
};

