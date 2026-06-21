#!/usr/bin/env bash
set -euo pipefail

echo "== Agent binary =="
which agent
which cursor-agent || true

echo "== Headless trust test =="
OUTPUT="$(agent --print --output-format text --trust --workspace "$(pwd)" "Say exactly: CURSOR_AGENT_HEADLESS_OK")"

echo "$OUTPUT"

if [[ "$OUTPUT" != *"CURSOR_AGENT_HEADLESS_OK"* ]]; then
  echo "Cursor Agent did not return expected output."
  exit 1
fi

echo "Cursor Agent headless preflight passed."
