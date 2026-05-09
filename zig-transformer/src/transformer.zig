const math = @import("math.zig");

pub const Config = struct {
    pub const vocab_size: usize = 65;
    pub const embed_dim: usize = 64;
    pub const n_layers: usize = 2;
    pub const n_heads: usize = 2;
    pub const head_dim: usize = embed_dim / n_heads; // 32
    pub const context_len: usize = 128;
    pub const ffn_dim: usize = 256;
};

pub const LayerWeights = struct {
    ln1_weight: [*]f32, // [embed_dim]
    ln1_bias: [*]f32, // [embed_dim]
    q_weight: [*]f32, // [embed_dim x embed_dim]
    k_weight: [*]f32, // [embed_dim x embed_dim]
    v_weight: [*]f32, // [embed_dim x embed_dim]
    attn_out_weight: [*]f32, // [embed_dim x embed_dim]
    ln2_weight: [*]f32, // [embed_dim]
    ln2_bias: [*]f32, // [embed_dim]
    ffn_up_weight: [*]f32, // [embed_dim x ffn_dim]
    ffn_up_bias: [*]f32, // [ffn_dim]
    ffn_down_weight: [*]f32, // [ffn_dim x embed_dim]
    ffn_down_bias: [*]f32, // [embed_dim]
};

pub const Weights = struct {
    token_emb: [*]f32, // [vocab_size x embed_dim]
    pos_emb: [*]f32, // [context_len x embed_dim]
    layers: [Config.n_layers]LayerWeights,
    final_ln_weight: [*]f32, // [embed_dim]
    final_ln_bias: [*]f32, // [embed_dim]
    output_proj: [*]f32, // [embed_dim x vocab_size]
};

pub const ActivationBuffers = struct {
    // Per-position hidden state [context_len x embed_dim]
    hidden: [*]f32,
    // Temporary buffers for layer computation
    ln_out: [*]f32, // [context_len x embed_dim]
    q: [*]f32, // [context_len x embed_dim]
    k: [*]f32, // [context_len x embed_dim]
    v: [*]f32, // [context_len x embed_dim]
    attn_scores: [*]f32, // [n_heads x context_len x context_len]
    attn_out: [*]f32, // [context_len x embed_dim]
    ffn_hidden: [*]f32, // [context_len x ffn_dim]
    ffn_out: [*]f32, // [context_len x embed_dim]
    residual: [*]f32, // [context_len x embed_dim]
    logits: [*]f32, // [vocab_size]
    probs: [*]f32, // [vocab_size]

    // Stored for visualization
    attn_weights_stored: [*]f32, // [n_layers x n_heads x context_len x context_len]
};

pub const Model = struct {
    weights: Weights,
    buffers: ActivationBuffers,
    seq_len: usize, // current sequence length
    tokens: [Config.context_len]u32, // token history

    pub fn embed_token(self: *Model, pos: usize) void {
        const token = self.tokens[pos];
        const emb_offset = token * Config.embed_dim;
        const pos_offset = pos * Config.embed_dim;
        const hidden_offset = pos * Config.embed_dim;

        for (0..Config.embed_dim) |i| {
            self.buffers.hidden[hidden_offset + i] =
                self.weights.token_emb[emb_offset + i] + self.weights.pos_emb[pos_offset + i];
        }
    }

    pub fn attention(self: *Model, layer: usize, seq_len: usize) void {
        const lw = &self.weights.layers[layer];
        const C = Config.embed_dim;
        const H = Config.n_heads;
        const D = Config.head_dim;

        // Compute Q, K, V for all positions
        for (0..seq_len) |pos| {
            const h_ptr: [*]f32 = self.buffers.ln_out + pos * C;
            const q_ptr: [*]f32 = self.buffers.q + pos * C;
            const k_ptr: [*]f32 = self.buffers.k + pos * C;
            const v_ptr: [*]f32 = self.buffers.v + pos * C;

            math.matmul_transb(q_ptr, h_ptr, lw.q_weight, 1, C, C);
            math.matmul_transb(k_ptr, h_ptr, lw.k_weight, 1, C, C);
            math.matmul_transb(v_ptr, h_ptr, lw.v_weight, 1, C, C);
        }

        // Multi-head attention
        for (0..H) |head| {
            const head_offset = head * D;

            // Compute attention scores for this head
            for (0..seq_len) |q_pos| {
                for (0..seq_len) |k_pos| {
                    if (k_pos > q_pos) {
                        // Causal mask: future positions get -inf
                        self.buffers.attn_scores[head * Config.context_len * Config.context_len + q_pos * Config.context_len + k_pos] = -1e9;
                    } else {
                        var score: f32 = 0.0;
                        for (0..D) |d| {
                            score += self.buffers.q[q_pos * C + head_offset + d] *
                                self.buffers.k[k_pos * C + head_offset + d];
                        }
                        score /= @sqrt(@as(f32, @floatFromInt(D)));
                        self.buffers.attn_scores[head * Config.context_len * Config.context_len + q_pos * Config.context_len + k_pos] = score;
                    }
                }

                // Softmax over key positions [0..seq_len]
                const scores_ptr: [*]f32 = self.buffers.attn_scores + (head * Config.context_len * Config.context_len + q_pos * Config.context_len);
                math.softmax(scores_ptr, scores_ptr, seq_len);

                // Store attention weights for visualization
                const store_offset = layer * H * Config.context_len * Config.context_len + head * Config.context_len * Config.context_len + q_pos * Config.context_len;
                math.copy(self.buffers.attn_weights_stored + store_offset, scores_ptr, seq_len);

                // Weighted sum of values
                for (0..D) |d| {
                    var sum: f32 = 0.0;
                    for (0..seq_len) |v_pos| {
                        sum += scores_ptr[v_pos] * self.buffers.v[v_pos * C + head_offset + d];
                    }
                    self.buffers.attn_out[q_pos * C + head_offset + d] = sum;
                }
            }
        }

        // Output projection
        for (0..seq_len) |pos| {
            const attn_ptr: [*]f32 = self.buffers.attn_out + pos * C;
            const out_ptr: [*]f32 = self.buffers.ffn_out + pos * C; // reuse buffer temporarily
            math.matmul_transb(out_ptr, attn_ptr, lw.attn_out_weight, 1, C, C);
            math.copy(self.buffers.attn_out + pos * C, out_ptr, C);
        }
    }

    pub fn ffn(self: *Model, layer: usize, seq_len: usize) void {
        _ = self;
        _ = layer;
        _ = seq_len;
        // Inlined into forward_pass_impl for caching support
    }

    pub fn forward_pass(self: *Model) void {
        self.forward_pass_impl(null);
    }

    pub fn forward_pass_training(self: *Model, cache: *@import("backward.zig").GradientBuffers) void {
        self.forward_pass_impl(cache);
    }

    fn forward_pass_impl(self: *Model, cache: ?*@import("backward.zig").GradientBuffers) void {
        const seq_len = self.seq_len;
        const C = Config.embed_dim;
        const F = Config.ffn_dim;

        // Embed all tokens
        for (0..seq_len) |pos| {
            self.embed_token(pos);
        }

        // Process through each layer
        for (0..Config.n_layers) |layer| {
            const lw = &self.weights.layers[layer];

            // Cache pre-LN1 input for backward
            if (cache) |c| {
                for (0..seq_len) |pos| {
                    math.copy(c.cache_ln1_input + (layer * Config.context_len + pos) * C, self.buffers.hidden + pos * C, C);
                }
            }

            // Pre-attention layernorm
            for (0..seq_len) |pos| {
                math.layernorm(
                    self.buffers.ln_out + pos * C,
                    self.buffers.hidden + pos * C,
                    lw.ln1_weight,
                    lw.ln1_bias,
                    C,
                );
            }

            // Cache LN1 output for backward
            if (cache) |c| {
                for (0..seq_len) |pos| {
                    math.copy(c.cache_ln1_output + (layer * Config.context_len + pos) * C, self.buffers.ln_out + pos * C, C);
                }
            }

            // Multi-head self-attention
            self.attention(layer, seq_len);

            // Residual connection
            for (0..seq_len) |pos| {
                math.add_inplace(self.buffers.hidden + pos * C, self.buffers.attn_out + pos * C, C);
            }

            // Cache pre-LN2 input for backward
            if (cache) |c| {
                for (0..seq_len) |pos| {
                    math.copy(c.cache_ln2_input + (layer * Config.context_len + pos) * C, self.buffers.hidden + pos * C, C);
                }
            }

            // Pre-FFN layernorm
            for (0..seq_len) |pos| {
                math.layernorm(
                    self.buffers.ln_out + pos * C,
                    self.buffers.hidden + pos * C,
                    lw.ln2_weight,
                    lw.ln2_bias,
                    C,
                );
            }

            // Cache LN2 output for backward
            if (cache) |c| {
                for (0..seq_len) |pos| {
                    math.copy(c.cache_ln2_output + (layer * Config.context_len + pos) * C, self.buffers.ln_out + pos * C, C);
                }
            }

            // FFN (with caching of pre-GELU activations)
            for (0..seq_len) |pos| {
                const h_ptr: [*]f32 = self.buffers.ln_out + pos * C;
                const ffn_h: [*]f32 = self.buffers.ffn_hidden + pos * F;
                const ffn_o: [*]f32 = self.buffers.ffn_out + pos * C;

                // Up projection + bias
                math.matmul_transb(ffn_h, h_ptr, lw.ffn_up_weight, 1, F, C);
                math.add_vec(ffn_h, ffn_h, lw.ffn_up_bias, F);

                // Cache pre-GELU values
                if (cache) |c| {
                    math.copy(c.cache_ffn_pre_gelu + (layer * Config.context_len + pos) * F, ffn_h, F);
                }

                // GELU
                math.gelu(ffn_h, ffn_h, F);

                // Down projection + bias
                math.matmul_transb(ffn_o, ffn_h, lw.ffn_down_weight, 1, C, F);
                math.add_vec(ffn_o, ffn_o, lw.ffn_down_bias, C);
            }

            // Residual connection
            for (0..seq_len) |pos| {
                math.add_inplace(self.buffers.hidden + pos * C, self.buffers.ffn_out + pos * C, C);
            }
        }

        // Final layernorm on last position only (for next token prediction)
        const last_pos = seq_len - 1;
        math.layernorm(
            self.buffers.ln_out,
            self.buffers.hidden + last_pos * C,
            self.weights.final_ln_weight,
            self.weights.final_ln_bias,
            C,
        );

        // Project to vocabulary logits
        math.matmul_transb(self.buffers.logits, self.buffers.ln_out, self.weights.output_proj, 1, Config.vocab_size, C);

        // Softmax to get probabilities
        math.softmax(self.buffers.probs, self.buffers.logits, Config.vocab_size);
    }

    pub fn add_token(self: *Model, token: u32) void {
        if (self.seq_len >= Config.context_len) {
            // Shift tokens left, drop oldest
            for (0..Config.context_len - 1) |i| {
                self.tokens[i] = self.tokens[i + 1];
            }
            self.tokens[Config.context_len - 1] = token;
        } else {
            self.tokens[self.seq_len] = token;
            self.seq_len += 1;
        }
    }

    pub fn sample_token(self: *Model, temperature: f32) u32 {
        if (temperature < 0.01) {
            // Greedy: pick highest probability
            var max_idx: u32 = 0;
            var max_val: f32 = self.buffers.probs[0];
            for (1..Config.vocab_size) |i| {
                if (self.buffers.probs[i] > max_val) {
                    max_val = self.buffers.probs[i];
                    max_idx = @intCast(i);
                }
            }
            return max_idx;
        }

        // Temperature-scaled sampling
        // Re-compute softmax with temperature
        var temp_logits: [Config.vocab_size]f32 = undefined;
        for (0..Config.vocab_size) |i| {
            temp_logits[i] = self.buffers.logits[i] / temperature;
        }
        var temp_probs: [Config.vocab_size]f32 = undefined;
        math.softmax(&temp_probs, &temp_logits, Config.vocab_size);

        // Sample from distribution using stored random seed
        const r = xorshift_random();
        var cumulative: f32 = 0.0;
        for (0..Config.vocab_size) |i| {
            cumulative += temp_probs[i];
            if (r < cumulative) {
                return @intCast(i);
            }
        }
        return Config.vocab_size - 1;
    }

    pub fn reset(self: *Model) void {
        self.seq_len = 0;
        for (0..Config.context_len) |i| {
            self.tokens[i] = 0;
        }
    }
};

// Simple xorshift PRNG (seeded from JS)
var rng_state: u32 = 12345;

pub fn seed_rng(s: u32) void {
    rng_state = s;
}

fn xorshift_random() f32 {
    rng_state ^= rng_state << 13;
    rng_state ^= rng_state >> 17;
    rng_state ^= rng_state << 5;
    return @as(f32, @floatFromInt(rng_state & 0x7FFFFFFF)) / @as(f32, @floatFromInt(@as(u32, 0x7FFFFFFF)));
}
