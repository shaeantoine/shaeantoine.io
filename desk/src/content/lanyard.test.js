import { describe, expect, it } from 'vitest';
import { buildLanyard, BADGE_FRONT, CARD_HEIGHT, LANYARD_FOOTPRINT } from './lanyard.js';
import { POSE_GROUP_NAME } from '../scene/partMesh.js';

const APPLE = { org: 'Apple', role: 'Software Engineer', cardColor: '#e9e6e0', strapColor: '#2f3136' };

const cardOf = (parts) => parts.find((part) => part.badge);
const hardwareOf = (parts) => parts.filter((part) => part.material?.metalness === 1);

/**
 * A part's axis-aligned bounds, rotations and all.
 *
 * Written out rather than approximated because the card and the hinge barrel
 * are both authored turned, and a bound that ignored the rotation would quietly
 * miss the thing these tests are about — a corner of the assembly sitting below
 * the desktop. Three composes Euler angles in XYZ order as R = Rx·Ry·Rz, which
 * is the order the corners are transformed in here.
 *
 * A cylinder is bounded as the box around it: radius either side of its own
 * axis, and its length along it. Conservative by the corners it does not fill,
 * which is the right direction for a clearance check.
 */
function boundsOf(part) {
    const [hx, hy, hz] = part.type === 'torus'
        ? [part.args[0] + part.args[1], part.args[0] + part.args[1], part.args[1]]
        : part.type === 'cylinder'
            ? [part.args[0], part.args[2] / 2, part.args[0]]
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

    it('is a card in a holder with a clip on it, not a card on its own', () => {
        // The first version of this was one printed box and three flat sticks.
        // Nothing in it had any volume, so nothing in it could catch the window
        // — which is most of why it read as a sticker rather than an object.
        const { parts } = buildLanyard(APPLE);
        expect(parts.filter((part) => part.badge)).toHaveLength(1);
        // Swivel, hinge, two jaws and the lip — the clip is the only metal here
        // and it is what the object is now named for.
        expect(hardwareOf(parts)).toHaveLength(5);
        expect(parts.some((part) => part.type === 'cylinder')).toBe(true); // the hinge barrel
    });

    it('is deterministic, so the resting prop and the artifact can be compared', () => {
        // validateDeskLayout deep-compares the desk object's parts against the
        // first job's artifact parts. Any randomness here would make that
        // comparison fail intermittently and for no visible reason.
        expect(JSON.stringify(buildLanyard(APPLE))).toBe(JSON.stringify(buildLanyard(APPLE)));
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

    it('leaves no part of the badge sunk into the desktop', () => {
        // Nothing here is authored at a height by eye — the holder sits on the
        // desk, the card sits on the holder, and every piece of the clip is
        // placed off the hinge barrel's own radius. This is what catches an
        // arithmetic slip in that chain, which otherwise renders as hardware
        // half-buried in the desk and is invisible in the data.
        for (const part of buildLanyard(APPLE).parts) {
            expect(boundsOf(part).minY).toBeGreaterThanOrEqual(-1e-9);
        }
    });

    it('rests the badge on the desk rather than hovering over it', () => {
        // The other direction: lifting everything by a safe constant would pass
        // the test above and leave the badge floating.
        const lowest = Math.min(...buildLanyard(APPLE).parts.map((part) => boundsOf(part).minY));
        expect(lowest).toBeLessThan(0.002);
    });

    it('builds the clip as one connected assembly, not five floating pieces', () => {
        // Every piece is placed off the one behind it — the slot's front edge,
        // then the hinge barrel's own radius — so the clip cannot develop a gap
        // when one part is resized. NOT a single chain, which is what this
        // originally asserted and what it is not: the two jaws both branch off
        // the hinge, so they sit side by side rather than one behind the other.
        // What actually has to hold is that no piece is adrift from all the
        // rest, on any axis. A clip in pieces is the one failure here that
        // reads as a modelling bug rather than as a style.
        const hardware = hardwareOf(buildLanyard(APPLE).parts).map(boundsOf);
        const touches = (a, b) => a.minX <= b.maxX + 1e-9 && b.minX <= a.maxX + 1e-9
            && a.minY <= b.maxY + 1e-9 && b.minY <= a.maxY + 1e-9
            && a.minZ <= b.maxZ + 1e-9 && b.minZ <= a.maxZ + 1e-9;

        hardware.forEach((piece, i) => {
            const joined = hardware.some((other, j) => i !== j && touches(piece, other));
            expect(`piece ${i} at z ${piece.minZ.toFixed(3)}: ${joined ? 'joined' : 'adrift'}`)
                .toBe(`piece ${i} at z ${piece.minZ.toFixed(3)}: joined`);
        });
    });

    it('starts the clip at the slot it threads through', () => {
        // A clip floating a few millimetres in front of the punched hole is the
        // same bug as a strap that used to start near the ring rather than at it.
        const { parts } = buildLanyard(APPLE);
        const slot = parts.filter((part) => part.color === '#cfd2d6').map(boundsOf);
        const slotFront = Math.max(...slot.map((box) => box.maxZ));
        const clipBack = Math.min(...hardwareOf(parts).map((part) => boundsOf(part).minZ));

        expect(clipBack).toBeLessThan(slotFront);
    });

    it('agrees with BADGE_FRONT about where the object ends', () => {
        // Two other files place things against this number — the focus pivot
        // and the desk's spacing chain — so it going stale is not a cosmetic
        // problem. It is exported rather than measured precisely so that both
        // of them move when the clip does, and this is what keeps the export
        // honest about the geometry it claims to describe.
        const front = Math.max(...buildLanyard(APPLE).parts.map((part) => boundsOf(part).maxZ));
        expect(front).toBeCloseTo(BADGE_FRONT, 9);
    });

    it('stands the whole badge up, clip included', () => {
        // scene/partMesh.js collects the tagged parts into the group
        // artifactStrategy rotates. With the strap gone there is nothing left
        // that should stay on the desk — the clip is what the card is propped
        // ON, so leaving it behind would stand the card on nothing.
        for (const part of buildLanyard(APPLE).parts) {
            expect(part.pose).toBe(POSE_GROUP_NAME);
        }
    });

    it('makes the card glossy plastic and the clip hard metal', () => {
        const { parts } = buildLanyard(APPLE);
        const card = cardOf(parts);
        for (const part of hardwareOf(parts)) {
            // Metalness is 0 or 1 for anything physical — an intermediate value
            // is not a material. These are the only 1s on this object.
            expect(part.material.metalness).toBe(1);
            expect(part.material.roughness).toBeLessThan(0.35);
            // The whole reason the clip reads as a separate object: it is the
            // only thing here that returns a hard highlight.
            expect(part.material.roughness).toBeLessThan(card.material.roughness);
        }
        expect(card.material.metalness).toBe(0);
    });

    it('colours the card per job and leaves the hardware alone', () => {
        // `strapColor` still comes in — scene/badgeCanvas.js paints the card's
        // header band with it — but nothing on the object is that colour any
        // more, and the clip is nickel on every badge.
        const { parts } = buildLanyard(APPLE);
        expect(cardOf(parts).color).toBe('#e9e6e0');
        for (const part of hardwareOf(parts)) expect(part.color).toBe('#b9bcc1');
    });
});

describe('LANYARD_FOOTPRINT', () => {
    it('actually contains every part the builder emits', () => {
        // The constant is what the layout tests check clearances against, so a
        // footprint that had drifted from the geometry would report a clear desk
        // while two objects intersected in the render. It is derived from the
        // same constants now rather than transcribed, which makes this a check
        // on the derivation rather than on somebody's typing — and the
        // derivation is the part that can be wrong, because it names the pieces
        // it expects to be outermost.
        for (const part of buildLanyard(APPLE).parts) {
            const box = boundsOf(part);
            expect(box.minX).toBeGreaterThanOrEqual(LANYARD_FOOTPRINT.minX - 1e-9);
            expect(box.maxX).toBeLessThanOrEqual(LANYARD_FOOTPRINT.maxX + 1e-9);
            expect(box.minZ).toBeGreaterThanOrEqual(LANYARD_FOOTPRINT.minZ - 1e-9);
            expect(box.maxZ).toBeLessThanOrEqual(LANYARD_FOOTPRINT.maxZ + 1e-9);
        }
    });

    it('is not larger than the geometry it bounds', () => {
        // The other direction, and it can be exact now that the box is derived
        // — a footprint padded to be trivially safe would pass the containment
        // check above while reserving desk the badge does not use, and the
        // spacing chain would space the whole desk around the padding.
        const parts = buildLanyard(APPLE).parts.map(boundsOf);
        expect(Math.min(...parts.map((b) => b.minX))).toBeCloseTo(LANYARD_FOOTPRINT.minX, 9);
        expect(Math.max(...parts.map((b) => b.maxX))).toBeCloseTo(LANYARD_FOOTPRINT.maxX, 9);
        expect(Math.min(...parts.map((b) => b.minZ))).toBeCloseTo(LANYARD_FOOTPRINT.minZ, 9);
        expect(Math.max(...parts.map((b) => b.maxZ))).toBeCloseTo(LANYARD_FOOTPRINT.maxZ, 9);
    });

    it('reaches further forward of the card than behind it, because the clip is', () => {
        // The clip is on the card's near edge so the card can stand up on it
        // (see the badge's `anchor.present` in deskObjects.js), which puts the
        // hardware between the card and the viewer. If this ever flips, the
        // object's position on the desk has to be re-solved with it — both of
        // its coordinates are measured off this box.
        expect(LANYARD_FOOTPRINT.maxZ).toBeGreaterThan(CARD_HEIGHT / 2);
    });
});
