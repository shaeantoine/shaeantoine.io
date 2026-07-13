# shaeantoine.io

My personal website. It's a static site — no framework, no server, just HTML/CSS/JS committed straight to the repo and served by Render as-is (`buildCommand: echo "No build required"`). One exception: the homepage.

## The homepage is actually a build

The landing page + globe is a small Three.js app that lives in [world-src/](world-src/) as its own isolated project (own `package.json`, Vite). You land on a photo/bio splash, click through, and end up orbiting a cluster of floating low-poly islands — one set for the countries I've lived in, another (toggle-able) for the things I spend my time on professionally/personally.

Because Render doesn't run Node, the built output of that app is committed directly to the repo root — `index.html`, `assets/`, `images/`, `models/` at the top level *are* the compiled globe app, not hand-written files. If you're changing anything about the homepage, you want `world-src/`, not the root `index.html` — see [world-src/README.md](world-src/README.md) for the rebuild workflow (`cd world-src && npm run build`, commit the output alongside your source change).

Everything else — essays, projects, contact — is just plain HTML.

## Layout

```
shaeantoine.io
├── index.html          # compiled homepage (globe app — see world-src/)
├── assets/             # compiled JS/CSS for the homepage
├── images/             # homepage build output
├── models/             # .glb islands/landmarks, fetched at runtime
├── world-src/          # source for the homepage — Three.js + Vite
├── essays/             # essay index + individual essay pages
├── projects/           # projects index
├── contact.html
├── reading.html
├── static/
│   ├── css/style.css
│   └── js/paradox.js   # small easter egg script, runs site-wide
├── render.yaml
└── README.md
```

## Credits / things this leans on

The globe-as-navigation idea is a straight lift from [globe.gl](https://globe.gl/) — I wanted that same "the interface is a world you orbit" feeling, just built from scratch in Three.js instead of using the library directly, so I could get the low-poly toon look and the geography/interests mode-toggle exactly how I wanted them.

The landing screen's background — the slow-breathing contour lines behind the splash photo — is Conway's Game of Life, rendered as topographic isolines instead of a literal grid (see `world-src/src/ui/GameOfLife.js`). Wanted something alive and slightly hypnotic behind the intro without it looking like a screensaver.
