/**
 * Largest file sent along with a File Import failure report (#194). Kept in
 * its own module so the client can import it without pulling in the
 * server-side report helpers. next.config's server-action body limit is
 * 10 MB; this leaves room for the multipart overhead. A bigger file is
 * reported with its metadata only.
 */
export const MAX_IMPORT_FAILURE_BYTES = 9 * 1024 * 1024;
