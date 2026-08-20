import { describe, expect, it } from 'vitest';
import { validateWork } from './schema.js';

const validWork = {
    id: 'w1',
    title: 'Test',
    date: '2026-01-01',
    fragments: [{ targetId: 'a', text: 'hi' }],
    piece: { heading: 'Test', paragraphs: ['hi'] },
    connections: [{ workId: 'w2', sentence: 'because' }]
};

describe('validateWork', () => {
    it('returns the work unchanged when every required field is present', () => {
        expect(validateWork(validWork)).toBe(validWork);
    });

    it('throws when a required top-level field is missing', () => {
        const { title, ...missingTitle } = validWork;
        expect(() => validateWork(missingTitle)).toThrow(/missing required field "title"/);
    });

    it('throws when a fragment is missing targetId or text', () => {
        const work = { ...validWork, fragments: [{ targetId: 'a' }] };
        expect(() => validateWork(work)).toThrow(/fragment missing/);
    });

    it('throws when a connection is missing workId or sentence', () => {
        const work = { ...validWork, connections: [{ workId: 'w2' }] };
        expect(() => validateWork(work)).toThrow(/connection missing/);
    });
});
