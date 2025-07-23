const std = @import("std");

pub const Vec2 = struct {
    x: f32,
    y: f32,

    pub fn distance(a: Vec2, b: Vec2) f32 {
        return std.math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
    }

    pub fn normalized(self: Vec2) Vec2 {
        const len = std.math.sqrt(self.x * self.x + self.y * self.y);
        return Vec2{ .x = self.x / len, .y = self.y / len };
    }
};

pub const GameState = struct {
    dot: Vec2,
    velocity: Vec2,
    cursor: Vec2,
    speed: f32 = 2.0,

    pub fn update(self: *GameState) void {
        const direction = Vec2{
            .x = self.dot.x - self.cursor.x,
            .y = self.dot.y - self.cursor.y,
        }.normalized();

        self.velocity = direction;
        self.dot.x += direction.x * self.speed;
        self.dot.y += direction.y * self.speed;
    }
};
