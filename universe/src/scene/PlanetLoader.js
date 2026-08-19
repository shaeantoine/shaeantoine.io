import * as THREE from 'three';
import { standardMaterialFlat, outlineMaterial } from '../kit/materials.js';
import { orbitToVector3 } from '../util/orbitCoords.js';
import { loadOBJ } from '../loaders/obj.js';
import { BLOOM_LAYER } from './SceneManager.js';

// A 'coreReveal' sphere's own glass "breathes" — roughness/ior (how in-focus
// and how sharply it bends light) swing around their base values on a shared
// sine, rather than sitting static — without ever touching the geometry, so
// the silhouette stays perfectly smooth (see _buildCoreRevealRecipe's doc
// comment). Deliberately doesn't touch opacity/transmission/emissive: those
// swing the shell's overall color/brightness, which read as a jarring pulse
// rather than a "breath." Roughness/ior instead just changes how the core
// landmark looks *through* the glass — crystal-clear and precisely refracted
// at one extreme, soft and frosted at the other — so the shell itself never
// changes color, only the clarity of what's inside it. The amplitudes below
// are large enough that the clear/frosted swing is unmistakable at a glance;
// tune down only if it starts to feel busy, not because it feels invisible.
const SHELL_BREATH_SPEED = 1.0; // radians/sec — a full cycle every ~6.3s
const SHELL_OPACITY = 0.14; // fixed — no longer part of the breathing
const SHELL_TRANSMISSION = 0.92; // fixed — stays reliably see-through
const SHELL_ROUGHNESS_BASE = 0.3;
const SHELL_ROUGHNESS_AMPLITUDE = 0.28; // swings ~0.02 (crystal) to ~0.58 (frosted)
const SHELL_IOR_BASE = 1.45;
const SHELL_IOR_AMPLITUDE = 0.12; // swings ~1.33 (water-like) to ~1.57 (dense glass) — the core's refracted image subtly shifts in sync with the frosting, reinforcing that it's the same motion, not two unrelated effects

/**
 * Builds/positions every non-cluster planet body (i.e. everything except
 * Earth, which ZoneLoader/Globe still own). Most bodies still use the
 * 'placeholder' render recipe (a flat-shaded icosphere); bespoke recipes like
 * 'grid' (CS), 'model' (about-me), and 'coreReveal' (Shrine, see below) are
 * filled in per-planet as each one earns its own look.
 *
 * 'model' loads a single .obj+palette as the body itself (same asset
 * convention as satellites/slot shapes) and mounts asynchronously — the body
 * starts as an empty group so mounting the rest of the solar system doesn't
 * wait on it, then the real mesh pops in once its .obj/texture land (see
 * _loadModelRecipe). It can also carry `attachments`: other .obj+palette
 * models mounted as fixed children of the main model — unlike satellites,
 * these don't orbit; they're for compositing one static model onto another
 * (e.g. the "about-me" ship's pilot sitting on its wing). Position an
 * attachment in the *parent model's own vertex-space units* (i.e. as
 * authored/exported, before either model's `scale` is applied) — the parent
 * transform hierarchy applies both models' scales to it automatically. A
 * body's top-level `solarOrbit` config (`{radius, periodSec}`, sibling to
 * `orbit`) opts it into circling the sun at that radius/period instead of
 * sitting still at its own orbit slot — see startSolarOrbit()/
 * pauseSolarOrbit()/resumeSolarOrbit(). Every attachment rides along for
 * free since they're the model's children, so the orbit moves the whole
 * composited object as one.
 *
 * Any body can additionally carry landmarks of kind 'satellite' — small
 * orbiting .obj+palette objects (same asset convention as ZoneLoader's
 * country shapes) mounted alongside the body's core recipe rather than
 * replacing it (see universe.js's getLandmarks). A satellite with no `model`
 * yet falls back to a flat-shaded primitive from `placeholder.shape`
 * (_buildPlaceholderSatellite) — the same "placeholder pending real art"
 * convention used elsewhere, so content can ship before the asset does.
 * Satellites freeze as soon as
 * one is picked (flying toward it, or focused on it) so the fly-tween has a
 * stable target and the focus panel's content isn't fighting a moving
 * object — `pauseSatellites`/`resumeSatellites` pause/resume every satellite
 * of a body at once (see main.js's FLYING_TO_LANDMARK/BODY_ORBITING handling),
 * resuming only once the camera is back to freely orbiting the body.
 *
 * 'coreReveal' (e.g. Shrine) is the opposite trade-off from satellites: one
 * smooth, see-through sphere always rendered, holding landmarks of kind
 * 'core' that are never all mounted at once — only whichever one is
 * currently picked/cycled to sits inside it (see mountCoreLandmark()),
 * swapped out on the next pick/cycle rather than orbiting alongside five
 * others. No camera movement is needed to focus one (it's already centered
 * in view), so main.js's FLYING_TO_LANDMARK handling short-circuits straight
 * to 'camera:flyToComplete' for this kind instead of tweening. Its shell's
 * own glass material breathes (roughness/ior swinging on a shared sine, see
 * update()) to keep it feeling alive without ever deforming its silhouette
 * or shifting its color.
 */
export class PlanetLoader {
    constructor(parent, bodies) {
        this.parent = parent;
        this.bodies = bodies;
        /** @type {Map<string, THREE.Group>} bodyId -> mounted group */
        this.mounted = new Map();
        /** @type {Map<string, THREE.Vector3>} bodyId -> world position */
        this.worldPositions = new Map();
        /** @type {Map<string, THREE.Group>} bodyId -> that planet's hover outline */
        this.outlines = new Map();
        /** @type {Map<string, Array<{id: ?string, pivot: THREE.Group, model: THREE.Object3D, anchor: THREE.Object3D, boundingRadius: number}>>} bodyId -> its satellites */
        this.satellitePivots = new Map();
        /** @type {Map<string, {group: THREE.Group, radius: number, angularSpeed: number, angle: number}>} bodyId -> its solar-orbit state (see startSolarOrbit()). */
        this.solarOrbits = new Map();
        /** @type {Set<string>} bodyIds whose satellites are currently paused — see pauseSatellites(). */
        this.pausedBodies = new Set();
        /** @type {Set<string>} bodyIds whose solar orbit is currently paused — see pauseSolarOrbit(). */
        this.pausedSolarOrbits = new Set();
        /** @type {Map<string, THREE.Group>} bodyId -> its 'coreReveal' sphere's content group (see mountCoreLandmark()). */
        this.coreContentGroups = new Map();
        /** @type {Map<string, string>} bodyId -> the 'core'-kind landmark id currently mounted inside its coreReveal sphere. */
        this.coreLandmarkIds = new Map();
        /** @type {Map<string, THREE.MeshPhysicalMaterial>} bodyId -> its 'coreReveal' sphere's own glass material (see update()'s breathing animation). */
        this.coreShellMaterials = new Map();
        /** @type {Map<string, number>} bodyId -> elapsed seconds driving every 'coreReveal' body's shell-breathing animation. */
        this.coreTime = new Map();
        this.hoveredBodyId = null;
    }

    /** @returns the currently mounted THREE.Object3D per body (for raycasting). */
    getPickableObjects() {
        return Array.from(this.mounted.values());
    }

    /** The world-space position a given body was placed at (see orbitCoords.js). */
    getWorldPosition(bodyId) {
        return this.worldPositions.get(bodyId);
    }

    /** Shows the hover outline for `bodyId` (or hides all outlines if null). */
    setHovered(bodyId) {
        if (bodyId === this.hoveredBodyId) return;
        const prevOutline = this.outlines.get(this.hoveredBodyId);
        if (prevOutline) prevOutline.visible = false;
        this.hoveredBodyId = bodyId;
        const nextOutline = this.outlines.get(bodyId);
        if (nextOutline) nextOutline.visible = true;
    }

    /** Builds every body's group with no transition — used on initial load. */
    loadAll() {
        for (const body of this.bodies) {
            this._mount(body);
        }
    }

    /** Advances every body's satellite orbits (except any currently paused — see pauseSatellites) and every active solar orbit (except any currently paused — see pauseSolarOrbit), plus every 'coreReveal' body's shell-breathing animation. Called once per rendered frame from main.js. */
    update(dt) {
        for (const [bodyId, satellites] of this.satellitePivots) {
            if (this.pausedBodies.has(bodyId)) continue;
            for (const { pivot } of satellites) {
                pivot.rotation.y += pivot.userData.orbitSpeed * dt;
            }
        }
        for (const [bodyId, orbit] of this.solarOrbits) {
            if (this.pausedSolarOrbits.has(bodyId)) continue;
            orbit.angle += orbit.angularSpeed * dt;
            const position = new THREE.Vector3(
                orbit.radius * Math.cos(orbit.angle),
                0,
                orbit.radius * Math.sin(orbit.angle)
            );
            orbit.group.position.copy(position);
            // lookAt() points the group's local -Z at the target — this
            // model's nose sits on local -Z (the usual convention), so the
            // target is a point *ahead* along the circle's tangent at this
            // angle. Leaves recipe.rotationY (and the rider attached to it)
            // untouched.
            const tangent = new THREE.Vector3(-Math.sin(orbit.angle), 0, Math.cos(orbit.angle));
            orbit.group.lookAt(position.clone().add(tangent));
            this.worldPositions.set(bodyId, position.clone());
        }
        for (const [bodyId, elapsed] of this.coreTime) {
            const time = elapsed + dt;
            this.coreTime.set(bodyId, time);

            const shellMaterial = this.coreShellMaterials.get(bodyId);
            if (shellMaterial) {
                const wave = Math.sin(time * SHELL_BREATH_SPEED);
                shellMaterial.roughness = SHELL_ROUGHNESS_BASE + wave * SHELL_ROUGHNESS_AMPLITUDE;
                // ior rides the same wave in phase with roughness, not
                // independently — so the core's refracted image warps at the
                // exact moment the glass frosts/clears, reading as one
                // continuous motion rather than two coincidental ones.
                shellMaterial.ior = SHELL_IOR_BASE + wave * SHELL_IOR_AMPLITUDE;
            }
        }
    }

    /**
     * Circles `bodyId`'s already-mounted group around the sun at `radius`,
     * completing one full revolution every `periodSec` — starting from its
     * own `orbit.phaseDeg` so it doesn't jump on the first frame. Call after
     * loadAll() has mounted the body. No-ops if `bodyId` isn't mounted.
     */
    startSolarOrbit(bodyId, radius, periodSec) {
        const group = this.mounted.get(bodyId);
        if (!group) return;
        const bodyDef = this.bodies.find((b) => b.id === bodyId);
        this.solarOrbits.set(bodyId, {
            group,
            radius,
            angularSpeed: (2 * Math.PI) / periodSec,
            angle: THREE.MathUtils.degToRad(bodyDef?.orbit?.phaseDeg ?? 0)
        });
    }

    /** Freezes `bodyId`'s solar orbit in place — used while the camera is flying to or orbiting it, so the fly-tween/orbit frame isn't chasing a moving target. No-ops safely for bodies with no solar orbit. */
    pauseSolarOrbit(bodyId) {
        this.pausedSolarOrbits.add(bodyId);
    }

    /** Resumes `bodyId`'s solar orbit — called once the camera is fully back to free solar orbit. No-ops safely for bodies with no solar orbit. */
    resumeSolarOrbit(bodyId) {
        this.pausedSolarOrbits.delete(bodyId);
    }

    /** Pauses every satellite of `bodyId` at once — used from the moment one is picked (flying toward it, or focused) until free orbit resumes. No-ops safely for bodies with no satellites. */
    pauseSatellites(bodyId) {
        this.pausedBodies.add(bodyId);
    }

    /** Resumes every satellite of `bodyId` — called on returning to free orbit of the body. No-ops safely for bodies with no satellites. */
    resumeSatellites(bodyId) {
        this.pausedBodies.delete(bodyId);
    }

    /** @returns the world-space position of one of `bodyId`'s satellites (by satellite id), centered on its real bounding-box middle rather than the model's raw (base-anchored) origin — or null if not yet loaded. */
    getSatelliteWorldPosition(bodyId, satelliteId) {
        const entry = this.satellitePivots.get(bodyId)?.find((s) => s.id === satelliteId);
        if (!entry) return null;
        return entry.anchor.getWorldPosition(new THREE.Vector3());
    }

    /** @returns the bounding-sphere radius of one of `bodyId`'s satellites (by satellite id), or null if not yet loaded — lets flyToSatellite's framing distance scale with each satellite's real rendered size (see CameraRig.framingDistanceFor). */
    getSatelliteBoundingRadius(bodyId, satelliteId) {
        const entry = this.satellitePivots.get(bodyId)?.find((s) => s.id === satelliteId);
        return entry ? entry.boundingRadius : null;
    }

    /**
     * Swaps `bodyId`'s 'coreReveal' sphere to show only `landmark` (a
     * 'core'-kind landmark descriptor) — clearing out whatever was mounted
     * before, so the sphere's interior only ever holds one object's model at
     * a time. No-ops if `bodyId` has no coreReveal sphere, or if `landmark`
     * is already the one mounted. Fire-and-forget like _mountSatellites:
     * the previous model is removed immediately, the new one pops in once
     * its .obj/texture land. `camera` (optional) sets the model's initial
     * facing toward wherever it is at that moment — see the facing comment
     * below; omit it to skip facing (leaves the asset's own authored
     * orientation).
     */
    async mountCoreLandmark(bodyId, landmark, camera) {
        const contentGroup = this.coreContentGroups.get(bodyId);
        if (!contentGroup) return;
        if (this.coreLandmarkIds.get(bodyId) === landmark.id) return;
        this.coreLandmarkIds.set(bodyId, landmark.id);

        for (const child of [...contentGroup.children]) contentGroup.remove(child);

        try {
            const model = landmark.model
                ? await loadOBJ(landmark.model, landmark.palette)
                : this._buildPlaceholderSatellite(landmark);
            // The user may have already cycled to a different landmark by
            // the time this resolves — don't let a stale load land after a
            // newer pick.
            if (this.coreLandmarkIds.get(bodyId) !== landmark.id) return;

            model.scale.setScalar(landmark.scale ?? 1);
            // A one-time facing set here, not the continuous per-frame
            // tracking an earlier pass tried — Shrine's whole point is a
            // free orbit the user can sweep around to see every side, and
            // an object that keeps swiveling to stay face-on defeats that
            // (may as well be a flat image). So this only fires once, right
            // as the landmark first mounts: aim local -Z at the camera's
            // position *relative to the sphere's own world location* (not
            // world origin — Shrine sits well off-center) while the model
            // is still unparented at local (0,0,0), so lookAt's target
            // vector doubles as that relative direction directly.
            // `facingOffsetDeg` then twists further from that initial aim
            // for an asset whose own "front" isn't what should greet the
            // camera — the sailboat wants its bow pointed out, not its
            // broadside.
            if (camera) {
                const bodyWorldPosition = this.worldPositions.get(bodyId);
                model.lookAt(camera.position.clone().sub(bodyWorldPosition));
            }
            const facingOffsetRad = THREE.MathUtils.degToRad(landmark.facingOffsetDeg ?? 0);
            if (facingOffsetRad) model.rotateY(facingOffsetRad);
            // Unlike _mountSatellites' anchor (see _vertexCentroid's doc
            // comment), this actually moves the model itself, not just an
            // invisible look-at target — so it needs the bounding box's
            // midpoint, not the mass-weighted vertex centroid. The centroid
            // is deliberately biased toward a model's denser end (e.g. a
            // boat's hull over its mast), which is correct for "what should
            // the camera look at" but leaves the object visibly off-center
            // inside the sphere. Computed after facing so it reflects the
            // model's final rotated footprint.
            const box = new THREE.Box3().setFromObject(model);
            model.position.sub(box.getCenter(new THREE.Vector3()));
            contentGroup.add(model);
        } catch (err) {
            console.warn(`PlanetLoader: failed to load core landmark "${landmark.model ?? landmark.id}", skipping.`, err);
        }
    }

    _mount(body) {
        const group = new THREE.Group();
        const position = orbitToVector3(body.orbit.radius, body.orbit.phaseDeg);
        group.position.copy(position);
        group.userData.bodyId = body.id;

        const base = this._buildRecipe(body.renderRecipe);
        group.add(base);

        if (body.renderRecipe.type === 'coreReveal') {
            this.coreContentGroups.set(body.id, base.userData.contentGroup);
            this.coreShellMaterials.set(body.id, base.userData.shellMaterial);
            this.coreTime.set(body.id, 0);
        }

        const outline = this._buildHoverOutline(base);
        group.add(outline);
        this.outlines.set(body.id, outline);

        this.parent.add(group);
        this.mounted.set(body.id, group);
        this.worldPositions.set(body.id, position.clone());

        // Same fire-and-forget as satellites below: a 'model' recipe starts
        // as the empty group _buildRecipe just handed back, then pops in
        // once its .obj/texture (and any attachments') land.
        if (body.renderRecipe.type === 'model') this._loadModelRecipe(body.renderRecipe, base, group, body.id);

        // Fire-and-forget: satellites pop in once their .obj/texture land,
        // same as ZoneLoader's shapes, without holding up the rest of the
        // solar system's initial mount.
        const satellites = (body.landmarks ?? []).filter((l) => l.kind === 'satellite');
        if (satellites.length) this._mountSatellites(body, satellites, group);
    }

    // Decorative-by-default orbiting objects (see class doc) — each gets its
    // own pivot group so its orbit is a simple per-frame Y rotation rather
    // than recomputed trig every update(); the model itself is just offset
    // along local +X from that pivot. No independent *pick* target (a
    // raycast hit on one still climbs to the body's own group and picks the
    // planet) — satellites are reachable only through the Flywheel, not
    // by clicking the object directly, since raycasting a small fast-moving
    // orbiting shape is unreliable compared to Earth's stationary islands.
    //
    // Collision note: inclination (pivot.rotation.x) is applied on top of
    // the orbit angle (pivot.rotation.y), and a rotation about X leaves
    // points on the X axis fixed — so every satellite's path passes through
    // the same two points, (±orbitRadius, 0, 0) in the body's local space,
    // regardless of inclinationDeg. Two satellites of the same body sharing
    // an orbitRadius will cross there once per revolution; whether they're
    // ever there at the same time depends on relative phase. Give all of a
    // body's satellites the same orbitSpeed (so that relative phase never
    // drifts) and keep every pairwise phaseDeg difference off a multiple of
    // 180° (the one gap that lines up their visits to that shared point) —
    // together those guarantee they never collide there, permanently. Don't
    // give satellites of the same body different orbitSpeed values unless
    // you've deliberately re-derived this.
    async _mountSatellites(body, satellites, group) {
        for (const satellite of satellites) {
            try {
                const model = satellite.model
                    ? await loadOBJ(satellite.model, satellite.palette)
                    : this._buildPlaceholderSatellite(satellite);
                model.scale.setScalar(satellite.scale ?? 1);
                // Faces the model's front (assumed -Z, the common Blender/
                // three.js export convention) toward local +X — i.e. away
                // from the pivot origin, which is also away from the planet,
                // since the model sits purely along the pivot's local +X.
                // Static relative to the pivot, so it holds through the
                // whole orbit, not just while focused. `facingOffsetDeg`
                // corrects for individual assets not authored with a -Z
                // front — tune per-satellite in universe.json if one looks
                // off in-browser.
                model.rotation.y = -Math.PI / 2 + THREE.MathUtils.degToRad(satellite.facingOffsetDeg ?? 0);

                // The .obj source assets aren't authored around their own
                // visual center — model.getWorldPosition() reports wherever
                // the file's own origin sits, which for these assets is down
                // near the base, not the middle. An invisible child anchored
                // at the model's real center gives flyToLandmark() something
                // to actually look at that's centered on the object. Computed
                // here, before model.position.x is set below, so the anchor's
                // local position only reflects scale/facing rotation, not the
                // orbit-radius offset — anchor is a child of model, so it
                // automatically inherits that offset once, through the
                // transform hierarchy, when placed afterward. Computing it
                // after the offset was set previously baked the offset into
                // the anchor's local position, then re-applied it a second
                // time via the parent-child transform, landing the anchor on
                // the wrong side of the pivot entirely.
                //
                // The center itself is a vertex centroid, not the bounding
                // box's midpoint — a box's midpoint sits exactly between its
                // extremes, so a sparse tall feature (an antenna, a strap)
                // pulls it toward that extreme even though the object's real
                // visual bulk sits elsewhere (usually a denser base). That's
                // what left objects looking a little low when centered on
                // the box's midpoint: the look point sat higher than the
                // object's actual mass, hanging the bulk of it below center.
                // Averaging every vertex instead weights the center toward
                // wherever the mesh is actually dense, tracking the object's
                // real visual middle far better for these uneven,
                // hand-modeled assets.
                const box = new THREE.Box3().setFromObject(model);
                const anchor = new THREE.Object3D();
                anchor.position.copy(this._vertexCentroid(model));
                model.add(anchor);
                const boundingRadius = box.getBoundingSphere(new THREE.Sphere()).radius;

                model.position.x = satellite.orbitRadius ?? (body.renderRecipe.radius ?? 4) * 1.5;

                const pivot = new THREE.Group();
                const inclination = THREE.MathUtils.degToRad(satellite.inclinationDeg ?? 0);
                pivot.rotation.x = inclination;
                pivot.rotation.y = THREE.MathUtils.degToRad(satellite.phaseDeg ?? 0);
                pivot.userData.orbitSpeed = satellite.orbitSpeed ?? 0.15;
                pivot.add(model);

                group.add(pivot);
                const satellites = this.satellitePivots.get(body.id) ?? [];
                satellites.push({ id: satellite.id ?? null, pivot, model, anchor, boundingRadius });
                this.satellitePivots.set(body.id, satellites);
            } catch (err) {
                console.warn(`PlanetLoader: failed to load satellite "${satellite.model ?? satellite.id}", skipping.`, err);
            }
        }
    }

    // Stand-in for satellites without a hand-modeled .obj yet — a single
    // flat-shaded primitive keyed off `placeholder.shape`, the same
    // "placeholder pending real art" convention as the top-level
    // 'placeholder' render recipe (_buildRecipe). Swapping in a real
    // model/palette later needs no other change: _mountSatellites already
    // prefers `satellite.model` whenever it's present.
    _buildPlaceholderSatellite(satellite) {
        const radius = satellite.placeholder?.radius ?? 0.65;
        const color = satellite.accent ?? '#888888';
        const geometry = this._placeholderGeometry(satellite.placeholder?.shape, radius);
        geometry.computeVertexNormals();
        return new THREE.Mesh(geometry, standardMaterialFlat(color));
    }

    _placeholderGeometry(shape, radius) {
        switch (shape) {
            case 'box': return new THREE.BoxGeometry(radius * 1.5, radius * 1.5, radius * 1.5);
            case 'tetrahedron': return new THREE.TetrahedronGeometry(radius, 0);
            case 'octahedron': return new THREE.OctahedronGeometry(radius, 0);
            case 'cone': return new THREE.ConeGeometry(radius, radius * 1.8, 8);
            case 'torus': return new THREE.TorusGeometry(radius, radius * 0.4, 8, 20);
            default: return new THREE.IcosahedronGeometry(radius, 0);
        }
    }

    // Averages every rendered vertex of `object` (world-space, so scale/
    // rotation already-applied ones as set at call time) into a single
    // center point — see the long comment at its one call site in
    // _mountSatellites for why this tracks an object's real visual middle
    // better than a bounding box's midpoint.
    _vertexCentroid(object) {
        const centroid = new THREE.Vector3();
        const vertex = new THREE.Vector3();
        let vertexCount = 0;
        object.updateWorldMatrix(true, false);
        object.traverse((child) => {
            if (!child.isMesh) return;
            const position = child.geometry.attributes.position;
            for (let i = 0; i < position.count; i++) {
                vertex.fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld);
                centroid.add(vertex);
                vertexCount++;
            }
        });
        return vertexCount ? centroid.divideScalar(vertexCount) : centroid;
    }

    _buildRecipe(recipe) {
        if (recipe.type === 'grid') {
            return this._buildGridRecipe(recipe);
        }
        if (recipe.type === 'model') {
            // Populated by _loadModelRecipe once its .obj/texture resolve —
            // see the class doc comment.
            return new THREE.Group();
        }
        if (recipe.type === 'coreReveal') {
            return this._buildCoreRevealRecipe(recipe);
        }
        const radius = recipe.radius ?? 2;
        const color = recipe.palette?.core ?? '#888888';
        // Same faceted-icosphere approach as Globe/Sun — the shared fallback
        // for any body that hasn't earned a bespoke recipe yet.
        const geometry = new THREE.IcosahedronGeometry(radius, 1);
        geometry.computeVertexNormals();
        return new THREE.Mesh(geometry, standardMaterialFlat(color));
    }

    // Tron Legacy's Grid, reinterpreted: a dark core with the same facets
    // pulled out into a glowing geodesic wireframe. First bespoke per-planet
    // recipe (CS) — everything else still falls through to the flat-shaded
    // placeholder above.
    _buildGridRecipe(recipe) {
        const radius = recipe.radius ?? 2;
        const coreColor = recipe.palette?.core ?? '#1c2b2e';
        const accentColor = recipe.palette?.accent ?? '#6ad1c4';
        const group = new THREE.Group();

        const coreGeometry = new THREE.IcosahedronGeometry(radius, 1);
        coreGeometry.computeVertexNormals();
        group.add(new THREE.Mesh(coreGeometry, standardMaterialFlat(coreColor)));

        // Pulled out fractionally so the lines don't z-fight the core mesh
        // underneath. Unlit + on the bloom layer, same as the grid-line
        // accents elsewhere in the kit — this is where the "glow" lives, not
        // in the core material.
        const wireGeometry = new THREE.EdgesGeometry(coreGeometry);
        const wireMaterial = new THREE.LineBasicMaterial({ color: accentColor, toneMapped: false });
        const wireframe = new THREE.LineSegments(wireGeometry, wireMaterial);
        wireframe.scale.setScalar(1.01);
        wireframe.layers.enable(BLOOM_LAYER);
        group.add(wireframe);

        return group;
    }

    // A smooth, unfaceted, fully see-through sphere — deliberately the
    // opposite geometry from every other recipe's faceted icosphere, so it
    // reads as "container" rather than "planet." Holds an empty inner
    // `contentGroup` at its exact center for mountCoreLandmark() to populate
    // one landmark's model into at a time — never built here, since nothing
    // is shown until the first pick/cycle.
    _buildCoreRevealRecipe(recipe) {
        const radius = recipe.radius ?? 4;
        const group = new THREE.Group();

        const geometry = new THREE.SphereGeometry(radius, 48, 32);
        const material = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: SHELL_OPACITY,
            roughness: SHELL_ROUGHNESS_BASE,
            transmission: SHELL_TRANSMISSION,
            ior: SHELL_IOR_BASE,
            thickness: radius,
            side: THREE.DoubleSide,
            depthWrite: false,
            emissive: new THREE.Color(recipe.palette?.accent ?? '#ffffff'),
            emissiveIntensity: 0
        });
        group.add(new THREE.Mesh(geometry, material));
        group.userData.shellMaterial = material;

        const contentGroup = new THREE.Group();
        group.add(contentGroup);
        group.userData.contentGroup = contentGroup;

        return group;
    }

    // Loads a 'model' recipe's own .obj+palette into `container` (the empty
    // group _buildRecipe handed back), plus any static `attachments` mounted
    // as children of that model rather than the container — attaching to the
    // model itself (not container) means an attachment's position/rotation
    // ride along with the model's own scale/rotationY for free, so authoring
    // an attachment's position in the model's raw vertex-space units (see
    // class doc) stays correct no matter what `recipe.scale` ends up being.
    // Rebuilds the hover outline against the real loaded geometry once done,
    // since the one built at mount time only had `container`'s empty shell
    // to clone (see _buildHoverOutline).
    async _loadModelRecipe(recipe, container, group, bodyId) {
        try {
            const model = await loadOBJ(recipe.model, recipe.palette);
            model.scale.setScalar(recipe.scale ?? 1);
            model.rotation.y = THREE.MathUtils.degToRad(recipe.rotationY ?? 0);
            container.add(model);

            for (const attachment of recipe.attachments ?? []) {
                const attachModel = await loadOBJ(attachment.model, attachment.palette);
                attachModel.scale.setScalar(attachment.scale ?? 1);
                attachModel.rotation.y = THREE.MathUtils.degToRad(attachment.rotationY ?? 0);
                attachModel.position.set(
                    attachment.position?.x ?? 0,
                    attachment.position?.y ?? 0,
                    attachment.position?.z ?? 0
                );
                model.add(attachModel);
            }

            const oldOutline = this.outlines.get(bodyId);
            const wasVisible = oldOutline?.visible ?? false;
            if (oldOutline) group.remove(oldOutline);
            const outline = this._buildHoverOutline(container);
            outline.visible = wasVisible;
            group.add(outline);
            this.outlines.set(bodyId, outline);
        } catch (err) {
            console.warn(`PlanetLoader: failed to load model recipe "${recipe.model}", skipping.`, err);
        }
    }

    // The "inflated backface hull" outline (see materials.js's
    // outlineMaterial doc comment): a deep clone of `base` — preserving its
    // whole transform hierarchy, so multi-mesh recipes (grid's core+
    // wireframe, a model's attachments) and their nested offsets come along
    // for free — with every mesh's material swapped to the shared unlit
    // white BackSide material and the whole clone scaled up a few percent.
    // Non-mesh renderables (the grid recipe's wireframe LineSegments) are
    // hidden rather than left with their original material, since they'd
    // otherwise double-render on top of the real wireframe. Kept invisible
    // until hovered. `base` can be empty (a 'model' recipe pre-load, see
    // _buildRecipe) — clone(true) on an empty group is just an empty group,
    // harmless until _loadModelRecipe rebuilds it for real.
    _buildHoverOutline(base, scaleFactor = 1.06) {
        const outline = base.clone(true);
        outline.traverse((child) => {
            if (child.isMesh) child.material = outlineMaterial();
            else if (child.geometry) child.visible = false;
        });
        outline.scale.multiplyScalar(scaleFactor);
        outline.visible = false;
        return outline;
    }
}
