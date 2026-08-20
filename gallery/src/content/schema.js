const REQUIRED_FIELDS = ['id', 'title', 'date', 'fragments', 'piece', 'connections'];

/**
 * @param {object} work
 * @throws {Error} if a required field is missing or a fragment/connection is malformed
 */
export function validateWork(work) {
    for (const field of REQUIRED_FIELDS) {
        if (work[field] === undefined) {
            throw new Error(`Work "${work.id ?? '(no id)'}" is missing required field "${field}"`);
        }
    }
    for (const fragment of work.fragments) {
        if (!fragment.targetId || !fragment.text) {
            throw new Error(`Work "${work.id}" has a fragment missing "targetId" or "text"`);
        }
    }
    for (const connection of work.connections) {
        if (!connection.workId || !connection.sentence) {
            throw new Error(`Work "${work.id}" has a connection missing "workId" or "sentence"`);
        }
    }
    return work;
}
