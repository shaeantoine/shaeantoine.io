import * as THREE from 'three';
import { tween, easeReach } from '../scene/tween.js';
import { DOLLY_DURATION_MS } from '../scene/CameraRig.js';
import { POSE_GROUP_NAME } from '../scene/partMesh.js';

/**
 * Standing an object up for the camera — `focus.anchor.present`.
 *
 * WHAT THIS IS FOR. A thing lying flat on a desk is read by the focus camera at
 * a glancing angle, which is the worst possible way to show the one interesting
 * surface it has. `present` tips the parts tagged `pose: 'lift'` (see
 * scene/partMesh.js) up about a pivot so that surface meets the camera, and
 * leaves everything else lying where it fell.
 *
 * TWO OBJECTS USE IT AND THEY TIP DIFFERENT AMOUNTS OF THEMSELVES, which is why
 * this lives here rather than inside either strategy. The lanyard stands its
 * badge up 66° on its own clip (focus/strategies/artifactStrategy.js);
 * the paper stack tips the whole clipped sheaf to a 40° reading slope, pages
 * included, because a clipped run of paper has no part that stays behind
 * (focus/strategies/sheetStrategy.js). Same rotation, same pivot arithmetic,
 * same tween — the only difference is what got tagged.
 *
 * ROTATING ABOUT A PIVOT, EXACTLY. A three Group rotates about its own origin,
 * and the origin here is the middle of the object, not the edge it hinges on. A
 * point p ends up at P + R(p - P) for a pivot P, which is the same as giving
 * the group rotation R and position P - R·P — no reparenting, no second group,
 * and no accumulated error from composing offsets frame by frame.
 *
 * NOTHING MAY LIE FORWARD OF THE PIVOT. A rigid rotation sends everything in
 * front of the hinge downward, straight through the desktop, and the symptom is
 * a few centimetres of an object buried in a surface it is supposed to be
 * resting on. Both callers put the pivot at the outermost point of the lifted
 * assembly for that reason, and content/deskObjects.test.js simulates each pose
 * and fails if any lifted part goes below y = 0.
 */

/**
 * How long an object takes to adopt its presented pose, and to put it back.
 *
 * Derived from the dolly rather than typed beside it: the object should be
 * standing by the time the shot arrives, not still moving after it has settled
 * — the floating chrome is placed the moment the dolly ends — and that
 * relationship has to survive the dolly being retuned. Nine tenths leaves the
 * pose a tenth of the move to have finished in.
 */
export const PRESENT_MS = Math.round(DOLLY_DURATION_MS * 0.9);

const posePivot = new THREE.Vector3();
const poseEuler = new THREE.Euler();

/**
 * @param {THREE.Object3D[]} nodes every node carrying a pose group. The lanyard
 *        passes all of its badge slots, so the cards share the pose and the
 *        swap between them is unchanged by it; the paper stack passes its one
 *        object group.
 * @param {{ pivot: number[], rotation: number[] }} present
 * @param {number} t 0 = lying as authored, 1 = fully presented
 */
export function applyPose(nodes, present, t) {
    if (!present) return;
    poseEuler.set(present.rotation[0] * t, present.rotation[1] * t, present.rotation[2] * t);
    for (const node of nodes) {
        const pose = node.getObjectByName(POSE_GROUP_NAME);
        if (!pose) continue;
        pose.rotation.copy(poseEuler);
        pose.position
            .set(...present.pivot)
            .sub(posePivot.set(...present.pivot).applyEuler(poseEuler));
    }
}

/**
 * How high the object reaches once it is standing, in world y.
 *
 * WHY THE CHROME NEEDS TOLD. The floating arrows are pinned to the object's
 * REST bounding box, frozen at load (see DeskScene.getObjectScreenBox, which
 * explains why it cannot be measured live). For a badge that is about to stand
 * up 0.27 above the desk, that box is a thin band around its own base — so the
 * arrows would sit at the foot of a card they are supposed to flank.
 *
 * Measured by posing the object, reading the box, and putting it back, all
 * inside mount: a tween's own onComplete would be too late, since the arrows
 * are revealed the instant the dolly stops and would then visibly jump.
 *
 * Only the arrow-stepped visuals need this. The paper stack is stepped by
 * clicking the page itself and floats no chrome at all (see main.js's
 * ARROW_CHROME_VISUALS), so it poses without calling this.
 */
export function measurePresentedTop(node, present, restoreTo) {
    applyPose([node], present, 1);
    const top = new THREE.Box3().setFromObject(node).max.y;
    applyPose([node], present, restoreTo);
    return top;
}

/**
 * Runs the presented pose to `target`, from wherever it currently is.
 *
 * THE TWEEN OUTLIVES THE STRATEGY THAT STARTED IT, which is why its cancel is
 * parked on the host group rather than in a strategy's closure. FocusController
 * builds a fresh strategy for every visit, and the pose has to keep coming back
 * down after `unmount` has nulled everything there — a new visit that starts
 * mid-descent then has something to cancel, instead of two tweens writing to
 * the same rotation.
 *
 * @param {{ host: THREE.Object3D, nodes: THREE.Object3D[], present?: object, target: number }} options
 *        `host` is the desk object's own group, which survives between visits;
 *        `nodes` are the nodes the pose is applied to, which may not.
 */
export function tweenPose({ host, nodes, present, target }) {
    if (!present) return;
    host.userData.posePresented ??= 0;
    const from = host.userData.posePresented;
    if (from === target) return;

    host.userData.poseTween?.();
    host.userData.poseTween = tween({
        from: { t: from },
        to: { t: target },
        duration: PRESENT_MS * Math.abs(target - from),
        easing: easeReach, // a hand tipping the object up, on the dolly's own curve
        onUpdate({ t }) {
            host.userData.posePresented = t;
            applyPose(nodes, present, t);
        },
        onComplete() {
            host.userData.posePresented = target;
            host.userData.poseTween = null;
        }
    });
}
