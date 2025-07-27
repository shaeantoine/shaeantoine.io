# Compile zig binary to WASM
zig build-exe cursor.zig -target wasm32-freestanding -fno-entry --export=cursor
