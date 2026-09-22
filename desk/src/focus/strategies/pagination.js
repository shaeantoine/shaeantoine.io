/**
 * Pure text-layout for printed pages: splits a work's paragraphs into
 * lines that fit one column of `layout.contentWidth`, then breaks those lines
 * into columns and pages that fit `layout.contentHeight` (minus header space
 * on a work's first page). `layout.measureWidth(text, fontSize)` is injected
 * so this stays canvas/DOM-free and testable with a fake measurer.
 *
 * COLUMNS ARE WHAT SEPARATE A PAPER FROM A BOOK. `layout.columns` defaults to
 * 1, which is what a bound object would take. Nothing on this desk is bound any
 * more — the only object that paginates is the academic printout stack, and it
 * sets 2. That single number is most of what makes its pages read as something
 * that came out of a printer rather than something that was bound, long before
 * any word on them is legible. The 1-column default is kept rather than removed
 * because it is the neutral case this module is defined against, and because
 * `wrapLines` is also used on its own by the screen and idle canvases, which
 * genuinely are single-column. A page holds `columns` worth
 * of lines, and the first page's title block shortens all of them, because a
 * title block spans the page rather than sitting in the first column.
 */

/** Greedy word-wrap: packs words onto a line until the next one would overflow `maxWidth`. */
export function wrapLines(text, { measureWidth, maxWidth }) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';

    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (!current || measureWidth(candidate) <= maxWidth) {
            current = candidate;
        } else {
            lines.push(current);
            current = word;
        }
    }
    if (current) lines.push(current);
    return lines;
}

/**
 * @returns {{
 *   pageIndexInWork: number,
 *   totalPagesInWork: number,
 *   isFirstPage: boolean,
 *   columns: string[][],
 *   lines: string[]
 * }[]} `columns` is what drawing reads; `lines` is the same content flattened,
 *      which is what "how much is on this page" questions want.
 */
export function paginateWork(work, layout) {
    const {
        contentWidth,
        contentHeight,
        bodyFontSize,
        bodyLineHeight,
        paragraphSpacing,
        headerHeight,
        measureWidth,
        columns = 1,
        columnGutter = 0
    } = layout;
    // Wrapping is to ONE column, not to the content width. Measuring against
    // the full width and then drawing in halves is the bug this exists to make
    // impossible, and its symptom is every line overrunning its column.
    const columnWidth = (contentWidth - columnGutter * (columns - 1)) / columns;
    const measureAtBodySize = (text) => measureWidth(text, bodyFontSize);

    const taggedLines = [];
    work.editorial.body.forEach((paragraph, paragraphIndex) => {
        const lines = wrapLines(paragraph, { measureWidth: measureAtBodySize, maxWidth: columnWidth });
        lines.forEach((text, lineIndex) => {
            taggedLines.push({ text, startsParagraph: lineIndex === 0 && paragraphIndex > 0 });
        });
    });

    const pages = [];
    let pageColumns = [[]];
    let usedHeight = 0;
    let pageIndex = 0;

    function availableHeight() {
        return pageIndex === 0 ? contentHeight - headerHeight : contentHeight;
    }

    for (const line of taggedLines) {
        const lineHeight = bodyLineHeight + (line.startsParagraph ? paragraphSpacing : 0);
        const currentColumn = pageColumns[pageColumns.length - 1];
        if (currentColumn.length > 0 && usedHeight + lineHeight > availableHeight()) {
            usedHeight = 0;
            if (pageColumns.length === columns) {
                pages.push(pageColumns);
                pageColumns = [[]];
                pageIndex += 1;
            } else {
                pageColumns.push([]);
            }
        }
        pageColumns[pageColumns.length - 1].push(line.text);
        usedHeight += lineHeight;
    }
    if (pageColumns.some((column) => column.length > 0) || pages.length === 0) pages.push(pageColumns);

    const totalPagesInWork = pages.length;
    return pages.map((pageContent, index) => ({
        pageIndexInWork: index,
        totalPagesInWork,
        isFirstPage: index === 0,
        columns: pageContent,
        lines: pageContent.flat()
    }));
}

/** Flattens every work's pages into one ordered deck, each item tagged with its source `work`. */
export function buildPageDeck(works, layout) {
    return works.flatMap((work) => paginateWork(work, layout).map((page) => ({ work, ...page })));
}
