import {
  buildIssueBody,
  buildIssueTitle,
  buildRepeatComment,
  expiredFolders,
  failureFingerprint,
  fileImportFailure,
  fileExtension,
  fingerprintMarker,
  parseImportFailureRequest,
  purgeExpiredImportFailures,
  storageObjectPath,
  supabaseDashboardStorageUrl,
  type FileImportFailureDeps,
  type ImportFailure,
  type PurgeableBucket,
} from "@/lib/importFailureReport";

const failure: ImportFailure = {
  errorMessage: "Cannot read properties of undefined (reading 'sheets')",
  extension: "xlsx",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  sizeBytes: 20480,
  accountType: "CREDIT_CARD",
  commitSha: "abcdef1234567890",
  storagePath: "2026-11-07/0123456789ab-uuid.xlsx",
  storageUrl: "https://supabase.com/dashboard/project/ref/storage/buckets/import-failures?path=2026-11-07",
};

describe("fileExtension", () => {
  it("returns the lowercase extension without the dot", () => {
    expect(fileExtension("Statement.XLSX")).toBe("xlsx");
    expect(fileExtension("a.b.csv")).toBe("csv");
  });

  it("returns empty for names without a usable extension", () => {
    expect(fileExtension("statement")).toBe("");
    expect(fileExtension(".hidden")).toBe("");
    expect(fileExtension("trailing.")).toBe("");
  });
});

describe("failureFingerprint", () => {
  it("is stable across case and whitespace differences in the message", () => {
    expect(failureFingerprint("Bad  file\n", "csv")).toBe(failureFingerprint("bad file", "CSV"));
  });

  it("differs by error and by file type", () => {
    const base = failureFingerprint("Bad file", "csv");
    expect(failureFingerprint("Other error", "csv")).not.toBe(base);
    expect(failureFingerprint("Bad file", "xlsx")).not.toBe(base);
  });

  it("is a 12-char hex string", () => {
    expect(failureFingerprint("x", "csv")).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe("storageObjectPath", () => {
  const now = new Date("2026-11-07T23:30:00Z");

  it("puts the file under a UTC date folder", () => {
    expect(storageObjectPath(now, "fp", "xlsx", "id")).toBe("2026-11-07/fp-id.xlsx");
  });

  it("drops an extension that isn't plain alphanumerics", () => {
    expect(storageObjectPath(now, "fp", "x/../y", "id")).toBe("2026-11-07/fp-id");
    expect(storageObjectPath(now, "fp", "", "id")).toBe("2026-11-07/fp-id");
  });
});

describe("supabaseDashboardStorageUrl", () => {
  it("links the object's folder in the project's dashboard", () => {
    expect(
      supabaseDashboardStorageUrl("https://abcxyz.supabase.co", "2026-11-07/fp-id.xlsx"),
    ).toBe(
      "https://supabase.com/dashboard/project/abcxyz/storage/buckets/import-failures?path=2026-11-07",
    );
  });

  it("returns null when the project ref can't be derived", () => {
    expect(supabaseDashboardStorageUrl(undefined, "a/b")).toBeNull();
    expect(supabaseDashboardStorageUrl("not a url", "a/b")).toBeNull();
    expect(supabaseDashboardStorageUrl("http://localhost:54321", "a/b")).toBeNull();
  });
});

describe("issue text", () => {
  it("carries the fingerprint marker, error and file details", () => {
    const body = buildIssueBody(failure, "0123456789ab");
    expect(body.startsWith(fingerprintMarker("0123456789ab"))).toBe(true);
    expect(body).toContain(failure.errorMessage);
    expect(body).toContain("`.xlsx`");
    expect(body).toContain("20.0 KB");
    expect(body).toContain("CREDIT_CARD");
    expect(body).toContain("`abcdef1`");
    expect(body).toContain(failure.storageUrl!);
  });

  it("never includes a signed URL or the original file name", () => {
    // ImportFailure has no file-name field at all; the body only gets
    // what's passed, so check nothing token-like slips in either.
    const body = buildIssueBody(failure, "fp");
    expect(body).not.toMatch(/token=|sign\//i);
  });

  it("drops a malformed client-supplied MIME type", async () => {
    const created: { body: string }[] = [];
    await fileImportFailure({ name: "a.csv", type: "text/csv | **x**", size: 1 }, "Boom", "CASH", {
      keepFile: async () => null,
      issues: {
        findOpenIssueWithMarker: async () => null,
        createIssue: async (issue) => {
          created.push(issue);
        },
        addIssueComment: async () => {},
      },
      now: new Date(),
    });
    expect(created[0].body).toContain("unknown MIME type");
    expect(created[0].body).not.toContain("**x**");
  });

  it("keeps backticks in the error from breaking out of the code fence", () => {
    const body = buildIssueBody({ ...failure, errorMessage: "bad ```` fence" }, "fp");
    expect(body).toContain("bad '''' fence");
  });

  it("says when the file wasn't stored", () => {
    const comment = buildRepeatComment({ ...failure, storagePath: null, storageUrl: null });
    expect(comment).toContain("not stored");
  });

  it("titles the issue with the file type and a shortened error", () => {
    expect(buildIssueTitle(failure)).toBe(
      `File Import: can't read .xlsx file: "${failure.errorMessage}"`,
    );
    const long = buildIssueTitle({ ...failure, errorMessage: "x".repeat(200) });
    expect(long).toContain(`${"x".repeat(77)}..."`);
  });
});

describe("expiredFolders", () => {
  const now = new Date("2026-11-07T12:00:00Z");

  it("returns only date folders whose whole day is past the 30-day window", () => {
    expect(
      expiredFolders(["2026-10-07", "2026-10-08", "2026-10-06", "2026-11-07", "notes"], now),
    ).toEqual(["2026-10-07", "2026-10-06"]);
  });

  it("honours a custom window", () => {
    expect(expiredFolders(["2026-11-05", "2026-11-06"], now, 1)).toEqual(["2026-11-05"]);
  });
});

describe("fileImportFailure", () => {
  const file = { name: "Card 1234 Statement.xlsx", type: "application/x", size: 100 };
  const now = new Date("2026-11-07T10:00:00Z");

  function deps(existing: { number: number } | null, stored: string | null = "ok") {
    const created: { title: string; body: string; labels: string[] }[] = [];
    const comments: [number, string][] = [];
    const keptAt: string[] = [];
    const d: FileImportFailureDeps = {
      keepFile: async (path) => {
        keptAt.push(path);
        return stored === null ? null : path;
      },
      issues: {
        findOpenIssueWithMarker: async () => existing,
        createIssue: async (issue) => {
          created.push(issue);
        },
        addIssueComment: async (n, body) => {
          comments.push([n, body]);
        },
      },
      now,
      supabaseUrl: "https://proj.supabase.co",
      commitSha: "1234567890",
    };
    return { d, created, comments, keptAt };
  }

  it("keeps the file and opens a bug issue on the first failure", async () => {
    const { d, created, comments, keptAt } = deps(null);
    await expect(fileImportFailure(file, "Boom", "CREDIT_CARD", d)).resolves.toBe("created");
    expect(keptAt[0]).toMatch(/^2026-11-07\/[0-9a-f]{12}-.+\.xlsx$/);
    expect(comments).toHaveLength(0);
    expect(created).toHaveLength(1);
    expect(created[0].labels).toEqual(["bug", "needs-triage"]);
    expect(created[0].body).toContain(fingerprintMarker(failureFingerprint("Boom", "xlsx")));
    expect(created[0].body).toContain("dashboard/project/proj/storage");
  });

  it("keeps the original file name out of the issue", async () => {
    const { d, created } = deps(null);
    await fileImportFailure(file, "Boom", "CREDIT_CARD", d);
    expect(created[0].title + created[0].body).not.toContain("1234 Statement");
  });

  it("comments on the open issue for a repeat failure", async () => {
    const { d, created, comments } = deps({ number: 42 });
    await expect(fileImportFailure(file, "Boom", "CHECKING", d)).resolves.toBe("commented");
    expect(created).toHaveLength(0);
    expect(comments[0][0]).toBe(42);
    expect(comments[0][1]).toContain("CHECKING");
  });

  it("still reports when the upload fails, or when the file is too big to keep", async () => {
    const failed = deps(null, null);
    await fileImportFailure(file, "Boom", "CASH", failed.d);
    expect(failed.created[0].body).toContain("not stored");

    const big = deps(null);
    await fileImportFailure({ ...file, size: 11 * 1024 * 1024 }, "Boom", "CASH", big.d);
    expect(big.keptAt).toHaveLength(0);
    expect(big.created[0].body).toContain("not stored");
  });
});

describe("purgeExpiredImportFailures", () => {
  const now = new Date("2026-11-07T12:00:00Z");

  function bucket(tree: Record<string, string[]>, listError?: string) {
    const removed: string[][] = [];
    const b: PurgeableBucket = {
      list: async (prefix) =>
        listError
          ? { data: null, error: { message: listError } }
          : {
              data: (prefix === "" ? Object.keys(tree) : (tree[prefix] ?? [])).map((name) => ({ name })),
              error: null,
            },
      remove: async (paths) => {
        removed.push(paths);
        return { error: null };
      },
    };
    return { b, removed };
  }

  it("removes every file in expired date folders only", async () => {
    const { b, removed } = bucket({
      "2026-09-01": ["a.csv", "b.xlsx"],
      "2026-10-01": [],
      "2026-11-01": ["c.csv"],
    });
    await expect(purgeExpiredImportFailures(b, now)).resolves.toBe(2);
    expect(removed).toEqual([["2026-09-01/a.csv", "2026-09-01/b.xlsx"]]);
  });

  it("purges nothing when the bucket doesn't exist yet", async () => {
    const { b } = bucket({}, "Bucket not found");
    await expect(purgeExpiredImportFailures(b, now)).resolves.toBe(0);
  });

  it("throws on other storage errors", async () => {
    const { b } = bucket({}, "permission denied");
    await expect(purgeExpiredImportFailures(b, now)).rejects.toThrow("permission denied");
  });
});

describe("parseImportFailureRequest", () => {
  function form(fields: Record<string, string | File>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  }
  const file = new File(["a,b"], "x.csv", { type: "text/csv" });
  const env = { GITHUB_ISSUES_TOKEN: "tok", SUPABASE_SERVICE_ROLE_KEY: "svc" };
  const full = {
    accountId: "acc",
    errorMessage: " Boom ",
    fileName: "x.csv",
    fileType: "text/csv",
    fileSize: "3",
    file,
  };

  it("reads the token, account, trimmed error, file metadata and bytes", () => {
    const parsed = parseImportFailureRequest(form(full), env);
    expect(parsed?.token).toBe("tok");
    expect(parsed?.accountId).toBe("acc");
    expect(parsed?.errorMessage).toBe("Boom");
    expect(parsed?.meta).toEqual({ name: "x.csv", type: "text/csv", size: 3 });
    expect(parsed?.file?.name).toBe("x.csv");
  });

  it("accepts metadata alone when the client left a big file's bytes out", () => {
    const { file: _bytes, ...rest } = { ...full, fileSize: String(50 * 1024 * 1024) };
    const parsed = parseImportFailureRequest(form(rest), env);
    expect(parsed?.file).toBeNull();
    expect(parsed?.meta.size).toBe(50 * 1024 * 1024);
  });

  it("returns null when reporting isn't configured", () => {
    expect(parseImportFailureRequest(form(full), { SUPABASE_SERVICE_ROLE_KEY: "svc" })).toBeNull();
    expect(parseImportFailureRequest(form(full), { GITHUB_ISSUES_TOKEN: "tok" })).toBeNull();
  });

  it("returns null when a field is missing", () => {
    expect(parseImportFailureRequest(form({ ...full, accountId: "" }), env)).toBeNull();
    expect(parseImportFailureRequest(form({ ...full, fileName: "" }), env)).toBeNull();
    expect(parseImportFailureRequest(form({ ...full, errorMessage: "  " }), env)).toBeNull();
  });

  it("doesn't report a legacy .xls upload, a documented unsupported case", () => {
    expect(parseImportFailureRequest(form({ ...full, fileName: "old.XLS" }), env)).toBeNull();
  });
});
