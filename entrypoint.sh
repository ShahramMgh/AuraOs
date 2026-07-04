#!/usr/bin/env bash
# Re-registers QEMU binfmt_misc on container restart.
# Needed because binfmt_misc registrations don't survive a full reboot of
# the container host (they live in the kernel, not on disk).
set -e

if [[ -d /proc/sys/fs/binfmt_misc ]]; then
  update-binfmts --enable qemu-aarch64 2>/dev/null || true
else
  echo "WARNING: binfmt_misc not available. arm64 chroot won't work." \
       "Ensure the container is running with --privileged." >&2
fi

exec "$@"
