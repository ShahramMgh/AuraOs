# Phase 8 — Developer Platform

The public surface is `/api/*` + portals (4.15.1). Everything here documents,
stabilizes, and automates that surface.

## 8.1 APIs & SDK [P2]
- [ ] **8.1.1 API contract doc** — generate `API.md` from the agent/engine
      routes (1.1.2): method, params, auth, errors, stability tag
      (stable/experimental) for every endpoint.
      > **Prompt:** From the endpoint inventory (1.1.2), generate `API.md`:
      > method, path, params, auth, error shapes, and a stability tag
      > (stable/experimental) per route. Keep it generated from code so it can't
      > drift; add a CI check (8.4) that fails on undocumented routes.
- [ ] **8.1.2 Versioning** — `/api/v1/*` prefix + a `/api/version` endpoint
      before any third party builds on it; breaking changes bump the version.
      > **Prompt:** Introduce a `/api/v1/*` prefix and a `/api/version` endpoint.
      > Establish the rule that breaking changes bump the version and old
      > versions deprecate on a schedule. Update `shell/js/api.js` to the
      > versioned paths.
- [ ] **8.1.3 Native-app SDK** — turn the Clock/Notes pattern into a documented
      format (4.15.2): manifest, JS module, capability entry, permission
      declarations; ship one sample app.
      > **Prompt:** Document the native-app SDK from the plugin format (4.15.2):
      > manifest schema, JS module contract, how to declare capabilities and
      > permissions. Ship one runnable sample app in the repo and a
      > "build your first app" walkthrough (8.2.1).

## 8.2 Documentation [P2]
- [ ] **8.2.1 Developer getting-started** — from clone to running shell in
      5 minutes (`try-shell.sh` path), then to a first native app; keep the
      existing doc set as the architecture layer above it.
      > **Prompt:** Write `DEVELOPING.md`: clone → running shell in 5 minutes via
      > `try-shell.sh`, then create a first native app with the SDK (8.1.3).
      > Verify the steps literally work on a clean checkout; link up to the
      > architecture docs.

## 8.3 Distribution [P2]
- [ ] **8.3.1 Package manager policy** — the curated Flathub subset (4.6.2):
      written inclusion criteria (sandbox-clean, no telemetry, reproducible
      where possible).
      > **Prompt:** Write the curation policy for the Flathub subset (4.6.2):
      > objective inclusion criteria (sandbox-clean, no telemetry, reproducible
      > where possible) and the review checklist a new app must pass. Publish as
      > `CURATION.md`.
- [ ] **8.3.2 Application store** — the Store screen (4.6.3) plus the submission
      path for native shell apps.
      > **Prompt:** Define the app submission path (both curated Flatpaks and
      > native shell apps): where metadata lives, how it's reviewed against
      > `CURATION.md`, and how the Store screen (4.6.3) consumes it offline.
      > Prototype with two example listings.

## 8.4 CI/CD [P1]
- [ ] **8.4.1 Tier 1 in CI** — GitHub Actions: shellcheck all `*.sh`, run the
      container build step, lint JS, `python -m py_compile` the agent/engine on
      every push.
      > **Prompt:** Add a GitHub Actions workflow that on every push runs
      > `shellcheck` on all `*.sh`, `python -m py_compile` (and a linter) on the
      > agent/engine, a JS lint, and the Tier 1 container build step. Make it
      > required for merge. Verify it catches a deliberately broken script.
- [ ] **8.4.2 Shell flow tests in CI** — automate the headless-Firefox
      sim-mode run that was done by hand (`TESTING-AND-DEPLOYMENT.md` proven
      table): every screen, every flow, zero uncaught errors, screenshots as
      artifacts.
      > **Prompt:** Automate the sim-mode flow test with headless Playwright/
      > Firefox: visit every screen, exercise the permission flow, assert zero
      > uncaught console errors, and upload screenshots as artifacts. This
      > replaces the manual run behind the proven table (1.3.1).
- [ ] **8.4.3 Image build in CI** — nightly `build.sh` (arm64 cross/qemu) so
      pipeline rot is caught within a day, not at flash time.
      > **Prompt:** Add a nightly workflow that runs `build.sh` for arm64 under
      > qemu-user/cross and fails on any error, so build-pipeline rot is caught
      > within a day. Cache what's safe; publish the image as an artifact.

## 8.5 Testing framework [P2]
- [ ] **8.5.1 Agent/engine unit tests** — pytest against the HTTP surface with
      faked `/sys`/`nmcli`; the AI conformance checklist becomes an executable
      test suite.
      > **Prompt:** Build a pytest suite that drives the agent/engine HTTP
      > surface with faked `/sys`, `nmcli`, and `ps`. Encode the 11-box
      > `AI-MANIFEST.md` conformance checklist as executable tests (from 1.2.3)
      > so a regression that weakens a guarantee fails CI.

## 8.6 Emulator [P2]
- [ ] **8.6.1 QEMU arm64 boot test** — boot the built image headless in QEMU,
      assert agent comes up and serves the shell — Tier 2.5 between VM and Pi.
      > **Prompt:** Boot the built arm64 image headless in QEMU, wait for the
      > agent, and assert it serves the shell (HTTP 200 + expected markup). Wire
      > this as a "Tier 2.5" CI gate between the desktop VM and real hardware.

## 8.7 Tooling [P3]
- [ ] **8.7.1 Debugging** — document the WPE remote-inspector recipe for
      debugging the shell on-device, plus `journalctl -u aura-*`.
      > **Prompt:** Document the on-device debugging recipe: enabling the WPE/
      > WebKit remote inspector to debug the shell over the network, plus reading
      > `journalctl -u aura-*` for agent/engine logs. Verify the inspector
      > recipe actually connects.
- [ ] **8.7.2 Profiling** — a `make profile` target capturing CPU/mem of the
      whole stack (feeds 7.1).
      > **Prompt:** Add a `make profile` target that captures CPU/mem of the full
      > stack (cage/cog/agent/engine/ollama) over a scripted session and emits a
      > report feeding 7.1.1. Verify it runs on both the dev box and the Pi.
- [ ] **8.7.3 IDE integration** — the devcontainer already exists
      (`devcontainer.json`); add tasks for try-shell, tests, and image build.
      > **Prompt:** Extend `devcontainer.json` / add VS Code tasks for the common
      > loops: run try-shell, run the pytest + flow tests, and kick the image
      > build. Verify each task works from a fresh "Reopen in Container".
