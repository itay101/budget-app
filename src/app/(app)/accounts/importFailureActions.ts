"use server";

import { prisma } from "@/lib/prisma";
import { requireAccountAccess } from "@/lib/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  addIssueComment,
  createIssue,
  findOpenIssueWithMarker,
  type GitHubIssuesConfig,
} from "@/lib/githubIssues";
import {
  IMPORT_FAILURES_BUCKET,
  fileImportFailure,
  parseImportFailureRequest,
} from "@/lib/importFailureReport";

const ISSUE_REPO = { owner: "itay101", repo: "budget-app" };

// Uploads the file to the private bucket, creating the bucket (private) the
// first time. Returns the stored path, or null if the upload failed - the
// issue still gets filed without it.
async function keepFile(file: File, path: string): Promise<string | null> {
  const storage = createAdminClient().storage;
  const upload = () =>
    storage.from(IMPORT_FAILURES_BUCKET).upload(path, file, {
      contentType: file.type || "application/octet-stream",
      // The original name stays here, never in the public issue.
      metadata: { originalName: file.name },
    });

  let { error } = await upload();
  if (error && /bucket not found/i.test(error.message)) {
    await storage.createBucket(IMPORT_FAILURES_BUCKET, { public: false });
    ({ error } = await upload());
  }
  if (error) {
    console.error("[import-failure] upload failed:", error.message);
    return null;
  }
  return path;
}

/**
 * Called by File Import (#194) when a file can't be read: keeps the file in
 * a private Supabase Storage bucket and opens a GitHub `bug` issue for it,
 * or comments on the open issue for the same error and file type. See
 * docs/adr/0013 and fileImportFailure in src/lib/importFailureReport.ts.
 *
 * Never throws: reporting must not get in the way of the import modal's
 * own error. Resolves `reported: false` when it isn't configured
 * (`GITHUB_ISSUES_TOKEN`/`SUPABASE_SERVICE_ROLE_KEY` unset, e.g. local
 * dev and e2e) or when anything fails.
 */
export async function reportImportFailure(
  formData: FormData,
): Promise<{ reported: boolean }> {
  const request = parseImportFailureRequest(formData, process.env);
  if (!request) return { reported: false };
  const { token, accountId, file, errorMessage } = request;

  try {
    await requireAccountAccess(accountId);
    const account = await prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { type: true },
    });
    const github: GitHubIssuesConfig = { token, ...ISSUE_REPO };
    await fileImportFailure(file, errorMessage, account.type, {
      keepFile: (path) => keepFile(file, path),
      issues: {
        findOpenIssueWithMarker: (marker) => findOpenIssueWithMarker(github, marker),
        createIssue: (issue) => createIssue(github, issue),
        addIssueComment: (n, body) => addIssueComment(github, n, body),
      },
      now: new Date(),
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA,
    });
    return { reported: true };
  } catch (err) {
    console.error("[import-failure] report failed:", err);
    return { reported: false };
  }
}
