// Backward pass for 3-layer MLP
// Computes gradients of MSE loss w.r.t. all weights and biases

const mlp = @import("mlp.zig");
const math = @import("math.zig");

const Config = mlp.Config;

pub const Gradients = struct {
    d_w1: [*]f32, // [input_dim × hidden_dim]
    d_b1: [*]f32, // [hidden_dim]
    d_w2: [*]f32, // [hidden_dim × hidden_dim]
    d_b2: [*]f32, // [hidden_dim]
    d_w3: [*]f32, // [hidden_dim × output_dim]
    d_b3: [*]f32, // [output_dim]

    // Scratch buffers for intermediate gradients
    d_h2: [*]f32, // [hidden_dim]
    d_h1: [*]f32, // [hidden_dim]
    d_pre3: [*]f32, // [output_dim]
    d_pre2: [*]f32, // [hidden_dim]
    d_pre1: [*]f32, // [hidden_dim]
};

pub fn zero_gradients(grads: *Gradients) void {
    const I = Config.input_dim;
    const H = Config.hidden_dim;
    const O = Config.output_dim;

    math.zero(grads.d_w1, I * H);
    math.zero(grads.d_b1, H);
    math.zero(grads.d_w2, H * H);
    math.zero(grads.d_b2, H);
    math.zero(grads.d_w3, H * O);
    math.zero(grads.d_b3, O);
}

fn gelu_deriv(x: f32) f32 {
    const k: f32 = 0.7978845608;
    const c: f32 = 0.044715;
    const inner = k * (x + c * x * x * x);
    const t = tanh_approx(inner);
    const cdf = 0.5 * (1.0 + t);
    const pdf_part = 0.5 * k * (1.0 + 3.0 * c * x * x) * (1.0 - t * t);
    return cdf + x * pdf_part;
}

fn tanh_approx(x: f32) f32 {
    if (x > 5.0) return 1.0;
    if (x < -5.0) return -1.0;
    const x2 = x * x;
    const a = x * (135135.0 + x2 * (17325.0 + x2 * (378.0 + x2)));
    const b = 135135.0 + x2 * (62370.0 + x2 * (3150.0 + x2 * 28.0));
    return a / b;
}

// Backward pass: computes gradients given target output
// Returns MSE loss
pub fn backward(model: *mlp.MLP, grads: *Gradients, target: [*]const f32) f32 {
    const I = Config.input_dim;
    const H = Config.hidden_dim;
    const O = Config.output_dim;

    // Compute MSE loss and output gradient
    var loss: f32 = 0.0;
    for (0..O) |i| {
        const diff = model.act.out[i] - target[i];
        loss += diff * diff;
        // Linear output: derivative is 1, gradients always flow
        grads.d_pre3[i] = diff;
    }
    loss *= 0.5;

    // Layer 3 gradients: d_W3, d_b3, d_h2
    // d_W3[j][k] = h2[j] * d_pre3[k]
    for (0..H) |j| {
        for (0..O) |k| {
            grads.d_w3[j * O + k] += model.act.h2[j] * grads.d_pre3[k];
        }
    }
    for (0..O) |k| {
        grads.d_b3[k] += grads.d_pre3[k];
    }
    // d_h2[j] = sum_k(d_pre3[k] * W3[j][k])
    for (0..H) |j| {
        var sum: f32 = 0.0;
        for (0..O) |k| {
            sum += grads.d_pre3[k] * model.weights.w3[j * O + k];
        }
        grads.d_h2[j] = sum;
    }

    // Layer 2: apply GELU derivative
    for (0..H) |j| {
        grads.d_pre2[j] = grads.d_h2[j] * gelu_deriv(model.act.pre_act2[j]);
    }
    // d_W2[j][k] = h1[j] * d_pre2[k]
    for (0..H) |j| {
        for (0..H) |k| {
            grads.d_w2[j * H + k] += model.act.h1[j] * grads.d_pre2[k];
        }
    }
    for (0..H) |k| {
        grads.d_b2[k] += grads.d_pre2[k];
    }
    // d_h1[j] = sum_k(d_pre2[k] * W2[j][k])
    for (0..H) |j| {
        var sum: f32 = 0.0;
        for (0..H) |k| {
            sum += grads.d_pre2[k] * model.weights.w2[j * H + k];
        }
        grads.d_h1[j] = sum;
    }

    // Layer 1: apply GELU derivative
    for (0..H) |j| {
        grads.d_pre1[j] = grads.d_h1[j] * gelu_deriv(model.act.pre_act1[j]);
    }
    // d_W1[i][j] = input[i] * d_pre1[j]
    for (0..I) |i| {
        for (0..H) |j| {
            grads.d_w1[i * H + j] += model.input[i] * grads.d_pre1[j];
        }
    }
    for (0..H) |j| {
        grads.d_b1[j] += grads.d_pre1[j];
    }

    return loss;
}
