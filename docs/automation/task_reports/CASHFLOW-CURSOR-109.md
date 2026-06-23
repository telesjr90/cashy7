# CASHFLOW-CURSOR-109 — Member state management

## Result

**PASS**

Owner household member management implemented with removed membership migration, `manage-household-members` Edge Function, pure helpers, client service, Settings UI card, tests, remote migration, function deployment, and browser smoke.

## UI scope decision

| Option | Verdict |
|--------|---------|
| Inline card on existing Settings page | **Chosen** |
| New route for member management | Rejected — no deep-link requirement |
| Dialog-only management | Rejected — persistent member/invite state belongs on Settings |
| `App.tsx` changes | Avoided |

Smallest safe surface: `HouseholdMemberManagementCard` mounted on Settings below the existing C107 invite card.

## Files changed

| File | Change |
|------|--------|
| `supabase/migrations/20260623000009_031_household_member_states.sql` | `removed` status + audit columns |
| `supabase/functions/manage-household-members/index.ts` | Owner-only cancel/resend/remove actions |
| `src/lib/types.ts` | `removed` membership status + audit fields |
| `src/lib/household-member-management.ts` | Pure display, permission, confirmation, error helpers |
| `src/lib/household-member-management.test.ts` | 20 Vitest cases |
| `src/lib/household-member-management-service.ts` | Client invoke helpers |
| `src/lib/household-member-management-service.test.ts` | 10 service tests |
| `src/lib/user-person.ts` | Include removed audit fields in member list |
| `src/components/household-member-management-card.tsx` | Owner management UI with confirmations |
| `src/pages/settings.tsx` | Mount member management card |
| `docs/automation/task_reports/CASHFLOW-CURSOR-109.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-109.result.json` | Machine-readable report |

## Schema/RLS decision

`household_invitations` already supported `cancelled` (C107). Added smallest migration for membership soft removal only:

- `household_members.status` now allows `removed`
- `removed_at`, `removed_by` audit columns
- Index on `(household_id, status, is_active)` for capacity queries
- **No RLS widening** — existing policies unchanged; mutations go through Edge Function with service role server-side only

Remote migration `031_household_member_states` applied to project `nasyeoywmcifabusfpti`.

## Function/member-management decision

Single Edge Function `manage-household-members` with `action` parameter:

| Action | Behavior |
|--------|----------|
| `cancel_invite` | Pending (`invited`) invitation → `cancelled` |
| `resend_invite` | Re-sends Auth invite email for same pending row (no duplicate row) |
| `remove_member` | Active non-owner member → `status = removed`, `is_active = false` + audit |

All actions authenticate caller JWT, verify active owner membership, verify target belongs to caller household, and enforce status transition rules.

Deploy command:

```bash
npx supabase functions deploy manage-household-members --project-ref nasyeoywmcifabusfpti --use-api
```

Required function secrets (names only):

- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_INVITE_REDIRECT_URL` (optional, for resend redirect)

## Behavior implemented

### Owner household members panel

- Settings **Household members** card shows active members, pending invites, and recent cancelled/removed history
- Role labels (Owner/Member) and status labels (Active/Pending/Removed/Cancelled)
- Safe email/display labels only — no raw UUIDs in UI copy
- Capacity summary respects two-user limit

### Non-owner view

- Read-only copy: **Only a household owner can manage members.**
- No management buttons; active member list still visible

### Cancel / resend / remove

- Confirmation dialogs with required product copy
- Cancel and remove smoke exercised via dialog open + cancel path (no mutation)
- Resend dialog cancel path exercised when pending invite exists

### C107/C108 compatibility

- C107 invite card unchanged
- `/accept-invite` route still loads

## Invite state behavior

- Only `invited` invitations can be cancelled or resent
- Cancel sets `status = cancelled` without deleting household records or revoking accepted members
- Resend reuses existing invitation row and calls `auth.admin.inviteUserByEmail` server-side
- Cancelled/expired invites appear in low-risk history section
- Cancelled invites do not count toward active capacity

## Member removal behavior

- Soft deactivate: `status = removed`, `is_active = false`, `removed_at`, `removed_by`
- Owner cannot remove self
- Owner cannot remove another owner / only owner
- Historical shared records preserved; no hard delete of bills, expenses, debt, savings, receipts, cash snapshots, or audit rows
- Removed members do not count toward active capacity

## Privacy/access behavior

- No service-role key in browser
- No private cash, savings, receipts, paycheck, or audit data exposed in management UI
- Removed members lose household access via existing `is_active` / `get_my_household_id()` checks
- Owner does not gain access to removed member private data
- No Auth user deletion

## Tests added

- `household-member-management.test.ts` — permissions, status transitions, capacity, display model, confirmation copy, UUID sanitization
- `household-member-management-service.test.ts` — invoke payload, error mapping, transport failure, no service-role exposure

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (1122 tests) |

## Browser smoke / deployment result

| Step | Result |
|------|--------|
| Migration `031_household_member_states` | Applied via Supabase MCP |
| Edge Function `manage-household-members` | Deployed ACTIVE |
| `.tmp-smoke-109.mjs` on `http://127.0.0.1:5205` | PASS |

Smoke covered:

- Settings loads; member management card visible
- Owner active member section visible
- Cancel invite / resend invite / remove member confirmation dialogs open; cancel path leaves state unchanged
- C107 invite card still loads
- `/accept-invite` loads
- Dashboard, Bills, Expenses, Debt, Settings reload
- Import/receipt sections reachable on Settings
- No console errors

Live cancel/resend/remove mutations not exercised in smoke when no safe pending invite or removable member exists; function paths validated via unit/service tests and confirmation UI smoke.

## Remaining known limitations

- Broader owner/member permission audit deferred to C110
- Ownership transfer flow not implemented — owner self-removal blocked
- Re-inviting a previously removed user may create a new membership row (no reactivation helper yet)
- `APP_INVITE_REDIRECT_URL` should point to `/accept-invite` when production URL is finalized

## Ready to commit

Yes — validation and smoke pass; scope matches C109; no credentials committed.

## Next task

**CASHFLOW-CURSOR-110** — Broader owner/member permissions audit
