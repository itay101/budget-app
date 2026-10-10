"use client";

// PROTOTYPE (issue #148), throwaway: how targets show up on the budget
// page. Three variants of the budget table, switchable via `?variant=A|B|C`
// on the existing /budget route, plus `theme=dark`, `dir=rtl` and
// `data=real` toggles in the floating bar. Edits only touch memory.

import { PrototypeSwitcher } from "@/components/PrototypeSwitcher";
import type { ProtoCategory } from "./model";
import { PROTO_CSS, useTargetsStore } from "./shared";
import { VariantA } from "./VariantA";
import { VariantB } from "./VariantB";
import { VariantC } from "./VariantC";

const VARIANTS = [
  { key: "A", name: "Bar under the name", Component: VariantA },
  { key: "B", name: "Inspector", Component: VariantB },
  { key: "C", name: "Target column", Component: VariantC },
];

export function TargetsPrototype({
  variant,
  theme,
  dir,
  data,
  categories,
  month,
  currency,
}: {
  variant: string;
  theme: string;
  dir: string;
  data: string;
  categories: ProtoCategory[];
  month: string;
  currency: string;
}) {
  // Remount the store when the data source changes.
  return (
    <Inner
      key={data}
      variant={variant}
      theme={theme}
      dir={dir}
      data={data}
      categories={categories}
      month={month}
      currency={currency}
    />
  );
}

function Inner({
  variant,
  theme,
  dir,
  data,
  categories,
  month,
  currency,
}: Parameters<typeof TargetsPrototype>[0]) {
  const store = useTargetsStore(categories, month, currency);
  const current = VARIANTS.find((v) => v.key === variant) ?? VARIANTS[0];
  const Component = current.Component;

  return (
    <div className="proto-root rounded-lg p-2 pb-24" data-theme={theme} dir={dir}>
      <style>{PROTO_CSS + PROTO_POPOVER_CSS}</style>
      <p className="mb-2 text-small" style={{ color: "var(--p-text-2)" }}>
        <strong>Prototype for #148.</strong>{" "}
        {data === "real"
          ? "Your real categories and numbers, with made-up targets."
          : "Fixture budget covering every status."}{" "}
        Edits stay in memory and reset on reload.
      </p>
      <Component store={store} />
      <PrototypeSwitcher
        variants={VARIANTS.map(({ key, name }) => ({ key, name }))}
        current={current.key}
        toggles={[
          { param: "theme", label: "Theme", values: ["light", "dark"] },
          { param: "dir", label: "Dir", values: ["ltr", "rtl"] },
          { param: "data", label: "Data", values: ["fixture", "real"] },
          { param: "over", label: "Overspent", values: ["dashed", "solid", "label"] },
        ]}
      />
    </div>
  );
}

const PROTO_POPOVER_CSS = `
.proto-popover { background: var(--p-surface); border-color: var(--p-border); color: var(--p-text); }
`;
