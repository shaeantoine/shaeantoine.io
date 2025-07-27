export class GameManager {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error(`Canvas with ID '${canvasId}' not found. Cannot initialize GameManager.`);
            return null;
        }

        this.ctx = this.canvas.getContext('2d');
        if (!this.ctx) {
            console.error(`2D rendering context not available. Cannot initialize GameManager.`);
            return null;
        }

        this.lastTime = 0;
        this.animationFrameId = null;

        this.gameState = {
            player : {
                x: this.canvas.width / 2,
                y: this.canvas.height / 2,
                cursor_radius: 20,
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

    getCursorX = () => this.gameState.player.x; 
    getCursorY = () => this.gameState.player.y;
    getCursorRadius = () => this.gameState.player.cursor_radius;
    
    setCursorPosition = (x,y) => {
        this.gameState.player.x = x;
        this.gameState.player.y = y;
    }

    getWindowWidth = () => this.gameState.level.width;
    getWindowHeight = () => this.gameState.level.height;

    getScore = () => this.gameState.score;
    getScore = (s) => {this.gameState.score = s;};

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

        const mouse_px = obs[2] * this.gameState.level.width;
        const mouse_py = obs[3] * this.gameState.level.height;
        const dx_check = this.gameState.player.x - mouse_px;
        const dy_check = this.gameState.player.y - mouse_py;
        const distance_check = Math.hypot(dx_check, dy_check);

        // If caught increment score and continue
        if (distance_check < this.gameState.player.cursor_radius) {
            this.gameState.score += 1;
            this.respawnCursor();
        }
    }

    render() {
        this.xtc.clearRect(0,0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = this.gameState.level.background;
        this.ctx.fillRect(0,0, this.canvas.width, this.canvas.height);

        const cursor_x = this.gameState.player.x;
        const cursor_y = this.gameState.player.y;
        const cursor_radius = this.gameState.player.cursor_radius; 

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

let gameManagerInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    gameManagerInstance = new GameManager('gameCanvas');
    if (gameManagerInstance && gameManagerInstance.canvas) {
        gameManagerInstance.startLoop();
        window.game = gameManagerInstance;
    }
})