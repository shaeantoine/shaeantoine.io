/**
 * The scope's signal: an EOG-like trace driven by the pointer. No DOM, no
 * three — node can run it.
 *
 * Horizontal eye movement shows up on electrodes either side of the eyes as a
 * step in the (AC-coupled) signal that then drains away. Here the visitor's
 * pointer stands in for the eyes (the sticky on the scope says so): its
 * horizontal NDC position is the gaze; a first-order high-pass (τ 0.9 s)
 * turns a quick move into a step that decays, a slow drift into almost
 * nothing. A move of more than 0.1 NDC inside 120 ms is a "saccade": the
 * readout says LEFT or RIGHT for 1.4 s after the last one, then "—".
 *
 * Samples scroll across the screen at TRACE.samples per TRACE.seconds.
 */

export const EOG = Object.freeze({
    tau: 0.9,          // s, the high-pass
    gain: 0.9,         // screen half-heights per NDC of gaze change
    saccade: 0.1,      // NDC …
    window: 0.12,      // … within this many seconds
    hold: 1.4,         // s the readout holds a direction
    noise: 0.018,      // screen half-heights, peak
    settle: 0.006      // |signal| under which, with nothing held, the trace is "flat"
});

function seeded(seed) {
    let s = seed >>> 0 || 1;
    return () => {
        s ^= s << 13; s >>>= 0;
        s ^= s >>> 17;
        s ^= s << 5; s >>>= 0;
        return s / 4294967296;
    };
}

export function createEog({ seconds = 3.2, samples = 256, seed = 7 } = {}) {
    const dtSample = seconds / samples;
    const buffer = new Float32Array(samples);
    const random = seeded(seed);
    let head = 0;              // index of the newest sample
    let gaze = 0;              // latest pointer x (NDC)
    let lastGaze = 0;          // gaze at the previous sample
    let hp = 0;                // high-passed signal
    let carry = 0;             // unspent time (s)
    let time = 0;
    let quietFor = Infinity;   // s since the pointer last moved
    let heldFor = Infinity;    // s since the last saccade
    let direction = 0;         // -1 left, +1 right, 0 none
    const history = [];        // [time, gaze] for saccade detection
    let noisePhase = 0;

    function push(value) {
        head = (head + 1) % samples;
        buffer[head] = value;
    }

    function sampleOnce() {
        const a = EOG.tau / (EOG.tau + dtSample);
        hp = a * (hp + (gaze - lastGaze) * EOG.gain);
        lastGaze = gaze;
        noisePhase += dtSample;
        const noise = (random() - 0.5) * EOG.noise + Math.sin(noisePhase * 2 * Math.PI * 1.1) * EOG.noise * 0.25;
        push(Math.max(-0.95, Math.min(0.95, hp + noise)));
    }

    return {
        /** The pointer moved to NDC x. */
        point(x) {
            if (!Number.isFinite(x)) return;
            gaze = x;
            quietFor = 0;
            history.push([time, x]);
            while (history.length && time - history[0][0] > EOG.window) history.shift();
            const oldest = history[0][1];
            if (Math.abs(x - oldest) >= EOG.saccade) {
                direction = x > oldest ? 1 : -1;
                heldFor = 0;
                history.length = 0;
                history.push([time, x]);
            }
        },
        /** Advance by dt seconds. Returns true while anything is still changing on screen. */
        step(dt) {
            const d = Math.max(0, Math.min(0.25, dt));
            time += d;
            quietFor += d;
            heldFor += d;
            if (heldFor > EOG.hold) direction = 0;
            carry += d;
            while (carry >= dtSample) {
                carry -= dtSample;
                sampleOnce();
            }
            return this.live();
        },
        /** Still moving: recently pointed, a direction held, or the signal not yet flat across the screen. */
        live() {
            return quietFor < seconds || direction !== 0 || Math.abs(hp) > EOG.settle;
        },
        /** Oldest → newest, as screen half-heights (-1 … 1). */
        samples() {
            const out = new Float32Array(samples);
            for (let i = 0; i < samples; i += 1) out[i] = buffer[(head + 1 + i) % samples];
            return out;
        },
        readout() {
            return direction < 0 ? 'left' : direction > 0 ? 'right' : 'none';
        },
        /** A flat, faintly noisy line (powered on, nobody looking). */
        rest() {
            for (let i = 0; i < samples; i += 1) {
                push((random() - 0.5) * EOG.noise * 0.6);
            }
            hp = 0;
            direction = 0;
            heldFor = Infinity;
        }
    };
}

/**
 * The still-mode trace: the same model, driven by a fixed script — the eyes
 * rest, glance right, come back, then glance left — so screenshots always show
 * the same steps and "LEFT".
 */
export function stillTrace({ seconds = 3.2, samples = 256 } = {}) {
    const eog = createEog({ seconds, samples, seed: 11 });
    const script = [[0.0, 0], [0.55, 0.32], [1.35, 0.02], [2.35, -0.38]];
    const dt = 1 / 120;
    let t = 0;
    let next = 0;
    eog.point(0);
    while (t < seconds + 0.25) {
        if (next < script.length && t >= script[next][0]) {
            // A saccade: over three frames, as a real mouse flick lands.
            const target = script[next][1];
            eog.point(target);
            next += 1;
        }
        eog.step(dt);
        t += dt;
    }
    return { samples: eog.samples(), readout: 'left' };
}
