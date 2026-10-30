/**
 * MONITOR — "now": what Shae is doing this season, on the desk's one screen.
 *
 *   - The screen is dark — warm charcoal, a real display in dark mode at night
 *     (screen.js) — a desktop, and the first app up on it is the home page,
 *     "Hello" (v9, below; v6–v8 were its earlier forms). Catch The Dot is another app in the dock (#monitor/dot), in its
 *     own window (v5): one dot of warm red light drifting on the
 *     window's field, with a faint trail of embers along the way it came;
 *     click it and it hops somewhere far away; a quiet "caught 3"
 *     bottom-right of the window; and, set small bottom-left, the one line
 *     about it. Left open, from the door it drifts at ≤ 12 fps (ctx.every +
 *     invalidate) while someone is here; focused (#monitor/dot) it is playable at
 *     full frame rate for as long as the pointer is moving, then glides to a
 *     stop (its trail fading with it) and releases the frame loop.
 *   - A yellow sticky note across the screen's top-right corner, overlapping
 *     the bezel, a few degrees off square, its free end curling off the glass:
 *     "now: could AI help me rely on my phone less?" (v4's question).
 *     A 3 in note reads at ~18 px from the focus shot, so clicking it leans in
 *     (#monitor/now: the note at ~54% of the frame); Esc or a click on the
 *     screen leans back out to whichever app is open.
 *   - The screen throws a little warm light on the desk (glow.js, facing out).
 *
 * Owns the existing 'studio-display'. Everything is parented to one PLANE
 * frame at the display's measured anchor (read from src/content/deskObjects.js,
 * read-only), so the lot rides the display's hover lift. See layout.js for
 * every number and the three coordinate spaces.
 *
 * Cheap on purpose, following the original site's idle screen: the 3.8 MP
 * screen canvas is painted once; Catch The Dot's window is its own canvas,
 * painted once; the dot, its trail (one instanced draw) and the ripples are
 * meshes over it, and the counter is the window's small live canvas, so a
 * moving dot costs a frame and a catch costs a 240 x 48 px re-upload.
 *
 * Visit log: "Catch The Dot" on the first catch (visit.log de-duplicates, so
 * once per visit), "the now note" on leaning in to read it; trail() logs both.
 *
 * v4 — A DESKTOP OF SHAE'S SOFTWARE (desktop.js numbers, apps.js painters,
 * windows.js meshes, copy.js words, notepaper.js paper):
 *   - A slim dock along the bottom, in time order: walk.py (2019) · Catch The
 *     Dot · MLX · Apple · Trash, each named, a light under the open ones. The
 *     top bar keeps the visitor's own time (a small canvas; one repaint a minute).
 *   - Clicking an icon scales its window out of the dock (280 ms) and routes to
 *     #monitor/<app>; the camera leans in square to the window (so its words
 *     and its note are legible), dock still in frame. One window at a time.
 *     walk.py draws a seeded fan of 40 random walks (and again on "run");
 *     MLX races a copy-to-GPU lane against a shared-memory lane (illustrative)
 *     with a "why" toggle; Apple is locked (the padlock refuses with a shake);
 *     the Trash's self-improvement/ runs locally, crawls to 3%, stalls, fans
 *     at max — then Shae's note appears beside it.
 *   - Threads, in Shae's hand on paper: the "now" sticky's "→ the phone"
 *     (#bench/phone); a note hanging under the screen for Catch The Dot
 *     (#monitor/note leans in to it; click again → #box/apple-intern); the MLX
 *     window's note (#bench/eeg). At a distance a click leans in; up close,
 *     the arrow follows.
 *   - Traces: a window left open stays open on the screen from the desk; the
 *     dock keeps a light under every app you opened (trail(): all of them).
 *
 * v5 — ONE APP AT A TIME, macOS-like (Shae: "each new app that I click on
 * should minimise the current app and open the new one; Catch The Dot should
 * be the first one that is up"):
 *   - Catch The Dot is a window like the others (desktop.js WINDOWS.dot), the
 *     hero window, with the wallpaper, the clock, the dock and the sticky
 *     around it. The dot, its trail and its ripples are parented to that
 *     window's group, so they ride its minimise and are confined to its field.
 *   - Opening any app (its dock icon, its route, ← →) minimises the open one
 *     into its own dock icon and opens the new one from its icon
 *     (windows.js switchTo). (v5 had #monitor put Catch The Dot up and every
 *     close dot bring it back; v6 below hands both to README.txt.) A
 *     minimised game is fully paused: hidden, no drift, no timer, no frames.
 *   - The lean-ins (#monitor/now, #monitor/note) leave whichever app is open
 *     as it is; a click on the screen goes back to it.
 *
 * v6 — README.txt, THE HOME APP (visitors found it "a bit confusing what the
 * site is actually about and how to really interact with it"; readme.js, since removed):
 *   - Open from the first frame, so it is what the establishing shot shows on
 *     the screen; its first line is set large enough to read from the door.
 *   - #monitor shows whatever app is open (README.txt on a first visit;
 *     afterwards what the visitor left open); #monitor/readme is its dock
 *     icon's route. Any app's close dot, or Esc, brings README.txt back; its
 *     own close dot leaves the bare desktop. Catch The Dot is an app like the
 *     others (#monitor/dot), minimised — fully paused — until it is opened.
 *   - Its lines (and the objects on its map of the desk) take the camera to
 *     the room's parts; ↑ ↓ light a line, Enter follows it.
 *
 * v7 — "A GUIDE TO MY DESK" REPLACES README.txt (guide.js, since removed; Shae chose it from a
 * design panel). Same role, same place, same route (#monitor/readme, its dock
 * icon "start here"):
 *   - From the room it is a closed cover (Shae's photo, "Hello, I'm Shae.", one
 *     big "Click or tap here to begin" button). Going to the monitor turns the
 *     cover back (450 ms, on the window's own canvas, then nothing moves) onto a
 *     two-page spread: who Shae is, "Short on time?", how to look around, and a
 *     drawn plan of the desk whose numbered names take the camera there. Once
 *     opened in a visit it stays open, so the room shows the spread. Still and
 *     reduced motion: no turn, the spread.
 *   - #monitor/cover shows the closed cover up close (a click on it turns it).
 *   - Phones: two pages, "Short on time? Turn over →" / "← Turn back".
 *   (v8 replaces all of this, below.)
 *
 * v8 — "A MAP OF MY DESK" REPLACES THE GUIDE (map.js; Shae, on reflection,
 * preferred the design panel's alternative). Same role, place and route
 * (#monitor/readme, its dock icon "start here"); no cover, no page turn, no photo:
 *   - One cream page: who Shae is, "Short on time?", a large line drawing of
 *     this desk with its six things labelled in words and leader lines out to
 *     each (the drawn objects where the real ones are), and "How to look around".
 *     A label, its leader and its drawn object are one click target; pointing
 *     at one turns the three red and dims the other five. ↑ ↓ step through the
 *     labels in reading order, Enter follows.
 *   - From the room (#desk, on every visit) the strip is a big dark button,
 *     "● Click or tap here to begin →"; it crossfades (250 ms) to the strip as
 *     the camera arrives at the monitor, and back as you leave. Still and
 *     reduced motion: at once.
 *   - Phones: one portrait page, three labels above the drawing and three below.
 *   (v9 folds the map into a three-part page, below.)
 *
 * v9 — "HELLO": ONE TALL PAGE IN THREE PARTS (welcome.js; Shae: "it still
 * feels crowded … a simple initial page which says 'Click me!' and maybe an
 * animation … scroll down … a bit of an explanation … scroll some more to see
 * the navigation"). Same role, place and route (#monitor/readme, "start here"):
 *   - Part 1 (what the room sees, every visit): Shae's photo and "Click me!",
 *     large serif type with a red marker underline (v9.1: no black button,
 *     no red dot, no steam off the cup — Shae's call on the first cut). From
 *     the room any click on the screen goes to the monitor, as before; up
 *     close "Click me!", the photo ("me") or the "scroll ↓" cue under them
 *     scrolls to part 2; "Click me!" turns red under the pointer, or with
 *     the photo under it.
 *   - Part 2: what this is (v9.2: in Shae's own words, below). Part 3: the
 *     map (v8's drawing and "Short on time?"; v9.1: each label just its name).
 *   - Scrolling (windows.js: a texture offset, never a repaint): the wheel or
 *     trackpad over the screen, a finger on a phone (with gentle inertia; a
 *     tap is still a click), ↓ ↑ PageDown PageUp Space Shift+Space Home End
 *     (← → still switch apps; on the map ↑ ↓ light its labels, ↑ from the
 *     first goes back up). It snaps softly to a part when it settles. The
 *     room always shows part 1. #monitor/readme/hello, /about and /map name
 *     parts 1, 2, 3.
 *   - The animation (the one documented exception to rest, as Catch The Dot's
 *     drift): the underline under "Click me!" now and then fades and draws
 *     itself in again, stepped at ≤ 12 fps by ctx.every — a frame only on
 *     the steps where it moves — only while part 1 is on the screen at rest
 *     (from the room or up close), paused 10 s after the pointer last moved
 *     (it resumes on a move), never in a hidden tab, drawn and still under
 *     ?still=1 and reduced motion. Its plane's width and opacity only: no
 *     canvas is repainted.
 *
 * v9.2 — CLICK THE MONITOR, AND THE PAGE GOES ON (Shae: "if the user clicks on
 * the monitor the screen automatically scrolls to the next page"):
 *   - Arriving at the monitor from outside it (rt.view null when go() runs:
 *     the room, another module, a fresh load) on the home app with no part
 *     named (#monitor, #monitor/readme), the page goes on to part 2 by itself
 *     — or to the map, if the visitor left it there this visit (ARRIVAL). The
 *     scroll starts 45% into the camera's dolly (≈ 405 of 900 ms), so it
 *     glides on as the camera arrives; the wait is a tracked, film-clocked
 *     animation whose last frame starts the (tracked) scroll, so
 *     __desk.settled() never resolves between the click and the page at
 *     rest. It is called off if, before it starts, the visitor leaves,
 *     navigates within the monitor, or scrolls, drags, presses a scrolling
 *     key or clicks a page target (their input wins; a pointer move does
 *     not, nor does a sideways wheel, which scrolls nothing). Still, reduced
 *     motion, instant: the part at once. A named part lands exactly there;
 *     inside the monitor the page keeps its place.
 *   - Part 2 is Shae's three paragraphs, verbatim (copy.js WELCOME.about), set
 *     as a short letter; at its foot part 1's small "scroll ↓", on to the map.
 */

import { deskObjects as BASE_OBJECTS } from '../../content/deskObjects.js';
import { activePreset } from '../../scene/timeOfDay.js';
import * as L from './layout.js';
import { createDotGame } from './game.js';
import { createTrailPath } from './trail.js';
import { glowTexture, emberTexture, DOT_PEAK } from './dot.js';
import { drawScreen, CAPTION, TITLE, SCREEN_COLORS } from './screen.js';
import { buildSticky, drawSticky, NOW_TEXT, NOW_THREAD, STICKY_LIFT } from './sticky.js';
import { addScreenGlow } from './glow.js';
import { APP_ORDER, WINDOWS, appShot, gameField, gameRect, mapVariantFor } from './desktop.js';
import { createDesktop, CUE_FADE_MS } from './windows.js';
import { APPS, WALK, MLX, APPLE, TRASH, THREADS, TRASH_NOTE } from './copy.js';
import { measureMapOffsets, MAP_LABELS, MAP_ORDER } from './map.js';
import { pageLiveText, HELLO, SECTIONS } from './welcome.js';
import { makeCamera, ESTABLISHING, FOV } from '../../core/framing.js';

const DISPLAY_ID = L.DISPLAY_ID;
const GAME_TITLE = 'Catch The Dot';
const NOTE_TITLE = 'the now note';
const CAUGHT_KEY = 'shae-desk:caught';
const HINT = {
    // The home page, per part in view (v9).
    readme: Object.freeze([
        'scroll down · or click me · esc to step back',
        'scroll for the map · esc to step back',
        'click a label to go there · scroll up for more · esc to step back'
    ]),
    now: 'click the arrow to follow it · click the screen to go back · esc to step back',
    dot: 'click the dot · click the note under the screen to read it · ← → for the other apps · esc to step back',
    desktop: 'the dock opens an app · click the note to read it · esc to step back',
    note: 'click the note again to follow it · click the screen to go back · esc to step back',
    walk: 'click run for another walk · ← → for the other apps · esc to step back',
    mlx: 'click run to race them again · why, for the reason · click the note to follow it · esc to step back',
    apple: '← → for the other apps · esc to step back',
    trash: 'open the folder to run it · ← → for the other apps · esc to step back',
    trashRan: 'it stalls there · ← → for the other apps · esc to step back'
};
/** The views an app route puts the monitor in (#monitor/<app>): every app in the dock, the map and Catch The Dot included. */
const APP_VIEWS = new Set(APP_ORDER);
/** Every view a route can name (#monitor/<view>). #monitor itself (or anything else) is whatever app is open. */
const VIEWS = new Set(['now', 'note', 'desktop', ...APP_VIEWS]);
/** The home app's visit-log title ("the map"). */
const MAP_TITLE = APPS.readme.log;
/** #monitor/readme/<part>: the home page's parts by name (#monitor/readme alone: see ARRIVAL; inside the monitor, where it is). */
const PART_OF = Object.freeze({ hello: 0, about: 1, map: 2 });
const LAST_PART = SECTIONS.length - 1;
/**
 * v9.2, arriving at the monitor from outside it on the home app with no part
 * named: the page goes on to `part` (part 2) by itself — or back to where the
 * visitor left it this visit, if that is further down (the map) — starting
 * `at` of the way into the camera's dolly (0.45 of 900 ms ≈ 405 ms), so the
 * page glides on as the camera arrives (scroll.js's spring: ~90% of the way
 * by 655 ms, 4 px short as the camera lands at 900, at rest by ≈ 1.07 s).
 */
const ARRIVAL = Object.freeze({ part: 1, at: 0.45 });
/** The page px per CSS px fallback (landscape 0.585, portrait 0.687 CSS px per screen px), if the window can't be measured. */
const CSS_PER_PAGE_PX = Object.freeze({ landscape: 0.585, portrait: 0.687 });

// The live entry, so the monitor sits on exactly the anchor the site measured.
const BASE = BASE_OBJECTS.find((object) => object.id === DISPLAY_ID);
const GROUP_POSITION = BASE?.position ?? L.GROUP_POSITION;
const ANCHOR = { ...L.ANCHOR, ...(BASE?.focus?.anchor ?? {}) };
const FOCUS_CAMERA = BASE?.focus?.camera ?? L.FOCUS_CAMERA;
const HOVER_LIFT = BASE?.hover?.lift ?? L.HOVER_LIFT;
/** The site's focus camera, aimed at the display held up by its hover lift (as src/main.js holds it: liftWhileActive). */
const FOCUS_SHOT = L.focusShot(GROUP_POSITION, FOCUS_CAMERA, HOVER_LIFT);
/** Leaning in to read the sticky (#monitor/now): the note at ~54% of the frame height. */
const NOTE_SHOT = L.noteShot(GROUP_POSITION, HOVER_LIFT, ANCHOR);

// Nudges off Catch The Dot's window (its group's z; the window itself sits at
// PLANE z 0.0024, windows.js). The phone's pulled-back establishing camera is
// ~17.8 units away, where one depth step is ~1.8e-4, so every layer sits
// >= 0.0004 from every surface that writes depth: the window's canvas (0) and
// its counter (the live canvas, 0.0004). trail/ripple/dot are additive and
// never write depth, so they cannot fight one another; renderOrder sets their
// order, after the window's canvas (5), which they light.
const Z = { trail: 0.0008, ripple: 0.0010, dot: 0.0012 };
const ORDER = { trail: 6, ripple: 7, dot: 8 };

let rt = null; // the running module; null if the display never loaded

/** What a view says (ctx.live). The home page: part `part` (default: where it is heading), or the whole page (`all`). */
function liveText(view, caught, { all = false, part = null } = {}) {
    if (view === 'readme') return pageLiveText(part ?? rt?.desk?.pageTargetSection() ?? 0, { variant: rt?.desk?.map.variant ?? 'landscape', all });
    if (view === 'now') return `A yellow sticky note on the monitor, handwritten: "${NOW_TEXT}" Under it, an arrow: "${THREADS.phone.label}".`;
    if (view === 'dot') return `${TITLE}, open in its window: a small glowing red dot drifting across it. ${CAPTION} Caught ${caught}. Press Space to catch the dot. Under the screen hangs a small handwritten note.`;
    if (view === 'desktop') return `The monitor's desktop, every app minimised: a dark wallpaper, the clock, and the dock — ${APP_ORDER.map((app) => APPS[app].dock).join(', ')}. "${APPS.readme.dock}" opens a map of the desk. A yellow sticky note on the bezel: "${NOW_TEXT}" Under the screen hangs a small handwritten note.`;
    if (view === 'note') return `A note hanging under the screen, handwritten: "${THREADS.dot.line}" with an arrow to ${THREADS.dot.label}.`;
    if (view === 'walk') return `A terminal window, ${APPS.walk.title}: ${WALK.command}. A fan of random-walk price paths from one start. ${WALK.caption} (${WALK.standIn}.)`;
    if (view === 'mlx') return `The ${APPS.mlx.title} window. ${MLX.line} Two lanes, ${MLX.illustrative}: ${MLX.lanes.copy.name} copy an array to the GPU before computing and copy it back; ${MLX.lanes.unified.name} share one memory, so compute starts at once and finishes first.${rt?.desk?.mlx.why ? ` Why: ${MLX.why}` : ''} A note on the window, handwritten: "${THREADS.mlx.line}" with an arrow to ${THREADS.mlx.label}.`;
    if (view === 'apple') return `A locked window, with a padlock. ${APPLE.role}. ${APPLE.line} ${APPLE.small}`;
    if (view === 'trash') {
        const ran = rt?.desk?.trash.ms >= 0;
        return `The Trash: one folder, ${TRASH.folder} — ${TRASH.question}${ran ? ` Opened: ${TRASH.running}. The progress bar crawls to a few percent and stalls; the fans are pinned at max. A note beside it, handwritten: "${TRASH_NOTE}"` : ' Press Enter to open it.'}`;
    }
    return `A yellow sticky note on the monitor: "${NOW_TEXT}" On the dark desktop, the ${TITLE} window: a small glowing red dot. ${CAPTION} Caught ${caught}. Press Space to catch the dot. Along the bottom, a dock of apps.`;
}

function loadCaught(ctx) {
    if (ctx.still) return L.STILL_CAUGHT;
    try {
        const value = Number(window.localStorage.getItem(CAUGHT_KEY));
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    } catch {
        return 0;
    }
}

function saveCaught(ctx, value) {
    if (ctx.still) return;
    try { window.localStorage.setItem(CAUGHT_KEY, String(value)); } catch { /* storage blocked: the room forgets */ }
}

function presetId() {
    try { return activePreset()?.id ?? 'day'; } catch { return 'day'; }
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

/** The PLANE frame: an Object3D at the anchor, x right / y up / z out of the glass. */
function buildFrame(ctx, group) {
    const frame = new ctx.THREE.Object3D();
    frame.name = 'monitor:plane';
    frame.position.fromArray(ANCHOR.position);
    frame.rotation.set(...(ANCHOR.rotation ?? [0, 0, 0]));
    group.add(frame);
    return frame;
}

function buildScreen(ctx, frame) {
    const { THREE } = ctx;
    if (Math.abs(ANCHOR.size[0] - L.ANCHOR.size[0]) > 1e-3 || Math.abs(ANCHOR.size[1] - L.ANCHOR.size[1]) > 1e-3) {
        ctx.warn('The display anchor in deskObjects.js changed size; layout.js assumes 1.912 x 1.070. Re-measure.', ANCHOR.size);
    }
    const surface = ctx.makeCanvas(L.SCREEN_W, L.SCREEN_H, { framing: ANCHOR.framing });
    const texture = ctx.canvasTexture(surface.canvas);
    // No words on it any more (v5: they are in the windows), so one paint, one upload.
    drawScreen(surface, ctx);
    texture.needsUpdate = true;
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(...ANCHOR.size),
        // Unlit: the canvas's colours are what the eye gets, through the one
        // ACES curve (screen.js solved them for it). toneMapped: false as on
        // the original site's screens — inert behind the composer.
        new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
    );
    mesh.name = 'monitor:screen';
    frame.add(mesh);
    return mesh;
}

/**
 * The model's own panel: apple_studio_display.glb ships a white quad with
 * emissiveFactor [1, 1, 1] 1 cm behind our canvas. It never showed behind a
 * white canvas; behind a dark one, any angle steep enough to see past the
 * canvas's edge (the box's camera sees the display edge-on) would show a
 * sliver of white. So the panel goes dark too, to the field's edge colour.
 * Materials are cloned per instance at load (attachModel), so this touches
 * only this display. Done before any hover, so DeskScene's hover tint records
 * the dark value as the panel's rest (non-black: "self-lit, leave it be").
 */
function darkenModelPanel(ctx, group) {
    const { THREE } = ctx;
    const edge = new THREE.Color(SCREEN_COLORS.fieldEdge);
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    let count = 0;
    group.updateMatrixWorld(true);
    group.traverse((node) => {
        if (!node.isMesh || node.name.startsWith('monitor:')) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        const lit = materials.filter((m) => m?.emissive && m.emissive.r > 0.9 && m.emissive.g > 0.9 && m.emissive.b > 0.9);
        if (lit.length === 0) return;
        box.setFromObject(node).getSize(size);
        if (size.x < ANCHOR.size[0] * 0.8) return; // not the panel (a status light, a logo)
        for (const m of lit) {
            m.emissive.copy(edge);
            m.emissiveIntensity = 1;
            if (m.color) m.color.setRGB(0, 0, 0);
            m.needsUpdate = true;
        }
        count += 1;
    });
    return count;
}

/** Darkens the model's panel now, or once the models have loaded if mount ran ahead of them (a slow network). */
function darkenModelPanelSoon(ctx, group) {
    if (darkenModelPanel(ctx, group) > 0) return;
    const later = ctx.deskScene.whenReady?.() ?? Promise.resolve();
    ctx.track(Promise.resolve(later).then(() => {
        if (darkenModelPanel(ctx, group) > 0) ctx.invalidate();
        else ctx.warn('Could not find the display model\'s white panel to darken; a sliver may show at steep angles.');
    }).catch(() => {}), 'monitor panel');
}

/** An object group's world bounding box over every mesh it is built from (the monitor's own skipped), or null. */
function boundsOf(THREE, group) {
    if (!group) return null;
    group.updateWorldMatrix(true, true);
    const box = new THREE.Box3();
    const part = new THREE.Box3();
    const visit = (node) => {
        if (node.name?.startsWith('monitor:')) return;
        if (node.isMesh && node.geometry) {
            if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
            part.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld);
            if (!part.isEmpty()) box.union(part);
        }
        for (const child of node.children ?? []) visit(child);
    };
    visit(group);
    return box.isEmpty() ? null : { min: box.min.toArray(), max: box.max.toArray() };
}

/**
 * The map's drawn objects, moved to where the real desk objects are: each
 * object's centre through the 16:10 establishing camera (the shot the drawing
 * was traced from), onto the drawing (map.js measureMapOffsets). Measured at
 * mount, before the monitor's own meshes go on the display and while the
 * other objects are their deskObjects entries (model, parts).
 */
function measureOffsets(ctx) {
    const { THREE } = ctx;
    const camera = makeCamera(ESTABLISHING, 1.6, FOV);
    const v = new THREE.Vector3();
    const project = (x, y, z) => {
        v.set(x, y, z).project(camera);
        return [((v.x + 1) / 2) * 2880, ((1 - v.y) / 2) * 1800];
    };
    return measureMapOffsets((id) => ctx.deskScene.getObjectGroup(id), (group) => boundsOf(THREE, group), project);
}

/**
 * A slow network: the room opened (its budget spent) before a model-only
 * object's model landed — the display itself — so mount measured nothing for
 * it. Once the models are in, measure again and add only the objects that
 * were missing (everything else keeps its mount measurement: by now other
 * modules have hung their own meshes on their objects).
 */
function remeasureOffsetsSoon(ctx) {
    const first = rt.mapOffsets;
    if (!first || !ctx.deskScene.whenReady || Object.keys(first).length === MAP_LABELS.length) return;
    ctx.track(Promise.resolve(ctx.deskScene.whenReady()).then(() => {
        const later = measureOffsets(ctx);
        const added = Object.keys(later).filter((id) => !(id in first));
        if (added.length === 0 || rt.mapOffsets !== first) return;
        rt.mapOffsets = { ...first, ...Object.fromEntries(added.map((id) => [id, later[id]])) };
        rt.desk?.setMapOffsets(rt.mapOffsets);
    }).catch((error) => console.error('[desk:monitor] measuring the desk again for the map failed; it stays as it was.', error)), 'monitor map drawing');
}

/** Additive light on the glass: never writes depth, never tone-mapped separately, never casts. */
function lightMaterial(THREE, options) {
    return new THREE.MeshBasicMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        ...options
    });
}

/** The dot, its trail and its ripples, on `parent` (Catch The Dot's window group; the PLANE frame if the desktop failed). */
function buildDot(ctx, parent) {
    const { THREE } = ctx;
    const r = L.DOT_RADIUS * L.PX;

    // The dot: one quad carrying the light's whole profile (dot.js).
    const dot = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        lightMaterial(THREE, { map: glowTexture(ctx, L.GLOW_EXTENT) })
    );
    dot.material.color.setScalar(DOT_PEAK);
    dot.name = 'monitor:dot';
    dot.renderOrder = ORDER.dot;
    const dotSize = 2 * L.GLOW_EXTENT * r;
    dot.scale.set(dotSize, dotSize, 1);

    // The trail: L.TRAIL.count embers, one instanced draw.
    const T = L.TRAIL;
    const trail = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(1, 1),
        lightMaterial(THREE, { map: emberTexture(ctx, T.extent) }),
        T.count
    );
    trail.name = 'monitor:trail';
    trail.renderOrder = ORDER.trail;
    trail.frustumCulled = false; // its bounds move with the dot; it is always on the screen anyway
    const black = new THREE.Color(0, 0, 0);
    const none = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < T.count; i += 1) {
        trail.setMatrixAt(i, none);
        trail.setColorAt(i, black);
    }
    trail.instanceMatrix.needsUpdate = true;
    trail.instanceColor.needsUpdate = true;

    const ripples = [0, 1, 2].map(() => {
        const mesh = new THREE.Mesh(
            new THREE.RingGeometry(0.86, 1, 64),
            lightMaterial(THREE, { color: 0x000000, opacity: 0 })
        );
        mesh.name = 'monitor:ripple';
        mesh.visible = false;
        mesh.renderOrder = ORDER.ripple;
        parent.add(mesh);
        return { mesh, anim: null, token: 0 };
    });
    parent.add(trail, dot);
    return {
        dot, dotSize, trail, ripples, next: 0,
        // Scratch for placing embers, so a moving trail allocates nothing.
        none, matrix: new THREE.Matrix4(), color: new THREE.Color(), quaternion: new THREE.Quaternion(), position: new THREE.Vector3(), scale: new THREE.Vector3()
    };
}

/**
 * The path the dot came along, for the trail. Under ?still=1 the still frame is
 * "mid-drift", so the path is pre-rolled: a throwaway game run backwards from
 * the still position (its own seed, so the real game's draws are untouched).
 * Live, the same pre-roll is simply there when the dot first sets off.
 */
function buildPath(ctx) {
    const T = L.TRAIL;
    const path = createTrailPath({ count: T.count, spacing: T.spacing, sample: T.sample });
    const back = createDotGame({
        field: gameField(L.DOT_RADIUS),
        radius: L.DOT_RADIUS,
        hitRadius: L.HIT_RADIUS,
        start: { x: L.STILL_DOT.x, y: L.STILL_DOT.y, heading: L.STILL_DOT.heading + Math.PI },
        rng: ctx.rng('monitor:trail-preroll')
    });
    const points = [{ x: back.x, y: back.y }];
    const reach = T.count * T.spacing + T.sample * 2;
    let travelled = 0;
    for (let i = 0; i < 400 && travelled < reach; i += 1) {
        const x0 = back.x;
        const y0 = back.y;
        back.step(0.05, L.REST_SPEED * 4);
        travelled += Math.hypot(back.x - x0, back.y - y0);
        if (Math.hypot(back.x - points[points.length - 1].x, back.y - points[points.length - 1].y) >= T.sample) points.push({ x: back.x, y: back.y });
    }
    path.seed(points);
    return path;
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

/** Whether Catch The Dot's window is up (if the desktop never built, the game is simply on). */
function gameOpen() {
    return !rt.desk || !rt.gameWindow || rt.desk.current === 'dot';
}

/** The home app: "Hello" (v9, the page that ends in the map); Catch The Dot if its window could not be built. */
function homeApp() {
    return rt?.mapWindow ? 'readme' : 'dot';
}

function targetSpeed(now) {
    const { ctx } = rt;
    if (!gameOpen()) return 0; // minimised: fully paused
    if (ctx.still || ctx.reducedMotion) return 0;
    if (rt.view === 'dot') return now - rt.lastInteraction < L.PLAY_IDLE_MS ? L.PLAY_SPEED : 0;
    // Reading the "now" note: the game waits, and costs nothing.
    if (rt.view === 'now') return 0;
    return rt.hasPointer || now < rt.wakeUntil ? L.REST_SPEED : 0;
}

/** How much of the trail shows: all of it mid-drift, fading as the dot glides to a stop, going with a hop. */
function trailPresence() {
    const game = rt.game;
    if (!game) return 0;
    if (game.hopping) return rt.hopTrail;
    if (rt.ctx.still) return 1;
    return Math.min(1, game.speed / L.REST_SPEED);
}

/** The slow breath, only on frames the drift already draws. */
function breath() {
    const { ctx } = rt;
    if (ctx.still || ctx.reducedMotion) return 1;
    return 1 + L.BREATH.amplitude * Math.sin((2 * Math.PI * performance.now()) / L.BREATH.periodMs);
}

/** SCREEN px -> the dot's parent's x/y (Catch The Dot's window group, centred on the window). */
function toLocal(x, y) {
    const [px, py] = L.toPlane(x, y);
    return [px - rt.origin[0], py - rt.origin[1]];
}

function placeTrail() {
    const pieces = rt.pieces;
    if (!pieces?.trail || !rt.path || !rt.game) return;
    const T = L.TRAIL;
    const presence = trailPresence();
    const embers = presence > 0.001 ? rt.path.embers(rt.game.x, rt.game.y) : null;
    const baseSize = 2 * T.extent * T.width * L.DOT_RADIUS * L.PX;
    for (let i = 0; i < T.count; i += 1) {
        const ember = embers?.[i];
        if (!ember?.on) {
            pieces.trail.setMatrixAt(i, pieces.none);
            pieces.trail.setColorAt(i, pieces.color.setScalar(0));
            continue;
        }
        const [x, y] = toLocal(ember.x, ember.y);
        const size = baseSize * (1 - T.narrowing * ember.t);
        pieces.position.set(x, y, Z.trail);
        pieces.scale.set(size, size, 1);
        pieces.matrix.compose(pieces.position, pieces.quaternion, pieces.scale);
        pieces.trail.setMatrixAt(i, pieces.matrix);
        pieces.trail.setColorAt(i, pieces.color.setScalar(T.amplitude * presence * Math.pow(1 - ember.t, T.falloff)));
    }
    pieces.trail.instanceMatrix.needsUpdate = true;
    pieces.trail.instanceColor.needsUpdate = true;
}

/** Puts the dot and its trail where the game says, `height` 0..1 being how far into a hop's arc it is. */
function placeDot(height = 0) {
    const pieces = rt.pieces;
    if (!pieces || !rt.game) return;
    const [x, y] = toLocal(rt.game.x, rt.game.y);
    pieces.dot.position.set(x, y, Z.dot);
    const size = pieces.dotSize * (1 + 0.16 * height);
    pieces.dot.scale.set(size, size, 1);
    // A little brighter in the air, and breathing while it drifts.
    pieces.dot.material.color.setScalar(DOT_PEAK * (1 + 0.25 * height) * breath());
    placeTrail();
}

/** Advances the drift to `now` (shared clock, so the timer and the tick never double-count). */
function advance(now) {
    if (!rt.game) return false;
    const dt = Math.min(0.1, Math.max(0, (now - rt.lastStep) / 1000));
    rt.lastStep = now;
    const wasMoving = rt.game.speed > 0;
    const moved = rt.game.step(dt, targetSpeed(now));
    if (moved) {
        rt.path?.record(rt.game.x, rt.game.y);
        placeDot(0);
        return true;
    }
    if (wasMoving && rt.game.speed === 0 && !rt.game.hopping) {
        placeDot(0); // the trail's last fade, on the frame the dot comes to rest
        return true;
    }
    return false;
}

function ripple(ctx, at, kind) {
    const pieces = rt.pieces;
    if (!pieces) return;
    const ring = pieces.ripples[pieces.next % pieces.ripples.length];
    pieces.next += 1;
    ring.anim?.cancel();
    const token = (ring.token += 1);
    const caught = kind === 'catch';
    const [x, y] = toLocal(at.x, at.y);
    const r0 = (caught ? L.DOT_RADIUS : 6) * L.PX;
    const r1 = (caught ? L.DOT_RADIUS * 2.3 : MISS_RIPPLE) * L.PX;
    // Light, like the dot: a ring of its red when caught, a faint warm grey where a click missed.
    // (Linear light added to the glass: the caught ring is the dot's body red, ≈ 200 50 47 on screen at its start.)
    if (caught) ring.mesh.material.color.setRGB(0.46, 0.012, 0.004);
    else ring.mesh.material.color.setRGB(0.07, 0.062, 0.055);
    ring.mesh.position.set(x, y, Z.ripple);
    ring.mesh.visible = true;
    ring.anim = ctx.motion.animate({
        from: 0,
        to: 1,
        preset: 'reveal',
        movesGeometry: false,
        onUpdate: (eased) => {
            const r = r0 + (r1 - r0) * eased;
            ring.mesh.scale.set(r, r, 1);
            ring.mesh.material.opacity = 1 - eased;
        }
    });
    ring.anim.then(() => {
        if (ring.token !== token) return; // a newer ripple owns this ring now
        ring.mesh.visible = false;
        ctx.invalidate();
    });
}

/** A miss ring's outer radius (screen px); its centre is kept this far inside the window's field. */
const MISS_RIPPLE = 28;

function missAt(ctx, x, y) {
    const r = gameRect();
    ripple(ctx, {
        x: Math.min(r.x1 - MISS_RIPPLE, Math.max(r.x0 + MISS_RIPPLE, x)),
        y: Math.min(r.y1 - MISS_RIPPLE, Math.max(r.y0 + MISS_RIPPLE, y))
    }, 'miss');
}

function catchDot(ctx) {
    const game = rt?.game;
    if (!game || game.hopping || !gameOpen()) return false;
    const from = { x: game.x, y: game.y };
    const to = game.pickHopTarget();
    const trailAtHop = trailPresence();
    rt.caught += 1;
    saveCaught(ctx, rt.caught);
    rt.desk?.setCaught(rt.caught);
    ctx.visit.log(GAME_TITLE);
    ctx.live(`Caught. ${rt.caught} so far.`);
    ripple(ctx, from, 'catch');
    game.beginHop(to);
    rt.hopTrail = trailAtHop;
    const hop = ctx.motion.animate({
        from: 0,
        to: 1,
        preset: 'slide',
        movesGeometry: false,
        onUpdate: (eased) => {
            rt.hopTrail = trailAtHop * (1 - eased); // the old trail goes out as it leaves
            placeDot(game.setHopProgress(eased));
        }
    });
    rt.hop = hop;
    hop.then(() => {
        if (rt.hop !== hop) return;
        rt.hop = null;
        game.endHop();
        rt.path?.reset(game.x, game.y); // a fresh trail from where it landed
        placeDot(0);
        rt.lastInteraction = performance.now();
        rt.lastStep = rt.lastInteraction;
        ctx.invalidate();
    });
    return true;
}

/**
 * Catch The Dot minimised: fully paused. A hop in the air lands where it was
 * going, the ripples go, the dot and its trail are hidden (before the window
 * starts into the dock), the drift stops dead and the at-rest timer stops.
 */
function pauseGame(ctx) {
    const game = rt.game;
    if (rt.hop) {
        const hop = rt.hop;
        rt.hop = null;
        hop.cancel();
        game?.endHop();
        if (game) rt.path?.reset(game.x, game.y);
    }
    if (game) game.state.speed = 0;
    for (const ring of rt.pieces?.ripples ?? []) {
        ring.token += 1;
        ring.anim?.cancel();
        ring.mesh.visible = false;
    }
    if (rt.pieces) {
        rt.pieces.dot.visible = false;
        rt.pieces.trail.visible = false;
    }
    syncRest(ctx);
    ctx.invalidate();
}

/** Catch The Dot back up: the dot shows again (it rides the window out of the dock) and picks up where it was. */
function resumeGame(ctx) {
    if (rt.pieces) {
        rt.pieces.dot.visible = true;
        rt.pieces.trail.visible = true;
    }
    const t = performance.now();
    rt.lastInteraction = t;
    rt.lastStep = t;
    rt.wakeUntil = t + L.AWAKE_MS;
    placeDot(0);
    syncRest(ctx);
    wake(ctx);
}

/**
 * Where Catch The Dot's slow drift is stepped by the at-rest timer (≤ 12 fps)
 * rather than by held frames: at the desk, and leaning in to the note under
 * the screen (#monitor/note), where the pointer can sit in the room for ever
 * and the drift must not hold the frame loop at 60 fps while it does.
 */
function restDrift(view) {
    return view === null || view === 'note';
}

/**
 * The at-rest drift's timer (≤ 12 fps, one frame per step, only while the
 * dot is actually moving) exists only while it can matter: at the desk or
 * under the note, with Catch The Dot up. Walk away with another app open (or
 * none) and there is no timer at all.
 */
function syncRest(ctx) {
    const want = restDrift(rt.view) && gameOpen() && Boolean(rt.game);
    if (want && !rt.restStop) {
        rt.restStop = ctx.every(L.REST_FRAME_MS, () => {
            if (!restDrift(rt.view)) return;
            if (advance(performance.now())) ctx.invalidate();
        });
    } else if (!want && rt.restStop) {
        rt.restStop();
        rt.restStop = null;
    }
}

/**
 * Puts `app` up (or none: the bare desktop): the open one minimises into its
 * icon, `app` opens from its own. Pauses / resumes Catch The Dot as it goes
 * down or comes up. Resolves when `app`'s window is out.
 */
function showApp(ctx, app, { instant }) {
    const desk = rt.desk;
    if (!desk) return Promise.resolve(app === 'dot');
    if (!rt.gameWindow) return desk.switchTo(app === 'dot' ? null : app, { instant }); // the game is on the bare screen
    const wasGame = desk.current === 'dot';
    if (wasGame && app !== 'dot') pauseGame(ctx);
    const opening = desk.switchTo(app, { instant });
    if (!wasGame && app === 'dot') resumeGame(ctx);
    return opening;
}

function flutter(ctx) {
    if (!rt.sticky) return;
    rt.flutter?.cancel();
    const flap = ctx.motion.animate({
        from: 0,
        to: 1,
        preset: 'reveal',
        movesGeometry: false,
        onUpdate: (eased) => rt.sticky.setCurl(1 + 0.9 * Math.sin(2 * Math.PI * eased) * (1 - eased))
    });
    rt.flutter = flap;
    flap.then(() => {
        if (rt.flutter === flap) rt.sticky?.setCurl(1);
    });
}

/**
 * What's under `ndc` on the monitor, frontmost first:
 *   { kind: 'sticky', thread } (the "now" note; thread: on its "→ the phone" row)
 *   { kind: 'note', note }     (a note on the glass: 'dot' | 'mlx' | 'trash')
 *   { kind: 'dock', app }      { kind: 'window', app, x, y } (window px; Catch The Dot's is app 'dot')
 *   { kind: 'screen', x, y }   (the bare wallpaper, screen px)  | null
 */
function hitAt(ctx, ndc) {
    const desk = rt.desk;
    const targets = [rt.sticky?.front, rt.screen, ...(desk ? desk.targets() : [])].filter(Boolean);
    if (targets.length === 0) return null;
    for (const hit of ctx.raycast(ndc, targets, false)) {
        if (hit.object === rt.sticky?.front) {
            const y = hit.uv ? (1 - hit.uv.y) * L.STICKY_MM : 0;
            return { kind: 'sticky', thread: y >= NOW_THREAD.y - 2 };
        }
        if (hit.object === rt.screen) {
            if (!hit.uv) return null;
            return { kind: 'screen', x: hit.uv.x * L.SCREEN_W, y: (1 - hit.uv.y) * L.SCREEN_H };
        }
        const meaning = desk?.hitOf(hit);
        if (meaning) return meaning;
    }
    return null;
}

function isAppView(view) {
    return APP_VIEWS.has(view);
}

/** The app a view puts up (null for the bare desktop); undefined = leaves it as it is (the lean-ins). */
function appOfView(view) {
    if (isAppView(view)) return view;
    if (view === 'desktop') return null;
    return undefined;
}

/** The view that shows what is open now: its app's, or the bare desktop's ('dot' if the desktop never built: the game is simply on). */
function openView() {
    if (!rt?.desk) return 'dot';
    return rt.desk.current ?? 'desktop';
}

/** The route that shows `app` (null: the bare desktop). */
function appHash(app) {
    return app ? `#monitor/${app}` : '#monitor/desktop';
}

/** "Back to whichever app is open" (from the lean-ins). */
function backHash() {
    return rt.desk ? appHash(rt.desk.current) : '#monitor';
}

/** The map's label `index` (or its leader, or its drawn object): follow it (its route). */
function followLabel(ctx, index) {
    const part = MAP_LABELS[index];
    if (part) ctx.navigate(part.to);
}

/** ↑ ↓ on the map: light the next label in reading order (from none: the first; it stops at the ends), and say it. */
function stepMap(ctx, direction) {
    const desk = rt.desk;
    const order = MAP_ORDER[desk.map.variant] ?? MAP_ORDER.landscape;
    const n = order.length;
    const at = order.indexOf(desk.map.highlight);
    const next = order[at < 0 ? 0 : Math.max(0, Math.min(n - 1, at + direction))];
    desk.setMapHighlight(next, 'key');
    const part = MAP_LABELS[next];
    ctx.live(`${part.name}, ${desk.map.variant === 'portrait' ? part.short : part.what}. Press Enter to go there.`);
}

/** Opens a link the way the receipt's "Email" does: a real anchor, clicked (mailto: opens the mail app; the page stays). */
function openLink(href) {
    if (typeof document === 'undefined' || !href) return false;
    const a = document.createElement('a');
    a.href = href;
    if (!href.startsWith('mailto:')) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    a.click();
    return true;
}

/** What the home page does with a click: scroll to a part ("Click me!", the cues), follow a label, or a link (the photo box, the email, "Before you go"). */
function actOnMap(ctx, hit) {
    if (!hit) return false;
    if (hit.kind === 'scroll') {
        visitorScroll(ctx, () => rt.desk.scrollPage(hit.to));
        activity(ctx);
        return true;
    }
    cancelArrival(); // the visitor's own click wins over an arrival still waiting (v9.2)
    if (hit.kind === 'item') followLabel(ctx, hit.index);
    else if (hit.kind === 'link' && hit.to) ctx.navigate(hit.to);
    else if (hit.kind === 'link' && hit.href) openLink(hit.href);
    return true;
}

/** A hit on Catch The Dot's window, in SCREEN px (the game's space). */
function gamePoint(hit) {
    return { x: WINDOWS.dot.x + hit.x, y: WINDOWS.dot.y + hit.y };
}

function updateCursor(ctx, ndc) {
    const hit = hitAt(ctx, ndc);
    const desk = rt.desk;
    const view = rt.view;
    const leaning = view === 'now' || view === 'note';
    desk?.setHover(hit?.kind === 'dock' ? hit.app : null);
    // The map: the label (or its leader, or its drawn object) under the pointer is lit, all three.
    const mapHit = !leaning && hit?.kind === 'window' && hit.app === 'readme' ? desk.mapHitAt(hit.x, hit.y) : null;
    desk?.setMapHighlight?.(mapHit?.kind === 'item' ? mapHit.index : null, 'pointer');
    // Part 1: "Click me!" goes red with it, or the photo ("me"), under the pointer — up close only.
    desk?.setClickMeHot?.(view === 'readme' && mapHit?.kind === 'scroll' && (mapHit.id === 'clickme' || mapHit.id === 'photo'));
    let cursor = null;
    if (hit?.kind === 'dock' && hit.app) cursor = hit.app === desk?.current && appOfView(view) === hit.app ? null : 'pointer';
    else if (hit?.kind === 'sticky') cursor = view === 'now' ? (hit.thread ? 'pointer' : null) : 'zoom-in';
    else if (hit?.kind === 'note' && hit.note === 'dot') cursor = view === 'note' ? 'pointer' : 'zoom-in';
    else if (hit?.kind === 'note' && hit.note === 'mlx') cursor = 'pointer';
    else if (leaning && (hit?.kind === 'window' || hit?.kind === 'screen')) cursor = 'zoom-out';
    else if (hit?.kind === 'window') {
        const part = desk.partAt(hit.app, hit.x, hit.y);
        if (hit.app === 'dot') {
            const p = gamePoint(hit);
            cursor = part === 'close' || (part === 'field' && rt.game?.hitTest(p.x, p.y)) ? 'pointer' : null;
        } else if (hit.app === 'readme') {
            cursor = part ? 'pointer' : null;
        } else {
            cursor = part && !(hit.app === 'trash' && desk.trash.ms >= 0 && part === 'row') ? 'pointer' : null;
        }
    }
    ctx.setCursor(cursor);
}

/**
 * A stopped dot is advanced only by frames, and nothing asks for frames while
 * it is stopped — so whatever starts it again asks for one. (advance() clamps
 * the step to 0.1 s, so a long sleep never turns into a jump.)
 */
function wake(ctx) {
    if (rt.game && rt.game.speed === 0 && gameOpen()) ctx.invalidate();
}

/** ← → through the dock, in time order, from the open app (from the bare desktop: the first, or the last). */
function stepApp(ctx, direction) {
    const current = rt.desk?.current ?? null;
    const i = current ? APP_ORDER.indexOf(current) : direction > 0 ? -1 : APP_ORDER.length;
    const next = APP_ORDER[(i + direction + APP_ORDER.length) % APP_ORDER.length];
    ctx.navigate(appHash(next));
}

/** The app's own verb: run it, open the folder, try the lock; a close dot minimises it. */
function actOn(ctx, app, part) {
    const desk = rt.desk;
    // The map is the home app: closing another brings it back; closing it leaves the bare desktop.
    if (part === 'close') return ctx.navigate(app === homeApp() ? '#monitor/desktop' : appHash(homeApp()));
    if (app === 'walk' && part === 'run') return desk.runWalk();
    if (app === 'mlx' && part === 'run') return desk.runMlx();
    if (app === 'mlx' && part === 'why') {
        desk.toggleWhy();
        ctx.live(liveText('mlx', rt.caught));
        return null;
    }
    if (app === 'trash' && part === 'row' && desk.trash.ms < 0) {
        ctx.hint(HINT.trashRan);
        const run = desk.runTrash();
        run.then?.(() => { if (rt.view === 'trash') ctx.live(liveText('trash', rt.caught)); });
        return run;
    }
    if (app === 'apple' && part === 'lock') return desk.shakeApple();
    return null;
}

/**
 * The home page's keys, up close: ↓ PageDown Space the next part, ↑ PageUp
 * Shift+Space the one before, Home End the first and last; on the map (part
 * 3, at rest) ↑ ↓ light its labels in reading order instead — ↑ from the first
 * (or none) goes back up the page — and Enter follows the lit one (elsewhere,
 * Enter is "Click me!": on to the next part). null: not a page key.
 */
function pageKey(ctx, event) {
    const desk = rt.desk;
    const k = event.key;
    const part = desk.pageTargetSection();
    const to = (i) => {
        visitorScroll(ctx, () => desk.scrollPage(Math.max(0, Math.min(LAST_PART, i))));
        activity(ctx);
        return true;
    };
    if (k === 'Home') return to(0);
    if (k === 'End') return to(LAST_PART);
    if (k === 'PageDown' || (k === ' ' && !event.shiftKey)) return to(part + 1);
    if (k === 'PageUp' || (k === ' ' && event.shiftKey)) return to(part - 1);
    if (k === 'ArrowDown' || k === 'ArrowUp') {
        const down = k === 'ArrowDown';
        if (part === LAST_PART && desk.pageAtRest()) {
            const order = MAP_ORDER[desk.map.variant] ?? MAP_ORDER.landscape;
            if (down || order.indexOf(desk.map.highlight) > 0) {
                stepMap(ctx, down ? 1 : -1);
                return true;
            }
            desk.setMapHighlight(null, 'key');
        }
        return to(part + (down ? 1 : -1));
    }
    if (k === 'Enter') {
        if (event.repeat) return true;
        const lit = desk.map.highlight;
        if (part === LAST_PART && lit !== null) followLabel(ctx, lit);
        else if (part < LAST_PART) to(part + 1);
        return true;
    }
    return null;
}

/** The hint for a view; the home page's for part `part` (default: where it is heading). */
function hintFor(view, part = null) {
    if (view === 'trash' && rt?.desk?.trash.ms >= 0) return HINT.trashRan;
    if (view === 'readme') return HINT.readme[part ?? rt?.desk?.pageTargetSection() ?? 0] ?? HINT.readme[0];
    return HINT[view] ?? HINT.desktop;
}

// ---------------------------------------------------------------------------
// The home page (v9): its animation, its scroll's input
// ---------------------------------------------------------------------------

/**
 * Whether the hello part's animation should run now: part 1 on the screen at
 * rest (the home app up, the page at its top), seen from the room or up close,
 * someone moving the pointer in the last HELLO.idleMs, and motion allowed.
 */
function helloWanted(ctx, now) {
    const desk = rt?.desk;
    if (!desk || ctx.still || ctx.reducedMotion) return false;
    if (desk.current !== 'readme' || !desk.pageShown?.() || !desk.pageAtRest() || desk.pageY() !== 0) return false;
    const here = rt.view === 'readme' || (rt.view === null && ctx.route()?.moduleId === null);
    return here && now - rt.helloActiveAt < HELLO.idleMs;
}

/**
 * The animation's timer (≤ 12 fps, ctx.every, which skips hidden tabs and
 * never runs in still mode) exists only while it is wanted, and asks for a
 * frame only on the steps where the underline moves. Each start begins its
 * cycle at the hold (the underline drawn, as at rest), so waking never jumps;
 * stopping it leaves the underline drawn (one frame, if it wasn't).
 */
function syncHello(ctx) {
    if (!rt) return;
    const want = helloWanted(ctx, performance.now());
    if (want && !rt.helloStop) {
        rt.helloT0 = performance.now();
        rt.helloStop = ctx.every(HELLO.frameMs, () => {
            const t = performance.now();
            if (!helloWanted(ctx, t)) {
                syncHello(ctx);
                return;
            }
            if (rt.desk.helloFrame(t - rt.helloT0)) ctx.invalidate();
        });
    } else if (!want && rt.helloStop) {
        rt.helloStop();
        rt.helloStop = null;
        rt.desk?.helloRest();
        ctx.invalidate();
    }
}

/** Someone is here (the pointer moved, a wheel, a finger, a key): the animation may run again. */
function activity(ctx) {
    if (!rt) return;
    rt.helloActiveAt = performance.now();
    syncHello(ctx);
}

// ---------------------------------------------------------------------------
// The home page (v9.2): going on to part 2 by itself on arriving
// ---------------------------------------------------------------------------

/** Calls off an arrival still waiting to scroll (go, leave, the visitor's own input). Returns whether one was. */
function cancelArrival() {
    const pending = rt?.arrival;
    if (!pending) return false;
    rt.arrival = null;
    pending.cancel();
    return true;
}

/**
 * The visitor scrolls the page themselves (`scroll`: a key, a click on a page
 * target): their input wins over an arrival still waiting, which is called
 * off. If it then leaves the page where it was (Home at the top while it
 * waited), nothing will settle to say so — and the hint and the words had
 * already gone on to the arrival's part — so they are put right here.
 */
function visitorScroll(ctx, scroll) {
    const yielded = cancelArrival();
    scroll();
    if (yielded && rt.desk.pageAtRest()) onPageSettle(ctx, rt.desk.pageSection());
}

/**
 * Arriving on the home app from outside the monitor (go(), ARRIVAL): on to
 * part `part` — at once if `quick` (still, reduced motion, instant: one frame,
 * the same on every load), or if the page is still on its way up from leaving
 * (back within ~0.6 s: it turns round now rather than reaching the top and
 * setting off down again); else ARRIVAL.at into the dolly. The wait is a
 * ctx.motion animation that moves nothing — tracked and counted, so
 * __desk.settled() waits through it, and on the film clock under ?film=1 —
 * whose last frame starts the scroll, so the scroll's own tracking ('monitor
 * page scroll') begins before the wait's ends: no gap for settled() to slip
 * through between the click and the page at rest.
 */
function arrive(ctx, part, { quick = false } = {}) {
    const desk = rt.desk;
    cancelArrival();
    const wait = Math.round(ctx.motion.durations.camera * ARRIVAL.at);
    if (quick || !(wait > 0) || desk.pageY() > 0) {
        desk.scrollPage(part, { instant: quick });
        return;
    }
    const pending = ctx.motion.animate({
        from: 0,
        to: 1,
        duration: wait,
        easing: (t) => t,
        movesGeometry: false,
        instant: false,
        onUpdate: (_k, t) => {
            if (t < 1 || rt?.arrival !== pending) return;
            rt.arrival = null;
            desk.scrollPage(part);
            syncHello(ctx); // part 1 is leaving: the underline's timer stops now, not a step later
        }
    });
    rt.arrival = pending;
}

/** CSS px per page px on the screen right now (the home page's body as the camera sees it). */
function cssPerPagePx(ctx) {
    const desk = rt.desk;
    const fallback = CSS_PER_PAGE_PX[desk.map.variant] ?? CSS_PER_PAGE_PX.landscape;
    try {
        const page = desk.windows.readme?.page;
        const r = page ? ctx.screenRect(page.mesh) : null;
        const k = r ? r.height / page.P.viewH : NaN;
        return Number.isFinite(k) && k > 0.02 ? k : fallback;
    } catch {
        return fallback;
    }
}

/** The home page is up close and can take a scroll. */
function pageScrollable() {
    return Boolean(rt?.desk && rt.view === 'readme' && rt.desk.current === 'readme' && rt.desk.pageLayout());
}

/**
 * The wheel (or a trackpad) over the screen, up close on the home page: scroll
 * it, and keep the page itself still. Only a wheel that moves the page is the
 * visitor's own scroll, and wins over an arrival still waiting (v9.2). One
 * with no up or down in it (a sideways two-finger swipe, a tilt wheel,
 * Shift+wheel: deltaX alone) moves nothing, so the arrival goes on. Called
 * off for that, nothing would settle to put the hint, the words and part 1's
 * cue right.
 */
function onWheel(ctx, event) {
    if (!pageScrollable() || event.ctrlKey) return; // ctrl: a pinch, the browser's zoom
    const hit = hitAt(ctx, ctx.pointer.ndcForEvent(event));
    if (!hit) return; // off the screen (the bezel, the room): not ours
    event.preventDefault();
    let dy = event.deltaY;
    if (event.deltaMode === 1) dy *= 16;
    else if (event.deltaMode === 2) dy *= (typeof window !== 'undefined' ? window.innerHeight : 800) * 0.9;
    const t = performance.now();
    if (!rt.wheelScale || t - rt.wheelAt > 300) rt.wheelScale = cssPerPagePx(ctx);
    rt.wheelAt = t;
    if (rt.desk.wheelPage(dy / rt.wheelScale)) cancelArrival(); // it scrolled: the visitor's input wins (v9.2)
    activity(ctx);
}

const TOUCH_SLOP = 8; // CSS px before a touch is a drag (a tap stays a click)

function onTouchStart(ctx, event) {
    if (!rt) return;
    rt.touch = null;
    if (!pageScrollable() || event.touches?.length !== 1) return;
    const t = event.touches[0];
    const hit = hitAt(ctx, ctx.pointer.ndcForEvent(t));
    if (hit?.kind !== 'window' || hit.app !== 'readme') return;
    rt.touch = { id: t.identifier, x0: t.clientX, y0: t.clientY, dragging: false, from: 0, k: 1, samples: [] };
    activity(ctx);
}

function onTouchMove(ctx, event) {
    const T = rt?.touch;
    if (!T) return;
    const t = [...(event.touches ?? [])].find((x) => x.identifier === T.id);
    if (!t) return;
    if (!T.dragging) {
        const dy = t.clientY - T.y0;
        if (Math.abs(dy) < TOUCH_SLOP || Math.abs(dy) < Math.abs(t.clientX - T.x0)) return;
        T.dragging = true;
        cancelArrival(); // a finger's drag wins over an arrival still waiting (v9.2); a tap does not
        T.k = cssPerPagePx(ctx);
        T.from = rt.desk.dragPage.start();
        T.y0 = t.clientY;
    }
    event.preventDefault();
    const now = performance.now();
    T.samples.push({ t: now, y: t.clientY });
    while (T.samples.length > 2 && now - T.samples[0].t > 100) T.samples.shift();
    rt.desk.dragPage.to(T.from - (t.clientY - T.y0) / T.k);
}

function onTouchEnd() {
    if (!rt) return;
    const T = rt.touch;
    rt.touch = null;
    if (!T?.dragging) return;
    const a = T.samples[0];
    const b = T.samples[T.samples.length - 1];
    const now = performance.now();
    // The finger's speed over its last ~100 ms (0 if it stopped before letting go).
    const v = a && b && b.t > a.t && now - b.t < 80 ? (-(b.y - a.y) / (b.t - a.t)) * 1000 / T.k : 0;
    rt.desk.dragPage.end(v);
    rt.suppressClickUntil = now + 450; // the click a drag's end can still send
}

/** The home page came to rest on part `i`: its hint, its words, the hover where the pointer is, the animation. */
function onPageSettle(ctx, i) {
    if (!rt) return;
    if (rt.view === 'readme') {
        // Part 1's "scroll ↓" stays off while an arrival takes the page on (v9.2: fading in, it would
        // be seen sliding away up the window); it comes on now — unseen if part 1 is out of sight,
        // faded in if the page is back at part 1.
        const q = rt.desk.map;
        if (q.cue < 1 && !q.fade) rt.desk.setPageCue(1, { instant: i > 0 });
        ctx.hint(HINT.readme[i] ?? HINT.readme[0]);
        if (rt.spokenPart !== i) {
            rt.spokenPart = i;
            ctx.live(pageLiveText(i, { variant: rt.desk.map.variant }));
        }
        if (i !== LAST_PART) rt.desk.setMapHighlight(null, 'key');
        if (rt.lastNdc) updateCursor(ctx, rt.lastNdc);
    }
    syncHello(ctx);
}

/** The shot for a view, at the live aspect. */
function shotFor(ctx, view) {
    const cam = ctx.camera.object;
    const aspect = cam?.aspect ?? 1.6;
    const fov = cam?.fov ?? 45;
    const at = { aspect, fov, groupPosition: GROUP_POSITION, lift: HOVER_LIFT, anchor: ANCHOR };
    if (view === 'now') return aspect < 1 ? L.noteShot(GROUP_POSITION, HOVER_LIFT, ANCHOR, fov, aspect) : NOTE_SHOT;
    // The map and Catch The Dot (the hero windows) and the bare desktop:
    // the desktop's own shot on landscape screens; on portrait ones, the
    // window (with the dock) or the whole screen, width-fitted — the site's
    // focus shot is 2.5 frame-widths of screen there, and cut the window.
    if (view === 'readme' || view === 'dot') return aspect >= 1 ? FOCUS_SHOT : appShot(view, at);
    if (view === 'desktop') return aspect >= 1 ? FOCUS_SHOT : appShot('screen', at);
    if (view === 'note') return appShot('note', at);
    if (isAppView(view)) return appShot(view, at);
    return FOCUS_SHOT;
}

// ---------------------------------------------------------------------------
// The module
// ---------------------------------------------------------------------------

export default {
    id: 'monitor',
    objectIds: [DISPLAY_ID],
    deskObjects: [],
    // v6: the monitor's hover label in the room names what's on its screen first (v8, v9: the home app's dock name, "start here").
    overrides: { [DISPLAY_ID]: { label: APPS.readme.dock } },
    // Held up while focused (src/main.js: DeskScene.holdLift), as the original
    // site held a focused object; the shot above is aimed at the raised position.
    liftWhileActive: true,
    states: [
        { hash: '#monitor', note: 'the desktop face-on, showing whatever app is open — on a fresh load the home app, "Hello" (title bar), gone on by itself to its second part (v9.2: arriving at the monitor, the page glides on to part 2 as the camera arrives): one cream page, Shae\'s three short paragraphs in a dark serif, left-aligned in a column centred on the window — "This is my personal website. While I’ve included the usual stuff like work experience, I wanted to give it an extra spark." / "This website is a model of my real desk. … I encourage you to click around and be curious!" / "I’ve provided a map on the next page." — and under them, small and centred at the foot, "scroll" with a drawn ↓; around it the menu-bar clock, the dock (start here — a tiny drawn desk with the red dot — a thin separator, then walk.py · Catch The Dot · MLX · Apple · Trash; start here\'s light the brightest), the "now" sticky, the note hanging under the screen (on portrait: the window alone, the same words in a narrower column)' },
        { hash: '#monitor/readme', note: 'the home app (its dock icon "start here"\'s route), arriving from outside the monitor as on a fresh load: gone on to its second part, as #monitor (afterwards on to the map instead, if the visitor left it there this visit)' },
        { hash: '#monitor/readme/hello', note: 'the home page\'s first part up close — what the room sees on the screen, nearer: one cream page, Shae\'s photo (smiling, a takeaway coffee in hand, flowers behind) on the left, and on the right "Click me!" in large dark serif type with a red marker underline under it (no button, no dot); under them, small and centred, "scroll" with a drawn ↓; nothing else; the dock, the clock, the "now" sticky, the hanging note (on portrait: the window alone, the photo above "Click me!")' },
        { hash: '#monitor/readme/about', note: 'the home page\'s second part, Shae\'s own words (v9.2): three short paragraphs in the page\'s serif, left-aligned in a column centred on the window, a little above the middle — "This is my personal website. While I’ve included the usual stuff like work experience, I wanted to give it an extra spark." / "This website is a model of my real desk. Most items on the desk are clickable and represent real aspects of my working life. You might find hardware projects, sticky notes, news articles or apps. They all can be interacted with in unique ways. I encourage you to click around and be curious!" / "I’ve provided a map on the next page." — and at the foot, small and centred, "scroll" with a drawn ↓ (on portrait the same words in a narrower column)' },
        { hash: '#monitor/readme/map', note: 'the home page scrolled to its third part: "A MAP OF MY DESK", the line drawing of the desk with a red "You are here" on the drawn screen and six labels, each just its name, with curved leaders (left "My day job", "Hardware I\'ve built", "Say hello"; right "What I\'m up to", "My working life", "My research"), and under it the wide "SHORT ON TIME?" card: My work history — the photo box →, Email me — shaeantoine@gmail.com, LinkedIn, GitHub — Before you go → (on portrait: three labels above the drawing, three below, the card stacked)' },
        { hash: '#monitor/now', note: 'leaning in to read the sticky: "now: could AI help me rely on my phone less?" and under it a drawn arrow, "the phone"' },
        { hash: '#monitor/dot', note: 'Catch The Dot open (the home app minimised into its icon), the desktop\'s own shot on landscape (on portrait its window and the dock width-fitted): the dot mid-drift with its faint trail on the window\'s darker field, the line bottom-left and "caught 3" bottom-right inside it, Catch The Dot lit brightest in the dock; playable inside the window' },
        { hash: '#monitor/desktop', note: 'the bare desktop, every app minimised: the dark wallpaper with nothing on it, the menu-bar clock, the dock with start here\'s light (none brighter: nothing is open), the "now" sticky, the note hanging under the screen' },
        { hash: '#monitor/note', note: 'leaning in to the lower left: the note hanging under the screen, "Nobody asked for that one either." → the intern project; the lower part of the home app\'s window and the dock\'s left half above it' },
        { hash: '#monitor/walk', note: 'walk.py — 2019, a terminal window scaled out of the dock (the home app minimised into its icon, as for every app below): "$ python walk.py", a finished fan of 40 random-walk price paths from one red start point, the caption, and "a random walk, standing in for the original script"' },
        { hash: '#monitor/mlx', note: 'the MLX window (the home app minimised): the line, two finished lanes (most frameworks: copy to GPU · compute · copy back, done last; MLX on Apple silicon: one shared memory, compute, done first), "illustrative", a "why" toggle, and a sticky on its right edge: the thread to the breadboard' },
        { hash: '#monitor/apple', note: 'a locked window (the home app minimised): frosted shapes behind, a padlock, "Software Engineer, Apple · 2025 –", "I can\'t show you this one.", and the small line under it' },
        { hash: '#monitor/trash', note: 'the Trash (the home app minimised): "self-improvement/" with its question, opened and stalled — "running locally · no cloud", progress at 3%, the fans pinned at max, and Shae\'s note beside the window' }
    ],

    async mount(ctx) {
        const group = ctx.deskScene.getObjectGroup(DISPLAY_ID);
        if (!group) {
            ctx.warn('The studio display is not on the desk; the monitor has nothing to show.');
            return;
        }
        const now = performance.now();
        // Where the map's drawn objects go: every object's centre, measured now,
        // before the monitor's own meshes go on the display and while the other
        // objects are their deskObjects entries (model, parts).
        let offsets = null;
        try {
            offsets = measureOffsets(ctx);
        } catch (error) {
            console.error('[desk:monitor] measuring the desk for the map failed; its objects stay where they were drawn.', error);
        }
        rt = {
            ctx,
            group,
            mapOffsets: offsets,
            mapWindow: null, // the map's window (windows.js), the home app
            frame: buildFrame(ctx, group),
            screen: null,
            pieces: null,
            origin: [0, 0], // the dot's parent's centre, PLANE x/y (Catch The Dot's window)
            path: null,
            sticky: null,
            glow: null,
            desk: null,
            gameWindow: null, // Catch The Dot's window (windows.js), the dot's parent
            game: null,
            hop: null,
            hopTrail: 0,
            flutter: null,
            caught: loadCaught(ctx),
            view: null, // null at the desk; 'now', 'note', 'desktop', or an app ('readme' — the map —, 'dot', 'walk', … — #monitor resolves to the open one)
            hasPointer: false,
            lastInteraction: now,
            lastStep: now,
            wakeUntil: now + L.AWAKE_MS,
            restStop: null,
            stops: [],
            // The home page (v9): where to go back to on coming back to the monitor this visit;
            // whether its words were read whole yet (and which part was last read); its animation's
            // timer, clock and last sign of someone here; the pointer's last place, a finger on it.
            // v9.2: an arrival's wait before the page goes on by itself (an animation; null when none).
            pageResume: null,
            pageSpoken: false,
            spokenPart: null,
            helloStop: null,
            helloT0: now,
            helloActiveAt: now,
            lastNdc: null,
            touch: null,
            suppressClickUntil: 0,
            wheelAt: 0,
            wheelScale: 0,
            arrival: null
        };

        // Each piece on its own: one failing leaves the rest of the monitor on.
        const attempt = (label, build) => {
            try {
                return build();
            } catch (error) {
                console.error(`[desk:monitor] ${label} failed; carrying on without it.`, error);
                return null;
            }
        };

        rt.screen = attempt('screen', () => buildScreen(ctx, rt.frame));
        attempt('model panel', () => darkenModelPanelSoon(ctx, group));

        const hourLift = STICKY_LIFT[presetId()] ?? STICKY_LIFT.day;
        // The desktop: the dock, the clock, the note under the screen; windows are built as they first open.
        const variant = mapVariantFor(ctx.camera.object?.aspect ?? 1.6);
        rt.desk = attempt('desktop', () => createDesktop(ctx, rt.frame, { lift: hourLift, map: { variant, offsets } }));
        rt.desk?.setCaught(rt.caught);
        attempt('map drawing, later', () => remeasureOffsetsSoon(ctx));
        // The map's window, built now: it is the first app up, on the screen from the first frame (from the room: its button).
        rt.mapWindow = attempt('map window', () => rt.desk?.window('readme') ?? null);
        // Catch The Dot's window, built now too (minimised); the dot rides it.
        // (Fail-soft: without its window the dot plays on the bare screen, always up.)
        rt.gameWindow = attempt('Catch The Dot window', () => rt.desk?.window('dot') ?? null);
        if (rt.gameWindow) rt.origin = rt.desk.windowCentre('dot');
        rt.pieces = attempt('dot', () => buildDot(ctx, rt.gameWindow?.group ?? rt.frame));
        rt.game = attempt('game', () => {
            const seed = ctx.rng('monitor:catch-the-dot');
            return createDotGame({
                field: gameField(L.DOT_RADIUS),
                radius: L.DOT_RADIUS,
                hitRadius: L.HIT_RADIUS,
                start: L.STILL_DOT,
                rng: seed
            });
        });
        rt.path = attempt('trail', () => buildPath(ctx));
        attempt('placing the dot', () => placeDot(0));
        if (rt.mapWindow) {
            attempt('the map up', () => rt.desk.openWindow('readme', { instant: true }));
            // Catch The Dot starts minimised: fully paused, its light hidden until it is opened.
            if (rt.pieces) {
                rt.pieces.dot.visible = false;
                rt.pieces.trail.visible = false;
            }
        } else if (rt.gameWindow) {
            attempt('Catch The Dot up', () => rt.desk.openWindow('dot', { instant: true }));
        }

        rt.sticky = attempt('sticky note', () => {
            // Sized for the lean-in, where the note fills ~54% of the frame height.
            const surface = ctx.makeCanvas(L.STICKY_MM, L.STICKY_MM, { fill: 0.54 });
            const texture = ctx.canvasTexture(surface.canvas);
            // ctx.paint: again when the fonts land.
            (ctx.paint ?? ctx.fonts.paint)(() => {
                const layout = drawSticky(surface, ctx);
                if (!layout.fits) ctx.warn('The "now" line does not fit its sticky at 8 mm; the note is the word limit.', layout);
                texture.needsUpdate = true;
            });
            const lift = ctx.stickyLift('monitor') * hourLift;
            const sticky = buildSticky(ctx.THREE, { texture, stickyMaterial: ctx.stickyMaterial, lift });
            rt.frame.add(sticky.group);
            return sticky;
        });

        rt.glow = attempt('glow', () => addScreenGlow(ctx, group, ANCHOR));

        attempt('timers', () => {
            // At rest (at the desk or under the note, Catch The Dot up): ≤ 12 fps, one frame per step (syncRest).
            syncRest(ctx);
            // The clock: the visitor's own time, one small repaint when the minute turns.
            if (rt.desk) rt.stops.push(ctx.every(15000, () => rt.desk.tickClock()));
            // Every rendered frame: keep the dot current; hold frames only while
            // focused on the game and playing (the desk's and the note's slow
            // drift is the timer's, above).
            rt.stops.push(ctx.addTick(() => {
                const t = performance.now();
                advance(t);
                if (restDrift(rt.view) || !rt.game) return false;
                return rt.game.speed > 0 || targetSpeed(t) > 0;
            }));
            rt.stops.push(ctx.pointer.onMove((ndc) => {
                const t = performance.now();
                if (!rt.hasPointer) wake(ctx);
                rt.hasPointer = true;
                rt.lastNdc = ndc;
                activity(ctx);
                if (!rt.view) return;
                if (targetSpeed(t) === 0) wake(ctx);
                rt.lastInteraction = t;
                updateCursor(ctx, ndc);
            }));
            rt.stops.push(ctx.pointer.onLeave(() => {
                rt.hasPointer = false;
                rt.wakeUntil = performance.now() + L.AWAKE_MS;
                rt.desk?.setHover(null);
            }));
            // The map's layout follows the screen at the desk too (a phone turned, a
            // window resized across 1:1): the establishing shot reframes itself, so the
            // window on the screen does. Up close, go() picks the layout on the next look.
            // Two frames later, as camera.js: DeskScene sets the aspect from a ResizeObserver.
            if (typeof window !== 'undefined' && rt.desk) {
                let queued = false;
                const onResize = () => {
                    if (queued) return;
                    queued = true;
                    requestAnimationFrame(() => requestAnimationFrame(() => {
                        queued = false;
                        if (rt.view !== null || !rt.desk) return;
                        if (rt.desk.setMapVariant(mapVariantFor(ctx.camera.object?.aspect ?? 1.6))) ctx.invalidate();
                    }));
                };
                window.addEventListener('resize', onResize);
                rt.stops.push(() => window.removeEventListener('resize', onResize));
            }
        });

        // The home page: its scroll's input (the wheel over the screen, a finger), its settling, its animation.
        attempt('home page input', () => {
            if (!rt.desk) return;
            rt.desk.onPageSettle = (i) => onPageSettle(ctx, i);
            const el = ctx.deskScene.renderer?.domElement;
            if (!el?.addEventListener) return;
            const on = (type, fn, options) => {
                const handler = (event) => {
                    try { fn(event); } catch (error) { console.error(`[desk:monitor] ${type} on the home page failed`, error); }
                };
                el.addEventListener(type, handler, options);
                rt.stops.push(() => el.removeEventListener(type, handler, options));
            };
            on('wheel', (event) => onWheel(ctx, event), { passive: false });
            on('touchstart', (event) => onTouchStart(ctx, event), { passive: true });
            on('touchmove', (event) => onTouchMove(ctx, event), { passive: false });
            on('touchend', () => onTouchEnd(), { passive: true });
            on('touchcancel', () => onTouchEnd(), { passive: true });
        });
        attempt('the hello animation', () => syncHello(ctx));

        ctx.invalidate();
    },

    async go(ctx, path, { instant }) {
        // #monitor (the desktop, showing whatever app is open: Hello on a
        // fresh load), #monitor/<app> (its window up, the rest minimised —
        // #monitor/readme and #monitor/dot are their dock icons' routes),
        // #monitor/desktop (every app minimised), #monitor/now (the sticky)
        // and #monitor/note (the note under the screen) — the two lean-ins
        // leave whichever app is open as it is. Anything else: #monitor.
        const head = path[0];
        const desk = rt?.desk;
        // From outside the monitor (the room, another module, a fresh load)? rt.view is null until now.
        const arriving = rt?.view === null;
        // A new look: an arrival still waiting to scroll is called off (v9.2).
        cancelArrival();
        // The map's layout follows the screen (rebuilt only if it changed since the last visit).
        if (desk) desk.setMapVariant(mapVariantFor(ctx.camera.object?.aspect ?? 1.6));
        const view = VIEWS.has(head) ? head : openView();
        const quick = instant || ctx.instant;
        // The home page: a part the route names (#monitor/readme/hello, /about, /map) lands exactly
        // there. Arriving from outside the monitor with none named, the page goes on by itself to
        // part 2 — or back down to the map, if the visitor left it there this visit (v9.2, ARRIVAL).
        // Inside the monitor it keeps its place (the first time the home app is up after coming
        // back by another route, the place the visitor left it).
        const named = view === 'readme' && Object.prototype.hasOwnProperty.call(PART_OF, path[1]) ? PART_OF[path[1]] : undefined;
        const onward = Boolean(desk?.pageLayout()) && view === 'readme' && arriving && named === undefined
            ? Math.max(ARRIVAL.part, rt.pageResume ?? 0)
            : null;
        // A fresh look at the map: nothing lit until the pointer or ↑ ↓ lights a label.
        desk?.setMapHighlight(null, 'key');
        // Up close, part 1's "scroll ↓" cue crossfades in as the camera arrives — unless the page goes
        // on by itself: then it comes on once part 1 has gone (onPageSettle), never seen sliding away.
        if (onward === null || quick) desk?.setPageCue(1, { instant: quick, delay: ctx.motion.durations.camera - CUE_FADE_MS });
        if (desk && view === 'readme') {
            if (named !== undefined) desk.scrollPage(named, { instant: quick });
            else if (onward !== null) arrive(ctx, onward, { quick });
            else if (rt.pageResume !== null) desk.scrollPage(rt.pageResume, { instant: quick });
            rt.pageResume = null;
        }
        if (rt) {
            rt.view = view;
            rt.lastInteraction = performance.now();
            ctx.setCursor(null);
            syncRest(ctx);
        }
        if (view === 'now') ctx.visit.log(NOTE_TITLE);
        const app = appOfView(view);
        if (rt && app !== undefined) {
            const opening = showApp(ctx, app, { instant });
            if (app === 'dot') wake(ctx);
            // The map logs on being read; Catch The Dot only on its first catch.
            if (desk && app === 'readme') ctx.visit.log(MAP_TITLE);
            if (desk && isAppView(app) && app !== 'readme' && app !== 'dot') {
                ctx.visit.log(APPS[app].log);
                const quiet = instant || ctx.instant;
                // Still: the finished state. Live: the first visit runs itself once the window is out.
                if (app === 'walk' && desk.walk.runs === 0) {
                    if (quiet) desk.runWalk({ instant: true });
                    else Promise.resolve(opening).then((ok) => { if (ok && rt.view === 'walk' && desk.walk.runs === 0) desk.runWalk(); });
                }
                if (app === 'mlx' && desk.mlx.runs === 0) {
                    if (quiet) desk.runMlx({ instant: true });
                    else Promise.resolve(opening).then((ok) => { if (ok && rt.view === 'mlx' && desk.mlx.runs === 0) desk.runMlx(); });
                }
                if (app === 'trash' && ctx.still && desk.trash.ms < 0) desk.runTrash({ instant: true });
            }
        }
        ctx.hint(hintFor(view, onward));
        if (view === 'readme' && rt && desk) {
            // The whole page on the first look this visit; after that, the part it is heading to
            // (arriving, the one it goes on to by itself — said now, not again as it lands).
            const all = !rt.pageSpoken;
            rt.pageSpoken = true;
            const part = onward ?? desk.pageTargetSection();
            rt.spokenPart = part;
            ctx.live(liveText(view, rt.caught, { all, part }));
        } else ctx.live(liveText(view, rt?.caught ?? 0));
        ctx.invalidate();
        syncHello(ctx);
        const move = ctx.camera.moveTo(shotFor(ctx, view), { instant });
        if (app === 'readme') Promise.resolve(desk?.windows.readme?.anim).then(() => syncHello(ctx));
        await move;
    },

    async leave(ctx, { instant } = {}) {
        if (!rt) return;
        // Whichever app is open stays open on the screen when you walk away: the
        // room keeps your trail. Only Catch The Dot keeps drifting (syncRest).
        // The home page goes back to part 1 (the room always shows it), and remembers
        // where it was, for coming back this visit; its "scroll ↓" cue fades out. An
        // arrival still waiting to take it on is called off (v9.2).
        cancelArrival();
        rt.view = null;
        rt.touch = null;
        rt.wakeUntil = performance.now() + L.AWAKE_MS;
        rt.desk?.setHover(null);
        rt.desk?.setMapHighlight(null, 'key');
        rt.desk?.setClickMeHot(false);
        if (rt.desk?.pageLayout()) {
            rt.pageResume = rt.desk.pageTargetSection();
            rt.desk.scrollPage(0, { instant: instant || ctx.instant });
        }
        rt.desk?.setPageCue(0, { instant: instant || ctx.instant });
        ctx.setCursor(null);
        syncRest(ctx);
        wake(ctx);
        activity(ctx);
    },

    key(ctx, event) {
        if (!rt) return false;
        const view = rt.view;
        const home = homeApp();
        if (event.key === 'Escape') {
            // One step back: from an app to the map (as its close dot does),
            // from a lean-in to whichever app is open; from the map or the bare
            // desktop, the router takes you back to the desk.
            if (isAppView(view) && view !== home && rt.desk) {
                ctx.navigate(appHash(home));
                return true;
            }
            if (view === 'now' || view === 'note') {
                ctx.navigate(backHash());
                return true;
            }
            return false;
        }
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            if (view === 'now') return false;
            stepApp(ctx, event.key === 'ArrowRight' ? 1 : -1);
            return true;
        }
        if (view === 'readme' && rt.desk?.pageLayout()) {
            const handled = pageKey(ctx, event);
            if (handled !== null) return handled;
        }
        if (event.key !== ' ' && event.key !== 'Enter') return false;
        const tag = event.target?.tagName;
        if (tag === 'A' || tag === 'BUTTON') return false; // let focused links and buttons work
        if (event.repeat) return true;
        if (isAppView(view) && view !== 'dot' && rt.desk) {
            const part = { walk: 'run', mlx: 'run', trash: 'row', apple: 'lock' }[view];
            actOn(ctx, view, part);
            return true;
        }
        if (view !== 'dot') return false;
        if (!rt.game) return true;
        rt.lastInteraction = performance.now();
        catchDot(ctx);
        return true;
    },

    click(ctx, ndc) {
        if (!rt) return false;
        if (performance.now() < (rt.suppressClickUntil ?? 0)) return true; // the end of a drag on the page, not a tap
        const hit = hitAt(ctx, ndc);
        if (!hit) return false; // the bezel or the stand: the router leaves it be
        const now = performance.now();
        if (targetSpeed(now) === 0) wake(ctx);
        rt.lastInteraction = now;
        const view = rt.view;
        const leaning = view === 'now' || view === 'note';
        switch (hit.kind) {
            case 'sticky':
                // At a distance a click leans in; up close, the arrow follows its thread.
                if (view === 'now' && hit.thread) ctx.navigate(THREADS.phone.to);
                else {
                    flutter(ctx);
                    if (view !== 'now') ctx.navigate('#monitor/now');
                }
                return true;
            case 'note':
                if (hit.note === 'dot') ctx.navigate(view === 'note' ? THREADS.dot.to : '#monitor/note');
                else if (hit.note === 'mlx') ctx.navigate(THREADS.mlx.to);
                return true; // the trash note is just a note
            case 'dock':
                // The icon of the app you are looking at does nothing; any other opens its app.
                if (hit.app && !(hit.app === rt.desk?.current && appOfView(view) === hit.app)) ctx.navigate(appHash(hit.app));
                return true;
            case 'window': {
                if (leaning) {
                    ctx.navigate(backHash()); // back to whichever app is open
                    return true;
                }
                const part = rt.desk.partAt(hit.app, hit.x, hit.y);
                if (hit.app === 'readme' && part && part !== 'close') {
                    actOnMap(ctx, rt.desk.mapHitAt(hit.x, hit.y));
                } else if (hit.app === 'dot' && part === 'field') {
                    const p = gamePoint(hit);
                    if (rt.game?.hitTest(p.x, p.y)) catchDot(ctx);
                    else missAt(ctx, p.x, p.y);
                } else if (part) actOn(ctx, hit.app, part);
                return true;
            }
            case 'screen':
            default:
                // The bare wallpaper: from a lean-in, back to whichever app is open; otherwise nothing.
                if (leaning) ctx.navigate(backHash());
                return true;
        }
    },

    trail(ctx) {
        // A full visit played a little and read the note: at least ?still=1's three.
        if (rt && rt.caught < L.STILL_CAUGHT) {
            rt.caught = L.STILL_CAUGHT;
            rt.desk?.setCaught(rt.caught);
        }
        // And opened the apps: each has its light in the dock.
        for (const app of APP_ORDER) rt?.desk?.markOpened(app);
        // Read first, on any visit (the room shows its button again, as on every return to the desk).
        if (rt?.mapWindow) ctx.visit.log(MAP_TITLE);
        ctx.visit.log(GAME_TITLE);
        ctx.visit.log(NOTE_TITLE);
    }
};

export { FOCUS_SHOT, NOTE_SHOT, ANCHOR, GROUP_POSITION };

/** For checks in node: the map's offsets as measured at mount, and its live state. */
export const inspect = Object.freeze({
    mapOffsets: () => rt?.mapOffsets ?? null,
    map: () => (rt?.desk ? { ...rt.desk.map, fading: Boolean(rt.desk.map.fade), fade: undefined, scroll: undefined } : null),
    /** The home page: its scroll, the part in view, whether it rests, the animation's timer, where it goes back to, an arrival waiting (v9.2). */
    page: () => (rt?.desk ? {
        y: rt.desk.pageY(),
        part: rt.desk.pageSection(),
        target: rt.desk.pageTargetSection(),
        atRest: rt.desk.pageAtRest(),
        animating: Boolean(rt.helloStop),
        resume: rt.pageResume,
        cue: rt.desk.map.cue,
        arriving: Boolean(rt.arrival)
    } : null)
});
