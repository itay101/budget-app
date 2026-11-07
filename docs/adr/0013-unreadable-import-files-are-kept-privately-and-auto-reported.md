# Unreadable import files are kept privately and auto-reported

When File Import can't read a file, the file is kept and a GitHub bug is filed
without the user doing anything (#194). "Can't read" covers both failures in
`handleFile`: `readImportFile` throws, or the file has fewer than two rows.
Each unreadable bank export then becomes a reproducible report.

- **Storage:** a private Supabase Storage bucket, `import-failures`, that
  only the server's service-role client reads or writes. The server
  creates it the first time it uploads. Objects go under
  `YYYY-MM-DD/<fingerprint>-<uuid>.<ext>`, and the original file name is
  kept only as the object's metadata. Files over 10 MB aren't stored, but
  they are still reported. The server-action body limit was raised to
  10 MB to match.
- **Retention:** 30 days. A daily cron, `/api/cron/purge-import-failures`,
  deletes whole date folders once they're older than that.
- **The issue is public**, because the repo is. It shows the error text,
  the file's extension, MIME type and size, the account type and the
  commit. It never shows the file's contents, its original name (bank
  export names carry card digits and people's names), or any user or
  budget identifier. It links the stored file through the Supabase
  dashboard, which needs a project login, and never through a signed URL,
  which would make the file public.
- **Dedupe:** the fingerprint is a hash of the normalized error text plus
  the file extension. It sits in the issue body as a hidden
  `<!-- import-failure:<fp> -->` marker. A repeat comments on the open
  `bug` issue that carries the marker. Once that issue is closed, a new
  failure opens a fresh issue. The lookup lists open issues instead of
  calling the search API, because search lags behind new issues.
- **Auth:** a fine-grained token, `GITHUB_ISSUES_TOKEN`, with Issues: read
  & write on this repo only. It's a plain REST call, with no SDK and no
  GitHub App.
- **The user is told, with no opt-out.** Once the report has gone
  through, the modal shows "We kept a copy of this file and reported the
  problem so it can be fixed." under the error.
- **Best-effort:** without `GITHUB_ISSUES_TOKEN` or the service-role key
  (local dev, e2e), reporting is a no-op. Any failure while reporting is
  logged and swallowed, so the import modal's own error is unaffected.
