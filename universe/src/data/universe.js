import universeData from '../../data/universe.json';

// A landmark is independently focusable/cycleable content anchored to a
// planet: a country island (kind 'slot', Earth only), an orbiting object
// (kind 'satellite'), or an object mounted one-at-a-time inside a
// 'coreReveal' body's see-through core (kind 'core', e.g. Shrine — see
// PlanetLoader.mountCoreLandmark). Each kind carries its own placement
// fields alongside the shared id/label/content.
function assertValidLandmark(landmark, bodyId) {
    if (!landmark.id || !landmark.label || !landmark.content?.title) {
        throw new Error(`universe.json: landmark is missing id/label/content.title on body "${bodyId}": ${JSON.stringify(landmark)}`);
    }
    if (landmark.kind === 'slot') {
        if (
            typeof landmark.position?.lat !== 'number' ||
            typeof landmark.position?.lon !== 'number' ||
            typeof landmark.cameraTargetHeight !== 'number' ||
            !landmark.skin
        ) {
            throw new Error(`universe.json: slot landmark "${landmark.id}" on body "${bodyId}" is missing position{lat,lon}/cameraTargetHeight/skin`);
        }
    } else if (landmark.kind === 'satellite' || landmark.kind === 'core') {
        if (!landmark.model && !landmark.placeholder) {
            throw new Error(`universe.json: ${landmark.kind} landmark "${landmark.id}" on body "${bodyId}" is missing model or placeholder`);
        }
    } else {
        throw new Error(`universe.json: landmark "${landmark.id}" on body "${bodyId}" has unknown kind "${landmark.kind}"`);
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
    if (body.contentTier === 'cluster' && !body.cluster) {
        throw new Error(`universe.json: cluster body "${body.id}" is missing cluster`);
    }
    if (body.contentTier !== 'cluster' && !body.content) {
        throw new Error(`universe.json: body "${body.id}" (contentTier "${body.contentTier}") is missing content`);
    }
    body.landmarks?.forEach((landmark) => assertValidLandmark(landmark, body.id));
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

/** @param {string} bodyId @returns that body's landmarks, in authored order — empty if it has none. */
export function getLandmarks(bodyId) {
    return getBody(bodyId).landmarks ?? [];
}

/** @param {string} bodyId @param {string} landmarkId @returns the landmark, or throws if unknown. */
export function getLandmark(bodyId, landmarkId) {
    const landmark = getLandmarks(bodyId).find((l) => l.id === landmarkId);
    if (!landmark) throw new Error(`universe.js: unknown landmark "${landmarkId}" on body "${bodyId}"`);
    return landmark;
}
