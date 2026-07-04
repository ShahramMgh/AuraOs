# Native Android Layer (Phase III — Waydroid)

AuraOS runs Android apps natively through **Waydroid** — Android in an LXC
container sharing the host kernel, rendering to Wayland. No emulation, no second
OS booting: Android processes run directly on the Pi's ARM cores.

Two design goals:

1. **Android apps are first-class citizens.** They install and launch like any
   other app — they show up in the app launcher with their own name and icon,
   open with one tap, and the user never has to know (or do anything because)
   an app is Android underneath. No "Android mode," no separate area.
2. **"There when you want it, ~0 cost when you don't."** Android is heavy; a
   naive integration would sit on hundreds of MB of RAM and burn battery
   forever. This layer is built so it doesn't.

## First-class in the launcher (how it feels native)

Waydroid writes a standard freedesktop `.desktop` launcher for every installed
Android app into `~/.local/share/applications` (named `waydroid.<pkg>.desktop`,
with the app's own `Icon=` and `Exec=waydroid app launch <pkg>`). The Aura
Shell already discovers `.desktop` apps, so Android apps flow into the **same app
list as native Linux apps**, rendered identically:

- **Same list, same look.** Android apps appear in the app drawer alongside
  native apps, with their **own icon** (served by the agent at `/api/appicon`).
  Nothing tags an app "Android."
- **One-tap launch.** Tapping an Android app calls the same launch path as any
  app. The agent recognizes it's a Waydroid app and quietly routes the launch
  through the bridge, which **starts the Android session on demand** — no
  session step the user has to think about.
- **Install → it just appears.** Installing an APK (see below) drops a launcher
  into the app list; the app shows up like any freshly-installed app.

The `Settings › Android` panel below is a *manager* (install APKs, watch the
runtime, control memory) — the everyday way you *use* Android apps is simply the
launcher, same as everything else.

```
   shell (web)  ──/api/android/*──►  aura-agent  ──►  waydroid_bridge
                                                              │
                                     waydroid session ◄───────┘  (started on
                                     (Android runtime, LXC)        demand only)
                                          confined to waydroid.slice (MemoryMax)
```

## Why it stays light

Waydroid has two halves, and only one of them is expensive:

| Half | What it is | Cost | Our policy |
|---|---|---|---|
| `waydroid-container` | the manager | tiny | enabled at boot, always up |
| `waydroid session` | the Android runtime (an LXC full of services) | hundreds of MB | **on-demand only** |

The levers, all real and all applied by `60-waydroid.sh` + `waydroid_bridge.py`:

1. **On-demand session.** The session isn't started at boot. The agent starts it
   lazily on the first app launch and records activity on every launch.
2. **Idle auto-stop.** A watcher thread stops the session after
   `AURA_WAYDROID_IDLE` seconds (default 600) with no launches. A stopped
   session costs ~0 RAM — it's handed straight back to the shell and AI engine.
3. **`persist.waydroid.suspend`.** Freezes the container whenever no Android
   window is shown, so even a briefly-backgrounded session burns ~0 CPU.
4. **`persist.waydroid.multi_windows`.** Each app is its own surface — no full
   Android homescreen/launcher running in the background.
5. **`waydroid.slice` (systemd cgroup).** `MemoryHigh` (soft) + `MemoryMax`
   (hard) + reduced `CPUWeight`/`IOWeight`, so Android can *never* starve the
   shell. Defaults suit a 4 GB Pi 5 (1536M soft / 2560M hard); override at build
   time (`WAYDROID_MEM_MAX=…`) or on device in `/etc/aura/waydroid.env`.
6. **zram.** Compressed swap so an Android memory spike compresses into RAM
   instead of OOM-killing anything.
7. **GApps-free.** Vanilla Waydroid — no Google Play Services idling in the
   background (a large, permanent RAM/CPU/network drain). Install apps directly.

## Getting apps — the in-shell App Store (F-Droid-backed)

Apps are installed by **browsing a store**, not by hunting down APK URLs. AuraOS
gives Android apps a **first-class App Store** — a real destination in the shell
(home + app drawer), not a setting buried three taps deep:

- **In-shell F-Droid catalogue.** The **App Store** app renders a browsable,
  searchable, category-filtered catalogue of free/libre Android apps *inside the
  AuraOS shell* — no need to open F-Droid's own Android UI. Tap **Install** and
  the agent resolves the app's latest APK from F-Droid and pushes it into
  Waydroid; it then appears in your launcher like any other app. Browsing is
  instant and needs no network — we ship a curated list of packages **each verified to resolve on F-Droid** (so
  the store never offers an app that can't install) and only fetch the APK on install (we deliberately don't download F-Droid's
  multi-megabyte index just to show a front page).
- **Install by package id.** The catalogue is just the front page — the App
  Store's *Install by package* field installs **any** valid F-Droid package
  (e.g. `org.videolan.vlc`), resolved live via F-Droid's per-package API. So the
  whole F-Droid repository is reachable, not only the curated set.
- **F-Droid the app** — free/libre apps, reproducible builds, no Google account —
  is still **auto-installed on the first Android session** (toggle with
  `AURA_ANDROID_FDROID=0`) for anyone who prefers its own richer UI. It's a
  normal app: it only runs when you open it, so it adds nothing to the idle
  footprint.
- **Sideload** — for an app not on F-Droid, **App Store › Sideload** (or
  **Settings › Android › Sideload**) takes an APK **file path** or **URL** and
  runs `waydroid app install`.
- Removal is `waydroid app remove`. Nothing leaves a resident process behind.

The catalogue and APK resolution live in `agent/waydroid_bridge.py`
(`FDROID_CATALOG`, `store_catalog`, `store_install`, `_fdroid_apk_url`), served
at `/api/android/store/catalog` and `/api/android/store/install`; the App Store
screen is `renderAppStore()` in `shell/js/shell.js`.

**No Play Store by default, on purpose.** The Play Store needs a GApps image —
Google Play Services running permanently, plus a Google account: exactly the
dependency this device exists to remove. If you specifically need Play Store
*content*, install **Aurora Store** (from F-Droid) — it reaches the Play catalog
anonymously, no account, no GApps. Full GApps remains a deliberate opt-out, not
the default.

## The API (agent, token-gated like everything under `/api/`)

| Route | Method | Does |
|---|---|---|
| `/api/android/status` | GET | installed? initialized? session running? memory held; idle timeout |
| `/api/android/apps` | GET | installed apps `[{name, package}]` |
| `/api/android/launch` | POST | `{package}` — lazy-starts the session, launches the app |
| `/api/android/install` | POST | `{source}` — APK path or `http(s)` URL |
| `/api/android/remove` | POST | `{package}` |
| `/api/android/session` | POST | `{action: start\|stop}` — the shell's power switch |
| `/api/android/store` | POST | `{action: install\|open}` — the F-Droid graphical store (the Android app) |
| `/api/android/store/catalog` | GET | `?q=` — the in-shell F-Droid catalogue `[{package, name, summary, category, installed}]` |
| `/api/android/store/install` | POST | `{package}` — resolve the app's latest APK on F-Droid and install it |
| `/api/android/show` | POST | present the full Android UI as one surface |

All of it degrades honestly: if Waydroid isn't installed the endpoints return
`{available:false}` and the shell shows "Android layer not installed" rather
than pretending. In the browser/VM preview (SIM mode) the panel is fully
explorable against a small set of stand-in apps.

## On-device setup (first boot)

`waydroid init` downloads the Android system image (~1 GB), needs network and
root, and can't run in a build chroot — so, exactly like the AI model pull, it
runs once on the first online boot via the `aura-waydroid-init` oneshot,
which then sets the `multi_windows` + `suspend` properties. Until it completes,
the shell shows "Setting up the Android runtime…".

**Kernel requirement:** Waydroid needs the `binder_linux` module. Ubuntu's
generic 24.04 kernels ship it; the Pi kernel (`linux-raspi`) may not, so the
build also attempts a DKMS fallback and configures `/etc/modules-load.d`. If the
Pi kernel in use lacks binder, you need a kernel with it enabled or the matching
`*-modules-dkms` + headers — this is the one genuinely hardware-dependent piece.

## How an Android app is shown once launched (honest note)

Integration is about the *app model* — install, icon, launch, manage — all of
which are native-feeling. Display is a separate concern: the Aura session is
`cage`, a kiosk compositor that shows exactly **one** fullscreen surface. So
launching an Android app hands the screen to it and returns to the shell
afterwards — which is **exactly what launching a native GUI app does** under
cage. So Android apps are still indistinguishable from native apps in behavior.
(A future multi-window compositor would let apps — native and Android alike —
share the screen; that's a separate, later piece of work and was explicitly not
part of this integration.)

## Verified vs. not-yet-verified

| Claim | Status |
|---|---|
| Agent bridge imports; `/api/android/*` route, auth-gate, and degrade gracefully when Waydroid is absent | **Verified** — real Ubuntu 24.04 arm64 container, this session |
| A Waydroid `.desktop` app is discovered in the launcher catalogue like a native app; its own icon serves via `/api/appicon` (auth-gated, traversal-guarded); launching it routes through the bridge while a native app does not | **Verified** — real Ubuntu 24.04 arm64 container, this session |
| `60-waydroid.sh` completes under `set -euo pipefail` and lays down the slice, module config, env, and first-boot init | **Verified** — real Ubuntu 24.04 arm64 container, this session |
| Shell Android panel + launcher render and drive the API (SIM + live shapes) | **Verified** — JS checks + SIM path |
| In-shell App Store: `/api/android/store/catalog` returns the catalogue (auth-gated; 401 without token), search filters it, and `/api/android/store/install` degrades honestly when Waydroid is absent | **Verified** — real agent booted on an ephemeral port, this session |
| F-Droid per-package resolution returns a real APK URL for known packages | **Verified live** against f-droid.org, this session (VLC, Organic Maps, Termux) |
| A store install actually downloads the APK and Waydroid installs it | **Not yet verified** — needs a working Waydroid session (Tier 3) |
| Launch waits for the Android session to finish booting before firing the intent (fixes apps not opening on first tap) | **Verified** — logic; needs a live session to confirm end-to-end |
| Android actually boots in Waydroid, apps run, memory strategy holds on a Pi 5 | **Not yet verified** — needs `binder_linux` + a display + real hardware (Tier 3) |

## Files

```
60-waydroid.sh              build step: install waydroid, memory slice + zram,
                            module config, first-boot init/props oneshot
agent/waydroid_bridge.py    the on-demand session + app-lifecycle bridge; the
                            F-Droid catalogue (FDROID_CATALOG), store_catalog,
                            store_install, _fdroid_apk_url
agent/aura-agent.py         /api/android/* routes incl. store/catalog + store/
                            install; .desktop discovery routes Waydroid apps to
                            the bridge; /api/appicon serves real app icons
shell/js/api.js             android* methods + SIM mirror; androidStoreCatalog/
                            androidStoreInstall; appIconUrl(); SIM catalogue
shell/js/shell.js           first-class App Store screen (renderAppStore) +
                            Settings › Apps › Android manager; launcher icons
70-aura-shell.sh            agent service ProtectHome=read-only (discover ~ apps)
```

The launcher integration touches the agent's existing `.desktop` discovery
(`scan_desktop_apps`) and launch (`launch_desktop`) paths, so it stays one code
path for native and Android apps — no parallel "Android launcher."
