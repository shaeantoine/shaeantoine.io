const std = @import("std.zig");

const GameShape = struct {
    window_width: i32,
    window_height: i32, 
};

const ex: GameShape = .{
    .window_width = 600,
    .window_height = 600,
};

const Cursor= struct {
    x: f32,
    y: f32,
    cursor_speed: i32,
    cursor_radius: i32,

    pub fn get_position(x: f32, y: f32) [2]i32 {
        return Cursor {
            .x = x,
            .y = y,
            .cursor_speed = 5,
            .cursor_radius = 20
        };
    }

    pub fn move_cursor(self: *Cursor, obs: [4]i32) !void {
        const target_x: f32 = self.x * obs[1];
        const target_y: f32 = self.y * obs[2];

        const dx: f32 = self.x - target_x;
        const dy: f32 = self.y - target_y;
        const distance: f32 = std.math.hypot(dx, dy);

        if (distance > 100) {
            var angle: f32 = std.math.atan2(dy, dx);
            angle += std.rand.floatNorm(); // Different than Python implementation
            self.x += self.cursor_speed * std.cos(angle);
            self.y += self.cursor_speed * std.sine(angle);
        }

        self.clamp_to_window();
    }  

    fn clamp_to_window(self: *Cursor) !void {
        self.x = std.math.floatMax(self.cursor_radius, std.math.floatMin(ex.window_width - self.cursor_radius, self.x));
        self.y = std.math.floatMax(self.cursor_radius, std.math.floatMin(ex.window_height - self.cursor_radius, self.y));
    }
    
    pub fn respawn_randomly(self: *Cursor) !void {
        self.x = std.rand.intRangeAtMost(self.cursor_radius, ex.window_width - self.cursor_radius);
        self.y = std.rand.intRangeAtMost(self.cursor_radius, ex.window_height - self.cursor_radius);
    }
};