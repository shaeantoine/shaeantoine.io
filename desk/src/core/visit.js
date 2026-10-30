import { deterministic, now } from './flags.js';

/**
 * The visit, as the room remembers it: when you arrived, what you picked up,
 * how many times you've been. The printer's receipt reads it; any module that
 * lets the visitor pick something up calls `visit.log(title)`.
 *
 * Under ?still=1 (and ?film=1) the numbers are fixed so screenshots are
 * identical: 4m 12s at the desk, 2 visits. The log itself is whatever this load has recorded (a
 * module's trail() should log what it lays out).
 */

const STILL_ELAPSED_MS = 4 * 60 * 1000 + 12 * 1000;
const STILL_VISITS = 2;
const VISITS_KEY = 'shae-desk:visits';

const startedAtMs = deterministic ? now().getTime() - STILL_ELAPSED_MS : Date.now();
const picked = [];
const listeners = new Set();

let visitCount = STILL_VISITS;
if (!deterministic) {
    try {
        visitCount = Number(window.localStorage.getItem(VISITS_KEY) || 0) + 1;
        window.localStorage.setItem(VISITS_KEY, String(visitCount));
    } catch {
        visitCount = 1; // storage blocked (private mode, file://) — this is a first visit
    }
}

function emit() {
    for (const listener of [...listeners]) {
        try { listener(snapshot()); } catch (error) { console.error('[desk:visit] listener threw', error); }
    }
}

/** Record that the visitor picked something up. Titles are de-duplicated, order kept. */
function log(title) {
    if (!title || picked.includes(title)) return false;
    picked.push(title);
    emit();
    return true;
}

function elapsedMs() {
    return deterministic ? STILL_ELAPSED_MS : Date.now() - startedAtMs;
}

/** "4m 12s" */
function formatElapsed(ms = elapsedMs()) {
    const total = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function snapshot() {
    return {
        startedAt: new Date(startedAtMs),
        elapsedMs: elapsedMs(),
        elapsed: formatElapsed(),
        picked: [...picked],
        count: picked.length,
        visits: visitCount
    };
}

export const visit = {
    startedAt: new Date(startedAtMs),
    log,
    picked: () => [...picked],
    count: () => picked.length,
    elapsedMs,
    formatElapsed,
    visits: () => visitCount,
    snapshot,
    /** cb(snapshot) whenever something is logged. Returns an unsubscribe. */
    onChange(cb) {
        listeners.add(cb);
        return () => listeners.delete(cb);
    }
};
