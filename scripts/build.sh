#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Building DIO ==="

# Step 1: Compile Zig to WASM
echo "Compiling Zig transformer to WASM..."
cd "$ROOT_DIR/zig-transformer"
zig build-exe src/main.zig -target wasm32-freestanding -fno-entry -rdynamic -OReleaseSmall
cp main.wasm "$ROOT_DIR/model.wasm"
echo "  → model.wasm ($(wc -c < "$ROOT_DIR/model.wasm" | tr -d ' ') bytes)"

# Step 2: Train model (only if base.bin doesn't exist)
if [ ! -f "$ROOT_DIR/weights/base.bin" ]; then
    echo "Training model (this takes a few minutes)..."
    cd "$ROOT_DIR/train"
    python train.py
else
    echo "Skipping training (weights/base.bin already exists)"
fi

echo ""
echo "=== Build complete ==="
echo "Serve with: python -m http.server 8000"
