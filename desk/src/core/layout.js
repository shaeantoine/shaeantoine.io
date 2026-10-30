/**
 * The site's desk: the original layout minus what the new direction retires,
 * plus whatever each module brings.
 *
 *   removed   'breadboard' (the soldering station — the bench replaces it)
 *             'lanyard'    (the original site's badge — past badges live in the photo box;
 *                          the current one is the badge module's 'current-badge')
 *   scenery   'paper-stack' made unclickable here; since v4 the paper module also
 *             empties it (overrides: no parts, no model) and builds its own
 *             clickable stack, 'paper-door'. If paper fails to import, the old
 *             stack stays as scenery.
 *   owned     'studio-display' stays, owned by the monitor module
 */

export const REMOVED_IDS = Object.freeze(['breadboard', 'lanyard']);
export const SCENERY_IDS = Object.freeze(['paper-stack']);

/**
 * @param {object[]} baseObjects src/content/deskObjects.js
 * @param {object[]} modules normalised modules
 * @returns {{ objects: object[], owners: Map<string, object> }}
 */
export function buildLayout(baseObjects, modules) {
    const objects = [];
    for (const entry of baseObjects) {
        if (REMOVED_IDS.includes(entry.id)) continue;
        objects.push(SCENERY_IDS.includes(entry.id) ? { ...entry, clickable: false, label: null } : entry);
    }

    const owners = new Map();
    for (const module of modules) {
        try {
            for (const [id, patch] of Object.entries(module.overrides ?? {})) {
                const index = objects.findIndex((object) => object.id === id);
                if (index < 0) {
                    console.warn(`[desk:${module.id}] overrides "${id}", which is not on the desk.`);
                    continue;
                }
                objects[index] = { ...objects[index], ...patch };
            }
            for (const entry of module.deskObjects ?? []) {
                if (!entry?.id || !Array.isArray(entry.position) || !(entry.parts || entry.model)) {
                    console.warn(`[desk:${module.id}] skipping a deskObject without id/position/parts|model`, entry);
                    continue;
                }
                if (objects.some((object) => object.id === entry.id)) {
                    console.warn(`[desk:${module.id}] deskObject id "${entry.id}" is already taken; skipped.`);
                    continue;
                }
                objects.push({ category: null, rotation: [0, 0, 0], ...entry });
            }
            for (const id of module.objectIds ?? []) {
                if (owners.has(id)) {
                    console.warn(`[desk:${module.id}] "${id}" is already owned by ${owners.get(id).id}; keeping the first.`);
                    continue;
                }
                owners.set(id, module);
            }
        } catch (error) {
            console.error(`[desk:${module.id}] layout contribution failed; the module's objects are left out.`, error);
        }
    }
    return { objects, owners };
}
