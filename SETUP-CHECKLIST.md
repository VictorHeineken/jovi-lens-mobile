# Production setup checklist — `prod_app`

The code for every milestone in [`prod-implementation-spec.md`](prod-implementation-spec.md) is done.
This file lists everything that still has to be **configured by a person with account access** before
the production APK works, in the order to do it. Section numbers (§) and step ids (H1–H9) refer to
the spec.

Legend: **→** marks a value you must write down and reuse in a later step.

---

## 1. Release keystore (H1, H1b, H1c)

- [ ] `eas login` (Expo account).
- [ ] `eas credentials -p android` → **Set up a new keystore** (or upload an existing one).
- [ ] Download it and keep an **offline backup**. Losing it means testers must uninstall to update.
- [ ] Get the release fingerprints (from `eas credentials`, or `keytool -list -v -keystore <file> -alias <alias>`):
  - **→ `RELEASE_SHA1`** (hex)
  - **→ `RELEASE_SHA256`** (hex)
- [ ] Convert SHA-256 to base64url:
  ```bash
  echo <RELEASE_SHA256_WITHOUT_COLONS> | xxd -r -p | base64 | tr '+/' '-_' | tr -d '='
  ```
  **→ `PLAY_INTEGRITY_CERT_SHA256`**
- [ ] Debug keystore SHA-1, for dev builds:
  ```bash
  keytool -list -v -keystore ~/.android/debug.keystore -storepass android -alias androiddebugkey
  ```
  (For EAS dev builds, take it from `eas credentials` for the development profile.)
  **→ `DEBUG_SHA1`**

## 2. Google Cloud project (H2–H5)

- [ ] Create the project **`jovi-lens`**. From *Project info*: **→ `PLAY_INTEGRITY_PROJECT_NUMBER`**.
- [ ] **OAuth consent screen (H3):**
  - User type **External**, publishing status **In production**
  - Scopes: only `openid`, `email`, `profile` (no verification needed)
  - App name "JOVI Lens", support email
  - Privacy URL `https://<VERCEL_DOMAIN>/privacy.html` (fill in after §4; the page ships with the backend)
- [ ] **OAuth clients (H4)**, under *Credentials*:
  - [ ] **Web application**, no redirect URIs → **`GOOGLE_WEB_CLIENT_ID`**
  - [ ] **Android**, package `com.jovilens.app`, SHA-1 = `RELEASE_SHA1`
  - [ ] **Android**, package `com.jovilens.app`, SHA-1 = `DEBUG_SHA1`
- [ ] **Play Integrity (H5):**
  - [ ] Enable the **Play Integrity API** in the project.
  - [ ] Create service account **`integrity-verifier`** (no project role needed) → *Keys* → add a JSON key.
  - [ ] Base64 it: `base64 -i key.json | tr -d '\n'` → **`PLAY_INTEGRITY_SA_JSON_B64`**
  - [ ] Delete the local `key.json` once it's stored in Vercel.

## 3. Gemini server key (H6)

- [ ] Create an API key in **Google AI Studio** (free tier) → **`GEMINI_API_KEY`**.
  Free-tier content may be used by Google to improve its products; the privacy page already says so.

## 4. Vercel + Upstash (H7)

- [ ] Import the GitHub repo into Vercel:
  - Root directory: repo root
  - Framework preset: **Other**
  - Node.js **22.x**
  - Production branch **`main`**
- [ ] Marketplace → **Upstash Redis**, region **São Paulo (`sa-east-1`)**, connected to the project.
  This injects `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or the `UPSTASH_*` pair).
- [ ] Deployment Protection **on for Preview only**. Production must stay public; the app can't call
  protected Preview URLs, so every device test runs against Production.
- [ ] Note the production domain → **`VERCEL_DOMAIN`**.

## 5. Secrets (H8)

- [ ] `openssl rand -hex 32` → **`JOVI_API_KEY`**
- [ ] `openssl rand -hex 32` → **`JOVI_SESSION_SECRET`**

## 6. Vercel environment variables (Production)

If any **required** variable is missing, every route answers `503 SERVER_MISCONFIGURED` and the
function log lists the missing names.

| Variable | Value | Required |
|---|---|---|
| `AI_PROVIDER` | `gemini` | yes |
| `GEMINI_API_KEY` | from §3 | yes |
| `GOOGLE_CLIENT_ID` | `GOOGLE_WEB_CLIENT_ID` | yes |
| `JOVI_SESSION_SECRET` | from §5 | yes |
| `JOVI_API_KEY` | from §5 | yes |
| `JOVI_REQUIRE_INTEGRITY` | `true` | yes |
| `PLAY_INTEGRITY_PROJECT_NUMBER` | from §2 | yes |
| `PLAY_INTEGRITY_CERT_SHA256` | from §1 (comma list allowed) | yes |
| `PLAY_INTEGRITY_SA_JSON_B64` | from §2 | yes |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | injected by Upstash | yes |
| `JOVI_LENS_DEMO_MODE` | `false` (or unset) | — |
| `JOVI_LOCAL_DEV_BYPASS` | **must not be set** (ignored on Vercel anyway) | — |

Optional, with defaults already in code: `GEMINI_CHAT_MODEL`, `GEMINI_TTS_MODEL`, `GEMINI_STT_MODEL`,
`GEMINI_VOICE_*`, `OPENAI_*_MODEL`, `OPENAI_VOICE_*`, `MINIMAX_*`, `PLAY_INTEGRITY_PACKAGE`,
`JOVI_FREE_CREDITS` (3), `JOVI_SIGNUP_LIMIT_PER_IP_DAY` (25).

- [ ] Merge `prod_app` into `main` (or deploy the branch to Production) so the backend is live.
- [ ] **Check (M1):**
  ```bash
  curl -s https://<VERCEL_DOMAIN>/api/me -H "x-api-key: <JOVI_API_KEY>"
  # → {"code":"SIGN_IN_REQUIRED",...}
  ```
  and open `https://<VERCEL_DOMAIN>/privacy.html`.
- [ ] Go back to the OAuth consent screen (§2) and set the privacy URL.

## 7. EAS project and build config (H9)

- [ ] `eas init`, which writes `extra.eas.projectId` into `app.json`. **Commit it.**
- [ ] Store the API key as a sensitive EAS env var:
  ```bash
  eas env:create --environment production --name EXPO_PUBLIC_JOVI_API_KEY --value <JOVI_API_KEY> --visibility sensitive
  ```
- [ ] Replace the placeholders in **`eas.json`** and commit:

  | Placeholder | Profiles | Value |
  |---|---|---|
  | `https://<VERCEL_DOMAIN>` | production | `https://` + your Vercel domain |
  | `<GOOGLE_WEB_CLIENT_ID>` | development, production | from §2 |
  | `<PLAY_INTEGRITY_PROJECT_NUMBER>` | development, production | from §2 |

## 8. Local `.env` (development builds and the web app)

- [ ] Rename `EXPO_PUBLIC_GOOGLE_CLIENT_ID` → **`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`** (Web client ID).
- [ ] `GOOGLE_CLIENT_ID` = the Web client ID.
- [ ] Add `EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER`.
- [ ] AI provider: `AI_PROVIDER=gemini` + `GEMINI_API_KEY`. `minimax` with your existing key also works for local testing.
- [ ] **Phone dev build:** `JOVI_REQUIRE_INTEGRITY=false`, no `JOVI_LOCAL_DEV_BYPASS`.
- [ ] **Web app (`cd web && npm run dev`):** `JOVI_LOCAL_DEV_BYPASS=true` and `VITE_JOVI_LENS_DEMO_MODE=false`.
  Don't run the bypass and the phone test from the same server.

## 9. Live verification

- [ ] **M3 Gemini smoke test** (needs `GEMINI_API_KEY` in `.env`):
  ```bash
  node --env-file=.env scripts/smoke-ai.js
  ```
  All 4 steps must pass, TTS mime must be `audio/mpeg`, and the 2000-char TTS base64 must be < 4,000,000.
  If a step fails, apply only the matching fallback from spec §5.9 (*Contingencies (Gemini)*):
  drop `thinking_level`, drop `store`, switch TTS to WAV (and set `TTS_CHUNK_CHARS` to 800), or use
  `GEMINI_CHAT_MODEL=gemini-3.1-flash-lite`.
- [ ] **First native build.** The Kotlin in `modules/jovi-native` has never been compiled; start with
  `eas build --profile presentation --platform android` and fix any compile errors.
- [ ] **M5 (dev build, local server, integrity off):** sign in → credits 3 → analyze → 2 → … → 402 →
  "Adicionar minha chave" → save a Gemini key → analyze works with no credit change. TTS uses live
  voices with a key and the device voice without one.
- [ ] **M6 (release-signed APK from EAS, against Production, `JOVI_REQUIRE_INTEGRITY=true`):** calls
  succeed. Re-sign the same APK with another key (`apksigner sign --ks other.jks`): every AI call
  must return `INTEGRITY_FAILED`.
  If standard requests fail for the sideloaded APK, the §6.10 contingency (classic requests with a
  nonce route) is the one fallback that needs **new code**.
- [ ] **M7 (device with a Google account and an event "Prova de História" in 4 days):** connect
  the calendar → the event appears under História → enable reminders → 2 notifications scheduled →
  tapping one opens the História studio. Also check the manifest:
  ```bash
  adb shell dumpsys package com.jovilens.app | grep WRITE_CALENDAR   # must not be granted or requested
  ```

## 10. Release (M8)

- [ ] `eas build --profile production --platform android`
- [ ] `eas build --profile presentation --platform android`
- [ ] Testers uninstall v1.0.4 first (`adb uninstall com.jovilens.app`); there is no data migration.
- [ ] Run the full device QA script in spec **§13** on a physical phone with a fresh install.
- [ ] When the QA passes, tag that commit: `git tag v1.1.0 && git push origin v1.1.0`.

## 11. Before real distribution

- [ ] Replace the placeholder contact **`contato@exemplo.com`** in `public/privacy.html` (the only
  placeholder left in the project, by decision).

## Runbook (after launch)

- Reset a tester's credits: Upstash console → `SET credits:<sub> 3`.
- Rotate `JOVI_API_KEY`: new value in Vercel **and** EAS env, then ship a new app build.
- Rotate `JOVI_SESSION_SECRET`: update Vercel; everyone signs back in silently.
- Test a risky change: set `JOVI_REQUIRE_INTEGRITY=false` in Production temporarily. Never use Preview.
