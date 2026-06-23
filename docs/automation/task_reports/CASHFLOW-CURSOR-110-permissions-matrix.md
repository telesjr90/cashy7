# CASHFLOW-CURSOR-110 — Owner/member permissions matrix

Audit date: 2026-06-23

Legend:

- **PASS** — expected access matches implementation
- **GAP** — mismatch requiring fix (none remain after C110 hardening)
- **N/A** — action not applicable for role

## Role summary

| Role | Active household access | Owner actions | Other-user private data |
|------|-------------------------|---------------|-------------------------|
| Unauthenticated | No | No | No |
| Invited (no active membership) | No | No | No |
| Active member | Yes (shared) | No | No |
| Owner | Yes (shared) | Yes | No |
| Removed member | No | No | Own rows only via RLS where applicable |

## Matrix

| Action / resource | Unauth | Invited | Active member | Owner | Removed | Expected access | Implementation source | Status |
|-------------------|--------|---------|---------------|-------|---------|-----------------|----------------------|--------|
| Protected app routes | Deny | Deny | Allow | Allow | Deny | Active owner/member only | `src/App.tsx` `AuthenticatedLayout`; `src/lib/auth-context.tsx` (`status=active`, `is_active=true`) | PASS |
| Shared household planning data (bills, expenses, debt) | Deny | Deny | Allow | Allow | Deny | Active membership via `get_my_household_id()` | Baseline RLS on shared tables | PASS |
| Household settings read (cashflow start date) | Deny | Deny | Allow | Allow | Deny | All active members read | `household_settings` select policy | PASS |
| Change cashflow start date | Deny | Deny | Deny | Allow | Deny | Active owner only | `is_my_household_owner()`; `src/lib/cashflow-start-admin.ts` | PASS |
| Invite household member | Deny | Deny | Deny | Allow | Deny | Active owner only | `invite-household-member` Edge Function; `src/lib/household-invitations.ts` | PASS |
| Manage members (cancel/resend/remove) | Deny | Deny | Deny | Allow | Deny | Active owner only | `manage-household-members` Edge Function; `src/lib/household-member-management.ts` | PASS |
| Accept household invite | Sign-in only | Allow via flow | N/A | N/A | N/A | Invited email via C108 | `accept-household-invite` Edge Function; `/accept-invite` | PASS |
| Apply spreadsheet import | Deny | Deny | Deny | Allow | Deny | Active owner only | `import_batches` insert RLS; `src/lib/import-apply.ts` | PASS |
| Rollback spreadsheet import | Deny | Deny | Deny | Allow | Deny | Active owner only | `import_batches` update RLS; `src/lib/import-rollback.ts` | PASS |
| Own current cash snapshots | Deny | Deny | Own only | Own only | Deny household | Own `user_id` only | `cash_snapshots` own-user RLS | PASS |
| Other user's current cash | Deny | Deny | Deny | Deny | Deny | Never | `cash_snapshots` `user_id = auth.uid()` | PASS |
| Own paycheck schedule | Deny | Deny | Own only | Own only | Deny household | Own `user_id` only | `paycheck_schedules` own-user RLS | PASS |
| Other user's paycheck | Deny | Deny | Deny | Deny | Deny | Never | `paycheck_schedules` `user_id = auth.uid()` | PASS |
| Own private savings target/contributions | Deny | Deny | Own only | Own only | Deny household | Own participant/contributor rows | `savings_*` own-user RLS; `src/lib/savings-edit.ts` | PASS |
| Other user's private savings | Deny | Deny | Deny | Deny | Deny | Never | `savings_goals` private `created_by_user_id`; participant own-user RLS | PASS |
| Own receipt uploads/candidates/files | Deny | Deny | Own only | Own only | Deny household | Own uploader only | `receipt_uploads` / `receipt_candidates` own-user RLS | PASS |
| Other user's receipts | Deny | Deny | Deny | Deny | Deny | Never | own-user RLS + storage folder `auth.uid()` | PASS |
| Own cash payment/audit rows | Deny | Deny | Own only | Own only | Deny household | Own `user_id` only | `cash_payment_transactions` own-user RLS | PASS |
| Other user's cash audit rows | Deny | Deny | Deny | Deny | Deny | Never | own-user RLS | PASS |
| Receipt storage bucket | Deny | Deny | Own folder | Own folder | Deny | Private bucket; own-folder only | `storage.objects` policies on `receipt-uploads` (`public=false`) | PASS |
| Extract receipt (Edge Function) | Deny | Deny | Own upload | Own upload | Deny | Authenticated + own `receipt_uploads` row | `extract-receipt` function | PASS |
| Household invitations SELECT | Deny | Deny | Deny | Allow | Deny | Owner read/manage only | `household_invitations` owner RLS | PASS |
| Invitation row alone grants shared access | Deny | Deny | N/A | N/A | N/A | Never before acceptance | No `household_members` active row; `get_my_household_id()` requires active | PASS |

## Database helpers verified

| Helper | Active-only | Owner check | Source |
|--------|-------------|-------------|--------|
| `get_my_household_id()` | `status='active'` AND `is_active=true` | No | `009_complete_baseline_contract.sql` |
| `is_my_household_owner()` | Active membership required | Yes | `022_household_settings_owner_only.sql` |

Removed members: `get_my_household_id()` returns null → shared SELECT denied. Soft-removed rows keep history; no hard delete.

## Edge Functions verified

| Function | Auth | Membership check | Secrets server-side | Safe errors |
|----------|------|------------------|---------------------|-------------|
| `invite-household-member` | JWT required | Active owner | Service role server-only | No UUIDs in messages |
| `accept-household-invite` | JWT required | Email match; no existing active membership | Service role server-only | No UUIDs in messages |
| `manage-household-members` | JWT required | Active owner; household target match | Service role server-only | No UUIDs in messages |
| `extract-receipt` | JWT required | Own receipt via user client RLS | Provider secrets server-only | Generic warnings |

## Gaps found and fixed in C110

| Gap | Fix |
|-----|-----|
| `auth-context` loaded household when `is_active=true` but `status` was not `active` | Added `.eq("status", "active")` filter |
| `canOwnerInviteMembers` / `canUserEditCashflowStartDate` treated owner role without requiring active membership | Delegated to `isActiveHouseholdOwner()` in `src/lib/permissions-audit.ts` |

No new RLS migration required — database policies already enforced active membership and owner-only writes.

## Runtime artifact

Pure helper `buildPermissionAuditMatrix()` in `src/lib/permissions-audit.ts` mirrors this matrix for regression tests.
