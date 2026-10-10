#!/usr/bin/env node
// PreToolUse hook (Bash): blocks commands an agent must never run on its
// own - history rewrites, pushes to main, and anything that touches a
// real database or production deploy. Adapted from mattpocock's
// git-guardrails-claude-code skill, minus its blanket `git push` block:
// pushing a feature branch and opening a PR is the normal workflow here
// (see CLAUDE.md). Each rule names the route to approval, since a block
// with no way forward just gets retried. See docs/agents/sdlc.md.
import { readFileSync } from "node:fs";

const RULES = [
  [/\bgit\s+push\b[^;&|]*\s(--force(?!-with-lease)\b|-f\b)/, "force-pushes rewrite shared history; use --force-with-lease on your own branch, or ask the user"],
  [/\bgit\s+push\b[^;&|]*[\s:](refs\/heads\/)?main(\s|$)/, "main only changes through a reviewed PR; push a feature branch and open one"],
  [/\bgit\s+reset\s+[^;&|]*--hard\b/, "reset --hard discards work; ask the user, or use git stash"],
  [/\bgit\s+clean\s+[^;&|]*-[a-zA-Z]*f/, "git clean -f deletes untracked files for good; ask the user"],
  [/\bgit\s+branch\s+[^;&|]*-D\b/, "branch -D drops unmerged commits; ask the user"],
  [/\bgit\s+(checkout\s+(--\s+)?|restore\s+)\.(\s|$)/, "this discards every uncommitted change; restore single files instead, or ask the user"],
  [/\bprisma\s+migrate\s+(reset|deploy)\b/, "this runs against whatever DATABASE_URL points at; use `npm run db:e2e:reset` for the e2e database, and leave deploys to Vercel's build"],
  [/\bprisma\s+db\s+push\b[^;&|]*--(force-reset|accept-data-loss)\b/, "this can drop data; generate a migration with `npm run prisma:migrate` instead"],
  [/\bvercel\b[^;&|]*(\s--prod\b|\spromote\b)/, "production deploys come from merging to main; the user authorizes those, not the agent"],
];

// Heredoc bodies and quoted strings are data (a commit message that
// mentions `prisma migrate reset`), not commands, so they're stripped
// before matching. That lets `bash -c "..."` through: this is a guardrail
// against slips, not a sandbox.
function stripData(command) {
  return command
    .replace(/<<-?\s*['"]?(\w+)['"]?[^\n]*\n[\s\S]*?\n\s*\1\s*(\n|$)/g, "\n")
    .replace(/'[^']*'|"(\\.|[^"\\])*"/g, "''");
}

function check(command) {
  const code = stripData(command);
  for (const [pattern, reason] of RULES) {
    if (pattern.test(code)) return reason;
  }
  return null;
}

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const reason = check(input.tool_input?.command ?? "");
if (reason) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `Blocked by .claude/hooks/guard-bash.mjs: ${reason}.`,
      },
    }),
  );
}
