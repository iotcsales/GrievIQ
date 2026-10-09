#!/bin/bash
# GrievIQ developer tests (rebuilt Oct 2026, Departments stage 1).
# Starts a local copy of the site on http://localhost:8788 with a fresh test
# database, then runs the API and browser tests.
#   bash dev-tests/setup.sh          (from the repo folder)
# Needs Node 22+ (built-in SQLite) and Python Playwright with Chromium.
# Sign-in: Cloudflare Access is replaced by a "test_email" cookie/header.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(dirname "$HERE")"
WORK="${GRIEVIQ_TEST_DIR:-/tmp/grieviq-tests}"
mkdir -p "$WORK"
if [ -f "$WORK/server.pid" ]; then kill "$(cat "$WORK/server.pid")" 2>/dev/null || true; sleep 0.5; fi
rm -f "$WORK/test.db"
python3 - "$WORK/test.db" "$HERE" <<'PY'
import sqlite3, sys, os
db, here = sys.argv[1], sys.argv[2]
c = sqlite3.connect(db)
for f in ["schema-live.sql", "part21-departments.sql", "part22-department-types.sql", "part23-department-step.sql", "part24-citizen-ratings.sql", "seed.sql"]:
    c.executescript(open(os.path.join(here, f), encoding="utf-8").read())
c.commit()
PY
nohup node --no-warnings "$HERE/server.mjs" "$REPO" "$WORK/test.db" 8788 > "$WORK/server.log" 2>&1 &
echo $! > "$WORK/server.pid"
sleep 1.5
echo "Server: http://localhost:8788  (log: $WORK/server.log)"
if [ "$1" != "--server-only" ]; then
  node --no-warnings "$HERE/api-test.mjs" "$WORK/test.db"
  PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 python3 "$HERE/ui-test.py" "$REPO"
fi
