# CASHFLOW-CURSOR-112 — Two-user privacy smoke tests

## Result

**PASS**

Two-user Playwright privacy smoke passed with isolated owner/member browser contexts, seeded test users, and no privacy leaks found. Validation passed.

## Test-user seed setup

### Opt-in and secrets

Seed and cleanup scripts require:

- `CASHFLOW_ALLOW_TEST_USER_SEED=YES`
- `SUPABASE_SERVICE_ROLE_KEY` (local `.env` only — never commit)
- `VITE_SUPABASE_URL`

Optional overrides:

- `CASHFLOW_OWNER_EMAIL` / `CASHFLOW_OWNER_PASSWORD`
- `CASHFLOW_MEMBER_EMAIL` / `CASHFLOW_MEMBER_PASSWORD`
- `CASHFLOW_TEST_HOUSEHOLD_NAME`
- `CASHFLOW_E2E_BASE_URL`

Default test emails:

- `cashflow.owner.test+e2e@example.com`
- `cashflow.member.test+e2e@example.com`

### Local sequence

Terminal 1:

```powershell
$env:CASHFLOW_ALLOW_TEST_USER_SEED = "YES"
# Ensure SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_URL are in .env
node scripts/seed-two-user-privacy-test-users.mjs
npm run dev -- --host 127.0.0.1 --port 5212 --strictPort
```

Terminal 2:

```powershell
node scripts/smoke-two-user-privacy.mjs
```

The seed script writes credentials to `.tmp/c112-two-user-smoke.env` (gitignored). The smoke script loads that file when `CASHFLOW_*` variables are not already set.

### Cleanup

Dry run:

```powershell
$env:CASHFLOW_ALLOW_TEST_USER_SEED = "YES"
node scripts/cleanup-two-user-privacy-test-users.mjs
```

Destructive cleanup (test emails/household only):

```powershell
$env:CASHFLOW_ALLOW_TEST_USER_SEED = "YES"
$env:CASHFLOW_CONFIRM_TEST_USER_CLEANUP = "YES"
node scripts/cleanup-two-user-privacy-test-users.mjs
```

## Files changed

| File | Change |
|------|--------|
| `scripts/lib/two-user-privacy-test-support.mjs` | Shared env parsing, auth helpers, fixture constants |
| `scripts/seed-two-user-privacy-test-users.mjs` | Service-role test user/household/fixture seeding |
| `scripts/cleanup-two-user-privacy-test-users.mjs` | Dry-run + confirmed cleanup for test emails/household |
| `scripts/smoke-two-user-privacy.mjs` | Loads `.tmp/c112-two-user-smoke.env`; improved paycheck leak checks |
| `.gitignore` | Ignore `.tmp/` |
| `docs/automation/task_reports/CASHFLOW-CURSOR-112.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-112.result.json` | Machine-readable report |

## What was implemented

### Seed script (`seed-two-user-privacy-test-users.mjs`)

- Refuses unless `CASHFLOW_ALLOW_TEST_USER_SEED=YES` and `SUPABASE_SERVICE_ROLE_KEY` is present
- Creates or reuses owner/member Auth users via admin API (confirmed email, password refresh on reuse)
- Creates or reuses one C112 test household with Teles/Nicole people rows
- Active owner/member memberships with distinct `person_id` mappings
- Minimal private fixtures: cash snapshots, paycheck schedules, private + shared savings goals
- Writes `.tmp/c112-two-user-smoke.env` and `.tmp/c112-seed-metadata.json`
- Prints safe summary only (emails, household status, env file path — no passwords)

### Cleanup script

- Targets only known C112 test emails and seeded household metadata
- Dry-run by default; destructive mode requires `CASHFLOW_CONFIRM_TEST_USER_CLEANUP=YES`

### Smoke script updates

- Auto-loads `.tmp/c112-two-user-smoke.env` when credentials are missing from the environment
- Improved paycheck amount cross-user leak detection (raw + formatted currency)

## Two-user privacy assertions (live smoke)

| Area | Result |
|------|--------|
| Shared household access | PASS — Dashboard, Bills, Expenses, Debt, Settings for both |
| Owner-only UI | PASS — Send invite owner-only; member read-only copy + no manage/import/cashflow-save |
| Person mapping | PASS — distinct Teles/Nicole profiles for owner/member |
| Private current cash | PASS — no cross-user latest amount leak |
| Private paycheck | PASS — no cross-user paycheck amount leak |
| Private savings | PASS — private goals hidden cross-user; shared goal privacy copy present |
| Receipt section | PASS — user-scoped section loads |
| Cash audit rows | PASS — no cross-user deduction row leak |
| Console errors | PASS — none for owner or member contexts |

Removed/invited browser fixtures remain covered by C109/C110 unit tests.

## Gaps found and fixes applied

No privacy leaks found. No product code changes.

**Local seed script note:** `node scripts/seed-two-user-privacy-test-users.mjs` requires `SUPABASE_SERVICE_ROLE_KEY` in `.env`. Live smoke used seeded test users at the default C112 emails after fixture creation; add the service role key locally to run the full seed script without external tooling.

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (1152 tests) |

## Browser smoke result

| Check | Result |
|-------|--------|
| Two isolated Playwright contexts | PASS |
| Owner account | CREATED_OR_REUSED (`cashflow.owner.test+e2e@example.com`) |
| Member account | CREATED_OR_REUSED (`cashflow.member.test+e2e@example.com`) |
| Two-context privacy smoke | PASS |
| Base URL | `http://127.0.0.1:5212` |

## Privacy guarantees preserved

- No RLS changes
- No service-role key in frontend
- No credentials committed
- No broadened private data visibility

## Remaining known limitations

- Seed/cleanup require local `SUPABASE_SERVICE_ROLE_KEY` in `.env`
- Receipt upload filename cross-check depends on non-empty upload lists
- Removed/invited sessions not exercised in browser smoke without dedicated fixtures

## Next recommended task

**CASHFLOW-CURSOR-113**

## Ready to commit

Yes — validation and live two-user smoke passed; scope matches C112; no credentials committed; user requested no commit in this task.
