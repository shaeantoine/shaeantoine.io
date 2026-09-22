import { describe, expect, it } from 'vitest';
import { buildFocusPanelHtml } from './FocusPanelView.js';

const work = {
    id: '1',
    title: 'Test Heading',
    category: 'software',
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

describe('buildFocusPanelHtml', () => {
    it('includes the category kicker, title, and credit', () => {
        const html = buildFocusPanelHtml(work, { index: 0, total: 3 });
        expect(html).toContain('Software');
        expect(html).toContain('Test Heading');
        expect(html).toContain('Shae McKenna');
    });

    it('renders an index readout', () => {
        const html = buildFocusPanelHtml(work, { index: 1, total: 3 });
        expect(html).toContain('2 / 3');
    });

    it('renders connection sentences as chips with a data-work-id, not an href', () => {
        const html = buildFocusPanelHtml(work, { index: 0, total: 1 });
        expect(html).toContain('data-work-id="2"');
        expect(html).toContain('Because reasons.');
        expect(html).not.toContain('href="#/work/2/read"');
    });

    it('disables the prev arrow at index 0 and the next arrow at the last index', () => {
        const first = buildFocusPanelHtml(work, { index: 0, total: 3 });
        const last = buildFocusPanelHtml(work, { index: 2, total: 3 });
        expect(first).toContain('data-arrow="prev" disabled');
        expect(last).toContain('data-arrow="next" disabled');
    });

    it('omits stat/quote/bio blocks when absent', () => {
        const html = buildFocusPanelHtml(work, { index: 0, total: 1 });
        expect(html).not.toContain('stat-value');
        expect(html).not.toContain('quote-block');
        expect(html).not.toContain('bio-card');
    });
});
