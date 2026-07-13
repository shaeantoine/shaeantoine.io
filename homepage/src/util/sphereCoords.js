import * as THREE from 'three';

const DEG_TO_RAD = Math.PI / 180;

/**
 * Converts a lat/lon pair (degrees) to a Cartesian point on a sphere of the
 * given radius, Y-up (matching CameraRig's polar-angle-from-+Y convention).
 * Mirrors GeoJSON's [lon, lat] convention so "where on Earth" and "where on
 * the mini-globe" stay mentally consistent.
 */
export function latLonToVector3(lat, lon, radius, target = new THREE.Vector3()) {
    const latRad = lat * DEG_TO_RAD;
    const lonRad = lon * DEG_TO_RAD;
    const cosLat = Math.cos(latRad);
    return target.set(
        radius * cosLat * Math.sin(lonRad),
        radius * Math.sin(latRad),
        radius * cosLat * Math.cos(lonRad)
    );
}

/** The outward radial direction at a given lat/lon — "up" for a slot's group. */
export function surfaceNormalAt(lat, lon, target = new THREE.Vector3()) {
    return latLonToVector3(lat, lon, 1, target);
}
