$ErrorActionPreference = "Stop"

Write-Host "== Git status =="
git status --short

Write-Host "== Typecheck =="
npm run typecheck

Write-Host "== Build =="
npm run build

Write-Host "== Tests =="
npm run test:run

Write-Host "== Validation complete =="