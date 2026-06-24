# CASHFLOW-CURSOR-126 — Android viewport smoke tests

## Result: PASS

Comprehensive Android viewport smoke suite validates navigation, dashboard, lists, settings, calendar, reports, forms/dialogs, overflow, and privacy copy across 320–412 px mobile viewports plus 1280 px desktop sanity. All viewports pass after minimal CSS/calendar fixes exposed by the smoke run.

## UI scope decision

| Option | Decision |
|---|---|
| New Playwright smoke script + shared helpers | **Chosen** |
| New routes or feature redesign | Rejected |
| Schema/RLS changes | Rejected |

**Why:** C126 is regression coverage consolidating C122–C125 behaviors into one per-viewport matrix. Helpers reuse existing login/env patterns from C112/C122–C125 smokes. Source edits are limited to real overflow/usability bugs found during the run.

**Files intentionally avoided:** financial formula modules, RLS/migrations, `App.tsx` routing, business logic in payment/privacy services.

## Files changed

| Area | Files |
|---|---|
| Smoke automation | `scripts/smoke-android-viewports.mjs`, `scripts/lib/android-smoke-helpers.mjs` |
| Calendar overflow / keys | `src/pages/calendar.tsx`, `src/components/cashflow-calendar.tsx` |
| Sheet mobile fit | `src/components/ui/sheet.tsx` |
| Reports | `docs/automation/task_reports/CASHFLOW-CURSOR-126.md`, `CASHFLOW-CURSOR-126.result.json` |

## Schema/RLS

No migration. RLS unchanged.

## Android viewport matrix

| Viewport | Touch | Result |
|---|---|---|
| 320 × 740 | yes | PASS |
| 390 × 844 | yes | PASS |
| 412 × 915 | yes | PASS |
| 1280 × 800 | no (desktop sanity) | PASS |

Base URL: `CASHFLOW_E2E_BASE_URL` or `http://127.0.0.1:5226`.

## Behavior implemented

### Smoke suite (`scripts/smoke-android-viewports.mjs`)

Runs each viewport in an isolated Playwright context with independent login and per-viewport reporting. Collects console/page errors; fails on horizontal page overflow, broken routes, modal width overflow, or blocked required actions. Saves failure screenshots to `.tmp/android-smoke-failures/` (not committed).

Coverage areas:

1. **Global shell / navigation** — bottom nav, More sheet routes, active states, desktop nav sanity
2. **Dashboard** — cards, safe-to-spend, forecast selector, drilldown, bottom-nav clearance
3. **Bills / Debt / Expenses** — filters, mobile cards, desktop table visibility, detail/edit sheets
4. **Settings** — major cards, dialog cancel paths when data exists
5. **Calendar** — month selector, grid/list, day detail sheet
6. **Reports** — print/export visibility, print media nav hiding
7. **Forms/dialogs** — dialog/sheet/alert open-close when actionable data exists
8. **Privacy** — paycheck/receipt/member copy, no UUID labels, no secrets in UI
9. **Overflow helpers** — document/body/main width checks; modal width checks on open elements only

### Helpers (`scripts/lib/android-smoke-helpers.mjs`)

Credential loading (`TEST_EMAIL` / `CASHFLOW_OWNER_*`, `.env`, optional C112 env file), login, overflow checks, route markers (visible headings), navigation helpers, console error collection, failure screenshots, `waitForOpenSheetSettled` (waits for sheet slide animation before measuring bounds).

## Issues found and fixes applied

| Issue | Fix |
|---|---|
| Calendar month selector overflow at 320 px | Stack/wrap selector row; narrower select widths; `min-w-0 overflow-x-hidden` on page |
| Calendar grid duplicate React keys (`blank-1`…) | Keys include week index: `blank-${weekIndex}-${cellIndex}` |
| Calendar day sheet width false-positive during slide animation | `waitForOpenSheetSettled` helper; modal checks filter `data-state="open"` only |
| Right-side sheet could exceed viewport width on mobile | Mobile right sheets use `inset-x-0` full-width layout (`sheet.tsx`) |
| Desktop route marker matched hidden mobile span | `waitForRouteMarker` uses visible headings |

**Known limitation (documented, not failing):** Bill templates dense table may use contained horizontal scroll on mobile (C124); smoke verifies page-level overflow only.

## Privacy

- Paycheck privacy copy checked in Settings when section present
- Receipt private/no-expense copy checked when candidates exist
- Household member/owner copy checked when section present
- No raw UUID-like labels on dashboard/settings
- No service-role or `.tmp` strings in UI
- Two-user subset not required (C112 covers cross-user privacy)

## Validation

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (1325 tests) |

## Browser smoke

```text
node scripts/smoke-android-viewports.mjs
CASHFLOW-CURSOR-126 summary: 320x740:PASS, 390x844:PASS, 412x915:PASS, 1280x800:PASS
```

Forms/dialogs sub-checks report `dialog=false sheet=false alert=false` when the test account has no editable bill/debt rows — acceptable optional path; other areas provide sheet/dialog coverage (calendar day sheet, settings savings dialogs when present).

## Ready to commit

Yes — validation and Android viewport smoke pass; scope matches task; no credentials committed.

## Next task

**CASHFLOW-CURSOR-127**
