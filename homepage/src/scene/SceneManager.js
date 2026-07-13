import * as THREE from 'three';

// Matches SkyDome's horizonColor exactly — a mismatched fog color creates a
// visible seam where the globe silhouette meets the sky.
const HORIZON_COLOR = 0xe8f7d8;

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

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(HORIZON_COLOR, 24, 150);

        this.camera = new THREE.PerspectiveCamera(
            45,
            window.innerWidth / window.innerHeight,
            0.1,
            500
        );

        this.scene.add(new THREE.AmbientLight(0xfff4e0, 0.75));

        this.sun = new THREE.DirectionalLight(0xffffff, 1.0);
        this.sun.position.set(8, 12, 6);
        this.scene.add(this.sun);

        this._onResize = this._onResize.bind(this);
        window.addEventListener('resize', this._onResize);
    }

    dispose() {
        window.removeEventListener('resize', this._onResize);
    }

    _onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }
}
