// Character-level tokenizer for Shakespeare
// Vocabulary is loaded from vocab.txt (generated during training)
// Fallback: standard ASCII chars found in Shakespeare

const DEFAULT_VOCAB = "\n !$&',-.3:;?ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export class Tokenizer {
    constructor(vocab = null) {
        this.chars = vocab || DEFAULT_VOCAB.split('');
        this.vocabSize = this.chars.length;
        this.stoi = {};
        this.itos = {};
        for (let i = 0; i < this.chars.length; i++) {
            this.stoi[this.chars[i]] = i;
            this.itos[i] = this.chars[i];
        }
    }

    encode(str) {
        const tokens = [];
        for (const ch of str) {
            if (ch in this.stoi) {
                tokens.push(this.stoi[ch]);
            }
            // Skip unknown characters
        }
        return tokens;
    }

    decode(tokens) {
        return tokens.map(t => this.itos[t] || '').join('');
    }

    static async fromVocabFile(path) {
        try {
            const resp = await fetch(path);
            const text = await resp.text();
            const lines = text.split('\n');
            const chars = [];
            for (const line of lines) {
                if (line === '\\n') {
                    chars.push('\n');
                } else if (line !== '') {
                    chars.push(line);
                }
            }
            return new Tokenizer(chars);
        } catch {
            console.warn('Could not load vocab.txt, using default vocabulary');
            return new Tokenizer();
        }
    }
}
