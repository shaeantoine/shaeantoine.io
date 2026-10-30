import { rng } from '../../core/rng.js';

/**
 * The triangulations page's live figure — ILLUSTRATIVE, not the paper's data
 * (the page says so). DOM-free, so node can check it.
 *
 * A triangulated disc grows one triangle at a time from a single triangle,
 * seeded (so every load grows the same mesh): wherever the boundary has a
 * corner sharper than EAR_ANGLE the corner is closed (a triangle, no new
 * vertex — the gap outside the disc there is closed); otherwise a new vertex is set out from the boundary edge nearest
 * the middle (a triangle and a vertex). Beside it, the ratio of vertices to
 * triangles as the count grows, falling toward the dashed bound line at ½ —
 * Euler's formula for a disc, V = 1 + (T + B)/2, so V/T → ½ as the boundary
 * B becomes small next to T.
 */

export const FIGURE_SEED = 'shae-triangulations-2024';
export const FIGURE_TRIANGLES = 120;
export const FIGURE_FPS = 10; // ≤ 12: one triangle per frame
const EAR_ANGLE = (78 * Math.PI) / 180;
const MIN_GAP = 0.62; // new vertices keep this far (edge lengths) from every other

function angleAt(points, prev, v, next) {
    const [px, py] = points[prev];
    const [vx, vy] = points[v];
    const [nx, ny] = points[next];
    const ax = nx - vx; const ay = ny - vy;
    const bx = px - vx; const by = py - vy;
    // Interior angle of a counter-clockwise boundary: from (next − v) round to (prev − v).
    let a = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
    if (a < 0) a += Math.PI * 2;
    return a;
}

/** @returns {{ points: number[][], tris: number[][], counts: { t: number, v: number }[], bounds }} */
export function growMesh({ seed = FIGURE_SEED, triangles = FIGURE_TRIANGLES } = {}) {
    const r = rng(seed);
    const points = [[0, 0], [1, 0], [0.5, Math.sqrt(3) / 2]];
    const tris = [[0, 1, 2]];
    const counts = [{ t: 1, v: 3 }];
    let boundary = [0, 1, 2]; // counter-clockwise
    let guard = 0;
    while (tris.length < triangles && guard < triangles * 20) {
        guard += 1;
        const n = boundary.length;
        // 1. Close the sharpest corner, if one is sharp enough.
        let sharpest = -1;
        let sharpAngle = Infinity;
        if (n > 3) {
            for (let i = 0; i < n; i += 1) {
                // The gap OUTSIDE the disc at this corner (the disc grows outward).
                const a = Math.PI * 2 - angleAt(points, boundary[(i - 1 + n) % n], boundary[i], boundary[(i + 1) % n]);
                if (a < sharpAngle) { sharpAngle = a; sharpest = i; }
            }
        }
        if (sharpest >= 0 && sharpAngle < EAR_ANGLE) {
            const prev = boundary[(sharpest - 1 + n) % n];
            const next = boundary[(sharpest + 1) % n];
            tris.push([prev, boundary[sharpest], next]);
            boundary = boundary.filter((_, i) => i !== sharpest);
            counts.push({ t: tris.length, v: points.length });
            continue;
        }
        // 2. Grow outward from the boundary edge nearest the centre of mass (with a seeded nudge).
        let cx = 0; let cy = 0;
        for (const [x, y] of points) { cx += x; cy += y; }
        cx /= points.length; cy /= points.length;
        const edges = [];
        for (let i = 0; i < n; i += 1) {
            const a = boundary[i];
            const b = boundary[(i + 1) % n];
            const mx = (points[a][0] + points[b][0]) / 2;
            const my = (points[a][1] + points[b][1]) / 2;
            edges.push({ i, a, b, score: Math.hypot(mx - cx, my - cy) + r() * 0.9 });
        }
        edges.sort((p, q) => p.score - q.score);
        let grown = false;
        for (const edge of edges) {
            const [ax, ay] = points[edge.a];
            const [bx, by] = points[edge.b];
            const dx = bx - ax; const dy = by - ay;
            const len = Math.hypot(dx, dy);
            // Outward = to the right of a counter-clockwise edge.
            const ox = dy / len; const oy = -dx / len;
            const h = (Math.sqrt(3) / 2) * len * (0.86 + r() * 0.24);
            const along = 0.5 + r.signed(0.14);
            const c = [ax + dx * along + ox * h, ay + dy * along + oy * h];
            const unit = Math.max(0.6, len);
            const clear = points.every((p, k) => k === edge.a || k === edge.b || Math.hypot(p[0] - c[0], p[1] - c[1]) > MIN_GAP * unit);
            if (!clear) continue;
            points.push(c);
            const k = points.length - 1;
            tris.push([edge.a, k, edge.b]);
            boundary.splice(edge.i + 1, 0, k);
            counts.push({ t: tris.length, v: points.length });
            grown = true;
            break;
        }
        if (!grown) break;
    }
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    for (const [x, y] of points) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    return { points, tris, counts, bounds: { minX, maxX, minY, maxY } };
}

/** Where the figure's parts sit in its own canvas (mm; the canvas is FIGURE_MM). */
export const FIGURE_MM = Object.freeze({ w: 170, h: 82 });
export const FIGURE_LAYOUT = Object.freeze({
    mesh: Object.freeze({ x: 2, y: 2, w: 78, h: 76 }),
    plot: Object.freeze({ x: 100, y: 10, w: 66, h: 56 }), // the axes' box (y axis at x, x axis at y + h)
    ratio: Object.freeze({ min: 0.4, max: 1.3 })
});

/** Plot coordinates for (t, ratio). */
export function plotPoint(t, ratio, triangles = FIGURE_TRIANGLES) {
    const { plot, ratio: range } = FIGURE_LAYOUT;
    const x = plot.x + (t / triangles) * plot.w;
    const clamped = Math.max(range.min, Math.min(range.max, ratio));
    const y = plot.y + plot.h - ((clamped - range.min) / (range.max - range.min)) * plot.h;
    return [x, y];
}

/**
 * The static part of the figure (drawn once on the page itself): the axes in
 * pencil and the dashed bound line. `g` is in page mm, offset to (ox, oy).
 */
export function drawFigureAxes(g, ox, oy, { pencil, ink }) {
    const { plot } = FIGURE_LAYOUT;
    g.save();
    g.translate(ox, oy);
    g.lineCap = 'round';
    g.strokeStyle = pencil;
    g.globalAlpha = 0.85;
    g.lineWidth = 0.32;
    g.beginPath();
    // A hand-drawn pair of axes: a hair of wobble, overshooting the corner a little.
    g.moveTo(plot.x + 0.2, plot.y - 3);
    g.quadraticCurveTo(plot.x - 0.25, plot.y + plot.h * 0.5, plot.x, plot.y + plot.h + 1.2);
    g.moveTo(plot.x - 1.2, plot.y + plot.h);
    g.quadraticCurveTo(plot.x + plot.w * 0.5, plot.y + plot.h + 0.3, plot.x + plot.w + 2, plot.y + plot.h - 0.2);
    g.stroke();
    // The bound: ratio ½, dashed.
    const [, by] = plotPoint(0, 0.5);
    g.setLineDash([1.6, 1.2]);
    g.strokeStyle = ink;
    g.globalAlpha = 0.55;
    g.lineWidth = 0.3;
    g.beginPath();
    g.moveTo(plot.x + 0.5, by);
    g.lineTo(plot.x + plot.w, by);
    g.stroke();
    g.restore();
    return { boundY: by };
}

/**
 * The live part (the overlay canvas, transparent): the mesh up to `shown`
 * triangles, the newest one tinted, and the ratio curve up to the same count
 * with a dot at its head. `g` is in figure mm.
 */
export function drawFigureLive(g, mesh, shown, { ink, red }) {
    const { mesh: box } = FIGURE_LAYOUT;
    const { minX, maxX, minY, maxY } = mesh.bounds;
    const s = Math.min(box.w / (maxX - minX), box.h / (maxY - minY)) * 0.96;
    const ox = box.x + (box.w - (maxX - minX) * s) / 2;
    const oy = box.y + (box.h - (maxY - minY) * s) / 2;
    const P = (k) => [ox + (mesh.points[k][0] - minX) * s, oy + (maxY - mesh.points[k][1]) * s];
    const n = Math.max(1, Math.min(shown, mesh.tris.length));
    g.save();
    g.lineJoin = 'round';
    g.lineCap = 'round';
    // The newest triangle, washed in red pen.
    const [a, b, c] = mesh.tris[n - 1].map(P);
    g.fillStyle = red;
    g.globalAlpha = 0.22;
    g.beginPath();
    g.moveTo(...a); g.lineTo(...b); g.lineTo(...c); g.closePath();
    g.fill();
    // Every edge so far, in ink.
    g.globalAlpha = 0.82;
    g.strokeStyle = ink;
    g.lineWidth = 0.26;
    g.beginPath();
    for (let i = 0; i < n; i += 1) {
        const [p, q, r] = mesh.tris[i].map(P);
        g.moveTo(...p); g.lineTo(...q); g.lineTo(...r); g.closePath();
    }
    g.stroke();
    // The curve: vertices ÷ triangles against triangles.
    g.globalAlpha = 0.9;
    g.lineWidth = 0.34;
    g.beginPath();
    for (let i = 0; i < n; i += 1) {
        const { t, v } = mesh.counts[i];
        const [x, y] = plotPoint(t, v / t);
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
    const head = mesh.counts[n - 1];
    const [hx, hy] = plotPoint(head.t, head.v / head.t);
    g.fillStyle = red;
    g.globalAlpha = 0.95;
    g.beginPath();
    g.arc(hx, hy, 0.75, 0, Math.PI * 2);
    g.fill();
    g.restore();
    return { t: head.t, v: head.v, ratio: head.v / head.t };
}
