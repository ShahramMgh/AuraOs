# AI Integration Manifest
### Phase II — Native Intelligence Layer
**Version 0.1 · Guiding document for AuraOS**

> This is the authority every AI feature in AuraOS answers to. When a
> design decision is unclear, the decision that upholds these principles wins —
> even at the cost of capability, speed, or shipping date. Phase I earned the
> right to make this claim: it already proves a device can be private, honest,
> and fully under the user's control (see `ARCHITECTURE.md`, `SHELL.md`). Phase
> II extends that same sovereignty to intelligence.

---

## Purpose

Artificial Intelligence is no longer an application.
It is no longer a cloud service.
It is no longer a chatbot.

In this operating system, **AI becomes a native system capability** — available
to every component of the OS while remaining completely under the authority of
the operating system and, ultimately, the user.

The objective is simple:

> **Build the most capable computing experience possible without sacrificing
> ownership, transparency, privacy, or user control.**

---

## Core Philosophy

**We reject the false trade-off between privacy and intelligence.**

Modern computing should not require surrendering personal data. Likewise,
privacy should not require abandoning convenience, automation, or
state-of-the-art AI.

This system is built on four equal pillars:

| | |
|---|---|
| **Privacy** | Personal data stays on the device and under encryption by default. |
| **Capability** | The experience is genuinely powerful, not a compromised "privacy-lite" version. |
| **Transparency** | Nothing happens that the user cannot see and understand. |
| **User Sovereignty** | The user is the final authority over every decision. |

**None may be sacrificed for another.**

---

# Part I — The Principles

### Principle 1 — AI is a System Capability
AI is part of the operating system. Not an application. Not an assistant. Not a
cloud subscription. It exists as a **native system service** available through
system APIs. Every system component can request AI services through
standardized interfaces.

### Principle 2 — OS Authority
The operating system is always the final authority. AI never bypasses
**permissions, security, sandboxing, encryption, or user consent**.
AI may recommend. AI may automate. AI may predict.
**AI never overrides system policy.**

### Principle 3 — Local-First Intelligence
Every AI request should execute locally whenever possible.
Local inference is the **default**. Cloud inference is optional.
Never the opposite.

### Principle 4 — Cloud is an Extension
Cloud models are extensions, not dependencies. When local hardware is
insufficient, the OS may *recommend*: "A larger model can complete this
request." The user chooses:
- Local only
- Use cloud once
- Always ask
- Preferred provider

### Principle 5 — AI is Replaceable
No model is mandatory. The AI runtime supports interchangeable providers —
**Ollama, llama.cpp, vLLM, MLX**, and future local runtimes. The OS communicates
through a unified inference API; the inference backend is replaceable.

### Principle 6 — The AI Engine
The operating system includes a native **AI Engine** responsible for:
model management · inference scheduling · GPU allocation · memory optimization ·
context management · prompt security · permission enforcement.
**Applications never communicate directly with models. They communicate with the
AI Engine.**

### Principle 7 — AI Permissions
AI permissions are **independent** from application permissions. An AI request
explicitly declares:
- Requested resources
- Purpose
- Expected actions
- Lifetime

The OS evaluates whether access should be granted.

### Principle 8 — Explainability
Every AI action must be explainable. Users may ask:
*Why did you recommend this? Why was this setting changed? Why was this
notification hidden?* The AI must produce a **human-readable explanation**.

### Principle 9 — Reversible Automation
Automation is never permanent. Every AI action should be **undoable, auditable,
and replayable**. Automation should increase confidence — not remove control.

### Principle 10 — Human Approval Levels
Automation has configurable trust levels:
- **Level 0 — Observe only.**
- **Level 1 — Recommend.**
- **Level 2 — Execute after approval.**
- **Level 3 — Execute trusted actions automatically.**

**Users decide the level. Not developers.**

### Principle 11 — AI Memory
Memory belongs to the user. It is **encrypted, local, editable, searchable, and
deletable**. Users may inspect every stored memory. **Nothing is hidden.**

### Principle 12 — Context-Aware, Not Surveillance-Aware
Context comes from **user-approved** information — calendar, documents, location,
files, photos, messages. Each source requires **independent authorization**.
**No permanent unrestricted access exists.**

### Principle 13 — Intrinsic Interface
The interface is designed around intelligence. Users never need to think *"which
app should I open?"* — instead, *"what do I want to accomplish?"* AI helps
orchestrate the workflow; applications become implementation details.

---

# Part II — Applying the Manifest

The manifest is not abstract. Phase I already built the primitives Phase II
extends — the same patterns, now serving intelligence. This is how each
principle becomes real in *this* codebase.

| Principle | How Phase I already models it | What Phase II adds |
|---|---|---|
| **1 · System capability** | The `aura-agent` is a native, OS-owned service every app reaches through one API. | The **AI Engine** is a sibling service exposed the same way — `/api/ai/*`, not a bundled app. |
| **2 · OS authority** | The agent enforces the permission store; apps can't self-grant. | The Engine runs *behind* the same permission/sandbox layer; a model's output is a **request**, adjudicated by the OS, never an action. |
| **3 · Local-first** | All device state is read locally; no account, no telemetry. | Inference defaults to on-device runtimes; a request never leaves the device unless the user chose that, per call. |
| **4 · Cloud is an extension** | Sync is peer-to-peer and opt-in; nothing depends on a server. | Cloud inference reuses the **"ask once" consent UX** (Allow / Only this time / Don't allow / preferred provider). |
| **5 · Replaceable** | The agent is stdlib-only and swappable. | One **unified inference API**; backends (Ollama/llama.cpp/vLLM/MLX) are drivers behind it. |
| **6 · AI Engine** | Apps talk to the agent, not to `/sys` or `nmcli` directly. | Apps talk to the Engine, not to models directly. Model weights are never handed to an app. |
| **7 · AI permissions** | Per-app Allow/Ask/Deny, purpose-scoped, revocable (see Permissions screen). | A **distinct AI-permission class** declaring resources · purpose · expected actions · lifetime — reviewed in its own screen. |
| **8 · Explainability** | The **Network log** shows every connection, in the open. | An **AI activity log** answers *why* for every recommendation, change, or hidden item. |
| **9 · Reversible automation** | Every permission and toggle is instantly revocable. | Every automated action carries an **undo token** and lands in a replayable audit trail. |
| **10 · Approval levels** | Sensor guards / permission postures are user-set, not app-set. | A global + per-domain **trust level (0–3)**, defaulting to Recommend. |
| **11 · AI memory** | The **Vault** is fscrypt-encrypted, local, inspectable. | AI memory *lives in the Vault* with a **Memory** screen to search/edit/delete every entry. |
| **12 · Context, not surveillance** | The **insight margin** shows what has mic/cam/location *right now*. | AI context sources are independently authorized; when AI is actively reading a source, the **same live indicator lights up**. |
| **13 · Intrinsic interface** | The shell is task-first, not a glossy app maze. | Intent-driven orchestration layers on top — apps become the Engine's tools. |

### Non-negotiable defaults
- **Off by default.** No AI capability is active until the user turns it on. The device is fully usable with the entire intelligence layer disabled.
- **Local by default.** The first time any request would leave the device, the user is asked — never silently.
- **Visible when active.** AI touching a sensor or a context source lights the same on-screen indicator as any app. No invisible access.
- **The kill switch is absolute.** A single control disables the AI Engine entirely; nothing routes around it.

### Conformance checklist
Every AI feature, before it ships, must be able to answer **yes** to all of these:

- [ ] Does it run through the **AI Engine**, never talking to a model directly? *(P1, P6)*
- [ ] Does it respect existing **permissions, sandboxing, and encryption** with no bypass? *(P2)*
- [ ] Does it default to **local** inference and ask before using the cloud? *(P3, P4)*
- [ ] Would it still function if the **backend model were swapped**? *(P5)*
- [ ] Does it declare **resources, purpose, actions, and lifetime** for its access? *(P7, P12)*
- [ ] Can the user get a **plain-language "why"** for anything it did? *(P8)*
- [ ] Is every action it takes **undoable and auditable**? *(P9)*
- [ ] Does it obey the user's chosen **trust level (0–3)**? *(P10)*
- [ ] Is any memory it keeps **encrypted, local, and user-deletable**? *(P11)*
- [ ] Does it **light the live indicator** whenever it accesses a sensor or context source? *(P12)*
- [ ] Does it still work — and the device still work — **with AI turned off**? *(defaults)*

If any answer is *no*, it is not ready, regardless of how capable it is.

---

## Status & scope

- **Version 0.1** — the vision is ratified, and **AI Engine v0 is built**: a
  native Engine (`agent/ai_engine.py`) exposed at `/api/ai/*`, a replaceable
  local backend (Ollama first), an independent AI-permission class
  (default-deny), user-owned memory, an explainability activity log, trust
  levels 0–3, off-by-default, and an absolute kill switch — surfaced in the
  shell as **Settings → Intelligence** and the **Assistant** app. Verified this
  session: the Engine enforces off-by-default, disabled/killed refusal,
  local-first honesty, default-deny context permissions, and the kill switch;
  the shell's `Sov.ai` layer was driven end-to-end in a JS engine against the
  same rules.
- **Streaming responses are now built**: the Engine streams tokens as the model
  generates them (`ai_engine.chat_stream` → the agent relays chunked NDJSON →
  the shell renders the reply live). This also fixed a real bug — a non-streamed
  answer that took longer than the browser's response window to generate never
  arrived; streaming keeps the connection producing data so long replies land.
- **Situation awareness (the resident perceives its house):** the agent builds a
  plain-language snapshot of the device's current state (time, battery,
  connectivity, load) from its own local readers and passes it into every chat,
  so the assistant already knows things like *"battery 100%, online over Wi-Fi
  'Home'"* — all local, nothing leaves the device.
- **Capability registry:** the agent discovers real installed apps + its own
  system functions (`/api/capabilities`), so the Engine sees new apps/functions
  with no code change — the foundation for tool-use.
- **Tool-use → plan composition (the resident can act, un-hardcoded):** there is
  **one capability catalog** (`ai_engine.CAPABILITIES`) that the Engine turns into
  the model's tools at runtime — no keyword gate, no intent→action rules. The
  model reasons over the catalog and may propose a **multi-step plan** (e.g. "I
  want to sleep" → silence · dim · play calm music), not just one action. It's the
  manifest end-to-end: the plan is a **request** (P2) — at trust < 3 the user
  approves it step-by-step on a plain-language plan card, at trust 3 trusted steps
  auto-run (P10); every step is **logged** (P8) and one Undo reverts the whole
  plan (P9). Adding a capability (or an installed app) makes the resident able to
  use it with no code change.
- **Experiential memory + proactive suggestions (learning loop, v0):** the
  resident **observes** what actually happens (the user's launches/toggles/levels,
  with time-of-day context), mines recurring **routines** on-device, and offers at
  most one **proactive suggestion** at the right moment ("You often do this around
  23:06 — play Music?"), which the user accepts (runs through the normal consent
  path) or dismisses (snoozed for the day). Observation runs **only while the AI is
  on**; every episode/routine is local and deletable.
  *Honest limits (not yet conformant):* the episode log is plain JSON in the state
  dir, **not yet encrypted in the Vault** (P11) — that hardening is roadmap M5
  (`blueprint/P3 §3.5.1`); and this loop is verified in sim + a local live run,
  **not yet on hardware**.
- Still ahead: encrypting AI memory into the Vault + a Memory screen, an
  AI-proposed home layout, real context-source wiring, and a configured cloud
  provider for the opt-in path.
- This document governs Phase II. It does not weaken Phase I; it inherits it.
  Where this manifest and a Phase I guarantee could ever conflict, **the
  stronger protection of the user wins.**

*The measure of this layer is not how much it can do on its own, but how much it
lets the user do while keeping every key in the user's hand.*
