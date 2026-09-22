import { describe, expect, it } from 'vitest';
import { caretRect, drawIdleScreen, formatClock, mostRecentWork, layoutBodyLines } from './idleScreenCanvas.js';

describe('mostRecentWork', () => {
    const work = (id, date) => ({ id, date });

    it('picks the latest date regardless of registry order', () => {
        const works = [work('a', '2026-01-05'), work('b', '2026-09-01'), work('c', '2026-03-12')];
        expect(mostRecentWork(works).id).toBe('b');
    });

    it('compares ISO dates as strings, which orders them correctly', () => {
        // The trap this guards: Date parsing would drag the visitor's timezone
        // into which piece is "latest", so a work dated today could rank behind
        // yesterday's west of UTC.
        const works = [work('a', '2026-09-09'), work('b', '2026-09-10')];
        expect(mostRecentWork(works).id).toBe('b');
    });

    it('keeps the first of a tie rather than churning between them', () => {
        const works = [work('a', '2026-09-01'), work('b', '2026-09-01')];
        expect(mostRecentWork(works).id).toBe('a');
    });

    it('returns null for an empty or missing registry instead of throwing', () => {
        // The screen draws its menu bar and stops. A blank monitor is a poor
        // resting state; a scene that fails to construct is a blank page.
        expect(mostRecentWork([])).toBeNull();
        expect(mostRecentWork(undefined)).toBeNull();
    });
});

describe('caretRect', () => {
    // One logical px per character, matching layoutBodyLines' measurer above.
    const measureWidth = (text) => text.length;
    const LOGICAL_WIDTH = 1000;

    const workWith = (...paragraphs) => ({
        category: 'software',
        title: 'A Title',
        editorial: { body: paragraphs }
    });

    /**
     * A 2D context that records only what was drawn where. Enough for
     * drawIdleScreen, which needs no measurement back from the canvas — it
     * takes an injected measurer for that.
     */
    function recordingCanvas() {
        const texts = [];
        const ctx = {
            setTransform() {}, fillRect() {}, beginPath() {}, moveTo() {},
            lineTo() {}, stroke() {}, arc() {}, fill() {},
            fillText(text, x, y) { texts.push({ text, x, y }); }
        };
        return {
            canvas: { width: LOGICAL_WIDTH, height: 1000, getContext: () => ctx },
            texts
        };
    }

    it('returns null when there is no body text to park the caret after', () => {
        // The screen draws its menu bar and stops, so there is no last line to
        // sit at the end of and IdleScreen builds no caret mesh at all.
        expect(caretRect(workWith(), measureWidth, LOGICAL_WIDTH)).toBeNull();
        expect(caretRect(null, measureWidth, LOGICAL_WIDTH)).toBeNull();
    });

    it('sits just past the end of the last line, not the longest one', () => {
        const short = caretRect(workWith('aa'), measureWidth, LOGICAL_WIDTH);
        const long = caretRect(workWith('aaaaaaaa'), measureWidth, LOGICAL_WIDTH);
        expect(long.x - short.x).toBe(6); // exactly the six extra characters
    });

    it('drops one line height for each extra line of body', () => {
        const one = caretRect(workWith('aaa'), measureWidth, LOGICAL_WIDTH);
        const three = caretRect(workWith('aaa', 'bbb', 'ccc'), measureWidth, LOGICAL_WIDTH);
        expect(three.y - one.y).toBe(2 * 46);
    });

    it('lands on the same last-line baseline drawIdleScreen writes to', () => {
        // The invariant that matters, and the one thing splitting the caret out
        // of the canvas could silently break: two layouts that drift apart put
        // a blinking cursor somewhere the text is not.
        const work = workWith('aaa bbb', 'ccc');
        const { canvas, texts } = recordingCanvas();
        drawIdleScreen(canvas, { work, clock: '09:41' }, measureWidth);

        const lastLine = texts.at(-1);
        expect(lastLine.text).toBe('ccc');

        const rect = caretRect(work, measureWidth, LOGICAL_WIDTH);
        // Straddles the baseline: the caret's body rises above it and its foot
        // sits a few px below, the way a text cursor does.
        expect(rect.y).toBeLessThan(lastLine.y);
        expect(rect.y + rect.height).toBeGreaterThan(lastLine.y);
        // And begins a small gap past where that line was drawn from.
        expect(rect.x).toBe(lastLine.x + measureWidth('ccc') + 6);
    });
});

describe('formatClock', () => {
    it('renders 24-hour time zero-padded on both fields', () => {
        expect(formatClock(new Date(2026, 8, 13, 9, 5))).toBe('09:05');
        expect(formatClock(new Date(2026, 8, 13, 14, 32))).toBe('14:32');
    });

    it('renders midnight as 00:00 rather than 24:00', () => {
        expect(formatClock(new Date(2026, 8, 13, 0, 0))).toBe('00:00');
    });

    it('carries no seconds, so the string changes at most once a minute', () => {
        // Load-bearing: the resting screen redraws and requests a frame every
        // time this value changes. A seconds field would make that once a
        // second, forever, on an otherwise idle desk.
        const atStart = formatClock(new Date(2026, 8, 13, 14, 32, 0));
        const atEnd = formatClock(new Date(2026, 8, 13, 14, 32, 59));
        expect(atStart).toBe(atEnd);
    });
});

describe('layoutBodyLines', () => {
    // One logical px per character, so a maxWidth of N fits N characters.
    const measureWidth = (text) => text.length;

    const workWith = (...paragraphs) => ({ editorial: { body: paragraphs } });

    it('wraps a paragraph to the content width', () => {
        const lines = layoutBodyLines(workWith('aaa bbb ccc ddd'), measureWidth, 7);
        expect(lines).toEqual(['aaa bbb', 'ccc ddd']);
    });

    it('runs paragraphs together as continuous lines', () => {
        const lines = layoutBodyLines(workWith('aaa', 'bbb'), measureWidth, 20);
        expect(lines).toEqual(['aaa', 'bbb']);
    });

    it('caps at the number of lines the screen holds', () => {
        const long = Array.from({ length: 40 }, (_, i) => `line${i}`).join(' ');
        expect(layoutBodyLines(workWith(long), measureWidth, 5).length).toBe(9);
    });

    it('stops mid-paragraph rather than overrunning the cap', () => {
        const first = Array.from({ length: 20 }, (_, i) => `a${i}`).join(' ');
        const lines = layoutBodyLines(workWith(first, 'second paragraph'), measureWidth, 3);
        expect(lines.length).toBe(9);
        expect(lines).not.toContain('second');
    });

    it('returns nothing for a work with no editorial body', () => {
        // Every Work is schema-checked for `editorial.body`, but the resting
        // screen reads from whichever piece happens to be newest and should not
        // be the thing that crashes the scene if one is malformed.
        expect(layoutBodyLines({}, measureWidth, 100)).toEqual([]);
        expect(layoutBodyLines(null, measureWidth, 100)).toEqual([]);
    });
});
