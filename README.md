# COASTLINE

COASTLINE is an original procedural coastal open-world game made with Three.js, JavaScript, Vite, and Capacitor. It runs as a normal browser game and can be packaged as an Android APK.

The world is built from reusable geometry at runtime. A continuous procedural heightfield drives the visible terrain and the gameplay ground queries, including a shaped ocean coastline, beach shelf, raised island, inland hills, wetland ponds, and bridge approaches. It includes a streamed city, downtown towers, suburbs, wetlands, beaches, islands, bridges and roads, industrial areas, an airfield, docks, animated water, a waterfront Ferris wheel, lightweight traffic and pedestrians, original arcade vehicles, a third-person player, missions, day/night, weather, mobile controls, a minimap, settings, and local saves.

## Browser

```bash
npm install
npm run dev
```

Open the local address shown by Vite. Desktop keyboard/mouse controls and touch controls are both supported.

## Production build

```bash
npm run build
```

The web build is written to `dist/`.

## Android APK

The repository includes Capacitor configuration. The GitHub Actions workflow can create the Android project if the generated `android/` folder is not checked in, synchronize the web build, and upload a debug APK.

See `BUILD_INSTRUCTIONS.md` for the no-surprises GitHub workflow.

## Controls

- `WASD` or arrow keys: move / drive
- Mouse: camera look
- `Shift`: sprint
- `Space`: jump on foot, brake/handbrake in a vehicle
- `Ctrl`: crouch
- `E`: interact, enter, or exit a vehicle
- `Esc`: pause

All models, textures, shaders, and materials in this project are original procedural or code-authored assets. No third-party game assets are included.
