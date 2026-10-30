import { STICKY, STICKY_MM } from './layout.js';
import { drawArrowRow } from './notepaper.js';
import { THREADS } from './copy.js';

/**
 * The "now" sticky: a 76 mm note stuck across the screen's top-right corner,
 * adhesive strip flat on the glass, the free end curling away.
 *
 * Geometry is a subdivided plane bent in its own z (toward the viewer) — flat
 * over the top 16 mm where the glue is, then a curl that grows toward the
 * bottom edge, a little more at the bottom-right corner, the way a note that
 * has been up a few weeks does. `setCurl(k)` re-bends it (the flutter when you
 * tap it); 17 x 17 vertices, so that is free.
 *
 * The writing is Shae's: typed in Shae Hand, the font made from Shae's own
 * handwriting.
 *
 * v4: the question is Shae's current one (self-improvement went in the
 * Trash), and under it a thread, "→ the phone", which follows to
 * #bench/phone when you've leaned in to read it.
 */

export const NOW_HEAD = 'now:';
export const NOW_LINE = 'could AI help me rely on my phone less?';
/** The note's copy, verbatim ("now:" is set on its own line, as it would be written). */
export const NOW_TEXT = `${NOW_HEAD} ${NOW_LINE}`;

const NOTE_MM = STICKY_MM;
const INK_X = 5.5; // mm from the left edge
const INK_RIGHT = 4.5; // mm kept clear on the right
const INK_TOP = 5.5; // the glue is behind the top 16 mm; people still write from the top
const HEAD_MM = 14.4; // "now:" (12 mm in Caveat; Shae Hand's x-height is 0.33 em to its 0.40)
const INK_BOTTOM = 4; // mm kept clear at the bottom
const THREAD_H = 13; // mm: the "→ the phone" row at the foot of the note
const THREAD_GAP = 1.5;

/** The note's writing area (mm on the 76 mm note): 66 × 52 mm above the thread row. */
export const NOW_INK = Object.freeze({ x: INK_X, y: INK_TOP, w: NOTE_MM - INK_X - INK_RIGHT, h: NOTE_MM - INK_TOP - INK_BOTTOM - THREAD_H - THREAD_GAP });
/** The thread row (mm on the note): the drawn arrow and "the phone". Clicking inside it (+2 mm) follows the thread. */
export const NOW_THREAD = Object.freeze({ x: INK_X, y: NOTE_MM - INK_BOTTOM - THREAD_H, w: NOTE_MM - INK_X - INK_RIGHT, h: THREAD_H });
/** Seeds the thread row's hand, so it always wobbles the same way. */
export const NOW_THREAD_ID = 'monitor.thread.phone';

/** Draws the note's front into a 76 x 76 (mm) canvas. Returns the layout, for the log. */
export function drawSticky({ g }, ctx) {
    const { palette, draw } = ctx;
    g.save();
    g.fillStyle = palette.stickyYellow;
    g.fillRect(0, 0, NOTE_MM, NOTE_MM);
    // Shading toward the free end (it is bending away from the light it
    // faces), a little more into the bottom-right corner where it curls most,
    // and a hairline at the cut edges. Painted rather than left to the lights
    // because most of the note's light is now its emissive lift (buildSticky),
    // which is flat — so the curl has to be in the paper.
    const shade = g.createLinearGradient(0, 0, 0, NOTE_MM);
    shade.addColorStop(0, 'rgba(255, 250, 220, 0.10)');
    shade.addColorStop(0.3, 'rgba(0, 0, 0, 0)');
    shade.addColorStop(1, 'rgba(120, 90, 0, 0.12)');
    g.fillStyle = shade;
    g.fillRect(0, 0, NOTE_MM, NOTE_MM);
    const corner = g.createRadialGradient(NOTE_MM, NOTE_MM, 0, NOTE_MM, NOTE_MM, NOTE_MM * 0.55);
    corner.addColorStop(0, 'rgba(110, 80, 0, 0.10)');
    corner.addColorStop(1, 'rgba(110, 80, 0, 0)');
    g.fillStyle = corner;
    g.fillRect(0, 0, NOTE_MM, NOTE_MM);
    g.strokeStyle = 'rgba(120, 95, 20, 0.18)';
    g.lineWidth = 0.35;
    g.strokeRect(0.2, 0.2, NOTE_MM - 0.4, NOTE_MM - 0.4);
    g.restore();
    draw.grain(g, NOTE_MM, NOTE_MM, { seed: 'monitor:sticky', amount: 0.035 });

    // Shae's "now:" (underline and all) in the writing area, then the thread
    // row at the foot of the note.
    const typed = drawTypedNow(g, ctx);
    drawThreadRow(g, ctx);
    return typed;
}

/** "→ the phone": the drawn arrow and the words. */
function drawThreadRow(g, ctx) {
    return drawArrowRow(g, ctx, { x: NOW_THREAD.x, y: NOW_THREAD.y + 1, w: NOW_THREAD.w * 0.8, size: 10, label: THREADS.phone.label, seed: NOW_THREAD_ID });
}

/** The typed note: "now:" in Shae Hand with a quick underline, the line as large as fits under it. */
function drawTypedNow(g, ctx) {
    const { palette, drawHandwriting, fitHandwriting } = ctx;
    const head = drawHandwriting(g, NOW_HEAD, {
        x: INK_X,
        y: INK_TOP,
        size: HEAD_MM,
        weight: 600,
        lineHeight: 1.12, // the head's own line box, which the underline below is measured from
        color: palette.ink,
        seed: 'monitor:now-head',
        label: 'sticky head'
    });
    // A quick underline under "now:", pen not quite level.
    g.save();
    g.strokeStyle = palette.ink;
    g.globalAlpha = 0.85;
    g.lineWidth = 0.7;
    g.lineCap = 'round';
    const underlineY = INK_TOP + HEAD_MM * 1.12 - 1.2;
    g.beginPath();
    g.moveTo(INK_X - 0.4, underlineY + 0.3);
    g.quadraticCurveTo(INK_X + head.width * 0.55, underlineY - 0.5, INK_X + head.width + 1.6, underlineY - 0.1);
    g.stroke();
    g.restore();

    // As large as fits under the head: the note's size is the word limit.
    const top = head.bottom + 1;
    const maxWidth = NOTE_MM - INK_X - INK_RIGHT;
    const maxHeight = NOW_INK.y + NOW_INK.h - top;
    const fit = fitHandwriting(g, NOW_LINE, {
        maxWidth,
        maxHeight,
        weight: 500,
        sizeMax: NOTE_MM * 0.19, // 14.4 mm on a 76 mm note
        sizeMin: 6
    });
    const body = drawHandwriting(g, NOW_LINE, {
        x: INK_X,
        y: top,
        maxWidth,
        maxLines: 6,
        size: fit.size,
        weight: 500,
        lineHeight: fit.lineHeight,
        color: palette.ink,
        seed: 'monitor:now-line',
        slant: -0.012,
        label: 'sticky line'
    });
    return { headSize: HEAD_MM, bodySize: fit.size, lines: body.lineCount, fits: fit.fits };
}

/** z-lift (PLANE units) of a point on the note, from its note-local x/y (top edge at +size/2). */
function curlAt(x, y, k, sticky = STICKY) {
    const size = sticky.size;
    const fromTop = size / 2 - y;
    if (fromTop <= sticky.band) return 0;
    const t = (fromTop - sticky.band) / (size - sticky.band); // 0 at the glue line, 1 at the free edge
    const corner = Math.max(0, x / size + 0.5); // 0 at the left edge, 1 at the right
    return k * (sticky.curl * Math.pow(t, 2.2) + sticky.cornerCurl * t * t * corner * corner);
}

/**
 * How much light the note gives off on its own, per time of day.
 *
 * WHY IT NEEDS ANY. In the first screenshots the note rendered olive (113 100
 * 44 on screen at #desk, 128 113 50 at #monitor/now): it faces the room under
 * the shelf, away from the window and out of the art lights, and a screen's
 * own glow cannot reach a note lying flat on its glass. A dim yellow is olive.
 *
 * The note is the room's one sticky stock (palette.stickyYellow) on the room's
 * one sticky material (core/paper.js stickyMaterial, light 'monitor'), which
 * lifts it to where it reads ≈ rgb(221, 201, 97) by day, like the box's notes.
 * These are multipliers on that day lift, so it never glows after dark
 * (the monitor owner's v2 ratios: 0.5 / 0.5 / 0.42 / 0.3). morning, evening
 * and night are reasoned, not seen.
 */
export const STICKY_LIFT = Object.freeze({ morning: 1, day: 1, evening: 0.84, night: 0.6 });

/**
 * @param {{ texture: THREE.Texture, stickyMaterial: Function, lift: number }} options
 *        stickyMaterial: ctx.stickyMaterial; lift: the emissive lift for the hour
 *        (ctx.stickyLift('monitor') × STICKY_LIFT[hour]); 0 for none.
 * @returns {{ group: THREE.Group, front: THREE.Mesh, setCurl(k): void, dispose(): void }}
 *          the group is placed in PLANE space: add it to the screen mesh.
 */
export function buildSticky(THREE, { texture, stickyMaterial, lift }) {
    const geometry = new THREE.PlaneGeometry(STICKY.size, STICKY.size, STICKY.segments, STICKY.segments);
    const flat = geometry.attributes.position.array.slice();

    function setCurl(k) {
        const position = geometry.attributes.position;
        for (let i = 0; i < position.count; i += 1) {
            const x = flat[i * 3];
            const y = flat[i * 3 + 1];
            position.setZ(i, curlAt(x, y, k));
        }
        position.needsUpdate = true;
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
    }
    setCurl(1);

    // Paper, not a screen: lit by the room, plus the shared sticky lift. The
    // lift is the texture itself (emissiveMap), so the ink and the painted curl
    // stay as dark as they are drawn, and DeskScene's hover tint leaves it alone.
    const front = new THREE.Mesh(geometry, stickyMaterial({ map: texture, light: 'monitor', lift }));
    // The back (only ever glimpsed at the curl, facing the glass): plain
    // sticky stock, no mirrored ink, a little less lift than the face.
    const back = new THREE.Mesh(geometry, stickyMaterial({ light: 'monitor', lift: lift * 0.7, roughness: 0.9, side: THREE.BackSide }));
    for (const mesh of [front, back]) {
        // Casting would put a detached sliver of shadow on the bezel strip
        // (normalBias 0.03 against a note 3 mm off the glass), and the screen
        // under it is unlit — so the note receives the room's light and
        // shadow but throws none. GTAO still darkens the crease.
        mesh.castShadow = false;
        mesh.receiveShadow = true;
    }

    const group = new THREE.Group();
    group.name = 'monitor:sticky';
    group.add(front, back);
    group.position.set(STICKY.centre[0], STICKY.centre[1], STICKY.z);
    group.rotation.z = STICKY.roll;

    return {
        group,
        front,
        setCurl,
        dispose() {
            geometry.dispose();
            front.material.dispose();
            back.material.dispose();
        }
    };
}

export { curlAt };
