
pub const Window = struct {
    pub var width: i32 = 600;
    pub var height: i32 = 600;
};

pub fn init(init_width: i32, init_height: i32) void {
    Window.width = init_width;
    Window.height = init_height;
}