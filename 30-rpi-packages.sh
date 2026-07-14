#!/usr/bin/env bash
# AuraOS — step 3: Raspberry Pi 5 kernel, firmware, and hardware support
#
# Runs inside the arm64 chroot.  Installs:
#   - Ubuntu's linux-raspi kernel (bcm2712 / RPi 5)
#   - RPi-specific firmware blobs (VideoCore VII, WiFi/BT)
#   - NetworkManager (Lomiri shell uses it for WiFi UI)
#   - Bluetooth stack
#   - Mesa / V3D (GPU — required for Wayland/Mir compositor)
#   - avahi (aura.local mDNS for headless SSH)
#   - flash-kernel (manages kernel installation to boot partition)
#
# Verified target: Ubuntu 24.04 LTS arm64, Raspberry Pi 5 (bcm2712)
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update -qq

# ─── KERNEL + FIRMWARE ───────────────────────────────────────────────────────
# linux-raspi: Ubuntu's meta-package that pulls in the right kernel
#   for the detected board (bcm2711 for RPi 4, bcm2712 for RPi 5).
#   We're building for RPi 5 specifically.
# linux-firmware-raspi: RPi-specific blobs — VideoCore, CYW43455 WiFi/BT.
#   Ubuntu ships this on its preinstalled Pi images, but it isn't in the plain
#   ports archive, so fall back to the general linux-firmware (which carries the
#   Broadcom/CYW43455 blobs). linux-raspi (the kernel) stays mandatory.
apt-get install -y --no-install-recommends linux-raspi
apt-get install -y --no-install-recommends linux-firmware-raspi 2>/dev/null \
  || apt-get install -y --no-install-recommends linux-firmware

# ─── WIRELESS ────────────────────────────────────────────────────────────────
# RPi 5 uses a CYW43455 (BCM4345/6) WiFi 5 / BT 5.0 chip.
# NetworkManager is required by the shell's connectivity indicator.
apt-get install -y --no-install-recommends \
  network-manager \
  wpasupplicant \
  iw \
  wireless-tools

# Pi 5 WiFi firmware (NVRAM). linux-firmware-raspi isn't in the ports archive and
# the generic linux-firmware lacks the Pi-5 board NVRAM, so brcmfmac loads but the
# chip never inits — no wlan interface at all (verified on Pi 5 hardware). Fetch
# the board NVRAM from the Raspberry Pi firmware repo. The board-specific file is
# a symlink to the generic name, so we install brcmfmac43455-sdio.txt directly.
apt-get install -y --no-install-recommends curl ca-certificates
BRCM=/lib/firmware/brcm
mkdir -p "$BRCM"
if [ ! -s "$BRCM/brcmfmac43455-sdio.txt" ]; then
  if curl -fsSL -o "$BRCM/brcmfmac43455-sdio.txt" \
       "https://raw.githubusercontent.com/RPi-Distro/firmware-nonfree/trixie/debian/added-firmware/brcm/brcmfmac43455-sdio.txt"; then
    echo "Pi 5 WiFi NVRAM installed ($(stat -c%s "$BRCM/brcmfmac43455-sdio.txt") bytes)."
  else
    echo "WARNING: could not fetch Pi 5 WiFi NVRAM (no network in chroot?) — WiFi may not work." >&2
  fi
fi

# ─── BLUETOOTH ───────────────────────────────────────────────────────────────
apt-get install -y --no-install-recommends \
  bluez \
  bluetooth \
  pi-bluetooth 2>/dev/null || \
  apt-get install -y --no-install-recommends bluez bluetooth  # fallback if pi-bluetooth unavailable

# ─── GPU / DISPLAY ───────────────────────────────────────────────────────────
# RPi 5 uses VideoCore VII / Mesa V3D (open-source driver, no proprietary blobs).
# libgl1-mesa-dri and libgles2 are pulled in transitively by Lomiri, but we
# pin them explicitly so the Wayland/Mir compositor gets hardware acceleration,
# not llvmpipe software fallback.
apt-get install -y --no-install-recommends \
  mesa-utils \
  libgl1-mesa-dri \
  libgles2 \
  libdrm2

# ─── HARDWARE INTERFACES ─────────────────────────────────────────────────────
# i2c-tools: I2C bus access (sensors, HATs)
# libraspberrypi-bin: vcgencmd, tvservice, etc. — optional, may not exist in
#   noble universe; we absorb the failure.
apt-get install -y --no-install-recommends i2c-tools
apt-get install -y --no-install-recommends libraspberrypi-bin 2>/dev/null || true

# ─── BOOT MANAGEMENT ─────────────────────────────────────────────────────────
# flash-kernel: Ubuntu's tool that installs the kernel and DTBs into the FAT
# boot partition after a kernel upgrade.  We pre-seed the board name so it
# doesn't prompt during the build, and works correctly when the user runs
# `apt upgrade` on the device later.
echo "flash-kernel flash-kernel/machine select Raspberry Pi 5 Model B Rev 1.0" \
  | debconf-set-selections 2>/dev/null || true

mkdir -p /etc/flash-kernel
cat > /etc/flash-kernel/machine << 'EOF'
Raspberry Pi 5 Model B Rev 1.0
EOF

# flash-kernel reads /etc/default/flash-kernel for the kernel cmdline DTB path.
# We set the kernel image name that the RPi 5 bootloader expects.
mkdir -p /etc/default
cat > /etc/default/flash-kernel << 'EOF'
LINUX_KERNEL_CMDLINE=""
LINUX_KERNEL_CMDLINE_DEFAULT=""
EOF

apt-get install -y --no-install-recommends flash-kernel

# ─── NETWORK PRESENCE ────────────────────────────────────────────────────────
# avahi: advertises aura.local so the Pi is reachable by name over LAN
#   without configuring DNS.  Pairs with libnss-mdns for name resolution.
apt-get install -y --no-install-recommends \
  avahi-daemon \
  libnss-mdns

# Enable mDNS resolution for .local domains
sed -i 's/^hosts:.*/hosts: files mdns4_minimal [NOTFOUND=return] dns/' /etc/nsswitch.conf 2>/dev/null || true

# ─── CLOUD-INIT: REMOVE ──────────────────────────────────────────────────────
# Ubuntu's official RPi images ship cloud-init, which phones home to EC2 IMDS
# and Canonical's datasource on every first boot.  We remove it and replace it
# with our own first-boot service in step 4.
if dpkg -l cloud-init &>/dev/null 2>&1; then
  apt-get purge -y --auto-remove cloud-init
fi
# Belt-and-suspenders: disable even if removal fails (e.g., it's depended on)
mkdir -p /etc/cloud/cloud.cfg.d
echo '# AuraOS: cloud-init disabled' > /etc/cloud/cloud.cfg.d/99-disabled.cfg

# ─── ENABLE SERVICES ─────────────────────────────────────────────────────────
for svc in NetworkManager bluetooth avahi-daemon ssh; do
  systemctl enable "$svc" 2>/dev/null || true
done

# Serial console on RPi UART0 (GPIO 14/15) — useful for headless debugging
systemctl enable serial-getty@ttyAMA0.service 2>/dev/null || true

# ─── VERIFY ──────────────────────────────────────────────────────────────────
KERNEL_VER=$(ls /boot/vmlinuz-*-raspi 2>/dev/null | sort -V | tail -1 | sed 's|/boot/vmlinuz-||' || echo "MISSING")
echo
echo "RPi 5 packages installed."
echo "  Kernel:  $KERNEL_VER"
echo "  DTBs:    $(ls /lib/firmware/*/device-tree/broadcom/bcm2712*.dtb 2>/dev/null | wc -l) bcm2712 device trees found"
echo "  Firmware: $(ls /usr/lib/firmware/raspi/*.bin 2>/dev/null | wc -l) blobs in /usr/lib/firmware/raspi/"
