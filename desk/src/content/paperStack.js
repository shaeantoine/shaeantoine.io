/**
 * A run of loose printouts, squared up but not perfectly, held by a bulldog
 * clip on the long edge.
 *
 * WHY THIS IS GENERATED AND NOT WRITTEN OUT. content/deskObjects.js otherwise
 * insists on longhand — every sleeve, frame and plant is a literal you can
 * nudge by hand, because those are compositions. This is not a composition. It
 * is n sheets at the same size with a fraction of a degree of slop between
 * them, and writing nine near-identical literals would invite someone to
 * "tidy" the slop out, which is the only thing making it read as paper. Same
 * argument content/bookRow.js makes for the same reason.
 *
 * THE SLOP IS THE ENTIRE POINT. A stack of perfectly aligned rectangles
 * renders as one box — the edges coincide, there is no shadow between them,
 * and the whole thing has a single silhouette. Offsetting each sheet by a
 * millimetre or two and a few thousandths of a radian gives every leaf its own
 * lit edge, and the stack reads as a countable number of sheets from across
 * the room.
 *
 * THE FAN IS NOT UNIFORM, and that is the fix for the version of this that
 * didn't work. The slop used to be the same everywhere and small enough
 * (0.018) that five sheets rendered as one white box with nothing printed on
 * it — an object that said nothing about what it was. Now the jitter ramps:
 * the bottom of the stack fans hard enough to count, and the top sheet sits
 * almost square, because the top sheet is the one carrying the print (see
 * `print` below) and a title block on a crooked sheet reads as a mistake.
 *
 * SEEDED, so the arrangement never reshuffles between loads or between a test
 * run and the page. Same generator as bookRow's.
 */

// Copier paper is 0.1 mm; at surfaces.js's 3.2 units/m that is 0.00032, which
// is below what the depth buffer will reliably separate at this scene's near
// plane. Sheets are drawn at 25x that — thick enough to resolve, thin enough
// that nine of them stack to about 2 cm of real-world height.
const SHEET_THICKNESS = 0.008;

// Per-sheet jitter at the BOTTOM of the stack, as a fraction of the sheet's
// own size and in radians. Both taper to `TOP_SQUARENESS` of this at the top.
const MAX_OFFSET = 0.032;
const MAX_YAW = 0.042;

// How much of that jitter the topmost sheet keeps. Not zero: a perfectly
// square top sheet on a fanned stack looks placed rather than dropped.
const TOP_SQUARENESS = 0.18;

const PAPER_COLOR = '#f7f5f0';

/**
 * Every part of this object tips up when it is focused, and that is the whole
 * of the difference from the lanyard.
 *
 * scene/partMesh.js collects the parts tagged this way into one child group and
 * focus/pose.js rotates that group about `anchor.present.pivot` — the badge
 * stands up on the end of a strap that stays lying on the desk, so only some of
 * its parts carry the tag. A clipped sheaf has no such part. The clip is what
 * makes the run rigid, the sheets are what it is clipping, and the focused
 * pages hang inside the same group (see focus/strategies/sheetStrategy.js's
 * `stage`), so tipping any subset of it would come apart in the hand. Tagging
 * everything is therefore not laziness here; it is the object.
 */
const LIFTS = 'lift';

/**
 * THE SHEETS LIE FLAT BY ROTATION, NOT BY BEING AUTHORED FLAT, and that is
 * what lets one of them be printed.
 *
 * scene/partMesh.js maps drawn artwork onto BoxGeometry's +z face and only
 * that one. A sheet authored as [width, thickness, depth] has its readable
 * face pointing at +y, which is not that face, so nothing could ever be drawn
 * on it — which is precisely why this object used to be five blank boxes.
 * Authored as [width, depth, thickness] and turned a quarter turn backwards
 * about X, local +z lands on world +y and the sheet is both flat and
 * printable. Same construction as the lanyard's badge; see content/lanyard.js.
 *
 * THE YAW HAS TO BE THE *Z* TERM, which is the part that is easy to get wrong.
 * Three composes Euler angles in XYZ order as R = Rx·Ry·Rz, so the yaw is
 * applied first, in the sheet's own upright frame. Rz turns the sheet in its
 * own plane and Rx then lays that plane down — flat, facing up, turned by the
 * yaw. Putting the yaw in the Y term instead rotates about the sheet's short
 * axis before it is laid down, which tips it off the desk on edge.
 *
 * Sign: Rx(-π/2) sends local +x to world +x and local +y to world -z, so a
 * positive Rz reads as a negative yaw about world +Y. Negated here so callers
 * and tests can talk about yaw in the same sense as every other object.
 */
const FLAT = -Math.PI / 2;

// The clip, on the left-hand long edge. NOT across the top: the top of a sheet
// is where its title block is (the page's +y runs to world -z once it is laid
// down), and a clip there covers the one part of this object that has to be
// legible from the establishing shot.
//
// THE CLIP IS ALSO THE HINGE. focus/strategies/sheetStrategy.js turns the top
// sheet by pivoting it on this edge and sweeping it left, which is what a
// clipped run of paper physically does — a stack clipped down one side cannot
// be flipped over its top, and putting the fastener and the pivot in two
// different places is the kind of wrongness that registers without being
// noticed. Move one and you have to move the other.
const CLIP_LENGTH = 0.16; // along the sheet's depth — a real bulldog clip is ~5 cm
const CLIP_REACH = 0.05; // how far it reaches in over the sheets
const CLIP_PLATE = 0.005;
const CLIP_BARREL_RADIUS = 0.009;
const CLIP_Z_FRACTION = -0.06; // just above centre down the long edge
const CLIP_COLOR = '#33363b';

// Blackened steel. The one genuinely metallic thing on this flank of the desk,
// and the whole reason it is here: the stack is matte paper from every angle,
// so the clip is what throws a specular and gives the object an edge you can
// find at a glance.
const CLIP_MATERIAL = { roughness: 0.26, metalness: 1, envMapIntensity: 1.35 };

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

/** How much of the bottom sheet's jitter sheet `index` of `count` keeps. */
function jitterScale(index, count) {
    if (count < 2) return TOP_SQUARENESS;
    return 1 - (index / (count - 1)) * (1 - TOP_SQUARENESS);
}

/** The stack's own height, which is where the clip and the focus sheets sit. */
export function paperStackHeight(sheets) {
    return SHEET_THICKNESS * sheets;
}

/**
 * @param {{
 *   sheets: number,
 *   width: number,
 *   depth: number,
 *   seed: number,
 *   print?: { title: string, credit?: string }
 * }} config
 *        `width` and `depth` are the sheet's real size in world units — A5 is
 *        0.474 x 0.672 at this scene's scale. `print` is drawn on the top
 *        sheet by scene/sheetCanvas.js; omit it and the stack is blank, which
 *        is what it looked like before and is not recommended.
 * @returns {object[]} parts, bottom sheet first, then the clip
 */
export function buildPaperStack({ sheets, width, depth, seed, print }) {
    const random = createRandom(seed);
    const parts = [];

    for (let i = 0; i < sheets; i++) {
        // Signed jitter in [-1, 1), scaled by the sheet's own dimension so a
        // bigger sheet gets proportionally bigger slop rather than the same
        // absolute wobble, and then again by where it sits in the fan.
        const scale = jitterScale(i, sheets);
        const offsetX = (random() * 2 - 1) * MAX_OFFSET * width * scale;
        const offsetZ = (random() * 2 - 1) * MAX_OFFSET * depth * scale;
        const yaw = (random() * 2 - 1) * MAX_YAW * scale;
        const isTop = i === sheets - 1;

        parts.push({
            type: 'box',
            args: [width, depth, SHEET_THICKNESS],
            // Sheet i's centre sits half a thickness above the top of sheet
            // i-1, so the bottom face of the stack rests exactly on the desk.
            position: [offsetX, SHEET_THICKNESS * (i + 0.5), offsetZ],
            rotation: [FLAT, 0, -yaw],
            color: PAPER_COLOR,
            // Uncoated laser paper: almost fully diffuse, and picking up very
            // little of the window. A glossier setting here immediately reads
            // as plastic sheet rather than as paper.
            material: { roughness: 0.94, metalness: 0, envMapIntensity: 0.75 },
            pose: LIFTS,
            ...(isTop && print ? { sheet: print } : {})
        });
    }

    const top = paperStackHeight(sheets);
    const edgeX = -width / 2;
    const clipZ = depth * CLIP_Z_FRACTION;

    parts.push(
        // The jaw lying over the sheets.
        {
            type: 'box',
            args: [CLIP_REACH, CLIP_PLATE, CLIP_LENGTH],
            position: [edgeX + CLIP_REACH / 2, top + CLIP_PLATE / 2, clipZ],
            rotation: [0, 0, 0],
            color: CLIP_COLOR,
            material: CLIP_MATERIAL,
            pose: LIFTS
        },
        // The back of the jaw, wrapping the edge down to the desk.
        {
            type: 'box',
            args: [CLIP_PLATE, top + CLIP_PLATE, CLIP_LENGTH],
            position: [edgeX - CLIP_PLATE / 2, (top + CLIP_PLATE) / 2, clipZ],
            rotation: [0, 0, 0],
            color: CLIP_COLOR,
            material: CLIP_MATERIAL,
            pose: LIFTS
        },
        // The spring barrel along the fold. A cylinder is modelled up the Y
        // axis, so a quarter turn about X lays it along Z, down the edge.
        //
        // Sunk to the stack's own top rather than sitting proud of it, which
        // is not cosmetic: the focused sheets float a millimetre above the
        // stack (see `anchor.height` in content/deskObjects.js), and a barrel
        // standing higher than they do would spear the page they draw.
        {
            type: 'cylinder',
            args: [CLIP_BARREL_RADIUS, CLIP_BARREL_RADIUS, CLIP_LENGTH * 0.98, 14],
            position: [edgeX - CLIP_PLATE, top - CLIP_BARREL_RADIUS * 0.2, clipZ],
            rotation: [Math.PI / 2, 0, 0],
            color: CLIP_COLOR,
            material: CLIP_MATERIAL,
            pose: LIFTS
        }
    );

    return parts;
}

/**
 * The object's footprint on the desk, as [minX, maxX] x [minZ, maxZ] from the
 * group origin, before the group's own yaw.
 *
 * ASYMMETRIC, which is why this replaced the half-extents pair it used to
 * return: the clip hangs off the left edge and nothing hangs off the right, so
 * a symmetric bound would either miss the clip or reserve desk space on the
 * wrong side. content/deskObjects.test.js checks clearances through this.
 *
 * @param {{ sheets: number, width: number, depth: number }} config
 */
export function paperStackFootprint({ sheets, width, depth }) {
    const scale = jitterScale(0, sheets); // the bottom sheet, which fans widest
    const slopX = MAX_OFFSET * width * scale;
    const slopZ = MAX_OFFSET * depth * scale;
    // A yawed rectangle projects wider than itself; at these angles the term
    // is tiny, but including it keeps the bound honest rather than optimistic.
    const yaw = MAX_YAW * scale;
    const yawGrowthX = (Math.abs(Math.sin(yaw)) * depth) / 2;
    const yawGrowthZ = (Math.abs(Math.sin(yaw)) * width) / 2;

    // The two things that reach left are the fanned sheets and the clip, and
    // they do not add up — whichever reaches further is the edge. Summing them
    // would reserve desk space for an overhang that isn't there, on the flank
    // where the space is tightest.
    return {
        minX: -Math.max(width / 2 + slopX + yawGrowthX, width / 2 + CLIP_PLATE + CLIP_BARREL_RADIUS),
        maxX: width / 2 + slopX + yawGrowthX,
        minZ: -(depth / 2 + slopZ + yawGrowthZ),
        maxZ: depth / 2 + slopZ + yawGrowthZ
    };
}
