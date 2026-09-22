import { CATEGORY_LABELS } from './schema.js';
import { MATERIAL_OVERRIDE_FIELDS } from '../scene/materialOverrides.js';
import { POSE_GROUP_NAME } from '../scene/partMesh.js';

const VALID_CATEGORIES = Object.keys(CATEGORY_LABELS);
const VALID_GEOMETRY_TYPES = ['box', 'cylinder', 'sphere', 'torus', 'plane'];
const VALID_FOCUS_STRATEGIES = ['card', 'screen', 'sheets', 'none', 'model', 'artifact'];

function validateFocusConfig(object) {
    const { focus } = object;
    if (!focus) {
        throw new Error(`Desk object "${object.id}" is clickable but missing "focus" config`);
    }
    if (!VALID_FOCUS_STRATEGIES.includes(focus.visual)) {
        throw new Error(
            `Desk object "${object.id}" has an invalid "focus.visual" (must be one of ${VALID_FOCUS_STRATEGIES.join(', ')})`
        );
    }
    if (!focus.camera || !Array.isArray(focus.camera.offset) || !Array.isArray(focus.camera.lookAtOffset)) {
        throw new Error(`Desk object "${object.id}" is missing "focus.camera" (must have "offset" and "lookAtOffset")`);
    }
    if (focus.visual !== 'none' && !focus.anchor) {
        throw new Error(`Desk object "${object.id}" has focus.visual "${focus.visual}" but is missing "focus.anchor"`);
    }
    if (focus.visual === 'model' && !focus.anchor.modelUrl) {
        throw new Error(`Desk object "${object.id}" has focus.visual "model" but is missing "focus.anchor.modelUrl"`);
    }
    if (focus.visual === 'sheets') {
        if (!Array.isArray(focus.anchor.size) || focus.anchor.size.length !== 2) {
            throw new Error(`Desk object "${object.id}" has focus.visual "sheets" but is missing a [width, depth] "focus.anchor.size"`);
        }
        // The one number that fails silently and invisibly: a page drawn below
        // the top of the stack it is lying on is inside it, z-fighting with a
        // sheet it exactly overlaps, and the symptom is flicker rather than an
        // error. There is no sensible default for it either — it depends on
        // how many sheets the stack has.
        if (typeof focus.anchor.height !== 'number' || !Number.isFinite(focus.anchor.height)) {
            throw new Error(`Desk object "${object.id}" has focus.visual "sheets" but is missing a numeric "focus.anchor.height"`);
        }
    }
    if (focus.visual === 'artifact') {
        if (!Array.isArray(focus.anchor.position) || focus.anchor.position.length !== 3) {
            throw new Error(`Desk object "${object.id}" has focus.visual "artifact" but is missing a [x, y, z] "focus.anchor.position"`);
        }
        if (focus.anchor.travel !== undefined && (!Array.isArray(focus.anchor.travel) || focus.anchor.travel.length !== 3)) {
            throw new Error(`Desk object "${object.id}" has a "focus.anchor.travel" that is not a [x, y, z] array`);
        }
        // The presented pose is all-or-nothing: a rotation with no pivot spins
        // the parts about the middle of the object instead of the edge they
        // hinge on, which does not look like a mistake in the data — it looks
        // like a badge levitating.
        if (focus.anchor.present !== undefined) {
            for (const field of ['pivot', 'rotation']) {
                const value = focus.anchor.present[field];
                if (!Array.isArray(value) || value.length !== 3 || value.some((entry) => !Number.isFinite(entry))) {
                    throw new Error(
                        `Desk object "${object.id}" has a "focus.anchor.present.${field}" that is not a [x, y, z] array of numbers`
                    );
                }
            }
        }
    }
}

/**
 * Material overrides are silent when wrong — a typo'd field name or an
 * out-of-range roughness produces no error at render time, just a surface that
 * inexplicably still looks the way it did before. Validating here turns both
 * into a load-time throw naming the object and the exact field path.
 *
 * Shared by `model.material` (overriding what a .glb shipped with) and
 * `parts[n].material` (overriding the primitive default in DeskScene's
 * PART_MATERIAL_DEFAULTS) — same fields, same ranges, same failure mode.
 *
 * @param {string} objectId
 * @param {string} path where the block lives, for the error message
 * @param {unknown} material
 */
function validateMaterialOverrides(objectId, path, material) {
    if (material === undefined) return;
    if (typeof material !== 'object' || material === null || Array.isArray(material)) {
        throw new Error(`Desk object "${objectId}" has a "${path}" that is not an object`);
    }
    for (const [field, value] of Object.entries(material)) {
        const range = MATERIAL_OVERRIDE_FIELDS[field];
        if (!range) {
            throw new Error(
                `Desk object "${objectId}" has an unknown "${path}.${field}" ` +
                `(must be one of ${Object.keys(MATERIAL_OVERRIDE_FIELDS).join(', ')})`
            );
        }
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new Error(`Desk object "${objectId}" has a non-numeric "${path}.${field}"`);
        }
        if (value < range.min || value > range.max) {
            throw new Error(
                `Desk object "${objectId}" has "${path}.${field}" = ${value}, ` +
                `outside the valid range ${range.min}..${range.max}`
            );
        }
    }
}

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
        validateFocusConfig(object);
    } else if (object.category !== null) {
        throw new Error(`Desk object "${object.id}" is non-clickable but has a "category" set (must be null)`);
    }
    if (!Array.isArray(object.position) || object.position.length !== 3) {
        throw new Error(`Desk object "${object.id}" has an invalid "position" (must be a [x, y, z] array)`);
    }
    // The hover lift is in world units, and the range is what makes it a hover
    // rather than a jump: this desk is 3.2 units to the metre, so the top of
    // this band is about 6 cm of real-world rise on an object that might be
    // 8 mm thick.
    if (object.hover !== undefined) {
        const { lift } = object.hover;
        if (typeof lift !== 'number' || !Number.isFinite(lift) || lift < 0 || lift > 0.2) {
            throw new Error(`Desk object "${object.id}" has a "hover.lift" outside the range 0..0.2`);
        }
    }
    if (object.model) {
        if (typeof object.model.url !== 'string' || !object.model.url) {
            throw new Error(`Desk object "${object.id}" has a "model" missing a "url"`);
        }
        validateMaterialOverrides(object.id, 'model.material', object.model.material);
    }
    // BOTH IS ALLOWED, and one of the two is required. Nothing on the desk
    // does both at the moment — the objects that did were a .glb plus a few
    // primitives dressing it, which is what stopped the same asset used twice
    // from reading as the same asset used twice, and they are gone. The
    // combination stays legal because that is a real way to build an object and
    // the next one may need it. What is not allowed is neither: an object with
    // no geometry at all is invisible, clickable, and impossible to find.
    if (!object.model && !Array.isArray(object.parts)) {
        throw new Error(`Desk object "${object.id}" must have at least one geometry "part" (or a "model")`);
    }
    if (object.parts === undefined) return object;
    if (!Array.isArray(object.parts) || object.parts.length === 0) {
        throw new Error(`Desk object "${object.id}" must have at least one geometry "part" (or a "model")`);
    }
    for (const [index, part] of object.parts.entries()) {
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
        if (part.texture !== undefined) {
            if (typeof part.texture !== 'string' || !part.texture) {
                throw new Error(`Desk object "${object.id}" has a "parts[${index}].texture" that is not a url`);
            }
            // Art is mapped onto one face, found by index into BoxGeometry's
            // per-face material groups. No other primitive here has a "front"
            // for that index to mean anything on, so a texture on a cylinder
            // would silently land on an arbitrary surface.
            if (part.type !== 'box') {
                throw new Error(
                    `Desk object "${object.id}" puts a "texture" on a "${part.type}" part — ` +
                    'only "box" parts have a front face to map art onto'
                );
            }
        }
        if (part.spine !== undefined) {
            if (typeof part.spine !== 'object' || part.spine === null || Array.isArray(part.spine)) {
                throw new Error(`Desk object "${object.id}" has a "parts[${index}].spine" that is not an object`);
            }
            if (typeof part.spine.title !== 'string' || !part.spine.title) {
                throw new Error(`Desk object "${object.id}" has a "parts[${index}].spine" missing a "title"`);
            }
            if (part.spine.author !== undefined && typeof part.spine.author !== 'string') {
                throw new Error(`Desk object "${object.id}" has a non-string "parts[${index}].spine.author"`);
            }
            if (part.type !== 'box') {
                throw new Error(
                    `Desk object "${object.id}" puts a "spine" on a "${part.type}" part — ` +
                    'only "box" parts have a front face to letter'
                );
            }
        }
        if (part.badge !== undefined) {
            if (typeof part.badge !== 'object' || part.badge === null || Array.isArray(part.badge)) {
                throw new Error(`Desk object "${object.id}" has a "parts[${index}].badge" that is not an object`);
            }
            for (const field of ['org', 'role']) {
                if (typeof part.badge[field] !== 'string' || !part.badge[field]) {
                    throw new Error(`Desk object "${object.id}" has a "parts[${index}].badge" missing a "${field}"`);
                }
            }
            if (part.type !== 'box') {
                throw new Error(
                    `Desk object "${object.id}" puts a "badge" on a "${part.type}" part — ` +
                    'only "box" parts have a front face to print'
                );
            }
        }
        if (part.sheet !== undefined) {
            if (typeof part.sheet !== 'object' || part.sheet === null || Array.isArray(part.sheet)) {
                throw new Error(`Desk object "${object.id}" has a "parts[${index}].sheet" that is not an object`);
            }
            if (typeof part.sheet.title !== 'string' || !part.sheet.title) {
                throw new Error(`Desk object "${object.id}" has a "parts[${index}].sheet" missing a "title"`);
            }
            if (part.sheet.credit !== undefined && typeof part.sheet.credit !== 'string') {
                throw new Error(`Desk object "${object.id}" has a non-string "parts[${index}].sheet.credit"`);
            }
            if (part.type !== 'box') {
                throw new Error(
                    `Desk object "${object.id}" puts a "sheet" on a "${part.type}" part — ` +
                    'only "box" parts have a front face to print'
                );
            }
        }
        // All four resolve to the same face (partMesh.BOX_FRONT_FACE).
        // Accepting more than one would silently drop the others, and which
        // one survived would depend on the order of a couple of branches in
        // partMesh.js rather than on anything visible here.
        const drawnFaces = ['texture', 'spine', 'badge', 'sheet'].filter((field) => part[field] !== undefined);
        if (drawnFaces.length > 1) {
            throw new Error(
                `Desk object "${object.id}" gives "parts[${index}]" more than one front face ` +
                `(${drawnFaces.join(', ')}) — they all draw the same face, so only one can win`
            );
        }
        // A typo'd pose is silent: the part simply never joins the group that
        // moves, and the object half-stands. There is exactly one valid value.
        if (part.pose !== undefined && part.pose !== POSE_GROUP_NAME) {
            throw new Error(
                `Desk object "${object.id}" has a "parts[${index}].pose" of "${part.pose}" ` +
                `(the only pose is "${POSE_GROUP_NAME}")`
            );
        }
        validateMaterialOverrides(object.id, `parts[${index}].material`, part.material);
    }
    return object;
}

/**
 * @param {object[]} objects desk object descriptors
 * @param {object[]} works the Work registry, to cross-check category coverage
 * @throws {Error} if ids collide, any object is malformed, a clickable
 *                 object's category has no matching Work, or an
 *                 object-cycling category has a Work with nothing to show
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
        // An 'artifact' object presents its projects purely as geometry, so a
        // Work without one has nothing at all to show — stepping onto it
        // would simply fade the previous object out to an empty desk.
        if (object.clickable && object.focus?.visual === 'artifact') {
            const categoryWorks = works.filter((entry) => entry.category === object.category);
            for (const work of categoryWorks) {
                if (!work.artifact?.modelUrl && !work.artifact?.parts?.length) {
                    throw new Error(
                        `Work "${work.id}" is shown by object-cycling desk object "${object.id}", so it needs an ` +
                        '"artifact" with either a "modelUrl" or a non-empty "parts" array'
                    );
                }
            }
            // The strategy treats the prop already standing on the desk as
            // the first project rather than loading a second copy of it, so
            // that focusing the object changes nothing until an arrow is
            // pressed. If the two ever disagree, the first project would
            // silently render as whatever the desk happens to be showing —
            // a change that only appears at the instant of the click, which
            // is the hardest moment at which to notice anything.
            //
            // Both ways of building an object get the same check. For a model
            // it is a url comparison; for primitives it is the parts
            // themselves, which content/deskObjects.js satisfies by handing
            // over the very same array rather than generating a second one.
            const first = categoryWorks[0];
            if (first && object.model && first.artifact.modelUrl !== object.model.url) {
                throw new Error(
                    `Desk object "${object.id}" rests as "${object.model.url}", but its first Work "${first.id}" ` +
                    `is "${first.artifact.modelUrl}" — the resting prop has to be the first project's own object`
                );
            }
            if (first && object.parts && JSON.stringify(object.parts) !== JSON.stringify(first.artifact.parts)) {
                throw new Error(
                    `Desk object "${object.id}" rests as parts that differ from its first Work "${first.id}"'s ` +
                    'artifact parts — the resting prop has to be the first project\'s own object'
                );
            }
        }
    }

    return objects;
}
