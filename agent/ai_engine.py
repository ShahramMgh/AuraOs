# ============================================================================
# ai_engine.py — AuraOS Native Intelligence Layer (Phase II, v0)
# ----------------------------------------------------------------------------
# The AI Engine is a system service, not an app. Applications never talk to a
# model directly — they talk to this Engine, which owns:
#   - model management + inference (via replaceable backends; Ollama first)
#   - the AI-permission store (independent from app permissions)
#   - user-owned memory (local, inspectable, deletable)
#   - the activity log (every AI action is explainable)
#   - the master switch, kill switch, and trust level
#
# The resident's mind is built as ONE loop, and nothing about it is hardcoded to
# a keyword:
#
#     intent + situation + CAPABILITY CATALOG + learned routines
#              → the model reasons → a PLAN (0..n capability calls)
#              → the OS/user adjudicates → the agent executes
#              → the action is OBSERVED → routines are learned
#              → routines drive proactive SUGGESTIONS
#
# The capability CATALOG is the single source of what the resident can do; the
# Engine turns it into the model's tools at runtime, so adding a capability makes
# the AI able to use it with no code change and no intent→action rule anywhere.
#
# Governed by AI-MANIFEST.md. Non-negotiables enforced here:
#   - OFF BY DEFAULT (P-defaults): enabled=False until the user turns it on.
#   - LOCAL-FIRST (P3): inference runs on-device; cloud is never implicit.
#   - OS AUTHORITY (P2): a model's output is a *proposal*, never an action.
#   - KILL SWITCH is absolute: when killed, nothing runs, period.
#   - Observation/learning only while the AI is ON, and every episode/routine is
#     local, inspectable and deletable (P11).
# Pure standard library — nothing to install on the minimal base.
# ============================================================================
import json, os, re, time, urllib.request
from collections import Counter
from vault import Vault   # Manifest P11 — memory lives encrypted in the Vault

OLLAMA = "http://127.0.0.1:11434"

# The model shipped as the OS default — Gemma 4 2B (edge, QAT 4-bit, ~4.3 GB),
# capable enough for multi-step tool-use yet fitting an 8 GB Raspberry Pi 5
# alongside the shell. Override at build/boot via AURA_AI_MODEL, or per-request
# via settings.model.
DEFAULT_MODEL = os.environ.get("AURA_AI_MODEL", "gemma4:e2b-it-qat")

DEFAULT_SETTINGS = {
    "enabled": False,       # off by default — the device is fully usable without AI
    "killed": False,        # absolute kill switch
    "trustLevel": 1,        # 0 observe · 1 recommend · 2 approve · 3 auto
    "allowCloud": False,    # cloud is an opt-in extension, never a dependency
    "provider": "ollama",
    "model": "",
}
# Context sources are independently authorized and default to DENY (P12).
DEFAULT_PERMS = {"files": "deny", "calendar": "deny", "location": "deny",
                 "photos": "deny", "messages": "deny"}

# ============================================================================
# CAPABILITY CATALOG — the single source of what the resident can DO.
# ----------------------------------------------------------------------------
# Each entry is self-describing. The Engine turns the WHOLE catalog into the
# model's tool list at runtime (`_tools`), so there is no per-capability code in
# the reasoning path and no keyword that maps an intent to an action — the model
# composes actions by reasoning over this data. Add an entry here (or extend it
# from the agent) and the resident can use it immediately; the agent's
# capability registry advertises the very same list.
#
# `id` is also the executor name the shell/OS implements (OS authority, P2):
# the model may PROPOSE any of these; the OS is what actually performs them.
# ============================================================================
CAPABILITIES = [
    {"id": "open_app", "title": "Open an app", "affects": ["apps"], "reversible": False,
     "desc": "Open or launch an application by its name (e.g. Camera, Music, Software, Files).",
     "args": {"name": {"type": "string", "desc": "the app's name"}}, "required": ["name"]},
    {"id": "set_brightness", "title": "Set brightness", "affects": ["display"], "reversible": True,
     "desc": "Set the screen brightness to a percentage (0 = dim, 100 = bright).",
     "args": {"percent": {"type": "integer", "desc": "0 to 100"}}, "required": ["percent"]},
    {"id": "set_volume", "title": "Set volume", "affects": ["sound"], "reversible": True,
     "desc": "Set the output volume to a percentage (0 to 100).",
     "args": {"percent": {"type": "integer", "desc": "0 to 100"}}, "required": ["percent"]},
    {"id": "set_dnd", "title": "Silence / Do Not Disturb", "affects": ["sound"], "reversible": True,
     "desc": "Put the phone on silent — mute sound and notifications. on=true silences, on=false restores.",
     "args": {"on": {"type": "boolean"}}, "required": ["on"]},
    {"id": "play_music", "title": "Play music", "affects": ["sound", "apps"], "reversible": False,
     "desc": "Start music playback, optionally in a mood (e.g. calm, focus, sleep).",
     "args": {"mood": {"type": "string", "desc": "optional mood or genre"}}, "required": []},
    {"id": "toggle_wifi", "title": "Wi-Fi on/off", "affects": ["network"], "reversible": True,
     "desc": "Turn Wi-Fi on or off.",
     "args": {"on": {"type": "boolean"}}, "required": ["on"]},
    {"id": "toggle_bluetooth", "title": "Bluetooth on/off", "affects": ["network"], "reversible": True,
     "desc": "Turn Bluetooth on or off.",
     "args": {"on": {"type": "boolean"}}, "required": ["on"]},
    {"id": "open_settings", "title": "Open a settings screen", "affects": ["apps"], "reversible": False,
     "desc": "Open a settings/system screen.",
     "args": {"screen": {"type": "string",
                         "desc": "one of: wifi, display, sound, permissions, network, about, personalize, power"}},
     "required": ["screen"]},
    {"id": "create_note", "title": "Save a note", "affects": ["notes"], "reversible": False,
     "desc": "Create a note with the given text.",
     "args": {"text": {"type": "string"}}, "required": ["text"]},
    {"id": "lock_device", "title": "Lock the device", "affects": ["system"], "reversible": False,
     "desc": "Lock the device screen.",
     "args": {}, "required": []},
    {"id": "create_event", "title": "Add a calendar event", "affects": ["calendar"], "reversible": True,
     "desc": "Add an event to the calendar. Use the current date from context to compute 'date' as "
             "YYYY-MM-DD; 'time' is HH:MM in 24-hour form (optional).",
     "args": {"title": {"type": "string"}, "date": {"type": "string", "desc": "YYYY-MM-DD"},
              "time": {"type": "string", "desc": "HH:MM 24h, optional"}}, "required": ["title", "date"]},
    {"id": "send_sms", "title": "Send a text message", "affects": ["messages", "network"], "reversible": False,
     "desc": "Send an SMS. 'to' is a contact name or a phone number; 'text' is the message body.",
     "args": {"to": {"type": "string"}, "text": {"type": "string"}}, "required": ["to", "text"]},
    {"id": "call_contact", "title": "Call someone", "affects": ["phone"], "reversible": False,
     "desc": "Place a phone call. 'to' is a contact name or a phone number.",
     "args": {"to": {"type": "string"}}, "required": ["to"]},
    {"id": "search", "title": "Search the device", "affects": ["apps"], "reversible": False,
     "desc": "Search across apps, contacts, notes, files, music and photos for a query.",
     "args": {"query": {"type": "string"}}, "required": ["query"]},
    {"id": "web_search", "title": "Search the web", "affects": ["apps", "network"], "reversible": False,
     "desc": "Open the browser and search the web for a query.",
     "args": {"query": {"type": "string"}}, "required": ["query"]},
]
CAP_BY_ID = {c["id"]: c for c in CAPABILITIES}

# Plain-language verb per capability — used only to describe a routine or a
# proposal to the user (never to decide anything). Display, not logic.
_VERB = {
    "open_app": "opens {name}", "set_brightness": "changes the brightness",
    "set_volume": "changes the volume", "set_dnd": "silences the phone",
    "play_music": "plays music", "toggle_wifi": "toggles Wi-Fi",
    "toggle_bluetooth": "toggles Bluetooth", "open_settings": "opens a settings screen",
    "create_note": "writes a note", "lock_device": "locks the phone",
    "create_event": "adds a calendar event", "send_sms": "sends a text",
    "call_contact": "makes a call", "search": "searches the device",
    "web_search": "searches the web",
}

SYSTEM_PROMPT = (
    "You are the on-device resident assistant for AuraOS, a privacy-first "
    "operating system — a calm, caring presence that lives inside the user's own "
    "device and runs entirely locally. You perceive the device's situation (time, "
    "battery, connectivity) and use it naturally. Be concise, warm and honest. You "
    "never send data anywhere and never claim to.\n"
    "When the user wants something DONE, you don't need a magic phrase: reason "
    "about their intent and the capabilities you have, and propose the fitting "
    "capability call(s). A request may need SEVERAL steps — e.g. winding down for "
    "sleep might mean silencing the phone, dimming the screen, and playing calm "
    "music — so propose them together as a short plan. For a plain question, just "
    "answer in words and call no tools. Never invent capabilities you weren't given."
)


class AIEngine:
    def __init__(self, state_dir, vault=None):
        self.dir = state_dir
        os.makedirs(state_dir, exist_ok=True)
        self.f_settings = os.path.join(state_dir, "ai_settings.json")
        self.f_perms = os.path.join(state_dir, "ai_permissions.json")
        self.f_act = os.path.join(state_dir, "ai_activity.json")
        self.f_dismiss = os.path.join(state_dir, "ai_dismissed.json")  # snoozed suggestions
        # Memory (P11): the user-owned facts and the experiential log are the
        # sensitive, personal records. They live ENCRYPTED in the Vault, keyed
        # by logical name (not a plaintext file path). Settings/perms/activity
        # stay plain in the state dir — they are config and the inspectable
        # transparency log, not personal memory.
        self.vault = vault or Vault()
        self.f_mem = "ai_memory"                       # -> Vault (encrypted)
        self.f_eps = "ai_episodes"                     # -> Vault (encrypted)
        self._encrypted = {self.f_mem, self.f_eps}
        self._migrate_plaintext(state_dir)

    def _migrate_plaintext(self, state_dir):
        """One-time move: if a previous build left plaintext memory in the state
        dir, seal it into the Vault and delete the plaintext so P11 holds. Only
        runs when the Vault is available (unlocked)."""
        if not self.vault.available():
            return
        for name in (self.f_mem, self.f_eps):
            legacy = os.path.join(state_dir, name + ".json")
            if os.path.exists(legacy) and not self.vault.has(name):
                try:
                    with open(legacy) as fh:
                        self.vault.write_json(name, json.load(fh))
                    os.remove(legacy)
                except Exception:
                    pass   # leave the plaintext for the user rather than lose it

    # ---- json store helpers ------------------------------------------------
    def _load(self, path, default):
        if path in self._encrypted:
            return self.vault.read_json(path, default)
        try:
            with open(path) as fh:
                return json.load(fh)
        except Exception:
            return json.loads(json.dumps(default))   # deep copy of default

    def _save(self, path, data):
        if path in self._encrypted:
            self.vault.write_json(path, data)         # sealed, then atomic-replaced
            return
        tmp = path + ".tmp"
        with open(tmp, "w") as fh:
            json.dump(data, fh, indent=2)
        os.replace(tmp, path)

    def _id(self):
        return str(time.time_ns())

    # ---- settings ----------------------------------------------------------
    def settings(self):
        s = self._load(self.f_settings, DEFAULT_SETTINGS)
        for k, v in DEFAULT_SETTINGS.items():
            s.setdefault(k, v)
        if s["killed"]:
            s["enabled"] = False
        return s

    def set_settings(self, patch):
        s = self.settings()
        for k in ("enabled", "killed", "allowCloud"):
            if k in patch:
                s[k] = bool(patch[k])
        if "trustLevel" in patch:
            try:
                s["trustLevel"] = max(0, min(3, int(patch["trustLevel"])))
            except Exception:
                pass
        if "provider" in patch:
            s["provider"] = str(patch["provider"])
        if "model" in patch:
            s["model"] = str(patch["model"])
        if s["killed"]:
            s["enabled"] = False
        self._save(self.f_settings, s)
        if patch.get("killed"):
            self.log("kill", "AI Engine emergency-stopped",
                     "You engaged the kill switch; all AI is disabled.")
        elif "enabled" in patch:
            self.log("power", "Intelligence turned " + ("on" if s["enabled"] else "off"),
                     "You changed whether the AI Engine is active.")
        return s

    # ---- AI permissions (independent of app permissions) -------------------
    def perms(self):
        p = self._load(self.f_perms, DEFAULT_PERMS)
        for k, v in DEFAULT_PERMS.items():
            p.setdefault(k, v)
        return p

    def set_perm(self, source, value):
        p = self.perms()
        if source in DEFAULT_PERMS and value in ("allow", "ask", "deny"):
            p[source] = value
            self._save(self.f_perms, p)
            self.log("permission", f"{source.capitalize()} access set to {value}",
                     f"You changed whether the assistant may use your {source}.")
        return p

    # ---- memory (user-owned) ----------------------------------------------
    def memory(self):
        m = self._load(self.f_mem, [])
        return m if isinstance(m, list) else []

    def add_memory(self, text, tags=None):
        text = (text or "").strip()
        if not text:
            return self.memory()
        mem = self.memory()
        mem.insert(0, {"id": self._id(), "text": text, "ts": int(time.time()),
                       "tags": tags or []})
        self._save(self.f_mem, mem[:500])
        self.log("memory", "Saved a memory", f"You asked to remember: {text[:80]}")
        return mem

    def del_memory(self, mid):
        mem = [m for m in self.memory() if m.get("id") != mid]
        self._save(self.f_mem, mem)
        return mem

    def clear_memory(self):
        self._save(self.f_mem, [])
        self.log("memory", "Cleared all memories", "You deleted the assistant's memory.")
        return []

    # ---- activity log (explainability) ------------------------------------
    def activity(self):
        a = self._load(self.f_act, [])
        return a if isinstance(a, list) else []

    def log(self, kind, summary, why, undoable=False):
        act = self.activity()
        act.insert(0, {"id": self._id(), "ts": int(time.time()), "kind": kind,
                       "summary": summary, "why": why, "undoable": undoable})
        self._save(self.f_act, act[:500])

    def clear_activity(self):
        self._save(self.f_act, [])
        return []

    # ========================================================================
    # EXPERIENTIAL MEMORY — the resident learns from what actually happens.
    # ------------------------------------------------------------------------
    # Every action (the user's own, or one the resident performed) is logged as
    # an *episode* with its context: the hour, the weekday, and the concrete
    # arguments. This is the raw material routines are mined from. It is written
    # ONLY while the AI is on (no silent recording when intelligence is off), and
    # every episode is local, inspectable and deletable (P11).
    # ========================================================================
    def episodes(self):
        e = self._load(self.f_eps, [])
        return e if isinstance(e, list) else []

    def _scalar_args(self, args):
        """Keep only concrete scalar arguments — the shape routines group on."""
        out = {}
        if isinstance(args, dict):
            for k, v in args.items():
                if isinstance(v, bool) or isinstance(v, (int, float)):
                    out[k] = v
                elif isinstance(v, str) and v.strip():
                    out[k] = v.strip()[:64]
        return out

    def _sig(self, action, args):
        """A stable identity for a habit: the action plus its *categorical*
        arguments (strings/bools). Numeric values (a brightness %) don't change
        which habit it is, so they're excluded from the signature."""
        parts = []
        for k in sorted(args or {}):
            v = args[k]
            if isinstance(v, bool):
                parts.append(f"{k}={'true' if v else 'false'}")
            elif isinstance(v, str) and v.strip():
                parts.append(f"{k}={v.strip().lower()[:24]}")
        return action + "|" + ",".join(parts)

    def observe(self, action, args=None, source="user"):
        """Record one thing that happened, with its context. No-op while the AI
        is off. `source` is 'user' or 'assistant' — kept for transparency."""
        if action not in CAP_BY_ID:
            return
        if not self.settings()["enabled"]:
            return
        t = time.localtime()
        sc = self._scalar_args(args)
        ep = {"id": self._id(), "ts": int(time.time()),
              "hour": t.tm_hour, "min": t.tm_min, "dow": t.tm_wday,
              "action": action, "args": sc, "sig": self._sig(action, sc),
              "source": source}
        eps = self.episodes()
        eps.insert(0, ep)
        self._save(self.f_eps, eps[:3000])

    def clear_episodes(self):
        self._save(self.f_eps, [])
        self.log("memory", "Cleared learned behaviour",
                 "You deleted the resident's episodic history and routines.")
        return []

    # ---- routine mining ----------------------------------------------------
    # A routine is a habit the resident has noticed: the same action, around the
    # same time of day, on enough distinct days to be a pattern rather than a
    # coincidence. Deliberately simple and on-device (no ML): frequency + a modal
    # hour. Everything here is derived live from `episodes()`, so it is always
    # explainable ("seen N times, on D days, usually ~HH:MM") and disappears the
    # moment the underlying episodes are cleared.
    def routines(self, min_count=3, min_days=2):
        groups = {}
        for e in self.episodes():
            groups.setdefault(e.get("sig") or self._sig(e["action"], e.get("args")), []).append(e)
        out = []
        for sig, evs in groups.items():
            if len(evs) < min_count:
                continue
            days = {e["ts"] // 86400 for e in evs}
            if len(days) < min_days:
                continue
            # the modal hour, and the average minute within it
            hour, _ = Counter(e["hour"] for e in evs).most_common(1)[0]
            in_hour = [e for e in evs if e["hour"] == hour]
            minute = round(sum(e["min"] for e in in_hour) / len(in_hour))
            action = evs[0]["action"]
            rep_args = evs[0].get("args", {})   # most-recent concrete args (e.g. the % used)
            dows = sorted({e["dow"] for e in evs})
            out.append({
                "id": sig, "action": action, "args": rep_args,
                "hour": hour, "min": minute, "count": len(evs), "days": len(days),
                "dows": dows, "confidence": round(min(1.0, len(evs) / 6.0), 2),
                "phrase": self._routine_phrase(action, rep_args, hour, minute),
            })
        out.sort(key=lambda r: (-r["confidence"], -r["count"]))
        return out

    def _routine_phrase(self, action, args, hour, minute):
        verb = _VERB.get(action, action.replace("_", " "))
        if "{name}" in verb:
            verb = verb.format(name=str((args or {}).get("name", "an app")).title())
        return f"usually {verb} around {hour:02d}:{minute:02d}"

    # ---- proactive suggestions --------------------------------------------
    def _dismissed_today(self):
        today = int(time.time()) // 86400
        d = self._load(self.f_dismiss, [])
        return {x["id"] for x in d if isinstance(x, dict) and x.get("day") == today}

    def suggest(self, ctx=None):
        """Given the current moment, offer at most ONE thing the resident has
        learned the user tends to do now — as a proposal, never an act. Returns
        {"suggestion": {...}} or {"suggestion": None}. The user accepts (it runs
        through the normal consent/execute path) or dismisses (snoozed for today)."""
        if not self.settings()["enabled"]:
            return {"suggestion": None}
        t = time.localtime()
        hour = int((ctx or {}).get("hour", t.tm_hour))
        minute = int((ctx or {}).get("min", t.tm_min))
        dow = int((ctx or {}).get("dow", t.tm_wday))
        now = hour * 60 + minute
        today = int(time.time()) // 86400
        done = {e.get("sig") for e in self.episodes() if e["ts"] // 86400 == today}
        dismissed = self._dismissed_today()

        best = None
        for r in self.routines():
            if r["id"] in done or r["id"] in dismissed:
                continue                             # already did it / snoozed today
            dows = r["dows"]
            weekday_only = dows and all(d < 5 for d in dows)
            weekend_only = dows and all(d >= 5 for d in dows)
            if weekday_only and dow >= 5:
                continue
            if weekend_only and dow < 5:
                continue
            rmin = r["hour"] * 60 + r["min"]
            # a gentle window: from ~40 min before the usual time to ~20 after
            if not (-40 <= now - rmin <= 20):
                continue
            if best is None or r["confidence"] > best["confidence"]:
                best = r
        if not best:
            return {"suggestion": None}

        why = (f"You often do this around {best['hour']:02d}:{best['min']:02d}"
               f" — seen {best['count']} times over {best['days']} days.")
        return {"suggestion": {
            "id": best["id"], "why": why, "confidence": best["confidence"],
            "plan": [{"name": best["action"], "args": best["args"],
                      "why": why}],
        }}

    def suggestion_feedback(self, rid, accept):
        """Accepting is recorded via the resulting action's own observation; here
        we only handle a dismissal — snooze this routine for the rest of the day
        so the resident doesn't nag. Calm by design; nothing is punished."""
        if accept:
            self.log("suggest", "Accepted a suggestion",
                     "You accepted something the resident offered.")
            return {"ok": True}
        today = int(time.time()) // 86400
        d = self._load(self.f_dismiss, [])
        d = [x for x in d if isinstance(x, dict) and x.get("day") == today]
        d.append({"id": rid, "day": today})
        self._save(self.f_dismiss, d[-200:])
        self.log("suggest", "Dismissed a suggestion",
                 "You dismissed a suggestion; it won't come back today.")
        return {"ok": True}

    # ---- backend (replaceable; Ollama first) ------------------------------
    def backend(self):
        s = self.settings()
        if s["provider"] == "ollama":
            try:
                req = urllib.request.Request(OLLAMA + "/api/tags")
                with urllib.request.urlopen(req, timeout=1.5) as r:
                    data = json.loads(r.read())
                models = [m.get("name", "") for m in data.get("models", []) if m.get("name")]
                # Prefer the user's choice, then the shipped default, then any.
                model = s.get("model")
                if not model or model not in models:
                    model = (DEFAULT_MODEL if DEFAULT_MODEL in models
                             else (models[0] if models else ""))
                return {"available": bool(models), "kind": "ollama",
                        "models": models, "model": model}
            except Exception:
                return {"available": False, "kind": "ollama", "models": [], "model": ""}
        return {"available": False, "kind": s["provider"], "models": [], "model": ""}

    def status(self):
        s = self.settings()
        return {
            "enabled": s["enabled"], "killed": s["killed"],
            "trustLevel": s["trustLevel"], "allowCloud": s["allowCloud"],
            "provider": s["provider"], "backend": self.backend(),
            "memoryCount": len(self.memory()), "activityCount": len(self.activity()),
            "episodeCount": len(self.episodes()), "routineCount": len(self.routines()),
            "memory": self.vault.status(),   # P11 — where the user's memory lives + how it's protected
            "perms": self.perms(),
        }

    # ========================================================================
    # INFERENCE (local-first) + PLAN COMPOSITION
    # ========================================================================
    def _tools(self, caps=None):
        """Turn the capability catalog into the model's tool schema — at runtime,
        with no per-capability code. This is what makes the resident un-hardcoded:
        it reasons over whatever capabilities exist, not a fixed switch."""
        tools = []
        for c in (caps or CAPABILITIES):
            props = {}
            for an, a in (c.get("args") or {}).items():
                spec = {"type": a.get("type", "string")}
                if a.get("desc"):
                    spec["description"] = a["desc"]
                props[an] = spec
            tools.append({"type": "function", "function": {
                "name": c["id"], "description": c.get("desc", c.get("title", "")),
                "parameters": {"type": "object", "properties": props,
                               "required": c.get("required", [])}}})
        return tools

    def _messages(self, prompt, use_memory, situation):
        """Assemble the message list: persona, the perceived device situation (so
        the resident knows its house), remembered facts, the patterns it has
        learned about the user, then the prompt."""
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        if situation:
            messages.append({"role": "system", "content": "Current device situation — " + situation})
        if use_memory:
            mems = [m["text"] for m in self.memory()[:8]]
            if mems:
                messages.append({"role": "system",
                                 "content": "Things the user asked you to remember:\n- "
                                            + "\n- ".join(mems)})
        rts = self.routines()[:4]
        if rts:
            messages.append({"role": "system",
                             "content": "Patterns you've quietly noticed about this user "
                                        "(use them to be helpful, never intrusive):\n- "
                                        + "\n- ".join(r["phrase"] for r in rts)})
        messages.append({"role": "user", "content": prompt})
        return messages

    # Turn a raw call (native tool_calls OR tool-ish text) into a clean action —
    # or reject it. A ~1B model often nests args, echoes the schema, or omits
    # values; keep only concrete scalar values for the capability's declared
    # params, unwrapping a layer or two, and require the required ones.
    def _sanitize_call(self, name, args):
        cap = CAP_BY_ID.get(name)
        if not cap:
            return None
        props = cap.get("args", {})
        required = cap.get("required", [])
        if not isinstance(args, dict):
            args = {}
        for _ in range(3):   # unwrap {"parameters": {...}} / {"arguments": {...}}
            if not any(k in props for k in args):
                nested = args.get("parameters") or args.get("arguments")
                if isinstance(nested, dict):
                    args = nested
                    continue
            break
        clean = {k: v for k, v in args.items() if k in props and not isinstance(v, (dict, list))}
        if any(rk not in clean for rk in required):
            return None
        return {"name": name, "args": clean}

    def _parse_plan_text(self, text):
        """A small on-device model sometimes writes its plan as plain JSON text
        instead of using the native tool_calls channel. Recover a plan from the
        shapes llama3.2 tends to emit: {"plan":[...]}, a bare call object, or a
        JSON array of calls."""
        t = (text or "").strip()
        if not (t.startswith("{") or t.startswith("[")):
            return []
        obj = None
        try:
            obj = json.loads(t)
        except Exception:
            m = re.search(r"[\{\[].*[\}\]]", t, re.S)
            if m:
                try:
                    obj = json.loads(m.group(0))
                except Exception:
                    obj = None
        if obj is None:
            return []
        if isinstance(obj, dict) and isinstance(obj.get("plan"), list):
            raw = obj["plan"]
        elif isinstance(obj, list):
            raw = obj
        else:
            raw = [obj]
        calls = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            fn = item.get("function", item)
            if isinstance(fn, dict):
                name = fn.get("name")
                args = fn.get("arguments") or fn.get("parameters") or item.get("args") or {}
            else:
                name, args = fn, item.get("arguments") or item.get("args") or {}
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except Exception:
                    args = {}
            calls.append({"name": name, "args": args if isinstance(args, dict) else {}})
        return calls

    def _resolve_plan(self, native_calls, text):
        """Sanitize a list of candidate calls (native first, then tool-ish text)
        into an ordered plan of real actions. Drops anything that doesn't
        sanitize; de-duplicates identical steps. Empty list = no plan."""
        candidates = list(native_calls or [])
        if not candidates:
            candidates = self._parse_plan_text(text)
        plan, seen = [], set()
        for c in candidates:
            if not c or not c.get("name"):
                continue
            clean = self._sanitize_call(c["name"], c.get("args"))
            if not clean:
                continue
            key = clean["name"] + "|" + json.dumps(clean["args"], sort_keys=True)
            if key in seen:
                continue
            seen.add(key)
            plan.append(clean)
        return plan

    def chat(self, prompt, use_memory=False, situation=""):
        """Non-streamed answer (kept for parity; the shell streams). Text only —
        planning happens on the streamed path where the UI can render a plan card."""
        s = self.settings()
        if s["killed"]:
            return {"ok": False, "reason": "killed"}
        if not s["enabled"]:
            return {"ok": False, "reason": "disabled"}
        prompt = (prompt or "").strip()
        if not prompt:
            return {"ok": False, "reason": "empty"}

        b = self.backend()
        if not b["available"]:
            self.log("chat", "Could not answer locally", f"You asked: {prompt[:100]}")
            return {"ok": False, "reason": "no-backend", "ranLocally": False,
                    "canCloud": s["allowCloud"],
                    "message": f"No local model is available yet. Install the "
                               f"default with `ollama pull {DEFAULT_MODEL}` — or, "
                               f"if you allow it, a cloud model could answer this."}

        messages = self._messages(prompt, use_memory, situation)
        try:
            # think=False: Gemma 4 (and other reasoning models) otherwise spend the
            # whole token budget on a hidden chain-of-thought and return empty
            # content — and on a Pi we want fast, direct answers/tool-calls. Ollama
            # ignores this for non-reasoning models, so it's safe.
            payload = json.dumps({"model": b["model"], "messages": messages,
                                  "stream": False, "think": False}).encode()
            req = urllib.request.Request(OLLAMA + "/api/chat", data=payload,
                                         headers={"content-type": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                data = json.loads(r.read())
            text = (data.get("message") or {}).get("content", "").strip()
        except Exception as e:
            self.log("chat", "Local inference error", f"You asked: {prompt[:100]}")
            return {"ok": False, "reason": "error", "message": f"Local model error: {e}"}

        self.log("chat", prompt[:60], f"You asked: {prompt[:120]}")
        return {"ok": True, "text": text, "ranLocally": True, "model": b["model"]}

    # ---- inference, streamed (token-by-token) + plan composition ----------
    def chat_stream(self, prompt, use_memory=False, situation=""):
        """Same policy as chat() (kill switch, off-by-default, local-first,
        no-backend), but yields events as the model generates:
            {"delta": "..."}                              incremental text
            {"plan": [{name,args,why}], "trustLevel": n}  proposed action(s)
            {"done": True, "text": full, "model": ...}    final (words only)
            {"error": reason, "message": ...}             refused / failed
        The plan is a PROPOSAL — the Engine never executes; the OS/user does."""
        s = self.settings()
        if s["killed"]:
            yield {"error": "killed"}; return
        if not s["enabled"]:
            yield {"error": "disabled"}; return
        prompt = (prompt or "").strip()
        if not prompt:
            yield {"error": "empty"}; return

        b = self.backend()
        if not b["available"]:
            self.log("chat", "Could not answer locally", f"You asked: {prompt[:100]}")
            yield {"error": "no-backend", "canCloud": s["allowCloud"],
                   "message": f"No local model is available yet. Install the default "
                              f"with `ollama pull {DEFAULT_MODEL}` — or, if you allow it, "
                              f"a cloud model could answer this."}
            return

        messages = self._messages(prompt, use_memory, situation)

        # Tools are offered whenever the resident is allowed to act (trust >= 1).
        # There is NO keyword gate: the model itself decides whether the intent
        # needs actions (a plan) or just words. It reasons over the whole catalog.
        want_tools = s.get("trustLevel", 1) >= 1
        body = {"model": b["model"], "messages": messages, "stream": True, "think": False}
        if want_tools:
            body["tools"] = self._tools()

        full, native_calls = [], []
        try:
            req = urllib.request.Request(OLLAMA + "/api/chat", data=json.dumps(body).encode(),
                                         headers={"content-type": "application/json"})
            with urllib.request.urlopen(req, timeout=300) as r:
                for raw in r:                       # ollama emits one JSON object per line
                    raw = raw.strip()
                    if not raw:
                        continue
                    try:
                        obj = json.loads(raw)
                    except Exception:
                        continue
                    msg = obj.get("message") or {}
                    delta = msg.get("content", "")
                    if delta:
                        full.append(delta)
                        yield {"delta": delta}
                    for tc in (msg.get("tool_calls") or []):     # collect ALL → a plan
                        fn = (tc or {}).get("function") or {}
                        args = fn.get("arguments")
                        if isinstance(args, str):
                            try:
                                args = json.loads(args)
                            except Exception:
                                args = {}
                        native_calls.append({"name": fn.get("name"), "args": args or {}})
                    if obj.get("done"):
                        break
        except Exception as e:
            self.log("chat", "Local inference error", f"You asked: {prompt[:100]}")
            yield {"error": "error", "message": f"Local model error: {e}"}
            return

        text = "".join(full).strip()
        plan = self._resolve_plan(native_calls, text) if want_tools else []

        if plan:
            # The resident wants to act. Propose the plan to the OS/user — do NOT
            # execute here; the shell confirms (or auto-runs at trust 3) and the
            # agent runs each step, which is then observed and learned from.
            yield {"plan": plan, "trustLevel": s.get("trustLevel", 1)}
            self.log("chat", prompt[:60], f"You asked: {prompt[:120]}")
            return

        # Tool-ish JSON we couldn't turn into a real plan — don't surface raw JSON.
        if re.search(r'"(function|parameters|properties|arguments|plan)"\s*:', text):
            text = "I didn't quite catch that — could you rephrase it?"

        self.log("chat", prompt[:60], f"You asked: {prompt[:120]}")
        yield {"done": True, "text": text, "ranLocally": True, "model": b["model"]}
