import * as THREE from 'three';
import { emit } from '../util/EventBus.js';

const DRAG_THRESHOLD_PX = 4;

/**
 * Translates raw pointer/wheel/touch DOM events on the canvas into semantic
 * intents (`input:dragDelta`, `input:zoomDelta`, `input:pick`, `input:hover`).
 * Holds no camera or scene state itself — raycasting needs a camera and a
 * list of pickable objects, which are passed in, but InputController never
 * decides what happens as a result of an intent; that's WorldStateMachine's
 * job (`input:hover` is the one exception consumed directly in main.js,
 * since it's a pure visual affordance rather than a state transition).
 */
export class InputController {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {THREE.Camera} camera
     * @param {() => THREE.Object3D[]} getPickableObjects
     */
    constructor(canvas, camera, getPickableObjects) {
        this.canvas = canvas;
        this.camera = camera;
        this.getPickableObjects = getPickableObjects;

        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();

        this.dragging = false;
        this.dragMoved = false;
        this.lastX = 0;
        this.lastY = 0;
        this.pinchStartDistance = null;

        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
        this._onWheel = this._onWheel.bind(this);
        this._onTouchStart = this._onTouchStart.bind(this);
        this._onTouchMove = this._onTouchMove.bind(this);
        this._onTouchEnd = this._onTouchEnd.bind(this);

        canvas.addEventListener('pointerdown', this._onPointerDown);
        window.addEventListener('pointermove', this._onPointerMove);
        window.addEventListener('pointerup', this._onPointerUp);
        canvas.addEventListener('wheel', this._onWheel, { passive: false });
        canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', this._onTouchMove, { passive: false });
        canvas.addEventListener('touchend', this._onTouchEnd);
    }

    dispose() {
        this.canvas.removeEventListener('pointerdown', this._onPointerDown);
        window.removeEventListener('pointermove', this._onPointerMove);
        window.removeEventListener('pointerup', this._onPointerUp);
        this.canvas.removeEventListener('wheel', this._onWheel);
        this.canvas.removeEventListener('touchstart', this._onTouchStart);
        this.canvas.removeEventListener('touchmove', this._onTouchMove);
        this.canvas.removeEventListener('touchend', this._onTouchEnd);
    }

    _onPointerDown(event) {
        this.dragging = true;
        this.dragMoved = false;
        this.lastX = event.clientX;
        this.lastY = event.clientY;
        // Orbiting the globe shouldn't leave a stale highlight behind on
        // whatever island the drag started over.
        emit('input:hover', { slotId: null });
    }

    _onPointerMove(event) {
        if (!this.dragging) {
            this._hover(event.clientX, event.clientY);
            return;
        }
        const dx = event.clientX - this.lastX;
        const dy = event.clientY - this.lastY;
        this.lastX = event.clientX;
        this.lastY = event.clientY;

        if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD_PX) {
            this.dragMoved = true;
        }
        emit('input:dragDelta', { dx, dy });
    }

    _onPointerUp(event) {
        if (this.dragging && !this.dragMoved) {
            this._pick(event.clientX, event.clientY);
        }
        this.dragging = false;
    }

    _onWheel(event) {
        event.preventDefault();
        emit('input:zoomDelta', { delta: event.deltaY });
    }

    _onTouchStart(event) {
        if (event.touches.length === 1) {
            this.dragging = true;
            this.dragMoved = false;
            this.lastX = event.touches[0].clientX;
            this.lastY = event.touches[0].clientY;
        } else if (event.touches.length === 2) {
            this.pinchStartDistance = this._touchDistance(event.touches);
        }
    }

    _onTouchMove(event) {
        event.preventDefault();
        if (event.touches.length === 1 && this.dragging) {
            const dx = event.touches[0].clientX - this.lastX;
            const dy = event.touches[0].clientY - this.lastY;
            this.lastX = event.touches[0].clientX;
            this.lastY = event.touches[0].clientY;
            if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD_PX) {
                this.dragMoved = true;
            }
            emit('input:dragDelta', { dx, dy });
        } else if (event.touches.length === 2 && this.pinchStartDistance != null) {
            const distance = this._touchDistance(event.touches);
            const delta = (this.pinchStartDistance - distance) * 0.5;
            this.pinchStartDistance = distance;
            emit('input:zoomDelta', { delta });
        }
    }

    _onTouchEnd(event) {
        if (this.dragging && !this.dragMoved && event.changedTouches.length === 1) {
            this._pick(event.changedTouches[0].clientX, event.changedTouches[0].clientY);
        }
        this.dragging = false;
        this.pinchStartDistance = null;
    }

    _touchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    _pick(clientX, clientY) {
        emit('input:pick', { slotId: this._raycastSlotId(clientX, clientY) });
    }

    _hover(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const inBounds =
            clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
        emit('input:hover', { slotId: inBounds ? this._raycastSlotId(clientX, clientY) : null });
    }

    _raycastSlotId(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.pointer, this.camera);
        const hits = this.raycaster.intersectObjects(this.getPickableObjects(), true);
        if (hits.length === 0) return null;

        let hitObject = hits[0].object;
        while (hitObject && !hitObject.userData.slotId) {
            hitObject = hitObject.parent;
        }
        return hitObject?.userData.slotId ?? null;
    }
}
