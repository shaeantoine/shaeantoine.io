import * as THREE from 'three';
import { CATEGORY_LABELS } from '../content/schema.js';
import { invalidateShadows } from '../scene/renderScheduler.js';
import { worksForCategory, nextIndex } from './itemList.js';
import { createFocusStrategy } from './strategies/index.js';

/**
 * Owns everything about focus mode: which object/category/index is active,
 * the camera move in/out, and the per-object visual strategy's lifecycle.
 * Text-panel and arrow DOM rendering are the caller's job (main.js) — this
 * module only exposes state + actions, matching the existing "controller
 * owns behavior, main.js owns DOM" split already used for DeskScene/CameraRig.
 * The focused object holds still once entered — it doesn't track the cursor
 * or react to hover, so nothing here needs a per-frame update. A pointer-driven
 * tilt on the focused group was written and dropped; all that survives of it is
 * `dampedApproach` in focus/cursorTilt.js, whose only caller now is the desk
 * cursor's echo (cursor/DeskCursor.js).
 */
export function createFocusController({ deskScene, cameraRig, works, deskObjects }) {
    let active = null; // { objectId, categoryId, items, index, strategy, group }
    const clickRaycaster = new THREE.Raycaster();

    function findObjectConfig(objectId) {
        return deskObjects.find((object) => object.id === objectId);
    }

    /** An item is either a raw Work (screen/model/artifact strategies) or a page descriptor wrapping one (the sheet stack, which paginates). */
    function workOf(item) {
        return item.work ?? item;
    }

    function enter(objectId, workId) {
        const objectConfig = findObjectConfig(objectId);
        const categoryWorks = worksForCategory(works, objectConfig.category);
        const strategy = createFocusStrategy(objectConfig.focus.visual);
        const items = strategy.buildItems ? strategy.buildItems(categoryWorks, objectConfig.focus.anchor) : categoryWorks;
        const startIndex = workId ? Math.max(items.findIndex((item) => workOf(item).id === workId), 0) : 0;
        const group = deskScene.getObjectGroup(objectId);

        // A strategy may return the index it actually ended up showing, which
        // can differ from the one asked for: the hardware object leaves its
        // last selection standing on the desk, so clicking it without naming
        // a project resumes that rather than snapping back to the first one.
        // Strategies that don't care return nothing and keep the request.
        const adoptedIndex = strategy.mount(group, objectConfig.focus.anchor, items[startIndex], {
            requestedExplicitly: Boolean(workId),
            // Strategies build their own canvas-textured meshes and have no
            // renderer to ask for this. Without it a page falls back to
            // anisotropy 1 and goes soft along the axis it is most foreshortened
            // in, which on a flat sheet under a raised camera is all of them.
            anisotropy: deskScene.maxAnisotropy ?? 1,
            // And for the same reason: a strategy sizes its canvases from the
            // pixels they will cover, which it cannot work out without knowing
            // how many the scene is drawing into. See scene/textureBudget.js.
            bufferHeight: deskScene.getDrawingBufferHeight?.() ?? 0
        }) ?? startIndex;
        cameraRig.focusOn(deskScene.getObjectWorldPosition(objectId), objectConfig.focus.camera);

        active = {
            objectId,
            categoryId: objectConfig.category,
            items,
            index: adoptedIndex,
            strategy,
            group
        };
        // mount() adds meshes to the scene synchronously. The camera dolly that
        // follows would happen to request frames anyway, but relying on that
        // would make a strategy invisible the day one is entered without a
        // camera move.
        invalidateShadows();
        return currentSnapshot();
    }

    async function step(direction) {
        if (!active) return null;
        const target = nextIndex(active.index, active.items.length, direction);
        if (target === active.index) return currentSnapshot();
        await active.strategy.transitionTo(active.items[target], direction);
        if (!active) return null; // exited mid-transition — a strategy that settles its promise on unmount lands here
        active.index = target;
        return currentSnapshot();
    }

    function exit() {
        if (!active) return;
        active.strategy.unmount();
        cameraRig.reset();
        active = null;
        invalidateShadows(); // unmount() removed meshes; the scene has to be redrawn without them
    }

    function snapshotAt(index) {
        if (!active) return null;
        return {
            objectId: active.objectId,
            categoryLabel: CATEGORY_LABELS[active.categoryId] ?? active.categoryId,
            work: workOf(active.items[index]),
            index,
            total: active.items.length
        };
    }

    function currentSnapshot() {
        if (!active) return null;
        return snapshotAt(active.index);
    }

    /**
     * What a step in `direction` would land on, without taking it — null when
     * there's nowhere to go.
     *
     * `step` only commits its index once the strategy's transition resolves,
     * which is the right moment for the scene but too late for chrome that
     * wants to change *during* the move. The hardware spread crossfades its
     * text so that the new copy appears at the midpoint of the object's own
     * swap; without this it would have to wait for the object to finish and
     * then start changing, and the two would visibly lag each other.
     */
    function peek(direction) {
        if (!active) return null;
        const target = nextIndex(active.index, active.items.length, direction);
        if (target === active.index) return null;
        return snapshotAt(target);
    }

    /**
     * Synchronous raycast against the active strategy's own interactive
     * meshes (currently only sheetStrategy's two sheet planes) — lets clicking
     * the stack itself turn a sheet or exit instead of going through DOM chrome.
     * Returns null when there's nothing active or the strategy doesn't
     * customize clicks (screen/model/artifact), 'exit' when the click missed
     * every interactive mesh, or 'next'/'prev' on a hit.
     */
    function resolveCanvasClick(ndcX, ndcY) {
        if (!active?.strategy.getInteractiveMeshes) return null;
        const meshes = active.strategy.getInteractiveMeshes();
        if (meshes.length === 0) return null;
        clickRaycaster.setFromCamera({ x: ndcX, y: ndcY }, deskScene.camera);
        const hits = clickRaycaster.intersectObjects(meshes, false);
        if (hits.length === 0) return 'exit';
        return active.strategy.resolveDirection(hits[0]);
    }

    function isActive() {
        return active !== null;
    }

    function findObjectIdForCategory(categoryId) {
        return deskObjects.find((object) => object.clickable && object.category === categoryId)?.id;
    }

    return { enter, step, exit, isActive, currentSnapshot, peek, findObjectIdForCategory, resolveCanvasClick };
}
