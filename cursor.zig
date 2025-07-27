const std = @import("std");
extern fn getWindowWidth() u32;
extern fn getWindowHeight() u32;
extern fn getMouseX() f32; 
extern fn getMouseY() f32;
extern fn setCursorPosition() void; 

const window_width = @as(f32, getWindowWidth());
const window_height = @as(f32, getWindowHeight());
var x: f32 = window_width / 2.0;
var y: f32 = window_height / 2.0;
const cursor_speed: f32 = 5.0;
const cursor_radius: f32 = 20.0;

const Cursor = struct {
    x: f32,
    y: f32,
    speed: f32,
    size: f32,
};

export fn init() Cursor {
    // Not sure about this method call 
    setCursorPosition(x, y);

    return Cursor {
        .x = x,
        .y = y,
        .cursor_speed = 5.0,
        .cursor_radius = 20.0
    };
}

export fn move_cursor(self: *Cursor) !void {
    const target_x: f32 = getMouseX();
    const target_y: f32 = getMouseY();

    const dx: f32 = self.x - target_x;
    const dy: f32 = self.y - target_y;
    const distance: f32 = std.math.hypot(dx, dy);

    if (distance > 100) {
        var angle: f32 = std.math.atan2(dy, dx);
        angle += std.rand.floatNorm(); // Different than Python implementation
        self.x += self.cursor_speed * std.math.cos(angle);
        self.y += self.cursor_speed * std.math.sin(angle);
    }

    clamp_to_window();
}  

fn clamp_to_window(self: *Cursor) !void {
    self.x = std.math.floatMax(self.cursor_radius, std.math.floatMin(self.window_width - self.cursor_radius, self.x));
    self.y = std.math.floatMax(self.cursor_radius, std.math.floatMin(self.window_height - self.cursor_radius, self.y));
}

export fn respawn_randomly(self: *Cursor) !void {
    self.x = std.rand.intRangeAtMost(self.cursor_radius, self.window_width - self.cursor_radius);
    self.y = std.rand.intRangeAtMost(self.cursor_radius, self.window_height - self.cursor_radius);
}