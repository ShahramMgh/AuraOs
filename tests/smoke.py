#!/usr/bin/env python3
# ============================================================================
# smoke.py — end-to-end smoke/regression suite for the AuraOS agent + shell.
#
# Boots a REAL agent on an ephemeral port with an isolated temp HOME + state,
# then exercises every subsystem the shell depends on: auth-gating, the served
# shell + assets, the Android store, Contacts/Calendar CRUD (with persistence),
# photo capture-save, file search, media, and the cellular endpoints' honest
# degrade. It asserts behaviour, not just 200s.
#
# Stdlib only. Run:  python3 tests/smoke.py   (exit 0 = pass)
# ============================================================================
import json, os, re, socket, subprocess, sys, tempfile, time
import urllib.request, urllib.error, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
AGENT = os.path.join(ROOT, "agent", "aura-agent.py")
SHELL = os.path.join(ROOT, "shell")

# a 1x1 JPEG as a data: URL (for the photo-save test)
JPEG_1x1 = ("data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////"
            "////////////////////////////////////////////////////////////////"
            "////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP"
            "/aAAgBAQABPxA=")

fails = []


def check(name, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail and not ok else ""))
    if not ok:
        fails.append(name)


def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p


def test_engine_direct():
    """Home-layout proposal (Manifest P13), positive path. A mined routine needs
    episodes spanning >=2 days, which the live `/observe` (always stamped 'now')
    can't create — so drive the Engine directly against a temp Vault with injected
    multi-day episodes and assert the propose / promote / explain / snooze / off
    behaviour. Proves the resident actually reshapes the layout from a habit."""
    import importlib
    sys.path.insert(0, os.path.join(ROOT, "agent"))
    vault = importlib.import_module("vault")
    ai_engine = importlib.import_module("ai_engine")
    tmp = tempfile.mkdtemp(prefix="aura-smoke-eng-")
    state = os.path.join(tmp, "state"); os.makedirs(state, exist_ok=True)
    eng = ai_engine.AIEngine(state, vault=vault.Vault(root=os.path.join(tmp, "vault")))

    now = int(time.time())

    def ep(app, ts, hour, minute, dow):
        return {"id": str(ts) + app + str(minute), "ts": ts, "hour": hour, "min": minute,
                "dow": dow, "action": "open_app", "args": {"name": app},
                "sig": "open_app|name=" + app, "source": "user"}
    # a weekday-morning habit: Music (4×, 2 days) and Phone (3×, 2 days) around 08:00
    eng._save(eng.f_eps, [
        ep("music", now, 8, 30, 1), ep("music", now, 8, 34, 1),
        ep("music", now - 86400, 8, 28, 0), ep("music", now - 86400, 8, 40, 0),
        ep("phone", now, 8, 45, 1), ep("phone", now, 8, 42, 1), ep("phone", now - 86400, 8, 50, 0),
    ])
    ctx = {"hour": 8, "min": 30, "dow": 1, "focus": "assistant",
           "order": ["android:org.example.app", "phone", "music", "messages"]}

    # off by default: episodes present, but intelligence off → no proposal
    check("engine: no proposal while AI is off", eng.home_proposal(ctx).get("proposal") is None)

    eng.set_settings({"enabled": True})
    prop = eng.home_proposal(ctx).get("proposal")
    check("engine: proposes a layout from a mined morning routine", prop is not None)
    if prop:
        check("engine: promotes the most-used app to focus", prop.get("focus") == "music")
        check("engine: every change is explainable with stats (P8)",
              bool(prop.get("changes")) and all("seen" in c.get("why", "") and "days" in c.get("why", "")
                                                 for c in prop["changes"]))
        check("engine: unknown android app carried through, not dropped",
              "android:org.example.app" in (prop.get("order") or []))
        eng.home_feedback(prop["id"], False)   # reject → snoozed for the rest of today
        check("engine: a rejected proposal is snoozed for the day",
              eng.home_proposal(ctx).get("proposal") is None)


def main():
    test_engine_direct()
    cfg_path = os.path.join(SHELL, "home.config.json")
    home_cfg_before = open(cfg_path, "rb").read()   # the Engine must never rewrite this
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    home = tempfile.mkdtemp(prefix="aura-smoke-home-")
    state = os.path.join(home, "state")
    # seed a file the search should find
    os.makedirs(os.path.join(home, "docs"), exist_ok=True)
    open(os.path.join(home, "docs", "quarterly-budget.txt"), "w").write("x")

    env = dict(os.environ, HOME=home, AURA_STATE_DIR=state,
               AURA_AGENT_PORT=str(port), AURA_SHELL_DIR=SHELL)
    proc = subprocess.Popen([sys.executable, AGENT], env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def req(method, path, token=None, body=None, timeout=20):
        headers = {}
        data = None
        if token:
            headers["X-Aura-Token"] = token
        if body is not None:
            data = json.dumps(body).encode(); headers["content-type"] = "application/json"
        r = urllib.request.Request(base + path, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(r, timeout=timeout) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()
        except Exception as e:               # timeout / connection — a check, not a crash
            return 0, json.dumps({"_error": str(e)}).encode()

    def j(path, token, method="GET", body=None):
        st, b = req(method, path, token, body)
        try:
            return st, json.loads(b)
        except Exception:
            return st, {}

    try:
        tokf = os.path.join(state, "agent.token")
        for _ in range(80):
            if os.path.exists(tokf):
                try:
                    if req("GET", "/auraos.css")[0] == 200:
                        break
                except Exception:
                    pass
            time.sleep(0.1)
        token = open(tokf).read().strip()
        assert token, "no token minted"

        # ---- auth + served shell ----
        check("no-token /api/status is 401", req("GET", "/api/status")[0] == 401)
        check("authed /api/status is 200", req("GET", "/api/status", token)[0] == 200)
        st, html = req("GET", "/")
        html = html.decode()
        check("shell HTML served", st == 200)
        check("token injected into shell", "__AURA_TOKEN__" in html)
        assets = sorted(set(re.findall(r'(?:href|src)="([^"]+\.(?:css|js))"', html)))
        check("all shell assets serve 200",
              all(req("GET", "/" + a.lstrip("/"), token)[0] == 200 for a in assets),
              f"{assets}")

        # ---- Android store (catalogue verified + auth-gated) ----
        check("store catalog is 401 without token", req("GET", "/api/android/store/catalog")[0] == 401)
        st, d = j("/api/android/store/catalog", token)
        check("store catalog returns apps", st == 200 and len(d.get("apps", [])) > 0)
        check("store has a Stores category", "Stores" in d.get("categories", []))
        # (store *install* is intentionally not smoke-tested — it needs a live
        #  Waydroid session + network, a Tier-3 concern, not a unit smoke check.)

        # ---- Contacts CRUD + persistence ----
        st, d = j("/api/contacts", token); check("contacts start empty", d.get("contacts") == [])
        st, d = j("/api/contacts", token, "POST", {"action": "add", "contact": {"name": "Test", "number": "5551234"}})
        cid = d["contacts"][0]["id"] if d.get("contacts") else None
        check("contact added", any(c["name"] == "Test" for c in d.get("contacts", [])))
        j("/api/contacts", token, "POST", {"action": "delete", "contact": {"id": cid}})
        st, d = j("/api/contacts", token); check("contact deleted + persisted", d.get("contacts") == [])

        # ---- Calendar CRUD + persistence ----
        st, d = j("/api/calendar", token, "POST", {"action": "add", "event": {"title": "Sync", "date": "2026-07-06", "time": "10:00"}})
        eid = d["events"][0]["id"] if d.get("events") else None
        check("event added", any(e["title"] == "Sync" for e in d.get("events", [])))
        j("/api/calendar", token, "POST", {"action": "delete", "event": {"id": eid}})
        st, d = j("/api/calendar", token); check("event deleted + persisted", d.get("events") == [])

        # ---- Photos: capture-save + traversal guard ----
        st, d = j("/api/photo/save", token, "POST", {"data": JPEG_1x1})
        check("photo saved to ~/Pictures", d.get("ok") is True and d.get("name", "").endswith(".jpg"))
        st, d = j("/api/photos", token)
        check("saved photo listed", any(i["name"].startswith("AuraOS-") for i in d.get("items", [])))
        check("photo path traversal blocked", req("GET", "/api/photo?rel=../../etc/passwd", token)[0] == 404)

        # ---- Files deep search ----
        check("files/search is 401 without token", req("GET", "/api/files/search?q=budget")[0] == 401)
        st, d = j("/api/files/search?q=budget", token)
        check("files/search finds seeded file", any("budget" in r["name"] for r in d.get("results", [])))

        # ---- Media ----
        st, d = j("/api/music", token); check("music endpoint shape", "items" in d)

        # ---- Live services (opt-in egress; these checks trigger NO fetch) ----
        check("wallpaper/daily is 401 without token", req("GET", "/api/wallpaper/daily")[0] == 401)
        check("wallpaper/list is 401 without token", req("GET", "/api/wallpaper/list")[0] == 401)
        st, _b = req("GET", "/api/wallpaper/image?id=/etc/passwd", token)
        check("wallpaper image rejects a non-Bing id (no open proxy)", st == 404)
        st, _b = req("GET", "/api/wallpaper/image?id=" +
                     urllib.parse.quote("/th?id=OHR.X/../secret"), token)
        check("wallpaper image rejects a traversal-shaped id", st == 404)
        check("weather is 401 without token", req("GET", "/api/weather?lat=1&lon=1")[0] == 401)
        st, d = j("/api/weather", token)   # no place given → honest ask, no egress
        check("weather without a place degrades honestly",
              st == 200 and d.get("available") is False and "error" in d)
        st, d = j("/api/geocode?q=", token)   # too short → empty result, no egress
        check("geocode guards short queries (no egress)",
              st == 200 and d.get("results") == [])

        # ---- Cellular (honest degrade, no modem attached) ----
        st, d = j("/api/phone/status", token)
        check("phone status honest (present:false)", d.get("available") is True and d.get("present") is False)
        st, d = j("/api/phone/dial", token, "POST", {"number": "5550100"})
        check("dial degrades honestly", d.get("ok") is False)
        st, d = j("/api/location", token); check("location endpoint responds", st == 200)

        # ---- AI Engine backend detection (skip inference; just detection) ----
        st, d = j("/api/ai/status", token)
        check("ai status responds", st == 200 and "backend" in d)
        check("ai reports memory lives in the Vault, encrypted",
              d.get("memory", {}).get("vault") is True and d["memory"].get("encrypted") is True)

        # ---- AI memory is ENCRYPTED at rest (Manifest P11) ----
        secret = "smoke-secret-allergic-to-penicillin"
        j("/api/ai/memory/add", token, "POST", {"text": secret})
        st, d = j("/api/ai/memory", token)
        check("memory saved + readable via API", any(secret in m.get("text", "") for m in (d if isinstance(d, list) else [])))
        vault_dir = os.path.join(home, ".local", "share", "aura", "vault")
        enc = os.path.join(vault_dir, "ai_memory.enc")
        blob = open(enc, "rb").read() if os.path.exists(enc) else b""
        check("memory stored as an encrypted envelope", blob.startswith(b"AVLT"))
        check("plaintext memory never hits the disk", secret.encode() not in blob)
        check("no plaintext ai_memory.json left in state dir",
              not os.path.exists(os.path.join(state, "ai_memory.json")))

        # ---- AI home-layout proposal (Manifest P13) ----
        # off by default: with intelligence off, the resident proposes nothing.
        st, d = j("/api/ai/home/proposal", token)
        check("home proposal off when AI is off", st == 200 and d.get("proposal") is None)
        # turn intelligence on, then feed a few same-day launches: one day of data
        # is deliberately not enough to mine a routine, so it stays conservative.
        j("/api/ai/settings", token, "POST", {"enabled": True})
        for _ in range(3):
            j("/api/ai/observe", token, "POST", {"action": "open_app", "args": {"name": "music"}, "source": "user"})
        st, d = j("/api/ai/home/proposal?focus=assistant&order=phone,music", token)
        check("home proposal conservative on one day of data", st == 200 and d.get("proposal") is None)
        # accepting/rejecting a proposal is explainable + logged (P8)
        st, d = j("/api/ai/home/feedback", token, "POST", {"id": "home-x", "accept": True, "applied": {"focus": "music"}})
        check("home accept acknowledged", d.get("ok") is True)
        st, d = j("/api/ai/home/feedback", token, "POST", {"id": "home-x", "accept": False})
        check("home reject acknowledged", d.get("ok") is True)
        st, acts = j("/api/ai/activity", token)
        home_acts = [(a.get("kind"), a.get("summary", "")) for a in (acts if isinstance(acts, list) else [])]
        check("home accept logged (P8)", any(k == "home" and "Applied" in s for k, s in home_acts))
        check("home reject logged (P8)", any(k == "home" and "Dismissed" in s for k, s in home_acts))
        # USER AUTHORITY: the served home.config.json is never rewritten by the
        # Engine — it only proposes; the user's own layout store is the authority.
        st, served = j("/home.config.json", token)
        check("served home.config.json stays the hand-authored default",
              served.get("generatedBy") == "default" and served.get("updated") is None)
        check("Engine never rewrote home.config.json on disk",
              open(cfg_path, "rb").read() == home_cfg_before)

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()

    print()
    if fails:
        print(f"SMOKE FAILED: {len(fails)} check(s) — {fails}")
        sys.exit(1)
    print("OK: all smoke checks pass.")


if __name__ == "__main__":
    main()
