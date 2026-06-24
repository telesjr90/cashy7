# CASHFLOW-CURSOR-127 — Full RLS policy matrix

Audit date: 2026-06-23  
Scope: All `public` app tables and `storage.objects` policies for `receipt-uploads`  
Sources: `supabase/migrations/*`, `src/lib/rls-audit.ts`, `scripts/audit-rls-policies.mjs`

Legend:

- **PASS** — policy matches intended visibility
- **GAP** — concrete mismatch or latent exposure documented
- **N/A** — operation intentionally absent (append-only, cancel-via-update)

## Helper functions (RLS dependencies only)

| Helper | Uses auth.uid() | Excludes removed/invited | Excludes pending invitation | Audit |
|--------|-----------------|--------------------------|-----------------------------|-------|
| `get_my_household_id()` | Yes | Yes (`status=active`, `is_active=true`) | Yes | PASS |
| `is_my_household_owner()` | Yes | Yes (requires active membership) | Yes | PASS |

Removed/invited users: `get_my_household_id()` returns `NULL` → household-scoped `SELECT`/`INSERT`/`UPDATE`/`DELETE` denied. Own-user tables still require `user_id = auth.uid()`.

## Public table matrix

| Object | Classification | Intended visibility | RLS | SELECT | INSERT | UPDATE | DELETE | Rule kind | Removed/invited | Audit | Notes |
|--------|----------------|---------------------|-----|--------|--------|--------|--------|-----------|-----------------|-------|-------|
| `households` | household_shared | Active members read; owner/created_by onboarding fallback | Yes | `get_my_household_id()` OR owner/created_by | owner/created_by = caller | same | same | onboarding_owner_fallback | Denied via null household | PASS | Supports pre-membership household bootstrap |
| `household_members` | household_shared | Active roster + own row | Yes | household OR `user_id = auth.uid()` | active household or owner bootstrap | own row only | active household | active_household_member | Own row only when removed | PASS | Update restricted to own mapping (C022) |
| `household_invitations` | owner_managed | Owner manage invites | Yes | owner | owner + `invited_by` | owner | N/A | active_household_owner | Denied | PASS | Cancel via status update |
| `people` | household_shared | Household person profiles (name/color) | Yes | active household | active household | active household | active household | active_household_member | Denied | **GAP** | Legacy `paycheck_amount`/`pay_schedule` columns household-readable; app uses `paycheck_schedules` |
| `household_settings` | owner_managed | All members read; owner write | Yes | active household | owner | owner | N/A | active_household_owner | Denied | PASS | C093 owner-only writes |
| `bills` | household_shared | Active members CRUD | Yes | active household | active household | active household | active household | active_household_member | Denied | PASS | |
| `bill_instances` | household_shared | Active members CRUD | Yes | active household | active household + bill FK | same | active household | active_household_member | Denied | PASS | |
| `debt_accounts` | household_shared | Active members CRUD | Yes | active household | active household | active household | active household | active_household_member | Denied | PASS | |
| `debt_payments` | household_shared | Active members CRUD | Yes | active household | active household + FK checks | same | active household | active_household_member | Denied | PASS | |
| `manual_expenses` | household_shared | Shared visible; private creator-only | Yes | shared OR own private | creator in household | creator | creator | shared_or_own_private | Denied | PASS | |
| `cash_snapshots` | own_user_private | Own current cash only | Yes | `user_id = auth.uid()` + household | own | own | own | own_user | Denied | PASS | Owner cannot read member cash |
| `cash_payment_transactions` | system_audit | Own cash audit append-only | Yes | own | own | N/A | N/A | append_only_own_user | Denied | PASS | No update/delete by design |
| `cash_adjustment_transactions` | system_audit | Own cash credit append-only | Yes | own | own | N/A | N/A | append_only_own_user | Denied | PASS | |
| `savings_goals` | savings_private | Shared metadata household; private creator-only | Yes | shared OR own private | creator | creator | creator | shared_or_own_private | Denied | PASS | |
| `savings_goal_participants` | savings_private | Own targets only | Yes | own | own | own | own | own_user | Denied | PASS | |
| `savings_contributions` | savings_private | Own contributions only | Yes | own | own | own | own | own_user | Denied | PASS | |
| `paycheck_schedules` | paycheck_private | Own schedule/amount only | Yes | own | own | own | own | own_user | Denied | PASS | Authoritative paycheck store |
| `import_batches` | import_tracking | Household read; owner apply/rollback | Yes | active household | owner | owner | N/A | active_household_owner | Denied | PASS | No spreadsheet contents stored |
| `import_batch_records` | import_tracking | Household read links; owner writes | Yes | active household | owner | owner | N/A | active_household_owner | Denied | PASS | |
| `receipt_uploads` | receipt_private | Uploader-only metadata | Yes | uploader + household | uploader | uploader | uploader | uploader_own | Denied | PASS | |
| `receipt_candidates` | receipt_private | Uploader-only drafts | Yes | creator | creator + upload FK | own status transitions | own pending/dismissed | uploader_own | Denied | PASS | |

**Tables reviewed:** 21  
**Storage policy groups reviewed:** 1 (`receipt-uploads`)

## Storage matrix

| Object | Classification | Intended visibility | Bucket public | SELECT | INSERT | UPDATE | DELETE | Rule | Removed/invited | Audit | Notes |
|--------|----------------|---------------------|---------------|--------|--------|--------|--------|------|-----------------|-------|-------|
| `storage.buckets:receipt-uploads` | storage_private | Private; uploader folder only | **false** | `folder[1]=auth.uid()` | same | N/A | same | storage_uploader_path | Denied | PASS | 10 MB limit; image/pdf mime allowlist |
| `storage.objects` (receipt policies) | storage_private | Same as bucket | n/a | `receipt_uploads_storage_select_own` | `receipt_uploads_storage_insert_own` | none | `receipt_uploads_storage_delete_own` | storage_uploader_path | Denied | PASS | No public-read policy |

## Risk pattern scan

| Pattern | Result |
|---------|--------|
| `using (true)` on app tables | None found |
| `with check (true)` on app tables | None found |
| `household_id` without active membership check | None on shared tables (all use `get_my_household_id()`) |
| Storage without user path segment | None — first folder segment = `auth.uid()` |
| Cross-household access | Prevented by household helper |

## Frontend alignment (spot check)

| Area | Expectation | Source | Status |
|------|-------------|--------|--------|
| Active membership gate | `status=active` AND `is_active=true` | `src/lib/auth-context.tsx` | PASS |
| Owner-only settings/import | `isActiveHouseholdOwner()` | `src/lib/permissions-audit.ts`, `cashflow-start-admin.ts`, `import-apply.ts` | PASS |
| Own paycheck/cash/savings/receipts | Client queries own rows; RLS enforces | `paycheck-schedule.ts`, savings helpers, receipt services | PASS |
| People query | Selects all household people (names/colors) | `src/lib/user-person.ts` | PASS (paycheck data not stored here in app) |

## Gaps summary

| # | Gap | Severity | Fixed in C127 | Recommended follow-up |
|---|-----|----------|---------------|----------------------|
| 1 | `people.paycheck_amount` / `pay_schedule` legacy columns are household-readable via `people_select_active_household` | Low (latent — app writes paycheck to `paycheck_schedules` only; setup inserts name/color only) | No | Future migration: drop legacy columns or add column-restricted view; out of scope for minimal RLS hardening |

No migration applied — active privacy model for cash, savings, paychecks, receipts, and imports is sound.
