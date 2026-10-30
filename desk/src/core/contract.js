/**
 * THE MODULE CONTRACT
 * ===================
 *
 * A module is one thing on the desk that you can walk up to (the photo box, the
 * bench, the monitor, the printer). It lives in src/modules/<id>/index.js and
 * default-exports a plain object:
 *
 *   export default {
 *     id: 'box',                       // also the route: #box, #box/<path…>
 *     objectIds: ['photo-box'],        // desk objects whose click/hover routes here
 *     deskObjects: [ … ],              // entries ADDED to the desk (deskObjects.js shape)
 *     overrides: { 'studio-display': { label: 'now' } },   // optional: patch existing entries
 *     states: [{ hash: '#box', note: 'lid off, prints inside' }, …],
 *     liftWhileActive: false,          // optional: keep objectIds[0] raised (DeskScene.holdLift) while active
 *     vignette: true,                  // optional: darken the frame edges while active (default true)
 *     async mount(ctx) {},             // once, after every model has loaded
 *     async go(ctx, path, { instant }) {},    // route entered / changed within this module
 *     async leave(ctx, { instant }) {},       // route left this module
 *     key(ctx, event) { return false; },      // keydown while active; true = handled
 *     click(ctx, ndc, event) { return false; },// canvas click while active, BEFORE the scene's; true = handled
 *     trail(ctx) {}                    // apply "what a full visit leaves behind" (#desk/after)
 *   };
 *
 * LIFECYCLE
 *   1. main.js imports every module (dynamically — a module that throws on
 *      import is logged and left out; the room still opens).
 *   2. The layout is built: base desk − breadboard − lanyard, paper-stack made
 *      scenery (and emptied by the paper module's overrides, v4), each module's
 *      `overrides` applied and `deskObjects` appended.
 *   3. Assets preload, DeskScene is built, every model attaches (hitboxes are
 *      frozen here — see core/parts.js hitProxy).
 *   4. mount(ctx) for each module — started in the order monitor → bench →
 *      box → paper → printer → props → badge but run concurrently, so never depend on another module.
 *      Build meshes, canvases, listeners. Add meshes to
 *      ctx.deskScene.getObjectGroup(id) to ride with the object (and its hover
 *      lift), or to ctx.scene for things that leave it (prints on the desk).
 *   5. The first route is applied with { instant: true } (behind the veil).
 *
 * ROUTING  (hash = #<moduleId>[/<path…>])
 *   - go(ctx, path, opts) is called on entering the module AND whenever the
 *     path changes inside it (#box → #box/amazon → #box/amazon/back). It must
 *     take the module from WHATEVER state it is in to the one `path` names —
 *     including mid-animation, because go() can be called again before the
 *     previous call's promise resolved. Supersede running moves (motion
 *     promises carry .cancel(); camera.moveTo cancels the previous move).
 *   - The module owns the camera while active: go() should call
 *     ctx.camera.moveTo(...) for its shot.
 *   - leave(ctx, opts) is called when the route leaves the module. Put things
 *     away, remove your DOM buttons. Do NOT move the camera (the router or the
 *     next module does) and do NOT set hint/live (the router resets them).
 *   - opts.instant is true under ?still=1, prefers-reduced-motion, and for the
 *     first route of a page load. Honour it: land in one frame.
 *   - Navigate with ctx.navigate('#box/apple-intern'). Unknown sub-paths should
 *     fall back to the module's root state, not throw.
 *
 * INPUT
 *   - Canvas clicks while you are active reach click(ctx, ndc, event) first
 *     (capture phase). Return true to swallow it. Otherwise the scene's own
 *     click runs: a hit on ANOTHER module's object routes there; a hit on your
 *     own object does nothing; a miss returns to #desk.
 *   - key(ctx, event): arrows, Escape, anything. Return true to swallow. An
 *     unhandled Escape returns to #desk.
 *   - Hover tooltips on desk objects are the router's (label from the entry)
 *     and are suppressed while any module is active. For hover inside your
 *     module use ctx.pointer.onMove + ctx.raycast.
 *
 * TRAIL
 *   trail(ctx) puts the module into "what a full visit leaves behind" for
 *   #desk/after (prints spread beside the box, the receipt out of the
 *   printer). It must be idempotent and must not move the camera. Log what it
 *   lays out with ctx.visit.log(title) so the receipt agrees with the desk.
 *
 * STATES
 *   `states` lists every deterministic state the module can be in — what
 *   window.__desk.states() hands back, for debugging and tests. Each must
 *   render identically under ?still=1 (seeded rng, fixed clock, no timers —
 *   ctx.every() does not fire in still mode).
 *
 * FAILURE
 *   Every call into a module is wrapped: a throw is logged as
 *   "[desk:<id>] <method> failed" and the room carries on. Ticks added through
 *   ctx.addTick are wrapped too (removed after 3 throws).
 */

/**
 * @typedef {object} ModuleState
 * @property {string} hash   e.g. '#box/amazon/back'
 * @property {string} note   what that state should look like
 */

/**
 * @typedef {object} DeskModule
 * @property {string} id
 * @property {string[]} objectIds
 * @property {object[]} deskObjects
 * @property {Record<string, object>} [overrides]
 * @property {ModuleState[]} states
 * @property {boolean} [liftWhileActive]
 * @property {boolean} [vignette]
 * @property {(ctx: DeskContext) => Promise<void>|void} mount
 * @property {(ctx: DeskContext, path: string[], opts: { instant: boolean }) => Promise<void>|void} go
 * @property {(ctx: DeskContext, opts: { instant: boolean }) => Promise<void>|void} leave
 * @property {(ctx: DeskContext, event: KeyboardEvent) => boolean} key
 * @property {(ctx: DeskContext, ndc: {x:number,y:number}, event: MouseEvent) => boolean} click
 * @property {(ctx: DeskContext) => Promise<void>|void} trail
 */

/**
 * @typedef {object} DeskContext  — see core/context.js for the implementation
 * @property {typeof import('three')} THREE
 * @property {object} deskScene      src/scene/DeskScene.js instance
 * @property {import('three').Scene} scene
 * @property {object} camera         core/camera.js: moveTo, establishing, intro, isMoving, finalPose, currentPose, object
 * @property {Function} poseInFront  (cameraPose?, options) => { position, quaternion, distance, frameHeight, heightFraction }
 * @property {object} frame          report(target, {pose?, aspect?}), heightAt(d), distanceForFraction(h, f)
 * @property {object} motion         core/motion.js
 * @property {object} palette        core/palette.js
 * @property {object} fonts          core/fonts.js
 * @property {object} draw           core/draw.js
 * @property {string} moduleId
 */

const NOOP = () => {};
const NO = () => false;

/** Fills in defaults and checks the shape, so the router can call anything. */
export function normalizeModule(raw, sourceLabel = 'module') {
    const module = raw?.default ?? raw;
    if (!module || typeof module !== 'object' || typeof module.id !== 'string' || !module.id) {
        throw new TypeError(`${sourceLabel} does not default-export a module with an id`);
    }
    if (!/^[a-z][a-z0-9-]*$/.test(module.id) || module.id === 'desk') {
        throw new TypeError(`${sourceLabel}: module id "${module.id}" must be lowercase, url-safe, and not "desk"`);
    }
    return {
        objectIds: [],
        deskObjects: [],
        overrides: {},
        states: [],
        liftWhileActive: false,
        vignette: true,
        ...module,
        mount: typeof module.mount === 'function' ? module.mount.bind(module) : NOOP,
        go: typeof module.go === 'function' ? module.go.bind(module) : NOOP,
        leave: typeof module.leave === 'function' ? module.leave.bind(module) : NOOP,
        key: typeof module.key === 'function' ? module.key.bind(module) : NO,
        click: typeof module.click === 'function' ? module.click.bind(module) : NO,
        trail: typeof module.trail === 'function' ? module.trail.bind(module) : NOOP
    };
}
