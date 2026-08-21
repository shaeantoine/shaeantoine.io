import { describe, expect, it } from 'vitest';
import { buildEditorialHtml } from './EditorialView.js';

const baseWork = {
    id: '1',
    title: 'Test Heading',
    connections: [{ workId: '2', sentence: 'Because reasons.' }],
    editorial: {
        credit: 'Shae McKenna',
        body: ['Paragraph one.', 'Paragraph two.'],
        stat: null,
        quote: null,
        bio: null,
        links: []
    }
};

describe('buildEditorialHtml', () => {
    it('includes the title and credit', () => {
        const html = buildEditorialHtml(baseWork);
        expect(html).toContain('Test Heading');
        expect(html).toContain('Shae McKenna');
    });

    it('includes every body paragraph in order', () => {
        const html = buildEditorialHtml(baseWork);
        expect(html.indexOf('Paragraph one.')).toBeLessThan(html.indexOf('Paragraph two.'));
    });

    it('renders each connection as a related-rail-item linking to its Work id', () => {
        const html = buildEditorialHtml(baseWork);
        expect(html).toContain('href="#/work/2/read"');
        expect(html).toContain('Because reasons.');
    });

    it('omits the stat/quote/bio blocks when absent', () => {
        const html = buildEditorialHtml(baseWork);
        expect(html).not.toContain('stat-value');
        expect(html).not.toContain('quote-block');
        expect(html).not.toContain('bio-card');
    });

    it('renders a stat block when present', () => {
        const work = { ...baseWork, editorial: { ...baseWork.editorial, stat: { value: '12', label: 'Editions' } } };
        const html = buildEditorialHtml(work);
        expect(html).toContain('12');
        expect(html).toContain('Editions');
    });

    it('renders a quote block when present', () => {
        const work = { ...baseWork, editorial: { ...baseWork.editorial, quote: { text: 'Great work.', attribution: 'A Critic' } } };
        const html = buildEditorialHtml(work);
        expect(html).toContain('Great work.');
        expect(html).toContain('A Critic');
    });

    it('renders a link-pill row when links are present', () => {
        const work = { ...baseWork, editorial: { ...baseWork.editorial, links: [{ label: 'Source', href: 'https://example.com' }] } };
        const html = buildEditorialHtml(work);
        expect(html).toContain('href="https://example.com"');
        expect(html).toContain('Source');
    });
});
