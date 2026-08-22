/**
 * Wraps a single Material Symbols glyph (fonts.google.com/icons — the font
 * itself is loaded once, in the root layout). Every icon in the app goes
 * through this component rather than a raw <span>, so the font class and
 * accessibility defaults live in one place.
 *
 * Purely decorative by default (aria-hidden, since the button/element it
 * sits in already carries a `title` or visible label) — pass `label` for
 * the rare case where the icon *is* the entire accessible name.
 */
export function Icon({
  name,
  filled = false,
  label,
  className = "",
}: {
  /** A Material Symbols icon name, e.g. "check", "delete", "edit". */
  name: string;
  /** Use the filled variant instead of the default outline. */
  filled?: boolean;
  /** Accessible name, for an icon-only control with no other label/title. */
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {name}
    </span>
  );
}
