import * as THREE from 'three';
import { toonMaterial } from '../materials.js';

/**
 * A generic small building: a box body with a pyramid roof. Used as the
 * shared stand-in for schools, storefronts, and other simple structures
 * across zones — variation comes from data (color, scale), not new geometry.
 */
export function createBuilding({ color: wallColor = 0xcbb994, roofColor = 0x7a4a3a } = {}) {
    const group = new THREE.Group();

    const bodyGeometry = new THREE.BoxGeometry(0.8, 0.6, 0.8);
    bodyGeometry.translate(0, 0.3, 0);
    const body = new THREE.Mesh(bodyGeometry, toonMaterial(wallColor));
    group.add(body);

    const roofGeometry = new THREE.ConeGeometry(0.65, 0.4, 4);
    roofGeometry.rotateY(Math.PI / 4);
    roofGeometry.translate(0, 0.8, 0);
    const roof = new THREE.Mesh(roofGeometry, toonMaterial(roofColor));
    group.add(roof);

    return group;
}
