import * as THREE from 'three';
import { SceneManager } from './scene/SceneManager.js';
import { CameraRig } from './scene/CameraRig.js';
import { InputController } from './scene/InputController.js';
import { ZoneLoader } from './scene/ZoneLoader.js';
import { PlanetLoader } from './scene/PlanetLoader.js';
import { Globe } from './scene/Globe.js';
import { Sun } from './scene/Sun.js';
import { SkyDome } from './scene/SkyDome.js';
import { WorldStateMachine } from './state/WorldStateMachine.js';
import { STATES } from './state/states.js';
import { Sidebar } from './ui/Sidebar.js';
import { Masthead } from './ui/Masthead.js';
import { PlanetCaption } from './ui/PlanetCaption.js';
import { ModeToggle } from './ui/ModeToggle.js';
import { ClusterReturn } from './ui/ClusterReturn.js';
import { BriefOverlay } from './ui/BriefOverlay.js';
import { cameraConfig, sunConfig, bodies, getBody, getSlot } from './data/universe.js';
import { orbitToVector3 } from './util/orbitCoords.js';
import { on, emit } from './util/EventBus.js';

const canvas = document.getElementById('world-canvas');
const sceneManager = new SceneManager(canvas);
const cameraRig = new CameraRig(sceneManager.camera, cameraConfig);

// Earth (the one cluster body) sits in its own group at its orbit position —
// everything ZoneLoader/Globe already know how to build is authored in that
// group's local space, unchanged from when it sat at the scene origin.
const earthBody = getBody('earth');
const earthWorldPosition = orbitToVector3(earthBody.orbit.radius, earthBody.orbit.phaseDeg);
const earthGroup = new THREE.Group();
earthGroup.position.copy(earthWorldPosition);
sceneManager.scene.add(earthGroup);

const globe = new Globe({ radius: earthBody.cluster.globeRadius, color: earthBody.renderRecipe.color });
earthGroup.add(globe.mesh);

const zoneLoader = new ZoneLoader(
    earthGroup,
    earthBody.cluster.slots,
    earthBody.cluster.globeRadius,
    earthBody.cluster.islandScale
);

// A single invisible pick target standing in for "Earth as a whole planet"
// while at the solar level — kept separate from earthGroup's real content
// (Globe + every country's island) so a solar-level raycast can't tunnel
// straight through to a specific country's userData.slotId and skip the
// "fly to Earth, then enter its cluster" step.
const earthPickProxy = new THREE.Mesh(
    new THREE.SphereGeometry(earthBody.cluster.globeRadius * earthBody.cluster.islandScale, 12, 8)
);
earthPickProxy.visible = false;
earthPickProxy.userData.bodyId = earthBody.id;
earthGroup.add(earthPickProxy);

const planetBodies = bodies.filter((body) => body.contentTier !== 'cluster');
const planetLoader = new PlanetLoader(sceneManager.scene, planetBodies);

const sun = new Sun(sunConfig);
sceneManager.scene.add(sun.mesh);

const skyDome = new SkyDome({ radius: cameraConfig.solarOrbitRadius * 3 });
sceneManager.scene.add(skyDome.mesh);

const stateMachine = new WorldStateMachine();
const sidebar = new Sidebar(document.getElementById('sidebar'));
const masthead = new Masthead(document.getElementById('masthead'));
const planetCaption = new PlanetCaption(document.getElementById('planet-caption'));
const modeToggle = new ModeToggle(document.getElementById('mode-toggle'));
const clusterReturn = new ClusterReturn(document.getElementById('cluster-return'));

const briefOverlay = new BriefOverlay(document.getElementById('landing'));

// Pickables are state-dependent: the solar view raycasts against every
// planet (including Earth's own pick proxy), the cluster view raycasts
// against Earth's countries — InputController itself doesn't need to know
// which set is active, only WorldStateMachine's current nesting does.
let insideCluster = false;
const inputController = new InputController(canvas, sceneManager.camera, () =>
    !insideCluster ? [...planetLoader.getPickableObjects(), earthPickProxy] : zoneLoader.getPickableObjects()
);

// CameraRig, ZoneLoader, PlanetLoader, Sidebar, ModeToggle, and
// ClusterReturn only ever react to 'state:changed' — none of them decide
// transitions itself. WorldStateMachine is the sole decision-maker (see
// state/WorldStateMachine.js), consistent with the plan's one-directional
// event flow: InputController/ModeToggle/ClusterReturn emit intents, the
// state machine interprets them, everything else reacts to the resulting
// state.
let currentState = STATES.IDLE_LOADING;
on('state:changed', ({ state, mode, selectedBodyId, selectedSlotId, focusStack }) => {
    const prevState = currentState;
    currentState = state;
    insideCluster = focusStack.some((frame) => frame.level === 'cluster');

    if (state !== STATES.CLUSTER_ORBITING) zoneLoader.setHovered(null);
    if (state !== STATES.SOLAR_ORBITING) {
        planetLoader.setHovered(null);
        planetCaption.setHovered(null);
    }

    if (state === STATES.FLYING_TO_PLANET) {
        const body = getBody(selectedBodyId);
        const worldPosition = body.id === earthBody.id ? earthWorldPosition : planetLoader.getWorldPosition(body.id);
        cameraRig.flyToPlanet(body, worldPosition);
    } else if (state === STATES.CLUSTER_ORBITING) {
        if (prevState === STATES.FLYING_TO_PLANET) {
            // Just arrived at Earth — push its cluster orbit frame exactly
            // once, seeded from wherever the fly-in tween left the camera.
            cameraRig.enterCluster({
                target: earthWorldPosition,
                globeRadius: earthBody.cluster.globeRadius,
                islandScale: earthBody.cluster.islandScale,
                minPolar: earthBody.cluster.orbitMinPolar,
                maxPolar: earthBody.cluster.orbitMaxPolar,
                nominalRadius: earthBody.cluster.orbitRadius
            });
        }
        cameraRig.setInputEnabled(true);
        cameraRig.resumeAutoRotate();
    } else if (state === STATES.FLYING_TO_SLOT) {
        cameraRig.flyToSlot(getSlot(selectedSlotId), earthWorldPosition);
    } else if (state === STATES.RETURNING) {
        // Only leaving CLUSTER_ORBITING entirely (not just closing a
        // country's sidebar) pops the cluster orbit frame back off.
        if (prevState === STATES.CLUSTER_ORBITING) cameraRig.exitCluster();
        cameraRig.returnToOrbit();
    } else if (state === STATES.SOLAR_ORBITING) {
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
on('input:hover', ({ id, kind }) => {
    if (currentState === STATES.SOLAR_ORBITING && kind === 'body') {
        planetLoader.setHovered(id);
        planetCaption.setHovered(id);
        canvas.style.cursor = id ? 'pointer' : '';
    } else if (currentState === STATES.CLUSTER_ORBITING && kind === 'slot') {
        zoneLoader.setHovered(id);
        canvas.style.cursor = id ? 'pointer' : '';
    } else {
        planetLoader.setHovered(null);
        planetCaption.setHovered(null);
        zoneLoader.setHovered(null);
        canvas.style.cursor = '';
    }
});

let lastTime = performance.now();
function animate(now) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    cameraRig.update(dt);
    sceneManager.render();
    requestAnimationFrame(animate);
}

planetLoader.loadAll();

zoneLoader.loadAll(stateMachine.mode).then(() => {
    briefOverlay.show();
    stateMachine.ready();
    requestAnimationFrame(animate);
});
