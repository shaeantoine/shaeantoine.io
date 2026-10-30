/**
 * What's printed on the bench: canvases, drawn in MILLIMETRES of the real
 * object (the logical units handed to ctx.makeCanvas). Built from eeg.jpg:
 * the white breadboard's hole grid and rails, the red AD8232's silkscreen, the
 * Teensy's gold pin row, the electrode pads' foam, the mat's printed grid, and
 * the tag's two handwritten faces.
 *
 * Canvas orientation for a flat part (a box's +Y face): canvas LEFT is the
 * part's -x end, canvas TOP is its back (-z) edge — i.e. it reads the way the
 * establishing camera sees it. Text on the boards is rotated a quarter turn,
 * because the real boards are lying across the mat rather than up it (the
 * photo is portrait; the bench is landscape).
 */

import { BOARD, AD8232, JACK, TEENSY, LED, TAG } from './layout.js';
import { palette } from '../../core/palette.js';
import { THREADS } from './copy.js';
import { drawThread, NOTE_IDS } from './screens.js';

export const MANILA = palette.manila;
export const MANILA_PATCH = palette.manilaPatch;
const BOARD_WHITE = '#f3f1ea';
const HOLE = '#34322f';
const RAIL_RED = '#d23b36';
const RAIL_BLUE = '#2f6fc2';
const PCB_RED = '#cf2430';
const PCB_GREEN = '#2e7c62';
const SILK = '#f4efe6';
const GOLD = '#d7b25e';
const SOLDER = '#cfcfc6';

const PITCH = 2.54;

function rotatedText(g, text, x, y, { size, weight = 500, color, align = 'left', angle = -Math.PI / 2, face = 'inter', fonts }) {
    g.save();
    g.translate(x, y);
    g.rotate(angle);
    g.font = fonts.font({ face, size, weight });
    g.fillStyle = color;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillText(text, 0, 0);
    g.restore();
}

function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
}

// ---------------------------------------------------------------------------
// Cutting mat (400 × 260 mm)
// ---------------------------------------------------------------------------

export function drawMat(g, w, h, { palette, draw, fonts }) {
    g.fillStyle = palette.matGreen;
    g.fillRect(0, 0, w, h);
    draw.grain(g, w, h, { seed: 'mat', amount: 0.05 });

    const m = 12; // printed margin
    const line = (x0, y0, x1, y1, width, alpha) => {
        g.strokeStyle = `rgba(232, 240, 233, ${alpha})`;
        g.lineWidth = width;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
    };
    // 1 cm grid, 5 cm major lines.
    for (let x = m; x <= w - m + 0.01; x += 10) {
        const major = Math.round(x - m) % 50 === 0;
        line(x, m, x, h - m, major ? 0.42 : 0.22, major ? 0.5 : 0.27);
    }
    for (let y = m; y <= h - m + 0.01; y += 10) {
        const major = Math.round(y - m) % 50 === 0;
        line(m, y, w - m, y, major ? 0.42 : 0.22, major ? 0.5 : 0.27);
    }
    // Angle guides from the bottom-left corner of the grid: 45°, 30°, 60°.
    g.save();
    g.setLineDash([2.2, 1.6]);
    for (const deg of [45, 30, 60]) {
        const a = (deg * Math.PI) / 180;
        const len = Math.min((w - 2 * m) / Math.cos(a), (h - 2 * m) / Math.sin(a));
        line(m, h - m, m + Math.cos(a) * len, h - m - Math.sin(a) * len, 0.24, 0.3);
    }
    g.restore();
    // Rulers: mm ticks along the top and left margins, numbered every cm.
    for (let i = 0; i <= w - 2 * m; i += 1) {
        const x = m + i;
        const len = i % 10 === 0 ? 3 : i % 5 === 0 ? 2 : 1.1;
        line(x, m - 0.6, x, m - 0.6 - len, 0.16, 0.62);
        line(x, h - m + 0.6, x, h - m + 0.6 + len, 0.16, 0.62);
    }
    for (let i = 0; i <= h - 2 * m; i += 1) {
        const y = m + i;
        const len = i % 10 === 0 ? 3 : i % 5 === 0 ? 2 : 1.1;
        line(m - 0.6, y, m - 0.6 - len, y, 0.16, 0.62);
        line(w - m + 0.6, y, w - m + 0.6 + len, y, 0.16, 0.62);
    }
    g.fillStyle = 'rgba(232, 240, 233, 0.72)';
    g.font = fonts.font({ face: 'inter', size: 2.6, weight: 500 });
    g.textBaseline = 'alphabetic';
    g.textAlign = 'center';
    for (let i = 0; i <= (w - 2 * m) / 10; i += 1) g.fillText(String(i), m + i * 10, m - 4.2);
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let i = 1; i <= (h - 2 * m) / 10; i += 1) g.fillText(String(i), m - 4, m + i * 10);
    // The frame round the grid.
    g.strokeStyle = 'rgba(232, 240, 233, 0.6)';
    g.lineWidth = 0.5;
    g.strokeRect(m, m, w - 2 * m, h - 2 * m);
}

// ---------------------------------------------------------------------------
// Breadboard top (165 × 55 mm) — 63 rows × 10 + 4 rails × 50 = 830 points
// ---------------------------------------------------------------------------

/** Canvas y (from the back edge) of each column; j is at the back, a at the front. */
function boardColumns(d) {
    const c = d / 2;
    const back = 'jihgf'.split('').map((letter, i) => ({ letter, y: c - 3.81 - (4 - i) * PITCH }));
    const front = 'edcba'.split('').map((letter, i) => ({ letter, y: c + 3.81 + i * PITCH }));
    return [...back, ...front];
}

export function drawBreadboard(g, w, h, { draw, fonts }) {
    g.fillStyle = BOARD_WHITE;
    g.fillRect(0, 0, w, h);
    draw.grain(g, w, h, { seed: 'breadboard', amount: 0.035 });

    const centre = h / 2;
    const columns = boardColumns(h);
    const rowX = (row) => (w - 62 * PITCH) / 2 + (row - 1) * PITCH;
    const hole = (x, y) => {
        g.fillStyle = HOLE;
        roundRect(g, x - 0.5, y - 0.5, 1.0, 1.0, 0.18);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.fillRect(x - 0.5, y + 0.42, 1.0, 0.14);
    };

    // Centre channel.
    g.fillStyle = '#dedbd1';
    g.fillRect(0, centre - 1.35, w, 2.7);
    g.fillStyle = '#bcb7ab';
    g.fillRect(0, centre - 0.3, w, 0.6);

    // Terminal strips.
    for (let row = 1; row <= 63; row += 1) {
        for (const column of columns) hole(rowX(row), column.y);
    }

    // Power rails: two rows a side, 10 groups of 5.
    const railY = [centre - 22.01, centre - 19.47, centre + 19.47, centre + 22.01];
    const railStart = (w - (9 * 6 + 4) * PITCH) / 2;
    for (const y of railY) {
        for (let group = 0; group < 10; group += 1) {
            for (let k = 0; k < 5; k += 1) hole(railStart + (group * 6 + k) * PITCH, y);
        }
    }
    // Rail stripes, as on the photo: back pair blue outside / red inside, front pair red outside / blue inside.
    const stripe = (y, color) => {
        g.fillStyle = color;
        g.fillRect(railStart - 2, y - 0.25, (9 * 6 + 4) * PITCH + 4, 0.5);
    };
    stripe(centre - 24.3, RAIL_BLUE);
    stripe(centre - 17.2, RAIL_RED);
    stripe(centre + 17.2, RAIL_BLUE);
    stripe(centre + 24.3, RAIL_RED);
    const sign = (text, x, y, color) => rotatedText(g, text, x, y, { size: 2.4, weight: 700, color, align: 'center', fonts });
    for (const x of [railStart - 3.6, w - railStart + 3.6]) {
        sign('+', x, centre + 24.3, RAIL_RED);
        sign('−', x, centre + 17.2, RAIL_BLUE);
        sign('+', x, centre - 17.2, RAIL_RED);
        sign('−', x, centre - 24.3, RAIL_BLUE);
    }

    // Row numbers (1, 5, 10 … 60) beside column a and column j; column letters at both ends.
    const ink = '#6a6862';
    for (let row = 1; row <= 63; row += 1) {
        if (row !== 1 && row % 5 !== 0) continue;
        rotatedText(g, String(row), rowX(row), centre + 15.4, { size: 1.55, color: ink, align: 'center', fonts });
        rotatedText(g, String(row), rowX(row), centre - 15.4, { size: 1.55, color: ink, align: 'center', fonts });
    }
    for (const column of columns) {
        rotatedText(g, column.letter, 1.55, column.y, { size: 1.5, color: ink, align: 'center', fonts });
        rotatedText(g, column.letter, w - 1.55, column.y, { size: 1.5, color: ink, align: 'center', fonts });
    }
}

// ---------------------------------------------------------------------------
// SparkFun AD8232 breakout top (35.6 × 28 mm)
// ---------------------------------------------------------------------------

export function drawAD8232(g, w, h, { fonts, rng }) {
    g.fillStyle = PCB_RED;
    g.fillRect(0, 0, w, h);
    const r = rng('ad8232');

    // Traces: faint darker-red Manhattan runs under the mask.
    g.strokeStyle = 'rgba(120, 10, 18, 0.35)';
    g.lineWidth = 0.28;
    for (let i = 0; i < 26; i += 1) {
        let x = r.range(9, w - 2);
        let y = r.range(2, h - 6);
        g.beginPath();
        g.moveTo(x, y);
        for (let s = 0; s < 3; s += 1) {
            if (s % 2 === 0) x += r.signed(6); else y += r.signed(5);
            g.lineTo(Math.min(w - 1, Math.max(8, x)), Math.min(h - 5, Math.max(1, y)));
        }
        g.stroke();
    }

    // Mounting holes in the corners.
    for (const [x, y] of [[2.6, 2.6], [w - 2.6, 2.6], [2.6, h - 2.6], [w - 2.6, h - 2.6]]) {
        g.fillStyle = '#dcdcd6';
        g.beginPath(); g.arc(x, y, 1.75, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#2a2020';
        g.beginPath(); g.arc(x, y, 1.05, 0, Math.PI * 2); g.fill();
    }
    // Three small plated holes by the back corner.
    for (const y of [6.8, 9.1, 11.4]) {
        g.fillStyle = GOLD;
        g.beginPath(); g.arc(3.6, y, 0.75, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#3a1a1a';
        g.beginPath(); g.arc(3.6, y, 0.4, 0, Math.PI * 2); g.fill();
    }

    // SMD passives, clear of the chip and the jack.
    const chip = { x: AD8232.w / 2 + 5, y: AD8232.d / 2 + 2 };
    const jack = { x0: JACK.x - AD8232.x + AD8232.w / 2 - 3.6, x1: JACK.x - AD8232.x + AD8232.w / 2 + 3.6, y1: 13 };
    let placed = 0;
    for (let tries = 0; tries < 200 && placed < 22; tries += 1) {
        const x = r.range(14, w - 4);
        const y = r.range(3, h - 7);
        if (Math.abs(x - chip.x) < 4 && Math.abs(y - chip.y) < 4) continue;
        if (x > jack.x0 && x < jack.x1 && y < jack.y1) continue;
        const vertical = r() < 0.5;
        const cw = vertical ? 0.55 : 1.1;
        const ch = vertical ? 1.1 : 0.55;
        g.fillStyle = r() < 0.7 ? '#b8905a' : '#1d1b1b';
        g.fillRect(x - cw / 2, y - ch / 2, cw, ch);
        g.fillStyle = '#d9d9d2';
        if (vertical) { g.fillRect(x - cw / 2, y - ch / 2, cw, 0.22); g.fillRect(x - cw / 2, y + ch / 2 - 0.22, cw, 0.22); }
        else { g.fillRect(x - cw / 2, y - ch / 2, 0.22, ch); g.fillRect(x + cw / 2 - 0.22, y - ch / 2, 0.22, ch); }
        placed += 1;
    }
    g.strokeStyle = SILK;
    g.lineWidth = 0.18;
    g.strokeRect(chip.x - 2.6, chip.y - 2.6, 5.2, 5.2);

    // Silkscreen, as in the photo (read with the board's end toward you).
    rotatedText(g, 'AD8232', 1.9, 23.6, { size: 1.55, weight: 700, color: SILK, fonts });
    rotatedText(g, 'Heart Monitor', 4.1, 23.8, { size: 1.05, weight: 500, color: SILK, fonts });
    // The heart.
    g.save();
    g.translate(9.4, 17.2);
    g.rotate(-Math.PI / 2);
    g.strokeStyle = SILK;
    g.lineWidth = 0.28;
    g.beginPath();
    g.moveTo(0, 1.9);
    g.bezierCurveTo(-3.2, -0.4, -1.8, -2.9, 0, -1.2);
    g.bezierCurveTo(1.8, -2.9, 3.2, -0.4, 0, 1.9);
    g.stroke();
    g.restore();
    // Header pin labels, beside the header on the front edge.
    const labels = ['GND', '3.3v', 'OUTPUT', 'LO-', 'LO+', 'SDN'];
    const headerStart = AD8232.w / 2 - 1.7 - 2.5 * PITCH;
    labels.forEach((label, i) => {
        // Rotated a quarter turn, 'left' runs the label up the canvas, away from the header.
        rotatedText(g, label, headerStart + i * PITCH, 23.6, { size: 1.0, weight: 600, color: SILK, align: 'left', fonts });
    });
    rotatedText(g, 'LED', 5.4, 24.2, { size: 0.9, weight: 600, color: SILK, align: 'left', fonts });
}

// ---------------------------------------------------------------------------
// Teensy 4.1 top (61 × 18 mm), USB end at canvas left
// ---------------------------------------------------------------------------

export function drawTeensy(g, w, h, { rng }) {
    g.fillStyle = PCB_GREEN;
    g.fillRect(0, 0, w, h);
    const r = rng('teensy');
    g.strokeStyle = 'rgba(18, 70, 50, 0.45)';
    g.lineWidth = 0.22;
    for (let i = 0; i < 30; i += 1) {
        let x = r.range(3, w - 3);
        let y = r.range(3, h - 3);
        g.beginPath();
        g.moveTo(x, y);
        for (let s = 0; s < 3; s += 1) {
            if (s % 2 === 0) x += r.signed(7); else y += r.signed(4);
            g.lineTo(Math.min(w - 2.5, Math.max(2.5, x)), Math.min(h - 2.5, Math.max(2.5, y)));
        }
        g.stroke();
    }
    // 24 soldered pins a side.
    for (let k = 0; k < 24; k += 1) {
        const x = 1.29 + k * PITCH;
        for (const y of [1.27, h - 1.27]) {
            g.fillStyle = GOLD;
            g.beginPath(); g.arc(x, y, 0.88, 0, Math.PI * 2); g.fill();
            g.fillStyle = SOLDER;
            g.beginPath(); g.arc(x, y, 0.58, 0, Math.PI * 2); g.fill();
            g.fillStyle = 'rgba(255,255,255,0.7)';
            g.beginPath(); g.arc(x - 0.18, y - 0.18, 0.2, 0, Math.PI * 2); g.fill();
        }
    }
    // The inner row of gold pads near the USB end, and the five by the SD socket (as in the photo).
    g.fillStyle = GOLD;
    for (let k = 0; k < 5; k += 1) g.fillRect(6.4 + k * PITCH, 11.3, 1.25, 1.25);
    for (let k = 0; k < 5; k += 1) {
        g.beginPath(); g.arc(49.2, 3.5 + k * 1.9, 0.62, 0, Math.PI * 2); g.fill();
    }
    // Passives.
    const avoid = [[30.5, 8, 6.5], [10, 4.3, 3], [43.2, 11, 2.4], [45.8, 6, 2.6], [LED.x - TEENSY.x + w / 2, LED.z - TEENSY.z + h / 2, 1.6]];
    let placed = 0;
    for (let tries = 0; tries < 240 && placed < 26; tries += 1) {
        const x = r.range(8, 47);
        const y = r.range(3.2, h - 3.2);
        if (avoid.some(([ax, ay, ar]) => Math.abs(x - ax) < ar && Math.abs(y - ay) < ar)) continue;
        const vertical = r() < 0.5;
        const cw = vertical ? 0.5 : 1.0;
        const ch = vertical ? 1.0 : 0.5;
        g.fillStyle = r() < 0.65 ? '#b48c56' : '#1c1c1a';
        g.fillRect(x - cw / 2, y - ch / 2, cw, ch);
        placed += 1;
    }
    // Silkscreen outlines.
    g.strokeStyle = 'rgba(244, 239, 230, 0.8)';
    g.lineWidth = 0.15;
    g.strokeRect(30.5 - 5.8, 8 - 5.8, 11.6, 11.6);
    g.strokeRect(w - 12.2, 2.2, 11.8, 13.6);
}

/** The i.MX RT1062's laser-etched top (10 × 10 mm). */
export function drawChipTop(g, w, h, { fonts }) {
    g.fillStyle = '#1b1b1c';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a3a3c';
    g.beginPath(); g.arc(1.3, h - 1.3, 0.5, 0, Math.PI * 2); g.fill();
    // Etched lines read along the chip as it lies (rotated with the board, like the photo).
    rotatedText(g, 'MIMXRT1062', 3.1, h / 2, { size: 1.15, weight: 600, color: '#8c8c8e', align: 'center', fonts });
    rotatedText(g, 'DVJ6B', 4.9, h / 2, { size: 1.15, weight: 600, color: '#8c8c8e', align: 'center', fonts });
}

// ---------------------------------------------------------------------------
// Electrode pad top (44 mm disc, drawn into a square the cylinder cap maps)
// ---------------------------------------------------------------------------

export function drawPad(g, size, { printedLiner = false, seed = 'pad', rng }) {
    const c = size / 2;
    g.fillStyle = '#f2f2ee';
    g.fillRect(0, 0, size, size);
    // Perforated foam: a fine hex dot pattern.
    g.fillStyle = '#d5d5cf';
    const step = 1.5;
    for (let row = 0, y = 0.8; y < size; row += 1, y += step * 0.866) {
        for (let x = 0.8 + (row % 2) * step / 2; x < size; x += step) {
            if ((x - c) ** 2 + (y - c) ** 2 > (c - 1.2) ** 2) continue;
            g.beginPath(); g.arc(x, y, 0.22, 0, Math.PI * 2); g.fill();
        }
    }
    // The clear film round the snap.
    g.fillStyle = 'rgba(236, 238, 240, 0.9)';
    g.beginPath(); g.arc(c, c, 10, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(160, 160, 160, 0.55)';
    g.lineWidth = 0.25;
    g.stroke();
    // Edge shadow.
    g.strokeStyle = 'rgba(0,0,0,0.08)';
    g.lineWidth = 1;
    g.beginPath(); g.arc(c, c, c - 0.5, 0, Math.PI * 2); g.stroke();
    if (printedLiner) {
        // A printed release liner showing at the rim (the red print in the photo) — abstract marks, no brand.
        const r = rng(seed);
        g.fillStyle = 'rgba(196, 50, 44, 0.75)';
        for (let a = -0.6; a < 1.3; a += 0.12) {
            const len = r.range(0.04, 0.09);
            g.save();
            g.translate(c + Math.cos(a) * (c - 2.2), c + Math.sin(a) * (c - 2.2));
            g.rotate(a + Math.PI / 2);
            g.fillRect(0, -0.4, len * c, 0.8);
            g.restore();
        }
    }
}

// ---------------------------------------------------------------------------
// The tag (75 × 37.5 mm): front and back
// ---------------------------------------------------------------------------

export const TAG_LINE = 'Predicting eye movement from brain signals.\nThe catch: the classifier has to run on the board.';
export const TAG_LINE_SPOKEN = 'Predicting eye movement from brain signals. The catch: the classifier has to run on the board.';
export const TAG_BACK = 'At university I worked with physicists on an EEG project predicting eye movement. I thought I could rebuild it alone, so I made it harder: the classifier had to run on the device itself.';

function tagGround(g, w, h, { holeOnRight, seed, draw }) {
    g.fillStyle = MANILA;
    g.fillRect(0, 0, w, h);
    draw.grain(g, w, h, { seed, amount: 0.07 });
    // Long fibres.
    g.strokeStyle = 'rgba(150, 118, 60, 0.08)';
    g.lineWidth = 0.12;
    for (let i = 0; i < 40; i += 1) {
        const y = (i * 7.3) % h;
        g.beginPath();
        g.moveTo(((i * 13.7) % w) - 5, y);
        g.lineTo(((i * 13.7) % w) + 9, y + 0.4);
        g.stroke();
    }
    // The reinforcing patch round the hole.
    const hx = holeOnRight ? w / 2 + Math.abs(TAG.holeX) : w / 2 - Math.abs(TAG.holeX);
    const hy = h / 2;
    g.fillStyle = MANILA_PATCH;
    g.beginPath(); g.arc(hx, hy, TAG.ringR, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(120, 88, 40, 0.45)';
    g.lineWidth = 0.22;
    g.stroke();
    g.strokeStyle = 'rgba(110, 80, 36, 0.35)';
    g.lineWidth = 0.5;
    g.beginPath(); g.arc(hx, hy, TAG.holeR + 0.5, 0, Math.PI * 2); g.stroke();
}

/** How far the writing keeps from the hole end: the patch reaches TAG.w / 2 - TAG.holeX + TAG.ringR = 13.6 mm in; 1.2 mm of air. */
const TEXT_CLEAR_OF_EYELET = TAG.w / 2 - TAG.holeX + TAG.ringR + 1.2;

/**
 * The tag's two writing areas (mm, canvas space: left = the card's left edge
 * as that face is seen); typedTagNote below sets Shae Hand into each.
 *   front: 56.8 × 31.1 mm — up to 1.2 mm from the eyelet's patch (which starts
 *          6.6 mm in from the hole, so at w - 13.6). The tag is held smaller in v2
 *          (29% of the frame, was 40%), so the line may run larger: the fit only
 *          ever lands at or above v1's 6.0 mm, which (as v1 showed) sets in four lines.
 *   back:  57.0 × 32.9 mm — six lines; what binds is the height (v1 set 6 × 5.0 mm ×
 *          1.06 in 31.9 mm), so the top and bottom margins give 1 mm back and the
 *          start moves to 1.2 mm off the patch.
 */
export const TAG_INK = Object.freeze({
    front: Object.freeze({ x: 3.4, y: 3.2, w: TAG.w - TEXT_CLEAR_OF_EYELET - 3.4, h: TAG.h - 6.4 }),
    // v4: the back shares its card with a thread line (→ the monitor), so the note keeps
    // the top 20.6 mm and the thread takes the 12 mm under it. The tag is held closer to
    // read its back (layout.js HAND.back: 0.38 of the frame height, v3 0.27), so the
    // smaller hand lands at about v3's size on screen.
    back: Object.freeze({ x: TEXT_CLEAR_OF_EYELET, y: 1.9, w: TAG.w - TEXT_CLEAR_OF_EYELET - 3.0, h: 20.6 }),
    thread: Object.freeze({ x: TEXT_CLEAR_OF_EYELET, y: 23.2, w: TAG.w - TEXT_CLEAR_OF_EYELET - 3.0, h: 12.4 })
});

/**
 * One face's writing, typed in Shae Hand: the largest size in [min, max] mm
 * that fits the area (draw.fitHandwriting — reported, not forced), set in it
 * vertically centred. Returns the fit: { size, lines, fits }.
 */
function typedTagNote(g, text, box, { max, min, seed, slant }, { palette, draw }) {
    const fit = draw.fitHandwriting(g, text, { maxWidth: box.w, maxHeight: box.h, sizeMax: max, sizeMin: min, weight: 500 });
    const blockHeight = fit.lines.length * fit.size * fit.lineHeight;
    draw.handwriting(g, text, {
        x: box.x, y: box.y + (box.h - blockHeight) / 2, maxWidth: box.w,
        size: fit.size, lineHeight: fit.lineHeight, color: palette.ink, seed, slant
    });
    return { size: fit.size, lines: fit.lines.length, fits: fit.fits };
}

// Front: the hole is on the right (TAG.holeX > 0), so the writing sits to its left.
export function drawTagFront(g, w, h, art) {
    tagGround(g, w, h, { holeOnRight: true, seed: 'tag-front', draw: art.draw });
    return typedTagNote(g, TAG_LINE, TAG_INK.front,
        { max: 7.7, min: 4.0, seed: 'bench-tag-front', slant: -0.012 }, art);
}

// Back (turned over about the vertical axis): the hole is on the left.
export function drawTagBack(g, w, h, art) {
    tagGround(g, w, h, { holeOnRight: false, seed: 'tag-back', draw: art.draw });
    const note = typedTagNote(g, TAG_BACK, TAG_INK.back,
        { max: 4.6, min: 2.6, seed: 'bench-tag-back', slant: 0.008 }, art);
    drawThread(g, TAG_INK.thread, { id: NOTE_IDS.tagThread, thread: THREADS.tag, sizeMax: 3.9 }, art);
    return note;
}

export const CANVAS_SIZES = Object.freeze({
    board: [BOARD.w, BOARD.d],
    ad8232: [AD8232.w, AD8232.d],
    teensy: [TEENSY.w, TEENSY.d],
    chip: [10, 10],
    pad: [44, 44],
    tag: [TAG.w, TAG.h]
});
