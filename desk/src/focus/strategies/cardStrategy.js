import * as THREE from 'three';
import { tween, easeInOutCubic } from '../../scene/tween.js';
import { invalidate } from '../../scene/renderScheduler.js';
import { cardDimensionsForAspect } from '../cardGeometry.js';

const CARD_BASE_SIZE = 0.5;
const TRANSITION_MS = 320;

const textureLoader = new THREE.TextureLoader();

function buildCardMesh(work, anchor) {
    const { width, height } = cardDimensionsForAspect(work.previewAspect, CARD_BASE_SIZE);
    // The decode can easily outlast the 420 ms transition that requested this
    // card, so the arrival has to ask for its own frame or the card stays
    // blank until something unrelated happens to redraw the scene.
    const texture = textureLoader.load(work.previewImage, invalidate);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true })
    );
    mesh.position.set(...anchor.position);
    if (anchor.rotation) mesh.rotation.set(...anchor.rotation);
    return mesh;
}

/**
 * Generic default: a flat image card representing the current Work slides
 * through `anchor.travel` (a local offset) while crossfading with the next
 * card. The category object itself never moves — only the card does.
 */
export function createCardStrategy() {
    let group = null;
    let anchor = null;
    let current = null;

    function mount(parentGroup, anchorConfig, firstWork) {
        group = parentGroup;
        anchor = anchorConfig;
        current = buildCardMesh(firstWork, anchor);
        group.add(current);
    }

    function transitionTo(nextWork, direction) {
        return new Promise((resolve) => {
            const sign = direction === 'next' ? 1 : -1;
            const travel = anchor.travel ?? [0.6, 0, 0];
            const outgoing = current;
            const incoming = buildCardMesh(nextWork, anchor);
            incoming.position.set(
                anchor.position[0] - sign * travel[0],
                anchor.position[1] - sign * travel[1],
                anchor.position[2] - sign * travel[2]
            );
            group.add(incoming);

            tween({
                from: { t: 0 },
                to: { t: 1 },
                duration: TRANSITION_MS,
                easing: easeInOutCubic,
                onUpdate({ t }) {
                    outgoing.position.set(
                        anchor.position[0] + sign * travel[0] * t,
                        anchor.position[1] + sign * travel[1] * t,
                        anchor.position[2] + sign * travel[2] * t
                    );
                    outgoing.material.opacity = 1 - t;
                    incoming.position.lerpVectors(
                        new THREE.Vector3(
                            anchor.position[0] - sign * travel[0],
                            anchor.position[1] - sign * travel[1],
                            anchor.position[2] - sign * travel[2]
                        ),
                        new THREE.Vector3(...anchor.position),
                        t
                    );
                    incoming.material.opacity = t;
                },
                onComplete() {
                    group.remove(outgoing);
                    outgoing.geometry.dispose();
                    outgoing.material.map?.dispose();
                    outgoing.material.dispose();
                    current = incoming;
                    resolve();
                }
            });
        });
    }

    function unmount() {
        if (!current) return;
        group.remove(current);
        current.geometry.dispose();
        current.material.map?.dispose();
        current.material.dispose();
        current = null;
        group = null;
    }

    return { mount, transitionTo, unmount };
}
