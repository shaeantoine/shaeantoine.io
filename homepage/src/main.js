import { SceneManager } from './scene/SceneManager.js';
import { CameraRig } from './scene/CameraRig.js';
import { InputController } from './scene/InputController.js';
import { ZoneLoader } from './scene/ZoneLoader.js';
import { Globe } from './scene/Globe.js';
import { SkyDome } from './scene/SkyDome.js';
import { WorldStateMachine } from './state/WorldStateMachine.js';
import { STATES } from './state/states.js';
import { Sidebar } from './ui/Sidebar.js';
import { ModeToggle } from './ui/ModeToggle.js';
import { Landing } from './ui/Landing.js';
import { cameraConfig, slots, getSlot } from './data/zones.js';
import { on, emit } from './util/EventBus.js';

const canvas = document.getElementById('world-canvas');
const sceneManager = new SceneManager(canvas);
const cameraRig = new CameraRig(sceneManager.camera, cameraConfig);
const zoneLoader = new ZoneLoader(sceneManager.scene, slots, cameraConfig.globeRadius, cameraConfig.islandScale);
const globe = new Globe({ radius: cameraConfig.globeRadius });
const skyDome = new SkyDome({ radius: cameraConfig.globeRadius * 25 });
sceneManager.scene.add(globe.mesh, skyDome.mesh);
const stateMachine = new WorldStateMachine();
const sidebar = new Sidebar(document.getElementById('sidebar'));
const modeToggle = new ModeToggle(document.getElementById('mode-toggle'));
const landing = new Landing(document.getElementById('landing'));
document.getElementById('world-return').addEventListener('click', () => landing.show());

const inputController = new InputController(
    canvas,
    sceneManager.camera,
    () => zoneLoader.getPickableObjects()
);

// CameraRig, ZoneLoader, Sidebar, and ModeToggle only ever react to
// 'state:changed' — none of them decide transitions itself.
// WorldStateMachine is the sole decision-maker (see state/WorldStateMachine.js),
// consistent with the plan's one-directional event flow: InputController/
// ModeToggle emit intents, the state machine interprets them, everything
// else reacts to the resulting state.
let currentState = STATES.IDLE_LOADING;
on('state:changed', ({ state, mode, selectedSlotId }) => {
    currentState = state;
    if (state !== STATES.ORBITING) zoneLoader.setHovered(null);

    if (state === STATES.FLYING_TO_FOCUS) {
        cameraRig.flyToSlot(getSlot(selectedSlotId));
    } else if (state === STATES.RETURNING) {
        cameraRig.returnToOrbit();
    } else if (state === STATES.ORBITING) {
        cameraRig.setInputEnabled(true);
        cameraRig.resumeAutoRotate();
    } else if (state === STATES.MODE_TRANSITIONING) {
        cameraRig.setInputEnabled(false);
        zoneLoader.transitionTo(mode).then(() => {
            emit('zones:transitionComplete', {});
        });
    }
});

// Purely a visual affordance (not a state transition), so it's handled here
// directly instead of routed through WorldStateMachine.
on('input:hover', ({ slotId }) => {
    if (currentState !== STATES.ORBITING) return;
    zoneLoader.setHovered(slotId);
    canvas.style.cursor = slotId ? 'pointer' : '';
});

let lastTime = performance.now();
function animate(now) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    cameraRig.update(dt);
    sceneManager.render();
    requestAnimationFrame(animate);
}

zoneLoader.loadAll(stateMachine.mode).then(() => {
    stateMachine.ready();
    requestAnimationFrame(animate);
});
