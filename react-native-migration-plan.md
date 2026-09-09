# React Native Migration Plan — JOVI Lens

## Context

JOVI Lens is currently a **Vite + React 19 web app** (react-dom, react-router-dom), shipped as an installable PWA (manifest + service worker, "Add to Home Screen" on iOS Safari). It is **not** a React Native/Expo project today, so there is no incremental "just plug in" path to Expo Go — reaching real installable iOS/Android binaries requires a migration.

This plan scopes that migration: what survives unchanged, what needs a library swap, what needs a full rewrite, and what has no direct equivalent at all.

**Project location:** the Expo app lives at the **repo root** (`app/`, `components/`, `services/`, `context/`, `app.json`, `package.json`, ...). The pre-existing web app was moved into `web/` to make room for it; `api/` (the shared backend) stayed at the root, since both apps call it. Implementation started 2026-09-09 on the `ab_migrate_react_native` branch; the repo was restructured this way once the native app was functionally complete.

## Why migrate

React Native compiles to a real native binary — an `.ipa` for iOS and an `.apk`/`.aab` for Android — installable directly on a device, not a browser shortcut. The current PWA approach cannot produce that.

**Signing/distribution requirements to plan around:**
- iOS: installing on a physical device requires an Apple Developer account ($99/yr), full stop — see [Testing & distribution](#testing--distribution) below for why there's no browser-based workaround.
- Android: no paid account needed to sideload an APK. Play Store publishing is a one-time $25.

## Codebase inventory (corrected 2026-09-09)

**A note on paths below, after the repo restructure:** this plan (and the tiers/scope below) was written against the original web app's source, which now lives under `web/` (`web/pages/`, `web/components/`, `web/services/`, `web/context/`, `web/styles/`) — so every bare `pages/`/`components/`/`services/`/`context/`/`styles/` reference from here through the Tier 0–3 sections means the `web/`-prefixed path unless stated otherwise. `api/` stayed at the repo root (shared). Once the plan gets to what was actually *built* for the native app (the "Recommended stack," "Suggested migration order," and "Testing & distribution" sections), bare `app/`/`components/`/`services/`/`context/` paths refer to the native app's copies, which live at the **repo root** — see [Project location](#context) above.

The original inventory (written 2026-09-08) undercounted — it missed files that already existed in the repo at the time. Corrected counts:

| Area | Files | Lines |
|---|---|---|
| `components/` | 16 files | ~1,960 |
| `pages/` | 6 files | ~814 |
| `context/AppDataContext.jsx` | 1 file | 543 |
| `services/` | 11 files | ~1,100 |
| `styles/global.css` | 1 file | — |
| `api/` + `api/_lib/` (backend, Vercel-style serverless functions) | 17 files | separate, reusable |

Files missing from the original inventory, now classified below: `services/youtubeRecommendations.js`, `services/search.js`, `services/dataTransfer.js`, and components `StudyModeContent.jsx`, `SubjectNotes.jsx`, `PodcastPlayer.jsx`, `LibrarySearch.jsx`, `SubjectExam.jsx`, `SubjectStudio.jsx`, `LessonPlayer.jsx`, `SmartImageSheet.jsx`, `YouTubeRecommendations.jsx`, `StudyPlan.jsx` (all part of the Subject Studio feature — already existed when the plan was first drafted, just weren't counted).

## Migration scope, by effort tier

### Tier 0 — Reuses unchanged (no rewrite)

- **`api/` + `api/_lib/`** — Azure OpenAI / MiniMax provider abstraction, prompts, TTS/STT/vision/video-lesson/YouTube endpoints, auth. Plain Node/Vercel serverless code, no DOM dependency. The RN app calls the exact same HTTP endpoints.
- **`services/demoResponses.js`, `services/videoLesson.js`, `services/subjectStudy.js`, `services/youtubeRecommendations.js`, `services/search.js`** — pure data/fetch/string logic. Their only `window.*` calls are `setTimeout`/`clearTimeout`, which are global in React Native too.
- **`context/AppDataContext.jsx`** (543 lines, largest single file) — pure state/business logic sitting behind the `services/storage.js` abstraction. It never touches `localStorage`/`indexedDB` directly, so it ports essentially unchanged once storage is swapped underneath it.

### Tier 1 — Same interface, swap the implementation

These wrap a browser API behind clean function boundaries — call sites don't change, only the internals:

| File | Current (web) | RN replacement |
|---|---|---|
| `services/storage.js` | IndexedDB (media) + localStorage (notes/history/plan) | AsyncStorage/MMKV for JSON, `expo-file-system` for actual media files |
| `services/imageAnalysis.js` | Canvas resize before upload | `expo-image-manipulator` |
| `services/audio.js` | `<audio>` element + `speechSynthesis` fallback | `expo-av` (or `expo-video`/`expo-audio` on newer SDKs) for live-TTS playback, `expo-speech` for demo-mode fallback |
| `services/speechInput.js` | MediaRecorder → upload to `/api/transcribe`; Web Speech API live dictation | `expo-audio`'s `AudioRecorder` → same `/api/transcribe` endpoint (records `.m4a`, one of `api/transcribe.js`'s accepted mime types). Live dictation: **`expo-speech-recognition`**, not `@react-native-voice/voice` — see the swap note below. |
| `services/dataTransfer.js` **(new — was missing from original plan)** | Backup export: `Blob` + `URL.createObjectURL` + a synthetic `<a download>` click. Backup import: browser `File.text()` from an `<input type="file">`. Both are browser-only, no RN equivalent. | Export: `expo-file-system` (`writeAsStringAsync`) + `expo-sharing` (`shareAsync`) to hand the JSON off via the OS share sheet. Import: `expo-document-picker` to select the file, then `expo-file-system` to read it. |
| `services/audio.js` | `<audio>` element + `speechSynthesis` | `expo-audio`'s `createAudioPlayer` for live-TTS playback, `expo-speech` for the on-device fallback |
| `components/LessonPlayer.jsx`, `components/SmartImageSheet.jsx` | Native `<video>` elements playing back a URL (AI-generated opening clip, captured video) | `expo-video`'s `useVideoPlayer`/`VideoView` pointed at the same URL (a `data:`/base64 video payload is written to a local file first — `expo-video` plays `file://` URIs far more reliably than large inline `data:` URIs) — playback-only, no change to the underlying data flow |

**`@react-native-voice/voice` → `expo-speech-recognition`, swapped during implementation.** `npm install` flagged `@react-native-voice/voice` as deprecated, with its own maintainers pointing at `expo-speech-recognition` as the replacement. That package turned out to be a strictly better fit anyway: it ships `ExpoWebSpeechRecognition`, a drop-in implementation of the same `window.SpeechRecognition` interface the web app already used — so `services/speechInput.js`'s browser-dictation code path ported with almost no logic changes, not a rewrite.

**`expo-av` → `expo-audio` + `expo-video`, split during implementation.** `expo-av` is being phased out in favor of these two focused modules on current Expo SDKs; both were used instead everywhere the plan said "`expo-av`."

### Tier 2 — Full rewrite, same product logic

All of `components/` and `pages/` (22 files, ~2,770 lines) plus `styles/global.css`:
- Every `className`-based JSX tree becomes RN primitives (`View`, `Text`, `Pressable`, `ScrollView`, `Image`).
- **Decided:** styling uses **NativeWind** (keeps the existing Tailwind-like class-based authoring style instead of hand-rolling `StyleSheet` objects for ~2,770 lines of markup). Requires `nativewind` + `tailwindcss` as dependencies, a `tailwind.config.js` with `content` globs over `components/`, `pages/`, `App.jsx`, and the NativeWind Babel/Metro config.
- `react-router-dom` becomes React Navigation or `expo-router` (maps cleanly onto `AppShell.jsx` + `BottomNav.jsx`).

The logic inside each file (state, handlers, data shapes) carries over conceptually — this tier is high-volume but mechanical, not risky.

### Tier 3 — Hard spots requiring a design decision before estimation

**`pages/Camera.jsx` (283 lines) — DONE, ported to `react-native-vision-camera`.** Zoom, torch/flash, aspect-ratio crop, the mode strip (FOTO/VÍDEO/NOITE/RETRATO/MAIS + a DOCUMENTOS/PANORAMA/MACRO/PRO "mais modos" popover), the document-scanner multi-page session, and photo/video capture all ported. Notes on how this landed:
- **Real optical/hybrid zoom, not a CSS-scale fake.** The web version faked zoom by CSS-scaling the `<video>` preview, then cropped the capture canvas to match. Vision-camera's `zoom` prop drives real zoom on the device (clamped to `device.minZoom`/`maxZoom`), so `capturePhoto()` already returns a zoomed-in frame — only the aspect-ratio crop still needs `expo-image-manipulator` after capture.
- **Vision-camera 5.x turned out to be a different API than expected.** The installed version (5.2.3, the current actively-maintained major as of this migration) uses a hooks/output-composition architecture (`useCameraDevice`, `useCameraPermission`, `usePhotoOutput`, `useVideoOutput`, outputs passed into `<Camera outputs={[...]} />`) rather than the older imperative `camera.current.takePhoto()` API most public docs and v3/v4 describe. Read directly from the installed package's TypeScript source rather than assumed from general knowledge, since guessing wrong here would silently produce a broken Tier 3 screen.
- **No config plugin.** Unlike every other native module in this project, `react-native-vision-camera@5` ships no Expo config plugin — its permissions are declared manually in `app.json` (`ios.infoPlist.NSCameraUsageDescription` + `android.permissions: ["android.permission.CAMERA"]`), reusing the mic permission `expo-audio`'s plugin already sets up.
- **One dropped visual detail:** the web version's DOCUMENTOS mode applies a subtle canvas color filter (`grayscale(.08) contrast(1.16) brightness(1.04)`) to scanned pages. `expo-image-manipulator` doesn't support arbitrary color filters (only resize/crop/rotate/flip), and adding a shader/Skia dependency just for this felt out of proportion — so the filter is skipped. The actual document-scanning *behavior* (multi-page sessions, `collectionId`/`pageNumber` tracking, "Concluir" to end a session) is fully intact.
- **Real device build required to verify.** Everything here compiles cleanly through Metro (confirmed for both `android` and `ios` bundle targets), but `react-native-vision-camera` has a native (Kotlin/Swift) side that only gets exercised by an actual native build — this machine has no Android SDK / Xcode toolchain to run one. **This screen has not been run on a device or emulator.** Test it first once you have a dev client build.

**`services/videoExport.js` (150 lines) — RESOLVED, dropped from RN scope.** This file does client-side canvas-frame drawing + `MediaRecorder` capture to build a downloadable `.webm` slideshow of an entire lesson (title cards, slides, captions) — wired to the "Exportar vídeo (.webm)" button in `LessonPlayer.jsx`. There is no React Native equivalent for this combination.

**Decision made:** the RN app will not reconstruct video frame-by-frame at all. It only plays back media the backend already produced (the AI-generated opening clip via `api/video-lesson.js`, already server-side and already just a URL — see the Tier 1 `LessonPlayer.jsx` row above). Concretely:
- `services/videoExport.js` is **not ported**.
- The "Exportar vídeo (.webm)" download button/flow in `LessonPlayer.jsx` is **dropped** for the RN app — no full-lesson video export feature.
- If a "share the whole lesson as a video" feature is wanted later, it would need to be built as a new *server-side* ffmpeg render (matching the existing API pattern), not client-side reconstruction. Out of scope for this migration unless requested separately.

## Testing & distribution

### Will the app be testable in Expo Go?

**Only partially, and only for the first stretch of the work.** Expo Go is a precompiled app with a fixed set of bundled native modules (the official `expo-*` packages: `expo-av`, `expo-speech`, `expo-image-manipulator`, `expo-file-system`, `expo-sharing`, `expo-document-picker`, `expo-camera`, etc.). It cannot load *any* third-party native module that isn't already baked into that binary.

Two libraries this plan commits to are exactly that kind of third-party native module, **not supported by Expo Go**:
- `react-native-vision-camera` (Camera screen, Tier 3)
- `@react-native-voice/voice` (live dictation, Tier 1 — now decided, not deferred)

Once either is added as a dependency, `expo start` + scanning the QR code into Expo Go stops working for the whole app (Expo Go can't partially load a project). Practically:

- **Steps 1–2 of the migration order below** (project skeleton, data layer/storage) are Expo-Go-testable.
- **From the Tier 1 services step onward**, `@react-native-voice/voice` is already in the dependency tree, so Expo Go is no longer usable project-wide.

**Recommendation:** don't rely on Expo Go for this project beyond the very first skeleton step. Build a **custom dev client** early (`eas build --profile development` for cloud builds, or `npx expo run:android` / `npx expo run:ios` locally) right after step 1, and use that dev client for the rest of development — it behaves like Expo Go (fast refresh, no rebuild per JS change) but includes your custom native modules. This avoids hitting a wall mid-project and having to switch tooling.

### Will it be compilable and installed on an Android phone?

**Yes, with no paid account and no Play Store involvement.** Two options, both produce a real installable `.apk`:
- `npx expo run:android` locally — needs Android Studio/SDK installed, builds a debug APK, installs directly over USB/`adb`.
- `eas build --platform android --profile development` (or `preview`) — cloud build, no local Android toolchain needed; download the resulting `.apk` and sideload it (enable "install from unknown sources" once).

This holds regardless of which native modules are in the project — Android has no equivalent of Apple's device-provisioning restriction. The one-time $25 Play Store fee is only needed for public store distribution, not for installing on your own device.

### Do I need the Apple Developer account, or can I use a browser option instead?

**For real-device iOS testing, yes — there is no browser workaround.** This is enforced by Apple at the OS level via code signing, independent of Expo tooling:

- Any binary that runs on a **physical iPhone** — whether built locally with Xcode, via `eas build --profile development`, or distributed through TestFlight — must be signed with a certificate tied to an Apple Developer Program membership ($99/yr). There's no way around this for a real device.
- The **iOS Simulator** (Mac only) does *not* require a developer account and can run the app for free — but it's not a real device: no camera/mic hardware, so it can't meaningfully exercise `react-native-vision-camera` or `@react-native-voice/voice`, which are exactly the two hard/native-dependent parts of this app.
- Running `expo start --web` (React Native for Web) in a desktop browser also needs no developer account, but it's a logic/layout smoke test at best — camera and voice either don't work or fall back to unrelated browser APIs, so it doesn't validate the native modules either.

**Bottom line:** Android is the cheap, fast iteration loop (free, real device, full native module support). iOS real-device testing is gated on the $99/yr account from day one if you want to validate Camera or dictation on actual hardware — there's no way to defer that cost and still test those two features on a real iPhone.

## Recommended stack

- **Expo (managed workflow)** + **EAS Build** for signing/distribution (avoids requiring local Xcode for every build). A **custom dev client** (not Expo Go) is needed from early in development — see above.
- **`expo-router`** for navigation (closest conceptual match to the current file-based `pages/` + `react-router-dom` setup).
- **NativeWind** for styling (decided).
- **`react-native-vision-camera`** for the camera screen (5.2.3 — see the Tier 3 notes above on its API and lack of a config plugin).
- **`expo-speech-recognition`** for live dictation — not `@react-native-voice/voice`, which turned out to be deprecated; see the Tier 1 swap note above.
- **`expo-audio`, `expo-video`, `expo-speech`, `expo-image-manipulator`, `expo-file-system`, `expo-sharing`, `expo-document-picker`, `expo-image-picker`, `expo-clipboard`** for the Tier 1 swaps and Gallery's photo-import flow.
- **`react-native-mmkv`** for `storage.js`'s JSON key/value store (decided during implementation — see note below).
- Backend stays as-is (Vercel serverless functions) — no changes required to support a native client. No new backend work needed for video (the export-video feature is dropped, not moved server-side, per the Tier 3 decision above). The app calls it through `services/apiClient.js`'s `apiUrl()` helper, which prefixes every `/api/...` call with `EXPO_PUBLIC_API_BASE_URL` (set in the repo-root `.env`, gitignored — see `.env.example`; merged into the same file the backend and web app already used) — a relative `fetch('/api/...')` (what every web service used) has no origin to resolve against in RN.

**MMKV vs. AsyncStorage, decided:** the Tier 1 table originally listed "AsyncStorage/MMKV" as options. AsyncStorage's API is async, which would have forced `services/storage.js`'s `getNotes()`/`getPlan()`/etc. to become async — breaking `AppDataContext.jsx`'s synchronous `useState(() => getNotes())` initializers and requiring a real refactor, not just an implementation swap. MMKV's API is synchronous, like `localStorage`, so it preserves the exact function signatures and `AppDataContext.jsx` ports with zero logic changes. MMKV is a native module (not in Expo Go) — no new cost, since `@react-native-voice/voice` and `react-native-vision-camera` already require a dev client.

## Suggested migration order — all steps implemented 2026-09-09

1. ✅ **Expo project skeleton** — at the repo root (Expo SDK 57, `expo-router`, NativeWind, JS not TypeScript to match the rest of the repo). Tab navigator mirrors the 5 routes in `BottomNav.jsx` (Câmera/Galeria/Notas/Copilot/Perfil, with the ported `Icon.jsx` for tab icons) + `history` as a pushed screen, `+not-found` redirects to Câmera like the web catch-all route.
2. ⚠️ **Custom dev client** — `eas.json` is scaffolded (`development`/`preview`/`production` profiles, Android APK build type), and every dependency that needs it (vision-camera, speech-recognition, MMKV, ...) is installed. **Not built or run** — that needs your Expo account login, so run `eas build --profile development --platform android` yourself (or `npx expo run:android` locally once Android Studio/SDK is installed — this machine doesn't have `ANDROID_HOME` set up). Nothing in this app has been run on a device, emulator, or Expo Go — every check so far is a static Metro bundle compile (`expo-doctor` 21/21, clean bundles for `android`/`ios`/`web` platforms), not a runtime check.
3. ✅ **Data layer** — `context/AppDataContext.jsx` ported verbatim; `services/storage.js` rewritten on MMKV (JSON store) + `expo-file-system` (media files under `documentDirectory + 'jovi-media/'`, exported as `MEDIA_DIR`/`ensureMediaDirExists()` for reuse by the Camera screen's video recorder).
4. ✅ **Tier 1 services** — `imageAnalysis.js` (canvas resize → `expo-image-manipulator`), `audio.js` (`<audio>`+`speechSynthesis` → `expo-audio`+`expo-speech`, ported as a class matching the original `Narration` singleton), `speechInput.js` (→ `expo-audio` recording + `expo-speech-recognition`), `dataTransfer.js` (→ `expo-file-system`/`expo-sharing`/`expo-document-picker`). Plus the Tier 0 services that hadn't been copied yet (`videoLesson.js`, `youtubeRecommendations.js`, `search.js`) and a new `services/apiClient.js` — needed because the already-copied `subjectStudy.js` called `fetch('/api/subject-ai')` with a relative URL, which doesn't resolve in RN (see the stack notes above).
5. ✅ **Screens/components** — all 16 components + 6 pages ported (Icon → `react-native-svg`'s `SvgXml`, reusing the same path-data dictionary; `Copilot`'s embedded-in-Gallery usage pulled its UI into a shared `components/CopilotView.jsx` so both the tab route and Gallery's embedded tab render the same component, matching the web version's `<Copilot embedded />` reuse). One loose end carried over from step 3: sample note/record images still reference the web app's `/demo-assets/...` public-folder paths, which don't resolve to anything bundled in RN — real assets (or remote URLs) are needed before the seeded demo content shows real images.
6. ✅ **Camera screen** — see the Tier 3 section above for what shipped and what's simplified (dropped color filter) or unverified (no device build yet).

## Open decisions

- [x] Video export: dropped — playback-only (AI opening clip via existing backend job), no in-app frame construction, no full-lesson video export feature in the RN app.
- [x] Live on-device dictation: keep it — via `expo-speech-recognition`, not `@react-native-voice/voice` (deprecated; swapped during implementation, see Tier 1 notes above).
- [x] Styling approach: NativeWind.
- [x] Apple Developer account: required for any real-device iOS testing, no browser/simulator substitute for validating Camera/voice features — budget the $99/yr from the start if iOS hardware testing is in scope.
- [ ] Exact `expo-sharing`/`expo-document-picker` UX for backup export/import (e.g., share sheet copy, error states) — implemented with reasonable defaults (native `Alert.alert` confirm dialogs, standard share sheet), can be refined later.
- [ ] Bundle real demo-asset images (or point them at remote URLs) so the seeded sample notes/photos actually render instead of dead paths — needed before a first demo run looks right.
- [ ] DOCUMENTOS mode's subtle scan color filter (grayscale/contrast/brightness) — dropped, no RN equivalent without adding a shader/Skia dependency. Revisit only if the visual effect turns out to matter.

## What's left before this is a working app

Everything above is code-complete and passes static compilation (`expo-doctor`, Metro bundles for `android`/`ios`/`web`), but **none of it has run on a device, emulator, or Expo Go** — this environment has no Android SDK or Xcode. Before relying on this:
1. Set `EXPO_PUBLIC_API_BASE_URL` in the repo-root `.env` (see `.env.example`) pointing at a reachable backend.
2. Build and install a dev client (step 2 above).
3. Walk through each tab on a real device — data layer and simple screens first, then Camera (highest native-integration risk, per the Tier 3 notes).

---

*Generated from a scoping conversation with Claude Code on 2026-09-08, revised 2026-09-09 after auditing current repo state, resolving open decisions, and implementing the full migration.*
