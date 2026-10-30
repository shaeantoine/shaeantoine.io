import { ACCENTS } from './layout.js';

/**
 * Turns the two loudest non-clickable accents down — NOT out, and not away:
 * the Borg cube and the Tron disc are Shae's choices and stay on the shelf.
 *
 * On screen, their problem was volume: borg_cube.glb ships
 * KHR_materials_emissive_strength 10 over a green circuit map (three reads it
 * as emissiveIntensity 10), which made it the loudest accent in the room, and
 * tron_disc.glb's ring glows at 1.0. Both are scaled here, per time of day
 * (layout.js ACCENTS), after their models have loaded (mount runs after
 * DeskScene.whenReady). Materials are cloned per object at load
 * (DeskScene.attachModel), so nothing leaks into the shared GLTF cache; the
 * room's base layout (src/content/deskObjects.js) is left as it is. Neither is
 * clickable, so the hover tint never touches their emissive.
 *
 * @returns {{ id: string, before: number, after: number, materials: number }[]} what changed
 */
export function toneDownAccents(ctx, presetId) {
    const report = [];
    for (const [id, levels] of Object.entries(ACCENTS)) {
        const group = ctx.deskScene.getObjectGroup(id);
        if (!group) continue;
        const target = levels[presetId] ?? levels.day;
        let before = null;
        let materials = 0;
        group.traverse((node) => {
            if (!node.isMesh) return;
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
                if (!material?.emissive) continue;
                const lit = material.emissiveMap || material.emissive.getHex() !== 0;
                if (!lit || !(material.emissiveIntensity > 0)) continue;
                before ??= material.emissiveIntensity;
                material.emissiveIntensity = target;
                materials += 1;
            }
        });
        if (materials) report.push({ id, before, after: target, materials });
    }
    if (report.length) ctx.invalidate();
    return report;
}
