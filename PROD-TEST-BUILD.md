# Production test build — what is needed

The shortest path from the current `prod_app` to a production APK on a phone, talking to a
live backend. It uses **MiniMax** as the server AI provider for free credits and keeps **Play
Integrity off** while testing. For the full launch (integrity on, device QA, tag), follow
[`SETUP-CHECKLIST.md`](SETUP-CHECKLIST.md) afterwards.

The code needs no further changes for this. Everything below is accounts and configuration.

## 1. Secrets to generate

- [ ] `openssl rand -hex 32` → **`JOVI_API_KEY`** (shared by the server and the app)
- [ ] `openssl rand -hex 32` → **`JOVI_SESSION_SECRET`** (server only)
- [ ] Your MiniMax key → **`MINIMAX_API_KEY`** (server only). Keep a low balance on that account:
  it pays for every free user's credits (3 per Google account, up to 25 new accounts per IP per day).

## 2. Expo / EAS project and keystore

- [ ] `npm install -g eas-cli` and `eas login`.
- [ ] `eas init` in the repo root. It writes `extra.eas.projectId` into `app.json`. **Commit it.**
- [ ] `eas credentials -p android` → **Set up a new keystore**.
  - Note the **SHA-1** (needed in §3).
  - Download the keystore and keep an **offline backup**. Losing it means testers must uninstall to
    update.

## 3. Google Cloud (sign-in)

Every AI feature requires Google sign-in, so without this the production app does nothing useful.

- [ ] Create a Google Cloud project (e.g. `jovi-lens`). Note its **project number**.
- [ ] **OAuth consent screen:** External, *Testing* mode. Add every tester's Google account as a
  **test user** (only they can sign in while in Testing).
- [ ] **OAuth client — Web application.** Its client ID is used twice:
  `GOOGLE_CLIENT_ID` on Vercel and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in `eas.json`.
- [ ] **OAuth client — Android:** package **`com.jovilens.app`**, SHA-1 from §2. Nothing to copy
  from it; it only has to exist for sign-in to work in the release APK.

## 4. Vercel backend

- [ ] vercel.com → **Add New → Project** → import `VictorHeineken/jovi-lens-mobile`.
  - Framework preset **Other**, root directory = repo root. Leave build/output settings alone
    (`vercel.json` sets them).
- [ ] Settings → General → **Node.js 22.x**.
- [ ] Settings → Git → **Production Branch = `prod_app`** (keeps `main` as the demo).
- [ ] Storage → Marketplace → **Upstash Redis** (free) → connect to the project, Production
  environment. This adds `KV_REST_API_URL` / `KV_REST_API_TOKEN`.
- [ ] Settings → Deployment Protection → on for **Preview only**. Production must stay public.
- [ ] Settings → Environment Variables → **Production**:

| Variable | Value |
|---|---|
| `AI_PROVIDER` | `minimax` |
| `MINIMAX_API_KEY` | from §1 |
| `GOOGLE_CLIENT_ID` | Web client ID from §3 |
| `JOVI_API_KEY` | from §1 |
| `JOVI_SESSION_SECRET` | from §1 |
| `JOVI_REQUIRE_INTEGRITY` | `false` |
| `PLAY_INTEGRITY_PROJECT_NUMBER` | `0` (placeholder while integrity is off) |
| `PLAY_INTEGRITY_CERT_SHA256` | `placeholder` |
| `PLAY_INTEGRITY_SA_JSON_B64` | `placeholder` |

  Do **not** set `JOVI_LOCAL_DEV_BYPASS`. The three `PLAY_INTEGRITY_*` placeholders only satisfy the
  startup check; they are not read while `JOVI_REQUIRE_INTEGRITY=false`. Replace them before
  sharing the APK beyond the test group.

- [ ] Deployments → latest `prod_app` → **Redeploy** (variables only apply to new deployments).
- [ ] **Check:**

  ```bash
  curl -s https://<VERCEL_DOMAIN>/api/me -H "x-api-key: <JOVI_API_KEY>"
  # expected: {"code":"SIGN_IN_REQUIRED",...}
  ```

  `SERVER_MISCONFIGURED` → the function logs have a `server_misconfigured` line listing the missing
  variable names. Also open `https://<VERCEL_DOMAIN>/privacy.html`.

- [ ] Optional hardening: add a Vercel WAF custom rule that blocks `/api/*` requests without an
  `x-api-key` header, so junk traffic doesn't use up the Upstash free quota (500K commands/month).

## 5. App configuration

- [ ] In **`eas.json`**, `build.production.env`, replace the placeholders and commit:

| Key | Value |
|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | `https://<VERCEL_DOMAIN>` (must be HTTPS) |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | the **Web** client ID from §3 (not the Android one) |
| `EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER` | project number from §3, or `0` for now |

- [ ] Store the shared key as a sensitive EAS variable (same value as Vercel's `JOVI_API_KEY`;
  missing or different → every call answers `API_KEY_INVALID`):

  ```bash
  eas env:create --environment production --name EXPO_PUBLIC_JOVI_API_KEY \
    --value <JOVI_API_KEY> --visibility sensitive
  ```

## 6. Build and install

- [ ] The backend check in §4 passes first.
- [ ] `eas build --profile production --platform android`
- [ ] On the test phone, uninstall any older build first (`adb uninstall com.jovilens.app`); there
  is no data migration.
- [ ] Install the APK from the EAS build page.

## 7. First test on the phone

- [ ] Perfil → **Entrar com Google** → the account card shows the user, and the **Sua IA** card below
  it shows "Análises gratuitas: 3 de 3".
- [ ] Take a photo → Analisar → the counter drops to 2. Repeat until 0; the next AI action shows
  "Adicionar minha chave".
- [ ] Perfil → **Usar minha própria chave** → MiniMax → paste a key → "Validar e salvar". AI calls now
  work without spending credits, and podcasts/lessons use AI voices.
- [ ] Hoje, Notas → Estúdio (questions with spaced review and written-answer correction, exam,
  podcast, plan) and backup export/import in Perfil.

## Known risks

- **Native module never compiled.** The Kotlin in `modules/jovi-native` has never been built (no
  Android SDK was available). The first EAS build may fail in Gradle; the fix needs that build log.
- **MiniMax key type.** A key starting with `sk-cp-` may be a Coding Plan key; confirm it works for
  the regular chat and vision endpoints. The adapter defaults to model `MiniMax-M3`; set
  `MINIMAX_CHAT_MODEL` on Vercel if the key has no access to it.
- **Nothing is device-tested yet.** Expect a round of fixes after the first install.
- **Hobby logs last 1 hour.** Check Vercel's function logs soon after a failure.

## Faster alternative (no backend)

The **presentation** build needs only §2 (EAS project and keystore):
`eas build --profile presentation --platform android`. It is fully offline with demo data and
installs next to the production app (`com.jovilens.app.demo`), but it does not exercise the
backend, sign-in or credits.
