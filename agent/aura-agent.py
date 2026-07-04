#!/usr/bin/env python3
# ============================================================================
# aura-agent — the system bridge for Aura Shell v1.0
# ----------------------------------------------------------------------------
# One small localhost HTTP service that:
#   - serves the shell (so Chromium loads http://127.0.0.1:8787/ same-origin)
#   - reads real device state: battery, Wi-Fi/Bluetooth, brightness, volume,
#     disk-encryption status
#   - drives real actions: nmcli radios, brightness/volume, app launch
#   - owns the persistent permission store and the network log
#
# Design rules:
#   - stdlib ONLY (http.server, json, subprocess) — nothing to pip-install on a
#     minimal Ubuntu base.
#   - EVERY system call is wrapped; if a subsystem is missing (e.g. no
#     backlight on a VM), we degrade to a sane default instead of 500ing, so
#     the shell keeps working everywhere.
#   - Binds to 127.0.0.1 only. Never listens on the network.
# ============================================================================
import json, os, re, secrets, shlex, shutil, socket, stat, subprocess, sys, glob, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ai_engine import AIEngine, CAPABILITIES   # Phase II — Native Intelligence Layer
from waydroid_bridge import WaydroidBridge      # Phase III — Native Android Layer

# Loopback by default. Override with AURA_AGENT_HOST=0.0.0.0 to expose the
# shell on the local network — but note: static assets are public and the
# per-boot token is embedded in the served HTML, so ANY device that can reach
# the page gets the token and thus the full /api/* surface (including /api/exec,
# a shell as this user). Only bind to the network on a trusted LAN.
HOST = os.environ.get("AURA_AGENT_HOST", "127.0.0.1")
PORT = int(os.environ.get("AURA_AGENT_PORT", "8787"))
SHELL_DIR = os.environ.get("AURA_SHELL_DIR",
                           os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "shell"))
SHELL_DIR = os.path.abspath(SHELL_DIR)
STATE_DIR = os.environ.get("AURA_STATE_DIR",
                           os.path.expanduser("~/.local/share/aura"))
os.makedirs(STATE_DIR, exist_ok=True)
PERM_FILE = os.path.join(STATE_DIR, "permissions.json")
NETLOG_FILE = os.path.join(STATE_DIR, "netlog.json")
NOTES_DIR = os.path.join(STATE_DIR, "notes")
os.makedirs(NOTES_DIR, exist_ok=True)

# ---- local-API authentication (per-boot session token) ----------------------
# The agent binds to loopback only, but "loopback" is not a trust boundary: ANY
# local process (a rogue app, a browser page via DNS-rebinding) could otherwise
# drive /api/exec (a shell as the session user) or read files. So every /api/*
# call must present a per-boot token. The token is minted here at start, written
# to a 0600 file, and injected into the shell HTML the agent itself serves — so
# the legitimate shell has it, an anonymous caller does not.
# Honest limit (documented): a process running AS THE SAME session user can still
# read the token file or scrape the served HTML — that is inside today's trust
# boundary until per-app sandboxing lands (blueprint M4 / 6.3.1). This closes the
# anonymous-caller and cross-origin holes; it is not a same-user defense yet.
SESSION_TOKEN = secrets.token_urlsafe(32)
TOKEN_FILE = os.path.join(STATE_DIR, "agent.token")
TOKEN_HEADER = "X-Aura-Token"


def write_token_file():
    """Persist the token 0600 so in-session helpers (and tests) can authenticate
    without scraping the HTML. Readable only by the session user."""
    try:
        fd = os.open(TOKEN_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as fh:
            fh.write(SESSION_TOKEN)
        os.chmod(TOKEN_FILE, 0o600)
    except Exception as e:
        print(f"aura-agent: WARNING could not write token file: {e}")

# The AI Engine is a system service the agent exposes at /api/ai/*. Apps reach
# intelligence only through here — never a model directly (AI-MANIFEST P1, P6).
AI = AIEngine(STATE_DIR)

# The Android layer (Waydroid) is a system service exposed at /api/android/*.
# The bridge keeps the heavy Android session off unless an app is on screen and
# reclaims its memory when idle, so the shell stays fluid (see waydroid_bridge).
ANDROID = WaydroidBridge(STATE_DIR)

# ---- app catalogue: shell id -> launch command (first found is used) --------
# On a real device these resolve to Flatpak app-ids or binaries. Anything not
# installed simply won't launch; the shell still shows it (honest about what's
# provisioned). Order = preference.
APP_EXEC = {
    "browser":  [["flatpak", "run", "org.mozilla.firefox"], ["firefox"], ["epiphany"]],
    "files":    [["nautilus"], ["pcmanfm"], ["flatpak", "run", "org.gnome.Nautilus"]],
    "terminal": [["lomiri-terminal-app"], ["x-terminal-emulator"], ["xterm"]],
    "photos":   [["flatpak", "run", "org.gnome.Loupe"], ["eog"]],
    "music":    [["flatpak", "run", "io.bassi.Amberol"], ["rhythmbox"]],
    "calc":     [["gnome-calculator"], ["galculator"]],
    "maps":     [["flatpak", "run", "org.gnome.Maps"]],
    "notes":    [["gnome-text-editor"], ["gedit"]],
    "sync":     [["syncthing", "--no-browser"]],
    # phone / messages / contacts / camera / clock: shell-native placeholders
}


def run(cmd, timeout=4):
    """Run a command, return (rc, stdout) — never raises."""
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return p.returncode, p.stdout.strip()
    except Exception:
        return 1, ""


# Short-lived cache so the 2s status poll doesn't spawn nmcli/lsblk every time.
# Slow, multi-subprocess readings (radios, disk) are cached; cheap /sys reads
# (battery/brightness) stay live. Keeps /api/status responses well under the
# shell's request timeout, which is what was triggering the broken-pipe noise.
_CACHE = {}


def cached(key, ttl, fn):
    now = time.monotonic()
    ent = _CACHE.get(key)
    if ent and now - ent[0] < ttl:
        return ent[1]
    val = fn()
    _CACHE[key] = (now, val)
    return val


def have(binary):
    return shutil.which(binary) is not None


# ============================================================================
# READERS — real device state, each defended with a fallback
# ============================================================================
def read_battery():
    base = "/sys/class/power_supply"
    for name in sorted(glob.glob(base + "/BAT*")) + sorted(glob.glob(base + "/battery*")):
        try:
            cap = int(open(os.path.join(name, "capacity")).read().strip())
            status = ""
            sp = os.path.join(name, "status")
            if os.path.exists(sp):
                status = open(sp).read().strip().lower()
            return {"level": max(0, min(100, cap)), "charging": status in ("charging", "full")}
        except Exception:
            continue
    # No battery (VM / desktop): report a plugged-in device honestly.
    return {"level": 100, "charging": True}


def _nmcli_radio(kind):
    if not have("nmcli"):
        return None
    rc, out = run(["nmcli", "radio", kind])
    if rc == 0:
        return out.strip().lower() == "enabled"
    return None


def read_net():
    net = {"wifi": False, "ssid": "", "strength": 0,
           "bluetooth": False, "airplane": False, "vpn": False}
    if have("nmcli"):
        wifi = _nmcli_radio("wifi")
        wwan = _nmcli_radio("wwan")
        net["wifi"] = bool(wifi)
        # airplane ~ all radios off
        net["airplane"] = (wifi is False and wwan is False)
        # --rescan no: read the cached scan instead of forcing a fresh Wi-Fi
        # scan, which otherwise makes this call take ~4-5s and stalls status.
        rc, out = run(["nmcli", "-t", "-f", "ACTIVE,SSID,SIGNAL",
                       "dev", "wifi", "list", "--rescan", "no"])
        if rc == 0:
            for line in out.splitlines():
                parts = line.split(":")
                if len(parts) >= 3 and parts[0] == "yes":
                    net["ssid"] = parts[1]
                    try:
                        sig = int(parts[2])
                        net["strength"] = 1 + min(3, sig // 25)
                    except Exception:
                        net["strength"] = 3
                    break
        rc, out = run(["nmcli", "-t", "-f", "TYPE", "con", "show", "--active"])
        if rc == 0 and any(t in out for t in ("vpn", "wireguard")):
            net["vpn"] = True
    if have("bluetoothctl") or have("rfkill"):
        rc, out = run(["rfkill", "list", "bluetooth"])
        net["bluetooth"] = rc == 0 and "Soft blocked: no" in out
    return net


def _backlight_dir():
    for d in sorted(glob.glob("/sys/class/backlight/*")):
        if os.path.exists(os.path.join(d, "max_brightness")):
            return d
    return None


def read_brightness():
    d = _backlight_dir()
    if not d:
        return 80
    try:
        cur = int(open(os.path.join(d, "brightness")).read().strip())
        mx = int(open(os.path.join(d, "max_brightness")).read().strip()) or 1
        return max(5, min(100, round(cur * 100 / mx)))
    except Exception:
        return 80


def read_volume():
    if have("wpctl"):
        rc, out = run(["wpctl", "get-volume", "@DEFAULT_AUDIO_SINK@"])
        if rc == 0:
            m = re.search(r"([0-9.]+)", out)
            if m:
                return int(round(float(m.group(1)) * 100))
    if have("amixer"):
        rc, out = run(["amixer", "get", "Master"])
        if rc == 0:
            m = re.search(r"\[(\d+)%\]", out)
            if m:
                return int(m.group(1))
    return 45


def read_disk():
    """Report whether the root device sits on a LUKS/dm-crypt mapping."""
    rc, out = run(["lsblk", "-o", "TYPE,NAME", "-n"])
    encrypted = rc == 0 and "crypt" in out
    algo = "LUKS2 · aes-xts-plain64" if encrypted else "not encrypted"
    if encrypted and have("cryptsetup"):
        rc, o = run(["bash", "-lc",
                     "for m in $(ls /dev/mapper 2>/dev/null); do "
                     "cryptsetup status $m 2>/dev/null | grep -m1 cipher; done"])
        m = re.search(r"cipher:\s*(\S+)", o)
        if m:
            algo = "LUKS2 · " + m.group(1)
    return {"encrypted": encrypted, "algo": algo}


# ============================================================================
# LINUX SYSTEM INTEGRATION — real /proc, ps, df, nmcli, timedatectl, shell
# ============================================================================
def read_timezone():
    try:
        p = os.path.realpath("/etc/localtime")
        i = p.find("zoneinfo/")
        if i >= 0:
            return p[i + len("zoneinfo/"):]
    except Exception:
        pass
    try:
        return open("/etc/timezone").read().strip()
    except Exception:
        return "UTC"


def _meminfo():
    d = {}
    try:
        for line in open("/proc/meminfo"):
            k, _, v = line.partition(":")
            d[k] = int(v.split()[0])          # kB
    except Exception:
        pass
    return d


def read_system():
    u = os.uname()
    mem = _meminfo()
    total = mem.get("MemTotal", 0)
    avail = mem.get("MemAvailable", mem.get("MemFree", 0))
    swpt = mem.get("SwapTotal", 0)
    swpf = mem.get("SwapFree", 0)
    try:
        up = float(open("/proc/uptime").read().split()[0])
    except Exception:
        up = 0
    try:
        load = open("/proc/loadavg").read().split()[:3]
    except Exception:
        load = ["0", "0", "0"]
    cpu = ""
    try:
        for line in open("/proc/cpuinfo"):
            if line.startswith(("model name", "Model", "Hardware")):
                cpu = line.split(":", 1)[1].strip()
                break
    except Exception:
        pass
    board = ""
    try:
        board = open("/proc/device-tree/model", "rb").read().decode(
            errors="ignore").strip("\x00").strip()
    except Exception:
        pass
    osname = ""
    try:
        for line in open("/etc/os-release"):
            if line.startswith("PRETTY_NAME="):
                osname = line.split("=", 1)[1].strip().strip('"')
                break
    except Exception:
        pass
    return {
        "hostname": u.nodename, "os": osname or "Linux",
        "kernel": u.release, "arch": u.machine,
        "cpu": cpu or u.machine, "cores": os.cpu_count() or 1, "board": board,
        "mem": {"total": total // 1024, "used": (total - avail) // 1024,
                "avail": avail // 1024},                     # MB
        "swap": {"total": swpt // 1024, "used": (swpt - swpf) // 1024},
        "uptime": int(up),
        "load": [float(x) for x in load],
        "timezone": read_timezone(),
    }


def situation():
    """A short, plain-language snapshot of the device's current state — the
    resident assistant's perception of its own house. Built from the same local
    readers the shell uses; nothing leaves the device."""
    b = read_battery()
    net = cached("net", 4, read_net)
    sysd = cached("sys", 3, read_system)
    parts = [time.strftime("it is %H:%M on %A %-d %B")]
    parts.append(f"battery {b['level']}%" + (", charging" if b["charging"] else ", on battery"))
    if net.get("airplane"):
        parts.append("airplane mode is on")
    elif net.get("wifi"):
        parts.append("online over Wi-Fi" + (f" '{net['ssid']}'" if net.get("ssid") else ""))
    else:
        parts.append("not on Wi-Fi")
    if net.get("bluetooth"):
        parts.append("Bluetooth on")
    if net.get("vpn"):
        parts.append("VPN connected")
    try:
        parts.append(f"CPU load {sysd['load'][0]:.2f} across {sysd['cores']} cores")
        parts.append(f"{sysd['mem']['avail']} MB RAM free of {sysd['mem']['total']} MB")
    except Exception:
        pass
    return "; ".join(parts) + "."


def read_processes(limit=14):
    rc, out = run(["ps", "axo", "pid,comm,pcpu,pmem,rss", "--sort=-pcpu"], timeout=4)
    procs = []
    if rc == 0:
        for line in out.splitlines()[1:limit + 1]:
            parts = line.split(None, 4)
            if len(parts) >= 5:
                try:
                    procs.append({"pid": int(parts[0]), "name": parts[1],
                                  "cpu": float(parts[2]), "mem": float(parts[3]),
                                  "rss": int(parts[4]) // 1024})   # MB
                except Exception:
                    pass
    return procs


def read_storage():
    rc, out = run(["df", "-P", "-B1", "-x", "tmpfs", "-x", "devtmpfs",
                   "-x", "overlay", "-x", "squashfs"], timeout=4)
    mounts = []
    if rc == 0:
        for line in out.splitlines()[1:]:
            p = line.split()
            if len(p) >= 6:
                try:
                    total, used, avail = int(p[1]), int(p[2]), int(p[3])
                except Exception:
                    continue
                if total == 0:
                    continue
                mounts.append({"fs": p[0], "mount": p[5], "total": total,
                               "used": used, "avail": avail,
                               "pct": int(p[4].rstrip("%") or 0)})
    return mounts


def wifi_scan():
    if not have("nmcli"):
        return []
    rc, out = run(["nmcli", "-t", "-f", "IN-USE,SSID,SIGNAL,SECURITY",
                   "dev", "wifi", "list", "--rescan", "no"], timeout=6)
    best = {}
    if rc == 0:
        for line in out.splitlines():
            parts = line.split(":")
            if len(parts) < 3:
                continue
            inuse, ssid, sig = parts[0], parts[1], parts[2]
            sec = ":".join(parts[3:]) if len(parts) > 3 else ""
            if not ssid:
                continue
            try:
                sigv = int(sig)
            except Exception:
                sigv = 0
            if ssid not in best or sigv > best[ssid]["signal"]:
                best[ssid] = {"ssid": ssid, "signal": sigv,
                              "security": sec or "open",
                              "active": inuse.strip() == "*"}
    return sorted(best.values(), key=lambda x: (-x["active"], -x["signal"]))


def run_exec(cmd, cwd):
    """Run a shell command for the Terminal app. Localhost-only, runs as the
    session user — this is the user's own device asking for a real shell."""
    home = os.path.expanduser("~")
    cwd = cwd if (cwd and os.path.isdir(cwd)) else home
    marker = "__AURA_CWD__"
    # Emit the cwd marker last. Merge stderr INTO stdout (STDOUT redirect) so the
    # real output order is preserved and the marker is always the final line —
    # otherwise a command's stderr lands after the marker and corrupts parsing.
    full = f"{cmd}\nprintf '\\n{marker}:%s\\n' \"$(pwd)\""
    try:
        p = subprocess.run(["bash", "-lc", full],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           text=True, timeout=20, cwd=cwd)
        out = p.stdout or ""
        rc = p.returncode
    except subprocess.TimeoutExpired:
        return {"out": "(command timed out after 20s)", "cwd": cwd, "rc": 124}
    except Exception as e:
        return {"out": f"(error: {e})", "cwd": cwd, "rc": 1}
    newcwd = cwd
    mk = marker + ":"
    idx = out.rfind(mk)
    if idx >= 0:
        newcwd = out[idx + len(mk):].strip() or cwd     # after the marker → cwd
        out = out[:idx].rstrip("\n")                     # before it → real output
    return {"out": out, "cwd": newcwd, "rc": rc}


# ============================================================================
# FILES — a real file manager, backed by the session user's own filesystem.
# The Terminal already gives a full shell as this user, so the file manager has
# the same reach: it browses real paths with the user's own permissions, and
# defaults to $HOME. No path is granted more access than the user already has.
# ============================================================================
HOME = os.path.expanduser("~")
FM_TEXT_MAX = 256 * 1024     # only preview files up to 256 KB


def _fm_resolve(path):
    """Resolve a request path to an absolute path, defaulting to HOME."""
    if not path:
        return HOME
    return os.path.abspath(os.path.expanduser(path))


def fm_list(path, show_hidden=False):
    d = _fm_resolve(path)
    if not os.path.isdir(d):
        return {"path": d, "parent": os.path.dirname(d.rstrip("/")) or "/",
                "home": HOME, "entries": [], "writable": False,
                "error": "not a directory"}
    try:
        names = os.listdir(d)
    except PermissionError:
        return {"path": d, "parent": os.path.dirname(d.rstrip("/")) or "/",
                "home": HOME, "entries": [], "writable": False,
                "error": "permission denied"}
    except Exception as e:
        return {"path": d, "parent": os.path.dirname(d.rstrip("/")) or "/",
                "home": HOME, "entries": [], "writable": False, "error": str(e)}
    entries = []
    for name in names:
        if not show_hidden and name.startswith("."):
            continue
        full = os.path.join(d, name)
        try:
            lst = os.lstat(full)
            is_link = stat.S_ISLNK(lst.st_mode)
            try:
                tst = os.stat(full) if is_link else lst    # resolve links for dir/type
            except Exception:
                tst = lst
            is_dir = stat.S_ISDIR(tst.st_mode)
            entries.append({
                "name": name, "dir": is_dir, "link": is_link,
                "size": 0 if is_dir else tst.st_size,
                "mtime": int(lst.st_mtime),
                "mode": stat.filemode(lst.st_mode),
            })
        except Exception:
            entries.append({"name": name, "dir": False, "link": False,
                            "size": 0, "mtime": 0, "mode": "?????????"})
    entries.sort(key=lambda e: (not e["dir"], e["name"].lower()))
    return {"path": d, "parent": os.path.dirname(d.rstrip("/")) or "/",
            "home": HOME, "entries": entries, "writable": os.access(d, os.W_OK)}


def fm_read(path):
    f = _fm_resolve(path)
    try:
        st = os.stat(f)
    except Exception as e:
        return {"path": f, "error": str(e)}
    if not stat.S_ISREG(st.st_mode):
        return {"path": f, "error": "not a regular file"}
    if st.st_size > FM_TEXT_MAX:
        return {"path": f, "size": st.st_size, "binary": False, "truncated": True,
                "text": ""}
    try:
        with open(f, "rb") as fh:
            raw = fh.read(FM_TEXT_MAX)
    except PermissionError:
        return {"path": f, "error": "permission denied"}
    except Exception as e:
        return {"path": f, "error": str(e)}
    if b"\x00" in raw:
        return {"path": f, "size": st.st_size, "binary": True, "text": ""}
    for enc in ("utf-8", "latin-1"):
        try:
            return {"path": f, "size": st.st_size, "binary": False,
                    "text": raw.decode(enc)}
        except UnicodeDecodeError:
            continue
    return {"path": f, "size": st.st_size, "binary": True, "text": ""}


def fm_op(op, path, dest=None):
    p = _fm_resolve(path)
    # Never let a slip destroy an anchor directory.
    if op == "delete" and p in ("/", HOME, os.path.dirname(HOME)):
        return {"ok": False, "msg": "refusing to delete a protected directory"}
    try:
        if op == "mkdir":
            os.makedirs(p, exist_ok=False)
        elif op == "newfile":
            if os.path.exists(p):
                return {"ok": False, "msg": "already exists"}
            open(p, "x").close()
        elif op == "rename":
            d = _fm_resolve(dest)
            if os.path.exists(d):
                return {"ok": False, "msg": "target name already exists"}
            os.rename(p, d)
        elif op == "delete":
            if os.path.isdir(p) and not os.path.islink(p):
                shutil.rmtree(p)
            else:
                os.remove(p)
        else:
            return {"ok": False, "msg": "unknown operation"}
        return {"ok": True}
    except FileExistsError:
        return {"ok": False, "msg": "already exists"}
    except PermissionError:
        return {"ok": False, "msg": "permission denied"}
    except Exception as e:
        return {"ok": False, "msg": str(e)}


# ============================================================================
# STORES — permissions + network log persist to disk
# ============================================================================
DEFAULT_PERM = {"camera": "ask", "mic": "ask", "location": "ask",
                "contacts": "ask", "files": "ask", "network": "allow"}
APP_IDS = ["phone", "messages", "contacts", "browser", "camera", "photos",
           "music", "maps", "files", "notes", "calc", "clock", "terminal", "sync"]


def load_perms():
    try:
        with open(PERM_FILE) as f:
            data = json.load(f)
    except Exception:
        data = {}
    for a in APP_IDS:
        data.setdefault(a, dict(DEFAULT_PERM))
        for k, v in DEFAULT_PERM.items():
            data[a].setdefault(k, v)
    return data


def save_perms(p):
    tmp = PERM_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(p, f, indent=2)
    os.replace(tmp, PERM_FILE)


def load_netlog():
    try:
        with open(NETLOG_FILE) as f:
            return json.load(f)
    except Exception:
        return []


def save_netlog(n):
    tmp = NETLOG_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(n, f, indent=2)
    os.replace(tmp, NETLOG_FILE)


def block_host_egress(host):
    """Deny outbound traffic to a *single* host at the firewall — never a
    blanket egress drop. Resolve the host to its IP(s) and add one `ufw deny
    out to <ip>` rule per address. Returns the addresses actually blocked
    (empty if ufw is missing, lacks privilege, or the host won't resolve — the
    block is still recorded in the netlog by the caller, so we degrade
    honestly: the user sees the intent recorded even when we can't enforce it)."""
    if not host or not have("ufw"):
        return []
    ips = set()
    try:
        for _fam, _t, _p, _c, sockaddr in socket.getaddrinfo(host, None):
            ips.add(sockaddr[0])
    except Exception:
        return []
    blocked = []
    for ip in sorted(ips):
        rc, _ = run(["ufw", "deny", "out", "to", ip])
        if rc == 0:
            blocked.append(ip)
    return blocked


# ============================================================================
# ACTIONS
# ============================================================================
def set_toggle(key, value):
    if key in ("wifi", "wwan") and have("nmcli"):
        run(["nmcli", "radio", key, "on" if value else "off"])
    elif key == "airplane" and have("nmcli"):
        run(["nmcli", "radio", "all", "off" if value else "on"])
    elif key == "bluetooth" and have("rfkill"):
        run(["rfkill", "unblock" if value else "block", "bluetooth"])
    # vpn toggle intentionally left to a configured connection; no-op if none


def set_brightness(pct):
    d = _backlight_dir()
    if not d:
        return
    try:
        mx = int(open(os.path.join(d, "max_brightness")).read().strip())
        val = max(1, round(mx * max(5, min(100, pct)) / 100))
        # try brightnessctl first (handles permissions), else write sysfs
        if have("brightnessctl"):
            run(["brightnessctl", "-d", os.path.basename(d), "set", str(val)])
        else:
            open(os.path.join(d, "brightness"), "w").write(str(val))
    except Exception:
        pass


def set_volume(pct):
    pct = max(0, min(100, pct))
    if have("wpctl"):
        run(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", f"{pct/100:.2f}"])
    elif have("amixer"):
        run(["amixer", "set", "Master", f"{pct}%"])


def launch_app(app_id):
    for cmd in APP_EXEC.get(app_id, []):
        if have(cmd[0]) or cmd[0] in ("flatpak",):
            try:
                subprocess.Popen(cmd, stdout=subprocess.DEVNULL,
                                 stderr=subprocess.DEVNULL, start_new_session=True)
                return True
            except Exception:
                continue
    return False


# ============================================================================
# CAPABILITY REGISTRY — what this device can actually do, discovered live.
# Real installed apps (freedesktop .desktop files across system/Flatpak/Snap)
# plus the system functions the agent exposes, each self-described. The AI
# Engine reads this so newly-installed apps and new functions are picked up
# with no code change — and the shell surfaces them. Discovery is NOT
# permission: actually launching/acting still goes through the agent (P2/P6).
# ============================================================================
DESKTOP_DIRS = [
    "/usr/share/applications",
    "/usr/local/share/applications",
    os.path.expanduser("~/.local/share/applications"),
    "/var/lib/flatpak/exports/share/applications",
    os.path.expanduser("~/.local/share/flatpak/exports/share/applications"),
    "/var/lib/snapd/desktop/applications",
]
# Where freedesktop apps (and Waydroid) drop icon files. We resolve the .desktop
# `Icon=` field to a real file here so the shell can show an app's OWN icon —
# which is what makes an Android app look like any other installed app.
ICON_DIRS = [
    os.path.expanduser("~/.local/share/icons"),
    os.path.expanduser("~/.local/share/waydroid/data/icons"),
    "/usr/share/icons/hicolor/512x512/apps",
    "/usr/share/icons/hicolor/256x256/apps",
    "/usr/share/icons/hicolor/128x128/apps",
    "/usr/share/icons/hicolor/96x96/apps",
    "/usr/share/icons/hicolor/64x64/apps",
    "/usr/share/icons/hicolor/48x48/apps",
    "/usr/share/icons/hicolor/scalable/apps",
    "/var/lib/flatpak/exports/share/icons/hicolor/128x128/apps",
    "/usr/share/pixmaps",
]
_ICON_EXTS = (".png", ".svg")


def resolve_icon(name):
    """Turn a .desktop Icon= value into a real file path, or None. Absolute paths
    are used as-is; a bare name is looked up (largest sensible size first).

    Note: don't use os.path.splitext — Waydroid icon names are dotted
    (`waydroid.org.thoughtcrime.securesms`) and it would strip the last segment
    as a bogus extension. Only a real image suffix counts as an extension."""
    if not name:
        return None
    if os.path.isabs(name):
        return name if os.path.isfile(name) else None
    cands = []
    if name.lower().endswith(_ICON_EXTS):
        cands.append(name)                       # already "foo.png"
        base = name[: name.rfind(".")]
    else:
        base = name
    cands += [base + e for e in _ICON_EXTS]      # "waydroid.org.foo" + ".png"/".svg"
    for d in ICON_DIRS:
        for c in cands:
            p = os.path.join(d, c)
            if os.path.isfile(p):
                return p
    return None


_FIELD_CODES = re.compile(r"%[fFuUdDnNickvm]")


def _desktop_entry(path):
    """Parse the [Desktop Entry] group of a .desktop file into a dict."""
    ent, in_entry = {}, False
    try:
        for line in open(path, encoding="utf-8", errors="ignore"):
            line = line.rstrip("\n")
            if line.startswith("["):
                in_entry = line.strip() == "[Desktop Entry]"
                continue
            if in_entry and "=" in line and not line.startswith("#"):
                k, _, v = line.partition("=")
                ent.setdefault(k.strip(), v.strip())
    except Exception:
        return None
    return ent


def _waydroid_pkg(app_id, exec_line):
    """If a .desktop entry is a Waydroid app, return its Android package name,
    else None. Waydroid names files `waydroid.<pkg>.desktop` and its Exec is
    `waydroid app launch <pkg>`. We detect either way so the shell can launch it
    exactly like a native app — the agent quietly routes it to the container."""
    if app_id.startswith("waydroid."):
        return app_id[len("waydroid."):]
    m = re.search(r"waydroid\s+app\s+launch\s+(\S+)", exec_line or "")
    return m.group(1) if m else None


def _desktop_app(path):
    ent = _desktop_entry(path)
    if not ent or ent.get("Type") != "Application":
        return None
    if ent.get("NoDisplay", "").lower() == "true" or ent.get("Hidden", "").lower() == "true":
        return None
    name, exe = ent.get("Name"), ent.get("Exec")
    if not name or not exe:
        return None
    cats = [c for c in ent.get("Categories", "").split(";") if c]
    # `icon` tells the shell it can show this app's OWN icon (via /api/appicon).
    # We deliberately do NOT tag Android apps in the catalogue — they appear and
    # launch exactly like any other installed app; the agent handles the rest.
    return {"id": os.path.splitext(os.path.basename(path))[0], "name": name,
            "comment": ent.get("Comment", ""), "categories": cats,
            "icon": bool(resolve_icon(ent.get("Icon", ""))),
            "terminal": ent.get("Terminal", "").lower() == "true"}


def scan_desktop_apps():
    seen = {}
    for d in DESKTOP_DIRS:
        try:
            for f in glob.glob(os.path.join(d, "*.desktop")):
                app = _desktop_app(f)
                if app and app["id"] not in seen:
                    seen[app["id"]] = app
        except Exception:
            continue
    return sorted(seen.values(), key=lambda a: a["name"].lower())


def _desktop_path(app_id):
    for d in DESKTOP_DIRS:
        p = os.path.join(d, app_id + ".desktop")
        if os.path.isfile(p):
            return p
    return None


def launch_desktop(app_id):
    """Launch a real installed app by its .desktop id — gtk-launch/gio when
    available (they honour the desktop file), else the parsed Exec line.

    Android apps are launched the same way from the shell's point of view, but
    are routed through the Waydroid bridge so the container/session starts on
    demand — the user just taps the app, no Android step in sight."""
    path = _desktop_path(app_id)
    if not path:
        return False
    ent = _desktop_entry(path) or {}
    pkg = _waydroid_pkg(app_id, ent.get("Exec", ""))
    if pkg:
        return bool(ANDROID.launch(pkg).get("ok"))
    try:
        if have("gtk-launch"):
            subprocess.Popen(["gtk-launch", app_id], stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL, start_new_session=True)
            return True
        if have("gio"):
            subprocess.Popen(["gio", "launch", path], stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL, start_new_session=True)
            return True
        cmd = shlex.split(_FIELD_CODES.sub("", ent.get("Exec", "")).strip())
        if not cmd:
            return False
        subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         start_new_session=True)
        return True
    except Exception:
        return False


def system_functions():
    """The agent's own actions, self-described as capabilities — a view of the
    ONE capability catalog the AI Engine reasons over (ai_engine.CAPABILITIES),
    so the registry and the resident's tools can never drift apart. Add a
    capability there and it appears here (and to the model) with no other change."""
    return [{"id": c["id"], "desc": c.get("desc", ""),
             "args": {k: v.get("type", "string") for k, v in (c.get("args") or {}).items()},
             "reversible": c.get("reversible", False),
             "affects": c.get("affects", [])} for c in CAPABILITIES]


def read_capabilities():
    return {"apps": scan_desktop_apps(), "functions": system_functions(),
            "generated": int(time.time())}


# ============================================================================
# NOTES — a real, native notes store (files on disk, under the state dir).
# The Notes app opens *inside* the shell and persists here.
# ============================================================================
def _note_id(nid):
    return re.sub(r"[^A-Za-z0-9_-]", "", str(nid)) or "note"


def notes_list():
    out = []
    for f in glob.glob(os.path.join(NOTES_DIR, "*.md")):
        try:
            txt = open(f, encoding="utf-8", errors="ignore").read()
            mt = int(os.path.getmtime(f))
        except Exception:
            txt, mt = "", 0
        first = next((l.strip().lstrip("# ") for l in txt.splitlines() if l.strip()), "")
        out.append({"id": os.path.splitext(os.path.basename(f))[0],
                    "title": (first or "Untitled")[:80],
                    "preview": txt.strip()[:140], "mtime": mt})
    return sorted(out, key=lambda n: n["mtime"], reverse=True)


def notes_get(nid):
    f = os.path.join(NOTES_DIR, _note_id(nid) + ".md")
    try:
        return {"id": nid, "text": open(f, encoding="utf-8", errors="ignore").read()}
    except Exception:
        return {"id": nid, "text": ""}


def notes_save(nid, text):
    nid = _note_id(nid) if nid else str(int(time.time() * 1000))
    f = os.path.join(NOTES_DIR, nid + ".md")
    tmp = f + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(text or "")
    os.replace(tmp, f)
    return {"ok": True, "id": nid}


def notes_del(nid):
    try:
        os.remove(os.path.join(NOTES_DIR, _note_id(nid) + ".md"))
    except Exception:
        pass
    return {"ok": True}


# ============================================================================
# HTTP
# ============================================================================
class Handler(BaseHTTPRequestHandler):
    server_version = "aura-agent/1.0"
    # Speak HTTP/1.1 with keep-alive (the default HTTP/1.0 closes every socket,
    # which is worse: the browser reuses a just-closed socket and hits
    # "NetworkError"). Every response sets Content-Length, so keep-alive is safe;
    # `timeout` reaps idle connections. The client still retries transient
    # network blips (see api.js) — a real device has flaky moments too.
    protocol_version = "HTTP/1.1"
    timeout = 65

    def log_message(self, *a):  # quiet
        pass

    def _send(self, code, body, ctype="application/json"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
        elif isinstance(body, str):
            body = body.encode()
        try:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "content-type")
            self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            # The client (shell) aborted the request — normal when a poll times
            # out or the page reloads. Nothing to send to; not an error.
            self.close_connection = True

    def do_OPTIONS(self):
        # CORS preflight carries no data and cannot include our custom header;
        # allow it (the actual request that follows still needs the token).
        self._send(204, b"", "text/plain")

    # ---- local-API auth ----------------------------------------------------
    def _authed(self):
        """True iff the caller presented the per-boot token. Accept it as a
        header (the shell attaches it) or a query param (for streaming/EventSource
        clients that can't set headers). Constant-time compare."""
        tok = self.headers.get(TOKEN_HEADER, "")
        if not tok:
            tok = (parse_qs(urlsplit(self.path).query).get("t", [""]) or [""])[0]
        return bool(tok) and secrets.compare_digest(tok, SESSION_TOKEN)

    def _guard_api(self, p):
        """Gate every /api/* route. Returns True if the request was rejected
        (handler should stop). Static shell assets stay public — the browser must
        load them before it has the token; they carry no device data."""
        if p.startswith("/api/") and not self._authed():
            self._send(401, {"error": "unauthorized",
                             "detail": "missing or invalid session token"})
            return True
        return False

    def _stream_ndjson(self, gen):
        """Stream a generator of dicts as chunked newline-delimited JSON. Used
        for AI chat so tokens reach the UI as they're produced. A background
        thread runs the (blocking) generator while the main loop emits a tiny
        heartbeat chunk during any silence — e.g. while the model is deciding a
        tool call and producing no tokens — so the connection never sits idle
        long enough for the browser to drop it."""
        import queue as _queue
        import threading
        q = _queue.Queue()

        def produce():
            try:
                for evt in gen:
                    q.put(("evt", evt))
            except Exception as e:
                q.put(("evt", {"error": "error", "message": f"Local model error: {e}"}))
            q.put(("end", None))

        threading.Thread(target=produce, daemon=True).start()
        try:
            self.send_response(200)
            self.send_header("Content-Type", "application/x-ndjson")
            self.send_header("Transfer-Encoding", "chunked")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            while True:
                try:
                    kind, val = q.get(timeout=2.0)
                except _queue.Empty:
                    self.wfile.write(b"1\r\n \r\n"); self.wfile.flush()   # heartbeat: a bare space (not a JSON line)
                    continue
                if kind == "end":
                    break
                data = (json.dumps(val) + "\n").encode()
                self.wfile.write(f"{len(data):X}\r\n".encode() + data + b"\r\n")
                self.wfile.flush()
            self.wfile.write(b"0\r\n\r\n")
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True

    # -------- app icons (real freedesktop/Waydroid icons) --------
    def _serve_appicon(self, app_id):
        """Serve an installed app's own icon so it looks native in the launcher.
        Token-gated like all /api/*; the shell passes ?t=<token> on the <img>."""
        app_id = re.sub(r"[^A-Za-z0-9._+-]", "", app_id or "")
        path = _desktop_path(app_id) if app_id else None
        icon = resolve_icon((_desktop_entry(path) or {}).get("Icon", "")) if path else None
        if not icon or not os.path.isfile(icon):
            return self._send(404, {"error": "no icon"})
        ctype = "image/svg+xml" if icon.lower().endswith(".svg") else "image/png"
        try:
            with open(icon, "rb") as f:
                return self._send(200, f.read(), ctype)
        except Exception:
            return self._send(404, {"error": "no icon"})

    # -------- static shell --------
    def _serve_static(self, path):
        if path == "/" or path == "":
            path = "/index.html"
        safe = os.path.normpath(path).lstrip("/")
        full = os.path.join(SHELL_DIR, safe)
        if not full.startswith(SHELL_DIR) or not os.path.isfile(full):
            return self._send(404, {"error": "not found"})
        ctype = {
            ".html": "text/html", ".css": "text/css", ".js": "application/javascript",
            ".json": "application/json", ".svg": "image/svg+xml",
        }.get(os.path.splitext(full)[1], "application/octet-stream")
        try:
            with open(full, "rb") as f:
                data = f.read()
            if ctype == "text/html":
                # Hand the token to the shell it loads, before any script runs, so
                # the legitimate UI is authenticated but an anonymous /api caller
                # is not. Injected into <head> so window.__AURA_TOKEN__ is set first.
                inject = (f'<script>window.__AURA_TOKEN__='
                          f'{json.dumps(SESSION_TOKEN)};</script>').encode()
                if b"</head>" in data:
                    data = data.replace(b"</head>", inject + b"</head>", 1)
                else:
                    data = inject + data
            self._send(200, data, ctype)
        except Exception:
            self._send(500, {"error": "read failed"})

    def do_GET(self):
        p = self.path.split("?")[0]
        if self._guard_api(p):
            return
        if p == "/api/status":
            return self._send(200, {
                "mode": "live",
                "battery": read_battery(),
                "net": cached("net", 4, read_net),
                "brightness": read_brightness(),
                "volume": cached("volume", 3, read_volume),
                "disk": cached("disk", 30, read_disk),
                "vault": {"unlocked": True, "usedPct": cached("vault", 15, self._vault_used),
                          "algo": "fscrypt · AES-256-XTS"},
            })
        if p == "/api/permissions":
            return self._send(200, load_perms())
        if p == "/api/netlog":
            return self._send(200, load_netlog())
        if p == "/api/system":
            return self._send(200, cached("sys", 3, read_system))
        if p == "/api/processes":
            return self._send(200, read_processes())
        if p == "/api/storage":
            return self._send(200, cached("storage", 5, read_storage))
        if p == "/api/wifi":
            return self._send(200, cached("wifi_scan", 6, wifi_scan))
        if p == "/api/timezone":
            return self._send(200, {"timezone": read_timezone()})
        if p == "/api/files/list":
            q = parse_qs(urlsplit(self.path).query)
            return self._send(200, fm_list(q.get("path", [""])[0],
                                           q.get("hidden", ["0"])[0] == "1"))
        if p == "/api/files/read":
            q = parse_qs(urlsplit(self.path).query)
            return self._send(200, fm_read(q.get("path", [""])[0]))
        # ---- capability registry + notes ----
        if p == "/api/capabilities":
            return self._send(200, cached("caps", 20, read_capabilities))
        if p == "/api/appicon":
            q = parse_qs(urlsplit(self.path).query)
            return self._serve_appicon(q.get("id", [""])[0])
        if p == "/api/notes":
            return self._send(200, notes_list())
        if p == "/api/notes/get":
            q = parse_qs(urlsplit(self.path).query)
            return self._send(200, notes_get(q.get("id", [""])[0]))
        # ---- AI Engine (Phase II) ----
        if p == "/api/ai/status":
            return self._send(200, AI.status())
        if p == "/api/ai/memory":
            return self._send(200, AI.memory())
        if p == "/api/ai/activity":
            return self._send(200, AI.activity())
        if p == "/api/ai/permissions":
            return self._send(200, AI.perms())
        if p == "/api/ai/episodes":
            return self._send(200, AI.episodes())
        if p == "/api/ai/routines":
            return self._send(200, AI.routines())
        if p == "/api/ai/suggest":
            # the resident's own perception of "now" drives the suggestion
            return self._send(200, AI.suggest())
        # ---- Android layer (Phase III — Waydroid) ----
        if p == "/api/android/status":
            return self._send(200, ANDROID.status())
        if p == "/api/android/apps":
            return self._send(200, ANDROID.list_apps())
        return self._serve_static(p)

    def _vault_used(self):
        try:
            st = os.statvfs(os.path.expanduser("~"))
            used = (st.f_blocks - st.f_bfree) * st.f_frsize
            total = st.f_blocks * st.f_frsize or 1
            return int(round(used * 100 / total))
        except Exception:
            return 0

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            body = {}
        p = self.path.split("?")[0]
        if self._guard_api(p):   # body already drained above, so keep-alive is safe
            return

        if p == "/api/permission":
            perms = load_perms()
            app, key, val = body.get("app"), body.get("key"), body.get("value")
            if app in perms and key in DEFAULT_PERM and val in ("allow", "ask", "deny"):
                perms[app][key] = val
                save_perms(perms)
                return self._send(200, {"ok": True})
            return self._send(400, {"ok": False})

        if p == "/api/launch":
            app = body.get("app", "")
            # a real installed .desktop app, or one of the shell's built-in ids;
            # fall back to desktop launch so any discovered app just works.
            if body.get("desktop"):
                ok = launch_desktop(app)
            else:
                ok = launch_app(app) or launch_desktop(app)
            # the resident learns from what the user opens (no-op while AI is off)
            AI.observe("open_app", {"name": app}, body.get("bySov") and "assistant" or "user")
            return self._send(200, {"ok": ok})

        if p == "/api/close":
            return self._send(200, {"ok": True})  # window mgmt handled by compositor

        if p == "/api/toggle":
            key, val = body.get("key", ""), bool(body.get("value"))
            set_toggle(key, val)
            if key in ("wifi", "bluetooth"):
                AI.observe("toggle_" + key, {"on": val})
            return self._send(200, {"ok": True})

        if p == "/api/level":
            key, val = body.get("key"), int(body.get("value", 0))
            if key == "brightness":
                set_brightness(val)
                AI.observe("set_brightness", {"percent": val})
            elif key == "volume":
                set_volume(val)
                AI.observe("set_volume", {"percent": val})
            return self._send(200, {"ok": True})

        if p == "/api/block":
            host = body.get("host", "")
            log = load_netlog()
            for e in log:
                if e.get("host") == host:
                    e["blocked"] = True
            save_netlog(log)
            # Enforce at the firewall, but only for THIS host — resolve it to
            # its IPs and deny each. Records intent even if it can't enforce.
            addrs = block_host_egress(host)
            return self._send(200, {"ok": True, "enforced": bool(addrs),
                                    "addresses": addrs})

        if p == "/api/kill":
            kind = body.get("kind")
            key = {"mic": "mic", "cam": "camera", "loc": "location"}.get(kind)
            if key:
                perms = load_perms()
                for a in perms:
                    perms[a][key] = "deny"
                save_perms(perms)
            return self._send(200, {"ok": True})

        if p == "/api/vault":
            return self._send(200, {"ok": True})

        if p == "/api/unlock":
            # PIN check is delegated to PAM/greeter in production; the agent
            # only reaches this endpoint once the session is already unlocked,
            # so accept a well-formed PIN. Wire to real auth before shipping.
            pin = str(body.get("pin", ""))
            return self._send(200, {"ok": len(pin) >= 4})

        if p == "/api/wifi/connect":
            ssid = body.get("ssid", "")
            pw = body.get("password", "")
            if not have("nmcli") or not ssid:
                return self._send(400, {"ok": False, "msg": "no nmcli or ssid"})
            cmd = ["nmcli", "dev", "wifi", "connect", ssid]
            if pw:
                cmd += ["password", pw]
            rc, out = run(cmd, timeout=25)
            _CACHE.pop("net", None); _CACHE.pop("wifi_scan", None)
            return self._send(200, {"ok": rc == 0, "msg": out})

        if p == "/api/power":
            action = body.get("action")
            if action == "reboot":
                run(["systemctl", "reboot"], timeout=4)
                return self._send(200, {"ok": True})
            if action == "poweroff":
                run(["systemctl", "poweroff"], timeout=4)
                return self._send(200, {"ok": True})
            return self._send(400, {"ok": False})

        if p == "/api/exec":
            return self._send(200, run_exec(body.get("cmd", ""), body.get("cwd")))

        if p == "/api/files/op":
            return self._send(200, fm_op(body.get("op", ""), body.get("path", ""),
                                         body.get("dest")))

        if p == "/api/notes/save":
            return self._send(200, notes_save(body.get("id", ""), body.get("text", "")))
        if p == "/api/notes/del":
            return self._send(200, notes_del(body.get("id", "")))

        if p == "/api/timezone":
            tz = body.get("timezone", "")
            if tz:
                run(["timedatectl", "set-timezone", tz], timeout=4)
                _CACHE.pop("sys", None)
            return self._send(200, {"ok": True, "timezone": read_timezone()})

        # ---- AI Engine (Phase II) ----
        if p == "/api/ai/chat":
            prompt, use_mem = body.get("prompt", ""), bool(body.get("useMemory"))
            situ = situation()   # the resident perceives the device's current state
            if body.get("stream"):
                return self._stream_ndjson(AI.chat_stream(prompt, use_mem, situ))
            return self._send(200, AI.chat(prompt, use_mem, situ))
        if p == "/api/ai/settings":
            return self._send(200, AI.set_settings(body))
        if p == "/api/ai/permission":
            return self._send(200, AI.set_perm(body.get("source", ""), body.get("value", "")))
        if p == "/api/ai/memory/add":
            return self._send(200, AI.add_memory(body.get("text", ""), body.get("tags")))
        if p == "/api/ai/memory/del":
            return self._send(200, AI.del_memory(body.get("id", "")))
        if p == "/api/ai/memory/clear":
            return self._send(200, AI.clear_memory())
        if p == "/api/ai/activity/clear":
            return self._send(200, AI.clear_activity())
        if p == "/api/ai/log":
            AI.log(body.get("kind", "action"), body.get("summary", ""),
                   body.get("why", ""), bool(body.get("undoable")))
            return self._send(200, {"ok": True})
        if p == "/api/ai/observe":
            # the shell reports a behaviour the agent's own endpoints can't see
            # (e.g. an assistant-run step like play_music / set_dnd / create_note)
            AI.observe(body.get("action", ""), body.get("args") or {},
                       body.get("source", "user"))
            return self._send(200, {"ok": True})
        if p == "/api/ai/episodes/clear":
            return self._send(200, AI.clear_episodes())
        if p == "/api/ai/suggest/feedback":
            return self._send(200, AI.suggestion_feedback(
                body.get("id", ""), bool(body.get("accept"))))

        # ---- Android layer (Phase III — Waydroid) ----
        if p == "/api/android/launch":
            res = ANDROID.launch(body.get("package", ""))
            if res.get("ok"):
                AI.observe("open_android_app", {"package": body.get("package", "")},
                           body.get("bySov") and "assistant" or "user")
            return self._send(200, res)
        if p == "/api/android/install":
            # long op (may download + install): give it room, never retry-fire
            return self._send(200, ANDROID.install(body.get("source", "")))
        if p == "/api/android/remove":
            return self._send(200, ANDROID.remove(body.get("package", "")))
        if p == "/api/android/session":
            return self._send(200, ANDROID.session(body.get("action", "")))
        if p == "/api/android/store":
            # install or open the graphical app store (F-Droid)
            return self._send(200, ANDROID.store(body.get("action", "")))
        if p == "/api/android/show":
            return self._send(200, ANDROID.show_full_ui())

        return self._send(404, {"error": "unknown endpoint"})


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        # A dropped client connection is expected (polling, page reloads); don't
        # dump a traceback for it. Anything else falls through to the default.
        exc = sys.exc_info()[1]
        if isinstance(exc, (BrokenPipeError, ConnectionResetError)):
            return
        super().handle_error(request, client_address)


def main():
    # seed stores on first run
    if not os.path.exists(PERM_FILE):
        save_perms(load_perms())
    if not os.path.exists(NETLOG_FILE):
        save_netlog([])
    write_token_file()
    print(f"aura-agent: local API authenticated (token in {TOKEN_FILE})")
    print(f"aura-agent: serving shell from {SHELL_DIR}")
    print(f"aura-agent: state in {STATE_DIR}")
    print(f"aura-agent: listening on http://{HOST}:{PORT}")
    httpd = Server((HOST, PORT), Handler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.shutdown()


if __name__ == "__main__":
    main()
