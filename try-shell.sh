#!/usr/bin/env bash
# Run Aura Shell v1.0 on THIS machine — no image build required.
#
# Two ways to look at it:
#   ./try-shell.sh            start the agent, open the shell in your browser
#   ./try-shell.sh --kiosk    start the agent AND launch the full cage kiosk
#                             session, exactly as it runs on the device
#   ./try-shell.sh --lan      bind to 0.0.0.0 so other devices on your local
#                             network can open the shell (prints the LAN URL)
#
# The browser mode works anywhere (design review). --kiosk needs cage + a web
# engine and a graphical Wayland seat — so it runs on Linux only (an Ubuntu VM
# or the Pi), NOT on macOS/Windows. Ideal for validating the real session inside
# an Ubuntu VM before flashing a Pi.
#   Ubuntu 22.04:  sudo apt install cage cog
#   Ubuntu 24.04+: sudo apt install cage epiphany-browser   (WPE 'cog' was
#                  dropped after 22.04; WebKitGTK's epiphany is the engine)
#
# SECURITY: --lan exposes the agent to the whole local network. Static assets
# are public and the per-boot token is embedded in the served HTML, so ANY
# device that can reach the page gets the token and thus the full API surface,
# including /api/exec (a shell as your user). Only use --lan on a network you
# trust.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${AURA_AGENT_PORT:-8787}"

# Parse args: --lan may be combined with (or replace) --kiosk.
MODE=""
for arg in "$@"; do
  case "$arg" in
    --lan)   export AURA_AGENT_HOST="0.0.0.0" ;;
    --kiosk) MODE="--kiosk" ;;
  esac
done

# Loopback for the agent health check + local browser; LAN IP for the notice.
URL="http://127.0.0.1:${PORT}/"
LAN_URL="$URL"
if [[ "${AURA_AGENT_HOST:-}" == "0.0.0.0" ]]; then
  LAN_IP="$(
    { ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -1; } \
    || true
  )"
  [[ -z "$LAN_IP" ]] && LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
  [[ -z "$LAN_IP" ]] && LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [[ -n "$LAN_IP" ]] && LAN_URL="http://${LAN_IP}:${PORT}/"
fi

export AURA_SHELL_DIR="$DIR/shell"
export AURA_STATE_DIR="${AURA_STATE_DIR:-$HOME/.local/share/aura}"

command -v python3 >/dev/null || { echo "python3 is required"; exit 1; }

echo "Starting Aura system-bridge agent…"
python3 "$DIR/agent/aura-agent.py" &
AGENT=$!
cleanup() { kill "$AGENT" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

# wait for the agent — probe the PUBLIC root (/), not the auth-gated /api/*
# (a tokenless /api/status poll always 401s and never signals ready).
for _ in $(seq 1 60); do
  curl -sf "$URL" >/dev/null 2>&1 && break
  sleep 0.1
done
echo "Agent up → $URL  (shows LIVE device state)"
if [[ "${AURA_AGENT_HOST:-}" == "0.0.0.0" ]]; then
  echo "LAN access → $LAN_URL  (reachable from other devices on this network)"
fi

if [[ "$MODE" == "--kiosk" ]]; then
  if [[ "$(uname -s)" != "Linux" ]]; then
    echo "--kiosk needs a Linux host with a Wayland seat (cage). On $(uname -s) it"
    echo "can't run — use plain './try-shell.sh' for the browser preview, and test"
    echo "the real kiosk session inside an Ubuntu VM or on the Pi." >&2
    exit 1
  fi
  if ! command -v cage >/dev/null; then
    echo "cage not found — the kiosk needs a Wayland compositor + a web engine." >&2
    echo "  Ubuntu 24.04 / newer:  sudo apt install cage epiphany-browser" >&2
    echo "  (or any Chromium:      sudo apt install cage chromium-browser)" >&2
    echo "  Ubuntu 22.04 only:     sudo apt install cage cog   ('cog'/WPE was dropped after 22.04)" >&2
    echo >&2
    echo "Not testing Android windows? You don't need the kiosk at all — the agent" >&2
    echo "is already serving LIVE. Just open $URL in your normal browser." >&2
    exit 1
  fi
  echo "Launching cage kiosk session…  (switch VT or kill to exit)"
  export WLR_LIBINPUT_NO_DEVICES=1
  # Same engine preference as the device launcher: chromeless cog/chromium first,
  # WebKitGTK (epiphany) as the Ubuntu 24.04+ fallback.
  exec cage -s -- sh -c '
    if command -v cog >/dev/null 2>&1; then exec cog "$1";
    elif command -v chromium >/dev/null 2>&1; then exec chromium --kiosk --ozone-platform=wayland --app="$1" --no-first-run;
    elif command -v chromium-browser >/dev/null 2>&1; then exec chromium-browser --kiosk --ozone-platform=wayland --app="$1" --no-first-run;
    elif command -v epiphany-browser >/dev/null 2>&1; then P="${XDG_DATA_HOME:-$HOME/.local/share}/aura-epiphany"; mkdir -p "$P"; exec epiphany-browser --application-mode --profile="$P" "$1";
    else echo "No web engine found. Try: sudo apt install epiphany-browser" >&2; exit 1;
    fi
  ' sh "$URL"
else
  echo "Opening in your browser…  (Ctrl-C here to stop the agent)"
  (xdg-open "$URL" >/dev/null 2>&1 || echo "Open $URL manually.") &
  wait "$AGENT"
fi
