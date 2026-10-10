#!/usr/bin/env node
// PostToolUse hook (Edit/Write/MultiEdit): lints just the file that was
// changed, so a lint error surfaces on the edit that caused it instead of
// at commit time or in CI. Kept to one file to stay fast; the full
// `npm run verify` is the agent's job before calling work done. Exit 2
// hands ESLint's output back to Claude to fix. See docs/agents/sdlc.md.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const filePath = input.tool_input?.file_path;
const eslint = path.join(root, "node_modules", ".bin", "eslint");

// No node_modules yet (fresh clone, cloud session before npm ci): skip
// rather than fail every edit.
if (filePath && /\.(c|m)?[jt]sx?$/.test(filePath) && existsSync(eslint) && existsSync(filePath)) {
  const result = spawnSync(eslint, ["--no-warn-ignored", filePath], { cwd: root, encoding: "utf8" });
  if (result.status === 1) {
    process.stderr.write(`ESLint found problems in ${path.relative(root, filePath)}:\n${result.stdout}`);
    process.exit(2);
  }
}
