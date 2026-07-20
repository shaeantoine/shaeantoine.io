# shaeantoine.io

I took a bit of a different approach to my personal website. I find
so many others have very uniform websites. I probably would of been better off just
copying this format but I was curious about what an alternative approach may look like. 
So, I decided to put my money where my mouth is (figuratively of course) and build this. 

All of the content is encapusalted in a universe. This universe consists of several planets
dedicated to a topic (about me, my interest in technology, etc.). A user can click on planets 
and lankmarks within planets all of which represent something be it a story, past work experience,
hobby I have or book that I've read. All contains in the visual medium of a universe (and hopfully
for your enjoyment). 


## Layout

```
shaeantoine.io
├── universe/               # The actual code
│   ├── src/scene/          # SceneManager, CameraRig, InputController,
│   │                         ZoneLoader (Earth's cluster), PlanetLoader
│   ├── src/kit/            # low-poly primitive factories (hill, rock,
│   │                         tree, building, gridPlane, column) + toon
│   │                         materials
│   ├── src/state/          # WorldStateMachine: sole decision-maker for
│   │                         orbit/focus/mode-toggle transitions
│   ├── src/ui/             # Sidebar, Masthead, ModeToggle, ClusterReturn,
│   │                         BriefOverlay
│   ├── src/loaders/        # loadOBJ (Blender .obj+palette) / loadGLTF
│   │                         (.glb)
│   ├── src/transition/     # DissolveEffect: the mode-toggle's dissolve
│   ├── data/universe.json  # the single data schema: sun, camera, Brief
│   │                         copy, and every body (planets + Earth's
│   │                         cluster slots)
│   └── assets/             # Vite's publicDir: copied verbatim to the
│                              build output root, since universe.json's
│                              model/palette paths are fetched at runtime
├── scripts/build.sh        # runs universe's Vite build into .build/
├── render.yaml
└── README.md
```

## Credits

The globe-as-navigation idea is a straight lift from [globe.gl](https://globe.gl/). I wanted that same "the interface is a world you orbit" feeling, just built from scratch in Three.js instead of using the library directly, so I could get the low-poly toon look and the geography/interests mode-toggle exactly how I wanted them.
