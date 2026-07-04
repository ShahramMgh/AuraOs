# Aura — a privacy-first mobile Linux OS
### Architecture & technology justification (v0.2 — Ubuntu base, verified build)

> **Revision note:** v0.1 of this doc proposed a postmarketOS/Alpine base. That was reconsidered per your request to be able to use Ubuntu's own package ecosystem/services, and re-verified against Raspberry Pi 5 as the concrete target. See `TESTING-AND-DEPLOYMENT.md` for the live build log — every package and command below was actually run against the real Ubuntu archive, not assumed.
>
> **The decision, double-checked:** Ubuntu 24.04/26.04 LTS wins over both postmarketOS and Raspberry Pi OS for this specific project, for one concrete, verifiable reason — Lomiri (the actual touch shell) resolves cleanly from Ubuntu's own `universe` archive with a correct dependency chain, confirmed live via `apt-cache policy lomiri` against archive.ubuntu.com. On Raspberry Pi OS (Debian Bookworm stable), Lomiri is only packaged for Debian *unstable* — mixing sid packages onto a stable base is the kind of fragility a privacy/security-focused build shouldn't carry. Raspberry Pi OS still has better first-party Pi 5 driver support (Raspberry Pi Foundation maintains it directly), but Ubuntu's official Pi 5 images are confirmed solid (real Mesa/VideoCore VII acceleration, 4K@60 reported working) — the tradeoff favors Ubuntu once the shell package is the deciding factor.

## 1. Design goal & threat model

The product goal: a phone-sized Linux computer where **the user, not a company, holds the keys** — no mandatory cloud account, no telemetry by default, every permission visible and revocable, and all personal data encrypted and under the user's physical control.

Threat model this MVP targets: passive data collection by app/OS vendors, opportunistic device theft, and silent background access to mic/camera/location/contacts. It explicitly does **not** target nation-state hardware attacks (that's Librem 5 kill-switch territory) or malicious-app supply-chain attacks (that's a curated-repo problem, addressed but not solved here).

## 2. Why this stack, not something invented from scratch

Building a phone OS from zero (own kernel, own drivers, own compositor) is a multi-hundred-engineer, decade-scale effort — every hobbyist project that tried this (Sailfish, Tizen, Firefox OS) stalled on hardware support. So the right move is **compose proven, actively-maintained open components**, and put the privacy work into the layer that's actually new: the permission model and the shell UX. This is also how postmarketOS, Mobian, and Ubuntu Touch all approach it.

| Layer | Choice | Why | Rejected alternative |
|---|---|---|---|
| Base distro | **Ubuntu Server 24.04/26.04 LTS** (`debootstrap` minbase, `noble`) | Full access to Ubuntu's own package ecosystem/services as requested; officially imaged for Raspberry Pi 5 by Canonical with confirmed working GPU acceleration; debootstrapped and chroot-verified live in this session | postmarketOS/Alpine (better phone-tuned, but locks you out of the Ubuntu ecosystem you specifically want); Raspberry Pi OS/Debian Bookworm (best Pi 5 driver support, but Lomiri isn't reliably packaged for stable Debian — see decision note above) |
| Compositor/session | **cage** (wlroots kiosk compositor) + a **web engine** (WPE **cog** where available, else **WebKitGTK**/epiphany) | We don't write a compositor — that's the years-of-work trap. cage owns the display and runs one app fullscreen; the web engine renders our shell. **Engine note:** cog (WPE WebKit) is the ideal chromeless kiosk browser, but Ubuntu removed the entire WPE stack (`libwpe`, `wpebackend-fdo`, `libwpewebkit`, `cog`) after 22.04 — and the Pi 5 is only supported on 24.04+, so we can't stay on 22.04 to keep it. On 24.04+ the shell therefore renders with WebKitGTK (GNOME Web / `epiphany`), still real WebKit and apt-installable in the chroot; the launcher auto-prefers `cog` or `chromium --kiosk` if either is present. Lomiri stays installed as a manually-selectable fallback session | Lomiri as the *primary* shell (someone else's UX + a multi-GB Qt/Mir stack; kept only as fallback); custom compositor from scratch (reinvents years of work); dropping to Ubuntu 22.04 to keep WPE cog (rejected — no Pi 5 support); chromium via snap (can't install in a debootstrap chroot, and adds snap to a privacy-first base) |
| Shell / UI | **Aura Shell v1.0** — our own web-tech UI (see `SHELL.md`), served locally by a stdlib Python system-bridge agent | Independent design: keeps the patterns people like (app grid, dock, quick settings) and makes its own the parts that deliver sovereignty (live access ribbon, per-app permissions, network log, vault, sensor guards). Web tech means the UI is fast to build, easy to audit, and testable in any browser or VM before touching hardware | Adopting a stock shell's UX wholesale (doesn't express the privacy model); a native Qt/GTK shell (far more code for v1, harder to iterate on the interaction design) |
| App isolation | **Bubblewrap + Flatpak + xdg-desktop-portal** | This is the actual Linux sandboxing primitive (namespaces + seccomp) that both Flatpak and Firejail sit on; xdg-desktop-portal is the standard mediator that makes "app asks OS, OS asks user" possible instead of apps self-granting access | Full custom container runtime (reinvents a solved problem, worse security review coverage) |
| Android apps | **Waydroid** (Android in LXC on the host kernel), exposed only via the agent's `/api/android/*` | Native — Android runs directly on the ARM cores, not emulated. Kept light on purpose: the heavy *session* is started on demand and idle-stopped, frozen when hidden (`suspend`), run as individual windows (`multi_windows`), confined to a memory-capped cgroup (`waydroid.slice`) with zram headroom, and GApps-free. Apps install by pushing an APK (path or URL) — no resident store. See `ANDROID.md` | Anbox (unmaintained); an x86 Android emulator (emulation tax, no ARM benefit); shipping Google Play services (permanent RAM/CPU/network drain, and re-introduces the dependency the device exists to remove) |
| Storage | **LUKS2 full-disk encryption** + **fscrypt** per-directory encryption for the vault | Kernel-native, hardware-accelerated on most SBCs, no proprietary blobs, exactly what postmarketOS already recommends | Custom userspace crypto (larger attack surface, unaudited) |
| Sync / backup | **Syncthing** (local-first, peer-to-peer, no server) | Only mainstream tool that does real end-to-end sync with *zero* mandatory third-party server — device-to-device over LAN or self-hosted relay | iCloud/Google Drive-style sync (defeats the entire premise); a new custom sync protocol (unaudited crypto is a bad idea) |
| Package source | Curated Flathub subset + F-Droid-style reproducible builds | Both already do reproducible-build verification; avoids trusting a single app-store operator with unlimited push access | Google Play compatibility layer (reintroduces the exact dependency being removed) |

**Alternative seriously considered and rejected:** shipping GrapheneOS instead of building this. Current research (mid-2026) is consistent that Pixel+GrapheneOS is the more *practical* daily-driver privacy option today — better app compatibility, faster security patching, hardened Android internals. That's a legitimate answer to "what should I buy today," but it isn't a Linux OS and it's structurally tied to one vendor's hardware supply chain, which conflicts with the "not trusting big companies" goal. postmarketOS + a custom shell is the slower, rougher path, but it's the one that's actually independent of any single company.

## 3. What "privacy by design" means concretely in the shell

1. **No account, ever, to use the phone.** First boot asks for a device PIN, nothing else. An account is only created if the user opts into sync, and it's a self-generated device keypair, not an email/company login.
2. **Live access indicator** — any mic/camera/location grab shows a persistent on-screen dot the whole time it's active (this is a portal-layer hook, not per-app trust).
3. **Ask once per app, not once per use.** The first time an app wants the camera, mic, or location, it asks — you decide, and that decision is remembered, so you're not re-approving the same app over and over. Every grant stays visible and instantly revocable from one settings screen, so control never depends on being re-asked.
4. **Data Vault** — anything an app writes to shared storage (photos, contacts, files) lives in an fscrypt-encrypted volume that's unreadable without the device unlocked, including to a physically removed storage chip.
5. **Network transparency** — a per-app network log (which apps phoned home, how often, to where) is a first-class settings screen, not a hidden log file.

## 4. What's a clickable mockup vs. what's a real, verified build

Two separate deliverables now exist, and it matters which is which:

- **`auraos-prototype.html`** — the original interaction-model mockup. Superseded by the real shell below; kept for reference.
- **`shell/` + `agent/`** — **Aura Shell v1.0**, the real UI (see `SHELL.md`). This is a genuine, working shell: it renders every screen, runs the full permission/launch flow, and — when the agent is present — pulls real device state and drives real system controls. Both paths were exercised this session in a real browser (headless Firefox): the simulation path ran every screen and flow with zero uncaught errors, and the live path was confirmed to detect the agent, show the `LIVE` badge, and reflect the machine's actual battery/Wi-Fi/clock. The agent was run against this host and returned real `nmcli`/`/sys` state. Screenshots of home, control, permissions, the permission prompt, and vault were captured and reviewed.
- **`aura-build/`** (the `*.sh` pipeline) — a real build pipeline, exercised live against the actual Ubuntu archive this session (see `TESTING-AND-DEPLOYMENT.md`). `debootstrap` produced a genuine, chroot-functional Ubuntu 24.04 rootfs; every privacy-layer package installed cleanly; `70-aura-shell.sh` installs the cage + web-engine session and deploys the shell + agent as the default session.

What's still unverified, honestly: the shell has been seen rendering in a desktop browser and as the served page, but **not yet inside the real cage + WebKitGTK session on Pi 5 hardware** — GPU driver behavior, touch input, and power delivery on the actual board are unknowns until Tier 2/3 in the testing doc. Full external GUI-app launching and the xdg-desktop-portal sensor hook are the known v1.1 items (see `SHELL.md`).

## 5. Roadmap from here

1. **Tier 1 (PC, fast loop)** — iterate on the build scripts and the shell in the Dev Container. The shell itself iterates instantly: `./try-shell.sh` (browser) or `python3 -m http.server` in `shell/`.
2. **Tier 2 (PC, VM)** — install Ubuntu 24.04 Desktop in QEMU/VirtualBox and run `./try-shell.sh --kiosk` to confirm **Aura Shell renders in the real cage kiosk session** (and AppArmor actually enforces — containers can't prove this, VMs can).
3. **Tier 3 (Pi 5)** — flash Ubuntu Server 24.04/26.04 LTS arm64, run the same scripts over SSH, reboot into Aura Shell (lightdm auto-login → cage + web engine).
4. Wire xdg-desktop-portal callbacks so the live access ribbon reflects *any* process's sensor use, not just shell-launched apps (the shell already renders this ribbon; this makes it authoritative).
5. Package Syncthing behind a proper GUI instead of its default web UI.
6. Independent security review before trusting this with real personal data — an unaudited privacy OS is a liability, not a feature.
7. **Phase II — Native Intelligence Layer.** A native AI Engine offered as a system service (like the agent), with a unified inference API, an independent AI-permission class, user-owned encrypted memory in the Vault, and full explainability. Local-first, cloud-optional, off by default. Governed by **`AI-MANIFEST.md`** — read it before designing any AI surface.

## 6. Open questions worth deciding before going further

- Sync: LAN-only, or also a self-hostable relay for when devices aren't on the same network?
- App ecosystem: Flatpak/Flathub subset only, or also a sandboxed Android app compatibility layer (usability vs. attack-surface tradeoff)?
- Display: monitor + mouse for now, or is a touchscreen HAT for the Pi 5 already in your plan (changes the calibration/input work in Tier 3)?
