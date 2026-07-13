const CELL_SIZE = 16;
const STEP_MS = 160;
const SEED_DENSITY = 0.18;
const BLUR_RADIUS = 2;
const BG_COLOR = '#979ea6';
const CONTOUR_LEVELS = [
    { threshold: 0.22, color: 'rgba(32, 36, 42, 0.10)' },
    { threshold: 0.5, color: 'rgba(32, 36, 42, 0.22)' }
];

/**
 * Conway's Game of Life, rendered as topographic contour lines rather than
 * filled blocks — the raw grid is blurred into a density field each frame
 * and traced with marching squares, so clusters read as breathing isoline
 * loops (a math/art object) instead of a literal cellular-automaton grid.
 */
export class GameOfLife {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        this._onResize = this._onResize.bind(this);
        window.addEventListener('resize', this._onResize);

        this._resize();
        this._seed();
        this._interval = setInterval(() => {
            this._step();
            this._render();
        }, STEP_MS);
    }

    dispose() {
        clearInterval(this._interval);
        window.removeEventListener('resize', this._onResize);
    }

    _onResize() {
        this._resize();
        this._seed();
    }

    _resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.cols = Math.ceil(window.innerWidth / CELL_SIZE);
        this.rows = Math.ceil(window.innerHeight / CELL_SIZE);
    }

    _seed() {
        this.grid = new Uint8Array(this.cols * this.rows);
        for (let i = 0; i < this.grid.length; i++) {
            this.grid[i] = Math.random() < SEED_DENSITY ? 1 : 0;
        }
    }

    _index(x, y) {
        return y * this.cols + x;
    }

    _countNeighbors(x, y) {
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = (x + dx + this.cols) % this.cols;
                const ny = (y + dy + this.rows) % this.rows;
                count += this.grid[this._index(nx, ny)];
            }
        }
        return count;
    }

    _step() {
        const next = new Uint8Array(this.grid.length);
        let aliveCount = 0;
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const idx = this._index(x, y);
                const alive = this.grid[idx];
                const neighbors = this._countNeighbors(x, y);
                const survives = alive ? (neighbors === 2 || neighbors === 3) : neighbors === 3;
                next[idx] = survives ? 1 : 0;
                aliveCount += next[idx];
            }
        }

        // Toroidal Life boards tend to settle into either near-total death
        // or a static/oscillating low-population remainder — re-seed once
        // it thins out too far so the texture stays visibly alive rather
        // than going inert behind the page.
        if (aliveCount < this.grid.length * 0.02) {
            this._seed();
        } else {
            this.grid = next;
        }
    }

    // Blurs the raw 0/1 grid into a continuous density field so contours
    // trace smooth blob-like boundaries around clusters of cells rather
    // than following individual cell edges.
    _computeField() {
        const field = new Float32Array(this.grid.length);
        const kernelArea = (BLUR_RADIUS * 2 + 1) ** 2;
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                let sum = 0;
                for (let dy = -BLUR_RADIUS; dy <= BLUR_RADIUS; dy++) {
                    for (let dx = -BLUR_RADIUS; dx <= BLUR_RADIUS; dx++) {
                        const nx = (x + dx + this.cols) % this.cols;
                        const ny = (y + dy + this.rows) % this.rows;
                        sum += this.grid[this._index(nx, ny)];
                    }
                }
                field[this._index(x, y)] = sum / kernelArea;
            }
        }
        return field;
    }

    _cellCenter(x, y) {
        return [x * CELL_SIZE + CELL_SIZE / 2, y * CELL_SIZE + CELL_SIZE / 2];
    }

    // Point along the line between two adjacent sample centers, placed
    // where the field crosses `threshold` (standard marching-squares
    // linear interpolation).
    _lerpPoint(x0, y0, v0, x1, y1, v1, threshold) {
        const t = v1 === v0 ? 0.5 : (threshold - v0) / (v1 - v0);
        const [px0, py0] = this._cellCenter(x0, y0);
        const [px1, py1] = this._cellCenter(x1, y1);
        return [px0 + (px1 - px0) * t, py0 + (py1 - py0) * t];
    }

    // Marching squares: walks every 2x2 block of samples and, for each one,
    // emits the line segment(s) separating corners above/below `threshold`.
    // The two diagonal cases (5 and 10) are ambiguous saddles; resolved by
    // treating the pair of like corners as connected through the middle,
    // which is a standard, visually stable choice for this kind of field.
    _traceContour(field, threshold) {
        const segments = [];
        for (let y = 0; y < this.rows - 1; y++) {
            for (let x = 0; x < this.cols - 1; x++) {
                const tl = field[this._index(x, y)];
                const tr = field[this._index(x + 1, y)];
                const br = field[this._index(x + 1, y + 1)];
                const bl = field[this._index(x, y + 1)];

                const c = (tl >= threshold ? 8 : 0) | (tr >= threshold ? 4 : 0)
                    | (br >= threshold ? 2 : 0) | (bl >= threshold ? 1 : 0);
                if (c === 0 || c === 15) continue;

                const edgePoint = (edge) => {
                    switch (edge) {
                        case 'n': return this._lerpPoint(x, y, tl, x + 1, y, tr, threshold);
                        case 'e': return this._lerpPoint(x + 1, y, tr, x + 1, y + 1, br, threshold);
                        case 's': return this._lerpPoint(x + 1, y + 1, br, x, y + 1, bl, threshold);
                        case 'w': return this._lerpPoint(x, y + 1, bl, x, y, tl, threshold);
                    }
                };

                switch (c) {
                    case 1: segments.push([edgePoint('w'), edgePoint('s')]); break;
                    case 2: segments.push([edgePoint('s'), edgePoint('e')]); break;
                    case 3: segments.push([edgePoint('w'), edgePoint('e')]); break;
                    case 4: segments.push([edgePoint('e'), edgePoint('n')]); break;
                    case 5: segments.push([edgePoint('w'), edgePoint('n')], [edgePoint('s'), edgePoint('e')]); break;
                    case 6: segments.push([edgePoint('n'), edgePoint('s')]); break;
                    case 7: segments.push([edgePoint('n'), edgePoint('w')]); break;
                    case 8: segments.push([edgePoint('n'), edgePoint('w')]); break;
                    case 9: segments.push([edgePoint('n'), edgePoint('s')]); break;
                    case 10: segments.push([edgePoint('n'), edgePoint('e')], [edgePoint('w'), edgePoint('s')]); break;
                    case 11: segments.push([edgePoint('e'), edgePoint('n')]); break;
                    case 12: segments.push([edgePoint('e'), edgePoint('w')]); break;
                    case 13: segments.push([edgePoint('s'), edgePoint('e')]); break;
                    case 14: segments.push([edgePoint('w'), edgePoint('s')]); break;
                }
            }
        }
        return segments;
    }

    _render() {
        const ctx = this.ctx;
        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

        const field = this._computeField();
        ctx.lineWidth = 1;
        for (const level of CONTOUR_LEVELS) {
            ctx.strokeStyle = level.color;
            ctx.beginPath();
            for (const [[x0, y0], [x1, y1]] of this._traceContour(field, level.threshold)) {
                ctx.moveTo(x0, y0);
                ctx.lineTo(x1, y1);
            }
            ctx.stroke();
        }
    }
}
