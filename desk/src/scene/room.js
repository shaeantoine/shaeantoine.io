import * as THREE from 'three';
import {
    UNITS_PER_METER,
    CARPET_TILE_METERS,
    PLASTER_TILE_METERS,
    tileRepeats,
    createCarpetMaterial,
    createPlasterMaterial,
    createBaseboardMaterial
} from './surfaces.js';
import { WINDOW_POSITION, APERTURE_BEAM_TARGET } from './lighting.js';
import { activePreset } from './timeOfDay.js';

// Wide enough that the side walls sit outside the establishing shot and only
// come into view during the focus dollies, which is the point — they exist to
// close the box when the camera moves in on an object, not to frame the desk.
// ~5.6 m across.
const ROOM_WIDTH = 18;
const ROOM_HALF_WIDTH = ROOM_WIDTH / 2;
const WALL_HEIGHT = 10;
const WALL_THICKNESS = 0.1 * UNITS_PER_METER;

const BACK_WALL_Z = -2.2;
const ROOM_DEPTH = 12;

const BASEBOARD_HEIGHT = 0.12 * UNITS_PER_METER;
const BASEBOARD_DEPTH = 0.018 * UNITS_PER_METER;

// The window in the left-hand wall, at ordinary domestic proportions rather
// than derived from the beam's footprint.
//
// At the old 10-unit room width the wall stood 6 units from the light and the
// beam's cross-section there was a good match for a real window. Widening to 18
// puts the wall only 2 units from the light, where that cross-section shrinks to
// about 25 cm — a porthole. So the opening is now designed, and only its z
// position tracks the beam. Nothing depends on the two agreeing in size: this
// wall doesn't occlude (see buildLeftWall), and you can never see the opening
// and the pool of light it implies closely enough to compare them.
const WINDOW_SILL_ABOVE_FLOOR = 0.95 * UNITS_PER_METER;
const WINDOW_HEIGHT = 1.5 * UNITS_PER_METER;
const WINDOW_WIDTH = 1.2 * UNITS_PER_METER;
const WINDOW_BAR_THICKNESS = 0.035 * UNITS_PER_METER;

// Brightness of the sky panel seen through the opening. Taken from the active
// time-of-day preset, and above 1 in every daytime one on purpose — an
// interior exposed for the room always blows its windows out, and a window
// that sits at the same value as the wall around it reads as a painted
// rectangle. After dark it drops below the plaster instead, which is what
// makes the opening read as a hole onto a dark street rather than a lamp.

/**
 * Scales a geometry's UVs so its texture tiles at a fixed real-world density
 * regardless of the surface's size.
 *
 * Tiling here rather than via `texture.repeat` is what lets differently-sized
 * walls share one material: `repeat` belongs to the texture, so setting it
 * per-wall would force a separate Texture, material, and download of the whole
 * PBR set for every wall in the room.
 */
function tiled(geometry, widthUnits, heightUnits, tileMeters) {
    const uv = geometry.attributes.uv;
    const repeatX = tileRepeats(widthUnits, tileMeters);
    const repeatY = tileRepeats(heightUnits, tileMeters);
    for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, uv.getX(i) * repeatX, uv.getY(i) * repeatY);
    }
    uv.needsUpdate = true;
    return geometry;
}

function wallMesh(widthUnits, heightUnits, material) {
    const mesh = new THREE.Mesh(
        tiled(new THREE.PlaneGeometry(widthUnits, heightUnits), widthUnits, heightUnits, PLASTER_TILE_METERS),
        material
    );
    mesh.receiveShadow = true;
    return mesh;
}

/** A skirting run of `length`, lying along its local X axis. */
function baseboard(length, material) {
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(length, BASEBOARD_HEIGHT, BASEBOARD_DEPTH),
        material
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.y = BASEBOARD_HEIGHT / 2;
    return mesh;
}

/**
 * Where the reference beam's axis passes through the plane of the left-hand
 * wall, returned as { y, z } in world space. Derived from the light rather than
 * hardcoded so the opening cannot drift out of alignment with the daylight if
 * WINDOW_POSITION or APERTURE_BEAM_TARGET is retuned.
 *
 * Deliberately the *reference* target and not the active preset's — see the
 * note on APERTURE_BEAM_TARGET in lighting.js. The hole in the wall is fixed
 * architecture; only the light through it changes with the hour.
 */
function beamCrossingAtLeftWall() {
    const origin = new THREE.Vector3(WINDOW_POSITION.x, WINDOW_POSITION.y, WINDOW_POSITION.z);
    const axis = new THREE.Vector3(APERTURE_BEAM_TARGET.x, APERTURE_BEAM_TARGET.y, APERTURE_BEAM_TARGET.z)
        .sub(origin)
        .normalize();
    const t = (-ROOM_HALF_WIDTH - origin.x) / axis.x;
    return { y: origin.y + axis.y * t, z: origin.z + axis.z * t };
}

/**
 * Builds the room the desk sits in: carpet, three walls, skirting, and a window
 * in the left-hand wall.
 *
 * Everything is authored with the floor at local y=0 and the whole group is
 * translated once in `setFloorY`. World y=0 is the *desktop* surface, not the
 * floor, and the floor's real height is only known after the desk model loads
 * and reports its scaled height — so the group stays hidden until then rather
 * than flashing at the wrong elevation or z-fighting with the desktop.
 */
export function createRoom({ anisotropy }) {
    const group = new THREE.Group();
    group.visible = false;

    // One material per surface type, shared across every wall. See `tileRepeats`
    // — this is the whole reason tiling lives in the UVs.
    const plaster = createPlasterMaterial({ anisotropy });
    const trim = createBaseboardMaterial();

    const floor = new THREE.Mesh(
        tiled(new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_DEPTH), ROOM_WIDTH, ROOM_DEPTH, CARPET_TILE_METERS),
        createCarpetMaterial({ anisotropy })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = BACK_WALL_Z + ROOM_DEPTH / 2;
    floor.receiveShadow = true;
    group.add(floor);

    const backWall = wallMesh(ROOM_WIDTH, WALL_HEIGHT, plaster);
    backWall.position.set(0, WALL_HEIGHT / 2, BACK_WALL_Z);
    group.add(backWall);

    const backSkirting = baseboard(ROOM_WIDTH, trim);
    backSkirting.position.z = BACK_WALL_Z + BASEBOARD_DEPTH / 2;
    group.add(backSkirting);

    // Right-hand wall, facing -X into the room.
    const rightWall = wallMesh(ROOM_DEPTH, WALL_HEIGHT, plaster);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(ROOM_HALF_WIDTH, WALL_HEIGHT / 2, BACK_WALL_Z + ROOM_DEPTH / 2);
    group.add(rightWall);

    const rightSkirting = baseboard(ROOM_DEPTH, trim);
    rightSkirting.rotation.y = -Math.PI / 2;
    rightSkirting.position.set(ROOM_HALF_WIDTH - BASEBOARD_DEPTH / 2, BASEBOARD_HEIGHT / 2, BACK_WALL_Z + ROOM_DEPTH / 2);
    group.add(rightSkirting);

    group.add(buildLeftWall(plaster, trim));

    return {
        group,
        setFloorY(y) {
            group.position.y = y;
            group.visible = true;
        }
    };
}

/**
 * The left-hand wall, built as four panels around a window opening plus glazing
 * bars and a sky panel behind it.
 *
 * Nothing here casts a shadow, and that is deliberate. The daylight comes from
 * a SpotLight at x = -11, outside the room, so a solid left wall would block the
 * beam completely; the window's shape is instead carried by the mask projected
 * through the light (`sun.map` in lighting.js), already tuned against the
 * measured falloff. Letting this wall cast as well would either occlude the beam
 * entirely or double the pane pattern against the gobo's, and aligning the two
 * exactly would tie the wall's geometry to the floor height, which isn't known
 * until the desk model loads.
 *
 * The cone does spill past the opening onto the solid panels either side — it's
 * 3.27 units in radius here against an opening half-width of 2.22 — so the
 * missing occlusion is real. It just has nowhere to show: these panels face +X,
 * into the room, and the light is at -X behind them, so N·L is negative and they
 * receive no direct light whether or not anything occludes it. What reaches the
 * floor through the "wall" is the same beam that would have come through the
 * hole, because the gobo already cut it to the hole's size.
 */
function buildLeftWall(plaster, trim) {
    const wall = new THREE.Group();
    const x = -ROOM_HALF_WIDTH;
    const crossing = beamCrossingAtLeftWall();

    // `crossing` is world-space but this group is a child of the room, whose
    // origin sits on the floor. The room is translated by the floor height at
    // runtime, so convert using the same nominal floor the beam was tuned
    // against: the desk's underside, ~2.8 units below the desktop.
    const NOMINAL_FLOOR_Y = -2.8;

    // The opening sits at a designed sill height, but slides along the wall to
    // stay centred on where the beam passes through. Its height is not derived
    // from the beam, so widening the room far enough could in principle leave
    // the beam entering through solid wall — visually harmless, since these
    // panels are unlit anyway, but it would mean the window had stopped being
    // the apparent source of the light. Worth knowing about rather than
    // discovering later.
    const sillY = WINDOW_SILL_ABOVE_FLOOR;
    const headY = sillY + WINDOW_HEIGHT;
    const centreY = sillY + WINDOW_HEIGHT / 2;
    const centreZ = crossing.z;

    const crossingAboveFloor = crossing.y - NOMINAL_FLOOR_Y;
    if (crossingAboveFloor < sillY || crossingAboveFloor > headY) {
        console.warn(
            `[room] The daylight beam crosses the left wall ${crossingAboveFloor.toFixed(2)} units above the floor, ` +
            `outside the window opening (${sillY.toFixed(2)}..${headY.toFixed(2)}). ` +
            'Raise WINDOW_SILL_ABOVE_FLOOR or retune WINDOW_POSITION in lighting.js.'
        );
    }

    const nearZ = centreZ - WINDOW_WIDTH / 2;
    const farZ = centreZ + WINDOW_WIDTH / 2;

    const panel = (depthUnits, heightUnits, centre) => {
        const mesh = wallMesh(depthUnits, heightUnits, plaster);
        mesh.rotation.y = Math.PI / 2; // face +X, into the room
        mesh.position.set(x, centre.y, centre.z);
        wall.add(mesh);
    };

    // Below the sill, above the head, then the two returns either side.
    panel(ROOM_DEPTH, sillY, { y: sillY / 2, z: BACK_WALL_Z + ROOM_DEPTH / 2 });
    panel(ROOM_DEPTH, WALL_HEIGHT - headY, { y: (WALL_HEIGHT + headY) / 2, z: BACK_WALL_Z + ROOM_DEPTH / 2 });
    panel(nearZ - BACK_WALL_Z, WINDOW_HEIGHT, { y: centreY, z: (BACK_WALL_Z + nearZ) / 2 });
    panel(BACK_WALL_Z + ROOM_DEPTH - farZ, WINDOW_HEIGHT, { y: centreY, z: (farZ + BACK_WALL_Z + ROOM_DEPTH) / 2 });

    // Glazing bars dividing the opening into four panes, matching the gobo.
    const vertical = new THREE.Mesh(
        new THREE.BoxGeometry(WALL_THICKNESS, WINDOW_HEIGHT, WINDOW_BAR_THICKNESS),
        trim
    );
    vertical.position.set(x, centreY, centreZ);
    wall.add(vertical);

    const horizontal = new THREE.Mesh(
        new THREE.BoxGeometry(WALL_THICKNESS, WINDOW_BAR_THICKNESS, WINDOW_WIDTH),
        trim
    );
    horizontal.position.set(x, centreY, centreZ);
    wall.add(horizontal);

    // Blown-out daylight behind the opening. Without it the window would read as
    // a hole onto the dark scene background rather than as a source of light.
    const skyLight = activePreset().sky;
    const skyMaterial = new THREE.MeshBasicMaterial();
    skyMaterial.color.setHex(skyLight.color).multiplyScalar(skyLight.intensity);
    const sky = new THREE.Mesh(
        new THREE.PlaneGeometry(WINDOW_WIDTH * 1.4, WINDOW_HEIGHT * 1.4),
        skyMaterial
    );
    sky.rotation.y = Math.PI / 2;
    sky.position.set(x - WALL_THICKNESS, centreY, centreZ);
    wall.add(sky);

    const skirting = baseboard(ROOM_DEPTH, trim);
    skirting.rotation.y = Math.PI / 2;
    skirting.position.set(x + BASEBOARD_DEPTH / 2, BASEBOARD_HEIGHT / 2, BACK_WALL_Z + ROOM_DEPTH / 2);
    wall.add(skirting);

    return wall;
}
