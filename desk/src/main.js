import { works } from './content/works/index.js';
import { validateWork } from './content/schema.js';
import { deskObjects } from './content/deskObjects.js';
import { validateDeskLayout } from './content/deskSchema.js';
import { ensureCanvasFonts, onCanvasFontsSettled } from './fonts.js';
import { preloadDeskAssets } from './loaders/preload.js';
import { createDeskScene } from './scene/DeskScene.js';
import { createCameraRig } from './scene/CameraRig.js';
import { createIdleScreen } from './scene/IdleScreen.js';
import { createFocusController } from './focus/FocusController.js';
import { SWAP_MS } from './focus/strategies/artifactStrategy.js';
import { createDeskCursor } from './cursor/DeskCursor.js';
import { renderFocusPanel } from './panel/FocusPanelView.js';
import { renderArtifactSpread } from './panel/ArtifactSpreadView.js';
import { projectToScreenRect } from './transitions/projectToScreenRect.js';

works.forEach((work) => validateWork(work));
validateDeskLayout(deskObjects, works);

const DEFAULT_TITLE = "Shae McKenna's Desk";
const FOCUS_CHROME_FADE_MS = 250;
// Half the spread's crossfade: two of these land inside the object swap, so the
// text has changed by the time the new object has arrived.
//
// Derived from SWAP_MS rather than restated, and pushed into CSS below rather
// than written twice. The relationship is the whole point of the effect and it
// used to be maintained by a comment asking three numbers in two files to agree.
const SPREAD_FADE_MS = SWAP_MS / 2;
document.documentElement.style.setProperty('--spread-fade', `${SPREAD_FADE_MS}ms`);

const headerEl = document.getElementById('site-header');
const deskCanvasEl = document.getElementById('desk-canvas');
const webglFallbackEl = document.getElementById('webgl-fallback');
const loadingVeilEl = document.getElementById('loading-veil');
const focusPanelEl = document.getElementById('focus-panel');
const focusVignetteEl = document.getElementById('focus-vignette');
const tooltipEl = document.getElementById('desk-object-label');
const screenArrowPrevEl = document.getElementById('screen-arrow-prev');
const screenArrowNextEl = document.getElementById('screen-arrow-next');
const artifactSpreadEl = document.getElementById('artifact-spread');
const artifactScrimEl = document.getElementById('artifact-scrim');

// Visuals that render their own content in-scene (the screen crossfade, the
// paper stack's sheets) or beside the object (the hardware spread) instead of
// the shared DOM text panel.
const OBJECT_OWNED_CONTENT_VISUALS = ['sheets', 'screen', 'artifact'];

// Visuals stepped by the floating arrow chrome rather than by clicking the
// object itself. The monitor and the hardware object cycle identically, so
// they share one set of arrows.
const ARROW_CHROME_VISUALS = ['screen', 'artifact'];

// Visuals whose text is the editorial spread set beside the object.
const SPREAD_CONTENT_VISUALS = ['artifact'];

// The object whose resting state is a lit screen. Derived from the layout
// rather than named, so renaming the display — or moving the screen visual onto
// some other object — can't leave a dangling id here pointing at nothing.
const SCREEN_OBJECT_ID = deskObjects.find((object) => object.focus?.visual === 'screen')?.id ?? null;

let deskScene = null;
let cameraRig = null;
let focusController = null;
let deskCursor = null;
let idleScreen = null;
// Set when focus opens; cleared once the dolly has settled and the arrows and
// spread have been placed. See revealFocusChrome.
let chromePendingReveal = false;
// Set when focus closes; cleared once the camera has finished pulling back and
// the object has been let down. See DeskScene.releaseLift.
let liftReleasePending = false;

function findWork(id) {
    return works.find((work) => work.id === id);
}

/**
 * three r169 is WebGL 2 only — it dropped the WebGL 1 backend entirely.
 *
 * This used to probe for WebGL *1* (`window.WebGLRenderingContext`, then
 * `getContext('webgl')`), which every browser that can't run this scene still
 * passes. The fallback message was therefore unreachable: a browser too old for
 * WebGL2 sailed past the check and got a console full of shader errors and a
 * blank canvas instead of the one sentence explaining why.
 */
function isWebglAvailable() {
    try {
        return Boolean(document.createElement('canvas').getContext('webgl2'));
    } catch {
        return false;
    }
}

function parseHash() {
    const focusMatch = window.location.hash.match(/^#\/focus\/([^/]+)(?:\/(.+))?$/);
    if (focusMatch && deskObjects.some((object) => object.id === focusMatch[1])) {
        return { view: 'focus', objectId: focusMatch[1], workId: focusMatch[2] };
    }
    return { view: 'desk' };
}

function computeNdc(event, canvasEl) {
    const rect = canvasEl.getBoundingClientRect();
    return {
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((event.clientY - rect.top) / rect.height) * 2 + 1
    };
}

function focusVisualFor(objectId) {
    return deskObjects.find((object) => object.id === objectId)?.focus?.visual;
}

function hasOwnContentChrome(objectId) {
    return OBJECT_OWNED_CONTENT_VISUALS.includes(focusVisualFor(objectId));
}

function hasArrowChrome(objectId) {
    return ARROW_CHROME_VISUALS.includes(focusVisualFor(objectId));
}

function hasSpreadContent(objectId) {
    return SPREAD_CONTENT_VISUALS.includes(focusVisualFor(objectId));
}

/**
 * Captured ahead of DeskScene's own click listener so that while the paper
 * stack is focused, clicking it turns a sheet or exits focus instead of
 * falling through to the normal click-to-focus flow. It is the only visual
 * that does this; the other focus visuals (screen/model/artifact) don't
 * implement getInteractiveMeshes, so resolveCanvasClick returns null for them
 * and this is a no-op.
 */
function onCanvasClick(event) {
    if (!focusController?.isActive()) return;
    const ndc = computeNdc(event, deskCanvasEl);
    const outcome = focusController.resolveCanvasClick(ndc.x, ndc.y);
    if (!outcome) return;
    event.stopPropagation();
    if (outcome === 'exit') {
        window.location.hash = '#/';
        return;
    }
    advanceFocus(outcome);
}

/**
 * Where an object's rest bounds land on screen right now.
 *
 * The camera's matrixWorldInverse — which `project()` reads — is only
 * refreshed by `renderer.render()`, and the scheduler runs its per-frame ticks
 * *before* it renders. The camera dolly is driven from a separate rAF again,
 * so without forcing the update here, chrome gets placed through the previous
 * frame's camera while the object is drawn with this one, and the lag shifts
 * depending on which of the two callbacks the browser ran first.
 */
function screenRectFor(objectId) {
    const box = deskScene.getObjectScreenBox(objectId);
    deskScene.camera.updateMatrixWorld();
    return projectToScreenRect(box, deskScene.camera, {
        width: deskCanvasEl.clientWidth,
        height: deskCanvasEl.clientHeight
    });
}

function updateFocusChromePosition() {
    const rect = screenRectFor(focusController.currentSnapshot().objectId);
    focusPanelEl.style.left = `${rect.left + rect.width + 24}px`;
    focusPanelEl.style.top = `${rect.top}px`;
}

function updateScreenArrowsPosition() {
    const rect = screenRectFor(focusController.currentSnapshot().objectId);
    const centerY = rect.top + rect.height / 2;
    screenArrowPrevEl.style.left = `${rect.left - 24}px`;
    screenArrowPrevEl.style.top = `${centerY}px`;
    screenArrowNextEl.style.left = `${rect.left + rect.width + 24}px`;
    screenArrowNextEl.style.top = `${centerY}px`;
}

function updateScreenArrowsState() {
    const snapshot = focusController.currentSnapshot();
    screenArrowPrevEl.disabled = snapshot.index === 0;
    screenArrowNextEl.disabled = snapshot.index === snapshot.total - 1;
}

/**
 * Places the arrows and fades the focus chrome in. Held back until the dolly
 * finishes rather than flown in with it: the arrows are pinned to the object's
 * screen-space box, so during the move they'd be chasing a projection that
 * changes every frame. Arriving once, already in position, is both steadier
 * and a clearer signal that the object is ready to be stepped through.
 */
function revealFocusChrome() {
    chromePendingReveal = false;
    const { objectId } = focusController.currentSnapshot();
    const arrows = hasArrowChrome(objectId);
    const spread = hasSpreadContent(objectId);

    if (arrows) {
        updateScreenArrowsState();
        screenArrowPrevEl.hidden = false;
        screenArrowNextEl.hidden = false;
        updateScreenArrowsPosition();
    }
    if (spread) {
        renderCurrentSpread();
        artifactSpreadEl.hidden = false;
        artifactScrimEl.hidden = false;
    }
    // A frame later, so the elements are laid out and the opacity transition
    // has a start value to run from — out of `display: none` it would not.
    requestAnimationFrame(() => {
        if (arrows) {
            screenArrowPrevEl.classList.add('visible');
            screenArrowNextEl.classList.add('visible');
        }
        if (spread) {
            // The scrim comes up with the text and stays for the whole
            // session — only the words crossfade on a step, not the light.
            artifactScrimEl.classList.add('visible');
            artifactSpreadEl.classList.add('visible');
        }
    });
}

function renderCurrentSpread() {
    const snapshot = focusController.currentSnapshot();
    renderSpread(snapshot);
}

function renderSpread({ work, index, total }) {
    renderArtifactSpread(artifactSpreadEl, work, { index, total }, {
        onNavigateToWork(workId) { navigateToWork(workId); }
    });
}

/**
 * Swaps the spread's text at the midpoint of its own fade, timed to land at
 * the midpoint of the object's swap — so the description and the thing it
 * describes change in the same beat rather than one trailing the other.
 * Takes the target snapshot rather than reading the current one, because the
 * controller doesn't commit the new index until the swap has finished.
 */
function crossfadeSpread(target) {
    artifactSpreadEl.classList.remove('visible');
    setTimeout(() => {
        if (!focusController?.isActive()) return; // left before the text came back
        renderSpread(target);
        artifactSpreadEl.classList.add('visible');
    }, SPREAD_FADE_MS);
}

/**
 * Per-frame work that isn't a tween: the desk mouse's damped echo of the
 * pointer, plus the DOM chrome pinned to a focused object's screen-space box, which has to keep up
 * while the camera dollies. Returns whether anything still needs frames — the
 * scheduler parks the loop once nothing does.
 */
function onFrame(dt) {
    const cursorSettling = deskCursor?.update(dt) ?? false;
    let wantsFrames = cursorSettling;

    // The focused object keeps its raise until the camera has finished pulling
    // back, so it settles at the establishing shot rather than dropping
    // halfway through the move. Checked outside the isActive guard below:
    // focus has already closed by the time this is waiting.
    if (liftReleasePending) {
        if (cameraRig.isMoving()) {
            wantsFrames = true;
        } else {
            liftReleasePending = false;
            deskScene.releaseLift();
        }
    }

    if (!focusController?.isActive()) return wantsFrames;
    if (!focusPanelEl.hidden) updateFocusChromePosition();
    // Waiting on the dolly, so hold the loop open — the reveal is the one
    // piece of per-frame work here that nothing else would request a frame for
    // once the camera tween has stopped invalidating.
    if (chromePendingReveal) {
        if (cameraRig.isMoving()) return true;
        revealFocusChrome();
    }
    if (!screenArrowPrevEl.hidden) updateScreenArrowsPosition();
    return wantsFrames;
}

function mountDesk() {
    if (deskScene) return;
    deskCanvasEl.hidden = false;
    headerEl.hidden = false;
    deskScene = createDeskScene(deskCanvasEl, deskObjects, {
        onEnterFocus(objectId) {
            window.location.hash = `#/focus/${objectId}`;
        },
        isFocusActive: () => focusController?.isActive() ?? false,
        onHoverChange(hoverInfo) {
            deskCursor?.setHover(hoverInfo?.id ?? null);
            if (focusController?.isActive()) return; // no hover tooltip while focused
            if (!hoverInfo) {
                tooltipEl.hidden = true;
                return;
            }
            const rect = screenRectFor(hoverInfo.id);
            tooltipEl.textContent = hoverInfo.label;
            tooltipEl.style.left = `${rect.left + rect.width / 2}px`;
            tooltipEl.style.top = `${rect.top}px`;
            tooltipEl.hidden = false;
        },
        /**
         * Fired once a model has loaded and its rest bounds are frozen. The
         * display's resting screen mounts here rather than at scene
         * construction for exactly that reason — attached any earlier it would
         * be measured into the object's own hitbox.
         */
        onObjectLoaded(objectId) {
            if (objectId !== SCREEN_OBJECT_ID) return;
            const { anchor } = deskObjects.find((object) => object.id === objectId).focus;
            idleScreen = createIdleScreen({ deskScene, canvasEl: deskCanvasEl, objectId, anchor, works });
            // A deep link to #/focus/studio-display can have opened focus long
            // before the model finished loading, in which case the resting
            // screen has to arrive already hidden rather than on top of the
            // focused one.
            idleScreen.setFocusedObject(focusController?.currentSnapshot()?.objectId ?? null);
        }
    });
    cameraRig = createCameraRig(deskScene.camera);
    focusController = createFocusController({ deskScene, cameraRig, works, deskObjects });
    deskCursor = createDeskCursor({ deskScene, canvasEl: deskCanvasEl });

    deskCanvasEl.addEventListener('click', onCanvasClick, true);
    deskScene.addTick(onFrame);
}

function renderCurrentFocusPanel() {
    const snapshot = focusController.currentSnapshot();
    renderFocusPanel(focusPanelEl, snapshot.work, { index: snapshot.index, total: snapshot.total }, {
        onNext() { advanceFocus('next'); },
        onPrev() { advanceFocus('prev'); },
        onNavigateToWork(workId) { navigateToWork(workId); },
        onClose() { window.location.hash = '#/'; }
    });
}

async function advanceFocus(direction) {
    // Peeked and started before the await so the text leaves with the object
    // rather than only beginning to change once it has finished arriving.
    const target = focusController.peek(direction);
    if (target && hasSpreadContent(target.objectId) && !artifactSpreadEl.hidden) crossfadeSpread(target);
    await focusController.step(direction);
    const snapshot = focusController.currentSnapshot();
    if (!snapshot) return; // left mid-step
    if (!hasOwnContentChrome(snapshot.objectId)) renderCurrentFocusPanel();
    if (hasArrowChrome(snapshot.objectId)) updateScreenArrowsState();
    window.location.hash = `#/focus/${snapshot.objectId}/${snapshot.work.id}`;
}

function navigateToWork(workId) {
    const work = findWork(workId);
    const objectId = focusController.findObjectIdForCategory(work.category);
    window.location.hash = `#/focus/${objectId}/${workId}`;
}

function enterFocus(objectId, workId) {
    tooltipEl.hidden = true;
    deskCursor?.setActive(false);
    // BEFORE THE CONTROLLER, AND THE ORDER IS LOAD-BEARING TWICE OVER.
    //
    // Holding the raise keeps the lift the hover gave it through the dolly in
    // and for as long as it's open, independent of the pointer — focusing
    // deliberately clears hover. It is claimed before any pending release can
    // fire, so an exit and re-entry in the same tick doesn't let the old one
    // drop this object.
    //
    // What moved it ahead of `enter` is that `enter` reads the object's world
    // position to aim the camera, and the sheet strategy captures it as the
    // position to restore on the way out. Both of those have to see the
    // object at the same height every time. Clicking an object means hovering
    // it first, so it was already raised on that path — but a deep link or a
    // jump between two works' connections arrives with no hover at all, and
    // used to mount the strategy at rest height and raise the group immediately
    // afterwards. Two things went wrong with that. The camera aimed a lift low;
    // and the raise was then overwritten by the approach tween, which writes
    // `position` from the rest height it captured — so the object was never
    // actually up, while the release on the way out still had a lift to take
    // off it, and took it off the resting position instead. The object finished
    // sunk into the desktop and stayed there for the rest of the session.
    liftReleasePending = false;
    deskScene.holdLift(objectId);
    // Before the strategy mounts: screenStrategy's canvas lands on this exact
    // anchor, and the resting one has to be out of the way first.
    idleScreen?.setFocusedObject(objectId);
    const snapshot = focusController.enter(objectId, workId);
    focusVignetteEl.hidden = false;
    requestAnimationFrame(() => focusVignetteEl.classList.add('visible'));
    if (!hasOwnContentChrome(objectId)) {
        focusPanelEl.hidden = false;
        renderCurrentFocusPanel();
    }
    // Only arm the wait when there's something to reveal — the paper stack has
    // neither arrows nor a spread, and arming it there would hold the frame
    // loop open across the whole dolly for nothing.
    chromePendingReveal = hasArrowChrome(objectId) || hasSpreadContent(objectId);
    document.title = snapshot.work.title;
}

function exitFocus() {
    if (!focusController?.isActive()) return;
    focusController.exit();
    // exit() unmounts the strategy's mesh synchronously, so the resting screen
    // takes the anchor back in the same tick — the monitor is never dark, not
    // even for the frame the camera starts pulling back on.
    idleScreen?.setFocusedObject(null);
    deskCursor?.setActive(true);
    focusVignetteEl.classList.remove('visible');
    chromePendingReveal = false;
    liftReleasePending = true; // onFrame lets the object down once the pull-back finishes
    screenArrowPrevEl.classList.remove('visible');
    screenArrowNextEl.classList.remove('visible');
    artifactSpreadEl.classList.remove('visible');
    artifactScrimEl.classList.remove('visible');
    setTimeout(() => {
        // A connection jump exits and re-enters in the same tick, and the
        // dolly outlasts this fade — so by the time it fires, focus may be
        // open again on another object whose chrome this would blank out.
        if (focusController?.isActive()) return;
        focusVignetteEl.hidden = true;
        focusPanelEl.hidden = true;
        focusPanelEl.innerHTML = '';
        screenArrowPrevEl.hidden = true;
        screenArrowNextEl.hidden = true;
        artifactSpreadEl.hidden = true;
        artifactSpreadEl.innerHTML = '';
        artifactScrimEl.hidden = true;
    }, FOCUS_CHROME_FADE_MS);
    document.title = DEFAULT_TITLE;
}

function applyRoute(route) {
    mountDesk();
    if (route.view === 'focus') {
        const current = focusController.currentSnapshot();
        if (!current || current.objectId !== route.objectId) {
            if (current) exitFocus();
            enterFocus(route.objectId, route.workId);
        } else if (route.workId && current.work.id !== route.workId) {
            // connection jump within the same object — re-enter at the new index
            exitFocus();
            enterFocus(route.objectId, route.workId);
        }
        return;
    }
    exitFocus();
}

function onKeydown(event) {
    if (!focusController?.isActive()) return;
    if (event.key === 'ArrowRight') advanceFocus('next');
    if (event.key === 'ArrowLeft') advanceFocus('prev');
    if (event.key === 'Escape') window.location.hash = '#/';
}

document.addEventListener('keydown', onKeydown);
screenArrowPrevEl.addEventListener('click', () => advanceFocus('prev'));
screenArrowNextEl.addEventListener('click', () => advanceFocus('next'));

// ---------------------------------------------------------------------------
// Opening the room
// ---------------------------------------------------------------------------

/**
 * The shortest the veil is allowed to be up for, from the module running to the
 * dissolve starting.
 *
 * NOT A THROTTLE ON THE LOADING — by the time this matters the loading is over.
 * It is there for the warm-cache visit, where every byte comes back in 40 ms
 * and the honest thing to do is uncover the room instantly. That reads as a
 * white flash: a full-screen sheet that appears and vanishes inside three
 * frames is not perceived as a loading screen at all, only as the page
 * flickering. Half a second is enough for the hairline to visibly travel and
 * for the dissolve to be understood as a transition rather than a glitch,
 * and it is spent on the work anyway on any visit that is not cached.
 */
const MIN_VEIL_MS = 500;

/** How long the veil's opacity transition runs — keep in step with style.css. */
const VEIL_FADE_MS = 700;

/**
 * The longest the veil will wait on any one step of the opening sequence.
 *
 * THE FAILURE THIS EXISTS FOR. Everything the sequence waits on is meant to be
 * unable to fail — the preload counts errors as progress, the font wait races
 * its own timeout, a model that 404s settles like any other. What is left is
 * the frame itself: `whenDrawn` resolves from inside the render callback, so a
 * renderer that throws, or a context lost between mounting and the first frame,
 * resolves nothing. There is no recovery from that here, but there is a
 * difference between a visitor seeing a broken scene and a visitor seeing a
 * loading screen that never ends, and only one of the two can be reported.
 */
const STEP_TIMEOUT_MS = 8000;

const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const veilBarEl = document.getElementById('loading-veil-bar');
const veilTrackEl = veilBarEl?.parentElement ?? null;

function setLoadProgress(fraction) {
    if (veilBarEl) veilBarEl.style.transform = `scaleX(${fraction})`;
    veilTrackEl?.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const orTimeout = (promise, label) => Promise.race([
    promise,
    wait(STEP_TIMEOUT_MS).then(() => console.warn(`[desk] Gave up waiting on ${label}; opening anyway.`))
]);

/**
 * Uncovers the room.
 *
 * Three things start on the same frame and finish on three different ones, and
 * the stagger is the effect: the veil dissolves over 700 ms, the header comes
 * in behind a 350 ms delay (see .site-header in style.css), and the camera
 * pushes in for 1800 ms. What a visitor sees is a room surfacing, settling, and
 * only then being labelled — rather than a page that has switched on.
 */
function revealDesk({ animateCamera }) {
    if (animateCamera) cameraRig?.playIntro();
    loadingVeilEl.classList.add('fading');
    headerEl.classList.add('is-revealed');
    setTimeout(() => { loadingVeilEl.hidden = true; }, VEIL_FADE_MS);
}

/**
 * The load, start to finish.
 *
 * THE ORDER IS THE WHOLE POINT. Every step here exists to move one more source
 * of "something appeared late" to before the veil comes down:
 *
 *   1. Fetch every asset the resting scene needs, and the webfont the in-scene
 *      canvases rasterise with. Nothing is built yet, so nothing can pop.
 *   2. Build the scene. Every request it makes is already in hand, so the whole
 *      room resolves inside this tick instead of over the next several seconds.
 *   3. Wait for it to say it is finished, then route — a deep link mounts its
 *      focus strategy against a scene that is fully built rather than one that
 *      is still filling in underneath it.
 *   4. Render a frame nobody will see, which is where every shader compile and
 *      every GPU upload gets paid for.
 *   5. Only now, uncover it.
 *
 * The fonts are raced rather than waited on outright: a slow third-party font
 * host should cost a beat, not the entire scene, and the one canvas that
 * outlives the gap knows how to repaint itself (see IdleScreen.repaint).
 *
 * The reveal is in a `finally` because the one thing worse than any failure
 * this could hit is failing to uncover the canvas afterwards. Whatever state
 * the room is in by then, it is a better answer than a loading screen.
 */
async function start() {
    const openedAt = performance.now();
    let route = { view: 'desk' };
    setLoadProgress(0);

    try {
        const [, fontsReady] = await Promise.all([
            preloadDeskAssets(deskObjects, { onProgress: setLoadProgress }),
            ensureCanvasFonts()
        ]);

        mountDesk();
        if (!fontsReady) onCanvasFontsSettled(() => idleScreen?.repaint());

        window.addEventListener('hashchange', () => applyRoute(parseHash()));
        await orTimeout(deskScene.whenReady(), 'the desk objects');

        route = parseHash();
        applyRoute(route);
        await orTimeout(deskScene.whenDrawn(), 'the first frame');
    } catch (error) {
        console.error('[desk] The opening sequence failed; showing the room as far as it got.', error);
    } finally {
        await wait(MIN_VEIL_MS - (performance.now() - openedAt));
        // A deep link arrives mid-dolly under its own power, and two camera
        // moves fighting over the same frames is worse than neither.
        revealDesk({ animateCamera: route.view === 'desk' && !prefersReducedMotion });
    }
}

if (!isWebglAvailable()) {
    webglFallbackEl.hidden = false;
    loadingVeilEl.hidden = true;
} else {
    start();
}
