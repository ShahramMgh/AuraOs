#!/usr/bin/env bash
# Run the whole AuraOS test suite (lint + auth + smoke). Exit non-zero if any
# suite fails. CI-friendly; stdlib Python only (a JS engine is optional).
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fail=0
for t in lint.py test_auth.py smoke.py; do
  echo "═══════════════════ $t ═══════════════════"
  python3 "$DIR/$t" || fail=1
  echo
done
if [ "$fail" -eq 0 ]; then echo "✅ ALL SUITES PASS"; else echo "❌ SUITE(S) FAILED"; exit 1; fi
