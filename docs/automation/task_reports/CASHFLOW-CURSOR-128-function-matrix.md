# CASHFLOW-CURSOR-128 — Function / SECURITY DEFINER matrix

Generated for Phase 14 security hardening. Sources: `supabase/migrations/*`, `supabase/functions/*`, `src/lib/*`, `scripts/audit-database-functions.mjs`.

## Database functions (public schema)

| Function | Location / migration | Callable from client? | SECURITY DEFINER? | search_path set? | Reads private data? | Writes private data? | Writes shared data? | uses auth.uid? | Verifies household? | Verifies owner? | Grants / revokes | Expected callers | Audit | Notes / fix |
|----------|----------------------|----------------------|-----------------|------------------|---------------------|----------------------|---------------------|----------------|---------------------|-----------------|------------------|------------------|-------|-------------|
| `get_my_household_id` | `009_complete_baseline_contract` | yes (RLS indirect) | yes | yes (`''`) | no | no | no | yes | yes (active member) | no | revoke public; grant authenticated, service_role | RLS policies; SECURITY DEFINER RPCs | PASS | Active status + is_active enforced |
| `is_my_household_owner` | `022_household_settings_owner_only` | yes (RLS indirect) | yes | yes (`''`) | no | no | no | yes | yes | yes | revoke public; grant authenticated, service_role | Owner RLS policies | PASS | Removed/invited excluded |
| `set_updated_at` | `009_complete_baseline_contract` | no (trigger) | no | yes (`''`) | no | no | no | no | no | no | trigger-only | BEFORE UPDATE triggers | PASS | |
| `set_household_settings_created_by` | `010_cashflow_start_and_cash_snapshots` | no (trigger) | no | yes (`''`) | no | no | no | yes (on insert) | no | no | trigger-only | household_settings INSERT | PASS | Sets created_by when null |
| `set_household_invitations_updated_at` | `030_household_invitations`; `033_harden_rpc` | no (trigger) | no | yes (`''`) | no | no | no | no | no | no | trigger-only | household_invitations UPDATE | PASS | **033** added `set search_path` |
| `prevent_paid_manual_expense_delete` | `016_prevent_paid_manual_expense_delete` | no (trigger) | yes | yes (`''`) | yes (audit refs) | no | no | no | no | no | trigger-only | manual_expenses DELETE | PASS | Blocks paid expense delete |
| `pay_source_from_current_cash` | `015`; `020`; `033_harden_rpc` | yes | yes | yes (`''`) | yes (own cash) | yes (snapshots, audit) | yes (bills/debt) | yes | yes | no | revoke public; grant authenticated | `payments.ts`, bills/debt/expenses/savings | PASS | **033** validates all source types before cash deduction |
| `credit_manual_expense_adjustment_to_current_cash` | `018`; `033_harden_rpc` | yes | yes | yes (`''`) | yes (own cash) | yes (snapshots, audit) | no | yes | yes | no | revoke public; grant authenticated | `cash-adjustments.ts` | PASS | **033** enforces shared-or-own-user on adjustment |

## Edge Functions (server-side; not Postgres RPC)

| Function | Service-role use | JWT / caller checks | DB scope | Frontend invoke | Audit | Notes |
|----------|------------------|---------------------|----------|-----------------|-------|-------|
| `invite-household-member` | yes (admin client) | auth.getUser + active owner membership | household_id from caller membership | `household-invitation-service.ts` | PASS | Self-invite blocked; household cap enforced |
| `manage-household-members` | yes | verifyActiveOwner helper | invitation/member household_id match | `household-member-management-service.ts` | PASS | Cannot remove self/sole owner |
| `accept-household-invite` | yes | auth.getUser + email match | invitation scoped; no cross-household join | `household-invite-acceptance-service.ts` | PASS | Wrong email / self-invite blocked |
| `extract-receipt` | no (anon + user JWT) | auth.getUser + uploaded_by match | receipt_uploads RLS; storage via user client | `receipt-extraction-service.ts` | PASS | Provider secrets server-only |

## Import apply / rollback

No dedicated SECURITY DEFINER RPC. Apply and rollback use direct table access under RLS:

- `import_batches` / `import_batch_records`: SELECT household members; INSERT/UPDATE owner-only via `is_my_household_owner()`
- Rollback status values in `025_import_batch_rollback`
- No spreadsheet contents stored in DB

**Audit: PASS** — owner enforcement is policy-level (C127); no elevated bypass RPC.

## Frontend RPC / invoke summary

| Kind | Name | Source |
|------|------|--------|
| RPC | `pay_source_from_current_cash` | `src/lib/payments.ts` |
| RPC | `credit_manual_expense_adjustment_to_current_cash` | `src/lib/cash-adjustments.ts` |
| Edge | `invite-household-member` | `src/lib/household-invitation-service.ts` |
| Edge | `manage-household-members` | `src/lib/household-member-management-service.ts` |
| Edge | `accept-household-invite` | `src/lib/household-invite-acceptance-service.ts` |
| Edge | `extract-receipt` | `src/lib/receipt-extraction-service.ts` |

## Gaps found in audit (pre-033)

| Gap | Severity | Fix |
|-----|----------|-----|
| `pay_source_from_current_cash` allowed cash deduction for invalid/unpaid `bill_instance` ids | High | Migration `033` — upfront source validation |
| `credit_manual_expense_adjustment_to_current_cash` missing shared-or-own check (DEFINER bypasses RLS) | Medium | Migration `033` — ownership guard |
| `set_household_invitations_updated_at` missing explicit `search_path` | Low | Migration `033` — `set search_path = ''` |

**Post-033:** all database functions PASS.

## Summary counts

- Functions reviewed: **8**
- SECURITY DEFINER: **5** (`get_my_household_id`, `is_my_household_owner`, `prevent_paid_manual_expense_delete`, `pay_source_from_current_cash`, `credit_manual_expense_adjustment_to_current_cash`)
- Client RPC references: **2**
- Edge invoke references: **4**
- Gaps found: **3**
- Gaps fixed: **3**
