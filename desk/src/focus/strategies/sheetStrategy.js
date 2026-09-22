import * as THREE from 'three';
import { tween, easeInOutCubic, easeOutCubic, easeReach } from '../../scene/tween.js';
import { DOLLY_DURATION_MS } from '../../scene/CameraRig.js';
import { POSE_GROUP_NAME } from '../../scene/partMesh.js';
import { applyTextTexturePolicy } from '../../scene/textTexture.js';
import { tweenPose } from '../pose.js';
import { buildPageDeck } from './pagination.js';
import { createPageCanvas, pageSetupFor, drawPage, DEFAULT_PAPER_STOCK } from './pageCanvas.js';

/**
 * The paper stack: a run of printouts you turn one sheet at a time.
 *
 * WHAT THE OBJECT IS, because everything below is downstream of it. A clipped
 * stack of printouts has exactly one page visible at a time. There is no spine,
 * so nothing hinges in the middle of it; no facing page, so nothing has to be
 * kept in step with the leaf; and the back of a printed sheet is blank, so
 * there is no second face worth drawing. Nothing about it opens either — it is
 * already open, and focusing it tips the whole clipped sheaf up to a reading
 * slope and brings the camera down to meet it. So the turn is a pivot on the
 * clip, and the only state this keeps is which two sheets are currently
 * stacked.
 *
 * THE TURN. Two coincident sheets lie on the stack: the one you are reading,
 * and, a hair below it, the one after. Stepping forward pivots the top sheet
 * on the clipped left edge and sweeps it left and up, fading it out near the
 * top of the arc; what is underneath was already there. Then the two sheets
 * change places and the new lower one is redrawn with whatever comes next, so
 * the next turn is always ready before it is asked for. Stepping back runs the
 * same arc in reverse with the incoming sheet fading in as it comes down.
 *
 * THE PIVOT IS THE CLIP, and that is not a detail. content/paperStack.js puts
 * a bulldog clip down the left-hand edge; paper clipped down one side turns
 * about that side. If the clip ever moves, this has to move with it.
 *
 * WHAT IS SHARED, AND WITH WHOM: the canvas, not the motion. pageCanvas.js
 * draws the focused page, and scene/sheetCanvas.js draws the resting top sheet
 * the stack shows before anyone clicks it — both out of the same PAPER_STOCKS
 * entry, so the sheet lying on the desk and the page you turn once the camera
 * is in close cannot drift apart.
 */

/**
 * The arc, and where along it the leaving sheet gives up.
 *
 * The sheet sweeps past vertical and is gone before it would have to be drawn
 * face-down. Rotating a full turn instead buys nothing — the back of a printed
 * page is blank, and a blank white plane hanging over the desk is a worse thing
 * to look at than no plane at all.
 *
 * BOTH ARE EXPORTED BECAUSE THE DESK DEPENDS ON THEM, and these two numbers are
 * the reason. Pivoting on the left edge swings the sheet out over whatever
 * stands to the object's left, and the two together put the sheet at 94° when it
 * goes fully transparent. So it is the VISIBLE part of the sweep, not the full
 * arc, that has to stay clear of everything else on the desk — a longer arc, or
 * a fade held later, and a page cuts visibly through a solid object.
 * content/deskObjects.test.js measures the visible sweep against every other
 * prop rather than against whichever one happens to be nearest today, so that is
 * where the current clearance is written down and where a change to either of
 * these will be caught.
 */
export const TURN_ANGLE = Math.PI * 0.62; // ~112°: past vertical, and no further
export const VISIBLE_ARC = 0.84; // the sheet is fully transparent past this fraction of it
const TURN_MS = 420;
const FADE_FROM = 0.5; // fraction of the arc at which the leaving sheet starts to go
const FADE_TO = VISIBLE_ARC;

// Imported rather than restated: the sheets arrive alongside the camera dolly
// and the two have to end together. A local copy is a constant that silently
// drifts the day the dolly is retuned, and the symptom — a stack that finishes
// arriving slightly before or after the camera stops — reads as jank with no
// obvious cause. @see scene/CameraRig.js.
const APPROACH_MS = DOLLY_DURATION_MS;
const REVEAL_MS = 260; // the printed sheets fading in over the resting stack

// Between the two sheet planes. Small enough to read as one stack, large
// enough that the depth buffer never has to choose.
const SHEET_GAP = 0.0012;

/**
 * @see scene/textTexture.js — a flat sheet under a raised camera is never seen
 * head-on, so the mip chain and the anisotropy it enables both matter here, and
 * the SRGBColorSpace tag is what keeps the printed ink from shipping several
 * times too bright.
 */
const filterTexture = applyTextTexturePolicy;

/**
 * One printed sheet: a plane laid flat, face up.
 *
 * DoubleSide because the leaf is seen from underneath partway through its arc.
 * It shows the same page mirrored, which is wrong for a printed sheet and
 * invisible in practice — by the time the plane has turned far enough to show
 * its back it is most of the way faded out.
 */
function buildSheet(size, canvasWidth, canvasHeight, anisotropy, budget) {
    const canvas = createPageCanvas(canvasWidth, canvasHeight, budget);
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(...size),
        // toneMapped: false is inert under the composer — @see the note beside
        // the same flag in screenStrategy.js for why nothing honours it here.
        // What the curve actually costs this page is measured in DeskScene's
        // TONE_MAPPING note: under ACES an unlit sRGB texture cannot reach paper
        // white at all (250 arrives as 212), which reads as dingy rather than
        // as soft.
        new THREE.MeshBasicMaterial({
            map: filterTexture(new THREE.CanvasTexture(canvas), anisotropy),
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0,
            toneMapped: false
        })
    );
    mesh.userData.canvas = canvas;
    return mesh;
}

export function createSheetStrategy() {
    let group = null;
    let stage = null; // where the sheets hang: the pose group, so they tip with the stack
    let anchor = null;
    let hinge = null;
    let leaf = null; // the sheet on top — the one that moves
    let bed = null; // the sheet under it, already showing where a forward step lands
    let deck = null;
    let basePosition = null;
    let stock = DEFAULT_PAPER_STOCK;
    let isOpen = false;
    let turning = false;
    let cancelActiveTween = null;
    let settleTurn = null; // resolves the in-flight turn's promise, including when it is cut short

    function draw(mesh, item) {
        drawPage(mesh.userData.canvas, item, stock);
        mesh.material.map.needsUpdate = true;
    }

    function setOpacity(value) {
        leaf.material.opacity = value;
        bed.material.opacity = value;
    }

    /** The moving sheet hangs off the hinge; the resting one lies on the stack. */
    function placeAsLeaf(mesh) {
        hinge.add(mesh);
        mesh.position.set(anchor.size[0] / 2, 0, 0); // out from the clipped edge
        mesh.rotation.set(-Math.PI / 2, 0, 0); // face up
        mesh.material.opacity = 1;
    }

    function placeAsBed(mesh) {
        stage.add(mesh);
        mesh.position.set(0, anchor.height - SHEET_GAP, 0);
        mesh.rotation.set(-Math.PI / 2, 0, 0);
        mesh.material.opacity = 1;
    }

    /** What a forward step from `item` lands on — null past the end of the deck. */
    function pageAfter(item) {
        const index = deck.indexOf(item);
        return index >= 0 ? deck[index + 1] ?? null : null;
    }

    function mount(parentGroup, anchorConfig, firstItem, { anisotropy = 1, bufferHeight = 0 } = {}) {
        group = parentGroup;
        anchor = anchorConfig;
        isOpen = false;
        turning = false;
        basePosition = group.position.clone();

        // INSIDE THE POSE GROUP, NOT BESIDE IT. content/paperStack.js tags every
        // one of its parts `pose: 'lift'`, so the whole sheaf tips up to meet
        // the camera (@see focus/pose.js); pages parented to the object group
        // itself would stay lying flat over a stack that had stood up without
        // them. Falls back to the group for a `sheets` object with no pose,
        // which is how this behaved before the stack was given one.
        stage = group.getObjectByName(POSE_GROUP_NAME) ?? group;

        const { canvasWidth, canvasHeight } = pageSetupFor(anchor);
        const budget = { framing: anchor.framing, bufferHeight };

        hinge = new THREE.Group();
        // On the clipped edge, at the height of the top of the stack. Rotating
        // this about +Z lifts the far side of the sheet and carries it left.
        hinge.position.set(-anchor.size[0] / 2, anchor.height, 0);
        stage.add(hinge);

        leaf = buildSheet(anchor.size, canvasWidth, canvasHeight, anisotropy, budget);
        bed = buildSheet(anchor.size, canvasWidth, canvasHeight, anisotropy, budget);
        placeAsLeaf(leaf);
        placeAsBed(bed);
        draw(leaf, firstItem);
        draw(bed, pageAfter(firstItem));
        setOpacity(0);

        // The sheaf comes up to the reading slope over the dolly's own span, so
        // that the camera and the object arrive square to each other rather
        // than one waiting on the other. @see focus/pose.js.
        tweenPose({ host: group, nodes: [group], present: anchor.present, target: 1 });

        const approach = anchor.approach ?? [0, 0, 0];
        cancelActiveTween = tween({
            from: { x: basePosition.x, y: basePosition.y, z: basePosition.z },
            to: {
                x: basePosition.x + approach[0],
                y: basePosition.y + approach[1],
                z: basePosition.z + approach[2]
            },
            duration: APPROACH_MS,
            // The dolly's own curve, not merely its duration: two different
            // eases over the same span make the stack and the camera visibly
            // slide against each other in the middle. @see scene/tween.js.
            easing: easeReach,
            onUpdate({ x, y, z }) {
                group.position.set(x, y, z);
            },
            onComplete() {
                // Faded in rather than snapped on: the stack's own top sheet is
                // printed with this same title block (see scene/sheetCanvas.js),
                // so what the visitor sees is the greeked rules resolving into
                // real type — which is the whole point of printing the resting
                // sheet in the first place.
                cancelActiveTween = tween({
                    from: { opacity: 0 },
                    to: { opacity: 1 },
                    duration: REVEAL_MS,
                    easing: easeOutCubic,
                    movesGeometry: false,
                    onUpdate({ opacity }) {
                        setOpacity(opacity);
                    },
                    onComplete() {
                        isOpen = true;
                        cancelActiveTween = null;
                    }
                });
            }
        });
    }

    /** Hands the roles over: what was on top goes under, what was under comes up. */
    function exchange() {
        const wasLeaf = leaf;
        leaf = bed;
        bed = wasLeaf;
        hinge.rotation.z = 0;
        placeAsLeaf(leaf);
        placeAsBed(bed);
    }

    function transitionTo(item, direction) {
        if (!isOpen || turning) return Promise.resolve();
        turning = true;

        // Going back, the sheet that arrives is the one coming *down*, so the
        // roles change before the arc rather than after it: the page being
        // left becomes the bed, and the page being returned to is drawn on the
        // leaf and flown in from where it was last seen going.
        if (direction === 'prev') {
            exchange();
            draw(leaf, item);
        } else {
            draw(bed, item); // already drawn at mount or by the last step; cheap and keeps it honest
        }

        const from = direction === 'prev' ? TURN_ANGLE : 0;
        const to = direction === 'prev' ? 0 : TURN_ANGLE;

        return new Promise((resolve) => {
            settleTurn = resolve;
            hinge.rotation.z = from;
            leaf.material.opacity = direction === 'prev' ? 0 : 1;

            cancelActiveTween = tween({
                from: { t: 0 },
                to: { t: 1 },
                duration: TURN_MS,
                easing: easeInOutCubic,
                onUpdate({ t }) {
                    const progress = direction === 'prev' ? 1 - t : t;
                    hinge.rotation.z = from + (to - from) * t;
                    // Opacity follows the ARC, not the clock, so the sheet
                    // fades at the same point of the turn in both directions.
                    const fade = (progress - FADE_FROM) / (FADE_TO - FADE_FROM);
                    leaf.material.opacity = 1 - Math.min(1, Math.max(0, fade));
                },
                onComplete() {
                    if (direction === 'next') {
                        exchange();
                        draw(bed, pageAfter(item));
                    }
                    hinge.rotation.z = 0;
                    leaf.material.opacity = 1;
                    turning = false;
                    cancelActiveTween = null;
                    settleTurn = null;
                    resolve();
                }
            });
        });
    }

    function unmount() {
        if (!hinge) return;
        cancelActiveTween?.(); // before its onUpdate can dereference what we are about to null
        cancelActiveTween = null;
        // A turn cut short by leaving still settles its promise. FocusController
        // awaits `transitionTo` before it commits an index, so a cancelled tween
        // that left one pending would strand the await forever — the same reason
        // artifactStrategy keeps a `settleSwap`.
        settleTurn?.();
        settleTurn = null;

        for (const mesh of [leaf, bed]) {
            mesh.removeFromParent();
            mesh.geometry.dispose();
            mesh.material.map?.dispose();
            mesh.material.dispose();
        }
        stage.remove(hinge);
        group.position.copy(basePosition);
        // Started before the refs are dropped, and deliberately allowed to
        // outlive them: the sheaf should settle back onto the desk over the
        // same beat the camera spends pulling out, not drop flat the instant
        // focus ends. @see focus/pose.js.
        tweenPose({ host: group, nodes: [group], present: anchor.present, target: 0 });

        hinge = null;
        leaf = null;
        bed = null;
        stage = null;
        group = null;
        anchor = null;
        isOpen = false;
        turning = false;
    }

    /**
     * Gated on isOpen so clicks landing during the approach are no-ops. This is
     * the only strategy that raycasts against its own geometry at all — the
     * others are stepped by the DOM arrows instead (see main.js).
     */
    function getInteractiveMeshes() {
        if (!isOpen || !leaf) return [];
        return [leaf, bed];
    }

    /**
     * Which way you turn is where you press, because there is only one sheet
     * to press on. The left-hand strip goes back, which is also the direction
     * the sheet itself travels on a forward step — so the gesture and the
     * motion agree rather than fighting.
     */
    function resolveDirection(intersection) {
        return (intersection.uv?.x ?? 1) < 0.28 ? 'prev' : 'next';
    }

    function buildItems(works, anchorConfig) {
        const setup = pageSetupFor(anchorConfig);
        stock = setup.stock;
        deck = buildPageDeck(works, setup.layout);
        return deck;
    }

    return { mount, transitionTo, unmount, getInteractiveMeshes, resolveDirection, buildItems };
}
