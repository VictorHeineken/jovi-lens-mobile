#!/usr/bin/env bash
# Connects to an Android phone over wireless adb, tunnels the phone's
# 127.0.0.1:<port> to this computer with `adb reverse`, and runs the local API
# bound to 127.0.0.1 only. The APK must be built with
# EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:<port> — then it works on any
# network (home, university, hotspot) without rebuilding, and nothing on the
# LAN can reach the server.
#
# Works on macOS (Terminal) and Windows (Git Bash or WSL). Written for bash 3.2,
# the version macOS ships.
#
# On the phone: Settings > Developer options > Wireless debugging (same Wi-Fi as
# this computer) > "Pair device with pairing code".
#
# Usage:
#   scripts/phone-dev.sh <phone-ip>:<pairing-port> <pairing-code>   # first time / new pairing
#   scripts/phone-dev.sh <phone-ip>                                  # already paired
#   scripts/phone-dev.sh <phone-ip>:<connect-port>                   # already paired, port known
#   scripts/phone-dev.sh                                             # uses the values below, or asks
# Options:
#   --install <apk>   install (update, keeping app data) before launching
#   --no-launch       don't open the app on the phone
#   --no-install      fail instead of downloading missing adb / Node
#
# Needs curl. adb and Node 20.6+ are downloaded into ~/.jovi-lens when missing
# and added to PATH in ~/.zshrc (macOS) or ~/.bashrc (Git Bash, WSL/Linux).
#
# Ctrl+C stops the server, removes the tunnel and disconnects the phone.

# ---- Fill these in to skip typing them (command-line arguments win) ----
PAIR_ADDRESS=""   # e.g. 192.168.0.246:38933 — from the "Pair device with pairing code" dialog
PAIR_CODE=""      # e.g. 219403 — same dialog, expires in a minute or two
# ------------------------------------------------------------------------

set -u
set -o pipefail

APP_ID="com.jovilens.app"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# ---- Arguments ----
INSTALL_APK=""
LAUNCH=1
AUTO_INSTALL=1
POSITIONAL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --install) [ $# -ge 2 ] || die "--install needs an APK path"; INSTALL_APK="$2"; shift 2 ;;
    --no-launch) LAUNCH=0; shift ;;
    --no-install) AUTO_INSTALL=0; shift ;;
    -h|--help) sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) die "unknown option: $1 (see --help)" ;;
    *) POSITIONAL="$POSITIONAL $1"; shift ;;
  esac
done
# shellcheck disable=SC2086
set -- $POSITIONAL
[ $# -ge 1 ] && PAIR_ADDRESS="$1"
[ $# -ge 2 ] && PAIR_CODE="$2"

if [ -z "$PAIR_ADDRESS" ]; then
  printf 'Phone address from the pairing dialog (IP:port, or just IP if already paired): '
  read -r PAIR_ADDRESS
  if [ -n "$PAIR_ADDRESS" ]; then
    printf 'Pairing code (leave empty if already paired): '
    read -r PAIR_CODE
  fi
fi
[ -n "$PAIR_ADDRESS" ] || die "no phone address given"
PHONE_IP="${PAIR_ADDRESS%%:*}"
PHONE_PORT=""
case "$PAIR_ADDRESS" in *:*) PHONE_PORT="${PAIR_ADDRESS##*:}" ;; esac
[ -n "$INSTALL_APK" ] && [ ! -f "$INSTALL_APK" ] && die "APK not found: $INSTALL_APK"

# ---- Tools ----
# adb or Node (20.6+, needed for --env-file) that aren't installed get downloaded
# into ~/.jovi-lens — no admin rights needed — and put on PATH through
# ~/.jovi-lens/env.sh, which the shell startup files source.
TOOLS_DIR="$HOME/.jovi-lens"
DOWNLOADS="$TOOLS_DIR/downloads"

[ -f .env ] || die ".env not found in $REPO_ROOT (copy it from your other machine, or fill in .env.example). JOVI_API_KEY must match the key built into the APK."
command -v curl >/dev/null 2>&1 || die "curl not found."

case "$(uname -s)" in
  Darwin) OS=mac ;;
  Linux) OS=linux ;;
  MINGW*|MSYS*|CYGWIN*) OS=windows ;;
  *) OS=unknown ;;
esac
case "$(uname -m)" in
  x86_64|amd64) ARCH=x64 ;;
  arm64|aarch64) ARCH=arm64 ;;
  *) ARCH="$(uname -m)" ;;
esac

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | awk '{ print $1 }'
}

extract_zip() {  # <zip> <destination dir>
  mkdir -p "$2"
  if command -v unzip >/dev/null 2>&1; then
    unzip -q -o "$1" -d "$2"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -m zipfile -e "$1" "$2"
  elif [ -x /c/Windows/System32/tar.exe ]; then  # Windows 10+ bsdtar reads zip
    /c/Windows/System32/tar.exe -xf "$(cygpath -w "$1")" -C "$(cygpath -w "$2")"
  elif command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -Command "Expand-Archive -Force -LiteralPath '$(cygpath -w "$1")' -DestinationPath '$(cygpath -w "$2")'"
  else
    return 1
  fi
}

node_ok() {
  "$1" -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 20 || (a === 20 && b >= 6) ? 0 : 1)' >/dev/null 2>&1
}

find_adb() {
  if command -v adb >/dev/null 2>&1; then command -v adb; return; fi
  local sdk candidates=""
  for sdk in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$HOME/Library/Android/sdk" "$HOME/Android/Sdk" "$TOOLS_DIR"; do
    [ -n "$sdk" ] && candidates="$candidates|$sdk"
  done
  if [ -n "${LOCALAPPDATA:-}" ] && command -v cygpath >/dev/null 2>&1; then  # Git Bash on Windows
    candidates="$candidates|$(cygpath -u "$LOCALAPPDATA")/Android/Sdk"
  fi
  local IFS='|'
  for sdk in $candidates; do
    [ -z "$sdk" ] && continue
    if [ -f "$sdk/platform-tools/adb" ]; then echo "$sdk/platform-tools/adb"; return; fi
    if [ -f "$sdk/platform-tools/adb.exe" ]; then echo "$sdk/platform-tools/adb.exe"; return; fi
  done
  return 1
}

find_node() {
  local candidate
  if command -v node >/dev/null 2>&1 && node_ok node; then command -v node; return; fi
  # nvm isn't loaded in non-interactive shells.
  if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "${NVM_DIR:-$HOME/.nvm}/nvm.sh" >/dev/null 2>&1
    if command -v node >/dev/null 2>&1 && node_ok node; then command -v node; return; fi
  fi
  for candidate in "/c/Program Files/nodejs/node.exe" "$TOOLS_DIR/node/bin/node" "$TOOLS_DIR/node/node.exe"; do
    if [ -f "$candidate" ] && node_ok "$candidate"; then echo "$candidate"; return; fi
  done
  return 1
}

install_adb() {
  local platform
  case "$OS" in mac) platform=darwin ;; linux) platform=linux ;; windows) platform=windows ;; *) return 1 ;; esac
  mkdir -p "$DOWNLOADS"
  info "adb not found; downloading Android platform-tools into $TOOLS_DIR"
  curl -fL --progress-bar -o "$DOWNLOADS/platform-tools.zip" \
    "https://dl.google.com/android/repository/platform-tools-latest-$platform.zip" || return 1
  rm -rf "$TOOLS_DIR/platform-tools"
  extract_zip "$DOWNLOADS/platform-tools.zip" "$TOOLS_DIR" || return 1
  chmod +x "$TOOLS_DIR/platform-tools/adb" 2>/dev/null  # python's zipfile drops the exec bit
  rm -f "$DOWNLOADS/platform-tools.zip"
}

install_node() {
  local base="https://nodejs.org/dist/latest-v22.x" suffix ext sums file expected
  case "$OS" in
    mac) suffix="-darwin-$ARCH.tar.gz"; ext=tar.gz ;;
    linux) suffix="-linux-$ARCH.tar.gz"; ext=tar.gz ;;
    windows) suffix="-win-$ARCH.zip"; ext=zip ;;
    *) return 1 ;;
  esac
  mkdir -p "$DOWNLOADS"
  sums="$(curl -fsSL "$base/SHASUMS256.txt")" || return 1
  file="$(printf '%s\n' "$sums" | awk -v s="$suffix" 'substr($2, length($2) - length(s) + 1) == s { print $2; exit }')"
  expected="$(printf '%s\n' "$sums" | awk -v f="$file" '$2 == f { print $1; exit }')"
  [ -n "$file" ] && [ -n "$expected" ] || return 1
  info "Node 20.6+ not found; downloading $file into $TOOLS_DIR"
  curl -fL --progress-bar -o "$DOWNLOADS/$file" "$base/$file" || return 1
  if [ "$(sha256_of "$DOWNLOADS/$file")" != "$expected" ]; then
    rm -f "$DOWNLOADS/$file"
    warn "checksum mismatch for $file"
    return 1
  fi
  rm -rf "$TOOLS_DIR/node" "$DOWNLOADS/node-extract"
  mkdir -p "$DOWNLOADS/node-extract"
  if [ "$ext" = zip ]; then
    extract_zip "$DOWNLOADS/$file" "$DOWNLOADS/node-extract" || return 1
  else
    tar -xzf "$DOWNLOADS/$file" -C "$DOWNLOADS/node-extract" || return 1
  fi
  mv "$DOWNLOADS/node-extract/${file%."$ext"}" "$TOOLS_DIR/node" || return 1
  rm -rf "$DOWNLOADS/node-extract" "$DOWNLOADS/$file"
}

# Writes ~/.jovi-lens/env.sh and sources it from the shell startup files, so
# `adb` and `node` also work in new terminals. Only for tools installed here.
persist_path() {
  local dirs="" rc line
  [ -d "$TOOLS_DIR/platform-tools" ] && dirs="$TOOLS_DIR/platform-tools"
  [ -f "$TOOLS_DIR/node/bin/node" ] && dirs="$TOOLS_DIR/node/bin${dirs:+:$dirs}"
  [ -f "$TOOLS_DIR/node/node.exe" ] && dirs="$TOOLS_DIR/node${dirs:+:$dirs}"
  [ -n "$dirs" ] || return 0
  {
    echo "# Written by jovi-lens scripts/phone-dev.sh: adb and node downloaded into ~/.jovi-lens"
    echo "case \":\$PATH:\" in *\":$dirs:\"*) ;; *) export PATH=\"$dirs:\$PATH\" ;; esac"
  } > "$TOOLS_DIR/env.sh"
  export PATH="$dirs:$PATH"

  line='[ -f "$HOME/.jovi-lens/env.sh" ] && . "$HOME/.jovi-lens/env.sh"  # jovi-lens: adb, node'
  case "$OS" in
    mac) set -- "$HOME/.zshrc" "$HOME/.bash_profile" ;;  # zsh is the default shell; bash reads .bash_profile
    *) set -- "$HOME/.bashrc" "$HOME/.bash_profile" ;;   # Git Bash reads .bash_profile, which usually sources .bashrc
  esac
  for rc in "$@"; do
    # Create the main file; only touch the second one if it already exists.
    [ "$rc" = "$1" ] || [ -f "$rc" ] || continue
    grep -qF ".jovi-lens/env.sh" "$rc" 2>/dev/null && continue
    printf '\n%s\n' "$line" >> "$rc"
    info "Added adb/node to PATH in $rc (open a new terminal to use them outside this script)"
  done
}

INSTALLED_TOOLS=0
if ! ADB="$(find_adb)"; then
  [ "$AUTO_INSTALL" = 1 ] || die "adb not found. Install Android platform-tools and add them to PATH, or set ANDROID_HOME."
  install_adb || die "couldn't download adb. Install Android platform-tools manually: https://developer.android.com/tools/releases/platform-tools"
  ADB="$(find_adb)" || die "downloaded adb but couldn't find it in $TOOLS_DIR/platform-tools"
  INSTALLED_TOOLS=1
fi
if ! NODE="$(find_node)"; then
  [ "$AUTO_INSTALL" = 1 ] || die "Node 20.6+ not found (--env-file needs it). Install Node 22: https://nodejs.org"
  install_node || die "couldn't download Node. Install Node 22 manually: https://nodejs.org"
  NODE="$(find_node)" || die "downloaded Node but it doesn't run from $TOOLS_DIR/node"
  INSTALLED_TOOLS=1
fi
[ "$INSTALLED_TOOLS" = 1 ] && persist_path
info "Using adb: $ADB"
info "Using node $("$NODE" -v | tr -d '\r'): $NODE"

adb() { "$ADB" "$@" 2>&1 | tr -d '\r'; }

env_value() { tr -d '\r' < .env | sed -n "s/^$1=//p" | tail -n 1; }
PORT="$(env_value JOVI_API_PORT)"
PORT="${PORT:-8787}"
BASE_URL="$(env_value EXPO_PUBLIC_API_BASE_URL)"
case "$BASE_URL" in
  "http://127.0.0.1:$PORT"|"http://localhost:$PORT") ;;
  *) warn "EXPO_PUBLIC_API_BASE_URL in .env is '$BASE_URL', not http://127.0.0.1:$PORT. The app only uses this tunnel if it was built with the 127.0.0.1 address." ;;
esac

# ---- Cleanup ----
SERIAL=""
SERVER_PID=""
cleanup() {
  trap - EXIT INT TERM
  echo
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    info "Stopping server"
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
  fi
  if [ -n "$SERIAL" ]; then
    info "Removing tunnel and disconnecting $SERIAL"
    adb -s "$SERIAL" reverse --remove "tcp:$PORT" >/dev/null
    adb disconnect "$SERIAL" >/dev/null
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# ---- Pair ----
if [ -n "$PAIR_CODE" ]; then
  [ -n "$PHONE_PORT" ] || die "pairing needs IP:port from the pairing dialog, not just the IP"
  info "Pairing with $PHONE_IP:$PHONE_PORT"
  out="$(adb pair "$PHONE_IP:$PHONE_PORT" "$PAIR_CODE")"
  echo "$out"
  case "$out" in
    *"Successfully paired"*) ;;
    *) die "pairing failed. The code and port change every time the dialog opens; reopen it and try again." ;;
  esac
  PHONE_PORT=""  # the pairing port is never the connection port
fi

# ---- Connect ----
is_connected() { adb devices | grep -q "^$1[[:space:]]*device\$"; }

try_connect() {
  is_connected "$1" && return 0
  adb connect "$1" >/dev/null
  local i=0
  while [ $i -lt 3 ]; do
    is_connected "$1" && return 0
    sleep 1; i=$((i + 1))
  done
  adb disconnect "$1" >/dev/null  # drop "offline"/"unauthorized" leftovers
  return 1
}

connect_phone() {
  local addr port

  # Already connected (e.g. from a previous run)?
  addr="$(adb devices | awk -v ip="$PHONE_IP" 'index($1, ip ":") == 1 && $2 == "device" { print $1; exit }')"
  if [ -n "$addr" ]; then SERIAL="$addr"; return 0; fi

  if [ -n "$PHONE_PORT" ] && try_connect "$PHONE_IP:$PHONE_PORT"; then
    SERIAL="$PHONE_IP:$PHONE_PORT"; return 0
  fi

  # mDNS: the phone advertises its connection port. Doesn't work inside WSL.
  info "Looking for the phone's connection port (mDNS)"
  local i=0
  while [ $i -lt 5 ]; do
    for addr in $(adb mdns services | grep "_adb-tls-connect" | grep -o "$PHONE_IP:[0-9]*"); do
      if try_connect "$addr"; then SERIAL="$addr"; return 0; fi
    done
    sleep 1; i=$((i + 1))
  done

  # Fallback: scan the ports wireless debugging uses.
  info "mDNS found nothing; scanning $PHONE_IP ports 30000-49999 (~15s)"
  for port in $("$NODE" -e '
    const net = require("net");
    const [ip] = process.argv.slice(1);
    const ports = []; for (let p = 30000; p <= 49999; p++) ports.push(p);
    let next = 0;
    const worker = () => new Promise((done) => {
      const probe = () => {
        if (next >= ports.length) return done();
        const port = ports[next++];
        const s = net.connect({ host: ip, port, timeout: 700 });
        const end = (open) => { if (open) console.log(port); s.destroy(); probe(); };
        s.once("connect", () => end(true));
        s.once("timeout", () => end(false));
        s.once("error", () => end(false));
      };
      probe();
    });
    Promise.all(Array.from({ length: 800 }, worker));
  ' "$PHONE_IP" | tr -d '\r'); do
    if try_connect "$PHONE_IP:$port"; then SERIAL="$PHONE_IP:$port"; return 0; fi
  done
  return 1
}

connect_phone || die "couldn't connect to $PHONE_IP. Check that Wireless debugging is on, the phone and this computer are on the same Wi-Fi, and (if never paired) pass the pairing IP:port and code."
MODEL="$(adb -s "$SERIAL" shell getprop ro.product.model)"
info "Connected to ${MODEL:-phone} at $SERIAL"

# ---- Tunnel ----
setup_reverse() { adb -s "$SERIAL" reverse "tcp:$PORT" "tcp:$PORT" >/dev/null; }
setup_reverse || die "adb reverse failed"
info "Phone's 127.0.0.1:$PORT now reaches this computer's 127.0.0.1:$PORT"

# ---- Install ----
if [ -n "$INSTALL_APK" ]; then
  info "Installing $INSTALL_APK (this takes a minute over Wi-Fi)"
  out="$(adb -s "$SERIAL" install -r "$INSTALL_APK")"
  echo "$out" | tail -n 3
  case "$out" in *Success*) ;; *) die "install failed" ;; esac
fi

# ---- Server ----
if curl -s -m 2 -o /dev/null "http://127.0.0.1:$PORT/"; then
  die "something is already listening on port $PORT. Stop it (another server run?) and try again."
fi
info "Starting the API on 127.0.0.1:$PORT"
# Values already in the environment win over --env-file, so this forces
# localhost-only regardless of JOVI_API_HOST in .env.
JOVI_API_HOST=127.0.0.1 JOVI_API_PORT="$PORT" "$NODE" --env-file=.env server/local-api.js &
SERVER_PID=$!
i=0
until curl -s -m 1 -o /dev/null "http://127.0.0.1:$PORT/"; do
  kill -0 "$SERVER_PID" 2>/dev/null || die "the server exited during startup (see the output above)"
  [ $i -ge 30 ] && die "the server didn't start within 30s"
  sleep 1; i=$((i + 1))
done

if [ "$LAUNCH" = 1 ]; then
  adb -s "$SERIAL" shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null
  info "Opened $APP_ID on the phone"
fi

info "Ready. Leave this running while you use the app; Ctrl+C to stop."

# ---- Keep the tunnel alive ----
# Wireless adb drops when the phone sleeps or changes network; the reverse
# tunnel goes with it. Reconnect and restore it while the server runs.
while kill -0 "$SERVER_PID" 2>/dev/null; do
  sleep 5
  if [ "$(adb -s "$SERIAL" get-state)" != "device" ]; then
    warn "lost the phone; reconnecting to $SERIAL"
    if try_connect "$SERIAL" && setup_reverse; then
      info "Reconnected"
    else
      warn "still disconnected. If you toggled Wireless debugging, its port changed: Ctrl+C and run this script again."
    fi
  elif ! adb -s "$SERIAL" reverse --list | grep -q "tcp:$PORT"; then
    setup_reverse && info "Restored the tunnel"
  fi
done
warn "the server stopped"
