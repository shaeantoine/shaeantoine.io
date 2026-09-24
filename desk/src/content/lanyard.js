/**
 * One badge: an ID card in a holder with a bulldog clip on its near edge,
 * lying face-up on the desk.
 *
 * WHY THIS IS A FUNCTION AND NOT A PILE OF LITERALS. Two callers need
 * byte-identical output. The desk object (content/deskObjects.js) rests as the
 * first job's badge, and that same job's `artifact` is what artifactStrategy
 * shows when you focus it — validateDeskLayout enforces that they match,
 * because if they ever diverge the object would visibly change the instant you
 * clicked it while appearing to do nothing. Generating both from one call makes
 * that impossible to get wrong rather than merely tested for.
 *
 * WHY EVERY BADGE CARRIES ITS OWN HARDWARE. artifactStrategy reparents the
 * whole resting group into the first project's slot on mount, so anything
 * shared — one clip the cards swap underneath — would walk off the desk the
 * first time an arrow was pressed.
 *
 * IT USED TO HAVE A LANYARD STRAP, and losing it was a composition decision
 * rather than a modelling one. The tape sprawled to the viewer's left, and once
 * the editorial column moved to that side of the frame (see style.css
 * .artifact-spread) the strap ran the full width of the shot underneath the
 * prose: measured, the object spanned from 8.5% of the viewport at 16:9 and
 * 0.8% at 3:2, against a card that only ever occupied 66–75%. A clip badge is
 * the same object with none of that — it ends where the card ends.
 *
 * WHAT MAKES IT READ AS A BADGE, given it is six primitives:
 *
 *   a HOLDER, whose rim is the only reason the card looks like it is *in*
 *   something rather than printed on the desk;
 *   a PUNCHED SLOT, which is what says the holder is meant to be hung off
 *   something;
 *   a CLIP with two jaws, a hinge barrel and a turned-up lip — the piece of
 *   hardware, and the one surface here that returns a hard specular. The lip
 *   is what makes it a bulldog clip rather than a metal tab: it is the part
 *   you press, so it is the part that says the thing opens.
 *
 * THE CLIP IS AT THE NEAR EDGE, WHICH IS A FOCUS DECISION. Focusing the object
 * tips the card up on its near edge so its face meets the camera (see
 * `anchor.present` in content/deskObjects.js). Whatever the card pivots on has
 * to be the thing holding it, so the slot, the swivel and the clip all sit on
 * that edge — and the card ends up propped on its own clip, which is both
 * correct and a better image than a card standing on nothing.
 *
 * DIMENSIONS ARE REAL. A CR80 badge is 54 x 86 mm and surfaces.js puts the
 * scene at 3.2 units per metre, so the card is 0.173 x 0.275 before its
 * holder. The values below are that card in a sleeve. A bulldog badge clip is
 * ~10 mm across the jaw, hence 0.032.
 */

const CARD_WIDTH = 0.19;
export const CARD_HEIGHT = 0.30;
const CARD_THICKNESS = 0.008;

const SLEEVE_MARGIN = 0.008; // how far the holder stands out past the card
const SLEEVE_THICKNESS = 0.004;
const SLEEVE_WIDTH = CARD_WIDTH + SLEEVE_MARGIN * 2;
const SLEEVE_DEPTH = CARD_HEIGHT + SLEEVE_MARGIN * 1.5;

const SLOT_WIDTH = 0.026; // the punched hole the clip threads through
const SLOT_DEPTH = 0.026;

// The clip, jaw-first. Authored flat, with the thickness already in y, so
// nothing here needs the card's quarter turn.
const CLIP_WIDTH = 0.032;
const JAW_THICKNESS = 0.0035;
const HINGE_RADIUS = 0.005;
const UPPER_JAW_DEPTH = 0.036;
const LOWER_JAW_DEPTH = 0.032;
const LIP_DEPTH = 0.0035;
const LIP_HEIGHT = HINGE_RADIUS * 1.6;

// The jaws sit on the hinge barrel rather than at heights of their own: the
// lower one on the desk, the upper one high enough on the barrel to leave the
// closed gap between them visible from the side. The lip stands UP off the
// upper jaw, away from the other jaw, which is the direction that makes it a
// thing you press rather than a second jaw.
const UPPER_JAW_Y = HINGE_RADIUS * 1.9;
const LIP_Y = UPPER_JAW_Y - JAW_THICKNESS / 2 + LIP_HEIGHT / 2;

/**
 * THE CARD LIES FLAT BY ROTATION, NOT BY CHOOSING A DIFFERENT FACE.
 * scene/partMesh.js maps drawn artwork onto BoxGeometry's +z face and only
 * that one. Rotating the box a quarter turn backwards about X sends local +z
 * to world +y — so the badge reads face-up off the desk, and `BOX_FRONT_FACE`
 * keeps meaning exactly one thing everywhere in the scene.
 *
 * The same turn sends the box's own height (CARD_HEIGHT) to world z, which is
 * why the card's footprint is WIDTH across and HEIGHT deep. Nothing else in
 * this file needs the turn, because nothing else is printed — the holder and
 * the hardware are authored flat, with their thickness already in y.
 */
const CARD_ROTATION = [-Math.PI / 2, 0, 0];

// Where the hardware sits, in z, working forward from the card's near edge.
// Every one of these is the previous piece's front edge plus its own half
// depth, so the assembly is a chain rather than five independently chosen
// numbers — nudging the slot carries the whole clip forward with it, which is
// what physically happens.
const SLEEVE_FRONT = SLEEVE_DEPTH / 2;
const SLOT_Z = SLEEVE_FRONT + SLOT_DEPTH / 2;
const SWIVEL_Z = SLOT_Z + 0.016;
const HINGE_Z = SWIVEL_Z + 0.015 + HINGE_RADIUS;
const UPPER_JAW_Z = HINGE_Z + UPPER_JAW_DEPTH / 2;
const LOWER_JAW_Z = HINGE_Z + LOWER_JAW_DEPTH / 2;
const LIP_Z = UPPER_JAW_Z + UPPER_JAW_DEPTH / 2 + LIP_DEPTH / 2;

/**
 * The front of the whole assembly, which two other files need by name.
 *
 * It is the point the badge is propped on when it stands up — content's
 * `anchor.present.pivot` is this, because a pivot anywhere behind it swings
 * whatever is in front of it down through the desktop — and it is the front of
 * LANYARD_FOOTPRINT, which is what the desk's spacing chain is measured
 * against.
 */
export const BADGE_FRONT = LIP_Z + LIP_DEPTH / 2;

/**
 * The whole object's footprint on the desk, as [minX, maxX] x [minZ, maxZ]
 * from the group origin, before the group's own yaw.
 *
 * DERIVED NOW, WHERE IT USED TO BE WRITTEN OUT. The old strap wandered on a
 * seeded walk, so no expression described where it ended up and the four
 * numbers had to be measured and typed in — with a test walking every part of
 * every seed to catch them drifting apart. What is left is four rigid pieces
 * in a fixed chain, and for that a literal would be strictly worse: it could
 * go stale silently the moment a jaw got longer. The containment test stays,
 * because it is now checking the chain rather than a transcription.
 *
 * The badge is SYMMETRIC IN X, which the old footprint was very much not —
 * the strap sprawled 0.36 to the left against 0.12 to the right. That is the
 * change the desk position downstream had to be re-derived for.
 */
export const LANYARD_FOOTPRINT = {
    minX: -SLEEVE_WIDTH / 2,
    maxX: SLEEVE_WIDTH / 2,
    // The holder's back edge, not the card's — the sleeve is the deeper of
    // the two and this used to be written out as a value 2 mm behind it.
    minZ: -SLEEVE_DEPTH / 2,
    maxZ: BADGE_FRONT
};

/**
 * Which parts stand up when the object is focused.
 *
 * scene/partMesh.js collects every part tagged this way into one child group,
 * and artifactStrategy rotates that group about `anchor.present.pivot`. The
 * card, its holder and the hardware holding it are the badge; the strap is
 * not, and tagging it too would tip the whole lanyard up like a cardboard
 * cutout instead of standing a card on the end of a strap that stays put.
 */
const LIFTS = 'lift';

/**
 * @param {{
 *   org: string,
 *   role: string,
 *   cardColor: string,
 *   strapColor: string,
 *   accent?: string,
 *   access?: string,
 *   year?: string
 * }} config
 *        `access` and `year` are printed on the card (see scene/badgeCanvas.js)
 *        and omitting them simply leaves those lines off.
 *
 *        THERE IS NO `seed` ANY MORE. It varied the old strap's fall, because
 *        six identically-coiled straps would have read as one asset placed six
 *        times. Six identical clips do not have that problem — they read as
 *        six badges from six employers, which is what they are, and a clip
 *        that fell differently per job would be the odd thing.
 * @returns {{ parts: object[] }} an `artifact` for a Work, and equally the
 *          `parts` of a desk object — the two shapes are the same on purpose.
 */
export function buildLanyard({ org, role, cardColor, accent, access, year }) {
    const parts = [
        // The holder, under the card and standing a few millimetres proud of
        // it on every side. Rigid PVC rather than the soft wallet kind: low
        // roughness and a high environment intensity is what makes a flat grey
        // slab read as plastic instead of as card.
        {
            type: 'box',
            args: [SLEEVE_WIDTH, SLEEVE_THICKNESS, SLEEVE_DEPTH],
            position: [0, SLEEVE_THICKNESS / 2, 0],
            rotation: [0, 0, 0],
            color: '#cfd2d6',
            material: { roughness: 0.18, metalness: 0, envMapIntensity: 1.5 },
            pose: LIFTS
        },
        // The punched end, as two pieces with the slot between them. A hole in
        // a box is not something BoxGeometry can express, and at this size the
        // gap reads as a punch as long as the two sides line up with the
        // holder's own edges.
        ...[-1, 1].map((side) => ({
            type: 'box',
            args: [(SLEEVE_WIDTH - SLOT_WIDTH) / 2, SLEEVE_THICKNESS, SLOT_DEPTH],
            position: [
                (side * (SLEEVE_WIDTH + SLOT_WIDTH)) / 4,
                SLEEVE_THICKNESS / 2,
                SLOT_Z
            ],
            rotation: [0, 0, 0],
            color: '#cfd2d6',
            material: { roughness: 0.18, metalness: 0, envMapIntensity: 1.5 },
            pose: LIFTS
        })),
        {
            type: 'box',
            args: [CARD_WIDTH, CARD_HEIGHT, CARD_THICKNESS],
            position: [0, SLEEVE_THICKNESS + CARD_THICKNESS / 2, 0],
            rotation: CARD_ROTATION,
            color: cardColor,
            badge: { org, role, ...(accent ? { accent } : {}), ...(access ? { access } : {}), ...(year ? { year } : {}) },
            // Printed PVC: matte enough not to blow out under the window, but
            // still the glossiest thing on this part of the desk.
            material: { roughness: 0.38, metalness: 0, envMapIntensity: 1.15 },
            pose: LIFTS
        },
        // THE HARDWARE, and the one metal on this part of the desk. Nickel:
        // metalness 1 and a low roughness, which against paper, card and cloth
        // is the only surface here that returns a hard highlight — and is most
        // of why the clip reads as a separate object rather than as more of
        // the holder.
        //
        // The swivel first, sitting in the slot. On a real badge this is the
        // vinyl tab the clip is riveted to; at this size it is a tab, and its
        // job is to put a join between the card and the clip so the two do not
        // read as one moulding.
        {
            type: 'box',
            args: [0.016, 0.006, 0.030],
            position: [0, 0.003, SWIVEL_Z],
            rotation: [0, 0, 0],
            color: '#b9bcc1',
            material: { roughness: 0.22, metalness: 1, envMapIntensity: 1.4 },
            pose: LIFTS
        },
        // The hinge barrel the two jaws close on. A cylinder is modelled about
        // its own +y, so a quarter turn about Z lays it across the badge — and
        // it is the only round thing on the object, which is what stops the
        // clip reading as a stack of three flat plates.
        {
            type: 'cylinder',
            args: [HINGE_RADIUS, HINGE_RADIUS, CLIP_WIDTH, 14],
            position: [0, HINGE_RADIUS, HINGE_Z],
            rotation: [0, 0, Math.PI / 2],
            color: '#b9bcc1',
            material: { roughness: 0.22, metalness: 1, envMapIntensity: 1.4 },
            pose: LIFTS
        },
        // The jaws, closed. The lower one is shorter and all but buried while
        // the badge lies flat — it earns its place when the card stands up and
        // the clip is seen edge-on, which is the shot the whole object is
        // posed for. One plate there would be a tab; two with a gap is a clip.
        {
            type: 'box',
            args: [CLIP_WIDTH, JAW_THICKNESS, UPPER_JAW_DEPTH],
            position: [0, UPPER_JAW_Y, UPPER_JAW_Z],
            rotation: [0, 0, 0],
            color: '#b9bcc1',
            material: { roughness: 0.22, metalness: 1, envMapIntensity: 1.4 },
            pose: LIFTS
        },
        {
            type: 'box',
            args: [CLIP_WIDTH, JAW_THICKNESS, LOWER_JAW_DEPTH],
            position: [0, JAW_THICKNESS / 2, LOWER_JAW_Z],
            rotation: [0, 0, 0],
            color: '#b9bcc1',
            material: { roughness: 0.22, metalness: 1, envMapIntensity: 1.4 },
            pose: LIFTS
        },
        // The turned-up lip on the upper jaw, which is the part of a bulldog
        // clip you press. It is 3.5 mm of metal and it is doing more work than
        // its size suggests: it is the only feature that says the clip OPENS,
        // and it is the front of the whole object, so it is also what the
        // badge is propped on when it stands up. @see BADGE_FRONT.
        {
            type: 'box',
            args: [CLIP_WIDTH, LIP_HEIGHT, LIP_DEPTH],
            position: [0, LIP_Y, LIP_Z],
            rotation: [0, 0, 0],
            color: '#b9bcc1',
            material: { roughness: 0.22, metalness: 1, envMapIntensity: 1.4 },
            pose: LIFTS
        }
    ];

    return { parts };
}
