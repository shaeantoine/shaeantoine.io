# DIO — Browser-Based Self-Improving Transformer

## Section 1: System Overview

**One-line summary:** A static website hosting a tiny transformer that generates text, learns from user corrections in real-time, and visualizes its own internals — all running client-side in WASM.

### High-level Data Flow

```
User types message
       ↓
JS tokenizes input (char-level)
       ↓
WASM forward pass (token by token)
       ↓                          ↓
JS renders generated text    JS reads activations/attention
       ↓                          ↓
User edits the output        Dashboard updates live
       ↓
JS sends corrected tokens to WASM
       ↓
WASM backward pass (few gradient steps)
       ↓                          ↓
Updated weights stored       Dashboard shows weight deltas
in WASM linear memory        and loss curve dropping
       ↓
Periodically: JS copies weights → IndexedDB
```

### Components

| Component | Role |
|-----------|------|
| `zig-transformer/` | Model: forward pass, backprop, optimizer — compiled to WASM |
| `js/engine.js` | Orchestrates inference/training, manages WASM memory, tokenization |
| `js/chat.js` | Chat UI, message history, edit-mode for corrections |
| `js/viz.js` | Dashboard rendering (SVG architecture graph + Canvas panels) |
| `js/persistence.js` | IndexedDB read/write for weight snapshots |
| `index.html + style.css` | Layout shell, split-screen CSS |
| `weights/base.bin` | Pre-trained Shakespeare weights (static asset, ~400KB) |
| `train/` | Offline Python script to produce base.bin |

### Constraints

- Static site only (Render free tier) — no server, no API calls
- All compute runs in-browser via WASM
- Must be interactive: inference < 100ms/token, training step < 500ms
- Target model size: ~100K parameters (~400KB as float32)
- Character-level vocabulary (~65 tokens for Shakespeare)

---

## Section 2: Transformer Architecture

### Model Specifications

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Vocab size | 65 | Unique chars in Shakespeare (~26 upper + 26 lower + punctuation + space + newline) |
| Embedding dim | 64 | Smallest viable size that produces meaningful attention patterns |
| Layers | 2 | Minimum for the model to learn non-trivial patterns |
| Attention heads | 2 | Enough to show divergent attention strategies in viz |
| Context window | 128 tokens | Balances memory usage vs. coherence |
| FFN hidden dim | 256 | Standard 4x expansion ratio |
| Total params | ~105K | Fits comfortably in WASM memory |

### Architecture (per layer)

```
Input embeddings (65 × 64) + Positional embeddings (128 × 64)
       ↓
┌─── Transformer Block (×2) ───┐
│  LayerNorm                    │
│  Multi-Head Self-Attention    │
│    - Q, K, V projections (64×64 each)
│    - 2 heads, head_dim = 32   │
│    - Causal mask              │
│  Residual connection          │
│  LayerNorm                    │
│  FFN (64 → 256 → 64, GELU)   │
│  Residual connection          │
└───────────────────────────────┘
       ↓
LayerNorm → Linear (64 → 65) → Softmax → next token probabilities
```

### Design Rationale

- **2 layers / 2 heads** — the minimum where you can observe different heads learning different patterns (one might attend locally, another long-range). Fewer would make the viz boring.
- **64-dim embeddings** — keeps matmul fast in WASM. A 64×64 matmul is ~260K FLOPs — trivial even without SIMD.
- **128 context** — longer than most user messages will be, avoids truncation in normal conversation.
- **GELU over ReLU** — marginally better training dynamics, and the implementation is just one extra line in Zig.

### Memory Layout in WASM

All weights stored as contiguous f32 arrays in WASM linear memory. The JS side knows the offsets and sizes to read them for visualization without copying.

---

## Section 3: WASM Interface & JS↔Zig Boundary

The WASM module exposes a minimal set of functions. JS orchestrates everything through them.

### Exported Functions (Zig → JS)

```zig
// Core lifecycle
export fn init(weights_ptr: [*]const u8, weights_len: u32) void
export fn reset() void

// Inference
export fn forward(token: u32) void          // feed one token, advance state
export fn get_next_probs() [*]const f32      // get probability distribution (65 floats)
export fn sample(temperature: f32) u32       // sample next token from probs

// Training
export fn begin_training(target_ptr: [*]const u32, target_len: u32) void
export fn train_step(learning_rate: f32) f32  // one gradient step, returns loss

// Visualization data access (zero-copy reads into WASM memory)
export fn get_attention_ptr(layer: u32, head: u32) [*]const f32
export fn get_weights_ptr(layer: u32, component: u32) [*]const f32
export fn get_activations_ptr(layer: u32) [*]const f32
export fn get_weight_deltas_ptr(layer: u32, component: u32) [*]const f32
```

### Imported Functions (JS → Zig host)

```zig
extern fn console_log(ptr: [*]const u8, len: u32) void  // debugging only
```

### JS Orchestration Pattern (engine.js)

```javascript
// Load WASM + initialize with weights
const wasm = await WebAssembly.instantiateStreaming(fetch('./model.wasm'), imports);
const memory = wasm.instance.exports.memory;

// Load pre-trained weights into WASM memory
const weightsBuffer = await fetch('./weights/base.bin').then(r => r.arrayBuffer());
const weightsPtr = wasm.instance.exports.alloc(weightsBuffer.byteLength);
new Uint8Array(memory.buffer, weightsPtr).set(new Uint8Array(weightsBuffer));
wasm.instance.exports.init(weightsPtr, weightsBuffer.byteLength);

// Inference: feed tokens one by one, read probs each step
for (const token of inputTokens) {
    wasm.instance.exports.forward(token);
    const probsPtr = wasm.instance.exports.get_next_probs();
    const probs = new Float32Array(memory.buffer, probsPtr, 65);
    // → send probs to viz, sample next token
}

// Training: pass corrected sequence, run N steps
wasm.instance.exports.begin_training(targetPtr, targetLen);
for (let i = 0; i < steps; i++) {
    const loss = wasm.instance.exports.train_step(0.001);
    // → send loss to viz, read weight deltas
}
```

### Key Design Decisions

- **Zero-copy visualization** — JS reads directly from WASM linear memory via `Float32Array` views. No serialization, no copying. The `get_*_ptr` functions just return offsets.
- **Stateful model** — the WASM module holds the KV cache and current sequence position internally. JS doesn't manage transformer state.
- **Minimal surface area** — only ~10 exported functions. Everything complex stays in Zig. JS is just an orchestrator.
- **Memory ownership** — Zig owns all model memory. JS only writes to WASM memory when loading weights or passing training targets.

---

## Section 4: Training Loop & Feedback Mechanism

### Interaction Cycle

```
1. User sends message: "Tell me about the stars"
2. Model generates: "The stirs of heauen do shine upon thee"
3. User edits it to: "The stars of heaven do shine upon thee"
4. System diffs original vs. corrected → identifies training target
5. WASM runs 3-5 gradient steps on: input="The st" target="ars of heaven do shine upon thee"
6. Dashboard animates the weight updates + loss decrease
7. Next generation benefits from the correction
```

### Training Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Optimizer | Adam | Adaptive LR handles sparse updates well; only ~10 extra bytes per param for state |
| Learning rate | 0.001 | Aggressive enough to show visible change in 3-5 steps |
| Gradient steps per correction | 3-5 | Enough to measurably reduce loss on the target, not so many it overfits to one example |
| Loss function | Cross-entropy | Standard for next-token prediction, differentiable through softmax |
| Gradient clipping | max_norm = 1.0 | Prevents exploding gradients from unusual corrections |

### Training Target Construction

The user's corrected text becomes a supervised sequence. The system:

1. Tokenizes the full corrected message (char → int)
2. Creates input/target pairs: input[i] = tokens[0..i], target[i] = tokens[i+1]
3. Passes the full target sequence to WASM via `begin_training()`
4. Each `train_step()` does a full forward + backward pass over the sequence and returns the loss

### What "Self-Improvement" Means Here

The model isn't doing anything exotic — it's standard supervised fine-tuning. But from the user's perspective, they correct the model, watch the weights physically change, and see the next response improve. The *experience* of self-improvement is what matters, and it's genuine: the model actually does get better at producing what that user wants.

### Safeguards

- **Catastrophic forgetting** — with aggressive fine-tuning on short sequences, the model could forget Shakespeare entirely and only output the user's corrections. Mitigation: mix in one replay step from the base training data per user correction (keep a small text buffer of Shakespeare in JS).
- **Divergence** — if the user gives contradictory corrections, the model could destabilize. Mitigation: cap max gradient norm and monitor loss; if loss spikes above a threshold after a correction, roll back that update.
- **"This was good" signal** — when the user accepts without editing, run 1 reinforcement step at a lower learning rate (0.0001) to weakly reinforce the model's output.

---

## Section 5: Visualization Dashboard

The right panel is divided into four panels that update in real-time during inference and training.

### Layout (right side of split screen)

```
┌─────────────────────────────────┐
│  NETWORK GRAPH (SVG)            │
│  [Layer nodes + connections]    │
│  Nodes glow during activation   │
├────────────────┬────────────────┤
│  ATTENTION     │  WEIGHTS       │
│  (Canvas)      │  (Canvas)      │
│  Heatmap grid  │  Matrix viz    │
│  per head      │  with deltas   │
├────────────────┴────────────────┤
│  LOSS CURVE (Canvas)  │  PROBS  │
│  Time-series graph    │  Bar    │
│                       │  chart  │
└───────────────────────┴─────────┘
```

### Panel 1: Network Architecture Graph (SVG)

A simplified diagram of the transformer showing:
- Input embedding layer (rectangle)
- Each transformer block as a group (attention → FFN)
- Output layer with softmax
- Connections between layers as edges

**During inference:** nodes light up sequentially as data flows through. The current "active" layer glows brighter. Edges animate with a pulse traveling along them to show data direction.

**During training:** same graph but edges turn orange/red to show gradient flow backward. The brightness of each node corresponds to the gradient magnitude at that layer.

**Interaction:** hover over any node to select it — the weight panel below zooms into that component's weight matrix.

### Panel 2: Attention Heatmap (Canvas)

A grid for each head (2 heads × 2 layers = 4 small heatmaps, or a tabbed view):
- X-axis: key positions (which tokens are being attended to)
- Y-axis: query positions (which tokens are doing the attending)
- Color: attention weight magnitude (dark → bright, using a plasma/inferno colormap)
- Updates every token during generation — you watch the attention pattern build up as the sequence grows

**Size:** 128×128 max (context window), but only the active portion is filled. At char-level with short messages, typically 20-60 cells per axis.

### Panel 3: Weight Matrix Visualization (Canvas)

Shows the selected weight matrix as a heatmap:
- Default view: the Q projection of layer 0, head 0 (64×32 = 2048 cells)
- User can click different components in the architecture graph to switch views
- Color encodes weight value (blue = negative, white = zero, red = positive)

**During training:** an overlay shows the *delta* (how much each weight changed). Cells that moved significantly flash bright green (increased) or purple (decreased), then fade back. This is the "watching it learn" moment.

### Panel 4a: Loss Curve (Canvas)

A scrolling time-series line chart:
- X-axis: training steps (both from corrections and reinforcement)
- Y-axis: cross-entropy loss
- A horizontal dashed line shows the base model's average loss (reference)
- Each user correction creates a visible "spike then drop" pattern — loss jumps when new target is introduced, then decreases over the gradient steps
- The overall trend shows whether the model is improving across the session

### Panel 4b: Token Probability Distribution (Canvas)

A horizontal bar chart showing top-10 predicted next tokens:
- Updates every token during generation
- The sampled token is highlighted
- Bar length = probability
- Character labels on the left
- During generation: you see the model's "decision-making" in real-time — sometimes confident (one bar dominates), sometimes uncertain (many bars similar)

### Rendering Performance

At ~105K parameters:
- Attention heatmaps: 4 matrices × 128×128 × 4 bytes = ~260KB of data per frame → trivial to render
- Weight matrices: largest is 64×256 (FFN) = 16K cells → fine for Canvas at 60fps
- Loss curve: just appending a point to a line → negligible
- The bottleneck is the WASM compute, not the visualization

### Color Scheme

Fits the dark site aesthetic:
- Background: #0a0a0a
- Inactive nodes: #1a1a1a with #333 borders
- Active nodes: glow with #4af (blue-white)
- Attention heatmap: dark purple → orange → yellow (inferno)
- Weight values: #2244aa (negative) → #111 (zero) → #aa3322 (positive)
- Weight deltas: #22cc66 (increased) → transparent → #9933ff (decreased)
- Loss curve line: #4af
- Probability bars: #4af with #2a2a2a track

---

## Section 6: Persistence Layer

### What Gets Persisted

| Data | Storage | Size | When |
|------|---------|------|------|
| Model weights (f32) | IndexedDB | ~420KB | After every training batch (debounced) |
| Adam optimizer state (m, v) | IndexedDB | ~840KB | Alongside weights |
| Conversation history | localStorage | ~50KB max | After each message |
| Session metadata (total steps, corrections count) | localStorage | <1KB | After each interaction |

### IndexedDB Schema

```javascript
// Database: "dio-model"
// Object store: "checkpoints"
{
    id: "current",           // always overwrite the one active checkpoint
    weights: ArrayBuffer,    // raw f32 model weights
    optimizer: ArrayBuffer,  // Adam m + v vectors
    version: 1,             // schema version for future migrations
    timestamp: Date,
    totalSteps: number,
    corrections: number
}

// Object store: "base"
{
    id: "shakespeare",       // the original pre-trained weights (for reset)
    weights: ArrayBuffer
}
```

### Lifecycle

1. **Page load:** Check IndexedDB for a "current" checkpoint. If found, load those weights into WASM instead of `base.bin`. If not found (first visit or cleared), fetch `base.bin` from the static asset.
2. **After training:** Debounce 2 seconds after the last gradient step, then copy the full weight buffer from WASM memory into IndexedDB. This avoids writing on every single step.
3. **Reset button:** Copy the "base" store's weights back into WASM memory and delete the "current" checkpoint. Model returns to original Shakespeare behavior.
4. **Conversation history:** Stored in localStorage as a JSON array of `{role, text, timestamp}`. Displayed on reload so the user sees their past conversation. Capped at ~200 messages (oldest pruned).

### Failure Modes

- **Storage quota exceeded** — IndexedDB allows at least 50MB per origin (usually much more). Our total is ~1.3MB. Not a concern.
- **Incognito/private browsing** — some browsers limit or clear IndexedDB. Graceful fallback: just load base weights, show a small note "your model won't persist in private browsing."
- **Corrupted data** — if weight buffer is wrong length on load, discard and fall back to base. A simple byte-length check is sufficient.

---

## Section 7: Build Pipeline & Deployment

### Final Directory Structure

```
shaeantoine.io/
├── index.html                  # Split-screen layout shell
├── style.css                   # All styles (dark theme, grid layout, viz panels)
├── js/
│   ├── engine.js               # WASM loader, inference/training orchestration
│   ├── chat.js                 # Chat UI, message rendering, edit mode
│   ├── viz.js                  # Dashboard: SVG graph + Canvas panels
│   ├── persistence.js          # IndexedDB + localStorage management
│   └── tokenizer.js            # Char↔int mapping (trivial at 65 vocab)
├── model.wasm                  # Compiled Zig transformer (~50-80KB)
├── weights/
│   └── base.bin                # Pre-trained Shakespeare weights (~420KB)
├── zig-transformer/
│   ├── src/
│   │   ├── main.zig            # WASM entry point, exports
│   │   ├── transformer.zig     # Model architecture (forward pass)
│   │   ├── backward.zig        # Backpropagation
│   │   ├── optimizer.zig       # Adam implementation
│   │   └── math.zig            # matmul, softmax, gelu, layernorm
│   └── build.zig               # Zig build config (wasm32-freestanding target)
├── train/
│   ├── train.py                # PyTorch training script
│   ├── export_weights.py       # Convert PyTorch → raw f32 binary
│   └── shakespeare.txt         # Training corpus (~1MB)
├── scripts/
│   └── build.sh                # Full build: zig build + copy .wasm
└── render.yaml                 # Render static site config
```

### Build Steps (local dev)

```bash
# 1. Train the model (one-time, or when you want to retrain)
cd train/
python train.py              # trains tiny transformer on shakespeare.txt
python export_weights.py     # outputs ../weights/base.bin

# 2. Compile Zig to WASM
cd zig-transformer/
zig build -Dtarget=wasm32-freestanding -Doptimize=ReleaseSmall
cp zig-out/lib/model.wasm ../model.wasm

# 3. Local dev server (any static server works)
cd ..
python -m http.server 8000   # or npx serve, etc.
```

### Render Deployment

- `render.yaml` points `staticPublishPath: ./`
- No build command needed — we commit `model.wasm` and `weights/base.bin` directly
- Alternatively, add a build command that runs the Zig compilation (requires Render supporting Zig, which it may not — safer to commit the binary)

### Why Commit the Binaries

- `model.wasm` is ~50-80KB — tiny
- `weights/base.bin` is ~420KB — still small
- Avoids needing Zig or Python in the deploy environment
- Fully reproducible from source via `scripts/build.sh` if needed

### Dev Workflow

1. Edit Zig code → run `zig build` → refresh browser
2. Edit JS → just refresh browser (no bundler, ES modules)
3. Retrain model → run Python scripts → commit new `base.bin`

---

## Section 8: Risks & Mitigations

### Risk Matrix

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Backprop implementation bugs in Zig | High | High | Test against PyTorch reference; compare gradients numerically |
| Model produces only garbage after fine-tuning | Medium | Medium | Catastrophic forgetting safeguard (replay buffer) + reset button |
| WASM performance too slow for interactive use | Medium | Low | 105K params is tiny; benchmark early; SIMD as escape hatch |
| Browser memory issues | Low | Low | Total footprint <5MB; well within limits |
| IndexedDB unavailable/cleared | Low | Medium | Graceful fallback to base weights; inform user |
| Zig WASM compilation issues | Medium | Medium | Zig's WASM target is mature; test on nightly if stable has bugs |
| Visualization janks during training | Low | Medium | requestAnimationFrame + debounce canvas redraws; separate from compute |

### Critical Path (what blocks everything else)

```
1. Zig forward pass (working inference)
   └── blocks: all JS integration, all viz, all training
   
2. Zig backward pass (working gradients)
   └── blocks: training loop, weight deltas viz, loss curve
   
3. Python training script (produce base.bin)
   └── blocks: meaningful inference output (without this, model outputs garbage)
```

**The riskiest component is #2 (backprop in Zig).** Writing a correct backward pass for multi-head attention, layer norm, and GELU from scratch is the most error-prone part of the entire project. The mitigation strategy:

1. Implement forward pass in both PyTorch and Zig with identical architecture
2. Feed identical inputs to both
3. Compare outputs numerically (should match to ~1e-6)
4. Compute gradients in PyTorch, compare against Zig backward pass
5. Any mismatch > 1e-4 indicates a bug — fix before proceeding

### Implementation Order (recommended)

```
Phase 1: Foundation (get inference working end-to-end)
├── Write math.zig (matmul, softmax, gelu, layernorm)
├── Write transformer.zig (forward pass)
├── Write main.zig (WASM exports)
├── Write train/train.py + export_weights.py
├── Produce base.bin
├── Write js/engine.js + js/tokenizer.js
├── Write minimal index.html that loads WASM and generates text to console
└── Milestone: model generates Shakespeare in browser ✓

Phase 2: Training (get learning working)
├── Write backward.zig (gradient computation)
├── Write optimizer.zig (Adam)
├── Validate gradients against PyTorch reference
├── Add train_step() to WASM exports
├── Wire training into engine.js
├── Add replay buffer for catastrophic forgetting mitigation
└── Milestone: model visibly improves after corrections ✓

Phase 3: Chat UI
├── Write js/chat.js (message display, input, edit mode)
├── Write index.html layout (split screen)
├── Write style.css (dark theme, responsive grid)
├── Wire chat → engine (send message → generate → display)
├── Wire edit mode → training (correction → gradient steps)
└── Milestone: full chat loop working without visualization ✓

Phase 4: Visualization
├── Write SVG architecture graph (static structure)
├── Add activation highlights during inference
├── Write Canvas attention heatmaps
├── Write Canvas weight matrix viewer
├── Write Canvas loss curve
├── Write Canvas probability bars
├── Add gradient flow animation during training
├── Add weight delta overlay
└── Milestone: full dashboard animating during chat ✓

Phase 5: Persistence & Polish
├── Write js/persistence.js (IndexedDB + localStorage)
├── Add reset button
├── Add mobile responsive layout (stacked)
├── Cross-browser testing
├── Performance profiling and optimization
└── Milestone: ship it ✓
```

### What Could Go Wrong (and what to do)

1. **"The model just outputs repetitive garbage even after training"**
   - Likely cause: learning rate too high or too many steps causing mode collapse
   - Fix: reduce LR, reduce steps per correction, add temperature during generation

2. **"Training step takes 2+ seconds and the UI freezes"**
   - Likely cause: backward pass is O(n²) in context length with naive implementation
   - Fix: use Web Workers to move WASM compute off the main thread; post results back via message

3. **"Attention heatmaps look random even on a trained model"**
   - Likely cause: 2 layers / 2 heads at 64-dim may not develop crisp attention patterns
   - Fix: this might just be reality at this scale — still visually interesting, just not interpretable. Add a tooltip explaining what the viz shows.

4. **"Zig WASM binary is unexpectedly large"**
   - Likely cause: debug info or unused stdlib pulled in
   - Fix: `-Doptimize=ReleaseSmall`, strip symbols, avoid std.debug

5. **"Works in Chrome, broken in Safari/Firefox"**
   - Likely cause: WASM feature differences or Canvas API quirks
   - Fix: test early in all three; avoid bleeding-edge WASM features (bulk memory, SIMD initially)

---
