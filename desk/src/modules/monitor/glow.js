/**
 * The light the screen throws into the room — the original site's idle-screen
 * glow (same lazily loaded LTC tables), re-balanced for a dark screen.
 *
 * RE-BALANCED. The original glow's 2.0 of cool white belonged to a #FAFAFA
 * panel (linear ~0.95). This screen is warm charcoal in dark mode (screen.js:
 * linear ~0.03–0.045 across the field) with one small red light on it, so physically
 * it would throw ~1/25 of that — 0.08, i.e. nothing. It is kept at 0.4 (a
 * fifth of the old light, ~5x "physical"): a faint warm spill on the
 * keyboard and the desk right in front of the screen, the way a dark screen
 * still reads in a dim room, and nothing that competes with the window or a
 * desk lamp. The colour is the field's own (≈ 1 : 0.89 : 0.78 linear), a touch
 * warmer for the dot.
 *
 * ONE DELIBERATE DIFFERENCE. three's RectAreaLight emits along its local -Z
 * (r169 lights_physical_pars_fragment: "light shines in local neg z
 * direction"; LTC_Evaluate returns 0 for points on the +Z side). The original
 * site's glow copied the screen plane's rotation, whose front is +Z, so there
 * the glow faced into the monitor and the wall, not the desk. Here it is turned
 * half a turn about its vertical so it lights the keyboard and the desk in
 * front — which is what the original's own comment said it was for.
 *
 * Fails soft: no tables, no glow, the screen is still on.
 */

const GLOW_INTENSITY = 0.4; // the original site's GLOW_INTENSITY was 2.0, for a white panel
const GLOW_COLOR = 0xffeedd; // warm charcoal + the dot (the original's was 0xf4f6ff, cool white)

export function addScreenGlow(ctx, group, anchor) {
    const { THREE } = ctx;
    let light = null;
    let disposed = false;
    const loading = import('three/examples/jsm/lights/RectAreaLightUniformsLib.js').then(({ RectAreaLightUniformsLib }) => {
        if (disposed) return;
        RectAreaLightUniformsLib.init();
        light = new THREE.RectAreaLight(GLOW_COLOR, GLOW_INTENSITY, anchor.size[0], anchor.size[1]);
        light.name = 'monitor:glow';
        light.position.fromArray(anchor.position);
        light.rotation.set(...(anchor.rotation ?? [0, 0, 0]));
        light.rotateY(Math.PI); // emit out of the screen (local -Z), not into it
        group.add(light);
        ctx.invalidate();
    }).catch((error) => {
        ctx.warn('Screen glow unavailable — RectAreaLight tables failed to load.', error);
    });
    ctx.track(loading, 'monitor glow');
    return {
        dispose() {
            disposed = true;
            if (light) {
                group.remove(light);
                light.dispose();
                light = null;
            }
        }
    };
}
