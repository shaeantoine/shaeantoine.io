import { describe, expect, it } from 'vitest';
import { validateDeskObject, validateDeskLayout } from './deskSchema.js';

const validObject = {
    id: 'obj-1',
    category: 'essays',
    label: 'Essays',
    clickable: true,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    parts: [{ type: 'box', args: [1, 1, 1], position: [0, 0, 0], color: '#ffffff' }]
};

const validAtmosphereObject = {
    id: 'obj-2',
    category: null,
    label: null,
    clickable: false,
    position: [1, 0, 1],
    rotation: [0, 0, 0],
    parts: [{ type: 'sphere', args: [0.2, 8, 8], position: [0, 0, 0], color: '#000000' }]
};

const worksFixture = [{ category: 'essays' }];

describe('validateDeskObject', () => {
    it('returns the object unchanged when valid', () => {
        expect(validateDeskObject(validObject)).toBe(validObject);
    });

    it('accepts a non-clickable object with a null category', () => {
        expect(() => validateDeskObject(validAtmosphereObject)).not.toThrow();
    });

    it('throws when a clickable object has an invalid category', () => {
        const object = { ...validObject, category: 'nope' };
        expect(() => validateDeskObject(object)).toThrow(/invalid "category"/);
    });

    it('throws when a non-clickable object has a non-null category', () => {
        const object = { ...validAtmosphereObject, category: 'essays' };
        expect(() => validateDeskObject(object)).toThrow(/non-clickable/);
    });

    it('throws when position is not a 3-length array', () => {
        const object = { ...validObject, position: [0, 0] };
        expect(() => validateDeskObject(object)).toThrow(/invalid "position"/);
    });

    it('throws when there are no geometry parts', () => {
        const object = { ...validObject, parts: [] };
        expect(() => validateDeskObject(object)).toThrow(/at least one geometry/);
    });

    it('throws when a part has an unrecognized geometry type', () => {
        const object = { ...validObject, parts: [{ type: 'cone', args: [1], color: '#fff' }] };
        expect(() => validateDeskObject(object)).toThrow(/invalid geometry "type"/);
    });

    it('throws when a part is missing a color', () => {
        const object = { ...validObject, parts: [{ type: 'box', args: [1, 1, 1] }] };
        expect(() => validateDeskObject(object)).toThrow(/missing a "color"/);
    });
});

describe('validateDeskLayout', () => {
    it('throws on duplicate object ids', () => {
        expect(() => validateDeskLayout([validObject, validObject], worksFixture)).toThrow(/duplicate/);
    });

    it("throws when a clickable object's category has no matching Work", () => {
        const object = { ...validObject, category: 'hardware' };
        expect(() => validateDeskLayout([object], worksFixture)).toThrow(/no Work in the registry/);
    });

    it('passes when every clickable category has a matching Work', () => {
        expect(() => validateDeskLayout([validObject], worksFixture)).not.toThrow();
    });
});
