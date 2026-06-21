#!/usr/bin/env bash
set -euo pipefail

echo "== Git status =="
git status --short

echo "== Typecheck =="
npm run typecheck

echo "== Build =="
npm run build

echo "== Tests =="
npm run test:run

echo "== Validation complete =="
