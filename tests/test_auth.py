#!/usr/bin/env python3
# ============================================================================
# test_auth.py — regression test for local-API authentication
# ----------------------------------------------------------------------------
# Blueprint P3 3.3.1 / P6 6.6.1: every /api/* route must require the per-boot
# session token. This test boots a real agent on an ephemeral port with a temp
# state dir and asserts that:
#   - unauthenticated /api/* calls are refused (401) — including /api/exec and
#     /api/files/*, the ones that run commands / read files;
#   - a wrong token is refused;
#   - the correct token (as header OR ?t= query) is accepted;
#   - the shell HTML the agent serves carries the token injected;
#   - static assets stay public (the browser must load them pre-token).
#
# Stdlib only; run:  python3 tests/test_auth.py   (exit 0 = pass)
# ============================================================================
import json, os, subprocess, sys, time, urllib.request, urllib.error, tempfile, socket

HERE = os.path.dirname(os.path.abspath(__file__))
AGENT = os.path.join(HERE, "..", "agent", "aura-agent.py")


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def call(method, url, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"content-type": "application/json"}
    if token:
        headers["X-Aura-Token"] = token
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def main():
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    state = tempfile.mkdtemp(prefix="sov-authtest-")
    env = dict(os.environ, AURA_STATE_DIR=state, AURA_AGENT_PORT=str(port))
    proc = subprocess.Popen([sys.executable, AGENT], env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    fails = []

    def check(name, got, want):
        ok = got == want
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}: got {got!r}, want {want!r}")
        if not ok:
            fails.append(name)

    try:
        # wait for the token file (written at startup) + the port to answer
        tok_file = os.path.join(state, "agent.token")
        for _ in range(50):
            if os.path.exists(tok_file):
                try:
                    call("GET", base + "/auraos.css")
                    break
                except Exception:
                    pass
            time.sleep(0.1)
        token = open(tok_file).read().strip()
        assert token, "no token minted"

        # --- the guarantees ---
        check("no-token /api/status refused", call("GET", base + "/api/status")[0], 401)
        check("no-token /api/exec refused",
              call("POST", base + "/api/exec", body={"cmd": "id"})[0], 401)
        check("no-token /api/files/read refused",
              call("GET", base + "/api/files/read?path=/etc/passwd")[0], 401)
        check("wrong-token refused", call("GET", base + "/api/status", token="wrong")[0], 401)
        check("good-token /api/status ok", call("GET", base + "/api/status", token=token)[0], 200)
        check("good-token /api/exec ok",
              call("POST", base + "/api/exec", token=token, body={"cmd": "true"})[0], 200)
        # query-param token (for streaming/EventSource clients that can't set headers)
        check("query-param token ok", call("GET", base + f"/api/ai/status?t={token}")[0], 200)
        # static shell public + token injected
        code, html = call("GET", base + "/")
        check("shell served", code, 200)
        check("token injected into shell", b"window.__AURA_TOKEN__" in html, True)
        check("static css public", call("GET", base + "/auraos.css")[0], 200)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()

    if fails:
        print(f"\nFAILED: {len(fails)} check(s): {', '.join(fails)}")
        sys.exit(1)
    print("\nOK: local-API authentication holds (P3 3.3.1 / P6 6.6.1).")


if __name__ == "__main__":
    main()
