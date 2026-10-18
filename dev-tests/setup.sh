#!/bin/bash
# Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
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
import re, datetime
# Seed dates were written when the tests were last green (12 Oct 2026). Move
# them forward by the days since then, so cases don't age into the next
# escalation level as the calendar moves on (grieviq-47).
SHIFT = (datetime.datetime.now(datetime.timezone.utc).date() - datetime.date(2026, 10, 12)).days
def shifted(m):
    t = datetime.datetime.strptime(m.group(1), "%Y-%m-%dT%H:%M:%S") + datetime.timedelta(days=SHIFT)
    return "'" + t.strftime("%Y-%m-%dT%H:%M:%S") + "Z'"
for f in ["schema-live.sql", "part21-departments.sql", "part22-department-types.sql", "part23-department-step.sql", "part24-citizen-ratings.sql", "part25-department-officers.sql", "part26-dept-agreement-copy.sql", "part27-site-settings.sql", "part28-billing.sql", "part29-copy-sightings.sql", "part30-subscriptions.sql", "part31-speed.sql", "part32-gov.sql", "part33-districts.sql", "part34-gov-login.sql", "part35-gov-reports.sql", "part36-handover.sql", "part37-transfers.sql", "seed.sql"]:
    sql = open(os.path.join(here, f), encoding="utf-8").read()
    if f == "seed.sql" and SHIFT > 0:
        sql = re.sub(r"'(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)Z'", shifted, sql)
    c.executescript(sql)
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
