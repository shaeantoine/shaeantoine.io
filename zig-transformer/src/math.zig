const std = @import("std");

pub fn matmul(out: [*]f32, a: [*]const f32, b: [*]const f32, m: usize, n: usize, k: usize) void {
    // out[m x n] = a[m x k] * b[k x n]
    for (0..m) |i| {
        for (0..n) |j| {
            var sum: f32 = 0.0;
            for (0..k) |p| {
                sum += a[i * k + p] * b[p * n + j];
            }
            out[i * n + j] = sum;
        }
    }
}

pub fn matmul_transb(out: [*]f32, a: [*]const f32, b: [*]const f32, m: usize, n: usize, k: usize) void {
    // out[m x n] = a[m x k] * b^T[n x k] (b stored as [n x k], accessed transposed)
    for (0..m) |i| {
        for (0..n) |j| {
            var sum: f32 = 0.0;
            for (0..k) |p| {
                sum += a[i * k + p] * b[j * k + p];
            }
            out[i * n + j] = sum;
        }
    }
}

pub fn add_vec(out: [*]f32, a: [*]const f32, b: [*]const f32, n: usize) void {
    for (0..n) |i| {
        out[i] = a[i] + b[i];
    }
}

pub fn softmax(out: [*]f32, inp: [*]const f32, n: usize) void {
    var max_val: f32 = inp[0];
    for (1..n) |i| {
        if (inp[i] > max_val) max_val = inp[i];
    }

    var sum: f32 = 0.0;
    for (0..n) |i| {
        const exp_val = @exp(inp[i] - max_val);
        out[i] = exp_val;
        sum += exp_val;
    }

    const inv_sum = 1.0 / sum;
    for (0..n) |i| {
        out[i] *= inv_sum;
    }
}

pub fn gelu(out: [*]f32, inp: [*]const f32, n: usize) void {
    // GELU approximation: 0.5 * x * (1 + tanh(sqrt(2/pi) * (x + 0.044715 * x^3)))
    const sqrt_2_over_pi: f32 = 0.7978845608;
    for (0..n) |i| {
        const x = inp[i];
        const x3 = x * x * x;
        const inner = sqrt_2_over_pi * (x + 0.044715 * x3);
        out[i] = 0.5 * x * (1.0 + std.math.tanh(inner));
    }
}

pub fn layernorm(out: [*]f32, inp: [*]const f32, weight: [*]const f32, bias: [*]const f32, n: usize) void {
    const eps: f32 = 1e-5;

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
    for (0..n) |i| {
        out[i] = (inp[i] - mean) * inv_std * weight[i] + bias[i];
    }
}

pub fn copy(dst: [*]f32, src: [*]const f32, n: usize) void {
    for (0..n) |i| {
        dst[i] = src[i];
    }
}

pub fn add_inplace(dst: [*]f32, src: [*]const f32, n: usize) void {
    for (0..n) |i| {
        dst[i] += src[i];
    }
}

pub fn scale(out: [*]f32, inp: [*]const f32, s: f32, n: usize) void {
    for (0..n) |i| {
        out[i] = inp[i] * s;
    }
}

pub fn zero(buf: [*]f32, n: usize) void {
    for (0..n) |i| {
        buf[i] = 0.0;
    }
}
