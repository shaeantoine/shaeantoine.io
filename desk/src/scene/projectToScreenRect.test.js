import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { projectToScreenRect } from './projectToScreenRect.js';

function makeCamera() {
    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    return camera;
}

const viewport = { width: 800, height: 600 };

describe('projectToScreenRect', () => {
    it("projects a box centered in the camera's view to a rect centered in the viewport", () => {
        const camera = makeCamera();
        const box = new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
        const rect = projectToScreenRect(box, camera, viewport);
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        expect(centerX).toBeCloseTo(viewport.width / 2);
        expect(centerY).toBeCloseTo(viewport.height / 2);
        expect(rect.width).toBeGreaterThan(0);
        expect(rect.height).toBeGreaterThan(0);
    });

    it('projects a box shifted to positive X further right than a centered box', () => {
        const camera = makeCamera();
        const centered = new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
        const shifted = new THREE.Box3(new THREE.Vector3(0.5, -0.5, -0.5), new THREE.Vector3(1.5, 0.5, 0.5));
        const centeredRect = projectToScreenRect(centered, camera, viewport);
        const shiftedRect = projectToScreenRect(shifted, camera, viewport);
        expect(shiftedRect.left).toBeGreaterThan(centeredRect.left);
    });
});
