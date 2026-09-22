import { wrapLines } from '../focus/strategies/pagination.js';
import { CATEGORY_LABELS } from '../content/schema.js';
import {
    SCREEN_CANVAS_HEIGHT,
    FONT_FAMILY,
    BACKGROUND_COLOR,
    TEXT_COLOR,
    MUTED_COLOR,
    DIVIDER_COLOR
} from '../focus/strategies/screenCanvas.js';

/**
 * What the monitor shows when nobody has clicked it: a document, open, with a
 * caret sitting at the end of the last line and the real local time in the
 * menu bar.
 *
 * WHY THIS EXISTS. The display is dead centre of the establishing shot and is
 * the only surface in the room capable of emitting light, and until now it sat
 * there as a black rectangle — screenStrategy mounts its canvas on focus and
 * unmounts it on exit, so at rest the monitor rendered whatever the .glb
 * shipped with. A powered-off monitor is the single strongest signal a room
 * can send that nobody works there.
 *
 * WHAT IT HAS TO SURVIVE. At the establishing shot the screen is a small
 * fraction of frame width, so none of this text is legible and none of it is
 * meant to be. What reads at that size is: a bright rectangle, a header strip,
 * one dark title bar, and a block of grey lines. The layout below is tuned for
 * that silhouette first and for the close-up it never gets second.
 *
 * The import from ../focus/strategies is against the usual direction. It is
 * deliberate and narrow — palette and text wrapping only. Both canvases draw
 * to the same physical display, and the alternative (a copy of the palette
 * here) would let the resting screen and the focused screen drift into two
 * different machines.
 */

const MENUBAR_HEIGHT = 58;
const MENUBAR_COLOR = '#F0F0ED';
const MARGIN = 90;

const DOT_RADIUS = 7;
const DOT_GAP = 26;
const DOT_COLOR = 'rgba(20, 20, 20, 0.18)';

const CLOCK_FONT_SIZE = 26;
const KICKER_FONT_SIZE = 26;
const TITLE_FONT_SIZE = 64;
const BODY_FONT_SIZE = 32;
const BODY_LINE_HEIGHT = 46;

// Capped well short of what fits. The empty lower half is doing the same job
// the site's whitespace does elsewhere — and a screen filled edge to edge with
// grey rules reads as a wall of noise at establishing-shot size, where a few
// lines trailing off into space reads as a page someone is partway through.
const MAX_BODY_LINES = 9;

const CARET_WIDTH = 3;
const CARET_HEIGHT = 34;
const CARET_GAP = 6;

// The vertical layout, resolved up front instead of walked with a running `y`.
// `caretRect` has to land on the same last-line baseline `drawIdleScreen` does,
// and the two now read it from one place rather than each re-deriving it.
const KICKER_BASELINE = MENUBAR_HEIGHT + 70 + KICKER_FONT_SIZE;
const TITLE_BASELINE = KICKER_BASELINE + TITLE_FONT_SIZE + 22;
const DIVIDER_Y = TITLE_BASELINE + 40;
const BODY_TOP = DIVIDER_Y + 20;

/**
 * The most recently dated Work, which is what the desk's owner is taken to
 * have had open.
 *
 * Sourced from the Work registry rather than from a string in this file on
 * purpose: it means the resting screen can never show something that isn't
 * real, and it updates itself the next time a piece is added. Dates are ISO
 * (YYYY-MM-DD), so a plain string comparison orders them correctly without
 * dragging timezones into it.
 *
 * @param {object[]} works
 * @returns {object | null} null only if the registry is empty, which the
 *          caller treats as "draw nothing" rather than crashing the scene
 */
export function mostRecentWork(works) {
    if (!works?.length) return null;
    return works.reduce((latest, work) => (work.date > latest.date ? work : latest));
}

/**
 * 24-hour local time, zero-padded. Deliberately not seconds: a seconds digit
 * would have to redraw the canvas and request a frame once a second forever,
 * which is exactly the always-on cost the render scheduler exists to avoid.
 *
 * @param {Date} date
 */
export function formatClock(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * The body text, wrapped and clipped to what the screen holds.
 *
 * Pulled out of the draw call so the caret can be positioned from the same
 * measurement the last line was laid out with — measuring it twice is how the
 * caret ends up a few pixels off the end of the text.
 */
export function layoutBodyLines(work, measureWidth, contentWidth) {
    const paragraphs = work?.editorial?.body ?? [];
    const lines = [];
    for (const paragraph of paragraphs) {
        for (const line of wrapLines(paragraph, {
            measureWidth: (text) => measureWidth(text, BODY_FONT_SIZE),
            maxWidth: contentWidth
        })) {
            if (lines.length === MAX_BODY_LINES) return lines;
            lines.push(line);
        }
    }
    return lines;
}

/**
 * Where the caret sits, in the same logical-px space `drawIdleScreen` draws in
 * — at the end of the last body line, where a cursor would be if someone had
 * just stopped typing. Null when there is no body text to park it after.
 *
 * THE CARET IS NOT DRAWN ON THIS CANVAS, and that is the point of returning a
 * rectangle instead. See scene/IdleScreen.js: it is a separate 3-logical-px
 * quad whose visibility toggles, because repainting this canvas to blink it
 * meant re-uploading a 16-megapixel texture twice a second.
 *
 * @param {object | null} work
 * @param {(text: string, fontSize: number, weight?: string) => number} measureWidth
 * @param {number} logicalWidth the canvas's width in logical px
 * @returns {{ x: number, y: number, width: number, height: number } | null}
 */
export function caretRect(work, measureWidth, logicalWidth) {
    const lines = layoutBodyLines(work, measureWidth, logicalWidth - MARGIN * 2);
    if (lines.length === 0) return null;
    const lastBaseline = BODY_TOP + lines.length * BODY_LINE_HEIGHT;
    return {
        x: MARGIN + measureWidth(lines[lines.length - 1], BODY_FONT_SIZE) + CARET_GAP,
        y: lastBaseline - CARET_HEIGHT + 6,
        width: CARET_WIDTH,
        height: CARET_HEIGHT
    };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ work: object | null, clock: string }} state
 * @param {(text: string, fontSize: number, weight?: string) => number} measureWidth
 */
export function drawIdleScreen(canvas, { work, clock }, measureWidth) {
    const ctx = canvas.getContext('2d');
    // Same logical-coordinate scheme as screenCanvas.js: the element is
    // allocated at some device-derived multiple of the logical size (see
    // scene/textureBudget.js) and everything below draws in logical px.
    const scale = canvas.height / SCREEN_CANVAS_HEIGHT;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const width = canvas.width / scale;
    const height = canvas.height / scale;
    const contentWidth = width - MARGIN * 2;

    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, width, height);
    ctx.textBaseline = 'alphabetic';

    // Menu bar. The window dots are the cheapest thing on this canvas and the
    // most load-bearing: three circles in a row is what makes a pale rectangle
    // read as a computer rather than a sheet of paper, at a size where nothing
    // else here resolves.
    ctx.fillStyle = MENUBAR_COLOR;
    ctx.fillRect(0, 0, width, MENUBAR_HEIGHT);
    ctx.strokeStyle = DIVIDER_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, MENUBAR_HEIGHT);
    ctx.lineTo(width, MENUBAR_HEIGHT);
    ctx.stroke();

    ctx.fillStyle = DOT_COLOR;
    for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(40 + i * DOT_GAP, MENUBAR_HEIGHT / 2, DOT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.font = `500 ${CLOCK_FONT_SIZE}px ${FONT_FAMILY}`;
    ctx.fillStyle = MUTED_COLOR;
    ctx.textAlign = 'right';
    ctx.fillText(clock, width - 40, MENUBAR_HEIGHT / 2 + CLOCK_FONT_SIZE / 3);
    ctx.textAlign = 'left';

    if (!work) return;

    ctx.font = `600 ${KICKER_FONT_SIZE}px ${FONT_FAMILY}`;
    ctx.fillStyle = MUTED_COLOR;
    ctx.fillText((CATEGORY_LABELS[work.category] ?? work.category).toUpperCase(), MARGIN, KICKER_BASELINE);

    ctx.font = `700 ${TITLE_FONT_SIZE}px ${FONT_FAMILY}`;
    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(work.title, MARGIN, TITLE_BASELINE);

    ctx.strokeStyle = DIVIDER_COLOR;
    ctx.beginPath();
    ctx.moveTo(MARGIN, DIVIDER_Y);
    ctx.lineTo(width - MARGIN, DIVIDER_Y);
    ctx.stroke();

    const lines = layoutBodyLines(work, measureWidth, contentWidth);
    ctx.font = `${BODY_FONT_SIZE}px ${FONT_FAMILY}`;
    ctx.fillStyle = TEXT_COLOR;
    let y = BODY_TOP;
    for (const line of lines) {
        y += BODY_LINE_HEIGHT;
        ctx.fillText(line, MARGIN, y);
    }
}
