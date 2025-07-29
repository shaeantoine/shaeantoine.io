export class GameManager {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error(`Canvas with ID '${canvasId}' not found. Cannot initialize GameManager.`);
            throw new Error(`Canvas with ID '${canvasId}' not found.`);
        }

        this.ctx = this.canvas.getContext('2d');
        if (!this.ctx) {
            console.error(`2D rendering context not available. Cannot initialize GameManager.`);
            throw new Error(`2D rendering context not available.`);
        }

        this.lastTime = 0;
        this.animationFrameId = null;
        this.isRespawning = false;

        this.gameState = {
            cursor : {
                x: this.canvas.width / 2,
                y: this.canvas.height / 2,
                radius: 20,
            },
            level : {
                width: this.canvas.width,
                height: this.canvas.height,
                background: '#000000'
            },
            score: 0,
            isGameOver: false,
        }

        this.mouseX = 0;
        this.mouseY = 0;

        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left; 
            this.mouseY = e.clientY - rect.top;
        });

        this.gameLoop = this.gameLoop.bind(this);
        
        this.initCursor = null;
        this.updateCursor = null;
        this.respawnCursor = null;
    }

    setCursorPosition = (x,y) => {
        this.gameState.cursor.x = x;
        this.gameState.cursor.y = y;
    }

    getMouseX = () => this.mouseX;
    getMouseY = () => this.mouseY;

    getWindowWidth = () => this.gameState.level.width;
    getWindowHeight = () => this.gameState.level.height;

    getScore = () => this.gameState.score;
    setScore = (s) => {this.gameState.score = s;};

    getIsGameOver = () => this.gameState.isGameOver;
    setGameover = (isOver) => {this.gameState.isGameOver = isOver;}; 

    setInitCursor(fn) {
        this.initCursor = fn;
    }

    setUpdateCursor(fn) {
        this.updateCursor = fn;
    }

    setRespawnCursor(fn) {
        this.respawnCursor = fn;
    }

    update(deltaTime) {
        if (this.gameState.isGameOver) return; 
        
        const mouse_px = this.mouseX;
        const mouse_py = this.mouseY;
        const dx_check = this.gameState.cursor.x - mouse_px;
        const dy_check = this.gameState.cursor.y - mouse_py;
        const distance_check = Math.hypot(dx_check, dy_check);

        let collisionOccurredThisFrame = false;

        // If caught increment score and continue
        if (distance_check < this.gameState.cursor.radius) {
            this.gameState.score += 1;
            if (!this.isRespawning) {
                this.isRespawning = true;
                this.respawnCursor();
                collisionOccurredThisFrame = true;
                setTimeout(() => {
                    this.isRespawning = false;
                }, 100);
            } else if (this.isRespawning) {
                collisionOccurredThisFrame = true;
            } else {
                console.warn("Zig respawn function not yet loaded or assigned.");
            }
        }

        if (!this.isRespawning && !collisionOccurredThisFrame) {
            this.updateCursor(deltaTime / 100);
        }
    }

    render() {
        this.ctx.clearRect(0,0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = this.gameState.level.background;
        this.ctx.fillRect(0,0, this.canvas.width, this.canvas.height);

        const cursor_x = this.gameState.cursor.x;
        const cursor_y = this.gameState.cursor.y;
        const cursor_radius = this.gameState.cursor.radius; 

        this.ctx.beginPath();
        this.ctx.arc(cursor_x, cursor_y, cursor_radius, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgb(200, 50, 50)';
        this.ctx.fill();
        this.ctx.closePath();

        this.ctx.beginPath();
        this.ctx.arc(cursor_x, cursor_y, 2, 0, Math.PI * 2);
        this.ctx.fillStyle = 'white';
        this.ctx.fill();
        this.ctx.closePath();

        this.ctx.beginPath();
        this.ctx.arc(this.mouseX, this.mouseY, 5, 0, Math.PI * 2);
        this.ctx.fillStyle = 'blue';
        this.ctx.fill();
        this.ctx.closePath();

        this.ctx.fillStyle = 'white';
        this.ctx.font = '36px Arial';
        this.ctx.fillText(`Score: ${this.gameState.score}`, 10, 40);
    }

    gameLoop(currentTime) {
        const deltaTime = currentTime - this.lastTime; 
        this.lastTime = currentTime; 

        this.update(deltaTime); 
        this.render();

        this.animationFrameId = requestAnimationFrame(this.gameLoop);
    }

    startLoop() {
        if (!this.animationFrameId && this.canvas) {
            this.lastTime = performance.now();
            this.animationFrameId = requestAnimationFrame(this.gameLoop);
            console.log("Game loop has started.");
        }
    }

    stopLoop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
            console.log("Game loop has stopped.");
        }
    }
}


export const game = new GameManager('gameCanvas'); 
document.addEventListener('DOMContentLoaded', () => {
    if (game && game.canvas && game.ctx) {
        game.startLoop();
    } else {
        console.error("GameManager could not be fully initialized. Check console for previous errors.");
    }
})