#!/usr/bin/env python3
# ============================================================================
# lint.py — static gates that catch the "black screen" class of bug before it
# ships: Python must compile, every shell JS file must PARSE (a duplicate const
# or stray brace is a SyntaxError that aborts the whole shell), and the CSS
# braces must balance.
#
# The JS parse uses gjs (GNOME's SpiderMonkey) or node if present; if neither is
# installed it SKIPS with a warning rather than failing (so CI without a JS
# engine still runs the Python + CSS gates). A runtime "ReferenceError: document"
# from the engine means the file parsed fine — only a SyntaxError is a failure.
#
# Run:  python3 tests/lint.py   (exit 0 = pass)
# ============================================================================
import glob, os, py_compile, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
fails = []


def check(name, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail and not ok else ""))
    if not ok:
        fails.append(name)


def skip(name, why):
    print(f"  [SKIP] {name} — {why}")


# ---- Python: every agent module compiles ----
for f in sorted(glob.glob(os.path.join(ROOT, "agent", "*.py"))):
    try:
        py_compile.compile(f, doraise=True)
        check("py_compile " + os.path.basename(f), True)
    except py_compile.PyCompileError as e:
        check("py_compile " + os.path.basename(f), False, str(e))

# ---- JS: every shell script PARSES (no SyntaxError) ----
js_engine = shutil.which("gjs") or shutil.which("node")
js_files = sorted(glob.glob(os.path.join(ROOT, "shell", "js", "*.js")))
if not js_engine:
    skip("shell JS parse", "no gjs/node installed")
else:
    is_node = js_engine.endswith("node")
    for f in js_files:
        # node --check parses without running; gjs runs (and hits a runtime
        # ReferenceError for browser globals — that's fine, only SyntaxError fails).
        args = [js_engine, "--check", f] if is_node else [js_engine, f]
        out = subprocess.run(args, capture_output=True, text=True)
        syntax_err = "SyntaxError" in (out.stderr + out.stdout)
        check(f"js parse {os.path.basename(f)}", not syntax_err,
              (out.stderr or out.stdout).strip()[:200])

# ---- CSS: braces balance ----
css = os.path.join(ROOT, "shell", "auraos.css")
if os.path.exists(css):
    s = open(css).read()
    check("css braces balanced", s.count("{") == s.count("}"),
          f"{{={s.count('{')} }}={s.count('}')}")

# ---- Shell scripts: bash -n ----
if shutil.which("bash"):
    for f in sorted(glob.glob(os.path.join(ROOT, "*.sh"))):
        out = subprocess.run(["bash", "-n", f], capture_output=True, text=True)
        check("bash -n " + os.path.basename(f), out.returncode == 0, out.stderr.strip()[:200])

print()
if fails:
    print(f"LINT FAILED: {len(fails)} — {fails}")
    sys.exit(1)
print("OK: all lint gates pass.")
