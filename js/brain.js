// Brain: loads the WASM MLP, provides forward() and train() for the game loop

export class Brain {
    constructor() {
        this.wasm = null;
        this.memory = null;
        this.initialized = false;
        this.obsPtr = null;
        this.targetPtr = null;
        this.inputDim = 5;
        this.hiddenDim = 32;
        this.outputDim = 2;
        this.totalParams = 0;
        this.lossHistory = [];

        // Experience replay buffer
        this.replayBuffer = [];
        this.replayCapacity = 32;
    }

    async init(seed = null) {
        const importObject = { env: {} };
        const result = await WebAssembly.instantiateStreaming(
            fetch('./model.wasm'),
            importObject
        );
        this.wasm = result.instance.exports;
        this.memory = this.wasm.memory;

        const s = seed || (Date.now() & 0xFFFFFFFF);
        this.wasm.init(s);

        this.inputDim = this.wasm.get_input_dim();
        this.hiddenDim = this.wasm.get_hidden_dim();
        this.outputDim = this.wasm.get_output_dim();
        this.totalParams = this.wasm.get_total_params();

        // Allocate observation buffer in WASM memory
        this.obsPtr = this.wasm.alloc(this.inputDim * 4);
        // Allocate target buffer for training
        this.targetPtr = this.wasm.alloc(this.outputDim * 4);

        this.lossHistory = [];
        this.initialized = true;
    }

    forward(obs) {
        if (!this.initialized) return [0, 0];

        const obsView = new Float32Array(
            this.memory.buffer,
            Number(this.obsPtr),
            this.inputDim
        );
        // Input: [escapeDx, escapeDy, normalizedDist, dotX, dotY]
        const dist = Math.hypot(obs.dx, obs.dy) || 1;
        obsView[0] = obs.dx / dist;
        obsView[1] = obs.dy / dist;
        obsView[2] = obs.normalizedDist;
        obsView[3] = obs.dotX;
        obsView[4] = obs.dotY;

        const outPtr = this.wasm.forward(this.obsPtr);
        const outView = new Float32Array(
            this.memory.buffer,
            Number(outPtr),
            this.outputDim
        );

        return [
            Math.max(-1, Math.min(1, outView[0])),
            Math.max(-1, Math.min(1, outView[1]))
        ];
    }

    // Train on a target action for the current observation
    // Returns the loss value
    train(targetDx, targetDy, learningRate = 0.05, steps = 3) {
        if (!this.initialized) return [];

        const targetView = new Float32Array(
            this.memory.buffer,
            Number(this.targetPtr),
            this.outputDim
        );
        targetView[0] = targetDx;
        targetView[1] = targetDy;

        const losses = [];
        for (let i = 0; i < steps; i++) {
            const loss = this.wasm.train_step(this.targetPtr, learningRate);
            losses.push(loss);
            this.lossHistory.push(loss);
        }

        return losses;
    }

    // Convenience: train to move away from a given direction
    trainEscape(obs, learningRate = 0.05, steps = 3) {
        const dx = obs.dx;
        const dy = obs.dy;
        const dist = Math.hypot(dx, dy) || 1;

        let targetDx = dx / dist;
        let targetDy = dy / dist;
        targetDx = Math.max(-1, Math.min(1, targetDx));
        targetDy = Math.max(-1, Math.min(1, targetDy));

        const outputBefore = this.forward(obs);
        const losses = this.train(targetDx, targetDy, learningRate, steps);
        const outputAfter = this.forward(obs);

        return { losses, target: [targetDx, targetDy], outputBefore: [...outputBefore], outputAfter: [...outputAfter] };
    }

    // Train with experience replay: add new experience, then train on a mini-batch
    trainWithReplay(obs, learningRate = 0.02, batchSize = 8) {
        const dx = obs.dx;
        const dy = obs.dy;
        const dist = Math.hypot(dx, dy) || 1;

        let targetDx = dx / dist;
        let targetDy = dy / dist;
        targetDx = Math.max(-1, Math.min(1, targetDx));
        targetDy = Math.max(-1, Math.min(1, targetDy));

        // Add to replay buffer
        this.replayBuffer.push({
            obs: { ...obs },
            target: [targetDx, targetDy]
        });
        if (this.replayBuffer.length > this.replayCapacity) {
            this.replayBuffer.shift();
        }

        // Capture state before training
        const outputBefore = this.forward(obs);

        // Sample mini-batch from buffer and train on each
        const losses = [];
        const sampleSize = Math.min(batchSize, this.replayBuffer.length);
        const indices = this._sampleIndices(sampleSize);

        for (const idx of indices) {
            const exp = this.replayBuffer[idx];
            // Write this experience's observation to WASM
            this._writeObs(exp.obs);
            this.wasm.forward(this.obsPtr);
            // Train toward this experience's target
            const loss = this._trainOnTarget(exp.target[0], exp.target[1], learningRate);
            losses.push(loss);
        }

        // Capture output after training (on current obs)
        const outputAfter = this.forward(obs);

        return { losses, target: [targetDx, targetDy], outputBefore: [...outputBefore], outputAfter: [...outputAfter] };
    }

    _writeObs(obs) {
        const obsView = new Float32Array(
            this.memory.buffer,
            Number(this.obsPtr),
            this.inputDim
        );
        const dist = Math.hypot(obs.dx, obs.dy) || 1;
        obsView[0] = obs.dx / dist;
        obsView[1] = obs.dy / dist;
        obsView[2] = obs.normalizedDist;
        obsView[3] = obs.dotX;
        obsView[4] = obs.dotY;
    }

    _trainOnTarget(targetDx, targetDy, learningRate) {
        const targetView = new Float32Array(
            this.memory.buffer,
            Number(this.targetPtr),
            this.outputDim
        );
        targetView[0] = targetDx;
        targetView[1] = targetDy;
        const loss = this.wasm.train_step(this.targetPtr, learningRate);
        this.lossHistory.push(loss);
        return loss;
    }

    _sampleIndices(count) {
        const len = this.replayBuffer.length;
        if (count >= len) return Array.from({ length: len }, (_, i) => i);
        const indices = new Set();
        while (indices.size < count) {
            indices.add(Math.floor(Math.random() * len));
        }
        return [...indices];
    }

    // Weaker reinforcement: train toward current action (good behavior)
    reinforce(obs, learningRate = 0.01, steps = 1) {
        // Run forward to get current action
        const outputBefore = this.forward(obs);

        // Compute ideal escape direction
        const dist = Math.hypot(obs.dx, obs.dy) || 1;
        const escapeDx = obs.dx / dist;
        const escapeDy = obs.dy / dist;

        // Blend current action with ideal escape (80% current, 20% ideal)
        const targetDx = Math.max(-1, Math.min(1, outputBefore[0] * 0.8 + escapeDx * 0.2));
        const targetDy = Math.max(-1, Math.min(1, outputBefore[1] * 0.8 + escapeDy * 0.2));

        const losses = this.train(targetDx, targetDy, learningRate, steps);

        const outputAfter = this.forward(obs);

        return { losses, target: [targetDx, targetDy], outputBefore: [...outputBefore], outputAfter: [...outputAfter] };
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

    getActivations() {
        if (!this.initialized) return { h1: null, h2: null };

        const h1Ptr = this.wasm.get_h1_ptr();
        const h2Ptr = this.wasm.get_h2_ptr();

        return {
            h1: new Float32Array(this.memory.buffer, Number(h1Ptr), this.hiddenDim),
            h2: new Float32Array(this.memory.buffer, Number(h2Ptr), this.hiddenDim)
        };
    }

    getWeights() {
        if (!this.initialized) return null;
        const ptr = this.wasm.get_weights_ptr();
        return new Float32Array(this.memory.buffer, Number(ptr), this.totalParams);
    }

    getWeightDeltas() {
        if (!this.initialized) return null;
        const ptr = this.wasm.get_weight_deltas_ptr();
        return new Float32Array(this.memory.buffer, Number(ptr), this.totalParams);
    }

    exportWeights() {
        if (!this.initialized) return null;
        const ptr = this.wasm.export_weights_ptr();
        const view = new Float32Array(this.memory.buffer, Number(ptr), this.totalParams);
        return view.slice().buffer;
    }

    loadWeights(buffer) {
        if (!this.initialized) return;
        const data = new Float32Array(buffer);
        if (data.length !== this.totalParams) return;

        const loadPtr = this.wasm.alloc(this.totalParams * 4);
        const loadView = new Float32Array(
            this.memory.buffer,
            Number(loadPtr),
            this.totalParams
        );
        loadView.set(data);
        this.wasm.load_weights(loadPtr);
    }
}
