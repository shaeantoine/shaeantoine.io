import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  // universe.json references asset paths (e.g. "models/geo/nz/nz.obj")
  // relative to the published site root, fetched at runtime via
  // loadOBJ()/loadGLTF() — not imported by any module — so Vite's asset
  // pipeline never sees them. publicDir copies its contents to the build
  // output root verbatim, which is exactly what these runtime-fetched paths
  // need.
  publicDir: 'assets',
  build: {
    // outDir is outside project root — set emptyOutDir explicitly so Vite
    // doesn't warn about clearing a directory it doesn't own.
    outDir: '../.build',
    emptyOutDir: true
  }
});
