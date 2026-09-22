import { describe, expect, it } from 'vitest';
import {
    TIME_PRESETS,
    DEFAULT_PRESET_ID,
    presetIdForHour,
    timeOverrideFrom,
    resolvePresetId
} from './timeOfDay.js';

describe('presetIdForHour', () => {
    it('covers all 24 hours with a real preset', () => {
        for (let hour = 0; hour < 24; hour++) {
            expect(TIME_PRESETS).toHaveProperty(presetIdForHour(hour));
        }
    });

    it('places each band where the light actually changes', () => {
        expect(presetIdForHour(7)).toBe('morning');
        expect(presetIdForHour(13)).toBe('day');
        expect(presetIdForHour(19)).toBe('evening');
        expect(presetIdForHour(23)).toBe('night');
        expect(presetIdForHour(2)).toBe('night');
    });

    it('puts the boundary hours on the later band', () => {
        expect(presetIdForHour(4)).toBe('night');
        expect(presetIdForHour(5)).toBe('morning');
        expect(presetIdForHour(9)).toBe('morning');
        expect(presetIdForHour(10)).toBe('day');
        expect(presetIdForHour(16)).toBe('day');
        expect(presetIdForHour(17)).toBe('evening');
        expect(presetIdForHour(20)).toBe('evening');
        expect(presetIdForHour(21)).toBe('night');
    });

    it('falls back to the tuned preset rather than throwing on a nonsense hour', () => {
        // Date#getHours cannot produce these, but the scene going black is a
        // far worse failure than the scene looking like noon.
        for (const hour of [-1, 24, 7.5, NaN, undefined]) {
            expect(presetIdForHour(hour)).toBe(DEFAULT_PRESET_ID);
        }
    });
});

describe('timeOverrideFrom', () => {
    it('returns null when there is no query string at all', () => {
        expect(timeOverrideFrom('')).toBeNull();
        expect(timeOverrideFrom(undefined)).toBeNull();
    });

    it('returns null when the query string has no time param', () => {
        expect(timeOverrideFrom('?foo=bar')).toBeNull();
    });

    it('reads a valid preset id, with or without the leading ?', () => {
        expect(timeOverrideFrom('?time=night')).toEqual({ raw: 'night', valid: true });
        expect(timeOverrideFrom('time=night')).toEqual({ raw: 'night', valid: true });
    });

    it('reports an unrecognized value rather than discarding it', () => {
        // The caller warns on this. Silently falling back would make a typo'd
        // ?time=evenning look like the override simply does not work.
        expect(timeOverrideFrom('?time=evenning')).toEqual({ raw: 'evenning', valid: false });
    });

    it('treats an empty time param as present but invalid', () => {
        expect(timeOverrideFrom('?time=')).toEqual({ raw: '', valid: false });
    });
});

describe('resolvePresetId', () => {
    it('uses the clock when there is no override', () => {
        expect(resolvePresetId(13, '')).toBe('day');
        expect(resolvePresetId(23, '')).toBe('night');
    });

    it('lets a valid override beat the clock', () => {
        expect(resolvePresetId(13, '?time=night')).toBe('night');
    });

    it('ignores an invalid override and falls back to the clock', () => {
        expect(resolvePresetId(19, '?time=teatime')).toBe('evening');
    });

    it('only ever returns a key that exists in the table', () => {
        const cases = ['', '?time=night', '?time=nope', '?other=1'];
        for (const search of cases) {
            for (const hour of [0, 6, 12, 18]) {
                expect(TIME_PRESETS).toHaveProperty(resolvePresetId(hour, search));
            }
        }
    });
});

describe('TIME_PRESETS', () => {
    const ids = Object.keys(TIME_PRESETS);

    it('gives every preset the full set of fields the scene reads', () => {
        // Every one of these is consumed unguarded — a preset missing `sky`
        // throws inside room.js during scene construction, which is a blank
        // page rather than a degraded render.
        for (const id of ids) {
            const preset = TIME_PRESETS[id];
            expect(preset.id).toBe(id);
            expect(typeof preset.label).toBe('string');
            expect(typeof preset.background).toBe('number');
            expect(typeof preset.exposure).toBe('number');
            expect(typeof preset.environmentIntensity).toBe('number');
            expect(preset.sun).toMatchObject({
                color: expect.any(Number),
                intensity: expect.any(Number),
                castShadow: expect.any(Boolean),
                target: { x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) }
            });
            expect(preset.bounce).toMatchObject({ color: expect.any(Number), intensity: expect.any(Number) });
            expect(preset.art).toMatchObject({ color: expect.any(Number), intensity: expect.any(Number) });
            expect(preset.sky).toMatchObject({ color: expect.any(Number), intensity: expect.any(Number) });
            for (const key of ['shell', 'windowPanel', 'wallBounce', 'floorBounce', 'ceiling']) {
                expect(preset.env[key]).toMatchObject({ color: expect.any(Number), intensity: expect.any(Number) });
            }
        }
    });

    it('gives every preset with an overhead light a complete one', () => {
        for (const id of ids) {
            const { overhead } = TIME_PRESETS[id];
            if (overhead === null) continue;
            expect(overhead).toMatchObject({
                color: expect.any(Number),
                intensity: expect.any(Number),
                angle: expect.any(Number),
                penumbra: expect.any(Number),
                castShadow: expect.any(Boolean),
                position: { x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) },
                target: { x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) }
            });
        }
    });

    it('never lights two shadow-casting keys at once', () => {
        // The key's caster is a full 2048² depth pass. Letting a preset switch
        // the overhead on without handing off from the window would silently
        // double the cost of the one operation the render scheduler exists to
        // keep rare.
        //
        // Only the key is budgeted here. The two gallery spots also cast, but
        // at 1024² and unconditionally — they are a property of the fixture in
        // lighting.js rather than of the hour, because a picture light throws
        // the same shadow at midnight as at noon.
        for (const id of ids) {
            const preset = TIME_PRESETS[id];
            const casters = [preset.sun, preset.overhead].filter((light) => light?.castShadow);
            expect(casters).toHaveLength(1);
        }
    });

    it('keeps every beam inside the cone that still lights the desk', () => {
        // BEAM_ANGLE is 0.30 rad and the desk already sits 0.16 off-axis, so a
        // target that swings the beam more than ~0.14 rad from the midday aim
        // starts walking the desk out of the light. Measured against the
        // reference target, from the fixed window position.
        const WINDOW = { x: -11, y: 6, z: 2.5 };
        const REFERENCE = { x: 0.2, y: 0, z: 0 };
        const SLACK = 0.14;

        const axisTo = (target) => {
            const v = { x: target.x - WINDOW.x, y: target.y - WINDOW.y, z: target.z - WINDOW.z };
            const length = Math.hypot(v.x, v.y, v.z);
            return { x: v.x / length, y: v.y / length, z: v.z / length };
        };
        const reference = axisTo(REFERENCE);

        for (const id of ids) {
            const axis = axisTo(TIME_PRESETS[id].sun.target);
            const dot = axis.x * reference.x + axis.y * reference.y + axis.z * reference.z;
            expect(Math.acos(Math.min(1, dot))).toBeLessThan(SLACK);
        }
    });

    it('keeps the poster wall lit at every hour', () => {
        // The wall it lights faces +Z and sits outside the window's cone, so a
        // preset that switched these off would not dim the posters — it would
        // erase them.
        for (const id of ids) {
            expect(TIME_PRESETS[id].art.intensity).toBeGreaterThan(0);
        }
    });

    it('leans on the gallery spots harder after dark than at noon', () => {
        // After dark they and the monitor are most of what is left in the room,
        // which is the whole reason the posters read at night at all.
        expect(TIME_PRESETS.night.art.intensity).toBeGreaterThan(TIME_PRESETS.day.art.intensity);
    });

    it('leaves midday exactly as the scene was tuned', () => {
        // `day` is the only preset anyone has actually looked at. Pinning it
        // means the common case cannot drift while the other three are being
        // tuned by eye.
        expect(TIME_PRESETS.day).toMatchObject({
            background: 0x24211e,
            exposure: 1.0,
            environmentIntensity: 0.9,
            sun: { color: 0xfff2e2, intensity: 780, target: { x: 0.2, y: 0, z: 0 } },
            overhead: null,
            bounce: { color: 0xf2f2f0, intensity: 0.16 },
            sky: { color: 0xdce8ff, intensity: 5 },
            env: {
                shell: { color: 0x2a2724, intensity: 1 },
                windowPanel: { color: 0xeef3fb, intensity: 4.5 },
                wallBounce: { color: 0xf7f4f0, intensity: 2.4 },
                floorBounce: { color: 0xffd9a8, intensity: 0.6 },
                ceiling: { color: 0xc8d4e4, intensity: 0.35 }
            }
        });
    });
});
