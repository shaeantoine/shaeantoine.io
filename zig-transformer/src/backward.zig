const math = @import("math.zig");
const transformer = @import("transformer.zig");
const Config = transformer.Config;

pub const GradientBuffers = struct {
    // Weight gradients (accumulated during backward pass)
    d_token_emb: [*]f32, // [vocab_size x embed_dim]
    d_pos_emb: [*]f32, // [context_len x embed_dim]
    d_layers: [Config.n_layers]LayerGrads,
    d_final_ln_weight: [*]f32, // [embed_dim]
    d_final_ln_bias: [*]f32, // [embed_dim]
    d_output_proj: [*]f32, // [embed_dim x vocab_size]

    // Activation gradients (scratch buffers reused during backward)
    d_hidden: [*]f32, // [context_len x embed_dim]
    d_ln_out: [*]f32, // [context_len x embed_dim]
    d_attn_out: [*]f32, // [context_len x embed_dim]
    d_q: [*]f32, // [context_len x embed_dim]
    d_k: [*]f32, // [context_len x embed_dim]
    d_v: [*]f32, // [context_len x embed_dim]
    d_attn_scores: [*]f32, // [n_heads x context_len x context_len]
    d_ffn_hidden: [*]f32, // [context_len x ffn_dim]
    d_ffn_out: [*]f32, // [context_len x embed_dim]
    d_logits: [*]f32, // [vocab_size]

    // Forward pass cache (needed for backward)
    cache_ln1_input: [*]f32, // [n_layers x context_len x embed_dim]
    cache_ln1_output: [*]f32, // [n_layers x context_len x embed_dim]
    cache_ln2_input: [*]f32, // [n_layers x context_len x embed_dim]
    cache_ln2_output: [*]f32, // [n_layers x context_len x embed_dim]
    cache_ffn_pre_gelu: [*]f32, // [n_layers x context_len x ffn_dim]
    cache_final_ln_input: [*]f32, // [embed_dim]
};

pub const LayerGrads = struct {
    d_ln1_weight: [*]f32,
    d_ln1_bias: [*]f32,
    d_q_weight: [*]f32,
    d_k_weight: [*]f32,
    d_v_weight: [*]f32,
    d_attn_out_weight: [*]f32,
    d_ln2_weight: [*]f32,
    d_ln2_bias: [*]f32,
    d_ffn_up_weight: [*]f32,
    d_ffn_up_bias: [*]f32,
    d_ffn_down_weight: [*]f32,
    d_ffn_down_bias: [*]f32,
};

// Backward through cross-entropy loss + softmax (combined for numerical stability)
// Given target token index, compute d_logits
pub fn backward_cross_entropy_softmax(d_logits: [*]f32, probs: [*]const f32, target: u32) void {
    // d_logits[i] = probs[i] - (1 if i == target else 0)
    for (0..Config.vocab_size) |i| {
        d_logits[i] = probs[i];
    }
    d_logits[target] -= 1.0;
}

// Backward through linear projection: out = inp @ weight^T
// d_inp[m x k] += d_out[m x n] @ weight[n x k]
// d_weight[n x k] += d_out^T[n x m] @ inp[m x k]
pub fn backward_linear(
    d_inp: [*]f32,
    d_weight: [*]f32,
    d_out: [*]const f32,
    inp: [*]const f32,
    weight: [*]const f32,
    m: usize,
    n: usize,
    k: usize,
) void {
    // d_inp += d_out @ weight (weight is stored as [n x k])
    for (0..m) |i| {
        for (0..k) |j| {
            var sum: f32 = 0.0;
            for (0..n) |p| {
                sum += d_out[i * n + p] * weight[p * k + j];
            }
            d_inp[i * k + j] += sum;
        }
    }

    // d_weight += d_out^T @ inp → for each output row p, accumulate inp rows
    for (0..m) |i| {
        for (0..n) |p| {
            const grad = d_out[i * n + p];
            for (0..k) |j| {
                d_weight[p * k + j] += grad * inp[i * k + j];
            }
        }
    }
}

// Backward through layer norm
// Forward: out = (inp - mean) * inv_std * weight + bias
pub fn backward_layernorm(
    d_inp: [*]f32,
    d_weight: [*]f32,
    d_bias: [*]f32,
    d_out: [*]const f32,
    inp: [*]const f32,
    weight: [*]const f32,
    n: usize,
) void {
    const eps: f32 = 1e-5;

    // Recompute mean and variance
    var mean: f32 = 0.0;
    for (0..n) |i| {
        mean += inp[i];
    }
    mean /= @as(f32, @floatFromInt(n));

    var variance: f32 = 0.0;
    for (0..n) |i| {
        const diff = inp[i] - mean;
        variance += diff * diff;
    }
    variance /= @as(f32, @floatFromInt(n));
    const inv_std = 1.0 / @sqrt(variance + eps);

    // d_bias += d_out
    for (0..n) |i| {
        d_bias[i] += d_out[i];
    }

    // d_weight += d_out * normalized
    for (0..n) |i| {
        const norm = (inp[i] - mean) * inv_std;
        d_weight[i] += d_out[i] * norm;
    }

    // d_inp: full layernorm backward
    const n_f: f32 = @floatFromInt(n);

    // d_norm = d_out * weight
    // Then backprop through normalization
    var dot_dn_norm: f32 = 0.0;
    var dot_dn: f32 = 0.0;
    for (0..n) |i| {
        const d_norm = d_out[i] * weight[i];
        const norm = (inp[i] - mean) * inv_std;
        dot_dn_norm += d_norm * norm;
        dot_dn += d_norm;
    }

    for (0..n) |i| {
        const d_norm = d_out[i] * weight[i];
        const norm = (inp[i] - mean) * inv_std;
        d_inp[i] += inv_std * (d_norm - (dot_dn + norm * dot_dn_norm) / n_f);
    }
}

// Backward through GELU activation
pub fn backward_gelu(d_inp: [*]f32, d_out: [*]const f32, inp: [*]const f32, n: usize) void {
    const sqrt_2_over_pi: f32 = 0.7978845608;
    for (0..n) |i| {
        const x = inp[i];
        const x3 = x * x * x;
        const inner = sqrt_2_over_pi * (x + 0.044715 * x3);
        const tanh_val = std.math.tanh(inner);
        const sech2 = 1.0 - tanh_val * tanh_val;
        const d_inner = sqrt_2_over_pi * (1.0 + 0.134145 * x * x);
        const gelu_grad = 0.5 * (1.0 + tanh_val) + 0.5 * x * sech2 * d_inner;
        d_inp[i] += d_out[i] * gelu_grad;
    }
}

const std = @import("std");

// Backward through softmax (used for attention scores)
pub fn backward_softmax(d_inp: [*]f32, d_out: [*]const f32, out: [*]const f32, n: usize) void {
    // d_inp[i] = out[i] * (d_out[i] - sum(out[j] * d_out[j]))
    var dot: f32 = 0.0;
    for (0..n) |i| {
        dot += out[i] * d_out[i];
    }
    for (0..n) |i| {
        d_inp[i] += out[i] * (d_out[i] - dot);
    }
}

// Full backward pass through the model for a single training example
pub fn backward_pass(
    model: *transformer.Model,
    grads: *GradientBuffers,
    targets: [*]const u32,
    seq_len: usize,
) f32 {
    const C = Config.embed_dim;
    const H = Config.n_heads;
    const D = Config.head_dim;
    const F = Config.ffn_dim;
    const V = Config.vocab_size;

    // Compute loss and initial gradient for each position
    var total_loss: f32 = 0.0;

    // Zero activation gradients
    math.zero(grads.d_hidden, seq_len * C);

    // For each position, compute loss and backprop through output layer
    for (0..seq_len) |pos| {
        // Need to run forward for this position to get logits
        // (Assuming forward_pass was already called and cached)

        // For training, we process all positions but only backprop from positions with targets
        // The target for position `pos` is tokens[pos+1]
        if (pos >= seq_len - 1) continue;

        const target = targets[pos];

        // Compute logits for this position from cached hidden state
        // Final layernorm on this position's hidden state
        var ln_out: [Config.embed_dim]f32 = undefined;
        math.layernorm(
            &ln_out,
            model.buffers.hidden + pos * C,
            model.weights.final_ln_weight,
            model.weights.final_ln_bias,
            C,
        );

        // Store for backward
        math.copy(grads.cache_final_ln_input + pos * C, model.buffers.hidden + pos * C, C);

        // Project to logits
        var logits: [Config.vocab_size]f32 = undefined;
        math.matmul_transb(&logits, &ln_out, model.weights.output_proj, 1, V, C);

        // Softmax
        var probs: [Config.vocab_size]f32 = undefined;
        math.softmax(&probs, &logits, V);

        // Cross-entropy loss
        const p = probs[target];
        if (p > 1e-10) {
            total_loss += -@log(p);
        } else {
            total_loss += 23.0; // -log(1e-10)
        }

        // Backward through cross-entropy + softmax → d_logits
        var d_logits: [Config.vocab_size]f32 = undefined;
        backward_cross_entropy_softmax(&d_logits, &probs, target);

        // Scale by 1/seq_len for mean loss
        const scale = 1.0 / @as(f32, @floatFromInt(seq_len - 1));
        for (0..V) |i| {
            d_logits[i] *= scale;
        }

        // Backward through output projection
        // d_ln_out += d_logits @ output_proj (output_proj is [V x C], transposed)
        var d_ln_out: [Config.embed_dim]f32 = [_]f32{0.0} ** Config.embed_dim;
        backward_linear(
            &d_ln_out,
            grads.d_output_proj,
            &d_logits,
            &ln_out,
            model.weights.output_proj,
            1,
            V,
            C,
        );

        // Backward through final layernorm
        backward_layernorm(
            grads.d_hidden + pos * C,
            grads.d_final_ln_weight,
            grads.d_final_ln_bias,
            &d_ln_out,
            model.buffers.hidden + pos * C,
            model.weights.final_ln_weight,
            C,
        );
    }

    total_loss /= @as(f32, @floatFromInt(seq_len - 1));

    // Backward through transformer layers (reverse order)
    var layer_idx: usize = Config.n_layers;
    while (layer_idx > 0) {
        layer_idx -= 1;
        const lw = &model.weights.layers[layer_idx];
        const lg = &grads.d_layers[layer_idx];

        // --- Backward through FFN residual ---
        // d_ffn_out = d_hidden (residual passes gradient through)
        math.copy(grads.d_ffn_out, grads.d_hidden, seq_len * C);

        // Backward through FFN
        for (0..seq_len) |pos| {
            const d_ffn_o = grads.d_ffn_out + pos * C;
            const ln2_out = grads.cache_ln2_output + (layer_idx * Config.context_len + pos) * C;
            const ffn_pre_gelu = grads.cache_ffn_pre_gelu + (layer_idx * Config.context_len + pos) * F;

            // Backward through down projection: ffn_out = ffn_hidden_activated @ down^T
            var d_ffn_activated: [Config.ffn_dim]f32 = [_]f32{0.0} ** Config.ffn_dim;
            backward_linear(
                &d_ffn_activated,
                lg.d_ffn_down_weight,
                d_ffn_o,
                ffn_pre_gelu, // this should be post-gelu, but we'll use pre-gelu for gelu backward
                lw.ffn_down_weight,
                1,
                C,
                F,
            );

            // Backward through down bias
            for (0..C) |j| {
                lg.d_ffn_down_bias[j] += d_ffn_o[j];
            }

            // Backward through GELU
            var d_ffn_pre: [Config.ffn_dim]f32 = [_]f32{0.0} ** Config.ffn_dim;
            backward_gelu(&d_ffn_pre, &d_ffn_activated, ffn_pre_gelu, F);

            // Backward through up projection: ffn_pre = ln2_out @ up^T + bias
            var d_ln2_out: [Config.embed_dim]f32 = [_]f32{0.0} ** Config.embed_dim;
            backward_linear(
                &d_ln2_out,
                lg.d_ffn_up_weight,
                &d_ffn_pre,
                ln2_out,
                lw.ffn_up_weight,
                1,
                F,
                C,
            );

            // Backward through up bias
            for (0..F) |j| {
                lg.d_ffn_up_bias[j] += d_ffn_pre[j];
            }

            // Backward through pre-FFN layernorm
            const ln2_input = grads.cache_ln2_input + (layer_idx * Config.context_len + pos) * C;
            backward_layernorm(
                grads.d_hidden + pos * C,
                lg.d_ln2_weight,
                lg.d_ln2_bias,
                &d_ln2_out,
                ln2_input,
                lw.ln2_weight,
                C,
            );
        }

        // --- Backward through attention residual ---
        // d_attn_out = d_hidden
        math.copy(grads.d_attn_out, grads.d_hidden, seq_len * C);

        // Backward through attention output projection
        for (0..seq_len) |pos| {
            const d_ao = grads.d_attn_out + pos * C;
            // The attention output before out_proj is in attn_out buffer
            // We need the pre-projection attention output — stored during forward
            var d_attn_combined: [Config.embed_dim]f32 = [_]f32{0.0} ** Config.embed_dim;
            backward_linear(
                &d_attn_combined,
                lg.d_attn_out_weight,
                d_ao,
                model.buffers.attn_out + pos * C, // TODO: need cached version
                lw.attn_out_weight,
                1,
                C,
                C,
            );

            // Distribute gradients to heads
            for (0..H) |head| {
                const head_offset = head * D;
                for (0..D) |d| {
                    grads.d_v[pos * C + head_offset + d] = 0;
                }

                // Backward through weighted sum: attn_out[h] = sum(attn_weights * V)
                const attn_ptr = model.buffers.attn_weights_stored +
                    (layer_idx * H * Config.context_len * Config.context_len + head * Config.context_len * Config.context_len + pos * Config.context_len);

                for (0..D) |d| {
                    const d_out_val = d_attn_combined[head_offset + d];
                    for (0..seq_len) |v_pos| {
                        // d_attn_weights += d_out * V
                        grads.d_attn_scores[head * Config.context_len * Config.context_len + pos * Config.context_len + v_pos] += d_out_val * model.buffers.v[v_pos * C + head_offset + d];
                        // d_V += attn_weights * d_out
                        grads.d_v[v_pos * C + head_offset + d] += attn_ptr[v_pos] * d_out_val;
                    }
                }

                // Backward through softmax of attention scores
                const scores_out = model.buffers.attn_weights_stored +
                    (layer_idx * H * Config.context_len * Config.context_len + head * Config.context_len * Config.context_len + pos * Config.context_len);
                const d_scores_ptr = grads.d_attn_scores + (head * Config.context_len * Config.context_len + pos * Config.context_len);

                var d_prescores: [Config.context_len]f32 = [_]f32{0.0} ** Config.context_len;
                backward_softmax(&d_prescores, d_scores_ptr, scores_out, seq_len);

                // Backward through score = Q @ K^T / sqrt(d)
                const inv_sqrt_d: f32 = 1.0 / @sqrt(@as(f32, @floatFromInt(D)));
                for (0..seq_len) |k_pos| {
                    if (k_pos <= pos) { // causal mask
                        const scaled_grad = d_prescores[k_pos] * inv_sqrt_d;
                        for (0..D) |d| {
                            // d_Q += d_score * K
                            grads.d_q[pos * C + head_offset + d] += scaled_grad * model.buffers.k[k_pos * C + head_offset + d];
                            // d_K += d_score * Q
                            grads.d_k[k_pos * C + head_offset + d] += scaled_grad * model.buffers.q[pos * C + head_offset + d];
                        }
                    }
                }
            }

            // Zero attention score grads for this position (reuse buffer)
            for (0..H) |head| {
                math.zero(grads.d_attn_scores + (head * Config.context_len * Config.context_len + pos * Config.context_len), Config.context_len);
            }
        }

        // Backward through Q, K, V projections
        for (0..seq_len) |pos| {
            const ln1_out = grads.cache_ln1_output + (layer_idx * Config.context_len + pos) * C;

            var d_ln1_out: [Config.embed_dim]f32 = [_]f32{0.0} ** Config.embed_dim;

            // d_Q → d_ln1_out, d_q_weight
            backward_linear(&d_ln1_out, lg.d_q_weight, grads.d_q + pos * C, ln1_out, lw.q_weight, 1, C, C);
            // d_K → d_ln1_out, d_k_weight
            backward_linear(&d_ln1_out, lg.d_k_weight, grads.d_k + pos * C, ln1_out, lw.k_weight, 1, C, C);
            // d_V → d_ln1_out, d_v_weight
            backward_linear(&d_ln1_out, lg.d_v_weight, grads.d_v + pos * C, ln1_out, lw.v_weight, 1, C, C);

            // Backward through pre-attention layernorm
            const ln1_input = grads.cache_ln1_input + (layer_idx * Config.context_len + pos) * C;
            backward_layernorm(
                grads.d_hidden + pos * C,
                lg.d_ln1_weight,
                lg.d_ln1_bias,
                &d_ln1_out,
                ln1_input,
                lw.ln1_weight,
                C,
            );
        }

        // Zero Q, K, V gradient buffers for next layer
        math.zero(grads.d_q, seq_len * C);
        math.zero(grads.d_k, seq_len * C);
        math.zero(grads.d_v, seq_len * C);
    }

    // Backward through embeddings
    for (0..seq_len) |pos| {
        const token = model.tokens[pos];
        const emb_offset = token * C;
        const pos_offset = pos * C;
        for (0..C) |i| {
            grads.d_token_emb[emb_offset + i] += grads.d_hidden[pos * C + i];
            grads.d_pos_emb[pos_offset + i] += grads.d_hidden[pos * C + i];
        }
    }

    return total_loss;
}
