# Compile zig binary to WASM
zig build-exe -target wasm32-freestanding -fno-entry --export=move_cursor --export=respawn_randomly --export=init