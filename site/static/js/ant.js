(function () {
    var CELL_SIZE = 12;
    var STEPS_PER_TICK = 4;
    var TICK_MS = 50;
    var FADE_STEPS = 260;
    var RESET_STEPS = 9000;
    var TRAIL_COLOR = '0, 0, 0';
    var TRAIL_MAX_ALPHA = 0.5;
    var ANT_COLOR = 'rgba(0, 0, 0, 0.85)';

    // Langton's Ant: at a white cell, turn right and flip it black; at a
    // black cell, turn left and flip it white. From a single ant this
    // simple rule produces a long stretch of chaotic wandering that
    // eventually resolves into a repeating diagonal "highway" — a small
    // demonstration of a path being found rather than chosen.
    var DX = [0, 1, 0, -1];
    var DY = [-1, 0, 1, 0];

    var canvas = document.createElement('canvas');
    canvas.className = 'bg-canvas';
    document.body.insertBefore(canvas, document.body.firstChild);
    var ctx = canvas.getContext('2d');

    var cols, rows, grid, trail, ant, step;

    function resize() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        cols = Math.ceil(window.innerWidth / CELL_SIZE);
        rows = Math.ceil(window.innerHeight / CELL_SIZE);
        seed();
    }

    function seed() {
        grid = new Uint8Array(cols * rows);
        trail = [];
        step = 0;
        ant = { x: (cols / 2) | 0, y: (rows / 2) | 0, dir: (Math.random() * 4) | 0 };
    }

    function index(x, y) {
        return y * cols + x;
    }

    function advance() {
        var idx = index(ant.x, ant.y);
        var white = grid[idx] === 0;
        ant.dir = (ant.dir + (white ? 1 : 3)) % 4;
        grid[idx] = white ? 1 : 0;
        trail.push({ x: ant.x, y: ant.y, step: step });

        ant.x = (ant.x + DX[ant.dir] + cols) % cols;
        ant.y = (ant.y + DY[ant.dir] + rows) % rows;
        step++;

        if (step >= RESET_STEPS) seed();
    }

    function render() {
        ctx.fillStyle = '#979ea6';
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

        while (trail.length && step - trail[0].step > FADE_STEPS) trail.shift();

        for (var i = 0; i < trail.length; i++) {
            var t = trail[i];
            var age = step - t.step;
            var alpha = (1 - age / FADE_STEPS) * TRAIL_MAX_ALPHA;
            if (alpha <= 0) continue;
            ctx.fillStyle = 'rgba(' + TRAIL_COLOR + ', ' + alpha.toFixed(3) + ')';
            ctx.fillRect(t.x * CELL_SIZE, t.y * CELL_SIZE, CELL_SIZE - 1, CELL_SIZE - 1);
        }

        ctx.fillStyle = ANT_COLOR;
        ctx.fillRect(ant.x * CELL_SIZE, ant.y * CELL_SIZE, CELL_SIZE - 1, CELL_SIZE - 1);
    }

    function tick() {
        for (var i = 0; i < STEPS_PER_TICK; i++) advance();
        render();
    }

    window.addEventListener('resize', resize);
    resize();
    setInterval(tick, TICK_MS);
})();
