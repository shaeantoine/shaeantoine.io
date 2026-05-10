// Core math operations for MLP forward/backward pass

const std = @import("std");

pub fn matmul(out: [*]f32, inp: [*]const f32, weight: [*]const f32, rows: usize, cols: usize, in_dim: usize) void {
    for (0..rows) |r| {
        for (0..cols) |c| {
            var sum: f32 = 0.0;
            for (0..in_dim) |k| {
                sum += inp[r * in_dim + k] * weight[k * cols + c];
            }
            out[r * cols + c] = sum;
        }
    }
}

pub fn add_bias(out: [*]f32, bias: [*]const f32, rows: usize, cols: usize) void {
    for (0..rows) |r| {
        for (0..cols) |c| {
            out[r * cols + c] += bias[c];
        }
    }
}

pub fn gelu(x: [*]f32, n: usize) void {
    for (0..n) |i| {
        const v = x[i];
        const cdf = 0.5 * (1.0 + tanh_approx(0.7978845608 * (v + 0.044715 * v * v * v)));
        x[i] = v * cdf;
    }
}

pub fn tanh_act(x: [*]f32, n: usize) void {
    for (0..n) |i| {
        x[i] = tanh_approx(x[i]);
    }
}

pub fn hard_clamp(x: [*]f32, n: usize, min_val: f32, max_val: f32) void {
    for (0..n) |i| {
        if (x[i] < min_val) {
            x[i] = min_val;
        } else if (x[i] > max_val) {
            x[i] = max_val;
        }
    }
}

fn tanh_approx(x: f32) f32 {
    if (x > 5.0) return 1.0;
    if (x < -5.0) return -1.0;
    const x2 = x * x;
    const a = x * (135135.0 + x2 * (17325.0 + x2 * (378.0 + x2)));
    const b = 135135.0 + x2 * (62370.0 + x2 * (3150.0 + x2 * 28.0));
    return a / b;
}

pub fn zero(ptr: [*]f32, n: usize) void {
    for (0..n) |i| {
        ptr[i] = 0.0;
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

pub fn scale(ptr: [*]f32, s: f32, n: usize) void {
    for (0..n) |i| {
        ptr[i] *= s;
    }
}
