# Phase 4 — Architecture Review

Every subsystem: current state → target → how, in one–two lines each. Items are
pulled by the roadmap (P3), not executed top-to-bottom.

## 4.1 Boot & init [P1]
- [ ] **4.1.1 Boot sequence** — document and time the real chain (Pi firmware →
      u-boot/kernel → systemd → lightdm → cage → cog → shell) at M2; publish it
      in `ARCHITECTURE.md`.
      > **Prompt:** On the Pi 5 at M2, capture the real boot chain with
      > `systemd-analyze` + `systemd-analyze critical-chain` and a shell-ready
      > timestamp. Publish an annotated sequence in `ARCHITECTURE.md` and note
      > the slowest units (feeds 7.2.1).
- [ ] **4.1.2 Kernel integration** — stay on Canonical's Pi 5 kernel; track the
      config deltas we need (LUKS, fscrypt, AppArmor LSM) in one fragment file.
      > **Prompt:** Verify Canonical's Pi 5 kernel enables LUKS, fscrypt, and the
      > AppArmor LSM (`zcat /proc/config.gz` or `/boot/config-*`). Record any
      > missing option and the smallest config fragment/initramfs change to get
      > it; do not fork the kernel.
- [ ] **4.1.3 Init system** — keep systemd (Ubuntu base); express agent, AI
      engine, and Ollama as hardened units in `70-aura-shell.sh` /
      `80-ai-engine.sh` with `ProtectSystem`, `NoNewPrivileges`.
      > **Prompt:** Review the systemd units these scripts install. Add
      > hardening directives (`ProtectSystem=strict`, `NoNewPrivileges`,
      > `PrivateTmp`, `RestrictAddressFamilies`) where they don't break
      > function; verify with `systemd-analyze security aura-agent`.

## 4.2 Processes & services [P1]
- [ ] **4.2.1 Service management** — one `aura-*.service` naming scheme,
      restart policies, and a `systemctl status` panel in Settings › System.
      > **Prompt:** Standardize unit names to `aura-*.service`, set sane
      > `Restart=` policies, and add a Settings › System panel that shows each
      > service's live status via the agent (`systemctl --json`). Verify a
      > killed service both restarts and shows correctly.
- [ ] **4.2.2 Process supervision for apps** — agent tracks child apps (pid,
      cgroup), so "cut off" and close actually terminate the whole tree.
      > **Prompt:** Make the agent launch each app in its own cgroup/scope and
      > track it, so "Cut off" and "close" kill the entire process tree. Verify
      > with a multi-process app that no orphan survives.

## 4.3 IPC & app runtime [P1]
- [ ] **4.3.1 IPC decision** — keep localhost HTTP as the shell↔agent bus, but
      authenticated (6.6.1); use D-Bus only where the desktop stack requires it
      (portals, logind); write the rule down.
      > **Prompt:** Write the IPC policy: localhost HTTP (authenticated) for
      > shell↔agent, D-Bus only where the desktop stack demands it (portals,
      > logind, PipeWire). Document it in `ARCHITECTURE.md` and audit the code
      > for any ad-hoc IPC that violates it.
- [ ] **4.3.2 Application runtime contract** — define app states
      (launch/foreground/background/cut-off/closed) and who enforces each; the
      agent is the arbiter (2.1.1).
      > **Prompt:** Specify the app lifecycle state machine
      > (launch→foreground→background→cut-off→closed), the events that trigger
      > transitions, and the agent APIs that drive them. This contract is
      > consumed by 4.2.2, 5.4.1, and 7.7.1 — output to
      > `blueprint/out/4.3.2-runtime-contract.md`.

## 4.4 Graphics & windowing [P1]
- [ ] **4.4.1 Display server/compositor** — cage (wlroots) stays for v1; record
      its limits (one surface) as the driver for 4.4.2.
      > **Prompt:** Document cage's exact capabilities and limits from its docs
      > and our usage (single fullscreen surface, no switching). Confirm this is
      > why multitasking is blocked (1.8.2) and frame the requirement for 4.4.2.
- [ ] **4.4.2 Shell window management** — replace cage with a small wlroots
      compositor (or cage fork) the shell controls: web shell as persistent
      layer, external app surfaces stacked, launched *inside* the session so
      Wayland/D-Bus are shared (fixes 1.6.1).
      > **Prompt:** Evaluate options for shell-controlled windowing (patch cage,
      > adopt a minimal wlroots compositor like a `labwc`/`sway` derivative, or
      > wlr-layer-shell with the shell as a layer). Recommend one with
      > trade-offs, then prototype: web shell as a persistent layer + one
      > external app surface switchable, launched in-session (fixes 1.6.1).
- [ ] **4.4.3 Wayland integration** — external apps get Wayland sockets only
      via the compositor; no X11 except an isolated Xwayland if unavoidable.
      > **Prompt:** Ensure external apps receive a Wayland socket only through
      > the compositor (4.4.2), sandbox-scoped. If any app needs X11, isolate it
      > behind a dedicated Xwayland; document which apps required it and why.

## 4.5 Permissions, sandboxing, portals [P1]
- [ ] **4.5.1 Permission model** — keep the agent's store as the single source
      of truth; document schema + revocation semantics.
      > **Prompt:** Extract the permission store's on-disk schema and revocation
      > semantics from `agent/aura-agent.py`. Document it as the single
      > source of truth (states: Allow/Ask/Deny, scope, timestamp) and flag any
      > place the shell caches a decision that could drift.
- [ ] **4.5.2 Sandboxing** — every external app launch goes through
      bubblewrap/Flatpak with holes punched *only* per the permission store
      (today launch is un-sandboxed — 2.1.3).
      > **Prompt:** Implement the sandbox wrapper: translate permission-store
      > grants into bubblewrap/Flatpak `--share`/portal holes, deny-by-default
      > otherwise. Verify an app with no camera grant cannot open `/dev/video*`.
- [ ] **4.5.3 xdg-desktop-portal integration** — run the portal in-session,
      agent subscribes to its access events, ribbon + Aura become authoritative
      for *all* processes (roadmap item 4, `ARCHITECTURE.md`).
      > **Prompt:** Run xdg-desktop-portal in the session, back its permission
      > prompts with our store, and have the agent subscribe to its access
      > signals so the ribbon/Aura reflect any process (1.4.3). Verify with a
      > stock Flatpak app that requests the camera.
- [ ] **4.5.4 AppArmor** — enforce profiles for agent, engine, and launched
      apps; verify with `aa-status` at Tier 2 (SELinux rejected: Ubuntu base is
      AppArmor-native).
      > **Prompt:** Write and load AppArmor profiles for `aura-agent.py`,
      > `ai_engine.py`, and cog, constraining them to only the paths/capabilities
      > they need. Verify `aa-status` shows them enforcing and that normal
      > operation still works.

## 4.6 Filesystem, packages, distribution [P2]
- [ ] **4.6.1 Filesystem layout** — document the split: OS (LUKS2 root), Vault
      (fscrypt), app data (per-app subdirs), state dir (agent stores, notes).
      > **Prompt:** Document the on-device filesystem layout: LUKS2 root, fscrypt
      > Vault, per-app data dirs, and the agent state dir (where notes/perms/
      > network log live). Verify against what the build scripts actually create.
- [ ] **4.6.2 Package management** — curated Flathub subset as planned
      (`ARCHITECTURE.md` table); per-app manifest declaring capabilities (2.2.2).
      > **Prompt:** Define the curated Flathub subset policy and the per-app
      > capability manifest format (2.2.2). Show how install-time the manifest
      > seeds the permission store. Output to `blueprint/out/4.6.2-packaging.md`.
- [ ] **4.6.3 Software distribution** — a Store screen in the shell listing the
      curated set with plain-language permission summaries before install.
      > **Prompt:** Design a Store screen that lists the curated set and shows a
      > plain-language permission summary before install (what it will be able
      > to reach). Wire install/uninstall through the agent; keep it offline-
      > capable against a local mirror.

## 4.7 Hardware layer [P2]
- [ ] **4.7.1 HAL boundary** — all hardware reads/writes live in the agent
      (already true for battery/backlight/radios); inventory what Pi 5 exposes
      and keep the HAL a single Python module.
      > **Prompt:** Inventory every hardware read/write the agent does and
      > confirm they're the only hardware access in the codebase. Propose
      > extracting them into one HAL module so a second board (9.6.1) only
      > swaps that file.
- [ ] **4.7.2 Device drivers** — depend on Ubuntu's Pi 5 enablement; keep a
      known-good/known-broken device matrix from M2 onward.
      > **Prompt:** Starting at M2, maintain a device matrix (Wi-Fi, BT, display,
      > touch, audio, camera, GPIO) with working/broken/untested status on the
      > Pi 5 under our image. Keep it in `TESTING-AND-DEPLOYMENT.md`.

## 4.8 System services [P2]
- [ ] **4.8.1 Notifications** — agent event channel (SSE) + a shell notification
      shade; apps notify via portal, AI via the engine — same pipe, same log.
      > **Prompt:** Implement the notification service: an agent SSE stream
      > (1.6.2) that carries app (portal `org.freedesktop.Notifications`) and AI
      > (engine) notifications through one pipe, each logged. Render in the shell
      > shade (5.7.1). Verify ordering and source attribution.
- [ ] **4.8.2 Settings framework** — Settings pages are data-driven off agent
      endpoints (pattern already in `SHELL.md` Settings); add new pages by
      registering, not hand-wiring.
      > **Prompt:** Refactor the Settings app so a page is declared as data
      > (title, fields, agent endpoint) rather than bespoke code. Migrate one
      > existing page as the reference and document how to add a new one.
- [ ] **4.8.3 Account management** — none, by design: only the self-generated
      device keypair for sync (`ARCHITECTURE.md` §3.1); document that this is a
      feature.
      > **Prompt:** Document the "no account" stance and the self-generated
      > device keypair used for sync. Confirm from code that no login/account
      > exists anywhere, and write this up as an intentional feature, not a gap.

## 4.9 Updates, recovery, backup [P1]
- [ ] **4.9.1 Update system** — A/B image slots (or ostree) with signature
      check and auto-rollback on failed boot; apt only inside the image build.
      > **Prompt:** Design the runtime update system: compare A/B image slots vs.
      > ostree for our Ubuntu+custom-session case, choose one, and specify
      > signature verification + auto-rollback on failed boot. No live `apt` on
      > device. Output to `blueprint/out/4.9.1-updates.md`; implementation is
      > 3.6.1.
- [ ] **4.9.2 Recovery system** — a minimal recovery boot target that can
      reflash a slot and reset the permission store without touching the Vault.
      > **Prompt:** Specify a minimal recovery boot target that can reflash a
      > slot and reset the permission store while leaving the fscrypt Vault
      > intact and locked. Define how the user enters it.
- [ ] **4.9.3 Backup/restore** — Syncthing-based encrypted device-to-device
      backup of Vault + prefs; restore flow tested on a wiped device.
      > **Prompt:** Design Syncthing-based encrypted device-to-device backup of
      > the Vault + prefs (no third-party server). Specify the restore flow and
      > test it on a wiped device: same data, same permissions, nothing leaked.

## 4.10 Radios & connectivity [P2]
- [ ] **4.10.1 Wi-Fi / networking** — keep nmcli via agent; add per-app firewall
      rules (ufw/nftables) so the Network screen's "block" is enforced, not
      just logged.
      > **Prompt:** Make the Network screen's per-app "block" actually enforce
      > via nftables/ufw rules keyed to the app's cgroup/uid, not just log. Keep
      > nmcli for connection management. Verify a blocked app cannot reach the
      > network while others can.
- [ ] **4.10.2 Bluetooth** — move from rfkill toggles to BlueZ pairing/device
      management in Settings.
      > **Prompt:** Extend beyond rfkill on/off to real BlueZ device management
      > (scan, pair, connect, forget) surfaced in Settings via the agent. Verify
      > pairing a real device and that the radio state round-trips.
- [ ] **4.10.3 Telephony** — out of scope for Pi 5 (no modem); define the
      ModemManager/oFono integration point now so a future device slots in.
      > **Prompt:** Document that telephony is out of scope on the Pi 5 (no
      > modem) but define the ModemManager integration seam (where calls/SMS/
      > data would attach) so a future modem-equipped device slots in cleanly.

## 4.11 Audio [P2]
- [ ] **4.11.1 PipeWire adoption** — route all audio through PipeWire; per-app
      streams give the ribbon honest mic attribution (2.3.2).
      > **Prompt:** Adopt PipeWire for all audio; ensure each app's mic/speaker
      > stream is attributable so the agent can feed honest per-app mic status
      > to the ribbon. Verify two apps' audio are independently visible and
      > controllable.

## 4.12 Camera [P2]
- [ ] **4.12.1 Camera stack** — libcamera (Pi 5 native) behind the portal; no
      app ever opens `/dev/video*` directly.
      > **Prompt:** Route camera access through libcamera behind the portal so no
      > app opens `/dev/video*` directly. Verify a sandboxed app gets frames only
      > with a grant and that the indicator lights whenever the camera is live.

## 4.13 Power [P2]
- [ ] **4.13.1 Power management** — expose governor/idle states in the agent;
      suspend semantics decided at M2 (Pi 5 suspend is weak — document honestly).
      > **Prompt:** Expose CPU governor and idle states via the agent. Test what
      > suspend actually does on the Pi 5 and document the honest behavior
      > (likely no true S3); decide screen-off/idle policy accordingly.
- [ ] **4.13.2 Battery optimization** — see 7.5/7.10; per-app background policy
      enforced by the runtime contract (4.3.2).
      > **Prompt:** Implement per-app background power policy via the runtime
      > contract (4.3.2): freeze backgrounded apps' cgroups by default with a
      > user exception list. Measure idle draw before/after (7.5.1).

## 4.14 Inclusivity [P2]
- [ ] **4.14.1 Accessibility** — see 5.9; architectural part: shell is HTML, so
      ARIA + focus order are the mechanism; audit with a screen reader at M4.
      > **Prompt:** Because the shell is HTML, audit it for ARIA roles, labels,
      > and logical focus order with a screen reader (Orca). File and fix the
      > gaps; this is the architectural half of 5.9.
- [ ] **4.14.2 Internationalization** — extract shell strings to a locale file;
      RTL layout pass; agent returns locale from system settings.
      > **Prompt:** Extract every user-facing string in `shell/js/*` to a locale
      > file with a lookup helper, add an RTL layout pass in CSS, and have the
      > agent report the system locale. Verify with one non-English + one RTL
      > locale.

## 4.15 Extensibility & compute [P3]
- [ ] **4.15.1 Developer SDK & APIs** — see P8; architectural rule: the public
      surface is `/api/*` + portals, nothing else.
      > **Prompt:** Ratify and document the rule that the only public developer
      > surface is `/api/*` + portals. Audit for any other de-facto extension
      > point that leaked out and either bless it or close it. Feeds 8.1.
- [ ] **4.15.2 Extension/plugin architecture** — shell "native apps" (Clock,
      Notes pattern) become a documented plugin format: one JS module + one
      agent capability entry.
      > **Prompt:** Generalize the Clock/Notes native-app pattern into a
      > documented plugin format (manifest + JS module + optional agent
      > capability). Convert one existing native app to the format as the
      > reference implementation; feeds 8.1.3.
- [ ] **4.15.3 Containers/virtualization** — the app sandbox *is* containers
      (bubblewrap); full VMs are out of scope on 8 GB — record the decision.
      > **Prompt:** Record the decision: app isolation uses OS containers
      > (bubblewrap/namespaces); full hardware virtualization is out of scope on
      > 8 GB. Note the one exception path (if any) and why.
- [ ] **4.15.4 Cloud synchronization** — Syncthing device-to-device only;
      decide LAN-only vs. self-hosted relay (open question, `ARCHITECTURE.md`
      §6).
      > **Prompt:** Resolve the open question in `ARCHITECTURE.md` §6: Syncthing
      > LAN-only vs. also a self-hostable relay. Recommend one with the privacy/
      > usability trade-off and note what the relay must never see.
- [ ] **4.15.5 AI integration** — architecture is fixed by `AI-MANIFEST.md`:
      everything through the AI Engine, never app→model; review each new AI
      surface against the conformance checklist.
      > **Prompt:** For any new AI surface, confirm architecturally that it goes
      > through the AI Engine (never app→model) and passes the 11-box conformance
      > checklist before merge. Treat a failing box as a blocker.
