# Production plan — `prod_app`

> Implementation details: see [`prod-implementation-spec.md`](prod-implementation-spec.md).

Goal: a signed Android APK that works **with demo mode off**. It must analyze photos, generate
podcasts and lessons, and integrate a real calendar. Its backend is deployed on Vercel. The backend
authenticates users, enforces per-user quotas, and rejects requests that don't come from a genuine
build of the app.

Scope: Android only (iOS isn't shipping), distributed as a **sideloaded APK** to a limited group of
users. The web app in `web/` doesn't ship. See [Decisions](#5-decisions-2026-09-24).

Baseline (commit `93c245b`): `npm test` shows 44/44 passing, and `npm run lint` shows 0 errors and
19 warnings.

---

## 1. Where the repo stands

### Backend (`api/`)

| Area | State | Blocks prod? |
|---|---|---|
| Handlers (`analyze-image`, `subject-ai`, `tts`, `transcribe`, `video-recommendations`, `auth/google`) | Vercel-style `handler(req,res)`, already shaped for serverless | No |
| AI providers (`api/_lib/ai/providers/`) | Only `azure-openai` and `minimax` are implemented. `openai`, `anthropic` and `gemini` are listed in `.env.example` but not registered | Partly: depends on which provider pays |
| Rate limits / quotas (`api/_lib/http.js`) | In-memory `Map`. On Vercel every instance has its own map, and it disappears on cold start, so **quotas don't work** | **Yes** |
| Static `x-api-key` (Phase 1) | Works, but the key sits in the APK bundle | No (keep it as a speed bump) |
| Session (`api/_lib/session.js`) | HMAC token after Google sign-in, 30-day TTL, no revocation | No |
| Play Integrity (`api/_lib/attestation.js`) | A stub that no handler calls | **Yes** (needed for the "unchanged APK" requirement) |
| Payload limits | Images up to 8 MB base64, audio up to 10 MB, and TTS returns every chunk as base64 in one JSON response. **Vercel caps request and response bodies at 4.5 MB** | **Yes** (podcast TTS and long voice clips will fail) |
| Timeouts | `subject-ai` allows 45 s and TTS runs chunks one after another. Vercel functions need a `maxDuration` setting | **Yes** |
| `Content-Type: application/json` check (415) | Only in `server/local-api.js`, so it's lost on Vercel | Minor |
| Deployment config | No `vercel.json`, no `.vercelignore`. The root `package.json` is the Expo app, so Vercel would install every RN dependency | **Yes** |
| Video recommendations | Builds YouTube *search URLs* only. There's no YouTube Data API | No (acceptable) |

### App (RN / Expo)

| Area | State | Blocks prod? |
|---|---|---|
| Demo flag | `services/env.js` **defaults to demo = true** when `EXPO_PUBLIC_JOVI_LENS_DEMO_MODE` is unset | **Yes** |
| Seeded sample data | Sample photos, notes and subject artifacts are merged in on every launch (`AppDataContext`), and "clear data" keeps them | **Yes** (a real user sees a fake student's notes) |
| Presentation overrides | `getPresentationExamResult` and `shared/studentDashboard.js` **replace a real "História" exam result with the demo baseline** when it scores lower. `SubjectExam` falls back to `DEMO_SUBJECT_ARTIFACTS` | **Yes**: this is a correctness bug in live mode |
| Profile | "Preparar demo" button, demo user `ana.beatriz@demo.jovi`, and demo Outlook connect | **Yes** |
| Copilot plan / trial | Local fake: `setPlan({type:'pro', demo:true})`, and no server knows about it | **Yes** (needs to become the real quota or BYOK state, or be removed) |
| Calendar | **Fully mocked.** `createDemoOutlookCalendar()` returns hard-coded events, with no OAuth and no API | **Yes** |
| "Smart notifications" | Cards computed inside the dashboard. There are no OS notifications | Depends on the decision below |
| Google sign-in (RN) | `expo-auth-session` implicit `id_token` flow, **never tested end to end**. Google generally rejects custom-scheme redirects for this flow. The reason for choosing it ("works in Expo Go") no longer applies, because the app already needs a dev build | **Yes** |
| TTS / STT | Live TTS falls back to on-device `expo-speech`. STT prefers on-device `expo-speech-recognition` | No, and this fallback is useful for the free tier (§4) |
| Release build | Signed with the **debug keystore**, `usesCleartextTraffic: true`, and a 139 MB universal APK | **Yes** (Play Integrity and Google sign-in both depend on the real signing certificate) |
| Local data | MMKV and filesystem only, with no cloud sync. Backup and restore exist | No (acceptable for this scope) |

---

## 2. Target architecture

```text
APK (release-signed, demo off)
  │  x-api-key            (speed bump, unchanged)
  │  Authorization: Bearer <session>        ← Google sign-in (native Credential Manager)
  │  x-play-integrity-token                  ← Play Integrity standard request, bound to request hash
  │  x-ai-key (optional, BYOK)               ← user's own provider key, from Android Keystore
  ▼
Vercel Functions (api/*)  ── withGuards(): method → content-type → api-key → session → integrity → quota
  │                           │
  │                           └─ Upstash Redis (Vercel Marketplace): credits, rate limits, idempotency
  ▼
AI provider: the server's own key (free tier, 3 credits) OR the user's key (BYOK, no server credits)
```

---

## 3. Work plan

### Phase A: Backend on Vercel (infrastructure correctness)

1. **Deployment layout.** Add `vercel.json` with framework "Other", no build step, `functions.api/**.js.maxDuration`
   (60 s for `subject-ai` and `tts`) and region `gru1` (São Paulo). Add a `.vercelignore` that
   excludes `app/`, `components/`, `web/`, `assets/` and `android/`. Keep `api/` + `shared/`, because
   the functions import `../shared`. Stop Vercel from installing the Expo dependency tree: either
   move the backend to `api/package.json` with its own (empty) dependencies, or set
   `installCommand: ""`. The backend has zero npm dependencies today, which makes this easy.
2. **One guard wrapper.** Add `api/_lib/guard.js` with `withGuards(handler, {scope, burst, cost})`.
   It replaces the copy-pasted 5-line preamble in every handler and brings back the 415 content-type
   check that only `local-api.js` does today. `server/local-api.js` keeps working unchanged.
3. **Durable store.** Replace the `rateBuckets` Map with Upstash Redis (`@upstash/redis`, HTTP-based
   and serverless-friendly). Burst limits use `INCR`+`EXPIRE`, and credits use an atomic Lua `DECR`
   that never goes below zero. Locally, keep the Map as a fallback when `UPSTASH_REDIS_REST_URL` is
   unset (the same "optional until configured" pattern).
4. **Client IP on Vercel.** `req.ip` is undefined there. Use `x-real-ip` / `x-vercel-forwarded-for`,
   which Vercel sets and clients can't spoof.
5. **Fit the 4.5 MB body limit.**
   - Image: the client already resizes to 1600 px JPEG q0.82 (about 300–700 KB base64). Lower
     `MAX_IMAGE_LENGTH` to 4 MB and return 413 with a clear message.
   - STT: cap audio at about 3 MB base64 (about 2–3 min of m4a), or skip it entirely for free users
     (see §4).
   - **TTS: change `/api/tts` to one chunk per call.** The client already iterates over segments in
     `Narration`, so it requests chunk *i* and plays it while fetching *i+1*. That keeps every
     response under about 1 MB and every call short. (Alternative: upload to Vercel Blob and return
     URLs. That's more moving parts and not needed.)
6. **Providers.** Add `api/_lib/ai/providers/gemini.js` (chat, vision, TTS, STT). It's the
   **server-paid provider for free credits** (`AI_PROVIDER=gemini`). Also add
   `api/_lib/ai/providers/openai.js` (chat, vision, TTS, STT), which is needed for BYOK (D2).
   MiniMax already exists (chat, vision, TTS; no STT). Register both new adapters in
   `providers/index.js`, and cover every adapter with tests against recorded fixtures.
7. **Secrets in Vercel env.** `JOVI_API_KEY`, `JOVI_SESSION_SECRET`, `GOOGLE_CLIENT_ID`, the provider
   keys, the Upstash values, `PLAY_INTEGRITY_*`, and a service-account JSON. Separate Preview and
   Production environments.
8. **Observability.** Structured `console.error` already exists. Add a request id and the user
   `sub` hash to the logs, and write a short runbook in the README (rotate keys, reset a user's
   credits).

### Phase B: Identity, quota and "genuine APK" check

1. **Native Google sign-in.** Replace `expo-auth-session` with `@react-native-google-signin/google-signin`
   (Credential Manager, config plugin). Register an **Android OAuth client** with the release
   keystore's SHA-1, and request the id_token for the *web* client id, which becomes the `aud` the
   server checks. Keep `api/auth/google.js` as it is, since it already accepts a list of client ids.
   Optional: switch from `tokeninfo` to local JWKS verification (fewer outbound calls).
2. **Sign-in becomes mandatory for any live AI call.** Without it there's no durable identity, and
   "3 lifetime requests" is meaningless: IP changes, and a reinstall resets any device id. Logged-out
   users can still browse and capture, and see a "sign in to analyze" prompt.
3. **Credits** (see §4 for the rules). Store `credits:<sub>` in Redis and initialize it to 3 on
   first sign-in with `SETNX`, so signing out and back in doesn't refill it. Charge **only after the
   provider call succeeds**. Use an `Idempotency-Key` header so a retry after a network failure
   isn't charged twice. Expose `GET /api/me` → `{ credits, byok: bool }` for the UI.
4. **Play Integrity, adapted to a sideloaded APK (D4).**
   - An app outside Google Play still uses Play Integrity through a **Google Cloud project**: enable
     the API and pass the Cloud project number from the client. Before building on this, **verify**
     in the current Play Integrity docs whether a Play Console app entry is still required for
     off-Play apps and which request type (classic or standard) they support.
   - Because the app isn't installed from Play, `appRecognitionVerdict` will be
     `UNRECOGNIZED_VERSION`, so it **can't be used**. The "unchanged APK" check therefore rests on:
     `packageName == com.jovilens.app` **and** `certificateSha256Digest == <our release cert>` (a
     re-signed or modified APK has a different cert), plus `deviceRecognitionVerdict ⊇
     MEETS_DEVICE_INTEGRITY` and a matching `requestHash`/nonce (so tokens can't be replayed).
   - Client: a small Expo module (Kotlin) around the Integrity API, or a maintained community module
     if one is current. Send the token per AI call, bound to
     `sha256(method+path+bodyHash+timestamp)`.
   - Server: implement `verifyAttestation()` with `playintegrity.googleapis.com/v1/{package}:decodeIntegrityToken`
     using a service account, and cache the Google access token.
   - Fallback if off-Play integrity turns out to be unavailable or too limited: Android **Key
     Attestation** (the hardware-backed certificate chain includes the app's signing-cert digest).
     It works without Google Play but is more code to verify on the server.
   - Enforce it on AI routes behind `JOVI_REQUIRE_INTEGRITY=true`, so Preview and local dev can run
     without it.
   - Be clear about what this does and doesn't guarantee: it stops modified or re-signed APKs,
     emulators and scripts that replay tokens. It doesn't stop someone farming Google accounts to get
     3 credits each. That's acceptable at this scale, and a daily sign-up cap per IP limits it.

### Phase C: The app without demo mode

1. **Flip the default.** `isDemoMode()` becomes `=== 'true'` (default **false**). Add an EAS
   `production` profile env with `EXPO_PUBLIC_JOVI_LENS_DEMO_MODE=false`,
   `EXPO_PUBLIC_API_BASE_URL=https://<vercel-domain>`, and the web client id.
2. **Put all presentation content behind one flag.** Add `EXPO_PUBLIC_JOVI_PRESENTATION=true` and
   gate the following on it:
   - seeded `samples` / `sampleNotes` / `mergeDemoSubjectArtifacts` in `AppDataContext`
   - `getPresentationExamResult` and the História baseline override in `shared/studentDashboard.js`
     (**remove the override from the live path**: real scores must never be replaced)
   - the `DEMO_SUBJECT_ARTIFACTS` fallback in `SubjectExam`
   - "Preparar demo", the demo user, and "Conectar Outlook (demo)" in `profile.jsx`
   - the `CopilotView` fake trial and pro buttons

   A prod build then starts with an empty gallery and an onboarding state, and every section needs
   an empty state (check each tab).
3. **Replace the fake Copilot plan.** Show the real state from `/api/me`: "N free analyses left" or
   "Using your own provider". The plan object in MMKV stops being a source of truth.
4. **Error UX.** Map the new server codes (`SIGN_IN_REQUIRED`, `CREDITS_EXHAUSTED`,
   `INTEGRITY_FAILED`, `BYOK_INVALID`, 413) to specific messages and actions, such as opening the
   profile to sign in or to add a key. Today most errors say "ative o modo demonstração", which a
   production user can't do.
5. **Podcast and lesson flow in live mode.** Test the full path: `podcast-script` → TTS per chunk
   (Phase A5) → playback, then the "drive" interactive podcast (voice answer → STT). Check it works
   in the background and with the screen off (expo-audio background mode), and add "save/share
   audio" if it's wanted.
6. **Network hardening.** `usesCleartextTraffic: false`. Add a timeout and `AbortController` on
   every `apiFetch`, plus one retry on 5xx or network errors that sends the same idempotency key.
7. **Lint.** Clear the 19 warnings (mostly `react-hooks/set-state-in-effect`), then add `npm run
   check` to a CI workflow.

### Phase D: Calendar (and notifications)

1. **Google Calendar of the signed-in account (D5), read-only and never written (Q2).**
   - **Approach: read the Android device calendar with `expo-calendar`, filtered to the Google
     account the user signed in with.**
     - The phone's Google Calendar sync already puts that account's calendars in the Android
       calendar provider.
     - Each calendar carries its `source`/account name (the Gmail address), so the app shows only
       calendars whose account equals the signed-in user's email.
     - If that account isn't on the phone, or calendar sync is off, the app says so and explains
       how to add it.
   - **Why not the Google Calendar API with OAuth:** every Calendar scope, including
     `calendar.events.readonly`, is a Google *sensitive* scope. An unverified app is then either:
     - capped at 100 listed test users whose consent expires every 7 days (Testing mode); or
     - open to anyone, but shows a "Google hasn't verified this app" warning and has a 100-user cap,
       unless it goes through Google's verification (a verified domain, privacy policy and demo
       video, taking days to weeks).

     The device-calendar route has none of this, so **sign-in keeps only the basic scopes
     (openid/email/profile). Those need no verification, and anyone with the APK can sign in with
     any Gmail account.**
   - **Read-only is enforced by the OS, not just by our code.** Request only `READ_CALENDAR`, and
     block `WRITE_CALENDAR` in `app.json` (`android.blockedPermissions`), because the `expo-calendar`
     config plugin adds both by default. Even a bug can't write to the calendar, since the app
     simply doesn't hold the permission. Add a test or lint rule that fails if any `expo-calendar`
     write API (`createEventAsync`, `updateEventAsync`, `deleteEventAsync`, `createCalendarAsync`,
     ...) appears in the code.
   - **Sync.** On foreground and on pull-to-refresh, read events from now to +60 days from the
     selected calendars of that account. Tag exams with a heuristic ("prova/avaliação/teste/simulado"
     + subject name match), let the user confirm or correct in the UI, then run
     `normalizeStudyCalendar` → `studyCalendar` state. Only the minimal fields (title, date, subject,
     topics) are sent to the AI, as `subject-ai.js` already does.
   - **Limitation:** freshness depends on the phone's own Google sync (normally minutes). If the
     user signs in to the app with a Gmail account that isn't on the phone, the calendar can't be
     read. In that case the app explains how to add the account in Android settings.
   - Replace `provider: 'outlook'` in `subject-ai.js`, `service.js` and `shared/studyCalendar.js` with
     `'google'`. The fake Outlook data stays in the presentation build only.
2. **Real phone notifications (D6).** Use `expo-notifications` **local** scheduled notifications,
     driven by `buildSmartNotifications()` and the calendar: review reminders 3 days and 1 day before
     an exam, a study-session reminder, and a streak nudge. Re-schedule after every calendar sync and
     plan change, and cancel stale ones. This needs no server or FCM. Requirements: the Android 13+
     `POST_NOTIFICATIONS` permission (ask in context, not at launch), a notification channel, and
     tap-to-open deep links (`jovilens://subject/...`). Optional: `expo-background-task` to re-sync
     the calendar and re-schedule roughly daily while the app is closed.

### Phase E: Release and distribution

1. **Release keystore.** Generate it and store it in EAS credentials, not in the repo (`.gitignore`
   already excludes `*.jks`). Its SHA-1 and SHA-256 go to the Google OAuth Android client and the
   Play Integrity certificate check. **With sideloading, this key is the app's identity forever**:
   losing it means users must uninstall and reinstall, so keep an offline backup.
2. **EAS profiles.**
   - `production`: `buildType: apk`, demo off, presentation off, production API URL.
   - `presentation` (D8): the same backend, but with `EXPO_PUBLIC_JOVI_PRESENTATION=true` and a
     different `applicationId` suffix (`com.jovilens.app.demo`) so both can be installed side by
     side. It uses its own OAuth client and cert entry.
   - Build per-ABI APKs (`arm64-v8a` covers practically all current phones) to cut the 139 MB size.
   - Distribute with a download link or page. Every update must be signed with the same key, and
     `versionCode` has to increase.
3. **Privacy policy page.** Play doesn't require it for sideloading, but it's good practice, and
   Google's OAuth consent screen asks for a link. It covers:
   - images and audio sent to AI providers, and that Gemini's free tier may use data to improve its
     models;
   - the Google account email used for quota;
   - read-only access to the calendar of the signed-in Google account (events are never written or uploaded, apart from the minimal fields used in AI prompts);
   - how BYOK keys are handled (§4.2).

   It could be hosted on the same Vercel project.
4. **End-to-end smoke test on a physical device against the production URL.** Sign in → analyze a
   photo → follow-up question → podcast → lesson → exam → calendar import → run out of credits →
   add BYOK key → keep going. Then confirm a re-signed APK is rejected with `INTEGRITY_FAILED`.

---

## 4. Signing in with your own AI provider account, and the 3-request free tier

### 4.1 Can users "log in with their AI provider account" and use their own limits?

**Mostly not, the way it's phrased.** Consumer AI subscriptions don't grant API access to third-party
apps:

| Provider | "Login with account → use my quota" | What does work |
|---|---|---|
| OpenAI (ChatGPT Plus) | No. The subscription doesn't include API access, and there's no third-party OAuth for it | The user pastes an API key (paid, separate billing) |
| Anthropic (Claude Pro/Max) | No. Third-party apps can't use claude.ai subscriptions | The user pastes an API key |
| Google Gemini | Partly. OAuth with a user's Cloud project exists, but setup is heavy for a student | **The user pastes a free AI Studio API key.** No card is needed, and one key covers chat, vision, TTS and STT |
| OpenRouter | **Yes.** It has a real OAuth PKCE flow that returns a user-scoped key billed to the user's OpenRouter credits | Chat and vision only. TTS and STT would fall back to on-device |

**Decided (D2): users bring their own key (BYOK) for Gemini, OpenAI or MiniMax.**

| BYOK provider | Chat / vision | TTS | STT | Notes |
|---|---|---|---|---|
| Gemini | ✅ | ✅ | ✅ | Free AI Studio key, and the adapter is shared with the server-paid tier |
| OpenAI | ✅ | ✅ | ✅ | Paid key. Needs the new `openai.js` adapter |
| MiniMax | ✅ | ✅ | ❌ | STT falls back to on-device `expo-speech-recognition` |

- **Profile → "Sua chave de IA":** pick a provider, paste the key, and tap "Validar" (one cheap
  provider call: a model list or a 1-token completion). The screen then shows the provider name and
  a masked key (`sk-…a1b2`), with buttons to replace or remove it.
- **Routing:** the key is sent per request in `x-ai-key` plus `x-ai-provider`. The server builds the
  provider client for that request only. `getProvider()` currently reads credentials only from
  `process.env`, so it's refactored to `getProvider(capability, { credentials })`, and the adapters
  accept injected config instead of calling `readConfig()` from env.
- BYOK requests skip the credit check but **still go through the session and integrity checks and
  burst limits**, so the backend can't be used as a free anonymous proxy.
- If the provider rejects the key (401/403), the server returns `BYOK_INVALID`. The app then shows
  "your key was rejected" and **doesn't** silently fall back to spending free credits.

### 4.2 How the user's API key is kept from leaking

"Never leaks" can't be literally guaranteed. A rooted phone with malware, or a user who hands the key
to someone else, is outside any app's control. What the app *can* guarantee is that **the key only
ever exists in three places: encrypted on the device, in transit over TLS, and in server memory for
one request.** It's never written to disk, a log, a database or a backup that we control. Each place
has its own controls:

**On the device (at rest)**
- The key is stored only in `expo-secure-store`, which encrypts it with a key held in the **Android
  Keystore**. The encryption key can't be exported, even by the app. It's never stored in MMKV,
  React state that gets persisted, or `createBackup()`/`downloadBackup()`.
- It's stored under the signed-in Google `sub` (`byok:<sub>`), so another account signed in on the
  same phone can't use it. Signing out doesn't delete it, but "Remover chave" and "Apagar dados" do.
- Set `android:allowBackup="false"` via a config plugin. Expo's default is `true`, which would let
  Android cloud backup or `adb backup` copy app storage.
- The key is shown masked in the UI and never pre-filled into a visible text field after saving. Mark
  the input `secureTextEntry` and disable autocorrect and suggestions, so the keyboard doesn't learn
  it.

**In transit**
- HTTPS only: `usesCleartextTraffic: false` (Phase C6), and `EXPO_PUBLIC_API_BASE_URL` must be
  `https://`.
- `apiFetch` attaches `x-ai-key` **only on AI routes** (`/api/analyze-image`, `subject-ai`, `tts`,
  `transcribe`, `video-recommendations`), never on `/api/auth/google` or `/api/me`.
- The integrity token plus the release cert check (Phase B4) mean a **modified APK** can't talk to
  the backend. That's the main way someone would try to redirect keys to their own server.
- Certificate pinning isn't planned: Vercel rotates certificates, and a pin mismatch would brick the
  sideloaded app until the next update.

**On the server (Vercel)**
- The key is read from the header into a local variable and passed only into the outgoing provider
  request. It's never logged, never stored in Redis, and never part of a cache key or idempotency
  record.
- `withGuards` deletes `x-ai-key` from `req.headers` right after reading it, so any later
  `console.error(req…)` can't include it. A test asserts that no log line contains the key, with a
  fake key injected through every handler, including the error paths.
- Provider error bodies are never forwarded to the client or logs (today's handlers already log only
  `code` and `status`). Some providers echo part of the key in 401 messages.
- Vercel runtime logs capture only what the code prints, and request logs don't record headers.
  Never add an APM or error tracker (e.g. Sentry) without header scrubbing.
- The backend stays **dependency-free** on the request path, as it is today, apart from
  `@upstash/redis`. Fewer third-party packages means fewer supply-chain routes to the key. Lock the
  versions in `package-lock.json`.
- The Vercel project has only the team members who need it, and deploys only from `main`.

**Limiting damage if a key does leak** (the guidance shown next to the key field in the app)
- Gemini: a free-tier key with no billing attached can only burn free quota, never money.
- OpenAI: create a **project key** for JOVI Lens only, with a monthly budget limit on that project.
- MiniMax: use a dedicated key and keep a low balance.
- In all cases the key can be revoked in the provider's console at any time, and the app's
  "Remover chave" deletes the local copy.

**The trade-off to keep in mind:** with this design the key passes through our server, so users
have to trust our backend. The alternative is calling the providers **directly from the phone**. The
key would then never touch our server, but the prompts and normalization in `api/_lib/ai/` would
have to be ported to run in the app, and MiniMax and OpenAI audio would need RN-specific code. Given
the scope, the proxy with the controls above is the recommendation. Direct calls remain possible
later, because `shared/` already exists for code both sides use.

### 4.3 Is a 3-request lifetime limit viable?

Yes. It depends on three things:

1. **Identity has to be a Google account** (Phase B2) stored in Redis with `SETNX`. Anything
   device-based or IP-based resets trivially.
2. **Define what "one request" means.** A podcast is 1 script call plus N TTS calls, and a photo is
   1 analysis plus follow-ups. Counting HTTP calls would use up 3 credits inside a single podcast.
   Proposed rule: **1 credit = 1 generation the user starts** (analyze a photo, ask a follow-up,
   generate podcast / lesson / exam / plan / video recommendations).
3. **Free users use on-device TTS and STT** (`expo-speech` / `expo-speech-recognition`, which already
   exist as fallbacks). The server-paid tier then only ever pays for text and vision tokens, and
   `/api/tts` and `/api/transcribe` never need to be metered or bound to a script. Live neural voices
   become a BYOK perk.

Cost ceiling: 3 credits × about 2–4k tokens of text or vision per user is well under US$0.01 per user
on a mini-class model. Without Play Integrity the risk is scripted abuse. With it, the risk drops to
people farming Google accounts, and a per-IP daily sign-up cap limits that.

---

## 5. Decisions (2026-09-24)

| # | Decision |
|---|---|
| D1 | The server-paid free tier uses **Gemini**. Add the `gemini.js` adapter |
| D2 | BYOK providers: **Gemini, OpenAI, MiniMax**. Add `openai.js`. MiniMax already exists (it has no STT, which falls back to on-device) |
| D3 | **Sign-in is mandatory** for any live AI call |
| D4 | **Limited sideloaded APK** distribution, with no Play Store for now. The integrity check relies on the signing cert and package name, not Play recognition (Phase B4) |
| D5 | **Google Calendar of the signed-in account**, read through the device calendar provider, filtered to that account (Phase D1) |
| D6 | **Real phone notifications**, exam reminders only (3 days and 1 day before, 19:00), local via `expo-notifications` |
| D7 | **The web app doesn't ship** |
| D8 | **A separate presentation build** (EAS profile `presentation`, separate applicationId) |
| D9 | Copilot trial and pro become **credits + own-key status** (Phase C3) |

### Follow-up answers (2026-09-24)

| # | Answer |
|---|---|
| Q1 | **3 credits for life** per Google account (Redis `SETNX`, never refilled) |
| Q2 | **Read-only calendar. The app must never write to it.** This is enforced by holding only `READ_CALENDAR` (Phase D1) |
| Q4 | Credits: every AI generation costs 1. TTS/STT are own-key only. Web keeps working locally through a dev bypass. No backward compatibility with v1.0.4 installs |
| Q3 | **No tester list.** Anyone with the APK can sign in with any Gmail account. Possible because sign-in uses only the basic scopes and the calendar is read on the device, with no OAuth scope (Phase D1) |

---

## 6. Suggested order

1. Phase A (the backend deploys and works on Vercel with the durable store and fixed body sizes, the
   Gemini adapter and the OpenAI adapter) and Phase C1–C2 (demo defaults off, presentation content
   gated, EAS profiles), in parallel.
2. Phase E1 (release keystore). Everything Google-related depends on its SHA-1 and SHA-256.
3. Phase B1–B3 (native sign-in + credits) → C3–C4 (the credits and own-key UI, real errors).
4. BYOK (§4) with the key protections in §4.2.
5. Phase D (Google Calendar, notifications).
6. Phase B4 (integrity) → E2–E4 (release builds, privacy page, end-to-end test on a device).
