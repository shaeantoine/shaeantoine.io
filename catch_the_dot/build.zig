const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const mode = b.standardReleaseOptions();

    const exe = b.addExecutable(.{
        .name = "catch_the_dot",
        .root_source_file = .{ .path = "src/main.zig" },
        .target = target,
        .optimize = mode,
    });

    exe.setOutputPath("public/dot_game.wasm");
    exe.linkLibC(); // optional depending on your Zig usage
    exe.export_symbol_names = &[_][]const u8{
        "set_cursor",
        "update_game",
        "get_dot_x",
        "get_dot_y",
    };

    b.installArtifact(exe);
}
