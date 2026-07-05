# Phase 3 — Roadmap

Milestones in dependency order; each ships only when its success criteria pass.
(deps: P2 ranked gap list)

## 3.1 M1 — Truth on a screen (Tier 2) [P1]
- [ ] **3.1.1 Kiosk verification** — run `./try-shell.sh --kiosk` in an Ubuntu
      24.04 VM; shell renders in real cage+cog, `LIVE` badge, AppArmor
      `aa-status` enforcing. *Success: Tier 2 table rows flip to verified.*
      > **Prompt:** In an Ubuntu 24.04 VM, `sudo apt install cage cog` then run
      > `./try-shell.sh --kiosk`. Confirm the shell fills the screen, shows the
      > LIVE badge, reflects the VM's real battery/network, and `aa-status`
      > shows profiles enforcing. Record pass/fail per row and flip the verified
      > Tier 2 rows in `TESTING-AND-DEPLOYMENT.md`.
- [ ] **3.1.2 Fix what the VM reveals** — file and fix every rendering/input bug
      cog exposes that Firefox hid; re-run the full flow checklist.
      > **Prompt:** For every visual/input defect that appears in cog but not in
      > desktop Firefox, open a tracked issue with a repro, fix it, and re-run
      > every screen and flow. Note WPE-WebKit vs. Firefox CSS/JS differences you
      > had to work around.

## 3.2 M2 — Truth on the hardware (Tier 3) [P1] (deps: 3.1)
- [ ] **3.2.1 Pi 5 first boot** — flash Ubuntu Server arm64, run the script
      sequence from `TESTING-AND-DEPLOYMENT.md`, boot into Aura Shell.
      *Success: hardware rows of the proven/unproven table flip.*
      > **Prompt:** Follow Tier 3 in `TESTING-AND-DEPLOYMENT.md`: flash Ubuntu
      > Server arm64 to a Pi 5, run `10/20/30/40/70-*.sh` in order over SSH,
      > reboot. Confirm lightdm auto-login lands on Aura Shell on the
      > attached display. Log every step that needed a fix and update the doc.
- [ ] **3.2.2 Hardware punch list** — verify `eglinfo` shows V3D (not llvmpipe),
      touch input, power stability; record results in the testing doc.
      > **Prompt:** On the Pi 5, run `eglinfo` and confirm the V3D hardware
      > driver (not `llvmpipe`); test touch/mouse input across the shell; watch
      > `vcgencmd get_throttled` under load for undervoltage. Fill the Tier 3
      > punch-list rows with real results.
- [ ] **3.2.3 Image build end-to-end** — `build.sh` → flashable image in `out/`
      that boots without manual steps. *Success: clean-machine flash boots.*
      > **Prompt:** Run `build.sh` to produce a flashable image in `out/`. Flash
      > it to a fresh SD card and boot a Pi 5 with zero manual post-steps.
      > Document any manual intervention still required and drive it to zero.

## 3.3 M3 — Airtight privacy core [P1] (deps: 3.1)
- [x] **3.3.1 Agent authentication** — session token for every `/api/*` call
      (6.6.1); *success: unauthenticated request is refused, shell still works.*
      > **Prompt:** Implement per-boot session-token auth on every `/api/*` route
      > (design in 6.6.1). Verify an unauthenticated `curl` is rejected while the
      > shell, given the token at load, works unchanged. Add a regression test.
      >
      > **DONE (this session).** Per-boot token minted at start
      > (`agent/aura-agent.py:SESSION_TOKEN`, 0600 `agent.token`), required on
      > every `/api/*` via `_guard_api`/`_authed` (header `X-Aura-Token` or
      > `?t=`), injected into the served shell HTML in `_serve_static`; the shell
      > attaches it (`shell/js/api.js` `authHeaders()`). Verified: unauthenticated
      > `/api/exec`, `/api/status`, `/api/files/read` → 401; wrong token → 401;
      > shell runs LIVE with the injected token; `tests/test_auth.py` (10 checks)
      > passes. **Honest limit:** a same-session-user process can still read the
      > token file or scrape the served HTML — that's inside the trust boundary
      > until per-app sandboxing (3.4.1 / 6.3.1). Not yet run on hardware.
- [ ] **3.3.2 Portal-authoritative ribbon** — access ribbon reflects *any*
      process's mic/cam/location via xdg-desktop-portal (4.5.3); *success: a
      non-shell app lights the indicator.*
      > **Prompt:** Wire the agent to xdg-desktop-portal access events (4.5.3) so
      > the ribbon/Aura reflect any process's sensor use. Verify by launching a
      > non-shell app that grabs the mic and confirming the indicator lights and
      > "Cut off" works.
- [ ] **3.3.3 Real unlock** — PIN via PAM, not the placeholder (5.3.1).
      > **Prompt:** Replace the placeholder unlock (1.4.2) with real PAM
      > authentication per 5.3.1. Verify a wrong PIN fails, a right one unlocks,
      > attempts are rate-limited, and no PIN is written to any log.

## 3.4 M4 — A real app platform [P2] (deps: 3.2, 3.3)
- [ ] **3.4.1 Sandboxed launches** — external apps run under bubblewrap/Flatpak
      with the permission store enforced, sharing the session Wayland/D-Bus
      (4.4.2, 6.3.1). *Success: a Flathub app runs, sandboxed, on the Pi.*
      > **Prompt:** Make the agent launch external apps inside a bubblewrap/
      > Flatpak sandbox whose holes come from the permission store (6.3.1), with
      > session Wayland/D-Bus shared (4.4.2). Verify a Flathub app runs sandboxed
      > on the Pi and is denied a sensor it wasn't granted.
- [ ] **3.4.2 Shell window management** — switch between the web shell and
      external app surfaces (5.4.1). *Success: launch, switch away, return.*
      > **Prompt:** Give the shell control over app surfaces (4.4.2): launch an
      > external app, switch back to the shell, and return to the app. Verify the
      > web shell persists as a layer and the app is a stackable surface.
- [ ] **3.4.3 Notifications + events** — agent event channel and a notification
      surface in the shell (1.6.2, 4.8).
      > **Prompt:** Build the SSE event channel (1.6.2) and a notification shade
      > (5.7.1). Verify an agent-emitted event (e.g. app finished, battery low)
      > appears in the shade with its source and is dismissible.

## 3.5 M5 — The resident grows up (Phase II complete) [P2] (deps: 3.3)
- [ ] **3.5.1 Experiential memory** — encrypted, in-Vault, with the Memory
      screen to search/edit/delete (`AI-MANIFEST.md` P11).
      > **Prompt:** Implement AI memory stored encrypted in the Vault, with a
      > Memory screen to search/edit/delete every entry (P11). Verify entries
      > survive reboot, are unreadable from a pulled SD card, and deletion is
      > real. Pass the conformance box "memory encrypted/local/deletable".
- [x] **3.5.2 Learning loop + suggestions** — AI Engine proposes
      `home.config.json` changes from routine; user choice always wins.
      > **Prompt:** Let the AI Engine propose a `home.config.json` layout from
      > observed routine + time of day (P13). Verify proposals are suggestions
      > the user can accept/reject, that the user's own choice always overrides,
      > and every proposal is explainable (P8) and logged.
      >
      > **DONE (this session).** `ai_engine.home_proposal(ctx)` mines `open_app`
      > routines for the current day-part, promotes the most-used app to focus,
      > orders the rest, and diffs against the layout the shell passes in — so it
      > only speaks when it would change something (P2). It is a *proposal*:
      > accepting writes the user's OWN layout store (`PREF.homePages`/`focus`,
      > the same one a drag writes), so a later drag always overrides it
      > (P10/P13); the served `home.config.json` is never rewritten. Surfaced as a
      > dismissible home card (`shell.js:maybeHomeProposal`) with a plain-language
      > "why" per app (P8); accept/reject are logged and reject snoozes for the
      > day. Endpoints `GET /api/ai/home/proposal` + `POST /api/ai/home/feedback`.
      > Verified: `tests/smoke.py` proves a mined routine reshapes the layout,
      > the reasons carry stats, an unknown app is carried through, reject snoozes,
      > it's silent while AI is off, and the on-disk config is byte-for-byte
      > unchanged after propose+accept+reject. **Honest limit:** verified in sim +
      > a local live run, not yet on hardware.
- [ ] **3.5.3 Context sources + cloud opt-in path** — per-source authorization
      wired for real; one cloud provider behind the ask-once consent UX.
      *Success for M5: every conformance-checklist box checks yes, live.*
      > **Prompt:** Wire at least one real context source (e.g. calendar/files)
      > behind independent authorization (P12) and one cloud provider behind the
      > ask-once consent UX (P4). Then run the full 11-box `AI-MANIFEST.md`
      > checklist live; M5 ships only when every box is yes.

## 3.6 M6 — Trustworthy release [P2] (deps: 3.4, 3.5)
- [ ] **3.6.1 Secure update channel** — signed image/OTA updates with rollback
      (4.9.1, 6.14). **3.6.2 Independent security review** — external audit
      (roadmap item 6, `ARCHITECTURE.md`) and fixes. *Success: audit findings
      triaged to zero criticals; v2.0 tagged.*
      > **Prompt:** Stand up the signed OTA channel with auto-rollback (4.9.1 /
      > 6.7.1) and verify a bad update rolls back. Then commission the
      > independent security review (6.8.1), triage findings to zero criticals,
      > and tag v2.0 only when both are done.

## 3.7 Risks & mitigations [P1]
- [ ] **3.7.1 WPE/cog can't carry the shell on Pi 5** — mitigation: Chromium
      kiosk fallback exists in `try-shell.sh`; benchmark both at M2.
      > **Prompt:** At M2, benchmark the shell under cog(WPE) vs. the Chromium
      > kiosk fallback on the Pi 5 (fps, RSS, jank). Record numbers and set the
      > default renderer from evidence; document the fallback trigger.
- [ ] **3.7.2 1B model too weak for reliable tool-use** — mitigation: backends
      are swappable (P5); test a 3B model at M5 and set a minimum-model policy.
      > **Prompt:** Measure tool-call reliability of `llama3.2:1b` vs. a 3B model
      > on the Pi 5 (success rate over a fixed command set). Set a documented
      > minimum-model policy for auto-run trust level 3.
- [ ] **3.7.3 One-person bus factor** — mitigation: this blueprint + P8 CI so
      every claim is machine-checked, not memory-held.
      > **Prompt:** Ensure the critical knowledge is in-repo, not in one head:
      > confirm every "verified" claim has a CI check (8.4) or a documented
      > manual procedure, and that CONTRIBUTING (9.3.1) points a newcomer to it.
