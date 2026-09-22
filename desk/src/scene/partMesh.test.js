import { describe, expect, it } from 'vitest';
import { buildPartsGroup, buildPartMesh, POSE_GROUP_NAME } from './partMesh.js';

const box = (overrides = {}) => ({
    type: 'box',
    args: [0.1, 0.02, 0.1],
    position: [0, 0.01, 0],
    rotation: [0, 0, 0],
    color: '#cccccc',
    ...overrides
});

describe('buildPartMesh', () => {
    it('places and turns a part where the descriptor says', () => {
        const mesh = buildPartMesh(box({ position: [1, 2, 3], rotation: [0.1, 0.2, 0.3] }));
        expect([mesh.position.x, mesh.position.y, mesh.position.z]).toEqual([1, 2, 3]);
        expect([mesh.rotation.x, mesh.rotation.y, mesh.rotation.z]).toEqual([0.1, 0.2, 0.3]);
    });

    it('casts and receives, because every prop here sits on a lit surface', () => {
        const mesh = buildPartMesh(box());
        expect(mesh.castShadow).toBe(true);
        expect(mesh.receiveShadow).toBe(true);
    });

    it('leaves a plain part with one material and no map', () => {
        const mesh = buildPartMesh(box());
        expect(Array.isArray(mesh.material)).toBe(false);
        expect(mesh.material.map).toBeFalsy();
    });

});

describe('buildPartsGroup', () => {
    it('builds a flat group when nothing asks to be posed', () => {
        const group = buildPartsGroup([box(), box(), box()]);
        expect(group.children).toHaveLength(3);
        expect(group.getObjectByName(POSE_GROUP_NAME)).toBeUndefined();
    });

    it('collects the posed parts into one child group, in order', () => {
        // Some of an object's parts turn while the rest stay put. One subgroup
        // is how "some of the parts" is expressed as a single transform for a
        // focus strategy to animate.
        const group = buildPartsGroup([
            box({ color: '#strap1' }),
            box({ color: '#card', pose: POSE_GROUP_NAME }),
            box({ color: '#holder', pose: POSE_GROUP_NAME }),
            box({ color: '#strap2' })
        ]);

        const pose = group.getObjectByName(POSE_GROUP_NAME);
        expect(pose).toBeDefined();
        expect(pose.children.map((mesh) => mesh.material.color.getHexString())).toHaveLength(2);
        // The two unposed parts stay on the outer group, alongside the pose
        // group itself.
        expect(group.children.filter((child) => child.isMesh)).toHaveLength(2);
    });

    it('leaves posed parts at the positions they were authored at', () => {
        // The pose group sits at the origin and artifactStrategy does the
        // pivoting arithmetic; rebasing positions here as well would apply the
        // offset twice, and the symptom is an object that jumps the first time
        // it is focused.
        const group = buildPartsGroup([box({ position: [0, 0.008, -0.05], pose: POSE_GROUP_NAME })]);
        const pose = group.getObjectByName(POSE_GROUP_NAME);
        expect([pose.position.x, pose.position.y, pose.position.z]).toEqual([0, 0, 0]);
        const mesh = pose.children[0];
        expect([mesh.position.x, mesh.position.y, mesh.position.z]).toEqual([0, 0.008, -0.05]);
    });

    // Drawn faces (spine, badge, sheet) are not exercised here: they need a
    // real <canvas> to rasterise into, which this environment has none of. Each
    // drawing module is tested directly against a recording stub instead — see
    // badgeCanvas.test.js and sheetCanvas.test.js.
});
