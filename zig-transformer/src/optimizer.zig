const math = @import("math.zig");
const transformer = @import("transformer.zig");
const backward = @import("backward.zig");
const Config = transformer.Config;

pub const AdamState = struct {
    m: [*]f32, // first moment (mean of gradients)
    v: [*]f32, // second moment (mean of squared gradients)
    t: u32, // timestep
    n_params: usize,

    pub fn step(self: *AdamState, params: [*]f32, grads: [*]const f32, n: usize, lr: f32, max_grad_norm: f32) void {
        const beta1: f32 = 0.9;
        const beta2: f32 = 0.999;
        const eps: f32 = 1e-8;

        self.t += 1;

        // Gradient clipping (by norm)
        var grad_norm: f32 = 0.0;
        for (0..n) |i| {
            grad_norm += grads[i] * grads[i];
        }
        grad_norm = @sqrt(grad_norm);
        const clip_scale = if (grad_norm > max_grad_norm) max_grad_norm / grad_norm else 1.0;

        // Bias correction
        const t_f: f32 = @floatFromInt(self.t);
        const bc1 = 1.0 - power(beta1, t_f);
        const bc2 = 1.0 - power(beta2, t_f);
        const lr_corrected = lr * @sqrt(bc2) / bc1;

        for (0..n) |i| {
            const g = grads[i] * clip_scale;

            // Update moments
            self.m[i] = beta1 * self.m[i] + (1.0 - beta1) * g;
            self.v[i] = beta2 * self.v[i] + (1.0 - beta2) * g * g;

            // Update parameters
            params[i] -= lr_corrected * self.m[i] / (@sqrt(self.v[i]) + eps);
        }
    }
};

fn power(base: f32, exp_val: f32) f32 {
    return @exp(exp_val * @log(base));
}

// Helper to collect all model parameters into a contiguous view
// Returns the total number of parameters
pub fn count_params() usize {
    const C = Config.embed_dim;
    const S = Config.context_len;
    const F = Config.ffn_dim;
    const V = Config.vocab_size;

    var total: usize = 0;
    total += V * C; // token_emb
    total += S * C; // pos_emb
    for (0..Config.n_layers) |_| {
        total += C; // ln1_weight
        total += C; // ln1_bias
        total += C * C; // q_weight
        total += C * C; // k_weight
        total += C * C; // v_weight
        total += C * C; // attn_out_weight
        total += C; // ln2_weight
        total += C; // ln2_bias
        total += C * F; // ffn_up_weight
        total += F; // ffn_up_bias
        total += F * C; // ffn_down_weight
        total += C; // ffn_down_bias
    }
    total += C; // final_ln_weight
    total += C; // final_ln_bias
    total += C * V; // output_proj
    return total;
}

// Collect param pointers and their sizes for iteration
pub const ParamGroup = struct {
    ptr: [*]f32,
    grad_ptr: [*]f32,
    size: usize,
};

pub fn get_param_groups(model: *transformer.Model, grads: *backward.GradientBuffers, groups: *[MAX_PARAM_GROUPS]ParamGroup) usize {
    const C = Config.embed_dim;
    const S = Config.context_len;
    const F = Config.ffn_dim;
    const V = Config.vocab_size;

    var idx: usize = 0;

    groups[idx] = .{ .ptr = model.weights.token_emb, .grad_ptr = grads.d_token_emb, .size = V * C };
    idx += 1;
    groups[idx] = .{ .ptr = model.weights.pos_emb, .grad_ptr = grads.d_pos_emb, .size = S * C };
    idx += 1;

    for (0..Config.n_layers) |layer| {
        const lw = &model.weights.layers[layer];
        const lg = &grads.d_layers[layer];

        groups[idx] = .{ .ptr = lw.ln1_weight, .grad_ptr = lg.d_ln1_weight, .size = C };
        idx += 1;
        groups[idx] = .{ .ptr = lw.ln1_bias, .grad_ptr = lg.d_ln1_bias, .size = C };
        idx += 1;
        groups[idx] = .{ .ptr = lw.q_weight, .grad_ptr = lg.d_q_weight, .size = C * C };
        idx += 1;
        groups[idx] = .{ .ptr = lw.k_weight, .grad_ptr = lg.d_k_weight, .size = C * C };
        idx += 1;
        groups[idx] = .{ .ptr = lw.v_weight, .grad_ptr = lg.d_v_weight, .size = C * C };
        idx += 1;
        groups[idx] = .{ .ptr = lw.attn_out_weight, .grad_ptr = lg.d_attn_out_weight, .size = C * C };
        idx += 1;
        groups[idx] = .{ .ptr = lw.ln2_weight, .grad_ptr = lg.d_ln2_weight, .size = C };
        idx += 1;
        groups[idx] = .{ .ptr = lw.ln2_bias, .grad_ptr = lg.d_ln2_bias, .size = C };
        idx += 1;
        groups[idx] = .{ .ptr = lw.ffn_up_weight, .grad_ptr = lg.d_ffn_up_weight, .size = C * F };
        idx += 1;
        groups[idx] = .{ .ptr = lw.ffn_up_bias, .grad_ptr = lg.d_ffn_up_bias, .size = F };
        idx += 1;
        groups[idx] = .{ .ptr = lw.ffn_down_weight, .grad_ptr = lg.d_ffn_down_weight, .size = F * C };
        idx += 1;
        groups[idx] = .{ .ptr = lw.ffn_down_bias, .grad_ptr = lg.d_ffn_down_bias, .size = C };
        idx += 1;
    }

    groups[idx] = .{ .ptr = model.weights.final_ln_weight, .grad_ptr = grads.d_final_ln_weight, .size = C };
    idx += 1;
    groups[idx] = .{ .ptr = model.weights.final_ln_bias, .grad_ptr = grads.d_final_ln_bias, .size = C };
    idx += 1;
    groups[idx] = .{ .ptr = model.weights.output_proj, .grad_ptr = grads.d_output_proj, .size = C * V };
    idx += 1;

    return idx;
}

// 2 base params + 12 per layer + 3 final = max groups
pub const MAX_PARAM_GROUPS: usize = 2 + Config.n_layers * 12 + 3;
