#!/usr/bin/env bash
# AuraOS — step 6b: the Native Android Layer (Phase III)
#
# Installs Waydroid so the device can run Android apps natively, and — crucially
# — provisions it to stay LIGHT. Waydroid has two halves:
#
#   waydroid-container  the manager (tiny; enabled at boot, always up)
#   waydroid session    the Android runtime (an LXC full of services; heavy)
#
# We never keep the heavy session running when no Android app is on screen:
#   • the agent's bridge starts the session on demand and stops it when idle;
#   • persist.waydroid.suspend freezes the container whenever no window shows;
#   • a systemd memory slice caps how much RAM Android may ever hold;
#   • zram gives compressed swap headroom so memory pressure compresses, not OOMs.
# Result: Android is there when you want it and costs ~0 RAM when you don't.
#
# The Android system image (~1 GB) is NOT baked in and can't be fetched in a
# chroot — like the AI model, it is pulled once on first boot (see the
# aura-waydroid-init oneshot below).
#
# Runs inside the arm64 chroot during build. Safe to re-run. Never fails the
# build: if Waydroid can't be installed here (no network in chroot), the
# on-device pieces are still laid down and the shell degrades honestly.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

USERNAME="aura"
# Memory ceiling for the whole Android slice. Overridable at build time and, on
# device, via /etc/aura/waydroid.env. Defaults suit a 4 GB Pi 5.
WAYDROID_MEM_HIGH="${WAYDROID_MEM_HIGH:-1536M}"   # soft: reclaim/throttle above this
WAYDROID_MEM_MAX="${WAYDROID_MEM_MAX:-2560M}"     # hard: never exceed
WAYDROID_IDLE="${WAYDROID_IDLE:-600}"             # stop idle session after N seconds

echo "── Native Android Layer — Waydroid (light, on-demand) ──"

# ─── PACKAGE ─────────────────────────────────────────────────────────────────
if ! command -v waydroid >/dev/null 2>&1; then
  apt-get install -y --no-install-recommends curl ca-certificates gnupg lxc || true
  # Official repo: adds the apt source + key and runs apt update. Arch-agnostic
  # (works on arm64). In a networkless chroot this fails; we tolerate it and let
  # the on-device install path take over.
  if curl -fsSL https://repo.waydro.id | bash; then
    apt-get install -y --no-install-recommends waydroid || \
      echo "warn: 'apt install waydroid' failed (no network in chroot?)."
  else
    echo "warn: waydroid repo setup failed (no network in chroot?)."
    echo "      Re-run this script on-device, or: curl https://repo.waydro.id | sudo bash"
  fi
fi

# Ensure the config dirs exist (they do in a full rootfs; be defensive anyway
# so the step is safe to run on a minimal base too).
mkdir -p /etc/modules-load.d /etc/modprobe.d /etc/systemd/system \
         /etc/aura /etc/default /usr/local/bin

# ─── KERNEL MODULES ──────────────────────────────────────────────────────────
# Waydroid needs binder. Ubuntu's generic 24.04 kernels ship binder_linux; the
# Pi kernel (linux-raspi) may not, so we also try a DKMS fallback. Load on boot.
cat > /etc/modules-load.d/waydroid.conf << 'EOF'
binder_linux
EOF
# Android wants three binder devices; name them so the container finds them.
cat > /etc/modprobe.d/waydroid.conf << 'EOF'
options binder_linux devices=binder,hwbinder,vndbinder
EOF
if ! modinfo binder_linux >/dev/null 2>&1; then
  # Kernel lacks the module — pull the out-of-tree DKMS build if we can. Best
  # effort: on the Pi kernel this may need headers that only exist on-device.
  apt-get install -y --no-install-recommends binder-linux-dkms 2>/dev/null || \
  apt-get install -y --no-install-recommends anbox-modules-dkms 2>/dev/null || {
    echo "note: binder_linux not in this kernel; on-device you may need a kernel"
    echo "      with binder enabled, or the *-modules-dkms package + headers."
  }
fi

# ─── MEMORY CONTAINMENT (systemd slice) ──────────────────────────────────────
# Confine the whole Android stack to its own cgroup so it can never starve the
# shell or the AI engine. The bridge reads memory.current from this slice.
cat > /etc/systemd/system/waydroid.slice << EOF
[Unit]
Description=Aura — Android (Waydroid) resource slice
Before=slices.target

[Slice]
MemoryAccounting=yes
MemoryHigh=${WAYDROID_MEM_HIGH}
MemoryMax=${WAYDROID_MEM_MAX}
# Shell + compositor get CPU priority; Android yields under contention.
CPUWeight=40
IOWeight=40
EOF

# Put the container manager (and thus the whole Android LXC) inside that slice.
if [ -f /lib/systemd/system/waydroid-container.service ] || \
   [ -f /etc/systemd/system/waydroid-container.service ]; then
  mkdir -p /etc/systemd/system/waydroid-container.service.d
  cat > /etc/systemd/system/waydroid-container.service.d/10-aura.conf << 'EOF'
[Service]
Slice=waydroid.slice
# Freeze cleanly on stop so a suspended session releases memory promptly.
TimeoutStopSec=20
EOF
  # Manager is cheap — keep it available so on-demand session start is instant.
  systemctl enable waydroid-container.service 2>/dev/null || true
fi

# ─── ZRAM (compressed swap headroom) ─────────────────────────────────────────
# So a memory spike inside Android compresses into RAM instead of OOM-killing.
if apt-get install -y --no-install-recommends zram-tools 2>/dev/null; then
  cat > /etc/default/zramswap << 'EOF'
# Aura: compressed swap so Android memory pressure compresses, not OOMs.
ALGO=zstd
PERCENT=50
PRIORITY=100
EOF
  systemctl enable zramswap.service 2>/dev/null || true
fi

# ─── TUNABLES the agent bridge reads ─────────────────────────────────────────
mkdir -p /etc/aura
cat > /etc/aura/waydroid.env << EOF
# How long an idle Android session may live before the agent reclaims its RAM.
AURA_WAYDROID_IDLE=${WAYDROID_IDLE}
# Auto-install the F-Droid graphical app store on the first Android session so
# apps can be browsed/installed, not just side-loaded by URL. Set 0 to skip.
AURA_ANDROID_FDROID=1
EOF
if [ -f /etc/systemd/system/aura-agent.service ]; then
  mkdir -p /etc/systemd/system/aura-agent.service.d
  cat > /etc/systemd/system/aura-agent.service.d/20-android.conf << 'EOF'
[Service]
EnvironmentFile=-/etc/aura/waydroid.env
EOF
fi

# ─── FIRST-BOOT INIT (image download + performance props) ────────────────────
# `waydroid init` downloads the Android system image (~1 GB) and needs network +
# the binder module + root — none available in a chroot. Do it once on first
# online boot, then set the performance/memory properties that keep it light.
cat > /usr/local/bin/aura-waydroid-init.sh << 'EOF'
#!/bin/sh
set -e
MARKER=/var/lib/waydroid/waydroid.cfg
# already initialized? just make sure the light-mode props are set, then exit.
set_props() {
  # multi_windows: each app is its own surface — no full Android homescreen
  #                running in the background.
  # suspend:       freeze the container whenever no Android window is shown, so
  #                a backgrounded session burns ~0 CPU and releases memory.
  waydroid prop set persist.waydroid.multi_windows true  2>/dev/null || true
  waydroid prop set persist.waydroid.suspend       true  2>/dev/null || true
}
if [ -f "$MARKER" ]; then set_props; exit 0; fi

# ensure binder is present before init
modprobe binder_linux 2>/dev/null || true

echo "Aura: initializing Android runtime (downloading system image)…"
if waydroid init; then
  set_props
  echo "Aura: Android runtime ready."
else
  echo "Aura: waydroid init failed (offline?). Will retry next boot." >&2
  exit 1
fi
EOF
chmod +x /usr/local/bin/aura-waydroid-init.sh

cat > /etc/systemd/system/aura-waydroid-init.service << 'EOF'
[Unit]
Description=Aura — initialize the Android runtime (first boot)
Wants=network-online.target waydroid-container.service
After=network-online.target waydroid-container.service
ConditionPathExists=!/var/lib/waydroid/waydroid.cfg

[Service]
Type=oneshot
ExecStart=/usr/local/bin/aura-waydroid-init.sh
# retry across boots until the image lands
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
EOF
systemctl enable aura-waydroid-init.service 2>/dev/null || true

install -d -o "$USERNAME" -g "$USERNAME" /var/lib/aura 2>/dev/null || true

echo
echo "Native Android Layer installed."
echo "  Runtime : waydroid  (container manager enabled; session on-demand)"
echo "  Memory  : slice capped ${WAYDROID_MEM_HIGH} soft / ${WAYDROID_MEM_MAX} hard + zram"
echo "  Light   : multi_windows + suspend; idle session auto-stops after ${WAYDROID_IDLE}s"
echo "  Image   : Android system pulled on first online boot (aura-waydroid-init)"
echo "  Store   : F-Droid auto-installed on first session (browse/install apps graphically)"
echo "  Apps    : install from F-Droid, or by APK path/URL — appear in the launcher like native apps"
