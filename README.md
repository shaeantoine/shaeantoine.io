# Catch the Dot

A browser game where a dot learns to evade the player's cursor in real-time. The dot starts dumb — random movement, easily caught. Each time it's caught, the model runs gradient steps immediately. Within a session of play, the dot evolves from trivial to genuinely difficult to catch.

The player IS the training data. You move your cursor, you catch the dot, the dot gets smarter.

Underneath: a Zig-compiled WASM MLP running inference every frame and backpropagation on each catch event, with live visualization of the network learning.

## Architecture

```
Browser (static site on Render)
├── Game Canvas — player cursor, dot agent, score, difficulty meter
├── Viz Panel — network graph (SVG), weight heatmap, loss curve, activations
├── JS Game Loop (requestAnimationFrame)
│   ├── Read mouse position
│   ├── Call WASM forward() → get dot action
│   ├── Update dot position
│   ├── On catch → WASM train (experience replay)
│   └── Update viz panels
├── WASM (Zig MLP)
│   ├── forward(obs[5]) → action[2]
│   ├── train_step(target, lr) → loss
│   ├── Adam optimizer with gradient clipping
│   └── Weight export/import for persistence
└── IndexedDB — weight persistence across sessions
```

## MLP

**Input:** 5 floats — `[escape_dx, escape_dy, normalized_dist, dot_x, dot_y]`

**Architecture:** Input(5) → Dense(32) → GELU → Dense(32) → GELU → Dense(2) → linear output

**Output:** 2 floats `[dx, dy]` clipped to [-1, 1] in JS, scaled by dot speed

**Parameters:** 1,314 (5.1 KB as f32)

**Training:** Supervised hindsight — on each catch, the ideal escape direction (away from player) is computed and stored in an experience replay buffer (capacity 32). A mini-batch of 8 is sampled for gradient steps. Additionally, frames survived near the player trigger gentle reinforcement toward the current escape direction.

## File Structure

```
├── index.html              # Game + viz layout
├── model.wasm              # Compiled MLP
├── render.yaml             # Render static site config
├── js/
│   ├── game.js             # Game loop, canvas rendering, physics
│   ├── brain.js            # WASM interface, replay buffer, training
│   ├── viz.js              # Visualization panels (SVG graph, canvas)
│   └── persistence.js      # IndexedDB weight storage
├── zig-mlp/
│   └── src/
│       ├── main.zig        # WASM exports, arena allocator, init
│       ├── mlp.zig         # Forward pass (3 dense layers + GELU)
│       ├── backward.zig    # Backward pass (MSE loss)
│       ├── optimizer.zig   # Adam optimizer
│       └── math.zig        # matmul, gelu, clamp, zero, copy
└── scripts/
    └── build.sh            # zig build → model.wasm
```

## Build

```bash
./scripts/build.sh
```

Requires [Zig](https://ziglang.org/) (0.13+). Compiles `zig-mlp/src/main.zig` to `model.wasm`.

## Run

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`. The game starts immediately — move your cursor to catch the dot.

## How It Works

1. The dot moves each frame based on the MLP's output for the current observation
2. When the player catches the dot, the escape direction is stored in a replay buffer
3. A batch of 8 random experiences from the buffer trains the network (lr=0.02)
4. Reinforcement gently nudges the network when the dot survives near the player
5. Weights are saved to IndexedDB after each catch — the dot remembers across sessions
6. Press "new brain" to reset and watch it learn from scratch
