# Project notes for Claude

## Preview links after pushing

After every `git push` to a remote branch in this repo, surface the Vercel
preview deployment link back in the chat (not just in the PR/commit) so the
user can verify the change from Claude Code directly, without needing to
open GitHub.

- The link shows up as a `Vercel` commit status / PR check
  (`https://vercel.com/...` inspector URL, and a `...vercel.app` preview
  URL) shortly after the push — it starts "pending" while building, then
  flips to "success" once ready.
- If a PR is open and subscribed via `subscribe_pr_activity`, the preview
  URL will also arrive as a `vercel[bot]` PR comment event; when it does,
  pull the `previewUrl`/`Preview` link out of it and post it in the chat
  reply rather than only mentioning that CI passed.
- If no PR event arrives yet, check the commit/PR status directly
  (`pull_request_read` → `get_status`, or the repo's commit statuses) to
  find the Vercel deployment URL and share it once it's ready.

## Branch naming

Branch names should be descriptive and closely mirror the ticket/issue
title they implement, not just `ticket-<number>-<random suffix>`. e.g. for
"Add a free-text filter (memo/payee) to the transactions list", prefer
something like `claude/add-memo-payee-filter-<suffix>` over
`claude/ticket-22-<suffix>`.
