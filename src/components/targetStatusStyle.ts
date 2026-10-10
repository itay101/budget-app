import type { TargetStatus } from "@/lib/targets";

/**
 * Each Category Target status's label, icon and colours (#148): every
 * chip has an icon and a label, so colour is never the only signal. Class
 * names are spelled out in full so Tailwind finds them. Overspent on
 * credit gets its own entry once Payment Categories exist (ADR 0010).
 */
export const TARGET_STATUS_STYLE: Record<
  TargetStatus,
  { label: string; icon: string; chip: string; bar: string; text: string }
> = {
  funded: {
    label: "Funded",
    icon: "check_circle",
    chip: "bg-target-funded-bg text-target-funded-fg",
    bar: "bg-target-funded",
    text: "text-target-funded-fg",
  },
  overfunded: {
    label: "Overfunded",
    icon: "keyboard_double_arrow_up",
    chip: "bg-target-overfunded-bg text-target-overfunded-fg",
    bar: "bg-target-overfunded",
    text: "text-target-overfunded-fg",
  },
  on_track: {
    label: "On track",
    icon: "trending_up",
    chip: "bg-target-ontrack-bg text-target-ontrack-fg",
    bar: "bg-target-ontrack",
    text: "text-target-ontrack-fg",
  },
  underfunded: {
    label: "Underfunded",
    icon: "error",
    chip: "bg-target-underfunded-bg text-target-underfunded-fg",
    bar: "bg-target-underfunded",
    text: "text-target-underfunded-fg",
  },
  overspent: {
    label: "Overspent",
    icon: "warning",
    chip: "bg-target-overspent-bg text-target-overspent-fg",
    bar: "bg-target-overspent",
    text: "text-target-overspent-fg",
  },
  snoozed: {
    label: "Snoozed",
    icon: "snooze",
    chip: "bg-target-snoozed-bg text-target-snoozed-fg",
    bar: "bg-target-snoozed",
    text: "text-target-snoozed-fg",
  },
  none: {
    label: "No target",
    icon: "radio_button_unchecked",
    chip: "bg-target-none-bg text-target-none-fg",
    bar: "bg-target-none",
    text: "text-target-none-fg",
  },
};
