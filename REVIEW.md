# Review guide

How to review a PR in this repo, for people and for agents (`/code-review`, Claude Code Review, the `verifier` subagent). Findings inform the reviewer; they don't approve or block on their own. The agent that wrote a change never approves it.

## Passes

Run three passes, in this order.

1. **Bugs and logic.** Wrong results, unhandled cases, broken neighbouring flows. Money is the usual suspect: amounts are integer milliunits (`src/lib/money.ts`), so any float arithmetic on an amount, or a conversion outside `numberToMilliunits`/`milliunitsToNumber`, is a bug. So is month math that ignores the budget's timezone (tests run with `TZ=Asia/Jerusalem` on purpose).
2. **Security.** Every server action that reads or writes Budget data calls the matching `require*Access`/`requireBudgetOwnership` from `src/lib/authorization.ts` on the server, and never trusts a budget/account/category id from the client without it. Redirect targets go through `safeRedirectPath`. No secrets in the diff; new env vars go in `.env.example`. The e2e login shortcut stays guarded (ADR 0006).
3. **Compliance.** The diff does what its issue's spec and acceptance criteria ask, no more and no less. It respects every ADR in `docs/adr/` it touches (or a new ADR supersedes one). Mutations on a Budget write an `AuditEntry` via `auditedCreate`/`auditedUpdate`/`auditedDelete` (ADR 0002). Domain names follow `CONTEXT.md`. Schema changes come with a generated migration, and no committed migration is edited. Existing `e2e/*.spec.ts` assertions only change with the user's recorded approval.

## Severity

- **Important**: a bug, a security gap, a broken invariant above, a spec/ADR violation, or a missing test for new logic in `src/lib/`. Must be fixed or explicitly answered before merge.
- **Nit**: style, naming, comments, small simplifications. Never blocks.

Post at most five nits per review; summarise the rest as a count.

## Skip

- `prisma/migrations/` (generated), `package-lock.json`
- anything CI already enforces: lint, formatting, types, unit test pass/fail
- `.claude/skills/` and `.agents/skills/` (vendored from mattpocock/skills, see `skills-lock.json`)

## Feeding back

A finding that recurs across PRs becomes a rule: in `CLAUDE.md` if it steers how code gets written, a hook in `.claude/hooks/` if it must always hold, or a line in this file if only review can catch it.
