# Phase 5 — User Experience

The shell stays modern, calm, minimal — familiar where familiarity helps,
distinct where it protects (`SHELL.md`). No busy, glowy additions.

## 5.1 Navigation [P2]
- [ ] **5.1.1 Define the global model** — home / back / app-switch as one
      documented gesture+button scheme; today navigation is per-screen in
      `shell/js/shell.js` — unify it in the router.
      > **Prompt:** Audit how navigation works per-screen in `shell/js/shell.js`,
      > then design one global model (home / back / switch) as gestures + an
      > optional bar. Unify it in the router so every screen obeys the same
      > back-stack; document the scheme.

## 5.2 Launcher [P2]
- [ ] **5.2.1 Keep the config-driven home** — focus card + glass grid rendered
      from `shell/home.config.json`; only additive changes (AI proposes, user
      wins) — this design is settled.
      > **Prompt:** Treat the config-driven calm home as settled (see the
      > constellation-home memory). Any change must be additive and keep the
      > renderer decision-free (it only draws `home.config.json`). Reject
      > proposals that reintroduce busy/glowy visuals.
- [ ] **5.2.2 App drawer search** — fuzzy search across native apps + the
      capability registry's "Installed on Ubuntu" set.
      > **Prompt:** Add fuzzy search to the app drawer spanning native apps and
      > the `/api/capabilities` "Installed on Ubuntu" set. Verify it ranks
      > sensibly, is keyboard/touch friendly, and launches through the normal
      > permission flow.

## 5.3 Lock screen [P1]
- [ ] **5.3.1 Real authentication** — wire unlock to PAM (agent verifies via
      `pam_authenticate`, rate-limited); today any 4 digits pass (`SHELL.md`).
      > **Prompt:** Replace the placeholder unlock (1.4.2) with PAM auth: the
      > agent verifies the PIN via `pam_authenticate`, rate-limits attempts,
      > and never logs the PIN. Verify wrong-PIN lockout and that the greeter/
      > PAM path matches production. Pairs with roadmap 3.3.3.
- [ ] **5.3.2 Lock-state privacy** — while locked: notifications show sender
      only if the user opted in; sensors report to the ribbon but controls
      require unlock.
      > **Prompt:** Define locked-state behavior: notification content hidden
      > unless opted in, the sensor ribbon still visible/honest, but all controls
      > (toggles, actions) require unlock. Verify no sensitive data is reachable
      > from the lock screen.

## 5.4 Multitasking [P2] (deps: 4.4.2)
- [ ] **5.4.1 App switcher** — card-style recent apps over the compositor's
      surface list; swipe up to close, which really kills the process tree
      (4.2.2).
      > **Prompt:** Build a card-style recent-apps switcher over the compositor's
      > surface list (4.4.2). Swipe-up-to-close must terminate the whole process
      > tree (4.2.2). Verify switching preserves app state and closing frees
      > memory.

## 5.5 Widgets [P3]
- [ ] **5.5.1 Home tiles as widgets** — extend the home grid schema so a tile
      can render live data (clock, battery, next event) — data via agent only,
      calm by default.
      > **Prompt:** Extend the `home.config.json` schema so a tile may render
      > live data (clock, battery, next event), sourced only through the agent.
      > Keep it calm — no animation beyond a slow refresh. Ship clock + battery
      > as the first two.

## 5.6 Quick settings [P2]
- [ ] **5.6.1 Polish the pull-down** — it exists (`SHELL.md`); add editable tile
      order and ensure every toggle round-trips real state, not optimistic UI.
      > **Prompt:** Audit the quick-settings pull-down: make every toggle reflect
      > real agent state (no optimistic UI that can lie) and add user-editable
      > tile order persisted via prefs (1.5.2). Verify a toggle that fails
      > hardware-side reverts visibly.

## 5.7 Notifications [P2] (deps: 4.8.1)
- [ ] **5.7.1 Shade + history** — pull-down shade, per-app channels,
      do-not-disturb; every notification carries its source app and is
      dismissible in bulk.
      > **Prompt:** Build the notification shade fed by the agent event channel
      > (4.8.1): grouped by source app, per-app channel mute, do-not-disturb,
      > and bulk dismiss. Every entry names its origin (app or AI). Verify
      > against real emitted notifications.

## 5.8 Gestures [P2]
- [ ] **5.8.1 Touch-first pass** — verify swipe/drag on a real digitizer at M2
      (drag-to-rearrange exists per `SHELL.md`); add edge gestures for
      back/home once 5.1.1 is decided.
      > **Prompt:** On real touch hardware (M2), verify existing drag-to-rearrange
      > and tap/scroll feel right; fix touch-target sizes and hit areas. Add
      > edge-swipe back/home once 5.1.1's model is set. Note any WPE touch-event
      > quirks.

## 5.9 Accessibility [P2]
- [ ] **5.9.1 Screen-reader + contrast audit** — ARIA roles and focus order
      through every flow; text scaling setting; keep honoring
      `prefers-reduced-motion` (already done for the Aura).
      > **Prompt:** Run a full accessibility audit (screen reader + contrast +
      > text scaling). Fix ARIA/focus gaps (with 4.14.1), add a text-size
      > setting, and confirm `prefers-reduced-motion` is honored everywhere, not
      > just the Aura. Verify against WCAG AA contrast.

## 5.10 Animations [P3]
- [ ] **5.10.1 Motion budget** — keep the FLIP-reorder / slow-aura standard:
      motion only as feedback, never decoration; write the budget into
      `auraos.css` comments.
      > **Prompt:** Write a motion budget into `shell/auraos.css`: allowed
      > durations/easings, "motion is feedback not decoration", and the
      > reduced-motion contract. Audit existing animations against it and remove
      > any decorative motion that slipped in.

## 5.11 Theming [P3]
- [ ] **5.11.1 Tokenize the palette** — the petrol/teal system in
      `auraos.css` becomes CSS custom properties; wallpaper presets stay,
      add a light variant only if it passes the calm bar.
      > **Prompt:** Convert the hard-coded petrol/teal colors in `auraos.css`
      > to CSS custom properties (design tokens). Keep the wallpaper presets.
      > Prototype a light variant and only ship it if it stays calm/minimal per
      > the user's taste (user-aesthetic-taste memory).

## 5.12 Adaptive layouts [P3]
- [ ] **5.12.1 Responsive shell** — the grid and settings pages adapt to
      landscape and larger widths via CSS; test at phone/tablet breakpoints.
      > **Prompt:** Make the home grid and settings pages responsive to landscape
      > and larger widths using CSS (no JS layout). Define breakpoints for phone/
      > tablet and verify each screen reflows cleanly; this unblocks 5.13/5.14.

## 5.13 Desktop mode [P3] (deps: 4.4.2)
- [ ] **5.13.1 Convergence experiment** — external display + keyboard: shell as
      a panel, apps as floating surfaces; prototype only after multitasking
      lands.
      > **Prompt:** After multitasking (4.4.2) lands, prototype desktop mode:
      > external display + keyboard, shell as a panel, apps as floating windows.
      > Keep it an experiment behind a flag; report feasibility and effort.
- [ ] **5.14 Tablet & foldable support [P3]**
      > **Prompt:** No target hardware exists — do not build tablet/foldable
      > features. Only ensure 5.12's breakpoints stay clean so nothing
      > structural blocks them later; revisit at P9.
