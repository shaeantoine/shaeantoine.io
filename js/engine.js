// Engine: orchestrates WASM model loading, inference, and training
// Integrates with Persistence for weight saving/loading across sessions
import { Tokenizer } from './tokenizer.js';

export class Engine {
    constructor() {
        this.wasm = null;
        this.memory = null;
        this.tokenizer = null;
        this.initialized = false;
        this.trainingInitialized = false;
        this.lossHistory = [];
        this.baseWeightsBuffer = null;
        this.weightSize = 0;
        this._saveTimer = null;
    }

    async init(persistence = null) {
        this.tokenizer = await Tokenizer.fromVocabFile('./weights/vocab.txt');

        const importObject = { env: {} };
        const result = await WebAssembly.instantiateStreaming(
            fetch('./model.wasm'),
            importObject
        );
        this.wasm = result.instance.exports;
        this.memory = this.wasm.memory;

        // Load base weights
        this.baseWeightsBuffer = await fetch('./weights/base.bin').then(r => r.arrayBuffer());
        this.weightSize = this.baseWeightsBuffer.byteLength;

        // Check for saved checkpoint
        let weightsToLoad = this.baseWeightsBuffer;
        let loadedFromCheckpoint = false;

        if (persistence) {
            try {
                const checkpoint = await persistence.loadCheckpoint();
                if (checkpoint && checkpoint.weights && checkpoint.weights.byteLength === this.weightSize) {
                    weightsToLoad = checkpoint.weights;
                    loadedFromCheckpoint = true;
                    console.log(`Loaded checkpoint (step ${checkpoint.totalSteps}, ${checkpoint.corrections} corrections)`);
                }
            } catch (e) {
                console.warn('Failed to load checkpoint, using base weights:', e);
            }

            // Store base weights for reset functionality
            try {
                const stored = await persistence.loadBaseWeights();
                if (!stored) {
                    await persistence.saveBaseWeights(this.baseWeightsBuffer.slice(0));
                }
            } catch (e) {
                console.warn('Failed to store base weights:', e);
            }
        }

        // Load weights into WASM
        const weightsBytes = new Uint8Array(weightsToLoad);
        const weightsPtr = this.wasm.alloc(weightsBytes.length);
        const wasmMem = new Uint8Array(this.memory.buffer, this.ptrToOffset(weightsPtr), weightsBytes.length);
        wasmMem.set(weightsBytes);

        this.wasm.init(weightsPtr, weightsBytes.length);
        this.wasm.seed_rng(Date.now() & 0xFFFFFFFF);

        this.initialized = true;
        return { loadedFromCheckpoint };
    }

    initTraining() {
        if (!this.initialized) throw new Error('Engine not initialized');
        this.wasm.init_training();
        this.trainingInitialized = true;
    }

    ptrToOffset(ptr) {
        return Number(ptr);
    }

    // === INFERENCE ===

    generate(prompt, maxTokens = 100, temperature = 0.8, onToken = null) {
        if (!this.initialized) throw new Error('Engine not initialized');

        this.wasm.reset();

        const promptTokens = this.tokenizer.encode(prompt);
        for (const token of promptTokens) {
            this.wasm.forward(token);
        }

        const generatedTokens = [];
        for (let i = 0; i < maxTokens; i++) {
            const nextToken = this.wasm.sample(temperature);
            generatedTokens.push(nextToken);

            if (onToken) {
                const char = this.tokenizer.decode([nextToken]);
                const probs = this.getProbs();
                onToken(char, probs, i);
            }

            this.wasm.forward(nextToken);
        }

        return this.tokenizer.decode(generatedTokens);
    }

    getProbs() {
        const probsPtr = this.wasm.get_next_probs();
        const offset = this.ptrToOffset(probsPtr);
        return new Float32Array(this.memory.buffer, offset, this.tokenizer.vocabSize);
    }

    getAttention(layer, head) {
        const ptr = this.wasm.get_attention_ptr(layer, head);
        const offset = this.ptrToOffset(ptr);
        return new Float32Array(this.memory.buffer, offset, 128 * 128);
    }

    getSeqLen() {
        return this.wasm.get_seq_len();
    }

    reset() {
        if (this.initialized) {
            this.wasm.reset();
        }
    }

    // === TRAINING ===

    train(correctedText, options = {}) {
        const {
            learningRate = 0.001,
            steps = 3,
            onStep = null
        } = options;

        if (!this.trainingInitialized) {
            this.initTraining();
        }

        const tokens = this.tokenizer.encode(correctedText);
        if (tokens.length < 2) return { losses: [], deltas: null };

        const tokenBytes = tokens.length * 4;
        const tokenPtr = this.wasm.alloc(tokenBytes);
        const tokenView = new Uint32Array(this.memory.buffer, this.ptrToOffset(tokenPtr), tokens.length);
        tokenView.set(tokens);

        this.wasm.begin_training(tokenPtr, tokens.length);

        const losses = [];
        for (let i = 0; i < steps; i++) {
            const loss = this.wasm.train_step(learningRate);
            losses.push(loss);
            this.lossHistory.push(loss);

            if (onStep) {
                onStep({
                    step: i,
                    loss,
                    totalSteps: this.wasm.get_training_step(),
                    deltas: this.getWeightDeltas()
                });
            }
        }

        return { losses, deltas: this.getWeightDeltas() };
    }

    reinforce(text, learningRate = 0.0001, steps = 1) {
        return this.train(text, { learningRate, steps });
    }

    // === WEIGHT PERSISTENCE ===

    exportWeights() {
        if (!this.initialized) return null;
        if (!this.trainingInitialized) return null;

        const nParams = this.wasm.get_total_params();
        if (nParams === 0) return null;

        const ptr = this.wasm.export_weights_ptr();
        const offset = this.ptrToOffset(ptr);
        const floats = new Float32Array(this.memory.buffer, offset, nParams);
        // Copy to a new buffer (detached from WASM memory)
        return floats.slice().buffer;
    }

    getWeightDeltas() {
        const ptr = this.wasm.get_weight_deltas_ptr();
        const offset = this.ptrToOffset(ptr);
        const nParams = this.wasm.get_total_params();
        return new Float32Array(this.memory.buffer, offset, nParams);
    }

    getWeightsForLayer(layer, component) {
        const ptr = this.wasm.get_weights_ptr(layer, component);
        const size = this.wasm.get_weights_size(component);
        const offset = this.ptrToOffset(ptr);
        return new Float32Array(this.memory.buffer, offset, size);
    }

    getTrainingStep() {
        if (!this.initialized) return 0;
        return this.wasm.get_training_step();
    }

    getLastLoss() {
        if (!this.initialized) return 0;
        return this.wasm.get_last_loss();
    }

    getLossHistory() {
        return this.lossHistory;
    }

    // Debounced save — call after training, saves after 2s of inactivity
    scheduleSave(persistence, metadata) {
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(async () => {
            const weights = this.exportWeights();
            if (weights && persistence) {
                await persistence.saveCheckpoint(weights, null, metadata);
            }
        }, 2000);
    }
}
