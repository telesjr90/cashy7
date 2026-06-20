param(
  [Parameter(Mandatory=$true)]
  [string]$Message
)

$ErrorActionPreference = "Stop"

Write-Host "== Pre-commit git status =="
git status --short

Write-Host "== Running validation =="
powershell -ExecutionPolicy Bypass -File scripts\validate-cashflow.ps1

Write-Host "== Staging tracked changes only =="
git add -u

Write-Host "== Staged diff summary =="
git diff --cached --stat

Write-Host "== Creating commit =="
git commit -m "$Message"

Write-Host "== Post-commit git status =="
git status --short