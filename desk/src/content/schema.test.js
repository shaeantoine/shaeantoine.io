import { describe, expect, it } from 'vitest';
import { validateWork, CATEGORY_LABELS } from './schema.js';

const validWork = {
    id: 'w1',
    title: 'Test',
    date: '2026-01-01',
    previewImage: '/previews/test.svg',
    blurb: 'A short test blurb.',
    previewAspect: 'square',
    category: 'software',
    connections: [{ workId: 'w2', sentence: 'because' }],
    editorial: {
        credit: 'Shae McKenna',
        body: ['Paragraph one.'],
        stat: null,
        quote: null,
        bio: null,
        links: []
    }
};

describe('validateWork', () => {
    it('returns the work unchanged when every required field is present', () => {
        expect(validateWork(validWork)).toBe(validWork);
    });

    it('throws when a required top-level field is missing', () => {
        const { title, ...missingTitle } = validWork;
        expect(() => validateWork(missingTitle)).toThrow(/missing required field "title"/);
    });

    it('throws when previewAspect is not a recognized value', () => {
        const work = { ...validWork, previewAspect: 'huge' };
        expect(() => validateWork(work)).toThrow(/invalid "previewAspect"/);
    });

    it('throws when category is not a recognized value', () => {
        const work = { ...validWork, category: 'poetry' };
        expect(() => validateWork(work)).toThrow(/invalid "category"/);
    });

    it('throws when a connection is missing workId or sentence', () => {
        const work = { ...validWork, connections: [{ workId: 'w2' }] };
        expect(() => validateWork(work)).toThrow(/connection missing/);
    });

    it('throws when editorial.body is missing', () => {
        const { body, ...editorialWithoutBody } = validWork.editorial;
        const work = { ...validWork, editorial: editorialWithoutBody };
        expect(() => validateWork(work)).toThrow(/editorial\.body/);
    });

    it('throws when editorial.credit is missing', () => {
        const { credit, ...editorialWithoutCredit } = validWork.editorial;
        const work = { ...validWork, editorial: editorialWithoutCredit };
        expect(() => validateWork(work)).toThrow(/editorial\.credit/);
    });

    it('accepts editorial.stat, .quote, .bio as null and .links as an empty array', () => {
        expect(() => validateWork(validWork)).not.toThrow();
    });

    it('throws when editorial.stat is present but missing value or label', () => {
        const work = { ...validWork, editorial: { ...validWork.editorial, stat: { value: '12' } } };
        expect(() => validateWork(work)).toThrow(/stat missing/);
    });

    it('throws when editorial.quote is present but missing text or attribution', () => {
        const work = { ...validWork, editorial: { ...validWork.editorial, quote: { text: 'hi' } } };
        expect(() => validateWork(work)).toThrow(/quote missing/);
    });

    it('throws when a link is missing label or href', () => {
        const work = { ...validWork, editorial: { ...validWork.editorial, links: [{ label: 'Site' }] } };
        expect(() => validateWork(work)).toThrow(/link missing/);
    });
});

describe('CATEGORY_LABELS', () => {
    it('has a display label for every valid category', () => {
        expect(CATEGORY_LABELS).toEqual({
            software: 'Software',
            hardware: 'Hardware',
            work: 'Work',
            academia: 'Academia'
        });
    });
});

describe('validateWork — artifacts', () => {
    const hardwareWork = { ...validWork, category: 'hardware' };

    it('accepts an artifact built from a model', () => {
        const work = { ...hardwareWork, artifact: { modelUrl: '/models/thing.glb', targetSize: 0.5 } };
        expect(() => validateWork(work)).not.toThrow();
    });

    it('accepts an artifact built from primitives', () => {
        // The lanyard's badges. A card with lettering on it would be absurd to
        // author in Blender, so `parts` is a first-class alternative rather
        // than a fallback.
        const work = { ...hardwareWork, artifact: { parts: [{ type: 'box', args: [1, 1, 1], color: '#fff' }] } };
        expect(() => validateWork(work)).not.toThrow();
    });

    it('throws when an artifact has neither a model nor parts', () => {
        const work = { ...hardwareWork, artifact: { targetSize: 0.5 } };
        expect(() => validateWork(work)).toThrow(/neither a "modelUrl" nor a non-empty "parts"/);
    });

    it('throws when an artifact declares parts but the array is empty', () => {
        const work = { ...hardwareWork, artifact: { parts: [] } };
        expect(() => validateWork(work)).toThrow(/neither a "modelUrl" nor a non-empty "parts"/);
    });

    it('throws when an artifact tries to be both at once', () => {
        // Nothing downstream picks a winner — artifactStrategy branches on
        // `parts` and would silently ignore the model, so this has to fail
        // here rather than render the wrong object.
        const work = {
            ...hardwareWork,
            artifact: { modelUrl: '/models/thing.glb', parts: [{ type: 'box', args: [1, 1, 1], color: '#fff' }] }
        };
        expect(() => validateWork(work)).toThrow(/both a "modelUrl" and "parts"/);
    });
});
