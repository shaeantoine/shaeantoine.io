import { createFootprintCanvas } from '../../scene/textureBudget.js';

/**
 * Canvas rendering for a printed page: turns a `pagination.js` page descriptor
 * into pixels on an actual `<canvas>`, and provides the layout numbers used
 * to compute those descriptors in the first place so pagination and drawing
 * never disagree about how much space a page holds.
 *
 * ONE OBJECT RENDERS ITS PAGES THROUGH HERE — the academic paper stack, via
 * sheetStrategy.js. `PAPER_STOCKS` used to hold three entries and separate
 * three objects; it holds one, and it is still a named stock rather than a set
 * of inlined constants because the stock is what decides the MEASURE.
 * `manuscript` runs two columns, and two columns are the single strongest
 * signal that a page came out of a printer rather than a bindery — readable as
 * a shape several seconds before any word on the page is.
 *
 * scene/sheetCanvas.js reads the same entry through `stockFor` for the resting
 * top sheet the stack shows before anyone focuses it. That is why the entry is
 * shared rather than duplicated: the paper, the ink and the rule under the
 * title block cannot drift between the sheet lying on the desk and the page
 * you turn once the camera is in close.
 *
 * THE STOCK DECIDES THE MEASURE, so pagination and drawing have to agree on
 * which stock they are working in — text measured in one face and drawn in
 * another overruns the margin by a few percent, which looks like a wrapping
 * bug and is not one. `pageSetupFor` resolves it once from the object's anchor
 * and hands the same layout to both; don't reach past it.
 */

export const PAGE_CANVAS_HEIGHT = 1400; // logical px — all layout constants below are in this space

const MARGIN = 90;
const HEADER_HEIGHT = 220;
const TITLE_FONT_SIZE = 56;
const CREDIT_FONT_SIZE = 28;
const FOOTER_FONT_SIZE = 24;

/**
 * The type metrics a stock does not override.
 *
 * NOTHING ON THE DESK RENDERS AT THESE NUMBERS. `manuscript` is the only stock
 * left and it sets all five itself, so every value below is shadowed — tune the
 * 40 here and no pixel moves. They are kept anyway, as the floor a second stock
 * would inherit: `metricsFor` merges a stock's partial override over this, and
 * that merge is the only written statement of what a new stock gets for free.
 * Folding the five values into `manuscript` and making `metricsFor` a straight
 * read is the cheaper shape and was rejected for exactly that reason — it
 * deletes the contract along with the numbers.
 *
 * WHY THE FLOOR SITS WHERE IT DOES. Page prose used to arrive at 9.4 CSS px on
 * a 900 px viewport — a little over half the 17 px the DOM panels beside it are
 * set in — which is most of why in-scene type read as poor next to the page
 * chrome. The fix was split between here and the focus cameras, deliberately,
 * and distance did the larger share: a reader leans in, and the shots were
 * standing further back than a person reading at their own desk would. At
 * 40/1400 the body is 2.9% of the page height, still close to the ~2.4% a 10 pt
 * face on A5 actually measures. Past roughly 44 it is not, and the page starts
 * reading as a large-print edition.
 *
 * Line height and paragraph spacing keep their ratios to the body size (1.40
 * and 0.65) so a page's colour does not change with its size.
 */
const BASE_METRICS = {
    bodyFontSize: 40,
    bodyLineHeight: 56,
    paragraphSpacing: 26,
    columns: 1,
    columnGutter: 0
};

const SERIF = 'Georgia, "Times New Roman", serif';

/**
 * @type {Record<string, {
 *   paper: string,
 *   text: string,
 *   muted: string,
 *   font: string,
 *   rule: string | null,
 *   metrics?: Partial<typeof BASE_METRICS>
 * }>}
 *
 * `rule` draws a hairline under the header on a work's first page. The paper
 * stack has one because that is what a title block on an academic printout
 * looks like. It stays nullable, and `drawPage`'s guard on it stays, even
 * though with one stock that sets a rule the null branch is unreachable today:
 * a stock whose pages have no masthead is what the nullability is for, and
 * scene/sheetCanvas.js already leans on the same field being optional.
 */
export const PAPER_STOCKS = {
    // The academic stack: laser paper, cool near-black, a rule under the title
    // block, and two columns. The columns are the whole tell — a reader knows
    // what they are looking at from the shape of the page, several seconds
    // before they have read a word of it, and no amount of restyling a single
    // column of prose gets there.
    //
    // 30 IS PINNED FROM BOTH SIDES, which is why it is not a round number
    // chosen to look tidy. It cannot go up: the stack's page is 988 logical px
    // wide, so after the two 90 px margins and the 52 px gutter each column
    // measures 378 — a narrow measure at any size, and at 30 px already at the
    // short end of what reads as a column rather than as a list. It cannot go
    // far down either, because small type is where the rest of the pipeline
    // hurts most: at around 19 device px/em an unhinted 400-weight stem
    // measures about 1.3 device pixels, so its two antialiasing ramps overlap
    // and no part of the stroke ever reaches full ink. Buying room on either
    // side would mean dropping to one column, and the two columns are the thing
    // that says "printout".
    //
    // At 30/1400 the body is 2.1% of the page height, against the ~2.4% a 10 pt
    // face on A5 measures.
    manuscript: {
        paper: '#fbfaf7',
        text: '#1d2024',
        muted: '#6b7078',
        font: SERIF,
        rule: 'rgba(29, 32, 36, 0.22)',
        metrics: { bodyFontSize: 30, bodyLineHeight: 41, paragraphSpacing: 17, columns: 2, columnGutter: 52 }
    }
};

/**
 * What an anchor with no `paper` gets, and what an unrecognised stock id
 * resolves to. Every anchor on the desk names its stock explicitly
 * (content/deskObjects.js), so in practice this only ever catches a typo — and
 * with one entry left there is nothing else it could honestly return.
 */
export const DEFAULT_PAPER_STOCK = 'manuscript';

export function stockFor(id) {
    return PAPER_STOCKS[id] ?? PAPER_STOCKS[DEFAULT_PAPER_STOCK];
}

/** A stock's type metrics, with everything it doesn't override filled in. */
export function metricsFor(id) {
    return { ...BASE_METRICS, ...(stockFor(id).metrics ?? {}) };
}

export function canvasWidthForAspect(aspect) {
    return Math.round(PAGE_CANVAS_HEIGHT * aspect);
}

/**
 * The backing canvas for one page, sized to the machine rather than to a
 * constant.
 *
 * sheetStrategy allocates two of these at once — the leaf you are reading and
 * the bed under it, already showing where a forward step lands — which is why
 * the old flat 3x hurt here more than anywhere else. The stack's page is
 * 988 x 1400 logical, so 3x was 2964 x 4200 apiece: 12.4 megapixels, about
 * 50 MB of RGBA each and 100 MB for the pair, to show one sheet of prose and
 * the one beneath it. See scene/textureBudget.js.
 *
 * `budget.framing` is the surface this one canvas covers on screen, measured
 * whole. The stack's is [0.607, 0.665] (content/deskObjects.js) and is not
 * divided by anything on the way in — there is no spread here to take a half
 * of, so nothing should be halving it.
 *
 * @param {number} logicalWidth
 * @param {number} logicalHeight
 * @param {{framing: [number, number], bufferHeight: number}} budget
 */
export function createPageCanvas(logicalWidth, logicalHeight, budget) {
    const { canvas } = createFootprintCanvas(logicalWidth, logicalHeight, budget);
    return canvas;
}

export function layoutForCanvas(canvasWidth, canvasHeight, stockId = DEFAULT_PAPER_STOCK) {
    return {
        contentWidth: canvasWidth - MARGIN * 2,
        contentHeight: canvasHeight - MARGIN * 2,
        headerHeight: HEADER_HEIGHT,
        ...metricsFor(stockId)
    };
}

/**
 * Everything an object's `focus.anchor` implies about the paper it is printed
 * on, resolved once.
 *
 * THE STOCK USED TO HAVE TO BE CHOSEN IN TWO PLACES AT ONCE — `buildItems`
 * measured the type and `mount` sized the canvas, and if they were handed
 * different stocks the text was measured in one face and drawn in another. The
 * symptom was lines a few percent past the margin, which looks like a wrapping
 * bug and is not one. Both callers take this instead, so there is only one
 * place left to get it wrong.
 *
 * @param {{ size: [number, number], paper?: string }} anchor
 */
export function pageSetupFor(anchor) {
    const stock = anchor.paper ?? DEFAULT_PAPER_STOCK;
    const canvasWidth = canvasWidthForAspect(anchor.size[0] / anchor.size[1]);
    return {
        stock,
        canvasWidth,
        canvasHeight: PAGE_CANVAS_HEIGHT,
        layout: {
            ...layoutForCanvas(canvasWidth, PAGE_CANVAS_HEIGHT, stock),
            measureWidth: createMeasurer(stock)
        }
    };
}

/**
 * Real canvas-backed text measurer for production use (tests inject their own).
 *
 * @param {string} [stockId] must match the stock `drawPage` is later called
 *        with — see the note at the top of this file.
 */
export function createMeasurer(stockId = DEFAULT_PAPER_STOCK) {
    const { font } = stockFor(stockId);
    const ctx = document.createElement('canvas').getContext('2d');
    return function measureWidth(text, fontSize) {
        ctx.font = `${fontSize}px ${font}`;
        return ctx.measureText(text).width;
    };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object | null} pageItem null draws a blank sheet — what lies under
 *        the last page of the stack
 * @param {string} [stockId]
 */
export function drawPage(canvas, pageItem, stockId = DEFAULT_PAPER_STOCK) {
    const stock = stockFor(stockId);
    const metrics = metricsFor(stockId);
    const ctx = canvas.getContext('2d');
    // Same logical-coordinate scheme as screenCanvas.js: the element is
    // allocated at a device-derived multiple of it (see scene/textureBudget.js)
    // and everything below draws in logical px.
    const scale = canvas.height / PAGE_CANVAS_HEIGHT;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const width = canvas.width / scale;
    const height = canvas.height / scale;

    ctx.fillStyle = stock.paper;
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // A blank sheet, and it is a live path rather than a defensive one:
    // sheetStrategy draws its bed from `pageAfter`, which returns null once
    // there is nothing past the top sheet. This is what lies under the last
    // page of the stack.
    if (!pageItem) return;

    // Where the body starts depends on whether a title block sits above it, and
    // it has to be known before anything is drawn — pagination sized the first
    // page against exactly this reservation, and the column loop below steps
    // down from it.
    const bodyTop = pageItem.isFirstPage ? MARGIN + HEADER_HEIGHT : MARGIN;

    if (pageItem.isFirstPage) {
        let y = MARGIN;
        ctx.font = `600 ${TITLE_FONT_SIZE}px ${stock.font}`;
        ctx.fillStyle = stock.text;
        y += TITLE_FONT_SIZE;
        ctx.fillText(pageItem.work.title, MARGIN, y);

        y += CREDIT_FONT_SIZE + 16;
        ctx.font = `italic ${CREDIT_FONT_SIZE}px ${stock.font}`;
        ctx.fillStyle = stock.muted;
        ctx.fillText(pageItem.work.editorial.credit, MARGIN, y);

        if (stock.rule) {
            const ruleY = MARGIN + HEADER_HEIGHT - metrics.bodyLineHeight;
            ctx.strokeStyle = stock.rule;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(MARGIN, ruleY);
            ctx.lineTo(width - MARGIN, ruleY);
            ctx.stroke();
        }
    }

    // The title block spans the page, so every column starts under it — which
    // is also the assumption pagination.js sizes a first page against.
    const contentWidth = width - MARGIN * 2;
    const columnWidth = (contentWidth - metrics.columnGutter * (metrics.columns - 1)) / metrics.columns;
    const columns = pageItem.columns ?? [pageItem.lines];

    ctx.font = `${metrics.bodyFontSize}px ${stock.font}`;
    ctx.fillStyle = stock.text;
    columns.forEach((lines, index) => {
        const x = MARGIN + index * (columnWidth + metrics.columnGutter);
        let y = bodyTop;
        for (const line of lines) {
            y += metrics.bodyLineHeight;
            ctx.fillText(line, x, y);
        }
    });

    ctx.font = `${FOOTER_FONT_SIZE}px ${stock.font}`;
    ctx.fillStyle = stock.muted;
    ctx.textAlign = 'center';
    ctx.fillText(String(pageItem.pageIndexInWork + 1), width / 2, height - MARGIN / 2);
}
