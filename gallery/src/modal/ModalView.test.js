import { describe, expect, it } from 'vitest';
import { buildModalHtml } from './ModalView.js';

const work = {
    id: '1',
    title: 'Test Work',
    blurb: 'A short blurb.',
    previewImage: '/previews/test.svg'
};

describe('buildModalHtml', () => {
    it('includes the title, blurb, and preview image', () => {
        const html = buildModalHtml(work);
        expect(html).toContain('Test Work');
        expect(html).toContain('A short blurb.');
        expect(html).toContain('src="/previews/test.svg"');
    });

    it('links to the full editorial detail route', () => {
        const html = buildModalHtml(work);
        expect(html).toContain('href="#/work/1/read"');
    });
});
