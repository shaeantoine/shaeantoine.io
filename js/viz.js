// Visualization dashboard: SVG architecture graph + Canvas panels
// Renders the transformer's internals in real-time during inference and training

export class Visualization {
    constructor(engine, containers) {
        this.engine = engine;
        this.containers = containers;
        this.state = 'idle'; // idle | inferring | training
        this.activeLayer = 0;
        this.activeComponent = 0; // 0=Q, 1=K, 2=V, 3=out, 4=ffn_up, 5=ffn_down
        this.lossHistory = [];
        this.animationFrame = null;
        this.inferenceStep = -1;
        this.trainingStep = -1;

        this.initArchitectureGraph();
        this.initCanvases();
    }

    // === SVG ARCHITECTURE GRAPH ===

    initArchitectureGraph() {
        const el = this.containers.graph;
        if (!el) return;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 280 460');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.style.maxHeight = '400px';

        this.graphNodes = {};
        this.graphEdges = [];

        const nodes = [
            { id: 'emb', label: 'Embeddings', y: 20, type: 'embed' },
            { id: 'ln1_0', label: 'LayerNorm 1', y: 80, type: 'norm', layer: 0 },
            { id: 'attn_0', label: 'Attention', y: 130, type: 'attn', layer: 0 },
            { id: 'res1_0', label: '+', y: 175, type: 'residual', layer: 0 },
            { id: 'ln2_0', label: 'LayerNorm 2', y: 210, type: 'norm', layer: 0 },
            { id: 'ffn_0', label: 'FFN', y: 260, type: 'ffn', layer: 0 },
            { id: 'res2_0', label: '+', y: 300, type: 'residual', layer: 0 },
            { id: 'ln1_1', label: 'LayerNorm 1', y: 335, type: 'norm', layer: 1 },
            { id: 'attn_1', label: 'Attention', y: 360, type: 'attn', layer: 1 },
            { id: 'res1_1', label: '+', y: 385, type: 'residual', layer: 1 },
            { id: 'ln2_1', label: 'LayerNorm 2', y: 395, type: 'norm', layer: 1 },
            { id: 'ffn_1', label: 'FFN', y: 410, type: 'ffn', layer: 1 },
            { id: 'res2_1', label: '+', y: 425, type: 'residual', layer: 1 },
            { id: 'ln_f', label: 'Final LN', y: 440, type: 'norm' },
            { id: 'out', label: 'Output', y: 455, type: 'output' },
        ];

        // Draw edges
        for (let i = 0; i < nodes.length - 1; i++) {
            const edge = this.createEdge(svg, nodes[i], nodes[i + 1]);
            this.graphEdges.push(edge);
        }

        // Draw residual skip connections
        this.createSkipEdge(svg, nodes[0], nodes[3]); // emb → res1_0
        this.createSkipEdge(svg, nodes[3], nodes[6]); // res1_0 → res2_0

        // Draw nodes
        nodes.forEach(node => {
            const group = this.createNode(svg, node);
            this.graphNodes[node.id] = { element: group, data: node };
        });

        el.appendChild(svg);
        this.svg = svg;
    }

    createNode(svg, node) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('data-id', node.id);

        const w = node.type === 'residual' ? 24 : 120;
        const h = node.type === 'residual' ? 24 : 28;
        const x = 140 - w / 2;
        const y = node.y;

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', w);
        rect.setAttribute('height', h);
        rect.setAttribute('rx', node.type === 'residual' ? 12 : 4);
        rect.setAttribute('fill', '#1a1a1a');
        rect.setAttribute('stroke', '#333');
        rect.setAttribute('stroke-width', '1');
        rect.classList.add('graph-node');

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', 140);
        text.setAttribute('y', y + h / 2 + 4);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', node.type === 'residual' ? '10' : '9');
        text.setAttribute('fill', '#666');
        text.setAttribute('font-family', 'Courier New');
        text.textContent = node.label;

        g.appendChild(rect);
        g.appendChild(text);
        svg.appendChild(g);

        // Click handler to select weight view
        if (node.type === 'attn' || node.type === 'ffn') {
            g.style.cursor = 'pointer';
            g.addEventListener('click', () => {
                this.activeLayer = node.layer || 0;
                this.activeComponent = node.type === 'attn' ? 0 : 4;
                this.drawWeights();
            });
        }

        return g;
    }

    createEdge(svg, from, to) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        const fromH = from.type === 'residual' ? 24 : 28;
        line.setAttribute('x1', 140);
        line.setAttribute('y1', from.y + fromH);
        line.setAttribute('x2', 140);
        line.setAttribute('y2', to.y);
        line.setAttribute('stroke', '#222');
        line.setAttribute('stroke-width', '1');
        line.classList.add('graph-edge');
        svg.appendChild(line);
        return line;
    }

    createSkipEdge(svg, from, to) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const fromH = from.type === 'residual' ? 24 : 28;
        const x = 210;
        path.setAttribute('d', `M 200 ${from.y + fromH / 2} L ${x} ${from.y + fromH / 2} L ${x} ${to.y + 12} L 200 ${to.y + 12}`);
        path.setAttribute('stroke', '#1a1a1a');
        path.setAttribute('stroke-width', '1');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-dasharray', '3,3');
        svg.appendChild(path);
    }

    highlightNode(nodeId, color = '#4af', intensity = 1.0) {
        const node = this.graphNodes[nodeId];
        if (!node) return;
        const rect = node.element.querySelector('rect');
        rect.setAttribute('stroke', color);
        rect.setAttribute('stroke-width', '2');
        rect.setAttribute('fill', this.hexWithAlpha(color, intensity * 0.15));
    }

    resetNodeHighlights() {
        Object.values(this.graphNodes).forEach(({ element }) => {
            const rect = element.querySelector('rect');
            rect.setAttribute('stroke', '#333');
            rect.setAttribute('stroke-width', '1');
            rect.setAttribute('fill', '#1a1a1a');
        });
        this.graphEdges.forEach(edge => {
            edge.setAttribute('stroke', '#222');
        });
    }

    animateInference(step, totalSteps) {
        this.resetNodeHighlights();
        const nodeOrder = ['emb', 'ln1_0', 'attn_0', 'res1_0', 'ln2_0', 'ffn_0', 'res2_0',
                           'ln1_1', 'attn_1', 'res1_1', 'ln2_1', 'ffn_1', 'res2_1', 'ln_f', 'out'];

        // Map generation step to a position in the graph (cycle through)
        const pos = step % nodeOrder.length;
        for (let i = 0; i <= pos; i++) {
            const fade = 1.0 - (pos - i) * 0.15;
            this.highlightNode(nodeOrder[i], '#4af', Math.max(0.1, fade));
        }

        // Highlight active edge
        if (pos > 0 && pos < this.graphEdges.length) {
            this.graphEdges[pos - 1].setAttribute('stroke', '#4af');
        }
    }

    animateTraining(step) {
        this.resetNodeHighlights();
        const nodeOrder = ['out', 'ln_f', 'res2_1', 'ffn_1', 'ln2_1', 'res1_1', 'attn_1', 'ln1_1',
                           'res2_0', 'ffn_0', 'ln2_0', 'res1_0', 'attn_0', 'ln1_0', 'emb'];

        const pos = step % nodeOrder.length;
        for (let i = 0; i <= pos; i++) {
            const fade = 1.0 - (pos - i) * 0.15;
            this.highlightNode(nodeOrder[i], '#f84', Math.max(0.1, fade));
        }
    }

    // === CANVAS PANELS ===

    initCanvases() {
        this.canvases = {
            attention: this.containers.attention,
            weights: this.containers.weights,
            loss: this.containers.loss,
            probs: this.containers.probs,
        };
    }

    getCtx(name) {
        const canvas = this.canvases[name];
        if (!canvas) return null;
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        return { ctx, w: rect.width, h: rect.height };
    }

    // --- Attention Heatmap ---

    drawAttention(layer = 0, head = 0) {
        const r = this.getCtx('attention');
        if (!r) return;
        const { ctx, w, h } = r;

        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, w, h);

        const seqLen = this.engine.getSeqLen();
        if (seqLen < 2) {
            ctx.fillStyle = '#333';
            ctx.font = '11px Courier New';
            ctx.fillText('No attention data yet', 10, h / 2);
            return;
        }

        const attn = this.engine.getAttention(layer, head);
        const cellW = w / seqLen;
        const cellH = h / seqLen;

        for (let q = 0; q < seqLen; q++) {
            for (let k = 0; k < seqLen; k++) {
                const val = attn[q * 128 + k];
                const color = this.infernoColor(val);
                ctx.fillStyle = color;
                ctx.fillRect(k * cellW, q * cellH, cellW + 0.5, cellH + 0.5);
            }
        }

        // Axis labels
        ctx.fillStyle = '#444';
        ctx.font = '9px Courier New';
        ctx.fillText('keys →', w - 45, h - 4);
        ctx.save();
        ctx.translate(8, h - 10);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('queries →', 0, 0);
        ctx.restore();
    }

    // --- Weight Matrix Heatmap ---

    drawWeights() {
        const r = this.getCtx('weights');
        if (!r) return;
        const { ctx, w, h } = r;

        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, w, h);

        if (!this.engine.initialized) return;

        const weights = this.engine.getWeightsForLayer(this.activeLayer, this.activeComponent);
        const size = weights.length;

        // Determine matrix dimensions for display
        const cols = this.activeComponent >= 4 ? 256 : 64;
        const rows = Math.floor(size / cols);

        const cellW = w / cols;
        const cellH = h / rows;

        // Find scale
        let maxAbs = 0;
        for (let i = 0; i < size; i++) {
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
        const names = ['Q', 'K', 'V', 'Out', 'FFN Up', 'FFN Down'];
        ctx.fillStyle = '#555';
        ctx.font = '9px Courier New';
        ctx.fillText(`Layer ${this.activeLayer} · ${names[this.activeComponent]} [${rows}×${cols}]`, 4, h - 4);
    }

    drawWeightDeltas() {
        const r = this.getCtx('weights');
        if (!r) return;
        const { ctx, w, h } = r;

        // Draw base weights first
        this.drawWeights();

        // Overlay deltas
        const deltas = this.engine.getWeightDeltas();
        if (!deltas || deltas.length === 0) return;

        // Find the offset for current component in the flat deltas array
        // For simplicity, just show the overall delta magnitude as a border effect
        let totalDelta = 0;
        for (let i = 0; i < Math.min(deltas.length, 1000); i++) {
            totalDelta += Math.abs(deltas[i]);
        }
        const avgDelta = totalDelta / Math.min(deltas.length, 1000);

        if (avgDelta > 0.0001) {
            ctx.strokeStyle = `rgba(34, 204, 102, ${Math.min(1, avgDelta * 100)})`;
            ctx.lineWidth = 2;
            ctx.strokeRect(1, 1, w - 2, h - 2);

            ctx.fillStyle = '#2c6';
            ctx.font = '9px Courier New';
            ctx.fillText(`Δ ${avgDelta.toExponential(2)}`, w - 80, 12);
        }
    }

    // --- Loss Curve ---

    drawLoss() {
        const r = this.getCtx('loss');
        if (!r) return;
        const { ctx, w, h } = r;

        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, w, h);

        if (this.lossHistory.length < 2) {
            ctx.fillStyle = '#333';
            ctx.font = '11px Courier New';
            ctx.fillText('Train the model to see loss curve', 10, h / 2);
            return;
        }

        const padding = { top: 15, bottom: 20, left: 35, right: 10 };
        const plotW = w - padding.left - padding.right;
        const plotH = h - padding.top - padding.bottom;

        // Show last 100 points max
        const data = this.lossHistory.slice(-100);
        const maxLoss = Math.max(...data) * 1.1;
        const minLoss = Math.min(...data) * 0.9;
        const range = maxLoss - minLoss || 1;

        // Grid lines
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (i / 4) * plotH;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(w - padding.right, y);
            ctx.stroke();

            const val = maxLoss - (i / 4) * range;
            ctx.fillStyle = '#444';
            ctx.font = '8px Courier New';
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
        ctx.font = '10px Courier New';
        ctx.textAlign = 'left';
        ctx.fillText(`loss: ${current.toFixed(4)}`, padding.left + 5, padding.top - 3);

        // Step count
        ctx.fillStyle = '#444';
        ctx.textAlign = 'right';
        ctx.fillText(`step ${this.lossHistory.length}`, w - padding.right, h - 4);
    }

    // --- Token Probabilities ---

    drawProbs(probs) {
        const r = this.getCtx('probs');
        if (!r) return;
        const { ctx, w, h } = r;

        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, w, h);

        if (!probs || probs.length === 0) {
            ctx.fillStyle = '#333';
            ctx.font = '11px Courier New';
            ctx.fillText('Generate text to see probabilities', 10, h / 2);
            return;
        }

        const indexed = Array.from(probs).map((p, i) => ({ prob: p, idx: i }));
        indexed.sort((a, b) => b.prob - a.prob);
        const top = indexed.slice(0, 12);

        const barH = (h - 10) / 12;
        const labelW = 25;
        const barMaxW = w - labelW - 50;

        top.forEach(({ prob, idx }, i) => {
            const y = 5 + i * barH;
            const ch = this.engine.tokenizer.itos[idx] || '?';
            const display = ch === '\n' ? '\\n' : ch === ' ' ? '␣' : ch;

            // Label
            ctx.fillStyle = '#777';
            ctx.font = `${Math.min(barH * 0.65, 11)}px Courier New`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(display, labelW - 3, y + barH / 2);

            // Bar background
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(labelW, y + 2, barMaxW, barH - 4);

            // Bar fill
            const barW = prob * barMaxW;
            const gradient = ctx.createLinearGradient(labelW, 0, labelW + barW, 0);
            gradient.addColorStop(0, '#2255aa');
            gradient.addColorStop(1, '#4af');
            ctx.fillStyle = gradient;
            ctx.globalAlpha = 0.8;
            ctx.fillRect(labelW, y + 2, barW, barH - 4);
            ctx.globalAlpha = 1;

            // Percentage
            ctx.fillStyle = '#555';
            ctx.textAlign = 'left';
            ctx.font = `${Math.min(barH * 0.55, 9)}px Courier New`;
            ctx.fillText(`${(prob * 100).toFixed(1)}%`, labelW + barW + 4, y + barH / 2);
        });
    }

    // === COLOR UTILITIES ===

    infernoColor(t) {
        // Simplified inferno colormap (dark purple → red → yellow)
        t = Math.max(0, Math.min(1, t));
        const r = Math.round(Math.min(255, t * 3 * 255 * 0.8 + t * t * 200));
        const g = Math.round(Math.max(0, (t - 0.4) * 2 * 255));
        const b = Math.round(Math.max(0, 140 - t * 300));
        return `rgb(${r},${g},${b})`;
    }

    divergingColor(val) {
        // Blue (negative) → dark (zero) → red (positive)
        val = Math.max(-1, Math.min(1, val));
        if (val < 0) {
            const t = -val;
            return `rgb(${Math.round(17 + t * 17)},${Math.round(17 + t * 51)},${Math.round(17 + t * 153)})`;
        } else {
            const t = val;
            return `rgb(${Math.round(17 + t * 153)},${Math.round(17 + t * 34)},${Math.round(17 + t * 17)})`;
        }
    }

    hexWithAlpha(hex, alpha) {
        // Convert hex color + alpha to rgba
        const r = parseInt(hex.slice(1, 3), 16) || parseInt(hex.slice(1, 2), 16) * 17 || 68;
        const g = parseInt(hex.slice(3, 5), 16) || parseInt(hex.slice(2, 3), 16) * 17 || 170;
        const b = parseInt(hex.slice(5, 7), 16) || parseInt(hex.slice(3, 4), 16) * 17 || 255;
        return `rgba(${r},${g},${b},${alpha})`;
    }

    // === PUBLIC API ===

    onInferenceToken(step) {
        this.inferenceStep = step;
        this.animateInference(step, 0);
        this.drawAttention(0, 0);
        this.drawProbs(this.engine.getProbs());
    }

    onTrainingStep(step, loss) {
        this.lossHistory.push(loss);
        this.trainingStep = step;
        this.animateTraining(step);
        this.drawLoss();
        this.drawWeightDeltas();
    }

    onIdle() {
        this.resetNodeHighlights();
        this.state = 'idle';
    }

    addLoss(loss) {
        this.lossHistory.push(loss);
    }

    redrawAll() {
        this.drawAttention(0, 0);
        this.drawWeights();
        this.drawLoss();
        this.drawProbs(this.engine.initialized ? this.engine.getProbs() : null);
    }

    selectComponent(layer, component) {
        this.activeLayer = layer;
        this.activeComponent = component;
        this.drawWeights();
    }
}
