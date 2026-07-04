# Phase 1 — Current State Assessment

Deliverable: one honest document per subsystem, every claim cited. (deps: P0)

## 1.1 Architecture overview [P1]
- [ ] **1.1.1 Draw the real dataflow** — one diagram: lightdm → cage → cog →
      shell → `agent/aura-agent.py` → `/sys`·`nmcli`·`ps`·fs, with
      `agent/ai_engine.py` and Ollama as siblings; mark trust boundaries.
      > **Prompt:** From the actual code (not the docs), draw the runtime
      > dataflow from boot to a live request as an ASCII/Mermaid diagram in
      > `blueprint/out/1.1.1-dataflow.md`. Mark each process boundary and label
      > which hops are authenticated (today: none) vs. trusted-by-locality.
- [ ] **1.1.2 Enumerate the API surface** — list every `/api/*` route the agent
      and engine expose, with method, auth (currently none), and consumer.
      > **Prompt:** Grep `agent/*.py` for every route registration and produce a
      > complete endpoint table (method · path · params · handler:line · caller
      > in `shell/js/api.js`). This table is the input to the API contract doc
      > (8.1.1); save it to `blueprint/out/1.1.2-api-surface.md`.

## 1.2 Subsystem-by-subsystem behavior [P1]
- [ ] **1.2.1 Shell** — read `shell/js/shell.js` + `api.js` end-to-end; document
      the router, sim/live switching, and the permission-prompt flow as coded.
      > **Prompt:** Trace, in code, exactly how the shell decides SIM vs. LIVE
      > (`shell/js/api.js`) and how the permission prompt flows from tap →
      > prompt → stored decision → sensor indicator (`shell/js/shell.js`).
      > Write it up as a sequence, citing functions and lines.
- [ ] **1.2.2 Agent** — read `agent/aura-agent.py`; document every
      endpoint's exact system access (esp. `/api/exec` and `/api/files/*`).
      > **Prompt:** For `/api/exec` and `/api/files/*` specifically, document the
      > exact subprocess/filesystem calls, what path/command validation exists,
      > and construct (do not run) three inputs that would be dangerous today.
      > Feed the findings into weakness 1.4.1 and security 6.6.1.
- [ ] **1.2.3 AI Engine** — read `agent/ai_engine.py`; map each behavior to the
      `AI-MANIFEST.md` conformance checklist, item by item.
      > **Prompt:** Run `agent/ai_engine.py` against the 11-box conformance
      > checklist in `AI-MANIFEST.md`. For each box output PASS/PARTIAL/FAIL with
      > the code location that decides it. This becomes the seed of the
      > executable test in 8.5.1.
- [ ] **1.2.4 Build pipeline** — read all `*.sh`; record what each step actually
      installs/configures vs. what the docs claim (0.3.3).
      > **Prompt:** For each numbered build script, diff "what it does" against
      > "what `ARCHITECTURE.md`/`TESTING-AND-DEPLOYMENT.md` claim it does". List
      > every discrepancy and every step that is unverified on real hardware.

## 1.3 Strengths (keep and protect) [P2]
- [ ] **1.3.1 Verified-honesty culture** — proven/unproven is tracked explicitly
      (`TESTING-AND-DEPLOYMENT.md` table); keep this table current forever.
      > **Prompt:** Confirm the proven/unproven table still matches reality after
      > recent commits; add any newly-built-but-unverified capability as a row.
      > Propose a CI check (8.4) that fails if a claim marked "verified" has no
      > linked test.
- [ ] **1.3.2 Sim/live parity** — one code path with a faithful simulation
      (`shell/js/api.js`) makes every flow testable without hardware.
      > **Prompt:** Audit `shell/js/api.js` for any endpoint where SIM and LIVE
      > diverge in shape (different fields/contract). List drift so the
      > simulation stays a truthful stand-in; propose a shared schema.
- [ ] **1.3.3 Zero-dependency bridge** — stdlib-only agent means nothing to
      install on minbase and a small audit surface.
      > **Prompt:** Verify `agent/*.py` imports only the Python standard library
      > (grep imports). Flag any third-party import as a regression against the
      > stdlib-only guarantee and suggest a stdlib replacement.
- [ ] **1.3.4 Manifest-governed AI** — trust levels, kill switch, off-by-default
      already coded, not just written down (`agent/ai_engine.py`).
      > **Prompt:** Prove, from code, that the AI Engine is off by default and
      > the kill switch is absolute (no code path reaches a model when killed).
      > If any path bypasses it, that is a P1 bug — report it.

## 1.4 Weaknesses [P1]
- [ ] **1.4.1 Unauthenticated local API** — any local process can hit
      `127.0.0.1:8787`, including `/api/exec` (arbitrary shell as session user);
      document the exposure precisely before fixing it in 6.6.1.
      > **Prompt:** Demonstrate (write-up only) the exposure: which endpoints let
      > a local process read files, run commands, or change system state with no
      > auth. Quantify the blast radius. Do not fix here — the fix is 6.6.1;
      > this item only documents it precisely.
- [ ] **1.4.2 PIN unlock is a placeholder** — agent endpoint accepts any PIN
      (`SHELL.md` "rough edges"); real auth is PAM/greeter work (5.3.1).
      > **Prompt:** Locate the unlock endpoint and confirm it accepts any PIN.
      > Document the current behavior and the exact contract a real
      > implementation must satisfy (rate limiting, no PIN in logs), handing off
      > to 5.3.1.
- [ ] **1.4.3 Access ribbon isn't authoritative** — it reflects shell-launched
      flows only, not arbitrary processes (`SHELL.md`); portal wiring is 4.5.3.
      > **Prompt:** Trace how the access ribbon/Aura gets its "active sensor"
      > signal in code. Confirm it only sees shell-initiated launches, and
      > specify what a portal-fed authoritative signal would need to replace
      > (input to 4.5.3).

## 1.5 Technical debt [P2]
- [ ] **1.5.1 Monoliths** — `shell.js` (2210 ln) and `aura-agent.py`
      (1134 ln) are single files; plan module splits before they grow further.
      > **Prompt:** Propose a module split for `shell/js/shell.js` and
      > `agent/aura-agent.py` along existing seams (router, views,
      > permission store, HAL, file API). Output a target file list with what
      > moves where; do not refactor yet — get the plan approved first.
- [ ] **1.5.2 Prefs in localStorage** — wallpaper/layout live in the browser
      profile (`SHELL.md` Personalize), not the OS state dir; migrate to agent.
      > **Prompt:** List every `localStorage` key the shell writes. Design an
      > agent-backed prefs endpoint (`/api/prefs`) to hold them in the OS state
      > dir, with a migration that reads existing localStorage once.
- [ ] **1.5.3 Numbering gap** — build steps jump 50 → 70; either restore a 60
      step or renumber so the pipeline reads honestly.
      > **Prompt:** Determine why build steps skip 60. Either document the gap in
      > `build.sh` or renumber the steps consistently; update all references in
      > the docs.

## 1.6 Architectural problems [P1]
- [ ] **1.6.1 No session integration for external apps** — a systemd-launched
      agent can't hand apps the session's Wayland/D-Bus (`SHELL.md`); decide the
      launcher-inside-session design in 4.4.2.
      > **Prompt:** Explain, from the systemd unit and launch code, why an
      > external GUI app launched by the agent lacks `WAYLAND_DISPLAY`/D-Bus
      > session access. Lay out the options (agent in-session, a launcher
      > helper, compositor-owned launch) with trade-offs; hand off to 4.4.2.
- [ ] **1.6.2 Polling, not events** — shell polls the agent for state; define an
      event push channel (SSE/WebSocket) before adding notifications (4.8.1).
      > **Prompt:** Find every polling loop in `shell/js/*.js` (intervals hitting
      > the agent). Measure their frequency, then design a single Server-Sent
      > Events channel to replace them; list which polls it subsumes (feeds
      > 4.8.1 and 7.5.1).

## 1.7 Incomplete implementations [P1]
- [ ] **1.7.1 Portal sensor hook** (roadmap item 4, `ARCHITECTURE.md`) — not
      wired. **1.7.2 AI memory/learning loop** — "still ahead"
      (`AI-MANIFEST.md` Status). **1.7.3 Cloud-inference consent path** — no
      provider configured. **1.7.4 Syncthing GUI** — still default web UI.
      > **Prompt:** For each of these four unfinished features, confirm from code
      > that it is absent/stubbed, then write a one-paragraph "definition of
      > done" pointing at the roadmap item that completes it (4.5.3, 3.5.1/3.5.2,
      > 3.5.3, and a Syncthing-GUI item respectively).

## 1.8 Scalability limitations [P2]
- [ ] **1.8.1 Single-threaded stdlib HTTP server** — measure concurrent-request
      behavior (streaming chat + polling + file ops at once) and set limits.
      > **Prompt:** Determine whether the agent's HTTP server is threaded
      > (`ThreadingHTTPServer`?) from code. If not, demonstrate that a long
      > streaming chat blocks concurrent polls, and propose the minimal
      > threading/async fix that keeps it stdlib-only.
- [ ] **1.8.2 One-fullscreen-app model** — cage kiosk = no multitasking; the
      ceiling is acknowledged (`SHELL.md`), the answer is 4.4.2 / 5.4.
      > **Prompt:** State precisely what cage's single-surface model prevents
      > (concurrent visible apps, app switcher). Confirm it is a compositor
      > limitation, not a shell one, so the fix lives in 4.4.2, not the UI.
