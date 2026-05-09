const transformer = @import("transformer.zig");
const math = @import("math.zig");
const backward = @import("backward.zig");
const optimizer = @import("optimizer.zig");

const Config = transformer.Config;
const Model = transformer.Model;

// Global model instance
var model: Model = undefined;
var initialized: bool = false;

// Training state
var grads: backward.GradientBuffers = undefined;
var adam: optimizer.AdamState = undefined;
var training_initialized: bool = false;
var training_targets: [Config.context_len]u32 = undefined;
var training_target_len: usize = 0;
var last_loss: f32 = 0.0;

// Weight delta tracking for visualization
var weight_snapshot: [*]f32 = undefined;
var weight_deltas: [*]f32 = undefined;
var n_total_params: usize = 0;

// Memory arena using WASM linear memory (grows as needed)
var arena_base: [*]u8 = undefined;
var arena_offset: usize = 0;
var arena_initialized: bool = false;

fn init_arena() void {
    if (arena_initialized) return;
    const current_pages = @wasmMemorySize(0);
    // Grow by 192 pages (12MB) for weights + activations + gradients + optimizer
    const needed_pages: u32 = 192;
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

fn init_buffers() void {
    const C = Config.embed_dim;
    const S = Config.context_len;
    const H = Config.n_heads;
    const F = Config.ffn_dim;

    model.buffers.hidden = arena_alloc_f32(S * C);
    model.buffers.ln_out = arena_alloc_f32(S * C);
    model.buffers.q = arena_alloc_f32(S * C);
    model.buffers.k = arena_alloc_f32(S * C);
    model.buffers.v = arena_alloc_f32(S * C);
    model.buffers.attn_scores = arena_alloc_f32(H * S * S);
    model.buffers.attn_out = arena_alloc_f32(S * C);
    model.buffers.ffn_hidden = arena_alloc_f32(S * F);
    model.buffers.ffn_out = arena_alloc_f32(S * C);
    model.buffers.residual = arena_alloc_f32(S * C);
    model.buffers.logits = arena_alloc_f32(Config.vocab_size);
    model.buffers.probs = arena_alloc_f32(Config.vocab_size);
    model.buffers.attn_weights_stored = arena_alloc_f32(Config.n_layers * H * S * S);
}

fn init_training_buffers() void {
    const C = Config.embed_dim;
    const S = Config.context_len;
    const H = Config.n_heads;
    const F = Config.ffn_dim;
    const V = Config.vocab_size;
    const L = Config.n_layers;

    // Weight gradients
    grads.d_token_emb = arena_alloc_f32_zeroed(V * C);
    grads.d_pos_emb = arena_alloc_f32_zeroed(S * C);
    for (0..L) |layer| {
        grads.d_layers[layer].d_ln1_weight = arena_alloc_f32_zeroed(C);
        grads.d_layers[layer].d_ln1_bias = arena_alloc_f32_zeroed(C);
        grads.d_layers[layer].d_q_weight = arena_alloc_f32_zeroed(C * C);
        grads.d_layers[layer].d_k_weight = arena_alloc_f32_zeroed(C * C);
        grads.d_layers[layer].d_v_weight = arena_alloc_f32_zeroed(C * C);
        grads.d_layers[layer].d_attn_out_weight = arena_alloc_f32_zeroed(C * C);
        grads.d_layers[layer].d_ln2_weight = arena_alloc_f32_zeroed(C);
        grads.d_layers[layer].d_ln2_bias = arena_alloc_f32_zeroed(C);
        grads.d_layers[layer].d_ffn_up_weight = arena_alloc_f32_zeroed(C * F);
        grads.d_layers[layer].d_ffn_up_bias = arena_alloc_f32_zeroed(F);
        grads.d_layers[layer].d_ffn_down_weight = arena_alloc_f32_zeroed(F * C);
        grads.d_layers[layer].d_ffn_down_bias = arena_alloc_f32_zeroed(C);
    }
    grads.d_final_ln_weight = arena_alloc_f32_zeroed(C);
    grads.d_final_ln_bias = arena_alloc_f32_zeroed(C);
    grads.d_output_proj = arena_alloc_f32_zeroed(C * V);

    // Activation gradients
    grads.d_hidden = arena_alloc_f32(S * C);
    grads.d_ln_out = arena_alloc_f32(S * C);
    grads.d_attn_out = arena_alloc_f32(S * C);
    grads.d_q = arena_alloc_f32_zeroed(S * C);
    grads.d_k = arena_alloc_f32_zeroed(S * C);
    grads.d_v = arena_alloc_f32_zeroed(S * C);
    grads.d_attn_scores = arena_alloc_f32_zeroed(H * S * S);
    grads.d_ffn_hidden = arena_alloc_f32(S * F);
    grads.d_ffn_out = arena_alloc_f32(S * C);
    grads.d_logits = arena_alloc_f32(V);

    // Forward pass cache for backward
    grads.cache_ln1_input = arena_alloc_f32(L * S * C);
    grads.cache_ln1_output = arena_alloc_f32(L * S * C);
    grads.cache_ln2_input = arena_alloc_f32(L * S * C);
    grads.cache_ln2_output = arena_alloc_f32(L * S * C);
    grads.cache_ffn_pre_gelu = arena_alloc_f32(L * S * F);
    grads.cache_final_ln_input = arena_alloc_f32(S * C);

    // Adam optimizer state
    n_total_params = optimizer.count_params();
    adam.m = arena_alloc_f32_zeroed(n_total_params);
    adam.v = arena_alloc_f32_zeroed(n_total_params);
    adam.t = 0;
    adam.n_params = n_total_params;

    // Weight delta tracking
    weight_snapshot = arena_alloc_f32(n_total_params);
    weight_deltas = arena_alloc_f32_zeroed(n_total_params);

    training_initialized = true;
}

fn load_weights(data: [*]const f32) void {
    var offset: usize = 0;
    const C = Config.embed_dim;
    const S = Config.context_len;
    const F = Config.ffn_dim;
    const V = Config.vocab_size;

    model.weights.token_emb = arena_alloc_f32(V * C);
    math.copy(model.weights.token_emb, data + offset, V * C);
    offset += V * C;

    model.weights.pos_emb = arena_alloc_f32(S * C);
    math.copy(model.weights.pos_emb, data + offset, S * C);
    offset += S * C;

    for (0..Config.n_layers) |layer| {
        var lw = &model.weights.layers[layer];

        lw.ln1_weight = arena_alloc_f32(C);
        math.copy(lw.ln1_weight, data + offset, C);
        offset += C;

        lw.ln1_bias = arena_alloc_f32(C);
        math.copy(lw.ln1_bias, data + offset, C);
        offset += C;

        lw.q_weight = arena_alloc_f32(C * C);
        math.copy(lw.q_weight, data + offset, C * C);
        offset += C * C;

        lw.k_weight = arena_alloc_f32(C * C);
        math.copy(lw.k_weight, data + offset, C * C);
        offset += C * C;

        lw.v_weight = arena_alloc_f32(C * C);
        math.copy(lw.v_weight, data + offset, C * C);
        offset += C * C;

        lw.attn_out_weight = arena_alloc_f32(C * C);
        math.copy(lw.attn_out_weight, data + offset, C * C);
        offset += C * C;

        lw.ln2_weight = arena_alloc_f32(C);
        math.copy(lw.ln2_weight, data + offset, C);
        offset += C;

        lw.ln2_bias = arena_alloc_f32(C);
        math.copy(lw.ln2_bias, data + offset, C);
        offset += C;

        lw.ffn_up_weight = arena_alloc_f32(C * F);
        math.copy(lw.ffn_up_weight, data + offset, C * F);
        offset += C * F;

        lw.ffn_up_bias = arena_alloc_f32(F);
        math.copy(lw.ffn_up_bias, data + offset, F);
        offset += F;

        lw.ffn_down_weight = arena_alloc_f32(F * C);
        math.copy(lw.ffn_down_weight, data + offset, F * C);
        offset += F * C;

        lw.ffn_down_bias = arena_alloc_f32(C);
        math.copy(lw.ffn_down_bias, data + offset, C);
        offset += C;
    }

    model.weights.final_ln_weight = arena_alloc_f32(C);
    math.copy(model.weights.final_ln_weight, data + offset, C);
    offset += C;

    model.weights.final_ln_bias = arena_alloc_f32(C);
    math.copy(model.weights.final_ln_bias, data + offset, C);
    offset += C;

    model.weights.output_proj = arena_alloc_f32(C * V);
    math.copy(model.weights.output_proj, data + offset, C * V);
    _ = offset + C * V;
}

fn zero_gradients() void {
    const C = Config.embed_dim;
    const S = Config.context_len;
    const F = Config.ffn_dim;
    const V = Config.vocab_size;

    math.zero(grads.d_token_emb, V * C);
    math.zero(grads.d_pos_emb, S * C);
    for (0..Config.n_layers) |layer| {
        math.zero(grads.d_layers[layer].d_ln1_weight, C);
        math.zero(grads.d_layers[layer].d_ln1_bias, C);
        math.zero(grads.d_layers[layer].d_q_weight, C * C);
        math.zero(grads.d_layers[layer].d_k_weight, C * C);
        math.zero(grads.d_layers[layer].d_v_weight, C * C);
        math.zero(grads.d_layers[layer].d_attn_out_weight, C * C);
        math.zero(grads.d_layers[layer].d_ln2_weight, C);
        math.zero(grads.d_layers[layer].d_ln2_bias, C);
        math.zero(grads.d_layers[layer].d_ffn_up_weight, C * F);
        math.zero(grads.d_layers[layer].d_ffn_up_bias, F);
        math.zero(grads.d_layers[layer].d_ffn_down_weight, F * C);
        math.zero(grads.d_layers[layer].d_ffn_down_bias, C);
    }
    math.zero(grads.d_final_ln_weight, C);
    math.zero(grads.d_final_ln_bias, C);
    math.zero(grads.d_output_proj, C * V);
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

export fn init(weights_ptr: [*]const u8, weights_len: u32) void {
    _ = weights_len;
    arena_offset = 0;
    init_buffers();
    load_weights(@ptrCast(@alignCast(weights_ptr)));
    model.seq_len = 0;
    for (0..Config.context_len) |i| {
        model.tokens[i] = 0;
    }
    initialized = true;
}

export fn init_training() void {
    if (!initialized) return;
    if (!training_initialized) {
        init_training_buffers();
    }
}

export fn forward(token: u32) void {
    if (!initialized) return;
    model.add_token(token);
    model.forward_pass();
}

export fn get_next_probs() [*]const f32 {
    return model.buffers.probs;
}

export fn get_logits() [*]const f32 {
    return model.buffers.logits;
}

export fn sample(temperature: f32) u32 {
    if (!initialized) return 0;
    return model.sample_token(temperature);
}

export fn get_seq_len() u32 {
    return @intCast(model.seq_len);
}

export fn reset() void {
    model.reset();
}

export fn seed_rng(s: u32) void {
    transformer.seed_rng(s);
}

// === TRAINING EXPORTS ===

export fn begin_training(target_ptr: [*]const u32, target_len: u32) void {
    if (!initialized) return;
    if (!training_initialized) init_training_buffers();

    training_target_len = @min(@as(usize, target_len), Config.context_len);
    for (0..training_target_len) |i| {
        training_targets[i] = target_ptr[i];
    }

    // Set up model with training sequence
    model.reset();
    for (0..training_target_len) |i| {
        model.tokens[i] = training_targets[i];
    }
    model.seq_len = training_target_len;
}

export fn train_step(learning_rate: f32) f32 {
    if (!initialized or !training_initialized) return -1.0;
    if (training_target_len < 2) return -1.0;

    // Zero gradients
    zero_gradients();

    // Snapshot weights before update (for delta visualization)
    snapshot_weights();

    // Forward pass with caching
    model.forward_pass_training(&grads);

    // Backward pass — targets are tokens[1..] (predict next token)
    last_loss = backward.backward_pass(&model, &grads, @as([*]const u32, &training_targets) + 1, training_target_len);

    // Apply Adam optimizer to each parameter group
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

    // Compute weight deltas for visualization
    compute_weight_deltas();

    return last_loss;
}

export fn get_last_loss() f32 {
    return last_loss;
}

export fn get_weight_deltas_ptr() [*]const f32 {
    return weight_deltas;
}

export fn get_total_params() u32 {
    return @intCast(n_total_params);
}

export fn get_training_step() u32 {
    return adam.t;
}

// Visualization data access
export fn get_attention_ptr(layer: u32, head: u32) [*]const f32 {
    const H = Config.n_heads;
    const S = Config.context_len;
    const offset = @as(usize, layer) * H * S * S + @as(usize, head) * S * S;
    return model.buffers.attn_weights_stored + offset;
}

export fn get_hidden_ptr() [*]const f32 {
    return model.buffers.hidden;
}

export fn get_weights_ptr(layer: u32, component: u32) [*]const f32 {
    const lw = &model.weights.layers[@as(usize, layer)];
    return switch (component) {
        0 => lw.q_weight,
        1 => lw.k_weight,
        2 => lw.v_weight,
        3 => lw.attn_out_weight,
        4 => lw.ffn_up_weight,
        5 => lw.ffn_down_weight,
        else => lw.q_weight,
    };
}

export fn get_weights_size(component: u32) u32 {
    const C = Config.embed_dim;
    const F = Config.ffn_dim;
    return switch (component) {
        0, 1, 2, 3 => C * C,
        4 => C * F,
        5 => F * C,
        else => C * C,
    };
}

// Export memory for JS to read directly
export fn get_arena_ptr() [*]u8 {
    if (!arena_initialized) init_arena();
    return arena_base;
}

export fn get_arena_size() u32 {
    return 192 * 65536; // 12MB
}

// Export all current weights as a contiguous f32 buffer (for persistence)
// JS calls this, then reads n_total_params floats from the returned pointer
var export_buf: [*]f32 = undefined;
var export_buf_allocated: bool = false;

export fn export_weights_ptr() [*]f32 {
    if (!initialized) return undefined;

    if (!export_buf_allocated) {
        export_buf = arena_alloc_f32(optimizer.count_params());
        export_buf_allocated = true;
    }

    var pg: [optimizer.MAX_PARAM_GROUPS]optimizer.ParamGroup = undefined;
    const n_groups = optimizer.get_param_groups(&model, &grads, &pg);
    var offset: usize = 0;
    for (0..n_groups) |i| {
        math.copy(export_buf + offset, pg[i].ptr, pg[i].size);
        offset += pg[i].size;
    }
    return export_buf;
}

// Allocation helper for JS to write data into WASM memory
export fn alloc(size: u32) [*]u8 {
    if (!arena_initialized) init_arena();
    const aligned = (arena_offset + 3) & ~@as(usize, 3);
    const ptr = arena_base + aligned;
    arena_offset = aligned + size;
    return ptr;
}
