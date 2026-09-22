import { describe, expect, it } from 'vitest';
import { buildLanyard, LANYARD_FOOTPRINT } from './lanyard.js';
import { POSE_GROUP_NAME } from '../scene/partMesh.js';

const APPLE = { org: 'Apple', role: 'Software Engineer', cardColor: '#e9e6e0', strapColor: '#2f3136' };

const cardOf = (parts) => parts.find((part) => part.badge);
const strapsOf = (parts) => parts.filter((part) => part.color === APPLE.strapColor);
const hardwareOf = (parts) => parts.filter((part) => part.material?.metalness === 1);

/**
 * A part's axis-aligned bounds, rotations and all.
 *
 * Written out rather than approximated because the strap now ROLLS as well as
 * yaws, and a bound that ignored the roll would quietly miss the very thing
 * the roll risks — a corner of the tape dropping through the desktop. Three
 * composes Euler angles in XYZ order as R = Rx·Ry·Rz, which is the order the
 * corners are transformed in here.
 */
function boundsOf(part) {
    const [hx, hy, hz] = part.type === 'torus'
        ? [part.args[0] + part.args[1], part.args[0] + part.args[1], part.args[1]]
        : part.args.slice(0, 3).map((size) => size / 2);
    const [rx, ry, rz] = part.rotation ?? [0, 0, 0];
    const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };

    for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
            for (const sz of [-1, 1]) {
                let [x, y, z] = [sx * hx, sy * hy, sz * hz];
                [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
                [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
                [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
                box.minX = Math.min(box.minX, part.position[0] + x);
                box.maxX = Math.max(box.maxX, part.position[0] + x);
                box.minY = Math.min(box.minY, part.position[1] + y);
                box.maxY = Math.max(box.maxY, part.position[1] + y);
                box.minZ = Math.min(box.minZ, part.position[2] + z);
                box.maxZ = Math.max(box.maxZ, part.position[2] + z);
            }
        }
    }
    return box;
}

describe('buildLanyard', () => {
    it('returns an artifact shape — a parts array under `parts`', () => {
        // Deliberately the same shape a Work's `artifact` takes and a desk
        // object's `parts` takes, because one call has to satisfy both.
        const lanyard = buildLanyard(APPLE);
        expect(Array.isArray(lanyard.parts)).toBe(true);
        expect(lanyard.parts.length).toBeGreaterThan(1);
    });

    it('is a card in a holder with hardware on it, not a card on its own', () => {
        // The first version of this was one printed box and three flat sticks.
        // Nothing in it had any volume, so nothing in it could catch the window
        // — which is most of why it read as a sticker rather than an object.
        const { parts } = buildLanyard(APPLE);
        expect(parts.filter((part) => part.badge)).toHaveLength(1);
        expect(hardwareOf(parts).length).toBeGreaterThanOrEqual(2);
        expect(parts.some((part) => part.type === 'torus')).toBe(true); // the split ring
        expect(strapsOf(parts).length).toBeGreaterThan(6);
    });

    it('is deterministic, so the resting prop and the artifact can be compared', () => {
        // validateDeskLayout deep-compares the desk object's parts against the
        // first job's artifact parts. Any randomness here would make that
        // comparison fail intermittently and for no visible reason.
        expect(JSON.stringify(buildLanyard(APPLE))).toBe(JSON.stringify(buildLanyard(APPLE)));
    });

    it('falls differently for a different seed', () => {
        // Six jobs share one builder. Without this they would share one coil,
        // and the run of badges would read as one asset placed six times — the
        // rule the two shelf plants are also held to.
        const first = strapsOf(buildLanyard({ ...APPLE, seed: 1 }).parts);
        const second = strapsOf(buildLanyard({ ...APPLE, seed: 2 }).parts);
        expect(JSON.stringify(first)).not.toBe(JSON.stringify(second));
    });

    it('carries the employer, role and card furniture onto the card', () => {
        const card = cardOf(buildLanyard({ ...APPLE, access: 'EMPLOYEE', year: '2025' }).parts);
        expect(card.badge).toEqual({ org: 'Apple', role: 'Software Engineer', access: 'EMPLOYEE', year: '2025' });
    });

    it('passes optional card furniture through only when it is given', () => {
        // An `accent: undefined` key would survive JSON.stringify as nothing but
        // would make the deep comparison above depend on key insertion order.
        const plain = cardOf(buildLanyard(APPLE).parts).badge;
        for (const field of ['accent', 'access', 'year']) expect(plain).not.toHaveProperty(field);
        expect(cardOf(buildLanyard({ ...APPLE, accent: '#1b1d22' }).parts).badge.accent).toBe('#1b1d22');
    });

    it('lies the card flat by rotating a quarter turn about X', () => {
        // scene/partMesh.js maps drawn artwork onto BoxGeometry's +z face and
        // only that one. The turn sends local +z to world +y, so the badge
        // reads face-up. Authoring the card flat instead (thickness in y) would
        // print the badge on an edge, which is invisible from every camera.
        const card = cardOf(buildLanyard(APPLE).parts);
        expect(card.type).toBe('box');
        expect(card.rotation).toEqual([-Math.PI / 2, 0, 0]);
    });

    it('sits the card on top of its holder, not inside it', () => {
        // The holder's whole job is the rim of plastic showing around the card.
        // A card at the same height as the sleeve z-fights with it; a card
        // under it is invisible.
        const { parts } = buildLanyard(APPLE);
        const card = boundsOf(cardOf(parts));
        const sleeve = boundsOf(parts.find((part) => part.color === '#cfd2d6'));
        expect(card.minY).toBeGreaterThanOrEqual(sleeve.maxY - 1e-9);
        expect(sleeve.minX).toBeLessThan(card.minX);
        expect(sleeve.maxX).toBeGreaterThan(card.maxX);
    });

    it('sizes the card as a real CR80 badge in a holder', () => {
        // 54 x 86 mm at surfaces.js's 3.2 units/m is 0.173 x 0.275. The values
        // are a touch larger because the card is in a sleeve; anything much
        // beyond this and it stops reading as an ID badge.
        const card = cardOf(buildLanyard(APPLE).parts);
        expect(card.args[0]).toBeGreaterThan(0.173);
        expect(card.args[0]).toBeLessThan(0.24);
        expect(card.args[1]).toBeGreaterThan(0.275);
        expect(card.args[1]).toBeLessThan(0.36);
    });

    it('leaves no part of any badge sunk into the desktop', () => {
        // THE ROLL IS WHY THIS EXISTS. A rolled strap segment drops one long
        // edge below its own centre, and left at a flat thickness/2 that corner
        // goes through the desk — which reads far worse than tape lying a
        // millimetre high. buildLanyard lifts each segment by exactly what its
        // own roll costs it, and this is the assertion that keeps that true for
        // every seed rather than for the one that was looked at.
        for (const seed of [1, 2, 3, 4, 5, 6]) {
            for (const part of buildLanyard({ ...APPLE, seed }).parts) {
                expect(boundsOf(part).minY).toBeGreaterThanOrEqual(-1e-9);
            }
        }
    });

    it('keeps the strap on the desk rather than hovering over it', () => {
        // The other direction: lifting every segment by a safe constant would
        // pass the test above and leave the tape floating.
        for (const strap of strapsOf(buildLanyard(APPLE).parts)) {
            expect(boundsOf(strap).minY).toBeLessThan(0.002);
        }
    });

    it('gives the strap segments unequal yaws and a twist along its length', () => {
        // Yaw alone lays out a path; the ROLL is what gives neighbouring
        // segments different normals, so the window lights them unequally and
        // the run reads as webbing instead of as a painted line.
        const straps = strapsOf(buildLanyard(APPLE).parts);
        const yaws = straps.map((part) => part.rotation[1]);
        const rolls = straps.map((part) => part.rotation[0]);
        expect(new Set(yaws).size).toBe(yaws.length);
        expect(new Set(rolls).size).toBe(rolls.length);
        expect(rolls.some((roll) => Math.abs(roll) > 0.05)).toBe(true);
        expect(Math.max(...rolls.map(Math.abs))).toBeLessThan(0.5); // a twist, not a tangle
    });

    it('runs the strap away from the card in one connected walk', () => {
        // Segments placed independently leave gaps the eye reads instantly as
        // a dashed line. Each one starts where the last ended, so consecutive
        // centres are one segment length apart.
        const straps = strapsOf(buildLanyard(APPLE).parts);
        const length = straps[0].args[0];
        for (let i = 1; i < straps.length; i++) {
            const dx = straps[i].position[0] - straps[i - 1].position[0];
            const dz = straps[i].position[2] - straps[i - 1].position[2];
            expect(Math.hypot(dx, dz)).toBeCloseTo(length, 2);
        }
    });

    it('starts the strap at the ring rather than somewhere near it', () => {
        const { parts } = buildLanyard(APPLE);
        const ring = boundsOf(parts.find((part) => part.type === 'torus'));
        const first = boundsOf(strapsOf(parts)[0]);
        expect(first.minZ).toBeGreaterThanOrEqual(ring.maxZ - 0.02);
        expect(first.minZ).toBeLessThan(ring.maxZ + 0.02);
    });

    it('stands only the badge up, leaving the strap where it fell', () => {
        // scene/partMesh.js collects the tagged parts into the group
        // artifactStrategy rotates. Tagging the strap too would tip the whole
        // lanyard like a cardboard cutout; tagging nothing would leave the card
        // flat on the desk under a camera that has come in to read it.
        const { parts } = buildLanyard(APPLE);
        expect(cardOf(parts).pose).toBe(POSE_GROUP_NAME);
        for (const part of hardwareOf(parts)) expect(part.pose).toBe(POSE_GROUP_NAME);
        for (const strap of strapsOf(parts)) expect(strap.pose).toBeUndefined();
    });

    it('makes the strap matte, the card glossier and the hardware metal', () => {
        const { parts } = buildLanyard(APPLE);
        const card = cardOf(parts);
        const strap = strapsOf(parts)[0];
        expect(card.material.roughness).toBeLessThan(strap.material.roughness);
        expect(card.material.envMapIntensity).toBeGreaterThan(strap.material.envMapIntensity);
        for (const part of hardwareOf(parts)) {
            // Metalness is 0 or 1 for anything physical — an intermediate value
            // is not a material. This is the only 1 on this object.
            expect(part.material.metalness).toBe(1);
            expect(part.material.roughness).toBeLessThan(0.35);
        }
        expect(strap.material.metalness).toBe(0);
    });

    it('colours the card and the strap independently', () => {
        const { parts } = buildLanyard(APPLE);
        expect(cardOf(parts).color).toBe('#e9e6e0');
        expect(strapsOf(parts).length).toBeGreaterThan(0);
        for (const strap of strapsOf(parts)) {
            expect(strap.color).toBe('#2f3136');
        }
    });
});

describe('LANYARD_FOOTPRINT', () => {
    it('actually contains every part the builder emits, for every seed', () => {
        // The constant is what the layout tests check clearances against, so a
        // footprint that had drifted from the geometry would report a clear
        // desk while two objects intersected in the render. Every seed, because
        // the strap's walk differs per job and only one of them was measured.
        for (const seed of [1, 2, 3, 4, 5, 6]) {
            for (const part of buildLanyard({ ...APPLE, seed }).parts) {
                const box = boundsOf(part);
                expect(box.minX).toBeGreaterThanOrEqual(LANYARD_FOOTPRINT.minX);
                expect(box.maxX).toBeLessThanOrEqual(LANYARD_FOOTPRINT.maxX);
                expect(box.minZ).toBeGreaterThanOrEqual(LANYARD_FOOTPRINT.minZ);
                expect(box.maxZ).toBeLessThanOrEqual(LANYARD_FOOTPRINT.maxZ);
            }
        }
    });

    it('is not wildly larger than the geometry it bounds', () => {
        // The other direction. A footprint padded to be trivially safe would
        // pass the containment check above while reserving half the desk.
        const width = LANYARD_FOOTPRINT.maxX - LANYARD_FOOTPRINT.minX;
        const depth = LANYARD_FOOTPRINT.maxZ - LANYARD_FOOTPRINT.minZ;
        expect(width).toBeLessThan(0.6);
        expect(depth).toBeLessThan(0.62);
    });

    it('reaches forward of the card, because that is the side the strap is on', () => {
        // The clip is on the card's near edge so the card can stand up on it
        // (see the lanyard's `anchor.present` in deskObjects.js), which puts
        // the coil between the card and the viewer. If this ever flips, the
        // object's position on the desk has to move with it.
        expect(LANYARD_FOOTPRINT.maxZ).toBeGreaterThan(-LANYARD_FOOTPRINT.minZ);
    });
});
