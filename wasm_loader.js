import { game } from './game.js';

async function loadWasm() {
    const zigWasmPath = 'cursor.wasm';
    try {
        const importObject = {
            env: {
                getMouseX: game.getMouseX,
                getMouseY: game.getMouseY,
                getWindowWidth: game.getWindowWidth,
                getWindowHeight: game.getWindowHeight,
                setCursorPosition: game.setCursorPosition,
            }
        };

        const { instance } = await WebAssembly.instantiateStreaming(fetch(zigWasmPath), importObject);
        console.log("WASM module loaded successfully.", instance.exports);

        if (instance.exports.move_cursor) {
            game.updateCursor(instance.exports.move_cursor);
        } else {
            console.warn("Zig function 'move_cursor' not exported or named differently.");
        }

        if (instance.exports.respawn) {
            game.setRespawnCursor(instance.exports.respawn);
        } else {
            console.warn("Zig function 'respawn' not exported or named differently.");
        }

        if (instance.exports.init) {
            game.setInitCursor(instance.exports.init);
            instance.exports.init();
        } else {
            console.warn("Zig function 'init' not exported or named differently.");
        }

    } catch (error) {
        console.error("Failed to load or instantiate WASM module:", error);
    }
}

loadWasm();