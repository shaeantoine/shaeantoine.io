# shaeantoine.io

My personal website: a 3D model of my real desk. Instead
of a page of sections, the things on the desk are the content. The screen says
hello and has a map of the desk (plus a few small apps). A photo box holds my
working life, a workbench my hardware projects, a stack of papers my research,
the badge on the lamp my day job. A receipt printer prints my contact details.
Plain JavaScript and Vite; the only runtime dependency is three.

## Running it

```
cd desk
npm install
npm run dev        # the site, with hot reload
npm run build      # → desk/dist/, what gets deployed
npm run preview    # serve desk/dist/ locally
npm test           # vitest
```

`render.yaml` deploys it to Render as a static site: Render runs
`cd desk && npm ci && npm run build` and publishes `desk/dist`.

## How it's put together

```
desk/
├── index.html          the page: header ("← back", "Before you go →"), canvas, hint line, loading veil
├── src/
│   ├── main.js         boot and router: builds the room, mounts the modules, maps #hash routes to them
│   ├── style.css       the page's styles
│   ├── core/           what every module shares: ctx (context.js), camera, motion, canvas text
│   │                   and handwriting (draw.js), fonts, palette, paper, URL flags, the layout hook
│   ├── modules/        one folder per thing you can walk up to (routes in brackets)
│   │   ├── monitor/    the screen (#monitor): "Hello" (photo, about, map of the desk), Catch The Dot,
│   │   │               walk.py, MLX, Apple, Trash, and the "now" sticky
│   │   ├── box/        the photo box (#box): prints, clippings and memos, in chapters by year
│   │   ├── bench/      the workbench (#bench): the EEG breadboard, the phone and its OS, the parts drawer
│   │   ├── paper/      the papers (#paper): front pages and margin notes
│   │   ├── printer/    the receipt printer (#printer): contact details and a receipt of the visit
│   │   ├── badge/      the current badge on the lamp (#badge)
│   │   └── props/      the lamp, keyboard, mug and its steam (not routes)
│   ├── scene/          the 3D room: renderer, lighting, materials, render-on-demand, canvas painters
│   ├── loaders/        model and texture loading, the preloader
│   ├── cursor/         the pointer and the desk mouse that echoes it
│   ├── content/        the room's base layout (deskObjects.js), the data it is built from, and the
│   │                   work history the box and badge read (works/, lanyard.js)
│   └── media/          photos and front pages used on prints and papers
├── assets/             Vite's public dir: models, textures, poster art, the Shae Hand font
└── scripts/            the model and image pipelines (below)
```

- **Words** live in each module's `copy.js` (the monitor's home page is
  `desk/src/modules/monitor/copy.js`; the receipt's contact details are
  `desk/src/modules/printer/receipt.js`).
- **A module** is one object with `mount`, `go`, `leave` and friends; the
  contract, lifecycle and routing rules are documented in
  `desk/src/core/contract.js`.
- **The base layout** (`desk/src/content/deskObjects.js`) is the room as first
  built; `desk/src/core/layout.js` takes out what the modules replace and
  applies their overrides.
- **Handwriting** is Shae Hand, a font traced from photos of my own writing
  (`desk/assets/fonts/`), declared in `desk/src/style.css`.

## URL switches

| switch | what it does |
|---|---|
| `?still=1` | screenshot mode: no intro, every transition instant, fixed clock and visit numbers, timers parked |
| `?film=1` | everything animates, but with a fixed clock, so a recording is the same every time |
| `?motion=1` | animate even when the system asks for reduced motion |
| `?now=2026-09-25T21:40` | fix the clock (what the receipt, the phone and the menu bar show) |
| `?time=morning\|day\|evening\|night` | the room's lighting preset |
| `?lamp=on\|off` | force the desk lamp |
| `?steam=0` | leave the mug's steam out |
| `?perf` | a small performance readout |

`window.__desk` is there for debugging and tests: `go('#box/amazon')`,
`route()`, `states()` (every deterministic state the modules declare),
`settled()` and `ready`.

## Assets

`desk/art-src/`, `desk/models-src/` and `desk/textures-src/` hold the
unprocessed sources and are not committed; the scripts turn them into
`desk/assets/`.

- `npm run assets:models` — compress `models-src/*.glb` (`scripts/optimize-models.sh`)
- `npm run assets:images` — poster art and the room's surface textures (`scripts/optimize-images.sh`)
- `scripts/measure-models.mjs` — the bounding box of each model in `models-src/` at the size the
  room places it; the measurements behind the numbers in `deskObjects.js`
