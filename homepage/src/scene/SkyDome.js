import * as THREE from 'three';

const VERTEX_SHADER = `
    varying vec3 vWorldPosition;
    void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const FRAGMENT_SHADER = `
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    varying vec3 vWorldPosition;
    void main() {
        float h = normalize(vWorldPosition).y * 0.5 + 0.5;
        gl_FragColor = vec4(mix(bottomColor, topColor, pow(h, 0.6)), 1.0);
    }
`;

/**
 * A large inverted sphere with a vertical-gradient shader, standing in for
 * atmosphere. Deliberately not the Three.js Sky addon (Preetham physical
 * scattering) — that reads photorealistic, which clashes with this scene's
 * flat/toon low-poly aesthetic. `horizonColor` should match SceneManager's
 * fog color exactly, or the globe silhouette shows a seam against the sky.
 */
export class SkyDome {
    constructor({ radius, topColor = '#8fd3f4', horizonColor = '#e8f7d8' } = {}) {
        const geometry = new THREE.SphereGeometry(radius, 16, 12);
        const material = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(topColor) },
                bottomColor: { value: new THREE.Color(horizonColor) }
            },
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            side: THREE.BackSide,
            depthWrite: false,
            // The dome sits far beyond the scene fog's `far` distance —
            // without this, scene fog would flatten its whole gradient to a
            // solid fog-colored disc instead of the intended top/horizon mix.
            fog: false
        });
        this.mesh = new THREE.Mesh(geometry, material);
    }
}
