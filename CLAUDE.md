# AuraOS

A privacy-first mobile Linux OS for Raspberry Pi 5, with its own independent
shell and — in Phase II — a native intelligence layer.

## Read these first
- **`DEVELOPMENT.md`** — the development constitution: *how* to make a change
  (layer rules, the four-places API contract, recipes, Definition of Done). Read
  it before your first change; it governs the mechanics of every contribution.
- **`AI-MANIFEST.md`** — the guiding philosophy for all AI work (Phase II). When
  an AI-related decision is unclear, the option that upholds its principles wins.
- **`ARCHITECTURE.md`** — the stack, the threat model, and why each component
  was chosen.
- **`SHELL.md`** — the Aura Shell (UI), how it boots, and how to run it.
- **`ANDROID.md`** — the Native Android layer (Waydroid), Phase III: how Android
  apps run natively while the device stays light.
- **`MODEM.md`** — the Cellular layer (SIMCom A7670E): data · voice · SMS · GPS
  via ModemManager, exposed at `/api/phone/*`, `/api/sms`, `/api/location`.
- **`TESTING-AND-DEPLOYMENT.md`** — the three test tiers (container → VM → Pi 5).

## The line we hold
Four equal pillars, none sacrificed for another: **Privacy · Capability ·
Transparency · User Sovereignty.** Concretely, throughout the codebase:
- **Off / local by default.** No account, no telemetry, no cloud dependency.
  Nothing sensitive leaves the device without a per-use, plain-language consent.
- **The OS is the final authority.** Apps (and, in Phase II, models) reach the
  system only through the `aura-agent`; they never self-grant or bypass
  permissions, sandboxing, or encryption.
- **Visible when active.** Any access to a sensor or context source lights the
  on-screen indicator. No invisible access.
- **Reversible and inspectable.** Permissions, network, memory, and automation
  are all user-viewable and revocable.

## Layout
- `shell/` — the UI (`index.html`, `auraos.css`, `js/{icons,api,shell}.js`).
- `agent/aura-agent.py` — the localhost system bridge (stdlib only).
- `agent/ai_engine.py` — the AI Engine (Phase II v0), exposed at `/api/ai/*`.
- `agent/waydroid_bridge.py` — the Android layer (Phase III), exposed at
  `/api/android/*`; keeps the Android session on-demand and memory-capped.
- `*.sh` + `build.sh` — the Ubuntu 24.04 arm64 image build pipeline.
- `try-shell.sh` — run the shell on this machine (browser or `--kiosk`).

Before adding an AI capability, run it against the conformance checklist in
`AI-MANIFEST.md`. If any answer is "no," it is not ready.
