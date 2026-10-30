/**
 * The four faces the site draws into canvases, and making sure they are
 * really loaded before anything rasterises with them.
 *
 * The trap: assigning `ctx.font` does not load a face, and a canvas that
 * rasterised in a fallback never corrects itself. So canvas code either waits
 * (`await fonts.ready()`) or paints now and again once the faces land
 * (`fonts.paint(draw)`), which is the pattern modules should use.
 *
 *   inter       the site's face — labels, receipts, UI, the monitor's screen
 *   hand        anything Shae wrote by hand: Shae Hand, the font traced from
 *               photos of Shae's own handwriting, served
 *               from /fonts/ and declared in src/style.css
 *   newsreader  re-typeset press clippings
 *   charis      the monitor's home page, "Hello" (its explanation and its
 *               map of the desk): Charis SIL, SIL's extension of Bitstream
 *               Charter — the face the map was designed in, with Charter's
 *               own outlines and widths — from Google Fonts
 *               (index.html), regular, italic and bold
 */

import { track } from './track.js';
import { invalidate } from '../scene/renderScheduler.js';

export const FACES = Object.freeze({
    inter: '"Inter", system-ui, -apple-system, "Helvetica Neue", sans-serif',
    hand: '"Shae Hand", "Bradley Hand", "Segoe Print", cursive',
    newsreader: '"Newsreader", Georgia, "Times New Roman", serif',
    charis: '"Charis SIL", Charter, "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif'
});

/**
 * How Shae's hand is set. The font's tails reach 0.45 em below the line and
 * its ascenders 0.87 em above it, so lines of it need 1.3 em between
 * baselines not to run into each other — once the per-line wobble and tilt are
 * gentle, as they can be now the letters themselves are irregular (they were
 * tuned to shake up a regular typeface). A note that fits on one line takes
 * the tighter `single` height, so a date or a tab is as large as its space allows.
 */
export const HAND = Object.freeze({ lineHeight: 1.3, single: 1.06, wobble: 0.015, tilt: 0.004 });

/**
 * Every face canvas code asks for. Add to this if a module needs another weight.
 * Shae Hand is one weight, declared across 100–900 so a canvas asking for 600
 * gets the real font rather than a browser-faked bold.
 */
const CANVAS_FACES = [
    '400 16px "Inter"', '500 16px "Inter"', '600 16px "Inter"', '700 16px "Inter"',
    '400 16px "Shae Hand"', '600 16px "Shae Hand"', '700 16px "Shae Hand"',
    '400 16px "Newsreader"', '500 16px "Newsreader"', '600 16px "Newsreader"', 'italic 400 16px "Newsreader"',
    '400 16px "Charis SIL"', '700 16px "Charis SIL"', 'italic 400 16px "Charis SIL"'
];

const READY_TIMEOUT_MS = 2500;
const STYLESHEET_TIMEOUT_MS = 6000;

/**
 * A `font` shorthand for canvas: font({ face: 'hand', size: 42, weight: 500 }).
 * `face` is a key of FACES or a literal family list.
 */
export function font({ face = 'inter', size = 16, weight = 400, style = 'normal' } = {}) {
    const family = FACES[face] ?? face;
    return `${style} ${weight} ${size}px ${family}`;
}

function fontsStylesheets() {
    return typeof document === 'undefined'
        ? []
        : [...document.querySelectorAll('link[rel="stylesheet"][href*="fonts.googleapis.com"]')];
}

/** Resolves once one Google Fonts stylesheet has been parsed (its @font-face rules exist). */
function sheetLoaded(link) {
    if (link.sheet) return Promise.resolve(true);
    return new Promise((resolve) => {
        const finish = (ok) => { clearTimeout(timer); resolve(ok); };
        const timer = setTimeout(() => finish(Boolean(link.sheet)), STYLESHEET_TIMEOUT_MS);
        link.addEventListener('load', () => finish(true), { once: true });
        link.addEventListener('error', () => finish(false), { once: true });
    });
}

/** Resolves once every Google Fonts stylesheet has been parsed (or has failed, or timed out). */
function stylesheetLoaded() {
    const links = fontsStylesheets();
    if (links.length === 0) return Promise.resolve(false);
    return Promise.all(links.map(sheetLoaded)).then((results) => results.every(Boolean));
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Loads one face (optionally the subset covering `text`) and reports whether
 * the browser now actually has it. Retries briefly: a load() issued before the
 * @font-face rules are known resolves with no faces rather than failing.
 */
export async function loadFace(shorthand, text) {
    if (typeof document === 'undefined' || !document.fonts?.load) return false;
    await stylesheetLoaded();
    for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
            const faces = await document.fonts.load(shorthand, text);
            if (faces.length > 0 || document.fonts.check(shorthand, text)) return true;
        } catch {
            return false;
        }
        await wait(150 * (attempt + 1));
    }
    return false;
}

let allLoaded = null;
let loadedFlag = false;

function startOnce() {
    allLoaded ??= track(
        Promise.all(CANVAS_FACES.map((face) => loadFace(face)))
            .then((results) => document.fonts?.ready.then(() => results) ?? results)
            .then((results) => {
                loadedFlag = results.every(Boolean);
                if (!loadedFlag) {
                    const missing = CANVAS_FACES.filter((_, i) => !results[i]);
                    console.warn('[desk:fonts] Some canvas faces did not load; canvases will use fallbacks:', missing.join(', '));
                }
                return loadedFlag;
            })
            .catch(() => false),
        'fonts'
    );
    return allLoaded;
}

/**
 * Waits for every canvas face, giving up after `timeoutMs`.
 * @returns {Promise<boolean>} true if they all arrived in time
 */
export function ready({ timeoutMs = READY_TIMEOUT_MS } = {}) {
    const loaded = startOnce();
    return Promise.race([loaded, wait(timeoutMs).then(() => false)]);
}

/** The untimed load — what settled() waits on. Resolves true/false, never rejects. */
export function whenLoaded() {
    return startOnce();
}

/** Whether every canvas face has loaded. */
export function loaded() {
    return loadedFlag;
}

/**
 * Paint now, and paint again once the faces land if they have not yet.
 * `draw` should redraw its canvas and set `texture.needsUpdate = true`; this
 * requests the frame afterwards. The repaint is tracked, so settled() waits.
 */
export function paint(draw) {
    try {
        draw();
    } catch (error) {
        console.error('[desk:fonts] paint failed', error);
    }
    if (loadedFlag) return;
    track(startOnce().then(() => {
        try {
            draw();
        } catch (error) {
            console.error('[desk:fonts] repaint failed', error);
        }
        invalidate();
    }), 'font repaint');
}

export const fonts = { FACES, HAND, font, loadFace, ready, whenLoaded, loaded, paint };
