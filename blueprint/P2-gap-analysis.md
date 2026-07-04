# Phase 2 — Gap Analysis

Deliverable: for each comparison, four columns — *what's missing · why it
matters · how they solve it · how we implement it here*. (deps: P1)

## 2.1 vs. Android [P1]
- [ ] **2.1.1 App lifecycle & process model** — Android has zygote/ART lifecycle
      (pause/resume/kill); we launch raw processes. Define a lifecycle contract
      in the agent (4.3.2).
      > **Prompt:** Summarize Android's activity/process lifecycle in one
      > paragraph, then contrast with how `agent/aura-agent.py` launches
      > apps today (raw process, no states). Fill the four-column row and point
      > the "how here" cell at 4.3.2. Output into `blueprint/out/2.1-android.md`.
- [ ] **2.1.2 Notifications & background limits** — Android has a notification
      service + doze; we have neither. Design ours in 4.8 / 7.10.
      > **Prompt:** Describe Android's notification service and doze/background
      > limits at architecture level. Confirm from code that Aura has no
      > notification system. Propose the minimal equivalent (agent event bus +
      > shade), linking to 4.8.1 and 7.7.1.
- [ ] **2.1.3 Enforced per-app sandbox** — Android sandboxes *every* app by UID +
      SELinux; our bubblewrap is installed but not applied at launch (6.3.1).
      > **Prompt:** Verify that bubblewrap/Flatpak are installed by the build
      > scripts but that the agent's launch path does NOT wrap external apps.
      > Write the gap and the target: every launch sandboxed, holes from the
      > permission store (hand to 4.5.2 / 6.3.1).

## 2.2 vs. iOS [P2]
- [ ] **2.2.1 Hardware root of trust** — Secure Enclave / verified boot chain;
      Pi 5 lacks the silicon. Document the honest ceiling and mitigations (6.1).
      > **Prompt:** Explain iOS's hardware root of trust briefly, then state
      > honestly what the Pi 5 cannot match. List the software mitigations we
      > *can* do (signed image, measured-boot-lite) and link to 6.1. No
      > overclaiming.
- [ ] **2.2.2 Entitlement-style declarations** — apps declare capabilities up
      front; adopt a per-app manifest the permission store reads (4.6.2).
      > **Prompt:** Sketch a per-app capability manifest (JSON) modeled on iOS
      > entitlements but read by our permission store. Show how the store in
      > `agent/aura-agent.py` would consume it at install and launch; link
      > to 4.6.2.

## 2.3 vs. Linux desktop architectures [P1]
- [ ] **2.3.1 D-Bus + xdg-desktop-portal as the mediation layer** — desktop
      Linux already solved "app asks OS"; we bypass it with a custom HTTP agent.
      Bridge, don't replace: agent becomes a portal client (4.5.3).
      > **Prompt:** Compare our custom localhost-HTTP mediation to the standard
      > D-Bus + xdg-desktop-portal model. Argue whether to bridge (agent becomes
      > a portal client) or keep parallel, with the trade-offs, and recommend
      > one. Feed the decision into 4.5.3.
- [ ] **2.3.2 PipeWire for audio/camera** — the standard mediated media stack
      with per-app visibility; adopt it for sensors instead of raw device access
      (4.11 / 4.12).
      > **Prompt:** Describe how PipeWire mediates audio/camera with per-app
      > streams (the honest-attribution win). Confirm the current stack does not
      > use it, and outline adoption steps for 4.11/4.12.

## 2.4 vs. Ubuntu Touch [P2]
- [ ] **2.4.1 Convergence & rotation** — Lomiri handles phone/desktop layouts
      and orientation; our shell is portrait-fixed web. Plan adaptive layouts
      (5.12) and desktop mode (5.13).
      > **Prompt:** Note how Ubuntu Touch/Lomiri does convergence and rotation.
      > Check whether `shell/auraos.css` handles landscape/large widths at
      > all. Recommend the CSS-first path and link to 5.12/5.13.
- [ ] **2.4.2 System update model** — UT ships image-based OTA with rollback;
      we have a build pipeline but no updater at all (4.9.1).
      > **Prompt:** Summarize Ubuntu Touch's image-based OTA + rollback. Confirm
      > Aura has a build pipeline but zero runtime updater. Recommend an
      > A/B or ostree approach and hand off to 4.9.1.

## 2.5 vs. postmarketOS [P2]
- [ ] **2.5.1 Footprint discipline** — pmOS proves tiny bases work on phones;
      audit our image size and WPE memory against their numbers (7.1).
      > **Prompt:** Cite typical postmarketOS footprint figures, then estimate
      > ours (packages in `10/30-*.sh` + WPE/cog + Ollama). Flag where we are
      > heavier and why; link the measurement task to 7.1.
- [ ] **2.5.2 Device-support process** — pmOS has per-device packages and CI;
      steal the pattern if we ever target a second board (9.6).
      > **Prompt:** Describe pmOS's per-device packaging + CI model at a high
      > level. Recommend how a future second board would slot into our build
      > scripts (per-device dir), linking to 9.6.1. Keep it horizon-tagged.

## 2.6 vs. HarmonyOS (architecture only) [P3]
- [ ] **2.6.1 Intent/ability orchestration** — system-level task routing across
      apps matches our P13 "intrinsic interface"; map their ability model onto
      the capability registry (`/api/capabilities`) + AI tool-use.
      > **Prompt:** Explain HarmonyOS's ability/intent model at architecture
      > level (no proprietary detail). Map it onto our `/api/capabilities`
      > registry + AI tool-use as the equivalent of P13 orchestration; note what
      > we'd add. Output into `blueprint/out/2.6-harmony.md`.

## 2.7 Synthesis [P1]
- [ ] **2.7.1 Ranked gap list** — merge 2.1–2.6 into one prioritized list of
      gaps, each pointing at the P4–P8 item that closes it; this list gates the
      Phase 3 roadmap ordering.
      > **Prompt:** Merge all Phase-2 findings into a single ranked table (gap ·
      > severity · which competitor exposes it · closing blueprint item ·
      > effort). Sort by severity × how-central-to-the-mission. This ranking
      > gates the M-order in P3 — save to `blueprint/out/2.7-ranked-gaps.md`.
