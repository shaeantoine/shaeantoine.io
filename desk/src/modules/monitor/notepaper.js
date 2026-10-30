/**
 * MONITOR v4 — paper on the glass: the room's sticky stock, Shae's hand on it,
 * a drawn arrow for a thread, and the bent plane each note is built on.
 *
 * Every note is typed in Shae Hand, seeded by its stable id (so it always
 * wobbles the same way): the line, then on its own row a drawn arrow and
 * where it goes (the box's thread look).
 */

import { NOTES, MM } from './desktop.js';

/** The note's paper: stickyYellow, a little shade toward the free end, a hairline edge, tooth. */
export function paintStickyPaper(g, w, h, seed, kit) {
    const { palette, draw } = kit;
    g.save();
    g.fillStyle = palette.stickyYellow;
    g.fillRect(0, 0, w, h);
    const shade = g.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, 'rgba(255, 250, 220, 0.10)');
    shade.addColorStop(0.3, 'rgba(0, 0, 0, 0)');
    shade.addColorStop(1, 'rgba(120, 90, 0, 0.12)');
    g.fillStyle = shade;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120, 95, 20, 0.18)';
    g.lineWidth = 0.35;
    g.strokeRect(0.2, 0.2, w - 0.4, h - 0.4);
    g.restore();
    draw?.grain?.(g, w, h, { seed: `monitor:${seed}`, amount: 0.035 });
}

/** A hand-drawn arrow, left to right, (x, y) its tail, all mm. Returns its tip. */
export function drawArrow(g, x, y, len, { color, width = 0.55, rise = -0.6, head = 2.4, jitter = 0 } = {}) {
    const x1 = x + len;
    const y1 = y + rise;
    g.save();
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.globalAlpha = 0.92;
    g.beginPath();
    g.moveTo(x, y + jitter);
    g.bezierCurveTo(x + len * 0.35, y - 0.9, x + len * 0.7, y1 + 0.7, x1, y1);
    g.stroke();
    const a = Math.atan2(-0.7, len * 0.3);
    g.beginPath();
    g.moveTo(x1 - head * Math.cos(a - 0.5), y1 - head * Math.sin(a - 0.5));
    g.lineTo(x1, y1);
    g.lineTo(x1 - head * Math.cos(a + 0.55), y1 - head * Math.sin(a + 0.55));
    g.stroke();
    g.restore();
    return { x1, y1 };
}

/** Shae Hand fitted into a box (never overflowing), top- or centre-aligned. */
export function handInBox(g, kit, value, { x, y, w, h, sizeMax, sizeMin = 3.4, valign = 'top', seed, slant = 0 }) {
    const fit = kit.fitHandwriting(g, value, { maxWidth: w * 0.965, maxHeight: h * 0.97, weight: 600, sizeMax, sizeMin });
    const blockH = fit.lines.length * fit.size * fit.lineHeight;
    const top = valign === 'middle' ? y + (h - blockH) / 2 : y;
    kit.drawHandwriting(g, fit.lines.join('\n'), {
        x, y: top, size: fit.size, weight: 600, lineHeight: fit.lineHeight, color: kit.palette.ink, seed, slant, maxLines: fit.lines.length, label: seed
    });
    return { size: fit.size, fits: fit.fits, bottom: top + blockH };
}

/** "→ label" on one row: the drawn arrow, then the words. (x, y) the row's top-left, `size` the hand's em (mm). */
export function drawArrowRow(g, kit, { x, y, w, size, label, seed }) {
    const arrow = drawArrow(g, x + 1, y + size * 0.62, Math.min(13, w * 0.24), { color: kit.palette.ink, width: 0.5 });
    const words = handInBox(g, kit, label, { x: arrow.x1 + 2.2, y, w: x + w - arrow.x1 - 2.2, h: size * 1.12, sizeMax: size, seed: `${seed}-to`, slant: -0.01 });
    return { fits: words.fits, bottom: y + size * 1.12 };
}

/** A thread note: the line, then "→ label", in Shae Hand. Returns { fits, size }. */
export function paintThreadNote(g, kit, note, thread) {
    paintStickyPaper(g, note.w, note.h, note.id, kit);
    const rect = note.ink;
    const line = handInBox(g, kit, thread.line, { x: rect.x, y: rect.y, w: rect.w, h: rect.h * 0.74, sizeMax: 8.6, seed: `${note.id}-line`, slant: -0.01 });
    const size = Math.min(8.6, Math.max(6.2, line.size * 1.02));
    const rowTop = Math.min(line.bottom + 1.6, rect.y + rect.h - size * 1.12);
    const row = drawArrowRow(g, kit, { x: rect.x, y: rowTop, w: rect.w, size, label: thread.label, seed: note.id });
    return { fits: line.fits && row.fits, size: line.size };
}

/** A plain note: just the words (the trash's). Returns handInBox's { size, fits, bottom }. */
export function paintPlainNote(g, kit, note, value) {
    paintStickyPaper(g, note.w, note.h, note.id, kit);
    const rect = note.ink;
    return handInBox(g, kit, value, { ...rect, sizeMax: 9, valign: 'middle', seed: `${note.id}-line`, slant: -0.012 });
}

// ---------------------------------------------------------------------------
// The mesh
// ---------------------------------------------------------------------------

/**
 * A note on the glass: a plane, flat over its glued band at the top, curling
 * gently off the glass toward its free edge. Placed in PLANE space by the
 * caller. `hang` notes (the one under the chin) curl a little more: nothing
 * holds them but the glue.
 */
export function buildNoteMesh(THREE, { note, texture, stickyMaterial, lift, curl = 0.008 }) {
    const w = note.w * MM;
    const h = note.h * MM;
    const band = (note.band ?? 14) * MM;
    const geometry = new THREE.PlaneGeometry(w, h, 8, 10);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
        const y = position.getY(i);
        const fromTop = h / 2 - y;
        const t = fromTop <= band ? 0 : (fromTop - band) / (h - band);
        position.setZ(i, curl * Math.pow(t, 2.2));
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const front = new THREE.Mesh(geometry, stickyMaterial({ map: texture, light: 'monitor', lift }));
    const back = new THREE.Mesh(geometry, stickyMaterial({ light: 'monitor', lift: lift * 0.7, roughness: 0.9, side: THREE.BackSide }));
    for (const mesh of [front, back]) {
        mesh.castShadow = false;
        mesh.receiveShadow = true;
    }
    front.name = `monitor:note:${note.id}`;
    back.name = `monitor:note:${note.id}:back`;
    const group = new THREE.Group();
    group.name = `monitor:note:${note.id}:group`;
    group.add(front, back);
    return {
        group,
        front,
        dispose() {
            geometry.dispose();
            front.material.dispose();
            back.material.dispose();
        }
    };
}

export { NOTES };
