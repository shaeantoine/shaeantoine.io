/**
 * The readout that turns "it feels fine on my machine" into numbers.
 *
 * Off by default and out of the bundle's way — it costs one `location.search`
 * check on load and nothing else unless asked for. Open the desk with `?perf`
 * (the query string, not the hash — the hash is the router's) or set
 * `localStorage['desk:perf'] = '1'` to keep it on across reloads.
 *
 * WHAT TO LOOK AT, in the order it is worth looking:
 *
 *   fps / p95   The median is whether the scene is smooth; the p95 is whether
 *               it is smooth *consistently*. A 60/33 reading — 60 fps median,
 *               one frame in twenty taking 33 ms — feels worse than a flat 48,
 *               and only the second number shows it.
 *   jank        Frames over 50 ms since load. These are the ones a visitor
 *               notices individually. A handful during the opening is normal
 *               (shader compiles, first uploads); a count that keeps climbing
 *               while nothing is loading is the thing to chase.
 *   tier        Which rung of QUALITY_TIERS the governor has settled on. If
 *               this is anything but `full` on a machine you expected to cope,
 *               that is the finding. The phone tier starts at `no-ao`.
 *   device      The device tier (core/flags.js): `phone` or `desktop`. Open
 *               with `?perf&tier=phone` to see what a phone is given.
 *   buffer      Pixels actually being shaded, after DeskScene's area budget and
 *               any tier downgrade. Compare against the display's real size to
 *               see whether the budget engaged.
 *   targets     Estimated VRAM held by the composer and AO render targets. The
 *               number every other budget in this codebase is implicitly
 *               competing with for the same memory.
 *   draws/tris  three's own counters for the last frame. Two scene passes are
 *               expected while AO is on — the G-buffer prepass and the beauty
 *               pass — so a doubled triangle count here is correct, not a bug.
 */

/** Refresh interval. Fast enough to watch a dolly, slow enough to be readable. */
const UPDATE_MS = 250;

const STYLE = [
    'position:fixed', 'z-index:9999', 'top:8px', 'right:8px',
    'padding:8px 10px', 'border-radius:6px',
    'background:rgba(12,12,14,0.82)', 'color:#e8e8ea',
    'font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
    'white-space:pre', 'pointer-events:none',
    'text-align:right', 'letter-spacing:0.01em'
].join(';');

/** Whether the visitor asked for the readout. */
export function perfHudRequested() {
    try {
        if (new URLSearchParams(window.location.search).has('perf')) return true;
        return window.localStorage?.getItem('desk:perf') === '1';
    } catch {
        // Private-mode Safari throws on localStorage. A missing HUD is not
        // worth taking the page down for.
        return false;
    }
}

/** Bytes per pixel a render target of this three texture type occupies. */
function bytesPerPixel(isHalfFloat) {
    return isHalfFloat ? 8 : 4;
}

/**
 * Roughly what the composer and AO targets are holding, in bytes.
 *
 * Deliberately an estimate rather than a query — WebGL will not tell you, and
 * the shape of the answer (which buffer dominates, and by how much) is what
 * this is for. Mirrors the allocation described in renderPipeline.js: one
 * multisampled colour target with its resolve texture, one plain colour target,
 * and — while AO is on — the G-buffer, AO and denoise targets at the AO scale.
 */
export function estimateTargetBytes({ width, height, samples, halfFloat, aoEnabled, aoScale }) {
    const bpp = bytesPerPixel(halfFloat);
    const frame = width * height;
    // renderTarget2: multisample renderbuffer plus the texture it resolves into.
    let bytes = frame * bpp * samples + frame * bpp;
    // renderTarget1: full-screen quad destination only, so no multisampling.
    bytes += frame * bpp;
    if (aoEnabled) {
        const ao = Math.round(width * aoScale) * Math.round(height * aoScale);
        bytes += ao * bpp; // normal G-buffer (half float)
        bytes += ao * 4; // packed depth/stencil
        bytes += ao * bpp; // raw AO
        bytes += ao * bpp; // denoised AO
    }
    return bytes;
}

const mb = (bytes) => `${Math.round(bytes / 1e6)} MB`;
const mp = (pixels) => `${(pixels / 1e6).toFixed(2)} MP`;

/**
 * Mounts the readout.
 *
 * @param {object} sources everything it reads, as getters — the HUD holds no
 *        state of its own beyond the throttle, so there is nothing here that
 *        can go stale or need invalidating.
 */
export function createPerfHud({ renderer, stats, governor, pipeline, getBufferSize, deviceTier = 'desktop' }) {
    const el = document.createElement('div');
    el.setAttribute('style', STYLE);
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);

    let lastUpdate = 0;

    function render() {
        const { width, height } = getBufferSize();
        const info = renderer.info;
        const aoEnabled = pipeline.isAmbientOcclusionEnabled();
        const aoScale = pipeline.getAoScale();
        const bytes = estimateTargetBytes({
            width,
            height,
            // What renderTarget2 was actually given, not the driver's maximum:
            // the pipeline asks for at most 4 (2 on the phone tier), and a GPU
            // that offers 8 or 16 used to be charged for all of them here.
            samples: pipeline.getSamples?.() ?? renderer.capabilities.maxSamples ?? 4,
            halfFloat: Boolean(renderer.extensions.get('EXT_color_buffer_float')),
            aoEnabled,
            aoScale
        });

        el.textContent = [
            `${stats.fps().toFixed(0)} fps   p95 ${stats.p95().toFixed(1)}ms`,
            `median ${stats.median().toFixed(1)}ms  worst ${stats.worst().toFixed(0)}ms`,
            `jank ${stats.jank} / ${stats.total}`,
            `tier ${governor.tier.name}  device ${deviceTier}`,
            `buffer ${width}x${height}  ${mp(width * height)}`,
            `ao ${aoEnabled ? `${aoScale.toFixed(2)}x` : 'off'}`,
            `targets ~${mb(bytes)}`,
            `draws ${info.render.calls}  tris ${info.render.triangles.toLocaleString()}`,
            `programs ${info.programs?.length ?? 0}  tex ${info.memory.textures}`
        ].join('\n');
    }

    return {
        /** Called from the render callback; self-throttled, so calling it every frame is fine. */
        update() {
            const now = performance.now();
            if (now - lastUpdate < UPDATE_MS) return;
            lastUpdate = now;
            render();
        },
        dispose() {
            el.remove();
        }
    };
}
