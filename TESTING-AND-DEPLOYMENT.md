# Testing on your PC, then deploying to Raspberry Pi 5

Three tiers, each catching different bugs — don't skip straight to hardware.

## Tier 1 — Docker / VS Code Dev Container (fast inner loop)

Use this while you're actively editing the build scripts.

1. Open this repo folder in VS Code with the **Dev Containers** extension installed.
2. The `.devcontainer/devcontainer.json` in the repo is auto-discovered — no copying needed.
3. "Reopen in Container." In the integrated terminal:
   ```
   bash 10-privacy-layer.sh
   ```
   This is exactly the command that produced the clean install log earlier in this conversation — same packages, same archive, same result.
4. **Known limitation, by design**: AppArmor can't truly enforce inside an unprivileged container (no LSM hooks), and there's no display, so you won't see Lomiri render here. This tier is for catching apt/dependency/script bugs fast, not for a final check.

## Tier 2 — QEMU/VirtualBox VM (the honest check)

This is where you actually see **Aura Shell** render in its real session and get real AppArmor enforcement.

1. Install Ubuntu 24.04 LTS Desktop (x86_64) in QEMU/KVM or VirtualBox — a normal ISO install, not the rootfs we built. This is a realistic stand-in for Pi 5 behavior, just not identical GPU drivers.
2. Copy this repo into the VM. The fastest way to see the real shell:
   ```
   sudo apt install cage epiphany-browser   # 24.04+: WPE 'cog' is gone, use WebKitGTK
   ./try-shell.sh --kiosk
   ```
   This starts the system-bridge agent and launches the exact **cage** kiosk session the device boots into — the shell fills the screen, shows the `LIVE` badge, and reflects the VM's real battery/network/brightness. (Drop `--kiosk` to just open it in a browser.) On 24.04+ the engine is WebKitGTK (`epiphany`); the chromeless WPE `cog` only exists on 22.04.
3. To test it as an *installed default session* instead: run `10-privacy-layer.sh`, `20-lomiri-shell.sh` (for lightdm), then `70-aura-shell.sh` as root, and reboot — lightdm auto-logs into Aura Shell.
4. Verify AppArmor is actually enforcing: `aa-status` should show profiles in "enforce" mode, not just installed.

## Tier 3 — Raspberry Pi 5 (the real target)

1. Flash **Ubuntu Server 24.04 LTS (arm64)** — not Desktop, we install our own shell on top — using Raspberry Pi Imager. Double-check `ubuntu.com/download/raspberry-pi` at flash time; Canonical's supported-image list shifts release to release and you want the current LTS.
2. First boot over SSH (Pi Imager lets you preconfigure SSH + hostname). Copy the repo over:
   ```
   scp -r . ubuntu@<pi-ip>:~/aura-os/
   ```
3. Run in order: `10-privacy-layer.sh`, `20-lomiri-shell.sh` (installs lightdm), `30-rpi-packages.sh`, `40-first-boot.sh`, then `70-aura-shell.sh`. (Or just run the whole `build.sh` on a build host and flash the resulting image — `70` is wired into it.)
4. `sudo reboot` — you should land on **Aura Shell** (lightdm auto-login → cage + WebKitGTK) on the Pi 5's attached display.
5. Things that only reveal themselves on real hardware, budget time for these: touchscreen digitizer calibration (if you're using a touch panel rather than a monitor+mouse), GPU driver behavior specific to the Pi 5's VideoCore VII (Mesa/V3D — generally solid per current driver status, but confirm `eglinfo` shows the hardware driver, not `llvmpipe` software fallback), and power delivery (Pi 5 is picky about supply — official 27W USB-C recommended, undervoltage will throttle unpredictably).

## What's proven vs. what still needs your hands

| Claim | Status |
|---|---|
| Ubuntu 24.04 debootstraps cleanly, chroot works | **Verified live**, this session |
| ufw/apparmor/cryptsetup/wireguard/firejail/bubblewrap/flatpak/syncthing all install cleanly from the real archive | **Verified live**, this session |
| Telemetry packages (apport/whoopsie/popcon/ubuntu-report) absent by default on minbase, purge commands run cleanly | **Verified live**, this session |
| `lomiri` resolves in Ubuntu 24.04's own universe archive (kept as fallback session) | **Verified live**, this session (resolver check only) |
| Aura Shell renders every screen and runs every flow with no errors | **Verified live**, this session — driven in headless Firefox (sim mode) |
| Shell pulls real device state through the agent (LIVE badge, real battery/Wi-Fi/clock) | **Verified live**, this session — agent run against this host, driven in Firefox |
| `aura-agent.py` reads real `nmcli`/`/sys` state and serves the shell | **Verified live**, this session |
| Local API is authenticated — every `/api/*` (incl. `/api/exec`, `/api/files/*`) refuses an unauthenticated caller (401); the shell works with the injected per-boot token | **Verified live**, this session — `curl` + headless Firefox; regression `tests/test_auth.py` (10 checks). *Same-user scrape still open until app sandboxing (blueprint 6.3.1)* |
| The resident composes multi-step plans from one capability catalog, learns routines, and offers proactive suggestions | **Verified live**, this session — engine via `curl`, flows in headless Firefox (sim); *not on hardware; episode log not yet Vault-encrypted* |
| Image builds → flashes → boots on a real Pi 5 (kernel + initramfs + root mount + systemd + lightdm auto-login) | **Verified on hardware** (2026-07-14) — after fixing initramfs generation, `config.txt` `initramfs`, cmdline, auto-login drop-in, graphical-target wiring |
| Shell renders inside the real cage kiosk session (WebKitGTK/epiphany) on the Pi 5 display | **Verified on hardware** (2026-07-14) — chromeless once the epiphany web-app profile crash was fixed; agent serves the shell and reads real Pi 5 state |
| WiFi (CYW43455) and Ethernet on the Pi 5 | **Verified on hardware** (2026-07-14) — Ethernet via netplan; WiFi needs the Pi 5 board NVRAM (`brcmfmac43455-sdio.txt`), now fetched at build time |
| On-screen keyboard under the `cage` kiosk | **Does not work** — cage exposes no `layer-shell`/`input-method`, so no OSK can display. Drives the open question of a native shell |
| Pi 5-specific GPU hardware-accel, touchscreen digitizer, power/thermal | **Not yet verified** — rendered fine with mouse + HDMI, but hw-accel (v3d vs llvmpipe), touch, and power headroom still need a real touch panel + supply |
| LUKS unlock on the Pi 5 | **Not yet verified** — bring-up images built `--no-encrypt`; cmdline `cryptopts=` + crypttab-in-initrd path still incomplete |
