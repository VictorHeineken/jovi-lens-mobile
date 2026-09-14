# Backend auth plan

Context: `server/local-api.js` (local dev) and each `api/*.js` handler (Vercel-style
`export default function handler(req, res)`, one function per file, no shared
router in production) sit in front of paid AI providers (Azure OpenAI /
MiniMax / etc., see `api/_lib/ai/`). Right now the only gate is IP-keyed rate
limiting (`isRateLimited` / `isDailyLimited` in `api/_lib/http.js`), applied
per handler:

| Handler | Burst scope/max | Daily scope/max |
|---|---|---|
| `api/analyze-image.js` | `analyze` / 12 per min | `analyze` / 100 per day |
| `api/subject-ai.js` | `subject` / 10 per min | `subject` / 40 per day |
| `api/tts.js` | `tts` / 60 per min | `tts` / 200 per day |
| `api/transcribe.js` | `stt` / 20 per min | `stt` / 80 per day |
| `api/video-lesson.js` (POST) | `video` / 6 per min | `video` / 2 per day |
| `api/video-lesson.js` (GET poll) | `video-poll` / 60 per min | `video-poll` / 300 per day |
| `api/youtube-recommendations.js` | `youtube` / 6 per min | `youtube` / 20 per day |
| `api/auth/google.js` | `auth` / 10 per min | `auth` / 60 per day |

`rateBuckets` is an in-process `Map`, so it resets on restart and doesn't
share state across instances — acceptable for the current single-process
local/LAN deployment, called out explicitly as a prototype limit in
`api/_lib/http.js`.

Clients: the RN app builds every request URL through `apiUrl()`
(`services/apiClient.js`), prefixing `EXPO_PUBLIC_API_BASE_URL` (LAN IP in
dev, per `.env.example`). The web app calls relative `/api/...` paths
directly (same-origin, proxied to `127.0.0.1:8787` by `web/vite.config.js` in
dev). Neither has a wrapper that injects headers today — every service file
builds its own `fetch(...)` call.

Threat model driving this: someone else on the same Wi-Fi/LAN (during a demo,
at home, in a classroom) hitting the discovered LAN IP/port and spending the
paid provider quota, whether by accident or casual poking. This is **not**
meant to stop a motivated attacker who decompiles the app or reads the web
bundle — Phase 2 addresses that.

---

## Phase 1 — static shared-secret gate (now)

Goal: one static `x-api-key` header, checked server-side, required on every
request that can cost money or hit a rate-limited third party. Cheap,
immediate, and shaped so Phase 2 replaces it without touching every call
site again.

### 1. Server: `api/_lib/http.js`

Add:

```js
import { timingSafeEqual } from 'node:crypto';

export function hasValidApiKey(req) {
  const expected = process.env.JOVI_API_KEY;
  if (!expected) return true; // unset = feature opt-in, same pattern as GOOGLE_CLIENT_ID
  const provided = String(req.headers['x-api-key'] || '');
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

- Fails **open** when `JOVI_API_KEY` is unset, mirroring how `GOOGLE_CLIENT_ID`
  unset makes `/api/auth/google` respond 503 instead of crashing everyone's
  local setup — contributors who haven't opted in aren't broken.
- `timingSafeEqual` requires equal-length buffers, hence the length check
  first (mismatched length must not throw).
- Wrong keys still go through `isRateLimited(req, { scope: 'apikey', max: 20 })`
  in the handler (see below) before the 401, so brute-forcing the key is
  throttled by IP the same way everything else is, and guesses across
  different endpoints share one bucket.

### 2. Apply in every handler

Add as the first check, before the existing rate-limit lines, in all 7
files: `api/analyze-image.js`, `api/subject-ai.js`, `api/tts.js`,
`api/transcribe.js`, `api/video-lesson.js` (both the GET and POST branches),
`api/youtube-recommendations.js`, `api/auth/google.js`.

```js
if (isRateLimited(req, { scope: 'apikey', max: 20 }) || !hasValidApiKey(req)) {
  return res.status(401).json({ code: 'API_KEY_INVALID', message: 'Acesso não autorizado.' });
}
```

Order matters: check the rate limiter's bucket regardless of key validity
(so repeated wrong guesses count toward the throttle) but short-circuit
before any body parsing/provider work happens.

`server/local-api.js` needs no change — it already just forwards to these
handlers, and in production each `api/*.js` file is its own function with no
shared router in front of it, so the check has to live in the handler
(consistent with why rate limiting itself is duplicated per file today
instead of centralized).

### 3. Env vars

Add to `.env.example`, following the existing three-variant convention used
for `JOVI_LENS_DEMO_MODE` (`JOVI_LENS_DEMO_MODE` / `VITE_...` /
`EXPO_PUBLIC_...`):

```
# Shared secret required on every /api/* call (x-api-key header). Blocks casual/
# accidental LAN use of the paid AI quota — NOT real auth, see auth-plan.md
# Phase 2. Empty = check disabled. Generate with: openssl rand -hex 32
JOVI_API_KEY=
VITE_JOVI_API_KEY=
EXPO_PUBLIC_JOVI_API_KEY=
```

All three must hold the same value. Document in `.env.example` that
`VITE_*`/`EXPO_PUBLIC_*` are inlined into the shipped bundle at build time —
readable by anyone who opens devtools on the web build or unpacks the app —
so this key stops casual LAN use, not someone deliberately extracting it.

### 4. Client wiring

**RN (`services/apiClient.js`)** — add a fetch wrapper next to `apiUrl()`:

```js
export function apiFetch(path, options = {}) {
  const headers = { ...options.headers };
  if (process.env.EXPO_PUBLIC_JOVI_API_KEY) headers['x-api-key'] = process.env.EXPO_PUBLIC_JOVI_API_KEY;
  return fetch(apiUrl(path), { ...options, headers });
}
```

Swap every RN service's `fetch(apiUrl(...), {...})` call to `apiFetch(...)`:
`services/imageAnalysis.js`, `services/audio.js`, `services/subjectStudy.js`,
`services/videoLesson.js` (both calls), `services/speechInput.js`,
`services/youtubeRecommendations.js`.

**Web (`web/services/apiClient.js`, new file)** — same shape, no base URL:

```js
export function apiFetch(path, options = {}) {
  const headers = { ...options.headers };
  if (import.meta.env.VITE_JOVI_API_KEY) headers['x-api-key'] = import.meta.env.VITE_JOVI_API_KEY;
  return fetch(path, { ...options, headers });
}
```

Swap every web service's `fetch('/api/...', {...})` call to `apiFetch(...)`:
`web/services/imageAnalysis.js`, `web/services/audio.js`,
`web/services/subjectStudy.js`, `web/services/videoLesson.js` (both calls),
`web/services/speechInput.js`, `web/services/youtubeRecommendations.js`.
(`web/services/imageAnalysis.js`'s other `fetch(src, {signal})` call, which
fetches an image blob, is unrelated and stays as-is.)

### 5. What Phase 1 deliberately does not do

- No per-user identity or quota — it's one shared secret for every caller.
- No protection against someone who extracts the key from the bundle and
  scripts against the API directly.
- No change to the in-memory `rateBuckets` store — still resets on restart,
  still per-process.

---

## Phase 2 — device attestation + per-Google-account quota (later)

Goal: replace "anyone with the static key" with "a genuine instance of this
app" + "this specific Google account," and make quotas durable. Phase 1's
`hasValidApiKey` stays as an outer speed bump (cheap, blocks non-app
traffic before it reaches the more expensive checks below) — Phase 2 adds
checks after it in the same spot in each handler, so no handler needs a
second round of edits to its call-site structure.

### 1. App attestation

Prove the request comes from an unmodified build of the actual app, not a
script that learned the static key.

- **Android**: [Play Integrity API](https://developer.android.com/google/play/integrity).
  Client requests an integrity token (via `expo-*` binding or a small native
  module, since this isn't in the current Expo dependency list — check for a
  maintained Expo config plugin first), sends it with the request. Server
  verifies via Google's `decodeIntegrityToken` endpoint, checking package
  name, certificate digest, and app recognition verdict.
- **iOS**: [App Attest](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity)
  (or the lighter-weight DeviceCheck if App Attest's per-key attestation flow
  is more than needed). Same shape: client attests once, then signs
  subsequent requests with the attested key; server verifies the assertion.
- **Web**: no equivalent primitive exists (no App Attest/Play Integrity for
  browsers). Realistic options are reCAPTCHA/Turnstile-style challenge or
  simply accepting that web stays behind the static key + rate limits only —
  decide when this phase is scoped.
- Server side: new `api/_lib/attestation.js` with one `verifyAttestation(req)`
  per platform, called from the same guard spot as `hasValidApiKey` today.

### 2. Per-Google-account quota

`api/auth/google.js` already validates the Google ID token against
`https://oauth2.googleapis.com/tokeninfo` and returns `profile.sub` (the
stable per-account id) — but nothing downstream uses it yet; no session is
issued and no other handler receives it. Needed:

1. **Session issuance**: `/api/auth/google` signs a short-lived JWT (or
   opaque token) binding `sub` after validating the Google id_token, instead
   of just returning a display profile. Re-validating the raw Google
   id_token against `tokeninfo` on every AI call would be too slow and would
   hammer an endpoint the code already flags as unauthenticated-by-definition
   and separately rate-limited (`api/auth/google.js` comment) — so AI
   handlers verify the app-issued session token locally (HMAC/JWT secret in
   env), not by calling Google again.
2. **Client wiring**: RN/web store the session token (e.g. MMKV on RN per
   `react-native-mmkv` already in `package.json`; the web app has no
   persisted-auth code yet — check `context/AppDataContext.jsx` /
   `web/context/AppDataContext.jsx` for where profile state would live) and
   send it as e.g. `Authorization: Bearer <token>` via the same `apiFetch`
   wrapper Phase 1 introduces — one more header added in one place per
   platform, not per call site.
3. **Quota store**: move `rateBuckets` (`api/_lib/http.js`) off the in-memory
   `Map` and onto a shared, durable store (Redis/Upstash or similar — pick
   based on wherever this ends up deployed, since no production hosting
   config exists in the repo yet) keyed by `sub` instead of IP for
   authenticated calls. This is required for real per-account daily limits
   regardless of attestation — an in-memory map can't survive a restart or a
   second instance, and IP-keyed limits break down the moment two people
   share a network (roommates, a classroom) or one person switches networks
   mid-day.
4. **Unauthenticated fallback**: decide whether logged-out use should still
   be allowed with the current IP-based limits (today's behavior, since
   Google Sign-In is optional — `GOOGLE_CLIENT_ID` unset makes
   `/api/auth/google` 503 and "the Perfil segue com a conta de demonstração"
   per its comment) or become required once this ships.

### 3. Sequencing note

Attestation and per-account quota are independent and can ship in either
order or separately: attestation stops non-app callers regardless of who
they claim to be; per-account quota stops one legitimate signed-in user from
costing more than their share regardless of what device they're on. Doing
attestation first is probably higher leverage against the original "random
LAN device" threat; per-account quota matters more once the app has enough
real users that one person's runaway usage needs to be isolated from
everyone else's.
