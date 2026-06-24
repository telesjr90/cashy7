# CASHFLOW-CURSOR-131E — Mobile/report smoke hardening

## 1. Result

**PASS**

All required viewports (desktop 1280×800, Android mobile 390×844) and the
low-risk narrow mobile viewport (360×740) pass the consolidated dashboard +
reports browser smoke. Validation gates (typecheck, build, 1536 Vitest tests,
RLS audit, function audit) all pass. No product features, formulas, RLS, auth,
or database behavior were changed — this task is smoke/verification only plus a
new aggregator script.

## 2. Files changed

- `scripts/smoke-dashboard-reports-mobile.mjs` — **new** aggregator smoke
  script that reuses shared helpers from `scripts/lib/android-smoke-helpers.mjs`.
- `docs/automation/task_reports/CASHFLOW-CURSOR-131E.md` — this report.
- `docs/automation/task_reports/CASHFLOW-CURSOR-131E.result.json` — machine
  report.

No UI/source fixes were required: the C131A/B/D surfaces already satisfied every
smoke assertion (collapsed cards, drilldown panels, chart tabs/empty state,
`no-print` chart section, `min-w-0`/`overflow-x-auto` containers, full-width
mobile Sheet). The existing focused smoke scripts were intentionally preserved.

## 3. Aggregator smoke behavior

`scripts/smoke-dashboard-reports-mobile.mjs`:

- Reuses shared `login`, `collectConsoleErrors`, `assertNoUuidLabels`,
  `assertOpenModalsFitViewport`, `waitForOpenSheetSettled`, `closeOpenModal`,
  and credential loading from `android-smoke-helpers.mjs` (no duplicated
  login/navigation helpers).
- Adds a reusable, self-contained `describeHorizontalOverflow` /
  `assertNoHorizontalOverflowDetailed` helper that compares
  `document.documentElement.scrollWidth` vs `clientWidth` (1–2px tolerance) and,
  on overflow, logs the viewport, route, scroll/client widths, and a best-effort
  list of the widest offending elements.
- Per viewport it runs the full dashboard flow then the full reports flow, and
  fails on any console error or uncaught page error.
- Viewports: desktop 1280×800 (required), mobile 390×844 (required), narrow
  360×740 (low-risk extra). The optional tablet 768×1024 viewport is
  intentionally excluded — see §7.
- Authentication uses existing credential conventions (owner test account
  resolved by the shared helper from the local smoke env). No credentials are
  printed; no service-role key is used or required.

## 4. Dashboard desktop/mobile result — PASS

For each viewport the aggregator verifies:

- First priority card is **Available to spend after savings**, second is
  **Total amount available**, both ordered ahead of secondary cards.
- Collapsed cards show title + amount only; large inline detail sections are
  hidden by default.
- Available-to-spend drilldown panel: `dashboard-drilldown-panel` visible,
  title visible + non-empty, amount (when present) non-empty, close button
  visible, related detail section present, panel fits viewport, no raw UUIDs,
  closes cleanly.
- Total-available panel: cash + savings explanation/detail section present,
  fits viewport, no raw UUIDs, closes cleanly.
- At least one secondary panel is exercised (the "View bills" panel opened and
  passed fit/UUID checks on every viewport).
- No horizontal overflow and no console/page errors throughout.

## 5. Reports desktop/mobile result — PASS

For each viewport the aggregator verifies:

- Printable monthly report content (`monthly-print-report`) still loads.
- `reports-expense-charts-section` and `reports-expense-chart-tabs` visible.
- All five tabs render a chart or the empty state:
  `reports-expenses-by-category-chart`, `reports-expenses-by-month-chart`,
  `reports-expenses-by-pay-period-chart`, `reports-category-by-month-chart`,
  `reports-category-by-pay-period-chart`. (`reports-expense-chart-empty-state`
  is accepted as a valid fallback when a tab has no data.)
- Tab switching works on mobile.
- The tab row stays inside its own `overflow-x-auto` container and does not push
  the page wider than the viewport.
- The charts section width does not exceed the viewport width.
- No raw UUIDs after cycling all tabs; no console/page errors.

## 6. Print behavior result — PASS

- A `@media print` stylesheet / `.no-print` marker is confirmed present.
- Under `emulateMedia({ media: "print" })`, the expense charts section
  (`reports-expense-charts-section`, which carries the global `no-print` class)
  is computed `display: none`, while the printable monthly report
  (`monthly-print-report`) remains visible.
- No PDF generation/compare is performed (existing smoke does not support it and
  the task does not require it).

## 7. Overflow / accessibility fixes

No fixes were needed for the in-scope dashboard/reports surfaces — they had no
horizontal overflow on desktop 1280, mobile 390, or narrow 360, and the report
chart tooltips/empty-state already carry accessible labels.

**Out-of-scope finding (documented, not fixed):** at the optional tablet
viewport (768×1024), the page overflowed by 80px (`scrollWidth=848` vs
`clientWidth=768`). The widest offender was
`nav[data-testid="desktop-app-nav"]` — the **global** desktop top navigation,
rendered via `<AppNavigation className="hidden md:flex" />` in `src/App.tsx`.
At exactly the Tailwind `md` (768px) breakpoint the desktop nav becomes visible
and its seven buttons exceed the available width. The C131 dashboard cards and
report charts did **not** overflow at 768px.

This is a pre-existing global-navigation layout issue, not a C131
dashboard/reports layout issue, and it is outside this task's allowed-fix scope
(chart/card container width, tab overflow, sheet width, card grid spacing) and
the workflow guidance to avoid `src/App.tsx` unless route-level navigation is
required. The optional tablet viewport was therefore excluded from the
aggregator's required run rather than worked around. The required Android-sized
viewports have zero horizontal overflow.

## 8. Privacy behavior — PASS_WITH_OWNER_ADMIN_EXCEPTION

- The aggregator ran against the owner personal view. No raw UUIDs were visible
  on the dashboard, any drilldown panel, or the reports charts on any viewport;
  the savings drilldown's built-in privacy copy (other user's targets/saved
  amounts remain private) was present.
- Dedicated member-view and owner-admin-toggle privacy UI suites are owned by
  the already-completed/committed C129 (cross-household), C130 (same-household
  two-user), and CASHFLOW-OWNER-001 (owner Admin view) tasks and were not
  re-implemented here. The "owner admin exception" is the intentional, expected
  ability of the owner to view household admin details read-only.
- No privacy success was fabricated: this task's aggregator independently
  verified owner-personal privacy-safe labels and the absence of raw UUIDs.

## 9. Validation results

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run build` | PASS (only the pre-existing, non-failing Vite chunk-size warning) |
| `npm run test:run` | PASS — 89 files, 1536 tests |
| `node scripts/audit-rls-policies.mjs` | PASS — no `using(true)`/`with check(true)`, all tables RLS-enabled |
| `node scripts/audit-database-functions.mjs` | PASS — 0 gaps, all SECURITY DEFINER funcs pin `search_path` |

## 10. Browser smoke result

Dev server: `npm run dev -- --host 127.0.0.1 --port 5234 --strictPort`, then
`CASHFLOW_E2E_BASE_URL=http://127.0.0.1:5234`.

- `node scripts/smoke-dashboard-reports-mobile.mjs` — PASS
  (desktop-1280×800, mobile-390×844, narrow-360×740).
- `node scripts/smoke-dashboard-cards.mjs` — PASS (desktop, mobile).
- `node scripts/smoke-dashboard-drilldown-panels.mjs` — PASS (desktop, mobile).
- `node scripts/smoke-reports-charts.mjs` — PASS (desktop, mobile).

Console errors: 0. Page errors: 0.

## 11. Ready to commit

**Yes** — Result is PASS; typecheck/build/tests/RLS-audit/function-audit pass;
required and low-risk viewport smoke pass; no raw UUIDs; print behavior intact;
no credentials/secrets touched; changes limited to one new aggregator smoke
script and two report files; no migrations, RLS, auth, formula, or dependency
changes. Per task rules and the workflow commit gate, **this task does not
commit or push** — staging is left to the supervisor.

## Remaining known limitations

- Tablet 768×1024 exposes a global desktop-nav overflow at the `md` breakpoint
  (see §7). Out of scope for 131E.
- Member-view and owner-admin-toggle privacy UI are covered by the dedicated
  C129/C130/OWNER-001 suites, not re-run by this aggregator.

## Exact next recommended small task

**CASHFLOW-CURSOR-132** — and, separately, a small dedicated
`app-navigation` tablet-reflow task to make `desktop-app-nav` wrap/scroll (or
defer to the mobile bottom-nav) at the 768px `md` breakpoint so the optional
tablet viewport has no horizontal overflow.
