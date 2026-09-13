import { SharingPrototypeApp } from "./SharingPrototypeApp";

// PROTOTYPE route for issue #59 — not linked from any real nav. See the
// top-of-file comment in SharingPrototypeApp.tsx for what this answers.
export const dynamic = "force-dynamic";

export default function SharingUxPrototypePage({
  searchParams,
}: {
  searchParams: { variant?: string; role?: string };
}) {
  const variant =
    searchParams.variant === "B" || searchParams.variant === "C"
      ? searchParams.variant
      : "A";
  const role = searchParams.role === "collaborator" ? "collaborator" : "owner";

  return <SharingPrototypeApp initialVariant={variant} initialRole={role} />;
}
