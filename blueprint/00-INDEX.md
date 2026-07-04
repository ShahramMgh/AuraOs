# AuraOS — Blueprint Index

The future guideline of the project, as a hierarchical checklist. Each item is a
title plus one–two lines of *what to do and how*. We work through it one item at
a time, checking items off as they land.

## Grounding rules (apply to every phase)
1. **Cite the source.** Every claim about the current system names a file (and
   function/section where useful), e.g. `agent/aura-agent.py`,
   `shell/js/api.js`.
2. **Flag the uninspected.** Anything asserted about a subsystem that was not
   actually read is marked **[UNINSPECTED]** until someone opens it.
3. **The manifest wins.** Any AI item must pass the conformance checklist in
   `AI-MANIFEST.md` before it ships; any conflict resolves toward the stronger
   user protection (`CLAUDE.md`).

## Priority legend
- **[P1]** — do next: correctness, security, or hardware-truth blockers.
- **[P2]** — platform maturity: needed for a credible daily-driver v2.
- **[P3]** — horizon: valuable, not on the critical path.

## How to use an item
Every leaf item carries a `> **Prompt:**` block — a self-contained instruction
you can paste to an AI (or follow yourself) to execute *that one item*. Each
prompt names what to read, what to produce, and how to verify it. Convention:
prompts assume the working directory is the repo root, obey the grounding rule
(0.2.1), and write any standalone deliverable into `blueprint/out/<item>.md`.
Work items top-to-bottom within a milestone (P3), respecting each item's `deps:`.

## The phases
| File | Phase | One line |
|---|---|---|
| [P0-inventory.md](P0-inventory.md) | Step 0 — Inventory & Grounding | Full tree with purposes; what has and hasn't been inspected. |
| [P1-current-state.md](P1-current-state.md) | Phase 1 — Current State Assessment | What exists, what's strong, what's debt, what's incomplete. |
| [P2-gap-analysis.md](P2-gap-analysis.md) | Phase 2 — Gap Analysis | Aura vs. Android / iOS / desktop Linux / Ubuntu Touch / postmarketOS / HarmonyOS. |
| [P3-roadmap.md](P3-roadmap.md) | Phase 3 — Roadmap | Milestones M1–M6, dependencies, validation and success criteria. |
| [P4-architecture-review.md](P4-architecture-review.md) | Phase 4 — Architecture Review | Every OS subsystem: current state → target → how. |
| [P5-user-experience.md](P5-user-experience.md) | Phase 5 — User Experience | Shell UX: navigation, lock, multitasking, theming, form factors. |
| [P6-security.md](P6-security.md) | Phase 6 — Security | Boot chain, encryption, sandboxing, hardening, secure updates. |
| [P7-performance.md](P7-performance.md) | Phase 7 — Performance | Memory, startup, rendering, battery, inference on a Pi 5. |
| [P8-developer-platform.md](P8-developer-platform.md) | Phase 8 — Developer Platform | SDK, API contract, CI/CD, testing, emulation, store. |
| [P9-long-term-vision.md](P9-long-term-vision.md) | Phase 9 — Long-Term Vision | Ecosystem, governance, releases, new form factors, AI growth. |

## Top-level dependency order
```
P0 Inventory ─► P1 Current State ─► P2 Gaps ─► P3 Roadmap
                                                  │
              (P4–P8 are executed as the roadmap schedules them)
P4 Architecture ──┬─► P6 Security ──► P7 Performance
P5 UX ────────────┘        │
P8 Dev Platform ◄──────────┘          P9 Vision (continuous)
```
Rule of thumb: **P0–P3 are analysis** (documents, cheap, do them in order);
**P4–P8 are engineering** (pull items by priority tag, respecting each item's
`deps:`); **P9 is standing policy** revisited each milestone.
