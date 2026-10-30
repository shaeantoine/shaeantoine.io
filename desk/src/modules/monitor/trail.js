/**
 * The path the dot has drifted along, for its trail — no DOM, no three (node
 * can run it). Points are kept newest first, one every `sample` screen px, and
 * only as far back as the trail reaches; `embers(x, y)` walks back along the
 * path from where the dot is now and puts ember i at exactly i x `spacing` px
 * of arc behind it, so the trail slides smoothly rather than stepping from one
 * recorded point to the next.
 */

export function createTrailPath({ count, spacing, sample = 4 }) {
    const reach = count * spacing + sample * 2;
    let points = []; // newest first, screen px

    function trim() {
        let length = 0;
        for (let i = 1; i < points.length; i += 1) {
            length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
            if (length > reach) {
                points.length = i + 1;
                return;
            }
        }
    }

    return {
        get points() { return points; },

        /** Forget the path; the dot is at (x, y) (after a hop lands). */
        reset(x, y) {
            points = [{ x, y }];
        },

        /** A path it has already travelled, nearest the dot first (the still-mode pre-roll). */
        seed(nearestFirst) {
            points = nearestFirst.map(({ x, y }) => ({ x, y }));
            trim();
        },

        /** Where the dot is now. Recorded once it is `sample` px from the last point. */
        record(x, y) {
            const head = points[0];
            if (head && Math.hypot(x - head.x, y - head.y) < sample) return false;
            points.unshift({ x, y });
            trim();
            return true;
        },

        /**
         * The embers for a dot at (x, y): `count` entries { x, y, t, on }, t = i / (count + 1)
         * along the trail; `on` false where the path does not reach that far back yet.
         */
        embers(x, y) {
            const out = [];
            let px = x;
            let py = y;
            let walked = 0; // arc length from the dot to (px, py)
            let k = 0; // next path point
            for (let i = 1; i <= count; i += 1) {
                const want = i * spacing;
                let placed = null;
                while (k < points.length) {
                    const q = points[k];
                    const seg = Math.hypot(q.x - px, q.y - py);
                    if (walked + seg >= want && seg > 0) {
                        const f = (want - walked) / seg;
                        placed = { x: px + (q.x - px) * f, y: py + (q.y - py) * f };
                        break;
                    }
                    walked += seg;
                    px = q.x;
                    py = q.y;
                    k += 1;
                }
                out.push(placed
                    ? { ...placed, t: i / (count + 1), on: true }
                    : { x, y, t: i / (count + 1), on: false });
            }
            return out;
        }
    };
}
