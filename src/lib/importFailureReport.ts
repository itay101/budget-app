import { createHash, randomUUID } from "node:crypto";
import { MAX_IMPORT_FAILURE_BYTES } from "@/lib/importFailureLimits";

/**
 * Pure helpers for File Import failure reports (#194): when File Import
 * can't read a file, the file is kept in a private Supabase Storage bucket
 * and a GitHub `bug` issue is opened (or commented on, for a repeat) - see
 * docs/adr/0013.
 *
 * The issue tracker is public, so nothing built here may carry the file's
 * contents, its original name (bank export names often hold card digits
 * or a person's name), or any user/budget identifier. The issue links the
 * stored file via the Supabase dashboard, which needs a project login,
 * never via a signed URL.
 */

export const IMPORT_FAILURES_BUCKET = "import-failures";

/** How long a kept file stays in the bucket before the purge cron drops it. */
const IMPORT_FAILURE_RETENTION_DAYS = 30;


/**
 * Failures that aren't bugs: legacy .xls is a documented "not supported"
 * case (src/lib/spreadsheet.ts), so it's neither kept nor filed.
 */
const UNREPORTED_EXTENSIONS = new Set(["xls"]);

// MIME types are client-supplied and go into a markdown table: keep only
// well-formed ones.
function safeMimeType(type: string): string {
  return /^[\w.+-]{1,64}\/[\w.+-]{1,128}$/.test(type) ? type : "";
}

export type ImportFailure = {
  errorMessage: string;
  /** Lowercase extension without the dot, or "" when the name has none. */
  extension: string;
  mimeType: string;
  sizeBytes: number;
  accountType: string;
  commitSha?: string;
  /** Path of the kept file inside the bucket, or null if it wasn't stored. */
  storagePath: string | null;
  /** Supabase dashboard link to the kept file's folder, if stored. */
  storageUrl: string | null;
};

/** The extension of `fileName`, lowercased and without the dot. */
export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0 || dot === fileName.length - 1) return "";
  return fileName.slice(dot + 1).toLowerCase();
}

/**
 * The dedupe key: the same error on the same file type is treated as the
 * same bug. Whitespace and case in the message are normalized so trivial
 * differences don't open a second issue.
 */
export function failureFingerprint(errorMessage: string, extension: string): string {
  const normalized = `${extension.toLowerCase()}|${errorMessage.trim().replace(/\s+/g, " ").toLowerCase()}`;
  return createHash("sha256").update(normalized).digest("hex").slice(0, 12);
}

/** Hidden marker in an issue body that identifies its fingerprint. */
export function fingerprintMarker(fingerprint: string): string {
  return `<!-- import-failure:${fingerprint} -->`;
}

/**
 * Where a kept file goes in the bucket: `YYYY-MM-DD/<fingerprint>-<id>.<ext>`.
 * The date folder lets the purge cron drop a whole day at once.
 */
export function storageObjectPath(
  now: Date,
  fingerprint: string,
  extension: string,
  id: string = randomUUID(),
): string {
  const day = now.toISOString().slice(0, 10);
  const ext = /^[a-z0-9]{1,10}$/.test(extension) ? `.${extension}` : "";
  return `${day}/${fingerprint}-${id}${ext}`;
}

/**
 * Supabase dashboard link to a stored object's folder in the bucket. It
 * needs a login to the Supabase project, so it's safe in a public issue.
 * Returns null when the project ref can't be read from `supabaseUrl`.
 */
export function supabaseDashboardStorageUrl(
  supabaseUrl: string | undefined,
  objectPath: string,
): string | null {
  if (!supabaseUrl) return null;
  let host: string;
  try {
    host = new URL(supabaseUrl).hostname;
  } catch {
    return null;
  }
  const match = /^([a-z0-9]+)\.supabase\.co$/.exec(host);
  if (!match) return null;
  const folder = objectPath.includes("/") ? objectPath.slice(0, objectPath.lastIndexOf("/")) : "";
  return `https://supabase.com/dashboard/project/${match[1]}/storage/buckets/${IMPORT_FAILURES_BUCKET}?path=${encodeURIComponent(folder)}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Error text goes into a fenced block; drop backticks so it can't break out.
function fenced(text: string): string {
  return "```\n" + text.replace(/`/g, "'").slice(0, 2000) + "\n```";
}

function detailsTable(failure: ImportFailure): string {
  const stored = failure.storagePath
    ? failure.storageUrl
      ? `[\`${failure.storagePath}\`](${failure.storageUrl}) (private bucket \`${IMPORT_FAILURES_BUCKET}\`, kept ${IMPORT_FAILURE_RETENTION_DAYS} days)`
      : `\`${failure.storagePath}\` (private bucket \`${IMPORT_FAILURES_BUCKET}\`, kept ${IMPORT_FAILURE_RETENTION_DAYS} days)`
    : "not stored (upload failed)";
  return [
    "| | |",
    "| --- | --- |",
    `| File type | \`.${failure.extension || "?"}\` (${failure.mimeType || "unknown MIME type"}) |`,
    `| Size | ${formatBytes(failure.sizeBytes)} |`,
    `| Account type | ${failure.accountType || "unknown"} |`,
    `| Commit | ${failure.commitSha ? `\`${failure.commitSha.slice(0, 7)}\`` : "unknown"} |`,
    `| Stored file | ${stored} |`,
  ].join("\n");
}

export function buildIssueTitle(failure: ImportFailure): string {
  const message = failure.errorMessage.trim().replace(/\s+/g, " ");
  const short = message.length > 80 ? `${message.slice(0, 77)}...` : message;
  return `File Import: can't read .${failure.extension || "?"} file: "${short}"`;
}

export function buildIssueBody(failure: ImportFailure, fingerprint: string): string {
  return [
    fingerprintMarker(fingerprint),
    "Filed automatically when File Import couldn't read a file (#194).",
    "",
    "**Error**",
    "",
    fenced(failure.errorMessage),
    "",
    detailsTable(failure),
    "",
    "The file contains personal financial data: download it from the private bucket to reproduce, and keep it out of the repo (tests use a synthetic file with the same structure).",
    "",
    "Repeat failures with the same error and file type are added as comments here.",
  ].join("\n");
}

export function buildRepeatComment(failure: ImportFailure): string {
  return ["Another file failed with the same error.", "", detailsTable(failure)].join("\n");
}

/**
 * The bucket's top-level date folders (`YYYY-MM-DD`) that are older than
 * the retention window, ready to purge. Anything not shaped like a date
 * is left alone.
 */
export function expiredFolders(
  folderNames: string[],
  now: Date,
  retentionDays: number = IMPORT_FAILURE_RETENTION_DAYS,
): string[] {
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  return folderNames.filter((name) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(name)) return false;
    const day = Date.parse(`${name}T00:00:00Z`);
    // A folder holds a whole UTC day, so it expires once its last moment
    // is past the cutoff.
    return !Number.isNaN(day) && day + 24 * 60 * 60 * 1000 <= cutoff;
  });
}

export type FailedFile = { name: string; type: string; size: number };

/** The issue-tracker calls `fileImportFailure` needs (see githubIssues.ts). */
export type FailureIssueTracker = {
  findOpenIssueWithMarker(marker: string): Promise<{ number: number } | null>;
  createIssue(issue: { title: string; body: string; labels: string[] }): Promise<unknown>;
  addIssueComment(issueNumber: number, body: string): Promise<void>;
};

export type FileImportFailureDeps = {
  /** Stores the file at `path`; resolves the stored path, or null on failure. */
  keepFile(path: string): Promise<string | null>;
  issues: FailureIssueTracker;
  now: Date;
  supabaseUrl?: string;
  commitSha?: string;
};

/**
 * Keeps an unreadable import file and reports it: a comment on the open
 * issue for the same error and file type, or a new `bug` issue. Files over
 * MAX_IMPORT_FAILURE_BYTES arrive without their bytes (see
 * parseImportFailureRequest) and are reported without being stored.
 */
export async function fileImportFailure(
  file: FailedFile,
  errorMessage: string,
  accountType: string,
  deps: FileImportFailureDeps,
): Promise<"created" | "commented"> {
  const extension = fileExtension(file.name);
  const fingerprint = failureFingerprint(errorMessage, extension);
  const storagePath =
    file.size <= MAX_IMPORT_FAILURE_BYTES
      ? await deps.keepFile(storageObjectPath(deps.now, fingerprint, extension))
      : null;

  const failure: ImportFailure = {
    errorMessage,
    extension,
    mimeType: safeMimeType(file.type),
    sizeBytes: file.size,
    accountType,
    commitSha: deps.commitSha,
    storagePath,
    storageUrl: storagePath ? supabaseDashboardStorageUrl(deps.supabaseUrl, storagePath) : null,
  };

  const existing = await deps.issues.findOpenIssueWithMarker(fingerprintMarker(fingerprint));
  if (existing) {
    await deps.issues.addIssueComment(existing.number, buildRepeatComment(failure));
    return "commented";
  }
  await deps.issues.createIssue({
    title: buildIssueTitle(failure),
    body: buildIssueBody(failure, fingerprint),
    labels: ["bug", "needs-triage"],
  });
  return "created";
}

/** The slice of a Supabase Storage bucket the purge needs. */
export type PurgeableBucket = {
  list(prefix: string): Promise<{ data: { name: string }[] | null; error: { message: string } | null }>;
  remove(paths: string[]): Promise<{ error: { message: string } | null }>;
};

/**
 * Deletes every date folder in the bucket older than the retention window
 * and resolves how many files went. A missing bucket means nothing was
 * ever kept, so it purges nothing; any other storage error throws.
 */
export async function purgeExpiredImportFailures(bucket: PurgeableBucket, now: Date): Promise<number> {
  const top = await bucket.list("");
  if (top.error) {
    if (/not found/i.test(top.error.message)) return 0;
    throw new Error(top.error.message);
  }

  let deleted = 0;
  for (const folder of expiredFolders((top.data ?? []).map((entry) => entry.name), now)) {
    const files = await bucket.list(folder);
    if (files.error) throw new Error(files.error.message);
    const paths = (files.data ?? []).map((f) => `${folder}/${f.name}`);
    if (paths.length === 0) continue;
    const removed = await bucket.remove(paths);
    if (removed.error) throw new Error(removed.error.message);
    deleted += paths.length;
  }
  return deleted;
}

/**
 * What `reportImportFailure` needs to file a report: the GitHub token, the
 * form fields, and the file's metadata. `file` is null when the client
 * left the bytes out because the file was over MAX_IMPORT_FAILURE_BYTES.
 * Null overall when reporting isn't configured (no `GITHUB_ISSUES_TOKEN`
 * or service-role key, e.g. local dev and e2e), a field is missing, or the
 * failure isn't a bug (UNREPORTED_EXTENSIONS) - nothing to do.
 */
export function parseImportFailureRequest(
  formData: FormData,
  env: Record<string, string | undefined>,
): {
  token: string;
  accountId: string;
  errorMessage: string;
  meta: FailedFile;
  file: File | null;
} | null {
  const token = env.GITHUB_ISSUES_TOKEN;
  if (!token || !env.SUPABASE_SERVICE_ROLE_KEY) return null;

  const accountId = String(formData.get("accountId") ?? "");
  const errorMessage = String(formData.get("errorMessage") ?? "").trim();
  const sent = formData.get("file");
  const file = sent instanceof File && sent.size <= MAX_IMPORT_FAILURE_BYTES ? sent : null;
  const meta: FailedFile = {
    name: String(formData.get("fileName") ?? ""),
    type: String(formData.get("fileType") ?? ""),
    size: Number(formData.get("fileSize")) || 0,
  };
  if (!accountId || !errorMessage || !meta.name) return null;
  if (UNREPORTED_EXTENSIONS.has(fileExtension(meta.name))) return null;
  return { token, accountId, errorMessage, meta, file };
}
