# JOVI Lens

Experiência de estudo "foto → IA → aprendizado" do projeto JOVI. Este repositório contém:

- **App React Native (Expo)** — nesta pasta raiz (`app/`, `components/`, `services/`, `context/`, ...).
  Distribuído **apenas como APK Android instalado manualmente** (sem Play Store). iOS e web não são
  publicados.
- **Backend** — `api/` (Vercel Functions) + `server/local-api.js` (wrapper HTTP para rodar `api/`
  localmente).
- **App web (Vite + React)** — em [`web/`](web/README.md). Não é publicado, mas continua funcionando
  **localmente** (veja [Desenvolvimento local](#desenvolvimento-local)).

O plano de produção está em [`prod-plan.md`](prod-plan.md) (o porquê de cada decisão) e
[`prod-implementation-spec.md`](prod-implementation-spec.md) (o que foi construído e como).

```text
jovi-lens-mobile/
  api/                  backend (Vercel Functions): IA, login, créditos, integridade
  server/               servidor HTTP local que expõe api/ em 127.0.0.1:8787
  shared/               lógica usada pelos clientes e pelo backend — uma cópia só
  public/               página estática do backend (index + política de privacidade)
  modules/jovi-native/  módulo nativo Android (Play Integrity + leitura da agenda)
  app/, components/,    app React Native (Expo) — roda a partir da raiz
  hooks/, services/,
  context/, app.json,
  app.config.js, eas.json
  web/                  app web (Vite + React) — veja web/README.md
  tests/                testes de shared/ e api/ — `npm test` na raiz
  .env, .env.example    variáveis do backend e dos clientes
```

## Arquitetura de produção

```text
APK Android ──HTTPS──► Vercel Functions (api/, região gru1) ──► Google Gemini (créditos gratuitos)
  Google sign-in           │  guard: API key, sessão, Play Integrity,        ou o provedor da chave
  Play Integrity           │  rate limit, idempotência, créditos             do usuário (BYOK)
  chave BYOK (secure store)└► Upstash Redis (REST): créditos, rate limits, idempotência, replay
```

- **Login Google obrigatório** para qualquer chamada de IA (módulo nativo
  `@react-native-google-signin/google-signin`). O backend troca o id_token por uma sessão própria de 30 dias.
- **3 créditos por conta Google, para sempre.** 1 crédito = 1 geração de IA (análise de foto, pergunta,
  plano, prova, podcast, aula ou recomendação). Falhas são estornadas; repetições com a mesma
  `Idempotency-Key` não cobram de novo.
- **Traga sua própria chave (BYOK):** Gemini, OpenAI ou MiniMax. A chave fica no `expo-secure-store`, vai
  em cada pedido e nunca é armazenada nem registrada pelo servidor. Chamadas BYOK não gastam créditos.
  Vozes da IA (TTS) e transcrição no servidor (STT) exigem BYOK; sem chave o app usa a voz e o
  reconhecimento do próprio aparelho.
- **Play Integrity** (requisições *standard*, número do projeto Cloud, fora da Play Store): o servidor
  confere pacote, certificado de release, `MEETS_DEVICE_INTEGRITY`, requestHash e replay.
- **Agenda somente leitura** do aparelho (`CalendarContract`), limitada à conta Google conectada;
  `WRITE_CALENDAR` é bloqueada no manifesto. **Lembretes de prova** locais às 19h, 3 dias e 1 dia antes.

### Variantes do app

| Variante (`APP_VARIANT`) | Pacote | O que é |
|---|---|---|
| `development` | `com.jovilens.app` | Dev client; HTTP em claro permitido para a API local (`127.0.0.1:8787` via `adb reverse`) |
| `production` | `com.jovilens.app` | APK distribuído; só HTTPS; login, créditos, BYOK e integridade |
| `presentation` | `com.jovilens.app.demo` | Demo 100% offline com dados de exemplo (`EXPO_PUBLIC_JOVI_LENS_DEMO_MODE=true`), sem login, créditos ou integridade. Pode ser instalada ao lado da produção |

Os perfis estão em [`eas.json`](eas.json); `app.config.js` aplica as diferenças sobre o `app.json`.
Instalações antigas (v1.0.4) não são migradas: desinstale antes de instalar a v1.1.0.

## IA

Cada provedor vive em `api/_lib/ai/providers/<nome>.js` e implementa a mesma interface (`capabilities`,
`isConfigured`, `complete`, `speak`, `transcribe`, `validateKey`), aceitando credenciais do usuário
(`{ apiKey }`) no lugar da chave do servidor. `AI_PROVIDER` escolhe o provedor pago pelo servidor
(`gemini` em produção); o provedor BYOK vem do header `x-ai-provider` de cada pedido.

| Provedor | Chat/Visão | TTS | STT | Uso |
|---|---|---|---|---|
| Google Gemini | ✅ | ✅ | ✅ | Servidor (créditos gratuitos) e BYOK |
| OpenAI | ✅ | ✅ | ✅ | BYOK |
| MiniMax | ✅ | ✅ | ❌ | BYOK (voz por reconhecimento do aparelho) |
| Azure OpenAI | ✅ | ✅ | ✅ | Opcional, só como provedor do servidor |

`scripts/smoke-ai.js` testa o adaptador Gemini ao vivo com a chave do servidor
(`node --env-file=.env scripts/smoke-ai.js`); não faz parte do CI.

## Variáveis

Copie `.env.example` para `.env` na raiz e preencha localmente. O backend lê as variáveis sem prefixo,
o app web as `VITE_` e o app nativo as `EXPO_PUBLIC_`. Chaves de provedor de IA são sempre server-only.
A lista completa, com padrões, está no `.env.example` e em `prod-implementation-spec.md` §3.

Na Vercel, se qualquer variável obrigatória faltar, toda rota responde `503 SERVER_MISCONFIGURED` e o log
de inicialização lista os nomes que faltam (nunca os valores).

## Desenvolvimento local

**Backend + app web** — o web só funciona localmente com `JOVI_LOCAL_DEV_BYPASS=true`:

```bash
# .env: JOVI_LOCAL_DEV_BYPASS=true, AI_PROVIDER=gemini e GEMINI_API_KEY=<sua chave>
cd web
npm install
npm run dev        # sobe server/local-api.js e o Vite
```

O bypass (ignorado sempre que `VERCEL` está definido) pula sessão, integridade, idempotência e créditos;
TTS e transcrição usam o provedor do servidor. Rate limits continuam valendo.

**App no celular (dev build)** — rode a API local com `JOVI_REQUIRE_INTEGRITY=false` e **sem** o bypass,
para testar login, créditos e BYOK de verdade:

```bash
npm install
npx eas build --profile development --platform android   # ou: APP_VARIANT=development npm run android
node --env-file=.env server/local-api.js
scripts/phone-dev.sh     # adb por Wi-Fi + adb reverse da porta 8787
npm start
```

Nenhum código deste app roda em Expo Go (módulos nativos próprios e de terceiros). Para compilar o APK
localmente e testá-lo em um aparelho, veja o [guia de build e teste no Android](ANDROID_BUILD.md).

**Demo offline** — `APP_VARIANT=presentation EXPO_PUBLIC_JOVI_LENS_DEMO_MODE=true npm start`.

## Runbook de produção

- **Zerar/ajustar os créditos de um testador:** no console do Upstash, `SET credits:<sub> 3` (`<sub>` é o
  id da conta Google, o mesmo `user.id` que `/api/me` devolve).
- **Trocar `JOVI_API_KEY`:** gere um valor novo (`openssl rand -hex 32`), atualize na Vercel e no EAS
  (`EXPO_PUBLIC_JOVI_API_KEY`) e publique um novo build do app — builds antigos passam a receber
  `401 API_KEY_INVALID`.
- **Trocar `JOVI_SESSION_SECRET`:** atualize na Vercel. Todas as sessões ficam inválidas e cada usuário
  entra de novo silenciosamente (login Google silencioso) no próximo pedido.
- **Testar uma mudança arriscada:** Preview da Vercel é protegido e o app não consegue chamá-lo. Use
  Production com `JOVI_REQUIRE_INTEGRITY=false` temporariamente, nunca abra o Preview.
- **Política de privacidade:** `https://<domínio>/privacy.html` (arquivo `public/privacy.html`).

## Testes

```bash
npm test        # tests/ — shared/ e api/_lib/
cd web && npm test   # web/tests/ — só o que é específico do app web
```

A suíte da raiz cobre `shared/` (a lógica que os clientes e o backend usam), o pipeline de rotas
(`guard`, créditos, idempotência, login, integridade, redação de chaves BYOK) e os adaptadores de IA, sempre
com o store em memória e `fetch` simulado — sem segredos. O CI (`.github/workflows/check.yml`) roda
`npm run check` e os testes do web a cada push. Em `web/tests/` fica apenas o que é genuinamente específico do app web, como
`dataTransfer` — a contraparte nativa usa o sistema de arquivos em vez de `Blob`.

## Lint

```bash
npm run lint       # eslint .
npm run lint:fix    # eslint . --fix
npm run check       # lint + test
```

Um único `eslint.config.js` na raiz cobre os dois clientes, `shared/` e o backend, cada um com o
conjunto de regras certo — em especial a11y: `eslint-plugin-jsx-a11y` (web, DOM) e
`eslint-plugin-react-native-a11y` (app nativo, `<Pressable>`/`<Image>`) checam coisas diferentes e
nenhum dos dois entende o componente do outro cliente.

`package.json` tem um campo `overrides` para `eslint-plugin-react-native-a11y` — esse pacote só
declara suporte a `eslint@^3` até `^8` no seu `peerDependencies`, mas suas regras funcionam
normalmente sob o ESLint 9 instalado aqui (testado manualmente: as 14 regras disparam e o
`--fix` funciona). Sem o override, `npm install` falha com `ERESOLVE` só por causa desse peer
range desatualizado — confirmado removendo o override e reproduzindo o erro. Isso é sobrescrever
uma checagem de peer, não redirecionar uma versão resolvida (o pacote não declara `eslint` como
dependency, só como peer), então o `package-lock.json` não registra o override — é esperado, não
sinal de que ele não funcionou. Se um `npm install` limpo voltar a falhar com esse ERESOLVE, é
sinal de que o plugin publicou uma versão nova com peer range atualizado; nesse caso, atualize a
versão do plugin e remova o override.
