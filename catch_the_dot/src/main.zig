const std = @import("std");
const game = @import("game.zig");

var state = game.GameState{
    .dot = .{ .x = 200, .y = 200 },
    .velocity = .{ .x = 0, .y = 0 },
    .cursor = .{ .x = 0, .y = 0 },
};

export fn set_cursor(x: f32, y: f32) void {
    state.cursor.x = x;
    state.cursor.y = y;
}

export fn update_game() void {
    state.update();
}

export fn get_dot_x() f32 {
    return state.dot.x;
}
export fn get_dot_y() f32 {
    return state.dot.y;
}
