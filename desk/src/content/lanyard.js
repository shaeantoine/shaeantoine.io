/**
 * One lanyard: an ID card in a holder, lying face-up on the desk with its
 * strap sprawling away from the clip.
 *
 * WHY THIS IS A FUNCTION AND NOT A PILE OF LITERALS. Two callers need
 * byte-identical output. The desk object (content/deskObjects.js) rests as the
 * first job's lanyard, and that same job's `artifact` is what artifactStrategy
 * shows when you focus it — validateDeskLayout enforces that they match,
 * because if they ever diverge the object would visibly change the instant you
 * clicked it while appearing to do nothing. Generating both from one call makes
 * that impossible to get wrong rather than merely tested for.
 *
 * WHY EVERY BADGE CARRIES ITS OWN STRAP. artifactStrategy reparents the whole
 * resting group into the first project's slot on mount, so anything shared —
 * a single strap the cards swap on top of — would walk off the desk the first
 * time an arrow was pressed. It is also just true: every lanyard has a lanyard.
 *
 * WHAT CHANGED, AND WHY. The first version of this was a card and three flat
 * rectangles standing in for a strap. It had no volume anywhere: nothing in it
 * could catch the window, so from the establishing shot it read as a pale smear
 * and from the focus camera it read as a printed sticker. It now has the three
 * things that make a badge a badge —
 *
 *   a HOLDER, whose rim is the only reason the card looks like it is *in*
 *   something rather than printed on the desk;
 *   a SLOT AND A SWIVEL CLIP, which is the piece of hardware, and the one
 *   surface here that returns a hard specular;
 *   a STRAP THAT TWISTS, because woven tape lying on a desk is never flat, and
 *   segments that share one normal read as a painted line no matter how they
 *   are arranged.
 *
 * THE CLIP IS AT THE NEAR EDGE, WHICH IS A FOCUS DECISION. Focusing the object
 * tips the card up on its near edge so its face meets the camera (see
 * `anchor.present` in content/deskObjects.js). Whatever the card pivots on has
 * to be the thing holding it, or the clip and the strap part company the
 * instant it moves — so the slot, the swivel and the ring all sit on that edge
 * and the strap runs away from the viewer's side. A badge dropped with its
 * lanyard sprawling toward you is also just what a badge on a desk looks like.
 *
 * DIMENSIONS ARE REAL. A CR80 badge is 54 x 86 mm and surfaces.js puts the
 * scene at 3.2 units per metre, so the card is 0.173 x 0.275 before its
 * holder. The values below are that card in a sleeve. A lanyard strap is
 * ~20 mm, hence 0.064.
 */

const CARD_WIDTH = 0.19;
const CARD_HEIGHT = 0.30;
const CARD_THICKNESS = 0.008;

const SLEEVE_MARGIN = 0.008; // how far the holder stands out past the card
const SLEEVE_THICKNESS = 0.004;
const SLEEVE_WIDTH = CARD_WIDTH + SLEEVE_MARGIN * 2;
const SLEEVE_DEPTH = CARD_HEIGHT + SLEEVE_MARGIN * 1.5;

const SLOT_WIDTH = 0.026; // the punched hole the clip threads through
const SLOT_DEPTH = 0.026;

const RING_RADIUS = 0.014;
const RING_TUBE = 0.0035;

const STRAP_WIDTH = 0.064;
const STRAP_THICKNESS = 0.006;

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
const SLEEVE_FRONT = SLEEVE_DEPTH / 2;
const SLOT_Z = SLEEVE_FRONT + SLOT_DEPTH / 2;
const SWIVEL_Z = SLOT_Z + 0.016;
const RING_Z = SWIVEL_Z + RING_RADIUS + 0.004;

/**
 * The strap, as a walk.
 *
 * Twelve short segments following a wandering path rather than three sticks in
 * a fan. The heading swings on a sine so the tape curls back on itself the way
 * dropped webbing does, and each segment takes a small ROLL about its own long
 * axis — which is the part that matters. Rolling gives neighbouring segments
 * different normals, so the window lights them unequally and the run reads as
 * fabric with a twist in it. Without it, twelve co-planar strips are one strip.
 *
 * The numbers are the ones that keep it on the desk in front of the card: at
 * these settings the walk stays inside LANYARD_FOOTPRINT, which the tests
 * check part by part. Lengthening the segments or slackening the swing is what
 * pushes it off the front edge.
 */
const STRAP_SEGMENTS = 12;
const SEGMENT_LENGTH = 0.046;
const HEADING_BIAS = -1.5; // radians off the +z axis, toward the viewer's left
const HEADING_SWING = 1.3;
const HEADING_TURNS = 2.2;
const HEADING_PHASE = 1.5;
const MAX_ROLL = 0.34;

/** Mulberry32 — the same small deterministic PRNG content/bookRow.js uses. */
function createRandom(seed) {
    let state = seed >>> 0;
    return function random() {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * The whole object's footprint on the desk, as [minX, maxX] x [minZ, maxZ]
 * from the group origin, before the group's own yaw.
 *
 * Written out rather than derived so the layout tests have something to check
 * the geometry *against* — a bound computed from the same numbers it is
 * bounding would agree with itself no matter how wrong both were.
 * lanyard.test.js walks every part and asserts containment, and also asserts
 * this is not padded far past what it bounds.
 */
export const LANYARD_FOOTPRINT = {
    minX: -0.36,
    maxX: 0.12,
    minZ: -CARD_HEIGHT / 2 - SLEEVE_MARGIN,
    maxZ: 0.39
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
 *   year?: string,
 *   seed?: number
 * }} config
 *        `access` and `year` are printed on the card (see scene/badgeCanvas.js)
 *        and omitting them simply leaves those lines off. `seed` varies the
 *        strap's fall between jobs — six identically-coiled straps would read
 *        as one asset placed six times.
 * @returns {{ parts: object[] }} an `artifact` for a Work, and equally the
 *          `parts` of a desk object — the two shapes are the same on purpose.
 */
export function buildLanyard({ org, role, cardColor, strapColor, accent, access, year, seed = 1 }) {
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
        // The swivel, sitting in the slot, and the split ring in front of it.
        // Nickel: metalness 1 and a low roughness, which on this desk of paper
        // and cloth is the only surface that returns a hard highlight.
        {
            type: 'box',
            args: [0.016, 0.006, 0.030],
            position: [0, 0.003, SWIVEL_Z],
            rotation: [0, 0, 0],
            color: '#b9bcc1',
            material: { roughness: 0.22, metalness: 1, envMapIntensity: 1.4 },
            pose: LIFTS
        },
        {
            type: 'torus',
            args: [RING_RADIUS, RING_TUBE, 8, 18],
            // A torus is modelled in the XY plane, so the same quarter turn the
            // card takes lays the ring flat on the desk.
            position: [0, RING_TUBE, RING_Z],
            rotation: [-Math.PI / 2, 0, 0],
            color: '#b9bcc1',
            material: { roughness: 0.22, metalness: 1, envMapIntensity: 1.4 },
            pose: LIFTS
        }
    ];

    const random = createRandom(seed);
    let x = 0;
    let z = RING_Z + RING_RADIUS + RING_TUBE;

    for (let i = 0; i < STRAP_SEGMENTS; i++) {
        const t = i / (STRAP_SEGMENTS - 1);
        const heading =
            HEADING_BIAS +
            HEADING_SWING * Math.sin(t * Math.PI * HEADING_TURNS + HEADING_PHASE) +
            (random() - 0.5) * 0.16;
        const roll = (random() * 2 - 1) * MAX_ROLL;
        // A box's long axis is its local +x; a yaw of h - π/2 points that axis
        // along the heading, measured from +z.
        const yaw = heading - Math.PI / 2;

        const dx = Math.sin(heading) * SEGMENT_LENGTH;
        const dz = Math.cos(heading) * SEGMENT_LENGTH;

        // THE ROLL TIPS THE SEGMENT, SO IT HAS TO BE LIFTED OFF THE DESK BY
        // EXACTLY WHAT IT DROPS. Composed as XYZ, the roll is applied about the
        // world X axis rather than the segment's own, which tilts the ends and
        // the long edges by these two terms. Left at a flat thickness/2 the low
        // corner sinks through the desktop, and a strap half-buried in the desk
        // is a far worse artefact than one lying a millimetre high.
        const endDrop = Math.abs(Math.sin(yaw) * Math.sin(roll)) * (SEGMENT_LENGTH / 2);
        const edgeDrop = Math.abs(Math.cos(yaw) * Math.sin(roll)) * (STRAP_WIDTH / 2);

        parts.push({
            type: 'box',
            args: [SEGMENT_LENGTH, STRAP_THICKNESS, STRAP_WIDTH],
            position: [x + dx / 2, STRAP_THICKNESS / 2 + endDrop + edgeDrop, z + dz / 2],
            rotation: [roll, yaw, 0],
            color: strapColor,
            // Woven polyester. Nearly fully rough and barely picking the room
            // up, which is what keeps the strap from reading as plastic.
            material: { roughness: 0.92, metalness: 0, envMapIntensity: 0.7 }
        });

        x += dx;
        z += dz;
    }

    return { parts };
}
