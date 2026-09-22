import * as THREE from 'three';
import { invalidate } from './renderScheduler.js';
import { canvasWidthForAspect, createScreenCanvas, createMeasurer, SCREEN_CANVAS_HEIGHT, TEXT_COLOR } from '../focus/strategies/screenCanvas.js';
import { caretRect, drawIdleScreen, formatClock, mostRecentWork } from './idleScreenCanvas.js';

/**
 * The monitor, on.
 *
 * Owns a second canvas-textured plane at the same anchor screenStrategy uses,
 * standing in for the display's resting state, plus the light it throws onto
 * the desk. Self-contained in the same way DeskCursor is: it owns its own
 * listeners and timers, and the only thing the outside world tells it is which
 * object focus is currently on.
 *
 * HOW THIS STAYS CHEAP, which is the entire design.
 *
 * The render scheduler's premise is that an idle desk costs zero GPU time —
 * frames are requested, not assumed, and every frame that does happen pays for
 * a GTAO prepass, 16 AO samples and a denoise. A blinking caret is, on its
 * face, exactly the thing that premise forbids: something that changes forever,
 * on its own, with nobody touching it.
 *
 * So the blink deliberately does NOT go through `addTick`. A tick returning
 * `true` holds the rAF loop open at the full refresh rate — 60 rendered frames
 * a second to animate something that changes twice a second. Instead a plain
 * interval toggles the caret and calls `invalidate()`: the loop wakes, renders
 * exactly one frame, and parks again. Two frames a second while someone is
 * here, none when they are not.
 *
 * And "while someone is here" is literal — the interval only runs while the
 * pointer is over the canvas, the tab is visible, and the visitor has not asked
 * for reduced motion. The same reasoning DeskCursor applies to the mouse echo:
 * a flourish that responds to a person present is worth frames; one animating
 * into an unwatched tab is not.
 *
 * AND THE FRAME IT WAKES FOR HAS TO BE CHEAP, which is what the caret being its
 * own mesh buys. The blink used to repaint this canvas and set
 * `texture.needsUpdate`, which is not a two-frames-a-second cost at all. The
 * canvas was allocated at a flat 3x the logical layout back then, so for the
 * display's 1.912 x 1.070 anchor it was 5361 x 3000 — 16 megapixels,
 * re-rasterised and re-uploaded to the GPU with a fresh mipmap chain, to move a
 * 3 x 34 px rectangle. Twice a second, and — because `setFocusedObject(null)`
 * restarts the interval — landing squarely inside the camera pull-back out of
 * focus, which is where it read as the scene buffering.
 *
 * Both halves of that are now fixed: scene/textureBudget.js sizes the canvas to
 * the display instead of to a constant, and the blink no longer touches it.
 *
 * So the caret is a separate quad parented to the screen plane, and the blink is
 * `caret.visible = !caret.visible`. The big canvas is now drawn once at mount
 * and again only when the clock's minute rolls over.
 */

// Slower than a real terminal's ~530ms. The scene's whole motion vocabulary is
// damped and unhurried, and a caret ticking at true terminal speed reads
// jittery against it.
const BLINK_MS = 600;

// Nudged along the screen's own normal so the resting plane and the focused
// one can never z-fight, in the event that some future path has both mounted
// for a frame. Far below the bezel depth, so it cannot poke through.
const SURFACE_OFFSET = 0.002;

// And the caret's own nudge off the plane it is parented to — a tenth of the
// above, since it only has to clear one coplanar quad rather than another
// whole screen.
const CARET_SURFACE_OFFSET = 0.0002;

// The light the screen throws back into the room. A RectAreaLight rather than
// a point light because the emitter genuinely is a rectangle of that size —
// a point light in front of the panel puts a hot spot on the desk where a
// display puts a broad, soft wash, and no amount of tuning fixes the shape.
//
// LOADED SEPARATELY, AND THAT IS THE WHOLE REASON THIS IS A DYNAMIC IMPORT.
// three's RectAreaLight needs linearly-transformed-cosine lookup tables to
// shade, and ships them as RectAreaLightTexturesLib — 314 kB of inlined float
// arrays, which is +107 kB gzipped on a bundle that was 181 kB. Paying that on
// first paint, ahead of the loading veil lifting, to soften the light on a desk
// is not a trade worth making. Imported here it splits into its own chunk: the
// screen lights up on time and the wash arrives a beat later, which nobody can
// perceive as an absence.
//
// EXPECT TO CHANGE THE INTENSITY. RectAreaLight's is a luminance, and it shares
// units with neither the window's candela nor the bounce fill's multiplier, so
// it cannot be derived from them — it has to be looked at. This value is
// deliberately on the low side: too dim is an effect you cannot see, too bright
// is a washed-out keyboard, and only one of those is a regression. Turn it up
// until the desk in front of the monitor lifts.
//
// The import specifier below is written out as a literal on purpose. Behind a
// variable, or a `@vite-ignore`, the bundler cannot see it — so it emits no
// chunk and the bare `three/...` path reaches the browser unresolved, which
// fails only in a production build and only at runtime.
const GLOW_INTENSITY = 2.0;
const GLOW_COLOR = 0xf4f6ff; // the panel's own near-white, very slightly cool

const NOOP_IDLE_SCREEN = {
    setFocusedObject() {},
    repaint() {},
    dispose() {}
};

/**
 * @param {{
 *   deskScene: object,
 *   canvasEl: HTMLCanvasElement,
 *   objectId: string,
 *   anchor: { position: number[], rotation?: number[], size: number[] },
 *   works: object[]
 * }} options
 */
export function createIdleScreen({ deskScene, canvasEl, objectId, anchor, works }) {
    canvasEl.__idleScreen?.dispose();

    const group = deskScene.getObjectGroup(objectId);
    if (!group) return NOOP_IDLE_SCREEN;

    const work = mostRecentWork(works);
    const measureWidth = createMeasurer();
    const reduceMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

    const aspect = anchor.size[0] / anchor.size[1];
    const logicalWidth = canvasWidthForAspect(aspect);
    // Shared with screenStrategy so the resting panel and the focused one are
    // allocated identically — they are the same physical display a third of a
    // second apart, and two resolutions would show at the moment focus swaps
    // one for the other. That is also why this passes the FOCUSED framing for
    // a panel it only ever shows at the establishing shot; see the note on
    // createScreenCanvas for why the obvious saving is not taken.
    const bufferHeight = deskScene.getDrawingBufferHeight?.() ?? 0;
    const canvas = createScreenCanvas(aspect, { framing: anchor.framing, bufferHeight });

    let clock = formatClock(new Date());

    function redraw() {
        drawIdleScreen(canvas, { work, clock }, measureWidth);
        texture.needsUpdate = true;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    // Seen from across the room the screen is minified hard along one axis and
    // barely along the other, which plain bilinear filtering cannot represent.
    // Anisotropy is the fix, and it needs the mipmap chain left enabled.
    texture.anisotropy = 16;

    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(...anchor.size),
        // toneMapped: false, like the focused screen — and like there, it is
        // inert: three only honours the flag when rendering straight to the
        // canvas, and this scene always goes through an EffectComposer, so
        // OutputPass tone maps the panel along with everything else. @see
        // focus/strategies/screenStrategy.js, which carries the full argument
        // because it is the surface the curve costs most.
        //
        // The note that used to sit here claimed the opposite, and drew a
        // conclusion from it worth recording so nobody re-derives it: that a
        // display emits its own light, so being outside the curve lets the
        // panel hold its value while the evening and night presets darken the
        // room around it. That effect is not happening. It is also not what
        // would happen if the flag worked, because timeOfDay lifts exposure to
        // 1.1 after dark — the panel would brighten with the room, not hold.
        new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
    );
    mesh.position.set(
        anchor.position[0],
        anchor.position[1],
        anchor.position[2] + SURFACE_OFFSET
    );
    if (anchor.rotation) mesh.rotation.set(...anchor.rotation);
    group.add(mesh);

    /**
     * The caret, as a quad parented to the screen plane rather than as pixels in
     * its texture — see the note at the top of this file for why.
     *
     * Parented rather than placed in the group: it then inherits the plane's
     * position, rotation and visibility for free, so `setFocusedObject` hiding
     * the resting screen takes the caret with it and neither can be re-angled
     * out of step with the other. `caretRect` reports logical canvas px, which
     * maps onto the plane's local frame as origin-at-centre, y up.
     *
     * The geometry is a unit quad scaled into place rather than one built at the
     * right size, so `placeCaret` can be called again — after a late webfont
     * changes the text metrics, which moves the end of the last line — without
     * allocating a second geometry to throw the first one away.
     */
    function placeCaret(caretMesh) {
        const rect = caretRect(work, measureWidth, logicalWidth);
        if (!rect) {
            caretMesh.visible = false;
            return false;
        }
        const [planeWidth, planeHeight] = anchor.size;
        caretMesh.scale.set(
            (rect.width / logicalWidth) * planeWidth,
            (rect.height / SCREEN_CANVAS_HEIGHT) * planeHeight,
            1
        );
        caretMesh.position.set(
            ((rect.x + rect.width / 2) / logicalWidth - 0.5) * planeWidth,
            (0.5 - (rect.y + rect.height / 2) / SCREEN_CANVAS_HEIGHT) * planeHeight,
            CARET_SURFACE_OFFSET
        );
        return true;
    }

    function buildCaret() {
        const caretMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            // Same colour and the same exemption from the tone curve as the text
            // it sits at the end of, so the two cannot diverge as the exposure
            // changes with the hour.
            new THREE.MeshBasicMaterial({ color: TEXT_COLOR, toneMapped: false })
        );
        if (!placeCaret(caretMesh)) { // nothing written on the screen to park it after
            caretMesh.geometry.dispose();
            caretMesh.material.dispose();
            return null;
        }
        return caretMesh;
    }

    const caret = buildCaret();
    if (caret) mesh.add(caret);

    function setCaretVisible(next) {
        if (!caret || caret.visible === next) return;
        caret.visible = next;
        invalidate();
    }

    // The screen is lit from the first frame it could possibly be seen — before
    // the glow module, before any pointer arrives. Everything after this point
    // is refinement on top of an already-working monitor.
    redraw();
    invalidate();

    let timer = null;
    let hasPointer = false;
    let suppressed = false;
    let disposed = false;
    let glow = null;

    // A RectAreaLight emits along its local +Z, the same direction a
    // PlaneGeometry's normal points — so matching the mesh's rotation aims the
    // light out of the screen without a lookAt, and keeps the two pointing the
    // same way if the anchor is ever re-angled.
    import('three/examples/jsm/lights/RectAreaLightUniformsLib.js').then(({ RectAreaLightUniformsLib }) => {
        // The scene can be torn down — an HMR replay, a second mount — while
        // 300 kB of lookup tables are still in flight. Without this the light
        // would be added to a group nobody is rendering any more, and never
        // disposed.
        if (disposed) return;
        RectAreaLightUniformsLib.init();
        glow = new THREE.RectAreaLight(GLOW_COLOR, GLOW_INTENSITY, anchor.size[0], anchor.size[1]);
        glow.position.copy(mesh.position);
        glow.rotation.copy(mesh.rotation);
        group.add(glow);
        invalidate();
    }, (error) => {
        // Non-fatal by design: the screen is still lit, it just stops throwing
        // light back. Worth a line in the console rather than a silent
        // difference nobody can account for later.
        console.warn('[IdleScreen] Screen glow unavailable — RectAreaLight tables failed to load.', error);
    });

    /**
     * The caret animates only while it is worth animating. Anything that could
     * change that answer calls this, and it starts or stops the one interval
     * accordingly — so there is exactly one place that decides whether the
     * resting screen is currently costing anything.
     */
    function syncBlink() {
        const shouldBlink = Boolean(caret) && hasPointer && !suppressed && !reduceMotion && !document.hidden;
        if (shouldBlink === (timer !== null)) return;
        if (shouldBlink) {
            timer = setInterval(onBlink, BLINK_MS);
            return;
        }
        clearInterval(timer);
        timer = null;
        // Parked showing the caret rather than mid-gap. A screen left with a
        // caret on reads as still; one left with it off reads as a screen that
        // has lost its cursor.
        setCaretVisible(true);
    }

    function onBlink() {
        setCaretVisible(!caret.visible);
        // Free-riding on the blink rather than keeping a second timer: the
        // clock only has minute resolution, so checking it 100 times more often
        // than it can change costs one string compare and saves an interval.
        // This is also now the only thing that repaints the canvas, so the
        // 16-megapixel re-upload happens once a minute rather than twice a
        // second.
        const now = formatClock(new Date());
        if (now !== clock) {
            clock = now;
            redraw();
            invalidate();
        }
    }

    function onPointerMove() {
        if (hasPointer) return;
        hasPointer = true;
        // The clock may be minutes stale if the pointer has been away that
        // long, and this is the first moment anyone can read it again.
        const now = formatClock(new Date());
        if (now !== clock) {
            clock = now;
            redraw();
            invalidate();
        }
        syncBlink();
    }

    function onPointerLeave() {
        hasPointer = false;
        syncBlink();
    }

    function onVisibilityChange() {
        syncBlink();
    }

    // Through the scene's shared pointer stream rather than a third listener on
    // the same canvas. This one only needs the edges — pointer present, pointer
    // gone — so it ignores the coordinates it is handed.
    // @see cursor/pointerSource.js
    const unsubscribeMove = deskScene.pointer.onMove(onPointerMove);
    const unsubscribeLeave = deskScene.pointer.onLeave(onPointerLeave);
    document.addEventListener('visibilitychange', onVisibilityChange);
    /**
     * Hidden only while focus is on this same object, where screenStrategy
     * mounts its own canvas at this exact anchor. Focusing anything else on the
     * desk — the bench, the lanyard, the paper stack — leaves the monitor on,
     * because a monitor does not switch itself off when you look at the paper
     * beside it, and because every one of those dollies starts from the
     * establishing shot with the display in the middle of the frame.
     *
     * The glow deliberately does not follow the mesh. Suppressed does not mean
     * dark: the focused screen is mounted in its place and is, if anything,
     * brighter — so the light the display throws into the room should carry on
     * exactly as it was.
     *
     * @param {string | null} focusedObjectId
     */
    function setFocusedObject(focusedObjectId) {
        const next = focusedObjectId === objectId;
        if (next === suppressed) return;
        suppressed = next;
        mesh.visible = !suppressed;
        syncBlink();
        invalidate();
    }

    /**
     * Repaints the screen from scratch, caret included.
     *
     * Exists for exactly one case: the webfont arriving after the desk has
     * already mounted, which main.js only wires up when `ensureCanvasFonts`
     * timed out. Every glyph on this canvas was rasterised in a fallback face at
     * that point, and unlike DOM text it will not restyle itself. The caret has
     * to be re-placed with it, since where the last line ends is a text
     * measurement and the measurement just changed.
     */
    function repaint() {
        redraw();
        if (caret) placeCaret(caret);
        invalidate();
    }

    function dispose() {
        disposed = true; // also tells an in-flight glow import not to land
        clearInterval(timer);
        timer = null;
        unsubscribeMove();
        unsubscribeLeave();
        document.removeEventListener('visibilitychange', onVisibilityChange);
        group.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        texture.dispose();
        if (caret) {
            // Already detached with its parent above; only its own buffers are
            // left to hand back.
            caret.geometry.dispose();
            caret.material.dispose();
        }
        if (glow) {
            group.remove(glow);
            glow.dispose();
            glow = null;
        }
        if (canvasEl.__idleScreen === instance) canvasEl.__idleScreen = null;
    }

    const instance = { setFocusedObject, repaint, dispose };
    canvasEl.__idleScreen = instance;
    return instance;
}
