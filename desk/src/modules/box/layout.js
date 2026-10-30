import * as THREE from 'three';
import { mm, orbitShot, toVec3, poseInFront, frameReport, makeCamera, FOV } from '../../core/framing.js';
import { rng } from '../../core/rng.js';
import { badgeDims } from '../badge/dims.js';

/**
 * THE BOX'S GEOMETRY — every size, slot, pose and shot, with no DOM in it, so
 * the same numbers the module builds from can be checked from node. World
 * units: 3.2 per metre, so mm(1) is 0.0032 (1 unit = 312.5 mm). Box-local
 * frame: origin at the centre of the base, +Z is the box's front (it faces
 * the room), +Y up.
 *
 * v2 (after the first screenshots). The box no longer opens: its lid is
 * already off, tucked under it the way people keep a photo box they're using,
 * so at rest it reads as a box of photos — a file of prints standing in it,
 * their tops above the rim, one pulled up proud, a clipping and the memos'
 * paper clips showing behind. The "kept" tape moved from the lid (now face
 * down) to the box's front.
 *
 * v3 (chapters and threads). The file has CHAPTERS: three tabbed index
 * dividers of coloured cardstock (2022 sage, 2023 dusty blue, 2024 ochre, tabs
 * left / centre / right) stand in it, a little taller than the prints, so
 * their tabs rise above everything and read from the room as structure. A
 * lined index card stands at the front ("things I kept · start at the front")
 * and another at the back (the end card, which hands you over to the monitor's
 * "now"). Dividers never leave the box: the one you're on is pulled up proud,
 * and stepping past it flicks it forward onto the box's front rim, the way you
 * go through a card file. Cards come up into your hand and are set aside on the
 * desk; the pile in front of the box still only collects the keepsakes.
 */

export const OBJECT_ID = 'photo-box';
export const BOX_POSITION = Object.freeze([2.26, 0, -0.715]);
export const BOX_YAW = -0.08;

/** The body: 26.9 × 10.6 × 11.3 cm outside, 2.5 mm board. It stands in its upturned lid. */
export const BODY = Object.freeze({ w: 0.86, h: 0.34, d: 0.36, wall: 0.008 });
/**
 * The lid, upturned under the body: its plate on the desk, a 2.3 cm rim round
 * the body's foot with 0.5 mm clear all round (the lid is the bigger of the
 * two, as a lid is: closed, it slides down over the body).
 */
export const LID = Object.freeze({ w: 0.878, h: 0.075, d: 0.378, wall: 0.008 });
/** The body stands on the lid's plate. */
export const BODY_Y = LID.wall;
/** The body's rim (top edge), and the floor the file stands on. */
export const RIM_Y = BODY_Y + BODY.h;
export const FLOOR_Y = BODY_Y + BODY.wall;
export const OUTER = Object.freeze([LID.w, RIM_Y, LID.d]);
/** Inside faces of the body's walls, box-local. */
export const INNER = Object.freeze({ x: BODY.w / 2 - BODY.wall, z: BODY.d / 2 - BODY.wall });

/**
 * The "kept" masking-tape strip, on the body's front face (box-local): right
 * of centre, where the held print (which the hand holds LEFT of the box) never
 * covers it, and clear of the lid's rim below.
 */
export const LABEL = Object.freeze({ w: mm(112), h: mm(30), x: 0.09, y: 0.222, spin: 0.028 });

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/** Print borders, mm: thin on three sides, deeper at the bottom for the handwritten line. */
export const PRINT_BORDER = Object.freeze({ side: 3, top: 3, bottomPortrait: 26, bottomLandscape: 24 });

export const PRINT_MM = Object.freeze({
    portrait: [101.6 + 2 * PRINT_BORDER.side, 152.4 + PRINT_BORDER.top + PRINT_BORDER.bottomPortrait],
    landscape: [152.4 + 2 * PRINT_BORDER.side, 101.6 + PRINT_BORDER.top + PRINT_BORDER.bottomLandscape]
});

/**
 * An index divider, mm: 118 wide (a 4×6 print is 107.6) and 190 tall in the
 * body (the print is 181.4), with a 1/3-cut tab 38 × 15 on top — so standing
 * in the file its tab rises ≈ 2.4 cm above the prints. `inset` keeps the
 * outer tabs off the corners; `radius` rounds the tab's top corners.
 */
export const DIVIDER_MM = Object.freeze({ w: 118, body: 190, tab: Object.freeze({ w: 38, h: 15, inset: 3, radius: 3 }) });

export const THICKNESS = Object.freeze({ print: 0.003, paper: 0.0015, newsprint: 0.0015, card: 0.0008, divider: 0.0015 });

/** Sheet sizes in mm (the canvases are drawn in these units too). */
export const SHEETS_MM = Object.freeze({
    print: PRINT_MM.portrait,             // 107.6 × 181.4
    printLandscape: PRINT_MM.landscape,   // 158.4 × 128.6
    // ≈ 0.46 × 0.56 rather than the brief's ~0.55 × 0.62 (v1: the largest that
    // could lie beside the box; kept, so every face paints as it did).
    ite: [144, 175],
    memo: [210, 148.4],                   // A4 folded in half: A5 landscape, 0.672 × 0.475
    puralinkClip: [145, 142],
    fluencyClip: [145, 84],
    sticky: [76, 76],                     // 3 in
    memoSticky: [68, 68],
    card: [152.4, 101.6],                 // a 6 × 4 in ruled index card
    divider: [DIVIDER_MM.w, DIVIDER_MM.body + DIVIDER_MM.tab.h]   // 118 × 205, tab included
});

export const toUnits = ([w, h]) => [mm(w), mm(h)];

/** Divider cardstock, per chapter: three quiet colours that sit with the kraft, the mat and the wall. */
export const DIVIDER_STOCK = Object.freeze({
    2022: Object.freeze({ color: '#a4ae8e', name: 'sage' }),
    2023: Object.freeze({ color: '#94a6b6', name: 'dusty blue' }),
    2024: Object.freeze({ color: '#cda965', name: 'ochre' })
});
/** Index-card stock: warm white card, pale blue rules, one red header rule. */
export const CARD_STOCK = Object.freeze({ color: '#f5f2e9', rule: '#9fbad6', header: '#d99590' });

/** Where a divider's tab sits along its top edge (mm, from the divider's left edge to the tab's left edge). */
export function tabLeftMm(position) {
    const { w, tab } = { w: DIVIDER_MM.w, tab: DIVIDER_MM.tab };
    if (position === 'left') return tab.inset;
    if (position === 'right') return w - tab.inset - tab.w;
    return (w - tab.w) / 2;
}

/**
 * The memo arrangements, in the item's frame (units). The memo group holds
 * the memo, its sticky, its red-pen note and the paper clip; the clipping
 * group holds the clipping and its "+N days". `front` is how they come out of
 * the box (clipping clipped behind, peeking out at the right); `turned` has
 * the clipping out in front, the memo pushed back and left — what I wrote on
 * the left, what happened on the right. Both are centred on the origin.
 */
export function memoLayout(id) {
    const [mw, mh] = toUnits(SHEETS_MM.memo);
    const [cw, ch] = toUnits(id === 'puralink' ? SHEETS_MM.puralinkClip : SHEETS_MM.fluencyClip);
    // FRONT: clipping top 0.02 below the memo's top edge (so the clip's back
    // loop can grip it), right edge peeking 0.10 past the memo's.
    const peekRight = 0.10;
    const clipTopBelow = 0.02;
    const memoFront = { x: 0, y: 0 };
    const clipFront = { x: mw / 2 + peekRight - cw / 2, y: mh / 2 - clipTopBelow - ch / 2, spin: -0.035 };
    // Centre the front arrangement's bounds on the origin.
    const fMinX = -mw / 2;
    const fMaxX = clipFront.x + cw / 2;
    const fMinY = Math.min(-mh / 2, clipFront.y - ch / 2);
    const fMaxY = mh / 2;
    const fcx = (fMinX + fMaxX) / 2;
    const fcy = (fMinY + fMaxY) / 2;
    memoFront.x -= fcx; memoFront.y -= fcy;
    clipFront.x -= fcx; clipFront.y -= fcy;

    // TURNED: side by side, overlapping ~7 cm of desk-width.
    const overlap = 0.075;
    const total = mw + cw - overlap;
    const memoTurned = { x: -total / 2 + mw / 2, y: -0.02 };
    const clipTurned = { x: total / 2 - cw / 2, y: 0.015, spin: 0.022 };

    // Where the clipping has to get to before it can come round in front
    // (fully clear of the memo on the right — and of a badge clipped to its
    // top right corner, which hangs past its edge: BADGES).
    const badge = BADGES[id] ? badgeReachOnMemo(id) : 0;
    const clearX = memoFront.x + mw / 2 + cw / 2 + 0.03 + (badge > 0 ? badge + 0.02 : 0);

    // PILE: put down, the clipping is squared up fully behind the memo, so a
    // memo on the desk is one tidy sheet.
    const memoPile = { x: 0, y: 0 };
    const clipPile = { x: mw / 2 - cw / 2 - 0.012, y: mh / 2 - clipTopBelow - ch / 2, spin: -0.008 };

    // TURNED, TALL (portrait screens, where side by side would have to be
    // held so far off it can't be read): the clipping out in front, BELOW the
    // memo, overlapping only its folded foot (clear of the red pen and the
    // sticky's words).
    const tallOverlap = 0.03;
    const tallTotal = mh + ch - tallOverlap;
    const memoTall = { x: -0.02, y: tallTotal / 2 - mh / 2 };
    const clipTall = { x: 0.035, y: -tallTotal / 2 + ch / 2, spin: 0.018 };

    const frontBounds = { w: fMaxX - fMinX, h: fMaxY - fMinY };
    const turnedBounds = {
        w: total,
        h: Math.max(mh / 2 + Math.abs(memoTurned.y), ch / 2 + Math.abs(clipTurned.y)) * 2
    };
    const tallBounds = {
        w: Math.max(mw / 2 + Math.abs(memoTall.x), cw / 2 + Math.abs(clipTall.x)) * 2,
        h: tallTotal
    };
    return {
        memo: { w: mw, h: mh },
        clipping: { w: cw, h: ch },
        front: { memo: memoFront, clipping: clipFront },
        turned: { memo: memoTurned, clipping: clipTurned },
        turnedTall: { memo: memoTall, clipping: clipTall },
        pile: { memo: memoPile, clipping: clipPile },
        clearX,
        z: {
            memo: 0,
            clippingBehind: -0.0022,
            memoBack: -0.006,
            // In front of the memo — and of its badge, where there is one (it lies on the memo's top right,
            // under where the clipping comes to rest): held a few millimetres proud of it.
            clippingFront: BADGES[id] ? -0.006 + THICKNESS.paper / 2 + BADGE_AIR + BADGE_DIMS.depth + 0.0035 : 0.0022
        },
        // Paper clip on the memo's top edge, memo-local x.
        clipX: mw / 2 - 0.13,
        frontBounds,
        turnedBounds,
        tallBounds
    };
}

// ---------------------------------------------------------------------------
// Badges: each job's badge, clipped to what it kept
// ---------------------------------------------------------------------------

/**
 * The past badges (v4). Each job's ID badge — built by src/content/lanyard.js
 * from its src/content/works/work.js entry, as the badge on the lamp is
 * (badge/model.js buildBadge) — is clipped with a small black binder clip to
 * the keepsake from that job, over a TOP corner (so the handwritten line
 * along a print's bottom border is never covered): the Amazon, Apple-intern
 * and Deloitte prints, the ITE clipping (Inspire Tomorrow) and the Pura Link
 * memo (NextGen). It lifts, turns and goes to the pile with its item.
 *
 * The badge hangs off the corner (`side`), overlapping the sheet by `overlap`
 * — the width of the clip's bite — so the photo, the headline and the memo's
 * type stay clear; `spin` tips it a little in its plane about the clip. Prints
 * and the clipping take it on the LEFT: in the file the right is where the
 * ITE clipping stands against the wall, and on the pile the prints are dealt
 * left to right, each over the last one's right side (a badge on the left lies
 * over the sheets already down, never under the next). The memo takes it on
 * the RIGHT: the box has only 1 cm spare to the memo's left, 4.5 cm to its right.
 *
 * Thickness: lanyard.js's card is a 2.5 mm stand-in for a 0.76 mm CR80; in the
 * file every millimetre in front of a sheet pushes everything in front of it
 * forward (and the dividers flick steeper), so the box's badges are built at
 * half the lanyard's thickness (BADGE_THIN): ≈ 1.9 mm of holder and card.
 */
export const BADGE_THIN = 0.5;
export const BADGE_DIMS = badgeDims(BADGE_THIN);
/** Air between a sheet's face and the badge lying on it. */
export const BADGE_AIR = 0.0003;
/** The binder clip: 11 mm wide, a 6 mm bite, 0.4 mm steel jaws, 0.5 mm wire handles. */
export const BINDER = Object.freeze({ width: 0.034, depth: mm(6), jaw: mm(0.4), wire: mm(0.5) });
/** Which work.js export each badge comes from, and where it is clipped. */
export const BADGES = Object.freeze({
    amazon: Object.freeze({ work: 'amazon', side: 'left', overlap: 0.03, spin: -0.035 }),
    // `lift`: stands this much off its print (≈ 1 mm) — on the pile its badge lies over Amazon's.
    'apple-intern': Object.freeze({ work: 'appleIntern', side: 'left', overlap: 0.03, spin: -0.02, lift: 0.0032 }),
    deloitte: Object.freeze({ work: 'deloitte', side: 'left', overlap: 0.03, spin: -0.03 }),
    ite: Object.freeze({ work: 'inspireTomorrow', side: 'left', overlap: 0.026, spin: -0.025 }),
    puralink: Object.freeze({ work: 'nextGen', side: 'right', overlap: 0.092, spin: 0.03 })
});

/** The sheet a badge is clipped to: its size and thickness (the memo: the memo sheet, in the memo group). */
function badgeSheet(id) {
    if (id === 'puralink' || id === 'fluency') return { size: toUnits(SHEETS_MM.memo), t: THICKNESS.paper };
    if (id === 'ite') return { size: toUnits(SHEETS_MM.ite), t: THICKNESS.newsprint };
    return { size: toUnits(SHEETS_MM.print), t: THICKNESS.print };
}

/**
 * Where item `id`'s badge and clip sit, in the frame of the sheet they're on
 * (the print / clipping itself, or the memo within its memo group): the clip's
 * pivot on the sheet's top edge ({x, y}, the badge and clip turn `spin` about
 * it), the badge's origin (its clip tip) relative to that pivot, the badge's
 * back face z, and the binder clip's jaws. Null if the item has none.
 */
export function badgePlacement(id) {
    const spec = BADGES[id];
    if (!spec) return null;
    const { size: [W, H], t } = badgeSheet(id);
    const left = spec.side === 'left';
    const bw = BADGE_DIMS.width;
    const pivot = { x: left ? -W / 2 + spec.overlap / 2 : W / 2 - spec.overlap / 2, y: H / 2 };
    // The badge's slot end 1 mm under the sheet's top edge, its near edge `overlap` in from the sheet's side.
    const badge = { x: left ? spec.overlap / 2 - bw / 2 : bw / 2 - spec.overlap / 2, y: -mm(1) - BADGE_DIMS.slotTop };
    const z = t / 2 + BADGE_AIR + (spec.lift ?? 0);
    const clip = {
        width: BINDER.width, depth: BINDER.depth, jaw: BINDER.jaw, wire: BINDER.wire,
        // Inner faces of the jaws: on the slot's tab in front, on the sheet's back behind.
        front: z + BADGE_DIMS.sleeve, back: -t / 2
    };
    return { ...spec, pivot, badge, z, spin: spec.spin, clip, sheet: { w: W, h: H, t } };
}

/** The badge's sleeve corners and clip tip in the sheet's frame (x, y) — for reach, framing and the pile. */
export function badgeCorners(id) {
    const p = badgePlacement(id);
    if (!p) return [];
    const w = BADGE_DIMS.width / 2;
    const c = Math.cos(p.spin);
    const s = Math.sin(p.spin);
    return [[-w, BADGE_DIMS.slotTop], [w, BADGE_DIMS.slotTop], [w, BADGE_DIMS.bottom], [-w, BADGE_DIMS.bottom], [0, 0]].map(([x, y]) => {
        const bx = x + p.badge.x;
        const by = y + p.badge.y;
        return [p.pivot.x + bx * c - by * s, p.pivot.y + bx * s + by * c];
    });
}

/** How far a badged memo's badge reaches past the memo's right edge (memo frame). */
function badgeReachOnMemo(id) {
    const [mw] = toUnits(SHEETS_MM.memo);
    return Math.max(0, ...badgeCorners(id).map(([x]) => x - mw / 2));
}

/** How far out of a sheet's outline the item's badge reaches, [left, right, up] (units, front view). */
export function badgeReach(id) {
    const p = badgePlacement(id);
    if (!p) return [0, 0, 0];
    const { w, h } = p.sheet;
    const xs = badgeCorners(id).map(([x]) => x);
    const ys = badgeCorners(id).map(([, y]) => y);
    return [Math.max(0, -w / 2 - Math.min(...xs)), Math.max(0, Math.max(...xs) - w / 2), Math.max(0, Math.max(...ys) - h / 2)];
}

/** How far the badge and clip stand in front of / behind the sheet's mid-plane (for the file). */
function badgeExtents(id) {
    const p = badgePlacement(id);
    if (!p) return { front: 0, back: 0 };
    const front = Math.max(p.z + BADGE_DIMS.depth, p.clip.front + p.clip.jaw + 2 * p.clip.wire) + 0.0003;
    const back = -p.clip.back + p.clip.jaw + 0.0002;
    return { front, back };
}

/**
 * Everything in the file, front to back. `size` is the item's front-state
 * bounds in units, which is what the in-hand pose and the slot are solved
 * from. Kinds:
 *   card     — a ruled index card (the opening card, the end card): lifted to
 *              your hand, then set aside on the desk (ASIDE), never on the pile
 *   divider  — a chapter divider: stays in the box (flush / proud / flicked)
 *   print · clipping · memo — the keepsakes: lifted, turned, left on the pile
 */
export const ITEMS = Object.freeze([
    { id: 'intro', kind: 'card' },
    { id: 'ch-2022', kind: 'divider', year: '2022', tab: 'left' },
    { id: 'amazon', kind: 'print', media: 'amazon_first_day', orientation: 'portrait', focus: { x: 0.5, y: 0 } },
    { id: 'ch-2023', kind: 'divider', year: '2023', tab: 'centre' },
    { id: 'apple-intern', kind: 'print', media: 'apple_intern_project', orientation: 'portrait', focus: { x: 0.5, y: 0.5 } },
    { id: 'trophy', kind: 'print', media: 'safety_culture_hackathon', orientation: 'portrait', focus: { x: 0.5, y: 0.4 } },
    { id: 'deloitte', kind: 'print', media: 'deloitte_office', orientation: 'portrait', focus: { x: 0.5, y: 0.5 } },
    { id: 'ch-2024', kind: 'divider', year: '2024', tab: 'right' },
    { id: 'stanford', kind: 'print', media: 'stanford', orientation: 'landscape', focus: { x: 0.25, y: 0.5 } },
    { id: 'ite', kind: 'clipping', media: 'ite_forbes_cover' },
    { id: 'puralink', kind: 'memo', media: 'memo_puralink', clippingMedia: 'puralink_article_team' },
    { id: 'fluency', kind: 'memo', media: 'memo_fluency' },
    { id: 'end', kind: 'card' }
].map((item) => Object.freeze({ ...item, size: itemSize(item) })));

export const ITEM_IDS = ITEMS.map((item) => item.id);
export const itemById = (id) => ITEMS.find((item) => item.id === id) ?? null;
export const indexOf = (id) => ITEM_IDS.indexOf(id);
/** Keepsakes go on the pile; cards go aside; dividers never leave the box. */
export const isKeepsake = (item) => item?.kind === 'print' || item?.kind === 'clipping' || item?.kind === 'memo';
export const isCard = (item) => item?.kind === 'card';
export const isDivider = (item) => item?.kind === 'divider';
export const KEEPSAKE_IDS = Object.freeze(ITEMS.filter(isKeepsake).map((item) => item.id));
export const DIVIDER_IDS = Object.freeze(ITEMS.filter(isDivider).map((item) => item.id));
/** The first five prints: what #box/trail and #desk/after leave on the desk. */
export const TRAIL_IDS = Object.freeze(['amazon', 'apple-intern', 'trophy', 'deloitte', 'stanford']);

function itemSize(item) {
    if (item.kind === 'print') return toUnits(item.orientation === 'landscape' ? SHEETS_MM.printLandscape : SHEETS_MM.print);
    if (item.kind === 'clipping') return toUnits(SHEETS_MM.ite);
    if (item.kind === 'card') return toUnits(SHEETS_MM.card);
    if (item.kind === 'divider') return toUnits(SHEETS_MM.divider);
    const layout = memoLayout(item.id);
    return [layout.frontBounds.w, layout.frontBounds.h];
}

/**
 * What the in-hand pose must keep in frame: the item at its widest, and its
 * badge — out to one side from the front, the other once turned over — and
 * its clip's tip over the top. Symmetric, so the hand's side offset clamps
 * the same way either side up. (Landscape keeps its pose: the side clamp only
 * binds on a phone, where the badge makes a print sit a little further off.)
 */
export function handExtent(item, { tall = false } = {}) {
    const [w, h] = itemMaxSize(item, { tall });
    const [left, right, up] = badgeReach(item.id);
    // A memo's badge lies within where its clipping peeks out (checked); prints and the clipping swap sides turning over.
    const side = item.kind === 'memo' ? Math.max(0, right - 0.1) : Math.max(left, right);
    return [w + 2 * side, h + 2 * up];
}

/**
 * The widest an item gets in either state — the in-hand distance is solved
 * from this so turning never re-frames. `tall`: a portrait screen, where a
 * turned memo stacks its clipping below rather than beside it.
 */
export function itemMaxSize(item, { tall = false } = {}) {
    if (item.kind !== 'memo') return item.size;
    const layout = memoLayout(item.id);
    const turned = tall ? layout.tallBounds : layout.turnedBounds;
    return [Math.max(layout.frontBounds.w, turned.w), Math.max(layout.frontBounds.h, turned.h)];
}

// ---------------------------------------------------------------------------
// Handwriting: every writing area in the box, mm on its own face
// ---------------------------------------------------------------------------

/**
 * The rect each handwritten note is written into, in mm of the face it's on
 * (the canvases are drawn in mm, from the face's top-left). faces.js writes
 * into exactly these, typing each note in Shae Hand fitted to its rect.
 */
export const NOTE_RECTS = Object.freeze({
    /** A print's front line, in the deep bottom border. */
    printLine(orientation) {
        const [W, H] = orientation === 'landscape' ? SHEETS_MM.printLandscape : SHEETS_MM.print;
        const pw = orientation === 'landscape' ? 152.4 : 101.6;
        const ph = orientation === 'landscape' ? 101.6 : 152.4;
        const px = (W - pw) / 2;
        const top = PRINT_BORDER.top + ph + 1.8;
        return { x: px + 2.2, y: top, w: pw - 4.4, h: H - top - 2.2 };
    },
    printMargin: (orientation) => (orientation === 'landscape' ? 10 : 8.5),
    /** The back's note, top-aligned; with a thread the note keeps the top 84 mm and the thread goes below it. */
    printBack(orientation, { thread = false } = {}) {
        const [W, H] = orientation === 'landscape' ? SHEETS_MM.printLandscape : SHEETS_MM.print;
        const m = NOTE_RECTS.printMargin(orientation);
        const full = H - 11 - 25;
        return { x: m, y: 11, w: W - m * 2, h: thread ? THREAD_BACK_H : full };
    },
    /** The thread line under the back's note: the sentence, then an arrow to where it goes. */
    printThread(orientation) {
        const [W] = orientation === 'landscape' ? SHEETS_MM.printLandscape : SHEETS_MM.print;
        const m = NOTE_RECTS.printMargin(orientation);
        return { x: m, y: 11 + THREAD_BACK_H + 4, w: W - m * 2, h: 40 };
    },
    /** v4: the thread on the ITE clipping's back (144 × 175 mm): upper middle, inside the mirrored cut and clear of the clip's back jaw. */
    iteThread: Object.freeze({ x: 16, y: 22, w: 112, h: 52 }),
    /** The date, small, bottom right of the back. */
    printDate(orientation) {
        const [W, H] = orientation === 'landscape' ? SHEETS_MM.printLandscape : SHEETS_MM.print;
        const m = NOTE_RECTS.printMargin(orientation);
        return { x: W * 0.35, y: H - 19, w: W * 0.65 - m, h: 12 };
    },
    /** A sticky's note (76 mm ITE sticky, 68 mm memo sticky). */
    sticky([W, H]) { return { x: 6.5, y: 7.5, w: W - 12, h: H - 14 }; },
    /** The red-pen date on a memo's lower left (A5 memo, mm): the writing and its underline. */
    memoRed: Object.freeze({ x: 19, y: 107, w: 54, h: 18 }),
    /** "+311 days" / "+426 days": the red-pen decal beside the clipping's date. */
    redGap: Object.freeze({ w: 46, h: 13 }),
    /** The "kept" tape on the box's front. */
    label: Object.freeze({ x: 8, y: 3, w: 96, h: 24 }),
    /** A divider's tab label (the year), in the tab. */
    tab(position) { return { x: tabLeftMm(position) + 3, y: 2, w: DIVIDER_MM.tab.w - 6, h: DIVIDER_MM.tab.h - 3 }; },
    /** A divider's chapter line: the top of its body, above the box's rim even standing flush. */
    chapter: Object.freeze({ x: 8, y: DIVIDER_MM.tab.h + 8, w: DIVIDER_MM.w - 16, h: 46 }),
    /** The opening card: its top half, so the first line shows over the box's rim at rest. */
    intro: Object.freeze({ x: 10, y: 6, w: 132, h: 48 }),
    /** The end card: the question, the drawn arrow and "now" — one note, arrow and all. */
    end: Object.freeze({ x: 10, y: 6, w: 132, h: 88 })
});
/** How much of a print's back its note keeps when a thread line goes under it (mm). */
export const THREAD_BACK_H = 84;

// ---------------------------------------------------------------------------
// In the box: a file of standing sheets, the first at the front
// ---------------------------------------------------------------------------

/** A sticky note's curl (it lifts off its sheet below the adhesive), world units. */
export const STICKY_CURL = mm(2.4);

/**
 * The file. Everything stands upright on its bottom edge, faces to the room,
 * leaning back LEAN (6.9°) — the rearmost sheet on the back wall's top edge,
 * each one in front on the one behind — so every sheet is parallel to its
 * neighbours and a sheet lifts straight out along its own plane without
 * touching them. Behind the things you can pick up stand FILLERS: plain
 * backs of other prints (no content, so no facts), so the box reads as a box
 * of photos rather than a box with eight things in it.
 *
 * The Amazon print stands PROUD, pulled up 2.7 cm as if someone had started to
 * take it out, its photo rising above the 2022 divider in front of it; the
 * opening card at the very front is pulled up 3.1 cm, so its first line shows
 * over the rim. Stood upright a 4×6 print is 18.1 cm with its border, so its
 * top 7.7 cm stand above the 10.6 cm rim; a divider's tab tops out 2.4 cm
 * higher still.
 */
export const FILE = Object.freeze({
    lean: 0.12,
    gap: 0.0037,
    proud: 0.085,
    introProud: 0.1,
    /** The divider you're on is pulled up this far (2.8 cm), so its line clears everything in front. */
    dividerProud: 0.09,
    // Two (was five), and 0.5 mm less air between sheets: the badges' depth in the file is paid for at its back, so the sheets in
    // front — and the dividers' flicked angles — stay where they were (checked in node).
    fillers: 2
});

/** Where each thing stands across the box (box-local x) and how it's turned in its plane (roll). */
const FILE_PLACES = Object.freeze({
    intro: { x: -0.03, roll: 0.008 },
    'ch-2022': { x: 0.004, roll: -0.003 },
    amazon: { x: -0.035, roll: 0.012 },
    'ch-2023': { x: 0.008, roll: 0.002 },
    'apple-intern': { x: 0.04, roll: -0.011 },
    trophy: { x: -0.07, roll: 0.007 },
    deloitte: { x: 0.015, roll: -0.015 },
    'ch-2024': { x: -0.002, roll: -0.002 },
    stanford: { x: -0.06, roll: 0.01 },
    ite: { x: 0.175, roll: -0.008 },
    puralink: { x: -0.004, roll: 0.006 },
    fluency: { x: 0.012, roll: -0.005 },
    end: { x: 0.03, roll: -0.009 }
});
const FILLER_PLACES = Object.freeze([
    { x: -0.02, roll: 0.009 }, { x: 0.06, roll: -0.012 }, { x: -0.09, roll: 0.004 }, { x: 0.03, roll: -0.006 }, { x: -0.05, roll: 0.013 }
]);
/** A filler is the back of a 4×6 print. */
export const FILLER_SIZE = Object.freeze(toUnits(SHEETS_MM.print));

/**
 * How far each standing thing reaches behind / in front of its own mid-plane:
 * a print is its thickness; the clipping and the Pura Link memo carry a curled
 * sticky in front; the memos carry the paper clip's loops both sides.
 */
function stackExtents(item) {
    const own = sheetExtents(item);
    const badge = badgeExtents(item?.id);
    return { back: Math.max(own.back, badge.back), front: Math.max(own.front, badge.front) };
}

function sheetExtents(item) {
    const sticky = THICKNESS.paper / 2 + 0.0004 + STICKY_CURL;
    const clipFront = THICKNESS.paper / 2 + mm(0.45) * 2 + 0.0001;
    const clipBack = 0.0022 + THICKNESS.paper / 2 + mm(0.45) * 2 + 0.0001;
    if (!item || item.kind === 'print') return { back: THICKNESS.print / 2, front: THICKNESS.print / 2 };
    if (item.kind === 'card') return { back: THICKNESS.card / 2, front: THICKNESS.card / 2 };
    if (item.kind === 'divider') return { back: THICKNESS.divider / 2, front: THICKNESS.divider / 2 };
    if (item.kind === 'clipping') return { back: THICKNESS.newsprint / 2, front: sticky };
    return { back: clipBack, front: item.id === 'puralink' ? sticky : clipFront };
}

/** The file's orientation (box-local): leaning back about x. Its normal points up-and-forward. */
const LEAN_Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -FILE.lean);
export const FILE_NORMAL = Object.freeze(new THREE.Vector3(0, 0, 1).applyQuaternion(LEAN_Q));
export const FILE_UP = Object.freeze(new THREE.Vector3(0, 1, 0).applyQuaternion(LEAN_Q));

/**
 * Every standing sheet, back to front, with its mid-plane offset `s` along
 * FILE_NORMAL (n · p = s). Solved once: the rearmost filler's back face on
 * the back wall's top inner edge, then each sheet in front by what the pair
 * reach plus a hand-filed gap.
 */
const STACK = (() => {
    const r = rng('box-file');
    const sheets = [];
    for (let k = FILE.fillers - 1; k >= 0; k -= 1) sheets.push({ filler: k, item: null });
    for (let i = ITEMS.length - 1; i >= 0; i -= 1) sheets.push({ filler: -1, item: ITEMS[i], index: i });
    const edge = new THREE.Vector3(0, RIM_Y, -INNER.z);
    let s = FILE_NORMAL.dot(edge) + stackExtents(sheets[0].item).back + 0.0006;
    sheets[0].s = s;
    for (let k = 1; k < sheets.length; k += 1) {
        s += stackExtents(sheets[k - 1].item).front + stackExtents(sheets[k].item).back + FILE.gap + r.range(-0.0012, 0.0012);
        sheets[k].s = s;
    }
    return sheets;
})();

/** Box-local pose of a sheet of size [w, h] standing in the file on the plane n·p = s, bottom edge on the floor (+ lift). */
function standingPose(s, [w, h], { x, roll }, lift = 0) {
    const q = LEAN_Q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
    // Centre on the plane at (x, y): n.y·y + n.z·z = s.
    const yCentre = FLOOR_Y + (h / 2) * Math.cos(FILE.lean);
    const position = new THREE.Vector3(x, yCentre, (s - FILE_NORMAL.y * yCentre) / FILE_NORMAL.z);
    // The roll tips one bottom corner under the floor: slide up the plane until the lowest corner sits on it.
    let minY = Infinity;
    for (const cx of [-w / 2, w / 2]) for (const cy of [-h / 2, h / 2]) for (const cz of [-0.0016, 0.0016]) {
        minY = Math.min(minY, new THREE.Vector3(cx, cy, cz).applyQuaternion(q).y + position.y);
    }
    position.addScaledVector(FILE_UP, (FLOOR_Y + 0.0004 - minY) / FILE_UP.y + lift);
    return { position, quaternion: q, standing: true };
}

const sheetOf = (index) => STACK.find((entry) => entry.item === ITEMS[index]);

/** How far item `index` stands pulled up in its slot at rest. */
function restLift(item) {
    if (item.id === 'amazon') return FILE.proud;
    if (item.id === 'intro') return FILE.introProud;
    return 0;
}

/** Box-local pose of item `index` in the file (a divider: flush). */
export function slotPose(index) {
    const item = ITEMS[index];
    return standingPose(sheetOf(index).s, item.size, FILE_PLACES[item.id], restLift(item));
}

/** Box-local pose of filler `k` (0 = nearest the items). */
export function fillerPose(k) {
    const sheet = STACK.find((entry) => entry.filler === k);
    return standingPose(sheet.s, FILLER_SIZE, FILLER_PLACES[k % FILLER_PLACES.length]);
}

// --- dividers: flush, proud, flicked ------------------------------------------

/**
 * A divider's three poses, box-local:
 *   flush   standing in the file with the rest (leaning back 6.9°)
 *   proud   the one you're on: pulled up DIVIDER_PROUD along its plane, its
 *           chapter line clear of whatever is flicked forward in front of it
 *   flicked stepped past: tipped forward on its bottom edge until it rests —
 *           on the box's front rim (the first one), or on the tab of the one
 *           flicked before it — the way the cards you've been through lie in
 *           a card file. Dividers are flicked strictly front to back (all
 *           those before where you are), so each one's rest is solved once.
 */
export function dividerPose(index, state = 'flush') {
    if (state === 'flicked') return flickedPose(index);
    const item = ITEMS[index];
    return standingPose(sheetOf(index).s, item.size, FILE_PLACES[item.id], state === 'proud' ? FILE.dividerProud : 0);
}

/** The flicked (tipped-forward) rest of every divider, front to back, solved against the rim and each other. */
const FLICKED = (() => {
    const out = new Map();
    const t = THICKNESS.divider;
    const [, H] = toUnits(SHEETS_MM.divider);
    const floor = FLOOR_Y + 0.0004;
    let previousTop = null; // the back of the previous flicked divider's tab top, box-local {y, z}
    for (const [index, item] of ITEMS.entries()) {
        if (!isDivider(item)) continue;
        const flush = dividerPose(index, 'flush');
        // Pivot: the bottom edge, on the floor where it stands.
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(flush.quaternion);
        const bottom = flush.position.clone().addScaledVector(up, -H / 2);
        const zb = bottom.z;
        // The angle (forward of vertical) at which its front face first touches (y, z): A cos θ − C sin θ = t/2.
        const touch = ({ y, z }) => {
            const A = z - zb;
            const C = y - floor;
            return Math.atan2(A, C) - Math.asin(Math.min(1, (t / 2 + 0.0004) / Math.hypot(A, C)));
        };
        let theta = touch({ y: RIM_Y, z: INNER.z });
        if (previousTop) theta = Math.min(theta, touch(previousTop));
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), theta);
        const along = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
        const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
        const pivot = new THREE.Vector3(flush.position.x, floor, zb);
        const position = pivot.clone().addScaledVector(along, H / 2);
        out.set(index, { position, quaternion: q, theta, standing: false });
        const top = pivot.clone().addScaledVector(along, H).addScaledVector(normal, -t / 2);
        previousTop = { y: top.y, z: top.z };
    }
    return out;
})();

function flickedPose(index) {
    const pose = FLICKED.get(index);
    return { position: pose.position.clone(), quaternion: pose.quaternion.clone(), theta: pose.theta, standing: false };
}

/** Degrees forward of vertical at which each divider comes to rest when flicked (for the checks). */
export function flickAngles() {
    return Object.fromEntries([...FLICKED.entries()].map(([index, pose]) => [ITEMS[index].id, +(pose.theta * 180 / Math.PI).toFixed(1)]));
}

// ---------------------------------------------------------------------------
// The "seen" pile: face up on the desk, in front of the box
// ---------------------------------------------------------------------------

/** FACE_UP (-π/2 about X) then a yaw: front → +Y, top → away from the room. */
export function faceUpQuaternion(yaw) {
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
        .premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
}

/**
 * Where each keepsake lands (world x, z, yaw): a loose spread on the desk in
 * front of the box, between it and the paper stack, the first ones nearest
 * the box — the tops of the prints toward the box, so they read right way up
 * from the room. Checked in node (SAT) against the box, the paper stack, the
 * display and the desk's edge.
 */
const PILE_BASE = {
    // The prints: a loose fan on the desk to the left of the box, dealt left
    // to right, the way you'd lay down photos you've looked at...
    amazon: { x: 1.36, z: -0.24, yaw: 0.44 },
    'apple-intern': { x: 1.52, z: -0.23, yaw: 0.30 },
    trophy: { x: 1.68, z: -0.22, yaw: 0.18 },
    deloitte: { x: 1.84, z: -0.21, yaw: 0.06 },
    stanford: { x: 1.62, z: -0.06, yaw: 0.24 },         // the landscape print, across the front of the fan
    // ...and the paper: the clipping across the front of the fan, the memos
    // squared up on each other in front of the box — clear (in plan, 1 cm+) of
    // the dividers flicked over its front wall, which a put-down comes
    // straight down past (layout.js putCurve).
    ite: { x: 1.78, z: -0.1, yaw: 0.4 },          // the clipping, laid across the front of the fan
    // (v4: 4 cm nearer the room and turned 3.4° less than v3, so its badge — clipped to its top right
    // corner, toward the box — comes down clear of the dividers flicked over the front wall.)
    puralink: { x: 2.17, z: -0.038, yaw: 0.18 },
    // (v4: 0.16 left of where v3 had it, squared up on the Pura Link memo's left part, clear of its badge.)
    fluency: { x: 2.05, z: -0.032, yaw: 0.22 }
};

export function pilePose(id) {
    const base = PILE_BASE[id];
    // Prints get a few mm and a degree of seeded jitter; the clipping and the
    // memos go exactly where they were placed.
    const jitter = itemById(id).kind === 'print' ? 1 : 0;
    const r = rng(`box-pile:${id}`);
    return {
        x: base.x + jitter * r.signed(0.002),
        z: base.z + jitter * r.signed(0.002),
        yaw: base.yaw + jitter * r.signed(0.008)
    };
}

/** The sheets an item presents to the desk on the pile, item-frame rects {cx, cy, w, h, spin} — for the checks. */
export function pileRects(id) {
    const item = itemById(id);
    if (item.kind !== 'memo') return [{ cx: 0, cy: 0, w: item.size[0], h: item.size[1], spin: 0 }];
    const m = memoLayout(id);
    return [
        { cx: m.pile.memo.x, cy: m.pile.memo.y, w: m.memo.w, h: m.memo.h, spin: 0 },
        { cx: m.pile.clipping.x, cy: m.pile.clipping.y, w: m.clipping.w, h: m.clipping.h, spin: m.pile.clipping.spin }
    ];
}

/**
 * v4: the badge of an item lying on the pile, as a world xz polygon (null if it
 * has none) — the pile is face up, so the badge lies on top of its sheet.
 * (A memo lies in its pile arrangement, the memo at the item's origin.)
 */
export function pileBadgeFootprint(id) {
    const corners = badgeCorners(id).slice(0, 4);
    if (!corners.length) return null;
    const p = pilePose(id);
    const c = Math.cos(p.yaw);
    const s = Math.sin(p.yaw);
    return corners.map(([lx, ly]) => [p.x + lx * c - ly * s, p.z - lx * s - ly * c]);
}
/**
 * From the underside of an item's pile layer (pileWorldPose's layerY) to the
 * underside of its badge: the badge must clear whatever lies under IT too.
 */
export function pileBadgeBase(id) {
    const p = badgePlacement(id);
    if (!p) return 0;
    const item = itemById(id);
    // The sheet's centre above layerY (pileWorldPose's `under`), then the badge's back face above the sheet's centre.
    const under = item.kind === 'memo' ? 0.0022 + THICKNESS.paper / 2 + 0.0035 : p.sheet.t / 2;
    return under + p.z;
}
/** How far a badge on the pile stands above its sheet's top (holder and card, not the clip's hardware). */
export const PILE_BADGE_HEIGHT = BADGE_AIR + BADGE_DIMS.face;

/** Each layer of the pile sits this far above the one below (item + clip + air). */
export function pileLayerHeight(item) {
    if (item.kind === 'memo') return THICKNESS.paper * 2 + 0.0034 + 0.0006; // memo + clipping + the clip's wire
    if (item.kind === 'clipping') return THICKNESS.newsprint + STICKY_CURL + 0.0008; // its sticky curls up off it
    if (item.kind === 'card') return THICKNESS.card + 0.0006;
    return THICKNESS.print + 0.0006;
}

/** The world pose for an item that is layer `layerY` high on the pile (y of its underside). */
export function pileWorldPose(id, layerY) {
    const item = itemById(id);
    const p = isCard(item) ? asidePose(id) : pilePose(id);
    // An item's own frame has its sheets centred in z; memos carry the clipping
    // behind (-z) — face up, "behind" is below, so lift by that much.
    const under = item.kind === 'memo'
        ? 0.0022 + THICKNESS.paper / 2 + 0.0035
        : (item.kind === 'print' ? THICKNESS.print : item.kind === 'card' ? THICKNESS.card : THICKNESS.paper) / 2;
    return {
        position: new THREE.Vector3(p.x, layerY + under, p.z),
        quaternion: faceUpQuaternion(p.yaw)
    };
}

/**
 * Set aside: where the opening card goes once read — face up on the desk in
 * front of the box, where the prints will be dealt onto it (so the first
 * states' lower third isn't bare desk). Not part of the trail — nothing
 * about it is logged — but it stacks with the pile (index.js pileHeightFor).
 * (The end card goes back into its slot.)
 */
const ASIDE_BASE = {
    intro: { x: 1.56, z: -0.12, yaw: 0.3 }
};
export function asidePose(id) {
    return { ...ASIDE_BASE[id] };
}
/** The aside spot's footprint (world xz polygon) — for the checks. */
export function asideRects(id) {
    const [w, h] = toUnits(SHEETS_MM.card);
    return [{ cx: 0, cy: 0, w, h, spin: 0, id }];
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;

/**
 * THE SHOT, and why it is this tight. The right end of this desk is a 2-unit
 * strip between the display's edge (x 1.0) and the desk's edge (x 3.0), and
 * from anywhere far enough back to hold a print at a comfortable size, either
 * the monitor comes in on the left or the frame's lower right looks down past
 * the desk's edge (v1 had both). So the box shot has its own, longer lens —
 * ZOOM on the camera (not its fov, which other modules read) — and stands at
 * the front right of the box looking back and a little left over it.
 *
 * v3 (from the v2 screenshots): 36° → 29.8° vertical at 16:10, the camera up
 * and back (elevation 30° → 36.6°, 1.94 → 2.08 away, azimuth 0.28 → 0.22), the
 * print held nearer the middle (HAND_RIGHT_NDC −0.30 → −0.18) and a touch
 * higher. Searched in node (≈ 2 M stances, the real layout, the room as
 * measured) for: no display and no floor or wall past the desk's edge at
 * 16:10, 3:2 and 16:9; the box, the file and a proud divider's tab in frame;
 * every held thing in frame, 2 cm or more clear of the box and the desk; and
 * then the least Tron ring. Measured on the real meshes (a 64 × 40 first-hit
 * raycast): 0% display, 0% floor, 0% wall past the edge; the ring 3.0% of
 * the frame at 16:10 (it was 3.3), 2.1% at 3:2, cut by the right edge at the
 * top right. It cannot go further: it stands behind the box's right end, and
 * every stance that loses it either brings the display in (from further
 * right) or shows the wall below the desk past its right edge (from the
 * left) — or needs the box moved ≈ 0.35 left, which hides more of the book row.
 * Every box state uses this one camera — the items move, not the room — so
 * putting a print down, you watch it land.
 */
export const SHOT = Object.freeze({
    lookAt: Object.freeze([1.939, 0.388, -0.477]),
    elevation: 36.6 * DEG,
    azimuth: 0.221,
    distance: 2.082
});

/**
 * The box shot's lens: vertical fov at 16:10 and 3:2. Wider screens zoom on
 * (the frame keeps most of 16:10's width, so the monitor and the desk's edge
 * stay out); 3:2 down to PORTRAIT_ASPECT zoom back off toward the room's lens
 * (the frame keeps 3:2's width, so the box's far end stays in).
 */
export const SHOT_FOV = 29.8;
const REFERENCE_ASPECT = 1.6;
const NARROW_ASPECT = 1.5;
/**
 * How much of 16:10's frame width a wider screen keeps: 1 would keep all of
 * it (and crop the trail off the bottom at 16:9); at 0.7 the monitor stays
 * 0.023 NDC outside the frame at 16:9 and the five prints of the trail stay in.
 */
const WIDE_ZOOM_EXPONENT = 0.7;
/** Below this aspect (portrait phones) the shot keeps the room's 45° lens and backs away instead. */
export const PORTRAIT_ASPECT = 1.2;
/** Below this (a phone held upright) a turned memo stacks its clipping below it (memoLayout turnedTall). */
export const TALL_MEMO_ASPECT = 0.75;

/** camera.zoom for the box shot at `aspect` (1 = the room's own lens). */
export function shotZoom(aspect = REFERENCE_ASPECT, fov = FOV) {
    if (!(aspect >= PORTRAIT_ASPECT)) return 1;
    const base = Math.tan((fov / 2) * DEG) / Math.tan((SHOT_FOV / 2) * DEG);
    if (aspect >= REFERENCE_ASPECT) return base * Math.pow(aspect / REFERENCE_ASPECT, WIDE_ZOOM_EXPONENT);
    if (aspect >= NARROW_ASPECT) return base;
    return Math.max(1, base * (aspect / NARROW_ASPECT));
}

/** The vertical fov the camera actually shows at `zoom`. */
export function effectiveFov(zoom, fov = FOV) {
    return 2 * Math.atan(Math.tan((fov / 2) * DEG) / zoom) / DEG;
}

export function boxShot(distance = SHOT.distance) {
    return orbitShot(SHOT.lookAt, { distance, elevation: SHOT.elevation, azimuth: SHOT.azimuth });
}

/**
 * Screens narrower than PORTRAIT_ASPECT keep the room's 45° lens (narrow
 * enough that nothing either side gets in) and a camera fitted to the box and
 * its trail: it stands at PORTRAIT_SHOT's elevation round `target`, backed off
 * until the box and the trail's patch fit the frame's width and the band
 * below `top`, aimed that far above the target (`aimUp`) that they sit low.
 * On a phone (below PHONE_ASPECT) that band is the lower half, and the held
 * item goes above it, against the wall (PORTRAIT_HAND): the picture stacks
 * the way a phone wants. Squarer screens let the box fill the frame and hold
 * the item to the left as landscape does.
 */
export const PHONE_ASPECT = 0.7;
export const PORTRAIT_SHOT = Object.freeze({
    target: Object.freeze([1.95, 0.25, -0.5]),
    elevation: 44 * DEG,
    azimuth: 0.16,
    top: Object.freeze({ phone: 0.02, square: 0.7 }),
    /**
     * The patch of desk the portrait shot keeps in frame besides the box: the
     * heart of the pile (world x, z). Not the whole spread — the fan's first
     * print and the paper's front edges may leave the frame on a phone, which
     * keeps the display and the desk's right edge out (fitting the whole pile
     * backed the camera off until 0.4% display and 1.3% of the wall below the
     * desk's edge came in).
     */
    patch: Object.freeze([[1.35, -0.55], [2.8, -0.55], [1.35, 0.05], [2.8, 0.05]])
});
/** The held item on a phone: this much of the frame's height, raised this far (fraction) above centre. */
export const PORTRAIT_HAND = Object.freeze({ fill: 0.52, downFraction: -0.22 });

export function portraitShot(aspect, fov = FOV) {
    const target = [...shotTargetCorners().slice(0, 8), ...PORTRAIT_SHOT.patch.map(([x, z]) => new THREE.Vector3(x, 0, z))];
    const top = aspect < PHONE_ASPECT ? PORTRAIT_SHOT.top.phone : PORTRAIT_SHOT.top.square;
    const T = toVec3(PORTRAIT_SHOT.target);
    const at = (distance, aimUp) => {
        const base = orbitShot(PORTRAIT_SHOT.target, { distance, elevation: PORTRAIT_SHOT.elevation, azimuth: PORTRAIT_SHOT.azimuth });
        return { position: base.position, lookAt: [T.x, T.y + aimUp, T.z] };
    };
    const fits = (distance, aimUp) => {
        const r = frameReport(target, makeCamera(at(distance, aimUp), aspect, fov));
        return !r.behind && r.ndc.minX >= -0.94 && r.ndc.maxX <= 0.94 && r.ndc.minY >= -0.94 && r.ndc.maxY <= top;
    };
    let best = null;
    for (let aimUp = 0; aimUp <= 1.6; aimUp += 0.02) {
        let lo = 1;
        let hi = 14;
        if (!fits(hi, aimUp)) continue;
        for (let i = 0; i < 30; i += 1) {
            const mid = (lo + hi) / 2;
            if (fits(mid, aimUp)) hi = mid; else lo = mid;
        }
        if (!best || hi < best.distance - 1e-6) best = { distance: hi, aimUp };
    }
    // Nothing fits (a very odd shape): fall back to the target, backed well off.
    return best ? at(best.distance, best.aimUp) : at(8, 0);
}

/**
 * The in-hand distance: one distance for everything, set so a portrait print
 * fills PRINT_FILL of the frame height (tipped back 8°) at the live lens.
 * Keeping it constant keeps the objects at their true relative sizes — the
 * memo IS bigger than a print, and looks it.
 */
export const PRINT_FILL = 0.575;
export const TILT_BACK = 8 * DEG;
/** Negative: held a touch ABOVE the frame's centre, so the trail on the desk in front of the box shows beneath. */
export const HAND_DOWN_FRACTION = -0.065;
/** Held LEFT of centre (NDC), over the bare desk in front of the books, so the box and its trail stay in view on the right. */
export const HAND_RIGHT_NDC = -0.18;
/**
 * Held angled 20° toward the window, the way you tip a photo to the light.
 * This shot looks back and LEFT, so a print squarely facing it would face
 * away from the window: its face would get 28% of the sun the v1 print got
 * (N·L 0.19 against 0.67). Turned 20° it gets 73% (N·L 0.49) and still faces
 * the camera within 31° (it reads 14% narrower). On a portrait phone, which
 * looks at the box square to the room, the same turn takes N·L 0.24 → 0.43.
 */
export const HAND_LIGHT_TURN = 20 * DEG;

/** The print every in-hand distance is solved from: a portrait 4×6 with its borders. */
const PRINT_H = toUnits(SHEETS_MM.print)[1];

/**
 * The in-hand pose for `item` in front of `cameraPose` at the live aspect and
 * the live (effective) fov: the one print distance, pushed back only if the
 * item (in its widest state) would fill more than 86% of the frame width — a
 * portrait phone — and slid toward the centre only as far as it must to stay
 * 7% inside the frame's edge.
 */
export function handPose(cameraPose, item, { aspect, fov = FOV, zoom = 1 }) {
    // The distance is set at the box shot's 16:10 lens, whatever the screen:
    // wider screens zoom on to keep the frame's width (shotZoom), and a print
    // held further off to keep 57.5% of a shorter frame would swing into the
    // box. So there the print is held where it is at 16:10, a little larger.
    const liveFov = effectiveFov(zoom, fov);
    const fillFov = effectiveFov(Math.min(zoom, shotZoom(Math.min(aspect, REFERENCE_ASPECT), fov)), fov);
    const phone = aspect < PHONE_ASPECT;
    const base = poseInFront(cameraPose, {
        height: PRINT_H, fraction: phone ? PORTRAIT_HAND.fill : PRINT_FILL, tiltBack: TILT_BACK, aspect, fov: fillFov
    });
    const [width, height] = handExtent(item, { tall: aspect < TALL_MEMO_ASPECT });
    const first = poseInFront(cameraPose, {
        distance: base.distance, width, maxWidthFraction: 0.86, tiltBack: TILT_BACK, aspect, fov: liveFov
    });
    const halfWidth = first.frameHeight / 2 * aspect;
    const halfItemNdc = width / 2 / halfWidth;
    const reach = Math.max(0, 0.93 - halfItemNdc);
    const sideNdc = Math.max(-reach, Math.min(reach, phone ? 0 : HAND_RIGHT_NDC));
    // On a phone the item is raised above the box, but never past the frame's top (4% in).
    const heightNdc = (height * Math.cos(TILT_BACK)) / first.frameHeight;
    const down = phone ? Math.max(PORTRAIT_HAND.downFraction, (heightNdc * 1.08 - 0.92) / 2) : HAND_DOWN_FRACTION; // 1.08: the wrist turn and perspective
    const pose = poseInFront(cameraPose, {
        distance: first.distance,
        tiltBack: TILT_BACK,
        aspect,
        fov: liveFov,
        downFraction: down,
        right: sideNdc * halfWidth
    });
    // About the item's own up (a turn of the wrist), so it reads as turned, not skewed.
    pose.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -HAND_LIGHT_TURN));
    return pose;
}

/** What the whole box shot has to keep in frame: the box and its file (a proud divider's tab included), and the trail's patch of desk. */
export function shotTargetCorners() {
    const corners = [];
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), BOX_YAW);
    const c = toVec3(BOX_POSITION);
    for (const x of [-LID.w / 2, LID.w / 2]) for (const y of [0, fileTop({ proudDivider: true })]) for (const z of [-LID.d / 2, LID.d / 2]) {
        corners.push(new THREE.Vector3(x, y, z).applyQuaternion(q).add(c));
    }
    // The trail's patch of desk (PILE_BASE's footprints, rounded out).
    for (const [x, z] of pilePatch()) corners.push(new THREE.Vector3(x, 0, z));
    return corners;
}

/** The corners of the desk patch the pile covers (every keepsake's footprint, rounded out 1 cm). */
export function pilePatch() {
    let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    for (const id of KEEPSAKE_IDS) {
        for (const [x, z] of footprint(pilePose(id), pileRects(id))) {
            minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
        }
    }
    return [[minX - 0.03, minZ - 0.03], [maxX + 0.03, minZ - 0.03], [minX - 0.03, maxZ + 0.03], [maxX + 0.03, maxZ + 0.03]];
}

/** World xz corners of rects lying face up at pose {x, z, yaw}. */
export function footprint(p, rects) {
    const c = Math.cos(p.yaw);
    const s = Math.sin(p.yaw);
    const out = [];
    for (const r of rects) {
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            // Face up: item +x → world (cos, -sin); item +y (its top) → world -z, yawed.
            const lx = r.cx + sx * r.w / 2;
            const ly = r.cy + sy * r.h / 2;
            out.push([p.x + lx * c - ly * s, p.z - lx * s - ly * c]);
        }
    }
    return out;
}

/** The highest point of anything standing in the file (a divider's tab, or the proud print's top). */
export function fileTop({ proudDivider = false } = {}) {
    let top = RIM_Y;
    for (let i = 0; i < ITEMS.length; i += 1) {
        const pose = isDivider(ITEMS[i]) && proudDivider ? dividerPose(i, 'proud') : slotPose(i);
        const [w, h] = ITEMS[i].size;
        for (const x of [-w / 2, w / 2]) for (const y of [-h / 2, h / 2]) {
            top = Math.max(top, new THREE.Vector3(x, y, 0).applyQuaternion(pose.quaternion).add(pose.position).y);
        }
    }
    return top;
}

// ---------------------------------------------------------------------------
// The reading light
// ---------------------------------------------------------------------------

/**
 * A soft, shadowless, warm reading light for the box shot. The monitor's glow
 * used to lift this corner (2.0 of it in v1); at 0.4 the box, its file and the
 * back of the pile sit in the display's own shadow from the window (paper
 * there renders ≈ 121 against ≈ 207 in the sun). A SpotLight above and to the
 * right of the camera, a narrow soft cone (15°, penumbra 0.75) on the box: in
 * node (sun 780 cd from the window, an environment of ≈ 0.6) it takes paper on
 * the box's front and a proud divider's face from ≈ 121 to ≈ 177–187, and a
 * held print — which is out in the sun, and in hand doesn't take the room's
 * shadows — from ≈ 217 to ≈ 220 (v1 measured 215): the box comes up, the thing
 * in your hand keeps the window's modelling. Eased up with the camera move in
 * and down with the move out — never on at the desk. Candela, decay 2 (the
 * room's units); no shadow map.
 */
export const READING_LIGHT = Object.freeze({
    position: Object.freeze([2.9, 2.3, 1.3]),
    target: Object.freeze([2.3, 0.3, -0.7]),
    color: 0xffe3c4,
    intensity: 9,
    angle: 0.26,
    penumbra: 0.75,
    decay: 2
});

// ---------------------------------------------------------------------------
// Paths (shared with the node path check, so what's checked is what runs)
// ---------------------------------------------------------------------------

const BOX_Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), BOX_YAW);
/** The box's front direction in the world. */
export const BOX_FRONT = Object.freeze(new THREE.Vector3(0, 0, 1).applyQuaternion(BOX_Q));
/** Up the file's plane, in the world (a sheet slides out along this). */
export const FILE_UP_WORLD = Object.freeze(FILE_UP.clone().applyQuaternion(BOX_Q));
/** Across the box to its left (the hand's side), in the world. */
export const BOX_LEFT = Object.freeze(new THREE.Vector3(-1, 0, 0).applyQuaternion(BOX_Q));

/** Box-local ↔ world. */
export function boxToWorld(p) {
    return p.clone().applyQuaternion(BOX_Q).add(toVec3(BOX_POSITION));
}
export function boxPoseToWorld(pose) {
    return { position: boxToWorld(pose.position), quaternion: BOX_Q.clone().multiply(pose.quaternion) };
}

/**
 * Control points for carrying something from p0 to p3 on a cubic Bézier.
 *   leave 'up'   — rise straight off the pile
 *   arrive 'down'— come down onto the desk from above
 */
export function carryControls(p0, p3, { leave = null, arrive = null, clearY = 0 } = {}) {
    const top = Math.max(p0.y, p3.y, clearY) + (leave ? 0.08 : 0.05);
    let c1;
    if (leave === 'up') c1 = new THREE.Vector3(p0.x, top, p0.z);
    else c1 = new THREE.Vector3().lerpVectors(p0, p3, 1 / 3).setY(Math.max(top, (p0.y + p3.y) / 2));
    let c2;
    if (arrive === 'down') c2 = new THREE.Vector3(p3.x, top, p3.z);
    else if (leave) c2 = new THREE.Vector3(p3.x, p3.y + 0.04, p3.z);
    else c2 = new THREE.Vector3().lerpVectors(p0, p3, 2 / 3);
    return { c1, c2 };
}

/** The point at eased progress e along the carry curve. */
export function carryPoint(p0, c1, c2, p3, e, out = new THREE.Vector3()) {
    const u = 1 - e;
    return out.set(0, 0, 0)
        .addScaledVector(p0, u * u * u)
        .addScaledVector(c1, 3 * u * u * e)
        .addScaledVector(c2, 3 * u * e * e)
        .addScaledVector(p3, e * e * e);
}

/**
 * How far a sheet slides up its own plane before its bottom edge is clear of
 * the rim (+10 cm). Only the opening card comes out this way now: anything
 * behind a divider comes out past the flicked dividers (exitPlan below) — the
 * first v3 slid it up here until its bottom cleared their tabs (+4 cm over
 * FLICKED_TOP_Y), which took it out of the top of the frame.
 */
export const FLICKED_TOP_Y = (() => {
    let top = RIM_Y;
    const [w, h] = toUnits(SHEETS_MM.divider);
    for (const index of FLICKED.keys()) {
        const pose = flickedPose(index);
        for (const x of [-w / 2, w / 2]) for (const y of [-h / 2, h / 2]) {
            top = Math.max(top, new THREE.Vector3(x, y, 0).applyQuaternion(pose.quaternion).add(pose.position).y);
        }
    }
    return top;
})();

export function slideOut(index) {
    const pose = slotPose(index);
    const [, h] = ITEMS[index].size;
    const bottom = pose.position.y - (h / 2) * FILE_UP.y;
    const clear = RIM_Y + 0.1;
    return Math.max(0, (clear - bottom) / FILE_UP.y);
}

/** Does any divider stand in front of item `index` in the file (so it is flicked by the time `index` comes out)? */
function firstDividerBefore(index) {
    for (let i = 0; i < index; i += 1) if (isDivider(ITEMS[i])) return true;
    return false;
}

/** Where a sheet in the file is once it has slid up clear of the rim, from its (world) slot position. */
export function slidOutPoint(p0, index) {
    return p0.clone().addScaledVector(FILE_UP_WORLD, slideOut(index));
}

/**
 * A path that first slides a sheet straight up out of the file along its own
 * plane (so it never touches its neighbours), then carries on as a smooth
 * curve (tangent-continuous at the join) — travelled by arc length.
 * `curve.userData.slide` is the fraction of the length spent sliding out:
 * nothing may turn before it (a sheet turning inside the file would sweep
 * through the ones behind it).
 */
function slideThen(p0, w1, ...rest) {
    const path = new THREE.CurvePath();
    path.add(new THREE.LineCurve3(p0.clone(), w1.clone()));
    for (const curve of rest) path.add(curve);
    const total = path.getLength();
    path.userData = { slide: total > 0 ? p0.distanceTo(w1) / total : 0 };
    return path;
}

/** How far through a turn is, `e` along a slideThen path: nothing while sliding, then a smoothstep over `span` of the rest. */
export function turnAfterSlide(curve, e, { delay = 0.04, span = 0.55 } = {}) {
    const start = (curve.userData?.slide ?? 0) + delay;
    const k = Math.min(1, Math.max(0, (e - start) / Math.max(1e-6, span * (1 - start))));
    return k * k * (3 - 2 * k);
}

/**
 * Straight from the file to the pile (things passed over on the way to a
 * later item): up out of the file along its plane, then over the front wall
 * and down onto the pile, lying flat by the time it is over it.
 */
export function passCurve(p0, p3, item, index) {
    const w1 = slidOutPoint(p0, index);
    const over = w1.clone().addScaledVector(FILE_UP_WORLD, 0.12);
    // Over to a point above the pile, then straight down onto it, flat: the
    // pile is a few cm from the box's front wall.
    const above = new THREE.Vector3(p3.x, Math.max(RIM_Y + 0.22, FLICKED_TOP_Y + 0.12, p3.y + 0.22), p3.z);
    const high = above.clone().setY(above.y + 0.12);
    return slideThen(p0, w1,
        new THREE.CubicBezierCurve3(w1.clone(), over, high, above.clone()),
        new THREE.LineCurve3(above.clone(), p3.clone()));
}

export function passTurn(curve, e) {
    // Flat well before it comes down beside the box's front wall.
    return turnAfterSlide(curve, e, { delay: 0.03, span: 0.42 });
}

/**
 * Lifting something to the hand: up out of the file along its plane, then
 * round to the hand (the opening card; anything behind a divider comes out
 * past the flicked dividers instead — liftPath); or, off the pile (or the
 * aside spot), a short plumb start, then up and round. Either way the path's
 * userData.slide says when it may start to turn.
 */
export function liftCurve(p0, p3, { from = 'box', index }) {
    const overFlicked = firstDividerBefore(index);
    if (from === 'box') {
        const w1 = slidOutPoint(p0, index);
        const onward = w1.clone().addScaledVector(FILE_UP_WORLD, 0.14);
        return slideThen(p0, w1, new THREE.QuadraticBezierCurve3(w1.clone(), onward, p3.clone()));
    }
    // Off the pile (or the aside spot): straight up, flat, clear of the box's
    // rim and of anything flicked over it (the pile is a few cm from its front
    // wall), then round to the hand.
    const rise = new THREE.Vector3(p0.x, Math.max(p0.y + 0.3, RIM_Y + 0.1, overFlicked ? FLICKED_TOP_Y + 0.06 : 0), p0.z);
    const onward = new THREE.Vector3(p0.x, rise.y + 0.14, p0.z);
    return slideThen(p0, rise, new THREE.QuadraticBezierCurve3(rise.clone(), onward, p3.clone()));
}

/** The turn to face you on a lift: after the slide-out, over the next 55% of the way. */
export function liftTurn(curve, e) {
    return turnAfterSlide(curve, e, { delay: 0.03, span: 0.55 });
}

/** Putting down from the hand comes over the box's rim with room to spare (the print is 18 cm tall). */
export const PUT_CLEAR_Y = RIM_Y + 0.2;
/** …and, for anything behind a divider (so dividers may lie flicked over the front wall), over their tabs too. */
export function putClearY(index) {
    return firstDividerBefore(index) ? Math.max(PUT_CLEAR_Y, FLICKED_TOP_Y + 0.14) : PUT_CLEAR_Y;
}

/** A put-down lies flat by 70% of the way, so it comes down onto the desk flat, not edge first. */
export function putTurn(e) {
    const k = Math.min(1, e / 0.7);
    return k * k * (3 - 2 * k);
}

/**
 * Putting down from the hand: up and over to a point straight above the spot
 * (`clearY`, over the rim and anything flicked over it), lying flat by then,
 * and straight down onto it — so a spot a few cm clear of the flicked
 * dividers' footprint is always reached cleanly. By arc length;
 * `userData.over` is the fraction of the way at which it is above the spot.
 */
export function putCurve(p0, p3, { clearY = PUT_CLEAR_Y } = {}) {
    const above = new THREE.Vector3(p3.x, Math.max(clearY, p3.y + 0.2), p3.z);
    // (From high up already — a lift cut short over the tabs — it needn't climb higher.)
    const top = Math.max(p0.y + 0.02, above.y + 0.06);
    const c1 = new THREE.Vector3().lerpVectors(p0, above, 0.3).setY(top);
    const c2 = above.clone().setY(top);
    const path = new THREE.CurvePath();
    path.add(new THREE.CubicBezierCurve3(p0.clone(), c1, c2, above.clone()));
    path.add(new THREE.LineCurve3(above.clone(), p3.clone()));
    const total = path.getLength();
    path.userData = { over: total > 0 ? path.curves[0].getLength() / total : 1 };
    return path;
}

/** The put's turn to lie flat: done by the time it is above the spot. */
export function putCurveTurn(curve, e) {
    const k = Math.min(1, e / Math.max(0.05, (curve.userData?.over ?? 0.7) * 0.92));
    return k * k * (3 - 2 * k);
}

// ---------------------------------------------------------------------------
// Out past the flicked dividers (v3.1)
// ---------------------------------------------------------------------------

/*
 * WHY. The first v3 exit slid a sheet straight up its own plane until its
 * bottom edge cleared the flicked dividers' tabs (FLICKED_TOP_Y + 4 cm, 20 cm
 * of slide against the intro card's 10) and then came forward over them. The
 * dividers are taller than the prints and only tip 26–29° (they rest on the
 * front rim), so their tabs stand 0.6 above the box's floor — and under v3's
 * longer lens the frame's top edge is only ≈ 0.87 above the file. Every print
 * behind a divider left the top of the frame by 50–70% for ≈ 300 ms on its way
 * to your hand (v1, with no dividers and a wider lens, never left it).
 *
 * WHAT. A sheet behind flicked dividers now comes out the way you pull a card
 * over the ones you've flicked: it tips forward to lean on the back of the
 * last flicked divider (never past it), slides up that divider's back, and
 * rolls forward over the tabs — tipping further only as far as the tabs let
 * it — before it turns to your hand (or flat, to the pile). Its top stays low
 * and comes toward the camera, so it stays in the frame (checked in node for
 * every item: the highest a lift's top gets is 0.85 NDC at 16:10 and 3:2,
 * 0.92 at 16:9, 0.81 at 4:3, 0.73 at 1:1 and 0.93 on a phone, where the hand
 * itself is at 0.73–0.91 — against 1.6–1.8 for the first v3 exit; a pass to
 * the pile, on a jump, at most 1.03 at 16:9), and it clears the dividers, the
 * file behind it and the box's walls all the way (a sheet-crossing test on the
 * real outlines and thicknesses: 0 contacts on 54 paths).
 *
 * It leans on the divider's FINAL flicked pose, so it may only start once that
 * divider has nearly finished its flick (index.js FLICK_EXIT_AFTER, checked
 * against the flick's own easing from flush and from proud).
 */

const EXIT_SHAPE = Object.freeze({
    /** Extra air between the sheet and the divider it leans on (beyond its own clearance). */
    lean: 0.02,
    /** Air kept between a sheet's faces and a divider's, at the closest. */
    margin: 0.004,
    /** How far up (units) the bottom edge takes to move from its slot onto its line up the divider's back. */
    blend: 0.1,
    /** Tip toward the divider over this fraction of the way up. */
    tipSpan: 0.8,
    /** Stop this far (degrees) short of the divider's own angle while leaning on it. */
    shy: 2,
    /** Bottom edge this far over the highest tab, and this far past the frontmost, when it is out. */
    overTop: 0.02,
    overFront: 0.05,
    /** The most it tips forward (degrees) as it rolls over the tabs. */
    roll: 50
});
const DEG_EXIT = Math.PI / 180;
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const DIVIDER_LEN = toUnits(SHEETS_MM.divider)[1];

/** 2D (y, z) distance between segments ab and cd (0 if they cross). */
function segmentDistance(a, b, c, d) {
    const cross = (o, p, q) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
    const d1 = cross(a, b, c); const d2 = cross(a, b, d); const d3 = cross(c, d, a); const d4 = cross(c, d, b);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
    const toSeg = (p, s0, s1) => {
        const v = s1.clone().sub(s0);
        const t = Math.max(0, Math.min(1, p.clone().sub(s0).dot(v) / v.lengthSq()));
        return s0.clone().addScaledVector(v, t).distanceTo(p);
    };
    return Math.min(toSeg(a, c, d), toSeg(b, c, d), toSeg(c, a, b), toSeg(d, a, b));
}

const smooth01 = (x) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };

/**
 * The exit of item `index` from the file past the dividers flicked in front of
 * it, box-local: samples of its bottom edge's centre B (y, z; x stays at the
 * slot's) and its tip φ about x (−lean in the slot, + forward), front to the
 * room throughout, its in-plane roll kept. Solved once per item.
 */
const exitCache = new Map();
function exitPlan(index, EXIT = EXIT_SHAPE) {
    const cacheable = EXIT === EXIT_SHAPE;
    if (cacheable && exitCache.has(index)) return exitCache.get(index);
    const item = ITEMS[index];
    const slot = slotPose(index);
    const [, h] = item.size;
    const rollQ = new THREE.Quaternion().setFromAxisAngle(X_AXIS, FILE.lean).multiply(slot.quaternion); // the slot's in-plane roll
    const B0 = slot.position.clone().addScaledVector(Y_AXIS.clone().applyQuaternion(slot.quaternion), -h / 2);
    const flicked = [...FLICKED.keys()].filter((j) => j < index);
    const geo = flicked.map((j) => {
        const pose = FLICKED.get(j);
        const along = Y_AXIS.clone().applyQuaternion(pose.quaternion);
        const pivot = pose.position.clone().addScaledVector(along, -DIVIDER_LEN / 2);
        return { theta: pose.theta, pivot, top: pivot.clone().addScaledVector(along, DIVIDER_LEN) };
    });
    const rear = geo[geo.length - 1]; // the one it leans on
    const topY = Math.max(...geo.map((g) => g.top.y));
    const frontZ = Math.max(...geo.map((g) => g.top.z));
    const th = rear.theta;
    const ext = stackExtents(item); // how far it reaches in front of / behind its mid-plane
    const need = THICKNESS.divider / 2 + ext.front + EXIT.margin;
    // Its line up the divider's back: as far behind it as the sheet stood in the file, plus some air.
    const behind = -((B0.y - rear.pivot.y) * -Math.sin(th) + (B0.z - rear.pivot.z) * Math.cos(th));
    const offset = Math.max(behind, need) + EXIT.lean;
    const lineZ = (y) => rear.pivot.z + (y - rear.pivot.y) * Math.tan(th) - offset / Math.cos(th);
    const segs = geo.map((g) => [new THREE.Vector2(g.pivot.y, g.pivot.z), new THREE.Vector2(g.top.y, g.top.z)]);
    // The most it may tip with its bottom edge at (y, z): every flicked divider `need` clear of the sheet.
    const tipCap = (y, z) => {
        const a = new THREE.Vector2(y, z);
        let ok = th - EXIT.shy * DEG_EXIT;
        for (let phi = ok; phi <= 80 * DEG_EXIT; phi += 0.5 * DEG_EXIT) {
            const b = a.clone().add(new THREE.Vector2(Math.cos(phi), Math.sin(phi)).multiplyScalar(h));
            if (segs.some(([c, d]) => segmentDistance(a, b, c, d) < need)) break;
            ok = phi;
        }
        return Math.max(th - EXIT.shy * DEG_EXIT, ok - EXIT.margin);
    };
    // The bottom edge: up onto its line and up the divider's back, then level forward over the tabs.
    const pts = [];
    const y1 = topY + EXIT.overTop + ext.back;
    const CLIMB = 80;
    const ROLL = 30;
    for (let k = 0; k <= CLIMB; k += 1) {
        const y = B0.y + (y1 - B0.y) * (k / CLIMB);
        pts.push({ y, z: lineZ(y) + (B0.z - lineZ(B0.y)) * (1 - smooth01((y - B0.y) / EXIT.blend)) });
    }
    const pa = new THREE.Vector2(y1, lineZ(y1));
    const pb = new THREE.Vector2(y1 + 0.01, Math.max(frontZ, pa.y) + EXIT.overFront);
    const pc = pa.clone().add(new THREE.Vector2(Math.cos(th), Math.sin(th)).multiplyScalar((pb.x - pa.x) / Math.cos(th)));
    for (let k = 1; k <= ROLL; k += 1) {
        const u = k / ROLL;
        const a = (1 - u) * (1 - u); const b = 2 * u * (1 - u); const c = u * u;
        pts.push({ y: pa.x * a + pc.x * b + pb.x * c, z: pa.y * a + pc.y * b + pb.y * c });
    }
    // The tip: eased in from the slot's lean toward EXIT.roll, never past what the dividers allow, smoothed.
    const phi0 = -FILE.lean;
    let length = 0;
    const along = [0];
    for (let k = 1; k < pts.length; k += 1) { length += Math.hypot(pts[k].y - pts[k - 1].y, pts[k].z - pts[k - 1].z); along.push(length); }
    const caps = pts.map((p) => tipCap(p.y, p.z));
    pts.forEach((p, k) => { p.phi = Math.min(phi0 + (EXIT.roll * DEG_EXIT - phi0) * smooth01(along[k] / (EXIT.tipSpan * length)), caps[k]); });
    for (let pass = 0; pass < 6; pass += 1) {
        const phis = pts.map((p) => p.phi);
        pts.forEach((p, k) => {
            if (k === 0) return;
            const at = (j) => phis[Math.max(0, Math.min(phis.length - 1, j))];
            p.phi = Math.min((at(k - 2) + at(k - 1) + 2 * at(k) + at(k + 1) + at(k + 2)) / 6, caps[k]);
        });
    }
    const poses = pts.map((p) => {
        const quaternion = new THREE.Quaternion().setFromAxisAngle(X_AXIS, p.phi).multiply(rollQ);
        const position = new THREE.Vector3(B0.x, p.y, p.z).addScaledVector(Y_AXIS.clone().applyQuaternion(quaternion), h / 2);
        return { position, quaternion };
    });
    poses[0] = { position: slot.position.clone(), quaternion: slot.quaternion.clone() };
    const plan = { poses, last: poses.length - 1 };
    if (cacheable) exitCache.set(index, plan);
    return plan;
}

/** Does item `index` come out past flicked dividers (so its moves out of the file use the exit)? */
export const exitsOverFlicked = (index) => firstDividerBefore(index);

/** The box's static world matrix (what the file group's matrixWorld is at rest). */
const BOX_MATRIX = new THREE.Matrix4().compose(toVec3(BOX_POSITION), BOX_Q, new THREE.Vector3(1, 1, 1));

/**
 * How much a turn counts toward a PosePath's length on top of the travel of
 * the sheet's corners (radians × half its height). 0 for the moves out of the
 * file — by corner travel alone their speed runs on smoothly where the tip
 * forward turns into the swing to your hand; putPath gives its turn more.
 */
const PATH_TURN_WEIGHT = 0;
const PUT_TURN_WEIGHT = 2;

/**
 * A move as sampled poses, travelled by how far the sheet's corners go (so a
 * turn in place takes time as well as a slide). Samples on the exit carry
 * `tag` = their place along it, so a move interrupted there can carry on out
 * the same way (exitAt). `at(e)` interpolates between samples.
 */
export class PosePath {
    constructor(poses, item, tags = null, { weight = PATH_TURN_WEIGHT } = {}) {
        this.poses = poses;
        this.tags = tags ?? poses.map(() => null);
        const [w, h] = item.size;
        const corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]].map(([x, y]) => new THREE.Vector3(x, y, 0));
        const cum = [0];
        let previous = null;
        let previousQ = null;
        for (const pose of poses) {
            const now = corners.map((c) => c.clone().applyQuaternion(pose.quaternion).add(pose.position));
            if (previous) {
                const travel = now.reduce((sum, c, k) => sum + c.distanceTo(previous[k]), 0) / 4;
                cum.push(cum[cum.length - 1] + travel + weight * (h / 2) * previousQ.angleTo(pose.quaternion));
            }
            previous = now;
            previousQ = pose.quaternion;
        }
        const total = cum[cum.length - 1] || 1;
        this.cum = cum.map((c) => c / total);
        this.item = item;
        this.weight = weight;
    }

    #find(e) {
        let lo = 0;
        let hi = this.cum.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (this.cum[mid] <= e) lo = mid; else hi = mid; }
        return { lo, hi, k: Math.min(1, Math.max(0, (e - this.cum[lo]) / Math.max(1e-9, this.cum[hi] - this.cum[lo]))) };
    }

    at(e, position, quaternion) {
        const last = this.poses.length - 1;
        if (!(e > 0)) { position.copy(this.poses[0].position); quaternion.copy(this.poses[0].quaternion); return; }
        if (e >= 1) { position.copy(this.poses[last].position); quaternion.copy(this.poses[last].quaternion); return; }
        const { lo, hi, k } = this.#find(e);
        position.lerpVectors(this.poses[lo].position, this.poses[hi].position, k);
        quaternion.slerpQuaternions(this.poses[lo].quaternion, this.poses[hi].quaternion, k);
    }

    /** Where along the exit the sheet is at `e` (a fractional exit sample), or null once it is out (or never was in). */
    exitAt(e) {
        const { lo, hi, k } = this.#find(Math.min(1, Math.max(0, e)));
        const a = this.tags[lo];
        const b = this.tags[hi];
        if (a === null || b === null) return e <= 0 ? this.tags[0] : (e >= 1 ? this.tags[this.tags.length - 1] : null);
        return a + (b - a) * k;
    }

    reversed() {
        return new PosePath([...this.poses].reverse(), this.item, [...this.tags].reverse(), { weight: this.weight });
    }
}

/** The exit's box-local pose at fractional sample s. */
function exitPoseAt(plan, s) {
    const lo = Math.max(0, Math.min(plan.last, Math.floor(s)));
    const hi = Math.min(plan.last, lo + 1);
    const k = Math.min(1, Math.max(0, s - lo));
    return {
        position: new THREE.Vector3().lerpVectors(plan.poses[lo].position, plan.poses[hi].position, k),
        quaternion: new THREE.Quaternion().slerpQuaternions(plan.poses[lo].quaternion, plan.poses[hi].quaternion, k)
    };
}

/** The exit's samples from s0 to s1 (either way), in the world through `toWorld`, with their tags. */
function exitSamples(plan, s0, s1, toWorld) {
    const rotation = new THREE.Quaternion().setFromRotationMatrix(toWorld);
    const out = [];
    const tags = [];
    const push = (s) => {
        const p = exitPoseAt(plan, s);
        out.push({ position: p.position.applyMatrix4(toWorld), quaternion: rotation.clone().multiply(p.quaternion) });
        tags.push(s);
    };
    const dir = s1 >= s0 ? 1 : -1;
    push(s0);
    for (let s = dir > 0 ? Math.floor(s0) + 1 : Math.ceil(s0) - 1; dir > 0 ? s < s1 : s > s1; s += dir) push(s);
    if (Math.abs(s1 - s0) > 1e-9) push(s1);
    return { poses: out, tags };
}

/** How the lift turns to the hand once out: nothing for the first TURN_FROM of the way, done by TURN_TO. */
const LIFT_ONWARD = Object.freeze({ lead: 0.1, arrive: 0.3, turnFrom: 0.15, turnTo: 0.9 });

/**
 * From the file (or from `from`, part-way along the exit) out past the flicked
 * dividers and round to `target` (a world pose: the hand), turning to it once
 * clear. A PosePath (world).
 */
export function liftPath(index, target, { from = 0, toWorld = BOX_MATRIX, exit = EXIT_SHAPE, onward = LIFT_ONWARD, weight } = {}) {
    const plan = exitPlan(index, exit);
    const { poses, tags } = exitSamples(plan, from, plan.last, toWorld);
    const end = poses[poses.length - 1];
    const before = exitSamples(plan, Math.max(0, plan.last - 3), plan.last, toWorld).poses[0];
    const dir = end.position.clone().sub(before.position).normalize();
    const curve = new THREE.CubicBezierCurve3(
        end.position.clone(),
        end.position.clone().addScaledVector(dir, onward.lead),
        target.position.clone().lerp(end.position, onward.arrive),
        target.position.clone()
    );
    const N = 60;
    for (let k = 1; k <= N; k += 1) {
        const u = k / N;
        poses.push({
            position: curve.getPointAt(u),
            quaternion: new THREE.Quaternion().slerpQuaternions(end.quaternion, target.quaternion,
                smooth01((u - onward.turnFrom) / (onward.turnTo - onward.turnFrom)))
        });
        tags.push(null);
    }
    return new PosePath(poses, ITEMS[index], tags, weight === undefined ? {} : { weight });
}

/**
 * Passed over on the way to a later item: out past the flicked dividers (from
 * `from` along the exit), over to a point above its place on the pile — flat
 * by then — and straight down onto it. A PosePath (world).
 */
export function passPath(index, target, { from = 0, toWorld = BOX_MATRIX, shape = PASS_ONWARD, exit = EXIT_SHAPE, weight } = {}) {
    const plan = exitPlan(index, exit);
    const { poses, tags } = exitSamples(plan, from, plan.last, toWorld);
    const end = poses[poses.length - 1];
    // Flat before it comes down; over the tabs first if its spot lies within reach of their footprint
    // (Deloitte's and the paper's are a centimetre or so clear of it), low and straight in otherwise.
    const clearY = nearFlicked(index, target, toWorld) ? FLICKED_TOP_Y + 0.06 : 0;
    const above = new THREE.Vector3(target.position.x, Math.max(target.position.y + 0.2, clearY), target.position.z);
    // Toward its spot first (nearer the camera, where the frame is taller), still leaning forward; then it
    // turns back to lie flat — by the time it is over the spot — and comes straight down.
    const curve = new THREE.CubicBezierCurve3(
        end.position.clone(),
        end.position.clone().lerp(above, shape.lead).setY(end.position.y + shape.rise),
        above.clone().add(new THREE.Vector3(0, shape.drop, 0)),
        above.clone()
    );
    const N = 50;
    for (let k = 1; k <= N; k += 1) {
        const u = k / N;
        poses.push({
            position: curve.getPointAt(u),
            quaternion: new THREE.Quaternion().slerpQuaternions(end.quaternion, target.quaternion, smooth01((u - shape.turnFrom) / (shape.turnTo - shape.turnFrom)))
        });
        tags.push(null);
    }
    const D = 12;
    for (let k = 1; k <= D; k += 1) {
        poses.push({ position: above.clone().lerp(target.position, k / D), quaternion: target.quaternion.clone() });
        tags.push(null);
    }
    return new PosePath(poses, ITEMS[index], tags, weight === undefined ? {} : { weight });
}

/** Does item `index` lying at `pose` (world) come within 6 cm (in plan) of the dividers flicked over the front wall, or of the box? */
function nearFlicked(index, pose, toWorld) {
    const inverse = toWorld.clone().invert();
    const [w, h] = ITEMS[index].size;
    const [flickedW] = toUnits(SHEETS_MM.divider);
    const reach = 0.06;
    for (const sx of [-0.5, 0, 0.5]) for (const sy of [-0.5, 0, 0.5]) {
        const p = new THREE.Vector3(sx * w, sy * h, 0).applyQuaternion(pose.quaternion).add(pose.position).applyMatrix4(inverse);
        const overFront = Math.abs(p.x) < flickedW / 2 + 0.02 + reach && p.z < 0.31 + reach;
        const byBox = Math.abs(p.x) < OUTER[0] / 2 + reach && p.z < OUTER[2] / 2 + reach;
        if (overFront || byBox) return true;
    }
    return false;
}
const PASS_ONWARD = Object.freeze({ lead: 0.25, rise: -0.1, drop: 0.08, turnFrom: 0.35, turnTo: 0.95 });

/** Back down the exit from `from` into the slot (a sheet caught part-way out going home). A PosePath (world). */
export function exitBackPath(index, from, { toWorld = BOX_MATRIX } = {}) {
    const plan = exitPlan(index);
    const { poses, tags } = exitSamples(plan, from, 0, toWorld);
    if (poses.length < 2) { poses.push({ position: poses[0].position.clone(), quaternion: poses[0].quaternion.clone() }); tags.push(0); }
    return new PosePath(poses, ITEMS[index], tags);
}

/**
 * Putting down from where it is (the hand, usually), as a PosePath: the same
 * way as putCurve — up and over to straight above its spot, flat by then, and
 * straight down — but its turn to lie flat counts toward the length
 * (PosePath's turn weight), so the turn gets its share of the time. The first
 * v3 put ran putCurve by arc length: the hand is nearly over the pile, so
 * "flat by the time it is over the spot" came at ≈ 30% of the way, which the
 * put's ease-out reaches in ≈ 80 ms — the print snapped flat (0.4–0.6 rad in
 * one 33 ms frame) on every step. Now 0.13–0.25 rad per 33 ms at 16:10, as v1
 * (0.10–0.27), on the same path.
 *
 * A sheet caught still over its own spot (a lift off the pile cut short)
 * just settles back down onto it instead of going up and over the box.
 */
export function putPath(from, target, index) {
    const p0 = from.position.clone();
    const p3 = target.position.clone();
    const flat = new THREE.Vector2(p0.x - p3.x, p0.z - p3.z).length();
    const hop = flat < 0.12 && p0.y < putClearY(index);
    let curve;
    let flatBy;
    if (hop) {
        curve = new THREE.CurvePath();
        const above = p3.clone().setY(Math.max(p0.y, p3.y + 0.03));
        curve.add(new THREE.LineCurve3(p0, above));
        curve.add(new THREE.LineCurve3(above.clone(), p3));
        flatBy = 0.7;
    } else {
        curve = putCurve(p0, p3, { clearY: putClearY(index) });
        flatBy = curve.userData.over * 0.92;
    }
    const poses = [];
    const N = 80;
    for (let k = 0; k <= N; k += 1) {
        const u = k / N;
        poses.push({ position: curve.getPointAt(u), quaternion: new THREE.Quaternion().slerpQuaternions(from.quaternion, target.quaternion, smooth01(u / flatBy)) });
    }
    return new PosePath(poses, ITEMS[index], null, { weight: PUT_TURN_WEIGHT });
}
