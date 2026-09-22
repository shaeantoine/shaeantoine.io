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
// the same way: the one printed surface left on the desk is the paper stack's
// `manuscript` stock — #fbfaf7 sheet, #1d2024 ink (see pageCanvas.js
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
     * the area clamp in setSize. Canvas-textured surfaces size themselves
     * against this — see scene/textureBudget.js. Zero until the first layout,
     * which is why every reader treats a falsy value as "not measured yet"
     * rather than as a real height.
     *
     * DECLARED UP HERE, above every reader, on purpose. `let` is hoisted into a
     * temporal dead zone rather than to `undefined`, so a declaration sitting
     * further down this factory than the object-building loop that reads it
     * does not evaluate to zero — it throws ReferenceError as the scene is
     * built, and the page renders empty white with only the DOM header on it.
     */
    let drawingBufferHeight = 0;

    /**
     * The quality governor's multiplier on the drawing buffer, 1 until it has
     * evidence this machine needs less. Read by `setSize`; written only by the
     * tier change handler below.
     */
    let qualityRenderScale = 1;

    // Defends against a second live renderer ever being bound to the same
    // canvas — e.g. if a dev-server HMR replay re-runs this module without a
    // full page reload. main.js's own `deskScene` guard can't catch that,
    // since a re-run starts with a fresh `null`. Stashing the active
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
    // 1024² together.
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

    createDaylight(scene);

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
        if (object.parts) group.add(buildPartsGroup(object.parts, anisotropy, drawingBufferHeight));
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
                    // hover tooltip and the focus arrows are pinned to.
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
    // The canvas's single pointer listener, shared with DeskCursor and
    // IdleScreen through `instance.pointer`. @see cursor/pointerSource.js
    const pointerSource = createPointerSource(canvasEl);
    const liftOffset = new THREE.Vector3();
    let hovered = null;
    // Groups currently sitting at their raised height, and the one being held
    // up by focus. See refreshLift.
    const liftedGroups = new Set();
    let heldGroup = null;

    const renderPipeline = createRenderPipeline(renderer, scene, camera);

    // -----------------------------------------------------------------------
    // Measured quality
    // -----------------------------------------------------------------------
    // Nothing above this line knows how fast the machine it is running on is.
    // This is the part that finds out, and the part that is allowed to spend
    // image quality to fix it. @see scene/perfMonitor.js for the reasoning
    // behind the budget, the window and the one-way ratchet.
    const frameStats = createFrameStats();
    const governor = createQualityGovernor({
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
            getBufferSize: () => renderer.getDrawingBufferSize(bufferSize)
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
        // over-resolved on the machine least able to afford it.
        drawingBufferHeight = height;
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
     */
    function whenDrawn() {
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
     * The object's rest bounds, for anchoring screen-space chrome (arrows,
     * tooltip, text panel) to it.
     *
     * Frozen at load rather than measured live, for the same reason the
     * hit-test proxies are. Box3.setFromObject walks every descendant
     * regardless of visibility, so a focus strategy that animates the group's
     * contents — the hardware object sliding one project out and the next in
     * — would widen and narrow this box on every frame of the swap, and any
     * chrome positioned from it would drift along with the objects. Arrows
     * that move because the thing they control is moving are exactly what
     * they shouldn't do.
     *
     * The raise is the one group-level offset worth folding back in: it's a
     * step change that holds for a whole focus session rather than an
     * animation, so it shifts the chrome once and then leaves it alone. Left
     * out, the arrows would sit a visible fraction of the object's height
     * below its centre for as long as it was raised.
     *
     * `userData.chromeMaxY` is the same argument for the same reason. A focus
     * strategy that stands its object up — the badge (see artifactStrategy's
     * `anchor.present`) — changes the object's height for the whole session, so
     * it publishes the top it reaches and this box grows to include it. Without
     * that, the arrows flank a card by sitting at its feet. It is set on entry
     * and deleted on exit, so at rest this reads exactly as it did before.
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
        /** The canvas's one pointer listener, for DeskCursor and IdleScreen to
         *  subscribe to rather than adding their own. @see cursor/pointerSource.js */
        pointer: pointerSource,
        /** The GPU's real maximum, read once. Threaded into focus strategies so
         *  a page or a card built outside this module filters as well as the
         *  room's own surfaces do. */
        maxAnisotropy: anisotropy,
        /** @see scene/textureBudget.js — the budgeted buffer height, device px. */
        getDrawingBufferHeight: () => drawingBufferHeight,
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
