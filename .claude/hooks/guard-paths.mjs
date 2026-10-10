#!/usr/bin/env node
// PreToolUse hook (Edit/Write/MultiEdit): enforces the file rules from
// AGENTS.md / CLAUDE.md that a skill or prompt can only advise:
// - committed prisma/migrations/ history is never hand-edited (deny)
// - .env files hold real secrets and stay out of the agent's hands (deny)
// - an existing e2e/*.spec.ts needs the user's approval to change (ask);
//   new spec files are fine
// See docs/agents/sdlc.md.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const filePath = input.tool_input?.file_path ?? input.tool_input?.notebook_path;

function isTracked(rel) {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", rel], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function decide(rel) {
  const base = path.basename(rel);
  if (/^\.env(\..+)?$/.test(base) && base !== ".env.example") {
    return ["deny", ".env files hold real secrets; ask the user to change it, and document new variables in .env.example"];
  }
  if (rel.startsWith("prisma/migrations/") && isTracked(rel)) {
    return ["deny", "committed migrations are history Prisma generated; change prisma/schema.prisma and run `npm run prisma:migrate` to add a new one"];
  }
  if (/^e2e\/[^/]+\.spec\.ts$/.test(rel) && existsSync(path.join(root, rel))) {
    return ["ask", "editing an existing e2e spec needs the user's explicit approval (CLAUDE.md); explain why the change is needed"];
  }
  return null;
}

if (filePath) {
  const rel = path.relative(root, path.resolve(root, filePath)).split(path.sep).join("/");
  const verdict = rel.startsWith("..") ? null : decide(rel);
  if (verdict) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: verdict[0],
          permissionDecisionReason: `.claude/hooks/guard-paths.mjs: ${verdict[1]}.`,
        },
      }),
    );
  }
}
