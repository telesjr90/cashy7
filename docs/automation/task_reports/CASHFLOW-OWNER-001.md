# CASHFLOW-OWNER-001 — Invite profile assignment & owner Admin view

## 1. Result

**PARTIAL** — All code, schema migration, helpers, tests, and audits are complete and
green. The result is `PARTIAL` (not `PASS`) for two reasons that are environmental, not
implementation defects:

1. The RLS migration (`034`) is **added locally but not applied** to the remote database.
   The local/remote migration history is out of sync, so `supabase db push` is unsafe and
   was intentionally not run. The migration must be applied manually via the Supabase SQL
   Editor (or MCP `apply_migration`).
2. The **browser smoke could not be executed** in this environment: there are no seeded
   E2E credentials (`.tmp/c112-two-user-smoke.env` is absent), the dev server was not
   running with the migration applied, and credentials must not be stored. The smoke
   script is delivered and ready to run once the migration is applied and C112-style
   fixtures / a dev server are available.

No privacy regression was found. Owner Admin reads are gated by an explicit
`SECURITY DEFINER` RLS helper (active owner + same household only); writes remain
own-user only; cross-household access is not granted; receipt file bytes remain
uploader-only.

## 2. Files changed

### Modified
- `src/lib/types.ts` — `HouseholdInvitation.assigned_person_id` field.
- `src/lib/household-invitations.ts` — profile-option building, reservation tracking,
  client-side assignment validation, assigned-profile labels, payload wiring.
- `src/lib/household-invitation-service.ts` — `sendHouseholdInvite(email, assignedPersonId?, client?)`,
  select includes `assigned_person_id`.
- `src/lib/household-invite-acceptance.ts` — `profile_unavailable` error code + labels.
- `src/components/household-invite-card.tsx` — profile dropdown, reservation reasons,
  assigned-profile labels in pending list.
- `src/pages/settings.tsx` — owner view toggle, conditional admin overview card,
  personal privacy copy.
- `supabase/functions/invite-household-member/index.ts` — accept/validate/store
  `assignedPersonId`; `invalid_profile` / `profile_unavailable` codes.
- `supabase/functions/accept-household-invite/index.ts` — use assigned profile, verify
  availability at accept time, fail safe (no auto-pick) when unavailable.
- Test fixtures updated for the new field:
  `src/lib/household-invitations.test.ts`,
  `src/lib/household-invite-acceptance.test.ts`,
  `src/lib/household-member-management.test.ts`,
  `src/lib/household-invitation-service.test.ts`.

### Created
- `supabase/migrations/20260626000001_034_owner_admin_view_and_invite_profile_assignment.sql`
- `src/lib/owner-view-mode.ts` (+ `.test.ts`)
- `src/lib/owner-admin-overview.ts` (+ `.test.ts`)
- `src/lib/household-invite-profile-assignment.test.ts`
- `src/components/owner-view-toggle.tsx`
- `src/components/household-admin-overview-card.tsx`
- `scripts/smoke-owner-admin-view.mjs`
- `docs/automation/task_reports/CASHFLOW-OWNER-001.md` / `.result.json`

## 3. Product / privacy decision

- This task **intentionally changes the privacy model for active household owners only**.
  An active household owner in Admin view may **read** all active household members'
  private financial rows. This is enforced in the database (RLS), not via UI filtering.
- Non-owners, removed members, and invited (not-yet-active) members never gain Admin
  access and never see the toggle.
- Cross-household privacy is unchanged. No owner gains any access to another household.
- Admin view is **read-only**. No INSERT/UPDATE/DELETE on another user's private rows.
- Receipt **file bytes** remain uploader-only (storage policies unchanged). Only receipt
  metadata rows are owner-readable in Admin view. This is intentional, not a gap.

## 4. Schema / RLS decision

Migration `034`:
- Adds `household_invitations.assigned_person_id uuid null` with FK to `people(id)` and a
  partial index on pending invitations.
- Adds `public.is_household_admin_viewer(p_row_user_id, p_row_household_id)` —
  `SECURITY DEFINER`, `set search_path = ''` — returning true only when the caller is the
  active owner of the same household and the target user is an active member of that
  household.
- Adds **additive** `*_select_owner_admin` SELECT policies (using the helper) to:
  `cash_snapshots`, `cash_payment_transactions`, `cash_adjustment_transactions`,
  `paycheck_schedules`, `savings_goal_participants`, `savings_contributions`,
  `savings_goals` (private goals only), `receipt_uploads`, `receipt_candidates`.
- No INSERT/UPDATE/DELETE policies were added or weakened. No `storage.objects` policy
  changed.

**Application status: ADDED LOCALLY, NOT YET APPLIED.** Apply manually via Supabase SQL
Editor or MCP `apply_migration`. Do not `supabase db push` while history is out of sync.

## 5. Invite profile assignment behavior

- Owner selects an available profile when inviting (dropdown in `HouseholdInviteCard`).
- "Available" = belongs to household, not used by an active member, not reserved by
  another pending invite. Cancelled/removed invites do not reserve.
- Disabled options show the reason ("Already assigned" / "Reserved by pending invite").
- `invite-household-member` validates the assignment server-side and stores
  `assigned_person_id` on the invitation.
- `accept-household-invite` creates membership with the assigned `person_id`, re-verifying
  availability at accept time; if unavailable it fails with `profile_unavailable` (no
  auto-pick). With no assignment it falls back to existing auto-link behavior.
- Self-invite, duplicate pending invite, and the two-user active cap remain enforced.
- No raw UUIDs are shown — labels use the person name or a safe generic fallback.

## 6. Owner Personal / Admin view behavior

- `owner-view-mode.ts` provides eligibility (`canUseOwnerAdminView` = active owner only),
  mode normalization, and a `localStorage`-backed `useOwnerViewMode` hook. Default mode is
  `personal`; non-eligible users are forced to `personal`.
- `OwnerViewToggle` renders only for eligible owners (returns null otherwise).
- Admin view shows the banner: "Admin view: You are viewing all household member data as
  owner."; Personal view shows the personal privacy copy.

## 7. Admin read-only data coverage (Settings overview MVP)

`HouseholdAdminOverviewCard` (read-only) covers, per active member, household total cash,
current cash snapshot, paycheck schedule, and savings targets/contributions. Receipt
metadata is RLS-readable for the owner; file bytes remain uploader-only. Dashboard Admin
expansion is deferred as a documented follow-up to avoid forecast/safe-to-spend formula
changes.

## 8. Security / privacy tests

- `owner-view-mode.test.ts` — eligibility across owner/member/removed/invited; default
  personal; no raw UUID in labels.
- `owner-admin-overview.test.ts` — aggregation/labels; member labels contain no raw UUIDs.
- `household-invite-profile-assignment.test.ts` — active-member and pending-invite
  reservation, cancelled/removed do not reserve, payload validation, labels, owner-only.
- RLS-level guarantees (non-owner denied, cross-household denied, no owner writes) are
  enforced by the `is_household_admin_viewer` helper + additive SELECT-only policies and
  validated by `audit-rls-policies.mjs`.

## 9. Validation results

| Check | Result |
|-------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (1364 tests, 83 files) |
| `node scripts/audit-rls-policies.mjs` | PASS |
| `node scripts/audit-database-functions.mjs` | PASS |

## 10. Browser smoke result

**NOT EXECUTED** in this environment. Blocking factors: no seeded E2E credentials, dev
server not running with migration applied, and credentials must not be stored. Run after
applying migration `034`:

```
npm run dev -- --host 127.0.0.1 --port 5230 --strictPort
node scripts/smoke-owner-admin-view.mjs
```

## 11. Whether ready to commit

**Not yet.** Per the task ("do not commit / do not push") and because the result is
`PARTIAL`. Before committing: (a) apply migration `034` manually and confirm RLS; (b) run
the browser smoke and confirm PASS. After both pass, the change set is scope-clean and may
be committed on explicit instruction.

### Next recommended task
`CASHFLOW-CURSOR-129` — cross-household RLS verification, after migration `034` is applied
and the owner/member production setup is in place.
