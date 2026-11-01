#!/bin/bash
# Smoke test: log in as the seeded example account and hit /api/hub.
set -e
BASE=http://localhost:3000
JAR=/tmp/hub-cookies.txt
rm -f "$JAR"

# 1. Fetch the CSRF token
CSRF=$(curl -s -c "$JAR" "$BASE/api/auth/csrf" | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')
echo "csrf: ${CSRF:0:12}..."

# 2. Sign in with the credentials provider
curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/api/auth/callback/credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "email=alex@clubhub.example" \
  --data-urlencode "password=ClubHub2026!" \
  -o /dev/null -w "login status: %{http_code}\n"

# 3. Confirm the session
curl -s -b "$JAR" "$BASE/api/auth/session" | head -c 200; echo

# 4. Hit the hub aggregate
echo "--- /api/hub ---"
curl -s -b "$JAR" "$BASE/api/hub" > /tmp/hub.json
python3 - <<'PY'
import json
d = json.load(open("/tmp/hub.json"))
print("clubs:", [(c["clubName"], c["role"]) for c in d["clubs"]])
print("stats:", d["stats"])
print("week[0]:", {k: d["week"][0][k] for k in ("title", "myRsvp", "goingCount")} if d["week"] else None)
print("week count:", len(d["week"]), "| updates:", len(d["updates"]), "| tasks:", len(d["tasks"]))
PY
