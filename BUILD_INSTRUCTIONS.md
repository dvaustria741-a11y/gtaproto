# Build COASTLINE on GitHub

1. Unzip the project and upload the contents to a new GitHub repository.
2. Open the repository's **Actions** tab.
3. Select **Build COASTLINE Android APK**.
4. Choose **Run workflow**.
5. When the run finishes, open the run summary and download the `coastline-debug-apk` artifact.

The workflow installs Node.js, builds the Vite game, creates or synchronizes the Capacitor Android project, installs the Android SDK components, builds the debug APK, and uploads it automatically. No Android Studio is needed for this workflow.

The browser version is available locally with `npm install` followed by `npm run dev`. The web production files are created with `npm run build`.

The Android app is forced to landscape and uses Android immersive sticky mode so the game can occupy the complete display. The web page also requests landscape/fullscreen when the player starts a game; browser support for those requests varies by browser.
