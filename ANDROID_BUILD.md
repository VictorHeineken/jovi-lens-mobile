# Build e teste no Android

Guia completo para gerar o APK do app React Native (Expo, na raiz do repositório) e testá-lo
em um aparelho Android real. Os comandos e versões abaixo foram verificados em WSL2 (Ubuntu
24.04) com o repositório em `/mnt/d`, contra um Moto G42 (Android 16).

> **Expo Go não funciona neste projeto.** O app depende de módulos nativos de terceiros
> (`react-native-vision-camera`, `react-native-mmkv`, `expo-speech-recognition`) que não vêm
> embutidos no Expo Go. É obrigatório compilar um APK.

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
AI_PROVIDER=minimax
MINIMAX_API_KEY=<sua chave>

# O servidor precisa aceitar conexões da rede — 127.0.0.1 não é alcançável pelo celular.
JOVI_API_HOST=0.0.0.0
JOVI_API_PORT=8787

# IP da sua máquina na LAN (não use localhost). Descubra com `ip addr` / `ipconfig`.
EXPO_PUBLIC_API_BASE_URL=http://192.168.0.66:8787
```

Dois detalhes que custam um rebuild inteiro se passarem despercebidos:

- **`EXPO_PUBLIC_API_BASE_URL` é embutida no bundle em tempo de build.** Mudou o IP? Recompile.
- O `.env` pode estar com quebras de linha CRLF. Isso não atrapalha o dotenv nem o Expo, mas
  quebra `source .env` no bash — use `tr -d '\r' < .env > /tmp/env.lf` antes, se precisar.

## 3. Subir o backend

O app não tem IA embarcada: todas as chamadas passam pelo backend em `api/`.

```bash
npm install
node --env-file=.env server/local-api.js
```

Confirme que está no ar e falando com o provedor de verdade:

```bash
curl -X POST http://192.168.0.66:8787/api/subject-ai \
  -H 'Content-Type: application/json' \
  -d '{"action":"questions","subject":{"name":"Biologia","notes":[{"title":"Mitose","summary":"Divisao celular."}]}}'
# espere HTTP 200 com "provider":"minimax" e "mode":"live"
```

**Se você usa WSL:** rode o backend pelo Node **do Windows**, não pelo do WSL. O WSL fica em uma
rede virtual (`172.x.x.x`) que o celular não alcança; seria preciso `netsh portproxy` + regra de
firewall, ambos exigindo Administrador. Pelo Windows o servidor já escuta direto no IP da LAN:

```powershell
cd D:\faculdade\jovi-lens-mobile
node --env-file=.env server/local-api.js
```

> O servidor sobe em `0.0.0.0` e **não tem autenticação** — qualquer aparelho na sua rede pode
> usá-lo e, por tabela, gastar sua cota da API. Derrube-o quando terminar.

## 4. Gerar o APK

```bash
npx expo prebuild --platform android    # gera android/ (não versionado)
cd android
./gradlew assembleRelease --no-daemon --max-workers=2
```

APK final: `android/app/build/outputs/apk/release/app-release.apk` (~139 MB, todas as ABIs).

Sobre tempo e memória:

- **Depois de um `prebuild`, conte ~30–40 min.** O prebuild reescreve o projeto nativo e invalida
  o cache do Gradle (~849 de 877 tarefas re-executam). Em `/mnt/d` é ainda mais lento, porque cada
  arquivo cruza a fronteira WSL↔Windows.
- **Alterando só JS, são ~6 min** — não rode `prebuild` sem necessidade.
- `--no-daemon --max-workers=2` evita que o build seja morto por pico de memória. Sem isso o
  Gradle mantém uma JVM de ~2 GB viva entre builds e dispara vários workers em paralelo.
- Para iterar no dia a dia, prefira `npx expo run:android` (build de debug com live reload).

O `release` é assinado com a **debug keystore** do template do Expo: instala e roda para teste,
mas não serve para publicar na Play Store.

## 5. Instalar no aparelho

### Opção A — adb por Wi-Fi (recomendado)

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
| Chamadas de rede falham com `CLEARTEXT communication not permitted` | `targetSdk 36` bloqueia HTTP puro | `expo-build-properties` com `usesCleartextTraffic: true` no `app.json` |
| Build morto por falta de memória | picos durante bundling/dexing | `--no-daemon --max-workers=2` e encerrar daemons Gradle órfãos |

## 8. Limitações conhecidas

- **Sem STT pela MiniMax.** O provedor declara `stt: false`; a pergunta por voz só funciona
  apontando `AI_STT_PROVIDER` para outro provedor.
- **`react-native-nitro-modules`** (peer de `react-native-mmkv`) não está declarado no
  `package.json` — hoje só existe porque o npm instala peers automaticamente.
- **Upload da galeria** ainda não foi validado em aparelho real; só o fluxo da câmera foi.
- O APK inclui as quatro ABIs. Restringir a `arm64-v8a` reduz o arquivo a cerca de um terço.
