"use client";

import { useRef, useState } from "react";
import { reportImportFailure } from "@/app/(app)/accounts/importFailureActions";

/**
 * File Import's read error plus its failure reporting (#194,
 * docs/adr/0013). `fail` shows the error right away and sends the file to
 * the server in the background, where it's kept privately and filed as a
 * GitHub bug. `reported` turns true once that has gone through; it stays
 * false when reporting isn't configured.
 */
export function useImportFileError(accountId: string) {
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState(false);
  // The file being handled now, so a slow report for an earlier pick
  // can't mark a later file's error as reported.
  const currentFile = useRef<File | null>(null);

  function start(file: File) {
    currentFile.current = file;
    setError(null);
    setReported(false);
  }

  function fail(file: File, cause: unknown) {
    const errorMessage =
      typeof cause === "string"
        ? cause
        : cause instanceof Error
          ? cause.message
          : "Couldn't read that file.";
    setError(errorMessage);
    const formData = new FormData();
    formData.set("accountId", accountId);
    formData.set("file", file);
    formData.set("errorMessage", errorMessage);
    reportImportFailure(formData)
      .then((result) => {
        if (currentFile.current === file) setReported(result.reported);
      })
      .catch(() => {});
  }

  return { error, reported, start, fail };
}

/** The file-select step's red read error, plus the "reported" note. */
export function ImportFileError({ message, reported }: { message: string; reported: boolean }) {
  return (
    <>
      <p className="text-small text-danger">{message}</p>
      {reported && (
        <p className="text-small text-neutral-600">
          We kept a copy of this file and reported the problem so it can be fixed.
        </p>
      )}
    </>
  );
}
