import { describe, expect, it } from 'vitest';
import { buildPaperStack, paperStackFootprint, paperStackHeight } from './paperStack.js';

const A5 = { width: 0.474, depth: 0.672 };
const SHEETS = 9;
const build = (overrides = {}) => buildPaperStack({ sheets: SHEETS, ...A5, seed: 20260913, ...overrides });

// The builder emits the sheets bottom-first and then the clip, which is the
// order these two rely on rather than sniffing at part dimensions.
const sheetsOf = (parts, sheets = SHEETS) => parts.slice(0, sheets);
const clipOf = (parts, sheets = SHEETS) => parts.slice(sheets);

describe('buildPaperStack', () => {
    it('emits one part per sheet, plus the clip', () => {
        expect(build({ sheets: 5 })).toHaveLength(5 + clipOf(build()).length);
        expect(build({ sheets: 2 })).toHaveLength(2 + clipOf(build()).length);
        expect(clipOf(build()).length).toBeGreaterThan(0);
    });

    it('is seeded, so the arrangement never reshuffles between loads', () => {
        expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
    });

    it('gives a different seed a different arrangement', () => {
        expect(JSON.stringify(build())).not.toBe(JSON.stringify(build({ seed: 7 })));
    });

    it('lies every sheet flat by rotation, so one of them can be printed', () => {
        // scene/partMesh.js maps drawn artwork onto the +z face and only that
        // one. A sheet authored flat (thickness in y) has its readable face
        // pointing at +y and can never carry a print — which is exactly why
        // this object used to be a stack of blank boxes. The quarter turn about
        // X is what sends local +z to world +y.
        for (const sheet of sheetsOf(build())) {
            expect(sheet.type).toBe('box');
            expect(sheet.rotation[0]).toBeCloseTo(-Math.PI / 2, 9);
            // ...and the yaw has to be the Z term, not the Y one. Three
            // composes XYZ as Rx·Ry·Rz, so a Y term here would turn the sheet
            // about its short axis before it was laid down and tip it on edge.
            expect(sheet.rotation[1]).toBe(0);
        }
    });

    it('rests the bottom sheet exactly on the desk', () => {
        const lowest = Math.min(...sheetsOf(build()).map((sheet) => sheet.position[1] - sheet.args[2] / 2));
        expect(lowest).toBeCloseTo(0, 9);
    });

    it('stacks the sheets flush, with no gaps and no intersections', () => {
        const parts = [...sheetsOf(build())].sort((a, b) => a.position[1] - b.position[1]);
        for (let i = 1; i < parts.length; i++) {
            const topOfBelow = parts[i - 1].position[1] + parts[i - 1].args[2] / 2;
            const bottomOfThis = parts[i].position[1] - parts[i].args[2] / 2;
            expect(bottomOfThis).toBeCloseTo(topOfBelow, 9);
        }
    });

    it('reports the height the sheets actually reach', () => {
        // content/deskObjects.js floats the focused pages off this number, and
        // a page drawn below the top of the stack z-fights with it.
        const top = Math.max(...sheetsOf(build()).map((sheet) => sheet.position[1] + sheet.args[2] / 2));
        expect(paperStackHeight(SHEETS)).toBeCloseTo(top, 9);
    });

    it('offsets and yaws every sheet, because a squared stack renders as one box', () => {
        // The slop is the only thing giving each leaf its own lit edge. Without
        // it the edges coincide, no shadow falls between them, and nine sheets
        // have a single silhouette.
        const parts = sheetsOf(build());
        const signatures = parts.map((s) => `${s.position[0]},${s.position[2]},${s.rotation[2]}`);
        expect(new Set(signatures).size).toBe(signatures.length);
        for (const sheet of parts) {
            expect(sheet.position[0]).not.toBe(0);
            expect(sheet.position[2]).not.toBe(0);
            expect(sheet.rotation[2]).not.toBe(0);
        }
    });

    it('fans widest at the bottom and squares up at the top', () => {
        // The ramp is the whole difference between a stack you can count and a
        // white box. It runs this way round because the TOP sheet is the one
        // carrying the print, and a title block on a crooked sheet reads as a
        // mistake rather than as a stack.
        const parts = sheetsOf(build());
        const skew = (sheet) => Math.abs(sheet.rotation[2]);
        const bottomHalf = parts.slice(0, Math.floor(parts.length / 2));
        const topSheet = parts[parts.length - 1];
        const averageBottom = bottomHalf.reduce((sum, sheet) => sum + skew(sheet), 0) / bottomHalf.length;
        expect(skew(topSheet)).toBeLessThan(averageBottom);
    });

    it('keeps the slop small enough to still read as a stack', () => {
        for (const sheet of sheetsOf(build())) {
            expect(Math.abs(sheet.position[0])).toBeLessThan(A5.width * 0.035);
            expect(Math.abs(sheet.position[2])).toBeLessThan(A5.depth * 0.035);
            expect(Math.abs(sheet.rotation[2])).toBeLessThan(0.05);
        }
    });

    it('scales the jitter with the sheet, rather than applying a fixed wobble', () => {
        // A larger sheet should be proportionally as untidy, not absolutely as
        // untidy — otherwise a big sheet looks machine-squared next to a small
        // one that looks thrown down.
        const small = sheetsOf(buildPaperStack({ sheets: 4, width: 0.2, depth: 0.3, seed: 1 }), 4);
        const large = sheetsOf(buildPaperStack({ sheets: 4, width: 0.8, depth: 1.2, seed: 1 }), 4);
        for (let i = 0; i < small.length; i++) {
            expect(Math.abs(large[i].position[0])).toBeCloseTo(Math.abs(small[i].position[0]) * 4, 6);
        }
    });

    it('gives every sheet the same real size', () => {
        for (const sheet of sheetsOf(build())) {
            expect(sheet.args[0]).toBe(A5.width);
            expect(sheet.args[1]).toBe(A5.depth);
        }
    });

    it('prints the top sheet, and only the top sheet', () => {
        // The print is what makes this object legible from the establishing
        // shot. On any sheet but the topmost it would be hidden by the one
        // above it, which is the kind of mistake that costs a texture and
        // shows nothing.
        const parts = sheetsOf(build({ print: { title: 'A Paper', credit: 'Someone' } }));
        const printed = parts.filter((sheet) => sheet.sheet);
        expect(printed).toHaveLength(1);
        expect(printed[0]).toBe(parts[parts.length - 1]);
        expect(printed[0].sheet.title).toBe('A Paper');
    });

    it('leaves the stack blank when nothing is handed to it', () => {
        expect(sheetsOf(build()).some((sheet) => sheet.sheet)).toBe(false);
    });

    it('makes the paper almost fully diffuse', () => {
        // A glossier setting immediately reads as plastic sheet. This is the
        // one material value on the stack that would be tempting to raise for
        // "a bit more life" and should not be.
        for (const sheet of sheetsOf(build())) {
            expect(sheet.material.roughness).toBeGreaterThan(0.9);
            expect(sheet.material.metalness).toBe(0);
        }
    });

    it('draws sheets thick enough for the depth buffer to separate', () => {
        // Real copier paper is 0.1 mm, which at this scene's scale is 0.00032
        // — below what resolves at the near plane, so the stack would z-fight
        // into a single flickering surface.
        for (const sheet of sheetsOf(build())) {
            expect(sheet.args[2]).toBeGreaterThan(0.005);
        }
    });

    it('clips the stack in real metal, which is the only specular on this flank', () => {
        // Everything else here is matte paper. If the clip is ever softened to
        // match, the object loses the one highlight that finds it at a glance.
        const clip = clipOf(build());
        expect(clip.length).toBeGreaterThanOrEqual(3);
        for (const part of clip) {
            expect(part.material.metalness).toBe(1);
            expect(part.material.roughness).toBeLessThan(0.4);
        }
        expect(clip.some((part) => part.type === 'cylinder')).toBe(true);
    });

    it('puts the clip on the left edge, which is what the page turn pivots on', () => {
        // focus/strategies/sheetStrategy.js hinges the sheet on x = -width/2.
        // A clip anywhere else means paper pivoting about an edge nothing is
        // holding, which is wrong in a way people notice without noticing.
        for (const part of clipOf(build())) {
            expect(part.position[0]).toBeLessThan(-A5.width / 2 + 0.06);
        }
    });

    it('keeps the clip clear of the sheets the focus pages float above', () => {
        // content/deskObjects.js floats the focused pages at
        // paperStackHeight + 0.0105, so anything standing proud of the stack by
        // more than that spears the page you are reading.
        const PAGE_CLEARANCE = 0.0105;
        const top = paperStackHeight(SHEETS);
        for (const part of clipOf(build())) {
            const halfHeight = part.type === 'cylinder' ? part.args[0] : part.args[1] / 2;
            expect(part.position[1] + halfHeight).toBeLessThan(top + PAGE_CLEARANCE);
        }
    });
});

describe('paperStackFootprint', () => {
    it('contains every sheet the builder emits', () => {
        // The layout tests check clearances against this rather than
        // re-deriving the generator's bounds, so a bound that had drifted from
        // the geometry would report a clear desk while objects intersected.
        const bounds = paperStackFootprint({ sheets: SHEETS, ...A5 });
        for (const sheet of sheetsOf(build())) {
            const yaw = sheet.rotation[2];
            const halfX = Math.abs(Math.cos(yaw)) * sheet.args[0] / 2 + Math.abs(Math.sin(yaw)) * sheet.args[1] / 2;
            const halfZ = Math.abs(Math.sin(yaw)) * sheet.args[0] / 2 + Math.abs(Math.cos(yaw)) * sheet.args[1] / 2;
            expect(sheet.position[0] - halfX).toBeGreaterThanOrEqual(bounds.minX);
            expect(sheet.position[0] + halfX).toBeLessThanOrEqual(bounds.maxX);
            expect(sheet.position[2] - halfZ).toBeGreaterThanOrEqual(bounds.minZ);
            expect(sheet.position[2] + halfZ).toBeLessThanOrEqual(bounds.maxZ);
        }
    });

    it('contains the clip, which hangs off the left edge', () => {
        const bounds = paperStackFootprint({ sheets: SHEETS, ...A5 });
        for (const part of clipOf(build())) {
            const halfX = part.type === 'cylinder' ? part.args[0] : part.args[0] / 2;
            const halfZ = part.type === 'cylinder' ? part.args[2] / 2 : part.args[2] / 2;
            expect(part.position[0] - halfX).toBeGreaterThanOrEqual(bounds.minX);
            expect(part.position[2] - halfZ).toBeGreaterThanOrEqual(bounds.minZ);
            expect(part.position[2] + halfZ).toBeLessThanOrEqual(bounds.maxZ);
        }
    });

    it('is only slightly larger than a single sheet', () => {
        // The other direction: a bound padded to be trivially safe would pass
        // the containment check while reserving desk space that is actually
        // free — and this object sits on the tightest strip of the desk.
        const bounds = paperStackFootprint({ sheets: SHEETS, ...A5 });
        expect(-bounds.minX).toBeGreaterThan(A5.width / 2);
        expect(-bounds.minX).toBeLessThan((A5.width / 2) * 1.15);
        expect(bounds.maxX).toBeLessThan((A5.width / 2) * 1.15);
        expect(bounds.maxZ).toBeLessThan((A5.depth / 2) * 1.15);
    });

    it('never reaches further right than left, since only the left has a clip on it', () => {
        // Today the fan out-reaches the clip and the two sides come out equal;
        // shrink the jitter and the clip becomes the left edge. Either is fine.
        // What must never happen is the bound forgetting the clip and reporting
        // a symmetric footprint for an object that isn't one.
        const bounds = paperStackFootprint({ sheets: SHEETS, ...A5 });
        expect(-bounds.minX).toBeGreaterThanOrEqual(bounds.maxX);

        const squared = paperStackFootprint({ sheets: SHEETS, width: 0.474, depth: 0.672 });
        expect(-squared.minX).toBeGreaterThan(A5.width / 2 + 0.013); // the clip's own reach
    });
});
