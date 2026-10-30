/**
 * The bench's words, verbatim from Shae (v4). Nothing here may be added to
 * without Shae: the threads' lines are theirs, the rest is labels.
 */

/** Threads: a handwritten line + a drawn arrow; click to follow. */
export const THREADS = Object.freeze({
    tag: Object.freeze({
        line: 'Caring what a model costs to run, from the other end of the scale.',
        label: 'the monitor',
        to: '#monitor/mlx'
    }),
    phone: Object.freeze({
        line: 'The same argument, one layer down the stack and considerably more personal.',
        label: 'the board',
        to: '#bench/eeg'
    })
});

/** The note on the scope (a sticky, in Shae's hand): the visible "this is illustrative". */
export const SCOPE_NOTE = 'your cursor is standing in for your eyes';

/** The phone: the home screen's line (set in Inter, on the screen) and the note beside it (in hand). */
export const PHONE_SCREEN_LINE = 'LineageOS, extended to collect my own data at the kernel.';
export const PHONE_NOTE_TEXT = 'The dumb-phone movement, plus AI: a way to rely on my phone less. I still believe in that.';

/**
 * The phone's OS (phoneos.js): Shae's idea — "the dumb-phone movement, plus
 * AI" on "LineageOS, extended to collect my own data at the kernel" —
 * sketched as screens. Shae's own lines are PHONE_NOTE_TEXT and
 * PHONE_SCREEN_LINE above. Everything below is UI labels and the sketch's
 * placeholder content: generic, no facts, and each sketch says it is one
 * ("an illustrative day", "the idea, sketched — not a shipped feature").
 * Shae to approve.
 */
export const OS = Object.freeze({
    apps: Object.freeze({ log: 'log', assistant: 'assistant', camera: 'camera', notes: 'notes', about: 'about' }),
    log: Object.freeze({
        heading: 'what the kernel saw today',
        pickups: 'pickups',
        opens: 'app opens',
        now: 'now',
        total: (n) => `picked up ${n} time${n === 1 ? '' : 's'}`,
        opened: (n) => `${n} app open${n === 1 ? '' : 's'}`,
        illustrative: 'an illustrative day'
    }),
    assistant: Object.freeze({
        heldUntil: (label) => `held until ${label}`,
        calm: 'nothing urgent',
        // The held sources and, let through, what they were holding. Generic.
        sources: Object.freeze([
            Object.freeze({ name: 'messages', count: 3, detail: '3 messages, 2 conversations' }),
            Object.freeze({ name: 'email', count: 7, detail: '7 new, none flagged' }),
            Object.freeze({ name: 'news', count: 12, detail: '12 headlines' }),
            Object.freeze({ name: 'calendar', count: 1, detail: '1 reminder, for tomorrow' })
        ]),
        release: 'let them through',
        hold: 'hold them again',
        sketch: 'the idea, sketched — not a shipped feature'
    }),
    camera: Object.freeze({ roll: 'camera roll' }),
    about: Object.freeze({
        name: 'LineageOS · built by Shae',
        line: 'extended to collect my own data at the kernel',
        logging: (on) => `kernel logging: ${on ? 'on' : 'off'}`
    })
});

/** Three of Shae's photos (src/media) for the camera's fallback gallery. */
export const CAMERA_ROLL = Object.freeze(['amazon_first_day', 'safety_culture_hackathon', 'eeg']);

/** The organiser's drawer labels, top to bottom (masking tape, handwritten), and the slip in "next". */
export const DRAWER_LABELS = Object.freeze({
    resistors: 'resistors',
    jumpers: 'jumper wires',
    headers: 'headers',
    electrodes: 'electrodes',
    next: 'next'
});
export const NEXT_SLIP = '?';

/** The classifier's readout on the scope. */
export const READOUT = Object.freeze({ left: 'LEFT', right: 'RIGHT', none: '—' });
