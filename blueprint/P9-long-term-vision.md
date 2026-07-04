# Phase 9 — Long-Term Vision

Standing policy, revisited at every milestone. Everything here is honest about
being horizon work — nothing below may jump the P3 queue.

## 9.1 Ecosystem growth [P3]
- [ ] **9.1.1 Ship something usable first** — ecosystem follows daily-driver
      credibility (M4/M6); until then, growth work = keeping docs and the
      native-app SDK (8.1.3) welcoming.
      > **Prompt:** Do not chase ecosystem/marketing before the OS is a credible
      > daily driver (M4/M6). The only growth work allowed now is keeping the
      > docs and native-app SDK (8.1.3) approachable. Re-evaluate this gate at
      > each milestone review.

## 9.2 Community governance [P3]
- [ ] **9.2.1 Lightweight governance doc** — decision rights, the four pillars
      as constitutional (change requires consensus), AGPL + `TRADEMARK.md`
      already set the legal frame.
      > **Prompt:** Draft a lightweight `GOVERNANCE.md`: who decides what, and the
      > four pillars (Privacy · Capability · Transparency · Sovereignty) as
      > constitutional — changeable only by explicit consensus. Reference the
      > existing AGPL license and `TRADEMARK.md`; don't over-engineer it.

## 9.3 Contributor workflow [P2]
- [ ] **9.3.1 CONTRIBUTING.md** — branch/PR conventions, the honesty ledger
      rule (claims marked verified/unverified), CI gates (8.4) as the
      reviewer's floor.
      > **Prompt:** Write `CONTRIBUTING.md`: branch/PR conventions, the honesty-
      > ledger rule (every capability claim tagged verified/unverified with
      > evidence), and the CI gates (8.4) a PR must pass. Verify a newcomer could
      > follow it from zero.

## 9.4 Release cycles [P2]
- [ ] **9.4.1 Cadence** — track Ubuntu LTS for the base; time-boxed minor
      releases (e.g. quarterly) with the proven/unproven table republished
      each release.
      > **Prompt:** Define the release cadence: base tracks Ubuntu LTS, minor
      > releases time-boxed (e.g. quarterly), each republishing the proven/
      > unproven table and the device matrix (4.7.2). Document the version
      > scheme and the LTS-rebase process.

## 9.5 Enterprise support [P3]
- [ ] **9.5.1 Defer, note the shape** — if ever: fleet enrollment without a
      cloud account (self-hosted), signed policy profiles; nothing that
      violates "no mandatory server."
      > **Prompt:** Do not build enterprise features now. Only record the shape a
      > future offering would take (self-hosted fleet enrollment, signed policy
      > profiles) and the hard constraint: nothing may introduce a mandatory
      > cloud account or server. Park it.

## 9.6 More hardware [P3]
- [ ] **9.6.1 Second board** — adopt postmarketOS-style per-device dirs (2.5.2)
      when a second SBC/phone target appears; keep the HAL boundary (4.7.1)
      clean so this stays cheap.
      > **Prompt:** When a real second-board need appears, adopt postmarketOS-
      > style per-device directories (2.5.2) and confine all board differences to
      > the HAL module (4.7.1). Until then, just keep that boundary clean —
      > reject any board-specific code leaking outside the HAL.
- [ ] **9.6.2 Tablets / desktops** — grows out of adaptive layouts (5.12) and
      desktop mode (5.13); no separate codebase.
      > **Prompt:** Treat tablet/desktop as outcomes of adaptive layouts (5.12) +
      > desktop mode (5.13), never a fork. If pursued, verify the same codebase
      > serves all form factors from responsive CSS + the compositor, and
      > document the supported set.
- [ ] **9.6.3 Automotive / IoT** — the kiosk shell + agent pattern actually
      fits appliances; park until someone real asks, then reuse 4.15.2.
      > **Prompt:** Note that the kiosk-shell + agent pattern suits appliance/IoT
      > uses via the plugin format (4.15.2), but build nothing speculative. If a
      > concrete use appears, scope it as a plugin + trimmed image, not a new OS.

## 9.7 AI capabilities [P2]
- [ ] **9.7.1 The resident matures** — after M5: experiential memory →
      proactive suggestions → intent orchestration across apps (P13), each
      gated by the `AI-MANIFEST.md` conformance checklist, forever.
      > **Prompt:** Sequence the resident's growth after M5: experiential memory
      > → proactive suggestions → cross-app intent orchestration (P13). Every
      > step must pass the 11-box conformance checklist before shipping; treat a
      > failing box as a hard stop, regardless of capability gained.
- [ ] **9.7.2 Better local models, same rules** — track on-device model
      progress (Pi-class NPUs, quantization); capability may grow, the
      permission/trust/kill-switch frame never loosens.
      > **Prompt:** Track on-device model progress (Pi-class NPUs, better
      > quantization) and adopt stronger local models as they fit — but never
      > loosen the permission/trust-level/kill-switch frame to do it. When
      > swapping the default model, re-run 7.8.1 and 3.7.2.
