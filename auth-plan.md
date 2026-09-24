> Superseded by prod-plan.md / prod-implementation-spec.md; kept for history.

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
| `api/video-recommendations.js` | `video-recommendations` / 6 per min | `video-recommendations` / 20 per day |
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
`api/transcribe.js`, `api/video-recommendations.js`, `api/auth/google.js`.

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
`services/speechInput.js`, `services/videoRecommendations.js`.

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
`web/services/subjectStudy.js`, `web/services/speechInput.js`,
`web/services/videoRecommendations.js`.
(`web/services/imageAnalysis.js`'s other `fetch(src, {signal})` call, which
fetches an image blob, is unrelated and stays as-is.)

### 5. What Phase 1 deliberately does not do

- No per-user identity or quota — it's one shared secret for every caller.
- No protection against someone who extracts the key from the bundle and
  scripts against the API directly.
- No change to the in-memory `rateBuckets` store — still resets on restart,
  still per-process.

---

## Phase 2 — device attestation + per-Google-account quota

Goal: replace "anyone with the static key" with "a genuine instance of this
app" + "this specific Google account," and make quotas durable. Phase 1's
`hasValidApiKey` stays as an outer speed bump (cheap, blocks non-app
traffic before it reaches the more expensive checks below) — Phase 2 adds
checks after it in the same spot in each handler.

Status: **per-account quota is implemented** (below). **App attestation is
scaffolded only** — Play Console isn't linked to a Cloud project yet, so
there's nothing real to verify against.

### 1. App attestation — scaffolded, not enforced

**iOS is out of scope for now — the app isn't shipping there yet** (see
`app.json`'s `ios` block, which exists but isn't used for a real release). No
App Attest/DeviceCheck work is planned until that changes.

`api/_lib/attestation.js` has one function, `verifyAttestation(req)`, not
called from any handler yet. It always reports "not enforced" until
`PLAY_INTEGRITY_PROJECT_NUMBER` is set, so it's safe to leave in the repo
unwired. To finish this:

1. Register the app in Play Console for `com.jovilens.app`, link a Google
   Cloud project, set `PLAY_INTEGRITY_PROJECT_NUMBER`.
2. Add a client-side integrity-token fetch — needs a native module (no
   maintained package is in `package.json` yet) plus a config plugin and an
   EAS **development build**; Expo Go can't load it. Send the token in a
   header, e.g. `x-play-integrity-token`.
3. Implement the real check in `verifyAttestation()` using Google's
   `decodeIntegrityToken` API with a service account, checking package name,
   certificate digest, and app recognition verdict.
4. Wire `verifyAttestation(req)` into each handler right after the
   `hasValidApiKey`/`sessionUser` checks.
- **Web**: no equivalent primitive exists (no Play Integrity for browsers).
  Realistic options are reCAPTCHA/Turnstile-style challenge or simply
  accepting that web stays behind the static key + rate limits only — decide
  when this is scoped.

### 2. Per-Google-account quota — implemented

`api/auth/google.js` already validated the Google ID token against
`https://oauth2.googleapis.com/tokeninfo`; it now also issues a session and
both clients have a real Sign-In flow (not just the "Fluxo de apresentação"
demo button, which stays alongside it — see below).

1. **Session issuance** (`api/_lib/session.js`, new): after `/api/auth/google`
   validates the Google id_token, it signs `{ sub, email, exp }` with HMAC-SHA256
   using `JOVI_SESSION_SECRET` and returns it as `session` in the response
   body, alongside the existing `user`. No JWT library — one HMAC over one
   JSON payload didn't need a dependency. `issueSession`/`verifySession` are
   the only two exports; `verifySession` returns `null` for anything
   malformed, tampered, or expired (30-day TTL) rather than throwing, so
   callers can treat "no valid session" as one case. If `JOVI_SESSION_SECRET`
   is unset, sign-in still works (client gets a profile to show) but no
   session is issued, so quotas stay IP-based — same "optional until
   configured" pattern as `GOOGLE_CLIENT_ID`/`JOVI_API_KEY`.
2. **Verifying it on AI calls** (`api/_lib/http.js`): `sessionUser(req)` reads
   `Authorization: Bearer <token>`, returns `{ provided, user }`. Each of the
   6 AI handlers (not `auth/google.js` itself) added one line right after the
   `hasValidApiKey` check: if a token was provided but doesn't verify (expired,
   tampered, or the secret rotated), the call is rejected with 401
   `SESSION_INVALID` — it does **not** silently fall back to IP-based
   limiting, so a stale token can't quietly outlive its session. No
   `Authorization` header at all is fine — that's the logged-out/demo path,
   unchanged from before.
3. **Quota keying** (`api/_lib/http.js`): `clientKey(req)` now returns
   `user:<sub>` when a valid session is present, IP otherwise. Every existing
   `isRateLimited`/`isDailyLimited` call in every handler picks this up for
   free — none of those call sites changed, since they all already went
   through `clientKey`. **The store is still the in-memory `rateBuckets` Map**
   (kept as-is per your call — no Redis/Upstash wired in), so quotas are
   correct per-process but reset on restart, same limitation Phase 1 already
   had for IP-based buckets.
4. **Unauthenticated fallback**: kept. Google Sign-In stays optional — logged-
   out/demo use keeps today's IP-based limits, matching how `GOOGLE_CLIENT_ID`
   unset already made `/api/auth/google` 503 while the rest of the app worked
   fine on the demo account.
5. **Client wiring**:
   - **Env**: `GOOGLE_CLIENT_ID` is now comma-separated (`api/auth/google.js`
     checks membership, not equality) because the web and RN apps are
     registered as separate Google OAuth clients, so a token's `aud` differs
     by platform. `VITE_GOOGLE_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_CLIENT_ID` are
     what each client actually sends in the sign-in request — see
     `.env.example` for the full comment.
   - **Web** (`web/services/googleAuth.js`, new): Google Identity Services
     (`accounts.google.com/gsi/client`), loaded on demand. `renderGoogleSignInButton(container, onResult)`
     initializes it with `VITE_GOOGLE_CLIENT_ID` and renders Google's own
     button into `container`; the callback POSTs the resulting `credential`
     to `/api/auth/google`, stores the returned `session`, and calls
     `onResult({ user })`. No redirect, no code exchange, no secret — this is
     the standard, stable web integration.
   - **RN** (`services/googleAuth.js`, new): `expo-auth-session` (added via
     `npx expo install`), **not** `@react-native-google-signin/google-signin`
     or `react-native-nitro-google-signin` — Expo's current docs point Google
     Sign-In at those native modules (Google deprecated the old native
     Android SDK in favor of Credential Manager), but both need a config
     plugin, an EAS **development build**, and an Android OAuth client with
     the app's keystore SHA-1 registered — none of which exist yet, and it's
     the same infra weight as the attestation work above. `expo-auth-session`
     runs today in Expo Go: `useGoogleSignIn()` requests an `id_token`
     directly via `AuthSession.ResponseType.IdToken` (documented in the
     library specifically as "for getting an `id_token` from Google OAuth" —
     an OpenID Connect implicit-style flow), so there's no code-exchange step
     and therefore no client secret to protect on-device. `signIn()` calls
     `promptAsync()`, POSTs the resulting `id_token` to `/api/auth/google`,
     stores the session, and returns `user`.
     **Not verified against a live Google consent screen** — there's no way
     to click through an actual OAuth round trip in this environment. Before
     relying on this, set `EXPO_PUBLIC_GOOGLE_CLIENT_ID` to an OAuth client
     from Google Cloud Console and test the real button. The open question is
     which client **type** Google will accept `AuthSession.makeRedirectUri({ scheme: 'jovilens' })`'s
     redirect URI for — "Web application" clients reject non-https redirect
     URIs outright, so that type won't work here; a "Desktop app"-type client
     is the most likely to accept a custom scheme redirect, but confirm by
     trying it — if Google rejects the redirect URI, the fallback is the
     native-module route described above.
   - **Session storage**: kept out of the `user` profile object on purpose,
     in a separate key (`services/storage.js`'s `getSessionToken`/
     `setSessionToken`, MMKV on RN; `web/services/storage.js`'s
     `localStorage` equivalent) — `user` still flows through
     `createBackup()`/`downloadBackup()` (see `services/dataTransfer.js`),
     and a live session token has no business ending up in a backup file
     someone might export and share.
   - **`apiFetch`** (`services/apiClient.js` / `web/services/apiClient.js`):
     now also attaches `Authorization: Bearer <token>` when a session is
     stored, so no AI service call site needed touching for this.
   - **UI**: both `app/(tabs)/profile.jsx` and `web/pages/Profile.jsx` got a
     new "Entrar com sua conta Google" block, shown only when a client id is
     configured, sitting **alongside** the existing "Fluxo de apresentação"
     demo button rather than replacing it — the demo flow is explicitly
     documented in its own copy as a presentation aid and wasn't ours to
     remove. "Sair" now also clears the session (`signOutGoogle()`) for
     whichever flow was used to sign in.

### 3. What's still open

- Play Integrity is unenforced scaffolding (see above) — needs Play Console
  linkage plus a native module + EAS dev build before it does anything.
- The RN sign-in button needs a real end-to-end test once a Google Cloud
  OAuth client id is set — see the caveat in "Client wiring" above.
- Quota storage is still the in-memory `Map`, now keyed by account instead of
  (or in addition to) IP — durability work is unchanged from before: move to
  Redis/Upstash/similar when this needs to survive restarts or run on more
  than one instance.
