import { describe, expect, it } from 'vitest';
import { buildArtifactSpreadHtml } from './ArtifactSpreadView.js';

const work = {
    id: '5',
    title: 'Soldering Rig',
    date: '2026-08-21',
    blurb: 'A bench supply built from a salvaged ATX unit.',
    category: 'hardware',
    connections: [{ workId: '6', sentence: 'Powers the phone jig.' }],
    editorial: {
        credit: 'Shae McKenna',
        body: ['Paragraph one.', 'Paragraph two.'],
        stat: null,
        quote: null,
        bio: null,
        links: []
    }
};

describe('buildArtifactSpreadHtml', () => {
    it('leads with the category, title, credit and date', () => {
        const html = buildArtifactSpreadHtml(work, { index: 0, total: 2 });
        expect(html).toContain('Hardware');
        expect(html).toContain('Soldering Rig');
        expect(html).toContain('Shae McKenna');
        expect(html).toContain('2026-08-21');
    });

    it('renders the blurb and every body paragraph', () => {
        const html = buildArtifactSpreadHtml(work, { index: 0, total: 2 });
        expect(html).toContain('A bench supply built from a salvaged ATX unit.');
        expect(html).toContain('Paragraph one.');
        expect(html).toContain('Paragraph two.');
    });

    it('counts the position within the collection', () => {
        const html = buildArtifactSpreadHtml(work, { index: 1, total: 2 });
        expect(html).toContain('2 / 2');
    });

    it('drops the counter when the object has nothing to cycle to', () => {
        const html = buildArtifactSpreadHtml(work, { index: 0, total: 1 });
        expect(html).not.toContain('spread-count');
    });

    it('renders connections as chips carrying a work id, for cross-object jumps', () => {
        const html = buildArtifactSpreadHtml(work, { index: 0, total: 2 });
        expect(html).toContain('data-work-id="6"');
        expect(html).toContain('Powers the phone jig.');
    });

    it('renders links as real anchors rather than painted text', () => {
        const withLinks = {
            ...work,
            editorial: { ...work.editorial, links: [{ label: 'Build log', href: 'https://example.com/log' }] }
        };
        const html = buildArtifactSpreadHtml(withLinks, { index: 0, total: 2 });
        expect(html).toContain('href="https://example.com/log"');
        expect(html).toContain('Build log');
    });

    it('omits stat, quote and link blocks when absent', () => {
        const html = buildArtifactSpreadHtml(work, { index: 0, total: 2 });
        expect(html).not.toContain('spread-stat');
        expect(html).not.toContain('spread-quote');
        expect(html).not.toContain('spread-links');
    });

    it('omits the meta line when there is no credit or date', () => {
        const bare = { ...work, date: '', editorial: { ...work.editorial, credit: '' } };
        expect(buildArtifactSpreadHtml(bare, { index: 0, total: 2 })).not.toContain('spread-meta');
    });
});
