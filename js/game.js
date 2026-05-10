// Game: canvas rendering, dot physics, catch detection, score tracking
// Phase 1: rule-based evasion (replaced by MLP in Phase 2)

export class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.running = false;
        this.animFrame = null;

        // Player (mouse)
        this.playerX = 0;
        this.playerY = 0;

        // Dot (the agent)
        this.dotX = 0;
        this.dotY = 0;
        this.dotSpeed = 3;
        this.dotRadius = 18;
        this.dotColor = '#4af';

        // Game state
        this.score = 0;
        this.catchCount = 0;
        this.framesSurvived = 0;
        this.totalFramesSurvived = 0;
        this.bestStreak = 0;
        this.startTime = null;
        this.lastObs = null;
        this.prevObs = null;

        // Callbacks
        this.onCatch = null;
        this.onFrame = null;

        // External movement function (set by brain in Phase 2+)
        // Signature: (obs) => [dx, dy] normalized [-1, 1]
        this.moveFn = null;

        this.resize();
        this.respawn();
        this.bindEvents();
    }

    bindEvents() {
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.playerX = e.clientX - rect.left;
            this.playerY = e.clientY - rect.top;
        });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const touch = e.touches[0];
            this.playerX = touch.clientX - rect.left;
            this.playerY = touch.clientY - rect.top;
        }, { passive: false });

        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    respawn() {
        const margin = this.dotRadius * 2;
        this.dotX = margin + Math.random() * (this.width - margin * 2);
        this.dotY = margin + Math.random() * (this.height - margin * 2);
        this.framesSurvived = 0;
    }

    start() {
        this.running = true;
        this.startTime = Date.now();
        this.resize();
        this.respawn();
        this.loop();
    }

    stop() {
        this.running = false;
        if (this.animFrame) {
            cancelAnimationFrame(this.animFrame);
            this.animFrame = null;
        }
    }

    loop() {
        if (!this.running) return;
        this.update();
        this.draw();
        this.animFrame = requestAnimationFrame(() => this.loop());
    }

    // === GAME LOGIC ===

    update() {
        const obs = this.observe();
        this.prevObs = this.lastObs;
        this.lastObs = obs;

        // Move dot: use brain if available, otherwise rule-based
        if (this.moveFn) {
            const [dx, dy] = this.moveFn(obs);
            this.dotX += dx * this.dotSpeed;
            this.dotY += dy * this.dotSpeed;
            this.clampDot();
        } else {
            this.moveDotRuleBased(obs);
        }

        // Check catch
        if (obs.distance < this.dotRadius) {
            this.score++;
            this.catchCount++;
            if (this.framesSurvived > this.bestStreak) {
                this.bestStreak = this.framesSurvived;
            }
            this.totalFramesSurvived += this.framesSurvived;

            if (this.onCatch) {
                this.onCatch({
                    score: this.score,
                    obs: this.prevObs || obs,
                    framesSurvived: this.framesSurvived
                });
            }

            this.respawn();
        }

        this.framesSurvived++;

        if (this.onFrame) {
            this.onFrame(obs);
        }
    }

    observe() {
        const dx = this.dotX - this.playerX;
        const dy = this.dotY - this.playerY;
        const distance = Math.hypot(dx, dy);

        return {
            dotX: this.dotX / this.width,
            dotY: this.dotY / this.height,
            playerX: this.playerX / this.width,
            playerY: this.playerY / this.height,
            distance,
            normalizedDist: distance / Math.hypot(this.width, this.height),
            dx,
            dy
        };
    }

    moveDotRuleBased(obs) {
        const fleeRadius = 120;

        if (obs.distance < fleeRadius) {
            // Move away from player
            const angle = Math.atan2(obs.dy, obs.dx);
            const jitter = (Math.random() - 0.5) * 0.3;
            this.dotX += this.dotSpeed * Math.cos(angle + jitter);
            this.dotY += this.dotSpeed * Math.sin(angle + jitter);
        } else {
            // Wander randomly
            this.dotX += (Math.random() - 0.5) * 2;
            this.dotY += (Math.random() - 0.5) * 2;
        }

        this.clampDot();
    }

    clampDot() {
        this.dotX = Math.max(this.dotRadius, Math.min(this.width - this.dotRadius, this.dotX));
        this.dotY = Math.max(this.dotRadius, Math.min(this.height - this.dotRadius, this.dotY));
    }

    // === RENDERING ===

    draw() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        // Background
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, w, h);

        // Grid (subtle)
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 0.5;
        const gridSize = 50;
        for (let x = 0; x < w; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let y = 0; y < h; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // Dot (the agent)
        this.drawDot(ctx);

        // Player cursor indicator
        this.drawPlayer(ctx);

        // HUD
        this.drawHUD(ctx, w, h);
    }

    drawDot(ctx) {
        // Outer glow
        const gradient = ctx.createRadialGradient(
            this.dotX, this.dotY, 0,
            this.dotX, this.dotY, this.dotRadius * 2
        );
        gradient.addColorStop(0, 'rgba(68, 170, 255, 0.15)');
        gradient.addColorStop(1, 'rgba(68, 170, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.dotX, this.dotY, this.dotRadius * 2, 0, Math.PI * 2);
        ctx.fill();

        // Main dot
        ctx.fillStyle = this.dotColor;
        ctx.beginPath();
        ctx.arc(this.dotX, this.dotY, this.dotRadius, 0, Math.PI * 2);
        ctx.fill();

        // Inner highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(this.dotX - 4, this.dotY - 4, this.dotRadius * 0.35, 0, Math.PI * 2);
        ctx.fill();
    }

    drawPlayer(ctx) {
        // Crosshair
        const size = 8;
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(this.playerX - size, this.playerY);
        ctx.lineTo(this.playerX + size, this.playerY);
        ctx.moveTo(this.playerX, this.playerY - size);
        ctx.lineTo(this.playerX, this.playerY + size);
        ctx.stroke();

        // Distance line to dot (when close)
        const dist = this.lastObs ? this.lastObs.distance : Infinity;
        if (dist < 150) {
            const alpha = Math.max(0, 1 - dist / 150) * 0.3;
            ctx.strokeStyle = `rgba(255, 68, 68, ${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(this.playerX, this.playerY);
            ctx.lineTo(this.dotX, this.dotY);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    drawHUD(ctx, w, h) {
        ctx.font = '13px Courier New';
        ctx.textBaseline = 'top';

        // Score (top left)
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.fillText(`catches: ${this.score}`, 16, 16);

        // Survival streak
        ctx.fillStyle = '#555';
        ctx.fillText(`streak: ${this.framesSurvived}`, 16, 34);

        // Best streak
        ctx.fillText(`best: ${this.bestStreak}`, 16, 52);

        // Time
        if (this.startTime) {
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            ctx.textAlign = 'right';
            ctx.fillStyle = '#444';
            ctx.fillText(`${elapsed}s`, w - 16, 16);
        }

        // Hint (fades after first catch)
        if (this.score === 0) {
            ctx.textAlign = 'center';
            ctx.fillStyle = '#333';
            ctx.fillText('move your cursor to catch the dot', w / 2, h - 30);
        }
    }

    // === PUBLIC API ===

    reset() {
        this.score = 0;
        this.catchCount = 0;
        this.framesSurvived = 0;
        this.totalFramesSurvived = 0;
        this.bestStreak = 0;
        this.startTime = Date.now();
        this.respawn();
    }

    getStats() {
        return {
            score: this.score,
            bestStreak: this.bestStreak,
            avgSurvival: this.catchCount > 0
                ? Math.round(this.totalFramesSurvived / this.catchCount)
                : 0,
            elapsed: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0
        };
    }
}
