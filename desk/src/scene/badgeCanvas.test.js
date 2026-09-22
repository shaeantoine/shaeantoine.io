import { describe, expect, it } from 'vitest';
import { badgeCanvasSize, inkFor, drawBadge, monogramFor, BADGE_PIXELS_PER_UNIT } from './badgeCanvas.js';
import { luminanceOf } from './bookSpineCanvas.js';
import { buildLanyard } from '../content/lanyard.js';

describe('badgeCanvasSize', () => {
    // The buffer height the PIXELS_PER_UNIT constants were tuned against — a
    // 1512 x 945 laptop at DPR 2. Passed explicitly so these assert the tuned
    // size rather than whatever display the test happens to run on.
    const REFERENCE = 1890;

    it('sizes the canvas from the card, so nothing is stretched', () => {
        const { width, height } = badgeCanvasSize(0.19, 0.30, REFERENCE);
        expect(width).toBe(Math.round(0.19 * BADGE_PIXELS_PER_UNIT));
        expect(height).toBe(Math.round(0.30 * BADGE_PIXELS_PER_UNIT));
    });

    it('keeps the canvas aspect equal to the card aspect', () => {
        const { width, height } = badgeCanvasSize(0.19, 0.30, REFERENCE);
        expect(width / height).toBeCloseTo(0.19 / 0.30, 3);
    });

    it('tracks the drawing buffer, so a denser display gets more texels', () => {
        // THE BUG THIS FIXES. These constants were tuned on one display and
        // then applied to every display: the same 456 x 720 card on a 1x panel,
        // where it is twice the texels it can use, and on a 3x one, where it is
        // two thirds of them. The tuned size is now a size at a stated density.
        const dense = badgeCanvasSize(0.19, 0.30, REFERENCE * 2);
        const sparse = badgeCanvasSize(0.19, 0.30, REFERENCE / 2);
        expect(dense.width).toBeGreaterThan(sparse.width);
        expect(dense.width / dense.height).toBeCloseTo(sparse.width / sparse.height, 2);
    });

    it('resolves far higher than a book spine does', () => {
        // A spine is only ever eighteen screen pixels wide. A badge is also the
        // subject of a focus camera that fills a third of the frame with it, so
        // it is the one drawn face in the scene that gets genuinely examined.
        expect(BADGE_PIXELS_PER_UNIT).toBeGreaterThan(900);
    });

    it('floors the dimensions so a tiny card still gets a usable canvas', () => {
        const { width, height } = badgeCanvasSize(0.001, 0.001);
        expect(width).toBeGreaterThanOrEqual(64);
        expect(height).toBeGreaterThanOrEqual(96);
    });
});

describe('inkFor', () => {
    it('prints dark stock in warm off-white and light stock in near-black', () => {
        expect(inkFor('#1b1d22')).toBe('#ece7dd');
        expect(inkFor('#e9e6e0')).toBe('#1f1d1a');
    });

    it('gives every card and strap colour on the lanyard readable contrast', () => {
        // Both are used as a ground that text is drawn onto: the card stock
        // behind the name, and the strap colour behind the header band. A
        // colour landing in the middle of the range makes one of them illegible.
        const grounds = [
            '#e9e6e0', '#2f3136',
            '#dedbd4', '#4a4e57',
            '#dfe3d9', '#2c3a2b',
            '#e8ded0', '#3c332a',
            '#d9e0e6', '#233240',
            '#e4dcd2', '#443a4e'
        ];
        for (const color of grounds) {
            const contrast = Math.abs(luminanceOf(color) - luminanceOf(inkFor(color)));
            expect(contrast).toBeGreaterThan(0.25);
        }
    });
});

describe('drawBadge', () => {
    // Same recording stub as bookSpineCanvas.test.js, for the same reason:
    // there is no canvas in this environment, and the value is in checking
    // that the draw completes and lays the right marks down.
    //
    // Each call records the font size that was ACTIVE when it happened rather
    // than every size assigned — fitFontSize sets a 100px reference purely to
    // measure against, and reading that back is the obvious way to write this
    // test wrong.
    function stubCanvas(width, height) {
        const calls = [];
        const state = { font: '' };
        const ctx = new Proxy(state, {
            get(target, key) {
                if (key === 'measureText') return (text) => ({ width: text.length * (target.__size ?? 10) * 0.5 });
                if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
                if (typeof key === 'string') {
                    return (...args) => calls.push({ op: key, args, font: target.__size ?? null });
                }
                return target[key];
            },
            set(target, key, value) {
                if (key === 'font') target.__size = parseFloat(String(value).match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 10);
                target[key] = value;
                calls.push({ op: `set:${key}`, args: [value], font: target.__size ?? null });
                return true;
            }
        });
        return { canvas: { width, height, getContext: () => ctx }, calls };
    }

    const textFor = (calls) => calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);
    const typeSizes = (calls) => calls.filter((c) => c.op === 'fillText').map((c) => c.font);
    const rects = (calls) => calls.filter((c) => c.op === 'fillRect').map((c) => c.args);

    const BADGE = { org: 'Apple', role: 'Software Engineer', color: '#e9e6e0' };

    it('prints the employer twice, its monogram once, and the role once', () => {
        // The employer is reversed out of the header band and set again under
        // the photo, which is how a real badge is laid out — the issuer at the
        // top, the holder's details in the middle. The monogram is what is in
        // the photo block, standing in for a photograph nobody is going to
        // resolve at this size.
        const { canvas, calls } = stubCanvas(456, 720);
        drawBadge(canvas, BADGE);
        expect(textFor(calls)).toEqual(['Apple', 'A', 'Apple', 'Software Engineer']);
    });

    it('prints the access class and the year when a card carries them', () => {
        // Two of the six jobs are at the same employer, so the header band and
        // the org line are identical on both cards. These two lines are most of
        // what keeps them from being the same card with a different job title.
        const { canvas, calls } = stubCanvas(456, 720);
        drawBadge(canvas, { ...BADGE, access: 'EMPLOYEE', year: '2025' });
        expect(textFor(calls)).toContain('EMPLOYEE');
        expect(textFor(calls)).toContain('2025');
    });

    it('leaves them off when they are not given, rather than printing a blank chip', () => {
        const { canvas, calls } = stubCanvas(456, 720);
        drawBadge(canvas, BADGE);
        expect(textFor(calls)).not.toContain('');
        expect(textFor(calls)).toHaveLength(4);
    });

    it('lays the laminate sheen over everything, last', () => {
        // The diagonal streak is what makes a flat canvas on a flat box read as
        // ink UNDER plastic rather than ink on the desk, and it has to be the
        // final fill or the type sits on top of the reflection.
        const { canvas, calls } = stubCanvas(456, 720);
        drawBadge(canvas, BADGE);
        expect(rects(calls).at(-1)).toEqual([0, 0, 456, 720]);
        // ...and filled with a gradient rather than a colour, which is the
        // difference between a sheen and a wash over the whole card.
        const lastStyle = calls.filter((c) => c.op === 'set:fillStyle').at(-1);
        expect(typeof lastStyle.args[0]).toBe('object');
    });

    it('paints the card stock itself rather than relying on the material', () => {
        // The map replaces the front face outright, so a canvas that skipped
        // this would print the badge onto a transparent ground.
        const { canvas, calls } = stubCanvas(456, 720);
        drawBadge(canvas, BADGE);
        const firstFill = calls.find((c) => c.op === 'set:fillStyle');
        expect(firstFill.args[0]).toBe('#e9e6e0');
    });

    it('lays down a header band across the full width of the card', () => {
        // The single strongest cue at establishing-shot distance: a card with a
        // solid stripe across the top is an ID badge, one without is a business
        // card. It has to reach both edges or it reads as a printed box.
        //
        // Note the height filter. The first full-width rect at the origin is
        // the card stock itself — matching that instead is the obvious way to
        // write this test so that it passes without the band existing at all.
        const { canvas, calls } = stubCanvas(456, 720);
        drawBadge(canvas, BADGE);
        const band = rects(calls).find(([x, y, w, h]) => x === 0 && y === 0 && w === 456 && h < 720);
        expect(band).toBeDefined();
        expect(band[3]).toBeGreaterThan(0);
        expect(band[3]).toBeLessThan(720 * 0.25); // a band, not a quarter of the card
    });

    it('sets smaller type for a longer role', () => {
        const roleSize = (role) => {
            const { canvas, calls } = stubCanvas(456, 720);
            drawBadge(canvas, { ...BADGE, role });
            return typeSizes(calls).at(-1);
        };
        expect(roleSize('Investment Principal')).toBeLessThan(roleSize('CTO'));
    });

    it('never sets type wider than the card it is printed on', () => {
        const width = 456;
        const { canvas, calls } = stubCanvas(width, 720);
        drawBadge(canvas, { org: 'X', role: 'Y', color: '#e9e6e0' });
        for (const size of typeSizes(calls)) {
            expect(size).toBeLessThanOrEqual(width);
        }
    });

    it('draws a different machine-readable strip for each employer', () => {
        // The bars are hashed from the org so six badges do not share one
        // barcode. A flat grey rectangle is what gives a drawn card away at
        // focus distance, and six identical ones would be worse.
        const stripWidths = (org) => {
            const { canvas, calls } = stubCanvas(456, 720);
            drawBadge(canvas, { ...BADGE, org });
            return rects(calls).map(([, , w]) => w).join(',');
        };
        expect(stripWidths('Apple')).not.toBe(stripWidths('Deloitte'));
    });

    it('reduces a multi-word employer to its initials', () => {
        expect(monogramFor('Apple')).toBe('A');
        expect(monogramFor('NextGen Ventures')).toBe('NV');
        // Capped at two, or a long name becomes a word rather than a mark.
        expect(monogramFor('One Two Three Four')).toBe('OT');
    });

    it('completes for every badge actually on the lanyard', () => {
        // The integration check: real content through the real draw, so a
        // future employer name that breaks a measurement fails here rather
        // than rendering as a blank card in the scene.
        const jobs = [
            { org: 'Apple', role: 'Software Engineer', cardColor: '#e9e6e0', strapColor: '#2f3136' },
            { org: 'Inspire Tomorrow', role: 'CTO', cardColor: '#d9e0e6', strapColor: '#233240' },
            { org: 'NextGen Ventures', role: 'Investment Principal', cardColor: '#e4dcd2', strapColor: '#443a4e' }
        ];
        for (const job of jobs) {
            const card = buildLanyard(job).parts.find((part) => part.badge);
            const { width, height } = badgeCanvasSize(card.args[0], card.args[1]);
            const { canvas, calls } = stubCanvas(width, height);
            expect(() => drawBadge(canvas, { ...card.badge, color: card.color })).not.toThrow();
            expect(textFor(calls)).toContain(job.role);
        }
    });
});
