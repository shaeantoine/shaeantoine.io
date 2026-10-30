import { FONT_FAMILY } from './screenCanvas.js';
import { luminanceOf } from './bookSpineCanvas.js';
import { deviceScaleFor } from './textureBudget.js';

/**
 * The face of an employee ID badge, drawn to a canvas used as the front face
 * of one card on the lanyard.
 *
 * WHAT THIS HAS TO SURVIVE, which decides every number below. A badge lies
 * flat on the desk at roughly 0.19 x 0.30 world units and is barely legible
 * from the establishing shot — but unlike a book spine, it is *also* the
 * subject of a focus camera that fills a third of the frame with it. So this
 * is the one canvas in the scene that has to work at both ends: a recognisable
 * silhouette at thumbnail size, and real type when you are looking straight at
 * it.
 *
 * The silhouette is doing most of the work far away: a coloured header band, a
 * pale portrait block, two lines of text, a filled access chip and a dark strip
 * at the foot. Five blocks in that arrangement reads as "ID card" long before
 * any of the lettering resolves, which is the same bet the three window dots
 * made on the original site's resting monitor.
 *
 * There is deliberately no photograph. A portrait would have to be a real image
 * asset per badge, and a generic silhouette on six cards would read as stock
 * art. What sits in the photo block instead is the employer's initials, ghosted
 * back — which reads as the badge photo being too small to make out, and which
 * an empty tinted rectangle (the first version of this) did not: an empty block
 * reads as a texture that failed to load.
 */

// Canvas pixels per world unit. A badge is ~0.19 wide and is examined close
// up, where it can fill several hundred CSS px — so this runs far higher than
// the spine's 900, which only ever had to survive being eighteen pixels wide.
export const BADGE_PIXELS_PER_UNIT = 2400;

// Proportions of the card, top to bottom. A real badge puts the issuer at the
// top, the photo in the upper-middle, the name under it, an access class and a
// machine-readable strip at the foot; these are that layout as fractions of
// card height.
const HEADER_END = 0.175;
const PHOTO_TOP = 0.235;
const PHOTO_BOTTOM = 0.575;
const ORG_BASELINE = 0.668;
const ROLE_BASELINE = 0.736;
const CHIP_TOP = 0.775;
const CHIP_BOTTOM = 0.828;
const STRIP_TOP = 0.862;
const STRIP_BOTTOM = 0.918;
const YEAR_BASELINE = 0.962;

const SIDE_MARGIN = 0.10; // fraction of card width

const HEADER_TEXT_SIZE = 0.085; // all type sizes are fractions of card height
const ORG_TEXT_SIZE = 0.088;
const ROLE_TEXT_SIZE = 0.055;
const CHIP_TEXT_SIZE = 0.036;
const YEAR_TEXT_SIZE = 0.034;
const MONOGRAM_SIZE = 0.19;

/**
 * Canvas dimensions for a card of this size.
 *
 * Sized per card rather than to one fixed shape, for the same reason spines
 * are: a shared canvas would stretch the type differently on any badge whose
 * proportions were nudged.
 */
export function badgeCanvasSize(width, height, bufferHeight) {
    const density = BADGE_PIXELS_PER_UNIT * deviceScaleFor(bufferHeight);
    return {
        width: Math.max(64, Math.round(width * density)),
        height: Math.max(96, Math.round(height * density))
    };
}

/** Ink for a given card stock: near-black on light card, warm off-white on dark. */
export function inkFor(hex) {
    return luminanceOf(hex) > 0.45 ? '#1f1d1a' : '#ece7dd';
}

/**
 * The largest font size at which `text` fits `maxWidth`, never larger than
 * `maxSize`. Measured once at a reference size and scaled — text advance is
 * linear in font size, so one measurement answers it exactly.
 */
function fitFontSize(ctx, text, weight, maxWidth, maxSize) {
    const REFERENCE = 100;
    ctx.font = `${weight} ${REFERENCE}px ${FONT_FAMILY}`;
    const width = ctx.measureText(text).width;
    if (width === 0) return maxSize;
    return Math.min(maxSize, (maxWidth / width) * REFERENCE);
}

/**
 * The org's initials, for the photo block.
 *
 * NOT A PORTRAIT, for the reason given above, and not an empty tinted
 * rectangle either — an empty block reads as a texture that failed to load. A
 * ghosted monogram reads as the badge photo being too small to make out, which
 * at this size is simply true, and it differs per employer for free.
 */
export function monogramFor(org) {
    return org
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => word[0].toUpperCase())
        .join('')
        .slice(0, 2);
}

/**
 * @param {HTMLCanvasElement} canvas sized by badgeCanvasSize
 * @param {{ org: string, role: string, color: string, accent?: string, access?: string, year?: string }} badge
 */
export function drawBadge(canvas, { org, role, color, accent, access, year }) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const ink = inkFor(color);
    const band = accent ?? ink;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);

    // Header band, with the issuer reversed out of it. This is the single
    // strongest cue at distance — a card with a solid stripe across the top is
    // an ID badge and a card without one is a business card.
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, width, height * HEADER_END);

    const margin = width * SIDE_MARGIN;
    const contentWidth = width - margin * 2;

    const headerSize = fitFontSize(ctx, org, '600', contentWidth, height * HEADER_TEXT_SIZE);
    ctx.font = `600 ${headerSize}px ${FONT_FAMILY}`;
    ctx.fillStyle = inkFor(band);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(org, width / 2, (height * HEADER_END) / 2);

    // The photo block. Tinted off the card rather than given a colour of its
    // own, so it reads as an area of the badge rather than as a sticker, with
    // the employer's initials ghosted into it.
    const photoHeight = height * (PHOTO_BOTTOM - PHOTO_TOP);
    const photoWidth = photoHeight * 0.78; // passport proportions
    const photoLeft = (width - photoWidth) / 2;
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.13;
    ctx.fillRect(photoLeft, height * PHOTO_TOP, photoWidth, photoHeight);
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = Math.max(1, height * 0.004);
    ctx.strokeStyle = ink;
    ctx.strokeRect(photoLeft, height * PHOTO_TOP, photoWidth, photoHeight);

    const monogram = monogramFor(org);
    ctx.globalAlpha = 0.22;
    ctx.font = `600 ${fitFontSize(ctx, monogram, '600', photoWidth * 0.7, height * MONOGRAM_SIZE)}px ${FONT_FAMILY}`;
    ctx.fillText(monogram, width / 2, height * (PHOTO_TOP + PHOTO_BOTTOM) / 2);
    ctx.globalAlpha = 1;

    ctx.textBaseline = 'alphabetic';
    const orgSize = fitFontSize(ctx, org, '600', contentWidth, height * ORG_TEXT_SIZE);
    ctx.font = `600 ${orgSize}px ${FONT_FAMILY}`;
    ctx.fillStyle = ink;
    ctx.fillText(org, width / 2, height * ORG_BASELINE);

    const roleSize = fitFontSize(ctx, role, '500', contentWidth, height * ROLE_TEXT_SIZE);
    ctx.font = `500 ${roleSize}px ${FONT_FAMILY}`;
    ctx.globalAlpha = 0.68;
    ctx.fillText(role, width / 2, height * ROLE_BASELINE);
    ctx.globalAlpha = 1;

    // The access class, reversed out of a filled chip. Two jobs at the same
    // employer are the same card but for one word, and this is the word: a
    // solid block of colour at a fixed place is also legible as *something*
    // from much further away than the lettering in it.
    if (access) {
        const chipHeight = height * (CHIP_BOTTOM - CHIP_TOP);
        const chipTextSize = fitFontSize(ctx, access, '600', contentWidth * 0.8, height * CHIP_TEXT_SIZE);
        ctx.font = `600 ${chipTextSize}px ${FONT_FAMILY}`;
        const chipWidth = Math.min(contentWidth, ctx.measureText(access).width + chipHeight * 1.6);
        ctx.fillStyle = band;
        ctx.fillRect((width - chipWidth) / 2, height * CHIP_TOP, chipWidth, chipHeight);
        ctx.fillStyle = inkFor(band);
        ctx.textBaseline = 'middle';
        ctx.fillText(access, width / 2, height * (CHIP_TOP + CHIP_BOTTOM) / 2);
        ctx.textBaseline = 'alphabetic';
    }

    // The machine-readable strip. Drawn as irregular bars from a hash of the
    // org so each badge differs, rather than as one grey rectangle — at focus
    // distance a flat block is the detail that gives the card away as drawn.
    const stripTop = height * STRIP_TOP;
    const stripHeight = height * (STRIP_BOTTOM - STRIP_TOP);
    let seed = 0;
    for (let i = 0; i < org.length; i++) seed = (seed * 31 + org.charCodeAt(i)) >>> 0;

    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.72;
    let x = margin;
    while (x < width - margin) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const barWidth = (1 + (seed % 3)) * (width * 0.006);
        const gap = (1 + ((seed >>> 8) % 3)) * (width * 0.006);
        ctx.fillRect(x, stripTop, Math.min(barWidth, width - margin - x), stripHeight);
        x += barWidth + gap;
    }
    ctx.globalAlpha = 1;

    if (year) {
        ctx.font = `500 ${height * YEAR_TEXT_SIZE}px ${FONT_FAMILY}`;
        ctx.fillStyle = ink;
        ctx.globalAlpha = 0.5;
        ctx.textAlign = 'right';
        ctx.fillText(year, width - margin, height * YEAR_BASELINE);
        ctx.textAlign = 'center';
        ctx.globalAlpha = 1;
    }

    drawLaminate(ctx, width, height);
}

/**
 * The sheen, drawn last over everything.
 *
 * THIS IS THE CHEAPEST THING ON THE CARD AND DOES THE MOST. A badge is a
 * printed insert inside a laminate pouch, and what tells you that is not the
 * printing — it is the diagonal streak of window reflected off the plastic.
 * Without it, a flat canvas mapped onto a flat box reads as ink *on* the desk;
 * with it, the same canvas reads as being under something.
 *
 * Baked into the texture rather than left to the material because the specular
 * the material can produce is one highlight from one light, and at this size
 * and angle the card rarely catches it at all. A painted streak is always
 * there. It is a cheat, and it is the same cheat the book spines use to stand
 * in for a round spine (see bookSpineCanvas.js).
 */
function drawLaminate(ctx, width, height) {
    const sheen = ctx.createLinearGradient(0, 0, width, height);
    sheen.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
    sheen.addColorStop(0.34, 'rgba(255, 255, 255, 0.02)');
    sheen.addColorStop(0.44, 'rgba(255, 255, 255, 0.20)');
    sheen.addColorStop(0.54, 'rgba(255, 255, 255, 0.02)');
    sheen.addColorStop(1, 'rgba(0, 0, 0, 0.10)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, width, height);
}
