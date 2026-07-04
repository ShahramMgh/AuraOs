<div align="center">

<img width="476" height="904" alt="image" src="https://github.com/user-attachments/assets/35fb033d-d0f4-44cf-8a6e-88a5b8307466" />

# AuraOS

**A privacy-first mobile Linux OS for the Raspberry Pi 5 — with its own
independent shell and a native, on-device intelligence layer.**

Privacy · Capability · Transparency · User Sovereignty — four equal pillars,
none sacrificed for another.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
&nbsp;·&nbsp; Off / local by default &nbsp;·&nbsp; No account &nbsp;·&nbsp; No telemetry

</div>

---

## What this is

AuraOS is a real, bootable operating system — not a mockup. It builds a
minimal, LUKS-encrypted Ubuntu 24.04 (arm64) image whose entire session *is* the
**Aura Shell**: a custom mobile UI with no desktop, no window chrome, and no
cloud account behind it. Every sensor, every network connection, and (in Phase
II) every AI action is visible, permissioned, and revocable by the person
holding the device.

The line we hold, concretely:

- **Off / local by default.** No account, no telemetry, no cloud dependency.
  Nothing sensitive leaves the device without a per-use, plain-language consent.
- **The OS is the final authority.** Apps — and, in Phase II, models — reach the
  system only through the `aura-agent`; they never self-grant or bypass
  permissions, sandboxing, or encryption.
- **Visible when active.** Any access to a sensor or context source lights an
  on-screen indicator. No invisible access.
- **Reversible and inspectable.** Permissions, network, memory, and automation
  are all user-viewable and revocable.

## What works today (v1.0)

- **The Aura Shell** — a complete mobile UI: lock screen, home with a live
  clock and app grid, app drawer, pull-down Control Center, and a persistent
  **insight margin** — a left-edge rail showing exactly what has your mic / camera / location /
  network *right now*, with one-tap cut-off.
- **Privacy surfaces** — per-app **Permissions** (Allow / Ask / Deny), a
  **Network** log of every connection an app makes (blockable), **sensor guards**
  that kill mic/camera/location for every app at once, and an encrypted **Vault**
  status view.
- **Settings + real Linux integration**, backed by the agent reading the real
  system: **About** (`/proc`, `os.uname`, `/etc/os-release`), a live **System
  Monitor** (CPU, memory, top processes), **Storage** (`df`), **Wi-Fi** (`nmcli`,
  no forced rescans), **Display/Sound**, **Date & time** (`timedatectl`),
  **Power**, a **Files** manager, and a genuine **Terminal** (real `bash` via the
  agent — `cd` persists, exit codes are real).
- **Native intelligence layer (Phase II v0)** — an on-device **AI Engine** at
  `/api/ai/*`, **off by default**, with a kill switch, default-deny context
  permissions, trust levels, user-owned memory, and an explainable activity log.
  Ships a light default model (`llama3.2:1b`, ~1.3 GB, runs on a Pi 5) via
  Ollama, bound to loopback only. Nothing leaves the device.
- **Native Android layer (Phase III)** — run Android apps natively via
  **Waydroid**, exposed at `/api/android/*` and managed from **Settings › Apps ›
  Android**. Built to stay light: the heavy Android session is **on-demand** and
  **idle-stopped**, frozen when hidden, memory-capped in its own cgroup with zram
  headroom, and GApps-free. Install apps by APK path or URL — no resident store.
  See [ANDROID.md](ANDROID.md). *(App runtime needs `binder_linux` + a Pi 5 to
  fully verify; the control plane is verified on Ubuntu 24.04 arm64.)*

## Architecture in one picture

```
        ┌─────────────────── Raspberry Pi 5 / VM ───────────────────┐
        │                                                            │
  lightdm ─auto-login→ cage (Wayland kiosk compositor)               │
                          └─► web engine (WPE cog / WebKitGTK)        │
                                └─► http://127.0.0.1:8787/  — the shell
                                          ▲                          │
                          aura-agent (Python, stdlib) ──────────┘
                          serves shell/ + the real device API and owns
                          the permission store, network log, AI Engine
```

The shell is web tech (HTML/CSS/JS) served by one small **stdlib-only** Python
service bound to `127.0.0.1`. If the agent isn't reachable (you just opened the
shell in a browser), it falls back to a faithful **simulation** so every screen
and flow is fully explorable — watch the `SIM` / `LIVE` badge, top-right.

## Try it

**In a browser (any machine — quickest, for design review):**

```bash
./try-shell.sh              # starts the agent, opens the shell in your browser
```

**As the real kiosk session (Ubuntu desktop or VM — closest to the device):**

```bash
# Ubuntu 22.04:  the original WPE stack is available
sudo apt install cage cog
# Ubuntu 24.04+: WPE/cog was dropped from the archive — use WebKitGTK
sudo apt install cage epiphany-browser
./try-shell.sh --kiosk      # launches the full cage kiosk session
```

The launcher prefers a chromeless engine (`cog`, or `chromium` if installed) and
falls back to WebKitGTK (`epiphany`) on 24.04+. Linux only — `--kiosk` can't run
on macOS/Windows.

**On a Raspberry Pi 5:** it's already the default session — the build pipeline
installs it and lightdm auto-logs into it.

Unlock PIN in simulation / first boot: any 4 digits.

**Build the bootable image** (Ubuntu 24.04 arm64 host or container):

```bash
sudo ./build.sh             # produces the LUKS-encrypted arm64 image in out/
```

See [`TESTING-AND-DEPLOYMENT.md`](TESTING-AND-DEPLOYMENT.md) for the three test
tiers (container → VM → Pi 5).

## Read next

- **[AI-MANIFEST.md](AI-MANIFEST.md)** — the guiding philosophy for all AI work.
  When an AI decision is unclear, the option that upholds its principles wins.
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — the stack, the threat model, and why
  each component was chosen.
- **[SHELL.md](SHELL.md)** — the Aura Shell: how it boots and how to run it.
- **[ANDROID.md](ANDROID.md)** — the Native Android layer (Waydroid) and how it
  runs Android apps without weighing the device down.
- **[CLAUDE.md](CLAUDE.md)** — a short map of the repo layout.

## Repository layout

```
shell/                 the UI (index.html, auraos.css, js/{icons,api,shell}.js)
agent/
  aura-agent.py   the localhost system bridge (stdlib only)
  ai_engine.py         the AI Engine (Phase II v0), exposed at /api/ai/*
  waydroid_bridge.py   the Android layer (Phase III), exposed at /api/android/*
*.sh + build.sh        the Ubuntu 24.04 arm64 image build pipeline
try-shell.sh           run the shell on this machine (browser or --kiosk)
```

## Status

**Phase I (v1.0): done** — bootable OS, independent shell, full privacy model,
Settings + Linux integration. **Phase II (v0): in progress** — the native
intelligence layer's foundation is built and enforces every non-negotiable in
the manifest; making the assistant *act* under consent is next.

Known rough edges are tracked honestly at the bottom of
[`SHELL.md`](SHELL.md).

## License & the name

AuraOS is licensed under the **[GNU AGPL-3.0](LICENSE)**. The AGPL is a
deliberate choice: it guarantees that this OS — and every fork or hosted service
built from it — **stays open forever**. If you modify it and run it for others,
you must publish your source. That is transparency made permanent.

Two more things travel with the code:

- **[NOTICE](NOTICE)** — you must credit the original project and its manifest,
  and state what you changed.
- **[TRADEMARK.md](TRADEMARK.md)** — the *code* is free, but the *name*
  "AuraOS" is reserved: a fork may carry the name only if it stays
  faithful to the manifest's four pillars. Fork freely; if you change what the
  OS stands for, give it your own name.

---

<div align="center">
<sub>AuraOS — the device works for you, and only you.</sub>
</div>
