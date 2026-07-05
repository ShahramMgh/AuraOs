#!/usr/bin/env bash
# AuraOS — master build pipeline
#
# Produces a flashable Raspberry Pi 5 image:
#   LUKS2-encrypted root (AES-256-XTS, Argon2id) + ext4 inside
#   FAT32 boot partition with Ubuntu linux-raspi kernel and device tree
#   Lomiri touch shell, AppArmor, ufw, Flatpak, Syncthing pre-installed
#
# Usage (must run as root — needs debootstrap, losetup, cryptsetup):
#
#   sudo bash build.sh                        # standard build
#   sudo bash build.sh --wifi "MySSID:pass"  # pre-configure WiFi
#   sudo bash build.sh --size 8G             # larger image (default: 4G)
#   sudo bash build.sh --no-encrypt          # skip LUKS2 (testing only)
#
# Inside the VS Code Dev Container (recommended):
#   The container is already privileged and has all required tools.
#   Open a terminal in the container and run:  sudo bash build.sh
#
# On a plain Ubuntu host, first install dependencies:
#   sudo apt install debootstrap qemu-user-static binfmt-support \
#                    parted dosfstools e2fsprogs cryptsetup rsync xz-utils kpartx

set -euo pipefail

# ─── DEFAULTS ────────────────────────────────────────────────────────────────
ARCH="arm64"
SUITE="noble"            # Ubuntu 24.04 LTS
ROOTFS="$(pwd)/rootfs"
OUTDIR="$(pwd)/out"
IMG_SIZE="4G"
ENCRYPT=true
WIFI_SSID=""
WIFI_PASS=""
SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── CLI ─────────────────────────────────────────────────────────────────────
usage() {
  sed -n '/^# Usage/,/^[^#]/p' "$0" | sed 's/^# \?//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --wifi)       IFS=: read -r WIFI_SSID WIFI_PASS <<< "$2"; shift 2 ;;
    --size)       IMG_SIZE="$2"; shift 2 ;;
    --no-encrypt) ENCRYPT=false; shift ;;
    --help|-h)    usage ;;
    *) echo "Unknown option: $1"; usage 1 ;;
  esac
done

export ARCH SUITE ROOTFS OUTDIR IMG_SIZE ENCRYPT WIFI_SSID WIFI_PASS SCRIPTS_DIR

# ─── PRIVILEGE CHECK ─────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo "error: run as root (sudo bash build.sh)" >&2
  exit 1
fi

# ─── DEPENDENCY CHECK ────────────────────────────────────────────────────────
REQUIRED=(debootstrap qemu-aarch64-static parted mkfs.vfat mkfs.ext4
           rsync xz cryptsetup losetup)
MISSING=()
for cmd in "${REQUIRED[@]}"; do
  command -v "$cmd" >/dev/null 2>&1 || MISSING+=("$cmd")
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "Missing: ${MISSING[*]}"
  echo "Install: apt install debootstrap qemu-user-static binfmt-support \\"
  echo "                     parted dosfstools e2fsprogs cryptsetup rsync xz-utils kpartx"
  exit 1
fi

# ─── BINFMT CHECK ────────────────────────────────────────────────────────────
# Ensure arm64 binaries can run in the chroot on an x86_64 host.
if [[ $(uname -m) == "x86_64" ]]; then
  update-binfmts --enable qemu-aarch64 2>/dev/null || true
  if [[ ! -f /proc/sys/fs/binfmt_misc/qemu-aarch64 ]]; then
    echo "error: binfmt_misc/qemu-aarch64 not registered."
    echo "  In the devcontainer: ensure --privileged is set in devcontainer.json"
    echo "  On bare metal: apt install binfmt-support qemu-user-static && update-binfmts --enable qemu-aarch64"
    exit 1
  fi
fi

# ─── HELPERS ─────────────────────────────────────────────────────────────────
log() { echo; printf '═%.0s' {1..60}; echo; echo "  $*"; printf '═%.0s' {1..60}; echo; echo; }

MOUNTS_UP=false

mount_chroot() {
  [[ "$MOUNTS_UP" == true ]] && return
  for mp in proc sys dev dev/pts; do
    mount --bind "/$mp" "$ROOTFS/$mp"
  done
  MOUNTS_UP=true
}

umount_chroot() {
  [[ "$MOUNTS_UP" != true ]] && return
  for mp in dev/pts dev sys proc; do
    umount -lf "$ROOTFS/$mp" 2>/dev/null || true
  done
  MOUNTS_UP=false
}

trap 'umount_chroot; echo; echo "Build interrupted — run again to retry from the last completed step."' INT TERM EXIT

mkdir -p "$OUTDIR"

# ─── STEP 0: BASE ROOTFS ─────────────────────────────────────────────────────
log "STEP 0 — debootstrap Ubuntu $SUITE ($ARCH) rootfs"
bash "$SCRIPTS_DIR/00-build-base.sh" "$ARCH"

# Inject QEMU static binary so arm64 chroot works on x86_64
cp /usr/bin/qemu-aarch64-static "$ROOTFS/usr/bin/"

# Copy all build scripts into rootfs so each step can find them
mkdir -p "$ROOTFS/aura"
cp "$SCRIPTS_DIR"/*.sh "$ROOTFS/aura/"

# Stage the Aura Shell UI and system-bridge agent for step 7
for d in shell agent; do
  if [[ -d "$SCRIPTS_DIR/$d" ]]; then
    rm -rf "$ROOTFS/aura/$d"
    cp -a "$SCRIPTS_DIR/$d" "$ROOTFS/aura/$d"
  fi
done

# ─── STEPS 1–4: CHROOT PHASE ─────────────────────────────────────────────────
mount_chroot

log "STEP 1 — Privacy layer (AppArmor, ufw, Flatpak, Syncthing…)"
chroot "$ROOTFS" /bin/bash /aura/10-privacy-layer.sh

log "STEP 2 — Lomiri touch shell"
chroot "$ROOTFS" /bin/bash /aura/20-lomiri-shell.sh

log "STEP 3 — Raspberry Pi 5 kernel and firmware"
chroot "$ROOTFS" /bin/bash /aura/30-rpi-packages.sh

log "STEP 4 — First-boot configuration"
WIFI_SSID="$WIFI_SSID" WIFI_PASS="$WIFI_PASS" \
  chroot "$ROOTFS" /bin/bash /aura/40-first-boot.sh

log "STEP 6 — Aura Shell v1.0 session (cage + web engine + system bridge)"
chroot "$ROOTFS" /bin/bash /aura/70-aura-shell.sh

log "STEP 6b — Native Android Layer (Waydroid, on-demand + memory-capped)"
WAYDROID_MEM_HIGH="${WAYDROID_MEM_HIGH:-1536M}" \
WAYDROID_MEM_MAX="${WAYDROID_MEM_MAX:-2560M}" \
WAYDROID_IDLE="${WAYDROID_IDLE:-600}" \
  chroot "$ROOTFS" /bin/bash /aura/60-waydroid.sh

log "STEP 6c — Cellular layer (SIMCom A7670E — data · voice · SMS · GPS)"
AURA_APN="${AURA_APN:-}" AURA_APN_USER="${AURA_APN_USER:-}" AURA_APN_PASS="${AURA_APN_PASS:-}" \
  chroot "$ROOTFS" /bin/bash /aura/65-modem.sh

log "STEP 7 — Native Intelligence Layer (Ollama + default light model)"
AURA_AI_MODEL="${AURA_AI_MODEL:-gemma4:e2b-it-qat}" \
  chroot "$ROOTFS" /bin/bash /aura/80-ai-engine.sh

umount_chroot
trap - INT TERM EXIT

# ─── STEP 5: BOOTABLE IMAGE ──────────────────────────────────────────────────
log "STEP 5 — Bootable image (LUKS2: $ENCRYPT, size: $IMG_SIZE)"
bash "$SCRIPTS_DIR/50-image-builder.sh"

# ─── DONE ────────────────────────────────────────────────────────────────────
log "BUILD COMPLETE"
IMG=$(ls "$OUTDIR"/aura-*.img.xz 2>/dev/null | tail -1 || echo "(see $OUTDIR)")
echo "  Output:  $IMG"
echo "  Size:    $(du -sh "$IMG" 2>/dev/null | cut -f1 || echo '?')"
echo
echo "  Flash to SD card or USB:"
echo "    xzcat '$IMG' | sudo dd of=/dev/sdX bs=4M conv=fsync status=progress"
echo
echo "  Or open in Raspberry Pi Imager → 'Use custom' → select the .img.xz"
echo
if [[ "$ENCRYPT" == true ]]; then
  echo "  LUKS2 initial passphrase:  aura-initial-key"
  echo "  Change after first boot:   sudo cryptsetup luksChangeKey /dev/mmcblk0p2"
  echo
fi
echo "  SSH:  ssh aura@aura.local   (password: aura — must change)"
echo "  Serial: 115200 baud on GPIO 14/15 (UART0)"
