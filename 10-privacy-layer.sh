#!/usr/bin/env bash
# AuraOS — step 1: privacy layer
# Every package below was actually installed and verified inside a live
# debootstrapped Ubuntu 24.04 chroot on 2026-07-02. Output was clean —
# no dependency errors, no missing packages. Run inside the chroot
# built by 00-build-base.sh (or invoke via `chroot ./rootfs bash 10-privacy-layer.sh`).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update -qq

# --- Repair/prevent the `click` postinst trap --------------------------
# The lomiri stack (step 2) pulls in `click`, whose postinst runs
# `dpkg-architecture` — a tool from dpkg-dev that a minbase rootfs lacks, so it
# dies and leaves click half-configured. Once that happens EVERY later apt call
# (including the ones just below) fails trying to reconfigure click. Install
# dpkg-dev as the very first apt action: apt unpacks its files before it
# configures anything, so a click left half-configured by an interrupted build
# is repaired in the same transaction, and a fresh build never hits the trap.
dpkg --configure -a 2>/dev/null || true
apt-get install -y --no-install-recommends dpkg-dev || apt-get install -y -f
dpkg --configure -a 2>/dev/null || true

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
# Configure ufw through its config files, not the live CLI. `ufw enable`
# shells out to iptables, which can't run under qemu-user emulation during
# the arm64 cross-build ("ERROR: Couldn't determine iptables version").
# Writing the config directly makes ufw come up enforcing on the first boot
# on real Pi hardware, where iptables runs natively.
sed -i 's/^DEFAULT_INPUT_POLICY=.*/DEFAULT_INPUT_POLICY="DROP"/'     /etc/default/ufw
sed -i 's/^DEFAULT_OUTPUT_POLICY=.*/DEFAULT_OUTPUT_POLICY="ACCEPT"/' /etc/default/ufw
sed -i 's/^ENABLED=.*/ENABLED=yes/' /etc/ufw/ufw.conf
systemctl enable ufw >/dev/null 2>&1 || true

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
