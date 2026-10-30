import * as THREE from 'three';
import { MUG, STEAM, COLORS, mm } from './layout.js';

/**
 * STEAM OFF THE COFFEE — without a single WebGL frame.
 *
 * The room renders on demand, so steam can't be geometry: anything animated in
 * the scene would hold the frame loop open for as long as the mug is in view.
 * Instead the wisps are a small DOM layer (SVG strokes, softened by an SVG blur
 * and a little turbulence, rasterised once) animated by CSS keyframes on
 * transform and opacity only, which the browser composites on its own. The
 * layer is pinned to the mug's rim by one CSS matrix, recomputed from a scene
 * tick — which runs only when the room renders anyway (a camera move, a
 * resize, a hover) and never asks for a frame itself.
 *
 *   layering   above the canvas (z-index 2), below the focus vignette (40),
 *              the overlay, the hint, the label and the header; screened
 *              (mix-blend-mode: screen) at low opacity, so it lightens what's
 *              behind it and never paints a grey box.
 *   the matrix maps the layer's millimetres to the screen through the live
 *              camera: its x along the camera's right, its y along the world's
 *              up (foreshortened as the camera looks down, never flatter than
 *              STEAM.minVerticalRatio), so the wisps are the same physical size
 *              in every shot.
 *   hides      when the rim is behind the camera or outside the canvas, when
 *              the coffee is under STEAM.minPx across, when something in the
 *              scene is between the camera and the rim (a raycast each time the
 *              camera lands, and every STEAM.occlusionEveryMs while it
 *              travels), and on STEAM.quietRoutes. Returning, it fades in.
 *   ?still=1   every wisp held at its STEAM phase: one fixed frame, set inline
 *              (wispFrame) — src/style.css turns every CSS animation off in still
 *              and reduced-motion pages, so a paused animation would show nothing.
 *   ?film=1    animated on fixed keyframes and phases. The film clock pins CSS
 *              animations from the moment it freezes, so a wisp's phase at
 *              film t = 0 still depends on how long the page took to settle
 *              (as the monitor's drifting dot does).
 *   reduced    prefers-reduced-motion: one faint wisp, held still (inline, as ?still=1).
 *   hidden tab animations paused (document.hidden).
 *   ?steam=0   no steam (to see the room without it).
 *
 * `steamTransform` is the DOM-free part (node checks import it).
 */

const UP = new THREE.Vector3(0, 1, 0);
const box = new THREE.Box3();
const point = new THREE.Vector3();
const PROBE_MM = 40; // the finite difference for the matrix: 4 cm along each axis
const CLASS = 'desk-steam';
const STYLE_ID = 'desk-steam-style';
const SVG_NS = 'http://www.w3.org/2000/svg';

// ---------------------------------------------------------------------------
// The maths (DOM-free)
// ---------------------------------------------------------------------------

/**
 * Where the steam layer goes for `camera` (matrices up to date), the mug's
 * world matrix and a viewport of width × height CSS px.
 *
 * @returns {{ base: {x,y}, matrix: number[6], pxPerMm: number, verticalPxPerMm: number,
 *             coffeePx: number, inFrame: boolean, inFront: boolean, world: THREE.Vector3 }}
 */
export function steamTransform(camera, mugMatrixWorld, width, height) {
    const world = new THREE.Vector3(...STEAM.base).applyMatrix4(mugMatrixWorld);
    const view = world.clone().applyMatrix4(camera.matrixWorldInverse);
    const inFront = view.z < -camera.near;
    const toPx = (point) => {
        const p = point.clone().project(camera);
        return { x: (p.x + 1) / 2 * width, y: (1 - p.y) / 2 * height };
    };
    const base = toPx(world);
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0);
    if (right.lengthSq() < 1e-12) right.set(1, 0, 0);
    right.normalize();
    const along = toPx(world.clone().addScaledVector(right, mm(PROBE_MM)));
    const up = toPx(world.clone().addScaledVector(UP, mm(PROBE_MM)));
    // Layer +x → screen, per mm; layer +y (down) → screen, per mm.
    let a = (along.x - base.x) / PROBE_MM;
    let b = (along.y - base.y) / PROBE_MM;
    let c = -(up.x - base.x) / PROBE_MM;
    let d = -(up.y - base.y) / PROBE_MM;
    const pxPerMm = Math.hypot(a, b);
    let verticalPxPerMm = Math.hypot(c, d);
    const floor = STEAM.minVerticalRatio * pxPerMm;
    if (verticalPxPerMm < floor) {
        // Seen from (nearly) above: keep a plausible column, perpendicular to the rim's x.
        const [ux, uy] = verticalPxPerMm > 1e-9 ? [c / verticalPxPerMm, d / verticalPxPerMm] : [-b / (pxPerMm || 1), a / (pxPerMm || 1)];
        c = ux * floor;
        d = uy * floor;
        verticalPxPerMm = floor;
    }
    const bx = STEAM.box.width / 2;
    const by = STEAM.box.height;
    const e = base.x - (a * bx + c * by);
    const f = base.y - (b * bx + d * by);
    const coffeePx = 2 * (MUG.radius - MUG.wall) / mm(1) * pxPerMm;
    const inFrame = inFront && base.x >= 0 && base.x <= width && base.y >= 0 && base.y <= height;
    return { base, matrix: [a, b, c, d, e, f], pxPerMm, verticalPxPerMm, coffeePx, inFrame, inFront, world };
}

/** Is anything drawn between the camera and the steam's base? The first hit, or null. */
export function firstOccluder(camera, scene, world, { exclude = null, raycaster = new THREE.Raycaster() } = {}) {
    const probe = world.clone().addScaledVector(UP, STEAM.probeLift);
    const origin = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const direction = probe.clone().sub(origin);
    const distance = direction.length();
    if (!(distance > 0)) return null;
    raycaster.set(origin, direction.normalize());
    raycaster.near = 0;
    raycaster.far = distance - mm(2);
    // Ticks run before the frame's render, which is where three brings world
    // matrices up to date: something added or moved since the last frame (a
    // module's meshes at mount) would still be at its old place.
    scene.updateMatrixWorld();
    const candidates = [];
    scene.traverseVisible((node) => {
        if (!node.isMesh || !node.geometry) return;
        if (node.userData?.visualGroup) return; // DeskScene's hit volumes
        if (exclude && isInside(node, exclude)) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        if (!materials.some(isOpaqueEnough)) return;
        // The segment against the mesh's world box first: three's own box test
        // is for the whole (infinite) ray, so the desk frame and the display —
        // 60k triangles each, lying along the ray BEYOND the mug — would be
        // walked triangle by triangle (11 ms a test; this makes it < 1 ms).
        if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
        box.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld);
        const entry = raycaster.ray.intersectBox(box, point);
        if (!entry || origin.distanceTo(entry) > raycaster.far) return;
        candidates.push(node);
    });
    return raycaster.intersectObjects(candidates, false)[0] ?? null;
}

function isInside(node, ancestor) {
    for (let n = node; n; n = n.parent) if (n === ancestor) return true;
    return false;
}

/** A material that would hide what's behind it: visible, writing colour, not a faint or additive film. */
function isOpaqueEnough(material) {
    if (!material || material.visible === false || material.colorWrite === false) return false;
    if (material.blending === THREE.AdditiveBlending) return false;
    if (material.transparent && material.opacity < 0.35) return false;
    return true;
}

/** The CSS for the wisps, from the STEAM numbers. */
export function steamCss() {
    const num = (v) => Number(v.toFixed(3));
    const frames = Object.entries(STEAM.keyframes).map(([name, list]) => {
        const steps = list.map(([at, x, y, sx, sy, k, o]) => `${num(at * 100)}% { transform: translate(${x}px, ${y}px) scale(${sx}, ${sy}) skewX(${k}deg); opacity: ${o}; }`);
        return `@keyframes ${CLASS}-${name} { ${steps.join(' ')} }`;
    });
    return `
.${CLASS} { position: fixed; left: 0; top: 0; width: ${STEAM.box.width}px; height: ${STEAM.box.height}px;
    z-index: 2; pointer-events: none; transform-origin: 0 0; mix-blend-mode: screen; overflow: visible;
    animation: ${CLASS}-in ${STEAM.fadeInMs}ms ease-out both; }
.${CLASS}[hidden] { display: none; }
.${CLASS}__wisp { position: absolute; overflow: visible; transform-origin: 50% 100%; opacity: 0;
    animation-timing-function: cubic-bezier(0.45, 0.05, 0.55, 0.95); animation-iteration-count: infinite; }
.${CLASS}__haze { position: absolute; border-radius: 50%; transform-origin: 50% 100%;
    background: radial-gradient(closest-side, ${hexToRgba(COLORS.steam, 0.34)}, ${hexToRgba(COLORS.steam, 0.12)} 55%, ${hexToRgba(COLORS.steam, 0)});
    animation: ${CLASS}-haze ${STEAM.haze.duration}s ease-in-out ${num(-STEAM.haze.phase * STEAM.haze.duration)}s infinite alternate; }
.${CLASS}.is-still, .${CLASS}.is-reduced { animation: none; }
.${CLASS}.is-still .${CLASS}__wisp, .${CLASS}.is-still .${CLASS}__haze,
.${CLASS}.is-reduced .${CLASS}__wisp, .${CLASS}.is-reduced .${CLASS}__haze,
.${CLASS}.is-paused .${CLASS}__wisp, .${CLASS}.is-paused .${CLASS}__haze { animation-play-state: paused; }
.${CLASS}.is-reduced .${CLASS}__wisp:not(:first-of-type) { display: none; }
@keyframes ${CLASS}-in { from { opacity: 0; } }
@keyframes ${CLASS}-haze { from { transform: translateY(1px) scale(0.92, 0.85); opacity: 0.55; } to { transform: translateY(-3px) scale(1.06, 1.1); opacity: 0.9; } }
${frames.join('\n')}
`;
}

const WISP_EASING = [0.45, 0.05, 0.55, 0.95]; // the wisps' animation-timing-function, per keyframe step
const HAZE_EASING = [0.42, 0, 0.58, 1];       // ease-in-out

/** CSS cubic-bezier(x1, y1, x2, y2) at progress x (0…1). */
function cubicBezier([x1, y1, x2, y2], x) {
    const at = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i += 1) {
        const mid = (lo + hi) / 2;
        if (at(x1, x2, mid) < x) lo = mid;
        else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
}

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * A wisp's frame at `t` (0…1 through its cycle), as the CSS animation would
 * draw it: { transform, opacity }. The held frame for ?still=1 and reduced
 * motion — set inline, because the page's `.desk-still *` / `.desk-reduced *`
 * rule (src/style.css) turns every CSS animation off, and a wisp with no animation
 * sits at its base opacity, 0.
 */
export function wispFrame(wisp, t = wisp.phase) {
    const list = STEAM.keyframes[wisp.keyframes];
    const p = ((t % 1) + 1) % 1;
    let i = 0;
    while (i < list.length - 2 && p > list[i + 1][0]) i += 1;
    const [a, b] = [list[i], list[i + 1]];
    const k = cubicBezier(WISP_EASING, (p - a[0]) / (b[0] - a[0] || 1));
    const [x, y, sx, sy, skew, opacity] = a.slice(1).map((v, j) => lerp(v, b[j + 1], k));
    const num = (v) => Number(v.toFixed(3));
    return { transform: `translate(${num(x)}px, ${num(y)}px) scale(${num(sx)}, ${num(sy)}) skewX(${num(skew)}deg)`, opacity: num(opacity) };
}

/** The haze's held frame (its animation alternates, so the first half-cycle runs forward). */
export function hazeFrame(t = STEAM.haze.phase) {
    const k = cubicBezier(HAZE_EASING, Math.min(1, Math.max(0, t)));
    const num = (v) => Number(v.toFixed(3));
    return { transform: `translateY(${num(lerp(1, -3, k))}px) scale(${num(lerp(0.92, 1.06, k))}, ${num(lerp(0.85, 1.1, k))})`, opacity: num(lerp(0.55, 0.9, k)) };
}

function hexToRgba(hex, alpha) {
    const value = parseInt(String(hex).replace('#', ''), 16); // '#rrggbb', sRGB as CSS wants it
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

// ---------------------------------------------------------------------------
// The layer (DOM)
// ---------------------------------------------------------------------------

function svgEl(tag, attributes = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    return node;
}

function buildWisp(wisp, index) {
    const id = `${CLASS}-${index}`;
    const svg = svgEl('svg', { viewBox: `0 0 ${wisp.w} ${wisp.h}`, width: wisp.w, height: wisp.h, 'aria-hidden': 'true', focusable: 'false' });
    svg.setAttribute('class', `${CLASS}__wisp`);
    const left = STEAM.box.width / 2 + wisp.x - wisp.w / 2;
    const top = STEAM.box.height - wisp.h + 4; // the foot 4 mm under the rim: it rises out of the cup
    const duration = wisp.duration;
    Object.assign(svg.style, {
        left: `${left}px`,
        top: `${top}px`,
        animationName: `${CLASS}-${wisp.keyframes}`,
        animationDuration: `${duration}s`,
        // A negative delay starts the wisp part-way through its cycle — the frame ?still=1 holds.
        animationDelay: `${Number((-wisp.phase * duration).toFixed(3))}s`
    });

    const defs = svgEl('defs');
    const gradient = svgEl('linearGradient', { id: `${id}-g`, gradientUnits: 'userSpaceOnUse', x1: 0, y1: wisp.h, x2: 0, y2: 0 });
    for (const [offset, alpha] of [[0, 0], [0.12, 0.55], [0.4, 0.8], [0.72, 0.4], [1, 0]]) {
        gradient.append(svgEl('stop', { offset, 'stop-color': COLORS.steam, 'stop-opacity': alpha * wisp.weight }));
    }
    const filter = svgEl('filter', { id: `${id}-f`, x: '-80%', y: '-20%', width: '260%', height: '140%', 'color-interpolation-filters': 'sRGB' });
    filter.append(
        svgEl('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.07 0.03', numOctaves: 2, seed: 11 + index * 7, result: 'noise' }),
        svgEl('feDisplacementMap', { in: 'SourceGraphic', in2: 'noise', scale: 7, xChannelSelector: 'R', yChannelSelector: 'G', result: 'curled' }),
        svgEl('feGaussianBlur', { in: 'curled', stdDeviation: 3 })
    );
    defs.append(gradient, filter);
    const group = svgEl('g', { filter: `url(#${id}-f)`, fill: 'none', stroke: `url(#${id}-g)`, 'stroke-linecap': 'round' });
    group.append(
        svgEl('path', { d: wisp.path, 'stroke-width': 16, opacity: 0.38 }), // the soft body
        svgEl('path', { d: wisp.path, 'stroke-width': 5, opacity: 0.85 })   // a brighter core
    );
    svg.append(defs, group);
    return svg;
}

function buildHaze() {
    const { w, h, lift } = STEAM.haze;
    const haze = document.createElement('div');
    haze.className = `${CLASS}__haze`;
    Object.assign(haze.style, {
        left: `${STEAM.box.width / 2 - w / 2}px`,
        top: `${STEAM.box.height - h / 2 - lift}px`,
        width: `${w}px`,
        height: `${h}px`
    });
    return haze;
}

function injectStyle() {
    if (document.getElementById?.(STYLE_ID)?.isConnected) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = steamCss();
    (document.head ?? document.documentElement ?? document.body).append(style);
}

/**
 * Builds the layer and wires it to the room. Returns { state(), update(), dispose() },
 * or null when there is no document to put it in.
 */
export function createSteam(ctx, mugGroup, { presetId = 'day' } = {}) {
    if (typeof document === 'undefined' || !document.body || !mugGroup) return null;
    const canvas = ctx.deskScene.renderer.domElement;
    const camera = ctx.camera.object ?? ctx.deskScene.camera;
    const raycaster = new THREE.Raycaster();
    const strength = (STEAM.strength[presetId] ?? STEAM.strength.day) * (ctx.reducedMotion && !ctx.still ? STEAM.reducedScale : 1);

    injectStyle();
    const root = document.createElement('div');
    root.className = CLASS;
    root.setAttribute('aria-hidden', 'true');
    if (ctx.still) root.classList.add('is-still');
    else if (ctx.reducedMotion) root.classList.add('is-reduced');
    root.style.opacity = String(Number(strength.toFixed(3)));
    root.hidden = true;
    const haze = buildHaze();
    const wisps = STEAM.wisps.map(buildWisp);
    if (ctx.still || ctx.reducedMotion) {
        // Held, inline: under ?still=1 and reduced motion the page turns every
        // CSS animation off (src/style.css), which would leave the wisps at opacity 0.
        const hold = (node, frame) => Object.assign(node.style, { animation: 'none', transform: frame.transform, opacity: String(frame.opacity) });
        hold(haze, hazeFrame());
        wisps.forEach((node, index) => {
            if (ctx.still || index === 0) hold(node, wispFrame(STEAM.wisps[index]));
            else node.style.display = 'none'; // reduced motion: one wisp
        });
    }
    root.append(haze, ...wisps);
    document.body.append(root);

    const state = {
        visible: false,
        reason: 'not yet placed',
        base: null,
        matrix: null,
        pxPerMm: 0,
        coffeePx: 0,
        occluder: null,
        strength,
        key: '',
        lastOcclusionAt: -Infinity,
        occlusions: 0,
        placements: 0
    };

    function show(visible, reason) {
        state.reason = reason;
        if (state.visible === visible) return;
        state.visible = visible;
        root.hidden = !visible; // display: none while hidden — nothing composited, nothing animating
    }

    function poseKey(width, height) {
        const parts = [width, height, ctx.route().hash];
        for (const matrix of [camera.matrixWorld, camera.projectionMatrix, mugGroup.matrixWorld]) {
            for (const value of matrix.elements) parts.push(Math.round(value * 1e5));
        }
        return parts.join(',');
    }

    let world = null; // the rim's centre (world) at the last placement, while it passes the frame checks
    let trailing = null; // a pending occlusion re-test (setTimeout), if the last one was throttled

    function testOcclusion(now) {
        state.lastOcclusionAt = now;
        state.occlusions += 1;
        const hit = firstOccluder(camera, ctx.scene, world, { exclude: mugGroup, raycaster });
        state.occluder = hit ? ownerName(hit.object) : null;
        if (state.occluder) show(false, `behind ${state.occluder}`);
        else show(true, 'in view');
    }

    /**
     * Re-place when the camera, the viewport, the mug or the route changed;
     * re-test occlusion when the camera lands, every STEAM.occlusionEveryMs while
     * it travels, and — for things that move while the camera doesn't (a print
     * laid down, the receipt) — at most every STEAM.occlusionRestMs on the
     * frames the room draws anyway.
     */
    function update({ force = false } = {}) {
        camera.updateMatrixWorld();
        mugGroup.updateWorldMatrix(true, false);
        const width = canvas.clientWidth || window.innerWidth;
        const height = canvas.clientHeight || window.innerHeight;
        const key = poseKey(width, height);
        const now = performance.now();
        const sinceTest = now - state.lastOcclusionAt;
        if (!force && key === state.key) {
            if (!world) return state;
            if (sinceTest >= STEAM.occlusionRestMs) testOcclusion(now);
            // Throttled: test once more when the wait is up, in case this was the last frame for a while.
            else trailing ??= setTimeout(() => {
                trailing = null;
                if (world) safeCall(() => testOcclusion(performance.now()));
            }, STEAM.occlusionRestMs - sinceTest);
            return state;
        }
        state.key = key;
        world = null;

        const route = ctx.route().hash;
        const placed = steamTransform(camera, mugGroup.matrixWorld, width, height);
        state.base = { x: placed.base.x, y: placed.base.y };
        state.matrix = placed.matrix;
        state.pxPerMm = placed.pxPerMm;
        state.coffeePx = placed.coffeePx;
        state.placements += 1;

        if (STEAM.quietRoutes.some((prefix) => route === prefix || route.startsWith(`${prefix}/`))) return show(false, `quiet at ${route}`), state;
        if (!placed.inFront) return show(false, 'behind the camera'), state;
        if (!placed.inFrame) return show(false, 'the mug is off screen'), state;
        if (placed.coffeePx < STEAM.minPx) return show(false, `too small (${placed.coffeePx.toFixed(1)} px)`), state;

        root.style.transform = `matrix(${placed.matrix.map((v) => Number(v.toFixed(4))).join(', ')})`;
        world = placed.world;
        const moving = Boolean(ctx.camera.isMoving?.());
        if (!moving || sinceTest >= STEAM.occlusionEveryMs || !state.visible) testOcclusion(now);
        else show(!state.occluder, state.occluder ? `behind ${state.occluder}` : 'in view');
        return state;
    }

    function safeCall(fn) {
        try {
            fn();
        } catch (error) {
            ctx.warn('steam placement failed; hiding it', error);
            show(false, 'failed');
        }
    }
    const safeUpdate = (options) => safeCall(() => update(options));

    // Runs only on frames the room draws anyway; never asks for one (returns false).
    const removeTick = ctx.addTick(() => {
        safeUpdate();
        return false;
    });

    const onVisibility = () => root.classList.toggle('is-paused', Boolean(document.hidden));
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();

    let resizeQueued = false;
    const onResize = () => {
        if (resizeQueued) return;
        resizeQueued = true;
        // Two frames: DeskScene updates the camera's aspect from a ResizeObserver.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            resizeQueued = false;
            safeUpdate({ force: true });
        }));
    };
    window.addEventListener('resize', onResize);
    safeUpdate({ force: true });

    return {
        root,
        update: safeUpdate,
        state: () => ({ ...state, key: undefined }),
        dispose() {
            removeTick?.();
            clearTimeout(trailing);
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('resize', onResize);
            root.remove();
        }
    };
}

function ownerName(object) {
    for (let n = object; n; n = n.parent) {
        if (n.userData?.deskObjectId) return n.userData.deskObjectId;
    }
    return object.name || object.type;
}
