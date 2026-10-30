/**
 * The page chrome modules may touch: the hint line, the screen-reader live
 * region, the overlay for DOM controls, the cursor.
 */

const hintEl = () => document.getElementById('desk-hint');
const liveEl = () => document.getElementById('desk-live');
const actionsEl = () => document.getElementById('desk-actions');

/** The quiet line at the bottom centre. Pass '' or null to clear. */
export function hint(text) {
    const el = hintEl();
    if (!el) return;
    const value = text ? String(text) : '';
    el.textContent = value;
    el.classList.toggle('is-empty', value === '');
}

let lastLive = '';
/**
 * The sr-only aria-live region: mirror the text of the item currently in view
 * (line + back), so a screen-reader visitor gets what a sighted one reads off
 * the object.
 */
export function live(text) {
    const el = liveEl();
    if (!el) return;
    const value = text ? String(text) : '';
    // Re-announce identical text by nudging it (live regions ignore no-ops).
    el.textContent = value === lastLive && value ? `${value}\u200b` : value;
    lastLive = value;
}

/** A fixed, full-viewport layer for DOM controls (pointer-events only on children). */
export function overlay() {
    return document.getElementById('desk-overlay');
}

/**
 * A small button in the bottom action row (e.g. "Save receipt"). Remove it
 * with `button.remove()` when your module leaves.
 */
export function addButton(label, onClick, { id, className = '', title } = {}) {
    const row = actionsEl();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `desk-button ${className}`.trim();
    button.textContent = label;
    if (id) button.id = id;
    if (title) button.title = title;
    button.addEventListener('click', (event) => {
        event.stopPropagation();
        try {
            onClick?.(event);
        } catch (error) {
            console.error(`[desk] button "${label}" failed`, error);
        }
    });
    row?.append(button);
    return button;
}

/** 'pointer' | 'grab' | null — the canvas cursor. */
export function setCursor(kind) {
    const canvas = document.getElementById('desk-canvas');
    if (canvas) canvas.style.cursor = kind || '';
}
