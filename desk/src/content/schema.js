/**
 * The categories, and the object on the desk that each one is entered through.
 *
 * THE CUT IS BY MEDIUM, NOT BY EMPLOYER. A résumé sorts by institution and
 * date because that is the only ordering a single sheet of paper can carry. A
 * desk cannot sort that way — there is no object that means "2023" — so these
 * are cut by what the thing physically *is*: something that ran on a screen
 * (`software`, read off the display), something printed (`academia`, the
 * stapled run of printouts), something you could pick up (`hardware`, the
 * breadboard), a job you held (`work`, the badge on the lanyard). Four
 * mediums, and four objects on the desk to enter them through. That is why the
 * Apple work appears under `software` and the Apple *job* under `work`, and
 * why those are two different entries rather than one.
 */
export const CATEGORY_LABELS = {
    software: 'Software',
    hardware: 'Hardware',
    work: 'Work',
    academia: 'Academia'
};

const VALID_CATEGORIES = Object.keys(CATEGORY_LABELS);

const REQUIRED_FIELDS = [
    'id',
    'title',
    'date',
    'previewImage',
    'blurb',
    'previewAspect',
    'category',
    'connections',
    'editorial'
];

const REQUIRED_EDITORIAL_FIELDS = ['credit', 'body'];

const VALID_PREVIEW_ASPECTS = ['wide', 'tall', 'square'];

/**
 * @param {object} work
 * @throws {Error} if a required field is missing, previewAspect/category is
 *                 unrecognized, or a connection/editorial sub-field is malformed
 */
export function validateWork(work) {
    for (const field of REQUIRED_FIELDS) {
        if (work[field] === undefined) {
            throw new Error(`Work "${work.id ?? '(no id)'}" is missing required field "${field}"`);
        }
    }
    if (!VALID_PREVIEW_ASPECTS.includes(work.previewAspect)) {
        throw new Error(
            `Work "${work.id}" has an invalid "previewAspect" (must be one of ${VALID_PREVIEW_ASPECTS.join(', ')})`
        );
    }
    if (!VALID_CATEGORIES.includes(work.category)) {
        throw new Error(
            `Work "${work.id}" has an invalid "category" (must be one of ${VALID_CATEGORIES.join(', ')})`
        );
    }
    for (const connection of work.connections) {
        if (!connection.workId || !connection.sentence) {
            throw new Error(`Work "${work.id}" has a connection missing "workId" or "sentence"`);
        }
    }

    const { editorial } = work;
    for (const field of REQUIRED_EDITORIAL_FIELDS) {
        if (editorial[field] === undefined) {
            throw new Error(`Work "${work.id}" is missing required field "editorial.${field}"`);
        }
    }
    if (editorial.stat && (!editorial.stat.value || !editorial.stat.label)) {
        throw new Error(`Work "${work.id}" has an editorial.stat missing "value" or "label"`);
    }
    if (editorial.quote && (!editorial.quote.text || !editorial.quote.attribution)) {
        throw new Error(`Work "${work.id}" has an editorial.quote missing "text" or "attribution"`);
    }
    for (const link of editorial.links ?? []) {
        if (!link.label || !link.href) {
            throw new Error(`Work "${work.id}" has an editorial.link missing "label" or "href"`);
        }
    }

    // Optional: the 3D object that stands in for this work when its category
    // renders as real geometry rather than text (the hardware bench, the
    // lanyard). An artifact is either a loaded model or a set of primitives —
    // the same two ways a desk object itself may be built, and for the same
    // reason: a soldering iron has to be modelled, an ID badge is a card with
    // lettering on it and would be absurd to author in Blender.
    //
    // Anything without an artifact at all falls back to a generated board, so
    // the only way to get this wrong is to declare one and give it neither.
    if (work.artifact && !work.artifact.modelUrl && !work.artifact.parts?.length) {
        throw new Error(
            `Work "${work.id}" has an "artifact" with neither a "modelUrl" nor a non-empty "parts" array`
        );
    }
    if (work.artifact?.modelUrl && work.artifact.parts) {
        throw new Error(
            `Work "${work.id}" has an "artifact" with both a "modelUrl" and "parts" — it is one or the other`
        );
    }

    return work;
}
