"use client";

import { Icon } from "@/components/Icon";

/**
 * The bits of File Import's UI that belong to AI column detection (#197,
 * docs/adr/0014), kept out of ImportTransactionsModal to keep that one
 * readable.
 */

export type AutoDetected = "skipped" | "prefilled" | null;

/** Shown while the detection request runs. */
export function DetectingStep({
  active,
  fileName,
  onSkip,
}: {
  active: boolean;
  fileName: string;
  onSkip: () => void;
}) {
  if (!active) return null;
  return (
    <div className="space-y-3" role="status">
      <p className="text-body text-neutral-600">
        Detecting the columns in {fileName ? <strong>{fileName}</strong> : "the file"}…
      </p>
      <p className="text-small text-neutral-600">
        A masked sample of the first few rows is sent to an AI model: digits and
        letters are replaced, so no real payees or amounts leave the app.
      </p>
      <button type="button" onClick={onSkip} className="text-small text-brand-700 hover:underline">
        Skip and match the columns myself
      </button>
    </div>
  );
}

/** On the mapping step, when its columns came from detection. */
export function DetectedMappingNote({ autoDetected }: { autoDetected: AutoDetected }) {
  if (!autoDetected) return null;
  return (
    <p className="flex items-start gap-1.5 text-small text-neutral-600">
      <Icon name="info" className="mt-0.5 shrink-0 text-[1.1em]" />
      {autoDetected === "prefilled"
        ? "These columns were detected automatically, but not confidently enough to skip this step - check them before continuing."
        : "These columns were detected automatically - fix anything that's wrong and continue."}
    </p>
  );
}

/** On the preview step, after detection skipped the mapping step. */
export function DetectedPreviewBanner({
  autoDetected,
  onFix,
  disabled,
}: {
  autoDetected: AutoDetected;
  onFix: () => void;
  disabled: boolean;
}) {
  if (autoDetected !== "skipped") return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-brand-700/10 px-2 py-1.5 text-small text-neutral-700">
      <span className="flex items-center gap-1.5">
        <Icon name="info" className="shrink-0 text-[1.1em]" />
        Columns were detected automatically.
      </span>
      <button
        type="button"
        onClick={onFix}
        disabled={disabled}
        className="font-medium text-brand-700 hover:underline disabled:opacity-50"
      >
        Fix column mapping
      </button>
    </div>
  );
}
