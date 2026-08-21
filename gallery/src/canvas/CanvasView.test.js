import { describe, expect, it } from 'vitest';
import { buildCanvasHtml } from './CanvasView.js';

const works = [
    { id: '1', title: 'First', blurb: 'First blurb.', previewImage: '/previews/first.svg', previewAspect: 'wide' },
    { id: '2', title: 'Second', blurb: 'Second blurb.', previewImage: '/previews/second.svg', previewAspect: 'tall' }
];

describe('buildCanvasHtml', () => {
    it('renders one node per work with its data-work-id', () => {
        const html = buildCanvasHtml(works);
        expect(html).toContain('data-work-id="1"');
        expect(html).toContain('data-work-id="2"');
    });

    it("includes each work's title and blurb in its node label", () => {
        const html = buildCanvasHtml(works);
        expect(html).toContain('First');
        expect(html).toContain('First blurb.');
    });

    it("points each node's image at its previewImage", () => {
        const html = buildCanvasHtml(works);
        expect(html).toContain('src="/previews/first.svg"');
    });
});
