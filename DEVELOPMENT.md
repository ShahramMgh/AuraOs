# Development Constitution

**How AuraOS is built — the rules every contributor (human or AI) follows.**

`AI-MANIFEST.md` says *why* we build. The `blueprint/` says *what* to build and
*when*. **This document says *how* — the engineering standard a change must meet
before it belongs in the tree.** When in doubt about the mechanics of a change,
this file is the authority; when a principle is at stake, `AI-MANIFEST.md` and
`CLAUDE.md` outrank it.

Read it once end-to-end before your first change. It is short on purpose.

---

## 0. Which document rules which question

| Question | Authority |
|---|---|
| Is this allowed? Does it respect the four pillars? | `CLAUDE.md`, `AI-MANIFEST.md` |
| What should I build next, and in what order? | `blueprint/00-INDEX.md` → `P3-roadmap.md` |
| Why is the stack shaped this way? Threat model? | `ARCHITECTURE.md` |
| How does the shell boot / how do I run it? | `SHELL.md`, `try-shell.sh` |
| How is the Android layer wired? | `ANDROID.md` |
| **How do I write the change well?** | **this file** |
| Is it good enough to merge? | §8, the Definition of Done |

If two documents disagree, the one that gives the **user more protection and
more control** wins. Never resolve a conflict by weakening a guarantee.

---

## 1. The prime directive

Every line of code serves four **equal** pillars — **Privacy · Capability ·
Transparency · User Sovereignty** — and none is ever traded for another. In
practice that collapses to five hard rules. Break one and the change is wrong,
no matter how well it works:

1. **The OS is the final authority.** Apps, models, and Android reach the system
   *only* through `aura-agent`. Nothing self-grants a permission, opens a
   socket the agent doesn't own, or routes around the permission/sandbox/crypto
   layer. A model's output is a *request*, adjudicated by the OS — never an action.
2. **Off / local by default.** No account, no telemetry, no cloud dependency.
   Nothing sensitive leaves the device without a **per-use, plain-language
   consent**. The device is fully usable with the entire AI layer turned off.
3. **Visible when active.** Any touch of a sensor or context source lights the
   on-screen indicator — for an app or the AI, identically. No invisible access.
4. **Reversible and inspectable.** Permissions, network, memory, and automation
   are all user-viewable and user-revocable. Every automated action is undoable
   and lands in an audit log.
5. **Degrade honestly.** When something isn't available, say so plainly. Never
   fake success, never pretend a capability exists. "Android layer not
   installed" beats a silent no-op every time.

---

## 2. The system in one picture

```
   shell (web UI)                       the device
   index.html + js/*  ──/api/*──►  aura-agent.py  ──►  /sys, nmcli, brightness,
   (vanilla JS, no build)          (Python, stdlib-only,     app launch, perms + net stores
        │                           localhost:8787,          │        │
        │  same data contract       token-gated)             │        └► ai_engine.py   (/api/ai/*)
        │  in SIM and LIVE                                    └────────► waydroid_bridge.py (/api/android/*)
        ▼
   SIM fallback (in api.js)   ← identical shapes, so the shell is fully explorable with no agent
```

Three services, one door. **The agent is the only door to the device.** The AI
Engine and the Waydroid bridge are siblings *behind* that door, never separate
doors. Adding a new "the shell talks directly to X" path is almost always wrong —
route it through the agent.

---

## 3. Layer rules

### 3.1 The agent — `agent/aura-agent.py`
- **Standard library only.** No pip, no vendored packages. If you reach for a
  dependency, you are solving the wrong problem. This is a load-bearing property
  (Manifest P5: the agent is swappable *because* it is small and dependency-free).
- **Helpers never raise.** `run()` returns `(rc, stdout)` and swallows every
  exception; readers return `None` on failure. New helpers follow the same
  contract — a failed subprocess is a value, not a stack trace.
- **Everything under `/api/` is token-gated.** The check is one line
  (`if p.startswith("/api/") and not self._authed()`). Do not add an endpoint
  that skips it, and do not invent a second auth scheme.
- **Cache the expensive, live-read the cheap.** Multi-subprocess reads (radios,
  disk) go through `cached(key, ttl, fn)`; cheap `/sys` reads (battery,
  brightness) stay live. The 2 s status poll must never spawn a slow command.
- **Actions are targeted and honest.** A handler does exactly what its name and
  the UI promise — no more. *(Cautionary tale: `/api/block` once ran
  `ufw deny out to any`, blocking all egress to "block one host." It now resolves
  the host and denies only its addresses, and reports `enforced:false` when it
  can't. Never write a blanket policy to satisfy a specific request.)*

### 3.2 The shell — `shell/index.html`, `shell/js/{icons,api,shell}.js`, `shell/auraos.css`
- **Vanilla JS, no build step, no framework, no npm.** It runs by opening a file.
  Keep it that way — no bundler, no dependency, no transpile.
- **`api.js` is the only thing that talks to the agent.** Views in `shell.js`
  call `Sov.*`; they never `fetch` directly. All device access funnels through
  the `Sov` object.
- **The dual-shape contract is sacred (read §4).** Every `Sov` method answers in
  the *same shape* whether it hit the live agent or the in-memory SIM.
- **Match the surrounding style.** Terse helpers (`$`, `$$`, `esc`, `ic`,
  `toast`), template literals for markup, `data-*` hooks wired in a
  `// ---- wire it up ----` block. Read the neighbouring view before writing a new one.

### 3.3 Build scripts — `NN-*.sh`, `build.sh`
- **Numbered, ordered, idempotent.** A step is safe to re-run. Guard with
  `command -v` / file-existence checks before installing or writing.
- **`set -euo pipefail`, but never fail the whole build for a networkless
  chroot.** Anything that needs the network or root (a system image, a model,
  `waydroid init`) is **deferred to a first-boot oneshot**, not attempted in the
  chroot. Tolerate the offline case and lay down the on-device pieces anyway.
- **Leave a trail.** End a step with an `echo` summary of what it installed and
  what defers to first boot, exactly like the existing steps do.

### 3.4 The AI Engine — `agent/ai_engine.py` (`/api/ai/*`)
- **Apps talk to the Engine, never to a model.** Weights are never handed out.
- **Every AI feature passes the conformance checklist** in `AI-MANIFEST.md` §
  "Conformance checklist" — all eleven boxes **yes** — before it ships. If any
  answer is "no," it is not ready, regardless of how capable it is.
- **Off by default; local by default; kill switch is absolute.** Observation and
  inference run only while the user has the AI on. The first request that would
  leave the device asks first, per call.
- **Capabilities are data, not code.** New abilities go in the one capability
  catalog (`ai_engine.CAPABILITIES`) the Engine turns into tools at runtime — no
  keyword gates, no `if intent == …` rules. The model reasons over the catalog.

### 3.5 The Android bridge — `agent/waydroid_bridge.py` (`/api/android/*`)
- **On-demand, light, honest.** The heavy Waydroid session starts lazily on
  first app launch and is reclaimed when idle. Never start it at boot; never keep
  it running with nothing on screen. See `ANDROID.md` for the full memory model.
- **Every method returns a JSON-able dict and never raises** — same contract as
  the agent. Waydroid absent/uninitialised/failed shows up as a *field*
  (`available:false`, `initialized:false`, `error:…`), which the shell renders
  honestly.
- **Android apps are first-class, not a mode.** They flow through the same
  `.desktop` discovery and launch path as native apps. Do not build a parallel
  "Android launcher." The `Settings › Android` panel is a *manager*, not the
  everyday way to open an app.

---

## 4. The golden contract: a feature lives in four places, consistently

This is the rule violations of which cause the most bugs here. **An `/api/`
feature is not "done" until it is coherent across all four:**

1. **The agent route** — `agent/aura-agent.py` serves it, token-gated.
2. **`api.js`** — a `Sov.*` method that returns **the same shape** in `live`
   (hits the agent) and `sim` (answers from the in-memory model). The SIM path is
   not a stub: it must be faithful enough that the whole view is explorable in a
   plain browser with no agent (`try-shell.sh`).
3. **The shell view** — `shell.js` renders it and wires the controls.
4. **The doc** — if a doc has an endpoint table or a feature list (`ANDROID.md`,
   `SHELL.md`, `ARCHITECTURE.md`), it names the new route/feature and stays true.

A route the shell never calls, a documented endpoint with no caller, or a SIM
method whose shape drifts from live — each is a defect. *(This document exists in
part because `/api/android/show` was implemented and documented but had no shell
caller, and the `ufw` block silently over-reached. Both are now fixed; don't
reintroduce the class.)*

**Before you commit an `/api/` change, grep the four places and confirm they agree.**

---

## 5. Recipes

### Add an `/api/` endpoint
1. Add the handler in `aura-agent.py` (GET block or POST block). Token-gated,
   never-raises, targeted. Cache it if it's expensive.
2. Add a `Sov.method()` in `api.js` with a real `sim` branch of the same shape.
3. Call it from a `shell.js` view; wire the controls; render the honest failure case.
4. Update the relevant doc's endpoint/feature table.
5. Run §8.

### Add an app
- Native apps are discovered from `.desktop` files by the agent — usually **no
  code**. To surface one in the SIM catalogue, add it to `APPS` in `api.js`
  (and, for Android, the blended entries near the SIM catalogue) so the drawer is
  explorable offline. One launch path for native and Android alike.

### Add an AI capability
- Add an entry to `ai_engine.CAPABILITIES` (data). Do **not** write intent→action
  code. Walk the `AI-MANIFEST.md` conformance checklist and get eleven "yes"es.
  Confirm the device still works with AI **off**.

### Touch the Android layer
- Everyday launching already works through `.desktop` discovery — prefer that.
  For a *manager* control, extend `waydroid_bridge.py` (dict-returning, never
  raises) → `/api/android/*` route → `Sov.android*` (live+sim) → the manager view
  → `ANDROID.md`'s endpoint table. Keep it on-demand and honest.

---

## 6. Security & privacy — non-negotiable

- **Token on every `/api/` call.** No exceptions, no second scheme.
- **Guard every path.** File and icon routes resolve and confine to allowed
  roots — no traversal. (See `/api/appicon`, `/api/files/*` for the pattern.)
- **No blanket policies.** A firewall/permission action targets exactly its
  subject. Never widen scope for convenience (see the `/api/block` lesson, §3.1).
- **Consent before egress.** Nothing sensitive leaves the device without a
  per-use, plain-language prompt. A new network call the user didn't ask for is a
  bug, not a feature.
- **Encrypt what you keep.** User data and AI memory belong in the Vault,
  local and deletable. If something isn't there yet, say so (see the Manifest's
  honest-limits notes) rather than pretending.

---

## 7. Documentation & honesty

- **Docs track code in the same change.** Move an endpoint, change a default,
  wire a feature → update `ANDROID.md`/`SHELL.md`/`ARCHITECTURE.md` in the same commit.
- **Keep the "Verified vs. not-yet-verified" tables truthful** (e.g. `ANDROID.md`).
  Only claim **Verified** for what you actually ran, and name where you ran it.
  "Not yet verified — needs hardware" is a respectable, required status. Never
  upgrade a claim you didn't test.
- **Cite the source.** When you assert something about the system, name the file
  (and function) — the blueprint's grounding rule (`blueprint/00-INDEX.md` §0.1)
  applies everywhere, not just in the blueprint.

---

## 8. Definition of Done

A change is ready to merge only when **all** of these hold:

- [ ] It upholds the five hard rules (§1) — OS authority, off/local by default,
      visible when active, reversible/inspectable, degrades honestly.
- [ ] If it adds/changes an `/api/` feature, the four places agree (§4): agent
      route (token-gated), `api.js` live **and** sim (same shape), shell view, doc.
- [ ] The agent still imports and compiles: `python3 -m py_compile agent/*.py`.
- [ ] The shell still runs in a plain browser via SIM: `./try-shell.sh` — the new
      view is fully explorable with no agent.
- [ ] No new dependency (agent = stdlib only; shell = no build/npm).
- [ ] The failure path is honest — absent/denied/offline shows a plain message,
      not a fake success.
- [ ] If it's an AI feature: eleven "yes"es on the Manifest checklist, and the
      device still works with AI off.
- [ ] Docs updated in the same change; any new claim marked Verified was actually run.

If you cannot check a box, the change is not done — say so plainly and leave it
`in_progress` rather than claiming completion.

---

## 9. Anti-patterns — never do these

- Add a dependency to the agent or a build step to the shell.
- Let the shell talk to the device around the agent, or an app talk to a model
  around the Engine.
- Write a blanket firewall/permission/policy action to satisfy a specific request.
- Make a network/cloud call without per-use consent, or on by default.
- Ship a SIM branch that lies about the live shape, or a live route with no SIM.
- Leave a documented endpoint unwired, or a wired endpoint undocumented.
- Fake success when a capability is missing. Degrade honestly instead.
- Claim **Verified** for something you didn't run.

---

*The measure of a change is not how much it does, but how much it lets the user
do while keeping every key in the user's hand.*
