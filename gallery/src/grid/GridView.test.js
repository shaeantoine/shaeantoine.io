import { describe, expect, it } from 'vitest';
import { buildGridHtml } from './GridView.js';

const works = [
    { id: '1', title: 'First', blurb: 'First blurb.', previewImage: '/previews/first.svg', previewAspect: 'wide' },
    { id: '2', title: 'Second', blurb: 'Second blurb.', previewImage: '/previews/second.svg', previewAspect: 'tall' }
];

describe('buildGridHtml', () => {
    it('renders one tile per work with its data-work-id', () => {
        const html = buildGridHtml(works);
        expect(html).toContain('data-work-id="1"');
        expect(html).toContain('data-work-id="2"');
    });

    it("includes each work's title and blurb", () => {
        const html = buildGridHtml(works);
        expect(html).toContain('First');
        expect(html).toContain('First blurb.');
        expect(html).toContain('Second');
        expect(html).toContain('Second blurb.');
    });

    it("points each tile's image at its previewImage", () => {
        const html = buildGridHtml(works);
        expect(html).toContain('src="/previews/first.svg"');
        expect(html).toContain('src="/previews/second.svg"');
    });
});
