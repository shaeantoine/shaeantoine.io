import * as THREE from 'three';
import { mm } from '../../core/framing.js';
import { palette } from '../../core/palette.js';
import {
    BODY, LID, BODY_Y, LABEL, THICKNESS, SHEETS_MM, STICKY_CURL, FILE, FILLER_SIZE, fillerPose, toUnits, memoLayout,
    NOTE_RECTS, DIVIDER_STOCK, CARD_STOCK, badgePlacement, BADGE_THIN as BADGE_THIN_FOR_BOX
} from './layout.js';
import { LID_LABEL, PRINTS, ITE, MEMOS, INTRO, END, CHAPTERS, THREADS } from './copy.js';
import {
    paintKraft, paintLabel, paintPrintFront, paintPrintBack, paintFillerBack, paintIteClipping, paintNewsprintBack,
    paintPuralinkClipping, paintFluencyClipping, paintIteBack, paintMemo, paintSticky, paintRedNote,
    paintDividerFront, paintDividerBack, paintIntroCard, paintEndCard
} from './faces.js';
import { createHand } from './hand.js';
import { buildBadge } from '../badge/model.js';
import * as WORKS from '../../content/works/work.js';

/**
 * Meshes for the box and everything in it. Primitive geometry, physically
 * sized, lit by the room's own lights; every surface that carries words or a
 * photo is a canvas painted by faces.js. Canvases paint at once (paper, no
 * photo) and again when their image decodes and their fonts land — tracked,
 * so __desk.settled() waits for the finished face.
 */

const FILL = Object.freeze({
    print: 0.64, landscape: 0.48, ite: 0.62, memo: 0.58, clipping: 0.58, sticky: 0.3, decal: 0.1, label: 0.13, filler: 0.12,
    // v3: a divider is read where it stands (about the held print's scale); its back is never read.
    divider: 0.46, dividerBack: 0.1,
    // An index card held up is 0.56 × the print's height.
    card: 0.34
});

/** The writer every canvas in the box shares (every note typed in Shae Hand: hand.js). */
let HAND = null;
const handFor = (ctx) => (HAND ??= createHand(ctx));

// ---------------------------------------------------------------------------
// Sticky notes: the room's shared sticky stock (core/paper.js), lit for where they are
// ---------------------------------------------------------------------------

/**
 * A sticky's self-lift for `light` ('desk' | 'held'), from core/paper.js when
 * it's there. The notes here travel between the desk and your hand, so the box
 * re-lifts them as they go (index.js setStickyLight) rather than baking one in.
 */
export function stickyLiftFor(ctx, light) {
    try {
        if (typeof ctx.stickyLift === 'function') return ctx.stickyLift(light);
    } catch { /* fall through */ }
    return light === 'held' ? 0.06 : 0.4;
}

function makeStickyMaterial(ctx, { map = null, side = THREE.FrontSide }) {
    if (typeof ctx.stickyMaterial === 'function') {
        try {
            return ctx.stickyMaterial({ map, light: 'desk', side });
        } catch (error) {
            ctx.warn?.('stickyMaterial failed; using a plain yellow', error);
        }
    }
    // Fallback (no shared stock): the same yellow, lifted by hand.
    const yellow = palette.stickyYellow ?? '#ffd54a';
    return new THREE.MeshStandardMaterial({
        color: map ? '#ffffff' : yellow, map, emissive: map ? '#ffffff' : yellow, emissiveMap: map,
        emissiveIntensity: stickyLiftFor(ctx, 'desk'), roughness: 0.86, metalness: 0, side
    });
}

// ---------------------------------------------------------------------------
// The box
// ---------------------------------------------------------------------------

/**
 * A board panel whose UVs are scaled to its real size, so one tiling kraft
 * texture keeps the same grain on a 27 cm side and a 2.5 mm edge.
 */
function boardPanel(w, h, d, material, tile = 0.26) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    const uv = geometry.attributes.uv;
    // BoxGeometry faces, 4 vertices each: +x, -x (d × h), +y, -y (w × d), +z, -z (w × h).
    const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f += 1) {
        for (let v = 0; v < 4; v += 1) {
            const i = f * 4 + v;
            uv.setXY(i, uv.getX(i) * sizes[f][0] / tile, uv.getY(i) * sizes[f][1] / tile);
        }
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

/** An open tray of board: a floor plate and four walls, origin at the centre of its underside. */
function tray({ w, h, d, wall }, material, floorMaterial = material) {
    const group = new THREE.Group();
    const floor = boardPanel(w, wall, d, floorMaterial);
    floor.position.set(0, wall / 2, 0);
    const front = boardPanel(w, h - wall, wall, material);
    front.position.set(0, wall + (h - wall) / 2, d / 2 - wall / 2);
    const back = boardPanel(w, h - wall, wall, material);
    back.position.set(0, wall + (h - wall) / 2, -d / 2 + wall / 2);
    const left = boardPanel(wall, h - wall, d - 2 * wall, material);
    left.position.set(-w / 2 + wall / 2, wall + (h - wall) / 2, 0);
    const right = boardPanel(wall, h - wall, d - 2 * wall, material);
    right.position.set(w / 2 - wall / 2, wall + (h - wall) / 2, 0);
    group.add(floor, front, back, left, right);
    return { group, panels: [floor, front, back, left, right] };
}

export function buildBox(ctx) {
    const kraftCanvas = document.createElement('canvas');
    kraftCanvas.width = 512;
    kraftCanvas.height = 512;
    paintKraft(kraftCanvas);
    const kraftMap = ctx.canvasTexture(kraftCanvas);
    kraftMap.wrapS = THREE.RepeatWrapping;
    kraftMap.wrapT = THREE.RepeatWrapping;
    const outside = new THREE.MeshStandardMaterial({ color: '#ffffff', map: kraftMap, roughness: 0.86, metalness: 0 });
    // Inside the board is the same stock, seen in its own shade; a hair lighter
    // so the interior doesn't read as a hole.
    const inside = new THREE.MeshStandardMaterial({ color: '#f2eadc', map: kraftMap, roughness: 0.9, metalness: 0 });

    const root = new THREE.Group();
    root.name = 'photo-box';

    // The lid, upturned under the body (the way a photo box gets kept while
    // it's in use): plate on the desk, rim up round the body's foot.
    const lid = tray(LID, outside, inside);
    lid.group.name = 'lid';
    root.add(lid.group);

    // The body, standing in it.
    const body = tray(BODY, outside, inside);
    body.group.name = 'body';
    body.group.position.y = BODY_Y;
    root.add(body.group);

    // The masking-tape label, on the body's front face.
    const labelMm = [LABEL.w / mm(1), LABEL.h / mm(1)];
    const labelCanvas = ctx.makeCanvas(labelMm[0], labelMm[1], { fill: FILL.label, oversample: 2 });
    const labelTex = ctx.canvasTexture(labelCanvas.canvas);
    const hand = handFor(ctx);
    hand.paint(() => {
        paintLabel(labelCanvas.g, labelMm[0], labelMm[1], LID_LABEL, { hand });
        labelTex.needsUpdate = true;
    });
    const label = new THREE.Mesh(
        new THREE.PlaneGeometry(LABEL.w, LABEL.h),
        new THREE.MeshStandardMaterial({
            map: labelTex, roughness: 0.72, metalness: 0, alphaTest: 0.5,
            polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
        })
    );
    label.rotation.set(0, 0, LABEL.spin);
    label.position.set(LABEL.x, LABEL.y, BODY.d / 2 + 0.0007);
    label.receiveShadow = true;
    label.name = 'label';
    root.add(label);

    // The file the items stand in (box-local; identity), with the fillers at its back.
    const file = new THREE.Group();
    file.name = 'file';
    root.add(file);
    const fillers = buildFillers(ctx);
    for (const sheet of fillers) file.add(sheet);

    return {
        root, body: body.group, lid: lid.group, label, file, fillers,
        meshes: [...lid.panels, ...body.panels, label, ...fillers]
    };
}

/** The backs of other prints, standing behind the eight: one shared face, no words. */
function buildFillers(ctx) {
    const sizeMm = SHEETS_MM.print;
    const face = makeFace(ctx, sizeMm, FILL.filler);
    ctx.fonts.paint(() => {
        paintFillerBack(face.g, sizeMm[0], sizeMm[1]);
        face.texture.needsUpdate = true;
    });
    const sheets = [];
    for (let k = 0; k < FILE.fillers; k += 1) {
        // Filed facing the back of the box: the room sees their backs.
        const sheet = ctx.paperSheet({
            width: FILLER_SIZE[0], height: FILLER_SIZE[1], thickness: THICKNESS.print,
            front: face.texture, back: null, color: palette.photoBack, backColor: '#d9d6cf', roughness: 0.92, backRoughness: 0.5
        });
        const pose = fillerPose(k);
        sheet.position.copy(pose.position);
        sheet.quaternion.copy(pose.quaternion);
        sheet.name = `box-filler:${k}`;
        sheets.push(sheet);
    }
    return sheets;
}

// ---------------------------------------------------------------------------
// Small parts: stickies, the paper clip, red-pen decals
// ---------------------------------------------------------------------------

/** A sticky note: a curled plane, printed face out, blank yellow behind. Lies in its parent's XY plane. */
function stickyMesh(ctx, sizeMm, text, seed, it) {
    const [wm, hm] = sizeMm;
    const [w, h] = toUnits(sizeMm);
    const c = ctx.makeCanvas(wm, hm, { fill: FILL.sticky });
    const tex = ctx.canvasTexture(c.canvas);
    const hand = handFor(ctx);
    hand.paint(() => {
        paintSticky(c.g, wm, hm, { text, seed, hand });
        tex.needsUpdate = true;
    });
    const geometry = new THREE.PlaneGeometry(w, h, 1, 14);
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
        const v = (pos.getY(i) + h / 2) / h; // 0 at the bottom edge
        // The adhesive holds the top 40%; below it the paper lifts ~2.4 mm.
        const lift = v < 0.6 ? STICKY_CURL * Math.pow((0.6 - v) / 0.6, 2.1) : 0;
        pos.setZ(i, lift);
    }
    geometry.computeVertexNormals();
    const group = new THREE.Group();
    const faceMaterial = makeStickyMaterial(ctx, { map: tex, side: THREE.FrontSide });
    const backMaterial = makeStickyMaterial(ctx, { side: THREE.BackSide });
    const face = new THREE.Mesh(geometry, faceMaterial);
    const back = new THREE.Mesh(geometry, backMaterial);
    face.receiveShadow = true;
    back.receiveShadow = true;
    group.add(face, back);
    it.stickies.push(faceMaterial, backMaterial);
    return group;
}

/**
 * A Gem-style paper clip gripping a sheet's top edge at x: a small tongue on
 * the front, the long loop behind, joined by the bend over the edge. In the
 * sheet's frame (top edge at y = 0, front face at z = +frontZ, back at -backZ).
 */
function paperClip({ frontZ, backZ }) {
    const r = mm(0.45);
    const P = (x, y, z) => new THREE.Vector3(mm(x), mm(y), z);
    const f = frontZ + r + 0.0001;
    const b = -(backZ + r + 0.0001);
    const points = [
        // The tongue on the front: its free end partway down, down to its round
        // end, back up to the edge...
        P(-2.1, -8, f), P(-2.1, -14, f), P(-2.1, -19.2, f),
        P(-1.5, -21.4, f), P(0, -22.1, f), P(1.5, -21.4, f),
        P(2.1, -19.2, f), P(2.1, -10, f), P(2.1, -1, f),
        // ...over the paper's edge...
        P(2.35, 2.2, f * 0.7), P(2.9, 4.2, f * 0.1), P(3.4, 4.3, b * 0.2), P(3.65, 2.2, b * 0.8),
        // ...and the long loop down the back, ending free.
        P(3.7, -1, b), P(3.7, -14, b), P(3.7, -26.5, b),
        P(2.7, -28.8, b), P(0, -29.6, b), P(-2.7, -28.8, b),
        P(-3.7, -26.5, b), P(-3.7, -14, b), P(-3.7, -4, b)
    ];
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
    const geometry = new THREE.TubeGeometry(curve, 220, r, 6, false);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#b9bec5', metalness: 0.9, roughness: 0.3 }));
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    return mesh;
}

/** A transparent red-pen decal (hidden until shown), in its parent's XY plane, just proud of z. */
function redDecal(ctx, sizeMm, text, seed, id) {
    const [wm, hm] = sizeMm;
    const [w, h] = toUnits(sizeMm);
    const c = ctx.makeCanvas(wm, hm, { fill: FILL.decal, oversample: 2 });
    const tex = ctx.canvasTexture(c.canvas);
    const hand = handFor(ctx);
    hand.paint(() => {
        paintRedNote(c.g, wm, hm, { text, seed, id, hand });
        tex.needsUpdate = true;
    });
    const material = new THREE.MeshStandardMaterial({
        map: tex, transparent: true, opacity: 0, depthWrite: false, roughness: 0.6, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.renderOrder = 2;
    mesh.visible = false;
    return mesh;
}

/** Converts a point on a sheet's canvas (mm, from its top-left) to the sheet's local frame (units). */
function onSheet(sheetMm, xMm, yMm) {
    const [W, H] = sheetMm;
    return new THREE.Vector2(mm(xMm - W / 2), mm(H / 2 - yMm));
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

function sheetMesh(ctx, { sizeMm, thickness, front, back, color = palette.paper, backColor = palette.photoBack, roughness, backRoughness, cut }) {
    const [w, h] = toUnits(sizeMm);
    const mesh = ctx.paperSheet({ width: w, height: h, thickness, front, back, color, backColor, roughness, backRoughness });
    if (cut) {
        // Scissor-cut newsprint: the outline lives in the textures' alpha, so
        // the straight box edges would poke out past it — hide them (they're
        // 0.5 mm thick) and let the faces carry the shape.
        const invisible = new THREE.MeshBasicMaterial({ visible: false });
        mesh.material = mesh.material.map((m, i) => (i < 4 ? invisible : m));
        mesh.material[4].alphaTest = 0.5;
        mesh.material[5].alphaTest = 0.5;
    }
    return mesh;
}

function makeFace(ctx, sizeMm, fill) {
    const c = ctx.makeCanvas(sizeMm[0], sizeMm[1], { fill });
    return { ...c, texture: ctx.canvasTexture(c.canvas) };
}

/**
 * Paint now, again once `mediaName` decodes, and again when the fonts land
 * (one painter per face, so the last paint always has the image). The
 * repaints are tracked.
 */
function paintWithMedia(ctx, mediaName, paint) {
    let image = null;
    const hand = handFor(ctx);
    const draw = () => paint(image, hand);
    hand.paint(draw);
    if (!mediaName) return;
    ctx.track(ctx.media(mediaName).then(
        (decoded) => {
            image = decoded;
            try { draw(); } catch (error) { ctx.warn('repaint with media failed', error); }
            ctx.invalidate();
        },
        () => { /* logged by media() */ }
    ), `box media ${mediaName}`);
}

/**
 * One keepsake. The hierarchy is the animation:
 *   root     — where it is (in the file, in hand, on the pile)
 *   flip     — turning it over (about its own vertical axis)
 *   content  — the sheets; for memos, a memo group and a clipping group that
 *              re-arrange for "turned"
 */
export function buildItem(ctx, item, index) {
    const root = new THREE.Group();
    root.name = `box-item:${item.id}`;
    const flip = new THREE.Group();
    const content = new THREE.Group();
    root.add(flip);
    flip.add(content);
    const it = {
        id: item.id, item, index, root, flip, content,
        location: 'box', turned: false, pileY: 0, anims: new Set(), stats: {}, stickies: [], stickyLight: 'desk'
    };

    if (item.kind === 'print') buildPrint(ctx, it);
    else if (item.kind === 'clipping') buildIte(ctx, it);
    else if (item.kind === 'divider') buildDivider(ctx, it);
    else if (item.kind === 'card') buildCard(ctx, it);
    else buildMemo(ctx, it);

    try {
        attachBadge(ctx, it);
    } catch (error) {
        ctx.warn(`the badge on "${item.id}" could not be built; the ${item.kind} carries on without it`, error);
    }

    root.traverse((node) => { node.userData.boxItem = item.id; });
    return it;
}

function buildPrint(ctx, it) {
    const { item } = it;
    const landscape = item.orientation === 'landscape';
    const sizeMm = landscape ? SHEETS_MM.printLandscape : SHEETS_MM.print;
    const fill = landscape ? FILL.landscape : FILL.print;
    const front = makeFace(ctx, sizeMm, fill);
    const back = makeFace(ctx, sizeMm, fill);
    const copy = PRINTS[item.id];
    const thread = THREADS[item.id] ?? null;
    paintWithMedia(ctx, item.media, (image, hand) => {
        it.stats.line = paintPrintFront(front.g, sizeMm[0], sizeMm[1], {
            image, focus: item.focus, line: copy.line, orientation: item.orientation, seed: item.id, hand
        });
        it.stats.back = paintPrintBack(back.g, sizeMm[0], sizeMm[1], {
            back: copy.back, date: copy.date, orientation: item.orientation, seed: item.id, thread, hand
        });
        front.texture.needsUpdate = true;
        back.texture.needsUpdate = true;
    });
    // The thread under the back's note is a link: its rect on the back face (mm), for the click and the cursor.
    if (thread) it.thread = { ...thread, rect: NOTE_RECTS.printThread(item.orientation), sizeMm };
    // Lustre photo paper in front, matte card behind.
    const sheet = sheetMesh(ctx, {
        sizeMm, thickness: THICKNESS.print, front: front.texture, back: back.texture, roughness: 0.52, backRoughness: 0.92
    });
    it.content.add(sheet);
    // The thread rect's centre in the sheet's local frame (the inverse of index.js
    // onThread), so a test can click the line for real (a testing hook: nothing in the site reads it).
    if (thread) {
        const r = it.thread.rect;
        sheet.userData.threadPoint = [(sizeMm[0] / 2 - (r.x + r.w / 2)) * mm(1), (sizeMm[1] / 2 - (r.y + r.h / 2)) * mm(1)];
    }
}

function buildIte(ctx, it) {
    const sizeMm = SHEETS_MM.ite;
    const front = makeFace(ctx, sizeMm, FILL.ite);
    const back = makeFace(ctx, sizeMm, FILL.ite);
    paintWithMedia(ctx, it.item.media, (image, hand) => {
        paintIteClipping(front.g, sizeMm[0], sizeMm[1], { image, headline: ITE.headline, meta: ITE.meta });
        // v4: its back carries a thread, in ink on the bare newsprint (→ the Paging Dr. AI paper).
        paintIteBack(back.g, sizeMm[0], sizeMm[1], { thread: THREADS.ite, hand });
        front.texture.needsUpdate = true;
        back.texture.needsUpdate = true;
    });
    const sheet = sheetMesh(ctx, {
        sizeMm, thickness: THICKNESS.newsprint, front: front.texture, back: back.texture,
        color: palette.newsprint, backColor: palette.newsprint, roughness: 0.93, backRoughness: 0.93, cut: true
    });
    it.content.add(sheet);
    // The thread on the back is a link, as on the prints (index.js onThread reads it.thread).
    if (THREADS.ite) {
        const rect = NOTE_RECTS.iteThread;
        it.thread = { ...THREADS.ite, rect, sizeMm };
        sheet.userData.threadPoint = [(sizeMm[0] / 2 - (rect.x + rect.w / 2)) * mm(1), (sizeMm[1] / 2 - (rect.y + rect.h / 2)) * mm(1)];
    }
    // The sticky, lower right, clear of the cover's face and hanging a little
    // off the edge (its blank back shows when the clipping is turned over).
    const sticky = stickyMesh(ctx, SHEETS_MM.sticky, ITE.sticky, 'ite', it);
    const at = onSheet(sizeMm, 84 + 38, 97 + 38);
    sticky.position.set(at.x, at.y, THICKNESS.newsprint / 2 + 0.0004);
    sticky.rotation.z = -0.06;
    it.content.add(sticky);
}

function buildMemo(ctx, it) {
    const { item } = it;
    const copy = MEMOS[item.id];
    const layout = memoLayout(item.id);
    it.layout = layout;

    // --- the memo, with its sticky and clip ---------------------------------
    const memoMm = SHEETS_MM.memo;
    const memoFace = makeFace(ctx, memoMm, FILL.memo);
    paintWithMedia(ctx, item.media, (image, hand) => {
        paintMemo(memoFace.g, memoMm[0], memoMm[1], { id: item.id, image, redPen: copy.redPen, hand });
        memoFace.texture.needsUpdate = true;
    });
    const memoGroup = new THREE.Group();
    memoGroup.name = 'memo';
    const memoSheet = sheetMesh(ctx, {
        sizeMm: memoMm, thickness: THICKNESS.paper, front: memoFace.texture, back: null,
        backColor: palette.paper, roughness: 0.9, backRoughness: 0.9
    });
    memoGroup.add(memoSheet);
    if (copy.sticky) {
        const sticky = stickyMesh(ctx, SHEETS_MM.memoSticky, copy.sticky, item.id, it);
        const at = onSheet(memoMm, 110 + 34, 76 + 34);
        sticky.position.set(at.x, at.y, THICKNESS.paper / 2 + 0.0004);
        sticky.rotation.z = -0.05;
        memoGroup.add(sticky);
    }
    const clip = paperClip({ frontZ: THICKNESS.paper / 2, backZ: -layout.z.clippingBehind + THICKNESS.paper / 2 });
    clip.position.set(layout.clipX, layout.memo.h / 2, 0);
    clip.rotation.z = 0.035;
    memoGroup.add(clip);
    it.content.add(memoGroup);

    // --- the clipping, with its "+N days" -------------------------------------
    const clipMm = item.id === 'puralink' ? SHEETS_MM.puralinkClip : SHEETS_MM.fluencyClip;
    const clipFace = makeFace(ctx, clipMm, FILL.clipping);
    const clipBack = makeFace(ctx, clipMm, FILL.clipping);
    const clippingGroup = new THREE.Group();
    clippingGroup.name = 'clipping';
    const decalMm = [NOTE_RECTS.redGap.w, NOTE_RECTS.redGap.h];
    const decal = redDecal(ctx, decalMm, copy.clipping.gap, `${item.id}-gap`, item.id);
    const placeDecal = (facts) => {
        if (!facts) return;
        // Just right of the date line, baseline-ish with it.
        const at = onSheet(clipMm, facts.metaRight + 3 + decalMm[0] / 2, facts.metaY + facts.metaHeight / 2 - 0.6);
        decal.position.set(at.x, at.y, THICKNESS.newsprint / 2 + 0.0003);
    };
    paintWithMedia(ctx, item.clippingMedia ?? null, (image) => {
        const c = copy.clipping;
        const facts = item.id === 'puralink'
            ? paintPuralinkClipping(clipFace.g, clipMm[0], clipMm[1], { image, headline: c.headline, meta: c.meta, standfirst: c.standfirst })
            : paintFluencyClipping(clipFace.g, clipMm[0], clipMm[1], { headline: c.headline, meta: c.meta, setLine: c.setLine });
        paintNewsprintBack(clipBack.g, clipMm[0], clipMm[1], item.id);
        placeDecal(facts);
        clipFace.texture.needsUpdate = true;
        clipBack.texture.needsUpdate = true;
    });
    const clipSheet = sheetMesh(ctx, {
        sizeMm: clipMm, thickness: THICKNESS.newsprint, front: clipFace.texture, back: clipBack.texture,
        color: palette.newsprint, backColor: palette.newsprint, roughness: 0.93, backRoughness: 0.93, cut: true
    });
    clippingGroup.add(clipSheet, decal);
    it.content.add(clippingGroup);

    it.memo = { memoGroup, clippingGroup, decal };
}

/**
 * A chapter divider: coloured cardstock cut to its tab (the outline lives in
 * the faces' alpha, as the scissor-cut clippings' does), the year on the tab
 * and the chapter line on the face. It never leaves the box.
 */
function buildDivider(ctx, it) {
    const { item } = it;
    const chapter = CHAPTERS[item.id];
    const stock = DIVIDER_STOCK[chapter.year];
    const sizeMm = SHEETS_MM.divider;
    const front = makeFace(ctx, sizeMm, FILL.divider);
    const back = makeFace(ctx, sizeMm, FILL.dividerBack);
    const hand = handFor(ctx);
    hand.paint(() => {
        it.stats.chapter = paintDividerFront(front.g, { year: chapter.year, position: item.tab, color: stock.color, line: chapter.line, hand });
        paintDividerBack(back.g, { year: chapter.year, position: item.tab, color: stock.color });
        front.texture.needsUpdate = true;
        back.texture.needsUpdate = true;
    });
    const sheet = sheetMesh(ctx, {
        sizeMm, thickness: THICKNESS.divider, front: front.texture, back: back.texture,
        color: stock.color, backColor: stock.color, roughness: 0.86, backRoughness: 0.88, cut: true
    });
    it.content.add(sheet);
    it.divider = { sheet, state: 'flush' };
}

/** A ruled 6 × 4 index card: the opening card or the end card. Its back is blank card. */
function buildCard(ctx, it) {
    const sizeMm = SHEETS_MM.card;
    const front = makeFace(ctx, sizeMm, FILL.card);
    const hand = handFor(ctx);
    hand.paint(() => {
        it.stats.card = it.id === 'end'
            ? paintEndCard(front.g, sizeMm[0], sizeMm[1], { question: END.question, hand })
            : paintIntroCard(front.g, sizeMm[0], sizeMm[1], { text: INTRO.text, hand });
        front.texture.needsUpdate = true;
    });
    const sheet = sheetMesh(ctx, {
        sizeMm, thickness: THICKNESS.card, front: front.texture, back: null,
        color: CARD_STOCK.color, backColor: CARD_STOCK.color, roughness: 0.9, backRoughness: 0.92
    });
    it.content.add(sheet);
}

// ---------------------------------------------------------------------------
// Badges (v4): each job's badge, binder-clipped to its keepsake
// ---------------------------------------------------------------------------

const CLIP_MATERIAL = () => new THREE.MeshStandardMaterial({ color: '#1b1b1d', metalness: 0.45, roughness: 0.38 });
const WIRE_MATERIAL = () => new THREE.MeshStandardMaterial({ color: '#b9bcc1', metalness: 1, roughness: 0.25 });

/**
 * A small black binder clip biting a sheet's top edge at the origin: two
 * steel jaws (inner faces at z = front and z = back), the rolled spine over
 * the edge, and its two wire handles folded down flat on the jaws. In the
 * sheet's frame, top edge at y = 0.
 */
function binderClip({ width, depth, jaw, wire, front, back }) {
    const group = new THREE.Group();
    group.name = 'binder-clip';
    const steel = CLIP_MATERIAL();
    const nickel = WIRE_MATERIAL();
    const add = (mesh) => { mesh.castShadow = false; mesh.receiveShadow = true; group.add(mesh); return mesh; };
    add(new THREE.Mesh(new THREE.BoxGeometry(width, depth, jaw), steel)).position.set(0, -depth / 2, front + jaw / 2);
    add(new THREE.Mesh(new THREE.BoxGeometry(width, depth, jaw), steel)).position.set(0, -depth / 2, back - jaw / 2);
    const r = (front - back) / 2 + jaw;
    // Half a cylinder (x ≥ 0 about its own axis), turned so the axis runs along the edge and the round is up.
    const spineGeometry = new THREE.CylinderGeometry(r, r, width, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);
    add(new THREE.Mesh(spineGeometry, steel)).position.set(0, 0, (front + back) / 2);
    // The handles, folded down: a U of wire flat on each jaw, its ends tucked into the spine.
    for (const [z, k] of [[front + jaw + wire, 1], [back - jaw - wire, -1]]) {
        const a = width * 0.36;
        const pts = [
            new THREE.Vector3(-a, r * 0.2, (front + back) / 2 + k * r * 0.8),
            new THREE.Vector3(-a, -depth * 0.35, z),
            new THREE.Vector3(-a * 0.8, -depth * 0.95, z),
            new THREE.Vector3(a * 0.8, -depth * 0.95, z),
            new THREE.Vector3(a, -depth * 0.35, z),
            new THREE.Vector3(a, r * 0.2, (front + back) / 2 + k * r * 0.8)
        ];
        const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
        add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, wire, 5, false), nickel));
    }
    return group;
}

/**
 * The item's badge (layout.js BADGES / badgePlacement), clipped over a top
 * corner of its sheet — the print or clipping itself, or the memo inside its
 * memo group (so it stays with the memo when the clipping comes round).
 */
function attachBadge(ctx, it) {
    const place = badgePlacement(it.id);
    if (!place) return;
    const work = WORKS[place.work];
    if (!work) throw new Error(`no work "${place.work}" in src/content/works/work.js`);
    const parent = it.memo ? it.memo.memoGroup : it.content;
    const pivot = new THREE.Group();
    pivot.name = `badge-clip:${it.id}`;
    pivot.position.set(place.pivot.x, place.pivot.y, 0);
    pivot.rotation.z = place.spin;
    const badge = buildBadge(ctx, work, { thin: BADGE_THIN_FOR_BOX, name: `badge:${it.id}` });
    badge.group.position.set(place.badge.x, place.badge.y, place.z);
    pivot.add(badge.group);
    pivot.add(binderClip(place.clip));
    parent.add(pivot);
    it.badge = { pivot, ...badge, work: place.work };
}
