import * as THREE from 'three';
import { tween, easeInOutCubic, easeReach } from '../../scene/tween.js';
import { invalidateShadows } from '../../scene/renderScheduler.js';
import { DOLLY_DURATION_MS } from '../../scene/CameraRig.js';
import { loadGLTF } from '../../loaders/gltf.js';
import { buildPartsGroup, POSE_GROUP_NAME } from '../../scene/partMesh.js';
import { setSubtreeOpacity as setOpacity } from '../../scene/opacity.js';

// Exported: main.js crossfades the editorial spread's text against this, so
// the words and the object they describe change in the same beat.
export const SWAP_MS = 300; // one object out, the next in
const DEFAULT_TRAVEL = [0.45, 0, 0]; // see `anchor.travel` — local-frame vector pointing to the viewer's right

// How long the object takes to adopt its presented pose, and to put it back.
// Derived from the dolly rather than typed beside it: the badge should be
// standing by the time the shot arrives, not still moving after it has settled
// — the floating chrome is placed the moment the dolly ends — and that
// relationship has to survive the dolly being retuned. Nine tenths leaves the
// pose a tenth of the move to have finished in.
const PRESENT_MS = Math.round(DOLLY_DURATION_MS * 0.9);

/**
 * Loads a work's object, uniformly scaled to `targetSize` and rested at the
 * wrapper's origin — the same fitting logic DeskScene.attachModel applies to
 * the desk's own props, so a swapped-in object sits exactly where the one it
 * replaced was standing.
 *
 * The per-instance material clone matters here: loadGLTF's clone(true)
 * deep-copies the node graph but shares materials, and the desk's own prop is
 * loaded from the same cache. Without the clone, fading one object would fade
 * another that happens to use the same model.
 */
function buildModelArtifact(artifact, wrapper) {
    loadGLTF(artifact.modelUrl).then((root) => {
        root.traverse((node) => {
            if (!node.isMesh) return;
            node.castShadow = true;
            node.receiveShadow = true;
            node.material = Array.isArray(node.material)
                ? node.material.map((material) => material.clone())
                : node.material.clone();
        });

        if (artifact.targetSize) {
            const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0) root.scale.multiplyScalar(artifact.targetSize / maxDim);
        }
        const box = new THREE.Box3().setFromObject(root);
        root.position.x -= (box.min.x + box.max.x) / 2;
        root.position.z -= (box.min.z + box.max.z) / 2;
        root.position.y -= box.min.y;
        if (artifact.rotation) root.rotation.set(...artifact.rotation);

        wrapper.add(root);
        setOpacity(wrapper, wrapper.userData.opacity ?? 0); // the swap may have moved on while this was in flight
        // Objects stream in after the tween that asked for them has stopped
        // requesting frames, so each arrival requests its own.
        invalidateShadows();
    }, (error) => {
        console.error(`Failed to load hardware artifact "${artifact.modelUrl}"`, error);
    });
}

/**
 * An artifact built from primitives — the lanyard's badges.
 *
 * NOT RE-FITTED, AND THAT IS THE DIFFERENCE FROM A MODEL. A .glb arrives at
 * whatever scale and origin its author left it at, so the branch above has to
 * normalise it: scale to `targetSize`, centre in x/z, rest the bottom at zero.
 * Parts are authored in world units against this scene's own scale, in this
 * repo, with their positions already meaning what they say — the card sits at
 * y = half its thickness because that is where a card on a desk sits. Passing
 * them through the same fitting would silently override all of that, and the
 * first symptom would be a badge floating or sunk by a millimetre.
 *
 * Synchronous, unlike the model branch: there is nothing to fetch. The opacity
 * is still set from `userData` for symmetry, since mount() may have decided
 * this slot is hidden before we got here.
 */
function buildPartsArtifact(artifact, wrapper) {
    const parts = buildPartsGroup(artifact.parts);
    if (artifact.rotation) parts.rotation.set(...artifact.rotation);
    wrapper.add(parts);
    setOpacity(wrapper, wrapper.userData.opacity ?? 0);
    invalidateShadows();
}

function buildArtifact(artifact) {
    const wrapper = new THREE.Group();
    if (artifact.parts) buildPartsArtifact(artifact, wrapper);
    else buildModelArtifact(artifact, wrapper);
    return wrapper;
}

/**
 * Standing the object up for the camera.
 *
 * WHAT THIS IS FOR. A badge lying flat on a desk is read by the focus camera
 * at a glancing angle, which is the worst possible way to show the one
 * interesting surface it has. `anchor.present` tips the parts tagged
 * `pose: 'lift'` (see scene/partMesh.js) up about a pivot, so the printed face
 * meets the camera and the strap stays on the desk where it fell.
 *
 * ROTATING ABOUT A PIVOT, EXACTLY. A three Group rotates about its own origin,
 * and the origin here is the middle of the card, not the edge it hinges on. A
 * point p ends up at P + R(p - P) for a pivot P, which is the same as giving
 * the group rotation R and position P - R·P — no reparenting, no second group,
 * and no accumulated error from composing offsets frame by frame.
 *
 * @param {THREE.Object3D[]} nodes every slot, so the cards all share the pose
 *        and the swap between them is unchanged by it
 * @param {{ pivot: number[], rotation: number[] }} present
 * @param {number} t 0 = lying as authored, 1 = fully presented
 */
const posePivot = new THREE.Vector3();
const poseEuler = new THREE.Euler();

function applyPose(nodes, present, t) {
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
 */
function measurePresentedTop(node, present, restoreTo) {
    applyPose([node], present, 1);
    const top = new THREE.Box3().setFromObject(node).max.y;
    applyPose([node], present, restoreTo);
    return top;
}

/**
 * The hardware object cycles in place: the soldering station standing on the
 * desk is the first project, and stepping swaps it for the next project's
 * object on the same spot.
 *
 * The selection is the desk's, not the focus session's. Whichever object you
 * were last looking at stays on the desk after you zoom out, and is still
 * there when you come back — so the objects live on the group itself
 * (`userData.artifactSlots`) rather than in this closure, which a new
 * `createFocusStrategy` call would discard on every visit. Nothing is ever
 * disposed for the same reason; there are only as many objects as there are
 * hardware projects, and all of them are already in the loader's cache.
 *
 * A step never shows two objects at once. The outgoing one slides away from
 * the arrow you pressed as it fades; the incoming one arrives from the
 * opposite edge — the monitor's dip-through-blank with a direction.
 */
export function createArtifactStrategy() {
    let group = null;
    let anchor = null;
    let items = [];
    let activeIndex = 0;
    let slots = []; // index → the node showing that project, parallel to `items`
    let cancelSwap = null;
    let settleSwap = null; // resolves the in-flight swap's promise, including when it's cut short

    /**
     * The node per project, created once and kept on the group. On the first
     * visit the prop DeskScene already attached *is* the first project, so it
     * gets re-parented into a slot of its own rather than hidden behind a
     * second copy of the same model — which is why focusing the object and
     * leaving it alone is visually a no-op.
     */
    function ensureSlots() {
        const store = group.userData.artifactSlots ?? new Map();
        group.userData.artifactSlots = store;

        if (store.size === 0 && items.length > 0) {
            const own = new THREE.Group();
            for (const child of [...group.children]) own.add(child); // add() reparents; world transforms are unchanged
            group.add(own);
            store.set(items[0].id, own);
        }

        return items.map((work) => {
            let node = store.get(work.id);
            if (!node) {
                node = buildArtifact(work.artifact);
                node.position.set(...(anchor.position ?? [0, 0, 0]));
                node.visible = false;
                setOpacity(node, 0);
                group.add(node);
                store.set(work.id, node);
            }
            node.userData.home ??= node.position.clone();
            return node;
        });
    }

    /** Snaps to a single project with no animation — used on entry and on the way out. */
    function showOnly(index) {
        slots.forEach((node, position) => {
            const shown = position === index;
            node.visible = shown;
            setOpacity(node, shown ? 1 : 0);
            node.position.copy(node.userData.home);
        });
    }

    /**
     * @returns {number} the index actually being shown, which is the desk's
     *          remembered selection rather than the requested one when the
     *          route didn't name a project explicitly.
     */
    function mount(parentGroup, anchorConfig, firstWork, options = {}) {
        group = parentGroup;
        anchor = anchorConfig;
        slots = ensureSlots();

        const requested = Math.max(items.indexOf(firstWork), 0);
        const remembered = items.findIndex((work) => work.id === group.userData.artifactWorkId);
        // A link that names a project wins; a plain click on the desk resumes
        // whatever the desk is currently showing.
        activeIndex = options.requestedExplicitly || remembered < 0 ? requested : remembered;

        showOnly(activeIndex);
        group.userData.artifactWorkId = items[activeIndex].id;
        if (anchor.present) {
            group.userData.chromeMaxY = measurePresentedTop(
                slots[activeIndex],
                anchor.present,
                group.userData.posePresented ?? 0
            );
        }
        tweenPose(1);
        invalidateShadows();
        return activeIndex;
    }

    /**
     * Runs the presented pose to `target`, from wherever it currently is.
     *
     * THE TWEEN OUTLIVES THIS STRATEGY, which is why its cancel is parked on
     * the group rather than in this closure. FocusController builds a fresh
     * strategy for every visit, and the pose has to keep coming back down
     * after `unmount` has nulled everything here — a new visit that starts
     * mid-descent then has something to cancel, instead of two tweens writing
     * to the same rotation.
     */
    function tweenPose(target) {
        const present = anchor?.present;
        if (!present) return;
        const host = group;
        const nodes = slots;
        host.userData.posePresented ??= 0;
        const from = host.userData.posePresented;
        if (from === target) return;

        host.userData.poseTween?.();
        host.userData.poseTween = tween({
            from: { t: from },
            to: { t: target },
            duration: PRESENT_MS * Math.abs(target - from),
            easing: easeReach, // a hand tipping the card up, on the dolly's own curve
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

    /**
     * Slides `from` out and `to` in along `anchor.travel`, fading one fully
     * before the other appears so the two objects never overlap.
     *
     * A swap cut short — by another step or by leaving — still settles its
     * promise. FocusController only commits its index once `transitionTo`
     * resolves, so a cancelled tween that left one pending would strand the
     * controller a step behind the scene for good.
     */
    function swapTo(toIndex, fromIndex, direction) {
        cancelSwap?.();
        settleSwap?.();

        const travel = new THREE.Vector3(...(anchor.travel ?? DEFAULT_TRAVEL));
        // Objects move against the arrow: the forward arrow points right, so
        // the object leaving goes left and its replacement comes in from the
        // right, the way a stack of cards moves under a thumb.
        const sign = direction === 'prev' ? 1 : -1;
        const outgoing = slots[fromIndex];
        const incoming = slots[toIndex];
        const offset = new THREE.Vector3();

        function place(node, distance, opacity) {
            node.visible = opacity > 0.001;
            setOpacity(node, opacity);
            node.position.copy(node.userData.home).add(offset.copy(travel).multiplyScalar(distance));
        }

        return new Promise((resolve) => {
            settleSwap = resolve;
            place(incoming, -sign, 0);

            cancelSwap = tween({
                from: { t: 0 },
                to: { t: 1 },
                duration: SWAP_MS,
                easing: easeInOutCubic,
                onUpdate({ t }) {
                    if (t < 0.5) {
                        const progress = t * 2;
                        place(outgoing, sign * progress, 1 - progress);
                        place(incoming, -sign, 0);
                    } else {
                        const progress = (t - 0.5) * 2;
                        place(outgoing, sign, 0);
                        place(incoming, -sign * (1 - progress), progress);
                    }
                },
                onComplete() {
                    place(outgoing, 0, 0);
                    place(incoming, 0, 1);
                    cancelSwap = null;
                    settleSwap = null;
                    resolve();
                }
            });
        });
    }

    function transitionTo(nextWork, direction) {
        const target = items.indexOf(nextWork);
        if (target < 0 || !group || target === activeIndex) return Promise.resolve();
        const from = activeIndex;
        activeIndex = target;
        group.userData.artifactWorkId = nextWork.id;
        return swapTo(target, from, direction);
    }

    /**
     * Leaves the desk showing the object you were last looking at. Nothing is
     * removed or disposed — only settled, in case a swap was still in flight
     * when the camera started pulling out.
     */
    function unmount() {
        if (!group) return;
        cancelSwap?.();
        settleSwap?.();
        cancelSwap = null;
        settleSwap = null;

        // Started before the refs are dropped, and deliberately allowed to
        // outlive them: the object should lie back down over the same beat the
        // camera spends pulling out, not snap flat the instant focus ends.
        tweenPose(0);
        // The chrome's box goes back to the object's own rest bounds. Left set,
        // the hover tooltip would float where the card *would* be if it were
        // standing, on an object that is lying flat.
        delete group.userData.chromeMaxY;
        showOnly(activeIndex);
        invalidateShadows();

        group = null;
        anchor = null;
        slots = [];
        activeIndex = 0;
    }

    /** Caches the category's works so `transitionTo` can recover an index from the item it's handed. */
    function buildItems(works) {
        items = works;
        return items;
    }

    return { mount, transitionTo, unmount, buildItems };
}
