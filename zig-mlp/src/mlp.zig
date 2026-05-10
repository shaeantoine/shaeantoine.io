// MLP: 3-layer feedforward network for dot evasion
// Architecture: Input(5) → Dense(32) → GELU → Dense(32) → GELU → Dense(2) [linear output]

const math = @import("math.zig");

pub const Config = struct {
    pub const input_dim: usize = 5;
    pub const hidden_dim: usize = 32;
    pub const output_dim: usize = 2;

    pub const n_params: usize =
        input_dim * hidden_dim + hidden_dim + // layer 1 weights + bias
        hidden_dim * hidden_dim + hidden_dim + // layer 2 weights + bias
        hidden_dim * output_dim + output_dim; // layer 3 weights + bias
};

pub const Weights = struct {
    w1: [*]f32, // [input_dim × hidden_dim]
    b1: [*]f32, // [hidden_dim]
    w2: [*]f32, // [hidden_dim × hidden_dim]
    b2: [*]f32, // [hidden_dim]
    w3: [*]f32, // [hidden_dim × output_dim]
    b3: [*]f32, // [output_dim]
};

pub const Activations = struct {
    h1: [*]f32, // [hidden_dim] after layer 1
    h2: [*]f32, // [hidden_dim] after layer 2
    out: [*]f32, // [output_dim] final output

    // Pre-activation caches (for backward pass in Phase 3)
    pre_act1: [*]f32, // [hidden_dim] before GELU in layer 1
    pre_act2: [*]f32, // [hidden_dim] before GELU in layer 2
    pre_act3: [*]f32, // [output_dim] before output (linear)
};

pub const MLP = struct {
    weights: Weights,
    act: Activations,
    input: [*]f32, // [input_dim] stored for backward pass

    pub fn forward(self: *MLP, obs: [*]const f32) [*]f32 {
        const I = Config.input_dim;
        const H = Config.hidden_dim;
        const O = Config.output_dim;

        // Store input for backward pass
        math.copy(self.input, obs, I);

        // Layer 1: input → hidden (matmul + bias + GELU)
        math.matmul(self.act.pre_act1, obs, self.weights.w1, 1, H, I);
        math.add_bias(self.act.pre_act1, self.weights.b1, 1, H);
        math.copy(self.act.h1, self.act.pre_act1, H);
        math.gelu(self.act.h1, H);

        // Layer 2: hidden → hidden (matmul + bias + GELU)
        math.matmul(self.act.pre_act2, self.act.h1, self.weights.w2, 1, H, H);
        math.add_bias(self.act.pre_act2, self.weights.b2, 1, H);
        math.copy(self.act.h2, self.act.pre_act2, H);
        math.gelu(self.act.h2, H);

        // Layer 3: hidden → output (matmul + bias, no activation)
        math.matmul(self.act.pre_act3, self.act.h2, self.weights.w3, 1, O, H);
        math.add_bias(self.act.pre_act3, self.weights.b3, 1, O);
        math.copy(self.act.out, self.act.pre_act3, O);

        return self.act.out;
    }
};
