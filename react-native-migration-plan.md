# React Native Migration Plan — JOVI Lens

## Context

JOVI Lens is currently a **Vite + React 19 web app** (react-dom, react-router-dom), shipped as an installable PWA (manifest + service worker, "Add to Home Screen" on iOS Safari). It is **not** a React Native/Expo project today, so there is no incremental "just plug in" path to Expo Go — reaching real installable iOS/Android binaries requires a migration.

This plan scopes that migration: what survives unchanged, what needs a library swap, what needs a full rewrite, and what has no direct equivalent at all.

## Why migrate

React Native compiles to a real native binary — an `.ipa` for iOS and an `.apk`/`.aab` for Android — installable directly on a device, not a browser shortcut. The current PWA approach cannot produce that.

**Signing/distribution requirements to plan around:**
- iOS: installing on a physical device requires an Apple Developer account ($99/yr). Can build locally with Xcode on a Mac, or via Expo's EAS Build (cloud, no local Xcode needed — still needs the Apple account for signing).
- Android: no paid account needed to sideload an APK. Play Store publishing is a one-time $25.

## Codebase inventory (as of this plan)

| Area | Files | Lines |
|---|---|---|
| `components/` | 11 files | ~1,690 |
| `pages/` | 6 files | ~676 |
| `context/AppDataContext.jsx` | 1 file | 468 |
| `services/` | 8 files | ~981 |
| `styles/global.css` | 1 file | — |
| `api/` + `api/_lib/` (backend, Vercel-style serverless functions) | ~13 files | separate, reusable |

## Migration scope, by effort tier

### Tier 0 — Reuses unchanged (no rewrite)

- **`api/` + `api/_lib/`** — Azure OpenAI / MiniMax provider abstraction, prompts, TTS/STT/vision/video-lesson endpoints, auth. Plain Node/Vercel serverless code, no DOM dependency. The RN app calls the exact same HTTP endpoints.
- **`services/demoResponses.js`, `services/videoLesson.js`, `services/subjectStudy.js`** — pure data/fetch logic. Their only `window.*` calls are `setTimeout`/`clearTimeout`, which are global in React Native too.
- **`context/AppDataContext.jsx`** (468 lines, largest single file) — pure state/business logic sitting behind the `services/storage.js` abstraction. It never touches `localStorage`/`indexedDB` directly, so it ports essentially unchanged once storage is swapped underneath it.

### Tier 1 — Same interface, swap the implementation

These wrap a browser API behind clean function boundaries — call sites don't change, only the internals:

| File | Current (web) | RN replacement |
|---|---|---|
| `services/storage.js` | IndexedDB (media) + localStorage (notes/history/plan) | AsyncStorage/MMKV for JSON, `expo-file-system` for actual media files |
| `services/imageAnalysis.js` | Canvas resize before upload | `expo-image-manipulator` |
| `services/audio.js` | `<audio>` element + `speechSynthesis` fallback | `expo-av` for live-TTS playback, `expo-speech` for demo-mode fallback |
| `services/speechInput.js` | MediaRecorder → upload to `/api/transcribe`; Web Speech API live dictation | `expo-av` recording → same `/api/transcribe` endpoint. **Drop** live on-device dictation (no RN equivalent) or accept a flakier community lib (`@react-native-voice/voice`) |

### Tier 2 — Full rewrite, same product logic

All of `components/` and `pages/` (17 files, ~2,700 lines) plus `styles/global.css`:
- Every `className`-based JSX tree becomes RN primitives (`View`, `Text`, `Pressable`, `ScrollView`, `Image`).
- CSS becomes `StyleSheet` objects (or NativeWind if a Tailwind-like syntax is wanted).
- `react-router-dom` becomes React Navigation or `expo-router` (maps cleanly onto `AppShell.jsx` + `BottomNav.jsx`).

The logic inside each file (state, handlers, data shapes) carries over conceptually — this tier is high-volume but mechanical, not risky.

### Tier 3 — Hard spots requiring a design decision before estimation

**`pages/Camera.jsx` (283 lines)** — not a simple preview; a fully custom UI with zoom levels, torch/flash control, live aspect-ratio crop math, a mode strip (foto/vídeo/noite/retrato/etc.), and in-app video recording. Needs `react-native-vision-camera`. The math (zoom scale, crop rect) ports as a spec; the implementation is entirely new.

**`services/videoExport.js` (150 lines)** — generates the lesson video by drawing frames to a `<canvas>` and capturing them via `MediaRecorder`. **There is no React Native equivalent for this combination.** Options:
1. Move video generation server-side (ffmpeg on the backend; app just downloads the finished file) — cleanest, matches the existing API pattern.
2. Rebuild in-app with `react-native-skia` (canvas-like drawing) + `ffmpeg-kit-react-native` (muxing) — heavier native dependency footprint.
3. Drop file export; play the "lesson" as an in-app animated slideshow with narration audio only, no exportable file — cheapest, but changes what the feature does for users.

**Decision needed:** which of the three options above for video export before this tier can be scheduled.

## Recommended stack

- **Expo (managed workflow)** + **EAS Build** for signing/distribution (avoids requiring local Xcode for every build).
- **`expo-router`** for navigation (closest conceptual match to the current file-based `pages/` + `react-router-dom` setup).
- **`react-native-vision-camera`** for the camera screen.
- **`expo-av`, `expo-speech`, `expo-image-manipulator`, `expo-file-system`** for the Tier 1 swaps.
- Backend stays as-is (Vercel serverless functions) — no changes required to support a native client.

## Suggested migration order

1. **Stand up the Expo project skeleton** (navigation shell, tab bar, empty screens) — validates the toolchain and signing pipeline early.
2. **Port `context/AppDataContext.jsx` + rewrite `services/storage.js`** — get the data layer working on-device first, since every screen depends on it.
3. **Port the Tier 1 services** (`imageAnalysis`, `audio`, `speechInput`) — isolated, testable independent of UI.
4. **Rewrite the lower-risk screens/components** (Notes, History, Profile, Gallery, Copilot, Study/Exam/Plan components) — highest line count but lowest risk, builds momentum and shakes out the styling approach.
5. **Decide and implement the video export approach** (Tier 3 decision above) — do this before or in parallel with step 6, since it may affect backend API surface.
6. **Rebuild the Camera screen** last — hardest and most custom; do it once the rest of the app (and the data layer it writes into) is stable.

## Open decisions

- [ ] Video export: server-side render vs. in-app Skia+ffmpeg vs. drop file export (playback-only).
- [ ] Live on-device dictation: drop it, or take on `@react-native-voice/voice`.
- [ ] Styling approach: plain `StyleSheet` vs. NativeWind.
- [ ] Apple Developer account provisioning (needed before any real-device iOS testing/distribution).

---

*Generated from a scoping conversation with Claude Code on 2026-09-08.*
