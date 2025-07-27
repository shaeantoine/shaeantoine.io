const Cursor = @import("./cursor.zig");

const GameState: struct {
    score: i23,
    cursor: Cursor,

    pub fn init(cursor: Cursor) !GameState {
        return GameState{
            .score = 0,
            .cursor = cursor
        };
    }

    
};