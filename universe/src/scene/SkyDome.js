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
// zero-asset build. Three star layers (different density/size/seed) avoid
// the uniform-grid look a single layer would have and read as near/mid/far
// depth. A fixed-axis noise band stands in for the Milky Way.
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

    // Bucketed against real star color-temperature distribution: most stars
    // read white/blue-white, yellow (sun-like) and orange/red giants are
    // progressively rarer.
    vec3 starPalette(float t) {
        if (t < 0.55) return vec3(1.0, 1.0, 1.0);
        if (t < 0.8) return vec3(0.75, 0.83, 1.0);
        if (t < 0.93) return vec3(1.0, 0.93, 0.78);
        return vec3(1.0, 0.75, 0.55);
    }

    vec4 starLayer(vec2 uv, float density, float size, float threshold, float seed) {
        vec2 gridUV = uv * density;
        vec2 cell = floor(gridUV);
        vec2 f = fract(gridUV);
        float h = hash21(cell + seed);
        if (h < threshold) return vec4(0.0);
        vec2 jitter = hash22(cell + seed) - 0.5;
        vec2 center = vec2(0.5) + jitter * 0.6;

        // u wraps a full 2*PI of azimuth while v only spans PI of latitude
        // (asin's range), so a raw UV-space circle is really an ellipse
        // ~2x wider than tall once mapped onto the sphere. Doubling the u
        // component before measuring distance corrects for that, so the
        // disc this defines reads as round rather than a horizontal oval.
        vec2 diff = f - center;
        diff.x *= 2.0;

        // A steep exponential collapses to a tight bright point with almost
        // no soft halo — reads as a sharp pinprick of light rather than a
        // blurry dot. (The earlier gentler falloff was the source of the
        // "blurred oval" look.)
        float d = length(diff) / size;
        float core = exp(-d * d * 26.0);

        float brightnessVariance = 0.4 + 0.6 * hash21(cell + seed + 3.1);
        // Subtle — real starlight is near-steady; a heavy sine flicker reads
        // as a video-game particle effect rather than a night sky.
        float twinkle = 0.88 + 0.12 * sin(uTime * 1.5 + h * 20.0);
        float intensity = core * twinkle * brightnessVariance;
        vec3 color = starPalette(hash21(cell + seed + 9.7));
        return vec4(color * intensity, intensity);
    }

    float valueNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    float fbm(vec2 p) {
        float v = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 4; i++) {
            v += amp * valueNoise(p);
            p *= 2.0;
            amp *= 0.5;
        }
        return v;
    }

    void main() {
        vec3 dir = normalize(vWorldPosition);
        float h = dir.y * 0.5 + 0.5;

        float u = atan(dir.z, dir.x) / 6.28318530718 + 0.5;
        float v = asin(clamp(dir.y, -1.0, 1.0)) / 3.14159265359 + 0.5;
        vec2 uv = vec2(u, v);

        vec4 stars = starLayer(uv, 70.0, 0.20, 0.978, 0.0);
        stars += starLayer(uv + 13.7, 130.0, 0.13, 0.968, 7.0);
        stars += starLayer(uv + 41.3, 240.0, 0.07, 0.975, 21.0) * 0.6;
        vec3 starsOut = clamp(stars.rgb, 0.0, 1.0) * starColor;

        // A fixed-axis great circle in world space stands in for the
        // galactic plane — its distance-from-plane gives a soft band mask,
        // fbm noise along it breaks the mask into wispy dust-cloud clumps
        // instead of a flat, obviously-procedural stripe. Colors kept
        // near-neutral and dim (not the brighter, more saturated purple-gray
        // this used to be) — ACES filmic tonemapping (applied once, at
        // SceneManager's OutputPass) pushes any brighter/more saturated
        // value here well above the near-black sky gradient around it,
        // reading as an obvious purple smear rather than a faint dust band.
        vec3 bandAxis = normalize(vec3(0.35, 0.55, -0.75));
        float bandDist = dot(dir, bandAxis);
        float bandMask = exp(-bandDist * bandDist * 10.0);
        float cloud = fbm(uv * vec2(6.0, 3.0)) * 0.6 + fbm(uv * vec2(13.0, 7.0) + 5.0) * 0.4;
        cloud = smoothstep(0.3, 0.85, cloud);
        vec3 milkyColor = mix(vec3(0.006, 0.0055, 0.008), vec3(0.016, 0.015, 0.019), cloud);
        vec3 milkyWay = milkyColor * bandMask * cloud;

        vec3 sky = mix(bottomColor, topColor, pow(h, 0.6));
        vec3 color = sky + milkyWay + starsOut;
        gl_FragColor = vec4(color, 1.0);
    }
`;

/**
 * A large inverted sphere rendering deep space: a near-black vertical
 * gradient, a soft Milky Way dust band, and three star layers with
 * color-temperature variance, standing in for an actual night sky rather
 * than the Three.js Sky addon's daytime atmospheric scattering.
 * `horizonColor` should match SceneManager's fog color exactly, or the globe
 * silhouette shows a seam against the sky.
 */
export class SkyDome {
    constructor({ radius, topColor = '#050506', horizonColor = '#0a0a0d', starColor = '#ffffff' } = {}) {
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
