# AuraOS — Waydroid bridge (Native Android Layer)
#
# One small, stdlib-only bridge that lets the shell run Android apps through
# Waydroid without letting Android eat the device. Apps reach Android only via
# the agent's /api/android/* — never a container socket directly.
#
# ── The memory model (why this is light) ─────────────────────────────────────
# Waydroid has two halves:
#   • waydroid-container  — the *manager*. Tiny. Enabled at boot, always up.
#   • waydroid session    — the actual Android runtime (an LXC full of services).
#                           This is the expensive half: hundreds of MB of RAM.
# The trick to "fluid + low memory" is to NEVER keep the session running when no
# Android app is on screen. This bridge:
#   • starts the session LAZILY, only on the first app launch;
#   • records activity on every launch;
#   • an idle watcher stops the session after AURA_WAYDROID_IDLE seconds of
#     no launches, returning that RAM to the shell and the AI engine.
# A stopped session costs ~0 RAM. Combined with the systemd MemoryMax cap and
# zram set up in 60-waydroid.sh, Android can never starve the shell.
#
# ── Privileges ───────────────────────────────────────────────────────────────
# The agent runs as the (unprivileged) session user. Session- and app-level
# waydroid commands (session start/stop, app list/launch/install/remove) run as
# that user against the root-owned container manager — so nothing here needs
# root. First-time `waydroid init` (downloads the system image, writes to
# /var/lib/waydroid) IS privileged and is done once by aura-waydroid-init
# at first boot, not from here.
import os
import shutil
import subprocess
import threading
import time
import urllib.request

# How long an idle Android session may live before we reclaim its memory.
IDLE_TIMEOUT = int(os.environ.get("AURA_WAYDROID_IDLE", "600"))  # seconds

# A GRAPHICAL app store, so apps are installed by browsing — not by pasting APK
# URLs. F-Droid (free/libre, reproducible builds, no Google account) fits the
# project's ethos and is what Waydroid itself recommends. Auto-installed on the
# first Android session unless AURA_ANDROID_FDROID=0. We deliberately do NOT
# ship the Play Store (it needs a GApps image = a Google dependency this device
# exists to avoid); Aurora Store, itself on F-Droid, is the no-account way to
# reach Play Store content for anyone who wants it.
STORE_PKG = "org.fdroid.fdroid"
STORE_NAME = "F-Droid"
STORE_APK_URL = "https://f-droid.org/F-Droid.apk"
AUTO_STORE = os.environ.get("AURA_ANDROID_FDROID", "1") not in ("0", "false", "no", "")

# Waydroid state written by `waydroid init`; its presence == "initialized".
_CFG = "/var/lib/waydroid/waydroid.cfg"
# cgroup v2 accounting for the memory slice 60-waydroid.sh confines Android to.
_SLICE_MEM = "/sys/fs/cgroup/waydroid.slice/memory.current"
_SLICE_MAX = "/sys/fs/cgroup/waydroid.slice/memory.max"


class WaydroidBridge:
    """Thin, defensive wrapper around the `waydroid` CLI.

    Every method returns a plain JSON-able dict and never raises: if Waydroid
    isn't installed, isn't initialized, or a command fails, that shows up as a
    field in the result, exactly like the rest of the agent reports live state.
    """

    def __init__(self, state_dir):
        self.state_dir = state_dir
        self._lock = threading.Lock()
        self._last_activity = 0.0        # monotonic time of the last app launch
        self._install_msg = ""           # last install/init progress line (for UI)
        self._busy = False               # a long op (init/install) is running
        self._store_attempted = False    # auto-install F-Droid once per agent run
        # short status cache so a 2s poll doesn't spawn `waydroid status` each time
        self._status_cache = (0.0, None)
        # Reclaim idle Android RAM in the background (no-op until a session runs).
        t = threading.Thread(target=self._idle_watch, daemon=True)
        t.start()

    # ── low-level helpers ────────────────────────────────────────────────────
    @staticmethod
    def _run(args, timeout=20):
        """Run a waydroid command, return (rc, stdout, stderr). Never raises."""
        try:
            p = subprocess.run(["waydroid", *args], capture_output=True,
                               text=True, timeout=timeout)
            return p.returncode, p.stdout.strip(), p.stderr.strip()
        except Exception as e:
            return 1, "", str(e)

    @staticmethod
    def available():
        """True iff the waydroid binary is installed on this device."""
        return shutil.which("waydroid") is not None

    @staticmethod
    def initialized():
        """True once `waydroid init` has laid down a system image."""
        return os.path.exists(_CFG)

    def _parse_status(self):
        """Parse `waydroid status` into a dict. Keys are lower-cased."""
        rc, out, _ = self._run(["status"], timeout=8)
        info = {}
        if rc == 0:
            for line in out.splitlines():
                if ":" in line:
                    k, _, v = line.partition(":")
                    info[k.strip().lower()] = v.strip()
        return info

    @staticmethod
    def _read_int(path):
        try:
            with open(path) as fh:
                return int(fh.read().strip())
        except Exception:
            return None

    def _memory(self):
        """Current RAM held by the Android slice, in MB (None if unknown)."""
        cur = self._read_int(_SLICE_MEM)
        mx = self._read_int(_SLICE_MAX)
        out = {}
        if cur is not None:
            out["usedMB"] = round(cur / (1024 * 1024))
        if mx is not None and mx < (1 << 62):   # "max" reads as a huge sentinel
            out["capMB"] = round(mx / (1024 * 1024))
        return out

    def _touch(self):
        self._last_activity = time.monotonic()

    # ── idle reclaimer ───────────────────────────────────────────────────────
    def _idle_watch(self):
        while True:
            time.sleep(30)
            try:
                if IDLE_TIMEOUT <= 0 or self._busy:
                    continue
                if self._last_activity <= 0:
                    continue
                if time.monotonic() - self._last_activity < IDLE_TIMEOUT:
                    continue
                st = self._parse_status()
                if st.get("session", "").upper() == "RUNNING":
                    self._run(["session", "stop"], timeout=25)
                self._last_activity = 0.0
            except Exception:
                pass

    # ── public API (mirrors /api/android/*) ──────────────────────────────────
    def status(self, ttl=2.0):
        """Everything the shell needs to render the Android panel."""
        if not self.available():
            return {"available": False, "initialized": False,
                    "reason": "Waydroid is not installed on this device."}
        now = time.monotonic()
        cached_at, cached = self._status_cache
        if cached and now - cached_at < ttl:
            return cached
        info = self._parse_status()
        session = info.get("session", "").upper()
        container = info.get("container", "").upper()
        out = {
            "available": True,
            "initialized": self.initialized(),
            "containerRunning": container == "RUNNING",
            "sessionRunning": session == "RUNNING",
            "vendor": info.get("vendor type", ""),
            "ip": info.get("ip address", ""),
            "idleTimeout": IDLE_TIMEOUT,
            "busy": self._busy,
            "message": self._install_msg,
            "memory": self._memory() if session == "RUNNING" else {},
            "store": self.store_status(),
        }
        self._status_cache = (now, out)
        return out

    def list_apps(self):
        """Installed Android apps as [{name, package}]. Empty if no session."""
        if not (self.available() and self.initialized()):
            return {"available": self.available(), "apps": []}
        rc, out, _ = self._run(["app", "list"], timeout=15)
        apps, cur = [], {}
        for line in out.splitlines():
            line = line.strip()
            if line.lower().startswith("name:"):
                cur = {"name": line.split(":", 1)[1].strip()}
            elif line.lower().startswith("packagename:"):
                cur["package"] = line.split(":", 1)[1].strip()
                if cur.get("name") and cur.get("package"):
                    apps.append(cur)
                cur = {}
        apps.sort(key=lambda a: a["name"].lower())
        return {"available": True, "apps": apps}

    def ensure_session(self):
        """Start the container/session lazily. Returns (ok, message)."""
        if not self.initialized():
            return False, "Android runtime is still being set up."
        st = self._parse_status()
        if st.get("session", "").upper() == "RUNNING":
            self._touch()
            return True, "already running"
        # `session start` blocks until Android is up; run detached so the HTTP
        # call returns promptly and the shell can poll status for readiness.
        try:
            subprocess.Popen(["waydroid", "session", "start"],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             start_new_session=True)
        except Exception as e:
            return False, f"could not start session: {e}"
        self._touch()
        self._status_cache = (0.0, None)   # force a fresh read next poll
        # First time Android runs, make a graphical app store just appear.
        if AUTO_STORE and not self._store_attempted and not self._store_installed():
            self._store_attempted = True
            threading.Thread(target=self._auto_install_store, daemon=True).start()
        return True, "starting"

    # ── graphical app store (F-Droid) ────────────────────────────────────────
    def _store_installed(self):
        """True if the store is installed. We check for its .desktop launcher
        (persists even when the session is off) rather than querying Android."""
        p = os.path.expanduser(
            "~/.local/share/applications/waydroid." + STORE_PKG + ".desktop")
        return os.path.exists(p)

    def store_status(self):
        return {"package": STORE_PKG, "name": STORE_NAME,
                "installed": self._store_installed()}

    def _auto_install_store(self):
        # wait for the freshly-started session to become usable, then install
        for _ in range(60):
            time.sleep(2)
            if self._parse_status().get("session", "").upper() == "RUNNING":
                break
        if not self._store_installed():
            self.install(STORE_APK_URL)

    def store(self, action):
        """Shell-facing store control: install the store, or open it."""
        if not self.available():
            return {"ok": False, "error": "Waydroid not installed"}
        if action == "install":
            return self.install(STORE_APK_URL)
        if action == "open":
            return self.launch(STORE_PKG)
        if action == "status":
            return {"ok": True, **self.store_status()}
        return {"ok": False, "error": "unknown action"}

    def launch(self, package):
        """Bring the session up (if needed) and launch an Android app."""
        if not self.available():
            return {"ok": False, "error": "Waydroid not installed"}
        if not package:
            return {"ok": False, "error": "no package given"}
        ok, msg = self.ensure_session()
        if not ok:
            return {"ok": False, "error": msg}
        # launch is best-effort right after start: the session may still be
        # booting, so the shell shows "opening…" and Waydroid queues the intent.
        self._run(["app", "launch", package], timeout=15)
        self._touch()
        return {"ok": True, "package": package, "session": msg}

    def install(self, source):
        """Install an APK from a local path or an http(s) URL. Cheap: it just
        pushes the package into the container — no always-on app store."""
        if not self.available():
            return {"ok": False, "error": "Waydroid not installed"}
        if not self.initialized():
            return {"ok": False, "error": "Android runtime not set up yet"}
        if self._busy:
            return {"ok": False, "error": "another operation is in progress"}
        path, tmp = source, None
        try:
            if str(source).startswith(("http://", "https://")):
                self._busy = True
                self._install_msg = "Downloading APK…"
                tmp = os.path.join(self.state_dir, "android-dl.apk")
                urllib.request.urlretrieve(source, tmp)   # noqa: S310 (user-driven)
                path = tmp
            if not os.path.isfile(path):
                return {"ok": False, "error": "APK not found"}
            self._install_msg = "Installing…"
            ok, ok2 = self.ensure_session()
            rc, out, err = self._run(["app", "install", path], timeout=120)
            self._install_msg = "" if rc == 0 else (err or "install failed")
            self._touch()
            return {"ok": rc == 0, "error": None if rc == 0 else (err or out)}
        except Exception as e:
            return {"ok": False, "error": str(e)}
        finally:
            self._busy = False
            if tmp and os.path.exists(tmp):
                try:
                    os.remove(tmp)
                except OSError:
                    pass

    def remove(self, package):
        if not (self.available() and package):
            return {"ok": False, "error": "bad request"}
        rc, out, err = self._run(["app", "remove", package], timeout=30)
        return {"ok": rc == 0, "error": None if rc == 0 else (err or out)}

    def session(self, action):
        """Explicit session control (the shell's power switch)."""
        if not self.available():
            return {"ok": False, "error": "Waydroid not installed"}
        if action == "start":
            ok, msg = self.ensure_session()
            return {"ok": ok, "message": msg}
        if action == "stop":
            rc, _, err = self._run(["session", "stop"], timeout=25)
            self._last_activity = 0.0
            self._status_cache = (0.0, None)
            return {"ok": rc == 0, "error": None if rc == 0 else err}
        return {"ok": False, "error": "unknown action"}

    def show_full_ui(self):
        """Present the Android UI as a fullscreen surface (the display handoff).
        Under cage's one-surface model this is how Android is shown today; the
        multi-window compositor path is the same open item as native GUI apps."""
        if not self.available():
            return {"ok": False, "error": "Waydroid not installed"}
        ok, msg = self.ensure_session()
        if not ok:
            return {"ok": False, "error": msg}
        try:
            subprocess.Popen(["waydroid", "show-full-ui"],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             start_new_session=True)
        except Exception as e:
            return {"ok": False, "error": str(e)}
        self._touch()
        return {"ok": True}
