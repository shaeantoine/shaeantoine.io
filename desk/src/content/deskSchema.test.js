import { describe, expect, it } from 'vitest';
import { validateDeskObject, validateDeskLayout } from './deskSchema.js';

const validObject = {
    id: 'obj-1',
    category: 'academia',
    label: 'Academia',
    clickable: true,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    parts: [{ type: 'box', args: [1, 1, 1], position: [0, 0, 0], color: '#ffffff' }],
    focus: {
        visual: 'card',
        camera: { offset: [0, 0.2, 0.6], lookAtOffset: [0, 0, 0] },
        anchor: { position: [0, 0.3, 0], size: [0.4, 0.3] }
    }
};

const validAtmosphereObject = {
    id: 'obj-2',
    category: null,
    label: null,
    clickable: false,
    position: [1, 0, 1],
    rotation: [0, 0, 0],
    parts: [{ type: 'sphere', args: [0.2, 8, 8], position: [0, 0, 0], color: '#000000' }]
};

const worksFixture = [{ category: 'academia' }];

describe('validateDeskObject', () => {
    it('returns the object unchanged when valid', () => {
        expect(validateDeskObject(validObject)).toBe(validObject);
    });

    it('accepts a non-clickable object with a null category', () => {
        expect(() => validateDeskObject(validAtmosphereObject)).not.toThrow();
    });

    it('throws when a clickable object has an invalid category', () => {
        const object = { ...validObject, category: 'nope' };
        expect(() => validateDeskObject(object)).toThrow(/invalid "category"/);
    });

    it('throws when a non-clickable object has a non-null category', () => {
        const object = { ...validAtmosphereObject, category: 'academia' };
        expect(() => validateDeskObject(object)).toThrow(/non-clickable/);
    });

    it('throws when position is not a 3-length array', () => {
        const object = { ...validObject, position: [0, 0] };
        expect(() => validateDeskObject(object)).toThrow(/invalid "position"/);
    });

    it('throws when there are no geometry parts', () => {
        const object = { ...validObject, parts: [] };
        expect(() => validateDeskObject(object)).toThrow(/at least one geometry/);
    });

    it('throws when a part has an unrecognized geometry type', () => {
        const object = { ...validObject, parts: [{ type: 'cone', args: [1], color: '#fff' }] };
        expect(() => validateDeskObject(object)).toThrow(/invalid geometry "type"/);
    });

    it('throws when a part is missing a color', () => {
        const object = { ...validObject, parts: [{ type: 'box', args: [1, 1, 1] }] };
        expect(() => validateDeskObject(object)).toThrow(/missing a "color"/);
    });
});

describe('validateDeskObject — focus config', () => {
    it('accepts a clickable object with a valid focus block', () => {
        expect(() => validateDeskObject(validObject)).not.toThrow();
    });

    it('throws when a clickable object is missing "focus"', () => {
        const { focus, ...object } = validObject;
        expect(() => validateDeskObject(object)).toThrow(/missing "focus"/);
    });

    it('throws when focus.visual is not a recognized strategy', () => {
        const object = { ...validObject, focus: { ...validObject.focus, visual: 'spin' } };
        expect(() => validateDeskObject(object)).toThrow(/invalid "focus.visual"/);
    });

    it('throws when focus.visual is not "none" and focus.anchor is missing', () => {
        const { anchor, ...focus } = validObject.focus;
        const object = { ...validObject, focus };
        expect(() => validateDeskObject(object)).toThrow(/missing "focus.anchor"/);
    });

    it('does not require focus.anchor when focus.visual is "none"', () => {
        const object = { ...validObject, focus: { visual: 'none', camera: validObject.focus.camera } };
        expect(() => validateDeskObject(object)).not.toThrow();
    });

    it('does not require a focus block on non-clickable objects', () => {
        expect(() => validateDeskObject(validAtmosphereObject)).not.toThrow();
    });

    it('throws when focus.camera is missing', () => {
        const { camera, ...focus } = validObject.focus;
        const object = { ...validObject, focus };
        expect(() => validateDeskObject(object)).toThrow(/missing "focus.camera"/);
    });

    it('accepts focus.visual "model" when anchor.modelUrl is present', () => {
        const object = {
            ...validObject,
            focus: {
                visual: 'model',
                camera: validObject.focus.camera,
                anchor: { modelUrl: '/models/pixel.glb', position: [0, 0.35, 0.2] }
            }
        };
        expect(() => validateDeskObject(object)).not.toThrow();
    });

    it('throws when focus.visual is "model" and anchor.modelUrl is missing', () => {
        const object = {
            ...validObject,
            focus: { visual: 'model', camera: validObject.focus.camera, anchor: { position: [0, 0.35, 0.2] } }
        };
        expect(() => validateDeskObject(object)).toThrow(/missing "focus.anchor.modelUrl"/);
    });
});

describe('validateDeskObject — artifact anchor', () => {
    const withAnchor = (anchor) => ({
        ...validObject,
        focus: { visual: 'artifact', camera: validObject.focus.camera, anchor }
    });

    it('accepts an anchor with a [x, y, z] position', () => {
        expect(() => validateDeskObject(withAnchor({ position: [0, 0, 0] }))).not.toThrow();
    });

    it('throws when the anchor position is missing', () => {
        expect(() => validateDeskObject(withAnchor({}))).toThrow(/focus\.anchor\.position/);
    });

    it('throws when the anchor position is not a 3-length array', () => {
        expect(() => validateDeskObject(withAnchor({ position: [0, 0] }))).toThrow(/focus\.anchor\.position/);
    });

    it('accepts an optional travel vector', () => {
        expect(() => validateDeskObject(withAnchor({ position: [0, 0, 0], travel: [0.45, 0, 0.02] }))).not.toThrow();
    });

    it('throws when travel is present but not a 3-length array', () => {
        expect(() => validateDeskObject(withAnchor({ position: [0, 0, 0], travel: [0.45, 0] }))).toThrow(/focus\.anchor\.travel/);
    });

    it('does not demand an anchor position from other strategies', () => {
        expect(() => validateDeskObject(validObject)).not.toThrow();
    });
});

describe('validateDeskLayout — object-cycling categories', () => {
    const cyclingObject = {
        ...validObject,
        id: 'bench',
        category: 'hardware',
        model: { url: '/models/a.glb' },
        parts: undefined,
        focus: { visual: 'artifact', camera: validObject.focus.camera, anchor: { position: [0, 0, 0] } }
    };

    it('passes when every Work in the category has an artifact model', () => {
        const hardwareWorks = [
            { id: '5', category: 'hardware', artifact: { modelUrl: '/models/a.glb' } },
            { id: '6', category: 'hardware', artifact: { modelUrl: '/models/b.glb' } }
        ];
        expect(() => validateDeskLayout([cyclingObject], hardwareWorks)).not.toThrow();
    });

    it('throws when a Work in the category has nothing to show', () => {
        const hardwareWorks = [
            { id: '5', category: 'hardware', artifact: { modelUrl: '/models/a.glb' } },
            { id: '6', category: 'hardware' }
        ];
        expect(() => validateDeskLayout([cyclingObject], hardwareWorks)).toThrow(/Work "6".*"modelUrl".*"parts"/);
    });

    it("throws when the resting prop is not the first Work's own object", () => {
        const hardwareWorks = [
            { id: '5', category: 'hardware', artifact: { modelUrl: '/models/other.glb' } },
            { id: '6', category: 'hardware', artifact: { modelUrl: '/models/b.glb' } }
        ];
        expect(() => validateDeskLayout([cyclingObject], hardwareWorks)).toThrow(/resting prop has to be/);
    });

    describe('artifacts built from primitives', () => {
        // The lanyard: the object on the desk and the first job's artifact are
        // both parts arrays, and the same identity rule applies to them as to
        // two model urls. content/deskObjects.js satisfies it by handing over
        // the very same array, so this is really a guard against someone later
        // writing the resting parts out longhand.
        const badgeParts = [{ type: 'box', args: [0.19, 0.3, 0.008], color: '#eee', badge: { org: 'Apple', role: 'SWE' } }];
        const partsObject = {
            ...validObject,
            id: 'lanyard',
            category: 'hardware',
            model: undefined,
            parts: badgeParts,
            focus: { visual: 'artifact', camera: validObject.focus.camera, anchor: { position: [0, 0, 0] } }
        };

        it('accepts a parts-built object whose first Work carries the same parts', () => {
            const partsWorks = [
                { id: '5', category: 'hardware', artifact: { parts: badgeParts } },
                { id: '6', category: 'hardware', artifact: { parts: [{ type: 'box', args: [1, 1, 1], color: '#000' }] } }
            ];
            expect(() => validateDeskLayout([partsObject], partsWorks)).not.toThrow();
        });

        it("throws when the resting parts differ from the first Work's artifact parts", () => {
            const partsWorks = [
                { id: '5', category: 'hardware', artifact: { parts: [{ type: 'box', args: [9, 9, 9], color: '#f00' }] } }
            ];
            expect(() => validateDeskLayout([partsObject], partsWorks)).toThrow(/resting prop has to be/);
        });

        it('accepts a Work whose artifact is parts rather than a model', () => {
            const partsWorks = [{ id: '5', category: 'hardware', artifact: { parts: badgeParts } }];
            expect(() => validateDeskLayout([partsObject], partsWorks)).not.toThrow();
        });
    });

    it('leaves Works in other categories alone', () => {
        const mixed = [
            { id: '5', category: 'hardware', artifact: { modelUrl: '/models/a.glb' } },
            { id: '1', category: 'academia' }
        ];
        expect(() => validateDeskLayout([cyclingObject], mixed)).not.toThrow();
    });

    it('does not require artifacts of categories shown by other strategies', () => {
        expect(() => validateDeskLayout([validObject], [{ category: 'academia' }])).not.toThrow();
    });
});

describe('validateDeskObject — model.material overrides', () => {
    const withMaterial = (material) => ({
        ...validObject,
        parts: undefined,
        model: { url: '/models/thing.glb', material }
    });

    it('accepts a model with no material block at all', () => {
        expect(() => validateDeskObject(withMaterial(undefined))).not.toThrow();
    });

    it('accepts every overridable field at a valid value', () => {
        const object = withMaterial({ roughness: 0.45, metalness: 1, envMapIntensity: 1.2, aoMapIntensity: 0.8 });
        expect(() => validateDeskObject(object)).not.toThrow();
    });

    it('throws on a field that is not overridable', () => {
        // The failure mode this guards: three.js would accept `material.color =
        // 0xff0000` as a silent no-op on a THREE.Color, so a typo here has no
        // symptom except "the override did nothing".
        expect(() => validateDeskObject(withMaterial({ color: 0xff0000 }))).toThrow(/unknown "model.material.color"/);
    });

    it('throws on a misspelled field rather than ignoring it', () => {
        expect(() => validateDeskObject(withMaterial({ roughtness: 0.5 }))).toThrow(/unknown "model.material.roughtness"/);
    });

    it('throws on a non-numeric value', () => {
        expect(() => validateDeskObject(withMaterial({ roughness: '0.5' }))).toThrow(/non-numeric/);
    });

    it('throws on NaN, which would otherwise blacken the material silently', () => {
        expect(() => validateDeskObject(withMaterial({ metalness: NaN }))).toThrow(/non-numeric/);
    });

    it('throws when roughness is outside 0..1', () => {
        expect(() => validateDeskObject(withMaterial({ roughness: 1.4 }))).toThrow(/outside the valid range 0\.\.1/);
    });

    it('allows envMapIntensity above 1, which is a legitimate push', () => {
        expect(() => validateDeskObject(withMaterial({ envMapIntensity: 3 }))).not.toThrow();
    });

    it('throws on a negative envMapIntensity', () => {
        expect(() => validateDeskObject(withMaterial({ envMapIntensity: -1 }))).toThrow(/outside the valid range/);
    });

    it('throws when material is an array rather than an object', () => {
        expect(() => validateDeskObject(withMaterial([{ roughness: 0.5 }]))).toThrow(/not an object/);
    });
});

describe('validateDeskObject — parts[n].material overrides', () => {
    const withPartMaterial = (material) => ({
        ...validAtmosphereObject,
        parts: [
            { type: 'box', args: [1, 1, 1], position: [0, 0, 0], color: '#ffffff' },
            { type: 'box', args: [1, 1, 1], position: [0, 1, 0], color: '#000000', material }
        ]
    });

    it('accepts a part with no material block at all', () => {
        expect(() => validateDeskObject(withPartMaterial(undefined))).not.toThrow();
    });

    it('accepts every overridable field at a valid value', () => {
        const object = withPartMaterial({ roughness: 0.9, metalness: 0, envMapIntensity: 0.9 });
        expect(() => validateDeskObject(object)).not.toThrow();
    });

    it('names the offending part index, not just the object', () => {
        expect(() => validateDeskObject(withPartMaterial({ roughtness: 0.5 })))
            .toThrow(/unknown "parts\[1\]\.material\.roughtness"/);
    });

    it('throws on a non-numeric value', () => {
        expect(() => validateDeskObject(withPartMaterial({ roughness: '0.9' })))
            .toThrow(/non-numeric "parts\[1\]\.material\.roughness"/);
    });

    it('throws when roughness is outside 0..1', () => {
        expect(() => validateDeskObject(withPartMaterial({ roughness: 1.4 })))
            .toThrow(/outside the valid range 0\.\.1/);
    });

    it('throws when the material is an array rather than an object', () => {
        expect(() => validateDeskObject(withPartMaterial([{ roughness: 0.5 }])))
            .toThrow(/"parts\[1\]\.material" that is not an object/);
    });
});

describe('validateDeskObject — parts[n].texture', () => {
    const withPart = (extra) => ({
        ...validAtmosphereObject,
        parts: [
            { type: 'box', args: [1, 1, 1], position: [0, 0, 0], color: '#ffffff' },
            { type: 'box', args: [1, 1, 0.03], position: [0, 1, 0], color: '#000000', ...extra }
        ]
    });

    it('accepts a part with no texture at all', () => {
        expect(() => validateDeskObject(withPart({}))).not.toThrow();
    });

    it('accepts a box part carrying art', () => {
        expect(() => validateDeskObject(withPart({ texture: '/art/tool.jpg' }))).not.toThrow();
    });

    it('throws on a non-string texture, naming the part', () => {
        expect(() => validateDeskObject(withPart({ texture: 42 })))
            .toThrow(/"parts\[1\]\.texture" that is not a url/);
    });

    it('throws on an empty texture rather than silently drawing nothing', () => {
        expect(() => validateDeskObject(withPart({ texture: '' })))
            .toThrow(/"parts\[1\]\.texture" that is not a url/);
    });

    it('refuses art on a primitive that has no front face', () => {
        // Art is mapped by index into BoxGeometry's per-face material groups.
        // On a cylinder that index means something else entirely, so the
        // texture would land on an arbitrary surface with no error.
        const object = {
            ...validAtmosphereObject,
            parts: [{ type: 'cylinder', args: [1, 1, 1], color: '#fff', texture: '/art/tool.jpg' }]
        };
        expect(() => validateDeskObject(object)).toThrow(/only "box" parts have a front face/);
    });
});

describe('validateDeskObject — parts[n].spine', () => {
    const withPart = (extra) => ({
        ...validAtmosphereObject,
        parts: [
            { type: 'box', args: [0.11, 0.58, 0.35], position: [0, 0, 0], color: '#4a4238', ...extra }
        ]
    });

    it('accepts a lettered box', () => {
        expect(() => validateDeskObject(withPart({ spine: { title: 'Demons', author: 'Dostoevsky' } }))).not.toThrow();
    });

    it('accepts a title with no author', () => {
        expect(() => validateDeskObject(withPart({ spine: { title: 'Demons' } }))).not.toThrow();
    });

    it('throws when the spine is not an object', () => {
        expect(() => validateDeskObject(withPart({ spine: 'Demons' })))
            .toThrow(/"parts\[0\]\.spine" that is not an object/);
    });

    it('throws when the title is missing or empty', () => {
        expect(() => validateDeskObject(withPart({ spine: {} }))).toThrow(/missing a "title"/);
        expect(() => validateDeskObject(withPart({ spine: { title: '' } }))).toThrow(/missing a "title"/);
    });

    it('throws on a non-string author', () => {
        expect(() => validateDeskObject(withPart({ spine: { title: 'A', author: 7 } })))
            .toThrow(/non-string "parts\[0\]\.spine\.author"/);
    });

    it('refuses lettering on a primitive with no front face', () => {
        const object = {
            ...validAtmosphereObject,
            parts: [{ type: 'sphere', args: [1, 8, 8], color: '#fff', spine: { title: 'A' } }]
        };
        expect(() => validateDeskObject(object)).toThrow(/only "box" parts have a front face to letter/);
    });

    it('refuses a part that carries both a texture and a spine', () => {
        // Both draw the same face. Accepting both would silently drop one, and
        // which one depends on branch order in DeskScene rather than anything
        // visible in the layout.
        expect(() => validateDeskObject(withPart({ texture: '/art/tool.jpg', spine: { title: 'A' } })))
            .toThrow(/only one can win/);
    });
});

describe('validateDeskObject — the additions that fail silently in the scene', () => {
    // Every branch below exists because getting it wrong produces no error and
    // no obviously wrong data — only geometry in the wrong place, which is
    // discovered by looking at the render and wondering.

    it('accepts an object that is both a model and some parts', () => {
        // Dressing a .glb with a few primitives is how one asset used twice
        // stops reading as one asset used twice. Nothing on the desk does it
        // today, which is exactly why the rule needs a test rather than a
        // witness.
        const object = {
            ...validObject,
            model: { url: '/models/thing.glb', targetSize: 0.7 },
            parts: [{ type: 'box', args: [0.1, 0.01, 0.02], position: [0, 0.05, 0], color: '#26221d' }]
        };
        expect(() => validateDeskObject(object)).not.toThrow();
    });

    it('still validates the parts of an object that also has a model', () => {
        const object = {
            ...validObject,
            model: { url: '/models/thing.glb', targetSize: 0.7 },
            parts: [{ type: 'box', args: [0.1, 0.01, 0.02], position: [0, 0.05, 0] }] // no colour
        };
        expect(() => validateDeskObject(object)).toThrow(/missing a "color"/);
    });

    it('throws when an object has neither a model nor parts', () => {
        const { parts, ...object } = validObject;
        expect(() => validateDeskObject(object)).toThrow(/at least one geometry/);
    });

    it('accepts a sheets object with a size and a height', () => {
        const object = {
            ...validObject,
            focus: {
                visual: 'sheets',
                camera: { offset: [0.4, 0.9, 0.5], lookAtOffset: [0, 0.08, 0] },
                anchor: { size: [0.474, 0.672], height: 0.08, paper: 'manuscript' }
            }
        };
        expect(() => validateDeskObject(object)).not.toThrow();
    });

    it('throws when a sheets object has no height for its pages to float at', () => {
        const object = {
            ...validObject,
            focus: {
                visual: 'sheets',
                camera: { offset: [0.4, 0.9, 0.5], lookAtOffset: [0, 0.08, 0] },
                anchor: { size: [0.474, 0.672] }
            }
        };
        expect(() => validateDeskObject(object)).toThrow(/"focus.anchor.height"/);
    });

    it('throws when a sheets object has no page size', () => {
        const object = {
            ...validObject,
            focus: {
                visual: 'sheets',
                camera: { offset: [0.4, 0.9, 0.5], lookAtOffset: [0, 0.08, 0] },
                anchor: { height: 0.08 }
            }
        };
        expect(() => validateDeskObject(object)).toThrow(/"focus.anchor.size"/);
    });

    it('accepts a presented pose with a pivot and a rotation', () => {
        const object = {
            ...validObject,
            focus: {
                visual: 'artifact',
                camera: { offset: [0.3, 0.5, 0.7], lookAtOffset: [0.2, 0.2, 0] },
                anchor: { position: [0, 0, 0], present: { pivot: [0, 0, 0.22], rotation: [1.15, 0, 0] } }
            }
        };
        expect(() => validateDeskObject(object)).not.toThrow();
    });

    it('throws when a presented pose has a rotation but no pivot', () => {
        // A rotation with no pivot turns the parts about the middle of the
        // object instead of the edge they hinge on, which reads as levitation.
        const object = {
            ...validObject,
            focus: {
                visual: 'artifact',
                camera: { offset: [0.3, 0.5, 0.7], lookAtOffset: [0.2, 0.2, 0] },
                anchor: { position: [0, 0, 0], present: { rotation: [1.15, 0, 0] } }
            }
        };
        expect(() => validateDeskObject(object)).toThrow(/present\.pivot/);
    });

    it('throws on a pose name that no part group answers to', () => {
        // A typo here is silent: the part simply never joins the group that
        // moves, and the object half-stands.
        const object = {
            ...validObject,
            parts: [{ ...validObject.parts[0], pose: 'raise' }]
        };
        expect(() => validateDeskObject(object)).toThrow(/pose/);
    });

    it('accepts a per-object hover lift and rejects an absurd one', () => {
        expect(() => validateDeskObject({ ...validObject, hover: { lift: 0.018 } })).not.toThrow();
        expect(() => validateDeskObject({ ...validObject, hover: { lift: 1.5 } })).toThrow(/hover\.lift/);
        expect(() => validateDeskObject({ ...validObject, hover: { lift: 'high' } })).toThrow(/hover\.lift/);
    });

    it('accepts a printed sheet and rejects one with nothing printed on it', () => {
        const printed = { ...validObject.parts[0], sheet: { title: 'A Paper', credit: 'Someone' } };
        expect(() => validateDeskObject({ ...validObject, parts: [printed] })).not.toThrow();
        expect(() => validateDeskObject({ ...validObject, parts: [{ ...validObject.parts[0], sheet: {} }] }))
            .toThrow(/missing a "title"/);
    });

    it('refuses to put two drawn faces on one part', () => {
        // They all resolve to the same face, so one would silently win.
        const part = {
            ...validObject.parts[0],
            sheet: { title: 'A Paper' },
            badge: { org: 'Apple', role: 'Engineer' }
        };
        expect(() => validateDeskObject({ ...validObject, parts: [part] })).toThrow(/more than one front face/);
    });
});

describe('validateDeskLayout', () => {
    it('throws on duplicate object ids', () => {
        expect(() => validateDeskLayout([validObject, validObject], worksFixture)).toThrow(/duplicate/);
    });

    it("throws when a clickable object's category has no matching Work", () => {
        const object = { ...validObject, category: 'hardware' };
        expect(() => validateDeskLayout([object], worksFixture)).toThrow(/no Work in the registry/);
    });

    it('passes when every clickable category has a matching Work', () => {
        expect(() => validateDeskLayout([validObject], worksFixture)).not.toThrow();
    });
});
