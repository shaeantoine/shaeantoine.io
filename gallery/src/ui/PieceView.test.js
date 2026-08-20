import { describe, expect, it } from 'vitest';
import { buildPieceHtml } from './PieceView.js';

const work = {
    piece: { heading: 'Test Heading', paragraphs: ['Paragraph one.', 'Paragraph two.'] },
    connections: [{ workId: 'other-work', sentence: 'Because reasons.' }]
};

describe('buildPieceHtml', () => {
    it('includes the piece heading', () => {
        expect(buildPieceHtml(work)).toContain('<h1>Test Heading</h1>');
    });

    it('includes every paragraph in order', () => {
        const html = buildPieceHtml(work);
        expect(html.indexOf('Paragraph one.')).toBeLessThan(html.indexOf('Paragraph two.'));
    });

    it('links each connection to its Work id with its sentence as the link text', () => {
        const html = buildPieceHtml(work);
        expect(html).toContain('href="#/work/other-work"');
        expect(html).toContain('Because reasons.');
    });
});
