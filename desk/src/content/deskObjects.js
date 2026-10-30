import { CATEGORY_LABELS } from './schema.js';
import { buildBookRow } from './bookRow.js';
import { BOOKS } from './books.js';
import { buildPaperStack, paperStackHeight, paperStackFootprint } from './paperStack.js';
import { BADGE_FRONT } from './lanyard.js';
import { workExperience } from './works/work.js';
import { academia } from './works/academia.js';

// A5 at surfaces.js's 3.2 units/m, and how many of them are in the stack.
// Pulled out because three separate things are derived from them below: the
// sheets themselves, the height the focused pages float at, and the size those
// pages are drawn.
const SHEET_SIZE = [0.474, 0.672];
const SHEET_COUNT = 9;

/**
 * THE STACK TIPS UP ON ITS FRONT EDGE WHEN FOCUSED, the way the lanyard's badge
 * stands up on its clip, and these are the two numbers that say how far and
 * about what. Read with `focus.anchor.present` on the paper-stack entry below,
 * which is the only place they are used; they live up here because the pivot is
 * derived from the object's own footprint rather than typed.
 *
 * 40° IS A DRAFTING BOARD, not a card standing to attention. The badge goes to
 * 66° because a laminated card propped against something is a plausible object;
 * a run of loose A5 held by one edge clip is not, past a reading slope. At 40°
 * the sheaf still reads as resting on the desk, and it is enough to bring the
 * camera down from 62° above the desktop to 38° — which is the whole point of
 * doing it. @see the `camera` block below, and the original site's
 * focus/pose.js, which applied it.
 *
 * THE PIVOT IS THE FOOTPRINT'S FRONT EDGE, NOT THE SHEET'S. A rigid rotation
 * sends everything in front of the hinge downward, so the hinge has to be at
 * the outermost point of the lifted assembly or the part beyond it goes through
 * the desktop. Here that is not the nominal sheet edge at depth/2 = 0.336 but
 * the bottom of the fan, which content/paperStack.js's jitter carries out to
 * 0.367 — the difference between nothing sinking and the widest-fanned corner
 * dipping a couple of millimetres under the desk. Taken from
 * paperStackFootprint so it cannot drift when the fan is retuned; a test in
 * deskObjects.test.js simulates the pose and fails if any part goes under.
 *
 * THAT BOUND IS CONSERVATIVE BY ABOUT 0.020, because it bounds the widest fan
 * the generator could draw rather than the one this seed drew, so tipping about
 * it lifts the front corner 0.013 clear of the desk instead of leaving it on
 * it. Accepted rather than solved: DeskScene.holdLift already raises this object
 * 0.022 for the whole focus session by design, so an exact pivot would close the
 * smaller half of a gap that is there on purpose.
 */
const STACK_TILT = 0.698; // 40°, in radians
const STACK_PIVOT_Z = paperStackFootprint({
    sheets: SHEET_COUNT,
    width: SHEET_SIZE[0],
    depth: SHEET_SIZE[1]
}).maxZ;

/**
 * Each entry places one object on the desk. `model.material` is optional and
 * overrides the .glb's own PBR scalars at load time — see
 * scene/materialOverrides.js for why that's needed at all. Objects built from
 * primitives take the same block per part as `parts[n].material`, overriding
 * DeskScene's PART_MATERIAL_DEFAULTS; same fields, same ranges, same
 * load-time validation.
 *
 * These are deliberately left unset until someone has looked at the scene.
 * Choosing them is an eyes-on job, not a guess: run the dev server and read
 * the `[materials]` table each model logs to the console, which reports what
 * it actually shipped with and whether it has real texture maps or only flat
 * scalars. Then:
 *
 *   material: {
 *       roughness: 0.45,       // 1.0 exports read as unfired clay; most
 *                              // manufactured surfaces live around 0.3–0.6
 *       metalness: 0,          // must be 0 or 1 for anything physical —
 *                              // intermediate values aren't a real material
 *       envMapIntensity: 1.2   // how much of the window the surface picks up;
 *                              // the strongest "sits in the room" knob
 *   }
 *
 * THE `focus` BLOCKS ARE THE ORIGINAL SITE'S, written for the focus strategies
 * it opened objects with, and the notes inside them describe that site's
 * shots, panels and arrows. Of the four, only the display's is still read by
 * the site: the monitor module takes its camera and anchor from here
 * (modules/monitor/index.js). The breadboard and the lanyard are left out of
 * the room (core/layout.js) and the paper module replaces the stack, so the
 * other three are read by deskObjects.test.js alone.
 */
export const deskObjects = [
    {
        id: 'gaming-desk',
        category: null,
        label: null,
        clickable: false,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        definesFloor: true,
        model: { url: '/models/ikea_desk_final.glb', targetSize: 6, restAt: 'top' }
    },

    // Clickable category objects
    {
        id: 'studio-display',
        category: 'software',
        label: CATEGORY_LABELS.software,
        clickable: true,
        position: [0, 0, -0.25],
        rotation: [0, 0, 0],
        model: { url: '/models/apple_studio_display.glb', targetSize: 2.0 },
        // THE ANCHOR IS MEASURED, NOT EYEBALLED — and it has to be.
        //
        // apple_studio_display.glb draws its own screen as a single 4-vertex
        // quad with `emissiveFactor: [1, 1, 1]`: a flat white panel that makes
        // the monitor look powered on. Anything we mount to show real content
        // has to sit in front of that quad, and the quad is easy to miss,
        // because with only four vertices — one per corner — it does not show
        // up in any per-vertex sampling of the model's depth across the screen.
        //
        // Measured off models-src/apple_studio_display.glb, transformed the way
        // attachModel does (uniform scale to targetSize on the largest
        // dimension, centred in x/z, bottom rested at y=0):
        //
        //     centre   (0, 0.9606, 0.1274)
        //     size     1.9116 x 1.0700
        //     tilt     -0.1395 rad about X
        //
        // So the values below are that plane, matched in size and tilt and
        // pushed ~1 cm forward along z. Size matters as much as depth: a
        // smaller plane leaves a rim of the emissive quad glowing around the
        // content like a halo. If the display model is ever swapped, re-measure
        // — this is the one anchor in the file that cannot be guessed.
        focus: {
            visual: 'screen',
            camera: { offset: [0, 1.24, 2.10], lookAtOffset: [0, 0.961, 0.138] },
            anchor: {
                position: [0, 0.961, 0.138],
                rotation: [-0.1395, 0, 0],
                size: [1.912, 1.070],
                // WHAT `framing` MEANS, stated here because this is the first
                // object in the file that carries one and the other one points
                // at this line. It is the focused subject's own footprint at
                // the shot above, in units of the drawing buffer's HEIGHT,
                // measured off the focus camera (by an analysis script, since removed).
                // scene/textureBudget.js sizes the canvases from it, so too
                // small costs resolution and too large costs memory. Retune the
                // camera and this goes stale SILENTLY — nothing throws, and the
                // only thing that notices is the analyzer, which reprints it.
                //
                // The RESTING screen is the same canvas at a completely
                // different size — 0.44 x 0.24 at the establishing shot — and
                // is allocated from THIS number anyway: the monitor module
                // sizes its one screen canvas from it whether the camera is
                // close or across the room, as the original site sized its
                // resting and focused screens alike so they were the same
                // resolution at the instant focus swapped one for the other.
                // Sizing it to its own footprint is the obvious saving and is
                // deliberately not taken; see the note on createScreenCanvas
                // in scene/screenCanvas.js.
                framing: [1.165, 0.652]
            }
        }
    },
    {
        id: 'breadboard',
        category: 'hardware',
        label: CATEGORY_LABELS.hardware,
        clickable: true,
        // x IS THE LEFT FLANK'S EXACT MIDPOINT, AND THIS IS THE OBJECT THAT
        // SETS THE SPACING FOR THE WHOLE DESK.
        //
        // The display's placed model spans x ±1.00 — `node
        // scripts/measure-models.mjs` reports apple_studio_display.glb at
        // targetSize 2 as 2.000 x 1.534 x 0.704, and that, not the ±0.956
        // emissive quad, is the silhouette a neighbour collides with; the
        // panel's band starts at the desktop and this station stands 0.475 off
        // it, so it is inside that band. That leaves 2.000 of desk between the
        // display's left edge and the desk's own -3.0. The station's footprint
        // rotated by the 0.6 yaw below is 1.2190 across and symmetric about the
        // group origin, so centring it at (-3.0 + -1.00) / 2 = -2.00 leaves
        // (2.000 - 1.2190) / 2 = 0.3905 to the desk edge and the same 0.3905 to
        // the monitor.
        //
        // That is the most clear desk the tightest run on this desk can offer,
        // which is why every other gap out here is set to it rather than to a
        // round number: 1 unit is 31.25 cm, so 0.3905 is 12.2 cm — a hand's
        // width of bare desk between things, which is what a person leaves.
        // deskObjects.test.js walks the whole chain and pins it.
        //
        // THE UNIT READ 0.4625 FIRST, and it is worth knowing why it was wrong,
        // because nothing looked wrong. It was derived from a station footprint
        // of 1.000 x 0.442, which is what scripts/measure-models.mjs reported
        // before it walked node transforms: soldering_station.glb is a Sketchfab
        // export whose root node carries a +90° rotation about X, so its height
        // and depth arrived transposed. The real box is 1.000 x 0.475 x 0.697,
        // which widens the rotated footprint from 1.0749 to 1.2190 and narrows
        // the unit by 0.072. attachModel has always measured with
        // `THREE.Box3().setFromObject`, so the scene was right the whole time and
        // only the arithmetic about it was wrong.
        //
        // z = -0.294 IS SOLVED BACKWARDS FROM THE LANYARD, not picked. The
        // badge's back edge is fixed at world z 0.6668 by its own front-edge
        // clearance (see its entry), so this object's front edge has to land one
        // unit behind it at 0.6668 - 0.3905 = 0.2763; the rotated footprint
        // reaches 0.5700 forward of the origin, hence -0.2937, taken to -0.294
        // for a gap of 0.3908. It is the one link in the chain measured front to
        // back rather than left to right, and it is forced rather than fudged:
        // the station and the badge measure 1.881 between them and the flank is
        // 2.000 wide, so side by side with unit gaps would need 3.05 of it.
        //
        // MOVED BACK 0.344 AND RIGHT 0.18 from [-2.18, 0, 0.05], which is also
        // right physically: bulky mains gear belongs against the books, and the
        // move opens a 1.22 x 1.16 apron (38 x 36 cm) of desk directly in front
        // of the station, which is where the work goes while soldering. That
        // apron is not empty — the badge sits in its right-front corner, taking
        // 0.16 of the width — but the middle of it, where a board would go, is
        // clear.
        //
        // THE COST IS BOOK SPINES, and it is accepted rather than overlooked —
        // projecting this silhouette into the establishing shot, the station
        // used to cover row x [-3.48, -1.97] and fully hide 3 of the 20 titled
        // spines; from here it covers [-3.05, -1.63] and fully hides 6, clipping
        // 1 either way. See the book-row entry below for why `occluded` is
        // deliberately not widened to compensate.
        //
        // NOTHING BELOW HAS TO MOVE WITH IT, but not for the reason this
        // comment used to give. `focus.camera`'s offsets are WORLD-space vectors
        // added to the group's origin (CameraRig.focusOn does plain
        // componentwise addition), so they translate with `position` and are
        // untouched by `rotation`; `focus.anchor` genuinely is group-local. The
        // yaw is the thing a rearrangement must not touch: change it and the
        // camera stays where it was while the content turns under it.
        position: [-2.0, 0, -0.294],
        rotation: [0, 0.6, 0],
        model: { url: '/models/soldering_station.glb', targetSize: 1},
        focus: {
            // The object itself is the content: the soldering station on the
            // desk is the first hardware project, and the arrows swap it for
            // the next project's object on the same spot. Whichever one you
            // leave on is the one that stays on the desk.
            //
            // `anchor.position` is where a swapped-in object stands, as a
            // local offset from this group's origin — [0, 0, 0] puts it
            // exactly where the station rests.
            //
            // `anchor.travel` is the slide, as a local-frame vector pointing
            // to the viewer's RIGHT from the focus camera. Objects move
            // against the arrow pressed, so this is the direction the
            // incoming object arrives from on a forward step. Local +x is
            // about 22° off true screen-right here, which is close enough for
            // a slide — an object leaving along it recedes slightly as it goes.
            //
            // THE AIM IS DELIBERATELY NOT THE OBJECT. It sits 0.75 to the
            // object's screen-LEFT, which swings the station into the right
            // half of the frame and leaves the left clear for the editorial
            // spread (the original site's .artifact-spread, which ended at 42%
            // of the viewport). Derived rather than guessed: screen-right in world
            // terms is normalize(cross(-view, up)) ≈ (0.976, 0, -0.216) for
            // this view vector, and the pair below puts the object's bounding
            // box inside x ∈ [0.04, 0.78] of the frame at 16:9 and
            // [0.05, 0.92] on a 3:2 window — clear of the text column at
            // both, with the tighter aspect the binding one.
            //
            // 0.58 WAS TOO LITTLE, and the reason it looked sufficient on paper
            // is that the figure written here was stale. It claimed the box
            // started at x = 0.02; measured, it started at -0.03, i.e. the
            // station still crossed the centre line and left the column and the
            // prev arrow fighting over the same 3% of frame. 0.75 is as far
            // right as the object goes before the 3:2 window clips it — the
            // limit is `keeps the whole face inside the frame` in
            // deskObjects.test.js, which allows 0.95 and this lands at 0.92.
            //
            // THE SHIFT USED TO GO THE OTHER WAY, with the column on the right.
            // It was mirrored because of what sat behind the words rather than
            // anything about the shot: this station is on the desk's left
            // flank, so pushing it left filled the right of the frame with the
            // display and the keyboard, and the spread was being read over
            // them. Pushing it right puts the bare left edge of the desk under
            // the column instead.
            //
            // AND THE AIM IS THE OBJECT'S MIDDLE, which is y = 0.237.
            //
            // THIS NUMBER WENT 0.22 -> 0.493 -> 0.237, AND THE ROUND TRIP IS THE
            // POINT. 0.22 was roughly right. It was raised to 0.493 on the
            // reasoning that the station is "very nearly as tall as it is wide",
            // quoting scripts/measure-models.mjs at 1.000 x 0.986 x 0.442 — but
            // that reading transposed the model's height and depth (the .glb's
            // root node carries a +90° rotation about X that the script did not
            // walk at the time; see the note on x above). The station is
            // 1.000 x 0.475 x 0.697, so it rests entirely within y ∈ [0, 0.475]
            // and 0.493 was aiming 0.018 ABOVE ITS TOP — off the object
            // altogether, which pushed it to the bottom of the frame.
            //
            // 0.237 is half of the measured 0.475, i.e. the middle, which is
            // what the 0.493 was trying to be. Re-run
            // `node scripts/measure-models.mjs` before touching it; the script
            // is transform-aware now and the reported box is the one attachModel
            // actually builds.
            visual: 'artifact',
            camera: { offset: [1.006, 1.423, 1.865], lookAtOffset: [-0.732, 0.237, 0.162] },
            anchor: { position: [0, 0, 0], travel: [0.45, 0, 0.02] }
        }
    },

    // THE JOBS, as a clip-on ID badge lying face-up on the desk.
    //
    // WHY A BADGE. Every other clickable object here is the thing that was
    // made — a screen, a page, a board. A job doesn't produce an object; it
    // produces a laminated card you stop noticing in week one and then keep
    // forever. That is the honest prop, and it is also the one that cannot
    // become a trophy shelf, which matters for a category that is otherwise
    // six prestigious names in a row.
    //
    // THE RESTING PARTS ARE THE FIRST JOB'S ARTIFACT, generated from the same
    // call. The original site's validateDeskLayout compared them and threw if
    // they drifted, because a mismatch would make the object visibly change the
    // instant it was clicked while appearing to do nothing at all. See
    // content/lanyard.js.
    //
    // BOTH COORDINATES ARE SOLVED FROM LANYARD_FOOTPRINT, which is why they
    // moved when the object lost its lanyard strap. The badge used to sprawl
    // 0.36 to its own left and 0.39 forward; it is now symmetric at ±0.103 and
    // reaches 0.2445 forward, so every gap measured against it changed and
    // neither number could simply be left alone. Both are solved by the same
    // arithmetic the chain test in deskObjects.test.js walks.
    //
    // x IS THE SPACING UNIT MEASURED OFF THE KEYBOARD. The keyboard's
    // conservative 1.0 x 1.0 box begins at x = -0.5, so this object's right edge
    // has to land one unit short of it at -0.5 - 0.3905 = -0.8905 (the unit is
    // derived at the breadboard above). The rotated footprint puts maxX 0.1937
    // right of the origin, so x = -1.0842, written -1.084 for a gap of 0.3903.
    // THREE DECIMALS ARE NEW TO THIS FILE and they are worth about a millimetre
    // here: the extra digit is what keeps the chain's spread at half a
    // millimetre rather than letting rounding widen it. Still inside the test's
    // tolerance, deliberately, but the digit is the point of the number.
    //
    // z IS THE SAME UNIT MEASURED OFF THE BENCH, IN DEPTH. The station and the
    // badge cannot sit side by side — 1.881 of object does not fit in a 2.000
    // flank — so the one link in this chain that runs front to back is this
    // one. The bench's footprint ends at z 0.2760, the rotated badge starts
    // 0.1844 behind its own origin, so z = 0.3905 + 0.2760 + 0.1844 = 0.8509.
    //
    // THE FRONT EDGE NO LONGER BINDS, and it used to be the thing that set this
    // number outright: the coil reached world z 1.3629 against a desk edge of
    // 1.44, i.e. 0.077 of air, and z was pulled back from 1.10 to 0.86 to buy
    // it. The badge now finishes at 1.1162 with 0.32 to spare, so depth spacing
    // gets to decide instead of clearance. A test still checks the edge.
    //
    // MOVED IN FROM x = -2.42, and the move is a plausibility fix as much as a
    // spacing one: out there the badge lay in the middle of the soldering
    // station's working apron, which is the last place its owner would leave it.
    // Here it is in the drop zone immediately left of the keyboard, under the
    // free left hand of a right-hander whose right hand is on the mouse.
    //
    // WORTH RECORDING SO NOBODY "FIXES" IT: at this x the badge's right edge
    // finishes 0.038 INSIDE the display's x span rather than clear of it. That is
    // not a collision, and pushing the object left to tidy it would spend the
    // gap derived above. From the establishing shot the two never touch — the
    // badge tops out at NDC y -0.56 and the monitor's silhouette does not begin
    // until -0.44 — and they are 0.565 apart front to back, which is the axis
    // the two-axis overlap test finds them clear on.
    {
        id: 'lanyard',
        category: 'work',
        label: CATEGORY_LABELS.work,
        clickable: true,
        position: [-1.084, 0, 0.851],
        rotation: [0, 0.42, 0],
        // A card is 8 mm thick. The desk's default 0.06 raises it eight card
        // thicknesses, which reads as a bug rather than as a hover.
        hover: { lift: 0.018 },
        // Not a second call to buildLanyard — the first job's own artifact,
        // by reference. The resting prop and the first project are required to
        // be the same object and this makes them literally the same array, so
        // there is no version of this that can drift.
        parts: workExperience[0].artifact.parts,
        focus: {
            // Same cycling model as the hardware bench: the badge on the desk
            // is the first job and the arrows swap it for the next one on the
            // same spot. `travel` runs along local +x, which after this group's
            // 0.42 yaw is close enough to the viewer's right from this camera.
            visual: 'artifact',
            // THE CARD STANDS UP. Lying flat, the one surface worth looking at
            // was the one the camera saw most obliquely, and no amount of
            // moving the camera fixes that without ending up directly overhead
            // — which loses the room, the desk and the shadow all at once. So
            // the card tips up on its near edge instead and the camera stays
            // where a person's eyes would be.
            //
            // 1.15 rad is 66° from the desk: standing, leaning back about 24°,
            // which is a card propped against something rather than a card
            // held to attention.
            //
            // THE PIVOT IS THE FRONT OF THE HARDWARE, NOT THE FRONT OF THE
            // CARD, and the difference is the whole correctness of the move. A
            // rigid rotation sends everything IN FRONT of the pivot downward:
            // hinge on the card's own edge and the slot, the swivel and the
            // clip — all of which sit forward of it — swing straight through
            // the desktop, five centimetres under a desk they are supposed to
            // be resting on. Putting the hinge at the outermost point of the
            // lifted assembly leaves nothing forward of it to sink, and lands
            // it on the clip's own lip — so the badge stands propped on the
            // piece of hardware whose job is to hold it up, which is both
            // correct and a better image than a card standing on nothing.
            // A test simulates the pose and fails if any lifted part goes below
            // the desk; it is the assertion to keep if these numbers change.
            //
            // TAKEN BY NAME (content/lanyard.js's BADGE_FRONT) RATHER THAN
            // TYPED. It was a literal 0.2205 while it was the front of a split
            // ring, and a literal is exactly what goes stale the next time the
            // hardware is resized — silently, because the failure is parts
            // dipping below a desktop nobody is looking under.
            //
            // THE FRAMING FOLLOWS FROM THE POSE, and every number in it is
            // derived rather than eyeballed. At 1.15 rad the card's face normal
            // is local (0, 0.408, 0.913), which this group's 0.42 yaw carries
            // to world (0.372, 0.408, 0.833) — so the camera stands along that
            // vector to meet the card square on. The standing card's centre
            // works out at local (0, 0.205, 0.138) and the camera sits 1.10 out
            // along the normal from it.
            //
            // `lookAtOffset` is that centre plus a shift along screen-LEFT —
            // -normalize(cross(-normal, up)) ≈ (-0.913, 0, 0.408) — which swings
            // the card into the right third and leaves the left clear for the
            // editorial spread (the original site's .artifact-spread).
            // Screen-right is taken from the UNSHIFTED shot, i.e. from the
            // normal the camera stands on rather than from the aimed view
            // vector, which is a different axis once the shift has been
            // applied. Both offsets are
            // WORLD-space; see CameraRig.focusOn.
            //
            // THE SHIFT USED TO GO THE OTHER WAY. The column moved to the left
            // of the viewport because the desk's middle — display, keyboard,
            // clutter — was ending up behind it; the badge sits on the left
            // flank, so mirroring the shift puts the empty left edge of the
            // desk under the words instead. Same 0.33, opposite sign.
            //
            // THE SHIFT SCALES WITH THE DISTANCE, which is why it moved from
            // 0.20 to 0.33 when the camera pulled back. It is a world-space
            // slide against a frame that grows with distance, so a fixed shift
            // would have let the card drift back toward the middle of the frame
            // and under the text column the moment the shot changed.
            //
            // 1.10 OUT, AND THE CARD ITSELF ASKED FOR IT. Nothing here is read
            // off a page — the words are in the DOM spread — so this shot is not
            // held back by type the way the paper stack is, and the only thing
            // that decides the distance is how big a 0.30 card should be in
            // frame.
            // scene/badgeCanvas.js draws the print for "a focus camera that
            // fills a third of the frame with it", which is where this lands
            // (37% of frame height). The first pass at this stood 0.68 out and
            // filled 60% — nearly double what the canvas was drawn for, from
            // 21 cm away, with the camera down at 0.48 where it was reading the
            // desk almost edge-on.
            camera: { offset: [0.471, 0.676, 1.056], lookAtOffset: [-0.238, 0.226, 0.272] },
            anchor: {
                position: [0, 0, 0],
                travel: [0.34, 0, 0.02],
                present: { pivot: [0, 0, BADGE_FRONT], rotation: [1.15, 0, 0] }
            }
        }
    },

    // THE RESEARCH, as a clipped run of stapled printouts.
    //
    // WHY NOT A BOUND BOOK. A stapled run of A5 printouts is simply what
    // undergraduate research physically is — it comes out of a printer, it gets
    // a clip, and it stays a loose sheaf. A hardback would claim a finish and a
    // permanence the work does not have, and it would say so in silhouette,
    // which is the only thing the establishing shot gives this object to say it
    // with.
    //
    // WHY IT NOW HAS A CLIP AND A PRINTED TOP SHEET. The first version of this
    // was five blank sheets with a millimetre of slop between them, and it
    // failed at the only thing an object on this desk has to do: it did not
    // say what it was. Five white rectangles the same size, all matte, all the
    // same colour, render as one white box — there is no silhouette to find
    // and nothing printed to read. So the stack now fans (content/paperStack.js
    // ramps the slop, widest at the bottom), a bulldog clip down the left edge
    // gives it the one hard specular on an object otherwise made entirely of
    // matte paper, and the top sheet carries the first paper's own title block,
    // drawn by scene/sheetCanvas.js.
    //
    // SHEET SIZE IS REAL. A5 is 148 x 210 mm; at surfaces.js's 3.2 units/m
    // that is 0.474 x 0.672, which is what SHEET_SIZE above is. A4 was the
    // first instinct and does not fit the front row: at 0.672 x 0.950, turned
    // onto this object's yaw, a single sheet reaches world z 1.382 against a
    // desk edge of 1.44 — 1.8 cm of clearance, which is not a clearance.
    {
        id: 'paper-stack',
        category: 'academia',
        label: CATEGORY_LABELS.academia,
        clickable: true,
        // CROSSED THE DESK, from [-1.30, 0, 0.88] to the right flank, and the
        // page turn is the reason. The clip is on the stack's left edge and the
        // original site's sheetStrategy swept the sheet leftward, which is a
        // right-handed turn: grab the free right edge, swing it over the clip.
        // This file already establishes a right-handed user by putting the
        // mouse at x = +0.8, so the printouts belong past the mouse and the
        // mains-powered bench belongs on the other side, out of the sweep of
        // the mouse hand.
        //
        // x = 1.862 IS THE SPACING UNIT MEASURED OFF THE MOUSE HAND. The mouse's
        // own model bounds are useless for this — computer_mouse.glb places at
        // 0.157 x 0.100 x 0.300, a ground footprint of 4.9 x 9.4 cm, far too
        // small to reserve what a hand needs. What this is spaced from is a
        // MOUSING ZONE of 0.70 x 0.58 (22 x 18 cm of hand-and-mouse travel)
        // centred on the mouse, so x ∈ [0.45, 1.15], and the zone's right edge
        // at 1.15 is the terminator. minX therefore has to land at
        // 1.15 + 0.3905 = 1.5405, and the rotated footprint puts minX 0.3214
        // left of the origin, so x = 1.8619 for a gap of 0.3906. The zone is a construct and nothing in the repo reserves
        // it: it is not an object, so it must never be fed to the pairwise
        // overlap test, and its 1.15 is the same number as the book row's
        // `occluded` bound by pure coincidence.
        //
        // THE 0.745 LEFT OVER AT THE OUTER END IS A MARGIN, NOT A LINK — 0.28
        // wider than the unit, and parked at the far corner on purpose. That is
        // the least reachable desk on this object, it is the desk a narrower
        // window crops first (at 3:2 this object's outer corner is the closest
        // thing on the desk to the frame edge, at NDC 0.81 against the four
        // clickables' next-worst 0.78), and it is what buys the focused page its
        // band of plain desk: measured at
        // the page's own depth, the desk's right edge projects no closer than
        // NDC x 0.98 at 16:9 and falls off frame entirely at 3:2, against a page
        // that reaches 0.34. The tidier alternative, x = 2.075 for a symmetric
        // 0.604 / 0.604 right flank, takes this link out of the even chain and
        // brings that edge in to 0.85; if someone prefers the tidy flank to the
        // tidy chain, 2.075 is the number.
        //
        // z = 0.86, two hundredths back from the old 0.88, puts it on exactly the
        // badge's depth line so the front row reads as a row, and leaves 0.175 of
        // front-edge clearance. Crossing the
        // desk also retires a fragile constraint: from the old position the
        // turning page's visible reach came within 0.0245 of the soldering
        // station, which is the whole reason the sweep has a test at all; that
        // margin is now 3.08. The binding neighbour has become the mouse hand,
        // which the visible sweep clears by 0.466 — one whole spacing unit.
        //
        // THE YAW IS NOT NEGOTIABLE and is untouched. For a `sheets` object the
        // camera's compass bearing has to equal the object's own yaw (the rule
        // is written out at `focus.camera` below), and the offset below already
        // stands at atan2(-0.092, 0.55) = -0.1657 against this -0.16. Move the
        // yaw and the whole shot has to be re-solved; move x or z and it simply
        // travels, because the offsets are world-space.
        position: [1.862, 0, 0.86],
        rotation: [0, -0.16, 0],
        // Scaled to the stack's own height (0.072), not to the monitor's.
        hover: { lift: 0.022 },
        // The print is the first academic work's own title and credit, by
        // reference rather than by copy — the sheet on the desk cannot show
        // something that isn't in content/works/academia.js, and cannot go
        // stale when that list is reordered. It was also the page the original
        // site's focus opened on, since its worksForCategory kept registry
        // order.
        parts: buildPaperStack({
            sheets: SHEET_COUNT,
            width: SHEET_SIZE[0],
            depth: SHEET_SIZE[1],
            seed: 20260913,
            print: { title: academia[0].title, credit: academia[0].editorial.credit }
        }),
        focus: {
            // ONE SHEET AT A TIME, TURNED ON THE CLIP. Loose printouts do not
            // open at a spine, so nothing here lays down a two-page spread:
            // making a run of stapled paper behave like a bound book would be
            // wrong on the one object that exists precisely because it is not
            // one. The sheet hinges on the clipped left edge and sweeps left,
            // which is a right-handed turn — the original site's
            // sheetStrategy.
            visual: 'sheets',
            // THE CAMERA'S BEARING IS NOT A FREE CHOICE FOR ANYTHING PRINTED,
            // and this is the only object left on the desk that it governs — so
            // the rule is written out here in full rather than pointed at.
            //
            // The page mesh is built in the anchor's frame and laid flat by
            // the original site's sheetStrategy.placeAsBed, a quarter turn
            // about X (there is no `anchor.rotation` on this object; the
            // strategy owned that turn),
            // which sends the top of the type to the object's own local -z.
            // Stand anywhere other than along that axis and the type arrives on
            // screen rotated by exactly how far off it you are. This shot used
            // to be 44° round to the right of the page, and an academic paper
            // arrived rotated 51°, which is a page you read with your head on
            // one side. So:
            //
            //   the camera's compass bearing from the page is the OBJECT'S OWN
            //   YAW, i.e. horizontally along (sin yaw, 0, cos yaw) from the
            //   page's centre. At that bearing the roll is zero by construction,
            //   at any other it is the angle between them.
            //
            // The offset below stands at atan2(-0.183, 1.111) = -0.1631 against
            // a yaw of -0.16, which measures out at 0.2° of roll.
            // deskObjects.test.js's 'puts the print the right way up on screen'
            // holds it under 8°.
            //
            // THE TILT IS WHY THIS STILL HOLDS WITH THE CAMERA MUCH LOWER. The
            // sheaf tips up about its front edge, which is a rotation about the
            // object's own local X — the camera's compass bearing is unchanged
            // by it, and a camera on that bearing stays in the object's x = 0
            // plane no matter how high or low it stands. So the tilt costs the
            // rule nothing. Rolling the sheaf instead, or tipping it about any
            // axis but this one, would cost it everything.
            //
            // WHAT IS LEFT TO CHOOSE IS THE HEIGHT AND THE DISTANCE.
            //
            // HEIGHT: 38° ABOVE THE DESK, DOWN FROM 62°, AND THE PAGE COMES UP
            // TO MEET IT. This used to be the steepest shot on the desk, for a
            // reason that no longer applies: with the page flat, height was the
            // only lever on how obliquely it was read, and 62° was as low as it
            // could go while still landing within 28° of the page's normal.
            // Nothing about that is a posture anyone adopts — it is a camera
            // looking down at a desk, and it read like one next to the badge
            // shot, where the object does the work instead and the camera sits
            // at 24°.
            //
            // So the page does the work here too now. `anchor.present` below
            // tips the whole clipped sheaf to a 40° reading slope (@see
            // STACK_TILT at the top of this file), which lets the camera come
            // down 24° and STILL read the page more square-on than before: 12°
            // off the normal against the old 28°. Both numbers moved in the
            // direction they wanted to and neither was traded for the other,
            // which is the tell that the flat page was the constraint rather
            // than the camera height.
            //
            // 38 RATHER THAN 50, which is what an exactly face-on shot would
            // want at this tilt. A page read from dead on its own normal is a
            // scan of a document; the residual 12° is what says a person is
            // looking at a thing lying on a desk in a room. It is also inside
            // the 32° that deskObjects.test.js's 'reads each face square enough
            // on' allows, with a lot more room to spare than it used to have.
            //
            // DISTANCE: 1.20, AND IT IS THE PAGE TYPE THAT SETS IT, not taste.
            // The prose is drawn ON the page — a `sheets` object has no DOM
            // panel, so there is nowhere else for the words to be — which makes
            // distance and legibility one knob turned in opposite directions.
            // This is the densest page in the scene, two columns of 30 px type
            // on a 1400 px canvas (see pageCanvas's `manuscript` stock), so the
            // legibility floor binds sooner here than it would anywhere else:
            // 1.20 out is 12.8 CSS px of body type on a 900 px viewport. The
            // floor of 12 is held from the other side by deskObjects.test.js's
            // 'leaves the page type readable at the distance it chose', which
            // carries the argument for why the 9.4 px an earlier version of this
            // shot delivered was not enough. Closer was tried too and rejected:
            // 0.85 out put the page across two thirds of the frame and read as
            // shoved in the visitor's face, with no desk left around it to say
            // where the object was.
            //
            // THE TILT BOUGHT THE 0.10 THIS MOVED OUT BY, and is the only reason
            // it could move. The distance was 1.10 while the page lay flat, and
            // what legibility actually depends on is the page's apparent size:
            // reading it 12° off the normal rather than 28° makes the same page
            // 8% taller in frame, so the camera can stand 8% further back for
            // exactly the 12.8 px it had before. Which it should — the extra
            // standoff is what keeps a 45° lens from keystoning the page and
            // leaves some desk in shot around it.
            //
            // IT STOPS SHORT OF DOM PARITY ON PURPOSE. The 17 px the DOM
            // spreads elsewhere on the original site were set in is not
            // reachable from here by enlarging the face: the two columns are
            // the tell that says "printout" rather than "book", and a column
            // this narrow is already at 30-35 characters a line, so a larger
            // face would take it down to a list of fragments. Distance alone
            // closes most of the gap and then stops, which is the right way
            // round for the densest page here.
            //
            // It is a portrait page in a landscape frame, so height is the
            // binding dimension rather than width: 66% of frame height against
            // 28% of the width.
            //
            // Unlike the bench and the lanyard there is no editorial spread to
            // leave room for — the words are on the paper — so the page is
            // centred rather than pushed into the left third.
            //
            // Both offsets are WORLD-space, measured from the group's origin;
            // see CameraRig.focusOn. They translate with `position` and do not
            // rotate with `rotation`, which is why moving this object across the
            // desk cost the shot nothing. They DO have to be re-solved if the
            // tilt changes, since the aim point rides up with the page.
            camera: { offset: [-0.183, 1.058, 1.111], lookAtOffset: [-0.032, 0.319, 0.177] },
            anchor: {
                size: SHEET_SIZE,
                framing: [0.506, 0.663], // @see the studio display's `framing`
                // THE SHEAF TIPS UP TO MEET THE CAMERA. @see STACK_TILT at the
                // top of this file for the two numbers; the mechanism it shared
                // with the badge was the original site's focus/pose.js.
                // Everything in this object carries the tag — sheets, clip, and
                // the focused pages hanging inside the same group — so what
                // tips is the whole clipped run rather than a page peeled off
                // the top of it.
                present: { pivot: [0, 0, STACK_PIVOT_Z], rotation: [STACK_TILT, 0, 0] },
                // Just clear of the stack, and of the clip standing on it. The
                // barrel reaches paperStackHeight + 0.0072 (content/paperStack.js
                // sinks it deliberately so this number can stay small); a page
                // floating any higher than a millimetre or so above the stack
                // starts to read as a page floating above a stack.
                height: paperStackHeight(SHEET_COUNT) + 0.0105,
                // Small on purpose. The object is already raised while focused
                // (DeskScene.holdLift), and a book being opened can afford to
                // rise into the shot because rising is part of opening; a stack
                // of paper that levitates off the desk is just a stack of paper
                // levitating. What little there is runs along the sheet's own
                // reading axis.
                //
                // NOT IN TENSION WITH THE TILT ABOVE, though the two look it.
                // Tipping up is a hinge: the sheaf pivots on an edge that stays
                // on the desk, which is a thing paper does when a hand picks it
                // up to read it. Translating is the object leaving the surface
                // bodily, which is not. So the tilt can be a full 40° and this
                // stays a couple of hundredths.
                approach: [-0.01, 0.02, 0.04],
                // `paper` picks the stock from pageCanvas.PAPER_STOCKS. A name
                // that is not in there falls back to the default silently rather
                // than throwing, which is what the membership assertion in
                // deskObjects.test.js is for.
                paper: 'manuscript'
            }
        }
    },

    // Non-clickable atmosphere props
    {
        id: 'keyboard',
        category: null,
        label: null,
        clickable: false,
        position: [0, 0, 1.0],
        rotation: [0, 0, 0],
        definesFloor: false,
        model: { url: '/models/keyboard_mechanical.glb', targetSize: 1}
    },
    {
        id: 'mouse',
        category: null,
        label: null,
        clickable: false,
        position: [0.8, 0, 1.0],
        rotation: [0, 0, 0],
        definesFloor: false,
        model: { url: '/models/computer_mouse.glb', targetSize: 0.3}
    },

    // The run of books along the back edge, bookended at both ends.
    //
    // WHAT IS ACTUALLY VISIBLE HERE. From the establishing shot the display
    // hides roughly |x| < 1.15 of this row — a ray from the camera to a book
    // top at z = -1.19 crosses the monitor's screen plane at 0.83× the book's
    // x, inside a panel that reaches x = ±0.956. So the middle third is behind
    // the monitor and what reads is the two flanks and the bookends. That is
    // how a real desk looks, and it is also why the books themselves are
    // placeholders: detail in the middle would be spent on nothing.
    //
    // The plant that used to stand at [-2.6, 0, -1.0] was inside this run and
    // has moved up to the ledge — see the two plant entries below.
    {
        id: 'book-row',
        category: null,
        label: null,
        clickable: false,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        // Generated rather than written out, and seeded so it never reshuffles.
        // See content/bookRow.js for why this one arrangement breaks the
        // longhand rule the rest of the file follows. The bounds stop just
        // inside each bookend's inner face.
        //
        // `occluded` is the span the display hides, derived above. Titles from
        // content/books.js are handed out in order to the books outside it, so
        // the hidden middle stays as plain colour.
        //
        // THE DISPLAY IS NOT THE ONLY THING THAT HIDES SPINES, and `occluded`
        // deliberately does not model the other one. The soldering station at
        // [-2.0, 0, -0.294] is 0.475 tall and stands in front of the left flank:
        // projecting its silhouette into the establishing shot, it fully covers
        // 6 of the 20 titled spines and clips 2 more. Widening this span to
        // cover it is the obvious fix and it does not work. buildBookRow takes
        // one span, so covering both means either an API change or a single
        // span from -3.10 to 1.15 — which strips every title off the left flank
        // and leaves 9 visible slots for 20 entries, so eleven titles go
        // unlettered and 'letters every title in the list, and none twice' in
        // deskObjects.test.js fails on `expect(lettered).toHaveLength(BOOKS.length)`.
        // Making it work means trimming
        // content/books.js, which is a content decision, not a layout one. So
        // the station's shadow is accepted: a spine behind a real object on the
        // desk is a book you cannot see, which is what a desk looks like, and it
        // widens a defect this row already had rather than adding a new kind.
        parts: buildBookRow({
            from: -2.42,
            to: 2.34,
            z: -1.19,
            seed: 20260913,
            titles: BOOKS,
            occluded: [-1.15, 1.15]
        })
    },
    {
        id: 'bookend-cube',
        category: null,
        label: null,
        clickable: false,
        // Rests bottom-down like any other prop, so nothing special is needed.
        position: [-2.70, 0, -1.19],
        rotation: [0, 0.12, 0],
        model: { url: '/models/borg_cube.glb', targetSize: 0.52 }
    },
    {
        id: 'bookend-disc',
        category: null,
        label: null,
        clickable: false,
        // THE ONE PROP WHOSE POSITION IS NOT WHERE IT LOOKS. The disc is
        // modelled lying flat — 2.329 across and 0.227 thick, with the thin
        // axis vertical — so standing it on edge means rotating the group a
        // quarter turn about X. attachModel rests the model bottom-down *before*
        // that rotation is applied, so the turn swings half the disc below the
        // desktop: a point (x, y, z) maps to (x, -z, y), which takes the disc's
        // ±half-diameter in z and makes it ±half-diameter in y.
        //
        // So y here is not zero like every other prop on the desk — it is half
        // the disc's diameter, which at targetSize 0.60 is 0.30, lifting the
        // rim back to resting on the surface. The same rotation turns the
        // disc's 0.0585 thickness into a z offset, hence the nudge back from
        // the row's centre line. Re-derive both if targetSize changes.
        //
        // Flip to -Math.PI / 2 (and z to -1.161) if the disc's face is showing
        // the wrong side.
        position: [2.66, 0.30, -1.219],
        rotation: [Math.PI / 2, 0, 0],
        model: { url: '/models/tron_disc.glb', targetSize: 0.60 }
    },

    // Two plants on the ledge, interleaved between the record sleeves so the
    // run reads album, plant, album, plant, album. Different sizes and yaws on
    // purpose: this is the same .glb twice, and two identically-scaled copies
    // would read instantly as one asset duplicated rather than as two plants.
    //
    // THE LEDGE IS FULL, and the spacing is the whole of why these x values
    // are what they are. Three 0.98 sleeves plus these two plants come to
    // 3.670 of a 4.200 board, leaving 0.530 to split six ways — four gaps
    // between items and a margin at each end, which works out at 0.083 and
    // 0.100. There is no slack left: growing either plant, or widening the
    // sleeves, pushes something off the end. The interleaved order is pinned
    // by a test rather than left to whoever edits these next.
    //
    // The ledge is also only 0.55 deep, and plant.glb's largest dimension is
    // its depth — so `targetSize` is what decides whether a plant fits on the
    // board at all, not how tall it looks. Anything over 0.5 overhangs.
    {
        id: 'shelf-plant-large',
        category: null,
        label: null,
        clickable: false,
        position: [-0.73, 1.865, -1.925], // y is the ledge's top face
        rotation: [0, 0.5, 0],
        model: { url: '/models/plant.glb', targetSize: 0.48 }
    },
    {
        id: 'shelf-plant-small',
        category: null,
        label: null,
        clickable: false,
        position: [0.78, 1.865, -1.92],
        rotation: [0, -1.9, 0],
        model: { url: '/models/plant.glb', targetSize: 0.38 }
    },

    // A picture ledge on the back wall above the display, holding leaning 12"
    // record sleeves and a flat stack of books.
    //
    // Built from primitives rather than a .glb on purpose: every object here
    // genuinely is a box, and keeping them as parts means each one's x, lean
    // and colour stays a number in this file that can be nudged by hand — which
    // is how this arrangement will actually get tuned.
    //
    // WHY A LEDGE AND NOT FLAT FRAMES. The daylight is a tight spot (BEAM_ANGLE
    // 0.3) from x = -11, so anything lying flat against this wall has a normal
    // of (0, 0, 1), lands at N·L ≈ 0.37, and sits outside the hot core besides
    // — it renders as a dim, flat rectangle. Objects standing *off* the wall
    // catch that raking light on their left-facing edges and throw shadows back
    // onto the plaster, which is the entire reason this scene reads as lit
    // rather than shaded.
    //
    // THE VERTICAL BUDGET, which is what actually constrains this object. At
    // the establishing shot (camera [0, 2.5, 5] → [0, 1, 0], 45° fov) the top
    // of frame crosses this wall at y ≈ 3.23, and the display's top lands near
    // y ≈ 1.53 — about 1.7 units of visible wall. A board (0.09) plus a 12"
    // sleeve (0.98) spends 1.07 of it, and the remaining 0.63 is split into
    // clearance above the monitor (~0.25) and headroom under the top of frame
    // (~0.38). Raising `position[1]` spends the headroom; lowering it spends
    // the clearance. There is no third pot of it.
    //
    // Vertical framing is fov-only, so that budget holds at every aspect ratio.
    // Horizontal framing is not: the board's ±2.1 stays in frame down to about
    // a square viewport and is clipped below that, which is the fallback
    // mode's problem rather than this one's.
    {
        id: 'wall-shelf',
        category: null,
        label: null,
        clickable: false,
        // The group origin sits ON the back wall plane (room.js's BACK_WALL_Z),
        // so every local z below reads directly as "how far out into the room"
        // — the only framing of that number that stays legible while nudging.
        position: [0, 1.82, -2.2],
        rotation: [0, 0, 0],
        parts: [
            // The board, matched to the room's painted trim rather than given a
            // wood of its own. Against pale plaster it mostly recedes, leaving
            // the sleeves as the objects — and it still earns its keep with a
            // highlight along its front edge and a shadow band under it. Swap
            // the colour for a warm oak here if the wall wants more weight.
            {
                type: 'box',
                args: [4.2, 0.09, 0.55],
                position: [0, 0, 0.275],
                color: '#f0ece5',
                material: { roughness: 0.45, metalness: 0, envMapIntensity: 1.0 }
            },

            // Three sleeves, leaning back onto the wall. 12" is 0.305 m, which
            // at surfaces.js's 3.2 units/m is 0.98 — they are this size because
            // records are, not because it composed nicely.
            //
            // The lean is -0.14 rad about X: parts rotate about their own
            // centre, so a negative angle swings the top toward the wall and
            // the bottom edge out onto the board. At this angle the top back
            // corner still clears the wall plane by ~0.08.
            //
            // The yaws are the point of writing these out longhand. Three
            // sleeves at identical angles read as a product shot; a couple of
            // hundredths of a radian apiece reads as someone having put them
            // there. Keep them small and unequal.
            //
            // ORDER IS NOT ARBITRARY. The window is at x = -11, so the left of
            // this shelf is the best-lit slot and the right is the dimmest.
            // The two darkest covers take the two left positions where the
            // raking light can still find them, and the bright watercolour goes
            // to the right, where it can carry the dim end on its own. Swap the
            // three `texture` lines to reorder.
            //
            // `color` is what the other five faces of each sleeve render as —
            // the card edge, not the cover — so each is sampled from its own
            // artwork rather than left at a generic grey.
            {
                type: 'box',
                args: [0.98, 0.98, 0.03],
                position: [-1.51, 0.54, 0.16],
                rotation: [-0.14, 0.03, 0],
                color: '#2a2c26',
                texture: '/art/newman.webp',
                material: { roughness: 0.82, metalness: 0, envMapIntensity: 1.1 }
            },
            {
                type: 'box',
                args: [0.98, 0.98, 0.03],
                position: [0.04, 0.54, 0.16],
                rotation: [-0.14, -0.02, 0],
                color: '#3a4048',
                texture: '/art/tool.webp',
                material: { roughness: 0.82, metalness: 0, envMapIntensity: 1.1 }
            },
            {
                type: 'box',
                args: [0.98, 0.98, 0.03],
                position: [1.51, 0.54, 0.16],
                rotation: [-0.14, 0.045, 0],
                color: '#d9d2c4',
                texture: '/art/misch.webp',
                material: { roughness: 0.82, metalness: 0, envMapIntensity: 1.1 }
            }

            // The gaps between those three sleeves are not empty: a plant
            // stands in each. They are .glb models, so they have to be their
            // own desk objects rather than parts of this one — see
            // shelf-plant-large and shelf-plant-small above, at x -0.73 and
            // 0.78, resting on the board's top face at y 1.865. Move a sleeve
            // and you have to move them too.
        ]
    },

    // Four framed film posters flanking the ledge, two to a side.
    //
    // WHY THIS NEEDED A LIGHT TO EXIST AT ALL. Every one of these four covers
    // is dark, and this wall gets almost nothing: it faces +Z, the window is a
    // 0.3 rad cone from x = -11 aimed at the desk, and the left-hand pair sits
    // 0.34 rad off that axis — outside the cone entirely. Hung as-is they would
    // be four black rectangles on grey plaster. So the arrangement comes with
    // its own pair of gallery spots (see ART_LIGHT_* in scene/lighting.js),
    // which is also just what anyone who framed four posters would do.
    //
    // THE COMPOSITION. All four share one width and take their height from
    // their own artwork's aspect ratio, so nothing is stretched and the tops
    // land at four different heights on their own. The outer pair hangs 0.22
    // higher than the inner pair — enough to read as hung by a person rather
    // than set out on a grid, not so much that it looks like a mistake. The
    // small z rolls do the same job the sleeves' yaws do on the ledge.
    //
    // THE HORIZONTAL BUDGET. The ledge ends at x = ±2.1 and the establishing
    // shot's frame edge crosses this wall at about x = ±4.4 on a 3:2 viewport
    // — the narrowest common desktop shape. Everything below lives inside
    // ±4.30, with ~0.12 of air against the ledge. Widening the frames or
    // pushing them outward spends one of those two clearances.
    {
        id: 'poster-wall',
        category: null,
        label: null,
        clickable: false,
        // Origin on the back wall plane at desktop height, so every local x/y
        // below reads directly as a world coordinate and every local z as
        // distance out from the plaster.
        position: [0, 0, -2.2],
        rotation: [0, 0, 0],
        parts: [
            // Each poster is two boxes: a frame plate, and the art standing
            // 0.006 proud of it so the border reads as a rebate rather than a
            // printed edge.
            //
            // WHY THE ART PLATE IS THE FRAME'S COLOUR. Standing proud exposes a
            // 0.006 band of the plate's own side faces all the way round, and
            // those faces take the part's base colour — `texture` only dresses
            // the front (see DeskScene's BOX_FRONT_FACE). That band was
            // #f2efe9, a mount cream all but identical to the plaster at
            // #e6e1d9, sitting directly against a #1b1a18 frame. It projects to
            // well under a pixel from the establishing shot — 0.3–0.4 CSS px —
            // which is exactly why it was easy to argue away and exactly why it
            // showed: a sub-pixel edge does not vanish, it antialiases, and a
            // near-white sliver blended onto near-black is a bright hairline
            // outlining every poster. Read as a gap with the wall behind it.
            // Matching the band to the frame removes the contrast that drew it,
            // and the rebate still reads, because the plate still casts.

            // Stalker — outer left. The most graphic of the four, so it takes
            // the far position where it has to carry on silhouette alone.
            {
                type: 'box',
                args: [0.955, 1.2951, 0.04],
                position: [-4.04, 2.00, 0.02],
                rotation: [0, 0, 0.005],
                color: '#1b1a18',
                material: { roughness: 0.35, metalness: 0, envMapIntensity: 1.2 }
            },
            {
                type: 'box',
                args: [0.895, 1.2351, 0.046],
                position: [-4.04, 2.00, 0.023],
                rotation: [0, 0, 0.005],
                color: '#1b1a18',
                texture: '/art/stalker.webp',
                material: { roughness: 0.5, metalness: 0, envMapIntensity: 1.6 }
            },

            // Whiplash — inner left. The darkest of the four and the nearest
            // to the window side, which is the only reason it is legible.
            {
                type: 'box',
                args: [0.955, 1.4038, 0.04],
                position: [-2.92, 1.78, 0.02],
                rotation: [0, 0, -0.004],
                color: '#1b1a18',
                material: { roughness: 0.35, metalness: 0, envMapIntensity: 1.2 }
            },
            {
                type: 'box',
                args: [0.895, 1.3438, 0.046],
                position: [-2.92, 1.78, 0.023],
                rotation: [0, 0, -0.004],
                color: '#1b1a18',
                texture: '/art/whiplash.webp',
                material: { roughness: 0.5, metalness: 0, envMapIntensity: 1.6 }
            },

            // Inner right. Swapped in over Tony, and resized with it:
            // lebowski.jpg is 365×547 (0.667) where the poster it replaced was
            // 2025×3000 (0.675), so keeping the old args squashed it by ~1%.
            // Small enough to look fine alone and obvious beside the others,
            // which is exactly the failure the aspect test exists to catch.
            {
                type: 'box',
                args: [0.955, 1.4013, 0.04],
                position: [2.92, 1.78, 0.02],
                rotation: [0, 0, 0.006],
                color: '#1b1a18',
                material: { roughness: 0.35, metalness: 0, envMapIntensity: 1.2 }
            },
            {
                type: 'box',
                args: [0.895, 1.3413, 0.046],
                position: [2.92, 1.78, 0.023],
                rotation: [0, 0, 0.006],
                color: '#1b1a18',
                texture: '/art/lebowski.webp',
                material: { roughness: 0.5, metalness: 0, envMapIntensity: 1.6 }
            },

            // Outer right, and the widest of the four. Swapped in over Tron:
            // Legacy, which was very nearly 2:3 — hunting.jpg is 2409×3000
            // (0.803), a full 21% wider per unit of height, so it needed the
            // largest correction of the two. It is now the SHORTEST frame on
            // the wall rather than the tallest, which is worth knowing before
            // reading the stagger: the outer pair still hangs higher than the
            // inner pair by centre, but no longer by top edge.
            {
                type: 'box',
                args: [0.955, 1.1746, 0.04],
                position: [4.04, 2.00, 0.02],
                rotation: [0, 0, -0.003],
                color: '#1b1a18',
                material: { roughness: 0.35, metalness: 0, envMapIntensity: 1.2 }
            },
            {
                type: 'box',
                args: [0.895, 1.1146, 0.046],
                position: [4.04, 2.00, 0.023],
                rotation: [0, 0, -0.003],
                color: '#1b1a18',
                texture: '/art/hunting.webp',
                material: { roughness: 0.5, metalness: 0, envMapIntensity: 1.6 }
            }
        ]
    }
];
