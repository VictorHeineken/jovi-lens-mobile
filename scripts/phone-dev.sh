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
POSITIONAL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --install) [ $# -ge 2 ] || die "--install needs an APK path"; INSTALL_APK="$2"; shift 2 ;;
    --no-launch) LAUNCH=0; shift ;;
    -h|--help) sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
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
find_adb() {
  if command -v adb >/dev/null 2>&1; then command -v adb; return; fi
  local sdk candidates=""
  for sdk in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
    [ -n "$sdk" ] && candidates="$candidates|$sdk"
  done
  if [ -n "${LOCALAPPDATA:-}" ]; then  # Git Bash on Windows
    if command -v cygpath >/dev/null 2>&1; then
      candidates="$candidates|$(cygpath -u "$LOCALAPPDATA")/Android/Sdk"
    fi
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
  if command -v node >/dev/null 2>&1; then command -v node; return; fi
  # nvm isn't loaded in non-interactive shells.
  if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "${NVM_DIR:-$HOME/.nvm}/nvm.sh" >/dev/null 2>&1
    if command -v node >/dev/null 2>&1; then command -v node; return; fi
  fi
  if [ -f "/c/Program Files/nodejs/node.exe" ]; then echo "/c/Program Files/nodejs/node.exe"; return; fi
  return 1
}

ADB="$(find_adb)" || die "adb not found. Install Android platform-tools and add them to PATH, or set ANDROID_HOME."
NODE="$(find_node)" || die "node not found. Install Node 22+ (https://nodejs.org)."
"$NODE" -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 20 || (a === 20 && b >= 6) ? 0 : 1)' \
  || die "Node $("$NODE" -v | tr -d '\r') is too old; --env-file needs Node 20.6+ (22 recommended)."
[ -f .env ] || die ".env not found in $REPO_ROOT (copy .env.example and fill it in)."
command -v curl >/dev/null 2>&1 || die "curl not found."

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
