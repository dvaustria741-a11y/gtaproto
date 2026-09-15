# Neon District Mobile Prototype

## Directory layout

```text
gtaproto/
├── www/
│   └── index.html
├── .github/
│   └── workflows/
│       └── build-apk.yml
├── capacitor.config.json
├── package.json
└── README.md
```

The game is intentionally asset-free. `www/index.html` imports a pinned Three.js module from a CDN and procedurally creates the city, car, lighting, sky shader, physics, camera, HUD, and touch controls.

## Local Android build

```bash
npm install
npx cap add android
npx cap copy android
cd android
./gradlew assembleDebug
```

The debug APK is generated at `android/app/build/outputs/apk/debug/app-debug.apk`.

The GitHub Actions workflow repeats these steps on pushes to `main` and publishes the APK as the `app-debug.apk` artifact.
