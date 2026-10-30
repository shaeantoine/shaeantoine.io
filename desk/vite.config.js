import { defineConfig } from 'vite';

export default defineConfig({
    base: '/',
    publicDir: 'assets',
    build: {
        // The entry chunk is three.js plus the room (~900 kB, ~245 kB gzipped; each
        // module is its own chunk, loaded by dynamic import). The limit is raised so
        // the build is warning-free.
        chunkSizeWarningLimit: 1200
    }
});
