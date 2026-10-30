/**
 * MONITOR v9 — the home page's scroll, as numbers: DOM-free, three-free, so
 * node can drive it. windows.js owns one of these per page and turns its
 * `y` into a texture offset (never a repaint); index.js feeds it input.
 *
 *   y        the page px at the top of the window's body (0 = part 1)
 *   target   where it is heading. A wheel moves the target; a drag moves y
 *            itself; keys, the snap and "Click me!" set a section's top.
 *   step(ms) a critically damped spring toward the target (exact, so any
 *            frame rate gives the same path); a released drag keeps its
 *            velocity into it — the gentle inertia. Returns whether it moved.
 *   snap     once input stops (a wheel quiet for SNAP_QUIET_MS, a drag let
 *            go), the target goes to a section's top: the next one in the
 *            direction of travel once the page has moved SNAP_THRESHOLD of a
 *            section, else back where it started; past a whole section, the
 *            nearest.
 *
 * `instant` (still, reduced motion) skips the spring: y lands on the target.
 */

/** The spring's stiffness, 1/s: most of the way in ~0.25 s, at rest by ~0.6 s for a whole section. */
export const SPRING = 15;
/** How long a wheel must be quiet before the page snaps (trackpads keep sending momentum until they stop). */
export const SNAP_QUIET_MS = 150;
/** How far into the next section (fraction of one) a gesture must carry to go on to it. */
export const SNAP_THRESHOLD = 0.12;
/** A released drag's velocity is counted this long ahead when choosing where to snap (s). */
const THROW_S = 0.22;
const MAX_VELOCITY = 4200; // page px / s
const REST_PX = 0.4;
const REST_V = 10;

export function createScroll({ viewH, sections = 3, instant = false, now = () => performance.now() }) {
    const max = viewH * (sections - 1);
    const clamp = (v) => Math.min(max, Math.max(0, v));
    const s = {
        viewH,
        sections,
        max,
        y: 0,
        v: 0,
        target: 0,
        dragging: false,
        /** Where the current gesture started (y), for the snap's direction; null between gestures. */
        from: null,
        /** A wheel gesture waiting to snap: the time of its last event. */
        wheelAt: null,
        instant
    };

    const begin = () => { if (s.from === null) s.from = s.y; };

    /** The section whose top is nearest y. */
    s.section = (y = s.y) => Math.max(0, Math.min(sections - 1, Math.round(y / viewH)));
    /** Resting exactly on a section's top, with nothing pending. */
    s.atRest = () => !s.dragging && s.wheelAt === null && s.y === s.target && s.v === 0 && s.y % viewH === 0;
    s.moving = () => !s.atRest();

    /** Straight to y (no spring, no snap): a state's deep link, a layout change. */
    s.jump = (y) => {
        s.y = s.target = clamp(y);
        s.v = 0;
        s.dragging = false;
        s.from = null;
        s.wheelAt = null;
    };

    /** Heads for section i (keys, "Click me!", the room). */
    s.toSection = (i) => {
        s.from = null;
        s.wheelAt = null;
        s.dragging = false;
        s.target = clamp(Math.round(i) * viewH);
        if (s.instant) s.jump(s.target);
    };

    /** A wheel event, in page px (positive: down the page). */
    s.wheel = (dy) => {
        if (!dy) return;
        begin();
        s.dragging = false;
        s.target = clamp(s.target + dy);
        s.wheelAt = now();
        if (s.instant) { s.y = s.target; s.v = 0; }
    };

    s.dragStart = () => {
        begin();
        s.dragging = true;
        s.wheelAt = null;
        s.target = s.y;
        s.v = 0;
    };
    /** The finger has carried the page to y (page px at the top of the window's body). */
    s.dragTo = (y) => {
        s.y = s.target = clamp(y);
    };
    /** Let go at velocity v (page px / s, positive: down the page). */
    s.dragEnd = (v = 0) => {
        if (!s.dragging) return;
        s.dragging = false;
        const vel = s.instant ? 0 : Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, v));
        s.v = vel;
        snapFrom(s.y + vel * THROW_S, Math.abs(vel) > 150 ? Math.sign(vel) : 0);
        if (s.instant) s.jump(s.target);
    };

    /** Where a gesture that has reached `pos` (page px) comes to rest. */
    function snapFrom(pos, dirHint = 0) {
        const from = s.from ?? s.y;
        const dir = dirHint || Math.sign(pos - from);
        const p = clamp(pos) / viewH;
        const f = from / viewH;
        let i;
        if (Math.abs(p - f) >= 1 || dir === 0) i = Math.round(p);
        else if (dir > 0) i = Math.floor(p + 1 - SNAP_THRESHOLD);
        else i = Math.ceil(p - 1 + SNAP_THRESHOLD);
        s.target = clamp(i * viewH);
        s.from = null;
        s.wheelAt = null;
    }
    s.snapFrom = snapFrom;

    /** Advances `ms`. Returns true if y changed. */
    s.step = (ms) => {
        if (s.wheelAt !== null && !s.dragging && now() - s.wheelAt >= SNAP_QUIET_MS) snapFrom(s.target);
        if (s.dragging) return false;
        if (s.instant) {
            const moved = s.y !== s.target;
            s.y = s.target;
            s.v = 0;
            return moved;
        }
        const x0 = s.y - s.target;
        if (Math.abs(x0) < REST_PX && Math.abs(s.v) < REST_V) {
            const moved = s.y !== s.target;
            s.y = s.target;
            s.v = 0;
            return moved;
        }
        const t = Math.max(0, ms) / 1000;
        const w = SPRING;
        const e = Math.exp(-w * t);
        const b = s.v + w * x0;
        const x = (x0 + b * t) * e;
        s.v = (s.v - w * b * t) * e;
        const y = s.target + x;
        const c = clamp(y);
        if (c !== y) s.v = 0; // the ends are hard
        s.y = c;
        return true;
    };

    return s;
}
