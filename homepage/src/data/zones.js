import zonesData from '../../data/zones.json';

const MODES = ['geography', 'shaesWorld'];

function assertValidSlot(slot) {
    if (
        !slot.id ||
        typeof slot.position?.lat !== 'number' ||
        typeof slot.position?.lon !== 'number' ||
        typeof slot.cameraTargetHeight !== 'number'
    ) {
        throw new Error(`zones.json: slot is missing id/position{lat,lon}/cameraTargetHeight: ${JSON.stringify(slot)}`);
    }
    for (const mode of MODES) {
        if (!slot.skins[mode]) {
            throw new Error(`zones.json: slot "${slot.id}" is missing skin "${mode}"`);
        }
    }
}

zonesData.slots.forEach(assertValidSlot);

/** Camera cluster framing shared by both modes. */
export const cameraConfig = zonesData.camera;

/** All slots, in cluster order. Each carries both skins. */
export const slots = zonesData.slots;

/** @param {string} slotId @returns the slot, or throws if unknown. */
export function getSlot(slotId) {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot) throw new Error(`zones.js: unknown slot "${slotId}"`);
    return slot;
}

/**
 * @param {string} slotId
 * @param {'geography'|'shaesWorld'} mode
 * @returns the skin content for that slot in that mode.
 */
export function getSkin(slotId, mode) {
    return getSlot(slotId).skins[mode];
}
