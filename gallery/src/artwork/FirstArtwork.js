import * as THREE from 'three';
import { emit } from '../shared/EventBus.js';

const GEOMETRIES = [
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.TorusGeometry(0.9, 0.32, 12, 32),
    new THREE.BoxGeometry(1.4, 1.4, 1.4),
    new THREE.SphereGeometry(1, 24, 16),
    new THREE.ConeGeometry(1, 1.8, 24)
];

const LAYOUT = [
    [-3.2, 0.6, 0],
    [-1.6, -0.8, 1],
    [0, 1, -1],
    [1.6, -0.6, 0.5],
    [3.2, 0.4, -0.5]
];

/**
 * The first placeholder artwork
 */
export class FirstArtwork {
    constructor(canvas) {
        this.canvas = canvas;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0a);

        this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        this.camera.position.set(0, 0, 9);

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const key = new THREE.DirectionalLight(0xffffff, 1.2);
        key.position.set(4, 6, 8);
        this.scene.add(key);

        this.objects = LAYOUT.map((position, i) => {
            const material = new THREE.MeshStandardMaterial({
                color: 0xf2f2f2,
                roughness: 0.5,
                metalness: 0.1
            });
            const mesh = new THREE.Mesh(GEOMETRIES[i], material);
            mesh.position.set(...position);
            mesh.userData.targetId = `object-${i}`;
            mesh.userData.baseY = position[1];
            this.scene.add(mesh);
            return mesh;
        });

        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.hovered = null;

        this._onPointerMove = this._onPointerMove.bind(this);
        this._onClick = this._onClick.bind(this);
        this._onResize = this._onResize.bind(this);
        canvas.addEventListener('pointermove', this._onPointerMove);
        canvas.addEventListener('click', this._onClick);
        window.addEventListener('resize', this._onResize);
        this._onResize();

        this.clock = new THREE.Clock();
        this._raf = requestAnimationFrame(() => this._tick());
    }

    _onResize() {
        const { clientWidth, clientHeight } = this.canvas;
        this.renderer.setSize(clientWidth, clientHeight, false);
        this.camera.aspect = clientWidth / clientHeight;
        this.camera.updateProjectionMatrix();
    }

    _updatePointer(event) {
        const rect = this.canvas.getBoundingClientRect();
        this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    _pick() {
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const [hit] = this.raycaster.intersectObjects(this.objects);
        return hit?.object ?? null;
    }

    _onPointerMove(event) {
        this._updatePointer(event);
        const hit = this._pick();
        if (hit !== this.hovered) {
            this.hovered = hit;
            this.canvas.style.cursor = hit ? 'pointer' : '';
        }
    }

    _onClick(event) {
        this._updatePointer(event);
        const hit = this._pick();
        if (hit) emit('artwork:interact', { targetId: hit.userData.targetId });
    }

    _tick() {
        const t = this.clock.getElapsedTime();
        for (const mesh of this.objects) {
            const bob = Math.sin(t * 0.8 + mesh.userData.baseY) * 0.15;
            mesh.position.y = mesh.userData.baseY + bob;
            mesh.rotation.y = t * 0.25;
            mesh.rotation.x = Math.sin(t * 0.4) * 0.1;
            const targetScale = mesh === this.hovered ? 1.15 : 1;
            mesh.scale.setScalar(mesh.scale.x + (targetScale - mesh.scale.x) * 0.15);
        }
        this.renderer.render(this.scene, this.camera);
        this._raf = requestAnimationFrame(() => this._tick());
    }

    setVisible(visible) {
        this.canvas.style.opacity = visible ? '1' : '0';
        this.canvas.style.pointerEvents = visible ? 'auto' : 'none';
    }

    dispose() {
        cancelAnimationFrame(this._raf);
        this.canvas.removeEventListener('pointermove', this._onPointerMove);
        this.canvas.removeEventListener('click', this._onClick);
        window.removeEventListener('resize', this._onResize);
        this.renderer.dispose();
    }
}
