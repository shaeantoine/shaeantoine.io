// Persistence: IndexedDB for model weights, localStorage for game stats

const DB_NAME = 'catch-the-dot';
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
                if (!db.objectStoreNames.contains('brain')) {
                    db.createObjectStore('brain', { keyPath: 'id' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };

            request.onerror = () => reject(request.error);
        });
    }

    async saveWeights(weightsBuffer, metadata = {}) {
        if (!this.db) return;

        const tx = this.db.transaction('brain', 'readwrite');
        const store = tx.objectStore('brain');

        await new Promise((resolve, reject) => {
            const request = store.put({
                id: 'current',
                weights: weightsBuffer,
                timestamp: Date.now(),
                catches: metadata.catches || 0,
                trainSteps: metadata.trainSteps || 0,
                bestStreak: metadata.bestStreak || 0
            });
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
        });
    }

    async loadWeights() {
        if (!this.db) return null;

        const tx = this.db.transaction('brain', 'readonly');
        const store = tx.objectStore('brain');

        return new Promise((resolve, reject) => {
            const request = store.get('current');
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteWeights() {
        if (!this.db) return;

        const tx = this.db.transaction('brain', 'readwrite');
        const store = tx.objectStore('brain');

        await new Promise((resolve, reject) => {
            const request = store.delete('current');
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
        });
    }

    saveStats(stats) {
        try {
            localStorage.setItem('ctd-stats', JSON.stringify(stats));
        } catch {
            // ignore
        }
    }

    loadStats() {
        try {
            const data = localStorage.getItem('ctd-stats');
            return data ? JSON.parse(data) : null;
        } catch {
            return null;
        }
    }

    async clearAll() {
        localStorage.removeItem('ctd-stats');
        return this.deleteWeights();
    }
}
