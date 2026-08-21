export const CATEGORY_LABELS = {
    software: 'Software',
    essays: 'Essays',
    diary: 'Diary',
    hardware: 'Hardware'
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

    return work;
}
