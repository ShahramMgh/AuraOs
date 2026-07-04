# AuraOS — cellular modem bridge (SIMCom A7670E: 4G data · voice · SMS · GNSS)
#
# The A7670E is a standard ModemManager device, so — exactly like Wi-Fi goes
# through nmcli — telephony goes through ModemManager's CLI (`mmcli`). That's the
# robust Linux way: it owns the modem's serial ports, so we don't fight it with
# raw AT. This bridge is a thin, defensive wrapper around mmcli that the shell
# reaches only via the agent's /api/phone, /api/sms and /api/location.
#
# Data (LTE) is handled at the OS layer by ModemManager + NetworkManager (an APN
# connection); the shell just reflects it. Voice audio (hearing/speaking) is a
# separate hardware path — the A7670E's PCM/analog audio must be wired to a
# codec/speaker+mic; mmcli establishes/answers the *call*, audio routing is board
# wiring. This bridge does call control (dial/answer/hangup/state), SMS, and GPS.
#
# Everything degrades honestly: no modem → {"available": false}, and the shell
# shows the template/off state rather than pretending.
#
# ── On-hardware bring-up (see MODEM.md) ──────────────────────────────────────
# Written to ModemManager's documented interface; needs verification on the real
# A7670E. Configure the transport in /etc/aura/modem.env if mmcli can't see it.
import os
import shutil
import subprocess
import threading
import time

# Which ModemManager modem index to use (usually 0). Override if you have more.
MODEM_INDEX = os.environ.get("AURA_MODEM_INDEX", "")   # "" = auto-pick the first
POLL = int(os.environ.get("AURA_MODEM_POLL", "6"))     # background refresh, seconds


class Modem:
    """Defensive mmcli wrapper for the A7670E. Never raises; every method returns
    a JSON-able dict, with live state cached so the shell's poll stays cheap."""

    def __init__(self):
        self._lock = threading.Lock()
        self._idx = None
        self._cache = (0.0, None)         # (monotonic, status dict)
        self._modem_seen = False

    # ── low-level ────────────────────────────────────────────────────────────
    @staticmethod
    def _mmcli(args, timeout=20):
        """Run `mmcli <args>`, return (rc, stdout). Never raises."""
        if not shutil.which("mmcli"):
            return 127, ""
        try:
            p = subprocess.run(["mmcli", *args], capture_output=True, text=True, timeout=timeout)
            return p.returncode, p.stdout
        except Exception:
            return 1, ""

    @staticmethod
    def _kv(out):
        """Parse mmcli -K key : value output into a flat dict."""
        d = {}
        for line in out.splitlines():
            if ":" in line:
                k, _, v = line.partition(":")
                d[k.strip()] = v.strip()
        return d

    @staticmethod
    def available():
        return shutil.which("mmcli") is not None

    def _modem(self):
        """Resolve the modem index (cached). None if no modem is present."""
        if self._idx is not None:
            return self._idx
        if MODEM_INDEX != "":
            self._idx = MODEM_INDEX
            return self._idx
        rc, out = self._mmcli(["-L", "-K"])
        # modem-list.value[1] = /org/freedesktop/ModemManager1/Modem/0
        for k, v in self._kv(out).items():
            if k.startswith("modem-list.value") and "/Modem/" in v:
                self._idx = v.rsplit("/", 1)[-1]
                self._modem_seen = True
                return self._idx
        return None

    def _m(self, args, timeout=20):
        idx = self._modem()
        if idx is None:
            return None, None
        return self._mmcli(["-m", idx, *args], timeout=timeout)

    # ── status (data + registration + signal) ────────────────────────────────
    def status(self, ttl=4.0):
        if not self.available():
            return {"available": False, "reason": "No cellular modem stack (ModemManager) on this device."}
        now = time.monotonic()
        at, cached = self._cache
        if cached and now - at < ttl:
            return cached
        rc, out = self._m(["-K"])
        if out is None:
            res = {"available": True, "present": False,
                   "reason": "No modem detected. Check the A7670E connection and /etc/aura/modem.env."}
            self._cache = (now, res)
            return res
        k = self._kv(out)
        sig = k.get("modem.generic.signal-quality.value", "")
        state = k.get("modem.generic.state", "")
        res = {
            "available": True, "present": True,
            "state": state,                                             # registered/connected/…
            "operator": k.get("modem.3gpp.operator-name", ""),
            "tech": k.get("modem.generic.access-technologies.value[1]", ""),
            "signal": int(sig) if sig.isdigit() else None,
            "number": k.get("modem.generic.own-numbers.value[1]", ""),
            "dataConnected": state == "connected",
        }
        self._cache = (now, res)
        return res

    # ── SMS ──────────────────────────────────────────────────────────────────
    def sms_list(self):
        rc, out = self._m(["--messaging-list-sms"])
        if out is None:
            return {"available": self.available(), "present": False, "messages": []}
        paths = [ln.split()[0] for ln in out.splitlines() if "/SMS/" in ln]
        msgs = []
        for p in paths[:80]:
            r2, o2 = self._mmcli(["-s", p.rsplit("/", 1)[-1], "-K"])
            kv = self._kv(o2)
            msgs.append({
                "id": p.rsplit("/", 1)[-1],
                "number": kv.get("sms.content.number", ""),
                "text": kv.get("sms.content.text", ""),
                "time": kv.get("sms.properties.timestamp", ""),
                "sent": kv.get("sms.properties.pdu-type", "") == "submit",
                "unread": kv.get("sms.properties.state", "") == "received",
            })
        return {"available": True, "present": True, "messages": msgs}

    def sms_send(self, number, text):
        if not number or text is None:
            return {"ok": False, "error": "number and text required"}
        idx = self._modem()
        if idx is None:
            return {"ok": False, "error": "no modem"}
        # create then send. mmcli wants a single --messaging-create-sms argument.
        num = str(number).replace('"', "")
        txt = str(text).replace('"', "'")
        rc, out = self._mmcli(["-m", idx, "--messaging-create-sms=number=%s,text=%s" % (num, txt)])
        path = ""
        for ln in out.splitlines():
            if "/SMS/" in ln:
                path = ln.strip().rstrip(".").split()[-1]
        if not path:
            return {"ok": False, "error": "could not create message"}
        rc2, _ = self._mmcli(["-s", path.rsplit("/", 1)[-1], "--send"], timeout=45)
        return {"ok": rc2 == 0, "error": None if rc2 == 0 else "send failed"}

    # ── voice ────────────────────────────────────────────────────────────────
    def call(self, number):
        idx = self._modem()
        if idx is None:
            return {"ok": False, "error": "no modem"}
        if not number:
            return {"ok": False, "error": "no number"}
        num = str(number).replace('"', "")
        rc, out = self._mmcli(["-m", idx, "--voice-create-call=number=%s" % num])
        path = ""
        for ln in out.splitlines():
            if "/Call/" in ln:
                path = ln.strip().rstrip(".").split()[-1]
        if not path:
            return {"ok": False, "error": "voice not supported by this modem/ModemManager"}
        rc2, _ = self._mmcli(["-o", path.rsplit("/", 1)[-1], "--start"], timeout=30)
        return {"ok": rc2 == 0, "call": path.rsplit("/", 1)[-1],
                "error": None if rc2 == 0 else "could not start call"}

    def _call_paths(self):
        rc, out = self._m(["--voice-list-calls"])
        if out is None:
            return []
        return [ln.strip().rstrip(".").split()[-1] for ln in out.splitlines() if "/Call/" in ln]

    def call_state(self):
        calls = []
        for c in self._call_paths():
            rc, out = self._mmcli(["-o", c.rsplit("/", 1)[-1], "-K"])
            kv = self._kv(out)
            calls.append({"id": c.rsplit("/", 1)[-1],
                          "number": kv.get("call.properties.number", ""),
                          "direction": kv.get("call.properties.direction", ""),
                          "state": kv.get("call.properties.state", "")})
        return {"available": self.available(), "calls": calls}

    def answer(self):
        for c in self._call_paths():
            self._mmcli(["-o", c.rsplit("/", 1)[-1], "--accept"], timeout=20)
        return {"ok": True}

    def hangup(self):
        for c in self._call_paths():
            self._mmcli(["-o", c.rsplit("/", 1)[-1], "--hangup"], timeout=20)
        return {"ok": True}

    # ── GNSS / location ──────────────────────────────────────────────────────
    def location(self):
        if not self.available():
            return {"available": False}
        idx = self._modem()
        if idx is None:
            return {"available": True, "present": False}
        # ensure GPS sources are enabled (harmless if already on), then read.
        self._mmcli(["-m", idx, "--location-enable-gps-raw", "--location-enable-gps-nmea"], timeout=15)
        rc, out = self._mmcli(["-m", idx, "--location-get", "-K"])
        kv = self._kv(out)
        lat = kv.get("modem.location.gps.latitude", "")
        lon = kv.get("modem.location.gps.longitude", "")
        try:
            fix = {"lat": float(lat), "lon": float(lon),
                   "alt": kv.get("modem.location.gps.altitude", "")}
        except ValueError:
            return {"available": True, "present": True, "fix": None,
                    "reason": "No GPS fix yet (needs sky view; first fix can take a minute)."}
        return {"available": True, "present": True, "fix": fix}
