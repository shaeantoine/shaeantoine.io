#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Building Catch the Dot ==="

echo "Compiling MLP to WASM..."
cd "$ROOT_DIR/zig-mlp"
zig build-exe src/main.zig -target wasm32-freestanding -fno-entry -rdynamic -OReleaseSmall
cp main.wasm "$ROOT_DIR/model.wasm"
echo "  → model.wasm ($(wc -c < "$ROOT_DIR/model.wasm" | tr -d ' ') bytes)"

echo ""
echo "=== Build complete ==="
echo "Files:"
echo "  index.html     $(wc -c < "$ROOT_DIR/index.html" | tr -d ' ') bytes"
echo "  model.wasm     $(wc -c < "$ROOT_DIR/model.wasm" | tr -d ' ') bytes"
echo "  js/game.js     $(wc -c < "$ROOT_DIR/js/game.js" | tr -d ' ') bytes"
echo "  js/brain.js    $(wc -c < "$ROOT_DIR/js/brain.js" | tr -d ' ') bytes"
echo "  js/viz.js      $(wc -c < "$ROOT_DIR/js/viz.js" | tr -d ' ') bytes"
echo "  js/persist.js  $(wc -c < "$ROOT_DIR/js/persistence.js" | tr -d ' ') bytes"
echo ""
echo "Serve with: python3 -m http.server 8000"
