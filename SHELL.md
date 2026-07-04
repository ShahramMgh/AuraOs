# Aura Shell v1.0

The user interface for AuraOS. A real, bootable shell — not a mockup — that
runs fullscreen as the device's session and can be tried in a browser, run in a
VM, or booted on a Raspberry Pi.

---

## Design philosophy

**Familiar where familiarity helps, distinct where it protects you.**

We don't reinvent the phone. People genuinely like a real app grid, a dock of
favorites, pull-down quick settings, and a clock-forward home screen — so the
shell keeps all of those, in its own visual language. We diverge from the norm
only where divergence actually serves the person holding the device: the parts
that make this OS *aura*.

| Kept, because it works | Made our own, because it protects you |
|---|---|
| App grid ("icon brick") + dock of favorites | **Insight margin** — a slim edge **handle** (left or right, your choice) that expands on a tap into "paper-divider" tabs (Access · Resources · Network · Privacy), scoped to whatever app you're in, with per-app permission toggles one tap away |
| Pull-down quick settings, brightness/volume sliders | **Sensor guards** — kill mic, camera, or location for *every* app instantly |
| Clock + greeting home, searchable app drawer | **Permissions** — per-app Allow / Ask / Deny, set once, changeable anytime |
| Familiar unlock keypad | **Network** — every connection an app makes, in the open, blockable |
| — | **Vault** — encrypted storage status you can see and lock |

Catalog apps open **inside the phone** (a real in-shell iframe browser, the
live webcam for Camera, an OpenStreetMap embed for Maps, a working music player
and dialer, etc.) — never a desktop app on the host — so the simulator is a
faithful device experience.

The "ask once per app" permission prompt is the heart of it: the first time an
app wants a sensor, you decide (Allow / Only this time / Don't allow), the choice
is remembered, and a colored dot stays on screen the entire time that sensor is
in use.

Visual identity: deep petrol palette, a single teal signal accent, low corner
radii, and monospace for "system truth" (times, hosts, encryption ciphers).

### The home: the Aura

At the top of the home screen lives **the Aura** — the resident intelligence
given a body. It's a soft being of light (`shell/js/aura.js`, pure canvas) that
breathes, gazes toward your touch, and **blooms when you tap it** (which opens
the Assistant — the Aura is its presence). Below it: the clock, and a living
**status line**.

The Aura is where privacy becomes *felt*, not read. While private it glows a calm
teal — *"Private · the Aura is watching over you."* The instant any app touches
your **microphone, camera or location** — even in the background — the Aura shifts
to that sensor's colour and pulses, the status line names what's active, and the
Insight margin's **Access** tab lights and offers a one-tap toggle to cut it off.
The whole device reacts as one being. A
backgrounded app keeps holding its sensors (that's when the indicator matters
most); they release only when the app is closed, cut off, or its permission
revoked. The loop pauses whenever home isn't on screen and honours
`prefers-reduced-motion`.

Beneath the Aura is a calm, modern launcher: an optional glass **focus card** for
a suggested app, and a clean grid of glass app tiles — quiet by design, no lines,
no jitter.

Crucially, the arrangement is **data, not hardcode**. Which app is the focus,
which apps are featured, and their order all come from a config file,
**`shell/home.config.json`**:

```jsonc
{ "focus": "assistant",
  "focusTag": null,                       // optional custom hero subtitle
  "nodes": [ { "app": "assistant" }, { "app": "phone" }, … ] }
```

Today that file is a hand-authored default. In **Phase II the AI Engine rewrites
it** — choosing the focus and the ordering from time of day and learned routine
(AI-MANIFEST P13, "intrinsic interface"). The home renderer only *draws* a
config; it decides nothing on its own, reaches no sensor or model, and tapping a
tile (or the focus card) runs the shell's normal launch + permission flow
untouched. The Insight margin sits as a small handle on your chosen edge in every
context — home *and* inside any app — expanding only when tapped, so it never
crowds the screen; a tap away collapses it. The
full **A–Z icon grid is one tap away** in the
app drawer ("All apps"). The only motion is a slow background aura, which honours
`prefers-reduced-motion`.

**Personalize** (Settings › Personalize) makes it yours, per-device and offline:
a **wallpaper** picker (soft gradient presets), a **home focus** chooser (which
app is the hero card), and **home pages** — assign each app to one of several
swipeable pages (Android/iOS style) or take it off home. On the home screen you
**swipe between pages** (dots track your position) and **drag tiles to rearrange
them** — a tap still launches, a drag reorders (smooth FLIP) and it all persists. These
are stored as device-local prefs (`localStorage`); when the AI Engine proposes a
layout in Phase II, the user's own choice wins.

---

## How it boots (the real stack)

```
        ┌─────────────────────── Raspberry Pi 5 / VM ───────────────────────┐
        │                                                                    │
  lightdm ─auto-login→ cage (Wayland kiosk compositor)                       │
                          └─► web engine (WPE cog / WebKitGTK, fullscreen)    │
                                └─► loads http://127.0.0.1:8787/  ── the shell│
                                          ▲                                   │
                          aura-agent (Python, stdlib) ──────────────────┘
                          serves shell/ + real device API (battery, Wi-Fi,
                          brightness, app launch, permission + network stores)
```

- **cage** owns the display and runs exactly one app fullscreen — no desktop, no
  window chrome. This is how appliance UIs are built; it's a real session, not a
  browser tab.
- **The web engine** renders the shell fullscreen. WPE-WebKit's **cog** is the
  lightweight, chromeless kiosk browser we prefer — but Ubuntu dropped the WPE
  stack after 22.04, and the Pi 5 needs 24.04+. So on 24.04+ the engine is
  **WebKitGTK** (`epiphany`); the launcher still prefers `cog` (or `chromium
  --kiosk`) when either is present. See `70-aura-shell.sh`.
- **aura-agent** is the bridge between the web UI and the real system. It
  reads `/sys` for battery/backlight, drives `nmcli`/`rfkill` for radios,
  launches apps, and owns the on-disk permission store and network log. Pure
  Python standard library — nothing to install on the minimal Ubuntu base. Binds
  to `127.0.0.1` only.

If the agent isn't reachable (you just opened `index.html` in a browser), the
shell falls back to a faithful **simulation** so every screen and flow is fully
explorable. Same code, same data contract — the shell auto-detects which mode
it's in (watch the `SIM` / `LIVE` badge, top-right).

---

## Try it

**In a browser (any machine — design review, quickest):**
```bash
./try-shell.sh              # starts the agent, opens the shell in your browser
```
or with no agent at all, pure simulation:
```bash
cd shell && python3 -m http.server 8080   # then open http://localhost:8080/
```

**As the real kiosk session (Ubuntu desktop or VM — closest to the device):**
```bash
sudo apt install cage cog             # Ubuntu 22.04 (WPE cog available)
sudo apt install cage epiphany-browser # Ubuntu 24.04+ (WPE gone → WebKitGTK)
./try-shell.sh --kiosk                 # launches the full cage kiosk session
```
(Linux only — `--kiosk` needs a Wayland seat, so not macOS/Windows.)

**On a Raspberry Pi 5:** it's already the default session — the build pipeline
installs it (`70-aura-shell.sh`) and lightdm auto-logs into it. See
`TESTING-AND-DEPLOYMENT.md`.

Unlock PIN in simulation/first boot: any 4 digits.

---

## Files

```
shell/
  index.html          entry point
  auraos.css       the whole design system + every screen's styling
  home.config.json    home layout (focus + featured apps / order) —
                      AI-authored in Phase II, hand-authored default for now
  js/
    icons.js          geometric line-icon set (inline SVG)
    api.js            system bridge: live-agent client + simulation fallback
    aura.js           the Aura — the living companion (canvas) + its trust states
    shell.js          views, router, permission flow, live updates
agent/
  aura-agent.py  the localhost system-bridge service (stdlib only)
70-aura-shell.sh build step: installs cage + web engine, deploys
                      shell+agent, systemd unit, session .desktop, default
try-shell.sh          run it on this machine (browser or --kiosk)
```

---

## What's real vs. still to wire

**Real now:** the entire UI and interaction model; the agent reading real
battery, Wi-Fi (SSID/strength), Bluetooth, brightness, volume and disk-encryption
status; radio toggles and brightness/volume control via nmcli/rfkill/
brightnessctl; a persistent permission store and network log; the full
cage kiosk boot session.

**Settings & Linux integration (v1.0):** a real, multi-page **Settings** app
(reachable from the Control Center gear and the app drawer) backed by the agent:
- **About** — hostname, OS, kernel, arch, CPU, cores, uptime, timezone, memory
  (read live from `/proc`, `os.uname`, `/etc/os-release`).
- **System Monitor** — live CPU load, memory, swap and the top processes by CPU
  (`ps` + `/proc`), auto-refreshing every 2.5s.
- **Storage** — every real filesystem with usage bars (`df`).
- **Files** — a real file manager over the session user's own filesystem
  (`/api/files/*`): breadcrumb + quick-location navigation, folders-first
  listing with sizes and dates, a text/preview sheet, and create-folder /
  rename / delete, with a guard that refuses to delete protected anchor
  directories (`/`, `$HOME`). Defaults to `$HOME`; browses real paths with the
  user's own permissions — the same reach the Terminal already has. "Terminal
  here" jumps to the shell in the current folder.
- **Wi-Fi** — passive network scan and connect (with a password prompt) via
  `nmcli` (no forced rescans).
- **Display / Sound** — brightness and volume sliders.
- **Date & time** — read and set the timezone (`timedatectl`).
- **Power** — Lock / Restart / Shut down (`systemctl`), with confirmation.
- **Terminal** — a genuine Linux shell. Commands run through the agent's
  `/api/exec` as the session user; `cd` persists, output and exit codes are
  real. In the browser preview it falls back to a small built-in command
  simulator so the app is still explorable.
All of these were verified live against this machine's real `/proc`, `ps`, `df`,
`nmcli`, the real filesystem, and a shell where `cd` persists across commands.
The **Terminal** is a
faithful TTY: a `user@host:path$` prompt, inline input in the scrollback, real
command output and exit behavior (`bash: …: command not found`), history, and
`clear` — it runs commands through the agent as the session user.

**Native apps that open *inside* the shell.** Alongside Files, Terminal, Settings,
System Monitor and the Assistant, the shell has its own **Clock** (live time,
world clocks, **stopwatch** and a **countdown timer** that keeps running and rings
a notification even after you leave the app), **Notes** (plain-text notes persisted
as real files under the state dir via `/api/notes`), and a real **Calculator**
(hand-evaluated arithmetic — never `eval` — with `± % ÷ ×` and full physical-keyboard
input). These render as full screens in the shell, not external windows.

**Notifications — a real system service.** A pull-down **notification shade** sits
at the top of the Control Center: every entry names its **source app**, is
individually dismissible or cleared in bulk, and shows an unseen **count** on the
status pane. **Do Not Disturb** is one tap. On the **lock screen** notifications
appear but their **content is hidden until you unlock** (opt in to show it) — the
aura default. The service lives in the bridge (`shell/js/api.js`
`Sov.notify`, persisted per-device so the list survives a reload); today the shell
is the only producer (Wi-Fi connected, a blocked host, low battery, a finished
timer), and the same `push()` is what the agent event channel (roadmap 4.8.1) will
call when it lands. *Honest limit:* notifications are shell-generated for now, not
yet fed by system-wide events.

**Spotlight search.** The app drawer's search is a launcher for the whole OS: one
field spans native apps, installed Ubuntu apps, **Settings pages**, and **quick
actions** (Lock device, Toggle Wi-Fi, Do Not Disturb, New note), each launching
through the shell's normal navigation and permission flow.

**Real Ubuntu apps live in the OS — capability registry.** The agent discovers
what's actually installed by scanning freedesktop `.desktop` files
(system + Flatpak + Snap) and exposes them, plus the system functions it offers,
at **`/api/capabilities`**. The app drawer surfaces these under *"Installed on
Ubuntu"* and launches them for real (`gtk-launch`/`gio`, else the parsed `Exec`).
Verified live on this machine: 51 real apps discovered (GNOME Software, Text
Editor, Disks, LibreOffice, …) and launched through the agent. The same registry
is what the **AI Engine** reads so newly-installed apps and new functions are
picked up with no code change (Phase II tool-use). *Honest limit:* an external
GUI app launches as a real process, but in the cage appliance model it can't
be embedded *inside* the web-shell until the shell does its own window management
(roadmap) — native apps (Clock, Notes, Files, Terminal, …) do render inside.

**Local AI (Phase II).** The OS ships a light default model — **`llama3.2:1b`**
(~1.3 GB, runs on a Pi 5) — pulled automatically on first online boot by
`80-ai-engine.sh`, with Ollama bound to loopback only. The AI Engine stays
**off by default** (enable it in Settings › Intelligence). To try the Assistant
for real on this laptop:

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2:1b
```
…then restart the agent; it detects the model and runs inference fully on-device.
The assistant **streams** its replies token-by-token and is **situation-aware**
(it perceives battery / connectivity / time from the agent's local readers).

**The assistant can act, and it composes plans (tool-use, un-hardcoded).** Ask it
to *do* something — "set brightness to 30", "turn on Bluetooth" — or something
open-ended — "I want to sleep" — and the local model reasons over **one capability
catalog** (`agent/ai_engine.py` `CAPABILITIES`) and proposes a **plan** of one or
several steps ("silence the phone · dim the screen · play calm music"). There is
no keyword gate and no intent→action mapping: adding a capability (or installing
an app) makes the resident able to use it with no code change. Done the Aura
way: the plan is a **request**, not an act. At trust < 3 you approve it
step-by-step on a **plan card** (drop any step you don't want); at trust 3 trusted
steps auto-run. Every step is **logged** to the AI activity trail, and one *Undo*
reverts the whole plan. Reliability scales with model size (swappable, P5).

**The resident learns and gently suggests.** While intelligence is on, the Aura
**observes** what you actually do — which apps you open, the toggles and levels
you set — with the time of day, mines recurring **routines** on-device, and may
surface **one** calm suggestion on the home screen at the moment you tend to act
("You often do this around 23:06 — play Music?"). Accepting runs it through the
normal consent path; dismissing snoozes it for the day. Observation is local and
only while AI is on; every episode and routine is inspectable and deletable.
*Honest limit:* the episode log is not yet encrypted into the Vault (roadmap M5),
and the loop is verified in sim + a local live run, not yet on hardware.

**Honest rough edges for v1.1:**
- Launching external GUI apps runs them via the agent; a system service doesn't
  share the session's Wayland/D-Bus, so GUI launch is best-effort until the shell
  does its own window management (CLI/daemon apps like Syncthing launch fine).
- The Insight margin's Access tab is driven by the shell's own launch flow today;
  wiring it to `xdg-desktop-portal` so it reflects *any* process's sensor access
  (roadmap item 4 in `ARCHITECTURE.md`) is the next step to make it airtight.
- PIN unlock is delegated to the greeter/PAM in production; the agent endpoint is
  a placeholder that should be wired to real auth before shipping.
