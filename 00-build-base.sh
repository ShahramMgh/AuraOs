#!/usr/bin/env bash
# AuraOS — step 0: base rootfs
# Produces a genuine, minimal Ubuntu 24.04 LTS rootfs (~130 MB).
#
# archive.ubuntu.com only serves amd64/i386.
# arm64 (and all other non-x86 arches) must use ports.ubuntu.com/ubuntu-ports.
set -euo pipefail

ARCH="${1:-arm64}"          # arm64 for Raspberry Pi 5
SUITE="noble"               # Ubuntu 24.04 LTS
TARGET="./rootfs"

# Select the correct mirror for the target architecture
if [[ "$ARCH" == "amd64" || "$ARCH" == "i386" ]]; then
  MIRROR="http://archive.ubuntu.com/ubuntu"
  SECURITY_MIRROR="http://security.ubuntu.com/ubuntu"
else
  # arm64, armhf, riscv64, etc. — all served from ports
  MIRROR="http://ports.ubuntu.com/ubuntu-ports"
  SECURITY_MIRROR="http://ports.ubuntu.com/ubuntu-ports"
fi

if ! command -v debootstrap >/dev/null; then
  apt-get update -qq
  apt-get install -y debootstrap
fi

# Skip if rootfs already exists and looks populated (allows re-running
# build.sh after a partial failure without re-downloading everything)
if [[ -d "$TARGET/usr/bin" ]]; then
  echo "Rootfs already exists at $TARGET — skipping debootstrap."
  exit 0
fi

mkdir -p "$TARGET"
debootstrap --arch="$ARCH" --variant=minbase "$SUITE" "$TARGET" "$MIRROR"

# Write sources.list using the architecture-correct mirrors.
# universe is where Lomiri, bubblewrap, firejail, syncthing, etc. live.
cat > "$TARGET/etc/apt/sources.list" << EOF
deb $MIRROR $SUITE main universe
deb $MIRROR $SUITE-updates main universe
deb $SECURITY_MIRROR $SUITE-security main universe
EOF

echo "Base rootfs built at $TARGET (arch: $ARCH, mirror: $MIRROR)"
