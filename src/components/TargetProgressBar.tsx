import type { TargetStatus } from "@/lib/targets";
import type { OverspendBar } from "@/lib/targetDisplay";
import { TARGET_STATUS_STYLE } from "@/components/targetStatusStyle";

/**
 * A category's target bar (#148, variant C). Normally a track filled to
 * `fraction`. Overspent, it's scaled to what was spent instead: a tick
 * marks 100% (what covered it) and the excess after it is dashed and
 * hatched (`.target-excess`).
 */
export function TargetProgressBar({
  status,
  fraction,
  overspend,
}: {
  status: TargetStatus;
  fraction: number;
  overspend: OverspendBar | null;
}) {
  const style = TARGET_STATUS_STYLE[status];

  if (overspend) {
    return (
      <div
        role="img"
        aria-label={`Overspent ${overspend.excessLabel}`}
        title={`Overspent ${overspend.excessLabel}`}
        className="relative flex h-4 w-full items-center"
      >
        <div
          className={`h-2.5 rounded-s-full opacity-60 ${style.bar}`}
          style={{ width: `${overspend.coveredPct}%` }}
        />
        <div className="target-excess h-2.5 flex-1 rounded-e-full" />
        {overspend.coveredPct > 0 && (
          <div
            className="absolute top-0 h-full w-0.5 bg-neutral-800"
            style={{ insetInlineStart: `calc(${overspend.coveredPct}% - 1px)` }}
          />
        )}
      </div>
    );
  }

  const percent = Math.round(fraction * 100);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="my-[3px] h-2.5 w-full overflow-hidden rounded-full bg-target-track"
    >
      <div
        className={`h-full rounded-full ${style.bar} ${status === "snoozed" ? "opacity-50" : ""}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
