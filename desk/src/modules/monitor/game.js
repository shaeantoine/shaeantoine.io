/**
 * Catch The Dot — the whole game, with no DOM and no three in it (node can run
 * it). One dot drifts; catching it makes it hop somewhere far away. That is
 * the game. No second feature, no roadmap.
 *
 * The drift is a heading that wanders by DISTANCE travelled rather than by
 * time, so the path has the same gentle curvature whether the dot is idling at
 * 26 px/s from across the room or moving at 120 px/s under the pointer. Walls
 * and the sticky note reflect it.
 */

export function createDotGame({ field, radius, hitRadius, start, rng }) {
    const phaseA = rng() * Math.PI * 2;
    const phaseB = rng() * Math.PI * 2;
    const state = {
        x: start.x,
        y: start.y,
        heading: start.heading ?? rng() * Math.PI * 2,
        speed: 0,
        travelled: 0,
        hop: null // { fromX, fromY, toX, toY, progress }
    };

    // Curvature (radians per screen px): at most ~1/320, so turning circles are
    // never tighter than ~320 px — about a third of the screen's height.
    function curvature(distance) {
        return (0.62 * Math.sin(distance / 430 + phaseA) + 0.38 * Math.sin(distance / 170 + phaseB)) / 320;
    }

    function reflectOffWalls() {
        let vx = Math.cos(state.heading);
        let vy = Math.sin(state.heading);
        let bounced = false;
        if (state.x < field.minX) { state.x = field.minX + (field.minX - state.x); vx = Math.abs(vx); bounced = true; }
        if (state.x > field.maxX) { state.x = field.maxX - (state.x - field.maxX); vx = -Math.abs(vx); bounced = true; }
        if (state.y < field.minY) { state.y = field.minY + (field.minY - state.y); vy = Math.abs(vy); bounced = true; }
        if (state.y > field.maxY) { state.y = field.maxY - (state.y - field.maxY); vy = -Math.abs(vy); bounced = true; }
        for (const rect of field.exclusions ?? []) {
            if (state.x <= rect.x0 || state.x >= rect.x1 || state.y <= rect.y0 || state.y >= rect.y1) continue;
            // Out along whichever side it went in least far.
            const depths = [
                { axis: 'x', sign: -1, depth: state.x - rect.x0 },
                { axis: 'x', sign: 1, depth: rect.x1 - state.x },
                { axis: 'y', sign: -1, depth: state.y - rect.y0 },
                { axis: 'y', sign: 1, depth: rect.y1 - state.y }
            ].filter((d) => Number.isFinite(d.depth)).sort((a, b) => a.depth - b.depth);
            const exit = depths[0];
            if (exit.axis === 'x') {
                state.x += exit.sign * (exit.depth + 0.5);
                vx = exit.sign * Math.abs(vx);
            } else {
                state.y += exit.sign * (exit.depth + 0.5);
                vy = exit.sign * Math.abs(vy);
            }
            bounced = true;
        }
        if (bounced) state.heading = Math.atan2(vy, vx);
    }

    function inField(x, y, margin = 0) {
        if (x < field.minX + margin || x > field.maxX - margin || y < field.minY + margin || y > field.maxY - margin) return false;
        return !(field.exclusions ?? []).some((r) => x > r.x0 - margin && x < r.x1 + margin && y > r.y0 - margin && y < r.y1 + margin);
    }

    return {
        state,

        get x() { return state.x; },
        get y() { return state.y; },
        get speed() { return state.speed; },
        get hopping() { return state.hop !== null; },

        /**
         * Advance `dt` seconds, easing the speed toward `targetSpeed` (px/s).
         * @returns {boolean} whether the dot moved
         */
        step(dt, targetSpeed) {
            if (state.hop || !(dt > 0)) return false;
            // ~0.5 s time constant: the dot glides to a stop and picks up again, never lurches.
            state.speed += (targetSpeed - state.speed) * (1 - Math.exp(-dt / 0.5));
            if (targetSpeed === 0 && state.speed < 0.5) state.speed = 0;
            if (state.speed === 0) return false;
            const distance = state.speed * dt;
            state.heading += curvature(state.travelled) * distance;
            state.travelled += distance;
            state.x += Math.cos(state.heading) * distance;
            state.y += Math.sin(state.heading) * distance;
            reflectOffWalls();
            return true;
        },

        /** Whether a click at screen px (x, y) catches it. Not while it is in the air. */
        hitTest(x, y) {
            if (state.hop) return false;
            return Math.hypot(x - state.x, y - state.y) <= hitRadius;
        },

        /** Somewhere far away: at least 40% of the field's diagonal off, and clear of everything. */
        pickHopTarget() {
            const diagonal = Math.hypot(field.maxX - field.minX, field.maxY - field.minY);
            let best = null;
            for (let i = 0; i < 24; i += 1) {
                const x = field.minX + rng() * (field.maxX - field.minX);
                const y = field.minY + rng() * (field.maxY - field.minY);
                if (!inField(x, y, radius * 0.5)) continue;
                const distance = Math.hypot(x - state.x, y - state.y);
                if (distance >= diagonal * 0.4) return { x, y };
                if (!best || distance > best.distance) best = { x, y, distance };
            }
            return best ? { x: best.x, y: best.y } : { x: (field.minX + field.maxX) / 2, y: (field.minY + field.maxY) / 2 };
        },

        beginHop(to) {
            state.hop = { fromX: state.x, fromY: state.y, toX: to.x, toY: to.y, progress: 0 };
        },

        /** `eased` 0..1 along the hop. Returns the hop's height (0 at both ends, 1 mid-air). */
        setHopProgress(eased) {
            const hop = state.hop;
            if (!hop) return 0;
            hop.progress = eased;
            state.x = hop.fromX + (hop.toX - hop.fromX) * eased;
            state.y = hop.fromY + (hop.toY - hop.fromY) * eased;
            return 4 * eased * (1 - eased);
        },

        /** Lands the hop (wherever it had got to) and sets off in a fresh direction, from rest. */
        endHop() {
            const hop = state.hop;
            if (!hop) return;
            state.x = hop.toX;
            state.y = hop.toY;
            state.hop = null;
            state.heading = rng() * Math.PI * 2;
            state.speed = 0;
        },

        placeAt(x, y, heading = state.heading) {
            state.x = x;
            state.y = y;
            state.heading = heading;
            state.hop = null;
        }
    };
}
