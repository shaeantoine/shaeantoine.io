import { describe, expect, it } from 'vitest';
import { validateWork } from './schema.js';

const validWork = {
    id: 'w1',
    title: 'Test',
    date: '2026-01-01',
    previewImage: '/previews/test.svg',
    blurb: 'A short test blurb.',
    previewAspect: 'square',
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
