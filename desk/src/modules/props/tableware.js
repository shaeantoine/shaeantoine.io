import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MUG, COLORS, mm } from './layout.js';

/**
 * The dark matte mug (a latte in it, as on the real desk), left of the
 * display's foot. Built into its own desk group, object-local (origin on the
 * desk under its centre). Its steam is not a mesh: see steam.js.
 */

const LATHE_SEGMENTS = 40;

/** The mug: body (outside, rim, inside) and handle, one mesh; the latte on top. */
export function buildMug(group) {
    const r = MUG.radius;
    const h = MUG.height;
    const w = MUG.wall;
    const profile = [
        [0, 0], [r - mm(4), 0], [r - mm(1), mm(1.2)], [r, mm(4)],       // foot
        [r, h - mm(2)], [r - mm(0.6), h - mm(0.2)], [r - mm(1.6), h],    // outer wall, rolled rim
        [r - w + mm(1), h - mm(0.2)], [r - w, h - mm(2)],                // inner lip
        [r - w, MUG.base + mm(5)], [r - w - mm(4), MUG.base], [0, MUG.base] // inner wall, bowl
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const body = new THREE.LatheGeometry(profile, LATHE_SEGMENTS);

    // A D-shaped handle on local +X (the group's yaw aims it), joining the wall 25% and 87% of the way up.
    const handle = new THREE.TorusGeometry(MUG.handle.radius, MUG.handle.tube, 10, 20, Math.PI);
    handle.rotateZ(-Math.PI / 2);                         // the half-ring bulges toward +X
    handle.scale(1, 1.12, 1);                              // a touch taller than round
    handle.translate(r - mm(1.5), h * 0.56, 0);
    for (const g of [body, handle]) {
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    }
    const merged = mergeGeometries([body.toNonIndexed(), handle.toNonIndexed()], false);
    body.dispose();
    handle.dispose();

    const mug = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color: COLORS.mug, roughness: 0.82, metalness: 0 }));
    mug.name = 'mug:body';
    mug.castShadow = true;
    mug.receiveShadow = true;

    const latte = new THREE.Mesh(
        new THREE.CircleGeometry(r - w + mm(0.3), LATHE_SEGMENTS),
        new THREE.MeshStandardMaterial({ color: COLORS.latte, roughness: 0.72, metalness: 0 })
    );
    latte.name = 'mug:latte';
    latte.rotation.x = -Math.PI / 2;
    latte.position.y = MUG.fill;
    latte.receiveShadow = true;

    group.add(mug, latte);
    return { meshes: [mug, latte] };
}
