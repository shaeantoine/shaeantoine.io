import { describe, expect, it } from 'vitest';
import { buildCategoryListHtml } from './CategoryListView.js';

const works = [
    { id: '1', title: 'Essay One', blurb: 'Blurb one.', previewImage: '/previews/one.png', category: 'essays' },
    { id: '2', title: 'Essay Two', blurb: 'Blurb two.', previewImage: '/previews/two.png', category: 'essays' },
    { id: '3', title: 'Software Thing', blurb: 'Blurb three.', previewImage: '/previews/three.svg', category: 'software' }
];

describe('buildCategoryListHtml', () => {
    it('renders the category label as the panel heading', () => {
        const html = buildCategoryListHtml('essays', works);
        expect(html).toContain('Essays');
    });

    it('includes only Works matching the requested category', () => {
        const html = buildCategoryListHtml('essays', works);
        expect(html).toContain('Essay One');
        expect(html).toContain('Essay Two');
        expect(html).not.toContain('Software Thing');
    });

    it("links each item to its editorial detail route", () => {
        const html = buildCategoryListHtml('essays', works);
        expect(html).toContain('href="#/work/1/read"');
        expect(html).toContain('href="#/work/2/read"');
    });

    it('renders an empty-state message when no Works match the category', () => {
        const html = buildCategoryListHtml('diary', works);
        expect(html).toContain('Nothing here yet');
    });
});
