/**
 * The site's one palette. Every module draws with these so the desk has a
 * single voice — add a colour here rather than inline in a module.
 */
export const palette = Object.freeze({
    paper: '#f7f5ef',          // prints' borders, memo sheets, tags
    photoBack: '#efece4',      // the back of a photographic print
    kraft: '#b99a6e',          // the photo box
    maskingTape: '#e8dcc0',    // the box's label, anything taped
    ink: '#1f2a44',            // blue-black pen — everything Shae wrote by hand
    redPen: '#b3261e',         // margin notes, the "+311 days"
    sticky: '#f4e27a',         // sticky notes (v1). Renders olive in shade and cream in light: use stickyYellow
    // Sticky stock that reads sticky-note yellow AFTER ACES in this room: warmer
    // and with almost no blue, because ACES bleaches a blue-ish yellow to cream as
    // it brightens and a dim one is olive whatever its hue. Paint the note's canvas
    // with it and give the mesh core/paper.js stickyMaterial(), which lifts it to
    // the exposure where it comes out ≈ rgb(221, 201, 97) — see STICKY_LIGHT there.
    stickyYellow: '#ffd54a',
    matGreen: '#2f5d50',       // the bench's cutting mat
    receipt: '#fbfaf6',        // thermal paper
    receiptInk: '#262626',     // thermal print
    // Supporting tones, derived from the above for shading and rules.
    newsprint: '#efe9dc',      // re-typeset press clippings (the box's clippings)
    manila: '#e3cf9f',         // the bench's shipping tag
    manilaPatch: '#cdb07a',    // the tag's reinforcing ring
    receiptBack: '#efede6',    // the unprinted side of thermal paper
    newsInk: '#1c1c1a',
    pencil: '#6b6b66',
    shadow: 'rgba(20, 20, 20, 0.18)'
});
