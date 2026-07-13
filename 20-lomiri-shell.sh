#!/usr/bin/env bash
# AuraOS — step 2: the phone shell
#
# VERIFIED 2026-07-02 against archive.ubuntu.com noble/universe:
#   `apt-cache policy lomiri` resolved a real candidate (0.2.1-10build1)
#   with a full, correct dependency chain: Mir compositor backends,
#   Ayatana indicators, lomiri-desktop-session / lomiri-touch-session,
#   Qt/QML modules. No PPA needed on 24.04 LTS — it's in Ubuntu's own
#   archive. This is NOT installed in this sandbox (it pulls in a full
#   Qt/Mir graphics stack — multi-GB and this container has no display
#   to actually show it), so treat the resolver check as confirmed and
#   this actual `apt-get install` as the next real step to run yourself,
#   on a machine or Pi with a screen attached.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
# noble ships the session as `lomiri-desktop-session`; the old
# `lomiri-touch-session` name no longer resolves (apt: "replaced by lomiri").
apt-get install -y --no-install-recommends \
  lomiri lomiri-desktop-session lomiri-greeter \
  mir-platform-graphics-gbm-kms lightdm

# Make Lomiri (not GNOME/unity) the default session. This is only the
# fallback session — step 70 repoints lightdm's autologin at Aura Shell.
if [ -f /etc/lightdm/lightdm.conf ]; then
  sed -i 's/^#\?user-session=.*/user-session=lomiri/' /etc/lightdm/lightdm.conf
fi

echo "Lomiri touch shell installed. Reboot into it via lightdm."
