import universeData from '../../data/universe.json';

const MODES = ['geography', 'shaesWorld'];

function assertValidSlot(slot) {
    if (
        !slot.id ||
        typeof slot.position?.lat !== 'number' ||
        typeof slot.position?.lon !== 'number' ||
        typeof slot.cameraTargetHeight !== 'number'
    ) {
        throw new Error(`universe.json: slot is missing id/position{lat,lon}/cameraTargetHeight: ${JSON.stringify(slot)}`);
    }
    for (const mode of MODES) {
        if (!slot.skins[mode]) {
            throw new Error(`universe.json: slot "${slot.id}" is missing skin "${mode}"`);
        }
    }
}

function assertValidBody(body) {
    if (!body.id || typeof body.orbit?.radius !== 'number' || typeof body.orbit?.phaseDeg !== 'number') {
        throw new Error(`universe.json: body is missing id/orbit{radius,phaseDeg}: ${JSON.stringify(body)}`);
    }
    if (!body.renderRecipe?.type) {
        throw new Error(`universe.json: body "${body.id}" is missing renderRecipe.type`);
    }
    if (!body.contentTier) {
        throw new Error(`universe.json: body "${body.id}" is missing contentTier`);
    }
    if (body.contentTier === 'cluster') {
        if (!Array.isArray(body.cluster?.slots) || body.cluster.slots.length === 0) {
            throw new Error(`universe.json: cluster body "${body.id}" is missing cluster.slots`);
        }
        body.cluster.slots.forEach(assertValidSlot);
    } else if (!body.content) {
        throw new Error(`universe.json: body "${body.id}" (contentTier "${body.contentTier}") is missing content`);
    }
}

universeData.bodies.forEach(assertValidBody);

/** The sun's own render config (radius/color). */
export const sunConfig = universeData.sun;

/** Outer solar-orbit framing, shared by CameraRig's base frame. */
export const cameraConfig = universeData.camera;

/** All bodies (planets and, eventually, belts), in no particular render order. */
export const bodies = universeData.bodies;

/** The landing "Brief" copy — `intro` is an array of one-sentence concept-card strings, `paragraphs` an array of paragraphs, each an array of {text, target?} runs. Missing/malformed brief degrades to no text rather than a hard failure, since it's presentational, not structural. */
const rawBrief = universeData.brief ?? (console.warn('universe.js: no "brief" field in universe.json'), {});
export const brief = { intro: rawBrief.intro ?? [], paragraphs: rawBrief.paragraphs ?? [] };

/** @param {string} bodyId @returns the body, or throws if unknown. */
export function getBody(bodyId) {
    const body = bodies.find((b) => b.id === bodyId);
    if (!body) throw new Error(`universe.js: unknown body "${bodyId}"`);
    return body;
}

/** The one body with contentTier 'cluster' — today, always Earth. */
export function getClusterBody() {
    const body = bodies.find((b) => b.contentTier === 'cluster');
    if (!body) throw new Error('universe.js: no cluster body defined');
    return body;
}

/** @param {string} slotId @returns the slot from the cluster body's slots, or throws if unknown. */
export function getSlot(slotId) {
    const slot = getClusterBody().cluster.slots.find((s) => s.id === slotId);
    if (!slot) throw new Error(`universe.js: unknown slot "${slotId}"`);
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
