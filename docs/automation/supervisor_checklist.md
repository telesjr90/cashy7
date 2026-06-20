# Cashflow Supervisor Checklist

Before committing a task, verify:

## Result gate
- [ ] Report says PASS
- [ ] Not PARTIAL
- [ ] Not BLOCKED

## Validation gate
- [ ] `npm run typecheck` passed
- [ ] `npm run build` passed
- [ ] `npm run test:run` passed
- [ ] Browser smoke passed when required

## Diff gate
- [ ] `git diff --stat` matches task scope
- [ ] No unrelated files changed
- [ ] No `.env` values exposed
- [ ] No credentials committed
- [ ] No service role key in frontend
- [ ] No unexpected migration unless task required it

## Privacy gate
- [ ] Own cash data only
- [ ] Own payment/credit transactions only
- [ ] Own savings contribution/target data only
- [ ] No other user's private values exposed

## Product-rule gate
- [ ] Mark paid does not deduct cash
- [ ] Pay & deduct cash creates audit + cash snapshot
- [ ] Existing Dashboard formulas unchanged unless task requested it
- [ ] Existing RLS assumptions preserved