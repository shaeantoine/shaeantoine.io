import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Matches SkyDome's horizonColor exactly — a mismatched fog color creates a
// visible seam where the globe silhouette meets the sky. Kept close to
// neutral gray (R≈G≈B), not the original navy's blue lean — ACES filmic
// tonemapping (applied once, at OutputPass; see render()) makes dark,
// saturated blues read as purple even when the math reproduces the
// original hue faithfully, since human vision is more sensitive to a blue
// tint here than exposure-matching alone accounts for. Desaturating (rather
// than re-solving for the exact old navy) is what actually reads as black.
const HORIZON_COLOR = 0x0a0a0d;

// Objects on this layer get an UnrealBloomPass glow composited on top of the
// normal lit render — reserved for actual light sources (the sun), so it
// reads as the brightest thing in the scene regardless of how PBR specular
// highlights on lit planets happen to tone-map. See Sun.js.
export const BLOOM_LAYER = 1;

const BLOOM_DARK_MATERIAL = new THREE.MeshBasicMaterial({ color: 'black' });

// Composites the blurred bloom-only render additively over the normal
// (base) render — the standard three.js selective-bloom technique, since
// UnrealBloomPass itself has no notion of "only some objects."
const BLOOM_MIX_VERTEX_SHADER = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;
const BLOOM_MIX_FRAGMENT_SHADER = `
    uniform sampler2D baseTexture;
    uniform sampler2D bloomTexture;
    varying vec2 vUv;
    void main() {
        gl_FragColor = texture2D(baseTexture, vUv) + texture2D(bloomTexture, vUv);
    }
`;

/**
 * Owns the renderer, scene, lighting, and resize handling. Deliberately
 * thin — camera orbit lives in CameraRig, zone content lives in ZoneLoader.
 */
export class SceneManager {
    constructor(canvas) {
        this.canvas = canvas;

        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(HORIZON_COLOR, 1);
        // ACES filmic response + sRGB output — PBR materials otherwise read
        // washed out/flat under THREE's linear default, especially on the
        // sharp specular highlights standardMaterialFlat relies on. Applied
        // once, at OutputPass (see below) — the intermediate bloom/base
        // render targets stay in linear space untouched.
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.1;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(HORIZON_COLOR, 24, 150);

        // Generic PMREM room environment gives every MeshStandardMaterial a
        // real reflection/specular source (sharp catchlights on facets, soft
        // ambient fill everywhere else) instead of the flat, directionless
        // look PBR materials have with zero environment map. Cheap: baked
        // once here, not a live-updating probe.
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
        pmremGenerator.dispose();

        this.camera = new THREE.PerspectiveCamera(
            45,
            window.innerWidth / window.innerHeight,
            0.1,
            500
        );

        this.scene.add(new THREE.AmbientLight(0xfff4e0, 0.4));

        this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
        this.sun.position.set(8, 12, 6);
        this.scene.add(this.sun);

        this._bloomLayer = new THREE.Layers();
        this._bloomLayer.set(BLOOM_LAYER);
        this._darkenedMaterials = new Map();

        const renderPass = new RenderPass(this.scene, this.camera);

        // Renders only the bloom-layer objects (see _darkenNonBloomed) at
        // reduced resolution, then blurs the result across mip levels — kept
        // deliberately mild: UnrealBloomPass's coarser mips blur across a
        // large fraction of the frame by design, so too much strength/radius
        // (or too low a threshold) washes out the whole render once
        // composited and tone-mapped, rather than staying a glow near the
        // sun's own silhouette. threshold 0.8 keeps this from picking up
        // anything but the sun's own emissive material (see Sun.js).
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.4,
            0.25,
            0.8
        );
        this.bloomComposer = new EffectComposer(this.renderer);
        this.bloomComposer.renderToScreen = false;
        this.bloomComposer.addPass(renderPass);
        this.bloomComposer.addPass(this.bloomPass);

        const mixPass = new ShaderPass(
            new THREE.ShaderMaterial({
                uniforms: {
                    baseTexture: { value: null },
                    bloomTexture: { value: this.bloomComposer.renderTarget2.texture }
                },
                vertexShader: BLOOM_MIX_VERTEX_SHADER,
                fragmentShader: BLOOM_MIX_FRAGMENT_SHADER
            }),
            'baseTexture'
        );

        this.finalComposer = new EffectComposer(this.renderer);
        this.finalComposer.addPass(renderPass);
        this.finalComposer.addPass(mixPass);
        // Applies the renderer's ACES tone mapping + sRGB output once, at
        // the very end — the only point in this composer chain where that
        // conversion should happen.
        this.finalComposer.addPass(new OutputPass());

        this._resizeListeners = [];

        this._onResize = this._onResize.bind(this);
        window.addEventListener('resize', this._onResize);
    }

    dispose() {
        window.removeEventListener('resize', this._onResize);
    }

    /** Registers a callback fired on every window resize, alongside the perspective camera's own update. */
    addResizeListener(fn) {
        this._resizeListeners.push(fn);
    }

    _onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.bloomComposer.setSize(window.innerWidth, window.innerHeight);
        this.finalComposer.setSize(window.innerWidth, window.innerHeight);
        this._resizeListeners.forEach((fn) => fn());
    }

    _darkenNonBloomed(object) {
        if (object.isMesh && !this._bloomLayer.test(object.layers)) {
            this._darkenedMaterials.set(object, object.material);
            object.material = BLOOM_DARK_MATERIAL;
        }
    }

    _restoreMaterials() {
        for (const [object, material] of this._darkenedMaterials) {
            object.material = material;
        }
        this._darkenedMaterials.clear();
    }

    render() {
        // Selective bloom (three.js's standard technique): first render with
        // every non-bloom-layer object swapped to a flat black material, so
        // only the sun contributes to the blurred bloom texture, then render
        // the real scene and additively composite that texture on top.
        this.scene.traverse((object) => this._darkenNonBloomed(object));
        this.bloomComposer.render();
        this._restoreMaterials();

        this.finalComposer.render();
    }
}
