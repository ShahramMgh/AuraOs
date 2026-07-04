# Step 0 — Inventory & Grounding

## 0.1 Repository tree with one-line purposes
- [ ] **0.1.1 Docs** — `README.md` (front door), `ARCHITECTURE.md` (stack + threat
      model), `SHELL.md` (UI + boot), `AI-MANIFEST.md` (Phase II authority),
      `TESTING-AND-DEPLOYMENT.md` (3 test tiers), `CLAUDE.md`, `LICENSE`
      (AGPL-3.0), `NOTICE`, `TRADEMARK.md`.
      > **Prompt:** Read all nine root documents of this repo in full. Produce a
      > table (file · role · last-substantive topic) and flag any statement in
      > one doc that contradicts another. Output: `blueprint/out/0.1.1-docs.md`.
- [ ] **0.1.2 Shell (UI)** — `shell/index.html` (entry, 18 ln),
      `shell/auraos.css` (whole design system, 1136 ln),
      `shell/home.config.json` (home layout data), `shell/js/icons.js` (SVG line
      icons), `shell/js/api.js` (live-agent client + simulation fallback, 888 ln),
      `shell/js/aura.js` (canvas companion, 177 ln), `shell/js/shell.js` (views,
      router, permission flow, 2210 ln).
      > **Prompt:** For each file under `shell/`, list its exported/global
      > symbols, the views or subsystems it implements, and which other files
      > call into it. One section per file, with line references. Do not
      > refactor anything yet.
- [ ] **0.1.3 System bridge** — `agent/aura-agent.py` (localhost stdlib HTTP
      service: `/sys`, `nmcli`, permission store, network log, files, exec,
      notes, capabilities; 1134 ln).
      > **Prompt:** Read `agent/aura-agent.py` end-to-end. Produce a route
      > table: every HTTP endpoint, its method, parameters, exact system
      > commands/files it touches, and what could go wrong if called by a
      > hostile local process. Cite function names and line numbers.
- [ ] **0.1.4 AI Engine** — `agent/ai_engine.py` (Phase II v0 at `/api/ai/*`:
      Ollama backend, streaming, trust levels, AI permissions, activity log,
      kill switch; 702 ln).
      > **Prompt:** Read `agent/ai_engine.py` end-to-end. Map each function to
      > the principle(s) in `AI-MANIFEST.md` it implements, and list every
      > conformance-checklist box with the code location that satisfies it or
      > the note "not implemented".
- [ ] **0.1.5 Build pipeline** — `build.sh` orchestrating `00-build-base.sh`
      (debootstrap), `10-privacy-layer.sh` (ufw/apparmor/crypto/flatpak, purge
      telemetry), `20-lomiri-shell.sh` (lightdm + Lomiri fallback),
      `30-rpi-packages.sh`, `40-first-boot.sh`, `50-image-builder.sh`,
      `70-aura-shell.sh` (cage+cog session, deploy shell+agent),
      `80-ai-engine.sh` (Ollama loopback + `llama3.2:1b`).
      > **Prompt:** Read `build.sh` and every numbered `*.sh` step. For each:
      > what it installs/configures, what it assumes exists, what it writes
      > into the rootfs, and any command that would fail on a clean machine.
      > Run `shellcheck` on all of them and include the findings.
- [ ] **0.1.6 Dev & run helpers** — `try-shell.sh` (browser or `--kiosk`),
      `Makefile`, `Dockerfile.dev` + `devcontainer.json` + `entrypoint.sh`
      (Tier 1 container).
      > **Prompt:** Read the five dev-helper files. Document the exact commands
      > each Make target / script runs, and verify `try-shell.sh` still matches
      > the boot description in `SHELL.md` (agent port, kiosk fallback chain).
- [ ] **0.1.7 Artifacts** — `rootfs/` (debootstrapped Ubuntu tree incl.
      `rootfs/aura`), `out/` (empty image output dir),
      `auraos-prototype.html` (superseded mockup, reference only).
      > **Prompt:** Inspect `rootfs/aura` and any Aura-deployed paths
      > inside `rootfs/` (do not touch system dirs). Report what the last build
      > actually deployed vs. what `70-aura-shell.sh` says it deploys, and
      > whether `rootfs/` should be gitignored.

## 0.2 Grounding rule
- [ ] **0.2.1 Cite file/function for every claim** — from Phase 1 on, no
      statement about current behavior without a `path:symbol` reference; no
      recommendation without naming the file it changes.
      > **Prompt:** When executing any blueprint item, cite `path:function` (or
      > `path:line`) for every factual claim about current behavior, and name
      > the file(s) each recommendation would change. If you did not open the
      > file this session, mark the claim **[UNINSPECTED]**.

## 0.3 Inspection status (honesty ledger)
- [ ] **0.3.1 Inspected in depth** — the five root docs were read in full; the
      tree and line counts above were enumerated directly.
      > **Prompt:** Keep this ledger current: whenever a blueprint item causes a
      > file to be read end-to-end for the first time, move it from 0.3.2/0.3.3
      > into this list with the date.
- [ ] **0.3.2 [UNINSPECTED] code internals** — `shell/js/shell.js`, `api.js`,
      `agent/aura-agent.py`, `agent/ai_engine.py` are described here from
      the docs, not a line-by-line read; Phase 1 begins by actually reading them.
      > **Prompt:** Execute items 0.1.2–0.1.4 (full reads) before trusting any
      > doc-derived claim about these files; then update this entry.
- [ ] **0.3.3 [UNINSPECTED] build scripts & rootfs** — the `*.sh` steps and the
      contents of `rootfs/` (incl. `rootfs/aura`) are known by name and doc
      claims only; audit them in 1.2.4.
      > **Prompt:** Execute items 0.1.5 and 0.1.7 (script + rootfs audit);
      > record every doc claim the audit confirmed or refuted, then update this
      > entry.
- [ ] **0.3.4 [UNVERIFIED] hardware claims** — cage+cog rendering on GPU and all
      Pi 5 behavior are explicitly unverified (`TESTING-AND-DEPLOYMENT.md`,
      "What's proven" table); nothing downstream may assume them.
      > **Prompt:** Never state that the shell "runs on the Pi 5" or "renders in
      > cage+cog" until the corresponding row in `TESTING-AND-DEPLOYMENT.md` is
      > flipped to verified by a real Tier 2/3 run (items 3.1.1 / 3.2.1); keep
      > that table and this entry in sync.
