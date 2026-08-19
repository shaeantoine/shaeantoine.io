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
import { FocusPanel } from './ui/FocusPanel.js';
import { Flywheel } from './ui/Flywheel.js';
import { Masthead } from './ui/Masthead.js';
import { PlanetCaption } from './ui/PlanetCaption.js';
import { NavBack } from './ui/NavBack.js';
import { BriefOverlay } from './ui/BriefOverlay.js';
import { cameraConfig, sunConfig, bodies, getBody, getLandmark, getLandmarks } from './data/universe.js';
import { orbitToVector3 } from './util/orbitCoords.js';
import { on, emit } from './util/EventBus.js';
import { outlineMaterial } from './kit/materials.js';

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
    getLandmarks(earthBody.id).filter((l) => l.kind === 'slot'),
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

// Earth's own hover outline — PlanetLoader doesn't own Earth (see class
// doc), so unlike every other planet's outline this isn't built/toggled
// there. Shares Globe's own geometry rather than cloning it: Globe.update()
// ripples that geometry's vertex positions in place every frame, and
// reusing the same BufferGeometry reference means this outline ripples
// along with it for free. Toggled directly from the 'input:hover'/
// 'state:changed' handlers below, alongside planetLoader.setHovered().
const earthOutline = new THREE.Mesh(globe.mesh.geometry, outlineMaterial());
earthOutline.scale.setScalar(1.06);
earthOutline.visible = false;
earthGroup.add(earthOutline);

const planetBodies = bodies.filter((body) => body.contentTier !== 'cluster');
const planetLoader = new PlanetLoader(sceneManager.scene, planetBodies);

const sun = new Sun(sunConfig);
sceneManager.scene.add(sun.mesh);

const skyDome = new SkyDome({ radius: cameraConfig.solarOrbitRadius * 3 });
sceneManager.scene.add(skyDome.mesh);

const stateMachine = new WorldStateMachine();
const focusPanel = new FocusPanel(document.getElementById('focus-panel'));
const flywheel = new Flywheel(document.getElementById('flywheel'));
const masthead = new Masthead(document.getElementById('masthead'));
const planetCaption = new PlanetCaption(document.getElementById('planet-caption'));
const navBack = new NavBack(document.getElementById('nav-back'));

const briefOverlay = new BriefOverlay(document.getElementById('landing'));

// Pickables are state-dependent: the solar view raycasts against every
// planet (including Earth's own pick proxy), the cluster view raycasts
// against Earth's countries — InputController itself doesn't need to know
// which set is active, only WorldStateMachine's current nesting does.
let insideCluster = false;
const inputController = new InputController(canvas, sceneManager.camera, () =>
    !insideCluster ? [...planetLoader.getPickableObjects(), earthPickProxy] : zoneLoader.getPickableObjects()
);

// CameraRig, ZoneLoader, PlanetLoader, FocusPanel, Flywheel, and
// NavBack only ever react to 'state:changed' — none of them decide
// transitions itself. WorldStateMachine is the sole decision-maker (see
// state/WorldStateMachine.js), consistent with the plan's one-directional
// event flow: InputController/NavBack/Flywheel emit intents, the
// state machine interprets them, everything else reacts to the resulting
// state.
let currentState = STATES.IDLE_LOADING;

on('state:changed', ({ state, selectedBodyId, focusTarget, focusStack }) => {
    const prevState = currentState;
    currentState = state;
    const topBodyId = focusStack[focusStack.length - 1]?.bodyId;
    insideCluster = topBodyId != null && getBody(topBodyId).contentTier === 'cluster';

    if (state !== STATES.CLUSTER_ORBITING) zoneLoader.setHovered(null);
    if (state !== STATES.SOLAR_ORBITING) {
        planetLoader.setHovered(null);
        planetCaption.setHovered(null);
        earthOutline.visible = false;
    }

    if (state === STATES.FLYING_TO_PLANET) {
        const body = getBody(selectedBodyId);
        const worldPosition = body.id === earthBody.id ? earthWorldPosition : planetLoader.getWorldPosition(body.id);
        planetLoader.pauseSolarOrbit(selectedBodyId);
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
        planetLoader.resumeSatellites(selectedBodyId);
    } else if (state === STATES.BODY_ORBITING) {
        if (prevState === STATES.FLYING_TO_PLANET) {
            // Just arrived at a non-Earth planet — push its own free-orbit
            // frame, sized differently depending on whether it carries
            // landmarks (a satellite system to fit) or not (a fixed
            // viewing distance).
            const body = getBody(selectedBodyId);
            const worldPosition = planetLoader.getWorldPosition(body.id);
            const satellites = getLandmarks(body.id).filter((l) => l.kind === 'satellite');
            if (satellites.length) {
                const outermostOrbitRadius = Math.max(...satellites.map((s) => s.orbitRadius ?? 0));
                cameraRig.enterOrbitCluster({
                    target: worldPosition,
                    coreRadius: body.renderRecipe.radius ?? 4,
                    outermostOrbitRadius,
                    minPolar: 0.15,
                    maxPolar: Math.PI - 0.15
                });
            } else {
                cameraRig.enterPlanetOrbit({
                    target: worldPosition,
                    cameraDistance: body.cameraDistance ?? 8,
                    minPolar: 0.15,
                    maxPolar: Math.PI - 0.15
                });
            }
        }
        cameraRig.setInputEnabled(true);
        cameraRig.resumeAutoRotate();
        planetLoader.resumeSatellites(selectedBodyId);
    } else if (state === STATES.FLYING_TO_LANDMARK) {
        if (focusTarget.kind === 'slot') {
            cameraRig.flyToSlot(getLandmark(earthBody.id, focusTarget.id), earthWorldPosition);
        } else if (focusTarget.kind === 'core') {
            // No camera movement — the sphere is already centered in view,
            // so "focusing" one of its landmarks is just swapping what's
            // mounted inside it (see PlanetLoader.mountCoreLandmark).
            planetLoader.mountCoreLandmark(focusTarget.parentBodyId, getLandmark(focusTarget.parentBodyId, focusTarget.id), sceneManager.camera);
            emit('camera:flyToComplete', {});
        } else {
            const satelliteWorldPosition = planetLoader.getSatelliteWorldPosition(focusTarget.parentBodyId, focusTarget.id);
            const boundingRadius = planetLoader.getSatelliteBoundingRadius(focusTarget.parentBodyId, focusTarget.id);
            cameraRig.flyToSatellite(satelliteWorldPosition, cameraRig.framingDistanceFor(boundingRadius));
        }
        planetLoader.pauseSatellites(focusTarget.parentBodyId);
    } else if (state === STATES.RETURNING) {
        // Only leaving CLUSTER_ORBITING/BODY_ORBITING entirely (not just
        // closing a landmark's panel) pops that body's orbit frame back off.
        if (prevState === STATES.CLUSTER_ORBITING) cameraRig.exitCluster();
        else if (prevState === STATES.BODY_ORBITING) {
            cameraRig.popOrbitFrame();
            planetLoader.resumeSolarOrbit(selectedBodyId);
        }
        // Closing a focused landmark's panel (not leaving the body) needs
        // the frame's radius explicitly widened back to nominal here, right
        // before returnToOrbit() reads it — flyToLandmark() itself leaves
        // frame.radius at the close-up distance so cycling between
        // landmarks stays smooth (see resetFrameRadius()'s doc comment).
        else if (prevState === STATES.FOCUSED) cameraRig.resetFrameRadius();
        cameraRig.returnToOrbit();
    } else if (state === STATES.SOLAR_ORBITING) {
        cameraRig.setInputEnabled(true);
        cameraRig.resumeAutoRotate();
    }
});

// Purely a visual affordance (not a state transition), so it's handled here
// directly instead of routed through WorldStateMachine.
on('input:hover', ({ id, kind }) => {
    if (currentState === STATES.SOLAR_ORBITING && kind === 'body') {
        planetLoader.setHovered(id);
        planetCaption.setHovered(id);
        earthOutline.visible = id === earthBody.id;
        canvas.style.cursor = id ? 'pointer' : '';
    } else if (currentState === STATES.CLUSTER_ORBITING && kind === 'slot') {
        zoneLoader.setHovered(id);
        canvas.style.cursor = id ? 'pointer' : '';
    } else {
        planetLoader.setHovered(null);
        planetCaption.setHovered(null);
        zoneLoader.setHovered(null);
        earthOutline.visible = false;
        canvas.style.cursor = '';
    }
});

let lastTime = performance.now();
function animate(now) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    cameraRig.update(dt);
    planetLoader.update(dt);
    globe.update(dt);
    sceneManager.render();
    requestAnimationFrame(animate);
}

planetLoader.loadAll();

// Any body with a top-level `solarOrbit` config circles the sun at that
// radius/period instead of sitting still at its own orbit slot — see
// PlanetLoader.startSolarOrbit().
for (const orbitBody of bodies.filter((b) => b.solarOrbit)) {
    planetLoader.startSolarOrbit(orbitBody.id, orbitBody.solarOrbit.radius, orbitBody.solarOrbit.periodSec);
}

zoneLoader.loadAll().then(() => {
    briefOverlay.show();
    stateMachine.ready();
    requestAnimationFrame(animate);
});
