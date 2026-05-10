// Visualization: SVG network graph + Canvas panels for MLP game
// Shows network architecture, weights, loss curve, and activations in real-time

export class Viz {
    constructor(brain, containers) {
        this.brain = brain;
        this.containers = containers;
        this.lossHistory = [];
        this.catchTimes = [];
        this.survivalHistory = [];
    }

    // === SVG NETWORK GRAPH ===

    initGraph() {
        const el = this.containers.graph;
        if (!el) return;
        el.innerHTML = '';

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 240 200');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.style.display = 'block';

        this.nodes = { input: [], h1: [], h2: [], output: [] };
        this.edges = [];
        this.nodeElements = [];

        const layers = [
            { id: 'input', count: 5, x: 30, color: '#555', labels: ['dx', 'dy', 'px', 'py', 'd'] },
            { id: 'h1', count: 8, x: 90, color: '#335' },
            { id: 'h2', count: 8, x: 150, color: '#335' },
            { id: 'output', count: 2, x: 210, color: '#4af', labels: ['→x', '→y'] },
        ];

        // Draw edges (input→h1, h1→h2, h2→output)
        for (let l = 0; l < layers.length - 1; l++) {
            const from = layers[l];
            const to = layers[l + 1];
            for (let i = 0; i < from.count; i++) {
                for (let j = 0; j < to.count; j++) {
                    const y1 = this.nodeY(i, from.count);
                    const y2 = this.nodeY(j, to.count);
                    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    line.setAttribute('x1', from.x);
                    line.setAttribute('y1', y1);
                    line.setAttribute('x2', to.x);
                    line.setAttribute('y2', y2);
                    line.setAttribute('stroke', '#1a1a1a');
                    line.setAttribute('stroke-width', '0.5');
                    line.classList.add('edge');
                    line.dataset.layer = l;
                    line.dataset.from = i;
                    line.dataset.to = j;
                    svg.appendChild(line);
                    this.edges.push(line);
                }
            }
        }

        // Draw nodes
        layers.forEach(layer => {
            for (let i = 0; i < layer.count; i++) {
                const y = this.nodeY(i, layer.count);
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', layer.x);
                circle.setAttribute('cy', y);
                circle.setAttribute('r', layer.id === 'input' || layer.id === 'output' ? 6 : 5);
                circle.setAttribute('fill', '#111');
                circle.setAttribute('stroke', layer.color);
                circle.setAttribute('stroke-width', '1');
                circle.classList.add('node');
                circle.dataset.layer = layer.id;
                circle.dataset.idx = i;
                svg.appendChild(circle);
                this.nodes[layer.id].push(circle);
                this.nodeElements.push(circle);

                if (layer.labels && layer.labels[i]) {
                    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    text.setAttribute('x', layer.id === 'input' ? layer.x - 12 : layer.x + 12);
                    text.setAttribute('y', y + 3);
                    text.setAttribute('text-anchor', layer.id === 'input' ? 'end' : 'start');
                    text.setAttribute('font-size', '7');
                    text.setAttribute('fill', '#333');
                    text.setAttribute('font-family', 'Courier New');
                    text.textContent = layer.labels[i];
                    svg.appendChild(text);
                }
            }
        });

        // Layer labels
        const labelY = 190;
        [['Input', 30], ['Hidden 1', 90], ['Hidden 2', 150], ['Output', 210]].forEach(([name, x]) => {
            const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            t.setAttribute('x', x);
            t.setAttribute('y', labelY);
            t.setAttribute('text-anchor', 'middle');
            t.setAttribute('font-size', '7');
            t.setAttribute('fill', '#2a2a2a');
            t.setAttribute('font-family', 'Courier New');
            t.textContent = name;
            svg.appendChild(t);
        });

        el.appendChild(svg);
        this.svg = svg;
    }

    nodeY(idx, total) {
        const margin = 20;
        const range = 160;
        if (total === 1) return 100;
        return margin + (idx / (total - 1)) * range;
    }

    updateGraph() {
        if (!this.brain.initialized || !this.svg) return;

        const { h1, h2 } = this.brain.getActivations();
        if (!h1 || !h2) return;

        // Update hidden layer node colors based on activation
        for (let i = 0; i < this.nodes.h1.length; i++) {
            const val = Math.abs(h1[i * 4]); // Sample every 4th neuron (we show 8 of 32)
            const intensity = Math.min(1, val * 2);
            this.nodes.h1[i].setAttribute('fill', this.activationColor(intensity));
            this.nodes.h1[i].setAttribute('stroke', this.activationStroke(intensity));
        }
        for (let i = 0; i < this.nodes.h2.length; i++) {
            const val = Math.abs(h2[i * 4]);
            const intensity = Math.min(1, val * 2);
            this.nodes.h2[i].setAttribute('fill', this.activationColor(intensity));
            this.nodes.h2[i].setAttribute('stroke', this.activationStroke(intensity));
        }

        // Update output nodes
        const outPtr = this.brain.wasm.get_output_ptr();
        const out = new Float32Array(this.brain.memory.buffer, Number(outPtr), 2);
        for (let i = 0; i < 2; i++) {
            const val = Math.abs(out[i]);
            this.nodes.output[i].setAttribute('fill', this.activationColor(val));
        }
    }

    activationColor(intensity) {
        const r = Math.round(17 + intensity * 50);
        const g = Math.round(17 + intensity * 100);
        const b = Math.round(34 + intensity * 180);
        return `rgb(${r},${g},${b})`;
    }

    activationStroke(intensity) {
        const r = Math.round(51 + intensity * 50);
        const g = Math.round(51 + intensity * 120);
        const b = Math.round(85 + intensity * 170);
        return `rgb(${r},${g},${b})`;
    }

    // === WEIGHT HEATMAP ===

    drawWeights() {
        const canvas = this.containers.weights;
        if (!canvas) return;
        const { ctx, w, h } = this.getCtx(canvas);

        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, w, h);

        if (!this.brain.initialized) return;

        const weights = this.brain.getWeights();
        if (!weights) return;

        // Show first layer weights: 5 inputs × 32 hidden
        const rows = 5;
        const cols = 32;
        const cellW = w / cols;
        const cellH = (h - 14) / rows;

        let maxAbs = 0;
        for (let i = 0; i < rows * cols; i++) {
            const abs = Math.abs(weights[i]);
            if (abs > maxAbs) maxAbs = abs;
        }
        if (maxAbs === 0) maxAbs = 1;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const val = weights[row * cols + col] / maxAbs;
                ctx.fillStyle = this.divergingColor(val);
                ctx.fillRect(col * cellW, row * cellH, cellW + 0.5, cellH + 0.5);
            }
        }

        // Label
        ctx.fillStyle = '#333';
        ctx.font = '8px Courier New';
        ctx.textAlign = 'left';
        ctx.fillText('W1 [5×32] input→hidden', 3, h - 3);

        // Show weight delta indicator
        const deltas = this.brain.getWeightDeltas();
        if (deltas) {
            let totalDelta = 0;
            for (let i = 0; i < Math.min(deltas.length, 160); i++) {
                totalDelta += Math.abs(deltas[i]);
            }
            const avgDelta = totalDelta / 160;
            if (avgDelta > 0.0001) {
                ctx.strokeStyle = `rgba(34, 204, 102, ${Math.min(1, avgDelta * 50)})`;
                ctx.lineWidth = 2;
                ctx.strokeRect(1, 1, w - 2, h - 16);
            }
        }
    }

    // === LOSS CURVE ===

    drawLoss() {
        const canvas = this.containers.loss;
        if (!canvas) return;
        const { ctx, w, h } = this.getCtx(canvas);

        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, w, h);

        if (this.lossHistory.length < 2) {
            ctx.fillStyle = '#222';
            ctx.font = '9px Courier New';
            ctx.textAlign = 'center';
            ctx.fillText('catch the dot to see loss', w / 2, h / 2);
            return;
        }

        const padding = { top: 12, bottom: 16, left: 30, right: 8 };
        const plotW = w - padding.left - padding.right;
        const plotH = h - padding.top - padding.bottom;

        const data = this.lossHistory.slice(-60);
        const maxLoss = Math.max(...data) * 1.1;
        const minLoss = Math.min(...data) * 0.9;
        const range = maxLoss - minLoss || 1;

        // Grid
        ctx.strokeStyle = '#151515';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= 3; i++) {
            const y = padding.top + (i / 3) * plotH;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(w - padding.right, y);
            ctx.stroke();

            const val = maxLoss - (i / 3) * range;
            ctx.fillStyle = '#333';
            ctx.font = '7px Courier New';
            ctx.textAlign = 'right';
            ctx.fillText(val.toFixed(2), padding.left - 3, y + 3);
        }

        // Loss line
        ctx.strokeStyle = '#4af';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < data.length; i++) {
            const x = padding.left + (i / (data.length - 1)) * plotW;
            const y = padding.top + (1 - (data[i] - minLoss) / range) * plotH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Current value
        const current = data[data.length - 1];
        ctx.fillStyle = '#4af';
        ctx.font = '8px Courier New';
        ctx.textAlign = 'left';
        ctx.fillText(`loss: ${current.toFixed(4)}`, padding.left + 2, padding.top - 3);

        // Step count
        ctx.fillStyle = '#333';
        ctx.textAlign = 'right';
        ctx.fillText(`step ${this.lossHistory.length}`, w - padding.right, h - 3);
    }

    // === ACTIVATION BARS ===

    drawActivations() {
        const canvas = this.containers.activations;
        if (!canvas) return;
        const { ctx, w, h } = this.getCtx(canvas);

        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, w, h);

        if (!this.brain.initialized) return;

        const { h1, h2 } = this.brain.getActivations();
        if (!h1 || !h2) return;

        const barW = 3;
        const gap = 1;
        const sectionGap = 8;
        const totalBars = 32 + 32;
        const totalWidth = totalBars * (barW + gap) + sectionGap;
        const startX = (w - totalWidth) / 2;
        const barMaxH = h - 20;

        // Label
        ctx.fillStyle = '#333';
        ctx.font = '7px Courier New';
        ctx.textAlign = 'center';

        // Hidden layer 1
        const h1X = startX;
        ctx.fillText('H1', h1X + 16 * (barW + gap) / 2, h - 3);
        for (let i = 0; i < 32; i++) {
            const val = h1[i];
            const absVal = Math.min(1, Math.abs(val) * 1.5);
            const barH = absVal * barMaxH;
            const x = h1X + i * (barW + gap);
            const y = (h - 12) / 2;

            if (val >= 0) {
                ctx.fillStyle = this.posBarColor(absVal);
                ctx.fillRect(x, y - barH, barW, barH);
            } else {
                ctx.fillStyle = this.negBarColor(absVal);
                ctx.fillRect(x, y, barW, barH);
            }
        }

        // Hidden layer 2
        const h2X = h1X + 32 * (barW + gap) + sectionGap;
        ctx.fillStyle = '#333';
        ctx.fillText('H2', h2X + 16 * (barW + gap) / 2, h - 3);
        for (let i = 0; i < 32; i++) {
            const val = h2[i];
            const absVal = Math.min(1, Math.abs(val) * 1.5);
            const barH = absVal * barMaxH;
            const x = h2X + i * (barW + gap);
            const y = (h - 12) / 2;

            if (val >= 0) {
                ctx.fillStyle = this.posBarColor(absVal);
                ctx.fillRect(x, y - barH, barW, barH);
            } else {
                ctx.fillStyle = this.negBarColor(absVal);
                ctx.fillRect(x, y, barW, barH);
            }
        }
    }

    // === STATS PANEL ===

    drawStats(game) {
        const canvas = this.containers.stats;
        if (!canvas) return;
        const { ctx, w, h } = this.getCtx(canvas);

        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, w, h);

        const stats = game.getStats();
        const trainStep = this.brain.getTrainingStep();

        ctx.font = '9px Courier New';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const lines = [
            { label: 'catches', value: `${stats.score}`, color: '#fff' },
            { label: 'avg survival', value: `${stats.avgSurvival} frames`, color: '#888' },
            { label: 'best streak', value: `${stats.bestStreak} frames`, color: '#888' },
            { label: 'train steps', value: `${trainStep}`, color: '#4af' },
            { label: 'last loss', value: this.brain.getLastLoss().toFixed(4), color: '#4af' },
        ];

        const lineH = 14;
        lines.forEach(({ label, value, color }, i) => {
            const y = 6 + i * lineH;
            ctx.fillStyle = '#444';
            ctx.fillText(label, 6, y);
            ctx.fillStyle = color;
            ctx.textAlign = 'right';
            ctx.fillText(value, w - 6, y);
            ctx.textAlign = 'left';
        });

        // Survival trend (mini sparkline)
        if (this.survivalHistory.length > 2) {
            const sparkY = 6 + lines.length * lineH + 4;
            const sparkH = h - sparkY - 4;
            const sparkW = w - 12;
            const data = this.survivalHistory.slice(-30);
            const max = Math.max(...data, 1);

            ctx.strokeStyle = '#2a5';
            ctx.lineWidth = 1;
            ctx.beginPath();
            data.forEach((v, i) => {
                const x = 6 + (i / (data.length - 1)) * sparkW;
                const y = sparkY + sparkH - (v / max) * sparkH;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();

            ctx.fillStyle = '#222';
            ctx.font = '7px Courier New';
            ctx.textAlign = 'left';
            ctx.fillText('survival trend ↑', 6, sparkY - 2);
        }
    }

    // === COLOR UTILITIES ===

    divergingColor(val) {
        val = Math.max(-1, Math.min(1, val));
        if (val < 0) {
            const t = -val;
            return `rgb(${Math.round(17 + t * 20)},${Math.round(17 + t * 60)},${Math.round(34 + t * 170)})`;
        } else {
            const t = val;
            return `rgb(${Math.round(34 + t * 170)},${Math.round(17 + t * 40)},${Math.round(17 + t * 20)})`;
        }
    }

    posBarColor(t) {
        return `rgb(${Math.round(20 + t * 40)},${Math.round(40 + t * 140)},${Math.round(60 + t * 195)})`;
    }

    negBarColor(t) {
        return `rgb(${Math.round(40 + t * 180)},${Math.round(20 + t * 40)},${Math.round(20 + t * 30)})`;
    }

    // === HELPERS ===

    getCtx(canvas) {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { ctx, w: rect.width, h: rect.height };
    }

    // === PUBLIC API ===

    onCatch(loss, framesSurvived) {
        this.lossHistory.push(loss);
        this.survivalHistory.push(framesSurvived);
        this.catchTimes.push(Date.now());
        this.drawLoss();
        this.drawWeights();
    }

    onFrame(game) {
        this.updateGraph();
        this.drawActivations();
    }

    redrawAll(game) {
        this.drawWeights();
        this.drawLoss();
        this.drawActivations();
        if (game) this.drawStats(game);
    }
}
