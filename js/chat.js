// Chat: handles message display, generation, edit mode, and training triggers
import { Engine } from './engine.js';
import { Persistence } from './persistence.js';

export class Chat {
    constructor(engine, persistence, options = {}) {
        this.engine = engine;
        this.persistence = persistence;
        this.messages = [];
        this.generating = false;
        this.onTrainingStep = options.onTrainingStep || null;
        this.onToken = options.onToken || null;
        this.onMessageComplete = options.onMessageComplete || null;
        this.corrections = 0;
        this.stopRequested = false;
    }

    async sendMessage(text, temperature = 0.8, maxTokens = 150) {
        if (this.generating) return;
        this.generating = true;
        this.stopRequested = false;

        // Add user message
        this.messages.push({ role: 'user', text, timestamp: Date.now() });

        // Generate response
        this.engine.reset();

        // Feed conversation context (last few messages as a prompt)
        const context = this.buildContext(text);
        const contextTokens = this.engine.tokenizer.encode(context);

        for (const token of contextTokens) {
            this.engine.wasm.forward(token);
        }

        // Generate tokens
        let generated = '';
        for (let i = 0; i < maxTokens; i++) {
            if (this.stopRequested) break;

            const nextToken = this.engine.wasm.sample(temperature);
            const char = this.engine.tokenizer.decode([nextToken]);
            generated += char;

            if (this.onToken) {
                this.onToken(char, this.engine.getProbs(), i);
            }

            this.engine.wasm.forward(nextToken);

            // Yield to UI every 5 tokens
            if (i % 5 === 0) {
                await new Promise(r => requestAnimationFrame(r));
            }
        }

        // Add model message
        this.messages.push({ role: 'model', text: generated, timestamp: Date.now() });
        this.generating = false;

        if (this.onMessageComplete) {
            this.onMessageComplete(generated);
        }

        // Save chat
        this.persistence.saveChatHistory(this.messages);

        return generated;
    }

    stop() {
        this.stopRequested = true;
    }

    async correctResponse(originalText, correctedText) {
        if (!correctedText || correctedText === originalText) return null;

        this.corrections++;

        // Update the last model message
        const lastModelMsg = [...this.messages].reverse().find(m => m.role === 'model');
        if (lastModelMsg) {
            lastModelMsg.corrected = correctedText;
        }

        // Train on the correction
        const result = this.engine.train(correctedText, {
            learningRate: 0.001,
            steps: 3,
            onStep: this.onTrainingStep
        });

        // Save state
        this.persistence.saveChatHistory(this.messages);
        this.persistence.saveSessionMeta({
            totalSteps: this.engine.getTrainingStep(),
            corrections: this.corrections
        });

        return result;
    }

    async reinforceResponse(text) {
        const result = this.engine.reinforce(text);

        this.persistence.saveSessionMeta({
            totalSteps: this.engine.getTrainingStep(),
            corrections: this.corrections
        });

        return result;
    }

    buildContext(userMessage) {
        // Build a simple context from recent messages
        // Keep it short to stay within context window
        let context = '';
        const recent = this.messages.slice(-4);
        for (const msg of recent) {
            if (msg.role === 'user') {
                context += msg.text + '\n';
            } else {
                context += (msg.corrected || msg.text) + '\n';
            }
        }
        context += userMessage + '\n';
        // Truncate to fit context window
        if (context.length > 100) {
            context = context.slice(-100);
        }
        return context;
    }

    loadHistory() {
        this.messages = this.persistence.loadChatHistory();
        const meta = this.persistence.loadSessionMeta();
        this.corrections = meta.corrections || 0;
        return this.messages;
    }

    clearHistory() {
        this.messages = [];
        this.corrections = 0;
        this.persistence.clearAll();
    }
}
