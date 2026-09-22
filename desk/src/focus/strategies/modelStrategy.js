import * as THREE from 'three';
import { tween, easeInOutCubic } from '../../scene/tween.js';
import { invalidateShadows } from '../../scene/renderScheduler.js';
import { loadGLTF } from '../../loaders/gltf.js';

const TRANSITION_MS = 320;

/**
 * Loads `anchor.modelUrl`, uniformly scaled to fit `anchor.targetSize` (its
 * largest bounding-box dimension, mirroring DeskScene's model-fitting
 * logic), and rested at the returned Group's local origin.
 */
function buildModelInstance(anchor) {
    const wrapper = new THREE.Group();
    loadGLTF(anchor.modelUrl).then((root) => {
        // loadGLTF's clone(true) deep-clones the node graph but not
        // materials — two instances loaded from the same cached promise
        // (e.g. outgoing/incoming mid-transition) would otherwise share
        // material objects, so disposing one on unmount would corrupt the
        // other. Mirrors DeskScene.attachModel's same per-instance clone.
        root.traverse((node) => {
            if (!node.isMesh) return;
            node.material = Array.isArray(node.material)
                ? node.material.map((material) => material.clone())
                : node.material.clone();
        });

        if (anchor.targetSize) {
            const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0) root.scale.multiplyScalar(anchor.targetSize / maxDim);
        }
        const restingBox = new THREE.Box3().setFromObject(root);
        root.position.x -= (restingBox.min.x + restingBox.max.x) / 2;
        root.position.z -= (restingBox.min.z + restingBox.max.z) / 2;
        root.position.y -= restingBox.min.y;
        wrapper.add(root);
        // May well land after the slide-in tween that spawned it has finished
        // requesting frames, so it asks for one of its own.
        invalidateShadows();
    }, (error) => {
        console.error(`Failed to load focus model "${anchor.modelUrl}"`, error);
    });
    return wrapper;
}

function disposeInstance(wrapper) {
    wrapper.traverse((node) => {
        if (!node.isMesh) return;
        node.geometry.dispose();
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((material) => {
            material.map?.dispose();
            material.dispose();
        });
    });
}

/**
 * Same slide-through-frame mechanic as cardStrategy, but for a real .glb
 * instance instead of a flat image plane — every Work in this category
 * shows the identical model (there's no per-item variation baked into the
 * asset); only the text panel content actually differs between items.
 *
 * Nothing is added to the scene on mount — the anchor position tends to sit
 * right where the category object's own permanent model already lives, so
 * showing the pixel immediately would just overlap it. The model only
 * enters once the user actually presses an arrow, sliding in from
 * off-screen like every later transition does.
 */
export function createModelStrategy() {
    let group = null;
    let anchor = null;
    let current = null;

    function mount(parentGroup, anchorConfig) {
        group = parentGroup;
        anchor = anchorConfig;
        current = null;
    }

    function transitionTo(_nextWork, direction) {
        return new Promise((resolve) => {
            const sign = direction === 'next' ? 1 : -1;
            const travel = anchor.travel ?? [0.6, 0, 0];
            const outgoing = current;
            const incoming = buildModelInstance(anchor);
            incoming.position.set(
                anchor.position[0] - sign * travel[0],
                anchor.position[1] - sign * travel[1],
                anchor.position[2] - sign * travel[2]
            );
            if (anchor.rotation) incoming.rotation.set(...anchor.rotation);
            group.add(incoming);

            tween({
                from: { t: 0 },
                to: { t: 1 },
                duration: TRANSITION_MS,
                easing: easeInOutCubic,
                onUpdate({ t }) {
                    if (outgoing) {
                        outgoing.position.set(
                            anchor.position[0] + sign * travel[0] * t,
                            anchor.position[1] + sign * travel[1] * t,
                            anchor.position[2] + sign * travel[2] * t
                        );
                    }
                    incoming.position.lerpVectors(
                        new THREE.Vector3(
                            anchor.position[0] - sign * travel[0],
                            anchor.position[1] - sign * travel[1],
                            anchor.position[2] - sign * travel[2]
                        ),
                        new THREE.Vector3(...anchor.position),
                        t
                    );
                },
                onComplete() {
                    if (outgoing) {
                        group.remove(outgoing);
                        disposeInstance(outgoing);
                    }
                    current = incoming;
                    resolve();
                }
            });
        });
    }

    function unmount() {
        if (!current) return;
        group.remove(current);
        disposeInstance(current);
        current = null;
        group = null;
    }

    return { mount, transitionTo, unmount };
}
