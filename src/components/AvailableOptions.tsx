import { formatMilliunits } from "@/lib/money";

type CategoryOption = { id: string; name: string; available: number };
type GroupOption = { id: string; name: string; categories: CategoryOption[] };

/**
 * The grouped `<optgroup>`/`<option>` list of categories with their
 * Available, shared by Move Money (MoveMoneyPopover) and the Ready to
 * Assign drawer's Assign money form. Groups with nothing to offer after
 * `exclude` are left out. `<option>` can't hold `<bdi>`, so each name is
 * wrapped in U+2068/U+2069 isolates instead (#136).
 */
export function AvailableOptions({
  groups,
  currency,
  exclude,
}: {
  groups: GroupOption[];
  currency: string;
  /** A category id to leave out, e.g. the one money moves out of. */
  exclude?: string;
}) {
  return groups.map((group) => {
    const options = group.categories.filter((c) => c.id !== exclude);
    if (options.length === 0) return null;
    return (
      <optgroup key={group.id} label={group.name}>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {`⁨${c.name}⁩`} — {formatMilliunits(c.available, currency)}
          </option>
        ))}
      </optgroup>
    );
  });
}
