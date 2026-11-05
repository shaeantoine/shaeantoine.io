import * as THREE from 'three';
import { loadGLTF } from '../loaders/gltf.js';
import { createRoom } from './room.js';
import { createRenderPipeline } from './renderPipeline.js';
import { createWindowEnvironment, createDaylight } from './lighting.js';
import { createRenderScheduler, invalidate, invalidateShadows } from './renderScheduler.js';
import { applyMaterialOverrides, logMaterialInventory } from './materialOverrides.js';
import { activePreset } from './timeOfDay.js';
import { buildPartsGroup } from './partMesh.js';
import { createPointerSource } from '../cursor/pointerSource.js';
import { createFrameStats, createQualityGovernor } from './perfMonitor.js';
import { createPerfHud, perfHudRequested } from './perfHud.js';
import { textureBudgetHeight } from './textureBudget.js';
// Imported as deviceTier: `tier` inside this file is the quality governor's rung.
import { tier as deviceTier, phoneTier } from '../core/flags.js';

/**
 * The most pixels this scene will shade in one frame, whatever the display
 * offers.
 *
 * ~8.3 MP is 4K. Sized so that no laptop, and no ordinary window on a 5K panel,
 * ever hits it — those render at their display's true resolution and stay
 * pixel-exact. What it does catch is a 5K or 6K display filled edge to edge
 * (14.7 MP and up), where GTAO's per-pixel cost genuinely bites and dropping to
 * ~0.75 linear is the better of the two bad options.
 *
 * Deliberately NOT expressed as a maximum devicePixelRatio. See setSize.
 *
 * LOWERING THIS IS USUALLY THE WRONG INSTINCT, and it is worth writing down why,
 * because it is the first knob anyone reaches for. A static cap cannot tell a
 * slow machine from a large display; all it can do is trade sharpness for speed
 * on every machine with a big screen, including the ones that were coping.
 * Since the cap resamples the entire frame by a non-integer factor, the cost of
 * being wrong is exactly the "slightly soft" failure the whole of `setSize`
 * below is written to avoid — paid by a fast machine, for nothing.
 *
 * The measured path is strictly better and now exists: scene/perfMonitor.js
 * watches real delivered frame intervals and scales quality only where frames
 * are actually being missed, on the machine that is actually missing them. So
 * this stays high enough that no current laptop trips it (a 16" MacBook Pro
 * full-screen is 7.5 MP), and the governor handles the rest through
 * `qualityRenderScale` below.
 */
const MAX_DRAWING_BUFFER_PIXELS = 8.3e6;

/**
 * What the phone tier (core/flags.js `tier`) changes about the renderer. All of
 * it is decided before the first allocation and none of it is revisited; the
 * desktop is built exactly as it was, by passing none of it.
 *
 * MEMORY, NOT SPEED, IS WHAT THESE ARE FOR, which is why they are a tier and
 * not more rungs on the quality governor. The governor answers "is this
 * machine dropping frames?" by watching it. Nothing can watch a tab run out of
 * memory, because iOS answers that by ending the tab: the loading bar nearly
 * finishes, Safari reloads the page and says "A problem occurred". By the time
 * there is anything to measure there is no page to measure it in, so the
 * phone's budget has to be right up front.
 *
 *   maxPixelRatio      2      The buffer is drawn at no more than 2 device
 *                             pixels per CSS pixel: 780 x 1688 rather than
 *                             1170 x 2532 at 390 x 844 @3, 1.3 MP instead of
 *                             3.0, and every screen-sized target scales with
 *                             it. The compositor stretches it 1.5x onto the
 *                             panel — a non-integer resample, the softness
 *                             setSize below goes to such lengths to avoid on a
 *                             desktop — and on a 460 ppi panel at arm's length
 *                             it is the cheapest 2.25x of memory in the scene.
 *   maxPixels          2.2 MP The phone tier's own area budget, for the devices
 *                             the ratio alone does not bring down — an iPad Pro
 *                             at DPR 2 is 5.7 MP. No phone reaches it; the
 *                             largest at DPR 2 is ~1.7 MP. SET BY THE CANVASES,
 *                             NOT THE FRAME: every tablet lands on this area,
 *                             so its shorter side is every tablet's texture
 *                             budget (textureBudget.js) — 1284 px on a 12.9"
 *                             iPad, the squarest and so the largest. At 2.5 MP
 *                             (1369 px) a tour of every route there held 222 MB
 *                             of canvases, against 224 MB at the low end of
 *                             iOS's per-tab canvas cap: the last page opened
 *                             came up at a quarter of its pixels (core/draw.js
 *                             context2d). At 2.2 the same tour holds 201 MB,
 *                             for 6% off the frame's resolution in each axis.
 *                             The cap on a real iPad is likely higher than
 *                             224 MB; this was set against the worst case.
 *   samples            2      MSAA on the composer's one multisampled target,
 *                             half the renderbuffers of 4x (renderPipeline.js).
 *   ambientOcclusion   off    No GTAO pass at all, and the governor starts on
 *                             its `no-ao` rung to match (perfMonitor.js).
 *   shadow maps        1024² for the key, 512² for each gallery spot
 *                             (lighting.js), down from 2048² and 1024².
 *
 * Together they take the render targets at 390 x 844 @3 from ~320 MB to
 * ~95 MB (by the same estimate perfHud.js makes): the composer's targets
 * shrink with the area and again with the samples, the AO pass's are never
 * built, and the shadow maps go from 48 MB to 12. The canvases and the GLB
 * textures, the rest of the tab, are cut by the texture budget's portrait
 * rule (scene/textureBudget.js) and the phone texture cap (loaders/gltf.js).
 */
const PHONE_RENDER = Object.freeze({
    maxPixelRatio: 2,
    maxPixels: 2.2e6,
    samples: 2,
    ambientOcclusion: false,
    keyShadowMapSize: 1024,
    artShadowMapSize: 512
});

/**
 * The phone tier's cut of a `width` x `height` device-pixel box drawn at
 * `ratio` device pixels per CSS pixel: down to PHONE_RENDER.maxPixelRatio, and
 * then to PHONE_RENDER.maxPixels if that is still too many. A box that needs
 * neither comes back untouched, so a DPR-2 phone keeps its exact device box.
 *
 * Exported for the node harness, whose stand-in scene has to size its buffer
 * the way this one does or every canvas it measures is sized from the wrong
 * height.
 */
export function phoneBufferSize(width, height, ratio) {
    let scale = Math.min(1, PHONE_RENDER.maxPixelRatio / (ratio || 1));
    const pixels = width * height * scale * scale;
    if (pixels > PHONE_RENDER.maxPixels) scale *= Math.sqrt(PHONE_RENDER.maxPixels / pixels);
    if (scale >= 1) return { width, height };
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale))
    };
}

/**
 * The texture budget height this scene WILL publish, worked out from the
 * window, for the canvases built before its first layout.
 *
 * WHY A PREDICTION, when the old answer before layout was "0, use the window".
 * That gap is not a moment: the canvas is unhidden and this scene built in one
 * synchronous run, the modules mount right after it off warm caches, and
 * ResizeObserver reports the first box only at the next rendering step — so
 * the room's own `parts` are always sized in it, and whatever the modules build
 * before that step is too. The window's device height was a fine guess for a
 * desktop, whose buffer it is. On the phone tier it is wrong by the tier's
 * whole cut — a DPR-3 phone's window is 1.5x the buffer in each axis — and a
 * boot sized at DPR 3 is precisely the allocation the tier exists to stop.
 *
 * So the phone tier's cut is applied here as setSize applies it. The desktop's
 * 8.3 MP clamp is not, deliberately: the window-based guess never applied it,
 * it engages only on a 5K-class panel filled edge to edge, and leaving it out
 * keeps every desktop canvas exactly the size it was — on a desktop this is
 * `min(innerWidth, innerHeight) * devicePixelRatio`, which in a landscape
 * window is the old fallback to the bit (scene/textureBudget.js).
 */
export function predictTextureBudgetHeight() {
    if (typeof window === 'undefined') return 0;
    const ratio = window.devicePixelRatio || 1;
    let width = window.innerWidth * ratio;
    let height = window.innerHeight * ratio;
    if (phoneTier) ({ width, height } = phoneBufferSize(width, height, ratio));
    return textureBudgetHeight(width, height) || 0;
}

// A dim, slightly warm grey rather than the old near-white. This only shows
// through slivers past the wall, but at the new exposure a bright background
// would read as a light leak around the edges of the room. Per time of day,
// since what counts as "reads as a leak" depends on what the room is exposed
// for — see scene/timeOfDay.js.
//
// The same goes for the two knobs below it. Image-based lighting is what gives
// every material a *directional* ambient distribution to sample, so edges catch
// light, glossy surfaces get a real reflection, and a face turned away from the
// window goes dim on its own. The environment is authored dark with one bright
// panel (see lighting.js), so `environmentIntensity` sits near 1.0 and the
// environment itself carries the balance — rather than dimming a bright studio
// box down. Exposure stays at 1.0 in daylight and lifts slightly after dark,
// where every source in the room is dimmer.

// ACES is the photographic choice: it rolls highlights off instead of clipping
// them flat at 1.0, which is most of what separates "rendered" from "shot".
//
// IT IS ALSO WHAT MAKES IN-SCENE TYPE LOOK DINGY, and the numbers are worth
// having here because the flag people reach for does not help. `toneMapped:
// false` on a material is inert whenever the frame goes through a composer
// (WebGLRenderer gates it on `_currentRenderTarget === null`), and
// scene/renderPipeline.js always does, so OutputPass applies this curve to the
// monitor and the sheets along with the room.
//
// For an unlit MeshBasicMaterial carrying an sRGB canvas, the round trip
// decode -> curve -> encode is what the eye sees, and at exposure 1.0:
//
//   surface            authored     ACES    Neutral    None
//   monitor panel           250      212        240     250
//   monitor ink              20        4         20      20
//
// Those two rows were read off a real frame, not computed. Printed paper goes
// the same way: the one printed surface the original site left on the desk is
// the paper stack's `manuscript` stock — #fbfaf7 sheet, #1d2024 ink (see pageCanvas.js
// PAPER_STOCKS) — and ACES treats it as it treats the monitor, pulling the
// sheet off white and crushing the near-black ink below what was authored. The
// table used to carry a measured pair for the retired notebook stock; no
// equivalent pair has been measured for this one, so none is quoted.
//
// ACES cannot reach the DOM's white at any authored colour — ACES(linear 1.0)
// encodes to 214 — so the "display" in this room is structurally a grey
// rectangle. NeutralToneMapping is within 4% of parity and leaves ink exactly
// as authored, while still rolling off highlights.
//
// NoToneMapping would be exact (it makes the round trip an identity) and is NOT
// recommended: the room is lit by a SpotLight at intensity 620-780 with
// physically correct inverse-square decay, so lit surfaces sit well above
// linear 1.0 and would clip flat. Taking it would mean re-authoring every light
// and exposure across all four TIME_PRESETS by eye.
//
// Swap to THREE.NeutralToneMapping if the near-white palette reads too
// warm/contrasty or the panel reads grey; THREE.AgXToneMapping is a flatter
// filmic alternative. Check all four presets and the window panel in
// lighting.js after any change.
const TONE_MAPPING = THREE.ACESFilmicToneMapping;

// Tunable once the scene renders:
//
// HOW FAR AN OBJECT RISES IS THE OBJECT'S BUSINESS. One number for the whole
// desk works while everything clickable is monitor-sized and stops working the
// moment something is 8 mm thick: a badge raised 0.06 is floating eight card
// thicknesses off the desk, which does not read as "this is hoverable", it
// reads as broken physics. So this is the default and an object may name its
// own (`hover: { lift }` in content/deskObjects.js). Keep them proportional to
// the object — a couple of millimetres of real-world lift.
const HOVER_LIFT_Y = 0.06;
const HOVER_EMISSIVE = 0x141414; // {colors.primary}
const HOVER_EMISSIVE_INTENSITY = 0.18;


/**
 * Hover tinting, and putting it back afterwards.
 *
 * THE BUG THIS REPLACES. The old pair of calls was `setGroupEmissive(group,
 * HOVER_EMISSIVE, 0.18)` on hover and `setGroupEmissive(group, 0x000000, 0)`
 * on un-hover — "restore" was hardcoded as black, on the assumption that black
 * is what every material started at. The display's screen breaks that
 * assumption: apple_studio_display.glb ships its panel with
 * `emissiveFactor: [1, 1, 1]`, which is the white glow that makes the monitor
 * read as powered on. Hovering it overwrote that glow with a dark grey, and
 * un-hovering wrote black over it permanently — so the screen lit up on load,
 * went dark the first time the pointer crossed it, and never came back for the
 * rest of the session.
 *
 * Two changes fix it, and the second matters as much as the first:
 *
 *   1. The rest value is captured off the material the first time it is
 *      tinted, and restored verbatim afterwards.
 *   2. A material that is already self-lit is left alone entirely. The hover
 *      tint exists to put a faint rim-light on surfaces that have none; on a
 *      surface that is its own light source it can only ever subtract, which
 *      is the opposite of what hovering is supposed to signal.
 */
function restEmissiveOf(material) {
    // Stashed on the material rather than in a Map keyed by it: materials are
    // cloned per object instance at load (see attachModel), so this rides along
    // with the clone and cannot be orphaned by disposal.
    material.userData.restEmissive ??= {
        hex: material.emissive.getHex(),
        intensity: material.emissiveIntensity
    };
    return material.userData.restEmissive;
}

function eachEmissiveMaterial(group, visit) {
    group.traverse((node) => {
        if (!node.isMesh) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
            if (!material.emissive) continue; // MeshBasicMaterial — the screen canvases — has none
            visit(material);
        }
    });
}

function applyHoverEmissive(group) {
    eachEmissiveMaterial(group, (material) => {
        if (restEmissiveOf(material).hex !== 0x000000) return; // already self-lit; leave it be
        material.emissive.setHex(HOVER_EMISSIVE);
        material.emissiveIntensity = HOVER_EMISSIVE_INTENSITY;
    });
}

function restoreGroupEmissive(group) {
    eachEmissiveMaterial(group, (material) => {
        const rest = material.userData.restEmissive;
        if (!rest) return; // never tinted, so nothing to put back
        material.emissive.setHex(rest.hex);
        material.emissiveIntensity = rest.intensity;
    });
}

/**
 * Loads a desk object's .glb, clones its materials (so per-instance hover
 * emissive doesn't leak into the shared GLTFLoader cache), uniformly scales
 * it to fit `model.targetSize` (its largest bounding-box dimension), and
 * rests it at the group's local origin — bottom-down by default, or
 * top-down (`model.restAt === 'top'`) for the desk surface itself, so
 * everything else can keep resting at world y=0 regardless of which model
 * is standing in for the desk.
 *
 * Returns a promise that settles when the model is attached — or when it has
 * failed to load, which counts the same. The scene is held back from view
 * until every one of these has settled (see `whenReady`), and a model that
 * 404s would otherwise hold the loading veil up forever over a room that is
 * only missing one prop.
 */
function attachModel(group, model, onLoaded, onAttached) {
    return loadGLTF(model.url).then((root) => {
        root.traverse((node) => {
            if (!node.isMesh) return;
            node.castShadow = true;
            node.receiveShadow = true;
            node.material = Array.isArray(node.material)
                ? node.material.map((material) => material.clone())
                : node.material.clone();
        });

        if (import.meta.env?.DEV) logMaterialInventory(model.url, root);
        applyMaterialOverrides(root, model.material);

        if (model.targetSize) {
            const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0) root.scale.multiplyScalar(model.targetSize / maxDim);
        }

        const restingBox = new THREE.Box3().setFromObject(root);
        const height = restingBox.max.y - restingBox.min.y;
        root.position.x -= (restingBox.min.x + restingBox.max.x) / 2;
        root.position.z -= (restingBox.min.z + restingBox.max.z) / 2;
        root.position.y -= model.restAt === 'top' ? restingBox.max.y : restingBox.min.y;

        group.add(root);
        onLoaded?.(model.restAt === 'top' ? -height : 0);
        onAttached?.();
        // A model arriving is the one scene change nothing else can predict
        // the timing of, and with frames now requested rather than assumed,
        // an un-announced arrival would simply never be drawn.
        invalidateShadows();
    }, (error) => {
        console.error(`Failed to load desk object model "${model.url}"`, error);
    });
}

/**
 * Builds the Three.js renderer/scene/camera, every desk object as a Group of
 * primitive meshes, and wires pointer raycasting for hover/click.
 *
 * @param {HTMLCanvasElement} canvasEl
 * @param {object[]} deskObjects from src/content/deskObjects.js
 * @param {{
 *   onEnterFocus: (objectId) => void,
 *   onHoverChange: (info: {id, label} | null) => void,
 *   onObjectLoaded?: (objectId) => void
 * }} callbacks
 */
export function createDeskScene(canvasEl, deskObjects, { onEnterFocus, onHoverChange, isFocusActive, onObjectLoaded }) {
    /**
     * The height of the buffer actually being drawn, in device pixels, after
     * the clamps in setSize. Canvas-textured surfaces size themselves against
     * it and its width — through textureBudgetHeightNow, below; see
     * scene/textureBudget.js. Zero until the first layout, which is why every
     * reader treats a falsy value as "not measured yet" rather than as a real
     * height.
     *
     * DECLARED UP HERE, above every reader, on purpose. `let` is hoisted into a
     * temporal dead zone rather than to `undefined`, so a declaration sitting
     * further down this factory than the object-building loop that reads it
     * does not evaluate to zero — it throws ReferenceError as the scene is
     * built, and the page renders empty white with only the DOM header on it.
     */
    let drawingBufferHeight = 0;
    /** Its width, alongside, for the texture budget — see textureBudgetHeightNow. */
    let drawingBufferWidth = 0;

    /**
     * What canvas textures are budgeted against: the shorter side of the
     * buffer being drawn once it is measured, and the prediction of it before
     * then. Published as getTextureBudgetHeight, and handed to the room's own
     * `parts` below.
     *
     * KEPT APART FROM getDrawingBufferHeight on purpose. That one means "the
     * height of the buffer being drawn, 0 until measured", and stays meaning
     * it; this one is a budget, which in an upright window is the width (see
     * scene/textureBudget.js textureBudgetHeight) and is never 0 in a browser.
     * A function declaration, so hoisting makes it callable from the
     * object-building loop below — the variables it reads are declared above
     * it, for the reason given on drawingBufferHeight.
     */
    function textureBudgetHeightNow() {
        if (drawingBufferHeight) return textureBudgetHeight(drawingBufferWidth, drawingBufferHeight);
        return predictTextureBudgetHeight();
    }

    /**
     * The quality governor's multiplier on the drawing buffer, 1 until it has
     * evidence this machine needs less. Read by `setSize`; written only by the
     * tier change handler below.
     */
    let qualityRenderScale = 1;

    // Defends against a second live renderer ever being bound to the same
    // canvas — e.g. if a dev-server HMR replay re-runs this module without a
    // full page reload. A `deskScene` guard in the caller (the original
    // site's main.js kept one) can't catch that, since a re-run starts with a
    // fresh `null`. Stashing the active
    // instance on the DOM node itself survives across module re-executions.
    canvasEl.__deskScene?.dispose();

    const preset = activePreset();

    // `antialias` is deliberately OFF, and that is not a quality regression.
    // Everything renders through the composer (see scene/renderPipeline.js), so
    // the canvas's own multisampled buffer is never the render destination —
    // MSAA is requested on the composer's target instead. Asking for it here as
    // well allocated a full multisampled default framebuffer that nothing ever
    // drew into: on a 2x 1512-wide viewport that is roughly 95 MB of VRAM for
    // nothing, and Safari is the browser least able to shrug that off.
    //
    // `powerPreference` matters on any Mac with two GPUs, where the default
    // leaves the choice to the driver and a heavy scene can end up on the
    // integrated one.
    const renderer = new THREE.WebGLRenderer({
        canvas: canvasEl,
        antialias: false,
        powerPreference: 'high-performance'
    });
    renderer.toneMapping = TONE_MAPPING;
    renderer.toneMappingExposure = preset.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Nothing on this desk moves on its own, so re-rendering the depth maps
    // every frame is pure waste — they would produce a bit-identical result.
    // The scheduler decides when geometry has actually moved and sets
    // `needsUpdate` for exactly those frames (see the render callback below).
    // That flag is global, so it covers the key's 2048² and both gallery spots'
    // 1024² together (1024² and 512² on the phone tier — see PHONE_RENDER).
    renderer.shadowMap.autoUpdate = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(preset.background);

    // Prefilter the window environment into a mipmapped radiance map once, up
    // front. The source scene and the PMREM generator are both disposable
    // immediately afterwards — only the resulting texture is kept, so this
    // costs nothing per frame.
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const environmentScene = createWindowEnvironment();
    const environmentTexture = pmremGenerator.fromScene(environmentScene, 0.04).texture;
    environmentScene.dispose();
    pmremGenerator.dispose();
    scene.environment = environmentTexture;
    scene.environmentIntensity = preset.environmentIntensity;

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);

    createDaylight(scene, phoneTier ? {
        keyShadowMapSize: PHONE_RENDER.keyShadowMapSize,
        artShadowMapSize: PHONE_RENDER.artShadowMapSize
    } : undefined);

    // Read once and threaded to everything that samples a texture at a glancing
    // angle — the room's surfaces, and any part carrying art.
    const anisotropy = renderer.capabilities.getMaxAnisotropy();
    const room = createRoom({ anisotropy });
    scene.add(room.group);

    const objectsById = new Map();
    // Hit-test proxies, kept separate from the visual groups above. The
    // visual group's position is what animates on hover (see setHovered);
    // if raycasting tested that same geometry, the lift itself would shift
    // the object's screen-space silhouette out from under the cursor right
    // at its edge, flipping hover on/off every frame. Each proxy is an
    // invisible box frozen at the object's rest bounding box, so hover
    // detection never reacts to the visual effect it's driving.
    const clickableGroups = [];
    // The same frozen box, kept for positioning screen-space chrome. See
    // getObjectScreenBox for why it can't be measured live.
    const restBoxes = new Map();

    function addHitbox(group, object) {
        if (!object.clickable) return;
        const box = new THREE.Box3().setFromObject(group);
        restBoxes.set(object.id, box.clone());
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const hitbox = new THREE.Mesh(
            new THREE.BoxGeometry(size.x || 0.01, size.y || 0.01, size.z || 0.01)
        );
        hitbox.position.copy(center);
        hitbox.visible = false;
        hitbox.userData.deskObjectId = object.id;
        hitbox.userData.label = object.label;
        hitbox.userData.visualGroup = group;
        scene.add(hitbox);
        clickableGroups.push(hitbox);
    }

    // One entry per model-backed object, settling as each is attached. What
    // `whenReady` waits on — see there for why the scene needs a "finished"
    // moment at all.
    const modelLoads = [];

    for (const object of deskObjects) {
        const group = new THREE.Group();
        group.position.set(...object.position);
        if (object.rotation) group.rotation.set(...object.rotation);
        // A desk object may carry EITHER a model or parts, and this loop does
        // not assume which. Nothing on the desk carries both today — the two
        // retired books did, one .glb dressed two ways, and the dressing was
        // what told them apart — but parts are still added first, so the moment
        // something does again, a model arriving late lands beside them rather
        // than under them.
        if (object.parts) group.add(buildPartsGroup(object.parts, anisotropy, textureBudgetHeightNow()));
        if (object.model) {
            modelLoads.push(attachModel(group, object.model, object.definesFloor
                ? (localFloorY) => {
                    room.setFloorY(group.position.y + localFloorY);
                    invalidateShadows(); // the room becomes visible here for the first time
                }
                : undefined,
                () => {
                    addHitbox(group, object);
                    // Announced strictly after the hitbox is frozen. Anything
                    // that attaches decoration to a loaded object — the resting
                    // screen on the display — would otherwise be measured into
                    // the object's own rest bounds, widening the box that the
                    // hover tooltip (and the original site's focus arrows)
                    // are pinned to.
                    onObjectLoaded?.(object.id);
                }));
        }
        group.userData.deskObjectId = object.id;
        group.userData.hoverLift = object.hover?.lift ?? HOVER_LIFT_Y;
        group.userData.category = object.category;
        group.userData.clickable = object.clickable;
        group.userData.label = object.label;
        scene.add(group);
        objectsById.set(object.id, group);
        if (!object.model) addHitbox(group, object);
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    // The canvas's single pointer listener, shared with DeskCursor, the
    // router (src/main.js) and the modules (ctx.pointer) through
    // `instance.pointer`. @see cursor/pointerSource.js
    const pointerSource = createPointerSource(canvasEl);
    const liftOffset = new THREE.Vector3();
    let hovered = null;
    // Groups currently sitting at their raised height, and the one being held
    // up by focus. See refreshLift.
    const liftedGroups = new Set();
    let heldGroup = null;

    // The phone tier is decided here, before the pipeline exists, because what
    // it changes — the AO pass, the samples — is what the pipeline allocates on
    // construction. See PHONE_RENDER.
    const renderPipeline = createRenderPipeline(renderer, scene, camera, phoneTier ? {
        ambientOcclusion: PHONE_RENDER.ambientOcclusion,
        samples: PHONE_RENDER.samples
    } : undefined);

    // -----------------------------------------------------------------------
    // Measured quality
    // -----------------------------------------------------------------------
    // Nothing above this line knows how fast the machine it is running on is.
    // This is the part that finds out, and the part that is allowed to spend
    // image quality to fix it. @see scene/perfMonitor.js for the reasoning
    // behind the budget, the window and the one-way ratchet.
    const frameStats = createFrameStats();
    const governor = createQualityGovernor({
        // On the rung that matches a pipeline built without AO, so the ladder's
        // first step down cannot turn AO back on. Undefined — the top — on a
        // desktop.
        start: phoneTier ? 'no-ao' : undefined,
        onChange(tier) {
            console.info(`[desk] Sustained frames over budget — dropping to quality tier "${tier.name}".`);
            renderPipeline.setAoScale(tier.aoScale);
            renderPipeline.setAmbientOcclusionEnabled(tier.ambientOcclusion);
            if (tier.renderScale === qualityRenderScale) {
                // AO changed but the buffer did not, so nothing reallocated the
                // frame and nothing else is going to ask for the redraw that
                // shows it.
                invalidate();
                return;
            }
            qualityRenderScale = tier.renderScale;
            setSize(); // reallocates, and invalidates on its own way out
        }
    });

    const bufferSize = new THREE.Vector2();
    const perfHud = perfHudRequested()
        ? createPerfHud({
            renderer,
            stats: frameStats,
            governor,
            pipeline: renderPipeline,
            getBufferSize: () => renderer.getDrawingBufferSize(bufferSize),
            deviceTier
        })
        : null;

    /**
     * The canvas's box in EXACT device pixels, when the browser will tell us.
     *
     * THIS IS THE WHOLE CRISPNESS PROBLEM. `clientWidth`/`clientHeight` are
     * rounded to whole CSS pixels, so sizing the drawing buffer from
     * `clientWidth * devicePixelRatio` is only correct when the element's box
     * happens to land on an integer CSS boundary. When it doesn't — a viewport
     * of 1512.5 CSS px, say — the backing store comes out 3026 device px for a
     * box that occupies 3025, and the compositor resamples the entire frame by
     * a non-integer factor to fit. One device pixel of disagreement is enough:
     * the result is a bilinear resample of every pixel on screen, which reads
     * exactly as "slightly soft" and as nothing else.
     *
     * Whether it bites is down to whether a given browser's viewport lands on a
     * fraction, which is why this can look fine in one browser and soft in
     * another on the same machine and the same display. Safari's inner height
     * in particular is routinely fractional, because it is whatever is left
     * after the toolbar and tab bar.
     *
     * `devicePixelContentBoxSize` is the right answer and exists for precisely
     * this: the box in real device pixels, already integral, no ratio
     * arithmetic and nothing to round. It has to be asked for explicitly at
     * observe() time — see below.
     *
     * WHEN IT IS NOT THERE, the fallback must not go back to `clientWidth`.
     * Safari (measured: DPR 2.5, a 1049.5999755859375 x 162.40000915527344 box)
     * does not supply the entry, and the rounded path gives 2625 x 405 where the
     * true box is 2624 x 406 — wrong on both axes, and still a resample, just a
     * small one.
     *
     * `getBoundingClientRect` keeps the fraction, which is all that was missing.
     * Rounding the EDGES rather than the width is what makes it exact: a box's
     * device-pixel width depends on where it starts, so `round(right * dpr) -
     * round(left * dpr)` is the count of device pixels it actually covers, and
     * `round(width * dpr)` is only the same number when the left edge happens to
     * land on one. For this canvas it always does — it is `position: fixed;
     * inset: 0` and untransformed — but writing it the general way costs nothing
     * and does not quietly break if it is ever moved.
     */
    function devicePixelBox(entry, ratio) {
        const box = entry?.devicePixelContentBoxSize?.[0];
        if (box) return { width: box.inlineSize, height: box.blockSize };

        const rect = canvasEl.getBoundingClientRect();
        return {
            width: Math.round(rect.right * ratio) - Math.round(rect.left * ratio),
            height: Math.round(rect.bottom * ratio) - Math.round(rect.top * ratio)
        };
    }

    function setSize(entries) {
        const cssWidth = canvasEl.clientWidth;
        const cssHeight = canvasEl.clientHeight;
        // The canvas starts `hidden`, and a display:none element has no box.
        // Sizing to 0 would make camera.aspect NaN and allocate zero-area
        // targets, both of which survive to poison the first real frame.
        if (cssWidth === 0 || cssHeight === 0) return;

        // The canvas's box is exactly what changed, and the pointer source
        // caches it. Invalidated here rather than from its own resize listener
        // so it is refreshed by the observer that sees the canvas itself, not
        // just the window.
        pointerSource.invalidateRect();

        const ratio = window.devicePixelRatio || 1;
        const exact = devicePixelBox(entries?.[0], ratio);
        let width = exact.width;
        let height = exact.height;

        // THE PHONE TIER'S CUT, and the one place this function knowingly
        // gives up the exact device box everything below defends. On a phone
        // the box is affordable in shading and not in memory, which no frame
        // timing can see — see PHONE_RENDER for why that is a tier rather than
        // a measurement, and phoneBufferSize for the arithmetic. Skipped
        // entirely on a desktop.
        if (phoneTier) ({ width, height } = phoneBufferSize(width, height, ratio));

        // BUDGETED BY AREA, NOT BY PIXEL RATIO, and the difference is the whole
        // point of this block.
        //
        // This used to clamp the ratio at 2, which is the wrong axis: what a
        // frame costs is the number of pixels shaded, and the ratio says
        // nothing about that on its own. A 2.5x DPR in a small window is
        // cheaper than a 2x DPR filling a large one.
        //
        // Clamping the ratio also fails in the one way a resolution cap must
        // never fail — it does not save anything. Safari reports DPR 2.5 (a
        // Retina panel at 125% page zoom), so a 1050 x 162 CSS box wants a
        // 2624 x 406 buffer: 1.07 megapixels, less than Chrome was already
        // drawing at DPR 2. The old clamp cut it to 2100 x 324 anyway, and the
        // compositor then stretched that back up by 1.25x to fill the box. The
        // scene paid for almost exactly the same number of pixels and got a
        // resampled, visibly soft image for it — which is precisely the "Chrome
        // looks crisper than Safari" report this came from.
        //
        // An area budget only engages where there is real work to avoid: a 5K
        // panel filled edge to edge is 14.7 MP, and GTAO's prepass, 16 AO
        // samples and denoise are all per-pixel. Below the budget, every
        // machine renders at its display's true resolution.
        const pixels = width * height;
        if (pixels > MAX_DRAWING_BUFFER_PIXELS) {
            const scale = Math.sqrt(MAX_DRAWING_BUFFER_PIXELS / pixels);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
        }

        // The measured reduction, applied on top of the static one. Normally 1
        // and therefore normally a no-op: it only leaves 1 when the governor
        // has watched this machine miss the frame budget at every cheaper
        // setting it had available. @see scene/perfMonitor.js
        if (qualityRenderScale !== 1) {
            width = Math.max(1, Math.round(width * qualityRenderScale));
            height = Math.max(1, Math.round(height * qualityRenderScale));
        }

        // Pixel ratio 1, deliberately: the device-pixel conversion has already
        // been done above, exactly, and handing three a ratio as well would
        // make it redo the same multiplication against the rounded CSS size —
        // through a `Math.floor`, which is the rounding this exists to avoid.
        // The canvas's CSS size is owned by the stylesheet (.desk-canvas is
        // 100%/100%), so `updateStyle: false` leaves the element's box alone
        // and the backing store maps onto it 1:1.
        renderer.setPixelRatio(1);
        renderer.setSize(width, height, false);
        renderPipeline.setSize(width, height, 1);
        // Published for the canvas-texture budget. It wants the BUDGETED height
        // rather than `innerHeight * devicePixelRatio`, because the area clamp
        // above is exactly the case where the two differ — and sizing a page to
        // a buffer bigger than the one being drawn is how a texture ends up
        // over-resolved on the machine least able to afford it. The width
        // rides along so the budget can take the shorter of the two
        // (textureBudgetHeightNow); the height alone stays what
        // getDrawingBufferHeight reports.
        drawingBufferHeight = height;
        drawingBufferWidth = width;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        // Every render target was just reallocated, so the next several frames
        // will pay for re-uploads that say nothing about this machine's steady
        // state. Measuring them would be measuring the resize.
        governor.reset();
        // Resizing reallocates the composer's targets, so the previous frame's
        // contents are gone; the shadow map is light-relative and survives.
        invalidate();
    }

    /**
     * Raises or lowers a group to match whether it currently ought to be
     * raised, tracking which ones are up so the offset can never be applied
     * or removed twice.
     *
     * The raise has two independent reasons to be on — the pointer is over
     * the object, or the object is the focused subject — and they overlap in
     * both directions: focus takes the cursor away from an object that was
     * hovered, and the cursor can land back on it while the camera is still
     * pulling out. Deriving the height from "should it be up?" rather than
     * toggling it at each event is what keeps those crossings from leaving
     * the object a step high or low.
     */
    function refreshLift(group) {
        const shouldLift = group === heldGroup || hovered?.userData.visualGroup === group;
        if (liftedGroups.has(group) === shouldLift) return;
        const lift = group.userData.hoverLift ?? HOVER_LIFT_Y;
        group.position.y += shouldLift ? lift : -lift;
        if (shouldLift) liftedGroups.add(group);
        else liftedGroups.delete(group);
        invalidateShadows(); // the lift moves real geometry, so its shadow moves with it
    }

    function setHovered(hitbox) {
        if (hovered === hitbox) return;
        const previous = hovered;
        hovered = hitbox;
        if (previous) {
            restoreGroupEmissive(previous.userData.visualGroup);
            refreshLift(previous.userData.visualGroup);
        }
        if (hovered) {
            applyHoverEmissive(hovered.userData.visualGroup);
            refreshLift(hovered.userData.visualGroup);
        }
        invalidate(); // the emissive change alone still needs a frame, even when nothing moved
        onHoverChange?.(hovered ? { id: hovered.userData.deskObjectId, label: hovered.userData.label } : null);
    }

    /**
     * Keeps an object raised for as long as it's the focused subject,
     * independent of the pointer — through the dolly in, the whole time it's
     * open, and back out again. Without this the object would drop the
     * instant focus began, since focusing deliberately clears hover.
     */
    function holdLift(objectId) {
        const previous = heldGroup;
        heldGroup = objectsById.get(objectId) ?? null;
        if (previous && previous !== heldGroup) refreshLift(previous);
        if (heldGroup) refreshLift(heldGroup);
    }

    /**
     * Hands the raise back to the pointer. Call this once the camera has
     * finished pulling out, not when focus closes — the object should come
     * down at the establishing shot, not midway through the move. If the
     * cursor happens to be sitting on it by then, it simply stays up.
     */
    function releaseLift() {
        const previous = heldGroup;
        heldGroup = null;
        if (previous) refreshLift(previous);
    }

    /**
     * Hover picking, off the shared pointer stream.
     *
     * Takes normalised device coordinates rather than the event, because the
     * conversion — and the layout read it used to require — now happens once
     * per frame for every subscriber instead of once per listener per event.
     * @see cursor/pointerSource.js
     */
    function pickAtNdc(ndc) {
        pointer.set(ndc.x, ndc.y);
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(clickableGroups, false);
        return hits.length > 0 ? hits[0].object : null;
    }

    function onPointerMove(ndc) {
        if (isFocusActive?.()) {
            // No hover state while zoomed in — but the focused object keeps
            // its raise, which holdLift owns rather than the pointer.
            setHovered(null);
            return;
        }
        setHovered(pickAtNdc(ndc));
    }

    /**
     * Clicks are read straight off the event rather than from the coalesced
     * stream: deferring a click to the next animation frame would mean the
     * raycast ran against a camera that has since moved, and a click is a
     * single decisive edge rather than a stream worth thinning.
     */
    function onClick(event) {
        const hitbox = pickAtNdc(pointerSource.ndcForEvent(event));
        if (hitbox) onEnterFocus(hitbox.userData.deskObjectId);
    }

    const unsubscribePointerMove = pointerSource.onMove(onPointerMove);
    canvasEl.addEventListener('click', onClick);

    // Reading canvasEl.clientWidth/clientHeight the instant this module runs
    // isn't reliable — on a cold load the .desk-canvas stylesheet rule
    // (width/height: 100%) isn't guaranteed to be applied to the DOM yet, so
    // clientWidth/clientHeight can still read the browser's unstyled 300x150
    // canvas default, sizing the renderer to that instead of the real
    // viewport. ResizeObserver reports the canvas's actual box size
    // whenever it becomes known — firing once right after observe() starts,
    // and again on every real size change — so it replaces both the
    // one-shot initial setSize() call and the window resize listener.
    const resizeObserver = new ResizeObserver(setSize);
    // `device-pixel-content-box` is what populates `devicePixelContentBoxSize`
    // — without asking for it the entry carries only the CSS-pixel boxes and
    // setSize silently falls back to the rounded arithmetic this exists to
    // avoid. It is also the one box type a browser may reject outright, and it
    // throws rather than degrading, so the fallback has to be caught.
    try {
        resizeObserver.observe(canvasEl, { box: 'device-pixel-content-box' });
    } catch {
        resizeObserver.observe(canvasEl);
    }

    // Callbacks waiting for the next frame to have actually been drawn. See
    // whenDrawn.
    const afterRender = [];

    const scheduler = createRenderScheduler(({ rebuildShadows }) => {
        renderer.shadowMap.needsUpdate = rebuildShadows;
        renderPipeline.render();
        perfHud?.update();
        if (afterRender.length) for (const resolve of afterRender.splice(0)) resolve();
    }, {
        onSustainedFrame(intervalMs) {
            frameStats.record(intervalMs);
            governor.record(intervalMs);
        }
    });

    // -----------------------------------------------------------------------
    // Losing the GPU
    // -----------------------------------------------------------------------
    // WHAT A LOST CONTEXT USED TO LOOK LIKE, which is the case for handling one
    // at all. A phone under memory pressure, or one that has been in the
    // background a while, can take the WebGL context away — on iOS 17+ WebGL
    // lives in a separate GPU process, and when that process goes, so does
    // every context in it. three notices — it logs the loss and quietly stops
    // drawing — but nothing above it did: the scheduler went on queueing frames
    // that were never drawn, and the canvas (three asks for an alpha context)
    // went transparent, leaving an empty off-white page under the header with
    // nothing to say why. If the browser ever handed the context back, three
    // would rebuild its own state and nothing of ours — the PMREM environment is
    // generated once and its generator thrown away, and the shadow maps are
    // frozen until something moves — so the room would come back dark, unlit by
    // its environment, with the poster wall in permanent shadow.
    //
    // So a loss stops the frame loop and says so, and a restore reloads the
    // page, which rebuilds all of it the one way already known to work — once a
    // minute at most (see onContextRestored). Nothing here runs unless a context
    // is really lost.
    const PAUSED_NOTE = 'The room was paused to save memory — tap to reload';
    // When this tab last reloaded itself for a restored context, in
    // sessionStorage because it has to outlive the reload it is counting.
    const CONTEXT_RELOAD_KEY = 'desk:context-reload';
    const CONTEXT_RELOAD_WINDOW_MS = 60000;
    let contextLost = false;
    let pausedNote = [];

    /**
     * The note, in the action row's language: a `.desk-button` that reloads,
     * and a second one that only takes the note away, for a visitor who would
     * rather keep what is on the page than tap.
     */
    function showPausedNote() {
        if (pausedNote.length || typeof document === 'undefined') return;
        const row = document.getElementById('desk-actions') ?? document.body;
        const note = document.createElement('button');
        note.type = 'button';
        note.className = 'desk-button';
        note.textContent = PAUSED_NOTE;
        note.addEventListener('click', (event) => {
            event.stopPropagation();
            window.location.reload();
        });
        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.className = 'desk-button';
        dismiss.textContent = '×';
        dismiss.setAttribute('aria-label', 'Dismiss');
        dismiss.addEventListener('click', (event) => {
            event.stopPropagation();
            removePausedNote();
        });
        row.append(note, dismiss);
        pausedNote = [note, dismiss];
    }

    function removePausedNote() {
        for (const element of pausedNote) element.remove();
        pausedNote = [];
    }

    function onContextLost(event) {
        // Without this the browser treats the loss as final and will never
        // fire 'webglcontextrestored'. three's own listener does the same;
        // saying it here as well means the reload below does not depend on it.
        event.preventDefault();
        if (contextLost) return;
        contextLost = true;
        console.warn('[desk] The WebGL context was lost; the room is paused until it is restored or the page reloads.');
        // Every tick and the frame loop with them. Disposed rather than paused
        // because nothing resumes it: the only way back is the reload.
        scheduler.dispose();
        // AND EVERYONE WAITING ON A FRAME IS LET GO, because none is coming: a
        // disposed scheduler ignores invalidate(), so a whenDrawn() promise
        // would never settle. The opening awaits one (src/main.js), and would
        // hold the loading veil over this note until its ten-second deadline;
        // window.__desk.settled() awaits two with no deadline at all, and would
        // hang for good. Resolved rather than rejected — "the frame you asked
        // for will not be drawn" is not an error any of them can act on, and
        // the note already says what happened. whenDrawn answers the same way
        // from here on.
        for (const resolve of afterRender.splice(0)) resolve();
        showPausedNote();
    }

    /**
     * ONE AUTOMATIC RELOAD A MINUTE, and the note for anything past it.
     *
     * Reloading on every restore is a loop waiting to happen. Whatever took the
     * context is usually still there when it comes back, and a boot is the most
     * memory this page ever asks for, so a phone that loses the context while
     * booting can lose it again on the next boot — lose, restore, reload, lose,
     * with no end and no say for the visitor. Safari's "A problem repeatedly
     * occurred" guard is for a page that crashes, not for one whose GPU process
     * keeps dropping it, so nothing above this would stop it either.
     *
     * Inside the window the page stays paused and the note (put back, if it
     * was dismissed — the room could come back now, which is new) leaves the
     * reload to the visitor. Where sessionStorage will not keep the stamp, the
     * reload is never automatic: a loop that cannot be counted cannot be
     * stopped.
     */
    function onContextRestored() {
        const now = Date.now();
        let last = 0;
        try {
            last = Number(window.sessionStorage.getItem(CONTEXT_RELOAD_KEY)) || 0;
        } catch { /* unreadable: as good as never */ }
        if (now - last >= CONTEXT_RELOAD_WINDOW_MS) {
            try {
                window.sessionStorage.setItem(CONTEXT_RELOAD_KEY, String(now));
                window.location.reload();
                return;
            } catch { /* the stamp would not stick; fall through to the note */ }
        }
        showPausedNote();
    }

    // A tab coming back to the front — from the background, or out of the
    // back/forward cache, which restores the page without re-running anything —
    // gets a fresh frame rather than trusting whatever the compositor kept of
    // the last one. One frame when nothing else wants any: render-on-demand
    // means nobody else would ask.
    function onPageShow() {
        scheduler.invalidate();
    }

    function onVisibilityChange() {
        if (document.visibilityState === 'visible') scheduler.invalidate();
    }

    canvasEl.addEventListener('webglcontextlost', onContextLost);
    canvasEl.addEventListener('webglcontextrestored', onContextRestored);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibilityChange);

    /**
     * Resolves once every model-backed object has been attached — or has
     * failed to load — and the room has been given its floor height.
     *
     * The scene is built from a warm cache (see loaders/preload.js), so in
     * practice every one of these settles inside the same tick this is called
     * in. It is still awaited rather than assumed: the caches are warm because
     * something upstream chose to warm them, and if that ever stops being true
     * the reveal should wait rather than uncover a half-built room.
     */
    function whenReady() {
        return Promise.all(modelLoads).then(() => undefined);
    }

    /**
     * Resolves after the next frame has been rendered, requesting one if
     * nothing else has.
     *
     * The point is not the pixels — nobody is looking yet — it is everything
     * the first render pays for once and never again: compiling a shader per
     * material, uploading every texture and every vertex buffer to the GPU,
     * filling the 2048² shadow map and the AO pass's targets. On a cold scene
     * that is a few hundred milliseconds of stall, and it lands wherever the
     * first frame happens to be. Spending it behind the loading veil is the
     * difference between a reveal that starts moving immediately and one that
     * hitches on its own first frame.
     *
     * Once the context is lost it resolves at once: no frame will ever be drawn
     * to wait for, and onContextLost has let go of every caller already waiting.
     */
    function whenDrawn() {
        if (contextLost) return Promise.resolve();
        return new Promise((resolve) => {
            afterRender.push(resolve);
            // This scheduler by name rather than the module-level invalidate().
            // That one delegates to whichever scheduler is currently mounted,
            // which is the right thing everywhere else and the wrong thing
            // here: on a dev-server replay that mounts a second scene, it would
            // arm the new scheduler while this promise waits on the old one's
            // render callback, and nothing would ever resolve it.
            scheduler.invalidate();
        });
    }

    function getObjectWorldPosition(id) {
        const group = objectsById.get(id);
        if (!group) return null;
        return group.getWorldPosition(new THREE.Vector3());
    }

    function getObjectGroup(id) {
        return objectsById.get(id) ?? null;
    }

    /**
     * The object's rest bounds, for anchoring screen-space chrome to it: the
     * hover tooltip (src/main.js), and on the original site its focus arrows
     * and text panel too.
     *
     * Frozen at load rather than measured live, for the same reason the
     * hit-test proxies are. Box3.setFromObject walks every descendant
     * regardless of visibility, so anything that animates the group's
     * contents — the original site's hardware object sliding one project out
     * and the next in — would widen and narrow this box on every frame of the
     * swap, and any chrome positioned from it would drift along with the
     * objects. Arrows that move because the thing they control is moving are
     * exactly what they shouldn't do.
     *
     * The raise is the one group-level offset worth folding back in: it's a
     * step change that holds for a whole focus session rather than an
     * animation, so it shifts the chrome once and then leaves it alone. Left
     * out, the arrows would sit a visible fraction of the object's height
     * below its centre for as long as it was raised.
     *
     * `userData.chromeMaxY` is the same argument for the same reason, kept from
     * the original site; nothing on this site sets it. A focus strategy there
     * that stood its object up — the badge (see `anchor.present`) — changed the
     * object's height for the whole session, so it published the top it
     * reached and this box grew to include it. Without that, the arrows flanked
     * a card by sitting at its feet. It was set on entry and deleted on exit,
     * so at rest this reads exactly as it did before.
     *
     * Only the arrow-stepped visuals set it. The paper stack tipped up through
     * the same field and floated no chrome to be flanked by — it was stepped by
     * clicking the page itself — so it never published one.
     */
    function getObjectScreenBox(id) {
        const group = objectsById.get(id);
        const frozen = restBoxes.get(id);
        if (!frozen) return group ? new THREE.Box3().setFromObject(group) : null;
        const box = frozen.clone();
        if (group && liftedGroups.has(group)) {
            box.translate(liftOffset.set(0, group.userData.hoverLift ?? HOVER_LIFT_Y, 0));
        }
        if (group?.userData.chromeMaxY !== undefined) {
            box.max.y = Math.max(box.max.y, group.userData.chromeMaxY);
        }
        return box;
    }

    function dispose() {
        scheduler.dispose();
        unsubscribePointerMove();
        pointerSource.dispose();
        canvasEl.removeEventListener('click', onClick);
        canvasEl.removeEventListener('webglcontextlost', onContextLost);
        canvasEl.removeEventListener('webglcontextrestored', onContextRestored);
        window.removeEventListener('pageshow', onPageShow);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        removePausedNote();
        resizeObserver.disconnect();
        perfHud?.dispose();
        renderPipeline.dispose();
        environmentTexture.dispose();
        renderer.dispose();
        if (canvasEl.__deskScene === instance) canvasEl.__deskScene = null;
    }

    const instance = {
        renderer,
        scene,
        camera,
        /** The canvas's one pointer listener, for DeskCursor, the router and the
         *  modules (ctx.pointer) to share rather than adding their own.
         *  @see cursor/pointerSource.js */
        pointer: pointerSource,
        /** The GPU's real maximum, read once. Threaded into the modules
         *  (core/context.js) so a page or a card built outside this module
         *  filters as well as the room's own surfaces do. */
        maxAnisotropy: anisotropy,
        /** @see scene/textureBudget.js — the budgeted buffer height, device px:
         *  what is being drawn, 0 until the first layout. */
        getDrawingBufferHeight: () => drawingBufferHeight,
        /** What canvas textures are budgeted against, device px: the shorter
         *  side of the budgeted buffer, predicted before the first layout. Never
         *  0 in a browser. @see textureBudgetHeightNow, scene/textureBudget.js */
        getTextureBudgetHeight: textureBudgetHeightNow,
        getObjectWorldPosition,
        getObjectGroup,
        getObjectScreenBox,
        holdLift,
        releaseLift,
        whenReady,
        whenDrawn,
        /** @see createRenderScheduler — register per-frame work that isn't a tween. */
        addTick: scheduler.addTick,
        invalidate,
        dispose
    };
    canvasEl.__deskScene = instance;
    return instance;
}
