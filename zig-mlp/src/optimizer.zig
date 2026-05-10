// Adam optimizer for MLP training
// Adapted from DIO's optimizer.zig

const mlp = @import("mlp.zig");
const backward = @import("backward.zig");
const math = @import("math.zig");

const Config = mlp.Config;

pub const AdamState = struct {
    m: [*]f32, // first moment
    v: [*]f32, // second moment
    t: u32, // timestep
    n_params: usize,

    pub fn step(self: *AdamState, params: [*]f32, grads_ptr: [*]const f32, n: usize, lr: f32, max_grad_norm: f32) void {
        // Gradient clipping by norm
        var grad_norm: f32 = 0.0;
        for (0..n) |i| {
            grad_norm += grads_ptr[i] * grads_ptr[i];
        }
        grad_norm = @sqrt(grad_norm);
        const clip_scale = if (grad_norm > max_grad_norm) max_grad_norm / grad_norm else 1.0;

        const beta1: f32 = 0.9;
        const beta2: f32 = 0.999;
        const eps: f32 = 1e-8;

        const t_f = @as(f32, @floatFromInt(self.t + 1));
        const bc1 = 1.0 - pow_f32(beta1, t_f);
        const bc2 = 1.0 - pow_f32(beta2, t_f);

        for (0..n) |i| {
            const g = grads_ptr[i] * clip_scale;
            self.m[i] = beta1 * self.m[i] + (1.0 - beta1) * g;
            self.v[i] = beta2 * self.v[i] + (1.0 - beta2) * g * g;
            const m_hat = self.m[i] / bc1;
            const v_hat = self.v[i] / bc2;
            params[i] -= lr * m_hat / (@sqrt(v_hat) + eps);
        }
    }
};

fn pow_f32(base: f32, exp_val: f32) f32 {
    // Fast approximation for beta^t
    var result: f32 = 1.0;
    var b = base;
    var e = @as(u32, @intFromFloat(exp_val));
    while (e > 0) : (e >>= 1) {
        if (e & 1 == 1) result *= b;
        b *= b;
    }
    return result;
}

pub const ParamGroup = struct {
    ptr: [*]f32,
    grad_ptr: [*]f32,
    size: usize,
};

pub const MAX_PARAM_GROUPS: usize = 6;

pub fn get_param_groups(model: *mlp.MLP, grads: *backward.Gradients, groups: *[MAX_PARAM_GROUPS]ParamGroup) usize {
    const I = Config.input_dim;
    const H = Config.hidden_dim;
    const O = Config.output_dim;

    groups[0] = .{ .ptr = model.weights.w1, .grad_ptr = grads.d_w1, .size = I * H };
    groups[1] = .{ .ptr = model.weights.b1, .grad_ptr = grads.d_b1, .size = H };
    groups[2] = .{ .ptr = model.weights.w2, .grad_ptr = grads.d_w2, .size = H * H };
    groups[3] = .{ .ptr = model.weights.b2, .grad_ptr = grads.d_b2, .size = H };
    groups[4] = .{ .ptr = model.weights.w3, .grad_ptr = grads.d_w3, .size = H * O };
    groups[5] = .{ .ptr = model.weights.b3, .grad_ptr = grads.d_b3, .size = O };

    return MAX_PARAM_GROUPS;
}
