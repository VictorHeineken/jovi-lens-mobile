# JOVI Lens

Experiência de estudo "foto → IA → aprendizado" do projeto JOVI. Este repositório contém dois clientes que
compartilham o mesmo backend:

- **App React Native (Expo)** — nesta pasta raiz (`app/`, `components/`, `services/`, `context/`, ...).
  A versão instalável para Android/iOS; veja o [plano de migração](react-native-migration-plan.md) para o
  que foi portado, decisões tomadas e o que ainda falta verificar em um dispositivo real.
- **App web (Vite + React)** — em [`web/`](web/README.md). A versão original do projeto, PWA instalável
  via navegador.
- **Backend compartilhado** — `api/` (handlers estilo Vercel serverless) + `server/local-api.js` (wrapper
  HTTP para rodar `api/` localmente). Os dois clientes chamam exatamente os mesmos endpoints.

```text
jovi-lens-mobile/
  api/                  backend compartilhado (Azure OpenAI / MiniMax, TTS, STT, vídeo, YouTube)
  server/               servidor HTTP local que expõe api/ em 127.0.0.1:8787
  app/, components/,    app React Native (Expo) — roda a partir da raiz
  services/, context/,
  app.json, package.json
  web/                  app web (Vite + React) — veja web/README.md
  tests/                testes do backend (api/_lib/...)
  .env, .env.example    variáveis compartilhadas pelos dois clientes e pelo backend
  react-native-migration-plan.md
```

## IA

O fluxo real usa um provedor de IA plugável atrás de uma camada de serviço em `api/_lib/ai/`. Nenhum
cliente recebe chave alguma: a imagem passa por `POST /api/analyze-image`, que valida o payload, aplica
timeout e normaliza a resposta para o contrato educacional do produto — esse contrato é o mesmo não
importa qual provedor esteja ativo, nem qual cliente (web ou nativo) fez a chamada.

Cada provedor vive em `api/_lib/ai/providers/<nome>.js` e implementa a mesma interface (`complete`,
`speak`, `transcribe`, `createVideoJob`/`getVideoJob`/`getVideoContent`, mais um objeto `capabilities`). O
provedor ativo é escolhido pela variável `AI_PROVIDER` no `.env` (veja abaixo); `api/_lib/ai/providers/index.js`
resolve qual módulo atende cada recurso. Hoje `azure-openai` e `minimax` estão registrados — `openai`,
`anthropic` e `gemini` chegam em fases seguintes desta refatoração.

Nem todo provedor cobre todos os recursos — é uma limitação real das APIs, não uma lacuna de implementação:

| Provedor | Chat/Visão | TTS | STT | Vídeo |
|---|---|---|---|---|
| Azure OpenAI | ✅ | ✅ | ✅ | ✅ (Sora) |
| MiniMax | ✅ | ✅ | ❌ (não confirmado) | ✅ (Hailuo) |
| OpenAI (planejado) | ✅ | ✅ | ✅ | ✅ (Sora) |
| Anthropic (planejado) | ✅ | ❌ | ❌ | ❌ |
| Google Gemini (planejado) | ✅ | ✅ | ✅ | ✅ (Veo) |

Se `AI_PROVIDER` não cobre um recurso, use a variável de override desse recurso (`AI_TTS_PROVIDER`,
`AI_STT_PROVIDER`, `AI_VIDEO_PROVIDER`, ou `AI_CHAT_PROVIDER`/`AI_VISION_PROVIDER`) para apontá-lo a outro
provedor configurado. Sem override, o recurso simplesmente fica indisponível (erro `AI_NOT_CONFIGURED`), do
mesmo jeito que hoje acontece quando um deployment opcional da Azure não está configurado.

Para uma apresentação sem dependência de rede, ative o Demo Mode (veja `JOVI_LENS_DEMO_MODE` /
`VITE_JOVI_LENS_DEMO_MODE` / `EXPO_PUBLIC_JOVI_LENS_DEMO_MODE` abaixo — cada cliente lê a variável com seu
próprio prefixo).

## Variáveis locais

Copie `.env.example` para `.env` na raiz do repositório e configure os valores localmente. Este único
`.env` é compartilhado pelo backend, pelo app web e pelo app React Native — cada um lê apenas as variáveis
com o prefixo que lhe importa (nenhum prefixo para o backend, `VITE_` para o app web, `EXPO_PUBLIC_` para o
app nativo). Toda chave de provedor de IA é server-only e nunca deve usar esses prefixos. O arquivo de
exemplo deve permanecer sem valores reais.

Principais variáveis:

```text
AI_PROVIDER=azure-openai
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_DEPLOYMENT=
AZURE_OPENAI_API_VERSION=2024-12-01-preview
YOUTUBE_API_KEY=
JOVI_LENS_DEMO_MODE=false
VITE_JOVI_LENS_DEMO_MODE=false
JOVI_WEB_URL=http://127.0.0.1:5173

# App React Native (Expo) — veja react-native-migration-plan.md
EXPO_PUBLIC_API_BASE_URL=http://SEU_IP_LOCAL:8787
```

`AI_PROVIDER` é obrigatória para o modo ao vivo — sem ela, cada chamada de IA falha com
`AI_NOT_CONFIGURED` apontando para o `.env.example`. Para uma apresentação sem rede, defina os flags de
Demo Mode como `true` (o provedor de IA não importa nesse caso). Para usar um provedor ao vivo localmente,
mantenha-os `false`, configure o bloco de variáveis do provedor escolhido e reinicie o servidor depois de
alterar o `.env`.

As APIs locais aplicam rate limit por janela curta e limite diário por recurso. Esses limites protegem o
protótipo contra bursts e consumo acidental; em produção devem ser substituídos por quotas por usuário
autenticado e um armazenamento compartilhado.

## Rodar o app React Native (a partir da raiz)

```bash
npm install
npm start
```

Isso abre o Expo CLI (QR code para um build de desenvolvimento — veja abaixo). Também disponíveis:
`npm run android`, `npm run ios` (builds locais, exigem Android Studio/Xcode) e `npm run web` (preview em
navegador, com limitações — veja o plano de migração).

**Nenhum código deste app roda em Expo Go.** Ele depende de módulos nativos de terceiros
(`react-native-vision-camera`, `expo-speech-recognition`, `react-native-mmkv`) que não vêm embutidos no
app Expo Go — é necessário compilar um development client primeiro:

```bash
npx eas build --profile development --platform android   # build na nuvem (precisa de conta Expo)
# ou, com o Android SDK instalado localmente:
npm run android
```

Configure `EXPO_PUBLIC_API_BASE_URL` no `.env` da raiz antes de rodar — aponte para o IP da sua rede local
(não `localhost`) na porta da API (`JOVI_API_PORT`, padrão `8787`), já que o telefone/emulador é um
dispositivo separado. Veja mais detalhes, decisões de arquitetura e o que ainda não foi testado em um
dispositivo real no [plano de migração](react-native-migration-plan.md).

## Rodar o app web

```bash
cd web
npm install
npm run dev
```

Veja [`web/README.md`](web/README.md) para rotas, fluxo de demonstração e detalhes específicos do app web.

## Testes do backend

```bash
node --test tests/youtube.test.js
```

(Os testes dos serviços do app web ficam em `web/tests/` — rode `cd web && npm test`.)
