# homepage — the site's interactive 3D diorama

Source for the site's homepage: a small cluster of floating low-poly islands
representing the countries Shae has lived in, with a toggle that re-skins
the same islands into zones representing his professional/personal
interests. See the repo's plan doc for full design context.

This is an **isolated sub-project**: it has its own `package.json`
(Three.js + Vite) and is built independently of `site/`, the rest of the
site's hand-written pages.

## Build model: Render runs the build

`scripts/build.sh` (invoked by `render.yaml`'s `buildCommand`) copies
`site/` into `.build/site/`, then runs this project's Vite build on top of
it, writing `index.html`, `assets/`, `images/`, `models/` into
`.build/site/`. Nothing under `homepage/` is committed as build output —
only source.

```sh
cd homepage
npm install   # first time only
npm run dev   # local Vite dev server for iterating on the scene
npm run build # writes into ../.build/site — same output scripts/build.sh produces
```

## Layout

- `src/scene/` — `SceneManager` (renderer/lighting), `CameraRig`
  (orbit + fly-to-slot), `InputController` (drag/pinch/click → intents),
  `ZoneLoader` (builds/tears down zone geometry from `data/zones.json`).
- `src/kit/` — shared low-poly primitive factories (hill, rock, tree,
  building, gridPlane, column) and the toon material/palette factory. This
  is what makes every Shae's-World interest zone affordable without
  bespoke modeling.
- `src/state/` — `WorldStateMachine`, the sole decision-maker for
  orbit/focus/mode-toggle transitions. Every other module only reacts to
  its `state:changed` events.
- `src/transition/DissolveEffect.js` — the mode-toggle's dissolve-out/
  resolve-in visual.
- `src/ui/` — `Sidebar` and `ModeToggle`, plain DOM overlays (not WebGL).
- `src/loaders/gltf.js` — cached `GLTFLoader` wrapper for hand-authored
  country/landmark `.glb` assets.
- `data/zones.json` — the single data schema: 5 slots, each with a
  `geography` skin and a `shaesWorld` skin sharing one position/camera
  framing.
- `assets/` — Vite's `publicDir`; anything here is copied verbatim to the
  build output root, since `zones.json` paths (e.g. `models/geo/nz/nz.obj`)
  are fetched at runtime, not imported by any module.

### Adding a new country/interest mesh

Country and interest-zone meshes are hand-authored directly in Blender —
no intermediate pipeline. Export a flat-shaded `.obj` plus its baked
toon-palette texture to `homepage/assets/models/geo/<name>/<name>.obj`
and `<name>_palette.png`, then point the relevant skin's `shape` at them
in `data/zones.json`: `{ "model": "models/geo/<name>/<name>.obj", "palette": "models/geo/<name>/<name>_palette.png" }`.
`ZoneLoader` loads any shape with a `palette` set via `loadOBJ`; a `model`
alone (no `palette`) is reserved for a future hand-authored `.glb`.

## Missing assets degrade gracefully

`ZoneLoader` falls back to a plain kit-composed placeholder pad if a
geography skin's `.glb` isn't present yet (with a console warning), so the
page is fully interactive — orbit, zoom, click, focus, mode toggle — even
before the real country/landmark models exist.
