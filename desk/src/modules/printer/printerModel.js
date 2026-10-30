import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BODY, SLOT } from './spec.js';

/**
 * The printer's body: a compact 80 mm thermal receipt printer, from primitives.
 *
 * WARM OFF-WHITE, NOT CHARCOAL. The desk is black and so is the keyboard; a
 * charcoal printer would be a dark lump on a dark desk at 13% of the frame. An
 * off-white body reads as an object from the establishing shot, sits with the
 * paper and kraft of the rest of the room, and is a shade darker than the
 * receipt so the paper is always the brightest thing in its shot.
 *
 *   rubber plinth   dark, inset — the contact line with the desk
 *   body            one rounded box (8 mm radius), satin plastic
 *   lid seam        a groove down each flank where the clamshell lid would part
 *   paper window    smoked acrylic on the lid with the roll showing through it
 *                   (painted into the window's texture — no transparency, so
 *                   no sorting or GTAO artefacts)
 *   slot            a dark gap across the top, the paper comes out of it
 *   tear bar        serrated dark steel on the slot's front lip
 *   LED + button    status LED (green) front-left, feed button front-right
 *
 * Local frame: origin on the desk under the body's centre, front = +Z.
 */

export const COLORS = Object.freeze({
    body: '#dcd8cf',
    plinth: '#2a2927',
    seam: '#a8a398',
    slot: '#0d0d0d',
    steel: '#3a3c3f',
    button: '#cbc6bb',
    ledOn: '#4fe07a',
    ledLens: '#1d3a25',
    bezel: '#2b2b2b'
});

const H = BODY.height;

function mesh(geometry, material, { cast = true, receive = true } = {}) {
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = cast;
    m.receiveShadow = receive;
    return m;
}

/** The serrated tear bar as one extruded mesh: teeth along its rear edge, pointing at the paper. */
function tearBarGeometry() {
    const width = SLOT.width + 0.004;
    const depth = SLOT.tearBarDepth;
    const toothDepth = 0.0032;
    const teeth = SLOT.teeth;
    const pitch = width / teeth;
    // Shape in (x, y) with y = −z_local; extruded along +z, then turned so the
    // extrusion is height (+Y). See the rotation below.
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, -depth);
    shape.lineTo(-width / 2, -toothDepth);
    for (let k = 0; k < teeth; k += 1) {
        const x0 = -width / 2 + k * pitch;
        shape.lineTo(x0 + pitch / 2, 0);
        shape.lineTo(x0 + pitch, -toothDepth);
    }
    shape.lineTo(width / 2, -depth);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: SLOT.tearBarHeight, bevelEnabled: false, curveSegments: 1 });
    geometry.rotateX(-Math.PI / 2); // (x, y, e) → (x, e, −y): extrusion becomes +Y, shape y becomes −z
    return geometry;
}

/**
 * The paper window's face: smoked acrylic with the roll's crown showing
 * through it. Painted in window millimetres (60 × 31).
 */
function paintWindow(g, w, h) {
    g.fillStyle = '#141416';
    g.fillRect(0, 0, w, h);
    // The roll lies across the printer (axis along x). From above, its crown is
    // a lit band that falls off toward front and back.
    const band = g.createLinearGradient(0, 0, 0, h);
    band.addColorStop(0.00, 'rgba(236, 232, 222, 0.00)');
    band.addColorStop(0.18, 'rgba(236, 232, 222, 0.10)');
    band.addColorStop(0.46, 'rgba(236, 232, 222, 0.42)');
    band.addColorStop(0.58, 'rgba(236, 232, 222, 0.38)');
    band.addColorStop(0.86, 'rgba(236, 232, 222, 0.08)');
    band.addColorStop(1.00, 'rgba(236, 232, 222, 0.00)');
    g.fillStyle = band;
    g.fillRect(0, 0, w, h);
    // Faint winding lines on the roll's surface, and the smoke's own vignette.
    g.strokeStyle = 'rgba(20, 20, 22, 0.10)';
    g.lineWidth = 0.12;
    for (let y = h * 0.2; y < h * 0.85; y += 1.3) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y + 0.2);
        g.stroke();
    }
    const edge = g.createLinearGradient(0, 0, w, 0);
    edge.addColorStop(0, 'rgba(10, 10, 12, 0.55)');
    edge.addColorStop(0.12, 'rgba(10, 10, 12, 0)');
    edge.addColorStop(0.88, 'rgba(10, 10, 12, 0)');
    edge.addColorStop(1, 'rgba(10, 10, 12, 0.55)');
    g.fillStyle = edge;
    g.fillRect(0, 0, w, h);
}

/**
 * Builds the body into a group (local frame as above).
 * @param {object} ctx the module's ctx (for makeCanvas / canvasTexture)
 * @returns {{ group: THREE.Group, bodyMeshes: THREE.Mesh[], led: THREE.MeshStandardMaterial, dispose(): void }}
 */
export function buildPrinter(ctx) {
    const group = new THREE.Group();
    group.name = 'receipt-printer-body';
    const disposables = [];
    const track = (thing) => { disposables.push(thing); return thing; };

    const plastic = track(new THREE.MeshStandardMaterial({ color: COLORS.body, roughness: 0.5, metalness: 0 }));
    const rubber = track(new THREE.MeshStandardMaterial({ color: COLORS.plinth, roughness: 0.85, metalness: 0 }));
    const seam = track(new THREE.MeshStandardMaterial({ color: COLORS.seam, roughness: 0.7, metalness: 0 }));
    const slotMaterial = track(new THREE.MeshStandardMaterial({ color: COLORS.slot, roughness: 0.95, metalness: 0 }));
    const steel = track(new THREE.MeshStandardMaterial({ color: COLORS.steel, roughness: 0.42, metalness: 0.7 }));
    const button = track(new THREE.MeshStandardMaterial({ color: COLORS.button, roughness: 0.55, metalness: 0 }));
    const bezel = track(new THREE.MeshStandardMaterial({ color: COLORS.bezel, roughness: 0.6, metalness: 0 }));
    const led = track(new THREE.MeshStandardMaterial({
        color: COLORS.ledLens,
        emissive: COLORS.ledOn,
        emissiveIntensity: 1.3,
        roughness: 0.25,
        metalness: 0
    }));

    const bodyMeshes = [];

    // Plinth: 4 mm of dark rubber, inset 3 mm all round.
    const plinth = mesh(track(new RoundedBoxGeometry(BODY.width - 0.018, BODY.plinth + 0.004, BODY.depth - 0.018, 2, 0.005)), rubber);
    plinth.position.y = (BODY.plinth + 0.004) / 2;
    group.add(plinth);

    // Body.
    const bodyHeight = H - BODY.plinth + 0.002;
    const body = mesh(track(new RoundedBoxGeometry(BODY.width, bodyHeight, BODY.depth, 5, BODY.radius)), plastic);
    body.position.y = BODY.plinth - 0.002 + bodyHeight / 2;
    group.add(body);
    bodyMeshes.push(body, plinth);

    // Lid seams: a groove down each flank from the slot line, then back to the
    // rear — where a clamshell lid over the roll would part from the base.
    // Kept inside the flank's flat region (the rounded edges start BODY.radius in).
    const seamT = 0.0012;
    const unitBox = track(new THREE.BoxGeometry(1, 1, 1));
    const seamY = 0.19;
    for (const side of [-1, 1]) {
        const x = side * (BODY.width / 2 + 0.0002);
        const top = new THREE.Vector3(x, H - BODY.radius - 0.002, SLOT.z - 0.004);
        const low = new THREE.Vector3(x, seamY, SLOT.z - 0.085);
        const back = new THREE.Vector3(x, seamY, -BODY.depth / 2 + BODY.radius + 0.002);
        for (const [a, b] of [[top, low], [low, back]]) {
            const d = b.clone().sub(a);
            const piece = mesh(unitBox, seam, { cast: false });
            piece.position.copy(a).addScaledVector(d, 0.5);
            piece.lookAt(piece.position.clone().add(d)); // local +Z along the seam
            piece.scale.set(seamT, seamT, d.length() + seamT);
            group.add(piece);
        }
    }

    // Slot: a dark gap across the top. Proud by 0.6 mm so it never z-fights the lid.
    const slot = mesh(track(new THREE.BoxGeometry(SLOT.width, 0.02, SLOT.gap)), slotMaterial, { cast: false });
    slot.position.set(0, H - 0.01 + 0.0006, SLOT.z);
    group.add(slot);

    // Tear bar, on the slot's front lip.
    const tearBar = mesh(track(tearBarGeometry()), steel);
    tearBar.position.set(0, H, SLOT.z + SLOT.gap / 2 + 0.0004);
    group.add(tearBar);

    // Paper window: smoked acrylic on the lid, the roll's crown painted in.
    const WIN_W = 60;
    const WIN_D = 31;
    const windowCanvas = ctx.makeCanvas(WIN_W, WIN_D, { framing: [0.18, 0.1] });
    const windowTexture = track(ctx.canvasTexture(windowCanvas.canvas));
    ctx.fonts.paint(() => {
        windowCanvas.clear();
        paintWindow(windowCanvas.g, WIN_W, WIN_D);
        windowTexture.needsUpdate = true;
    });
    const glass = track(new THREE.MeshStandardMaterial({ map: windowTexture, roughness: 0.16, metalness: 0, envMapIntensity: 1.4 }));
    const winW = WIN_W * 0.0032;
    const winD = WIN_D * 0.0032;
    const windowMesh = mesh(track(new THREE.BoxGeometry(winW, 0.0012, winD)), [plastic, plastic, glass, plastic, plastic, plastic], { cast: false });
    windowMesh.position.set(0, H + 0.0002, -0.07);
    group.add(windowMesh);
    // A hairline frame round it.
    const frame = mesh(track(new THREE.BoxGeometry(winW + 0.006, 0.0008, winD + 0.006)), bezel, { cast: false });
    frame.position.set(0, H + 0.0001, -0.07);
    group.add(frame);

    // Status LED, front-left of the top, in a dark bezel.
    // Kept on the flat of the top: its rounded edges start BODY.radius in from each side.
    const ledX = -BODY.width / 2 + 0.036;
    const ledZ = BODY.depth / 2 - 0.037;
    const ring = mesh(track(new THREE.CylinderGeometry(0.0066, 0.0066, 0.0012, 24)), bezel, { cast: false });
    ring.position.set(ledX, H + 0.0004, ledZ);
    group.add(ring);
    const lens = mesh(track(new THREE.CylinderGeometry(0.0044, 0.0044, 0.0018, 20)), led, { cast: false });
    lens.position.set(ledX, H + 0.0008, ledZ);
    group.add(lens);

    // Feed button, front-right.
    const feed = mesh(track(new RoundedBoxGeometry(0.034, 0.005, 0.02, 2, 0.0022)), button);
    feed.position.set(BODY.width / 2 - 0.046, H + 0.0012, ledZ);
    group.add(feed);

    return {
        group,
        bodyMeshes,
        led,
        dispose() {
            for (const thing of disposables) thing.dispose?.();
        }
    };
}
