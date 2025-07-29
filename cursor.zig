const std = @import("std");
extern fn getWindowWidth() f32;
extern fn getWindowHeight() f32;
extern fn getMouseX() f32;
extern fn getMouseY() f32;
extern fn setCursorPosition(x: f32, y: f32) void;

var window_width: f32 = 0.0;
var window_height: f32 = 0.0;
var x: f32 = 0.0;
var y: f32 = 0.0;
const cursor_speed: f32 = 20.0;
const cursor_radius: f32 = 20.0;

export fn init() void {
    window_width = @as(f32, getWindowWidth());
    window_height = @as(f32, getWindowHeight());
    x = window_width / 2.0;
    y = window_height / 2.0;
    setCursorPosition(x, y);
}

export fn move_cursor(dt_seconds: f32) void {
    const target_x: f32 = getMouseX();
    const target_y: f32 = getMouseY();

    const dx: f32 = x - target_x;
    const dy: f32 = y - target_y;
    const distance: f32 = std.math.hypot(dx, dy);

    if (distance > 40) {
        const angle: f32 = std.math.atan2(dy, dx);
        //angle += std.Random.floatNorm(prng, f32); // not quite right
        x += cursor_speed * dt_seconds * @cos(angle);
        y += cursor_speed * dt_seconds * @sin(angle);
    }

    clamp_to_window();
    setCursorPosition(x, y);
}

fn clamp_to_window() void {
    x = @max(cursor_radius, @min(window_width - cursor_radius, x));
    y = @max(cursor_radius, @min(window_height - cursor_radius, y));
    setCursorPosition(x, y);
}

export fn respawn() void {
    // x = std.Random.intRangeAtMost(rand, f32, cursor_radius, window_width - cursor_radius);
    // y = std.Random.intRangeAtMost(rand, f32, cursor_radius, window_height - cursor_radius);
    setCursorPosition(window_width / 2,window_height / 2);
}
