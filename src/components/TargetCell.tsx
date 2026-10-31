import { formatMilliunitsLtr } from "@/lib/money";
import { parseBudgetMonth } from "@/lib/budgetMonth";
import { dueLabel, overspendBar, targetProgress, type TargetRowNumbers } from "@/lib/targetDisplay";
import type { TargetStatus } from "@/lib/targets";
import { Icon } from "@/components/Icon";
import { TargetProgressBar } from "@/components/TargetProgressBar";
import { TARGET_STATUS_STYLE } from "@/components/targetStatusStyle";

function TargetStatusChip({ status, children }: { status: TargetStatus; children?: React.ReactNode }) {
  const style = TARGET_STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-small font-medium ${style.chip}`}
    >
      <Icon name={style.icon} />
      <span className="truncate">{children ?? style.label}</span>
    </span>
  );
}

/**
 * A budget row's Target cell (#171, variant C of #148): a labelled bar
 * ("$250 of $400" and when it's due, or "+$150 · 125%" when overspent)
 * beside a status chip in a fixed-width slot, so every row's bar has the
 * same width. A category without a target shows "Add target". Clicking
 * either toggles the row's editor.
 *
 * Sits in the row's grid: its own full-width line under the name below
 * `lg`, its own column from `lg` up.
 */
export function TargetCell({
  row,
  status,
  month: monthKey,
  currency,
  open,
  onToggle,
}: {
  row: TargetRowNumbers;
  status: TargetStatus;
  /** The viewed Budget Month, `YYYY-MM`. */
  month: string;
  currency: string;
  open: boolean;
  onToggle: () => void;
}) {
  const month = parseBudgetMonth(monthKey);
  const fmt = (milliunits: number) => formatMilliunitsLtr(milliunits, currency);
  const overspend = overspendBar(row, fmt);
  const progress = month && targetProgress(row, month);
  const placement = "col-span-2 min-w-0 sm:col-span-4 sm:row-start-2 lg:col-span-1 lg:row-start-auto";

  if (!row.target && !overspend) {
    return (
      <div className={placement}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-small text-neutral-600 hover:bg-neutral-100 hover:text-brand-700"
        >
          <Icon name="add" /> Add target
        </button>
      </div>
    );
  }

  const caption = progress && progress.of > 0 ? `${fmt(progress.have)} of ${fmt(progress.of)}` : "";
  const detail = overspend?.excessLabel ?? (row.target && month ? dueLabel(row.target, month) : "");

  return (
    <div className={placement}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`Edit target: ${TARGET_STATUS_STYLE[status].label}`}
        className="flex w-full items-center gap-2 rounded text-start hover:bg-neutral-100/60"
      >
        <span className="block min-w-0 flex-1">
          <TargetProgressBar status={status} fraction={progress?.fraction ?? 0} overspend={overspend} />
          <span className="mt-0.5 flex justify-between gap-2 text-small text-neutral-600">
            <span className="truncate tabular-nums">
              <bdi>{caption}</bdi>
            </span>
            <span className="shrink-0">
              <bdi>{detail}</bdi>
            </span>
          </span>
        </span>
        <span className="block w-36 shrink-0 text-end">
          <TargetStatusChip status={status}>
            {status === "underfunded" && row.need ? `${fmt(row.need.needed)} more` : undefined}
          </TargetStatusChip>
        </span>
      </button>
    </div>
  );
}
