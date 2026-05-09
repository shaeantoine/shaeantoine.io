// Persistence: IndexedDB for model weights, localStorage for chat history

const DB_NAME = 'dio-model';
const DB_VERSION = 1;

export class Persistence {
    constructor() {
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('checkpoints')) {
                    db.createObjectStore('checkpoints', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('base')) {
                    db.createObjectStore('base', { keyPath: 'id' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };

            request.onerror = () => reject(request.error);
        });
    }

    async saveCheckpoint(weightsBuffer, optimizerBuffer, metadata = {}) {
        if (!this.db) return;

        const tx = this.db.transaction('checkpoints', 'readwrite');
        const store = tx.objectStore('checkpoints');

        await new Promise((resolve, reject) => {
            const request = store.put({
                id: 'current',
                weights: weightsBuffer,
                optimizer: optimizerBuffer,
                version: 1,
                timestamp: new Date(),
                totalSteps: metadata.totalSteps || 0,
                corrections: metadata.corrections || 0
            });
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
        });
    }

    async loadCheckpoint() {
        if (!this.db) return null;

        const tx = this.db.transaction('checkpoints', 'readonly');
        const store = tx.objectStore('checkpoints');

        return new Promise((resolve, reject) => {
            const request = store.get('current');
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    async saveBaseWeights(weightsBuffer) {
        if (!this.db) return;

        const tx = this.db.transaction('base', 'readwrite');
        const store = tx.objectStore('base');

        await new Promise((resolve, reject) => {
            const request = store.put({
                id: 'shakespeare',
                weights: weightsBuffer
            });
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
        });
    }

    async loadBaseWeights() {
        if (!this.db) return null;

        const tx = this.db.transaction('base', 'readonly');
        const store = tx.objectStore('base');

        return new Promise((resolve, reject) => {
            const request = store.get('shakespeare');
            request.onsuccess = () => resolve(request.result?.weights || null);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteCheckpoint() {
        if (!this.db) return;

        const tx = this.db.transaction('checkpoints', 'readwrite');
        const store = tx.objectStore('checkpoints');

        await new Promise((resolve, reject) => {
            const request = store.delete('current');
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
        });
    }

    // Chat history via localStorage
    saveChatHistory(messages) {
        const trimmed = messages.slice(-200);
        try {
            localStorage.setItem('dio-chat', JSON.stringify(trimmed));
        } catch {
            // Quota exceeded — trim more aggressively
            localStorage.setItem('dio-chat', JSON.stringify(trimmed.slice(-50)));
        }
    }

    loadChatHistory() {
        try {
            const data = localStorage.getItem('dio-chat');
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    }

    saveSessionMeta(meta) {
        localStorage.setItem('dio-meta', JSON.stringify(meta));
    }

    loadSessionMeta() {
        try {
            const data = localStorage.getItem('dio-meta');
            return data ? JSON.parse(data) : { totalSteps: 0, corrections: 0 };
        } catch {
            return { totalSteps: 0, corrections: 0 };
        }
    }

    clearAll() {
        localStorage.removeItem('dio-chat');
        localStorage.removeItem('dio-meta');
        return this.deleteCheckpoint();
    }
}
