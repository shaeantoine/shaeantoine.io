// WASM entry point for the MLP dot brain
// Exports: init, forward, train, getters for visualization

const mlp = @import("mlp.zig");
const math = @import("math.zig");
const backward = @import("backward.zig");
const optimizer = @import("optimizer.zig");

const Config = mlp.Config;
const MLP = mlp.MLP;

var model: MLP = undefined;
var initialized: bool = false;

// Training state
var grads: backward.Gradients = undefined;
var adam: optimizer.AdamState = undefined;
var training_initialized: bool = false;
var last_loss: f32 = 0.0;
var total_train_steps: u32 = 0;

// Weight delta tracking for visualization
var weight_snapshot: [*]f32 = undefined;
var weight_deltas: [*]f32 = undefined;

// RNG state (xorshift32)
var rng_state: u32 = 12345;

// Arena allocator using WASM linear memory
var arena_base: [*]u8 = undefined;
var arena_offset: usize = 0;
var arena_initialized: bool = false;

fn init_arena() void {
    if (arena_initialized) return;
    const current_pages = @wasmMemorySize(0);
    // 8 pages (512KB) — enough for model + gradients + optimizer state
    const needed_pages: u32 = 8;
    const result = @wasmMemoryGrow(0, needed_pages);
    if (result == @as(usize, @bitCast(@as(isize, -1)))) {
        return;
    }
    arena_base = @ptrFromInt(current_pages * 65536);
    arena_offset = 0;
    arena_initialized = true;
}

fn arena_alloc_f32(count: usize) [*]f32 {
    if (!arena_initialized) init_arena();
    const byte_count = count * @sizeOf(f32);
    const aligned_offset = (arena_offset + 3) & ~@as(usize, 3);
    const ptr: [*]f32 = @ptrCast(@alignCast(arena_base + aligned_offset));
    arena_offset = aligned_offset + byte_count;
    return ptr;
}

fn arena_alloc_f32_zeroed(count: usize) [*]f32 {
    const ptr = arena_alloc_f32(count);
    math.zero(ptr, count);
    return ptr;
}

fn xorshift32() u32 {
    var x = rng_state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    rng_state = x;
    return x;
}

fn rand_f32() f32 {
    return @as(f32, @floatFromInt(xorshift32() & 0x7FFFFF)) / @as(f32, 8388607.0) * 2.0 - 1.0;
}

fn xavier_init(ptr: [*]f32, n: usize, fan_in: usize) void {
    const scale = @sqrt(2.0 / @as(f32, @floatFromInt(fan_in)));
    for (0..n) |i| {
        ptr[i] = rand_f32() * scale;
    }
}

fn allocate_model() void {
    const I = Config.input_dim;
    const H = Config.hidden_dim;
    const O = Config.output_dim;

    // Weights
    model.weights.w1 = arena_alloc_f32(I * H);
    model.weights.b1 = arena_alloc_f32_zeroed(H);
    model.weights.w2 = arena_alloc_f32(H * H);
    model.weights.b2 = arena_alloc_f32_zeroed(H);
    model.weights.w3 = arena_alloc_f32(H * O);
    model.weights.b3 = arena_alloc_f32_zeroed(O);

    // Activations
    model.act.h1 = arena_alloc_f32(H);
    model.act.h2 = arena_alloc_f32(H);
    model.act.out = arena_alloc_f32(O);
    model.act.pre_act1 = arena_alloc_f32(H);
    model.act.pre_act2 = arena_alloc_f32(H);
    model.act.pre_act3 = arena_alloc_f32(O);

    // Input buffer
    model.input = arena_alloc_f32(I);
}

fn allocate_training() void {
    if (training_initialized) return;

    const I = Config.input_dim;
    const H = Config.hidden_dim;
    const O = Config.output_dim;
    const N = Config.n_params;

    // Gradients
    grads.d_w1 = arena_alloc_f32_zeroed(I * H);
    grads.d_b1 = arena_alloc_f32_zeroed(H);
    grads.d_w2 = arena_alloc_f32_zeroed(H * H);
    grads.d_b2 = arena_alloc_f32_zeroed(H);
    grads.d_w3 = arena_alloc_f32_zeroed(H * O);
    grads.d_b3 = arena_alloc_f32_zeroed(O);

    // Scratch buffers
    grads.d_h2 = arena_alloc_f32(H);
    grads.d_h1 = arena_alloc_f32(H);
    grads.d_pre3 = arena_alloc_f32(O);
    grads.d_pre2 = arena_alloc_f32(H);
    grads.d_pre1 = arena_alloc_f32(H);

    // Adam optimizer state
    adam.m = arena_alloc_f32_zeroed(N);
    adam.v = arena_alloc_f32_zeroed(N);
    adam.t = 0;
    adam.n_params = N;

    // Weight deltas for visualization
    weight_snapshot = arena_alloc_f32(N);
    weight_deltas = arena_alloc_f32_zeroed(N);

    training_initialized = true;
}

fn init_weights_random() void {
    const I = Config.input_dim;
    const H = Config.hidden_dim;
    const O = Config.output_dim;

    xavier_init(model.weights.w1, I * H, I);
    xavier_init(model.weights.w2, H * H, H);
    // Last layer: moderate init so outputs start with visible random drift
    xavier_init(model.weights.w3, H * O, H);
    math.scale(model.weights.w3, 0.1, H * O);
}

fn snapshot_weights() void {
    var groups: [optimizer.MAX_PARAM_GROUPS]optimizer.ParamGroup = undefined;
    const n_groups = optimizer.get_param_groups(&model, &grads, &groups);
    var offset: usize = 0;
    for (0..n_groups) |i| {
        math.copy(weight_snapshot + offset, groups[i].ptr, groups[i].size);
        offset += groups[i].size;
    }
}

fn compute_weight_deltas() void {
    var groups: [optimizer.MAX_PARAM_GROUPS]optimizer.ParamGroup = undefined;
    const n_groups = optimizer.get_param_groups(&model, &grads, &groups);
    var offset: usize = 0;
    for (0..n_groups) |i| {
        for (0..groups[i].size) |j| {
            weight_deltas[offset + j] = groups[i].ptr[j] - weight_snapshot[offset + j];
        }
        offset += groups[i].size;
    }
}

// === WASM EXPORTS ===

export fn init(seed: u32) void {
    rng_state = if (seed != 0) seed else 12345;
    init_arena();
    allocate_model();
    init_weights_random();
    initialized = true;
    training_initialized = false;
    total_train_steps = 0;
    last_loss = 0.0;
}

export fn forward(obs_ptr: [*]const f32) [*]const f32 {
    if (!initialized) return model.act.out;
    return model.forward(obs_ptr);
}

// === TRAINING EXPORTS ===

export fn train_step(target_ptr: [*]const f32, learning_rate: f32) f32 {
    if (!initialized) return -1.0;
    if (!training_initialized) allocate_training();

    // Zero gradients
    backward.zero_gradients(&grads);

    // Snapshot weights for delta visualization
    snapshot_weights();

    // Forward pass (uses cached input from last forward() call)
    // Re-run forward to ensure activations are fresh for the target
    _ = model.forward(model.input);

    // Backward pass
    last_loss = backward.backward(&model, &grads, target_ptr);

    // Apply Adam optimizer
    var groups: [optimizer.MAX_PARAM_GROUPS]optimizer.ParamGroup = undefined;
    const n_groups = optimizer.get_param_groups(&model, &grads, &groups);
    const max_grad_norm: f32 = 1.0;

    var adam_offset: usize = 0;
    for (0..n_groups) |i| {
        var local_adam = optimizer.AdamState{
            .m = adam.m + adam_offset,
            .v = adam.v + adam_offset,
            .t = adam.t,
            .n_params = groups[i].size,
        };
        local_adam.step(groups[i].ptr, groups[i].grad_ptr, groups[i].size, learning_rate, max_grad_norm);
        adam_offset += groups[i].size;
    }
    adam.t += 1;
    total_train_steps += 1;

    // Compute weight deltas
    compute_weight_deltas();

    return last_loss;
}

export fn get_last_loss() f32 {
    return last_loss;
}

export fn get_training_step() u32 {
    return total_train_steps;
}

export fn get_weight_deltas_ptr() [*]const f32 {
    if (!training_initialized) return weight_deltas;
    return weight_deltas;
}

// === INFERENCE EXPORTS ===

export fn get_output_ptr() [*]const f32 {
    return model.act.out;
}

export fn get_h1_ptr() [*]const f32 {
    return model.act.h1;
}

export fn get_h2_ptr() [*]const f32 {
    return model.act.h2;
}

export fn get_weights_ptr() [*]const f32 {
    return model.weights.w1;
}

export fn get_total_params() u32 {
    return Config.n_params;
}

export fn get_input_dim() u32 {
    return Config.input_dim;
}

export fn get_hidden_dim() u32 {
    return Config.hidden_dim;
}

export fn get_output_dim() u32 {
    return Config.output_dim;
}

// === PERSISTENCE EXPORTS ===

export fn alloc(size: u32) [*]u8 {
    if (!arena_initialized) init_arena();
    const aligned = (arena_offset + 3) & ~@as(usize, 3);
    const ptr = arena_base + aligned;
    arena_offset = aligned + size;
    return ptr;
}

export fn load_weights(data_ptr: [*]const f32) void {
    if (!initialized) return;
    const I = Config.input_dim;
    const H = Config.hidden_dim;
    const O = Config.output_dim;

    var offset: usize = 0;
    math.copy(model.weights.w1, data_ptr + offset, I * H);
    offset += I * H;
    math.copy(model.weights.b1, data_ptr + offset, H);
    offset += H;
    math.copy(model.weights.w2, data_ptr + offset, H * H);
    offset += H * H;
    math.copy(model.weights.b2, data_ptr + offset, H);
    offset += H;
    math.copy(model.weights.w3, data_ptr + offset, H * O);
    offset += H * O;
    math.copy(model.weights.b3, data_ptr + offset, O);
}

var export_buf: [*]f32 = undefined;
var export_buf_allocated: bool = false;

export fn export_weights_ptr() [*]f32 {
    if (!initialized) return undefined;

    if (!export_buf_allocated) {
        export_buf = arena_alloc_f32(Config.n_params);
        export_buf_allocated = true;
    }

    const I = Config.input_dim;
    const H = Config.hidden_dim;
    const O = Config.output_dim;

    var offset: usize = 0;
    math.copy(export_buf + offset, model.weights.w1, I * H);
    offset += I * H;
    math.copy(export_buf + offset, model.weights.b1, H);
    offset += H;
    math.copy(export_buf + offset, model.weights.w2, H * H);
    offset += H * H;
    math.copy(export_buf + offset, model.weights.b2, H);
    offset += H;
    math.copy(export_buf + offset, model.weights.w3, H * O);
    offset += H * O;
    math.copy(export_buf + offset, model.weights.b3, O);

    return export_buf;
}

export fn seed_rng(s: u32) void {
    rng_state = if (s != 0) s else 12345;
}
