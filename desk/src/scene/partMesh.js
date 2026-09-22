import * as THREE from 'three';
import { sharedTexture } from '../loaders/texture.js';
import { invalidate } from './renderScheduler.js';
import { drawBookSpine, spineCanvasSize } from './bookSpineCanvas.js';
import { drawBadge, badgeCanvasSize } from './badgeCanvas.js';
import { drawSheet, sheetCanvasSize } from './sheetCanvas.js';

/**
 * Turning a content-file `part` descriptor into a mesh.
 *
 * WHY THIS IS ITS OWN MODULE. It used to live inside DeskScene, which was fine
 * while the only things built from primitives were fixtures of the room — the
 * ledge, the poster wall, the book row. The lanyard broke that: its badges are
 * primitives *and* they are swapped in and out by a focus strategy, so
 * artifactStrategy needs the identical construction. Two copies of this would
 * drift, and the way they would drift is that a part looks subtly different
 * depending on whether it is resting on the desk or has just been stepped to —
 * which is the one difference that must never exist, since those are the same
 * object a third of a second apart.
 */

const GEOMETRY_FACTORIES = {
    box: (args) => new THREE.BoxGeometry(...args),
    cylinder: (args) => new THREE.CylinderGeometry(...args),
    sphere: (args) => new THREE.SphereGeometry(...args),
    torus: (args) => new THREE.TorusGeometry(...args),
    plane: (args) => new THREE.PlaneGeometry(...args)
};

// A middling dielectric, deliberately unremarkable: it has to be a plausible
// default for any primitive anyone adds. Parts that stand for a real material
// — painted trim, a matte card sleeve, cloth — override it per part, with the
// same fields and ranges a .glb may override (see scene/materialOverrides.js).
export const PART_MATERIAL_DEFAULTS = { roughness: 0.7, metalness: 0.05 };

// BoxGeometry emits one material group per face, in the order
// +x, -x, +y, -y, +z, -z. Index 4 is therefore the face pointing out into the
// room — the one a record sleeve or a framed poster shows.
//
// A part that lies FLAT and wants its art facing the ceiling gets there by
// rotating the box -PI/2 about X rather than by choosing a different face:
// that maps the box's local +z onto world +y, so the front face points up and
// this constant keeps meaning one thing. The lanyard's badges are the case
// that matters — see content/lanyard.js.
export const BOX_FRONT_FACE = 4;

/** Canvas-drawn front faces, keyed by the part field that requests them. */
const DRAWN_FACES = {
    spine: {
        size: (part, bufferHeight) => spineCanvasSize(part.args[0], part.args[1], bufferHeight),
        draw: (canvas, part) => drawBookSpine(canvas, { ...part.spine, color: part.color })
    },
    badge: {
        size: (part, bufferHeight) => badgeCanvasSize(part.args[0], part.args[1], bufferHeight),
        draw: (canvas, part) => drawBadge(canvas, { ...part.badge, color: part.color })
    },
    sheet: {
        size: (part, bufferHeight) => sheetCanvasSize(part.args[0], part.args[1], bufferHeight),
        draw: (canvas, part) => drawSheet(canvas, { ...part.sheet, color: part.color })
    }
};

/**
 * A part's material, or six of them when the part carries art.
 *
 * `part.texture` puts an image on the front face only and leaves the other
 * five as the part's own colour, which is what a printed object actually is:
 * a record sleeve is card on five sides and a cover on the sixth. Mapping the
 * image onto the whole box instead would stretch the art down the edges, and
 * at a 0.03-deep sleeve those edges are exactly what catches the window.
 *
 * `part.spine`, `part.badge` and `part.sheet` do the same job from a drawing
 * rather than a file — a book's lettering, an ID card's face, or the printed
 * top sheet of the paper stack, rendered to a canvas sized from the part's own
 * dimensions. All of them land on the same face through the same path; they
 * differ only in where the image comes from, and a part may carry at most one.
 *
 * The five plain faces share one material instance rather than six copies —
 * they are identical, and the hover pass walks whatever array it is given.
 *
 * File-backed textures come from the shared cache in loaders/texture.js, which
 * on a preloaded URL — every poster and sleeve in the room is one — hands back
 * a texture that is already decoded, so the part is drawable on the first frame
 * it exists. A part built later from a file nobody preloaded still fills itself
 * in asynchronously, and since the scene renders on demand it has to ask for a
 * frame when it lands or it will not be drawn until something unrelated
 * invalidates. A drawn face is ready immediately and needs no such call.
 *
 * @param {object} part
 * @param {number} [anisotropy] the renderer's max, when the caller has a
 *        renderer to ask. Strategies that build parts outside DeskScene don't,
 *        and they draw their parts head-on under a focus camera where glancing
 *        angles — the only thing anisotropy helps — do not arise.
 */
export function buildPartMaterial(part, anisotropy = 1, bufferHeight = 0) {
    const base = new THREE.MeshStandardMaterial({
        color: part.color,
        ...PART_MATERIAL_DEFAULTS,
        ...part.material
    });

    let map = null;
    if (part.texture) {
        map = sharedTexture(part.texture, { onLoad: invalidate });
    } else {
        const drawnKey = Object.keys(DRAWN_FACES).find((key) => part[key]);
        if (drawnKey) {
            const { size, draw } = DRAWN_FACES[drawnKey];
            const { width, height } = size(part, bufferHeight);
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            // The canvas repaints the base colour itself: this map replaces the
            // front face outright, so leaving it to the material's own colour
            // would put the artwork on a transparent ground.
            draw(canvas, part);
            map = new THREE.CanvasTexture(canvas);
        }
    }
    if (!map) return base;

    // Without this the art is decoded as linear and comes out washed out and
    // pale — the single most common way a correct-looking texture renders wrong.
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = anisotropy;

    const front = base.clone();
    front.map = map;
    // The base colour would otherwise multiply the art and tint it.
    front.color.setHex(0xffffff);

    const faces = [base, base, base, base, base, base];
    faces[BOX_FRONT_FACE] = front;
    return faces;
}

export function buildPartMesh(part, anisotropy, bufferHeight) {
    const geometry = GEOMETRY_FACTORIES[part.type](part.args);
    const mesh = new THREE.Mesh(geometry, buildPartMaterial(part, anisotropy, bufferHeight));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (part.position) mesh.position.set(...part.position);
    if (part.rotation) mesh.rotation.set(...part.rotation);
    return mesh;
}

/**
 * The name of the child group holding every part tagged `pose: 'lift'`.
 *
 * WHY A SUBGROUP RATHER THAN A FLAG PER MESH. Focusing the lanyard stands the
 * badge up while the strap stays lying on the desk (see artifactStrategy's
 * `anchor.present`). That is one rotation applied to some of an object's parts
 * and not others, and the cheapest honest way to express "some of the parts"
 * in three is a group — one transform to animate, and the parts keep their own
 * positions rather than each carrying a second copy of where it started.
 *
 * Parts are added in order within their group, so an object that tags nothing
 * builds exactly the flat group it always did.
 */
export const POSE_GROUP_NAME = 'lift';

/** Every part of one object, as a single group ready to be positioned. */
export function buildPartsGroup(parts, anisotropy, bufferHeight) {
    const group = new THREE.Group();
    let pose = null;

    for (const part of parts) {
        const mesh = buildPartMesh(part, anisotropy, bufferHeight);
        if (part.pose !== POSE_GROUP_NAME) {
            group.add(mesh);
            continue;
        }
        if (!pose) {
            pose = new THREE.Group();
            pose.name = POSE_GROUP_NAME;
            group.add(pose);
        }
        pose.add(mesh);
    }

    return group;
}
