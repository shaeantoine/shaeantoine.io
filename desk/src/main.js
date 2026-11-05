/**
 * The site's boot + router. See the README.md at the repository root for
 * what this is, and core/contract.js for the module contract.
 *
 * Puts the room together: the layout (src/content/deskObjects.js, through
 * core/layout.js), the preloader, DeskScene (lighting, materials, shadows,
 * render-on-demand), the desk mouse's echo. The camera is core/camera.js (not
 * scene/CameraRig.js, the original site's), and everything you can walk up to
 * is a module.
 */

import { deskObjects as BASE_OBJECTS } from './content/deskObjects.js';
import { preloadDeskAssets } from './loaders/preload.js';
import { createDeskScene } from './scene/DeskScene.js';
import { createDeskCursor } from './cursor/DeskCursor.js';
import { projectToScreenRect } from './scene/projectToScreenRect.js';
import { still, reducedMotion, instant as INSTANT } from './core/flags.js';
import { buildLayout } from './core/layout.js';
import { normalizeModule } from './core/contract.js';
import { createDeskCamera } from './core/camera.js';
import { createContext, forModule } from './core/context.js';
import { ready as fontsReady, whenLoaded as fontsLoaded } from './core/fonts.js';
import { track, drain, hasPending, outstanding } from './core/track.js';
import { activeCount } from './core/motion.js';
import { hint, live, setCursor } from './core/dom.js';

// Registration order is mount order and trail order.
const MODULE_SOURCES = [
    ['monitor', () => import('./modules/monitor/index.js')],
    ['bench', () => import('./modules/bench/index.js')],
    ['box', () => import('./modules/box/index.js')],
    ['paper', () => import('./modules/paper/index.js')],
    ['printer', () => import('./modules/printer/index.js')],
    ['props', () => import('./modules/props/index.js')],
    ['badge', () => import('./modules/badge/index.js')]
];

const DEFAULT_TITLE = "Shae McKenna's Desk";
// One voice for every hint: lowercase fragments, ' · ' between, the way out last.
const DESK_HINT = 'start with the screen · or click anything on the desk';
const MODULE_HINT = 'esc to step back';
const MIN_VEIL_MS = 500; // the veil stays up at least this long, so it never just flashes
const VEIL_FADE_MS = 700; // src/style.css .loading-veil
const OPENING_BUDGET_MS = 10000; // past this, the room is shown as far as it got
const SETTLE_TIMEOUT_MS = 30000;
// #webgl-fallback's sentence when WebGL is there but the room could not be built
// on it (index.html's own is the one for no WebGL at all).
const ROOM_FAILED = 'Something went wrong drawing the room. Reload to try again.';

const headerEl = document.getElementById('site-header');
const canvasEl = document.getElementById('desk-canvas');
const tooltipEl = document.getElementById('desk-object-label');
const veilEl = document.getElementById('loading-veil');
const veilBarEl = document.getElementById('loading-veil-bar');
const vignetteEl = document.getElementById('focus-vignette');
const fallbackEl = document.getElementById('webgl-fallback');
const leaveLinkEl = document.getElementById('desk-leave');
const backEl = document.getElementById('desk-back');

document.documentElement.classList.toggle('desk-still', still);
document.documentElement.classList.toggle('desk-reduced', reducedMotion);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** @type {{ module: object, ctx: object, mounted: Promise<void>, isMounted: boolean, failed?: boolean }[]} */
const runtimes = [];
const runtimeById = new Map();
let owners = new Map();
let deskScene = null;
let camera = null;
let baseCtx = null;
let deskCursor = null;
let active = null; // runtime of the active module, or null at the desk
let currentRoute = { moduleId: null, path: [], hash: '#desk' };
let clickHit = false;
let clickHandled = false;

let resolveReady;
const ready = new Promise((resolve) => { resolveReady = resolve; });

window.__desk = {
    /** Resolves once the room is uncovered: { ok, modules, failed }. */
    ready,
    /** Navigate: __desk.go('#box/amazon', { instant: true }). Resolves when the route's calls return. */
    go: (hash, options) => ready.then(() => navigate(hash, options)),
    /** Resolves true when nothing is moving or loading and two frames have been drawn since. */
    settled: (options) => settled(options),
    /** Every declared state: [{ hash, note, module }]. */
    states: () => states(),
    route: () => ({ ...currentRoute, path: [...currentRoute.path] }),
    modules: () => runtimes.map((r) => r.module.id),
    get ctx() { return baseCtx; }
};

// ---------------------------------------------------------------------------
// Safe calls into modules
// ---------------------------------------------------------------------------

function callSync(runtime, method, fallback, ...args) {
    if (!runtime?.isMounted) return fallback;
    try {
        return runtime.module[method](runtime.ctx, ...args);
    } catch (error) {
        console.error(`[desk:${runtime.module.id}] ${method} failed`, error);
        return fallback;
    }
}

/** What callAsync resolves with when the module's method threw. */
const FAILED = Symbol('failed');

/** Waits for the module's mount, then calls; never rejects (a throw resolves FAILED). */
function callAsync(runtime, method, ...args) {
    return runtime.mounted.then(async () => {
        if (!runtime.isMounted) return undefined;
        try {
            return await runtime.module[method](runtime.ctx, ...args);
        } catch (error) {
            console.error(`[desk:${runtime.module.id}] ${method} failed`, error);
            return FAILED;
        }
    });
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

async function loadModules() {
    const results = await Promise.allSettled(MODULE_SOURCES.map(([, load]) => load()));
    const failed = [];
    results.forEach((result, index) => {
        const [name] = MODULE_SOURCES[index];
        if (result.status === 'rejected') {
            console.error(`[desk:${name}] failed to import; left out of the room.`, result.reason);
            failed.push(name);
            return;
        }
        try {
            const module = normalizeModule(result.value, `modules/${name}/index.js`);
            if (runtimeById.has(module.id)) throw new Error(`duplicate module id "${module.id}"`);
            const runtime = { module, ctx: null, mounted: Promise.resolve(), isMounted: false };
            runtimes.push(runtime);
            runtimeById.set(module.id, runtime);
        } catch (error) {
            console.error(`[desk:${name}] is not a valid module; left out.`, error);
            failed.push(name);
        }
    });
    return failed;
}

function mountModules() {
    for (const runtime of runtimes) {
        runtime.ctx = forModule(baseCtx, runtime.module);
        runtime.mounted = (async () => {
            try {
                await runtime.module.mount(runtime.ctx);
                runtime.isMounted = true;
            } catch (error) {
                runtime.failed = true;
                console.error(`[desk:${runtime.module.id}] mount failed; its routes show the desk instead.`, error);
            }
        })();
        track(runtime.mounted, `mount ${runtime.module.id}`);
    }
    return Promise.all(runtimes.map((runtime) => runtime.mounted));
}

function states() {
    const list = [{ hash: '#desk', note: 'establishing shot, nothing picked up yet; the monitor shows Hello: Shae\'s photo and a big "Click me!"', module: 'desk' }];
    const seen = new Set(['#desk', '#desk/after']);
    for (const { module } of runtimes) {
        for (const state of module.states ?? []) {
            if (!state?.hash || seen.has(state.hash)) continue;
            seen.add(state.hash);
            list.push({ hash: state.hash, note: state.note ?? '', module: module.id });
        }
    }
    list.push({ hash: '#desk/after', note: 'establishing shot after a visit: the box with five prints on the desk in front of it, the tag lying back-up, the receipt out, "caught 3"; lamp off by day', module: 'desk' });
    return list;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

function parseHash(hash) {
    let raw = String(hash ?? '').replace(/^#\/?/, '');
    try { raw = decodeURIComponent(raw); } catch { /* keep it raw */ }
    const parts = raw.split('/').filter(Boolean);
    if (parts.length === 0) return { moduleId: null, path: [], hash: '#desk' };
    const [head, ...rest] = parts;
    if (head === 'desk') return { moduleId: null, path: rest, hash: `#${parts.join('/')}` };
    if (!runtimeById.has(head) || runtimeById.get(head).failed) {
        console.warn(`[desk] No working module "${head}" — showing the desk.`);
        return { moduleId: null, path: [], hash: '#desk' };
    }
    return { moduleId: head, path: rest, hash: `#${parts.join('/')}` };
}

function setVignette(on) {
    if (on) {
        vignetteEl.hidden = false;
        if (still) vignetteEl.classList.add('visible');
        else requestAnimationFrame(() => { if (active) vignetteEl.classList.add('visible'); });
    } else {
        vignetteEl.classList.remove('visible');
        if (still) vignetteEl.hidden = true;
        else setTimeout(() => { if (!active) vignetteEl.hidden = true; }, 260);
    }
}

function deskLiveText() {
    const labels = [...owners.keys()]
        .map((id) => deskScene?.getObjectGroup(id)?.userData.label)
        .filter(Boolean);
    return labels.length ? `Shae McKenna's desk. On it: ${labels.join(', ')}.` : "Shae McKenna's desk.";
}

function applyRoute(route, { instant = INSTANT } = {}) {
    const next = route.moduleId ? runtimeById.get(route.moduleId) : null;
    const previous = active;
    currentRoute = route;
    const jobs = [];

    tooltipEl.hidden = true;

    if (previous && previous !== next) {
        jobs.push(callAsync(previous, 'leave', { instant }));
    }
    active = next;
    // The header's "← back" is there whenever a part of the room is open.
    if (backEl) backEl.hidden = !next;

    if (!next) {
        setVignette(false);
        setCursor(null);
        hint(DESK_HINT);
        live(deskLiveText());
        document.title = DEFAULT_TITLE;
        deskCursor?.setActive(true);
        if (route.path[0] === 'after') {
            for (const runtime of runtimes) jobs.push(callAsync(runtime, 'trail'));
        }
        // The raise (if any) comes down once the camera has pulled back.
        jobs.push(camera.establishing({ instant }).then(() => { if (!active) deskScene.releaseLift(); }));
    } else {
        if (previous !== next) {
            setVignette(next.module.vignette !== false);
            setCursor(null);
            hint(MODULE_HINT);
            live('');
            deskCursor?.setActive(false);
            if (next.module.liftWhileActive && next.module.objectIds[0]) deskScene.holdLift(next.module.objectIds[0]);
            else deskScene.releaseLift();
        }
        // A module whose go() throws must not leave the visitor in a half-entered
        // state (vignette on, camera wherever it was): step back to the desk.
        jobs.push(callAsync(next, 'go', [...route.path], { instant }).then((result) => {
            if (result === FAILED && active === next && currentRoute === route) navigate('#desk', { replace: true, instant });
        }));
    }

    const all = Promise.allSettled(jobs).then(() => undefined);
    track(all, `route ${route.hash}`);
    return all;
}

/** Pushes (or replaces) the hash and applies it — even if it is the current one. */
function navigate(hash, { replace = false, instant } = {}) {
    const target = String(hash).startsWith('#') ? String(hash) : `#${hash}`;
    const route = parseHash(target);
    if (window.location.hash !== route.hash) {
        if (replace) history.replaceState(null, '', route.hash);
        else history.pushState(null, '', route.hash);
    }
    return applyRoute(route, instant === undefined ? {} : { instant });
}

function onLocationChange() {
    const route = parseHash(window.location.hash);
    if (route.hash === currentRoute.hash) return; // already applied (pushState + popstate/hashchange pairs)
    applyRoute(route);
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

function screenRectFor(objectId) {
    const box = deskScene.getObjectScreenBox(objectId);
    deskScene.camera.updateMatrixWorld();
    return projectToScreenRect(box, deskScene.camera, { width: canvasEl.clientWidth, height: canvasEl.clientHeight });
}

function onHoverChange(info) {
    deskCursor?.setHover(info?.id ?? null);
    if (active) {
        tooltipEl.hidden = true;
        return;
    }
    if (!info) {
        tooltipEl.hidden = true;
        setCursor(null);
        return;
    }
    setCursor('pointer');
    if (!info.label) return;
    const rect = screenRectFor(info.id);
    tooltipEl.textContent = info.label;
    tooltipEl.style.left = `${rect.left + rect.width / 2}px`;
    tooltipEl.style.top = `${rect.top}px`;
    tooltipEl.hidden = false;
}

function onEnterFocus(objectId) {
    clickHit = true;
    if (clickHandled) return;
    const owner = owners.get(objectId);
    if (!owner) return;
    if (active && active.module === owner) return; // it had first refusal and passed
    navigate(`#${owner.id}`);
}

/** Capture phase, so the active module sees the click before DeskScene does. */
function onCanvasClickCapture(event) {
    clickHit = false;
    clickHandled = false;
    if (!active) return;
    const ndc = deskScene.pointer.ndcForEvent(event);
    if (callSync(active, 'click', false, ndc, event) === true) {
        clickHandled = true;
        // Same element as DeskScene's listener, so stopPropagation alone would not reach it.
        event.stopImmediatePropagation();
    }
}

/** Bubble phase, registered after DeskScene's: a click on nothing steps back to the desk. */
function onCanvasClickAfter() {
    if (clickHandled || clickHit || !active) return;
    navigate('#desk');
}

function onKeydown(event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return;
    // A focused link or button ("Before you go →", "Save receipt") keeps its own
    // Space / Enter — no module may swallow the activation of a real control.
    if ((event.key === ' ' || event.key === 'Enter') && event.target?.closest?.('a[href], button')) return;
    if (!active) return;
    if (callSync(active, 'key', false, event) === true) {
        event.preventDefault();
        return;
    }
    if (event.key === 'Escape') {
        event.preventDefault();
        navigate('#desk');
    }
}

/**
 * The header's "← back": exactly what Esc does. The open module steps back a
 * level if it has one (a turned print, an app, a page), else the room goes
 * back to the desk.
 */
function stepBack() {
    if (!active) return;
    const escape = {
        key: 'Escape', code: 'Escape', repeat: false, target: document.body,
        defaultPrevented: false, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false,
        preventDefault() {}, stopPropagation() {}
    };
    if (callSync(active, 'key', false, escape) === true) return;
    navigate('#desk');
}

backEl?.addEventListener('click', (event) => {
    event.stopPropagation();
    stepBack();
});

// ---------------------------------------------------------------------------
// Settling (window.__desk.settled — for debugging and tests)
// ---------------------------------------------------------------------------

async function settled({ timeoutMs = SETTLE_TIMEOUT_MS } = {}) {
    await ready;
    if (!deskScene) return false;
    const deadline = performance.now() + timeoutMs;
    while (performance.now() < deadline) {
        const remaining = deadline - performance.now();
        await Promise.race([drain(), wait(remaining)]);
        await Promise.race([fontsLoaded(), wait(deadline - performance.now())]);
        if (camera.isMoving() || activeCount() > 0 || hasPending()) {
            await nextFrame();
            continue;
        }
        await deskScene.whenDrawn();
        await deskScene.whenDrawn();
        if (!camera.isMoving() && activeCount() === 0 && !hasPending()) return true;
    }
    console.warn('[desk] settled() timed out.', {
        pending: outstanding(),
        animations: activeCount(),
        cameraMoving: camera?.isMoving()
    });
    return false;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function isWebglAvailable() {
    try {
        // Only a probe, so it is let go at once rather than left to the
        // collector: until then a context holds its share of GPU memory, and on
        // a phone the room's renderer is about to want all of it there is.
        const gl = document.createElement('canvas').getContext('webgl2');
        gl?.getExtension?.('WEBGL_lose_context')?.loseContext();
        return Boolean(gl);
    } catch {
        return false;
    }
}

/**
 * The page without the room: the fallback's sentence where the canvas was, and
 * no header (nothing in it works without the room). `message` replaces
 * index.html's, which is the one for no WebGL at all.
 */
function showFallback(message) {
    canvasEl.hidden = true;
    if (message) (fallbackEl.querySelector('p') ?? fallbackEl).textContent = message;
    fallbackEl.hidden = false;
    veilEl.hidden = true;
}

function setLoadProgress(fraction) {
    if (veilBarEl) veilBarEl.style.transform = `scaleX(${fraction})`;
    veilBarEl?.parentElement?.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
}

function untilDeadline(promise, label, deadline) {
    // Warn only if the deadline actually won — and clear the timer when it didn't,
    // or every load would print these ten seconds in, whatever happened.
    let timer = null;
    const timeout = new Promise((resolve) => {
        timer = setTimeout(() => {
            console.warn(`[desk] Opening budget spent waiting on ${label}; showing the room as far as it got.`);
            resolve();
        }, Math.max(0, deadline - performance.now()));
    });
    return Promise.race([Promise.resolve(promise).finally(() => clearTimeout(timer)), timeout]);
}

function reveal({ animateCamera }) {
    headerEl.hidden = false;
    if (still) {
        veilEl.hidden = true;
        headerEl.classList.add('is-revealed');
        return;
    }
    if (animateCamera) camera.intro();
    veilEl.classList.add('fading');
    headerEl.classList.add('is-revealed');
    setTimeout(() => { veilEl.hidden = true; }, VEIL_FADE_MS);
}

async function start() {
    const openedAt = performance.now();
    const deadline = openedAt + OPENING_BUDGET_MS;
    let failed = [];
    let firstRoute = { moduleId: null, path: [], hash: '#desk' };
    setLoadProgress(0);

    try {
        failed = await loadModules();
        const layout = buildLayout(BASE_OBJECTS, runtimes.map((runtime) => runtime.module));
        owners = layout.owners;

        await Promise.all([
            untilDeadline(preloadDeskAssets(layout.objects, { onProgress: setLoadProgress }), 'the room’s models and textures', deadline),
            fontsReady()
        ]);

        canvasEl.hidden = false;
        deskScene = createDeskScene(canvasEl, layout.objects, {
            onEnterFocus,
            onHoverChange,
            isFocusActive: () => active !== null
        });
        camera = createDeskCamera(deskScene.camera);
        baseCtx = createContext({
            deskScene,
            camera,
            navigate: (hash, options) => navigate(hash, options),
            currentRoute: () => ({ ...currentRoute, path: [...currentRoute.path] })
        });
        try {
            deskCursor = createDeskCursor({ deskScene, canvasEl });
            deskScene.addTick((dt) => deskCursor?.update(dt) ?? false);
        } catch (error) {
            console.error('[desk] desk mouse echo unavailable', error);
        }

        canvasEl.addEventListener('click', onCanvasClickCapture, true);
        canvasEl.addEventListener('click', onCanvasClickAfter);
        document.addEventListener('keydown', onKeydown);
        window.addEventListener('hashchange', onLocationChange);
        window.addEventListener('popstate', onLocationChange);
        leaveLinkEl?.addEventListener('click', (event) => {
            event.preventDefault();
            navigate('#printer');
        });

        await untilDeadline(deskScene.whenReady(), 'the desk objects', deadline);
        await untilDeadline(mountModules(), 'the modules’ mount()', deadline);

        firstRoute = parseHash(window.location.hash);
        // The first route lands in one frame, behind the veil.
        await untilDeadline(applyRoute(firstRoute, { instant: true }), `the first route (${firstRoute.hash})`, deadline);
        await untilDeadline(deskScene.whenDrawn(), 'the first frame', deadline);
    } catch (error) {
        console.error(`[desk] The opening sequence failed; ${deskScene ? 'showing the room as far as it got' : 'there is no room to show'}.`, error);
    } finally {
        if (!still) await wait(MIN_VEIL_MS - (performance.now() - openedAt));
        // No desk scene: making it threw (three throws when the browser will not
        // give its renderer a WebGL context, which a phone short of memory does),
        // or the opening failed before it got that far. "As far as it got" would
        // be an empty canvas under a header whose links go nowhere; say so instead.
        if (deskScene) reveal({ animateCamera: Boolean(camera) && firstRoute.moduleId === null && !INSTANT });
        else showFallback(ROOM_FAILED);
        resolveReady({ ok: Boolean(deskScene), modules: runtimes.map((r) => r.module.id), failed: deskScene ? failed : [...failed, 'desk scene'] });
    }
}

if (!isWebglAvailable()) {
    showFallback();
    resolveReady({ ok: false, modules: [], failed: ['webgl2 unavailable'] });
} else {
    start();
}
