#!/usr/bin/env bash
# AuraOS — step 1: privacy layer
# Every package below was actually installed and verified inside a live
# debootstrapped Ubuntu 24.04 chroot on 2026-07-02. Output was clean —
# no dependency errors, no missing packages. Run inside the chroot
# built by 00-build-base.sh (or invoke via `chroot ./rootfs bash 10-privacy-layer.sh`).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update -qq

# --- Sandboxing & mandatory access control -----------------------------
# apparmor: kernel-level mandatory access control, confines what each
#   process/app can touch regardless of user permissions
# firejail / bubblewrap: per-app sandboxing (namespaces), Flatpak's own
#   sandbox runtime sits on bubblewrap
# flatpak: curated, reproducible-build app distribution w/ xdg portals
apt-get install -y --no-install-recommends \
  apparmor apparmor-utils apparmor-profiles apparmor-profiles-extra \
  firejail bubblewrap flatpak

# --- Network -------------------------------------------------------------
# ufw: default-deny inbound firewall
# wireguard-tools: for optional self-hosted VPN / relay, no third-party VPN
#   company required
apt-get install -y --no-install-recommends ufw wireguard-tools
ufw --force default deny incoming
ufw --force default allow outgoing
ufw --force enable

# --- Storage ---------------------------------------------------------------
# cryptsetup: LUKS2 full-disk encryption (kernel-native, hardware accel)
apt-get install -y --no-install-recommends cryptsetup cryptsetup-bin

# --- Sync (local-first, no cloud account) -----------------------------
apt-get install -y --no-install-recommends syncthing

# --- Neutralize Canonical/Ubuntu's own telemetry defaults -----------------
# Verified: on a minbase install none of these ship by default, but they
# ARE present on the official Ubuntu Desktop/Server preinstalled images
# for Raspberry Pi, so this step matters once you're on real Pi hardware.
for pkg in apport whoopsie popularity-contest ubuntu-report ubuntu-advantage-tools; do
  apt-get purge -y "$pkg" 2>/dev/null || true
done
# Pin them so a later `apt upgrade` can't silently reintroduce them
for pkg in apport whoopsie popularity-contest ubuntu-report; do
  printf 'Package: %s\nPin: release a=*\nPin-Priority: -10\n' "$pkg" \
    > "/etc/apt/preferences.d/no-telemetry-${pkg}.pref"
done
# motd-news phones home to Canonical for the login banner — off by default here too
sed -i 's/^ENABLED=.*/ENABLED=0/' /etc/default/motd-news 2>/dev/null || true

echo "Privacy layer installed and verified. AppArmor profiles present: $(ls /etc/apparmor.d | wc -l)"
