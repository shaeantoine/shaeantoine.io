/**
 * What time it is in the room.
 *
 * The desk is lit by one motivated source — a window off to the left — and
 * every knob that describes it is a constant (see lighting.js, room.js, and
 * DeskScene's renderer setup). This module turns that single fixed set of
 * constants into four, chosen from the visitor's own clock, so the room is
 * genuinely different at 11pm than it is at 9am. That difference is the whole
 * point: a desk that looks identical on every visit reads as a product shot,
 * and one that tracks the day reads as somewhere a person actually sits.
 *
 * WHAT VARIES AND WHAT DOES NOT. The window is architecture: WINDOW_POSITION
 * and the opening cut into the left wall are fixed, because a hole in a wall
 * does not move at dusk. What varies is weather — the beam's aim, its colour
 * and intensity, what the environment map sees, and at night whether the
 * window is the key light at all. Moving the window instead would slide the
 * opening along the wall between visits and, at a high enough sun, push the
 * beam through solid plaster (room.js warns about exactly this).
 *
 * HOW FAR THE BEAM MAY BE AIMED. BEAM_ANGLE is a tight 0.3 rad and the desk
 * already sits 0.16 rad off-axis, so there is only ~0.14 rad of slack before
 * the desk starts falling out of the cone and the scene goes dark. The targets
 * below move the pool of light by ~1 unit, which works out to 0.035 rad
 * (morning) and 0.052 rad (evening) off the midday axis — a visible shift of
 * the lit patch across the desk, comfortably inside the slack. Retune these
 * upward and that is the budget being spent.
 *
 * EVERY NUMBER BELOW EXCEPT `day` NEEDS AN EYES-ON PASS. `day` is the set that
 * was tuned against the real render, and it is reproduced here unchanged so
 * that midday is a guaranteed no-op. The other three are derived from it by
 * reasoning about what changes — lower sun, warmer or cooler, dimmer, more or
 * less sky — not by having been looked at. Load the page with `?time=morning`
 * (and `evening`, `night`) and expect to move things.
 *
 * `art` is the exception to the exception: it is new in every preset, because
 * the poster wall it lights is new. It stays on around the clock — a picture
 * light usually does — and climbs after dark, where it and the monitor are
 * most of what is left. See ART_LIGHT_* in lighting.js for the geometry it
 * feeds; only colour and intensity vary by hour.
 */

/**
 * Longhand rather than merged over a base. Four complete sets is more text,
 * but a preset you can read top to bottom is one you can tune; a preset
 * expressed as a diff against midday means holding two tables in your head to
 * answer "what colour is the sky at dusk".
 */
export const TIME_PRESETS = {
    morning: {
        id: 'morning',
        label: 'Morning',
        background: 0x211f1e,
        exposure: 1.0,
        environmentIntensity: 0.95,
        // Low and long: the sun is aimed further into the room and below the
        // desktop, so the beam rakes across the desk and spills onto the floor
        // rather than pooling on the surface.
        sun: { color: 0xf6f3ee, intensity: 680, target: { x: 0.8, y: -0.9, z: -0.5 }, castShadow: true },
        overhead: null,
        bounce: { color: 0xf2f2f0, intensity: 0.16 },
        art: { color: 0xfff4e6, intensity: 8 },
        sky: { color: 0xd4e4ff, intensity: 5.5 },
        env: {
            shell: { color: 0x27251f, intensity: 1 },
            windowPanel: { color: 0xe8f0ff, intensity: 4.8 },
            wallBounce: { color: 0xf7f4f0, intensity: 2.3 },
            floorBounce: { color: 0xffd9a8, intensity: 0.5 },
            ceiling: { color: 0xd0dcf0, intensity: 0.4 }
        }
    },

    // The tuned set. Reproduced verbatim from what lighting.js, room.js and
    // DeskScene.js shipped with, so that the common case is bit-identical to
    // the scene as it was before any of this existed — `art` excepted, since
    // there was nothing on the wall to light back then.
    day: {
        id: 'day',
        label: 'Midday',
        background: 0x24211e,
        exposure: 1.0,
        environmentIntensity: 0.9,
        sun: { color: 0xfff2e2, intensity: 780, target: { x: 0.2, y: 0, z: 0 }, castShadow: true },
        overhead: null,
        bounce: { color: 0xf2f2f0, intensity: 0.16 },
        art: { color: 0xfff4e6, intensity: 8 },
        sky: { color: 0xdce8ff, intensity: 5 },
        env: {
            shell: { color: 0x2a2724, intensity: 1 },
            windowPanel: { color: 0xeef3fb, intensity: 4.5 },
            wallBounce: { color: 0xf7f4f0, intensity: 2.4 },
            floorBounce: { color: 0xffd9a8, intensity: 0.6 },
            ceiling: { color: 0xc8d4e4, intensity: 0.35 }
        }
    },

    evening: {
        id: 'evening',
        label: 'Evening',
        background: 0x26201b,
        exposure: 1.0,
        environmentIntensity: 0.9,
        // Aimed high and back, which is the late-afternoon tell: the patch of
        // light leaves the desk and climbs the back wall. Warmer than midday,
        // but only by a little — the note on createDaylight in lighting.js is
        // about this exact trap, where a deep amber key splits the room by hue
        // and the back and right walls read as two different paints.
        sun: { color: 0xffdfc0, intensity: 620, target: { x: -0.3, y: 0.9, z: 0.6 }, castShadow: true },
        overhead: null,
        bounce: { color: 0xf4efe8, intensity: 0.18 },
        art: { color: 0xffeacd, intensity: 10 },
        sky: { color: 0xffd9b0, intensity: 4.5 },
        env: {
            shell: { color: 0x2b2622, intensity: 1 },
            windowPanel: { color: 0xffe4c8, intensity: 4.0 },
            wallBounce: { color: 0xf7efe4, intensity: 2.2 },
            floorBounce: { color: 0xffcf96, intensity: 0.8 },
            ceiling: { color: 0xd8c8b8, intensity: 0.3 }
        }
    },

    night: {
        id: 'night',
        label: 'Night',
        background: 0x14120f,
        exposure: 1.1, // everything else is dimmer; lift the curve a touch
        environmentIntensity: 0.8,
        // The window stops being the key and becomes a cool, dim presence —
        // moonlight through the same panes, still carrying the gobo. It gives
        // up shadow casting to the overhead, so the scene still only ever pays
        // for one *full-size* depth pass; the gallery spots' own two are 1024²
        // apiece and are there at every hour (see ART_LIGHT_SHADOW_* in
        // lighting.js).
        sun: { color: 0xb8c8e8, intensity: 90, target: { x: 0.2, y: 0, z: 0 }, castShadow: false },
        // The room light, on. Motivated but unseen: WALL_HEIGHT is 10 and the
        // establishing shot's top edge crosses the back wall at y ≈ 3.2, so
        // the ceiling is never in frame and no fixture has to exist. Intensity
        // is candela against decay 2, the same as the sun — at 7 units above
        // the desktop, 95 divides down to ~1.9 on a surface facing straight up.
        overhead: {
            color: 0xffd9a0,
            intensity: 95,
            position: { x: 0, y: 7, z: 1.2 },
            target: { x: 0, y: 0, z: 0.4 },
            angle: 0.75,
            penumbra: 0.6,
            castShadow: true
        },
        bounce: { color: 0xffeccd, intensity: 0.1 },
        art: { color: 0xffe6c2, intensity: 11 },
        sky: { color: 0x1a2338, intensity: 1.2 },
        env: {
            shell: { color: 0x141312, intensity: 1 },
            windowPanel: { color: 0x2a3550, intensity: 1.2 },
            wallBounce: { color: 0x3a332a, intensity: 0.8 },
            floorBounce: { color: 0xffcc99, intensity: 0.35 },
            // Inverted from every other preset: after dark the brightest thing
            // in the room is above you, so the ceiling panel is what fills the
            // upward-facing surfaces instead of the window.
            ceiling: { color: 0xffd9a0, intensity: 1.6 }
        }
    }
};

export const DEFAULT_PRESET_ID = 'day';

/**
 * Which preset a given hour of the visitor's local day falls into.
 *
 * Bands are deliberately uneven. "Day" is the widest because it is the tuned
 * set and the one most visits land in; morning and evening are the narrow
 * windows where the light is actually doing something worth rendering
 * differently.
 *
 * @param {number} hour 0–23, as from Date#getHours
 */
export function presetIdForHour(hour) {
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return DEFAULT_PRESET_ID;
    if (hour >= 5 && hour < 10) return 'morning';
    if (hour >= 10 && hour < 17) return 'day';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
}

/**
 * The `?time=` override, if there is a recognizable one.
 *
 * Exists because the alternative way to see dusk is to wait until dusk. Also
 * the only way to review all four in one sitting, which is what tuning them
 * requires.
 *
 * @param {string} search a location.search string, with or without the '?'
 * @returns {{ raw: string, valid: boolean } | null}
 */
export function timeOverrideFrom(search) {
    if (!search) return null;
    const raw = new URLSearchParams(search).get('time');
    if (raw === null) return null;
    return { raw, valid: Object.hasOwn(TIME_PRESETS, raw) };
}

/**
 * @param {number} hour
 * @param {string} [search] location.search
 * @returns {string} a key of TIME_PRESETS — never an invalid id, so callers
 *          can index straight into the table
 */
export function resolvePresetId(hour, search) {
    const override = timeOverrideFrom(search);
    if (override?.valid) return override.raw;
    return presetIdForHour(hour);
}

let resolved = null;

/**
 * The preset for this page load, resolved once.
 *
 * Memoized because lighting.js, room.js and DeskScene.js each ask
 * independently, and a clock that rolls over between two of those calls would
 * otherwise build a room whose beam, window and background disagree about what
 * time it is.
 */
export function activePreset() {
    if (resolved) return resolved;
    const search = typeof window === 'undefined' ? '' : window.location.search;
    const override = timeOverrideFrom(search);
    if (override && !override.valid) {
        console.warn(
            `[timeOfDay] Ignoring ?time=${override.raw} — expected one of ${Object.keys(TIME_PRESETS).join(', ')}.`
        );
    }
    resolved = TIME_PRESETS[resolvePresetId(new Date().getHours(), search)];
    return resolved;
}
