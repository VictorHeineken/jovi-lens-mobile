# Production implementation spec — `prod_app`

This is the **implementation-level** companion to [`prod-plan.md`](prod-plan.md), which holds the
reasoning behind each decision. This file says exactly *what to build and how*. An implementing agent
should be able to follow it without making product or architecture decisions.

Baseline: commit `5906c8a` on `prod_app`. External facts were researched on 2026-09-24 against the
current Gemini, OpenAI, Play Integrity, Vercel, Expo and Upstash docs.

## 0. Rules for the implementing agent

1. **Don't make product decisions.** If something here contradicts what you find (an API rejects a
   documented field, a file moved, a library API differs), stop that step and report it. Don't
   improvise, except where a **Contingency** below gives the exact fallback.
2. Steps marked **[HUMAN]** need a person with account access (Google Cloud, Vercel, EAS, keystore).
   Don't try them. List what's blocked on them and continue with the work that isn't.
3. Every milestone (§12) ends with `npm run check` passing (lint **and** tests). New code may not add
   lint warnings.
4. Match the existing code style: plain JS (ESM), no TypeScript except inside the generated native
   module, and code comments in English. **All user-facing strings are pt-BR.**
5. Don't add npm dependencies beyond those listed in §6.2. The backend stays **dependency-free**:
   Upstash is called through its REST API with `fetch`, and service-account JWTs are signed with
   `node:crypto`.
6. Never log, persist or echo a user API key, session token, integrity token, Google id_token or
   request body (§5.11).
7. Commit per milestone, with a conventional message and the repo's co-author trailer.

---

## 1. Final decisions (recap)

| Topic | Decision |
|---|---|
| Distribution | Sideloaded APK only (Android). No Play Store. iOS and web don't ship |
| Backend | Vercel Functions (repo root `api/`), region `gru1`, Upstash Redis (REST) for state |
| Identity | Google sign-in is **mandatory** for every AI call. Native module `@react-native-google-signin/google-signin` (original API) |
| Free tier | **3 credits per Google account, for life.** 1 credit = 1 AI generation call (see §5.6). Free users get **no** server TTS or STT; they use on-device `expo-speech` / `expo-speech-recognition` |
| Server-paid provider | Gemini (new adapter) |
| Bring your own key (BYOK) | Gemini, OpenAI (new adapter), MiniMax (existing). The key lives in `expo-secure-store`, is sent per request, and is never stored server-side. A BYOK call consumes no credits |
| Genuine APK | Play Integrity **standard** requests with the Cloud project number (off-Play), verified server-side: package name + release certificate digest + `MEETS_DEVICE_INTEGRITY` + requestHash + replay protection |
| Calendar | **Read-only** access to the device's `CalendarContract` provider, limited to calendars whose account is the signed-in Gmail (`com.google`). `WRITE_CALENDAR` is blocked in the manifest. There's no Google Calendar API or OAuth scope |
| Notifications | **Exam reminders only**: local notifications at 19:00 local time, 3 days before and 1 day before each exam |
| Presentation build | Separate variant `com.jovilens.app.demo` with `EXPO_PUBLIC_JOVI_LENS_DEMO_MODE=true`. Fully offline demo (current behavior), with no sign-in, credits or integrity |
| Old installs | **No backward compatibility.** Testers uninstall v1.0.4 before installing. No data migration code |
| Web app (`web/`) | Doesn't ship, but **must keep working locally** through a local-only dev bypass (§5.12) |

---

## 2. [HUMAN] Prerequisites and the values they produce

Do these before the milestones that need them. Each produces values for §3.

| # | Step | Produces |
|---|---|---|
| H1 | **Release keystore.** `eas credentials -p android` → "Set up a new keystore" (or upload an existing one). Keep an offline backup, because losing it means testers must uninstall to update. Then run `keytool -list -v -keystore <file> -alias <alias>` (or read it from `eas credentials`). | `RELEASE_SHA1` (hex), `RELEASE_SHA256` (hex) |
| H1b | Convert SHA-256 to base64url: `echo <HEX_WITHOUT_COLONS> \| xxd -r -p \| base64 \| tr '+/' '-_' \| tr -d '='` | `PLAY_INTEGRITY_CERT_SHA256` |
| H1c | Debug keystore SHA-1 for dev builds: `keytool -list -v -keystore ~/.android/debug.keystore -storepass android -alias androiddebugkey`. If building with EAS dev builds, take it from `eas credentials` for the development profile. | `DEBUG_SHA1` |
| H2 | **Google Cloud project** `jovi-lens`. Note the **project number** (Project info). | `PLAY_INTEGRITY_PROJECT_NUMBER` |
| H3 | **OAuth consent screen**: External, publishing status **In production**, scopes **only** `openid`, `email`, `profile` (no verification needed for these), app name "JOVI Lens", support email, and privacy URL `https://<vercel-domain>/privacy.html` (available after M1). | — |
| H4 | **OAuth clients** (Credentials): (a) **Web application** client, no redirect URIs needed; (b) **Android** client, package `com.jovilens.app`, SHA-1 = `RELEASE_SHA1`; (c) **Android** client, package `com.jovilens.app`, SHA-1 = `DEBUG_SHA1`. | `GOOGLE_WEB_CLIENT_ID` (from a) |
| H5 | Enable **Play Integrity API** in the project. Create a **service account** `integrity-verifier` (no project role needed) → Keys → JSON. Base64 it: `base64 -i key.json \| tr -d '\n'`. | `PLAY_INTEGRITY_SA_JSON_B64` |
| H6 | **Gemini API key** for the server in Google AI Studio (free tier). Free-tier content may be used by Google to improve its products, which the privacy page states (§6.15). | `GEMINI_API_KEY` |
| H7 | **Vercel project** imported from GitHub. Root directory = repo root, Framework preset **Other**, Node.js **22.x**, production branch `main`. Add **Upstash Redis** from the Vercel Marketplace (region São Paulo `sa-east-1`) and connect it to the project, which injects its REST URL and token env vars. Leave Deployment Protection on for **Preview** only. Production must stay public. The app can't
call protected Preview URLs, so every device test (M5–M8) runs against **Production**. Test risky
changes by setting `JOVI_REQUIRE_INTEGRITY=false` in Production temporarily, never by opening
Preview. | `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`), `VERCEL_DOMAIN` |
| H8 | Secrets: `openssl rand -hex 32` twice. | `JOVI_API_KEY`, `JOVI_SESSION_SECRET` |
| H9 | **EAS**: `eas login`, `eas init` (writes `extra.eas.projectId` into `app.json`, so commit it). `eas env:create --environment production --name EXPO_PUBLIC_JOVI_API_KEY --value <JOVI_API_KEY> --visibility sensitive`. | — |

---

## 3. Environment variables (complete list)

### 3.1 Server (Vercel Production, and the root `.env` locally)

| Var | Required in prod | Value / default | Notes |
|---|---|---|---|
| `AI_PROVIDER` | yes | `gemini` | Server-paid provider for free credits |
| `GEMINI_API_KEY` | yes | H6 | |
| `GEMINI_CHAT_MODEL` | no | `gemini-3.5-flash-lite` | Chat and vision |
| `GEMINI_TTS_MODEL` | no | `gemini-3.8-flash-lite-tts` | Only used for BYOK Gemini (free users get no server TTS) |
| `GEMINI_STT_MODEL` | no | `gemini-3.5-flash-lite` | Only used for BYOK Gemini |
| `GEMINI_VOICE_A` / `_B` / `_NARRATOR` / `_COACH` / `_FEEDBACK` | no | `Aoede` / `Charon` / `Kore` / `Leda` / `Orus` | Voice names from the 30 prebuilt voices |
| `OPENAI_CHAT_MODEL` | no | `gpt-6-luna` | BYOK only. Chat Completions, image input |
| `OPENAI_TTS_MODEL` | no | `gpt-4o-mini-tts` | BYOK only |
| `OPENAI_STT_MODEL` | no | `gpt-4o-mini-transcribe` | BYOK only |
| `OPENAI_VOICE_A` / `_B` / `_NARRATOR` / `_COACH` / `_FEEDBACK` | no | `nova` / `onyx` / `alloy` / `nova` / `onyx` | Same defaults as Azure |
| `MINIMAX_*` | no | existing defaults in `minimax.js` | BYOK only (the key comes from the user) |
| `GOOGLE_CLIENT_ID` | yes | `GOOGLE_WEB_CLIENT_ID` | Comma list allowed (unchanged) |
| `JOVI_SESSION_SECRET` | yes | H8 | |
| `JOVI_API_KEY` | yes | H8 | |
| `JOVI_REQUIRE_INTEGRITY` | yes | `true` | `false` allowed in Preview and local |
| `PLAY_INTEGRITY_PROJECT_NUMBER` | yes | H2 | |
| `PLAY_INTEGRITY_PACKAGE` | no | `com.jovilens.app` | |
| `PLAY_INTEGRITY_CERT_SHA256` | yes | H1b | Comma list (base64url, padding ignored) |
| `PLAY_INTEGRITY_SA_JSON_B64` | yes | H5 | |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` **or** `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | yes | H7 | Read in that order (`UPSTASH_*` first) |
| `JOVI_FREE_CREDITS` | no | `3` | |
| `JOVI_SIGNUP_LIMIT_PER_IP_DAY` | no | `25` | New accounts per IP per UTC day |
| `JOVI_LENS_DEMO_MODE` | no | `false` | Must be `false` in prod |
| `JOVI_LOCAL_DEV_BYPASS` | **forbidden** in prod | `false` | Ignored whenever `process.env.VERCEL` is set |

**Remove** from `.env.example`: `AZURE_*` stays documented as an optional server provider. Remove
`ANTHROPIC_*` (not planned) and the "fases seguintes" wording. `AI_PROVIDER` accepts
`azure-openai | gemini | openai | minimax`.

**Fail-closed rule:** when `process.env.VERCEL` is set and any "Required in prod" var is missing, every
route returns `503 SERVER_MISCONFIGURED`, and the startup log names the missing variables (names
only, never values).

### 3.2 App (EAS profiles; see §6.1 for `eas.json`)

| Var | development | production | presentation |
|---|---|---|---|
| `APP_VARIANT` | `development` | `production` | `presentation` |
| `EXPO_PUBLIC_JOVI_LENS_DEMO_MODE` | `false` | `false` | `true` |
| `EXPO_PUBLIC_API_BASE_URL` | `http://127.0.0.1:8787` | `https://<VERCEL_DOMAIN>` | (unused) |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | H4a | H4a | (unused) |
| `EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER` | H2 | H2 | (unused) |
| `EXPO_PUBLIC_JOVI_API_KEY` | local `.env` | EAS env (sensitive) | (unused) |

Rename `EXPO_PUBLIC_GOOGLE_CLIENT_ID` → `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` everywhere.

---

## 4. Request pipeline (every AI route)

```text
client apiFetch ──► guard (api/_lib/guard.js) ──────────────────────────────────────────────► handler.run
 headers:            1 method            6 dev bypass (local only)       11 validate input (400)
  Content-Type       2 content-type      7 session (401)                  12 idempotency (409 / replay)
  x-api-key          3 raw body ≤4MB     8 integrity (403)                13 reserve credit (402)
  Authorization      4 api key (401/429) 9 burst limit per user (429)     14 run → 200 / map error
  Idempotency-Key    5 BYOK headers      10 BYOK requirement (403)        15 success: store replay,
  x-jovi-ts              read+delete                                         header credits-remaining
  x-play-integrity-token                                                   failure: refund + delete idem
  x-ai-provider / x-ai-key (optional)
```

---

## 5. Backend

### 5.1 Vercel project files (repo root)

**`vercel.json`** (exact):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "installCommand": "echo \"backend has no dependencies\"",
  "buildCommand": "echo \"no build\"",
  "outputDirectory": "public",
  "regions": ["gru1"],
  "functions": { "api/**/*.js": { "maxDuration": 60 } }
}
```

**`.vercelignore`** (exact). Only the backend, `shared/` (imported by `api/`), the static `public/`
and the config are uploaded:

```text
/*
!/api
!/shared
!/public
!/vercel.json
!/package.json
```

**`public/`** (new):
- `index.html` shows a one-line "JOVI Lens API" page with a link to `privacy.html`.
- `privacy.html` is the privacy policy (content in §6.15).

Every `api/**/*.js` route file exports `export const config = { api: { bodyParser: false } };` so the
guard can hash the **raw** body. Files under `api/_lib/` are not routes.

### 5.2 `api/_lib/store.js` (new)

This module is the single place that touches Redis. It exports `getStore()`, which returns an
Upstash-backed store when the URL and token env vars are set, and an in-memory store otherwise. The
in-memory store is used only when `!process.env.VERCEL`; on Vercel a missing store means fail-closed.

Interface (all methods `async`):

| Method | Semantics |
|---|---|
| `hit(key, windowSec)` → `number` | Fixed-window counter: `INCR key` + `EXPIRE key windowSec`, pipelined. Returns the new count |
| `setNX(key, value, ttlSec?)` → `boolean` | `SET key value NX [EX ttl]` → true if it was set |
| `get(key)` → `string\|null` | |
| `set(key, value, ttlSec?)` | |
| `del(key)` | |
| `reserveCredit(sub, initial)` → `number` | Runs the Lua script below. Returns the remaining credits after the decrement, or `-1` if the account has none |
| `refundCredit(sub)` | `INCR credits:{sub}` |
| `getCredits(sub, initial)` → `number` | `GET`. If missing, returns `initial` without writing |
| `initCredits(sub, initial)` → `boolean` | `SET credits:{sub} initial NX` → true if the account is new |

Upstash REST calls:
- Single command: `POST {URL}` with body = the JSON array command, header
  `Authorization: Bearer {TOKEN}`, response `{result}` or `{error}`.
- Pipeline: `POST {URL}/pipeline` with a 2-D array body, response array of `{result}|{error}`.
- Timeout: 5 s. Any `{error}` or network failure throws `{code:'STORE_UNAVAILABLE'}`, which becomes
  `503 STORE_UNAVAILABLE`.

`reserveCredit` Lua, sent as `["EVAL", SCRIPT, "1", "credits:"+sub, String(initial)]`:

```lua
local v = redis.call('GET', KEYS[1])
if v == false then redis.call('SET', KEYS[1], ARGV[1]); v = ARGV[1] end
if tonumber(v) <= 0 then return -1 end
return redis.call('DECR', KEYS[1])
```

The in-memory store implements identical semantics with a `Map` of `{value, expiresAt}`.

Key names (and nothing else):

| Key | Type / TTL |
|---|---|
| `credits:{sub}` | int, no TTL |
| `rl:{scope}:{id}:{windowIndex}` | int, TTL = window. `windowIndex = Math.floor(Date.now()/1000/windowSec)` |
| `idem:{sub}:{uuid}` | `"pending"` or the JSON response string, TTL 600 s |
| `integ:{requestHash}` | `"1"`, TTL 300 s |
| `signup:{ip}:{YYYYMMDD}` | int, TTL 86400 s |

### 5.3 `api/_lib/guard.js` (new) — `defineRoute(spec)`

```js
export function defineRoute({
  method,           // 'POST' | 'GET'
  scope,            // rate-limit scope name
  burstPerMinute,   // per user (or per IP when auth === 'none')
  auth,             // 'session' | 'none'
  integrity,        // boolean — enforced only when JOVI_REQUIRE_INTEGRITY === 'true'
  cost,             // 0 | 1 credits (free users only)
  byok,             // 'optional' | 'required' | 'forbidden'
  byokCapability,   // for byok:'required': 'tts' | 'stt'
  validate,         // (body) => ({ input } | { error: { status, code, message } })
  run,              // async (input, ctx) => resultObject   (throws on failure)
})
// returns: async function handler(req, res)
```

The steps below are numbered as in §4. Each failure returns `res.status(s).json({ code, message })`,
with messages from §5.4.

1. **Method.** `req.method !== method` → `405 METHOD_NOT_ALLOWED`.
2. **Content type.** For POST, `content-type` must contain `application/json`, otherwise
   `415 UNSUPPORTED_MEDIA_TYPE`.
3. **Raw body.** If `req.rawBody` (a Buffer, set by `server/local-api.js`) exists, use it. Otherwise
   read the `req` stream into a Buffer, aborting after **4,000,000 bytes** with
   `413 PAYLOAD_TOO_LARGE`. `bodySha256 = sha256hex(raw)` (for GET, raw = empty).
   `body = raw.length ? JSON.parse(raw) : {}`; a parse failure returns `400 INVALID_JSON`.
4. **API key.** If `JOVI_API_KEY` is set and `hasValidApiKey(req)` is false: `hit('rl:apikeyfail:'+ip, 60)`;
   if the count is > 20, return `429 RATE_LIMITED`, otherwise `401 API_KEY_INVALID`. **Valid requests
   never touch this counter.** This fixes today's bug where every request counted toward a
   20-per-minute `apikey` bucket, which made 60 TTS calls per minute impossible.
5. **BYOK headers.** Read `x-ai-provider` and `x-ai-key`, then **`delete req.headers['x-ai-key']`**
   immediately.
   - Key present without a provider, or provider ∉ {`gemini`,`openai`,`minimax`}, or the key fails
     `/^[A-Za-z0-9._\-]{20,300}$/` → `400 BYOK_INVALID_FORMAT`.
   - `byok === 'forbidden'` and a key is present → the key is ignored (auth and me routes).
   - `ctx.byok = { provider, apiKey } | null`.
6. **Dev bypass.** `bypass = process.env.JOVI_LOCAL_DEV_BYPASS === 'true' && !process.env.VERCEL`. If
   set: `ctx.user = { sub: 'dev:'+ip, email: 'dev@local' }` and steps 7, 8, 12 and 13 are skipped.
   Step 10 is also skipped when no user key was sent, so `tts` and `transcribe` fall through to the
   server provider (§5.12). Burst limits still apply. On first use, log `console.warn('JOVI_LOCAL_DEV_BYPASS ativo — nunca use em produção')`.
7. **Session** (`auth === 'session'`). No `Authorization: Bearer` → `401 SIGN_IN_REQUIRED`. Present
   but `verifySession` returns null → `401 SESSION_INVALID`. Set `ctx.user = { sub, email }`.
8. **Integrity** (`integrity && JOVI_REQUIRE_INTEGRITY === 'true'`). Run `verifyIntegrity(req, bodySha256)`
   (§5.8). Failure → `403 INTEGRITY_FAILED`; Google unreachable → `503 INTEGRITY_UNAVAILABLE`.
9. **Burst limit.** `id = ctx.user?.sub ?? ip`. If `hit('rl:'+scope+':'+id, 60) > burstPerMinute`,
   return `429 RATE_LIMITED`.
10. **BYOK requirement.** For `byok === 'required'` (skipped under the bypass when no key was sent;
    see step 6): no key → `403 BYOK_REQUIRED`. If the provider's
    `capabilities[byokCapability]` is false (MiniMax STT) → `400 BYOK_CAPABILITY_UNSUPPORTED`.
11. **Validate.** `validate(body)` → on error return it (codes `INVALID_INPUT` / `TEXT_TOO_LONG` / …).
    The existing validators (`safeInput` in `analyze-image.js`, `subject-ai.js` and
    `video-recommendations.js`, plus the inline checks in `tts.js` and `transcribe.js`) must be
    adapted to this exact contract:
    - Success returns `{ input: <the fields they return today> }`. `analyze-image`'s input is
      `{ image, mimeType, action, question, context }`; `subject-ai`'s is
      `{ action, subject, preferences }`; `video-recommendations`'s is `{ subject, preferences }`;
      `tts`'s is `{ text, voice, format }`; `transcribe`'s is `{ audio, mimeType }`.
    - Failure returns `{ error: { status: 400, code: 'INVALID_INPUT', message } }`, keeping each
      validator's existing pt-BR message. The only exceptions are `tts` text over 2000 chars
      (`code: 'TEXT_TOO_LONG'`) and bad or oversized images and audio (`code: 'INVALID_INPUT'`,
      today's message).
    - `run(input, ctx)` receives exactly that `input` object.
12. **Idempotency** (applies when `cost > 0 && !ctx.byok && !bypass`):
    - The header `idempotency-key` must match a UUID v4 regex, otherwise `400 IDEMPOTENCY_KEY_REQUIRED`.
    - Key = `idem:{sub}:{uuid}`. Run `setNX(key,'pending',600)`.
    - If the key already existed: value `pending` → `409 REQUEST_IN_PROGRESS`; a JSON value → respond
      `200` with that JSON parsed and header `x-jovi-idempotent-replay: true`, with no charge and no
      provider call.
13. **Reserve** (same condition as 12). `remaining = reserveCredit(sub, JOVI_FREE_CREDITS)`. On `-1`,
    `del(idemKey)` and return `402 CREDITS_EXHAUSTED`.
14. **Run.** `result = await run(input, ctx)`.
    - On throw: if reserved, `refundCredit(sub)`; if an idem key was set, `del(idemKey)`. Map the
      error with `errorResponse` (§5.4) and respond.
    - An abort caused by the client disconnecting still counts as a normal run. The provider was
      charged, so there's no refund in that case. **Detection:** none needed. Only exceptions thrown
      by `run` trigger a refund.
15. **Success.** If reserved, `set(idemKey, JSON.stringify(result), 600)` and set the header
    `x-jovi-credits-remaining: remaining`. For free users on cost-0 routes, and on `/api/me`, set the
    header from `getCredits`. Respond `200` with `result`.

`ctx` = `{ req, ip, user, byok, bypass, log }`. `ip` = `x-real-ip` header when `process.env.VERCEL`
is set, otherwise `req.ip` (set by local-api from the socket), otherwise `'unknown'`.

Handlers become thin. Example (`api/analyze-image.js`):

```js
import { defineRoute } from './_lib/guard.js';
import { runStudyAI } from './_lib/ai/service.js';
export const config = { api: { bodyParser: false } };
export default defineRoute({
  method: 'POST', scope: 'analyze', burstPerMinute: 12, auth: 'session', integrity: true,
  cost: 1, byok: 'optional', validate: safeInput,
  run: (input, ctx) => runStudyAI({ ...input, imageDataUrl: input.image ? `data:${input.mimeType};base64,${input.image}` : undefined, credentials: ctx.byok }),
});
```

`hasValidApiKey`, `sessionUser`, `hasKnownImageSignature`, `hasKnownAudioSignature` and
`errorResponse` stay in `http.js`. `isRateLimited`, `isDailyLimited`, `clientKey` and the `rateBuckets`
Map are **deleted** (the store replaces them). Update all callers.

### 5.4 Error codes (server → client contract)

Every error body is `{ "code": "<CODE>", "message": "<pt-BR>" }`.

| HTTP | code | message (pt-BR, exact) | Client action |
|---|---|---|---|
| 400 | `INVALID_JSON` | Requisição inválida. | — |
| 400 | `INVALID_INPUT` | (the validator's existing specific message) | — |
| 400 | `TEXT_TOO_LONG` | Texto longo demais para gerar áudio. | — |
| 400 | `IDEMPOTENCY_KEY_REQUIRED` | Requisição sem identificador. Atualize o app. | — |
| 400 | `BYOK_INVALID_FORMAT` | Formato de chave de IA inválido. | open key screen |
| 400 | `BYOK_CAPABILITY_UNSUPPORTED` | Seu provedor de IA não oferece este recurso. | — |
| 401 | `API_KEY_INVALID` | Acesso não autorizado. | — |
| 401 | `SIGN_IN_REQUIRED` | Entre com sua conta Google para usar a IA. | sign in |
| 401 | `SESSION_INVALID` | Sua sessão expirou. Entre novamente. | silent refresh → sign in |
| 402 | `CREDITS_EXHAUSTED` | Você usou suas 3 análises gratuitas. Adicione sua própria chave de IA para continuar. | open key screen |
| 403 | `INTEGRITY_FAILED` | Não foi possível verificar este aparelho. Use o app oficial em um aparelho sem modificações. | — |
| 403 | `BYOK_REQUIRED` | Vozes e transcrição da IA exigem sua própria chave. Usando a voz do aparelho. | fall back to device |
| 405 | `METHOD_NOT_ALLOWED` | Método não permitido. | — |
| 409 | `REQUEST_IN_PROGRESS` | Este pedido ainda está sendo processado. | — |
| 413 | `PAYLOAD_TOO_LARGE` | Arquivo grande demais para enviar. | — |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Tipo de conteúdo não suportado. | — |
| 422 | `BYOK_REJECTED` | Sua chave de IA foi recusada pelo provedor. Confira ou troque a chave. | open key screen |
| 429 | `RATE_LIMITED` | Muitos pedidos em sequência. Tente novamente em instantes. | — |
| 429 | `SIGNUP_LIMITED` | Muitas contas novas nesta rede hoje. Tente novamente amanhã. | — |
| 429 | `AI_RATE_LIMITED` | O serviço de IA está temporariamente ocupado. Tente novamente em instantes. | retry later |
| 502 | `AI_UNAVAILABLE` / `AI_PROVIDER_ERROR` / `AI_INVALID_RESPONSE` / `AI_EMPTY_RESPONSE` / `AI_RESPONSE_TOO_LARGE` | (existing `errorResponse` messages; the new code gets: A resposta da IA ficou grande demais. Tente um conteúdo menor.) | retry |
| 503 | `AI_NOT_CONFIGURED` | (existing) | — |
| 503 | `STORE_UNAVAILABLE` / `SERVER_MISCONFIGURED` / `INTEGRITY_UNAVAILABLE` | Serviço indisponível no momento. Tente novamente em instantes. | retry |
| 504 | `AI_TIMEOUT` | (existing) | retry |

**Provider auth errors:**
- Upstream 401/403 on a **BYOK** request → `422 BYOK_REJECTED`. Never 401, because the client treats
  401 as a session problem.
- Upstream 401/403 with the **server's** key → `502 AI_UNAVAILABLE` plus a server log line
  `server_provider_auth_failed`.

`errorResponse` in `http.js` gets these mappings. Adapters throw
`{code:'AI_PROVIDER_AUTH', status}` for upstream 401/403, and the guard converts it depending on
`ctx.byok`.

### 5.5 Routes (contracts)

| Route | Method | auth | integrity | cost | byok | burst/min | Timeout budget |
|---|---|---|---|---|---|---|---|
| `/api/analyze-image` | POST | session | ✓ | 1 | optional | 12 | provider 30 s |
| `/api/subject-ai` | POST | session | ✓ | 1 | optional | 10 | provider 45 s |
| `/api/video-recommendations` | POST | session | ✓ | 1 | optional | 6 | provider 18 s |
| `/api/tts` | POST | session | ✓ | 0 | **required** (tts) | 60 | provider 30 s |
| `/api/transcribe` | POST | session | ✓ | 0 | **required** (stt) | 20 | provider 30 s |
| `/api/byok/validate` (new) | POST | session | ✓ | 0 | **required** (none) | 5 | 15 s |
| `/api/auth/google` | POST | none | ✓ | 0 | forbidden | 10 (per IP) | Google 8 s |
| `/api/me` (new) | GET | session | ✗ | 0 | forbidden | 30 | — |

Body changes (everything not listed stays as it is today):
- `analyze-image`: `MAX_IMAGE_LENGTH` = **3,000,000** base64 chars.
- `tts`: `MAX_TEXT` = **2000** chars. Longer text → `400 TEXT_TOO_LONG` (don't slice silently). The
  response is still `{ parts: string[], mimeType, voice }`. After synthesis, if the total base64
  length of `parts` is > 4,000,000, throw `AI_RESPONSE_TOO_LARGE`.
- `transcribe`: `MAX_AUDIO_LENGTH` = **3,500,000** base64 chars.
- `byok/validate`: body `{}`. It calls `provider.validateKey(credentials)` and returns
  `200 {ok:true, provider, capabilities:{chat,vision,tts,stt}}`. A rejected key → `422 BYOK_REJECTED`.
- `auth/google`:
  - Body `{ credential }` (unchanged).
  - After Google validation: `isNew = initCredits(sub, JOVI_FREE_CREDITS)`.
  - If `isNew`: `n = hit('signup:'+ip+':'+utcDate, 86400)`. If `n > JOVI_SIGNUP_LIMIT_PER_IP_DAY`,
    `del('credits:'+sub)` and return `429 SIGNUP_LIMITED`.
  - Response: `{ user:{id,name,email,picture}, session, creditsRemaining }`.
  - In prod, a missing `JOVI_SESSION_SECRET` is `SERVER_MISCONFIGURED`; the old "optional" path only
    applies locally.
- `me`: `200 { user:{ id: sub, email }, creditsRemaining, creditsTotal: JOVI_FREE_CREDITS }`.

`server/local-api.js`:
- Keep the raw bytes and pass `rawBody` (Buffer) to handlers in addition to `body`.
- `MAX_BODY_BYTES` = 4,000,000.
- Add `GET /api/me` and `POST /api/byok/validate`.
- Forward response headers set by handlers: the adapter needs `setHeader(name, value)`, which the
  guard uses.

### 5.6 Credit rules (exact)

- **Costs 1 credit** (free users): every successful call to `/api/analyze-image` (any action:
  `analyze`, `extract`, `explain`, `solve`, `quiz`, `flashcards`, `ask`), `/api/subject-ai` (any
  action: `questions`, `exam`, `plan`, `podcast-script`, `lesson-script`), and
  `/api/video-recommendations`.
- **Never costs:** `/api/tts` and `/api/transcribe` (BYOK-only), `/api/byok/validate`, `/api/me`,
  `/api/auth/google`, idempotent replays, failed calls (refunded), and any BYOK call.
- Credits are initialized to 3 on the **first successful sign-in** and never refilled. Signing out
  and back in, or reinstalling, changes nothing.
- There's no "unlimited" tier and no admin endpoint. Resetting a tester means running
  `SET credits:<sub> 3` in the Upstash console; document this in the README runbook.

### 5.7 Sessions

`api/_lib/session.js` is unchanged (HMAC, 30-day TTL). There's no refresh token: the client re-runs
Google silent sign-in when needed (§6.5).

### 5.8 Integrity verification — `api/_lib/attestation.js` (rewrite)

Headers from the client: `x-jovi-ts` (ms epoch, decimal string) and `x-play-integrity-token`.

`verifyIntegrity(req, bodySha256)`:

1. Missing token or ts → fail `missing`. `|Date.now() - ts| > 120000` → fail `stale_ts`.
2. `path` = URL pathname (strip the query).
   `expectedHash = sha256hex(\`${req.method}\n${path}\n${bodySha256}\n${ts}\`)`.
3. Access token: build an RS256 JWT with `node:crypto` `createSign('RSA-SHA256')`, using the service
   account in `PLAY_INTEGRITY_SA_JSON_B64` (fields `client_email` and `private_key`).
   - Claims: `iss: client_email`, `scope: "https://www.googleapis.com/auth/playintegrity"`,
     `aud: "https://oauth2.googleapis.com/token"`, `iat`, `exp: iat+3600`.
   - `POST https://oauth2.googleapis.com/token`, form
     `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=<jwt>`.
   - Cache `{access_token, expiresAt}` in module scope until 60 s before expiry.
4. `POST https://playintegrity.googleapis.com/v1/${PLAY_INTEGRITY_PACKAGE}:decodeIntegrityToken`,
   header `Authorization: Bearer <access>`, JSON `{"integrity_token": token}`, 8 s timeout.
   - Non-2xx 5xx or a network error → throw `INTEGRITY_UNAVAILABLE`.
   - 4xx → fail `decode_rejected`.
5. `p = response.tokenPayloadExternal`. **All** of these must hold, otherwise fail with the named
   reason:
   - `p.requestDetails.requestPackageName === PACKAGE` (`pkg`)
   - `p.requestDetails.requestHash === expectedHash` (`hash`)
   - `p.appIntegrity.appRecognitionVerdict` ∈ {`PLAY_RECOGNIZED`, `UNRECOGNIZED_VERSION`} (`unevaluated`).
     A sideloaded app is expected to get `UNRECOGNIZED_VERSION`.
   - `p.appIntegrity.packageName === PACKAGE` (`pkg`)
   - `p.appIntegrity.certificateSha256Digest` (array) contains any value of `PLAY_INTEGRITY_CERT_SHA256`,
     comparing with trailing `=` stripped (`cert`)
   - `p.deviceIntegrity.deviceRecognitionVerdict` (array) includes `MEETS_DEVICE_INTEGRITY` (`device`)
6. Replay: `setNX('integ:'+expectedHash, '1', 300)` false → fail `replay`.
7. Log only `{event:'integrity_fail', reason}`. Never log the token or the payload.

### 5.9 AI providers

**Interface change.** Every adapter exports:
- `capabilities`
- `isConfigured(capability, credentials?)`
- `complete({messages, maxTokens, timeoutMs, credentials})`
- `speak({text, voice, format, timeoutMs, credentials})`
- `transcribe({buffer, mimeType, filename, timeoutMs, credentials})`
- `validateKey(credentials)`
- optional `ttsChunkLimit`

`credentials` is `{ apiKey }` or undefined. When present, the adapter uses `credentials.apiKey`
instead of the env key. Model and voice settings always come from env or defaults.

`providers/index.js`:
- `getProvider(capability, { byok } = {})`: when `byok` is set, resolve `byok.provider` directly
  (ignoring `AI_*` env). Throw `BYOK_CAPABILITY_UNSUPPORTED` if the capability is missing. Return the
  module with every method pre-bound to `credentials: { apiKey: byok.apiKey }`.
- Register `gemini` and `openai`. `azure-openai` stays server-only (not a BYOK option).

`service.js`: `runStudyAI`, `runSubjectAI`, `runVideoRecommendations`, `synthesizeSpeech` and
`transcribeAudio` accept `credentials` (the `ctx.byok` object) and pass `{ byok: credentials }` to
`getProvider`.

**Gemini adapter — `providers/gemini.js` (new).** It uses the **Interactions API**:

`POST https://generativelanguage.googleapis.com/v1beta/interactions`, headers
`x-goog-api-key: <key>`, `Content-Type: application/json`. `redirect: 'error'` like the other
adapters.

`complete()`:
- Input mapping from the OpenAI-style `messages[0].content`:
  - a string → `[{type:'text', text}]`
  - an array: `{type:'text'}` → `{type:'text', text}`; `{type:'image_url', image_url:{url}}` →
    `dataUrlToBase64(url)` → `{type:'image', data, mime_type}`
- Body:
  ```json
  {
    "model": "<GEMINI_CHAT_MODEL>",
    "input": [...],
    "store": false,
    "response_format": { "type": "text", "mime_type": "application/json" },
    "generation_config": { "max_output_tokens": maxTokens, "temperature": 0.2, "thinking_level": "minimal" }
  }
  ```
- Parse: `status === 'completed'`, then `text` = all `steps[]` with `type === 'model_output'` →
  `content[]` with `type === 'text'` → `.text`, joined. Empty → `AI_EMPTY_RESPONSE`.
- Return `{ text, model, provider: 'gemini' }`.

`speak()`:
- Body:
  ```json
  {
    "model": "<GEMINI_TTS_MODEL>",
    "store": false,
    "input": [{ "type": "user_input", "content": [{ "type": "text", "text": "<text>",
      "annotations": [{ "type": "speech_metadata", "style": "<ROLE_STYLE[voice]>" }] }] }],
    "response_format": { "type": "audio", "mime_type": "audio/mp3", "bit_rate": 64000 },
    "generation_config": { "speech_config": [{ "voice": "<role voice>", "language": "pt-BR" }] }
  }
  ```
  Reuse `ROLE_STYLE` from `azureOpenAI.js` by moving it to `providers/shared.js`.
- Parse: the first `steps[].content[]` item with `type === 'audio'` → `{data, mime_type}`. Return
  `{ buffer: Buffer.from(data,'base64'), mimeType: mime_type === 'audio/mp3' ? 'audio/mpeg' : mime_type }`.
- `ttsChunkLimit = 2000`.

`transcribe()`:
- Body:
  ```json
  {
    "model": "<GEMINI_STT_MODEL>",
    "store": false,
    "input": [
      { "type": "text", "text": "Transcreva a fala deste áudio em português do Brasil. Responda somente com a transcrição, sem comentários." },
      { "type": "audio", "data": "<base64>", "mime_type": "<mime: audio/m4a | audio/mp4 | audio/webm | audio/ogg | audio/wav | audio/mp3>" }
    ],
    "response_format": { "type": "text", "mime_type": "text/plain" },
    "generation_config": { "max_output_tokens": 1000, "thinking_level": "minimal" }
  }
  ```
- Parse text as in `complete()`. Empty → `AI_EMPTY_RESPONSE`.

`validateKey()`: `GET https://generativelanguage.googleapis.com/v1beta/models?pageSize=1` with
`x-goog-api-key`. 200 → ok; 400/401/403 → `AI_PROVIDER_AUTH`.

Errors (all Gemini calls): HTTP 429 → `AI_RATE_LIMITED`; 401/403 → `AI_PROVIDER_AUTH`; other
non-2xx → `AI_PROVIDER_ERROR`; abort → `AI_TIMEOUT`.

`capabilities = { chat:true, vision:true, tts:true, stt:true }`.

**Contingencies (Gemini)** — apply only if the M3 live smoke test (§12) shows the failure:
- `thinking_level` rejected (400) → remove the field.
- MP3 not honored (the audio item's `mime_type` is `audio/wav` or `audio/l16`) → request
  `{"type":"audio","mime_type":"audio/wav","sample_rate":16000}`, set `ttsChunkLimit = 800`, and set
  client `TTS_CHUNK_CHARS` (§6.8) to 800.
- The free-tier key can't use `gemini-3.5-flash-lite` → set `GEMINI_CHAT_MODEL=gemini-3.1-flash-lite`.
- `store:false` rejected → remove it.

**OpenAI adapter — `providers/openai.js` (new).** Base `https://api.openai.com/v1`, header
`Authorization: Bearer <key>`.
- `complete`: `POST /chat/completions` with
  `{model: OPENAI_CHAT_MODEL, messages, max_completion_tokens: maxTokens, reasoning_effort: 'low', response_format:{type:'json_object'}}`.
  The messages pass through unchanged (they're already in OpenAI shape). Parse
  `choices[0].message.content`.
- `speak`: `POST /audio/speech` with
  `{model: OPENAI_TTS_MODEL, input: text, voice: roleVoice, response_format: 'mp3', instructions: ROLE_STYLE[voice]}`.
  The response is binary. `ttsChunkLimit = 2000`.
- `transcribe`: `POST /audio/transcriptions`, multipart `file`, `model`, `response_format=json`
  (same as the Azure adapter).
- `validateKey`: `GET /models`.
- Error mapping as for Gemini. `capabilities` all true.
- **Contingency:** if `reasoning_effort` is rejected for the model (400), remove it.

**MiniMax.** Add the `credentials` support and `validateKey()`. For validation, call `complete` with
`messages:[{role:'user', content:'Responda apenas {"ok":true}'}]` and `maxTokens: 20`; any 2xx means
ok. No other change.

**`prompts.js` / `service.js` calendar wording.** Replace the literal `'Outlook'` defaults:
- `prompts.js:97` → `const CALENDAR_LABEL = { google: 'Google Agenda', outlook: 'Outlook' }`, using
  `CALENDAR_LABEL[provider] || 'Google Agenda'`.
- `prompts.js:119` sample JSON `"source":"Google Agenda"`.
- `service.js` `calendarEvent.source` default `'Google Agenda'`.
- `normalizeLearningPreferences` and `subject-ai.js` `safePreferences`: provider ∈ {`google`,`outlook`},
  default `google`.

### 5.10 BYOK server handling

- Keys come only from the `x-ai-key` header. They're removed from `req.headers` in guard step 5 and
  live only in `ctx.byok` for the duration of the call.
- They're never included in errors, logs, the store, idempotency records or responses.
- Adapters must never include response bodies from providers in thrown `message`s. Keep the fixed
  pt-BR messages the adapters already use.

### 5.11 Logging

- Add `api/_lib/log.js` with `log(event, fields)` → `console.log(JSON.stringify({event, ...fields}))`,
  plus `logError` using `console.error`.
- Allowed fields: `route`, `code`, `status`, `ms`, `reqId` (`x-vercel-id`), `userHash`
  (`sha256(sub).slice(0,12)`), `provider`, `model`, `reason`, `byok` (boolean).
- Forbidden: headers, bodies, keys, tokens, emails, prompts and outputs. Remove the existing
  `console.error` calls in the handlers in favor of `logError`.

### 5.12 Local dev bypass (keeps `web/` working)

`JOVI_LOCAL_DEV_BYPASS=true` in the local `.env`, honored only when `process.env.VERCEL` is unset.
It skips session, integrity, idempotency and credits. The server uses its own provider (for example
`AI_PROVIDER=gemini` with a local key), and `tts` and `transcribe` use the **server** provider instead
of requiring BYOK. This keeps the web app working exactly as it does today.

Web-side changes:
- `web/services/audio.js` splits text over 2000 chars with `shared/textChunks.js` before calling
  `/api/tts`.
- `web/services/*` read `code` if present, but otherwise stay untouched.
- The README documents: "web só funciona localmente com `JOVI_LOCAL_DEV_BYPASS=true`".

---

## 6. App (React Native / Expo)

### 6.1 Build variants

**`app.config.js`** (new; `app.json` remains the base):

```js
// Variant-specific overrides on top of app.json. APP_VARIANT comes from eas.json (or the shell).
export default ({ config }) => {
  const variant = process.env.APP_VARIANT || 'development';
  const presentation = variant === 'presentation';
  return {
    ...config,
    name: presentation ? 'JOVI Lens Demo' : config.name,
    android: { ...config.android, package: presentation ? 'com.jovilens.app.demo' : 'com.jovilens.app' },
    plugins: config.plugins.map((plugin) => (Array.isArray(plugin) && plugin[0] === 'expo-build-properties'
      ? ['expo-build-properties', { android: { usesCleartextTraffic: variant === 'development' } }]
      : plugin)),
  };
};
```

Verify with `APP_VARIANT=production npx expo config --type public` (and for the other two
variants). **Contingency:** if Expo fails to load the file because the root `package.json` has
`"type": "module"`, rename it to `app.config.ts` with identical content.

**`app.json` changes:**
- `android.permissions`: `["android.permission.CAMERA", "android.permission.READ_CALENDAR", "android.permission.POST_NOTIFICATIONS"]`
- `android.blockedPermissions`: `["android.permission.WRITE_CALENDAR"]`
- `android.allowBackup`: `false`
- plugins: add `"@react-native-google-signin/google-signin"` and `"expo-notifications"`
- Keep `expo-build-properties` in the list (`app.config.js` rewrites its options).
- Remove the `ios` block's `infoPlist`? **No**, leave the `ios` block as is. It's unused but harmless.

**`eas.json`** (exact; replaces the current file):

```json
{
  "cli": { "version": ">= 16.0.0", "appVersionSource": "remote" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "environment": "development",
      "android": { "buildType": "apk" },
      "env": {
        "APP_VARIANT": "development",
        "EXPO_PUBLIC_JOVI_LENS_DEMO_MODE": "false",
        "EXPO_PUBLIC_API_BASE_URL": "http://127.0.0.1:8787",
        "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID": "<GOOGLE_WEB_CLIENT_ID>",
        "EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER": "<PLAY_INTEGRITY_PROJECT_NUMBER>"
      }
    },
    "production": {
      "distribution": "internal",
      "environment": "production",
      "autoIncrement": true,
      "android": { "buildType": "apk" },
      "env": {
        "APP_VARIANT": "production",
        "EXPO_PUBLIC_JOVI_LENS_DEMO_MODE": "false",
        "EXPO_PUBLIC_API_BASE_URL": "https://<VERCEL_DOMAIN>",
        "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID": "<GOOGLE_WEB_CLIENT_ID>",
        "EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER": "<PLAY_INTEGRITY_PROJECT_NUMBER>",
        "ORG_GRADLE_PROJECT_reactNativeArchitectures": "arm64-v8a"
      }
    },
    "presentation": {
      "distribution": "internal",
      "environment": "preview",
      "autoIncrement": true,
      "android": { "buildType": "apk" },
      "env": {
        "APP_VARIANT": "presentation",
        "EXPO_PUBLIC_JOVI_LENS_DEMO_MODE": "true",
        "ORG_GRADLE_PROJECT_reactNativeArchitectures": "arm64-v8a"
      }
    }
  },
  "submit": {}
}
```

The `<...>` placeholders are filled from §2. `EXPO_PUBLIC_JOVI_API_KEY` comes from EAS env (H9) for
`production`, and from the local `.env` for local builds. `ANDROID_BUILD.md` must document that
local release builds need `APP_VARIANT` and the same `EXPO_PUBLIC_*` values exported in the shell.

### 6.2 Dependencies (the complete list of changes)

```bash
npm uninstall expo-auth-session
npx expo install @react-native-google-signin/google-signin expo-secure-store expo-notifications expo-crypto
npx create-expo-module@latest --local jovi-native   # §6.9; accept defaults, then trim as described there
```

After installing, check the actual exported APIs in `node_modules/<pkg>/build/*.d.ts` for
`expo-notifications`, `expo-secure-store` and `expo-crypto`. If a function name used below differs,
use the installed one and note it in the commit message.

**Contingency (google-signin plugin):** if `npx expo prebuild -p android --clean` fails asking for
`iosUrlScheme`, configure the plugin as
`["@react-native-google-signin/google-signin", {"iosUrlScheme": "com.googleusercontent.apps.<the part of GOOGLE_WEB_CLIENT_ID before .apps.googleusercontent.com>"}]`.
The value is irrelevant on Android.

### 6.3 Demo and presentation gating (file by file)

`isDemoMode()` (`services/env.js`) becomes the only switch:
`String(process.env.EXPO_PUBLIC_JOVI_LENS_DEMO_MODE ?? 'false').toLowerCase() === 'true'`. **The
default flips to false.**

| File | Change |
|---|---|
| `context/AppDataContext.jsx` | Define `const DEMO = isDemoMode()` at module level. `samples` = `DEMO ? <current mapping> : []`. `getInitialNotes()`: if `!DEMO`, return `getNotes()` with no merge. `getInitialSubjectArtifacts()`: if `!DEMO`, return `getSubjectArtifacts()` with no merge. `clearLocalData()`: when `!DEMO`, reset to empty notes and artifacts `{}` (no samples); otherwise keep today's behavior. **Remove `plan` state entirely** (`plan`, `setPlan`, `getPlan`/`setPlan` imports, and from the context value) |
| `services/storage.js` | Remove `PLAN_KEY`, `getPlan`, `setPlan`. Add `CALENDAR_SETTINGS_KEY = 'jovi_mobile_calendar_settings_v1'` and `NOTIFICATION_SETTINGS_KEY = 'jovi_mobile_notification_settings_v1'` with getters and setters (JSON) |
| `services/dataTransfer.js` | Remove `plan` from `createBackup` and the parsed backup. Backups never contain session, BYOK or calendar settings |
| `app/(tabs)/profile.jsx` | Remove `DEMO_USER`, `enterDemoAccount`, `activateCopilot`, `startTrial`, and the plan/trial UI and `planTitle`. Keep "Preparar demo" and "Conectar agenda demo" **only inside `{isDemoMode() ? … : null}`**; in demo mode "Preparar demo" sets the demo user and the demo calendar (no plan). Add the cards in §6.5, §6.11 and §6.12 (non-demo only). The clear-data copy is "Os exemplos da demonstração serão mantidos" only in demo mode; otherwise "Essa ação apaga fotos, notas, histórico e preferências deste aparelho." |
| `components/CopilotView.jsx` | Rewritten as the **AI access** screen (§6.6). The tab title stays "Copilot" and the icon stays |
| `components/SubjectStudio.jsx:33` | `const examResult = isDemoMode() ? getPresentationExamResult(subject, rawExamResult) : rawExamResult;` |
| `components/SubjectExam.jsx:113` | Only fall back to `DEMO_SUBJECT_ARTIFACTS` when `isDemoMode()` |
| `shared/studentDashboard.js` | `buildStudentDashboard({..., presentation = false})`. When `!presentation`: no `FALLBACK_SUBJECTS` (empty `subjects` → the dashboard returns `{ empty: true }` and nothing else), no `getPresentationExamResult`, and no História baseline override (lines 89–94). `buildSmartNotifications` gets `presentation` too: when `!presentation`, drop the hard-coded `'História'` fallback, return `[]` if there's no subject, topic or exam, and don't add the static `audio-drive` card |
| `components/StudentDashboard.jsx` | Pass `presentation: isDemoMode()`. Render an empty state when `dashboard.empty`: icon `note`, title "Seu painel aparece aqui", text "Salve notas a partir das suas fotos para ver progresso, provas e revisões." |
| `web/` call sites of `buildStudentDashboard` | Pass `presentation: import.meta.env.VITE_JOVI_LENS_DEMO_MODE === 'true'` |
| `components/SmartImageSheet.jsx:299` and every `services/*` string containing "ative o modo demonstração" | Replace with the §6.7 mapping (no mention of demo mode in non-demo builds) |
| Gallery / Notes / History screens | Add empty states when there's no data (non-demo). Gallery: "Nenhuma foto ainda. Use a câmera para capturar seu primeiro conteúdo." with a button to `/(tabs)/camera`. Notes: "Suas notas aparecem aqui depois que você analisar uma foto." History: "Nada por aqui ainda." |

### 6.4 `services/apiClient.js` (rewrite)

```js
apiRequest(path, {
  method = 'POST', body, signal, timeoutMs,
  idempotent = false,  // true for cost-1 routes
  useByok = true,      // attach BYOK headers if a key is saved
  integrity = true,
})  // → resolves to the parsed JSON on 2xx; throws ApiError otherwise
```

1. Non-demo builds only (in demo mode, services never call this).
2. `bodyString = body === undefined ? '' : JSON.stringify(body)`.
3. Headers:
   - `Content-Type: application/json` (POST)
   - `x-api-key` (if set)
   - `Authorization: Bearer <session>` (if set)
   - `Idempotency-Key: Crypto.randomUUID()`, generated **once per `apiRequest` call** and reused on
     its retry
   - BYOK: `x-ai-provider` and `x-ai-key` from `getByok()` (§6.6), if `useByok` and one is saved for
     the current user
4. Integrity (if `integrity` and `JoviNative` is available):
   - `ts = String(Date.now())`
   - `bodyHash = await Crypto.digestStringAsync(SHA256, bodyString)` (hex)
   - `requestHash = await Crypto.digestStringAsync(SHA256, \`${method}\n${path}\n${bodyHash}\n${ts}\`)`
   - `token = await getIntegrityToken(requestHash)` (§6.10)
   - Set `x-jovi-ts` and `x-play-integrity-token`. If getting a token throws, send the request
     without it; the server decides.
5. `fetch(API_BASE_URL + path)` with an `AbortController` that combines `signal` and `timeoutMs`.
   Default timeouts: analyze 45 s, subject-ai 70 s, video 30 s, tts 45 s, transcribe 45 s, auth 20 s,
   me 15 s, byok/validate 20 s.
6. Response header `x-jovi-credits-remaining` → `aiAccess.setCredits(Number(value))`.
7. **Retry once** after 1 s on a network error or status 502/503/504 (not 4xx), with the same
   idempotency key and a fresh ts and integrity token. An abort by the caller's `signal` is never
   retried.
8. **Session recovery.** If the status is 401 with code `SESSION_INVALID` or `SIGN_IN_REQUIRED`
   **and** a user is stored: `ok = await refreshSession()` (§6.5); if ok, repeat the request once;
   if not, `signOutLocal()` and throw.
9. A non-2xx result throws `new ApiError({ status, code: payload.code || 'UNKNOWN', message: messageFor(payload.code, payload.message) })`.
   A network failure after the retry throws `ApiError({code:'NETWORK', message:'Sem conexão no momento. Confira a internet e tente novamente.'})`.

Update every service to use `apiRequest` and drop its own `fetch`/`response.json()` handling:
`imageAnalysis.js` (`idempotent: true`), `subjectStudy.js` (`idempotent: true`),
`videoRecommendations.js` (`idempotent: true`), `audio.js`, `speechInput.js`, `googleAuth.js`
(`useByok: false`) and the new `aiAccess.js`.

`services/apiErrors.js` (new) holds `ApiError` and `messageFor(code, fallback)` with the client table
in §6.7.

### 6.5 Authentication — `services/googleAuth.js` (rewrite)

```js
import { GoogleSignin, isSuccessResponse, isNoSavedCredentialFoundResponse, statusCodes, isErrorWithCode } from '@react-native-google-signin/google-signin';
GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID });  // once, module level, non-demo only
```

- `signIn()`:
  1. `await GoogleSignin.hasPlayServices()`, then `const r = await GoogleSignin.signIn()`. If not
     `isSuccessResponse(r)`, return `null` (cancelled).
  2. `idToken = r.data.idToken`, then
     `apiRequest('/api/auth/google', { body: { credential: idToken }, useByok: false })`.
  3. `setSessionToken(res.session)`, `aiAccess.setCredits(res.creditsRemaining)`, return `res.user`.
  4. Error mapping: `IN_PROGRESS` → ignore; `PLAY_SERVICES_NOT_AVAILABLE` → "Atualize o Google Play
     Services para entrar."; anything else → "Não foi possível entrar com o Google."
- `refreshSession()`: `r = await GoogleSignin.signInSilently()`. If `isNoSavedCredentialFoundResponse(r)`,
  return false. Otherwise POST its `idToken` to `/api/auth/google` (with no session-recovery
  recursion), store the session, return true. Any throw → false.
- `signOut()`: `GoogleSignin.signOut()` (ignore errors), `setSessionToken(null)`, `setUser(null)`, and
  `aiAccess.reset()`. **BYOK keys are kept** in secure store under the account (§6.6).
- Remove `useGoogleSignIn` / `expo-auth-session` usage. Profile uses these functions directly.

**Profile "Conta" card (non-demo):**
- Signed out: title "Entre para usar a IA", text "Cada conta Google ganha 3 análises gratuitas.",
  and a button "Entrar com Google".
- Signed in: avatar or initial, name, email, and a "Sair" button.

**Sign-in gate:** `services/aiAccess.js` exports `ensureSignedIn()`. With no user, it shows
`Alert.alert('Entre para usar a IA', 'Entre com sua conta Google para analisar fotos e gerar conteúdo.', [{text:'Agora não', style:'cancel'}, {text:'Entrar com Google', onPress: signIn…}])`
and returns false. Call it at the **top of every user action that triggers an AI request**:
- `SmartImageSheet`: analyze trigger, extract, the actions, ask
- `SubjectStudio` (questions), `SubjectExam` (exam), `StudyPlan` (plan), `PodcastPlayer` (script),
  `LessonPlayer` (script), `VideoRecommendations`

It's never called in demo mode.

### 6.6 AI access: credits and BYOK — `services/aiAccess.js` (new) and the Copilot screen

State: a tiny store with `subscribe`, plus a hook `useAiAccess()` →
`{ creditsRemaining: number|null, byok: { provider, masked } | null }`.

- `setCredits(n)`, `reset()`, and `refresh()` → `GET /api/me` (`integrity: false`, `useByok: false`).
  `refresh()` runs on app foreground and after sign-in.
- BYOK storage: `expo-secure-store`, key `byok.<sub>` (sub = the signed-in user's `id`), value
  `JSON.stringify({provider, apiKey})`.
  - `saveByok(provider, apiKey)`: trim the key, then call `/api/byok/validate` **with those headers
    explicitly**. On 200, persist; on 422, throw `BYOK_REJECTED`.
  - `getByok()` returns `{provider, apiKey}` for the current user or null.
  - `removeByok()`.
  - `masked` = the first 3 chars + `…` + the last 4.
- `capabilitiesFor(provider)`: gemini `{tts:true, stt:true}`, openai `{tts:true, stt:true}`, minimax
  `{tts:true, stt:false}`.

**Copilot screen (`components/CopilotView.jsx`)**, non-demo, top to bottom:
1. Header: "Inteligência avançada" / "Copilot" (remove the "DEMO" badge).
2. **"Sua IA" card:**
   - Signed out: sign-in CTA.
   - Signed in without BYOK: "Análises gratuitas: N de 3" with a progress bar, and the text "Cada
     análise de foto, pergunta, plano, prova, podcast, aula ou recomendação usa 1."
   - With BYOK: "Usando sua chave · <Provedor> · <masked>" and "Sem limite de créditos do JOVI Lens —
     o uso é cobrado na sua conta do provedor."
3. **"Usar minha própria chave" card:**
   - Provider selector (Gemini · OpenAI · MiniMax).
   - Key `TextInput` with `secureTextEntry`, `autoCorrect={false}`, `autoCapitalize="none"`,
     `spellCheck={false}`, `importantForAutofill="no"`, `textContentType="none"`.
   - Button "Validar e salvar". When saved: masked display plus "Trocar chave" and "Remover chave".
   - Help text per provider (exact):
     - Gemini: "Crie uma chave gratuita em aistudio.google.com (sem cartão). No plano gratuito o Google pode usar o conteúdo para melhorar seus produtos."
     - OpenAI: "Crie uma chave de projeto em platform.openai.com e defina um limite de gastos mensal para o projeto."
     - MiniMax: "Use uma chave dedicada e mantenha um saldo baixo. Transcrição por voz usa o reconhecimento do aparelho."
   - Warning line: "Sua chave fica criptografada neste aparelho e é enviada apenas para processar cada pedido; o JOVI Lens não a armazena."
4. Demo mode: a single card "Modo demonstração — a IA é simulada e não usa créditos."

### 6.7 Client error mapping (`services/apiErrors.js`)

`messageFor(code, fallback)` uses the server's pt-BR messages from §5.4 for the same codes, plus:
- `NETWORK`: "Sem conexão no momento. Confira a internet e tente novamente."
- `UNKNOWN`: the fallback, or "Não foi possível concluir agora. Tente novamente."

UI actions by code, in the components that show AI errors (`SmartImageSheet`, `SubjectStudio`,
`SubjectExam`, `StudyPlan`, `PodcastPlayer`, `LessonPlayer`, `VideoRecommendations`):

| code | Button under the error |
|---|---|
| `CREDITS_EXHAUSTED`, `BYOK_REJECTED`, `BYOK_INVALID_FORMAT` | "Adicionar minha chave" → `router.push('/(tabs)/copilot')` |
| `SIGN_IN_REQUIRED` (after a failed refresh) | "Entrar com Google" |
| `NETWORK`, `AI_TIMEOUT`, `AI_RATE_LIMITED`, 5xx | "Tentar novamente" (the component's existing retry, or re-invoke the action) |

Implement this as one small component, `components/AiErrorActions.jsx`
(`{ error, onRetry }`), reused by all of them.

### 6.8 TTS and STT on the client

- `shared/textChunks.js` (new): move `chunkText` out of `api/_lib/ai/service.js` (the server imports
  it from there too). Export `TTS_CHUNK_CHARS = 2000`.
- `services/audio.js`:
  - `ttsMode()`: `'browser'` if demo, **or if there's no BYOK**, or if the BYOK provider lacks tts;
    otherwise `'live'`.
  - `fetchLiveTts(text, voice)`: split with `chunkText(text, TTS_CHUNK_CHARS)` and call `/api/tts`
    sequentially per chunk (`idempotent: false`), concatenating the `parts`.
  - `BYOK_REQUIRED` or `BYOK_CAPABILITY_UNSUPPORTED` → return `null` (existing fallback to
    `expo-speech`).
  - `BYOK_REJECTED` → throw, so the player shows `AiErrorActions`.
- `services/speechInput.js`:
  - `voiceInputAvailable()` = `speechRecognitionAvailable() || (!isDemoMode() && byokHasStt())`.
  - `startVoiceInput`: on-device first (unchanged). The server path only when `byokHasStt()`.
  - Server recording auto-stops at **90 s**, which keeps it under the 3.5 MB limit.
- `services/imageAnalysis.js`: after `prepareImageForAI(src, 1600)`, if the base64 length is
  > 3,000,000, re-run with `1200` and `compress: 0.7`. If it's still too large, throw
  `ApiError({code:'PAYLOAD_TOO_LARGE'})`.

### 6.9 Native module `modules/jovi-native` (Android only, Kotlin)

Create it with `npx create-expo-module@latest --local jovi-native`, then:
- Delete the `ios/` folder and any web or view files the template created.
- In `expo-module.config.json`, set `"platforms": ["android"]`.
- In `android/build.gradle` dependencies, add `implementation "com.google.android.play:integrity:1.6.0"`.

Module `Name("JoviNative")`. JS side: `modules/jovi-native/index.js` exports
`requireOptionalNativeModule('JoviNative')`, which is `null` on web or when missing. Every caller
must handle null.

Functions (all `AsyncFunction` with an explicit `Promise` parameter; resolve and reject from Task
listeners, so no coroutine dependency):

| Function | Behavior |
|---|---|
| `prepareIntegrity(cloudProjectNumber: String)` | `IntegrityManagerFactory.createStandard(appContext)` → `prepareIntegrityToken(PrepareIntegrityTokenRequest.builder().setCloudProjectNumber(n.toLong()).build())`. Store the `StandardIntegrityTokenProvider` in a module field. Resolve `null` |
| `requestIntegrityToken(requestHash: String)` | No provider → reject `ERR_INTEGRITY_NOT_PREPARED`. Otherwise `provider.request(StandardIntegrityTokenRequest.builder().setRequestHash(requestHash).build())` → resolve `token.token()`. On a `StandardIntegrityException`, reject with code `ERR_INTEGRITY_PROVIDER_INVALID` when `errorCode == StandardIntegrityErrorCode.INTEGRITY_TOKEN_PROVIDER_INVALID`, else `ERR_INTEGRITY_<errorCode>` |
| `getAccountCalendars(email: String)` | Requires `READ_CALENDAR` to be granted; otherwise reject `ERR_CALENDAR_PERMISSION`. Query `CalendarContract.Calendars.CONTENT_URI` with projection `_ID, CALENDAR_DISPLAY_NAME, ACCOUNT_NAME, ACCOUNT_TYPE, OWNER_ACCOUNT, VISIBLE, SYNC_EVENTS, IS_PRIMARY`, selection `ACCOUNT_TYPE = ? AND LOWER(ACCOUNT_NAME) = LOWER(?)`, args `["com.google", email]`. Resolve `[{id: String, name, isPrimary: Boolean, visible: Boolean, synced: Boolean}]` |
| `getCalendarInstances(calendarIds: List<String>, startMs: Double, endMs: Double)` | Permission check as above. URI = `CalendarContract.Instances.CONTENT_URI.buildUpon()` + `ContentUris.appendId(builder, startMs.toLong())` + `ContentUris.appendId(builder, endMs.toLong())`. Projection `EVENT_ID, BEGIN, END, TITLE, DESCRIPTION, EVENT_LOCATION, ALL_DAY, CALENDAR_ID, STATUS`. Selection `CALENDAR_ID IN (?,…) AND STATUS != 2` (2 = `Events.STATUS_CANCELED`). Sort `BEGIN ASC`, limit 300 rows in code. Resolve `[{eventId: String, begin: Double, end: Double, title, description, location, allDay: Boolean, calendarId: String}]` |

The module only **queries** content providers. It must never call `insert`, `update` or `delete` on
any `ContentResolver`; §11 has the test that guards this.

### 6.10 Integrity on the client — `services/integrity.js` (new)

- `let prepared = null`. `ensurePrepared()` = `prepared ??= JoviNative.prepareIntegrity(process.env.EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER).catch(e => { prepared = null; throw e; })`.
- `getIntegrityToken(hash)`:
  1. `await ensurePrepared()`, then `return await JoviNative.requestIntegrityToken(hash)`.
  2. On `ERR_INTEGRITY_PROVIDER_INVALID` or `ERR_INTEGRITY_NOT_PREPARED`: set `prepared = null`,
     re-prepare, and retry once.
- Call `ensurePrepared()` (fire and forget, errors swallowed) in `app/_layout.jsx` on mount when not
  in demo mode.

**Contingency (integrity off-Play):** if the M6 device test (§12) shows that standard requests fail
for the sideloaded APK (for example `ERR_INTEGRITY_…` cloud-project errors that disappear with
classic requests), switch to **classic** requests:
- New route `GET /api/integrity/nonce` (session auth). It returns
  `{nonce: base64url(random 24 bytes)}` and stores `integ-nonce:{nonce}` for 120 s.
- The client calls `IntegrityManagerFactory.create(ctx).requestIntegrityToken(IntegrityTokenRequest.builder().setNonce(nonce).setCloudProjectNumber(n).build())`
  and sends `x-jovi-nonce`.
- The server checks `requestDetails.nonce === nonce` and that the nonce key exists (then deletes it),
  instead of `requestHash`.
- Classic requests are limited to 5 per app instance per minute, so only the cost-1 routes and
  `auth/google` keep `integrity: true` under this contingency.

### 6.11 Calendar (read-only) — `services/calendarSync.js` (new) + `shared/examDetection.js` (new)

**Permission.** `PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CALENDAR, { title: 'Agenda', message: 'O JOVI Lens lê (sem alterar) as provas da sua agenda Google para planejar seus estudos.', buttonPositive: 'Permitir' })`.

**Settings** (MMKV `jovi_mobile_calendar_settings_v1`):
`{ connected: boolean, account: string, selectedCalendarIds: string[], overrides: { [instanceId]: { subject?: string, type?: 'exam'|'assignment', ignored?: boolean } }, lastSyncAt: string|null, pending: PendingEvent[] }`.

**`connectCalendar(email)`:**
1. Request the permission; denied → message "Permissão negada. Você pode permitir em Configurações > Apps > JOVI Lens > Permissões."
2. `cals = getAccountCalendars(email)`. If empty, show the message "A conta <email> não está neste aparelho ou a sincronização da agenda está desativada." with a button "Abrir contas do Android" → `Linking.sendIntent('android.settings.SYNC_SETTINGS')`.
3. `selectedCalendarIds` = the ids where `visible && synced`, or all of them if that set is empty.
4. `connected = true`, then `syncCalendar()`.

**`syncCalendar()`:**
1. Window `[now, now + 60 days]`.
2. `instances = getCalendarInstances(selected, start, end)`.
3. For each instance, `instanceId = eventId + '-' + begin`, then
   `c = classifyCalendarEvent({title, description}, subjectNames)`, then apply overrides. Skip it if
   `ignored` or `c.type === null`.
4. `startsAt`: all-day events use the UTC date parts of `begin` →
   `new Date(y, m, d, 8, 0).toISOString()`; others use `new Date(begin).toISOString()`.
5. With a subject: an event
   `{ id: instanceId, type, source: 'Google Agenda', subject, title, startsAt, durationMinutes: Math.round((end-begin)/60000), location, topics }`.
   Without a subject: add it to `pending` (`{instanceId, title, startsAt, type}`).
6. `setStudyCalendar({ connected: true, provider: 'google', account: email, syncedAt: now, events })`
   and persist the settings.
7. Then `syncExamReminders(studyCalendar)` (§6.12).

`subjectNames` = the names from `useAppData().subjects` ∪
`DEFAULT_SUBJECTS = ['Matemática','Português','História','Geografia','Biologia','Química','Física','Inglês','Filosofia','Sociologia','Artes','Programação']`,
exported from `shared/examDetection.js`.

**Sync triggers:** after connect, the "Sincronizar agora" button, and `AppState` → `active` when
connected and `lastSyncAt` is more than 15 minutes old. Only while signed in.

**`disconnectCalendar()`:** clear the settings, `setStudyCalendar(EMPTY_STUDY_CALENDAR)`, and cancel
all reminders. Then show the message "Agenda desconectada. Para revogar a permissão, use as
configurações do Android."

**`shared/examDetection.js` — `classifyCalendarEvent({title, description}, subjectNames)` →
`{ type: 'exam'|'assignment'|null, subject: string|null, topics: string[] }`:**
- `norm(s)` = NFD, strip combining marks, lowercase, collapse whitespace.
- `text = norm(title + ' ' + description)`.
- exam if `/\b(prova|avaliacao|teste|simulado|exame|recuperacao|p[1-4])\b/` matches `norm(title)`;
  else assignment if `/\b(trabalho|entrega|seminario|atividade|lista de exercicios)\b/` matches
  `norm(title)`; else `null`.
- subject = the first `subjectNames` entry whose `norm(name)` appears as a whole word in `text`.
  Otherwise use the alias map
  `{ matematica:['mat'], portugues:['port','lingua portuguesa','redacao'], historia:['hist'], geografia:['geo'], biologia:['bio'], quimica:['quim'], fisica:['fis'], ingles:['ing','english'] }`
  (alias as a whole word). Return the canonical name from `subjectNames` (with accents); otherwise
  `null`.
- topics = description lines that start with `-`, `•` or `*`, with the marker stripped and trimmed,
  sliced to 80 chars, at most 8.

**`shared/studyCalendar.js`:**
- `provider` accepts `'google'` or `'outlook'` (outlook = demo only).
- `normalizeEvent` source default `'Google Agenda'`.
- Everything else is unchanged.

**Profile "Agenda Google" card (non-demo):**
- Signed out: "Entre com Google para sincronizar sua agenda."
- Not connected: text "Leitura somente — o JOVI Lens nunca cria ou altera eventos." and a button
  "Conectar agenda".
- Connected:
  - Account, "Sincronizado <relative time>", and the button "Sincronizar agora".
  - Calendar checkboxes (name, primary first).
  - "Provas detectadas" list, next 5: title, date (`formatEventDate`), and a subject chip. Tapping
    the chip opens a picker of `subjectNames` plus "Não é prova", which sets `ignored`.
  - The "Sem matéria" list from `pending`, with the same picker.
  - Button "Desconectar".

### 6.12 Exam reminders — `shared/examReminders.js` (new) + `services/notifications.js` (new)

**`buildExamReminders(calendar, now)`** (pure; tested):
- For each event with `type === 'exam'`, for each `offsetDays` in `[3, 1]`:
  - `fireAt` = the local date of `startsAt` minus `offsetDays`, at **19:00** local time.
  - Skip it if `fireAt <= now` or `startsAt > now + 60 days`.
  - `id = \`exam-${event.id}-${offsetDays}d\``.
  - title = `offsetDays === 3 ? \`Prova de ${subject} em 3 dias\` : \`Prova de ${subject} amanhã\``.
  - body = `\`${event.title} · ${formatEventDate(event)}. Revise ${topics.slice(0,2).join(' e ') || 'os principais tópicos'} hoje.\``.
  - data = `{ subject }`.
- Returns the array sorted by `fireAt`.

**`services/notifications.js`:**
- `Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) })`
  at module load.
- `setupChannel()`: `setNotificationChannelAsync('exam-reminders', { name: 'Lembretes de prova', importance: AndroidImportance.HIGH })`.
- Settings (MMKV `jovi_mobile_notification_settings_v1`): `{ examReminders: boolean }`, default
  `false`.
- `enableExamReminders()`: `setupChannel()`, then `requestPermissionsAsync()`. If not granted:
  settings stay false, return `'denied'`. Otherwise set true and
  `syncExamReminders(currentCalendar)`.
- `disableExamReminders()`: set false and cancel every scheduled id starting with `exam-`.
- `syncExamReminders(calendar)`: no-op unless enabled and permission is granted.
  1. `desired = buildExamReminders(calendar, new Date())`.
  2. `existing = getAllScheduledNotificationsAsync()` filtered to ids starting with `exam-`.
  3. Cancel the existing ones not in `desired` (by identifier).
  4. For each desired entry not already scheduled:
     `scheduleNotificationAsync({ identifier: id, content: { title, body, data }, trigger: { type: SchedulableTriggerInputTypes.DATE, date: fireAt, channelId: 'exam-reminders' } })`.
- Also call `syncExamReminders` on app start (after context loads) and after every
  `setStudyCalendar`.

**Tap handling (`app/_layout.jsx`):**
- On mount (non-demo and demo alike), handle `getLastNotificationResponseAsync()` and
  `addNotificationResponseReceivedListener`.
- With `response.notification.request.content.data.subject`, call
  `router.push({ pathname: '/(tabs)/notes', params: { subject } })`.
- `app/(tabs)/notes.jsx` reads `useLocalSearchParams().subject`. When it matches a subject, it calls
  `openStudio(subject)` and then `router.setParams({ subject: undefined })`.

**Profile "Lembretes de prova" card:**
- A `Switch`. Turning it on calls `enableExamReminders()`. On `'denied'`, show "Permita
  notificações nas configurações do Android para receber lembretes." with a button
  `Linking.openSettings()`.
- Subtext: "Aviso às 19h, 3 dias e 1 dia antes de cada prova da sua agenda."

In the presentation build the same reminders work off the demo calendar.

### 6.13 Android hardening (checklist)

- `allowBackup: false`; `usesCleartextTraffic` true only for `development`.
- `WRITE_CALENDAR` blocked.
- `EXPO_PUBLIC_API_BASE_URL` must start with `https://` unless `APP_VARIANT` is `development`.
  `apiClient.js` throws at startup in non-dev builds otherwise.
- The BYOK key isn't kept in React state after saving: clear the input and keep only the masked
  value in state.

### 6.14 Session and storage invariants

- MMKV holds the session token (existing), user, notes, and so on.
- BYOK is **only** in `expo-secure-store`.
- `createBackup` never includes the session, BYOK, or calendar or notification settings.

### 6.15 Privacy page (`public/privacy.html`, pt-BR)

Sections (plain HTML, one page):
1. **Quem somos:** um projeto acadêmico, with the contact email **`contato@exemplo.com`**. This is a
   deliberate placeholder decided by the project owner. Use it as is, and leave it as the only
   placeholder in the project, to be replaced before real distribution.
2. **Dados da conta Google:** id, email and name, used only to identify the account and count the 3
   free credits. The session lasts 30 days.
3. **Fotos, textos e áudios:** sent to the AI provider only to process each request. They aren't
   stored by the JOVI Lens server. Free credits use Google Gemini (free tier), whose content may be
   used by Google to improve its products. With your own key, the chosen provider processes the
   content under your account's terms.
4. **Sua chave de IA:** stored encrypted on the device, sent over HTTPS per request, never stored or
   logged by the server.
5. **Agenda:** read-only, on the device, for the Google account you signed in with. Events are never
   created or changed. Only the title, date, subject and topics of up to 5 upcoming exams are sent
   with study requests.
6. **Notificações:** local only.
7. **Verificação do aparelho:** the Google Play Integrity check, which verifies that the official
   app is running on an unmodified device.
8. **Exclusão:** "Apagar dados" in the app removes local data. For account credit records, email
   the contact.

### 6.16 Versioning

- `app.json`: `expo.version` = **`1.1.0`**. Leave `android.versionCode` at `4`: EAS builds use the
  remote version (`appVersionSource: "remote"` + `autoIncrement`), and only local Gradle builds read
  the `app.json` value. For a local release build, bump `versionCode` by hand above the last
  installed one.
- Root `package.json` `version` = `1.1.0`.
- The git tag `v1.1.0` is created at the end of M8, on the commit that passes the QA.

### 6.17 CI — `.github/workflows/check.yml` (new, added in M1)

```yaml
name: check
on:
  push:
    branches: [main, prod_app]
  pull_request:
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run check
      - run: npm ci
        working-directory: web
      - run: npm test
        working-directory: web
```

It needs no secrets. Tests use the in-memory store and mocked `fetch` (§11). The live smoke test
`scripts/smoke-ai.js` is **not** part of CI.

---

## 7. Shared code summary (new or changed files in `shared/`)

| File | Status |
|---|---|
| `shared/textChunks.js` | new: `chunkText`, `TTS_CHUNK_CHARS` |
| `shared/examDetection.js` | new: `classifyCalendarEvent`, `DEFAULT_SUBJECTS`, `norm` |
| `shared/examReminders.js` | new: `buildExamReminders` |
| `shared/studyCalendar.js` | provider `google` |
| `shared/studentDashboard.js` | `presentation` flag |

---

## 8. Web app (`web/`) — keep it working locally

- Only the changes in §5.12 and the `buildStudentDashboard` call-site flag.
- No sign-in requirement is added to web. It runs against the local server with
  `JOVI_LOCAL_DEV_BYPASS=true`.
- `cd web && npm test` must still pass.

---

## 9. Files to delete or retire

- `api/_lib/attestation.js` is rewritten (§5.8).
- `isRateLimited`, `isDailyLimited`, `clientKey` and `rateBuckets` are deleted.
- `services/googleAuth.js` is rewritten, and `expo-auth-session` is removed.
- The `plan` state and storage are removed.
- `auth-plan.md`: add a header note at the top: "Superseded by prod-plan.md / prod-implementation-spec.md; kept for history."

---

## 10. Documentation to update

| File | Update |
|---|---|
| `README.md` | Production architecture (Vercel + Upstash + Gemini), the variants (development / production / presentation), local dev (server with `JOVI_LOCAL_DEV_BYPASS` for web; `JOVI_REQUIRE_INTEGRITY=false` for phone dev builds), the runbook (reset a user's credits via the Upstash console `SET credits:<sub> 3`; rotate `JOVI_API_KEY` = new app build + Vercel env; rotate `JOVI_SESSION_SECRET` = everyone re-signs in silently), and the provider table with Gemini and OpenAI marked implemented |
| `.env.example` | Exactly the §3.1 server vars plus the §3.2 `EXPO_PUBLIC_*` vars, with comments. No real values |
| `ANDROID_BUILD.md` | EAS profiles, the local release build env (`APP_VARIANT` + `EXPO_PUBLIC_*`), arm64-only, uninstall v1.0.4 first, and how to get the SHA-1 and SHA-256 |
| `prod-plan.md` | Link to this spec at the top |

---

## 11. Tests (`node --test`, in `tests/`; add `tests/helpers/http.js`)

`tests/helpers/http.js`:
- `makeReq({method, headers, body})` returns a `Readable` whose data is `JSON.stringify(body)` and
  which carries `headers` and `method`.
- `makeRes()` records `status`, `headers` and `json`.
- `withEnv(vars, fn)` restores `process.env` afterward.
- Every test runs against the **in-memory store**, with `JOVI_REQUIRE_INTEGRITY` unset unless it's
  testing integrity.

| Test file | Must assert |
|---|---|
| `guard.test.js` | Each §5.3 step returns its exact status and code: 405, 415, 413, 400 INVALID_JSON, 401 API_KEY_INVALID and 429 after 20 bad keys (and valid keys never 429 on that bucket), 401 SIGN_IN_REQUIRED and SESSION_INVALID, 429 RATE_LIMITED, 403 BYOK_REQUIRED, 400 BYOK_CAPABILITY_UNSUPPORTED (minimax + stt), 400 IDEMPOTENCY_KEY_REQUIRED |
| `credits.test.js` | A new user has 3. Three successful analyze calls → the 4th is 402. A failed `run` refunds. Replaying the same Idempotency-Key returns the stored body with no second charge. A concurrent duplicate → 409. A BYOK call doesn't charge. tts/transcribe never charge. `x-jovi-credits-remaining` is correct |
| `authGoogle.test.js` | Mocked tokeninfo: a new account initializes to 3 and returns `creditsRemaining`. A second sign-in doesn't reset. The signup limit per IP → 429 SIGNUP_LIMITED and the credits key is deleted |
| `integrity.test.js` | Mocked token endpoint and decode endpoint. Happy path passes. Each failure reason (pkg, hash, unevaluated, cert, device, stale_ts, replay) → 403. Google 5xx → 503. The SA JWT is RS256 with the right claims (generate a test RSA key with `crypto.generateKeyPairSync`) |
| `byokRedaction.test.js` | With `x-ai-key: sk-TESTKEY-DO-NOT-LOG-1234567890`, every route (success, provider 401, provider 500, validation error): captured `console.log/error/warn` output and all response bodies never contain the key. `req.headers['x-ai-key']` is undefined after the guard |
| `geminiProvider.test.js` | Request URL, headers and body shape for complete (text + image), speak (mp3, voice, style, language), transcribe. Response parsing for text and audio. 429 → AI_RATE_LIMITED, 401 → AI_PROVIDER_AUTH, abort → AI_TIMEOUT. Credentials override the env key |
| `openaiProvider.test.js` | Same coverage for the OpenAI adapter |
| `store.test.js` | Memory store semantics. The Upstash store builds the correct REST bodies (mock fetch), including EVAL and the pipeline |
| `examDetection.test.js` | prova/P2/simulado → exam; entrega → assignment; others null. Accent-insensitive subject match; aliases; topics from bullet lines |
| `examReminders.test.js` | 19:00 local at −3 d and −1 d; past triggers skipped; assignments ignored; the id format |
| `studyCalendar.test.js` (update) | Provider `google` accepted |
| `studentDashboard.test.js` (update) | `presentation:false` with empty subjects → `{empty:true}`; no História baseline override; `presentation:true` keeps the old behavior |
| `nativeReadOnly.test.js` | Greps `modules/jovi-native/android/**/*.kt` and fails on `.insert(`, `.update(`, `.delete(`, `applyBatch`, or `WRITE_CALENDAR`. Also asserts that `app.json` has `WRITE_CALENDAR` in `blockedPermissions` |
| Existing tests | Update for the new handler signatures (`videoRecommendationsHandler.test.js`, `azureOpenAIAudio.test.js`); all must pass |

The app UI has no automated tests (there's no RN test infrastructure). It's covered by the device QA
script in §13.

---

## 12. Milestones (order and acceptance criteria)

Each milestone ends with `npm run check` passing and a commit.

| # | Scope | Acceptance |
|---|---|---|
| **M1** | §6.17 CI workflow; §5.1 Vercel files; §5.2 store; §5.3 guard; §5.4 errors; §5.5 routes (except integrity: `integrity:true` specified but not enforced yet since the env flag is off); §5.6 credits; §5.11 logging; §5.12 bypass; local-api changes; handler refactor; `/api/me`; tests `guard`, `credits`, `store`, `authGoogle` | Tests pass. with `JOVI_LOCAL_DEV_BYPASS=true` in the root `.env`, `cd web && npm run dev` (starts `server/local-api.js` and Vite): the web app analyzes a photo end to end. [HUMAN H7] deploy: `GET https://<domain>/api/me` without auth → 401 SIGN_IN_REQUIRED; `/privacy.html` loads |
| **M2** | §5.9 Gemini + OpenAI adapters, provider interface with credentials, MiniMax `validateKey`, `/api/byok/validate`, calendar wording; tests `geminiProvider`, `openaiProvider`, `byokRedaction` | Tests pass |
| **M3** | **Live smoke test** (needs H6): a script `scripts/smoke-ai.js` (Node) calls the Gemini adapter directly with the server key: complete (text), complete (a tiny JPEG from `assets/demo/`), speak (the 2000-char pt-BR sample), transcribe (the speak output). It prints the mime, sizes and timings. Apply §5.9 contingencies only if needed | All 4 succeed. TTS mime is `audio/mpeg`, or the WAV contingency is applied. The 2000-char TTS base64 is < 4,000,000 |
| **M4** | App foundations: §6.1 variants, §6.2 deps, §6.3 gating, §6.4 apiClient, §6.7 errors + `AiErrorActions`, §6.8 TTS/STT, empty states, lint to 0 new warnings | `APP_VARIANT=presentation` dev run behaves like today's demo. `APP_VARIANT=development` shows an empty gallery and notes, and AI actions prompt for sign-in |
| **M5** | §6.5 native Google sign-in, §6.6 credits + BYOK UI | On a dev build against the local server (with `JOVI_REQUIRE_INTEGRITY=false`, bypass off): sign in → credits 3 → analyze → 2 → … → 402 → "Adicionar minha chave" → save a Gemini key → analyze works with no credit change; TTS is live with BYOK and device voice without it |
| **M6** | §6.9 native module (integrity part), §6.10, §5.8 server verification, `integrity.test.js` | [HUMAN H1, H2, H5] A release-signed APK against the **Production** deployment (Preview is protected, see H7) with `JOVI_REQUIRE_INTEGRITY=true`: calls succeed. The **same APK re-signed with a different key** (`apksigner sign --ks other.jks`) → every AI call returns `INTEGRITY_FAILED`. Apply the §6.10 contingency only if standard requests fail off-Play |
| **M7** | §6.9 calendar functions, §6.11, §6.12, `examDetection`/`examReminders`/`nativeReadOnly` tests | On a device with a Google account holding a test event "Prova de História" in 4 days: connect → the event appears with subject História → enabling reminders schedules 2 notifications (visible via a temporary debug log of `getAllScheduledNotificationsAsync` that's removed before commit) → tapping a delivered test notification (set one 1 min ahead in a dev-only branch, then remove it) opens the História studio. `adb shell dumpsys package com.jovilens.app \| grep WRITE_CALENDAR` shows it's not granted or requested |
| **M8** | §6.15 privacy page, §10 docs, `eas.json` final, §6.16 version bump, production and presentation EAS builds [HUMAN H9], and the §13 QA on a physical device | QA checklist passes. Tag `v1.1.0` |

---

## 13. Device QA script (production APK, fresh install)

1. Install the production APK (uninstall any old JOVI Lens first). The gallery, notes and dashboard
   are empty, with their empty states.
2. Take a photo → "Analisar" → the sign-in prompt appears → sign in with Google → the analysis
   completes → Copilot shows "2 de 3".
3. Ask a follow-up question → "1 de 3". Generate a study plan → "0 de 3". Generate a podcast →
   CREDITS_EXHAUSTED with an "Adicionar minha chave" button.
4. Play a note narration without a key → the device voice.
5. Add an invalid key → "Sua chave de IA foi recusada…". Add a valid Gemini key → Copilot shows
   "Usando sua chave".
6. Generate a podcast → plays with live voices. Generate a lesson and an exam. Ask a question by
   voice (server STT via Gemini).
7. Switch the key to MiniMax → voice input uses on-device recognition.
8. Connect the calendar → detected exams are listed. Assign a subject to a pending event. The plan
   generation mentions the exam date.
9. Enable exam reminders → the permission prompt → enabled.
10. Sign out and sign in again → still "0 de 3" free credits, and the BYOK key is still present.
11. Airplane mode → any AI action shows "Sem conexão…" with "Tentar novamente".
12. Install the presentation APK alongside → the demo works offline with sample data, and neither
    app affects the other.
13. Re-signed APK (from M6) → `INTEGRITY_FAILED`.

---

## 14. Known limitations (accepted; don't "fix")

- Farming Google accounts gets 3 credits each. It's mitigated by integrity (real devices only) and a
  limit of 25 new accounts per IP per day.
- Calendar freshness depends on Android's own Google sync.
- If the Gemini free tier hits its rate limits, users see `AI_RATE_LIMITED`. Raising the limits
  means enabling billing on the server key (a [HUMAN] decision).
- A rooted device can extract a stored BYOK key. Integrity refuses such devices for server calls,
  but it can't protect local storage.
