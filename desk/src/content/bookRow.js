/**
 * The run of books along the back edge of the desk.
 *
 * WHY THIS IS GENERATED AND THE SHELF IS NOT. Every other arrangement in
 * deskObjects.js is written out longhand, deliberately, so each object's
 * position and lean stays a number someone can nudge. That argument holds for
 * three record sleeves. It inverts at forty-odd books: nobody tunes the
 * fourteenth spine from the left, they tune how thick books tend to be and how
 * much the heights vary. So the row takes those as parameters and lays itself
 * out, and the thing kept under version control is the distribution rather
 * than the result.
 *
 * DETERMINISTIC, NOT RANDOM. The jitter runs off a seeded generator, so the
 * same seed always produces the same shelf. A row that reshuffled on every
 * reload would be quietly unsettling — you would never be able to say what
 * your own desk looked like — and it would make the layout untestable. Change
 * `seed` to deal a different row; leave it alone and it stays put forever.
 *
 * WHAT IS AND IS NOT WORTH DETAIL HERE. At the establishing shot the monitor
 * hides roughly the middle 2.3 units of this row, so the books that actually
 * read are the flanks and the bookends at either end. These are placeholders:
 * coloured spines at plausible sizes, no titles, no texture. Their job is a
 * varied silhouette and a band of muted colour behind the monitor.
 */

/**
 * mulberry32 — a small, fast, well-distributed 32-bit PRNG.
 *
 * Written out rather than pulled in: it is nine lines, it has no dependencies,
 * and the alternative (Math.random) cannot be seeded, which is the one
 * property this module actually needs.
 */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Spine colours. Muted on purpose — the design system keeps one saturated
 * accent, and forty bright spines would become the loudest thing in the room
 * by a wide margin. These read as cloth and board bindings: the variation
 * people notice on a bookshelf is value and warmth, not hue.
 */
const SPINE_COLORS = [
    '#4a4238', '#2f3a35', '#6b4a3a', '#3b3f4a', '#7d7364',
    '#2b2b2e', '#5c4a52', '#8a8069', '#39463f', '#6e5a45',
    '#454d57', '#a1937c'
];

export const BOOK_ROW_DEFAULTS = {
    // Thickness along the row. A paperback is about 0.02 m and a hardback
    // 0.05 m, which at surfaces.js's 3.2 units/m is 0.064 to 0.16.
    minThickness: 0.065,
    maxThickness: 0.155,
    // Floor for a book that carries a title. Lettering runs down the spine and
    // its cap height is capped by the spine's width, so the thinnest books in
    // the range would render their titles as a grey smear. Raising the floor
    // only for lettered books keeps the unlettered ones varied.
    titledMinThickness: 0.098,
    // Spine height. Trade paperbacks through to a few oversized art books.
    minHeight: 0.44,
    maxHeight: 0.70,
    // Front-to-back. Narrower than the books are tall, as books are.
    minDepth: 0.30,
    maxDepth: 0.40,
    // Books in a packed row touch. This is the slack that keeps them from
    // z-fighting where two flat faces meet, not a visible gap.
    spacing: 0.004,
    // Radians of yaw. Enough that the row is not a machined block; small
    // enough that no book looks like it is falling over.
    maxYaw: 0.035,
    // Lettered books are the ones anyone will look at, so they stand straighter
    // — a title on a spine yawed far enough to notice reads as a mistake.
    titledMaxYaw: 0.012
};

/**
 * Lays out a run of upright books between two x positions.
 *
 * Books are packed from `from` towards `to` and the run stops before
 * overshooting, so the last gap is whatever is left rather than a book
 * sticking out past the bookend. Every book rests on the desktop — y is half
 * its own height — so the row sits flat however the heights come out.
 *
 * TITLES GO WHERE THEY CAN BE SEEN. `occluded` is the span of x the monitor
 * hides at the establishing shot. Books whose centre lands inside it stay
 * plain, and `titles` is handed out, in order, to the ones outside — so the
 * list is spent on spines that are actually in view and runs out long before
 * the row does. Pass no titles and the whole row is placeholders again.
 *
 * @param {object} options
 * @param {number} options.from  x of the left end of the run
 * @param {number} options.to    x of the right end of the run
 * @param {number} options.z     centre of the row, front to back
 * @param {number} options.seed  any integer; the same one always deals the same row
 * @param {{title: string, author?: string}[]} [options.titles] lettered spines, in order
 * @param {[number, number]} [options.occluded] x span hidden behind the monitor
 * @returns {object[]} desk-object `parts`, ready to drop into a layout
 */
export function buildBookRow({ from, to, z, seed, titles = [], occluded = null, ...overrides }) {
    const config = { ...BOOK_ROW_DEFAULTS, ...overrides };
    const random = mulberry32(seed);
    const between = (min, max) => min + random() * (max - min);
    const hidden = (x) => occluded !== null && x >= occluded[0] && x <= occluded[1];

    const books = [];
    let next = 0;
    let x = from;

    while (true) {
        let thickness = between(config.minThickness, config.maxThickness);
        const height = between(config.minHeight, config.maxHeight);
        const depth = between(config.minDepth, config.maxDepth);
        const yaw = random() * 2 - 1;
        const colorPick = random();

        // Decided on the un-widened centre, then widened — so a book cannot be
        // handed a title on the strength of a position it is then nudged out of.
        // The widening only ever moves it further right, which is away from the
        // occluded span for everything on the right-hand flank and, on the left
        // flank, is bounded by the assertion in the tests.
        const spine = !hidden(x + thickness / 2) && next < titles.length ? titles[next] : null;
        if (spine) thickness = Math.max(thickness, config.titledMinThickness);
        if (x + thickness > to) break;

        const color = SPINE_COLORS[Math.floor(colorPick * SPINE_COLORS.length)];
        const book = {
            type: 'box',
            args: [thickness, height, depth],
            position: [x + thickness / 2, height / 2, z],
            rotation: [0, yaw * (spine ? config.titledMaxYaw : config.maxYaw), 0],
            color,
            // Cloth and paper — matte, and picking up little of the window.
            // Left glossier they read as plastic, which is the single tell
            // that gives away a row of primitives pretending to be books.
            material: { roughness: 0.88, metalness: 0, envMapIntensity: 0.85 }
        };
        if (spine) {
            book.spine = spine;
            next++;
        }
        books.push(book);

        x += thickness + config.spacing;
    }

    return books;
}
