import * as THREE from 'three';
import { hitProxy } from '../../core/parts.js';
import { mm } from '../../core/framing.js';
import {
    OBJECT_ID, LABEL, POSITION, YAW, SHEET, DOCS, DOC_IDS, SLOT_MM, STACK_TOP_MM, HOLD,
    restPose, slidePose, stackShot, readShot, handPose, frontFillFor, worldToGroup, worldToGroupQuaternion
} from './layout.js';
import { PAPERS, HINTS, LIVE_STACK } from './copy.js';
import { paintTypesetCover, paintMargin, TYPESET, TYPESET_CAP_PX } from './faces.js';
import { growMesh, drawFigureLive, FIGURE_MM, FIGURE_FPS, FIGURE_TRIANGLES } from './figure.js';
import { buildDocument, buildFigurePlane, clipMaterials } from './build.js';

/**
 * PAPER — "things I wrote". The room's printouts became a door: four clipped
 * A4 documents on one stack where the paper stack stood (right of the mouse,
 * clear of the box's pile), a bulldog clip on each, staggered along the top
 * edge so the clips read as four.
 *
 *   #paper                     the camera over the stack: the top cover readable
 *   #paper/<id>                that paper in hand, its REAL front page (held
 *                              closer if its title is small)
 *   #paper/<id>/notes          turned over: Shae's one margin page — never the paper itself
 *     ids, top to bottom: triangulations · pvsnp · ansto · drai
 *
 * Verbs: click a paper (or →) to pick it up — one from lower down slides out
 * from under the others first; click it (Space/Enter) to turn it over; ← → for
 * the others; esc puts it back (esc again, the desk). Papers go back on the
 * stack slightly askew: the room keeps your trace (and #desk/after shows all
 * four so). Threads on the margin pages (drawn arrow, click it): P vs NP →
 * the triangulations paper; Paging Dr. AI → #monitor/trash. The
 * triangulations page's reveal: a live figure — a triangulated disc growing
 * one triangle at a time beside its vertices ÷ triangles curve falling toward
 * the bound — "illustrative — not the paper's data", written on the page.
 * It animates (≤ 12 fps, one small canvas) only while that page is showing.
 *
 * Numbers: layout.js (DOM-free). Words: copy.js. Canvases: faces.js,
 * figure.js. Meshes: build.js.
 */

const UP = new THREE.Vector3(0, 1, 0);
const PICK_ARC = 0.05;
const PUT_ARC = 0.04;
const TURN_LIFT = 0.048;

/** The fallback stack: plain sheets, visible only if mount() fails (hidden once the real ones are built). */
const FALLBACK_PARTS = DOCS.map((doc, i) => ({
    type: 'box',
    args: [SHEET.w, mm(doc.thickMm), SHEET.h],
    position: [0, mm(SLOT_MM[i]), 0],
    color: '#f2f0ea',
    material: { roughness: 0.9, metalness: 0 }
}));

let paper = null;

// ---------------------------------------------------------------------------
// Faces
// ---------------------------------------------------------------------------

function coverFor(ctx, id) {
    const cover = PAPERS[id].cover;
    if (cover.image) {
        return {
            texture: ctx.mediaTexture(cover.image),
            fill: frontFillFor(cover.capPx),
            focusY: (cover.titleBand[0] + cover.titleBand[1]) / 2
        };
    }
    const c = ctx.makeCanvas(210, 297, { fill: 0.96, maxPixels: 2.4e6 });
    const texture = ctx.canvasTexture(c.canvas);
    let band = [TYPESET.titleTop / 297, (TYPESET.titleTop + 24) / 297];
    ctx.paint(() => {
        c.clear();
        band = paintTypesetCover(c.g, cover.typeset).titleBand;
        texture.needsUpdate = true;
    });
    return { texture, fill: frontFillFor(TYPESET_CAP_PX), focusY: (band[0] + band[1]) / 2, canvas: c };
}

/** The margin page: painted the first time the paper is picked up (it costs a canvas). */
function ensureMargin(ctx, doc) {
    if (doc.margin) return doc.margin;
    const c = ctx.makeCanvas(210, 297, { fill: 0.96, maxPixels: 2.4e6 });
    const texture = ctx.canvasTexture(c.canvas);
    const margin = { canvas: c, texture, thread: null };
    ctx.paint(() => {
        c.clear();
        margin.thread = paintMargin(c.g, doc.id).thread;
        texture.needsUpdate = true;
    });
    ctx.setPaperFace(doc.sheet, 'back', texture);
    doc.margin = margin;
    return margin;
}

// ---------------------------------------------------------------------------
// The figure (triangulations margin page)
// ---------------------------------------------------------------------------

function buildFigure(ctx, doc) {
    const c = ctx.makeCanvas(FIGURE_MM.w, FIGURE_MM.h, { fill: 0.96 * FIGURE_MM.h / 297, maxPixels: 0.9e6 });
    const texture = ctx.canvasTexture(c.canvas);
    const plane = buildFigurePlane(doc, texture);
    const mesh = growMesh();
    const figure = { canvas: c, texture, plane, mesh, shown: mesh.tris.length, stop: null };
    drawFigure(ctx, figure, figure.shown);
    return figure;
}

function drawFigure(ctx, figure, shown) {
    figure.canvas.clear();
    drawFigureLive(figure.canvas.g, figure.mesh, shown, { ink: ctx.palette.ink, red: ctx.palette.redPen });
    figure.shown = shown;
    figure.texture.needsUpdate = true;
    ctx.invalidate();
}

function stopFigure() {
    const figure = paper?.figure;
    if (!figure?.stop) return;
    figure.stop();
    figure.stop = null;
}

/** Grow it from one triangle (≤ 12 fps, a small canvas); still / reduced motion show it grown. */
function startFigure(ctx) {
    const figure = paper?.figure;
    if (!figure) return;
    stopFigure();
    const total = Math.min(FIGURE_TRIANGLES, figure.mesh.tris.length);
    if (ctx.still || ctx.reducedMotion) {
        drawFigure(ctx, figure, total);
        return;
    }
    drawFigure(ctx, figure, 1);
    figure.stop = ctx.every(1000 / FIGURE_FPS, () => {
        const next = figure.shown + 1;
        drawFigure(ctx, figure, next);
        if (next >= total) stopFigure();
    });
}

// ---------------------------------------------------------------------------
// Poses and moves
// ---------------------------------------------------------------------------

function handTarget(ctx, doc, face) {
    const cam = ctx.camera.object;
    const pose = handPose(ctx.camera.finalPose(), {
        aspect: cam.aspect, fov: cam.fov,
        fill: face === 'front' ? doc.cover.fill : HOLD.fill,
        focusY: doc.cover.focusY
    });
    return { position: worldToGroup(pose.position), quaternion: worldToGroupQuaternion(pose.quaternion) };
}

/** Toward the camera, in the group's frame (for the mid-turn hop). */
function towardCamera(ctx, from) {
    const eye = worldToGroup(new THREE.Vector3().copy(ctx.camera.finalPose().position));
    return eye.sub(from).normalize().add(UP).normalize();
}

function setShadowsInHand(doc, inHand) {
    // Held up to the camera, a page shouldn't wear the room's shadows (the box's rule).
    for (const mesh of doc.meshes) mesh.receiveShadow = !inHand;
}

function cancel(doc) {
    doc.token += 1;
    const running = doc.anim;
    doc.anim = null;
    running?.cancel?.();
    return doc.token;
}

async function run(doc, token, start) {
    if (doc.token !== token) return false;
    const animation = start();
    doc.anim = animation;
    const done = await animation;
    if (doc.anim === animation) doc.anim = null;
    return done && doc.token === token;
}

function move(ctx, doc, token, target, { preset, arc = 0, arcAxis, flipTo }) {
    const f0 = doc.flip.rotation.y;
    return run(doc, token, () => ctx.motion.moveObject(doc.pivot, {
        position: target.position,
        quaternion: target.quaternion,
        preset,
        arc,
        arcAxis,
        instant: false,
        onUpdate: flipTo === undefined ? undefined : (e) => { doc.flip.rotation.y = f0 + (flipTo - f0) * e; }
    }));
}

function place(doc, target, flip) {
    doc.pivot.position.copy(target.position);
    doc.pivot.quaternion.copy(target.quaternion);
    doc.flip.rotation.y = flip;
}

/** Is anything still lying on top of `doc` in the stack? */
function covered(doc) {
    return paper.docs.some((other) => other.index < doc.index && other.where === 'stack');
}

async function lift(ctx, doc, face, instant) {
    const token = cancel(doc);
    const flipTo = face === 'notes' ? Math.PI : 0;
    const from = doc.where;
    doc.where = 'hand';
    doc.face = face;
    setShadowsInHand(doc, true);
    if (paper.figure && doc.id === 'triangulations') paper.figure.plane.visible = true;
    const target = handTarget(ctx, doc, face);
    if (instant) {
        place(doc, target, flipTo);
        ctx.invalidateShadows();
        return true;
    }
    if (from === 'hand') {
        if (Math.abs(doc.flip.rotation.y - flipTo) < 1e-3) {
            return move(ctx, doc, token, target, { preset: 'pick' });
        }
        // Turned over in hand, hopping toward you (and to its reading distance for that side).
        return move(ctx, doc, token, target, {
            preset: 'turn', arc: TURN_LIFT, arcAxis: towardCamera(ctx, doc.pivot.position), flipTo
        });
    }
    if (covered(doc)) {
        // From lower down: slid out from under the others first, clear of the stack.
        const out = slidePose(doc.id, { askew: doc.askew });
        if (!(await move(ctx, doc, token, out, { preset: 'slide' }))) return false;
    }
    return move(ctx, doc, token, target, { preset: 'pick', arc: PICK_ARC, flipTo });
}

async function putBack(ctx, doc, instant) {
    const token = cancel(doc);
    doc.where = 'stack';
    doc.face = 'front';
    doc.askew = true; // the trace: back on the stack, not quite square
    const rest = restPose(doc.id, { askew: true });
    const finish = () => {
        if (doc.token !== token) return;
        setShadowsInHand(doc, false);
        if (paper.figure && doc.id === 'triangulations') paper.figure.plane.visible = false;
        ctx.invalidateShadows();
    };
    if (instant) {
        place(doc, rest, 0);
        finish();
        return true;
    }
    if (covered(doc)) {
        const out = slidePose(doc.id, { askew: true });
        if (!(await move(ctx, doc, token, out, { preset: 'put', arc: PUT_ARC, flipTo: 0 }))) return false;
        const done = await move(ctx, doc, token, rest, { preset: 'slide' });
        finish();
        return done;
    }
    const done = await move(ctx, doc, token, rest, { preset: 'put', arc: PUT_ARC, flipTo: 0 });
    finish();
    return done;
}

// ---------------------------------------------------------------------------
// Input helpers
// ---------------------------------------------------------------------------

function docOf(object) {
    let node = object;
    while (node) {
        const doc = paper.docs.find((d) => d.pivot === node);
        if (doc) return doc;
        node = node.parent;
    }
    return null;
}

function hitDoc(ctx, ndc) {
    if (!paper?.docs) return null;
    const hits = ctx.raycast(ndc, paper.docs.map((d) => d.pivot), true).filter((h) => h.object.visible && h.object !== paper.figure?.plane);
    if (!hits.length) return null;
    return { doc: docOf(hits[0].object), hit: hits[0] };
}

/** Is `hit` on the thread of the margin page you're holding turned over? (Its rect, 3 mm of slack.) */
function onThread(doc, hit) {
    const rect = doc.margin?.thread;
    if (!rect || doc.where !== 'hand' || doc.face !== 'notes' || hit.object !== doc.sheet) return false;
    const local = doc.sheet.worldToLocal(hit.point.clone());
    if (local.z > 0) return false; // the front
    const xMm = 210 / 2 - local.x / mm(1);
    const yMm = 297 / 2 - local.y / mm(1);
    return xMm >= rect.x - 3 && xMm <= rect.x + rect.w + 3 && yMm >= rect.y - 3 && yMm <= rect.y + rect.h + 3;
}

function current() {
    return paper?.docs.find((d) => d.where === 'hand') ?? null;
}

function hashFor(id, face) {
    if (!id) return '#paper';
    return face === 'notes' ? `#paper/${id}/notes` : `#paper/${id}`;
}

function liveText(id, face) {
    if (!id) return LIVE_STACK;
    const p = PAPERS[id];
    if (face === 'front') return `${p.title}, in hand. The front page: ${p.spokenCover}`;
    const parts = [p.aside, p.line, p.note, p.pencil && `In pencil: ${p.pencil.prior}, held loosely.`,
        p.figure && `A figure grows beside it: a triangulated mesh, and vertices over triangles falling toward a bound — ${p.figure.label}.`,
        p.thread && `${p.thread.line} An arrow to ${p.thread.label}.`];
    return `Shae's margin page for ${p.title}: ${parts.filter(Boolean).join(' ')}`;
}

// ---------------------------------------------------------------------------
// The module
// ---------------------------------------------------------------------------

export default {
    id: 'paper',
    objectIds: [OBJECT_ID],
    // The room's scenery stack (src/content/deskObjects.js 'paper-stack', the
    // original site's A5 printouts) is switched off by patching its entry — the
    // core's layout hook has no remove — and this module's stack stands in its
    // place. If this module fails to import, the old scenery stays.
    overrides: {
        'paper-stack': { parts: [], model: undefined, clickable: false, label: null, focus: undefined }
    },
    deskObjects: [
        {
            id: OBJECT_ID,
            label: LABEL,
            clickable: true,
            position: [...POSITION],
            rotation: [0, YAW, 0],
            hover: { lift: 0.012 },
            parts: [
                hitProxy([SHEET.w + 0.03, mm(STACK_TOP_MM) + 0.01, SHEET.h + 0.04]),
                ...FALLBACK_PARTS
            ]
        }
    ],
    states: [
        { hash: '#paper', note: 'over the stack of four clipped A4 papers (58° down, along the stack\'s own bearing): the typeset triangulations cover on top, readable; four black bulldog clips staggered along the top edge; the box\'s pile at the top of the frame' },
        { hash: '#paper/triangulations', note: 'the triangulations paper in hand (left of centre, 92% of the height): the typeset cover "Experimentally Bounding the Space of Triangulations"; the stack at the lower right, the box beyond' },
        { hash: '#paper/triangulations/notes', note: 'turned over: Shae\'s margin page — "Maths isn\'t meant to be settled by sampling…", the note with a red bracket, the grown figure (mesh + vertices ÷ triangles curve over a dashed bound), "illustrative — not the paper\'s data" in pencil' },
        { hash: '#paper/pvsnp', note: 'the P vs NP review in hand: its real front page (title and contents)' },
        { hash: '#paper/pvsnp/notes', note: 'margin page: "We didn\'t advance the problem…", the note, "My prior: P ≠ NP" + "held loosely" in smudged pencil, the thread → the triangulations' },
        { hash: '#paper/ansto', note: 'the ANSTO report in hand: its real cover (CORIS360 camera)' },
        { hash: '#paper/ansto/notes', note: 'margin page: the one line (a placeholder until Shae writes a better one)' },
        { hash: '#paper/drai', note: 'Paging Dr. AI in hand, held closer (its title is small): the real title page' },
        { hash: '#paper/drai/notes', note: 'margin page: red "co-supervised with Martin Brown" top right, "It never made my résumé…", the note, the thread → the trash (#monitor/trash)' }
    ],

    async mount(ctx) {
        const group = ctx.deskScene.getObjectGroup(OBJECT_ID);
        if (!group) throw new Error(`desk object "${OBJECT_ID}" is missing`);
        paper = { ctx, group, docs: [], figure: null, active: false, pointerOver: false };
        const clipMats = clipMaterials();
        const built = [];
        DOCS.forEach((spec, index) => {
            try {
                const cover = coverFor(ctx, spec.id);
                const doc = buildDocument(ctx, spec, { front: cover.texture, clipMats });
                Object.assign(doc, { index, cover, where: 'stack', face: 'front', askew: false, token: 0, anim: null, margin: null, title: PAPERS[spec.id].title });
                place(doc, restPose(spec.id), 0);
                group.add(doc.pivot);
                built.push(doc);
            } catch (error) {
                ctx.warn(`the ${spec.id} paper failed to build; left out`, error);
            }
        });
        paper.docs = built;
        if (built.length) {
            // The real stack is up: hide the plain stand-in sheets (FALLBACK_PARTS; not the hit proxy).
            for (const child of group.children) {
                if (built.some((d) => d.pivot === child)) continue;
                child.traverse((node) => {
                    const p = node.isMesh && node.geometry?.type === 'BoxGeometry' ? node.geometry.parameters : null;
                    if (p && Math.abs(p.depth - SHEET.h) < 1e-6 && Math.abs(p.width - SHEET.w) < 1e-6) node.visible = false;
                });
            }
        }
        const tri = built.find((d) => d.id === 'triangulations');
        if (tri) {
            try {
                paper.figure = buildFigure(ctx, tri);
            } catch (error) {
                ctx.warn('the figure failed to build; the page shows without it', error);
            }
        }

        ctx.pointer.onMove((ndc) => {
            if (!paper.active) return;
            const over = Boolean(hitDoc(ctx, ndc));
            if (over === paper.pointerOver) return;
            paper.pointerOver = over;
            ctx.setCursor(over ? 'pointer' : null);
        });
        ctx.invalidateShadows();
    },

    async go(ctx, path, { instant }) {
        const id = DOC_IDS.includes(path[0]) ? path[0] : null;
        const face = id && path[1] === 'notes' ? 'notes' : 'front';
        const cam = ctx.camera.object;
        const shot = id ? readShot(cam.aspect, cam.fov) : stackShot(cam.aspect, cam.fov);
        const cameraMove = ctx.camera.moveTo(shot, { instant });
        const doc = paper?.docs.find((d) => d.id === id) ?? null;

        ctx.hint(!doc ? HINTS.stack : face === 'notes' ? (PAPERS[id].thread ? HINTS.thread : HINTS.notes) : HINTS.front);
        ctx.live(liveText(doc ? id : null, face));
        if (doc) ctx.visit.log(PAPERS[id].title);
        if (!paper?.docs.length) {
            await cameraMove;
            return;
        }
        paper.active = true;
        if (!(doc && id === 'triangulations' && face === 'notes')) stopFigure();

        const jobs = [cameraMove];
        for (const other of paper.docs) {
            if (other !== doc && other.where === 'hand') jobs.push(putBack(ctx, other, instant));
        }
        if (doc) {
            ensureMargin(ctx, doc);
            const lifting = lift(ctx, doc, face, instant);
            jobs.push(lifting);
            if (id === 'triangulations' && face === 'notes' && paper.figure) {
                // The reveal starts as the page comes round (and only if it's still showing).
                jobs.push(lifting.then((done) => {
                    if (done && doc.where === 'hand' && doc.face === 'notes') startFigure(ctx);
                }));
            }
        }
        await Promise.all(jobs);
    },

    async leave(ctx, { instant }) {
        if (!paper) return;
        paper.active = false;
        stopFigure();
        if (paper.pointerOver) {
            paper.pointerOver = false;
            ctx.setCursor(null);
        }
        await Promise.all(paper.docs.filter((d) => d.where === 'hand').map((d) => putBack(ctx, d, instant)));
    },

    key(ctx, event) {
        if (!paper?.active || !paper.docs.length) return false;
        const held = current();
        const index = held ? DOC_IDS.indexOf(held.id) : -1;
        const onPage = event.target === document.body || event.target === ctx.deskScene.renderer.domElement;
        if (event.key === 'ArrowRight') {
            ctx.navigate(index + 1 < DOC_IDS.length ? hashFor(DOC_IDS[index + 1]) : '#paper');
            return true;
        }
        if (event.key === 'ArrowLeft') {
            if (index < 0) return false;
            ctx.navigate(index > 0 ? hashFor(DOC_IDS[index - 1]) : '#paper');
            return true;
        }
        if (onPage && (event.key === ' ' || event.key === 'Enter')) {
            ctx.navigate(held ? hashFor(held.id, held.face === 'notes' ? 'front' : 'notes') : hashFor(DOC_IDS[0]));
            return true;
        }
        if (event.key === 'Escape' && held) {
            ctx.navigate('#paper');
            return true;
        }
        return false;
    },

    click(ctx, ndc) {
        if (!paper?.active) return false;
        const found = hitDoc(ctx, ndc);
        if (!found?.doc) return false;
        const { doc, hit } = found;
        if (doc.where === 'hand') {
            if (onThread(doc, hit)) {
                ctx.navigate(PAPERS[doc.id].thread.to);
                return true;
            }
            ctx.navigate(hashFor(doc.id, doc.face === 'notes' ? 'front' : 'notes'));
            return true;
        }
        ctx.navigate(hashFor(doc.id));
        return true;
    },

    /** After a visit: all four back on the stack, each a little askew. */
    trail(ctx) {
        for (const id of DOC_IDS) ctx.visit.log(PAPERS[id].title);
        if (!paper?.docs.length || paper.active) return undefined;
        return Promise.all(paper.docs.map((doc) => {
            doc.askew = true;
            if (doc.where === 'hand') return putBack(ctx, doc, ctx.instant);
            const token = cancel(doc);
            const rest = restPose(doc.id, { askew: true });
            if (ctx.instant) {
                place(doc, rest, 0);
                ctx.invalidateShadows();
                return true;
            }
            return move(ctx, doc, token, rest, { preset: 'put' });
        }));
    }
};
