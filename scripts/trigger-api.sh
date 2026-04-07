#!/usr/bin/env bash
# trigger-api.sh
# Sends a POST /run request to the local API server with optional variable overrides.
# The server must be running first: npm run server
#
# Usage:
#   ./trigger-api.sh                                           # run with all defaults
#   ./trigger-api.sh firstName=Samuel lastName=Kalt             # override name
#   ./trigger-api.sh firstName=Samuel medicalId=99999            # any combination of fields

PORT=${PORT:-3000}
URI="http://localhost:$PORT/run"

# Build JSON from key=value args
pairs=""
for arg in "$@"; do
  key="${arg%%=*}"
  value="${arg#*=}"
  [ -n "$pairs" ] && pairs="$pairs,"
  pairs="$pairs\"$key\":\"$value\""
done
body="{$pairs}"

if [ -z "$pairs" ]; then
  echo "[trigger-api] No overrides — running with default SOP values."
else
  echo "[trigger-api] Overrides: $body"
fi

curl -s -X POST "$URI" \
  -H "Content-Type: application/json" \
  -d "$body"
echo
