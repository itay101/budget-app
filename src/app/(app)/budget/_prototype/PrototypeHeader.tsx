"use client";

// PROTOTYPE ONLY (issue #136): picks the header variant from `?variant=` and
// mounts the floating switcher. The budget page only renders this when the
// prototype is enabled and `?variant=` is present, so the real page is
// untouched otherwise.

import { PrototypeSwitcher } from "@/components/PrototypeSwitcher";
import { VariantA, variantAName } from "./VariantA";
import { VariantB, variantBName } from "./VariantB";
import { VariantC, variantCName } from "./VariantC";
import type { PickerGroup, RtaState, Theme, VariantProps } from "./shared";

const VARIANTS = [
  { key: "A", name: variantAName, Component: VariantA },
  { key: "B", name: variantBName, Component: VariantB },
  { key: "C", name: variantCName, Component: VariantC },
];

// Hebrew category names, to check RTL text next to LTR amounts.
const HEBREW_GROUPS: PickerGroup[] = [
  {
    id: "proto-he-1",
    name: "הוצאות קבועות",
    categories: [
      { id: "proto-he-rent", name: "שכר דירה", available: 0 },
      { id: "proto-he-arnona", name: "ארנונה", available: 412_500 },
      { id: "proto-he-electric", name: "חשמל ומים", available: -86_300 },
    ],
  },
  {
    id: "proto-he-2",
    name: "יומיומי",
    categories: [
      { id: "proto-he-groceries", name: "סופר / מכולת", available: 1_240_000 },
      { id: "proto-he-fuel", name: "דלק", available: 150_000 },
      { id: "proto-he-mixed", name: "Netflix ו-Spotify", available: 89_900 },
    ],
  },
];

export function PrototypeHeader({
  variant,
  state,
  theme,
  names,
  currency,
  currencyOptions,
  groups,
  ...rest
}: Omit<VariantProps, "groups"> & {
  variant: string;
  state: RtaState;
  theme: Theme;
  names: string;
  currencyOptions: string[];
  groups: PickerGroup[];
}) {
  const active = VARIANTS.find((v) => v.key === variant) ?? VARIANTS[0];
  const Component = active.Component;
  return (
    <>
      <Component
        {...rest}
        currency={currency}
        state={state}
        theme={theme}
        groups={names === "hebrew" ? HEBREW_GROUPS : groups}
      />
      <PrototypeSwitcher
        variants={VARIANTS.map(({ key, name }) => ({ key, name }))}
        current={active.key}
        toggles={[
          {
            param: "rta",
            label: "RTA",
            values: ["positive", "zero", "negative"],
            current: state,
          },
          {
            param: "theme",
            label: "Theme",
            values: ["light", "dark"],
            current: theme,
          },
          {
            param: "names",
            label: "Names",
            values: ["real", "hebrew"],
            current: names,
          },
          {
            param: "cur",
            label: "Currency",
            values: currencyOptions,
            current: currency,
          },
        ]}
      />
    </>
  );
}
