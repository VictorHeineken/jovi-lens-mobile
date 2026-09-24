# Build e teste no Android

Guia completo para gerar o APK do app React Native (Expo, na raiz do repositório) e testá-lo
em um aparelho Android real. Os comandos e versões abaixo foram verificados em WSL2 (Ubuntu
24.04) com o repositório em `/mnt/d`, contra um Moto G42 (Android 16).

> **Expo Go não funciona neste projeto.** O app depende de módulos nativos de terceiros
> (`react-native-vision-camera`, `react-native-mmkv`, `expo-speech-recognition`,
> `@react-native-google-signin/google-signin`) e do módulo local `modules/jovi-native` (Play Integrity
> e leitura da agenda), que não vêm embutidos no Expo Go. É obrigatório compilar um APK.

> **Atualizando da v1.0.4?** Não há migração de dados: **desinstale a v1.0.4 antes** de instalar a
> v1.1.0 (`adb uninstall com.jovilens.app`). O build de apresentação (`com.jovilens.app.demo`) é um
> pacote separado e pode ficar instalado ao lado.

## 0. Variantes e perfis do EAS

O `eas.json` tem três perfis; cada um define `APP_VARIANT` e as variáveis `EXPO_PUBLIC_*`, e
`app.config.js` aplica as diferenças sobre o `app.json`:

| Perfil | `APP_VARIANT` | Pacote | Para quê |
| --- | --- | --- | --- |
| `development` | `development` | `com.jovilens.app` | Dev client contra a API local (`http://127.0.0.1:8787`, único com HTTP em claro) |
| `production` | `production` | `com.jovilens.app` | APK distribuído aos testadores, contra a Vercel (HTTPS) |
| `presentation` | `presentation` | `com.jovilens.app.demo` | Demo offline (`EXPO_PUBLIC_JOVI_LENS_DEMO_MODE=true`) |

```bash
eas build --profile production --platform android     # APK de produção (só arm64-v8a)
eas build --profile presentation --platform android   # APK de apresentação (só arm64-v8a)
eas build --profile development --platform android    # dev client
```

`EXPO_PUBLIC_JOVI_API_KEY` do perfil `production` vem do EAS env (visibilidade *sensitive*); os
placeholders `<...>` do `eas.json` são preenchidos com os valores do Google Cloud e da Vercel
(veja `prod-implementation-spec.md` §2). Os builds do EAS usam a versão remota
(`appVersionSource: "remote"` + `autoIncrement`), então o `versionCode` sobe sozinho.

## 1. Pré-requisitos

| Ferramenta | Versão | Observação |
| --- | --- | --- |
| Node | 22.x | O SDK 57 não roda em Node 18. |
| JDK | 17 (Temurin) | JDK 21+ ainda não é suportado pelo Gradle deste projeto. |
| Android SDK Platform | 36 | Vem de `react-native/gradle/libs.versions.toml`. |
| Android Build-Tools | 36.0.0 | idem |
| NDK | 27.1.12297006 | idem — obrigatório, há código C++. |
| CMake | 3.22.1 | idem |

Nada disso exige `root`: tudo pode ficar dentro do `$HOME`.

```bash
# Node 22 via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
nvm install 22 && nvm alias default 22

# JDK 17 (Temurin)
mkdir -p ~/tools && cd ~/tools
curl -sSL -o jdk17.tar.gz "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse"
tar xzf jdk17.tar.gz    # cria ~/tools/jdk-17.x.y+z

# Android command-line tools
mkdir -p ~/Android/Sdk/cmdline-tools && cd ~/Android/Sdk/cmdline-tools
curl -sSL -o cmdline.zip "https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip"
unzip -q cmdline.zip && mv cmdline-tools latest && rm cmdline.zip
```

Exporte as variáveis (e adicione ao `~/.bashrc` para persistir):

```bash
export JAVA_HOME="$HOME/tools/jdk-17.0.20.1+1"   # confira o nome exato da pasta
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

Instale os pacotes do SDK e aceite as licenças:

```bash
yes | sdkmanager --licenses > /dev/null
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0" \
           "ndk;27.1.12297006" "cmake;3.22.1"
```

## 2. Configurar o `.env`

Copie `.env.example` para `.env` na raiz e ajuste:

```ini
AI_PROVIDER=gemini
GEMINI_API_KEY=<sua chave>

# Dev build no celular: login, créditos e BYOK de verdade, sem Play Integrity.
JOVI_REQUIRE_INTEGRITY=false
JOVI_LOCAL_DEV_BYPASS=false
GOOGLE_CLIENT_ID=<client ID "Web application">
JOVI_SESSION_SECRET=<openssl rand -hex 32>
JOVI_API_KEY=<openssl rand -hex 32>
EXPO_PUBLIC_JOVI_API_KEY=<o mesmo valor>
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<o mesmo client ID>

JOVI_API_HOST=127.0.0.1
JOVI_API_PORT=8787

# O celular chega ao computador por um túnel `adb reverse` (scripts/phone-dev.sh),
# então o mesmo APK funciona em qualquer rede sem rebuild.
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8787
```

Sem adb, use o IP da máquina na LAN (`EXPO_PUBLIC_API_BASE_URL=http://192.168.0.66:8787`) e
`JOVI_API_HOST=0.0.0.0` — mas aí cada rede nova (IP novo) exige recompilar.

Dois detalhes que custam um rebuild inteiro se passarem despercebidos:

- **`EXPO_PUBLIC_API_BASE_URL` é embutida no bundle em tempo de build.** Mudou o IP? Recompile.
- O `.env` pode estar com quebras de linha CRLF. Isso não atrapalha o dotenv nem o Expo, mas
  quebra `source .env` no bash — use `tr -d '\r' < .env > /tmp/env.lf` antes, se precisar.

## 3. Subir o backend

O app não tem IA embarcada: todas as chamadas passam pelo backend em `api/`.

**Caminho recomendado:** `scripts/phone-dev.sh` (seção 5) sobe o servidor em `127.0.0.1`, conecta
ao celular e cria o túnel de uma vez. Os passos abaixo são para rodar o servidor sozinho, no modo LAN.

```bash
npm install
node --env-file=.env server/local-api.js
```

Confirme que está no ar (toda rota de IA exige login Google, então sem sessão a resposta é 401):

```bash
curl -s http://127.0.0.1:8787/api/me -H "x-api-key: $JOVI_API_KEY"
# espere {"code":"SIGN_IN_REQUIRED",...}
```

**Se você usa WSL:** rode o backend pelo Node **do Windows**, não pelo do WSL. O WSL fica em uma
rede virtual (`172.x.x.x`) que o celular não alcança; seria preciso `netsh portproxy` + regra de
firewall, ambos exigindo Administrador. Pelo Windows o servidor já escuta direto no IP da LAN:

```powershell
cd D:\faculdade\jovi-lens-mobile
node --env-file=.env server/local-api.js
```

> No modo LAN o servidor sobe em `0.0.0.0`. Nunca ative `JOVI_LOCAL_DEV_BYPASS` nesse modo: ele
> desliga o login e os créditos, e qualquer aparelho na sua rede poderia gastar sua cota da API.
> Derrube-o quando terminar.

## 4. Gerar o APK

Um build local de release precisa das **mesmas variáveis do perfil do EAS exportadas no shell**
(`APP_VARIANT` e todas as `EXPO_PUBLIC_*`): `app.config.js` lê `APP_VARIANT` no `prebuild` e o Metro
embute as `EXPO_PUBLIC_*` no bundle. Fora de `development`, o app exige `EXPO_PUBLIC_API_BASE_URL`
com `https://` e fecha na abertura se não for.

```bash
export APP_VARIANT=production
export EXPO_PUBLIC_JOVI_LENS_DEMO_MODE=false
export EXPO_PUBLIC_API_BASE_URL=https://<domínio-vercel>
export EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<client ID "Web application">
export EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER=<número do projeto>
export EXPO_PUBLIC_JOVI_API_KEY=<JOVI_API_KEY>

npx expo prebuild --platform android --clean    # gera android/ (não versionado)
cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon --max-workers=2
```

APK final: `android/app/build/outputs/apk/release/app-release.apk`. Só `arm64-v8a`, como os
perfis `production` e `presentation` do EAS (`ORG_GRADLE_PROJECT_reactNativeArchitectures`); sem a
flag o APK inclui as quatro ABIs e fica cerca de três vezes maior.

Builds locais leem o `versionCode` do `app.json`: **suba-o à mão** acima do último instalado, senão
o Android recusa a atualização.

Sobre tempo e memória:

- **Depois de um `prebuild`, conte ~30–40 min.** O prebuild reescreve o projeto nativo e invalida
  o cache do Gradle (~849 de 877 tarefas re-executam). Em `/mnt/d` é ainda mais lento, porque cada
  arquivo cruza a fronteira WSL↔Windows.
- **Alterando só JS, são ~6 min** — não rode `prebuild` sem necessidade.
- `--no-daemon --max-workers=2` evita que o build seja morto por pico de memória. Sem isso o
  Gradle mantém uma JVM de ~2 GB viva entre builds e dispara vários workers em paralelo.
- Para iterar no dia a dia, prefira `npx expo run:android` (build de debug com live reload).

O `release` local é assinado com a **debug keystore** do template do Expo. Ele instala e roda, mas
o Play Integrity reprova o certificado (`INTEGRITY_FAILED`) contra a produção, e o login Google só
funciona se o SHA-1 dessa keystore estiver registrado em um client OAuth Android. Para testadores,
use o APK do EAS, assinado com a keystore de release.

### SHA-1 e SHA-256 das keystores

Necessários para os clients OAuth Android (SHA-1) e para `PLAY_INTEGRITY_CERT_SHA256` (SHA-256):

```bash
# Release (EAS): mostra SHA-1 e SHA-256, ou baixe a keystore e use o keytool
eas credentials -p android
keytool -list -v -keystore <arquivo.jks> -alias <alias>

# Debug (dev builds locais)
keytool -list -v -keystore ~/.android/debug.keystore -storepass android -alias androiddebugkey

# SHA-256 em hex → base64url, o formato de PLAY_INTEGRITY_CERT_SHA256
echo <HEX_SEM_DOIS_PONTOS> | xxd -r -p | base64 | tr '+/' '-_' | tr -d '='
```

Guarde um backup offline da keystore de release: sem ela, os testadores precisam desinstalar para
atualizar.

## 5. Instalar no aparelho

### Script: conectar, instalar e subir o servidor (recomendado)

`scripts/phone-dev.sh` funciona no macOS (Terminal) e no Windows (Git Bash ou WSL). No celular, abra
**Depuração sem fio → Parear dispositivo com código de pareamento** e passe o IP:porta e o código
do diálogo:

```bash
bash scripts/phone-dev.sh 192.168.1.50:37123 123456                 # primeira vez
bash scripts/phone-dev.sh 192.168.1.50                              # já pareado
bash scripts/phone-dev.sh 192.168.1.50 --install android/app/build/outputs/apk/release/app-release.apk
```

Ele pareia, descobre a porta de conexão (mDNS, ou scan de portas quando o mDNS não funciona, como
no WSL), cria `adb reverse tcp:8787 tcp:8787`, sobe o servidor só em `127.0.0.1` e abre o app. Se
o celular dormir e a conexão cair, ele reconecta. **Ctrl+C** derruba o servidor, remove o túnel e
desconecta. Se faltar o adb ou o Node 20.6+, o script baixa os dois em `~/.jovi-lens` (sem
precisar de administrador) e os coloca no PATH via `~/.zshrc` (macOS) ou `~/.bashrc` (Git Bash,
WSL); use `--no-install` para desativar. Precisa apenas de `curl` e do `.env` — que não está no
repositório: copie-o da outra máquina, com o mesmo `JOVI_API_KEY` embutido no APK. Exige um APK compilado com `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8787`, e o app só
alcança o backend enquanto o script está rodando.

### Opção A — adb por Wi-Fi, manual

No celular: **Configurações → Sobre o telefone →** toque 7× em **Número da versão**, depois
**Configurações → Sistema → Opções do desenvolvedor → Depuração sem fio → Parear dispositivo com
código de pareamento**.

```bash
adb pair <IP>:<PORTA_DE_PAREAMENTO> <CÓDIGO_DE_6_DÍGITOS>
adb connect <IP>:<PORTA_DE_CONEXÃO>     # porta diferente, na tela anterior
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

A porta de conexão é diferente da porta de pareamento. Se o mDNS não funcionar (é o caso no WSL,
que não recebe multicast da LAN), descubra a porta com um scan:

```bash
nmap -p 30000-50000 <IP_DO_CELULAR>    # ou um scan TCP simples em Python
```

### Opção B — download por HTTP

Transferência por cabo/MTP falha com frequência em arquivos grandes. Servir o APK e baixar pelo
Chrome do celular é mais confiável:

```bash
cd android/app/build/outputs/apk/release && python3 -m http.server 8000 --bind 0.0.0.0
# no celular: http://<IP_DA_MAQUINA>:8000/app-release.apk
```

Depois é só tocar no arquivo baixado e permitir a instalação de fontes desconhecidas.

## 6. Testar e depurar

Com o adb conectado dá para dirigir o app inteiro sem tocar no aparelho:

```bash
adb logcat -c                                            # limpa o buffer
adb shell am start -n com.jovilens.app/.MainActivity     # abre o app
adb shell input tap <x> <y>                              # toque
adb exec-out screencap -p > tela.png                     # screenshot
adb shell pidof com.jovilens.app                         # está vivo?
```

Erros de JavaScript aparecem no logcat com a tag `ReactNativeJS`:

```bash
adb logcat -d | grep -E "ReactNativeJS|FATAL EXCEPTION|\[JOVI\]"
```

### Traduzir um stack trace do bundle minificado

Um crash em release aponta para offsets como `anonymous@1:539997`. O build gera um source map em
`android/app/build/generated/sourcemaps/react/release/index.android.bundle.map`, que converte esse
offset em arquivo e linha reais — foi assim que o crash do MMKV foi localizado em
`services/storage.js:12`. Decodifique as `mappings` (VLQ) e faça uma busca binária pela coluna.

## 7. Problemas já enfrentados

| Sintoma | Causa | Correção |
| --- | --- | --- |
| App fecha na abertura, sem mensagem | `new MMKV()` — a v4 removeu a classe e exporta `createMMKV`; `MMKV` só existe como tipo TS, que some em runtime | usar `createMMKV({ id })` |
| `Unsupported uri scheme for encoded image fetch! Uri is: data:image/jpeg;base64,…` | `Image.getSize()` não aceita `data:` URI no Android (Fresco) | gravar em arquivo de cache antes (`services/imageAnalysis.js`) |
| `Invalid crop options has been passed` ao fotografar | o crop era calculado com `photo.width/height` (sensor, paisagem) e aplicado ao arquivo já rotacionado por EXIF (retrato) | medir o arquivo salvo com `Image.getSize` antes de cortar |
| `getInfoAsync`/`documentDirectory` indefinidos ou lançando erro | no `expo-file-system@57` a API antiga saiu da entrada principal | importar de `expo-file-system/legacy` |
| Chamadas de rede falham com `CLEARTEXT communication not permitted` | `targetSdk 36` bloqueia HTTP puro | só a variante `development` libera HTTP em claro (`app.config.js`); produção usa HTTPS |
| Build morto por falta de memória | picos durante bundling/dexing | `--no-daemon --max-workers=2` e encerrar daemons Gradle órfãos |

## 8. Limitações conhecidas

- **Sem STT pela MiniMax.** Com uma chave MiniMax, a pergunta por voz usa o reconhecimento do
  próprio aparelho.
- **`react-native-nitro-modules`** (peer de `react-native-mmkv`) não está declarado no
  `package.json` — hoje só existe porque o npm instala peers automaticamente.
- **Upload da galeria** ainda não foi validado em aparelho real; só o fluxo da câmera foi.
- Os APKs de `production` e `presentation` são só `arm64-v8a`; aparelhos 32-bit não são suportados.
