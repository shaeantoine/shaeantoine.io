import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  // zones.json references asset paths (e.g. "models/geo/nz/nz.obj") relative
  // to the published site root, fetched at runtime via loadOBJ()/loadGLTF() —
  // not imported by any module — so Vite's asset pipeline never sees them.
  // publicDir copies its contents to the build output root verbatim, which
  // is exactly what these runtime-fetched paths need.
  publicDir: 'assets',
  build: {
    // scripts/build.sh copies site/ into .build/site/ first, then this build
    // layers the homepage bundle on top of it — emptyOutDir stays off so
    // that copy survives.
    outDir: '../.build/site',
    emptyOutDir: false
  }
});
