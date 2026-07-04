# Phase 7 — Performance

Target hardware: Raspberry Pi 5 (4–8 GB). Rule: measure on-device first (M2),
optimize second; no blind tuning.

## 7.1 Memory usage [P1]
- [ ] **7.1.1 Baseline the stack** — measure RSS of cage + cog(WPE) + agent +
      engine + Ollama(1B) idle and under chat; set a budget (e.g. shell stack
      < 1 GB so a 4 GB Pi stays usable).
      > **Prompt:** On the Pi 5, measure RSS/PSS of cage, cog, the agent, the
      > engine, and Ollama(1B) at idle and during a streaming chat (`smem`/
      > `/proc`). Publish a table and set a memory budget that keeps a 4 GB Pi
      > usable. Output to `blueprint/out/7.1.1-mem-baseline.md`.
- [ ] **7.1.2 Model memory policy** — load/unload the LLM on demand vs. resident;
      decide from the baseline, expose the choice in Settings › Intelligence.
      > **Prompt:** Using 7.1.1's numbers, decide whether the LLM stays resident
      > or loads on demand (latency vs. RAM). Implement the chosen policy with an
      > `keep_alive`/unload control and expose it in Settings › Intelligence.
      > Measure first-token latency both ways.

## 7.2 Startup [P2]
- [ ] **7.2.1 Boot-to-lockscreen time** — `systemd-analyze` + shell-ready mark;
      target and track a number (e.g. < 30 s cold) from M2 onward.
      > **Prompt:** Measure cold boot-to-lockscreen with `systemd-analyze` plus a
      > shell-ready timestamp. Set a target (e.g. < 30 s), attack the slowest
      > units (4.1.1), and track the number across releases in the testing doc.
- [ ] **7.2.2 Application startup** — measure native-app open (instant, in-shell)
      vs. external Flatpak cold start; preheat only what measurements justify.
      > **Prompt:** Measure open time for native apps (in-shell) vs. external
      > Flatpak cold starts on the Pi 5. Only add preheating/caching where the
      > numbers justify it; avoid speculative warm-keeping that costs RAM (7.1).

## 7.3 CPU & scheduling [P2]
- [ ] **7.3.1 Priorities** — compositor and cog get scheduling priority over
      inference; nice/cgroup weights so a thinking model never janks the UI.
      > **Prompt:** Give the compositor and cog scheduling priority over Ollama
      > via nice/cgroup CPU weights (systemd slices). Verify a heavy inference
      > run does not drop the shell below 60 fps or stall input.

## 7.4 GPU & rendering [P1]
- [ ] **7.4.1 Confirm hardware GL** — `eglinfo` must show V3D, not llvmpipe
      (Tier 3 checklist); if WPE falls back to software, that's a stop-ship.
      > **Prompt:** On the Pi 5 confirm `eglinfo`/`glxinfo` report the V3D
      > hardware driver, and that cog/WPE actually uses it (not `llvmpipe`). A
      > software fallback is stop-ship — if found, diagnose the missing driver/
      > env and fix before proceeding.
- [ ] **7.4.2 Rendering pipeline audit** — keep the shell at 60 fps on-device:
      the Aura canvas already pauses off-home (`SHELL.md`); verify no other
      screen animates unseen, prefer CSS transforms over layout.
      > **Prompt:** Profile the shell's rendering on-device (WebKit inspector).
      > Confirm the Aura pauses off-home and no other screen animates while
      > hidden; convert any layout-thrashing animation to transform/opacity.
      > Target a steady 60 fps on the busiest screen.

## 7.5 Battery / power draw [P2]
- [ ] **7.5.1 Idle draw measurement** — meter the Pi at idle/screen-off; kill
      periodic wakeups (shell polling → event channel, 1.6.2) as the first lever.
      > **Prompt:** Meter the Pi 5 at idle and screen-off (USB power meter).
      > Identify wakeup sources (shell polling loops, engine heartbeats) and cut
      > them by moving to the SSE event channel (1.6.2). Report draw before/after.

## 7.6 Caching & filesystem [P3]
- [ ] **7.6.1 Filesystem performance** — measure SD vs. NVMe (Pi 5 HAT); mount
      options (noatime), and zram swap sizing for the 4 GB case.
      > **Prompt:** Benchmark SD vs. NVMe-HAT on the Pi 5 (fio) for the workloads
      > we do (app launch, model load). Recommend mount options (noatime) and a
      > zram swap size for the 4 GB case. Document the storage recommendation.

## 7.7 Background execution [P2]
- [ ] **7.7.1 Background policy** — via the app runtime contract (4.3.2):
      backgrounded external apps get frozen cgroups by default, with a
      user-visible exception list — Android's lesson, our transparency.
      > **Prompt:** Implement the background policy from the runtime contract
      > (4.3.2): freeze backgrounded external apps (cgroup freezer) by default
      > with a user-visible, editable exception list. Verify a frozen app uses ~0
      > CPU and resumes correctly; measure the battery win (7.5.1).

## 7.8 Inference performance [P2]
- [ ] **7.8.1 Tokens/sec on-device** — benchmark 1B vs. 3B on the Pi 5 for chat
      and tool-calls; publish honest numbers in the docs and pick the default
      the hardware actually supports (3.7.2).
      > **Prompt:** Benchmark tokens/sec and tool-call success for `llama3.2:1b`
      > vs. a 3B model on the Pi 5. Publish honest numbers in the docs and set
      > the shipped default + the minimum model allowed for trust-level-3
      > auto-run (3.7.2).
