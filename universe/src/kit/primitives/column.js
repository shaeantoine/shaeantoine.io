import * as THREE from 'three';
import { standardMaterial } from '../materials.js';

/**
 * A simple fluted column: a cylinder shaft with a slightly wider capital and
 * base. Shared building block for the Economics (MIT-esque colonnade) and
 * Research (USYD quad) zones, distinguished by palette rather than shape.
 */
export function createColumn({ color = 0xd8c9a3, height = 1 } = {}) {
    const group = new THREE.Group();

    const shaftGeometry = new THREE.CylinderGeometry(0.12, 0.12, height, 10);
    shaftGeometry.translate(0, height / 2, 0);
    group.add(new THREE.Mesh(shaftGeometry, standardMaterial(color)));

    const capGeometry = new THREE.CylinderGeometry(0.16, 0.16, 0.08, 10);
    capGeometry.translate(0, height + 0.04, 0);
    group.add(new THREE.Mesh(capGeometry, standardMaterial(color)));

    const baseGeometry = new THREE.CylinderGeometry(0.16, 0.16, 0.08, 10);
    baseGeometry.translate(0, 0.04, 0);
    group.add(new THREE.Mesh(baseGeometry, standardMaterial(color)));

    return group;
}
