// wasm_loader.js

// Import the 'game' instance from game.js
import { game } from './game.js';

async function loadWasm() {
    const zigWasmPath = 'cursor.wasm'; // <-- IMPORTANT: Update this path!
    try {
        // Define the import object with functions Zig can call
        const importObject = {
            env: {
                getAICursorX: game.getAICursorX,
                getAICursorY: game.getAICursorY,
                getAICursorRadius: game.getAICursorRadius,
                setAICursorPosition: game.setAICursorPosition,
                getWindowWidth: game.getWindowWidth,
                getWindowHeight: game.getWindowHeight,
                getScore: game.getScore,
                setScore: game.setScore,
                getIsGameOver: game.getIsGameOver,
                setGameOver: game.setGameOver,
            }
        };

        const { instance } = await WebAssembly.instantiateStreaming(fetch(zigWasmPath), importObject);
        console.log("WASM module loaded successfully.", instance.exports);

        // --- Pass Zig's Exported Functions to GameManager ---
        // These are the functions that the JS GameManager will call.
        if (instance.exports.update_ai_cursor) {
            game.setZigUpdateAICursorFunction(instance.exports.update_ai_cursor);
        } else {
            console.warn("Zig function 'update_ai_cursor' not exported or named differently.");
        }

        if (instance.exports.respawn_ai_cursor) {
            game.setZigRespawnAICursorFunction(instance.exports.respawn_ai_cursor);
        } else {
            console.warn("Zig function 'respawn_ai_cursor' not exported or named differently.");
        }

        if (instance.exports.init_ai_cursor) {
            game.setZigInitAICursorFunction(instance.exports.init_ai_cursor);
            // Call Zig's init function once it's available and the game is running
            instance.exports.init_ai_cursor();
        } else {
            console.warn("Zig function 'init_ai_cursor' not exported or named differently.");
        }

    } catch (error) {
        console.error("Failed to load or instantiate WASM module:", error);
    }
}

loadWasm();