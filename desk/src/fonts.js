/**
 * Making sure Inter is actually loaded before anything draws text into a
 * canvas.
 *
 * THE BUG THIS FIXES, which only ever showed in Safari. Everything on this desk
 * that carries type — the monitor's resting screen, the focused screen, the
 * paper stack's sheets, the lanyard badge, the book spines — is rasterised into
 * a 2D canvas and uploaded as a texture. Those draw calls set `ctx.font` to a
 * family that includes "Inter", and that is where the assumption hides:
 *
 *   Assigning `ctx.font` does NOT trigger a font load, and a face that has not
 *   finished loading is not a candidate for it. The canvas silently falls back.
 *
 * Chrome hides this most of the time, because it starts the Google Fonts
 * request during preload scanning and serves it from cache on any warm load, so
 * by the time a canvas asks for Inter it is usually there. WebKit is lazier
 * about it and the canvas gets `system-ui` instead. The result was every piece
 * of in-scene typography rendering in SF Pro on Safari and Inter on Chrome —
 * different metrics, different colour, visibly worse.
 *
 * And it does not self-correct. A DOM node restyles when a webfont arrives; a
 * canvas that has already been rasterised and uploaded to the GPU does not. The
 * wrong-font texture is the one you keep for the session.
 *
 * So the scene waits for the faces it draws with. `document.fonts.load` is the
 * part that matters — it is what actually *requests* a face, rather than
 * observing loads someone else started. `document.fonts.ready` alone would
 * resolve immediately on a page whose only Inter consumer is a canvas, because
 * nothing in the DOM would have kicked the load off.
 */

/**
 * The faces canvas code draws with, as `font` shorthand strings.
 *
 * Size is irrelevant to `document.fonts.load` — it parses the shorthand and
 * matches on family/weight/style — but the property is required, so these carry
 * a nominal one. Weights are every value passed to `ctx.font` anywhere in the
 * app; grep for `ctx.font` before editing.
 *
 * The page stocks (scene pages) are set in Georgia, a system face that is
 * always present, so they are deliberately not listed here.
 */
const CANVAS_FACES = [
    '400 16px "Inter"',
    '500 16px "Inter"',
    '600 16px "Inter"',
    '700 16px "Inter"'
];

/**
 * How long the first paint is willing to wait on a third-party font host.
 *
 * The trade being made: a blocked or slow fonts.googleapis.com should cost a
 * beat, not the whole scene. Past this the desk mounts with whatever is
 * available and `onCanvasFontsSettled` repaints the one canvas that outlives
 * the gap.
 */
const FONT_TIMEOUT_MS = 1500;

/** Resolves to true if every face loaded, false if we gave up waiting. */
let settled = null;

function loadAll() {
    // No FontFaceSet (very old browsers, and jsdom under test) — there is
    // nothing to wait for and nothing to be gained by pretending otherwise.
    if (typeof document === 'undefined' || !document.fonts?.load) return Promise.resolve(false);
    return Promise.all(CANVAS_FACES.map((face) => document.fonts.load(face)))
        // `ready` covers faces the stylesheet started on its own, and settles
        // the FontFaceSet's own bookkeeping before anything measures text.
        .then(() => document.fonts.ready)
        .then(() => true)
        .catch(() => false); // a font host that 404s is a fallback, not a broken page
}

function startOnce() {
    settled ??= loadAll();
    return settled;
}

/**
 * Waits for the canvas faces, giving up after FONT_TIMEOUT_MS.
 *
 * @returns {Promise<boolean>} whether the fonts were ready in time. False means
 *          in-scene text has been drawn in a fallback face and wants repainting
 *          once the real one lands — see onCanvasFontsSettled.
 */
export function ensureCanvasFonts({ timeoutMs = FONT_TIMEOUT_MS } = {}) {
    const loaded = startOnce();
    const timeout = new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs));
    return Promise.race([loaded, timeout]);
}

/**
 * Calls `callback` once the faces genuinely finish loading, however long that
 * takes — and never, if they fail outright.
 *
 * Only worth registering when `ensureCanvasFonts` came back false, which is the
 * case where in-scene text has already been rasterised in a fallback face and
 * needs repainting. Registering it otherwise would repaint canvases that are
 * already correct.
 */
export function onCanvasFontsSettled(callback) {
    startOnce().then((ok) => { if (ok) callback(); });
}
