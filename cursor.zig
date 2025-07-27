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
    cursor_speed: i32 = 5,
    cursor_size: i32 = 20,

    pub fn init(x: i32, y: i32) @Vector(2, i32) {
        const position = @Vector(2, i32){
            .x = x,
            .y = y,
        };
        return position;
    }

    pub fn get_position(self: Cursor) [2]i32 {
        return [2]f32{self.x, self.y}; 
    }
};