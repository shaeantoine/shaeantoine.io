# shaeantoine.io

My personal website. Source and build output are kept fully separate:
`site/` is hand-written HTML/CSS/JS, served as-is; `homepage/` is a small
Three.js app (Vite build) for the landing page + globe. Render assembles
both into `.build/site/` (gitignored) at deploy time via `scripts/build.sh`
— nothing generated is ever committed.

## The homepage is a build

The landing page + globe lives in [homepage/](homepage/) as its own
isolated project (own `package.json`, Vite). You land on a photo/bio
splash, click through, and end up orbiting a cluster of floating low-poly
islands — one set for the countries I've lived in, another (toggle-able)
for the things I spend my time on professionally/personally. See
[homepage/README.md](homepage/README.md) for how to work on it locally
(`cd homepage && npm install && npm run dev`).

Everything else — essays, projects, contact — is plain HTML under `site/`.

## Build

```sh
bash scripts/build.sh
```

This copies `site/` into `.build/site/`, then runs `homepage`'s Vite build
on top of it, so `.build/site/` ends up with both the hand-written pages
and the compiled globe app. Render runs this same script
(`render.yaml`'s `buildCommand`) and publishes `.build/site/`.

## Layout

```
shaeantoine.io
├── site/                # hand-written pages, published as-is
│   ├── contact.html
│   ├── reading.html
│   ├── essays/
│   ├── projects/
│   └── static/
│       ├── css/style.css
│       └── js/paradox.js   # small easter egg script, runs site-wide
├── homepage/            # source for the homepage — Three.js + Vite
├── scripts/build.sh     # assembles site/ + homepage build into .build/site/
├── .build/              # gitignored — build output, regenerated on deploy
├── render.yaml
└── README.md
```

## Credits / things this leans on

The globe-as-navigation idea is a straight lift from [globe.gl](https://globe.gl/) — I wanted that same "the interface is a world you orbit" feeling, just built from scratch in Three.js instead of using the library directly, so I could get the low-poly toon look and the geography/interests mode-toggle exactly how I wanted them.

The landing screen's background — the slow-breathing contour lines behind the splash photo — is Conway's Game of Life, rendered as topographic isolines instead of a literal grid (see `homepage/src/ui/GameOfLife.js`). Wanted something alive and slightly hypnotic behind the intro without it looking like a screensaver.
