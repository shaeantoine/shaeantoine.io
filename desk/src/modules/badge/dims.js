import { BADGE_FRONT } from '../../content/lanyard.js';

/**
 * The badge's numbers (DOM-free, so the box's layout.js and node checks can
 * import them). See model.js for the object and its upright frame: origin at
 * the clip's tip, the holder's back in z = 0, face toward +Z, hanging down −Y.
 */

/** Holder, card and hardware, from lanyard.js's own chain (world units). */
const SLEEVE_W = 0.206;
const SLEEVE_D = 0.312;
const SLOT_D = 0.026;
const CARD_W = 0.19;
const CARD_H = 0.30;

/**
 * Where things are in the upright frame, at `thin` = the thickness scale (1
 * for the lanyard's own proportions; the box uses 0.5 — lanyard.js's 2.5 mm
 * card is a chunky stand-in for a real 0.76 mm CR80, and in a file of prints
 * the extra depth would push every sheet forward).
 */
export function badgeDims(thin = 1) {
    return Object.freeze({
        width: SLEEVE_W,
        /** Top of the punched slot's tabs (the badge's top edge), below the clip's tip. */
        slotTop: -(BADGE_FRONT - (SLEEVE_D / 2 + SLOT_D)),
        /** Top and bottom of the holder's body. */
        sleeveTop: -(BADGE_FRONT - SLEEVE_D / 2),
        bottom: -(BADGE_FRONT + SLEEVE_D / 2),
        /** The card's centre (y) and size: where a note on its back goes. */
        cardCentreY: -BADGE_FRONT,
        card: [CARD_W, CARD_H],
        /** The holder's back (z 0) to the card's face, and to the clip's lip (the thickest point). */
        face: 0.012 * thin,
        sleeve: 0.004 * thin,
        depth: 0.0158 * thin,
        /** Tip to foot. */
        length: BADGE_FRONT + SLEEVE_D / 2
    });
}

/** The corners of the badge's outline (upright frame, z = 0), for framing and clearance checks. */
export function badgeOutline(thin = 1) {
    const d = badgeDims(thin);
    const w = d.width / 2;
    return [[-w, d.slotTop], [w, d.slotTop], [w, d.bottom], [-w, d.bottom], [0, 0]];
}

/** lanyard.js args for a work.js entry's artifact (the same call work.js makes for it). */
export function lanyardArgs(work) {
    const card = work?.artifact?.parts?.find((part) => part.badge);
    if (!card) throw new Error(`no badge on ${work?.id ?? 'that work'}`);
    return { ...card.badge, cardColor: card.color };
}

