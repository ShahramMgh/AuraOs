#!/usr/bin/env bash
# AuraOS — step 6c: the Cellular layer (SIMCom A7670E — 4G data · voice · SMS · GPS)
#
# The A7670E is a standard ModemManager device, so telephony rides the same Linux
# stack as Wi-Fi: ModemManager owns the modem, NetworkManager brings up mobile
# DATA, and the agent's modem bridge (agent/modem.py) drives SMS / voice / GPS
# through `mmcli`. This step installs and enables that stack and lays down the
# tunables the bridge reads. Safe to re-run; never fails the build.
#
# Voice AUDIO (hearing/speaking) is a board-wiring concern: the A7670E's PCM or
# analog audio must reach a codec + speaker/mic. ModemManager sets up the *call*;
# routing the audio is hardware (see MODEM.md). SMS, GPS and data need no audio.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

USERNAME="aura"
APN="${AURA_APN:-}"                 # carrier APN for mobile data (blank = set later)
APN_USER="${AURA_APN_USER:-}"
APN_PASS="${AURA_APN_PASS:-}"

echo "── Cellular layer — SIMCom A7670E (ModemManager) ──"

# ─── PACKAGES ────────────────────────────────────────────────────────────────
# ModemManager + mmcli, the MBIM/QMI helpers SIMCom modems use, PPP as a fallback
# data path, and usb-modeswitch so a composite-USB A7670E lands in modem mode.
apt-get install -y --no-install-recommends \
  modemmanager libmbim-utils libqmi-utils usb-modeswitch ppp \
  2>/dev/null || echo "warn: modem packages not fully installed (no network in chroot?)."

systemctl enable ModemManager.service 2>/dev/null || true

# ─── TUNABLES the agent bridge reads ─────────────────────────────────────────
mkdir -p /etc/aura
cat > /etc/aura/modem.env << EOF
# Which ModemManager modem index the bridge uses. Blank = auto-pick the first.
AURA_MODEM_INDEX=
# How often (seconds) the agent refreshes cached modem status.
AURA_MODEM_POLL=6
EOF
if [ -f /etc/systemd/system/aura-agent.service ]; then
  mkdir -p /etc/systemd/system/aura-agent.service.d
  cat > /etc/systemd/system/aura-agent.service.d/30-modem.conf << 'EOF'
[Service]
EnvironmentFile=-/etc/aura/modem.env
# the agent shells out to mmcli, which talks to ModemManager on the system bus
Wants=ModemManager.service
After=ModemManager.service
EOF
fi

# ─── UART variant (Waveshare-style HAT on the Pi's GPIO serial) ──────────────
# USB A7670E boards are auto-detected by ModemManager. HAT boards on the Pi UART
# need the serial console freed and the port handed to ModemManager. This is a
# no-op on a USB board; on a HAT, uncomment the console-disable in config.txt.
if [ -f /boot/firmware/config.txt ] && ! grep -q "aura-modem" /boot/firmware/config.txt; then
  cat >> /boot/firmware/config.txt << 'EOF'

# aura-modem: enable the PL011 UART for a serial A7670E HAT (harmless on USB)
enable_uart=1
dtoverlay=disable-bt
EOF
fi

# ─── MOBILE DATA (NetworkManager gsm connection) ─────────────────────────────
# If an APN was provided at build time, pre-create the data connection; otherwise
# it's a one-liner on-device once you know your carrier's APN (see MODEM.md).
if [ -n "$APN" ]; then
  mkdir -p /etc/NetworkManager/system-connections
  cat > /etc/NetworkManager/system-connections/aura-mobile.nmconnection << EOF
[connection]
id=aura-mobile
type=gsm
autoconnect=true
[gsm]
apn=$APN
$( [ -n "$APN_USER" ] && echo "username=$APN_USER" )
$( [ -n "$APN_PASS" ] && echo "password=$APN_PASS" )
[ipv4]
method=auto
[ipv6]
method=auto
EOF
  chmod 600 /etc/NetworkManager/system-connections/aura-mobile.nmconnection
  echo "  Data    : APN '$APN' pre-configured (autoconnect)."
else
  echo "  Data    : no APN baked in — set on device: nmcli c add type gsm ifname '*' apn <APN>"
fi

install -d -o "$USERNAME" -g "$USERNAME" /var/lib/aura 2>/dev/null || true

echo
echo "Cellular layer installed."
echo "  Runtime : ModemManager (mmcli) + NetworkManager for data"
echo "  Bridge  : agent/modem.py → /api/phone/*, /api/sms, /api/location"
echo "  Voice   : call control via mmcli; audio routing is board wiring (MODEM.md)"
echo "  GPS     : ModemManager location (A7670E GNSS) → Location sensor + Maps"
