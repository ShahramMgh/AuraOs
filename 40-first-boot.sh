#!/usr/bin/env bash
# AuraOS — step 4: first-boot configuration
#
# Runs inside the arm64 chroot.  Sets up:
#   - Default user (aura / aura — forced change on first login)
#   - SSH hardening
#   - Hostname + mDNS
#   - Locale (en_US.UTF-8) and timezone (UTC — user changes on device)
#   - Optional WiFi pre-seed (from WIFI_SSID / WIFI_PASS env vars)
#   - Serial console on ttyAMA0 (GPIO UART) for headless debugging
#   - Lightweight first-boot message shown on login
#   - lightdm auto-login into Lomiri touch session
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

USERNAME="aura"

# ─── USER ────────────────────────────────────────────────────────────────────
if ! id "$USERNAME" &>/dev/null; then
  useradd -m -s /bin/bash \
    -G sudo,audio,video,plugdev,netdev,bluetooth,dialout,i2c \
    "$USERNAME"
fi

echo "${USERNAME}:aura" | chpasswd
# Force password change on first interactive login
passwd -e "$USERNAME"

# sudo access comes from the `sudo` group membership set above (useradd -G),
# same as a normal Ubuntu install — sudo asks for the user's own password,
# no factory-set bypass.

# ─── HOSTNAME ────────────────────────────────────────────────────────────────
echo "aura" > /etc/hostname

cat > /etc/hosts << 'EOF'
127.0.0.1   localhost
127.0.1.1   aura aura.local
::1         localhost ip6-localhost ip6-loopback
ff02::1     ip6-allnodes
ff02::2     ip6-allrouters
EOF

# ─── LOCALE + TIMEZONE ───────────────────────────────────────────────────────
apt-get install -y --no-install-recommends locales tzdata

# Generate locale without prompting
echo "en_US.UTF-8 UTF-8" >> /etc/locale.gen
locale-gen
update-locale LANG=en_US.UTF-8

# Default to UTC; the user can run `sudo timedatectl set-timezone Region/City`
# after first boot.
ln -sf /usr/share/zoneinfo/UTC /etc/localtime
echo "UTC" > /etc/timezone

# ─── SSH ─────────────────────────────────────────────────────────────────────
apt-get install -y --no-install-recommends openssh-server

# Generate host keys at build time so they're stable across reboots.
# (The alternative is generating at first boot via ssh-keygen -A which is
# fine but adds a second or two to first boot.)
mkdir -p /etc/ssh
if ! ls /etc/ssh/ssh_host_*_key &>/dev/null 2>&1; then
  ssh-keygen -A
fi

# Harden sshd_config.  We keep password auth on for the initial setup
# window (the user must change the password before doing anything sensitive).
# After first login, the user should add their public key and set
# PasswordAuthentication no.
cat >> /etc/ssh/sshd_config << 'EOF'

# AuraOS hardening
PermitRootLogin no
X11Forwarding no
MaxAuthTries 4
LoginGraceTime 20
EOF

systemctl enable ssh 2>/dev/null || true

# ─── WIFI PRE-SEED ───────────────────────────────────────────────────────────
# If build.sh was invoked with --wifi SSID:password, write a NetworkManager
# connection profile so WiFi connects automatically on first boot.
if [[ -n "${WIFI_SSID:-}" && -n "${WIFI_PASS:-}" ]]; then
  echo "Pre-configuring WiFi SSID: ${WIFI_SSID}"
  mkdir -p /etc/NetworkManager/system-connections
  cat > "/etc/NetworkManager/system-connections/${WIFI_SSID}.nmconnection" << EOF
[connection]
id=${WIFI_SSID}
type=wifi
autoconnect=true
autoconnect-priority=10

[wifi]
ssid=${WIFI_SSID}
mode=infrastructure

[wifi-security]
key-mgmt=wpa-psk
psk=${WIFI_PASS}

[ipv4]
method=auto

[ipv6]
method=auto
EOF
  chmod 600 "/etc/NetworkManager/system-connections/${WIFI_SSID}.nmconnection"
fi

# ─── SERIAL CONSOLE ──────────────────────────────────────────────────────────
# RPi 5 UART0 is on GPIO 14 (TX) and 15 (RX).  Useful when there is no
# display and the device hasn't joined WiFi yet.
# Baud rate matches what config.txt sets (115200).
systemctl enable serial-getty@ttyAMA0.service 2>/dev/null || true

# ─── LIGHTDM AUTO-LOGIN ───────────────────────────────────────────────────────
# For the prototype, auto-login the aura user into the Lomiri touch session
# so the shell appears immediately after boot without a greeter PIN.
# TODO: replace with lomiri-greeter PIN unlock before a production build.
if [[ -f /etc/lightdm/lightdm.conf ]]; then
  # Enable auto-login section if not present
  grep -q '\[Seat:\*\]' /etc/lightdm/lightdm.conf || echo '[Seat:*]' >> /etc/lightdm/lightdm.conf

  # Set auto-login user and session
  sed -i '/\[Seat:\*\]/a autologin-user=aura\nautologin-session=lomiri-touch\nautologin-user-timeout=0' \
    /etc/lightdm/lightdm.conf 2>/dev/null || true
fi

# ─── FIRST-BOOT MESSAGE ──────────────────────────────────────────────────────
# Shown in the terminal on first SSH login / serial login.
cat > /etc/profile.d/aura-welcome.sh << 'WELCOME'
#!/bin/sh
[ "$(id -u)" -ne 0 ] || return    # skip for root sessions
[ -t 0 ] || return                 # only interactive shells

cat << 'MSG'

AuraOS — first boot.

  Device    aura.local
  SSH       ssh aura@aura.local
  Serial    115200 baud on GPIO 14/15

You'll be asked to set your own password now — that's the only thing that
can't wait. One more when you get a chance, no rush:
  - Change the disk encryption passphrase from its initial default:
      sudo cryptsetup luksChangeKey /dev/mmcblk0p2

MSG
WELCOME

chmod +x /etc/profile.d/aura-welcome.sh

# ─── LUKS INITRAMFS HOOK ─────────────────────────────────────────────────────
# cryptsetup-initramfs makes the initramfs include the LUKS unlock tooling.
# This is what prompts for the passphrase at boot before mounting root.
apt-get install -y --no-install-recommends cryptsetup-initramfs

# Tell initramfs-tools to include the root LUKS volume.
# The UUID is not known yet (it's set when 50-image-builder.sh creates the
# LUKS partition); we use RESUME=none and let the kernel command line
# (root=UUID=...) drive the unlock via cryptroot-unlock.
grep -q "^CRYPTSETUP=y" /etc/cryptsetup-initramfs/conf-hook 2>/dev/null || \
  echo "CRYPTSETUP=y" >> /etc/cryptsetup-initramfs/conf-hook

# ─── GENERATE INITRAMFS ──────────────────────────────────────────────────────
# The kernel postinst only *defers* initramfs creation inside the build chroot,
# leaving /boot/initrd.img a dangling symlink and no real initrd. Without it the
# image can't unlock LUKS (or even load the mmc/ext4 modules) and won't boot, so
# generate it explicitly now — with the cryptsetup hooks installed just above
# baked in. Hard-fail if nothing is produced, rather than ship an unbootable img.
KERNEL_VER="$(cd /boot && ls vmlinuz-*-raspi 2>/dev/null | sed 's/vmlinuz-//' | sort -V | tail -1)"
if [[ -n "$KERNEL_VER" ]]; then
  echo "Generating initramfs for $KERNEL_VER (LUKS unlock + boot modules)…"
  if [[ -f "/boot/initrd.img-$KERNEL_VER" ]]; then
    update-initramfs -u -k "$KERNEL_VER"
  else
    update-initramfs -c -k "$KERNEL_VER"
  fi
  if [[ -f "/boot/initrd.img-$KERNEL_VER" ]]; then
    echo "  initrd.img-$KERNEL_VER generated ($(du -h "/boot/initrd.img-$KERNEL_VER" | cut -f1))"
  else
    echo "ERROR: initramfs generation produced no initrd for $KERNEL_VER" >&2
    exit 1
  fi
fi

# ─── SUMMARY ─────────────────────────────────────────────────────────────────
echo
echo "First-boot configuration complete."
echo "  User:     $USERNAME  (password expires on first login)"
echo "  Hostname: aura / aura.local"
echo "  SSH:      enabled, root login disabled"
echo "  LUKS:     cryptsetup-initramfs installed"
# Use a full `if` (not `test && echo`): as the script's last command, a bare
# `&&` whose test fails would make the whole script exit non-zero and abort the
# build, even though first-boot config succeeded.
if [[ -n "${WIFI_SSID:-}" ]]; then
  echo "  WiFi:     ${WIFI_SSID} pre-configured"
fi
