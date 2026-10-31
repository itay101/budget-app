/**
 * The budget page's target editor (#171) as plain data: the draft its
 * fields edit, seeded from the target in effect, and the form fields
 * setTarget (#170) reads, which parseTargetInput validates. Kept out of
 * the component so the mapping is unit tested.
 */

import { formatBudgetMonth } from "@/lib/budgetMonth";
import { milliunitsToNumber } from "@/lib/money";
import type { Target, TargetCadence } from "@/lib/targets";

/** The editor's four kind buttons: Have a balance splits into dated and
 * undated. */
export type EditorKind = "SET_ASIDE" | "REFILL" | "BALANCE_DATED" | "BALANCE";

export const EDITOR_KINDS: [EditorKind, string][] = [
  ["SET_ASIDE", "Set aside"],
  ["REFILL", "Refill up to"],
  ["BALANCE_DATED", "Balance by date"],
  ["BALANCE", "Balance with no date"],
];

/** Every field the editor shows, as the strings its inputs hold. */
export interface TargetDraft {
  kind: EditorKind;
  cadence: TargetCadence;
  amount: string;
  /** 0 = Sunday ... 6 = Saturday. */
  weekday: string;
  dueDay: string;
  /** `YYYY-MM-DD`, for a yearly target. */
  dueDate: string;
  /** `YYYY-MM`, for a dated balance. */
  dueMonth: string;
}

const EMPTY_DRAFT: TargetDraft = {
  kind: "SET_ASIDE",
  cadence: "MONTHLY",
  amount: "",
  weekday: "1",
  dueDay: "",
  dueDate: "",
  dueMonth: "",
};

function editorKind(target: Target): EditorKind {
  if (target.kind !== "BALANCE") return target.kind === "REFILL" ? "REFILL" : "SET_ASIDE";
  return target.dueDate ? "BALANCE_DATED" : "BALANCE";
}

/** The draft for a target, or a blank monthly Set aside when there is
 * none. Fields the target doesn't use keep their blank defaults. */
export function draftFrom(target: Target | null): TargetDraft {
  if (!target || target.kind === "NONE") return EMPTY_DRAFT;
  const dueDate = target.dueDate ? new Date(target.dueDate) : null;
  const kind = editorKind(target);
  return {
    ...EMPTY_DRAFT,
    kind,
    cadence: target.cadence ?? EMPTY_DRAFT.cadence,
    amount: String(milliunitsToNumber(target.amount)),
    weekday: target.weekday === null ? EMPTY_DRAFT.weekday : String(target.weekday),
    dueDay: target.dueDay ? String(target.dueDay) : "",
    dueDate: dueDate && target.cadence === "YEARLY" ? dueDate.toISOString().slice(0, 10) : "",
    dueMonth: dueDate && kind === "BALANCE_DATED" ? formatBudgetMonth(dueDate) : "",
  };
}

/** Whether the draft's kind repeats (Set aside, Refill up to). */
export function isRecurring(draft: TargetDraft): boolean {
  return draft.kind === "SET_ASIDE" || draft.kind === "REFILL";
}

/** The form fields setTarget reads for the draft: only the ones its kind
 * and cadence use. */
export function targetFields(draft: TargetDraft): Record<string, string | undefined> {
  if (!isRecurring(draft)) {
    const dated = draft.kind === "BALANCE_DATED";
    return { kind: "BALANCE", amount: draft.amount, dated: String(dated), dueMonth: dated ? draft.dueMonth : undefined };
  }
  const only = (cadence: TargetCadence, value: string) => (draft.cadence === cadence ? value : undefined);
  return {
    kind: draft.kind,
    amount: draft.amount,
    cadence: draft.cadence,
    weekday: only("WEEKLY", draft.weekday),
    dueDay: only("MONTHLY", draft.dueDay),
    dueDate: only("YEARLY", draft.dueDate),
  };
}
