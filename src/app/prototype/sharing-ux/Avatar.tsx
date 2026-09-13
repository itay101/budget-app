import type { Person } from "./data";

// PROTOTYPE — tiny shared atom, not layout, so it's fine for all three
// variants to use it (see prototype skill: "a shared <Header> is fine").
export function Avatar({
  person,
  size = "sm",
}: {
  person: Pick<Person, "initials" | "avatarColor" | "status">;
  size?: "sm" | "xs";
}) {
  const dims = size === "xs" ? "h-5 w-5 text-[9px]" : "h-6 w-6 text-[10px]";
  return (
    <span
      className={`flex ${dims} shrink-0 items-center justify-center rounded-full font-semibold text-white ${person.avatarColor} ${
        person.status === "pending" ? "opacity-50" : ""
      }`}
    >
      {person.initials}
    </span>
  );
}
