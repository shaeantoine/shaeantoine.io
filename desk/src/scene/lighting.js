import * as THREE from 'three';
import { activePreset } from './timeOfDay.js';

/**
 * Natural daylight through a single window.
 *
 * The scene used to be lit by an ambient-ish environment plus two warm
 * directional lights, which is why it read as uniformly bright: directional
 * lights have no falloff, so the far corner of the room received exactly as
 * much light as the desk, and a neutral studio environment filled in whatever
 * was left. Neither has any sense of *where* the light comes from.
 *
 * This replaces both with a single motivated source — a window off to the
 * left — expressed in two halves that have to agree with each other:
 *
 *   1. Direct light: a SpotLight standing in for the window aperture, with a
 *      window-pane mask projected through it and physically correct
 *      inverse-square falloff. This is the beam across the desk.
 *   2. Indirect light: an environment map painted to look like what a surface
 *      in this room would actually see — one bright cool rectangle where the
 *      window is, warm bounce off the carpet, and darkness everywhere else.
 *
 * Together they produce the thing that actually reads as daylight: a warm lit
 * pool falling off into cool, dim, directional shadow.
 *
 * Both halves are driven by whichever time-of-day preset is active (see
 * scene/timeOfDay.js) — which is exactly why they live in one table rather
 * than as two sets of constants here. They have to agree with each other, and
 * the surest way to keep a warm beam from landing in a room whose environment
 * is still lit for noon is to make the two impossible to set separately.
 */

// Where the window sits in world space. Fixed across every time of day: this
// is the aperture itself, and a hole in a wall does not move at dusk. What the
// time of day changes is where the beam through it is aimed, and in what
// colour — see scene/timeOfDay.js.
//
// The distance is doing real work and isn't just "off to the left somewhere".
// Inverse-square falloff across a 6-unit-wide desk is severe when the source is
// close: at 6.7 units away the near edge of the desk receives 6.7× the light of
// the far edge and blows out. Pulling the window back to ~11 units softens that
// to 2.7:1 — still a clearly raking, directional light, but one the tone curve
// can hold. Further back than this and it converges on a directional light,
// losing the falloff into the room that makes the far corner read as dim.
const WINDOW_POSITION = { x: -11, y: 6, z: 2.5 };

// The reference beam, used for one job only: placing the opening in the left
// wall (room.js derives the hole's z from where this axis crosses the plane).
//
// Deliberately NOT the live per-preset target. The point of deriving the
// opening from a beam is that the light appears to come through the hole, and
// that only has to be true of one canonical aim — the midday one the room was
// built against. Wiring it to the live target instead would slide the window
// along the wall between morning and evening visits, and since the presets
// also change the beam's elevation it could put the crossing outside the
// opening entirely, which is the case room.js warns about.
const APERTURE_BEAM_TARGET = { x: 0.2, y: 0, z: 0 };

// room.js reads both to place the window opening in the left-hand wall exactly
// where the reference beam crosses it, so the two can't drift apart.
export { WINDOW_POSITION, APERTURE_BEAM_TARGET };

// Radians, half-angle of the cone. Tightened from 0.44 once the room widened:
// at 0.44 the cone reached all the way to the right-hand wall and lit it at
// N·L = 0.96 — almost perfectly perpendicular — which renders a flat pale panel,
// because light arriving head-on casts no shadow across the plaster's micro
// relief and the normal map may as well not be there. The desk sits within
// 0.16 rad of the beam axis and the far wall at 0.25 rad, so pulling the cone in
// to 0.30 drops the wall out of the hot core while leaving every value on the
// desk itself unchanged.
const BEAM_ANGLE = 0.3;
const BEAM_PENUMBRA = 0.4;

// A shadowless bounce standing in for light returning off the right-hand side
// of the room. Deliberately weak: it exists only so the unlit side of the desk
// keeps some shape instead of crushing to black. Its colour and intensity come
// from the active preset and stay near-neutral, matching that preset's wall
// bounce — it represents light off the same plaster, and a blue version of it
// would tint exactly the walls the environment was tuned to match.
const BOUNCE_POSITION = { x: 7, y: 2, z: 4 };

const SHADOW_MAP_SIZE = 2048;

// Gallery spots washing the framed posters on the back wall, one per pair,
// mirrored about x = 0.
//
// These exist because that wall receives almost no direct light. It faces +Z,
// the window's cone is 0.3 rad aimed at the desk, and the left-hand pair sits
// 0.34 rad off that axis — outside it entirely. Four dark film posters lit only
// by the environment map would be four black rectangles.
//
// Mounted high and forward, like a ceiling-mounted picture light. Nothing
// models the fixture and nothing needs to: WALL_HEIGHT is 10 and the
// establishing shot's top edge crosses the back wall around y = 3.2, so at
// y = 3.7 the source is comfortably out of frame while the pool it throws is
// not. The cone is wide and very soft — a hard-edged circle on plaster would
// read as a spotlight rather than as art lighting.
//
// Neither is the key, and neither is free: see ART_LIGHT_SHADOW_* below for
// what they cost and why they now pay it.
//
// ART_LIGHT_X tracks the midpoint of the pair it lights, and has to keep
// tracking it: the posters sit at x 2.92 and 4.04, so 3.5 puts each fixture
// between its two frames rather than off to one side of them. Move the posters
// and move this, or one of the pair walks out of the pool.
export const ART_LIGHT_X = 3.5;
const ART_LIGHT_POSITION = { y: 3.7, z: -1.15 };
const ART_LIGHT_TARGET = { y: 1.9, z: -2.19 };
const ART_LIGHT_ANGLE = 0.55;
const ART_LIGHT_PENUMBRA = 0.85;

// WHY THESE CAST AFTER ALL. The note here used to read "neither casts — they
// light flat prints hung flush to a wall, so there is nothing for them to throw
// a shadow of". That described a plan for flat prints. What got built is boxes:
// each frame plate is 0.04 deep and each art plate stands 0.006 proud of that,
// hung on a wall lit from above and in front. A 0.04 ledge under a light
// arriving at ~60° off the wall's normal throws a real shadow — ~0.10 units
// below each frame, which is about 17 px at the establishing shot, and enough
// that its absence was what read as wrong: four frames sitting on the plaster
// with nothing under them while the shelf and the desk both had contact.
//
// The rebate the art plate cuts into its own mount comes along for free at
// ~0.015, roughly 2.5 px — the line that makes a poster look set into a frame
// rather than printed on one.
//
// THE COST, which the old note was right to care about. This is two more depth
// passes on top of the key's, so they are sized down rather than mirrored from
// it: at 1024² the frustum lands ~278 texels per unit on the wall, which puts
// ~28 texels across the deepest shadow here — far more than a soft 0.10-unit
// gradient needs. Two of these together are half the texels of the key's single
// 2048², and the scheduler only rebuilds any of them on frames where geometry
// actually moved.
const ART_LIGHT_SHADOW_MAP_SIZE = 1024;
// Nothing sits within 0.5 of these fixtures, and the furthest poster corner is
// 3.0 away, so the frustum is cut to the wall it lights instead of three's
// default 500 — which is depth precision for free.
const ART_LIGHT_SHADOW_NEAR = 0.5;
const ART_LIGHT_SHADOW_FAR = 4.0;
// Small on purpose, and the trade-off runs both ways. normalBias shifts the
// lookup along the receiver's normal, so on this wall it slides the shadow ~2.4
// units of y for every 1 of bias: at the carpet's 0.03 these shadows would
// detach from the frames they belong to by more than a third of their length.
// 0.006 is about one texel's depth slope at 60° incidence, which is what acne
// actually needs, and the plaster's normal map is near-flat besides. If the
// wall stipples under these, raise it; if a shadow floats free of its frame,
// lower it.
const ART_LIGHT_SHADOW_BIAS = -0.0002;
const ART_LIGHT_SHADOW_NORMAL_BIAS = 0.006;

// ---------------------------------------------------------------------------
// Window pane mask
// ---------------------------------------------------------------------------

const GOBO_SIZE = 512;
const GOBO_APERTURE_INSET = 0.16; // how much of the cone is window frame
const GOBO_EDGE_SOFTNESS = 0.045;
const GOBO_BAR_HALF_WIDTH = 0.012; // glazing bars dividing the panes
const GOBO_BAR_SOFTNESS = 0.012;

const saturate = (t) => Math.max(0, Math.min(1, t));
const smoothstep = (t) => {
    const x = saturate(t);
    return x * x * (3 - 2 * x);
};

/** 1 between `lo` and `hi`, falling smoothly to 0 over `soft` either side. */
const band = (t, lo, hi, soft) => smoothstep((t - lo) / soft) * smoothstep((hi - t) / soft);

/** 1 inside a bar of half-width `half` centred on `centre`, 0 outside. */
const bar = (t, centre, half, soft) => 1 - smoothstep((Math.abs(t - centre) - half) / soft);

/**
 * Builds the mask projected through the spot light: a rectangular aperture
 * divided into four panes by glazing bars, fading out at the frame.
 *
 * Tagged NoColorSpace deliberately. three uploads an SRGBColorSpace texture
 * with an sRGB internal format so the GPU decodes it on sample, but this isn't
 * a colour — it's a transmission mask multiplied straight into the light's
 * radiance (`directLight.color * spotColor.rgb`), so a stored 128 needs to mean
 * "half the light gets through", not 0.22 of it.
 */
export function createWindowGobo() {
    const data = new Uint8Array(GOBO_SIZE * GOBO_SIZE * 4);
    for (let y = 0; y < GOBO_SIZE; y++) {
        const v = (y + 0.5) / GOBO_SIZE;
        for (let x = 0; x < GOBO_SIZE; x++) {
            const u = (x + 0.5) / GOBO_SIZE;

            const aperture =
                band(u, GOBO_APERTURE_INSET, 1 - GOBO_APERTURE_INSET, GOBO_EDGE_SOFTNESS) *
                band(v, GOBO_APERTURE_INSET, 1 - GOBO_APERTURE_INSET, GOBO_EDGE_SOFTNESS);

            const bars =
                (1 - bar(u, 0.5, GOBO_BAR_HALF_WIDTH, GOBO_BAR_SOFTNESS)) *
                (1 - bar(v, 0.5, GOBO_BAR_HALF_WIDTH, GOBO_BAR_SOFTNESS));

            // Sky is brighter toward the top of a window than the bottom, so
            // the beam is very slightly graded rather than a flat slab.
            const sky = 0.88 + 0.12 * (1 - v);

            const value = saturate(aperture * bars * sky) * 255;
            const i = (y * GOBO_SIZE + x) * 4;
            data[i] = value;
            data[i + 1] = value;
            data[i + 2] = value;
            data[i + 3] = 255;
        }
    }

    const texture = new THREE.DataTexture(data, GOBO_SIZE, GOBO_SIZE, THREE.RGBAFormat);
    texture.colorSpace = THREE.NoColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/**
 * Panels are plain MeshBasicMaterial rather than lit materials, so the
 * environment is painted directly and needs no light source of its own.
 * Intensities above 1 are the point — this is an HDR source, and the window
 * being genuinely brighter than the walls is what gives reflections somewhere
 * bright to find.
 */
function panel(geometry, { color, intensity }) {
    const material = new THREE.MeshBasicMaterial();
    material.color.setHex(color).multiplyScalar(intensity);
    return new THREE.Mesh(geometry, material);
}

/**
 * A scene for PMREMGenerator to prefilter into an irradiance map. Replaces
 * three's RoomEnvironment, which is a neutral studio lightbox — excellent for
 * showing a product off evenly, and exactly wrong for a room that is supposed
 * to have one light side and one dark side.
 *
 * PMREM captures this from the origin, so only the direction and apparent size
 * of each panel matter, not the absolute scale.
 *
 * Every colour here comes from the active time-of-day preset, and the panels
 * have to keep agreeing with the direct light: the bright panel sits in the
 * same direction as WINDOW_POSITION so that specular reflections land where
 * the beam comes from. At night that relationship inverts — the ceiling
 * becomes the bright panel, because the room light is what is actually on.
 */
export function createWindowEnvironment() {
    const { env } = activePreset();
    const scene = new THREE.Scene();
    const geometry = new THREE.BoxGeometry();
    geometry.deleteAttribute('uv');

    const shell = panel(geometry, env.shell);
    shell.material.side = THREE.BackSide;
    shell.scale.set(24, 14, 24);
    scene.add(shell);

    // Placed up and to the left, matching WINDOW_POSITION's direction from the
    // desk so that specular reflections land where the beam comes from.
    const windowPanel = panel(geometry, env.windowPanel);
    windowPanel.scale.set(0.2, 7, 6);
    windowPanel.position.set(-11, 3.5, 1.5);
    scene.add(windowPanel);

    // Opposite the window: the bounce off the side of the room the beam lands
    // on. Without a panel here the environment has nothing at all in the +X
    // hemisphere, and the left wall — which faces +X and is backlit by its own
    // window — renders essentially black. A painted environment has no global
    // illumination, so the single bounce that would light that wall in reality
    // has to be put in by hand.
    //
    // Its colour is the wall it stands for: plaster, so near-neutral in every
    // daytime preset. Warmer than that and the left wall visibly diverges in
    // hue from the other two.
    const wallBounce = panel(geometry, env.wallBounce);
    wallBounce.scale.set(0.2, 10, 14);
    wallBounce.position.set(11, 1, 1.5);
    scene.add(wallBounce);

    const floorBounce = panel(geometry, env.floorBounce);
    floorBounce.scale.set(24, 0.2, 24);
    floorBounce.position.set(0, -6.5, 0);
    scene.add(floorBounce);

    const ceiling = panel(geometry, env.ceiling);
    ceiling.scale.set(24, 0.2, 24);
    ceiling.position.set(0, 6.5, 0);
    scene.add(ceiling);

    scene.dispose = () => {
        geometry.dispose();
        scene.traverse((node) => node.material?.dispose());
    };

    return scene;
}

// ---------------------------------------------------------------------------
// Direct light
// ---------------------------------------------------------------------------

/**
 * Adds the window's direct light, the bounce fill, the pair of gallery spots
 * on the poster wall, and — after dark — the overhead room light to `scene`,
 * returning all of them so they stay tunable from the console. `overhead` is
 * null whenever the window is still the key.
 *
 * ON THE SUN'S COLOUR, which is the easiest knob here to overcook. An earlier
 * pass used a deep amber (0xffe3bd) and it split the room by hue rather than
 * only by brightness: the back wall, lit mostly by this beam, came out visibly
 * cream, while the right-hand wall, lit mostly by the cool environment, came
 * out neutral white — two walls of the same plaster reading as two different
 * paints. Warm key against cool ambient is still the right idea, but the split
 * has to stay narrow. Every preset's `sun.color` is held inside that bound.
 *
 * ON SHADOWS. Exactly one *key* ever casts, at any time of day: the presets
 * hand that job from the window to the overhead at night rather than lighting
 * both, so the full-size 2048² pass is paid once and only once. The two gallery
 * spots cast as well, but at 1024² each — together half the key's texels — for
 * the contact under the poster frames. See ART_LIGHT_SHADOW_* above. The
 * scheduler only rebuilds any of them on frames where geometry actually moved,
 * so all three passes are rare besides.
 */
export function createDaylight(scene) {
    const preset = activePreset();

    const sun = new THREE.SpotLight(preset.sun.color, preset.sun.intensity);
    sun.position.set(WINDOW_POSITION.x, WINDOW_POSITION.y, WINDOW_POSITION.z);
    sun.target.position.set(preset.sun.target.x, preset.sun.target.y, preset.sun.target.z);
    sun.angle = BEAM_ANGLE;
    sun.penumbra = BEAM_PENUMBRA;
    sun.decay = 2; // physically correct inverse-square
    sun.distance = 0; // no artificial cutoff; let the falloff do the work
    sun.map = createWindowGobo();

    sun.castShadow = preset.sun.castShadow;
    sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 40;
    // normalBias offsets the shadow lookup along the surface normal, which is
    // what keeps the carpet's strong normal map from self-shadowing into acne
    // under this low, raking light.
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;

    scene.add(sun);
    scene.add(sun.target);

    const bounce = new THREE.DirectionalLight(preset.bounce.color, preset.bounce.intensity);
    bounce.position.set(BOUNCE_POSITION.x, BOUNCE_POSITION.y, BOUNCE_POSITION.z);
    scene.add(bounce);

    const overhead = preset.overhead ? createOverhead(scene, preset.overhead) : null;
    const art = [-ART_LIGHT_X, ART_LIGHT_X].map((x) => createArtLight(scene, preset.art, x));

    return { sun, bounce, overhead, art };
}

/**
 * One gallery spot, at `x` and its mirror. See the ART_LIGHT_* notes above for
 * why the poster wall needs its own light at all, and why — unlike the note
 * that used to sit here — it casts.
 *
 * Intensity is candela against decay 2, the same units as the window. At 2.08
 * units from the wall the divisor is ~4.3, and the beam arrives at roughly 60°
 * off the wall's normal, so a preset intensity of 8 lands near 0.9 irradiance
 * on the posters — about half what the desk gets under the window, which is
 * the right relationship for lit art in a lit room.
 */
function createArtLight(scene, config, x) {
    const light = new THREE.SpotLight(config.color, config.intensity);
    light.position.set(x, ART_LIGHT_POSITION.y, ART_LIGHT_POSITION.z);
    light.target.position.set(x, ART_LIGHT_TARGET.y, ART_LIGHT_TARGET.z);
    light.angle = ART_LIGHT_ANGLE;
    light.penumbra = ART_LIGHT_PENUMBRA;
    light.decay = 2;
    light.distance = 0;

    light.castShadow = true;
    light.shadow.mapSize.set(ART_LIGHT_SHADOW_MAP_SIZE, ART_LIGHT_SHADOW_MAP_SIZE);
    light.shadow.camera.near = ART_LIGHT_SHADOW_NEAR;
    light.shadow.camera.far = ART_LIGHT_SHADOW_FAR;
    light.shadow.bias = ART_LIGHT_SHADOW_BIAS;
    light.shadow.normalBias = ART_LIGHT_SHADOW_NORMAL_BIAS;

    // BAKED ONCE, THEN FROZEN, which is what makes the note above about these
    // being "two more depth passes" no longer true of any frame but the first.
    //
    // The scheduler's `invalidateShadows()` is global — one flag rebuilding
    // every casting light — so anything that nudges a desk object was paying
    // for these two 1024² passes as well as the key's 2048². Nothing in this
    // cone can move: it reaches 4.0 units from y = 3.7 at ~0.55 rad onto the
    // poster wall, which is `parts` geometry built synchronously at scene
    // construction, and the desk sits 0.82 rad off this axis — outside the cone
    // entirely. So the frames' contact shadows are rendered on the first frame
    // and are correct forever after, and every later invalidateShadows() costs
    // one depth pass rather than three.
    //
    // IF ANYTHING THAT LOADS LATE OR ANIMATES IS EVER HUNG ON THAT WALL, this
    // is what will leave its shadow missing or stale: set
    // `light.shadow.needsUpdate = true` alongside whatever moves it.
    light.shadow.autoUpdate = false;
    light.shadow.needsUpdate = true; // consumed by the first shadow frame, which clears it

    scene.add(light);
    scene.add(light.target);
    return light;
}

/**
 * The ceiling light, for presets where the window has gone dark.
 *
 * A SpotLight rather than a PointLight so it has a cone to fall off inside and
 * a shadow camera that isn't a cubemap — at six faces a point light's shadow
 * would cost six times what the window's does, to light a room whose ceiling
 * is never in frame anyway.
 *
 * Its fixture is deliberately absent. WALL_HEIGHT is 10 and the establishing
 * shot's top edge crosses the back wall around y = 3.2, so there is nowhere in
 * the experience the source itself can be seen — and a source you cannot see
 * is still motivated as long as the light behaves like it came from up there.
 */
function createOverhead(scene, config) {
    const light = new THREE.SpotLight(config.color, config.intensity);
    light.position.set(config.position.x, config.position.y, config.position.z);
    light.target.position.set(config.target.x, config.target.y, config.target.z);
    light.angle = config.angle;
    light.penumbra = config.penumbra;
    light.decay = 2;
    light.distance = 0;

    light.castShadow = config.castShadow;
    light.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    light.shadow.camera.near = 0.5;
    // Far enough to reach the carpet: the desktop is world y = 0 and the floor
    // sits ~2.8 below it, so from 7 above the desk the furthest thing this has
    // to shadow is a shade under 10 away.
    light.shadow.camera.far = 12;
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.03;

    scene.add(light);
    scene.add(light.target);
    return light;
}
