import * as THREE from 'three';

const DEG_TO_RAD = Math.PI / 180;

/**
 * Converts a static orbit placement (radius + phase angle, degrees) to a
 * Cartesian point on the flat XZ plane, centered on the sun at the origin.
 * Bodies don't move over time — phaseDeg is a fixed placement, not a live
 * simulation angle — so this is a pure lookup, not something driven by dt.
 */
export function orbitToVector3(radius, phaseDeg, target = new THREE.Vector3()) {
    const phaseRad = phaseDeg * DEG_TO_RAD;
    return target.set(radius * Math.cos(phaseRad), 0, radius * Math.sin(phaseRad));
}
