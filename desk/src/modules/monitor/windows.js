/**
 * MONITOR — the desktop's meshes and their motion: the dock, the clock, the
 * six app windows (v8: the map first) (built the first time each opens, then kept), and the
 * notes on the glass. index.js owns routing and input; this owns what's on
 * the screen.
 *
 * Every window is its own small plane just proud of the screen (PLANE z
 * 0.0024; its live canvas 0.0004 in front of it; its note 0.0010 in front),
 * so the 3.8 MP screen canvas is never re-uploaded for any of it.
 *
 * v5, macOS-like: exactly one app is open at a time (switchTo). Opening one
 * minimises the open one INTO ITS OWN DOCK ICON (220 ms, easeInOutCubic) and
 * the new one scales out of its icon (280 ms, easeOutCubic), starting 120 ms
 * in, so the two overlap a little (400 ms end to end). A window on its way
 * into the dock drops 0.0006 behind (PLANE z 0.0018, still in front of the
 * notes at 0.0016), so two windows crossing never share a depth. Catch The
 * Dot (WINDOWS.dot) is one of them: its field and caption on the window, its
 * counter the live canvas; index.js parents the dot's meshes to its group.
 * Runs repaint only the window's live canvas, at most every 30 ms, and only
 * while they run; nothing here holds frames at rest.
 *
 * v9, the home app ("Hello", welcome.js) is one tall page: painted once into
 * one tall canvas on a plane the size of the window's body (its bottom
 * corners rounded with the window), scrolled by that texture's offset and
 * repeat — never a repaint, never a re-upload. What moves or lights up is a
 * layer of its own over it (PAGE_LAYERS), each a small canvas at a page
 * rect, clipped to the body by its plane's size and its texture's
 * offset/repeat: the map's live drawing (repainted when what is lit changes),
 * "Click me!" (repainted red under the pointer), its underline (drawn in and
 * faded by its plane's width and opacity only — the animation), the scroll
 * cue (the room ⇄ up close crossfade) and the overlay scrollbar. The scroll is scroll.js's spring,
 * stepped by a tick that holds frames only while the page moves.
 */

import { PX, toPlane } from './layout.js';
import {
    WINDOWS, WINDOW_TITLE_H, SHADOW, TARGETS, DOCK, CLOCK, NOTES, APP_ORDER, dockAppAt, dockIconCentre, notePx, windowRect
} from './desktop.js';
import {
    paintWalk, paintWalkLive, walkPaths, paintMlx, paintMlxLive, MLX_RUN_MS, paintApple, paintTrash, paintTrashLive,
    TRASH_RUN, paintDock, paintClock, clockText, windowCanvasSize, paintGame, paintGameCounter
} from './apps.js';
import { paintThreadNote, paintPlainNote, buildNoteMesh } from './notepaper.js';
import { THREADS, TRASH_NOTE, APPS } from './copy.js';
import { SCREEN_COLORS } from './screen.js';
import { paintMapLive, MAP_LABELS, MAP_COLORS } from './map.js';
import {
    pageOf, paintPage, paintClickMe, paintUnderline, paintCue, paintThumb, helloPose, pageHit, PHOTO
} from './welcome.js';
import { createScroll } from './scroll.js';
import { chrome } from './apps.js';

export const Z = Object.freeze({ dock: 0.0004, clock: 0.0004, dotNote: 0.0016, window: 0.0024, windowBack: 0.0018, live: 0.0004, note: 0.0010 });
export const OPEN_MS = 280;
export const CLOSE_MS = 220;
/** When a window is minimising, the next one starts scaling out this far in. */
export const OPEN_DELAY_MS = 120;
const WALK_MS = 1500;
const LIVE_FRAME_MS = 30;
/** The home page's scroll cue: room ⇄ up close, crossfaded (as v8's button was). */
export const CUE_FADE_MS = 250;
/** The overlay scrollbar: shown while the page moves, then held a moment and faded. */
const BAR_HOLD_MS = 650;
const BAR_FADE_MS = 260;
/** The page's layers sit this far in front of the window (the page plane is at Z.live). */
const Z_LAYER = 0.0008;
/** The layers, back to front (renderOrder): the window's canvas is 5, the page plane 5 (opaque). */
const PAGE_LAYERS = Object.freeze({ live: 6, underline: 7, cue: 7, words: 8, bar: 9 });
/** Screen px → frame heights at the app shots (the target fills 0.86 of ~890 px), for sizing window canvases. */
const APP_FRAMING = 0.86 / 890;
const WINDOW_MAX_PIXELS = 2.6e6;

/** A plane showing a canvas, sized in SCREEN px. */
function canvasPlane(ctx, width, height, { framing, transparent = false, maxPixels } = {}) {
    const { THREE } = ctx;
    const surface = ctx.makeCanvas(width, height, { framing, oversample: 1, ...(maxPixels ? { maxPixels } : {}) });
    const texture = ctx.canvasTexture(surface.canvas);
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(width * PX, height * PX),
        new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, transparent, depthWrite: true })
    );
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return { mesh, surface, texture };
}

function planeAt(sx, sy) {
    return toPlane(sx, sy);
}

export function createDesktop(ctx, frame, { lift = 0, map = {} } = {}) {
    const { THREE } = ctx;
    const paint = ctx.paint ?? ctx.fonts.paint;
    const screenFraming = (w, h) => [w * (0.652 / 1000), h * (0.652 / 1000)]; // the focus shot's density, as the counter

    const desk = {
        current: null, // the app whose window is open (readme | walk | dot | mlx | apple | trash), or null: the bare desktop
        open: new Set(), // lit in the dock: every app opened this visit
        caught: 0, // Catch The Dot's counter (index.js owns the number)
        windows: {},
        hover: null,
        walk: { runs: 0, sim: null, progress: 0, anim: null },
        mlx: { t: 0, runs: 0, anim: null, why: false },
        trash: { ms: -1, anim: null, noteShown: false, noteAnim: null },
        apple: { anim: null },
        // The home page (welcome.js, its map map.js): its layout ('landscape' |
        // 'portrait'); how far each drawn object is moved to sit where the real one
        // is (index.js measures them); the label lit (an index into MAP.labels, or
        // null) and who lit it ('pointer' | 'key'); the click targets as last painted
        // (page px); the scroll cue: 0 from the room, 1 up close (and its crossfade
        // while it runs); the scroll (scroll.js), kept across a layout change;
        // whether "Click me!" (or the photo) is under the pointer, and the
        // underline's pose as last shown.
        map: {
            variant: map.variant ?? 'landscape',
            offsets: map.offsets ?? null,
            highlight: null,
            source: null,
            hits: [],
            cue: 0,
            fade: null,
            scroll: null,
            clickMeHot: false,
            underline: null
        }
    };

    // --- The dock ----------------------------------------------------------
    const dock = canvasPlane(ctx, DOCK.width, DOCK.height, { framing: screenFraming(DOCK.width, DOCK.height).map((v) => v * 1.6) });
    {
        const [x, y] = planeAt(DOCK.x + DOCK.width / 2, DOCK.y + DOCK.height / 2);
        dock.mesh.position.set(x, y, Z.dock);
        dock.mesh.name = 'monitor:dock';
        frame.add(dock.mesh);
    }
    const paintDockNow = () => {
        paintDock(dock.surface.g, ctx, { open: desk.open, current: desk.current, hover: desk.hover });
        dock.texture.needsUpdate = true;
    };
    ctx.fonts.paint(paintDockNow);
    desk.dock = dock;

    // --- The clock ---------------------------------------------------------
    const clock = canvasPlane(ctx, CLOCK.width, CLOCK.height, { framing: screenFraming(CLOCK.width, CLOCK.height) });
    {
        const [x, y] = planeAt(CLOCK.x + CLOCK.width / 2, CLOCK.y + CLOCK.height / 2);
        clock.mesh.position.set(x, y, Z.clock);
        clock.mesh.name = 'monitor:clock';
        frame.add(clock.mesh);
    }
    let shownTime = null;
    const paintClockNow = (force = false) => {
        const value = clockText(ctx.now());
        if (!force && value === shownTime) return false;
        shownTime = value;
        paintClock(clock.surface.g, ctx, value, SCREEN_COLORS.title);
        clock.texture.needsUpdate = true;
        return true;
    };
    ctx.fonts.paint(() => paintClockNow(true));
    desk.tickClock = () => {
        if (paintClockNow()) ctx.invalidate();
    };

    // --- Notes on the glass --------------------------------------------------
    function makeNote(note, draw) {
        const surface = ctx.makeCanvas(note.w, note.h, { fill: 0.3 });
        const texture = ctx.canvasTexture(surface.canvas);
        paint(() => {
            const result = draw(surface.g);
            if (result && result.fits === false) ctx.warn(`Note ${note.id} does not fit its paper; the note is the word limit.`);
            texture.needsUpdate = true;
        });
        const built = buildNoteMesh(THREE, {
            note, texture, stickyMaterial: ctx.stickyMaterial, lift: ctx.stickyLift('monitor') * lift, curl: note.window ? 0.006 : 0.011
        });
        return built;
    }

    /** A note's centre (PLANE x, y) and roll, in SCREEN-anchored terms. */
    function notePlacement(note) {
        const [w, h] = notePx(note);
        return { centre: planeAt(note.at[0] + w / 2, note.at[1] + h / 2), roll: note.roll };
    }

    // Catch The Dot's note, hanging under the screen: always there.
    desk.dotNote = makeNote(NOTES.dot, (g) => paintThreadNote(g, ctx, NOTES.dot, THREADS.dot));
    {
        const { centre, roll } = notePlacement(NOTES.dot);
        desk.dotNote.group.position.set(centre[0], centre[1], Z.dotNote);
        desk.dotNote.group.rotation.z = roll;
        frame.add(desk.dotNote.group);
    }

    // --- Windows -------------------------------------------------------------
    const painters = {
        dot: (g) => paintGame(g, ctx),
        walk: (g) => paintWalk(g, ctx, { ran: desk.walk.runs > 0 }),
        mlx: (g) => paintMlx(g, ctx, { whyOpen: desk.mlx.why ? 1 : 0 }),
        apple: (g) => paintApple(g, ctx),
        trash: (g) => paintTrash(g, ctx, { opened: desk.trash.ms >= 0 })
    };
    const livePainters = {
        dot: (g) => paintGameCounter(g, ctx, desk.caught),
        walk: (g) => {
            if (!desk.walk.sim) desk.walk.sim = walkPaths(ctx.rng('monitor:walk:0'));
            paintWalkLive(g, ctx, desk.walk.sim, desk.walk.progress);
        },
        mlx: (g) => paintMlxLive(g, ctx, desk.mlx.t),
        trash: (g) => paintTrashLive(g, ctx, desk.trash.ms)
    };

    /** An app's window rect (the map's in its current layout). */
    const rectOf = (app) => windowRect(app, desk.map.variant);
    desk.rectOf = rectOf;

    function windowCentre(app) {
        const win = rectOf(app);
        return planeAt(win.x + win.w / 2, win.y + win.h / 2);
    }
    desk.windowCentre = windowCentre;

    function buildWindow(app) {
        if (app === 'readme') return buildPageWindow();
        const win = rectOf(app);
        const [W, H] = windowCanvasSize(app, win);
        const group = new THREE.Group();
        group.name = `monitor:window:${app}`;
        group.visible = false;
        const [cx, cy] = windowCentre(app);
        group.position.set(cx, cy, Z.window);

        const density = win.density ?? APP_FRAMING;
        const base = canvasPlane(ctx, W, H, { framing: [W * density, H * density], transparent: true, maxPixels: WINDOW_MAX_PIXELS });
        base.mesh.name = `monitor:window:${app}:base`;
        base.mesh.renderOrder = 5; // after the dot's light, which it covers
        group.add(base.mesh);
        const repaint = () => {
            painters[app](base.surface.g);
            base.texture.needsUpdate = true;
        };
        paint(repaint);

        let live = null;
        if (win.live) {
            const l = win.live;
            live = canvasPlane(ctx, l.w, l.h, { framing: [l.w * density, l.h * density], maxPixels: 1.4e6 });
            live.mesh.name = `monitor:window:${app}:live`;
            live.mesh.position.set((l.x + l.w / 2 - win.w / 2) * PX, -(l.y + l.h / 2 - win.h / 2) * PX, Z.live);
            group.add(live.mesh);
            let last = -Infinity;
            live.repaint = (force = true) => {
                const t = performance.now();
                if (!force && t - last < LIVE_FRAME_MS) return;
                last = t;
                livePainters[app](live.surface.g);
                live.texture.needsUpdate = true;
                ctx.invalidate();
            };
            paint(() => live.repaint(true));
        }

        let note = null;
        const spec = Object.values(NOTES).find((n) => n.window === app);
        if (spec) {
            note = makeNote(spec, (g) => (app === 'mlx' ? paintThreadNote(g, ctx, spec, THREADS.mlx) : paintPlainNote(g, ctx, spec, TRASH_NOTE)));
            const { centre, roll } = notePlacement(spec);
            note.group.position.set(centre[0] - cx, centre[1] - cy, Z.note);
            note.group.rotation.z = roll;
            note.spec = spec;
            note.group.visible = app !== 'trash' || desk.trash.noteShown;
            group.add(note.group);
        }
        frame.add(group);
        return { app, rect: win, group, base, live, note, repaint, anim: null, shown: false, z: Z.window };
    }


    // --- The home page (v9): one tall canvas, scrolled by texture offset, and its layers ---

    const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);

    /** The body of a window (under its title bar), its bottom corners rounded as the window's are: the page's plane. */
    function bodyGeometry(win, top, radius = 14) {
        const x0 = (-win.w / 2) * PX;
        const x1 = (win.w / 2) * PX;
        const yT = -(top - win.h / 2) * PX;
        const yB = (-win.h / 2) * PX;
        const r = radius * PX;
        const shape = new THREE.Shape();
        shape.moveTo(x0, yT);
        shape.lineTo(x1, yT);
        shape.lineTo(x1, yB + r);
        shape.quadraticCurveTo(x1, yB, x1 - r, yB);
        shape.lineTo(x0 + r, yB);
        shape.quadraticCurveTo(x0, yB, x0, yB + r);
        shape.closePath();
        const geometry = new THREE.ShapeGeometry(shape, 8);
        const pos = geometry.attributes.position;
        const uv = geometry.attributes.uv;
        for (let i = 0; i < pos.count; i += 1) uv.setXY(i, (pos.getX(i) - x0) / (x1 - x0), (pos.getY(i) - yB) / (yT - yB));
        uv.needsUpdate = true;
        return geometry;
    }

    /** The page's scroll (scroll.js), one per layout height; a layout change keeps the part you were on. */
    function pageScroll(P) {
        const q = desk.map;
        const old = q.scroll;
        if (old && old.viewH === P.viewH) return old;
        const next = createScroll({ viewH: P.viewH, sections: P.pageH / P.viewH, instant: ctx.instant });
        if (old) next.jump(old.section(old.target) * P.viewH);
        q.scroll = next;
        return next;
    }

    function buildPageWindow() {
        const app = 'readme';
        const win = rectOf(app);
        const P = pageOf(desk.map.variant);
        const [W, H] = windowCanvasSize(app, win);
        const group = new THREE.Group();
        group.name = `monitor:window:${app}`;
        group.visible = false;
        const [cx, cy] = windowCentre(app);
        group.position.set(cx, cy, Z.window);
        const density = win.density ?? APP_FRAMING;

        // The window itself: shadow, chrome, the paper body (seen only in the body's two bottom corners' curve).
        const base = canvasPlane(ctx, W, H, { framing: [W * density, H * density], transparent: true, maxPixels: WINDOW_MAX_PIXELS });
        base.mesh.name = `monitor:window:${app}:base`;
        base.mesh.renderOrder = 5;
        group.add(base.mesh);
        const repaintBase = () => {
            chrome(base.surface.g, ctx, app, { body: MAP_COLORS.paper, rect: win });
            base.surface.g.restore();
            base.texture.needsUpdate = true;
        };
        paint(repaintBase);

        // The page: one tall canvas, never taller than the GPU takes (4096 px, or less if it says so).
        const maxTexture = Math.min(4096, ctx.deskScene.renderer?.capabilities?.maxTextureSize ?? 4096);
        const pageMaxPixels = Math.min(4e6, (maxTexture / P.pageH) ** 2 * P.W * P.pageH * 0.99);
        const surface = ctx.makeCanvas(P.W, P.pageH, { framing: [P.W * density, P.pageH * density], oversample: 1, maxPixels: pageMaxPixels });
        const texture = ctx.canvasTexture(surface.canvas);
        const pageMesh = new THREE.Mesh(bodyGeometry(win, P.viewTop), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
        pageMesh.name = `monitor:window:${app}:page`;
        pageMesh.position.z = Z.live;
        pageMesh.renderOrder = 5;
        group.add(pageMesh);
        const scroll = pageScroll(P);

        // The layers, each fail-soft on its own (the page still reads without any of them).
        const layers = {};
        const addLayer = (name, rect, draw, { fixed = false, order = 7, opacity = 1 } = {}) => {
            try {
                const ls = ctx.makeCanvas(rect.w, rect.h, { framing: [rect.w * density, rect.h * density], oversample: 1, maxPixels: 1.4e6 });
                const lt = ctx.canvasTexture(ls.canvas);
                const mesh = new THREE.Mesh(UNIT_PLANE, new THREE.MeshBasicMaterial({ map: lt, transparent: true, depthWrite: false, toneMapped: false, opacity }));
                mesh.name = `monitor:window:${app}:${name}`;
                mesh.renderOrder = order;
                mesh.visible = false;
                group.add(mesh);
                const layer = { name, rect, fixed, surface: ls, texture: lt, mesh, opacity, pose: {} };
                layer.repaint = () => {
                    ls.clear();
                    draw(ls.g);
                    lt.needsUpdate = true;
                    ctx.invalidate();
                };
                paint(layer.repaint);
                layers[name] = layer;
                return layer;
            } catch (error) {
                console.error(`[desk:monitor] the home page's ${name} layer failed; the page carries on without it.`, error);
                return null;
            }
        };
        addLayer('live', P.map.live, (g) => {
            const q = desk.map;
            const hl = q.highlight === null ? null : MAP_LABELS[q.highlight]?.id ?? null;
            paintMapLive(g, P.map, { variant: q.variant, offsets: q.offsets, hl });
        }, { order: PAGE_LAYERS.live });
        addLayer('underline', P.underline, (g) => paintUnderline(g, { x: 0, y: 0, w: P.underline.w, h: P.underline.h }), { order: PAGE_LAYERS.underline });
        addLayer('words', P.wordsLayer, (g) => paintClickMe(g, P, { hot: desk.map.clickMeHot }), { order: PAGE_LAYERS.words });
        addLayer('cue', P.cue, (g) => paintCue(g, P), { order: PAGE_LAYERS.cue, opacity: desk.map.cue });
        addLayer('bar', { ...P.bar }, (g) => paintThumb(g, P), { fixed: true, order: PAGE_LAYERS.bar, opacity: 0 });

        /**
         * A layer's plane: its page rect (moved by its pose) clipped to the body,
         * its texture showing just that part. `pose.reveal` (0…1) shows only its
         * left part, unsquashed — how the underline draws itself in.
         */
        const placeLayer = (layer) => {
            const { rect, pose, mesh, texture: lt } = layer;
            const opacity = layer.opacity * (pose.opacity ?? 1);
            const sx = pose.sx ?? 1;
            const sy = pose.sy ?? 1;
            const dw = rect.w * sx;
            const dh = rect.h * sy;
            const dx0 = rect.x + (rect.w - dw) * (pose.ax ?? 0.5) + (pose.dx ?? 0);
            const top = P.viewTop + (layer.fixed ? 0 : -scroll.y);
            const dy0 = rect.y + (rect.h - dh) * (pose.ay ?? 0.5) + (pose.dy ?? 0) + top;
            const x0 = Math.max(dx0, 0);
            const x1 = Math.min(dx0 + dw * Math.max(0, Math.min(1, pose.reveal ?? 1)), P.W);
            const y0 = Math.max(dy0, P.viewTop);
            const y1 = Math.min(dy0 + dh, P.viewTop + P.viewH);
            if (opacity <= 0.002 || x1 - x0 < 0.5 || y1 - y0 < 0.5) {
                mesh.visible = false;
                return;
            }
            mesh.visible = true;
            mesh.material.opacity = opacity;
            mesh.position.set(((x0 + x1) / 2 - win.w / 2) * PX, -((y0 + y1) / 2 - win.h / 2) * PX, Z_LAYER);
            mesh.scale.set((x1 - x0) * PX, (y1 - y0) * PX, 1);
            const u0 = (x0 - dx0) / dw;
            const u1 = (x1 - dx0) / dw;
            const t0 = (y0 - dy0) / dh;
            const t1 = (y1 - dy0) / dh;
            lt.repeat.set(u1 - u0, t1 - t0);
            lt.offset.set(u0, 1 - t1);
        };
        /** Everything at the scroll: the page's texture window, every layer, the scrollbar's thumb. */
        const layout = () => {
            texture.repeat.set(1, P.viewH / P.pageH);
            texture.offset.set(0, 1 - (scroll.y + P.viewH) / P.pageH);
            if (layers.bar) layers.bar.rect.y = P.bar.y + (scroll.max > 0 ? (scroll.y / scroll.max) * P.bar.track : 0);
            for (const layer of Object.values(layers)) placeLayer(layer);
            ctx.invalidate();
        };

        // The page's own paint: again when the fonts land, and when the photo does.
        let photo = null;
        const repaintPage = () => {
            surface.clear();
            desk.map.hits = paintPage(surface.g, { variant: desk.map.variant, offsets: desk.map.offsets, photo, layers: { words: Boolean(layers.words), underline: Boolean(layers.underline) } }).hits;
            texture.needsUpdate = true;
            ctx.invalidate();
        };
        paint(repaintPage);
        try {
            Promise.resolve(ctx.media(PHOTO.file)).then((image) => {
                if (desk.windows.readme?.page?.surface !== surface) return; // rebuilt since
                photo = image;
                repaintPage();
            }, () => { /* media() logged it; the page keeps its warm blank */ });
        } catch (error) {
            console.error('[desk:monitor] the home page photo could not be asked for; the page keeps its warm blank.', error);
        }

        const w = {
            app, rect: win, group, base, live: null, note: null, anim: null, shown: false, z: Z.window,
            repaint: () => { repaintBase(); repaintPage(); },
            page: { P, surface, texture, mesh: pageMesh, layers, layout, scroll }
        };
        applyHello(w, helloPose(0, { still: true }));
        layout();
        frame.add(group);
        return w;
    }

    /**
     * The hello part's underline at a pose (welcome.js helloPose): its plane's
     * width and its opacity only. Returns whether that changes what is shown.
     */
    function applyHello(w, pose) {
        const layer = w?.page?.layers.underline;
        if (!layer) return false;
        const { reveal, opacity } = pose.underline;
        const last = desk.map.underline;
        desk.map.underline = { reveal, opacity };
        layer.pose = { reveal, opacity };
        return !last || Math.abs(last.reveal - reveal) > 1e-4 || Math.abs(last.opacity - opacity) > 1e-4;
    }

    /** Frees a window's GPU side (its canvases' textures, its planes) and takes it off the glass. */
    function disposeWindow(w) {
        w.anim?.cancel();
        frame.remove(w.group);
        w.group.traverse((node) => {
            if (!node.isMesh) return;
            node.geometry?.dispose?.();
            node.material?.map?.dispose?.();
            node.material?.dispose?.();
        });
    }

    desk.window = (app) => {
        if (!WINDOWS[app]) return null;
        if (!desk.windows[app]) desk.windows[app] = buildWindow(app);
        return desk.windows[app];
    };

    function place(w, k, dx = 0) {
        const [cx, cy] = planeAt(w.rect.x + w.rect.w / 2, w.rect.y + w.rect.h / 2);
        const [ix, iy] = planeAt(...dockIconCentre(w.app));
        const s = 0.06 + 0.94 * k;
        w.group.scale.set(s, s, 1);
        w.group.position.set(ix + (cx - ix) * k + dx * PX, iy + (cy - iy) * k, w.z);
    }

    /** Scales `app`'s window out of its dock icon (after `delay` ms, still at its icon and hidden until then). */
    desk.openWindow = (app, { instant = false, delay = 0 } = {}) => {
        const w = desk.window(app);
        if (!w) return Promise.resolve(false);
        w.anim?.cancel();
        const k0 = w.group.visible ? Math.max(0, (w.group.scale.x - 0.06) / 0.94) : 0;
        w.shown = true;
        w.z = Z.window;
        const wasCurrent = desk.current;
        desk.current = app;
        desk.markOpened(app);
        if (wasCurrent !== app) paintDockNow();
        if (k0 >= 0.999) {
            w.group.visible = true;
            place(w, 1);
            ctx.invalidate();
            return Promise.resolve(true);
        }
        const quick = instant || ctx.instant;
        const wait = quick ? 0 : Math.max(0, delay);
        const total = OPEN_MS + wait;
        const outCubic = ctx.motion.easings.outCubic;
        w.group.visible = k0 > 0 || wait === 0;
        if (w.group.visible) place(w, k0);
        w.anim = ctx.motion.animate({
            from: k0,
            to: 1,
            duration: total,
            // Held at k0 for the delay, then easeOutCubic over OPEN_MS.
            easing: (t) => outCubic(Math.max(0, Math.min(1, (t * total - wait) / OPEN_MS))),
            movesGeometry: false,
            instant: quick,
            onUpdate: (k, t) => {
                if (t * total < wait) return;
                w.group.visible = true;
                place(w, k);
            }
        });
        ctx.invalidate();
        return w.anim;
    };

    /** Minimises `app`'s window into its own dock icon. */
    desk.closeWindow = (app, { instant = false } = {}) => {
        const w = desk.windows[app];
        if (desk.current === app) {
            desk.current = null;
            paintDockNow();
        }
        if (!w || !w.shown) return Promise.resolve(true);
        w.anim?.cancel();
        if (app === 'apple') desk.apple.anim?.cancel(); // a shake would hold it at full size
        w.shown = false;
        w.z = Z.windowBack; // behind whatever opens while it goes
        const k0 = Math.max(0, (w.group.scale.x - 0.06) / 0.94);
        const anim = ctx.motion.animate({
            from: k0,
            to: 0,
            duration: CLOSE_MS,
            easing: ctx.motion.easings.inOutCubic,
            movesGeometry: false,
            instant: instant || ctx.instant,
            onUpdate: (k) => place(w, k)
        });
        w.anim = anim;
        anim.then(() => {
            if (w.anim === anim && !w.shown) {
                w.group.visible = false;
                ctx.invalidate();
            }
        });
        return anim;
    };

    /**
     * The map's layout follows the screen: 'portrait' on phones, 'landscape'
     * otherwise. A change (a phone turned, a window resized across 1:1)
     * rebuilds its window in the new layout, up if it was up. Returns whether
     * it rebuilt.
     */
    desk.setMapVariant = (variant) => {
        if (variant === desk.map.variant) return false;
        desk.map.variant = variant;
        desk.map.highlight = null;
        desk.map.source = null;
        const old = desk.windows.readme;
        if (!old) return false;
        const wasShown = old.shown;
        disposeWindow(old);
        delete desk.windows.readme;
        const w = desk.window('readme');
        if (wasShown) {
            w.shown = true;
            w.group.visible = true;
            place(w, 1);
        }
        ctx.invalidate();
        return true;
    };

    function setCueOpacity(k) {
        desk.map.cue = k;
        const page = desk.windows.readme?.page;
        if (!page?.layers.cue) return;
        page.layers.cue.opacity = k;
        page.layout();
    }

    /**
     * The home page's scroll cue under "Click me!": 0 from the room, 1 up
     * close. Crossfades over CUE_FADE_MS (linear opacity), starting `delay`
     * ms from now (still at its old value until then); still, reduced motion
     * or `instant`: at once. Resolves when it's there.
     */
    desk.setPageCue = (to, { instant = false, delay = 0 } = {}) => {
        const q = desk.map;
        const target = to > 0.5 ? 1 : 0;
        q.fade?.cancel();
        q.fade = null;
        if (instant || ctx.instant || !desk.windows.readme?.page?.layers.cue) {
            setCueOpacity(target);
            return Promise.resolve(true);
        }
        if (q.cue === target) return Promise.resolve(true);
        const from = q.cue;
        const wait = Math.max(0, delay);
        const total = wait + CUE_FADE_MS;
        const anim = ctx.motion.animate({
            from,
            to: target,
            duration: total,
            // Held at its old value through the delay, then linear over CUE_FADE_MS.
            easing: (t) => Math.max(0, Math.min(1, (t * total - wait) / CUE_FADE_MS)),
            movesGeometry: false,
            onUpdate: (k) => { if (q.fade === anim) setCueOpacity(k); }
        });
        q.fade = anim;
        anim.then(() => {
            if (q.fade !== anim) return;
            q.fade = null;
            setCueOpacity(target);
        });
        return anim;
    };

    /**
     * Lights label `index` (with its leader and its drawn object), or none
     * (null). Repaints the map's live layer only when what is lit changes —
     * never per frame. A pointer moving off the labels puts out only what it lit.
     */
    desk.setMapHighlight = (index, source = 'pointer') => {
        const q = desk.map;
        if (index === null && source === 'pointer' && q.source === 'key') return false;
        const next = index ?? null;
        q.source = next === null ? null : source;
        if (q.highlight === next) return false;
        q.highlight = next;
        desk.windows.readme?.page?.layers.live?.repaint();
        return true;
    };

    /** The drawn objects' offsets, measured again (index.js: a model landed after mount): one repaint. */
    desk.setMapOffsets = (offsets) => {
        desk.map.offsets = offsets;
        const w = desk.windows.readme;
        if (!w) return;
        w.repaint();
        w.page?.layers.live?.repaint();
        ctx.invalidate();
    };

    /** The home page's click target under window-local (x, y) — see welcome.js pageHit — or null. */
    desk.mapHitAt = (x, y) => {
        const page = desk.windows.readme?.page;
        if (!page) return null;
        const { P, scroll } = page;
        if (y < P.viewTop || y > P.viewTop + P.viewH) return null;
        return pageHit(desk.map.hits, x, y - P.viewTop + scroll.y);
    };

    // --- The home page's scroll ------------------------------------------------

    /** Called with the part's index whenever the page comes to rest (index.js: the hint, the words, the animation). */
    desk.onPageSettle = null;
    let pageMoving = null; // resolves the tracked "monitor page scroll" promise when the page comes to rest
    let barToken = 0;

    function barTo(k, { fade = false } = {}) {
        const bar = desk.windows.readme?.page?.layers.bar;
        if (!bar) return null;
        if (!fade) {
            bar.opacity = k;
            desk.windows.readme.page.layout();
            return null;
        }
        const token = barToken;
        const from = bar.opacity;
        return ctx.motion.animate({
            from, to: k, duration: BAR_FADE_MS, easing: ctx.motion.easings.outCubic, movesGeometry: false,
            onUpdate: (v) => { if (token === barToken) { bar.opacity = v; desk.windows.readme?.page?.layout(); } }
        });
    }

    function pageStarted() {
        if (!pageMoving) {
            let done;
            const moving = new Promise((resolve) => { done = resolve; });
            pageMoving = done;
            ctx.track(moving, 'monitor page scroll');
        }
        barToken += 1;
        if (!ctx.still) barTo(1);
        ctx.invalidate();
    }

    function pageSettled(page) {
        const done = pageMoving;
        pageMoving = null;
        const token = (barToken += 1);
        if (page.layers.bar?.opacity > 0) {
            if (ctx.instant) globalThis.setTimeout(() => { if (token === barToken) barTo(0); }, BAR_HOLD_MS);
            else Promise.resolve(ctx.motion.wait(BAR_HOLD_MS)).then(() => { if (token === barToken) barTo(0, { fade: true }); });
        }
        try { desk.onPageSettle?.(page.scroll.section()); } finally { done?.(); }
    }

    /** One frame of the page's scroll: true while it moves (the tick holds frames only then). */
    desk.stepPage = (ms) => {
        const page = desk.windows.readme?.page;
        if (!page) return false;
        const m = page.scroll;
        if (m.atRest()) {
            if (pageMoving) pageSettled(page);
            return false;
        }
        if (m.step(ms)) page.layout();
        if (m.atRest()) {
            pageSettled(page);
            return false;
        }
        return true;
    };

    const pageNow = () => desk.windows.readme?.page ?? null;
    /** The page px at the top of the body (0: part 1), and the part nearest it. */
    desk.pageY = () => pageNow()?.scroll.y ?? 0;
    desk.pageSection = () => pageNow()?.scroll.section() ?? 0;
    /** Where the page is heading (the part), for coming back to it. */
    desk.pageTargetSection = () => { const m = pageNow()?.scroll; return m ? m.section(m.target) : 0; };
    desk.pageAtRest = () => pageNow()?.scroll.atRest() ?? true;
    desk.pageLayout = () => pageNow()?.P ?? null;

    /** To part `i` (keys, "Click me!", the room, a route): the spring there, or a jump. */
    desk.scrollPage = (i, { instant = false } = {}) => {
        const page = pageNow();
        if (!page) return;
        const m = page.scroll;
        if (instant || ctx.instant) {
            const was = m.y;
            m.jump(Math.round(i) * page.P.viewH);
            page.layout();
            if (was !== m.y || pageMoving) pageSettled(page);
            return;
        }
        m.toSection(i);
        if (!m.atRest()) pageStarted();
    };

    /**
     * A wheel over the screen, in page px (positive: down the page). Returns
     * whether it took it: one with no up or down in it (0, NaN) moves nothing,
     * starts nothing, and so will never settle.
     */
    desk.wheelPage = (dy) => {
        const page = pageNow();
        if (!page || !dy) return false;
        page.scroll.wheel(dy);
        page.layout();
        pageStarted();
        return true;
    };

    /** A finger on the page: start, move to page y, let go at v (page px / s). */
    desk.dragPage = {
        start: () => { const page = pageNow(); if (!page) return 0; page.scroll.dragStart(); pageStarted(); return page.scroll.y; },
        to: (y) => { const page = pageNow(); if (!page) return; page.scroll.dragTo(y); page.layout(); },
        end: (v) => { const page = pageNow(); if (!page) return; page.scroll.dragEnd(v); page.layout(); ctx.invalidate(); }
    };

    /**
     * The hello part's animation at t ms (index.js steps it at ≤ 12 fps).
     * Returns whether the underline moved: while it is held, or gone, a step
     * changes nothing and needs no frame.
     */
    desk.helloFrame = (t) => {
        const w = desk.windows.readme;
        if (!w?.page || !applyHello(w, helloPose(t))) return false;
        w.page.layout();
        return true;
    };
    /** The animation stopped: the underline drawn, as the still frame has it. */
    desk.helloRest = () => {
        const w = desk.windows.readme;
        if (!w?.page || !applyHello(w, helloPose(0, { still: true }))) return;
        w.page.layout();
    };
    /** "Click me!" in red while it (or the photo, "me") is under the pointer: one repaint of its small layer, only on a change. */
    desk.setClickMeHot = (hot) => {
        const q = desk.map;
        const next = Boolean(hot);
        if (q.clickMeHot === next) return false;
        q.clickMeHot = next;
        desk.windows.readme?.page?.layers.words?.repaint();
        return true;
    };
    /** Whether the home app's window is up, fully out of the dock. */
    desk.pageShown = () => {
        const w = desk.windows.readme;
        return Boolean(w?.shown && w.group.visible && Math.abs(w.group.scale.x - 1) < 1e-3);
    };

    desk.closeAll = (options) => Promise.all(Object.keys(desk.windows).map((app) => desk.closeWindow(app, options)));

    /**
     * Exactly one app open: `app` (or null, the bare desktop). Whatever else
     * is open minimises into its icon; `app` opens from its own, a little
     * after, if something had to make way. Resolves when `app` is out.
     */
    desk.switchTo = (app, { instant = false } = {}) => {
        let minimising = false;
        for (const [other, w] of Object.entries(desk.windows)) {
            if (other === app || !w.shown) continue;
            desk.closeWindow(other, { instant });
            minimising = true;
        }
        if (!app) {
            if (desk.current) desk.closeWindow(desk.current, { instant });
            return Promise.resolve(true);
        }
        return desk.openWindow(app, { instant, delay: minimising ? OPEN_DELAY_MS : 0 });
    };

    /** Catch The Dot's counter: repaints its 240 x 48 live canvas, nothing else. */
    desk.setCaught = (value) => {
        if (desk.caught === value && desk.windows.dot) return;
        desk.caught = value;
        desk.windows.dot?.live?.repaint(true);
    };

    // --- Runs ----------------------------------------------------------------

    desk.runWalk = ({ instant = false } = {}) => {
        const w = desk.window('walk');
        const state = desk.walk;
        state.anim?.cancel();
        state.sim = walkPaths(ctx.rng(`monitor:walk:${state.runs}`));
        const first = state.runs === 0;
        state.runs += 1;
        if (first) w.repaint(); // the output line under the fan
        const done = instant || ctx.instant;
        state.progress = done ? 1 : 0;
        w.live.repaint(true);
        if (done) return Promise.resolve(true);
        state.anim = ctx.motion.animate({
            from: 0, to: 1, duration: WALK_MS, easing: (t) => 1 - (1 - t) * (1 - t), movesGeometry: false,
            onUpdate: (k) => { state.progress = k; w.live.repaint(k >= 1); }
        });
        return state.anim;
    };

    desk.runMlx = ({ instant = false } = {}) => {
        const w = desk.window('mlx');
        const state = desk.mlx;
        state.anim?.cancel();
        state.runs += 1;
        const done = instant || ctx.instant;
        state.t = done ? 1 : 0;
        w.live.repaint(true);
        if (done) return Promise.resolve(true);
        state.anim = ctx.motion.animate({
            from: 0, to: 1, duration: MLX_RUN_MS, easing: (t) => t, movesGeometry: false,
            onUpdate: (k) => { state.t = k; w.live.repaint(k >= 1); }
        });
        return state.anim;
    };

    desk.toggleWhy = (on = !desk.mlx.why) => {
        desk.mlx.why = on;
        desk.window('mlx').repaint();
        ctx.invalidate();
        return on;
    };

    function showTrashNote(instant) {
        const w = desk.window('trash');
        const note = w.note;
        if (!note) return;
        desk.trash.noteShown = true;
        note.group.visible = true;
        desk.trash.noteAnim?.cancel();
        desk.trash.noteAnim = ctx.motion.animate({
            from: 0, to: 1, preset: 'reveal', movesGeometry: false, instant: instant || ctx.instant,
            onUpdate: (k) => {
                const s = 0.9 + 0.1 * k;
                note.group.scale.set(s, s, 1);
            }
        });
        ctx.invalidate();
    }

    /** Opens self-improvement/: it runs locally, crawls to a few percent, stalls; the fans stay pinned. */
    desk.runTrash = ({ instant = false } = {}) => {
        const w = desk.window('trash');
        const state = desk.trash;
        if (state.ms >= 0 && !(instant || ctx.instant)) return Promise.resolve(false); // it only ever gets that far
        state.anim?.cancel();
        const done = instant || ctx.instant;
        state.ms = done ? Infinity : 0;
        w.repaint();
        w.live.repaint(true);
        if (done) {
            showTrashNote(true);
            return Promise.resolve(true);
        }
        state.anim = ctx.motion.animate({
            from: 0, to: TRASH_RUN.crawlMs, duration: TRASH_RUN.crawlMs, easing: (t) => t, movesGeometry: false,
            onUpdate: (ms) => { state.ms = ms; w.live.repaint(ms >= TRASH_RUN.crawlMs); }
        });
        const anim = state.anim;
        anim.then((completed) => {
            if (!completed || state.anim !== anim) return;
            state.ms = Infinity;
            w.live.repaint(true);
            const wait = ctx.motion.wait(TRASH_RUN.noteAtMs - TRASH_RUN.crawlMs);
            Promise.resolve(wait).then(() => {
                if (state.anim === anim && desk.current === 'trash') showTrashNote(false);
                else if (state.anim === anim) showTrashNote(true);
            });
        });
        return anim;
    };

    /** The padlock refuses: the window shakes, the way a login window does at a wrong password. */
    desk.shakeApple = () => {
        const w = desk.windows.apple;
        if (!w?.shown) return Promise.resolve(false);
        desk.apple.anim?.cancel();
        const anim = ctx.motion.animate({
            from: 0, to: 1, duration: 360, easing: (t) => t, movesGeometry: false,
            onUpdate: (t) => place(w, 1, Math.sin(t * Math.PI * 6) * (1 - t) * 14)
        });
        desk.apple.anim = anim;
        anim.then(() => { if (w.shown && desk.apple.anim === anim) place(w, 1); });
        return anim;
    };

    // --- Hits ----------------------------------------------------------------

    /** Meshes to raycast, frontmost first doesn't matter (three sorts by distance). */
    desk.targets = () => {
        const list = [dock.mesh, desk.dotNote.front];
        for (const w of Object.values(desk.windows)) {
            if (!w.shown || !w.group.visible) continue;
            list.push(w.base.mesh);
            if (w.live?.mesh.visible) list.push(w.live.mesh); // (three raycasts hidden meshes too)
            if (w.note?.group.visible) list.push(w.note.front);
        }
        return list;
    };

    /** What an intersection means, or null to look further along the ray (a window's shadow margin). */
    desk.hitOf = (hit) => {
        const object = hit.object;
        if (object === dock.mesh) {
            if (!hit.uv) return null;
            const app = dockAppAt(hit.uv.x * DOCK.width, (1 - hit.uv.y) * DOCK.height);
            return { kind: 'dock', app };
        }
        if (object === desk.dotNote.front) return { kind: 'note', note: 'dot' };
        for (const w of Object.values(desk.windows)) {
            if (object === w.note?.front) return { kind: 'note', note: w.app };
            const win = w.rect;
            if (object === w.base.mesh && hit.uv) {
                const [W, H] = windowCanvasSize(w.app, win);
                const x = hit.uv.x * W - SHADOW;
                const y = (1 - hit.uv.y) * H - SHADOW;
                if (x < 0 || y < 0 || x > win.w || y > win.h) return null; // the shadow: not the window
                return { kind: 'window', app: w.app, x, y };
            }
            if (object === w.live?.mesh && hit.uv) {
                return { kind: 'window', app: w.app, x: win.live.x + hit.uv.x * win.live.w, y: win.live.y + (1 - hit.uv.y) * win.live.h, live: true };
            }
        }
        return null;
    };

    /**
     * What a window-local point is on: 'close' | (the home page's) 'scroll'
     * ("Click me!", the cues), 'item' (a map label, its leader or its drawn
     * object), 'link' (the photo box, the email, "Before you go") | 'field'
     * (Catch The Dot's, under its title
     * bar) | 'run' | 'why' | 'row' | 'lock' | null.
     */
    desk.partAt = (app, x, y) => {
        const inside = (r) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
        if (inside(TARGETS.close)) return 'close';
        if (app === 'readme') return desk.mapHitAt(x, y)?.kind ?? null;
        if (app === 'dot') return y > WINDOW_TITLE_H ? 'field' : null;
        if (app === 'walk' && inside(TARGETS.walkRun)) return 'run';
        if (app === 'mlx' && inside(TARGETS.mlxRun)) return 'run';
        if (app === 'mlx' && inside(TARGETS.mlxWhy)) return 'why';
        if (app === 'trash' && inside(TARGETS.trashRow)) return 'row';
        if (app === 'apple' && inside(TARGETS.appleLock)) return 'lock';
        return null;
    };

    desk.setHover = (app) => {
        if (desk.hover === app) return;
        desk.hover = app;
        paintDockNow();
        ctx.invalidate();
    };

    desk.markOpened = (app) => {
        if (APP_ORDER.includes(app) && !desk.open.has(app)) {
            desk.open.add(app);
            paintDockNow();
        }
    };

    desk.title = (app) => APPS[app]?.log ?? app;
    // The home page's scroll: a frame only while it moves (stepPage is false at rest).
    desk.stopPageTick = ctx.addTick((dt) => desk.stepPage(dt));
    return desk;
}
