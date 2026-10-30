import { hitProxy } from '../../core/parts.js';
import { param } from '../../core/flags.js';
import { activePreset } from '../../scene/timeOfDay.js';
import { LAMP, LAMP_ORIGIN, KEYBOARD, MUG, lampHitProxy } from './layout.js';
import { buildLamp } from './lamp.js';
import { buildKeyboard } from './keyboard.js';
import { buildMug } from './tableware.js';
import { createSteam } from './steam.js';
import { toneDownAccents } from './accents.js';

/**
 * PROPS — the things that make it Shae's desk rather than a desk: the real
 * desk's black swing-arm bar lamp, its white low-profile keyboard and black
 * wrist rest, and a dark mug of coffee, steaming (from photos of the real desk).
 * Not a place you walk up to: nothing here is a focus route.
 *
 *   the lamp      stands at the back left, its head over the bench. Hover shows
 *                 "the lamp"; a click switches it on or off IN PLACE (a 250 ms
 *                 fade, no camera move), from the desk or from any module's
 *                 shot, and logs "the lamp" for the receipt. On it pools warm
 *                 light on the bench and its diffuser strip lights.
 *                 Default: off for morning / day, on for evening / night (the
 *                 room's resolved preset, src/scene/timeOfDay.js).
 *                 ?lamp=on | ?lamp=off overrides it (for screenshots).
 *   the keyboard  replaces the retro keyboard_mechanical.glb: this module's
 *                 `overrides` switch the 'keyboard' entry's model off (the
 *                 core's layout hook patches entries; it has no remove) and
 *                 mount() builds the new one into that same group.
 *   the mug       left of the display's foot, as on the real desk (layout.js).
 *   the steam     wisps rising off the coffee: a DOM layer over the canvas,
 *                 pinned to the rim through the live camera and animated by
 *                 CSS, so it never costs a WebGL frame (steam.js).
 *                 ?steam=0 leaves it out.
 *   accents       the Borg cube's and the Tron disc's glow, turned down (kept).
 *
 * HOW THE LAMP'S CLICK WORKS WITHOUT A ROUTE. The lamp is a clickable desk
 * entry (so the router's hover label, pointer cursor and DeskScene's hover
 * tint all apply) but it is NOT in objectIds, so no module owns it: the
 * router's onEnterFocus finds no owner and does nothing, and because the click
 * hit an object it doesn't step back to #desk either. The switch itself is this
 * module's own canvas listener (bubble phase, after DeskScene's), which asks the
 * same question DeskScene's picker does — is the lamp the NEAREST hit volume
 * under the pointer? — so the label you hovered is the thing that switches. A
 * module that handles a click itself (its click() returns true) stops the event
 * before it gets here. Module click() is never offered at #desk by main.js, so
 * this module has none.
 *
 * Numbers: layout.js (DOM-free). Meshes: lamp.js, keyboard.js, tableware.js.
 * Steam: steam.js (DOM + CSS). Accents: accents.js. Everything is wrapped: one prop failing leaves the rest.
 */

const LAMP_ID = 'desk-lamp';
const MUG_ID = 'mug';
const LAMP_LABEL = 'the lamp';
const VISIT_TITLE = 'the lamp';

const state = {
    ctx: null,
    lamp: null,
    proxy: null,
    on: false,
    level: 0,
    fade: null,
    steam: null,
    unsubscribers: []
};

/** ?lamp=on|off, else the time of day: on for evening and night. */
function initialLampOn(ctx, presetId) {
    const forced = String(param('lamp') ?? '').trim().toLowerCase();
    if (['on', '1', 'true'].includes(forced)) return true;
    if (['off', '0', 'false'].includes(forced)) return false;
    if (forced) ctx.warn(`Ignoring ?lamp=${forced} — expected on or off.`);
    return presetId === 'evening' || presetId === 'night';
}

function setLamp(on, { instant = state.ctx.instant } = {}) {
    const { ctx, lamp } = state;
    if (!lamp) return;
    state.on = on;
    state.fade?.cancel();
    state.fade = ctx.motion.animate({
        from: state.level,
        to: on ? 1 : 0,
        duration: LAMP.fadeMs,
        easing: ctx.motion.easings.inOutCubic,
        movesGeometry: false, // a light and a colour: no shadow map depends on them
        instant,
        onUpdate: (value) => {
            state.level = value;
            lamp.setLevel(value);
        }
    });
}

/** DeskScene's own hit volumes: the invisible boxes it adds to the scene, one per clickable. */
function deskHitVolumes(ctx) {
    return ctx.scene.children.filter((node) => node.isMesh && node.userData?.visualGroup && node.userData.deskObjectId);
}

/** Is the lamp what DeskScene would pick at `ndc` (the nearest clickable)? */
function lampUnderPointer(ctx, ndc) {
    const volumes = deskHitVolumes(ctx);
    if (volumes.length) {
        const hits = ctx.raycast(ndc, volumes, false);
        return hits[0]?.object.userData.deskObjectId === LAMP_ID;
    }
    // DeskScene stopped exposing its volumes that way: test the lamp's own proxy.
    return state.proxy ? ctx.raycast(ndc, [state.proxy], false).length > 0 : false;
}

function onCanvasClick(event) {
    const { ctx } = state;
    if (!state.lamp || event.defaultPrevented) return;
    try {
        if (!lampUnderPointer(ctx, ctx.pointer.ndcForEvent(event))) return;
        setLamp(!state.on);
        ctx.visit.log(VISIT_TITLE);
    } catch (error) {
        ctx.warn('lamp switch failed', error);
    }
}

/**
 * If the lamp can't be built, its hit volume (frozen by DeskScene before mount)
 * would still show "the lamp" over bare wall. Park it far below the room so
 * nothing picks it — the one reach into DeskScene's hit boxes, and only on
 * failure.
 */
function disableLampVolume(ctx) {
    for (const volume of deskHitVolumes(ctx)) {
        if (volume.userData.deskObjectId !== LAMP_ID) continue;
        volume.position.set(0, -1000, 0);
        volume.updateMatrixWorld(true);
    }
}

function attempt(ctx, label, fn) {
    try {
        return fn();
    } catch (error) {
        ctx.warn(`${label} unavailable; the room carries on without it.`, error);
        return null;
    }
}

const { size: LAMP_HIT_SIZE, centre: LAMP_HIT_CENTRE } = lampHitProxy();

export default {
    id: 'props',
    objectIds: [],
    // The retro keyboard's model off; the new one is built into the same group.
    overrides: {
        keyboard: { model: undefined, parts: [], position: [...KEYBOARD.position], clickable: false, label: null }
    },
    deskObjects: [
        {
            id: LAMP_ID,
            label: LAMP_LABEL,
            clickable: true,
            position: [...LAMP_ORIGIN],
            rotation: [0, 0, 0],
            hover: { lift: 0 }, // a lamp doesn't hop; the tint and the label are the affordance
            parts: [hitProxy(LAMP_HIT_SIZE, { position: LAMP_HIT_CENTRE })]
        },
        {
            id: MUG_ID,
            label: null,
            clickable: false,
            position: [...MUG.position],
            rotation: [0, MUG.handle.heading, 0],
            parts: []
        }
    ],
    states: [],
    vignette: false,

    async mount(ctx) {
        try {
            await mountProps(ctx);
        } catch (error) {
            if (!state.lamp) disableLampVolume(ctx);
            throw error; // the router logs it and carries on
        }
    },

    /** Not a destination: anything under #props goes back to the desk. */
    async go(ctx) {
        await ctx.navigate('#desk', { replace: true });
    },

    leave() {}
};

async function mountProps(ctx) {
    state.ctx = ctx;
    const presetId = activePreset()?.id ?? 'day';
    const summary = { triangles: 0, meshes: 0 };
    const count = (built) => {
        for (const mesh of built?.meshes ?? []) {
            const g = mesh.geometry;
            summary.meshes += 1;
            summary.triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
        }
    };

    const lampGroup = ctx.deskScene.getObjectGroup(LAMP_ID);
    if (lampGroup) {
        lampGroup.traverse((node) => { if (node.isMesh && node.material?.visible === false) state.proxy = node; });
        state.lamp = attempt(ctx, 'the lamp', () => buildLamp(lampGroup));
        count(state.lamp);
        if (state.lamp) {
            setLamp(initialLampOn(ctx, presetId), { instant: true });
            const canvas = ctx.deskScene.renderer.domElement;
            canvas.addEventListener('click', onCanvasClick);
            state.unsubscribers.push(() => canvas.removeEventListener('click', onCanvasClick));
        } else {
            disableLampVolume(ctx);
        }
    }

    const keyboardGroup = ctx.deskScene.getObjectGroup('keyboard');
    if (keyboardGroup) count(attempt(ctx, 'the keyboard', () => buildKeyboard(ctx, keyboardGroup)));
    else ctx.warn('No "keyboard" group on the desk; the new keyboard was not built.');

    const mugGroup = ctx.deskScene.getObjectGroup(MUG_ID);
    const mug = mugGroup ? attempt(ctx, 'the mug', () => buildMug(mugGroup)) : null;
    count(mug);
    if (mug && steamWanted(ctx)) state.steam = attempt(ctx, 'the steam', () => createSteam(ctx, mugGroup, { presetId }));

    const accents = attempt(ctx, 'the accent tone-down', () => toneDownAccents(ctx, presetId)) ?? [];

    ctx.invalidateShadows();
    ctx.log('mounted', {
        preset: presetId,
        lamp: state.on ? 'on' : 'off',
        steam: Boolean(state.steam),
        meshes: summary.meshes,
        triangles: Math.round(summary.triangles),
        accents
    });
}

/** ?steam=0|off leaves the steam out; anything else keeps it. */
function steamWanted(ctx) {
    const value = String(param('steam') ?? '').trim().toLowerCase();
    if (['0', 'off', 'false'].includes(value)) return false;
    if (value && !['1', 'on', 'true'].includes(value)) ctx.warn(`Ignoring ?steam=${value} — expected on or off.`);
    return true;
}

/** For node checks and the console: where the steam is and why it shows or hides (null if it was left out). */
export function steamState() {
    return state.steam?.state() ?? null;
}

/** For node checks and the console: the lamp's state. */
export function lampState() {
    return { on: state.on, level: state.level, built: Boolean(state.lamp) };
}
