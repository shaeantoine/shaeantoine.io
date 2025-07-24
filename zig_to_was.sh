# Compile zig binary to WASM
zig build-exe main.zig -target wasm32-freestanding -fno-entry --export=add
