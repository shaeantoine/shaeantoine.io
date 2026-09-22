import { CATEGORY_LABELS } from '../../content/schema.js';
import { createFootprintCanvas } from '../../scene/textureBudget.js';
import { wrapLines } from './pagination.js';

/**
 * Canvas rendering for the monitor's screen: draws a work as a light,
 * sans-serif "UI" readout (kicker, title, blurb, stat, body, links) rather
 * than a printed page — a deliberately different register from the book's
 * cream paper, since this is meant to read as a display.
 */

export const SCREEN_CANVAS_HEIGHT = 1000; // logical px — all layout constants below are in this space

const MARGIN = 70;
export const FONT_FAMILY = '"Inter", system-ui, sans-serif';

// Matches the site's own palette (--color-canvas/--color-ink/--color-body) —
// also just reads crisper than light-on-dark: bright text on a dark canvas
// bleeds into anti-aliased neighboring pixels more than dark-on-light does.
//
// Exported because the resting screen (scene/idleScreenCanvas.js) draws to the
// same physical display and has to be the same machine. Two palettes would
// drift, and the seam would show at the one moment it must not — the instant
// focus swaps one canvas for the other.
export const BACKGROUND_COLOR = '#FAFAFA';
export const TEXT_COLOR = '#141414';
export const MUTED_COLOR = '#6E6E6A';
const ACCENT_COLOR = '#3A3A37';
export const DIVIDER_COLOR = 'rgba(20, 20, 20, 0.14)';

const KICKER_FONT_SIZE = 26;
const TITLE_FONT_SIZE = 64;
const BLURB_FONT_SIZE = 34;
const STAT_VALUE_FONT_SIZE = 52;
const STAT_LABEL_FONT_SIZE = 24;
const BODY_FONT_SIZE = 30;
const BODY_LINE_HEIGHT = 42;
const PARAGRAPH_GAP = 14;
const LINK_FONT_SIZE = 26;
const LINK_ROW_HEIGHT = LINK_FONT_SIZE + 16;

export function canvasWidthForAspect(aspect) {
    return Math.round(SCREEN_CANVAS_HEIGHT * aspect);
}

/**
 * The backing canvas for a screen of `aspect`, sized to the machine rather than
 * to a constant.
 *
 * Both the resting monitor and the focused one come through here, which is the
 * point — they are the same physical panel a third of a second apart, and two
 * canvases at two resolutions would swap visibly at the moment focus opens.
 *
 * THAT IS ALSO WHY BOTH TAKE THE FOCUSED FRAMING even though the resting screen
 * covers about a fifth of it. Sizing the resting one to the establishing shot
 * would save real memory and is the obvious thing to do; it is not done because
 * the camera dollies between the two shots with the panel on screen the whole
 * way, so the saving is paid for in a texture that visibly resolves as it
 * arrives. The focused number is the honest one for a surface that has to hold
 * up at the closest shot it is ever seen at.
 *
 * @param {number} aspect
 * @param {{framing: [number, number], bufferHeight: number}} budget
 *        @see scene/textureBudget.js
 */
export function createScreenCanvas(aspect, budget) {
    const { canvas } = createFootprintCanvas(canvasWidthForAspect(aspect), SCREEN_CANVAS_HEIGHT, budget);
    return canvas;
}

/** Real canvas-backed text measurer for production use (tests would inject their own). */
export function createMeasurer() {
    const ctx = document.createElement('canvas').getContext('2d');
    return function measureWidth(text, fontSize, weight = '') {
        ctx.font = `${weight} ${fontSize}px ${FONT_FAMILY}`.trim();
        return ctx.measureText(text).width;
    };
}

export function drawScreen(canvas, work, measureWidth) {
    const ctx = canvas.getContext('2d');
    // The canvas element is allocated at a device-derived multiple of the
    // logical size (see scene/textureBudget.js) for crisp text; everything below
    // draws in logical coordinates and this transform maps it up to real pixels.
    const scale = canvas.height / SCREEN_CANVAS_HEIGHT;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const width = canvas.width / scale;
    const height = canvas.height / scale;
    const contentWidth = width - MARGIN * 2;

    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    let y = MARGIN;

    ctx.font = `600 ${KICKER_FONT_SIZE}px ${FONT_FAMILY}`;
    ctx.fillStyle = MUTED_COLOR;
    y += KICKER_FONT_SIZE;
    ctx.fillText((CATEGORY_LABELS[work.category] ?? work.category).toUpperCase(), MARGIN, y);
    y += 34;

    ctx.font = `700 ${TITLE_FONT_SIZE}px ${FONT_FAMILY}`;
    ctx.fillStyle = TEXT_COLOR;
    y += TITLE_FONT_SIZE;
    ctx.fillText(work.title, MARGIN, y);
    y += 24;

    ctx.font = `${BLURB_FONT_SIZE}px ${FONT_FAMILY}`;
    ctx.fillStyle = MUTED_COLOR;
    for (const line of wrapLines(work.blurb, { measureWidth: (t) => measureWidth(t, BLURB_FONT_SIZE), maxWidth: contentWidth })) {
        y += BLURB_FONT_SIZE + 10;
        ctx.fillText(line, MARGIN, y);
    }
    y += 24;

    const { stat, links, body } = work.editorial;

    if (stat) {
        ctx.font = `700 ${STAT_VALUE_FONT_SIZE}px ${FONT_FAMILY}`;
        ctx.fillStyle = TEXT_COLOR;
        y += STAT_VALUE_FONT_SIZE;
        ctx.fillText(stat.value, MARGIN, y);
        ctx.font = `${STAT_LABEL_FONT_SIZE}px ${FONT_FAMILY}`;
        ctx.fillStyle = MUTED_COLOR;
        y += STAT_LABEL_FONT_SIZE + 10;
        ctx.fillText(stat.label, MARGIN, y);
        y += 24;
    }

    ctx.strokeStyle = DIVIDER_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(MARGIN, y);
    ctx.lineTo(width - MARGIN, y);
    ctx.stroke();
    y += 46;

    const linkRows = links?.length ?? 0;
    const bodyBottom = height - MARGIN - (linkRows > 0 ? linkRows * LINK_ROW_HEIGHT + 20 : 0);

    ctx.font = `${BODY_FONT_SIZE}px ${FONT_FAMILY}`;
    ctx.fillStyle = TEXT_COLOR;
    paragraphs: for (const paragraph of body) {
        const lines = wrapLines(paragraph, { measureWidth: (t) => measureWidth(t, BODY_FONT_SIZE), maxWidth: contentWidth });
        for (const line of lines) {
            if (y + BODY_LINE_HEIGHT > bodyBottom) break paragraphs; // ran out of screen — stop rather than overflow
            y += BODY_LINE_HEIGHT;
            ctx.fillText(line, MARGIN, y);
        }
        y += PARAGRAPH_GAP;
    }

    if (linkRows > 0) {
        ctx.font = `600 ${LINK_FONT_SIZE}px ${FONT_FAMILY}`;
        ctx.fillStyle = ACCENT_COLOR;
        let linkY = height - MARGIN - (linkRows - 1) * LINK_ROW_HEIGHT;
        for (const link of links) {
            ctx.fillText(`→ ${link.label}`, MARGIN, linkY);
            linkY += LINK_ROW_HEIGHT;
        }
    }
}
