import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { validateDeskLayout } from './deskSchema.js';
import { deskObjects } from './deskObjects.js';
import { works } from './works/index.js';
import { BOOKS } from './books.js';
import { CATEGORY_LABELS } from './schema.js';
import { LANYARD_FOOTPRINT } from './lanyard.js';
import { paperStackFootprint, paperStackHeight } from './paperStack.js';
import { TURN_ANGLE, VISIBLE_ARC } from '../focus/strategies/sheetStrategy.js';
import { PAPER_STOCKS, metricsFor, PAGE_CANVAS_HEIGHT } from '../focus/strategies/pageCanvas.js';
import { ART_LIGHT_X } from '../scene/lighting.js';

describe('poster-wall', () => {
    const wall = deskObjects.find((object) => object.id === 'poster-wall');
    const shelf = deskObjects.find((object) => object.id === 'wall-shelf');

    // The art plates are the textured ones; the rest are their frames.
    const art = wall.parts.filter((part) => part.texture);
    const frames = wall.parts.filter((part) => !part.texture);

    // Pixel dimensions of the pristine artwork in desk/art-src — the input to
    // scripts/optimize-images.sh, not the .webp it serves. Squashed artwork is
    // the failure mode nobody spots — a poster 4% out of ratio looks fine in
    // isolation and wrong only next to the real thing — so the source aspect is
    // pinned here rather than trusted to whoever edits the box args.
    //
    // These are the *cropped* dimensions where an asset needed cropping. Read
    // them off a new file with `sips -g pixelWidth -g pixelHeight <file>`, and
    // if a file is ever re-pulled from its original source, re-crop it before
    // touching the numbers here.
    //
    // WHY THE SOURCE AND NOT THE SERVED FILE. The encoder caps the long edge at
    // 1024 and derives the other one itself, rounding up — hunting is 2409x3000
    // and comes out 823x1024 rather than the exact 822.7, which is a 0.04%
    // squash. Real, invisible, and not something to pin a 3-decimal comparison
    // against.
    // The artwork's aspect is a property of the artwork; a rounding error in a
    // derivative is not a change to it. Anything the encoder could do that
    // *would* matter — a wrong crop, a non-proportional resize — changes the
    // source too, and is caught here.
    //
    // THIS TABLE IS WHAT MAKES SWAPPING A POSTER SAFE. Changing `texture` to a
    // new file and leaving the box args alone silently stretches the new art
    // to the old one's proportions; both right-hand posters were swapped that
    // way and arrived squashed by 3% and 21% respectively. The test below
    // catches it the moment the filename changes, provided the new file is
    // measured and added here.
    const SOURCE = {
        '/art/stalker.webp': [742, 1024],
        '/art/whiplash.webp': [682, 1024],
        '/art/lebowski.webp': [365, 547],
        '/art/hunting.webp': [2409, 3000]
    };

    it('has a pinned source size for every poster actually on the wall', () => {
        // Without this, swapping in an unmeasured file makes the aspect test
        // below throw on `undefined` rather than report a stretched poster —
        // which is a far less useful thing for it to say.
        for (const part of art) {
            expect(SOURCE, `no pinned dimensions for ${part.texture}`).toHaveProperty(part.texture);
        }
    });

    it('hangs four posters, each with its own frame', () => {
        expect(art).toHaveLength(4);
        expect(frames).toHaveLength(4);
    });

    it('shows every poster at its artwork\'s true aspect ratio', () => {
        for (const part of art) {
            const [pxWidth, pxHeight] = SOURCE[part.texture];
            const [boxWidth, boxHeight] = part.args;
            expect(boxWidth / boxHeight).toBeCloseTo(pxWidth / pxHeight, 3);
        }
    });

    it('stands each art plate proud of its own frame', () => {
        // Art and frame are matched by position: a plate sunk level with or
        // behind its frame loses the rebate that makes it read as framed rather
        // than printed on.
        for (const plate of art) {
            const frame = frames.find((f) => f.position[0] === plate.position[0]);
            expect(frame).toBeDefined();
            const plateFront = plate.position[2] + plate.args[2] / 2;
            const frameFront = frame.position[2] + frame.args[2] / 2;
            expect(plateFront).toBeGreaterThan(frameFront);
            // ...but only just. A plate standing far out reads as a floating
            // card rather than as art sitting in a rebate.
            expect(plateFront - frameFront).toBeLessThan(0.02);
        }
    });

    it('gives each art plate the same colour as the frame it stands on', () => {
        // The regression this pins. `texture` dresses the front face only, so
        // standing proud exposes a band of the plate's *base colour* around all
        // four sides. That band was a mount cream against a near-black frame:
        // 0.3–0.4 CSS px at the establishing shot, far too thin to read as a
        // mount and far too bright not to antialias into a hairline outlining
        // every poster — which is what it looked like, a gap with wall behind.
        //
        // Sub-pixel is not the same as invisible, and contrast is what decides
        // which. So the rule is colour parity rather than a width budget: any
        // band the rebate exposes has to disappear into the frame.
        for (const plate of art) {
            const frame = frames.find((f) => f.position[0] === plate.position[0]);
            expect(plate.color).toBe(frame.color);
        }
    });

    it('keeps the mount border even on all four sides of every poster', () => {
        // The border is the frame, so an uneven one reads as a badly cut mount.
        // Pinned as a single shared number: heights vary with each artwork's
        // aspect, and it would be easy to retune one plate's height without its
        // frame and leave that poster sitting low in its border.
        for (const plate of art) {
            const frame = frames.find((f) => f.position[0] === plate.position[0]);
            const sideBorder = (frame.args[0] - plate.args[0]) / 2;
            const endBorder = (frame.args[1] - plate.args[1]) / 2;
            expect(sideBorder).toBeCloseTo(0.030, 4);
            expect(endBorder).toBeCloseTo(0.030, 4);
        }
    });

    it('keeps every frame clear of the ledge and inside the establishing shot', () => {
        // The ledge spans x = ±2.1. The outer bound is the frame edge where it
        // crosses this wall, which is 2.916 x the viewport's aspect ratio —
        // derived from a 45° fov at the 7.04 units from camera to wall at
        // poster height.
        //
        // THE ASPECT THIS PROTECTS IS A DELIBERATE CHOICE, and it used to be
        // 3:2 (±4.374). The posters were pushed 0.22 further out because at
        // 16:9 they left most of a poster's width of bare plaster past the
        // outer frame, and the floor moved to 16:10 (±4.666) to pay for it.
        // 16:10 is the practical minimum for a desktop *viewport* — browser
        // chrome eats height, so a 16:10 display in a maximised window reports
        // something nearer 1.7. A true 3:2 window now clips the outer frames by
        // about 0.14. Pushing them further out means giving up 16:10 too.
        const LEDGE_HALF_WIDTH = shelf.parts[0].args[0] / 2;
        const FRAME_EDGE_AT_BACK_WALL = 2.916 * 1.60;
        for (const frame of frames) {
            const halfWidth = frame.args[0] / 2;
            const inner = Math.abs(frame.position[0]) - halfWidth;
            const outer = Math.abs(frame.position[0]) + halfWidth;
            expect(inner).toBeGreaterThan(LEDGE_HALF_WIDTH);
            expect(outer).toBeLessThan(FRAME_EDGE_AT_BACK_WALL);
        }
    });

    it('keeps each gallery spot centred between the pair it lights', () => {
        // The fixtures are mirrored about x = 0 and aimed straight at the wall,
        // so a pair that drifts away from ART_LIGHT_X walks out of its own pool
        // — which shows up as one poster of the two lit and the other not.
        for (const side of [-1, 1]) {
            const onSide = frames.filter((f) => Math.sign(f.position[0]) === side);
            const inner = Math.min(...onSide.map((f) => Math.abs(f.position[0])));
            const outer = Math.max(...onSide.map((f) => Math.abs(f.position[0])));
            expect(ART_LIGHT_X).toBeGreaterThan(inner);
            expect(ART_LIGHT_X).toBeLessThan(outer);
            // And near enough the midpoint that neither frame sits at the soft
            // edge of the cone while the other sits in the middle of it.
            expect(Math.abs(ART_LIGHT_X - (inner + outer) / 2)).toBeLessThan(0.15);
        }
    });

    it('does not let two frames on the same side overlap', () => {
        for (const side of [-1, 1]) {
            const onSide = frames
                .filter((f) => Math.sign(f.position[0]) === side)
                .sort((a, b) => a.position[0] - b.position[0]);
            for (let i = 1; i < onSide.length; i++) {
                const gap = (onSide[i].position[0] - onSide[i].args[0] / 2)
                    - (onSide[i - 1].position[0] + onSide[i - 1].args[0] / 2);
                expect(gap).toBeGreaterThan(0.05);
            }
        }
    });

    it('keeps the whole arrangement inside the wall\'s vertical budget', () => {
        // Same ceiling the ledge is held to, and the desk surface below.
        for (const frame of frames) {
            expect(frame.position[1] + frame.args[1] / 2).toBeLessThan(3.23);
            expect(frame.position[1] - frame.args[1] / 2).toBeGreaterThan(0.9);
        }
    });

    it('hangs the outer pair higher than the inner pair', () => {
        // The stagger is what stops four frames reading as a grid. Equal
        // heights would be the tempting "tidy-up" that quietly removes it.
        const byDistance = [...frames].sort((a, b) => Math.abs(a.position[0]) - Math.abs(b.position[0]));
        const inner = byDistance.slice(0, 2);
        const outer = byDistance.slice(2);
        for (const o of outer) {
            for (const i of inner) expect(o.position[1]).toBeGreaterThan(i.position[1]);
        }
    });
});

describe('wall-shelf', () => {
    const shelf = deskObjects.find((object) => object.id === 'wall-shelf');

    // Three.js default Euler order is 'XYZ', whose matrix is Rx·Ry·Rz. With
    // rz = 0 throughout this object it reduces to the rows below, where
    // a = cos(rx), b = sin(rx), c = cos(ry), d = sin(ry).
    function rotationRows([rx, ry] = [0, 0]) {
        const a = Math.cos(rx), b = Math.sin(rx);
        const c = Math.cos(ry), d = Math.sin(ry);
        return [
            [c, 0, d],
            [b * d, a, -b * c],
            [-a * d, b, a * c]
        ];
    }

    /**
     * The part's axis-aligned half-extents once rotated — the standard
     * OBB-to-AABB projection, |R| · h. A leaning sleeve is both shorter and
     * deeper than its own box, and both of those are what the budgets below
     * are actually about.
     */
    function worldHalfExtents(part) {
        const rows = rotationRows(part.rotation);
        const h = part.args.map((size) => size / 2);
        return rows.map((row) => row.reduce((sum, value, axis) => sum + Math.abs(value) * h[axis], 0));
    }

    it('is non-clickable atmosphere, so nothing here needs a category or focus', () => {
        expect(shelf.clickable).toBe(false);
        expect(shelf.category).toBeNull();
        expect(shelf.focus).toBeUndefined();
    });

    // The one number this object can get wrong without anyone noticing until
    // they look at it on the wrong display. Mirrored from the establishing
    // shot rather than derived live: camera [0, 2.5, 5] → [0, 1, 0] at 45°
    // puts the top frustum edge 5.80° above horizontal, which crosses the back
    // wall (z = -2.2, so 7.2 away) at y = 2.5 + 7.2·tan(5.80°) ≈ 3.23. Vertical
    // framing is fov-only, so this holds at every aspect ratio. If CameraRig's
    // ESTABLISHING_POSITION or DeskScene's fov ever moves, recompute it here.
    const TOP_OF_FRAME_AT_BACK_WALL = 3.23;

    it('keeps its tallest point inside the establishing shot', () => {
        const highest = Math.max(...shelf.parts.map((part) => {
            const [, halfHeight] = worldHalfExtents(part);
            return shelf.position[1] + part.position[1] + halfHeight;
        }));
        expect(highest).toBeLessThan(TOP_OF_FRAME_AT_BACK_WALL);
        // Not flush against the edge either — an object grazing the top of
        // frame reads as cropped by accident rather than placed.
        expect(TOP_OF_FRAME_AT_BACK_WALL - highest).toBeGreaterThan(0.25);
    });

    it('keeps every part in front of the wall it hangs on', () => {
        // The group origin sits on the back wall plane, so a negative local z
        // is a part buried in the plaster. Zero is fine and expected — the
        // board's back face is flush against the wall, which is what mounting
        // it means.
        for (const part of shelf.parts) {
            const [, , halfDepth] = worldHalfExtents(part);
            expect(part.position[2] - halfDepth).toBeGreaterThanOrEqual(0);
        }
    });

    it('leaves the leaning sleeves clear of the wall rather than flush to it', () => {
        // Tipping back trades height for depth: at -0.14 rad a 0.98 sleeve
        // projects 0.098 deep instead of its own 0.015, and past about -0.23
        // the top corner breaks through the plaster. This is the assertion
        // that fails first if someone leans them harder.
        const sleeves = shelf.parts.filter((part) => part.args[0] === part.args[1]);
        for (const sleeve of sleeves) {
            const [, , halfDepth] = worldHalfExtents(sleeve);
            expect(sleeve.position[2] - halfDepth).toBeGreaterThan(0.02);
        }
    });

    it('sizes the sleeves as real 12" records', () => {
        // 0.305 m at surfaces.js's 3.2 units/m. Worth pinning: shrinking these
        // to buy headroom is the tempting fix that quietly turns them into 10"
        // records and costs the shelf its sense of scale.
        const sleeves = shelf.parts.filter((part) => part.args[0] === part.args[1]);
        expect(sleeves).toHaveLength(3);
        for (const sleeve of sleeves) {
            expect(sleeve.args[0]).toBeCloseTo(0.305 * 3.2, 1);
        }
    });

    it('puts a distinct cover on every sleeve', () => {
        const sleeves = shelf.parts.filter((part) => part.args[0] === part.args[1]);
        const covers = sleeves.map((sleeve) => sleeve.texture);
        expect(covers.every(Boolean)).toBe(true);
        expect(new Set(covers).size).toBe(covers.length);
    });

    it('keeps the sleeve covers square, as record sleeves are', () => {
        // The sleeves are the one place in the scene where the box's aspect and
        // the artwork's have to agree by construction rather than by lookup —
        // every album cover is 1:1, so any non-square sleeve is stretching one.
        for (const sleeve of shelf.parts.filter((part) => part.texture)) {
            expect(sleeve.args[0]).toBeCloseTo(sleeve.args[1], 6);
        }
    });
});

describe('studio-display screen anchor', () => {
    const display = deskObjects.find((object) => object.id === 'studio-display');
    const { position, rotation, size } = display.focus.anchor;

    // The display model draws its own screen as one emissive white quad. These
    // are its corners in group-local space, measured off
    // models-src/apple_studio_display.glb through the same transform
    // attachModel applies. Anything mounted to show real content has to sit in
    // front of this plane, or it is simply inside the monitor.
    //
    // A quad has vertices only at its corners, so sampling the model's depth
    // per-vertex across the screen finds nothing here at all — which is exactly
    // how a canvas ended up mounted behind it. Hence the plane written out
    // analytically rather than a bounding box.
    const QUAD = { y0: 0.4308, y1: 1.4904, z0: 0.2018, z1: 0.0530, halfWidth: 0.9558 };
    const quadZAt = (y) => QUAD.z0 + ((QUAD.z1 - QUAD.z0) / (QUAD.y1 - QUAD.y0)) * (y - QUAD.y0);

    const planeZAt = (y) => position[2] - Math.tan(-rotation[0]) * (y - position[1]);

    it('mounts the content plane in front of the model\'s own screen quad', () => {
        // Sampled across the full height rather than checked at the centre: the
        // two planes are only parallel while their tilts agree, and a mismatch
        // buries one end while leaving the other clear.
        for (let y = QUAD.y0; y <= QUAD.y1; y += 0.02) {
            expect(planeZAt(y) - quadZAt(y)).toBeGreaterThan(0.002);
        }
    });

    it('does not float so far forward that it detaches from the bezel', () => {
        // The far side of the same coin. A plane parked well in front of the
        // glass reads as a card hovering off the monitor, which is how this
        // looked before the anchor was measured at all.
        for (let y = QUAD.y0; y <= QUAD.y1; y += 0.02) {
            expect(planeZAt(y) - quadZAt(y)).toBeLessThan(0.05);
        }
    });

    it('covers the emissive quad rather than leaving a glowing rim around it', () => {
        // The quad is emissive white. Any part of it the content plane fails to
        // cover shows as a lit halo, so the plane is sized to the real screen
        // rather than to whatever framed nicely.
        expect(size[0] / 2).toBeGreaterThanOrEqual(QUAD.halfWidth);
        const quadHeight = Math.hypot(QUAD.y1 - QUAD.y0, QUAD.z0 - QUAD.z1);
        expect(size[1]).toBeGreaterThanOrEqual(quadHeight);
    });

    it('keeps the focus camera aimed at the plane it is framing', () => {
        expect(display.focus.camera.lookAtOffset).toEqual(position);
    });
});

describe('book row and bookends', () => {
    const find = (id) => deskObjects.find((object) => object.id === id);
    const row = find('book-row');
    const cube = find('bookend-cube');
    const disc = find('bookend-disc');

    // Measured from the desk model: targetSize 6 on its largest dimension puts
    // the top surface at x ±3.0 and z ±1.44, with restAt 'top' placing it at
    // y = 0.
    const DESK_HALF_WIDTH = 3.0;
    const DESK_BACK_EDGE = -1.44;

    it('stands a bookend at each end of the run', () => {
        const left = Math.min(...row.parts.map((b) => b.position[0] - b.args[0] / 2));
        const right = Math.max(...row.parts.map((b) => b.position[0] + b.args[0] / 2));
        expect(cube.position[0]).toBeLessThan(left);
        expect(disc.position[0]).toBeGreaterThan(right);
    });

    it('keeps the books and both bookends on the desk', () => {
        const cubeHalf = cube.model.targetSize / 2;
        const discHalf = disc.model.targetSize / 2;
        expect(Math.abs(cube.position[0]) + cubeHalf).toBeLessThan(DESK_HALF_WIDTH);
        expect(Math.abs(disc.position[0]) + discHalf).toBeLessThan(DESK_HALF_WIDTH);
        for (const book of row.parts) {
            expect(Math.abs(book.position[0]) + book.args[0] / 2).toBeLessThan(DESK_HALF_WIDTH);
            // Deepest book still in front of the desk's back edge.
            expect(book.position[2] - book.args[2] / 2).toBeGreaterThan(DESK_BACK_EDGE);
        }
    });

    it('sits the whole run behind the display rather than in front of it', () => {
        // The display is at z = -0.25 and reaches z = +0.10 at its front. A row
        // drifting forward of that would stand between the monitor and the
        // keyboard, which is not where books go.
        const DISPLAY_BACK = -0.60;
        for (const book of row.parts) {
            expect(book.position[2] + book.args[2] / 2).toBeLessThan(DISPLAY_BACK);
        }
    });

    it('lifts the disc bookend by half its diameter, because it is stood on edge', () => {
        // attachModel rests a model bottom-down before the group's rotation is
        // applied, so the quarter turn about X swings half the disc under the
        // desktop. y has to put it back. This is the assertion that fails if
        // someone "tidies" the y to 0 like every other prop on the desk.
        expect(disc.rotation[0]).toBeCloseTo(Math.PI / 2, 6);
        expect(disc.position[1]).toBeCloseTo(disc.model.targetSize / 2, 6);
    });

    it('rests the cube bookend flat, needing no such correction', () => {
        expect(cube.rotation[0]).toBe(0);
        expect(cube.position[1]).toBe(0);
    });

    it('keeps the tallest book below the bottom of the screen', () => {
        // The row is meant to be read as a band behind the monitor, not to
        // crowd into the screen area. The display's panel starts at y = 0.43.
        const DISPLAY_PANEL_BOTTOM = 0.43;
        for (const book of row.parts) {
            expect(book.args[1]).toBeLessThan(DISPLAY_PANEL_BOTTOM + 0.3);
        }
    });
});

describe('shelf plants', () => {
    const shelf = deskObjects.find((object) => object.id === 'wall-shelf');
    const plants = deskObjects.filter((object) => object.model?.url === '/models/plant.glb');

    const board = shelf.parts[0];
    const BOARD_TOP = shelf.position[1] + board.args[1] / 2;
    const BOARD_DEPTH = board.args[2];
    const BOARD_CENTRE_Z = shelf.position[2] + board.position[2];
    const BOARD_HALF_WIDTH = board.args[0] / 2;

    it('puts exactly two plants in the scene, both on the ledge', () => {
        expect(plants).toHaveLength(2);
        for (const plant of plants) expect(plant.position[1]).toBeCloseTo(BOARD_TOP, 6);
    });

    it('sizes each plant to fit the ledge it stands on', () => {
        // plant.glb's largest dimension is its depth, so targetSize is
        // literally how deep the plant will be — and the board is only 0.55.
        for (const plant of plants) {
            expect(plant.model.targetSize).toBeLessThan(BOARD_DEPTH);
        }
    });

    it('keeps both plants within the board, front to back and end to end', () => {
        for (const plant of plants) {
            const halfDepth = plant.model.targetSize / 2;
            expect(plant.position[2] - halfDepth).toBeGreaterThan(BOARD_CENTRE_Z - BOARD_DEPTH / 2);
            expect(plant.position[2] + halfDepth).toBeLessThan(BOARD_CENTRE_Z + BOARD_DEPTH / 2);
            // plant.glb is 0.849 as wide as it is deep.
            const halfWidth = plant.model.targetSize * 0.849 / 2;
            expect(Math.abs(plant.position[0]) + halfWidth).toBeLessThan(BOARD_HALF_WIDTH);
        }
    });

    it('interleaves album, plant, album, plant, album across the ledge', () => {
        // The arrangement itself, pinned. Sorting everything on the board by x
        // has to alternate, and the obvious way to break it is to nudge one
        // sleeve past a plant while tidying the spacing.
        const sleeves = shelf.parts.filter((part) => part.texture);
        const onLedge = [
            ...sleeves.map((s) => ({ kind: 'album', x: s.position[0], half: s.args[0] / 2 })),
            ...plants.map((p) => ({ kind: 'plant', x: p.position[0], half: p.model.targetSize * 0.849 / 2 }))
        ].sort((a, b) => a.x - b.x);

        expect(onLedge.map((item) => item.kind))
            .toEqual(['album', 'plant', 'album', 'plant', 'album']);
    });

    it('leaves real air between every neighbour on the ledge', () => {
        // The five items spend 3.670 of a 4.200 board, so the gaps are thin by
        // construction. A plant clipping into a sleeve is the failure this
        // catches, and it would be invisible from the establishing shot
        // because the plants stand forward of the leaning sleeves.
        const sleeves = shelf.parts.filter((part) => part.texture);
        const onLedge = [
            ...sleeves.map((s) => ({ x: s.position[0], half: s.args[0] / 2 })),
            ...plants.map((p) => ({ x: p.position[0], half: p.model.targetSize * 0.849 / 2 }))
        ].sort((a, b) => a.x - b.x);

        for (let i = 1; i < onLedge.length; i++) {
            const gap = (onLedge[i].x - onLedge[i].half) - (onLedge[i - 1].x + onLedge[i - 1].half);
            expect(gap).toBeGreaterThan(0.05);
        }
        // ...and the two end items stay on the board.
        expect(onLedge[0].x - onLedge[0].half).toBeGreaterThan(-BOARD_HALF_WIDTH);
        expect(onLedge.at(-1).x + onLedge.at(-1).half).toBeLessThan(BOARD_HALF_WIDTH);
    });

    it('makes the two plants visibly different rather than one asset twice', () => {
        // Same .glb, so without a difference in scale and facing they read
        // immediately as a copy-paste.
        const [a, b] = plants;
        expect(a.model.targetSize).not.toBeCloseTo(b.model.targetSize, 2);
        expect(a.rotation[1]).not.toBeCloseTo(b.rotation[1], 2);
    });
});

describe('lettered book spines', () => {
    const row = deskObjects.find((object) => object.id === 'book-row');
    const lettered = row.parts.filter((book) => book.spine);
    const OCCLUDED = [-1.15, 1.15];

    it('letters every title in the list, and none twice', () => {
        expect(lettered).toHaveLength(BOOKS.length);
        const titles = lettered.map((book) => book.spine.title);
        expect(titles).toEqual(BOOKS.map((book) => book.title));
        expect(new Set(titles).size).toBe(titles.length);
    });

    it('spends no title on a book the monitor hides', () => {
        // The list is shorter than the row, so every title landing behind the
        // display is one that could have gone somewhere visible.
        for (const book of lettered) {
            const x = book.position[0];
            expect(x < OCCLUDED[0] || x > OCCLUDED[1]).toBe(true);
        }
    });

    it('leaves the hidden middle plain', () => {
        const hidden = row.parts.filter((b) => b.position[0] >= OCCLUDED[0] && b.position[0] <= OCCLUDED[1]);
        expect(hidden.length).toBeGreaterThan(0);
        for (const book of hidden) expect(book.spine).toBeUndefined();
    });

    it('splits the collection across both sides of the monitor', () => {
        // All nineteen on one flank would leave the other side as anonymous
        // colour, which is the arrangement this is meant to avoid.
        const left = lettered.filter((b) => b.position[0] < 0).length;
        expect(left).toBeGreaterThan(3);
        expect(lettered.length - left).toBeGreaterThan(3);
    });

    it('gives every lettered spine an author', () => {
        for (const book of lettered) {
            expect(typeof book.spine.author).toBe('string');
            expect(book.spine.author.length).toBeGreaterThan(0);
        }
    });
});

describe('deskObjects', () => {
    it('has 4 clickable category objects and at least 2 non-clickable atmosphere objects', () => {
        // The design doc budgets 4–8 objects mapped to categories. Four is the
        // whole taxonomy, one object apiece — and it sits ON the floor of that
        // range rather than in the middle of it, which is the thing worth saying:
        // the next object added here is a taxonomy change and not a decoration.
        // The ceiling is real too: past eight the desk stops reading as
        // somewhere someone works and starts reading as a menu with props on it.
        const clickable = deskObjects.filter((object) => object.clickable);
        const atmosphere = deskObjects.filter((object) => !object.clickable);
        expect(clickable).toHaveLength(4);
        expect(atmosphere.length).toBeGreaterThanOrEqual(2);
    });

    it('satisfies the desk layout schema and every clickable category has a matching Work', () => {
        expect(() => validateDeskLayout(deskObjects, works)).not.toThrow();
    });

    it('covers every category exactly once among clickable objects', () => {
        const categories = deskObjects.filter((object) => object.clickable).map((object) => object.category);
        expect(new Set(categories).size).toBe(categories.length);
    });

    it('leaves no category without a way into it', () => {
        // The other half of the check above, and the assertion that catches the
        // half of a category removal nobody remembers. A category declared in
        // CATEGORY_LABELS with no object on the desk is content that exists in
        // the registry, validates cleanly, and is unreachable by any click:
        // `validateDeskLayout` only walks object -> work (deskSchema.js), never
        // work -> object, so it passes a label with nothing to click on. This is
        // the line that fails if a desk object is deleted and its entry in
        // schema.js CATEGORY_LABELS is left behind.
        const reachable = new Set(deskObjects.filter((object) => object.clickable).map((object) => object.category));
        for (const category of Object.keys(CATEGORY_LABELS)) {
            expect(reachable).toContain(category);
        }
    });

    it('maps each clickable object to its intended focus visual strategy', () => {
        const findObject = (id) => deskObjects.find((object) => object.id === id);
        expect(findObject('studio-display').focus.visual).toBe('screen');
        expect(findObject('breadboard').focus.visual).toBe('artifact');
        expect(findObject('lanyard').focus.visual).toBe('artifact');
        expect(findObject('paper-stack').focus.visual).toBe('sheets');
    });

    it('gives every clickable object a visual that renders its own content in-scene', () => {
        // The desk's whole premise is that an object *is* the content surface
        // rather than a button that summons a panel over the top of it — so a
        // new clickable object landing on a panel-backed visual is a
        // regression worth failing for, not a style preference.
        //
        // This list mirrors the in-scene half of focus/strategies/index.js. It
        // lost 'pages' with the two notebooks: nothing lays down a bound
        // two-page spread any more, and the strategy that did is gone, so a
        // 'pages' object would not resolve to anything.
        const inScene = ['screen', 'sheets', 'artifact'];
        for (const object of deskObjects.filter((entry) => entry.clickable)) {
            expect(inScene).toContain(object.focus.visual);
        }
    });

    it('names a paper stock that pageCanvas actually defines', () => {
        // One object on this desk shows printed pages, so the old check that
        // three of them chose visibly different stocks has gone with the two it
        // compared — a one-element set is always distinct, which is a test that
        // can never fail. What is still worth holding is that the name RESOLVES:
        // `metricsFor` falls back to DEFAULT_PAPER_STOCK for an unknown id
        // rather than throwing, so a typo here silently renders some other stock
        // and nothing anywhere says so.
        const pageObjects = deskObjects.filter((object) => object.focus?.visual === 'sheets');
        expect(pageObjects.length).toBeGreaterThan(0);
        const stocks = pageObjects.map((object) => object.focus.anchor.paper);
        expect(stocks.every(Boolean)).toBe(true);
        for (const stock of stocks) expect(PAPER_STOCKS).toHaveProperty(stock);
    });
});

describe('the desktop props', () => {
    const find = (id) => deskObjects.find((object) => object.id === id);
    const lanyard = find('lanyard');
    const stack = find('paper-stack');
    const station = find('breadboard');

    // Measured from the desk model: targetSize 6 on its largest dimension puts
    // the top surface at x ±3.0 and z ±1.44, with restAt 'top' placing it at
    // y = 0. Same numbers the book row is held to.
    const DESK_HALF_WIDTH = 3.0;
    const DESK_FRONT_EDGE = 1.44;

    // The two things in the middle of the desk that everything else is spaced
    // around, hoisted to the describe scope because three tests below read them
    // and two copies of the display's box in one file is precisely how the
    // ±0.96 / ±1.00 confusion got in.
    //
    // KEYBOARD is a conservative 1.0 x 1.0 box at [0, 0, 1.0]. `node
    // scripts/measure-models.mjs` prints keyboard_mechanical at targetSize 1 as
    // 1.000 x 0.090 x 0.451 — 1.0 wide, a 0.090 slab, 0.451 front to back. At
    // 1 unit = 31.25 cm that is 2.8 cm thick and 14.1 cm deep, which is a
    // keyboard. So this box is a bit over twice its real depth on purpose: it
    // stands in for the keyboard plus the wrists.
    //
    // DISPLAY IS THE PLACED MODEL AND NOT THE EMISSIVE QUAD, and that
    // distinction is load-bearing. The ±0.9558 above (QUAD.halfWidth) is the lit
    // screen, which is the right bound for the screen-anchor tests and the wrong
    // one for desk clearances: `node scripts/measure-models.mjs` reports
    // apple_studio_display.glb placed at targetSize 2 as 2.000 x 1.534 x 0.704,
    // so the silhouette a neighbour actually collides with is x ±1.000 and
    // z ∈ [-0.602, 0.102] about its position of [0, 0, -0.25]. The soldering
    // station stands 0.475 off the desk and the panel's own band starts at the
    // desktop, so the station is inside it; the bezel and the shell are not
    // optional. This is also the number the spacing unit is derived from — see
    // the chain test below.
    const KEYBOARD = [-0.5, 0.5, 0.5, 1.5];
    const DISPLAY = [-1.00, 1.00, -0.602, 0.102];

    // THE MOUSING ZONE, and it is the one box here that is not any object's
    // bounds. The mouse's own are useless for spacing: computer_mouse.glb places
    // at 0.157 x 0.100 x 0.300, a ground footprint of 4.9 x 9.4 cm — far too
    // small to reserve what a hand needs. What the right flank is actually
    // spaced from is 0.70 x 0.58 (22 x 18 cm) of hand-and-mouse travel centred
    // on the mouse at [0.8, 0, 1.0], which does contain the model's own box.
    //
    // IT IS NOT A SOLID OBJECT and must never be fed to the pairwise overlap
    // test below: it overlaps both the mouse and the keyboard by construction,
    // which is what a zone reaching back toward the keyboard is for. Its right
    // edge at 1.15 is also the same number as bookRow's `occluded` bound by pure
    // coincidence — do not refactor the two into one constant.
    const MOUSE_SWEEP = [0.45, 1.15, 0.71, 1.29];

    /**
     * A model-backed prop's ground footprint, as [width, depth] per unit of
     * `targetSize`. Measured off the files in models-src with
     * `node scripts/measure-models.mjs`.
     *
     * PINNED RATHER THAN ASSUMED, and the difference is not academic. The
     * obvious shortcut is to treat targetSize as the footprint on every axis,
     * but targetSize is the LARGEST dimension — the soldering station is
     * 1.000 x 0.475 x 0.697, so a square bound over-reserves 0.30 of desk
     * depth and makes a perfectly good arrangement look like a collision. That
     * is exactly what it did while the lanyard and the paper stack were being
     * placed around it.
     *
     * THE DEPTH HERE WAS WRONG ONCE, AND IT IS WORTH KNOWING HOW. It read 0.442
     * for most of this object's life, because measure-models.mjs used to take
     * the union of raw POSITION accessor bounds and ignore node transforms —
     * and soldering_station.glb is a Sketchfab export whose root node carries a
     * +90° rotation about X, so its height and depth arrived transposed. The
     * scene was never wrong (attachModel measures with
     * `THREE.Box3().setFromObject`, which is transform-aware); only the
     * measurement was, which meant every constant derived from it was quietly
     * off — including the desk's spacing unit, by 0.072. The script now walks
     * the hierarchy. If a number here ever looks surprising, re-run it before
     * trusting the file.
     *
     * The control for the method is the plant: the script reports it 0.848
     * wide per unit deep, and the shelf-plant test above has independently
     * used 0.849 since long before the script existed.
     */
    const MODEL_GROUND_SIZE = {
        '/models/soldering_station.glb': [1.000, 0.697]
    };

    const stackBounds = paperStackFootprint({ sheets: 9, width: 0.474, depth: 0.672 });

    /**
     * A prop's footprint in desk coordinates, as [minX, maxX, minZ, maxZ].
     *
     * THE YAW HAS TO BE APPLIED AND IT IS EASY TO FORGET. Every one of these
     * objects is turned a little on the desk, and a group rotation spins the
     * footprint about the group's ORIGIN — not about the footprint's own
     * centre, which for the lanyard is nowhere near it, since the coil extends
     * backwards and the card does not. Taking the local box and simply adding
     * `position` would put the lanyard's bounds somewhere it isn't. So the four
     * corners are rotated individually and re-bounded, which is exact.
     *
     * Three.js yaws about +Y, mapping (x, z) to (x·cos + z·sin, -x·sin + z·cos).
     */
    function footprint(position, yaw, [minX, maxX, minZ, maxZ]) {
        const cos = Math.cos(yaw);
        const sin = Math.sin(yaw);
        const xs = [];
        const zs = [];
        for (const x of [minX, maxX]) {
            for (const z of [minZ, maxZ]) {
                xs.push(position[0] + x * cos + z * sin);
                zs.push(position[2] - x * sin + z * cos);
            }
        }
        return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    }

    /**
     * A model-backed prop's footprint in desk coordinates.
     *
     * Just the model's own bounding box, rotated. It used to widen that box with
     * the bounds of any `parts` the object carried, for dressed model-backed
     * props whose dressing reached out past the .glb it was dressing. Nothing on
     * this desk is built that way now: the station carries no parts, and the
     * lanyard and the paper stack are built entirely FROM parts and bring their
     * footprints from their own modules. So the widening had nothing left to
     * widen. Put it back if a dressed .glb ever returns.
     */
    const modelFootprint = (object) => {
        const [widthRatio, depthRatio] = MODEL_GROUND_SIZE[object.model.url];
        const halfWidth = (widthRatio * object.model.targetSize) / 2;
        const halfDepth = (depthRatio * object.model.targetSize) / 2;
        return footprint(object.position, object.rotation[1], [-halfWidth, halfWidth, -halfDepth, halfDepth]);
    };

    const footprints = {
        lanyard: footprint(lanyard.position, lanyard.rotation[1], [
            LANYARD_FOOTPRINT.minX, LANYARD_FOOTPRINT.maxX, LANYARD_FOOTPRINT.minZ, LANYARD_FOOTPRINT.maxZ
        ]),
        'paper-stack': footprint(stack.position, stack.rotation[1], [
            stackBounds.minX, stackBounds.maxX, stackBounds.minZ, stackBounds.maxZ
        ]),
        breadboard: modelFootprint(station)
    };

    it('keeps every prop on the desk', () => {
        // The station is in this list even though nothing has ever held it on the
        // desk before. It belongs here now: it has moved, its 0.3905 to the
        // desk's left edge is the tightest clearance it has on any side, and that
        // number is the spacing unit itself — so anything that eats it breaks the
        // chain test below as well as this one.
        for (const id of ['lanyard', 'paper-stack', 'breadboard']) {
            const [minX, maxX, minZ, maxZ] = footprints[id];
            expect(minX).toBeGreaterThan(-DESK_HALF_WIDTH);
            expect(maxX).toBeLessThan(DESK_HALF_WIDTH);
            expect(maxZ).toBeLessThan(DESK_FRONT_EDGE);
            expect(minZ).toBeGreaterThan(-DESK_FRONT_EDGE);
        }
    });

    it('does not let any two desktop props share the same patch of desk', () => {
        // This is the assertion that actually earned its keep. Fitting the
        // lanyard and the paper stack onto a desk whose free space was mostly a
        // 0.55-deep strip in front of the monitor took several attempts, and
        // every failed one looked fine in the file and had two objects
        // intersecting in the render. Bounding boxes are conservative for the
        // model-backed props, so a pass here is a real pass and a failure may be
        // a near miss — which is the right way round.
        const ids = Object.keys(footprints);
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const [aMinX, aMaxX, aMinZ, aMaxZ] = footprints[ids[i]];
                const [bMinX, bMaxX, bMinZ, bMaxZ] = footprints[ids[j]];
                const overlaps = aMinX < bMaxX && bMinX < aMaxX && aMinZ < bMaxZ && bMinZ < aMaxZ;
                expect(`${ids[i]} vs ${ids[j]}: ${overlaps ? 'overlapping' : 'clear'}`)
                    .toBe(`${ids[i]} vs ${ids[j]}: clear`);
            }
        }
    });

    it('keeps the props clear of the monitor and the keyboard', () => {
        // Both are dead centre and both are what the free desk is measured
        // against; see their boxes at the top of this block. Two results here
        // are worth knowing rather than merely passing: the station clears the
        // display by exactly the spacing unit, 0.3905, and the badge's x span
        // now OVERLAPS the display's by 0.1096 while clearing it by 0.5648 in
        // depth. The second is why this test reads both axes — a one-axis
        // version would call the badge a collision.
        for (const id of ['lanyard', 'paper-stack', 'breadboard']) {
            const [minX, maxX, minZ, maxZ] = footprints[id];
            for (const [oMinX, oMaxX, oMinZ, oMaxZ] of [KEYBOARD, DISPLAY]) {
                const overlaps = minX < oMaxX && oMinX < maxX && minZ < oMaxZ && oMinZ < maxZ;
                expect(`${id}: ${overlaps ? 'overlapping' : 'clear'}`).toBe(`${id}: clear`);
            }
        }
    });

    it('leaves the same clear desk between every neighbour along the chain', () => {
        // WHAT "EVENLY SPACED" MEANS HERE, pinned so it cannot drift back to
        // lopsided. Not equal distance between centres — these objects differ by
        // a factor of three in width, so equal centres would leave wildly
        // different amounts of bare desk. What is held equal is the CLEAR DESK
        // between adjacent neighbours, edge to edge between rotated footprints,
        // walked as one chain left to right:
        //
        //   desk left edge | bench | badge | display + keyboard | mouse | stack
        //
        // THE UNIT IS DERIVED, NOT CHOSEN. The left flank between the desk's
        // edge (-3.0) and the display's own placed edge (-1.0) is 2.000 wide and
        // the station's rotated footprint is 1.2190 across, so centring it there
        // leaves (2.000 - 1.2190) / 2 = 0.3905 on each side. That is the most
        // clear desk the tightest run on this desk can offer, which is why every
        // other gap is set to it rather than to a round number. 1 unit is
        // 31.25 cm, so this is 12.2 cm — a hand's width.
        //
        // THE UNIT WAS 0.4625 UNTIL THE STATION WAS RE-MEASURED, and the story is
        // worth keeping because the failure was invisible. MODEL_GROUND_SIZE gave
        // the station a depth of 0.442, which came from a measure-models.mjs that
        // ignored node transforms; the real depth is 0.697, which under the 0.6
        // yaw widens the rotated footprint from 1.0749 to 1.2190 and therefore
        // narrows the unit by 0.072. Nothing rendered wrongly at any point —
        // attachModel has always measured with `THREE.Box3().setFromObject` — so
        // the desk was correct and every derived number in this file was not.
        // @see MODEL_GROUND_SIZE.
        //
        // LINK 2 IS IN DEPTH and that is not a fudge: the bench and the badge
        // overlap in x by 0.162, because 1.881 of object cannot be laid side by
        // side in a 2.000 flank. The bench is a back-row object and a dropped
        // badge is a front-row one, which is also what a desk looks like.
        //
        // The chain's fifth terminator is the mousing zone's right edge rather
        // than a footprint — see MOUSE_SWEEP at the top of this block for why the
        // mouse's own bounds cannot do that job.
        //
        // The tolerance is 0.002 (0.6 mm) against a measured spread of 0.0004,
        // loose enough to survive rounding the two 3-decimal positions back to 2
        // and tight enough to fail on any real drift.
        const UNIT = 0.3905;
        const TOLERANCE = 0.002;
        const links = [
            ['desk left edge -> bench', footprints.breadboard[0] + DESK_HALF_WIDTH],
            ['bench -> badge, in depth', footprints.lanyard[2] - footprints.breadboard[3]],
            ['bench -> display', DISPLAY[0] - footprints.breadboard[1]],
            ['badge -> keyboard', KEYBOARD[0] - footprints.lanyard[1]],
            ['mouse sweep -> stack', footprints['paper-stack'][0] - MOUSE_SWEEP[1]]
        ];
        for (const [name, gap] of links) {
            const held = Math.min(Math.max(gap, UNIT - TOLERANCE), UNIT + TOLERANCE);
            expect(`${name}: ${gap.toFixed(4)}`).toBe(`${name}: ${held.toFixed(4)}`);
        }
        // The sixth number is a MARGIN, not a link: the stack is 0.58 narrower
        // than the bench and the right flank has 0.43 of desk left over, parked
        // at the least reachable, first-cropped corner. It may be larger than the
        // unit and must never be smaller — that would be the stack crowding the
        // corner it was deliberately kept out of.
        expect(DESK_HALF_WIDTH - footprints['paper-stack'][1]).toBeGreaterThan(UNIT);
    });

    it('turns the paper stack over desk it can actually reach across', () => {
        // The sheet pivots on the clipped left edge and sweeps left, so while
        // focused this object needs desk to its own local left that it does not
        // occupy at rest. Rotating about the hinge does not move the sheet in z
        // at all, so only its x reach matters.
        //
        // WHAT BINDS HERE HAS CHANGED, and the test is written not to name it.
        // While the stack stood at x = -1.30 the visible sweep came within
        // 0.0245 of the soldering station, which is why this assertion exists at
        // all; from x = 1.862 that margin is 2.96 and the station guards nothing.
        // The real constraint is now the mouse hand, which the sweep clears by
        // 0.420 — and the next rearrangement will move something else into the
        // way. So the checks below loop over every other box rather than
        // hard-coding whichever one happens to be nearest today.
        const [pageWidth, pageDepth] = stack.focus.anchor.size;
        const reachAt = (angle) => -pageWidth / 2 + pageWidth * Math.cos(angle);

        const whole = footprint(stack.position, stack.rotation[1], [
            reachAt(TURN_ANGLE), pageWidth / 2, -pageDepth / 2, pageDepth / 2
        ]);
        expect(whole[0]).toBeGreaterThan(-DESK_HALF_WIDTH);
        expect(whole[1]).toBeLessThan(DESK_HALF_WIDTH);

        const visible = footprint(stack.position, stack.rotation[1], [
            reachAt(TURN_ANGLE * VISIBLE_ARC), pageWidth / 2, -pageDepth / 2, pageDepth / 2
        ]);
        for (const [id, box] of Object.entries(footprints)) {
            if (id === 'paper-stack') continue;
            const [oMinX, oMaxX, oMinZ, oMaxZ] = box;
            const overlaps = visible[0] < oMaxX && oMinX < visible[1] && visible[2] < oMaxZ && oMinZ < visible[3];
            expect(`visible sweep vs ${id}: ${overlaps ? 'overlapping' : 'clear'}`)
                .toBe(`visible sweep vs ${id}: clear`);
        }
        // And the three boxes in the middle of the desk that are not props, so
        // are not in `footprints`. The mousing zone is the one that binds: the
        // visible sweep stops 0.466 short of its right edge, one whole spacing
        // unit, which is the guard the station used to provide.
        for (const [name, box] of [['keyboard', KEYBOARD], ['display', DISPLAY], ['mouse hand', MOUSE_SWEEP]]) {
            const [oMinX, oMaxX, oMinZ, oMaxZ] = box;
            const overlaps = visible[0] < oMaxX && oMinX < visible[1] && visible[2] < oMaxZ && oMinZ < visible[3];
            expect(`visible sweep vs ${name}: ${overlaps ? 'overlapping' : 'clear'}`)
                .toBe(`visible sweep vs ${name}: clear`);
        }
    });

    it('floats the focused sheets clear of the stack they lie on', () => {
        // Below the top of the stack, the page is inside it and z-fights with
        // the sheet it exactly overlaps; far above it, the page visibly hovers.
        // The gap is derived from the stack's own height rather than typed in,
        // so adding a sheet cannot silently bury the page.
        const top = paperStackHeight(9);
        expect(stack.focus.anchor.height).toBeGreaterThan(top);
        expect(stack.focus.anchor.height).toBeLessThan(top + 0.02);
    });
});

describe('the lanyard', () => {
    const lanyard = deskObjects.find((object) => object.id === 'lanyard');
    const jobs = works.filter((work) => work.category === 'work');

    it('rests as the literal first job\'s artifact rather than a second copy of it', () => {
        // Not deep equality — identity. deskObjects.js hands over the same
        // array, which is the only construction that cannot drift.
        expect(lanyard.parts).toBe(jobs[0].artifact.parts);
    });

    it('gives every job a badge with an employer and a role on it', () => {
        expect(jobs.length).toBeGreaterThan(1);
        for (const job of jobs) {
            const card = job.artifact.parts.find((part) => part.badge);
            expect(card).toBeDefined();
            expect(card.badge.org).toBeTruthy();
            expect(card.badge.role).toBeTruthy();
        }
    });

    it('gives every badge its own strap', () => {
        // artifactStrategy reparents the resting group into slot 0 on mount,
        // so a strap shared between cards would leave the desk the first time
        // an arrow was pressed and never come back.
        for (const job of jobs) {
            const straps = job.artifact.parts.filter((part) => !part.badge);
            expect(straps.length).toBeGreaterThan(0);
        }
    });

    it('lies the card flat by rotating it, so the lettering still lands on the front face', () => {
        // partMesh maps drawn artwork onto BoxGeometry's +z face and only that
        // one. A card authored flat (thickness in y) would put its badge on an
        // edge. The quarter turn about X is what sends local +z to world +y.
        for (const job of jobs) {
            const card = job.artifact.parts.find((part) => part.badge);
            expect(card.type).toBe('box');
            expect(card.rotation[0]).toBeCloseTo(-Math.PI / 2, 6);
        }
    });

    /**
     * A part's corners after the presented pose has been applied to it.
     *
     * The pose is a rotation about a pivot, which three expresses as a group
     * rotation plus a compensating offset (see artifactStrategy.applyPose); the
     * geometry it produces is p -> P + R(p - P), which is what this walks.
     * Euler composition is XYZ, so R = Rx·Ry·Rz.
     */
    function posedCorners(part, { pivot, rotation }) {
        const [hx, hy, hz] = part.type === 'torus'
            ? [part.args[0] + part.args[1], part.args[0] + part.args[1], part.args[1]]
            : part.args.slice(0, 3).map((size) => size / 2);
        const [prx, pry, prz] = part.rotation ?? [0, 0, 0];
        const [rx, ry, rz] = rotation;
        const corners = [];

        for (const sx of [-1, 1]) {
            for (const sy of [-1, 1]) {
                for (const sz of [-1, 1]) {
                    let [x, y, z] = [sx * hx, sy * hy, sz * hz];
                    // the part's own rotation, then its position
                    [x, y] = [x * Math.cos(prz) - y * Math.sin(prz), x * Math.sin(prz) + y * Math.cos(prz)];
                    [x, z] = [x * Math.cos(pry) + z * Math.sin(pry), -x * Math.sin(pry) + z * Math.cos(pry)];
                    [y, z] = [y * Math.cos(prx) - z * Math.sin(prx), y * Math.sin(prx) + z * Math.cos(prx)];
                    x += part.position[0];
                    y += part.position[1];
                    z += part.position[2];
                    // ...then the pose, about the pivot
                    [x, y, z] = [x - pivot[0], y - pivot[1], z - pivot[2]];
                    [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
                    [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
                    [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
                    corners.push([x + pivot[0], y + pivot[1], z + pivot[2]]);
                }
            }
        }
        return corners;
    }

    it('stands the badge up without putting any of it through the desk', () => {
        // THE ASSERTION THIS OBJECT EXISTS TO KEEP. A rigid rotation sends
        // everything in front of the pivot downward, and the first pivot tried
        // here — the card's own near edge — swung the slot, the swivel and the
        // ring five centimetres under the desktop. That is invisible in the
        // data and obvious in the render, which is the worst possible split.
        const { present } = lanyard.focus.anchor;
        for (const part of lanyard.parts.filter((entry) => entry.pose)) {
            for (const [, y] of posedCorners(part, present)) {
                expect(y).toBeGreaterThanOrEqual(-1e-6);
            }
        }
    });

    it('keeps the badge standing on the desk rather than hovering over it', () => {
        // The other direction: a pivot pushed far enough forward to satisfy the
        // test above would lift the whole assembly into the air.
        const { present } = lanyard.focus.anchor;
        const lowest = Math.min(
            ...lanyard.parts
                .filter((entry) => entry.pose)
                .flatMap((part) => posedCorners(part, present).map(([, y]) => y))
        );
        expect(lowest).toBeLessThan(0.005);
    });

    it('hinges where the strap starts, so the two stay connected', () => {
        // The badge is propped on its own clip, and the tape runs on from the
        // same point. A hinge anywhere else and the strap visibly detaches from
        // the ring the moment the card moves.
        const { present } = lanyard.focus.anchor;
        // The tape is a walk: each segment is centred half its own length along
        // its heading from where the last one ended, so the first one's tail is
        // the point the whole strap hangs off. A box's long axis is its local
        // +x and the builder yaws it to heading - PI/2, hence the quarter turn
        // back out of it here.
        const first = lanyard.parts.find((part) => !part.pose);
        const heading = first.rotation[1] + Math.PI / 2;
        const tailZ = first.position[2] - Math.cos(heading) * (first.args[0] / 2);
        const tailX = first.position[0] - Math.sin(heading) * (first.args[0] / 2);

        expect(tailZ).toBeCloseTo(present.pivot[2], 3);
        expect(tailX).toBeCloseTo(present.pivot[0], 3);
    });

    it('tips the card up far enough to read without standing it to attention', () => {
        const [pitch, yaw, roll] = lanyard.focus.anchor.present.rotation;
        expect(pitch).toBeGreaterThan(0.9); // ~52°, below which it is still being read edge-on
        expect(pitch).toBeLessThan(1.45); // ~83°, past which it is a card standing in a frame
        expect(yaw).toBe(0);
        expect(roll).toBe(0);
    });

    it('puts the focus camera in front of the face the card ends up showing', () => {
        // Derived, not eyeballed, and worth deriving: the pose decides where
        // the card's face points, so a camera chosen before the pose — or left
        // behind when the pose changes — frames the edge of a card instead of a
        // card.
        //
        // The card's face is +y while it lies flat; the pose turns it about X,
        // and the group's own yaw turns that into a world direction.
        const [pitch] = lanyard.focus.anchor.present.rotation;
        const yaw = lanyard.rotation[1];
        const normal = [
            Math.sin(pitch) * Math.sin(yaw),
            Math.cos(pitch),
            Math.sin(pitch) * Math.cos(yaw)
        ];

        const { offset, lookAtOffset } = lanyard.focus.camera;
        const view = offset.map((value, i) => value - lookAtOffset[i]);
        const distance = Math.hypot(...view);
        const alignment = view.reduce((sum, value, i) => sum + (value / distance) * normal[i], 0);
        // Not 1.0: the aim is deliberately pushed a fifth of a frame to the
        // right of the card to clear space for the editorial spread, and that
        // composition shift costs a few degrees of squareness.
        expect(alignment).toBeGreaterThan(0.93);

        // And at the size the card was DRAWN for. scene/badgeCanvas.js sets its
        // resolution and its layout for "a focus camera that fills a third of
        // the frame with it", and that is the number this has to agree with —
        // the shot filled 60% of frame height for a while, which is a card the
        // canvas was never laid out to be seen at. At a 45° fov the frame is
        // 0.828 x the distance, so this band is a third of it, give or take.
        expect(distance).toBeLessThan(0.30 / 0.25 / 0.828);
        expect(distance).toBeGreaterThan(0.30 / 0.45 / 0.828);
    });

    it('distinguishes the badges by employer rather than by colour alone', () => {
        // Two Apple roles are on here, so org is not unique and must not be
        // asserted as such — the pair that has to differ is (org, role).
        const identities = jobs.map((job) => {
            const { org, role } = job.artifact.parts.find((part) => part.badge).badge;
            return `${org} — ${role}`;
        });
        expect(new Set(identities).size).toBe(identities.length);
    });
});

describe('the paper stack', () => {
    const stack = deskObjects.find((object) => object.id === 'paper-stack');

    // The generator itself — sheet count, the fan, the clip, the orientation
    // convention that lets a sheet be printed at all — is covered in
    // paperStack.test.js. What is checked here is the object as placed: that
    // the desk is actually using the printed form of it, and that what it is
    // printed with is real.

    it('prints the top sheet with a paper that exists in the registry', () => {
        // A title typed into the layout file could say anything, including
        // something that was renamed three months ago. Taking it from the Work
        // means the sheet on the desk cannot be a lie.
        const printed = stack.parts.filter((part) => part.sheet);
        expect(printed).toHaveLength(1);
        const papers = works.filter((work) => work.category === 'academia');
        expect(papers.map((work) => work.title)).toContain(printed[0].sheet.title);
        expect(papers.map((work) => work.editorial.credit)).toContain(printed[0].sheet.credit);
    });

    it('prints the paper the focus actually opens on', () => {
        // FocusController starts at index 0 of worksForCategory, which keeps
        // registry order. If the printed sheet were some other paper, clicking
        // the stack would silently replace the title you just read.
        const printed = stack.parts.find((part) => part.sheet);
        const first = works.find((work) => work.category === 'academia');
        expect(printed.sheet.title).toBe(first.title);
    });

    it('is built from enough sheets to read as a run of paper', () => {
        // Five was not enough: with the jitter this object can carry, five
        // sheets have one silhouette. This is the floor that a future tidy-up
        // has to argue with.
        expect(stack.parts.filter((part) => part.args[0] === stack.focus.anchor.size[0]).length)
            .toBeGreaterThanOrEqual(8);
    });

    it('sizes the sheets as real A5, and draws the pages at the same size', () => {
        // 148 x 210 mm at surfaces.js's 3.2 units/m. Worth pinning: shrinking
        // these to buy desk space is the tempting fix that quietly costs the
        // stack its sense of scale, exactly as it would the record sleeves. The
        // focus anchor has to agree, or the page drawn over the stack is a
        // different shape from the stack.
        const sheets = stack.parts.filter((part) => part.args[1] === stack.focus.anchor.size[1]);
        expect(sheets.length).toBeGreaterThan(0);
        for (const sheet of sheets) {
            expect(sheet.args[0]).toBeCloseTo(0.148 * 3.2, 2);
            expect(sheet.args[1]).toBeCloseTo(0.210 * 3.2, 2);
        }
        expect(stack.focus.anchor.size[0]).toBeCloseTo(0.148 * 3.2, 2);
        expect(stack.focus.anchor.size[1]).toBeCloseTo(0.210 * 3.2, 2);
    });
});

describe('the focus cameras', () => {
    // The shot every clickable object is read in. Vertical fov is the camera's
    // own (DeskScene builds it at 45°); the aspect is the one the desk is
    // composed for, plus a narrower one because horizontal framing is the only
    // part of this that a window shape can take away.
    const FOV = 45;
    const WIDE = 16 / 9;
    const NARROW = 3 / 2;

    /**
     * How big the props with nothing printed on them are, per unit of
     * `targetSize`, as width x height. From `node scripts/measure-models.mjs`,
     * and pinned here for the same reason MODEL_GROUND_SIZE above is: the
     * soldering station is wider and deeper than it is tall (1.000 x 0.475 x 0.697),
     * and guessing that it is a flat bench object — as the eye does from the
     * establishing shot — puts its framing out by a factor of two.
     */
    const MEASURED_EXTENT = {
        '/models/soldering_station.glb': [1.000, 0.475, 0.697]
    };

    /**
     * The face of an object a visitor is actually meant to read, in world
     * space: where its centre ends up, how big it is, which way it faces, and
     * — the part every one of these shots used to get wrong — which way is up
     * on it.
     *
     * BUILT THE WAY THE STRATEGY BUILDS IT, not copied from the numbers in the
     * layout file, because the whole failure this exists to catch was a set of
     * numbers that each looked right on its own line. The sheet mesh is a plane
     * laid down by sheetStrategy.placeAsBed's quarter turn about X, so its "up"
     * is the anchor's local +y carried through that turn and then through the
     * object's yaw; nothing in content/deskObjects.js can say so out loud
     * because the turn does not live there, which is exactly why the paper stack
     * ended up being read 51° off its own reading axis.
     */
    function readableFace(object) {
        const { visual, anchor } = object.focus;
        const group = new THREE.Object3D();
        group.position.set(...object.position);
        group.rotation.set(...object.rotation);

        const face = new THREE.Object3D();

        if (visual === 'screen') {
            face.position.set(...anchor.position);
            face.rotation.set(...anchor.rotation);
            face.userData.size = anchor.size;
            group.add(face);
        } else if (visual === 'sheets') {
            group.position.add(new THREE.Vector3(...(anchor.approach ?? [0, 0, 0])));
            face.position.set(0, anchor.height, 0);
            face.rotation.set(-Math.PI / 2, 0, 0); // sheetStrategy.placeAsBed
            face.userData.size = anchor.size;
            group.add(face);
        } else if (visual === 'artifact' && anchor.present) {
            // The badge. partMesh maps the print onto the box's +z face and
            // lanyard.js lays the card down by rotating it, so the printed
            // plane is the card part's own transform — and then the focus pose
            // stands the whole thing up about its pivot.
            const card = object.parts.find((part) => part.badge);
            const pose = new THREE.Object3D();
            pose.rotation.set(...anchor.present.rotation);
            pose.position
                .set(...anchor.present.pivot)
                .sub(new THREE.Vector3(...anchor.present.pivot).applyEuler(pose.rotation));
            face.position.set(...card.position);
            face.rotation.set(...card.rotation);
            face.userData.size = [card.args[0], card.args[1]];
            pose.add(face);
            group.add(pose);
        } else {
            // Nothing printed, so there is no "up" to hold level and nothing to
            // be square to — but it still has to be the same size in frame as
            // everything else, so it gets the object's own bounding box, resting
            // on the spot the artifact stands on.
            const [width, height, depth] = MEASURED_EXTENT[object.model.url];
            const scale = object.model.targetSize;
            face.position.set(...(anchor.position ?? [0, 0, 0]));
            face.position.y += (height * scale) / 2;
            face.userData.size = [width * scale, height * scale, depth * scale];
            face.userData.unprinted = true;
            group.add(face);
        }

        group.updateMatrixWorld(true);
        return face;
    }

    /** The camera that object's `focus.camera` describes, already aimed. */
    function focusCamera(object, aspect) {
        const origin = new THREE.Vector3(...object.position);
        const camera = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 100);
        camera.position.copy(origin).add(new THREE.Vector3(...object.focus.camera.offset));
        camera.lookAt(origin.clone().add(new THREE.Vector3(...object.focus.camera.lookAtOffset)));
        camera.updateMatrixWorld(true);
        return camera;
    }

    /** Where the face's own corners land in NDC, as a box. */
    function projectedBox(face, camera) {
        const [width, height, depth = 0] = face.userData.size;
        const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
        for (const sx of [-0.5, 0.5]) {
            for (const sy of [-0.5, 0.5]) {
                for (const sz of depth ? [-0.5, 0.5] : [0]) {
                    const corner = face
                        .localToWorld(new THREE.Vector3(sx * width, sy * height, sz * depth))
                        .project(camera);
                    box.minX = Math.min(box.minX, corner.x);
                    box.maxX = Math.max(box.maxX, corner.x);
                    box.minY = Math.min(box.minY, corner.y);
                    box.maxY = Math.max(box.maxY, corner.y);
                }
            }
        }
        return box;
    }

    const clickable = deskObjects.filter((object) => object.clickable);
    const printed = clickable.filter((object) => !readableFace(object).userData.unprinted);

    it('gives every clickable object but the bench something printed to read', () => {
        // The bench cycles whole objects rather than pages, so it has nothing
        // printed to hold upright or to be square to — which is why it sits out
        // the two tests below and takes part in the framing ones. If that ever
        // stops being true, this is the line that says so.
        expect(clickable.filter((object) => readableFace(object).userData.unprinted).map((object) => object.id))
            .toEqual(['breadboard']);
    });

    it('puts the print the right way up on screen', () => {
        // THE ONE THAT MATTERS, and the one nothing was checking. A page mesh
        // carries its "up" in the object's own frame, so a camera standing off
        // that bearing delivers the type rotated by exactly how far off it is.
        // Measured before this: the paper stack at 51°, legible only with your
        // head on one side, and not wrong in any way you could see by reading
        // the numbers that caused it. It sits at 0.04° now.
        for (const object of printed) {
            const face = readableFace(object);
            const camera = focusCamera(object, WIDE);
            const centre = face.getWorldPosition(new THREE.Vector3());
            const up = new THREE.Vector3(0, 1, 0).transformDirection(face.matrixWorld);
            const onScreen = centre.clone().addScaledVector(up, 0.01).project(camera)
                .sub(centre.clone().project(camera));
            const roll = Math.abs(THREE.MathUtils.radToDeg(Math.atan2(onScreen.x * WIDE, onScreen.y)));
            expect(`${object.id}: ${roll.toFixed(0)}°`).toBe(`${object.id}: ${Math.min(roll, 8).toFixed(0)}°`);
        }
    });

    it('reads each face square enough on, and never from behind it', () => {
        // Straight on for the two objects that can be — the monitor tilts
        // toward the viewer and the badge is stood up to meet the camera. The
        // one that lies flat on the desk cannot be: a page read from directly
        // above is a document scanner, not a person. 32° is eyes about half a
        // metre up over a page about a third of a metre out, which is the
        // posture it is meant to be showing, and the stack measures 28°.
        for (const object of printed) {
            const face = readableFace(object);
            const camera = focusCamera(object, WIDE);
            const centre = face.getWorldPosition(new THREE.Vector3());
            const normal = new THREE.Vector3(0, 0, 1).transformDirection(face.matrixWorld);
            const toCamera = camera.position.clone().sub(centre).normalize();
            const offNormal = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(toCamera.dot(normal), -1, 1)));
            expect(`${object.id}: ${offNormal.toFixed(0)}°`).toBe(`${object.id}: ${Math.min(offNormal, 32).toFixed(0)}°`);
        }
    });

    it('stands every focus camera at a comparable remove from its subject', () => {
        // WHAT REPLACED "the same apparent size", and why. Matching the share of
        // the frame each object takes sounds like the consistency that matters
        // and is not: these objects differ by a factor of six in size, so equal
        // framing means the small ones are read from 20 cm and the big ones from
        // 70, and the close shots come out distorted — a 45° lens that near a
        // page keystones it, fills the frame with one surface, and leaves no
        // desk around it to say where the thing is. What actually has to match
        // is how far away the visitor stands.
        //
        // The band is set by the two shots that were never in question, the
        // monitor at 1.98 and the bench at 2.43, and the other two both stand at
        // 1.10 — the badge because that is the size scene/badgeCanvas.js drew
        // its print for, the stack because that is where its body type stops
        // being readable.
        //
        // THE CEILING MOVED FROM 2.40 TO 2.45, and only because the bench's
        // subject did. This distance is measured to the readable face's centre,
        // and the bench's face is its own bounding box — which was believed
        // 1.000 x 0.986 x 0.442 until the station was re-measured and turned out
        // to be 1.000 x 0.475 x 0.697 (@see MODEL_GROUND_SIZE). Its centre
        // therefore sits at y 0.237 rather than 0.493, a quarter of a unit lower
        // and so a quarter of a unit further from a camera that did not move, and
        // the reading went 2.31 -> 2.43. The old 2.40 ceiling was calibrated
        // against the understated box, so it is the ceiling that is stale here
        // rather than the shot. Nothing about the composition changed.
        //
        // 0.9 IS A FLOOR ON COMPOSITION, NOT A DESCRIPTION OF ANY CURRENT SHOT.
        // Nothing here is within 0.2 of it. It is what a 45° lens does to a page
        // closer than that: keystones it, fills the frame with one surface and
        // crowds the desk out of shot, so there is nothing left to say where the
        // object is. It came down from 1.0 when the page shots were retuned for
        // legibility — body type used to arrive at 9.4 CSS px against the 17 px
        // the DOM spreads are set in, and closing that gap was split between the
        // page's own stock (pageCanvas BASE_METRICS, 34 -> 40) and the camera,
        // because neither lever reaches a readable size alone without a cost the
        // other avoids. Legibility is held from the other side by 'leaves the
        // page type readable' below; these two tests are the same trade written
        // from its two ends, and neither is safe to move without looking at the
        // other. Moving the floor is a separate decision from removing objects,
        // which is why it stayed at 0.9 when it stopped describing anything.
        for (const object of clickable) {
            const face = readableFace(object);
            const camera = focusCamera(object, WIDE);
            const d = camera.position.distanceTo(face.getWorldPosition(new THREE.Vector3()));
            expect(`${object.id}: ${d.toFixed(2)}`).toBe(`${object.id}: ${Math.min(Math.max(d, 0.9), 2.45).toFixed(2)}`);
        }
    });

    it('frames the subject without letting it take over the frame', () => {
        // The loose end of the same trade. Whichever dimension binds — width for
        // the monitor's landscape readout, height for the other three, which are
        // all taller in frame than they are wide — has to leave the object
        // reading as a thing on a desk rather than as a wall, and still be a
        // subject rather than a speck, which is what the shots this replaced
        // were, at 13-18%.
        for (const object of clickable) {
            const box = projectedBox(readableFace(object), focusCamera(object, WIDE));
            const fill = Math.max(box.maxX - box.minX, box.maxY - box.minY) / 2;
            expect(`${object.id}: ${fill.toFixed(2)}`).toBe(`${object.id}: ${Math.min(Math.max(fill, 0.3), 0.7).toFixed(2)}`);
        }
    });

    it('leaves the page type readable at the distance it chose', () => {
        // THE COUNTERWEIGHT, and the reason the distances above are not simply
        // as large as they look best. The prose on the paper stack is drawn ON
        // the page — a `sheets` object has no DOM panel, so there is nowhere
        // else for the words to be — which makes distance and legibility one
        // knob turned in opposite directions.
        //
        // THE FLOOR IS 12 PX, RAISED FROM 9, and the old number is worth
        // recording because the argument for it does not survive contact with
        // how this type is actually rendered. It read: "nine CSS pixels on a
        // 900 px viewport is roughly nine-point type held at reading distance
        // ... Retina panels render this at twice the device resolution, so it
        // is crisp at that size rather than merely small."
        //
        // The first half is true and the second half is the mistake. A Retina
        // panel doubles the DEVICE pixels spent on a glyph; it does not change
        // how large the glyph looks. Nine CSS px is nine CSS px on every
        // display, and next to DOM copy set at 17 it reads as the small,
        // indistinct thing it is. The device-resolution half also flatters
        // itself: 9 CSS px is ~19 device px/em at DPR 2, where an unhinted
        // 400-weight stem is about 1.3 device pixels wide — its two
        // antialiasing ramps overlap and no part of the stroke reaches full
        // ink. That is the regime where type looks soft no matter how many
        // texels back it.
        //
        // 12 is not parity with the DOM's 17 and is not meant to be; it is the
        // most this shot gives up without either crowding the desk out of frame
        // or setting the page in large print. The paper stack's own camera
        // comment in deskObjects.js carries that trade, including why the
        // manuscript stock's two columns cannot pay for it with a larger face.
        // It is a floor and not a target: the stack currently sits at 12.8.
        const REFERENCE_VIEWPORT_HEIGHT = 900;
        const printed = clickable.filter((object) => object.focus.anchor?.paper);
        expect(printed.map((object) => object.id).sort()).toEqual(['paper-stack']);

        for (const object of printed) {
            const box = projectedBox(readableFace(object), focusCamera(object, WIDE));
            const share = (box.maxY - box.minY) / 2;
            const pixels = (metricsFor(object.focus.anchor.paper).bodyFontSize / PAGE_CANVAS_HEIGHT)
                * share * REFERENCE_VIEWPORT_HEIGHT;
            expect(`${object.id}: ${pixels.toFixed(1)}px`).toBe(`${object.id}: ${Math.max(pixels, 12).toFixed(1)}px`);
        }
    });

    it('keeps the whole face inside the frame, on a narrow window too', () => {
        // Vertical framing is fov-only and holds everywhere; horizontal is the
        // one a window shape can take away, so the tighter of the two common
        // desktop aspects is the one worth checking.
        for (const aspect of [WIDE, NARROW]) {
            for (const object of clickable) {
                const box = projectedBox(readableFace(object), focusCamera(object, aspect));
                const worst = Math.max(Math.abs(box.minX), Math.abs(box.maxX), Math.abs(box.minY), Math.abs(box.maxY));
                expect(`${object.id} at ${aspect.toFixed(2)}: ${worst.toFixed(2)}`)
                    .toBe(`${object.id} at ${aspect.toFixed(2)}: ${Math.min(worst, 0.95).toFixed(2)}`);
            }
        }
    });

    it('centres what it frames, unless an editorial spread needs the room', () => {
        // The objects that carry their own words — the screen and the sheets —
        // are read in the middle of the frame. The two that are described by the
        // DOM spread beside them (see .artifact-spread, which starts at 52% of
        // the viewport) have to leave that column clear, so they sit in the left
        // half instead.
        //
        // Measured on the OBJECT, not on `lookAtOffset`: the aim point is the
        // middle of the frame by definition, and the composition shift is the
        // gap between the two.
        for (const object of clickable) {
            const centre = readableFace(object).getWorldPosition(new THREE.Vector3());
            const onScreen = centre.project(focusCamera(object, WIDE));
            const wants = object.focus.visual === 'artifact' ? 'off to the left' : 'centred';
            const has = Math.abs(onScreen.x) < 0.12 ? 'centred' : (onScreen.x < 0 ? 'off to the left' : 'off to the right');
            expect(`${object.id}: ${has}`).toBe(`${object.id}: ${wants}`);
        }
    });

    it('stands the camera over the desk rather than under or on it', () => {
        // The desktop is world y = 0 and everything rests on it. A focus camera
        // below that is inside the furniture; one up at the establishing shot's
        // 2.5 is not looking at anything on this desk closely.
        for (const object of clickable) {
            const y = object.position[1] + object.focus.camera.offset[1];
            expect(`${object.id}: ${y.toFixed(2)}`).toBe(`${object.id}: ${Math.min(Math.max(y, 0.25), 1.6).toFixed(2)}`);
        }
    });
});
