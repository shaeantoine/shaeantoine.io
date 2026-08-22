import { CATEGORY_LABELS } from './schema.js';

export const deskObjects = [
    // Clickable category objects
    {
        id: 'laptop',
        category: 'software',
        label: CATEGORY_LABELS.software,
        clickable: true,
        position: [-1.5, 0, -0.4],
        rotation: [0, 0.2, 0],
        parts: [
            { type: 'box', args: [0.85, 0.04, 0.6], position: [0, 0.02, 0.25], color: '#B8B4AC' },
            { type: 'box', args: [0.85, 0.5, 0.03], position: [0, 0.27, -0.06], rotation: [-0.25, 0, 0], color: '#1B1B1B' }
        ]
    },
    {
        id: 'notebook-stack',
        category: 'essays',
        label: CATEGORY_LABELS.essays,
        clickable: true,
        position: [0.9, 0, 0.3],
        rotation: [0, -0.1, 0],
        parts: [
            { type: 'box', args: [0.5, 0.03, 0.65], position: [0, 0.015, 0], color: '#F4F1E8' },
            { type: 'box', args: [0.48, 0.03, 0.63], position: [0.01, 0.05, 0.01], rotation: [0, 0.05, 0], color: '#EDE7D8' },
            { type: 'box', args: [0.46, 0.03, 0.6], position: [-0.01, 0.085, -0.01], rotation: [0, -0.04, 0], color: '#E3DCC8' }
        ]
    },
    {
        id: 'diary',
        category: 'diary',
        label: CATEGORY_LABELS.diary,
        clickable: true,
        position: [1.6, 0, -0.2],
        rotation: [0, 0.35, 0],
        parts: [
            { type: 'box', args: [0.42, 0.05, 0.55], position: [0, 0.025, 0], color: '#7A3B2E' }
        ]
    },
    {
        id: 'breadboard',
        category: 'hardware',
        label: CATEGORY_LABELS.hardware,
        clickable: true,
        position: [-0.3, 0, 0.55],
        rotation: [0, 0, 0],
        parts: [
            { type: 'box', args: [0.7, 0.03, 0.45], position: [0, 0.015, 0], color: '#3E7D4C' },
            { type: 'box', args: [0.05, 0.08, 0.05], position: [-0.2, 0.07, 0.1], color: '#2A2A2A' },
            { type: 'box', args: [0.05, 0.08, 0.05], position: [0.1, 0.07, -0.05], color: '#2A2A2A' }
        ]
    },

    // --- Non-clickable atmosphere props ---
    {
        id: 'framed-photo',
        category: null,
        label: null,
        clickable: false,
        position: [-2.1, 0, -0.7],
        rotation: [0, 0.5, 0],
        parts: [
            { type: 'box', args: [0.32, 0.4, 0.03], position: [0, 0.2, 0], color: '#C9A24B' },
            { type: 'plane', args: [0.26, 0.34], position: [0, 0.2, 0.02], color: '#DCEAF5' }
        ]
    },
    {
        id: 'mug',
        category: null,
        label: null,
        clickable: false,
        position: [2.0, 0, 0.6],
        rotation: [0, 0, 0],
        parts: [
            { type: 'cylinder', args: [0.12, 0.12, 0.22, 16], position: [0, 0.11, 0], color: '#C4453C' },
            { type: 'torus', args: [0.09, 0.02, 8, 16], position: [0.14, 0.13, 0], rotation: [Math.PI / 2, 0, 0], color: '#C4453C' }
        ]
    },
    {
        id: 'plant',
        category: null,
        label: null,
        clickable: false,
        position: [0, 0, -0.85],
        rotation: [0, 0, 0],
        parts: [
            { type: 'cylinder', args: [0.14, 0.11, 0.2, 12], position: [0, 0.1, 0], color: '#B9926B' },
            { type: 'sphere', args: [0.18, 10, 10], position: [0, 0.28, 0], color: '#3F6B3A' }
        ]
    }
];
