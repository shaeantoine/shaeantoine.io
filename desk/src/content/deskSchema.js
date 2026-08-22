import { CATEGORY_LABELS } from './schema.js';

const VALID_CATEGORIES = Object.keys(CATEGORY_LABELS);
const VALID_GEOMETRY_TYPES = ['box', 'cylinder', 'sphere', 'torus', 'plane'];

/**
 * @param {object} object a desk object descriptor
 * @throws {Error} if the object's shape is invalid
 */
export function validateDeskObject(object) {
    if (!object.id) {
        throw new Error('Desk object is missing an "id"');
    }
    if (object.clickable) {
        if (!VALID_CATEGORIES.includes(object.category)) {
            throw new Error(
                `Desk object "${object.id}" is clickable but has an invalid "category" (must be one of ${VALID_CATEGORIES.join(', ')})`
            );
        }
    } else if (object.category !== null) {
        throw new Error(`Desk object "${object.id}" is non-clickable but has a "category" set (must be null)`);
    }
    if (!Array.isArray(object.position) || object.position.length !== 3) {
        throw new Error(`Desk object "${object.id}" has an invalid "position" (must be a [x, y, z] array)`);
    }
    if (!Array.isArray(object.parts) || object.parts.length === 0) {
        throw new Error(`Desk object "${object.id}" must have at least one geometry "part"`);
    }
    for (const part of object.parts) {
        if (!VALID_GEOMETRY_TYPES.includes(part.type)) {
            throw new Error(
                `Desk object "${object.id}" has a part with an invalid geometry "type" (must be one of ${VALID_GEOMETRY_TYPES.join(', ')})`
            );
        }
        if (!Array.isArray(part.args)) {
            throw new Error(`Desk object "${object.id}" has a part missing geometry "args"`);
        }
        if (!part.color) {
            throw new Error(`Desk object "${object.id}" has a part missing a "color"`);
        }
    }
    return object;
}

/**
 * @param {object[]} objects desk object descriptors
 * @param {object[]} works the Work registry, to cross-check category coverage
 * @throws {Error} if ids collide, any object is malformed, or a clickable
 *                 object's category has no matching Work
 */
export function validateDeskLayout(objects, works) {
    const ids = objects.map((object) => object.id);
    if (new Set(ids).size !== ids.length) {
        throw new Error('Desk layout has duplicate object ids');
    }

    objects.forEach(validateDeskObject);

    const categoriesWithWorks = new Set(works.map((work) => work.category));
    for (const object of objects) {
        if (object.clickable && !categoriesWithWorks.has(object.category)) {
            throw new Error(
                `Desk object "${object.id}" is clickable with category "${object.category}", but no Work in the registry has that category`
            );
        }
    }

    return objects;
}
