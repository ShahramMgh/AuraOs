#!/usr/bin/env bash
# AuraOS — step 5: bootable image builder
#
# Creates a Raspberry Pi 5 flashable .img.xz from the populated rootfs.
#
# Partition layout:
#   p1  256 MiB  FAT32            /boot/firmware   (RPi bootloader reads this)
#   p2  rest     LUKS2 → ext4     /                (AES-256-XTS, Argon2id)
#
# Called by build.sh with these env vars already set:
#   ROOTFS   — populated arm64 rootfs directory
#   OUTDIR   — output directory (image written here)
#   IMG_SIZE — total image size, e.g. "4G"
#   ENCRYPT  — "true" | "false"
#
# Needs to run as root on the build host (not inside the chroot).
# Requires: parted losetup mkfs.vfat mkfs.ext4 cryptsetup rsync xz
set -euo pipefail

ROOTFS="${ROOTFS:-./rootfs}"
OUTDIR="${OUTDIR:-./out}"
IMG_SIZE="${IMG_SIZE:-4G}"
ENCRYPT="${ENCRYPT:-true}"

DATESTAMP=$(date +%Y%m%d-%H%M)
IMG_NAME="aura-rpi5-${DATESTAMP}"
IMG_FILE="${OUTDIR}/${IMG_NAME}.img"

BOOT_MNT="${OUTDIR}/mnt-boot"
ROOT_MNT="${OUTDIR}/mnt-root"
LOOP=""
LUKS_NAME="aura-root-build-$$"   # unique name avoids collisions with parallel builds
MAPPED_ROOT=""

# ─── CLEANUP ─────────────────────────────────────────────────────────────────
cleanup() {
  local rc=$?
  set +e
  sync 2>/dev/null

  umount "$BOOT_MNT" 2>/dev/null
  umount "$ROOT_MNT" 2>/dev/null

  if [[ "$ENCRYPT" == true ]] && dmsetup info "$LUKS_NAME" &>/dev/null 2>&1; then
    cryptsetup luksClose "$LUKS_NAME" 2>/dev/null || true
  fi

  if [[ -n "$LOOP" ]]; then
    losetup -d "$LOOP" 2>/dev/null || true
  fi

  rmdir "$BOOT_MNT" "$ROOT_MNT" 2>/dev/null || true

  if [[ $rc -ne 0 ]]; then
    echo
    echo "Image build failed (exit $rc). Partial image removed."
    rm -f "$IMG_FILE" "${IMG_FILE}.xz"
  fi
  return $rc
}
trap cleanup EXIT INT TERM

mkdir -p "$OUTDIR" "$BOOT_MNT" "$ROOT_MNT"

# ─── 1. IMAGE FILE ───────────────────────────────────────────────────────────
echo "Creating sparse image file: $IMG_FILE ($IMG_SIZE)"
truncate -s "$IMG_SIZE" "$IMG_FILE"

# ─── 2. PARTITIONS ───────────────────────────────────────────────────────────
# MBR layout is used because the RPi 5 EEPROM bootloader expects it.
# GPT works on RPi 5 too but MBR is more broadly compatible with flashers.
echo "Partitioning…"
parted -s "$IMG_FILE" mklabel msdos
parted -s "$IMG_FILE" mkpart primary fat32  1MiB 257MiB
parted -s "$IMG_FILE" set 1 boot on
parted -s "$IMG_FILE" mkpart primary ext4  257MiB 100%

# ─── 3. LOOP DEVICE ──────────────────────────────────────────────────────────
LOOP=$(losetup -f --show -P "$IMG_FILE")
echo "  Loop:  $LOOP"
BOOT_DEV="${LOOP}p1"
ROOT_DEV="${LOOP}p2"

# Give udev time to create partition devices
sleep 1
partprobe "$LOOP" 2>/dev/null || true
sleep 1

# Verify partition devices appeared
if [[ ! -b "$BOOT_DEV" || ! -b "$ROOT_DEV" ]]; then
  echo "error: partition devices not found after partprobe."
  echo "  Try: modprobe loop && losetup -P ..."
  exit 1
fi

# ─── 4. FORMAT ───────────────────────────────────────────────────────────────
echo "Formatting boot partition (FAT32)…"
mkfs.vfat -F 32 -n "BOOT" "$BOOT_DEV"

if [[ "$ENCRYPT" == true ]]; then
  echo "Setting up LUKS2 root partition…"
  # The initial passphrase is documented in build.sh output.
  # It MUST be changed with cryptsetup luksChangeKey on the device.
  LUKS_PASS="aura-initial-key"

  printf '%s' "$LUKS_PASS" | cryptsetup luksFormat \
    --type luks2 \
    --cipher aes-xts-plain64 \
    --key-size 512 \
    --hash   sha512 \
    --pbkdf  argon2id \
    --pbkdf-memory 262144 \
    --pbkdf-parallel 4 \
    --iter-time 3000 \
    --batch-mode \
    "$ROOT_DEV" -

  printf '%s' "$LUKS_PASS" | cryptsetup luksOpen "$ROOT_DEV" "$LUKS_NAME" -
  MAPPED_ROOT="/dev/mapper/${LUKS_NAME}"
  LUKS_UUID=$(blkid -s UUID -o value "$ROOT_DEV")
  echo "  LUKS2 UUID: $LUKS_UUID"
else
  MAPPED_ROOT="$ROOT_DEV"
fi

echo "Formatting root partition (ext4)…"
mkfs.ext4 -L "aura-root" -E lazy_itable_init=0 "$MAPPED_ROOT"

# ─── 5. MOUNT ────────────────────────────────────────────────────────────────
mount "$MAPPED_ROOT" "$ROOT_MNT"
mkdir -p "$ROOT_MNT/boot/firmware"
mount "$BOOT_DEV" "$BOOT_MNT"

# ─── 6. COPY ROOTFS ──────────────────────────────────────────────────────────
echo "Copying rootfs (may take several minutes)…"
rsync -aHAX --info=progress2 \
  --exclude=/proc     \
  --exclude=/sys      \
  --exclude=/dev      \
  --exclude=/tmp      \
  --exclude=/run      \
  --exclude=/mnt      \
  --exclude=/aura \
  --exclude=/usr/bin/qemu-aarch64-static \
  --exclude=/var/cache/apt/archives/*.deb \
  --exclude=/var/lib/apt/lists/*_Packages \
  "$ROOTFS/" "$ROOT_MNT/"

# Re-create required empty mount points that rsync --exclude skipped
install -d -m 755 "$ROOT_MNT/proc" "$ROOT_MNT/sys" "$ROOT_MNT/mnt" "$ROOT_MNT/run"
install -d -m 700 "$ROOT_MNT/root"
install -d -m 1777 "$ROOT_MNT/tmp"
install -d -m 755 "$ROOT_MNT/dev"

# ─── 7. FSTAB + CRYPTTAB ─────────────────────────────────────────────────────
BOOT_PARTUUID=$(blkid -s PARTUUID -o value "$BOOT_DEV")
ROOT_PARTUUID=$(blkid -s PARTUUID -o value "$ROOT_DEV")

cat > "$ROOT_MNT/etc/fstab" << EOF
# AuraOS /etc/fstab — generated by 50-image-builder.sh
# <file system>            <mount>         <type>  <options>                <dump>  <pass>
PARTUUID=${BOOT_PARTUUID}  /boot/firmware  vfat    defaults,noatime         0       2
EOF

if [[ "$ENCRYPT" == true ]]; then
  # Root is mounted via dm-crypt; the LUKS device maps to /dev/mapper/aura-root
  echo "UUID=${LUKS_UUID}    /    ext4    defaults,noatime    0    1" \
    | sed 's|^UUID|/dev/mapper/aura-root  /    ext4    defaults,noatime    0    1\n# (luks UUID=|' \
    >> "$ROOT_MNT/etc/fstab" 2>/dev/null || true

  # Simpler, correct fstab for LUKS root
  cat >> "$ROOT_MNT/etc/fstab" << EOF
/dev/mapper/aura-root  /  ext4  defaults,noatime  0  1
EOF

  # crypttab: tells the initramfs which LUKS volume to open at boot
  cat > "$ROOT_MNT/etc/crypttab" << EOF
# <name>          <device>            <keyfile>  <options>
aura-root    UUID=${LUKS_UUID}   none       luks,discard
EOF
  echo "  crypttab written (UUID: $LUKS_UUID)"
else
  echo "PARTUUID=${ROOT_PARTUUID}  /  ext4  defaults,noatime  0  1" >> "$ROOT_MNT/etc/fstab"
fi

# ─── 8. BOOT PARTITION: KERNEL + DTB + OVERLAYS ──────────────────────────────
echo "Populating boot partition…"

# The kernel and DTBs are installed by linux-raspi into /boot/ and
# /lib/firmware/<ver>/device-tree/.  We copy them to the FAT partition
# where the RPi 5 bootloader expects them.

# Also copy anything already in /boot/firmware (linux-firmware-raspi may
# have populated it)
if [[ -d "$ROOT_MNT/boot/firmware" ]] && [[ "$(ls -A "$ROOT_MNT/boot/firmware" 2>/dev/null)" ]]; then
  rsync -a "$ROOT_MNT/boot/firmware/" "$BOOT_MNT/"
fi

# Find the installed raspi kernel
KERNEL_VER=$(ls "$ROOT_MNT/boot/vmlinuz"-*-raspi 2>/dev/null | sort -V | tail -1 \
             | sed "s|${ROOT_MNT}/boot/vmlinuz-||")

if [[ -z "$KERNEL_VER" ]]; then
  echo
  echo "WARNING: No linux-raspi kernel found at $ROOT_MNT/boot/vmlinuz-*-raspi"
  echo "  Step 3 (30-rpi-packages.sh) may not have run, or linux-raspi failed to install."
  echo "  The boot partition will be incomplete — the image will not boot."
  echo
else
  echo "  Kernel version: $KERNEL_VER"

  # RPi 5 bootloader looks for kernel_2712.img by default when arm_64bit=1
  # is set in config.txt.  We also write kernel8.img as a fallback for
  # RPi 4 compatibility (same SD card, different board).
  cp "$ROOT_MNT/boot/vmlinuz-${KERNEL_VER}" "$BOOT_MNT/kernel_2712.img"
  cp "$ROOT_MNT/boot/vmlinuz-${KERNEL_VER}" "$BOOT_MNT/kernel8.img"

  # Initramfs (contains LUKS unlock tools when cryptsetup-initramfs is installed)
  if [[ -f "$ROOT_MNT/boot/initrd.img-${KERNEL_VER}" ]]; then
    cp "$ROOT_MNT/boot/initrd.img-${KERNEL_VER}" "$BOOT_MNT/initrd.img"
    echo "  initrd: initrd.img-${KERNEL_VER}"
  else
    echo "  WARNING: initrd not found for $KERNEL_VER — LUKS unlock may fail at boot."
    echo "    Regenerate on the device: sudo update-initramfs -u -k $KERNEL_VER"
  fi

  # Device tree blobs — bcm2712 for RPi 5, bcm2711 for RPi 4
  DTB_DIR="$ROOT_MNT/lib/firmware/${KERNEL_VER}/device-tree/broadcom"
  if [[ -d "$DTB_DIR" ]]; then
    cp "$DTB_DIR"/bcm2712*.dtb "$BOOT_MNT/" 2>/dev/null && echo "  DTB:    bcm2712 device trees" || \
      echo "  WARNING: bcm2712 DTBs not found in $DTB_DIR"
    cp "$DTB_DIR"/bcm2711*.dtb "$BOOT_MNT/" 2>/dev/null || true   # RPi 4 compat
  else
    echo "  WARNING: Device tree directory not found: $DTB_DIR"
  fi

  # Overlays directory
  OVERLAY_DIR="$ROOT_MNT/lib/firmware/${KERNEL_VER}/device-tree/overlays"
  if [[ -d "$OVERLAY_DIR" ]]; then
    rsync -a "$OVERLAY_DIR" "$BOOT_MNT/"
    echo "  Overlays: $(ls "$OVERLAY_DIR" | wc -l) DTB overlays"
  fi
fi

# ─── 9. config.txt ───────────────────────────────────────────────────────────
# RPi 5 boot configuration.
# [pi5] section is read only on RPi 5; [all] applies to all boards.
# This config assumes a display is attached (HDMI or DSI).
# For headless operation remove display_auto_detect=1 from [all].
cat > "$BOOT_MNT/config.txt" << 'EOF'
# AuraOS — Raspberry Pi 5 boot configuration
# https://www.raspberrypi.com/documentation/computers/config_txt.html

[pi5]
# BCM2712 specific — RPi 5 only reads this section
kernel=kernel_2712.img
arm_64bit=1

# VC7 KMS driver for Wayland/Mir (required by Lomiri compositor)
dtoverlay=vc4-kms-v3d
max_framebuffers=2

# UART0 on GPIO 14/15 for headless serial console (115200 baud)
enable_uart=1
dtparam=uart0=on

# Do not auto-detect camera — avoids loading unused driver modules
camera_auto_detect=0

# Auto-detect display (HDMI / DSI official touchscreen)
display_auto_detect=1

[pi4]
# Fallback for RPi 4 (same image, different board)
kernel=kernel8.img
arm_64bit=1
dtoverlay=vc4-kms-v3d
max_framebuffers=2
enable_uart=1
camera_auto_detect=0
display_auto_detect=1

[all]
# Applied to all boards after the board-specific section
EOF

# ─── 10. cmdline.txt ─────────────────────────────────────────────────────────
# The kernel command line tells Linux how to find and mount the root partition.
# With LUKS the root is the mapped device; without it's the raw PARTUUID.
if [[ "$ENCRYPT" == true ]]; then
  # cryptroot and cryptdevice are understood by cryptsetup-initramfs hooks.
  # 'luks' tells the initramfs to use the crypttab entry for aura-root.
  ROOT_ARG="root=/dev/mapper/aura-root"
  CRYPT_ARGS="cryptdevice=UUID=${LUKS_UUID}:aura-root cryptroot=UUID=${LUKS_UUID}"
else
  ROOT_ARG="root=PARTUUID=${ROOT_PARTUUID}"
  CRYPT_ARGS=""
fi

printf '%s\n' \
  "console=serial0,115200 console=tty1 ${ROOT_ARG} rootfstype=ext4 fsck.repair=yes rootwait ${CRYPT_ARGS} quiet splash" \
  | tr -s ' ' \
  > "$BOOT_MNT/cmdline.txt"

echo "  cmdline.txt written"

# ─── 11. SYNC + UNMOUNT ──────────────────────────────────────────────────────
echo "Syncing filesystems…"
sync

umount "$BOOT_MNT"
umount "$ROOT_MNT"

if [[ "$ENCRYPT" == true ]]; then
  cryptsetup luksClose "$LUKS_NAME"
fi

losetup -d "$LOOP"
LOOP=""
MAPPED_ROOT=""

# ─── 12. COMPRESS ────────────────────────────────────────────────────────────
echo "Compressing with xz (multi-threaded, this takes a few minutes)…"
xz --verbose --threads=0 --compress "$IMG_FILE"

# ─── REPORT ──────────────────────────────────────────────────────────────────
echo
echo "Image complete: ${IMG_FILE}.xz"
du -sh "${IMG_FILE}.xz"
echo
echo "Boot partition contents:"
# Quick summary without re-mounting
file "${IMG_FILE}.xz"
echo
if [[ "$ENCRYPT" == true ]]; then
  echo "LUKS2 passphrase:  aura-initial-key"
  echo "Change with:       sudo cryptsetup luksChangeKey /dev/mmcblk0p2"
  echo
fi
