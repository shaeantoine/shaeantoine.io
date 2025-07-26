
const Cursor= struct {
    x: i32,
    y: i32,

    pub fn init(x: i32, y: i32) @Vector(2, i32) {
        const position = @Vector(2, i32){
            .x = x,
            .y = y,
        };

        return position;
    }

    pub fn get_x(self: @Vector(2, i32)) i32 {
        const x = self.x;
        return x;
    }

    pub fn get_y(self: @Vector(2, i32)) i32 {
        const y = self.y;
        return y;
    }
};