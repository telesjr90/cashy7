# CASHFLOW-CURSOR-122 — Mobile navigation

## Result: PASS

Added a shared navigation model and mobile-friendly bottom navigation with a More sheet for secondary routes. Desktop navigation is unchanged in behavior and remains visible from the `md` breakpoint upward.

## Navigation pattern decision

**Option B — Bottom nav + More drawer**

- Primary bottom tabs: Dashboard, Bills, Expenses, Calendar
- **More** opens a bottom Sheet with Debt, Reports, Settings
- Chosen because the app already ships shadcn `Sheet` (Radix dialog) with focus management and Escape/outside-click close, and bottom tabs give one-tap access to the most-used routes without opening a menu each time
- Desktop keeps the existing horizontal nav extracted into `AppNavigation`

## Files changed

| File | Change |
|------|--------|
| `src/lib/navigation.ts` | Shared authenticated nav config, active-state helpers, mobile primary/secondary groups |
| `src/lib/navigation.test.ts` | Pure tests for nav items, active state, mobile groups, UUID-safe labels |
| `src/components/app-navigation.tsx` | Desktop nav extracted from `App.tsx` |
| `src/components/mobile-navigation.tsx` | Mobile bottom nav + More sheet |
| `src/App.tsx` | Uses shared nav components; mobile route title in header; main padding for bottom nav |
| `scripts/smoke-mobile-navigation.mjs` | Browser smoke at 390×844 mobile and 1280×800 desktop |

## Schema/RLS decision

No migration. No RLS changes. UI/component/test work only.

## Behavior implemented

### Shared navigation model

- `APP_NAV_ITEMS` lists Dashboard, Bills, Expenses, Debt, Calendar, Reports, Settings
- Public routes (`/login`, `/signup`, `/accept-invite`) are excluded
- `isNavItemActive` supports nested paths such as `/bills/new`
- Mobile primary: Dashboard, Bills, Expenses, Calendar
- Mobile secondary: Debt, Reports, Settings

### Mobile

- Bottom nav visible below `md` (`768px`)
- Header shows current route label on mobile
- Compact sign-out control (icon + screen-reader text on xs)
- Main content gets bottom padding so content is not hidden behind the bar
- More sheet closes on route selection and on pathname change
- Both header and bottom nav use `.no-print`

### Desktop

- Horizontal nav unchanged in routes and active styling
- Hidden below `md`; bottom nav hidden at `md+`

### Accessibility & privacy

- Menu/More button has accessible label and `aria-expanded`
- Active routes use `aria-current="page"` on bottom links or the More button for secondary routes
- Sheet uses existing Radix focus trap
- Nav labels are static strings with no private amounts, UUIDs, or user data

## Validation

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS |

## Browser smoke

| Check | Result |
|-------|--------|
| Mobile viewport load (390×844) | PASS |
| Nav chrome fits viewport | PASS |
| Bottom nav visible; desktop nav hidden on mobile | PASS |
| All seven routes reachable | PASS |
| Active state updates | PASS |
| More sheet closes after selection | PASS |
| Print media hides nav | PASS |
| Desktop viewport shows desktop nav | PASS |
| No console errors | PASS |

Command: `node scripts/smoke-mobile-navigation.mjs` against dev server on `127.0.0.1:5222`

## Privacy guarantees preserved

No financial data, private cash, savings, paycheck, or user-specific identifiers appear in navigation.

## Remaining limitations

- Page content (dashboard cards, tables, forms) is not yet responsive — owned by C123–C125
- Full Android viewport smoke suite is deferred to C126
- Some dashboard content may still scroll horizontally on mobile; smoke verifies nav chrome only

## Next recommended task

**CASHFLOW-CURSOR-123** — Responsive Dashboard cards
