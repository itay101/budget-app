// Runs the .claude/hooks/ scripts the way Claude Code does (JSON on
// stdin, decision on stdout / exit code), so a regression in a guardrail
// shows up in CI instead of as a silently-allowed command.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");

function runHook(name: string, toolInput: Record<string, string>) {
  const result = spawnSync("node", [path.join(root, ".claude/hooks", name)], {
    input: JSON.stringify({ tool_input: toolInput }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: "utf8",
  });
  const decision = result.stdout.trim()
    ? JSON.parse(result.stdout).hookSpecificOutput.permissionDecision
    : "allow";
  return { decision, status: result.status, stderr: result.stderr };
}

describe("guard-bash", () => {
  const decide = (command: string) => runHook("guard-bash.mjs", { command }).decision;

  it.each([
    "git push -f origin claude/feature",
    "git push --force origin claude/feature",
    "git push origin main",
    "git push -u origin HEAD:main",
    "git reset --hard origin/main",
    "git clean -fd",
    "git branch -D claude/feature",
    "git checkout -- .",
    "git restore .",
    "npx prisma migrate reset --force",
    "npx prisma migrate deploy",
    "npx prisma db push --accept-data-loss",
    "vercel --prod",
    "npx vercel promote https://x.vercel.app",
    "cat <<'EOF' > notes.txt\nhello\nEOF\ngit push --force origin x",
  ])("denies %j", (command) => {
    expect(decide(command)).toBe("deny");
  });

  it.each([
    "git push -u origin claude/feature",
    "git push --force-with-lease origin claude/feature",
    "git fetch origin main && git checkout -B claude/x origin/main",
    "git checkout -- src/lib/money.ts",
    "npm run db:e2e:reset",
    "npm run prisma:migrate",
    'git commit -m "block prisma migrate reset and git push --force"',
    "git commit -F - <<'EOF'\nfeat: deny prisma migrate reset and vercel --prod\nEOF",
  ])("allows %j", (command) => {
    expect(decide(command)).toBe("allow");
  });
});

describe("guard-paths", () => {
  const decide = (filePath: string) => runHook("guard-paths.mjs", { file_path: filePath }).decision;

  it("denies edits to a committed migration", () => {
    expect(decide(path.join(root, "prisma/migrations/20260821000000_init/migration.sql"))).toBe("deny");
  });

  it("allows writing a new, uncommitted migration", () => {
    expect(decide("prisma/migrations/29990101000000_new/migration.sql")).toBe("allow");
  });

  it.each([".env", ".env.local", ".env.production.local"])("denies %s", (file) => {
    expect(decide(file)).toBe("deny");
  });

  it("allows .env.example", () => {
    expect(decide(".env.example")).toBe("allow");
  });

  it("asks before editing an existing e2e spec", () => {
    expect(decide("e2e/budget.spec.ts")).toBe("ask");
  });

  it("allows adding a new e2e spec", () => {
    expect(decide("e2e/brand-new-flow.spec.ts")).toBe("allow");
  });

  it("allows ordinary source files", () => {
    expect(decide("src/lib/money.ts")).toBe("allow");
  });
});

describe("lint-changed", () => {
  let dir: string;
  // Inside the project (ESLint skips files outside it), under the
  // gitignored test-results/ so a crashed run leaves nothing to commit.
  beforeEach(() => {
    mkdirSync(path.join(root, "test-results"), { recursive: true });
    dir = mkdtempSync(path.join(root, "test-results", "lint-changed-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("passes a clean file", () => {
    expect(runHook("lint-changed.mjs", { file_path: path.join(root, "src/lib/money.ts") }).status).toBe(0);
  });

  it("feeds ESLint errors back with exit 2", () => {
    const file = path.join(dir, "broken.ts");
    writeFileSync(file, "export const x = ;\n");
    const result = runHook("lint-changed.mjs", { file_path: file });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/Parsing error/);
  });

  it("ignores non-JS files", () => {
    expect(runHook("lint-changed.mjs", { file_path: path.join(root, "README.md") }).status).toBe(0);
  });
});
