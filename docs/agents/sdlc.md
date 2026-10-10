# How work moves through this repo

This repo runs Anthropic's [AI-native SDLC playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook) with [mattpocock/skills](https://github.com/mattpocock/skills) (vendored in `.claude/skills/`) as the tooling for each stage. Every stage ends in an artifact the next stage reads, and a human decides at each gate.

## System of record

GitHub Issues is the system of record for intents, specs and plans (see `docs/agents/issue-tracker.md`); the repo holds what outlives a single change (`CONTEXT.md`, `docs/adr/`, `REVIEW.md`, code and tests). The playbook's `intent.md`/`spec.md`/`plan.md` files are issues here, which is where `/to-spec`, `/to-tickets`, `/triage` and `/wayfinder` already read and write. Commits and PRs link back with `Closes #<n>`.

## The loop

| Stage | Skill(s) | Artifact | Gate (human) |
| --- | --- | --- | --- |
| 1. Plan | `/grill-me`, `/grill-with-docs` | **Intent** issue (`.github/ISSUE_TEMPLATE/intent.yml`), `needs-triage` | `/triage`: accept to design, `needs-info`, or `wontfix` |
| 2. Design | `/wayfinder` (bigger than one session), `/prototype`, `/research`, `/domain-modeling` | **Spec** issue from `/to-spec`, `ready-for-agent`; ADRs and `CONTEXT.md` terms for decisions made | User confirms the spec's test seams; an ADR merges with it if a decision is locked in |
| 3. Build | Plan mode, then `/to-tickets`; `/implement` (one ticket) or `/implement-spec` (a ticket graph); `/tdd` | **Plan**: tickets with blocking edges, or for a single ticket a `## Plan` in the PR body (Files that change / Order of work / Risks / Proof). Commits on a descriptive branch | User approves the plan before code. If the build diverges, update the plan in the same push |
| 4. Test | `npm run verify` throughout; `verifier` subagent at the end; `/diagnosing-bugs` for failures | Tests in the diff; verifier report in the PR | Done means verify passes and the verifier's criteria are checked, with output pasted as evidence |
| 5. Deploy | `/code-review` against `REVIEW.md`; Vercel preview (see `CLAUDE.md`) | PR with review findings; preview URL | A human approves and merges. Production is only reached by merging to `main` |
| 6. Maintain | `/triage` (incoming bugs), `/diagnosing-bugs`, `/improve-codebase-architecture`, `/retro` | Bug issue, or a new **Intent** that re-enters stage 1; `CLAUDE.md`/hook/`REVIEW.md` updates from `/retro` | User decides: fix now, schedule, or dismiss |

Small, well-understood changes can skip stages 1–2 and start from a `ready-for-agent` issue; nothing skips stages 4–5.

## Guardrails

Skills advise; hooks enforce. `.claude/settings.json` runs:

- `.claude/hooks/guard-bash.mjs`: denies force-pushes, pushes to `main`, history-destroying git commands, Prisma reset/deploy against `DATABASE_URL`, and Vercel production deploys. The agent may act up to the production gate and never past it.
- `.claude/hooks/guard-paths.mjs`: denies edits to committed migrations and `.env` files; asks before an existing `e2e/*.spec.ts` changes.
- `.claude/hooks/lint-changed.mjs`: lints each edited file right after the edit.

Branch protection on `main` (required review, the `Tests` checks) is the backstop; configure it in GitHub's settings, since it can't live in the repo.

## Feeding back

- When Claude makes the same mistake twice, the fix goes into `CLAUDE.md`. If it must never happen, make it a hook instead.
- A recurring review finding becomes a `REVIEW.md` line.
- Every fixed bug leaves a failing-first test behind (`/tdd`).
- Run `/retro` after a long or rocky session to find what to change.

## Not adopted yet

These plays need infrastructure this repo doesn't have yet. Each lists what it would take.

- **AI review in CI** (`anthropics/claude-code-action` or Claude Code Review): an `ANTHROPIC_API_KEY` secret or an admin enabling Code Review. Both read `REVIEW.md` as-is.
- **Continuous evals** on changes to `CLAUDE.md`, `.claude/**` and `REVIEW.md`: 20–50 recorded tasks with accepted outcomes, plus the API key.
- **Monitored maintenance** (`bands.yaml`, headless `claude -p` on a metric breach): a metric source, e.g. Vercel runtime errors or CI failure rate.
- **Managed settings, Claude Security scans, Claude Tag on-call**: Team/Enterprise admin features.
