#!/usr/bin/env bash
# AuraOS — step 7: the Aura Shell v1.0 session
#
# Replaces the default Lomiri session with our own shell. The shell is a
# web-tech UI (shell/) rendered fullscreen by a Wayland kiosk stack:
#
#     cage (kiosk compositor)  ─►  web engine (cog / WebKitGTK)  ─►  the shell
#                                        │
#     aura-agent (localhost:8787) ──┘  serves the shell + real system API
#
# This is a real, bootable session — not a browser tab. cage owns the display,
# the web engine renders one fullscreen page, and the agent is the bridge to the
# device. WPE 'cog' is preferred but was dropped from Ubuntu after 22.04, so on
# 24.04+ (which the Pi 5 requires) we render with WebKitGTK instead.
#
# Runs inside the arm64 chroot during build.  Safe to re-run.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

USERNAME="aura"
OPT="/opt/aura"

echo "── Aura Shell v1.0 — installing session ──"

# ─── PACKAGES ──────────────────────────────────────────────────────────────
# cage  : minimal wlroots kiosk compositor (one app, fullscreen) — in noble.
# curl  : used by the launcher to wait for the agent
# python3: runs the system-bridge agent (stdlib only — nothing else to install)
# dbus  : WebKitGTK (epiphany) needs a session bus + gsettings under cage.
apt-get update -qq
apt-get install -y --no-install-recommends \
  cage curl python3 fonts-ubuntu ca-certificates \
  brightnessctl rfkill network-manager dbus

# ─── WEB ENGINE ──────────────────────────────────────────────────────────────
# The shell is rendered by a chromeless kiosk web engine under cage. The original
# choice was WPE WebKit's 'cog' — but Ubuntu DROPPED the entire WPE stack (libwpe,
# wpebackend-fdo, libwpewebkit, cog) after 22.04. It is simply not in 24.04+, and
# we must target 24.04 because the Pi 5 is unsupported on 22.04. So:
#   • prefer 'cog' when it exists (22.04 base, or a hand-built cog) — chromeless;
#   • otherwise install WebKitGTK's GNOME Web (epiphany) — the only WebKit engine
#     apt-installable on noble. Chromium is snap-only and can't install in a
#     debootstrap chroot, so it isn't used here (the runtime launcher still
#     prefers it if a device happens to have it).
# Never fail the build over a missing engine — install the best available.
if apt-get install -y --no-install-recommends cog 2>/dev/null; then
  echo "web engine: cog (WPE WebKit) — chromeless kiosk"
elif apt-get install -y --no-install-recommends epiphany-browser; then
  echo "web engine: epiphany (WebKitGTK) — WPE unavailable on this suite"
else
  echo "WARNING: no web engine installed (cog/epiphany unavailable); the session" >&2
  echo "         will try chromium at runtime and otherwise show an error." >&2
fi

# ─── DEPLOY SHELL + AGENT ────────────────────────────────────────────────────
# build.sh stages these under /aura/{shell,agent} inside the rootfs.
install -d "$OPT"
if [ -d /aura/shell ]; then
  rm -rf "$OPT/shell"; cp -a /aura/shell "$OPT/shell"
fi
if [ -d /aura/agent ]; then
  rm -rf "$OPT/agent"; cp -a /aura/agent "$OPT/agent"
fi
chmod +x "$OPT/agent/aura-agent.py" 2>/dev/null || true

# Persistent state (permission store, network log) lives here.
install -d -o "$USERNAME" -g "$USERNAME" /var/lib/aura

# ─── LAUNCHER SCRIPTS ────────────────────────────────────────────────────────
# The web launcher: wait until the agent answers, then hand off to a web engine.
# cage already owns the display and forces ONE fullscreen surface, so whichever
# engine we pick fills the screen. Preference order = most kiosk-appropriate
# first: cog and chromium are chromeless; epiphany is the WebKitGTK fallback that
# is apt-installable on Ubuntu 24.04+ (where WPE/cog no longer exists).
cat > "$OPT/launch-web.sh" << 'EOF'
#!/bin/sh
# Wait for the system-bridge agent to come up. Probe the PUBLIC shell root (/),
# not /api/*, which is auth-gated (a tokenless poll always 401s and would never
# signal ready — it'd just burn the whole timeout before launching the browser).
URL="http://127.0.0.1:8787/"
for _ in $(seq 1 150); do
  if curl -sf "$URL" >/dev/null 2>&1; then break; fi
  sleep 0.1
done

if command -v cog >/dev/null 2>&1; then
  # WPE WebKit — chromeless. Auto-selects the Wayland backend under cage.
  exec cog "$URL"
elif command -v chromium >/dev/null 2>&1; then
  exec chromium --kiosk --ozone-platform=wayland --app="$URL" \
    --no-first-run --disable-translate --overscroll-history-navigation=0
elif command -v chromium-browser >/dev/null 2>&1; then
  exec chromium-browser --kiosk --ozone-platform=wayland --app="$URL" \
    --no-first-run --disable-translate --overscroll-history-navigation=0
elif command -v epiphany-browser >/dev/null 2>&1; then
  # WebKitGTK (GNOME Web) — the deb-installable engine on Ubuntu 24.04+.
  # --application-mode gives minimal chrome but REQUIRES a --profile dir; it
  # also needs a session bus + gsettings, which cage's session normally has
  # (we spin one up if not). Not as bare as cog, but renders fullscreen.
  export GTK_A11Y=none
  PROFILE="${XDG_DATA_HOME:-$HOME/.local/share}/aura-epiphany"
  mkdir -p "$PROFILE"
  if command -v dbus-run-session >/dev/null 2>&1 && [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]; then
    exec dbus-run-session -- epiphany-browser --application-mode --profile="$PROFILE" "$URL"
  fi
  exec epiphany-browser --application-mode --profile="$PROFILE" "$URL"
else
  echo "No web engine (cog/chromium/epiphany) installed" >&2; sleep 5; exit 1
fi
EOF
chmod +x "$OPT/launch-web.sh"

# The session: cage owns the seat/display and runs the web launcher fullscreen.
cat > "$OPT/run-shell.sh" << 'EOF'
#!/bin/sh
export XDG_SESSION_TYPE=wayland
# Let wlroots start even with no input devices yet (headless VM first boot).
export WLR_LIBINPUT_NO_DEVICES=1
# -s = allow the child (cog) to keep running; blank cursor after idle.
exec cage -s -- /opt/aura/launch-web.sh
EOF
chmod +x "$OPT/run-shell.sh"

# ─── SYSTEM-BRIDGE AGENT SERVICE ─────────────────────────────────────────────
cat > /etc/systemd/system/aura-agent.service << EOF
[Unit]
Description=Aura Shell system bridge
After=network.target NetworkManager.service
Wants=NetworkManager.service

[Service]
Type=simple
User=${USERNAME}
SupplementaryGroups=video netdev input plugdev bluetooth
Environment=AURA_SHELL_DIR=${OPT}/shell
Environment=AURA_STATE_DIR=/var/lib/aura
ExecStart=/usr/bin/python3 ${OPT}/agent/aura-agent.py
Restart=always
RestartSec=1
# Bridge is trusted system software but binds 127.0.0.1 only; keep it modest.
NoNewPrivileges=no
# read-only (not "yes"): the bridge must READ the user's ~/.local/share
# (applications + icons) to surface installed apps — including Android apps,
# whose .desktop launchers Waydroid drops there — but it never writes home.
ProtectHome=read-only

[Install]
WantedBy=multi-user.target
EOF

# ─── DESKTOP SESSION FOR LIGHTDM ─────────────────────────────────────────────
# Register the shell as a selectable/auto-login Wayland session.
install -d /usr/share/wayland-sessions
cat > /usr/share/wayland-sessions/aura-shell.desktop << EOF
[Desktop Entry]
Name=Aura Shell
Comment=Privacy-first shell v1.0
Exec=${OPT}/run-shell.sh
Type=Application
DesktopNames=Aura
EOF

# ─── MAKE IT THE DEFAULT SESSION + AUTO-LOGIN ────────────────────────────────
# Configure lightdm to auto-login the aura user straight into the Aura Shell.
# CRITICAL: noble's lightdm ships NO monolithic /etc/lightdm/lightdm.conf — only
# conf.d drop-ins — so the earlier `sed -i .../lightdm.conf` edits were silent
# no-ops and the device landed on a keyboard-less greeter. Write a drop-in
# instead, and number it 99- so it overrides the packaged
# 90-default-session-lomiri.conf (drop-ins load lexically; last one wins).
# Lomiri stays installed as a fallback session, selectable from a greeter.
install -d /etc/lightdm/lightdm.conf.d
cat > /etc/lightdm/lightdm.conf.d/99-aura-autologin.conf << 'EOF'
[Seat:*]
autologin-user=aura
autologin-user-timeout=0
autologin-session=aura-shell
user-session=aura-shell
EOF

# ─── ENABLE ──────────────────────────────────────────────────────────────────
systemctl enable aura-agent.service 2>/dev/null || true
systemctl enable lightdm 2>/dev/null || true

# `systemctl enable` under qemu emulation only half-applies: it writes the
# display-manager.service alias but often NOT the graphical.target.wants symlink
# that actually starts lightdm at boot — so the Pi reaches graphical.target and
# sits at a text console with no shell. Wire both up explicitly, and make sure
# graphical.target is the default so lightdm is reached at all.
LIGHTDM_UNIT="$(ls /lib/systemd/system/lightdm.service /usr/lib/systemd/system/lightdm.service 2>/dev/null | head -1)"
if [ -n "$LIGHTDM_UNIT" ]; then
  mkdir -p /etc/systemd/system/graphical.target.wants
  ln -sf "$LIGHTDM_UNIT" /etc/systemd/system/graphical.target.wants/lightdm.service
  ln -sf "$LIGHTDM_UNIT" /etc/systemd/system/display-manager.service
fi
ln -sf /lib/systemd/system/graphical.target /etc/systemd/system/default.target

echo
echo "Aura Shell v1.0 installed as the default session."
echo "  Shell:  ${OPT}/shell   (served by the agent on 127.0.0.1:8787)"
echo "  Agent:  ${OPT}/agent/aura-agent.py  (systemd: aura-agent)"
echo "  Session: cage + web engine  →  /usr/share/wayland-sessions/aura-shell.desktop"
echo "  Reboot into it via lightdm auto-login."
