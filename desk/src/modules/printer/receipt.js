import { PAPER } from './spec.js';
import { mm } from '../../core/framing.js';
import { rng as seeded } from '../../core/rng.js';
import { FACES } from '../../core/fonts.js';
import { context2d } from '../../core/draw.js';

/**
 * The visitor receipt: what it says, how it is laid out, how it is painted.
 *
 * Laid out in millimetres of real paper (75 mm wide). Plain Inter, the way a
 * receipt is plain: store header, a date/time line, dashed rules, labels left
 * and values right-aligned; then the footer — "thank you for visiting", the
 * contact lines set small in a centred two-column block (the shop's details
 * at the foot of a receipt), and the barcode.
 *
 * "things picked up" lists the visit log's titles as they are (the modules
 * log "the suit — Amazon, 2022", "the EEG breadboard", "Catch The Dot" …). A
 * title too long for one line breaks after its " — ", so the thing stays on
 * the first line and where-and-when goes under it, indented.
 *
 * TWO LAYOUTS FROM ONE LIST.
 *   strip — the printed paper in the room, a fixed PAPER.length long. The
 *           footer is anchored near the tip, the gaps between sections flex
 *           (up to MAX_FLEX×) to fill the length, and anything left over goes
 *           to the blank feed above the header — which is where a printer in
 *           upside-down mode leaves it, and which moves the header down onto
 *           the part of the drape that faces the room.
 *   png   — "Save receipt": natural gaps, short feeds, both ends torn.
 */

const WIDTH = 75;
export const RECEIPT_MM = Object.freeze({ width: WIDTH, length: PAPER.length / mm(1) });

const MARGIN = 4.5;                 // side margins (thermal printers leave ≈ 4 mm)
const PRINTABLE = WIDTH - 2 * MARGIN;
const MAX_FLEX = 2.1;
/** Strip: ≥ this much blank paper before the header (the stretch rising out of the slot faces away). */
const STRIP_TOP_FEED = 31;
/** Strip: blank paper after the barcode — the curled tip, which faces away, and the tab left in the slot at rest. */
const STRIP_BOTTOM_FEED = 26;
const PNG_FEED = 9;
const PNG_PX_PER_MM = 9;

/** The receipt's words. Verbatim from the brief; "—" there separates label and value. */
export const COPY = Object.freeze({
    store: "SHAE McKENNA'S DESK",
    title: 'VISITOR RECEIPT',
    time: 'time at the desk',
    picked: 'things picked up',
    visits: 'visits',
    // [label, value as printed, link]. The printed value is the short form a
    // receipt would carry; the link is what the "#printer" view offers as a
    // real, clickable link beside "Save receipt" (index.js contactLinks).
    contacts: Object.freeze([
        Object.freeze(['email', 'shaeantoine@gmail.com', 'mailto:shaeantoine@gmail.com']),
        Object.freeze(['linkedin', 'linkedin.com/in/shaemckenna', 'https://www.linkedin.com/in/shaemckenna/']),
        Object.freeze(['github', 'github.com/shaeantoine', 'https://github.com/shaeantoine'])
    ]),
    thanks: 'thank you for visiting'
});

/**
 * SCREENSHOT FIXTURE, used only under ?still=1 / ?film=1 when nothing has been
 * logged yet (a fresh load straight to #printer). Six of the visit log's own
 * titles, verbatim (the strings the box, bench and monitor log) — a visit that
 * went through the box, the bench and the screen — matching the brief's
 * "things picked up 6". Two are long enough to wrap. In a real visit the log
 * is used as-is.
 */
export const SAMPLE_PICKS = Object.freeze([
    'the suit — Amazon, 2022',
    'the intern project — Apple, 2023',
    'the trophy — SafetyCulture, 2023',
    'the Pura Link memo',
    'the EEG breadboard',
    'Catch The Dot'
]);

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

/** The visitor's local date and time, formatted by hand so every browser prints the same thing. */
export function formatWhen(date) {
    return {
        date: `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`,
        time: `${pad(date.getHours())}:${pad(date.getMinutes())}`
    };
}

/** What gets printed, read off the visit at print time (a receipt is a snapshot). */
export function receiptData(ctx) {
    const snapshot = ctx.visit.snapshot();
    const sample = (ctx.still || ctx.film) && snapshot.picked.length === 0;
    const picked = sample ? [...SAMPLE_PICKS] : snapshot.picked;
    return {
        ...formatWhen(ctx.now()),
        elapsed: snapshot.elapsed,
        picked,
        count: picked.length,
        visits: snapshot.visits,
        sample
    };
}

/** Whether a new print would say something different about what was picked up. */
export function sameReceipt(a, b) {
    return Boolean(a && b) && a.visits === b.visits && a.picked.join('\u0000') === b.picked.join('\u0000');
}

/** The receipt as text, for the live region. */
export function receiptText(data) {
    if (!data) return '';
    const items = data.picked.length ? `: ${data.picked.join('; ')}` : '';
    const contacts = COPY.contacts.map(([label, value]) => `${label}, ${value}`).join('. ');
    return `${COPY.store}. ${COPY.title}. ${data.date}, ${data.time}. ${COPY.time}, ${data.elapsed}. `
        + `${COPY.picked}, ${data.count}${items}. ${COPY.visits}, ${data.visits}. ${COPY.thanks}. ${contacts}.`;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const FACE = FACES.inter; // the site's face, from core — receipts are plain
const fontOf = (size, weight = 400) => `normal ${weight} ${size}px ${FACE}`;

function measure(g, text, size, weight, letterSpacing = 0) {
    g.save();
    g.font = fontOf(size, weight);
    if ('letterSpacing' in g) g.letterSpacing = `${letterSpacing}px`;
    const width = g.measureText(text).width;
    g.restore();
    return width;
}

/** Greedy wrap into at most `maxLines`; whatever does not fit is ellipsised onto the last line. */
function wrapLines(g, text, size, weight, maxWidth, maxLines) {
    g.save();
    g.font = fontOf(size, weight);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    const width = (t) => g.measureText(t).width;
    const ellipsise = (t) => {
        let cut = t;
        while (cut.length > 1 && width(`${cut}…`) > maxWidth) cut = cut.slice(0, -1).trimEnd();
        return `${cut}…`;
    };
    const words = String(text).split(/\s+/).filter(Boolean);
    const all = [];
    let line = '';
    for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (!line || width(candidate) <= maxWidth) line = candidate;
        else { all.push(line); line = word; }
    }
    if (line) all.push(line);
    let lines = all;
    if (all.length > maxLines) {
        lines = all.slice(0, maxLines - 1);
        lines.push(all.slice(maxLines - 1).join(' '));
    }
    lines = lines.map((l) => (width(l) > maxWidth ? ellipsise(l) : l));
    g.restore();
    return lines.length ? lines : [''];
}

/** The separator the visit log's titles use between the thing and where/when it was ("the suit — Amazon, 2022"). */
const TITLE_BREAK = ' — ';

/**
 * A picked-up title as receipt lines. One line if it fits. Otherwise it breaks
 * after the " — " (the dash ends the first line, like a receipt's item name
 * running over), each half wrapped on its own if it still doesn't fit; titles
 * without a dash wrap greedily. `maxWidth` is the first line's width; later
 * lines are `hang` narrower (they're indented by that much).
 */
function itemLines(g, title, size, weight, maxWidth, hang, maxLines = 3) {
    const text = String(title).trim();
    if (measure(g, text, size, weight) <= maxWidth) return [text];
    const cut = text.indexOf(TITLE_BREAK);
    if (cut > 0) {
        const head = `${text.slice(0, cut)} —`;
        const tail = text.slice(cut + TITLE_BREAK.length);
        const headLines = wrapLines(g, head, size, weight, maxWidth, Math.max(1, maxLines - 1));
        const tailLines = wrapLines(g, tail, size, weight, maxWidth - hang, Math.max(1, maxLines - headLines.length));
        return [...headLines, ...tailLines];
    }
    return wrapLines(g, text, size, weight, maxWidth - hang, 2);
}

/**
 * The footer's contact lines: a two-column block centred on the paper, labels
 * right-aligned to a gutter, values left of it — smaller than the body, the
 * way a shop's details sit at the foot of a receipt. Set smaller still if a
 * value is too long to fit.
 */
function contactBlock(g, contacts, { size, weight = 400, gutter = 2.6, lineHeight = 1.42 }) {
    const widest = (i, at) => Math.max(...contacts.map((pair) => measure(g, pair[i], at, weight)));
    let fitted = size;
    const total = (at) => widest(0, at) + gutter + widest(1, at);
    if (total(size) > PRINTABLE) fitted = size * (PRINTABLE / total(size));
    const labelWidth = widest(0, fitted);
    const left = (WIDTH - total(fitted)) / 2;
    const labelRight = left + labelWidth;
    const valueLeft = labelRight + gutter;
    return contacts.map(([label, value]) => ({
        kind: 'contact', label, value, size: fitted, weight, labelRight, valueLeft, h: fitted * lineHeight
    }));
}

/**
 * The receipt as a list of blocks with heights (mm), gaps marked flexible.
 * Titles beyond what fits `budget` are summarised as "+ n more".
 */
function blocks(g, data, budget = Infinity) {
    const storeSize = Math.min(5.4, fitSize(g, COPY.store, 700, 0.16, PRINTABLE));
    const BODY = 5.2;
    const ITEM = 4.3;
    const ITEM_LINE = ITEM * 1.34;
    const INDENT = 3.2;
    const HANG = 2.4;   // a title's second line sits this much further in
    const FOOT = 3.9;   // the contact lines
    // A label + value that would not fit side by side is set smaller rather than overprinted.
    const row = (left, right, size, weight = 400) => {
        const at10 = measure(g, left, 10, weight) + measure(g, right, 10, weight);
        const fitted = Math.min(size, ((PRINTABLE - 3) / at10) * 10);
        return { kind: 'row', left, right, size: fitted, weight, h: size * 1.5 };
    };

    const head = [
        { kind: 'text', text: COPY.store, size: storeSize, weight: 700, letterSpacing: 0.16, align: 'center', h: storeSize * 1.3 },
        { kind: 'gap', h: 1.2 },
        { kind: 'text', text: COPY.title, size: 3.3, weight: 500, letterSpacing: 1.05, align: 'center', h: 4.8 },
        { kind: 'gap', h: 5, flex: true },
        { ...row(data.date, data.time, 4.5), h: 6.8 },
        { kind: 'gap', h: 3.2, flex: true },
        { kind: 'rule', h: 0.4 },
        { kind: 'gap', h: 3.6, flex: true },
        row(COPY.time, data.elapsed, BODY),
        row(COPY.picked, String(data.count), BODY)
    ];
    const tail = [
        { kind: 'gap', h: 1.4 },
        row(COPY.visits, String(data.visits), BODY),
        { kind: 'gap', h: 3.2, flex: true },
        { kind: 'rule', h: 0.4 },
        // The footer: the sign-off, then the shop's details in small type, then the barcode.
        { kind: 'gap', h: 5.4, flex: true },
        { kind: 'text', text: COPY.thanks, size: 4.8, weight: 500, letterSpacing: 0.05, align: 'center', h: 7 },
        { kind: 'gap', h: 3.2, flex: true },
        ...contactBlock(g, COPY.contacts, { size: FOOT }),
        { kind: 'gap', h: 5.2, flex: true },
        { kind: 'barcode', h: 11.5 }
    ];
    const heightOf = (list) => list.reduce((sum, b) => sum + b.h, 0);

    const items = data.picked.map((title) => {
        const lines = itemLines(g, title, ITEM, 400, PRINTABLE - INDENT, HANG);
        return { kind: 'item', lines, size: ITEM, weight: 400, indent: INDENT, hang: HANG, h: lines.length * ITEM_LINE + 0.6 };
    });
    let shown = items;
    const fixed = heightOf(head) + heightOf(tail);
    if (fixed + heightOf(items) > budget) {
        const more = (n) => ({ kind: 'item', lines: [`+ ${n} more`], size: ITEM, weight: 400, indent: INDENT, h: ITEM_LINE + 0.6 });
        shown = [];
        for (let i = 0; i < items.length; i += 1) {
            const rest = items.length - i - 1;
            const next = [...shown, items[i]];
            if (fixed + heightOf(next) + (rest ? more(rest).h : 0) > budget) {
                shown.push(more(items.length - i));
                break;
            }
            shown = next;
        }
    }
    return [...head, ...shown, ...tail];
}

function fitSize(g, text, weight, letterSpacing, width) {
    const at10 = measure(g, text, 10, weight, 0);
    const spacing = letterSpacing * Math.max(0, text.length - 1);
    return ((width - spacing) / at10) * 10;
}

/**
 * Positions every block. mode 'strip': fixed length, footer anchored, gaps
 * flex. mode 'png': natural gaps, the length is whatever it comes to.
 * @returns {{ ops: object[], length: number, topFeed: number }}
 */
export function layoutReceipt(g, data, { mode = 'strip', length = RECEIPT_MM.length } = {}) {
    if (mode === 'png') {
        const list = blocks(g, data);
        let y = PNG_FEED;
        const ops = list.map((b) => { const op = { ...b, y }; y += b.h; return op; });
        return { ops, length: y + PNG_FEED, topFeed: PNG_FEED };
    }
    const available = length - STRIP_TOP_FEED - STRIP_BOTTOM_FEED;
    const list = blocks(g, data, available);
    const natural = list.reduce((sum, b) => sum + b.h, 0);
    const flexible = list.filter((b) => b.flex).reduce((sum, b) => sum + b.h, 0);
    const extra = Math.max(0, available - natural);
    const grow = flexible > 0 ? Math.min(extra, flexible * (MAX_FLEX - 1)) : 0;
    const topFeed = STRIP_TOP_FEED + (extra - grow);
    let y = topFeed;
    const ops = list.map((b) => {
        const h = b.flex && flexible > 0 ? b.h + (b.h / flexible) * grow : b.h;
        const op = { ...b, h, y };
        y += h;
        return op;
    });
    return { ops, length, topFeed };
}

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

function drawDashedRule(g, y, ink) {
    g.fillStyle = ink;
    const dash = 1.5;
    const gap = 1.05;
    for (let x = MARGIN; x < WIDTH - MARGIN - 0.1; x += dash + gap) {
        g.fillRect(x, y, Math.min(dash, WIDTH - MARGIN - x), 0.36);
    }
}

/** Code-128-looking bars: a start guard, seeded widths, a stop guard. */
function drawBarcode(g, y, h, seed, ink) {
    const r = seeded(seed);
    const modules = [2, 1, 1, 2, 1, 4]; // start guard-ish
    let total = modules.reduce((a, b) => a + b, 0);
    while (total < 128) {
        const w = 1 + Math.floor(r() * 3.2);
        modules.push(w);
        total += w;
    }
    if (modules.length % 2 === 1) { modules.push(1); total += 1; }
    modules.push(2, 3, 3, 1, 1, 1, 2); // stop guard-ish
    total += 13;
    const unit = 52 / total;
    let x = (WIDTH - total * unit) / 2;
    g.fillStyle = ink;
    modules.forEach((w, i) => {
        if (i % 2 === 0) g.fillRect(x, y, w * unit - 0.02, h);
        x += w * unit;
    });
}

function setType(g, size, weight, letterSpacing = 0) {
    g.font = fontOf(size, weight);
    if ('letterSpacing' in g) g.letterSpacing = `${letterSpacing}px`;
    g.textBaseline = 'alphabetic';
}

/** Baseline for a line box of height `h` starting at y (cap height ≈ 0.73 em for Inter). */
const baseline = (y, h, size) => y + h / 2 + size * 0.36;

/**
 * Paints a laid-out receipt into `g` (already scaled to millimetres).
 * @param {object} [options] serrate: 'none' | 'both'; ink density varies per line (thermal)
 */
export function paintReceipt(g, data, layout, { palette, serrate = 'none', grain } = {}) {
    const paper = palette.receipt;
    const ink = palette.receiptInk;
    const length = layout.length;

    g.save();
    if (serrate === 'both') {
        const teeth = PAPER.teeth;
        const pitch = WIDTH / teeth;
        const depth = 1.3;
        g.beginPath();
        g.moveTo(0, depth);
        for (let k = 0; k < teeth; k += 1) { g.lineTo(k * pitch + pitch / 2, 0); g.lineTo((k + 1) * pitch, depth); }
        g.lineTo(WIDTH, length - depth);
        for (let k = teeth - 1; k >= 0; k -= 1) { g.lineTo(k * pitch + pitch / 2, length); g.lineTo(k * pitch, length - depth); }
        g.closePath();
        g.clip();
    }
    g.fillStyle = paper;
    g.fillRect(0, 0, WIDTH, length);
    grain?.(g, WIDTH, length);

    const density = seeded(`ink:${data.date}:${data.time}`);
    for (const op of layout.ops) {
        g.globalAlpha = 0.9 + density() * 0.1;
        switch (op.kind) {
            case 'text': {
                setType(g, op.size, op.weight, op.letterSpacing);
                g.fillStyle = ink;
                g.textAlign = 'center';
                // letterSpacing adds trailing space after the last glyph; nudge back half of it.
                g.fillText(op.text, WIDTH / 2 + (op.letterSpacing ?? 0) / 2, baseline(op.y, op.h, op.size));
                break;
            }
            case 'row': {
                setType(g, op.size, op.weight);
                g.fillStyle = ink;
                g.textAlign = 'left';
                g.fillText(op.left, MARGIN, baseline(op.y, op.h, op.size));
                g.textAlign = 'right';
                g.fillText(op.right, WIDTH - MARGIN, baseline(op.y, op.h, op.size));
                break;
            }
            case 'item': {
                setType(g, op.size, op.weight);
                g.fillStyle = ink;
                g.textAlign = 'left';
                const line = op.size * 1.34;
                op.lines.forEach((text, i) => {
                    g.fillText(text, MARGIN + op.indent + (i === 0 ? 0 : op.hang ?? 2.4), baseline(op.y + i * line, line, op.size));
                });
                break;
            }
            case 'contact': {
                setType(g, op.size, op.weight);
                g.fillStyle = ink;
                g.textAlign = 'right';
                g.fillText(op.label, op.labelRight, baseline(op.y, op.h, op.size));
                g.textAlign = 'left';
                g.fillText(op.value, op.valueLeft, baseline(op.y, op.h, op.size));
                break;
            }
            case 'rule':
                drawDashedRule(g, op.y, ink);
                break;
            case 'barcode':
                drawBarcode(g, op.y, op.h, `${data.visits}|${data.date}|${data.time}|${data.count}`, ink);
                break;
            default:
                break;
        }
    }
    g.restore();
}

/**
 * Draws the in-room strip into a makeCanvas() result (logical mm).
 * @returns the layout (for the summary / checks)
 */
export function drawStripReceipt(surface, data, { palette, grain }) {
    const layout = layoutReceipt(surface.g, data, { mode: 'strip', length: RECEIPT_MM.length });
    surface.clear();
    paintReceipt(surface.g, data, layout, { palette, grain });
    return layout;
}

/** A standalone high-resolution PNG canvas of the receipt, torn at both ends, transparent round it. */
export function renderReceiptPNG(data, { palette, grain }) {
    // Measuring only: a refused scratch canvas lays out as well at 1 × 1 (core/draw.js context2d).
    const scratch = context2d(document.createElement('canvas'), { label: 'receipt layout scratch' });
    const layout = layoutReceipt(scratch, data, { mode: 'png' });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(WIDTH * PNG_PX_PER_MM);
    canvas.height = Math.round(layout.length * PNG_PX_PER_MM);
    // The transform after the context, so a refused canvas saves a smaller PNG rather than a cropped one.
    const g = context2d(canvas, { label: 'receipt PNG' });
    g.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / layout.length, 0, 0);
    paintReceipt(g, data, layout, { palette, serrate: 'both', grain });
    return canvas;
}

/** Downloads a canvas as a PNG. */
export function downloadCanvas(canvas, filename) {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => {
            if (!blob) { resolve(false); return; }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.rel = 'noopener';
            document.body.append(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            resolve(true);
        }, 'image/png');
    });
}
