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
app drawer ("All apps"). **Long-press (or right-click) any drawer icon** for
its menu: Open, **Add to home / Remove from home**, and — for Android apps,
the only kind that can be — **Uninstall** (built-ins say "Built-in" instead).
The only motion is a slow background aura, which honours
`prefers-reduced-motion`.

**Home pages are fixed canvases, never a scroll.** A page holds exactly the
rows that fit the screen; when it fills (or a widget grows and pushes icons
past the last row), the overflow **flows onto the next page — creating one if
none exists** — page by page, like a physical stack of trays. The first-run
default layout spreads the catalog across pages the same way, and a
rotation/resize re-lays the pages to the new row count.

**Recents** (the helm's right button, or the orb's radial menu) is a real task
switcher: every backgrounded session is a swipeable card carrying a **miniature
of the app's actual last screen** — a sanitized snapshot of its own DOM, taken
as it leaves the foreground (ids stripped, iframes neutralized, fully inert; no
screenshots, nothing rendered off-device). **Tap a card to bring that session
back** exactly where you left it (the foreground app resumes its live DOM; a
torn-down one relaunches through the normal permission flow), the **×** ends it
for real — sensors released, DOM dropped — and *Clear all* sweeps the deck. A
card whose app holds a sensor wears the sensor's pulsing dot and says so in
its footer, so the switcher tells the same honest story as the Aura.

**Personalize** (Settings › Personalize) makes it yours, per-device and offline.
It is a **hub of sub-pages** — Appearance, Wallpaper, Ambience, Weather,
Clock &amp; widgets, Icons, Apps &amp; pages — each row showing the current choice at
a glance. Across them:
a **wallpaper** picker (nine gradient presets, or any photo from `~/Pictures`),
a **color theme**, **live effects** (aurora / starfield / drift / rainfall /
fireflies / match-the-sky / off, with a motion level), **menus &amp; surfaces**
(a **light/dark menu theme** — home, lock and recents keep the night look so
their text stays right on the wallpaper; a **surface glass level**: frosted /
glass / solid, solid being fully opaque for maximum legibility; and an
adjustable **wallpaper-contrast** fill, 0–70% dark, layered between the
wallpaper and the content of home &amp; lock so text and icons stay visible on a
light image), a **home clock widget** (six styles,
continuous size — drag its corner handle while editing home, or pick a preset
here (sized with `zoom`, not `transform`, so it actually reserves the layout
space it needs — the date, status pill and everything below reflow around it
automatically as it grows, instead of being covered) — plus left/center/right
alignment, **home widgets** (an **Up next** card showing the next real calendar
event — hidden when nothing is scheduled, never faked), an **icon pack** (squircle /
round / sharp shapes, labels on or off), a **home focus** chooser (which app is
the hero card), and **home pages** — assign each app to one of several
swipeable pages (Android/iOS style) or take it off home.
On the home screen you **swipe between pages** (dots track your position) and
**drag tiles to rearrange them** — a tap still launches, a long-press flows
directly into a drag on the very same gesture (no lift-and-press-again). The
tile you're holding moves **freely with your finger** — it's lifted out of the
grid (`position: fixed`, real screen pixels) for the duration of the drag, so
reordering the *other* tiles underneath it (which still settle with a smooth
FLIP animation) never makes the one you're holding jump or snap; it lands in
its new slot with its own small flight animation the instant you let go.
**Drag a tile to
the screen edge** and the pager glides to the next page to drop it there — at
the very first or very last page, holding on the edge **spins up a new page**
to receive it, pruned automatically if you back off without dropping anything.
These are stored as device-local prefs (`localStorage`); when the AI Engine
proposes a layout in Phase II, the user's own choice wins.

**One positioning system, no overlap — ever.** Each home page is a fixed-slot
grid (3 columns × rows spanning the full page height, top to bottom). Icons
occupy one cell each; **widgets — the clock hero, the focus card, Up next —
live in the same grid** as full-width blocks anchored to an explicit row, so
in edit mode a widget drags vertically and **snaps to a row** exactly like an
icon snaps to a cell, anywhere from the first row to the last. Overlap is
structurally impossible: widget-covered cells are *blocked* for icons, a
repair pass relocates any icon that would collide (say, after the clock grows
a row — its span follows its size), a tile dropped onto a widget snaps to the
nearest free cell, and two widgets contesting a row are pushed apart with the
one you just moved winning the spot. The search pill sits at the foot of home,
so the grid genuinely starts at the top of the screen.

**Live services** (Personalize, off by default — the toggle is the plain-language
consent, and all egress goes through the agent, never straight from the shell):
**Daily wallpaper** fetches Bing's image of the day (free, keyless) once per
day — the agent caches it on disk (`/api/wallpaper/daily` meta +
`/api/wallpaper/image` bytes) and it dresses home *and* the lock screen; the
request carries no parameters at all, and Personalize shows the image's title
and attribution. A **gallery page** (Personalize › Wallpaper › Gallery) lists
the recent images of the day (`/api/wallpaper/list`, thumbnails proxied and
cached by the agent; the image route accepts only strictly-validated Bing ids,
never arbitrary URLs): *Today* follows the daily rotation (the default), any
other pick is **pinned** until changed. **Live weather** shows current conditions on home and lock
from **Open-Meteo** (free, keyless, open-source data): you type a **city**
(`/api/geocode`) and only its coordinates are stored, on-device — **GPS is
never consulted**; readings (`/api/weather`) are cached 15 minutes agent-side.
The **"Match the sky"** live effect maps the WMO weather code onto the ambient
layer — rain and showers rain, snow snows, thunderstorms flash, clear nights
go starfield — and falls back to a calm aurora when there's no reading (never
a guess). Turn either toggle off and the shell stops asking; nothing fetches
in the background. In SIM, weather answers with clearly-simulated canned data
and the daily wallpaper says plainly that it needs the agent.

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
command output and exit behavior (`bash: …: command not found`), history,
`clear`, **Tab completion** (command names at the start of the line, files and
directories after — one match completes, several print, bash-style, via a
throwaway `compgen` over the same `/api/exec` route), and a **stoppable
foreground command**: while something runs, a `stop` button sits in the busy
row (Ctrl+C works too — and Ctrl+C on a half-typed line abandons it with the
classic `^C`). Stop is a real interrupt: `/api/exec/cancel` SIGINTs the
command's whole process group, escalating to SIGKILL if it won't die; the
command's partial output lands in the scrollback with `^C` appended. Commands
may run up to 120 s before the agent times them out — long enough for real
package installs now that a runaway one can be stopped.

**Live bricks** bring real desktop-style multitasking into the phone shell:
floating mini-app windows that sit **always on top of home**, independent of
whatever else you're doing there — the rest of home keeps working normally
underneath them (tap a tile, it still launches). The controls live **on the
windows themselves, not in settings**: every app screen carries desktop-style
window buttons in its header — **– minimize** (drop to home) and, where the
app has a floating mini version, **❐ restore-down** (pop it out as a live
brick over home). Each brick is a real window: a title bar with
**minimize / maximize·restore / close**, draggable, resizable, and
**snappable** — drag the header and release over a zone (halves, quadrants,
full; a ghost previews the landing, corner pads fade in as drop hints) and
the window docks there and holds that spot; drag it again to pop free.
Minimized windows park as title pills along the bottom edge.

**Any app can float.** Apps that open in the app frame (Browser, Camera,
Maps, Photos, Messages, Contacts, Phone, Android apps…) float generically:
the window hosts the app's **real view** — the same render the full-screen
frame uses. One-instance rule: an app's view exists exactly once, so floating
tears the full-screen frame down (its close handler runs) and opening the app
full-screen closes its floating window. Six apps additionally have curated
compact minis, each real data or an honest absence:
- **Terminal** — **the same running session** as the full-screen Terminal
  app, not a copy: type a command in one, see it in the other, because it's
  one real shell, two windows onto it (plus A−/A+ text sizing). The **+**
  button in any terminal window spawns **another, independent shell session**
  in its own window (own scrollback, cwd and history, running concurrently;
  up to four) — closing an extra terminal ends that session for real.
- **Calculator** — the same pad and state as the full app; both can be open
  at once, two faces of one calculation, and the keyboard reaches either.
- **Files** — a compact browser over the real filesystem, with its own
  working folder; tapping a file hands over to the full Files app there.
- **Monitor** — live CPU, memory and uptime from `/api/system`.
- **Scratchpad** — a quick note, autosaved into the real Notes store.
- **Music** — a mini player over `~/Music`; the track keeps playing when the
  window hides, and it and the full Music app pause each other.

Scope today is intentionally home-only: bricks hide while an app is open,
another screen is showing, or the device is locked, and reappear on return.
Full concurrent multi-app "live tiles" — several apps running visibly at
once, each independently, anywhere — is the fuller vision this is a step
toward; see `DEVELOPMENT.md` §3.4.2 for that larger windowing milestone.

**Native apps that open *inside* the shell.** Alongside Files, Terminal, Settings,
System Monitor and the Assistant, the shell has its own **Clock** (live time,
world clocks, **stopwatch** and a **countdown timer** that keeps running and rings
a notification even after you leave the app), **Notes** (plain-text notes persisted
as real files under the state dir via `/api/notes`), and a real **Calculator**
(hand-evaluated arithmetic — never `eval` — with `± % ÷ ×` and full physical-keyboard
input). These render as full screens in the shell, not external windows.

**The lock screen's passcode pad is its own dismissible sheet**, iOS-style, not
a fixture bolted to the bottom of the screen: the clock, date and notifications
have the screen to themselves until you tap "Swipe up to unlock," at which
point the keypad slides up over a dimming scrim. A drag on its grip, or a tap
on the scrim, slides it back down; a correct code gets a beat of green success
before it dismisses itself and the device unlocks.

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

**Widgets are doors to their own settings** (the iOS pattern): tapping the home
clock opens Personalize › Clock & widgets, the weather reading opens
Personalize › Weather, the date opens the Calendar, and long-pressing a
quick-settings tile jumps to its full settings page (DND → Notifications,
Night Light → Ambience, VPN → Network, …). In home edit mode these taps stay
drag/resize gestures. Settings also has a **Notifications** page (Do Not
Disturb, show-content-on-lock, clear history) and the app drawer is an **app
library**: category chips (All · Essentials · Media · Tools · System ·
Installed) over alphabetized shelves.

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
- **No on-screen keyboard under the cage kiosk.** `cage` is a strict single-app
  kiosk compositor — it exposes neither `layer-shell` (so an OSK can't paint over
  the app) nor `input-method` (so it can't know a text field is focused). A
  touch-only device therefore has no way to type. Fixing it means either an
  in-shell (web) keyboard or moving to a compositor that supports those
  protocols — this is the open item behind the web-vs-native shell decision.
- **Shell engine is epiphany (a browser), not the intended WPE `cog`.** Ubuntu
  dropped WPE after 22.04, so on 24.04 the shell renders in epiphany's
  `--application-mode` (chromeless, but still a browser engine). It boots and
  renders on real Pi 5 hardware (2026-07-14), but the "web-tech shell" nature is
  a live design question — a native shell is under consideration.
