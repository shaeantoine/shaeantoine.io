import * as THREE from 'three';

const VERTEX_SHADER = `
    varying vec3 vWorldPosition;
    void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

// Stars are placed procedurally (no texture asset) by hashing a spherical
// (u, v) grid — cheap, seamless at the poles' wraparound, and keeps the
// zero-asset build. Two star layers (different density/size/seed) avoid the
// uniform-grid look a single layer would have.
const FRAGMENT_SHADER = `
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    uniform vec3 starColor;
    uniform float uTime;
    varying vec3 vWorldPosition;

    float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
    }

    vec2 hash22(vec2 p) {
        float n = hash21(p);
        return vec2(n, hash21(p + n));
    }

    float starLayer(vec2 uv, float density, float size, float threshold, float seed) {
        vec2 gridUV = uv * density;
        vec2 cell = floor(gridUV);
        vec2 f = fract(gridUV);
        float h = hash21(cell + seed);
        if (h < threshold) return 0.0;
        vec2 jitter = hash22(cell + seed) - 0.5;
        vec2 center = vec2(0.5) + jitter * 0.6;

        // Exponential falloff from a near-zero-radius center reads as a
        // sharp pinpoint; a smoothstep-based disc stays near-maximum
        // brightness across most of its radius, which looks like a flat,
        // uniformly-lit button instead of a point of light.
        float d = length(f - center) / size;
        float core = pow(exp(-d * d * 4.0), 2.0);

        float brightnessVariance = 0.4 + 0.6 * hash21(cell + seed + 3.1);
        float twinkle = 0.7 + 0.3 * sin(uTime * 1.5 + h * 20.0);
        return core * twinkle * brightnessVariance;
    }

    void main() {
        vec3 dir = normalize(vWorldPosition);
        float h = dir.y * 0.5 + 0.5;

        float u = atan(dir.z, dir.x) / 6.28318530718 + 0.5;
        float v = asin(clamp(dir.y, -1.0, 1.0)) / 3.14159265359 + 0.5;
        vec2 uv = vec2(u, v);

        float stars = starLayer(uv, 90.0, 0.16, 0.985, 0.0);
        stars += starLayer(uv + 13.7, 45.0, 0.24, 0.965, 7.0) * 1.3;
        stars = clamp(stars, 0.0, 1.0);

        // Fades stars out near the horizon, where the gradient is brightest
        // and would otherwise wash them out — keeps the sky feeling bright
        // while the stars stay visible higher up.
        float starFade = smoothstep(0.05, 0.55, h);

        vec3 sky = mix(bottomColor, topColor, pow(h, 0.6));
        vec3 color = sky + stars * starFade * starColor;
        gl_FragColor = vec4(color, 1.0);
    }
`;

/**
 * A large inverted sphere with a vertical-gradient shader plus procedural
 * stars, standing in for a bright starry sky. Deliberately not the Three.js
 * Sky addon (Preetham physical scattering) — that reads photorealistic,
 * which clashes with this scene's flat/toon low-poly aesthetic.
 * `horizonColor` should match SceneManager's fog color exactly, or the globe
 * silhouette shows a seam against the sky.
 */
export class SkyDome {
    constructor({ radius, topColor = '#2e4a9e', horizonColor = '#f5f3ff', starColor = '#ffffff' } = {}) {
        const geometry = new THREE.SphereGeometry(radius, 16, 12);
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(topColor) },
                bottomColor: { value: new THREE.Color(horizonColor) },
                starColor: { value: new THREE.Color(starColor) },
                uTime: { value: 0 }
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
        this.mesh = new THREE.Mesh(geometry, this.material);
    }

    /** Advances the twinkle animation — call once per frame with delta seconds. */
    update(dt) {
        this.material.uniforms.uTime.value += dt;
    }
}
