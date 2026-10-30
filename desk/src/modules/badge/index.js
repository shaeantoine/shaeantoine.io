import * as THREE from 'three';
import { hitProxy } from '../../core/parts.js';
import { appleEngineer } from '../../content/works/work.js';
import { buildBadge } from './model.js';
import {
    OBJECT_ID, LABEL, VISIT_TITLE, YAW, ORIGIN, DIMS, STRAP, RING, HOOK, TIP_Y, strapPath, hitBox,
    badgeShot, SWAY, TRACE_TURN, CARD_MM, NOTE_RECT, PULL
} from './layout.js';
import { BACK_TEXT } from './copy.js';

/**
 * BADGE — the day job. Shae's current badge (Apple, "Software Engineer",
 * 2025: src/content/works/work.js appleEngineer, built by the site's own
 * src/content/lanyard.js) hangs on a flat lanyard strap looped over the
 * lamp's head bar. Past badges live in the photo box, clipped to what each
 * job left behind; this one is still in use, so it hangs where you'd drop it
 * at the end of the day.
 *
 *   at rest   it hangs still. Hover or click the LAMP and it sways, almost
 *             imperceptibly, for a few seconds (a knock travelling down the
 *             strap); nothing moves otherwise — no idle loop.
 *   hover     "the day job".
 *   #badge    the camera leans in, square to it, and the badge turns round on
 *             its hook to show its back: a note, in Shae's hand, on the card
 *             behind the holder's clear back.
 *   #badge/front  turned back to face you (click, Space or Enter toggles).
 *   trace     after a visit it is left hanging most of the way turned round,
 *             its back to the room at an angle — the room keeps your trail.
 *
 * Numbers: layout.js (DOM-free). The badge itself: model.js (shared with the box).
 */

const HINT_BACK = 'click to turn it over · esc to step back';
const HINT_FRONT = 'click to turn it over · esc to step back';

const S = {
    ctx: null,
    group: null,
    swing: null,
    pull: null,
    pullAnim: null,
    turn: null,
    turnAnim: null,
    turned: 0,
    visited: false,
    active: false,
    sway: null,
    lampHover: false,
    off: []
};

/** A flat ribbon along the strap's path (group-local z, y), `width` along x. */
function ribbon(path, width, material) {
    const positions = [];
    const index = [];
    path.forEach((p, i) => {
        positions.push(-width / 2, p.y, p.x, width / 2, p.y, p.x);
        if (i > 0) {
            const a = (i - 1) * 2;
            index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

/** The back of the card: plain card stock, and the note in Shae's hand. */
function backTexture(ctx, cardColor) {
    const [W, H] = CARD_MM;
    const c = ctx.makeCanvas(W, H, { fill: 0.5 });
    const texture = ctx.canvasTexture(c.canvas);
    const paint = ctx.paint ?? ctx.fonts.paint;
    paint(() => {
        c.g.fillStyle = cardColor;
        c.g.fillRect(0, 0, W, H);
        ctx.draw.grain(c.g, W, H, { seed: 'badge-back', amount: 0.035 });
        ctx.drawNote(c.g, {
            id: 'badge.back', text: BACK_TEXT, ...NOTE_RECT, size: 6.4, valign: 'top', seed: 'badge-back', slant: -0.01
        });
        texture.needsUpdate = true;
    });
    return texture;
}

/** Draw the badge toward you on its hook (1) or let it hang (0). */
function setPull(ctx, on, { instant, preset = on ? 'pick' : 'put' } = {}) {
    S.pullAnim?.cancel?.();
    const to = on ? -PULL : 0;
    const from = S.pull.rotation.x;
    if (Math.abs(from - to) < 1e-4) return Promise.resolve(true);
    S.pullAnim = ctx.motion.animate({
        from, to, preset, instant,
        onUpdate: (value) => { S.pull.rotation.x = value; }
    });
    return S.pullAnim;
}

function setTurn(ctx, angle, { instant, preset = 'turn' } = {}) {
    S.turnAnim?.cancel?.();
    const from = S.turn.rotation.y;
    S.turned = angle;
    if (Math.abs(from - angle) < 1e-4) return Promise.resolve(true);
    S.turnAnim = ctx.motion.animate({
        from, to: angle, preset, instant,
        onUpdate: (value) => { S.turn.rotation.y = value; }
    });
    return S.turnAnim;
}

// --- the sway ------------------------------------------------------------------

/** Swing the badge on its hook: a damped few seconds, then still (the tick removes itself). */
function sway(ctx, amplitude) {
    if (!S.swing || ctx.still || ctx.reducedMotion || S.active) return;
    // A new knock adds to what's left of the last one rather than restarting it from rest.
    const left = S.sway ? S.sway.amplitude * Math.exp(-S.sway.t / SWAY.decayMs) : 0;
    const state = { t: 0, amplitude: Math.min(SWAY.click * 1.2, Math.max(amplitude, left + amplitude * 0.5)) };
    if (S.sway) { S.sway.state = state; return; }
    const holder = { state, t: 0, amplitude: state.amplitude };
    S.sway = holder;
    const off = ctx.addTick((dt) => {
        const st = holder.state;
        st.t += dt;
        holder.t = st.t;
        holder.amplitude = st.amplitude;
        const done = st.t >= SWAY.doneMs || S.active;
        const k = done ? 0 : st.amplitude * Math.exp(-st.t / SWAY.decayMs);
        const phase = (st.t / SWAY.periodMs) * Math.PI * 2;
        S.swing.rotation.x = k * Math.sin(phase);
        S.swing.rotation.y = k * SWAY.twist * Math.sin(phase * 0.5 + 0.6);
        ctx.invalidateShadows();
        if (done) {
            S.swing.rotation.set(0, 0, 0);
            off?.();
            if (S.sway === holder) S.sway = null;
            return false;
        }
        return true;
    });
}

/** DeskScene's hit volumes (props/index.js does the same): is the lamp the nearest thing under `ndc`? */
function lampUnder(ctx, ndc) {
    const volumes = ctx.scene.children.filter((node) => node.isMesh && node.userData?.visualGroup && node.userData.deskObjectId);
    if (!volumes.length) return false;
    const hits = ctx.raycast(ndc, volumes, false);
    return hits[0]?.object.userData.deskObjectId === 'desk-lamp';
}

export default {
    id: 'badge',
    objectIds: [OBJECT_ID],
    deskObjects: [
        {
            id: OBJECT_ID,
            label: LABEL,
            clickable: true,
            position: [...ORIGIN],
            rotation: [0, YAW, 0],
            hover: { lift: 0 }, // it hangs: it doesn't hop
            parts: [hitProxy(hitBox().size, { position: hitBox().centre })]
        }
    ],
    states: [
        { hash: '#badge', note: 'leaning in to the current badge on the lamp\'s head bar (Apple · Software Engineer · 2025), turned round on its hook: its back, in Shae\'s hand — "I never expected to be a software engineer. Then I fell in love with creating technology." The strap runs up out of the frame; the lamp\'s arm and the books behind' },
        { hash: '#badge/front', note: 'the same shot, the badge turned back to face you: Apple, Software Engineer, 2025' }
    ],

    async mount(ctx) {
        S.ctx = ctx;
        const group = ctx.deskScene.getObjectGroup(OBJECT_ID);
        if (!group) throw new Error(`desk object "${OBJECT_ID}" is missing`);
        const card = appleEngineer.artifact.parts.find((part) => part.badge);

        // The strap, looped over the bar and down to the ring.
        const strapMaterial = new THREE.MeshStandardMaterial({ color: STRAP.color, roughness: 0.82, metalness: 0, side: THREE.DoubleSide });
        group.add(ribbon(strapPath(), STRAP.width, strapMaterial));
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(RING.radius, RING.tube, 8, 24),
            new THREE.MeshStandardMaterial({ color: '#b9bcc1', metalness: 1, roughness: 0.25 })
        );
        ring.position.set(0, HOOK[1] - RING.radius + RING.tube, 0);
        ring.castShadow = true;
        group.add(ring);

        // The badge: swings about the hook, turns about its own hanging line.
        S.swing = new THREE.Group();
        S.swing.name = 'badge-swing';
        S.swing.position.set(...HOOK);
        S.pull = new THREE.Group();
        S.pull.name = 'badge-pull';
        S.swing.add(S.pull);
        S.turn = new THREE.Group();
        S.turn.name = 'badge-turn';
        S.pull.add(S.turn);
        const badge = buildBadge(ctx, appleEngineer, { back: backTexture(ctx, card.color), name: 'current-badge' });
        badge.group.position.set(0, TIP_Y - HOOK[1], 0);
        S.turn.add(badge.group);
        group.add(S.swing);
        S.group = group;

        // The lamp, hovered or clicked, knocks it: DeskScene's own pick (the nearest hit volume).
        S.off.push(ctx.pointer.onMove((ndc) => {
            const over = !S.active && lampUnder(ctx, ndc);
            if (over && !S.lampHover) sway(ctx, SWAY.hover);
            S.lampHover = over;
        }));
        S.off.push(ctx.pointer.onLeave(() => { S.lampHover = false; }));
        const canvas = ctx.deskScene.renderer.domElement;
        const onClick = (event) => {
            try {
                if (lampUnder(ctx, ctx.pointer.ndcForEvent(event))) sway(ctx, SWAY.click);
            } catch (error) {
                ctx.warn('lamp knock failed', error);
            }
        };
        canvas.addEventListener('click', onClick);
        S.off.push(() => canvas.removeEventListener('click', onClick));
        ctx.invalidateShadows();
    },

    async go(ctx, path, { instant }) {
        const entering = !S.active;
        S.active = true;
        const front = path[0] === 'front';
        if (entering) {
            ctx.visit.log(VISIT_TITLE);
            S.visited = true;
        }
        const shot = badgeShot();
        const jobs = [ctx.camera.moveTo({ position: shot.position, lookAt: shot.lookAt }, { instant })];
        // Drawn toward you as the camera comes in, then turned round (never turned while hanging back by the arm).
        const turn = front ? 0 : Math.PI;
        const delay = entering && !instant ? 200 : 0;
        const seq = (S.seq = (S.seq ?? 0) + 1);
        jobs.push((async () => {
            await ctx.motion.wait(delay, { instant });
            if (!S.active || seq !== S.seq) return false;
            await setPull(ctx, true, { instant }); // (a no-op if it already is)
            if (!S.active || seq !== S.seq) return false;
            return setTurn(ctx, turn, { instant });
        })());
        ctx.hint(front ? HINT_FRONT : HINT_BACK);
        ctx.live(front
            ? 'An ID badge hanging from the lamp on a lanyard: Apple, Software Engineer, 2025.'
            : `The back of the badge, handwritten: ${BACK_TEXT}`);
        await Promise.all(jobs);
    },

    async leave(ctx, { instant }) {
        S.active = false;
        S.seq = (S.seq ?? 0) + 1;
        // Left most of the way round — its back to the room, at an angle: the trace of a visit —
        // turned while still drawn forward, then let go to hang.
        const pullNow = S.pull.rotation.x;
        if (pullNow < -1e-3) await setTurn(ctx, TRACE_TURN, { instant, preset: 'slide' });
        else S.turn.rotation.y = S.turned = TRACE_TURN; // (never drawn forward: nothing to turn clear of)
        await setPull(ctx, false, { instant });
    },

    key(ctx, event) {
        if (event.key === ' ' || event.key === 'Enter') {
            ctx.navigate(S.turned > Math.PI / 2 ? '#badge/front' : '#badge');
            return true;
        }
        return false;
    },

    click(ctx, ndc) {
        const hits = ctx.raycast(ndc, [S.group], true);
        if (hits.length) {
            ctx.navigate(S.turned > Math.PI / 2 ? '#badge/front' : '#badge');
            return true;
        }
        return false;
    },

    trail(ctx) {
        // #desk/after: as a visit leaves it — turned most of the way round.
        if (!S.turn) return;
        S.turnAnim?.cancel?.();
        S.pullAnim?.cancel?.();
        S.turned = TRACE_TURN;
        S.turn.rotation.y = TRACE_TURN;
        S.pull.rotation.x = 0;
        ctx.visit.log(VISIT_TITLE);
        ctx.invalidateShadows();
    }
};
