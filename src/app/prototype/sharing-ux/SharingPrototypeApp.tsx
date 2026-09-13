"use client";

// PROTOTYPE — throwaway answer to issue #59 ("Prototype the sharing
// UI/UX"). Three structurally different mockups of the same four flows —
// inviting a collaborator, the budget switcher distinguishing owned vs.
// shared budgets, a collaborator's restricted view, and removing/leaving
// — switchable via the floating bar at the bottom (?variant=A|B|C) and
// reload-stable via the URL. There's no auth/sharing model in the schema
// yet, so all the budgets/people below are fake and live only in this
// component's state; nothing here calls a server action.
//
//   A — Inline in the switcher: manage collaborators as an accordion
//       inside the existing budget-switcher popover.
//   B — Dedicated collaborators page: a settings-style page swaps into
//       the main content area, reached via a gear icon.
//   C — Slide-over drawer: a right-hand drawer over the whole app,
//       reached via a people icon next to the budget name.
//
// Pick a favorite (or mix pieces), then fold the winner into the real
// Sidebar/BudgetSwitcherPopover and drop this route from main — see
// .claude/skills/prototype/SKILL.md.

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  INITIAL_BUDGETS,
  makeInvitedPerson,
  type FakeBudget,
} from "./data";
import { PrototypeSwitcher, type VariantKey } from "./PrototypeSwitcher";
import { VariantA } from "./VariantA";
import { VariantB } from "./VariantB";
import { VariantC } from "./VariantC";

export interface VariantProps {
  budgets: FakeBudget[];
  activeBudgetId: string;
  onSelectBudget: (id: string) => void;
  onInvite: (budgetId: string, email: string) => void;
  onRemove: (budgetId: string, personId: string) => void;
  onLeave: (budgetId: string) => void;
}

export function SharingPrototypeApp({
  initialVariant,
  initialRole,
}: {
  initialVariant: VariantKey;
  /** Only used to pick a sensible starting budget; the real driver of the
   * owner/collaborator view is which budget is active, computed from the
   * fake data itself. */
  initialRole: "owner" | "collaborator";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [variant, setVariant] = useState<VariantKey>(initialVariant);
  const [budgets, setBudgets] = useState<FakeBudget[]>(INITIAL_BUDGETS);
  const [activeBudgetId, setActiveBudgetId] = useState(
    initialRole === "collaborator" ? "roommates" : "household",
  );

  const syncUrl = useCallback(
    (nextVariant: VariantKey) => {
      router.replace(`${pathname}?variant=${nextVariant}`, { scroll: false });
    },
    [pathname, router],
  );

  function handleVariantChange(next: VariantKey) {
    setVariant(next);
    syncUrl(next);
  }

  const handleInvite = useCallback((budgetId: string, email: string) => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setBudgets((prev) =>
      prev.map((b) =>
        b.id === budgetId
          ? { ...b, people: [...b.people, makeInvitedPerson(trimmed)] }
          : b,
      ),
    );
  }, []);

  const handleRemove = useCallback((budgetId: string, personId: string) => {
    setBudgets((prev) =>
      prev.map((b) =>
        b.id === budgetId
          ? { ...b, people: b.people.filter((p) => p.id !== personId) }
          : b,
      ),
    );
  }, []);

  const handleLeave = useCallback(
    (budgetId: string) => {
      setBudgets((prev) =>
        prev.map((b) =>
          b.id === budgetId
            ? { ...b, people: b.people.filter((p) => !p.isViewer) }
            : b,
        ),
      );
      // You no longer have access — fall back to a budget you own, same
      // as the real app would after the membership disappears.
      setActiveBudgetId((current) =>
        current === budgetId ? "household" : current,
      );
    },
    [],
  );

  const variantProps: VariantProps = useMemo(
    () => ({
      budgets,
      activeBudgetId,
      onSelectBudget: setActiveBudgetId,
      onInvite: handleInvite,
      onRemove: handleRemove,
      onLeave: handleLeave,
    }),
    [budgets, activeBudgetId, handleInvite, handleRemove, handleLeave],
  );

  return (
    <div className="fixed inset-0 z-40 bg-neutral-100">
      {variant === "A" && <VariantA {...variantProps} />}
      {variant === "B" && <VariantB {...variantProps} />}
      {variant === "C" && <VariantC {...variantProps} />}
      <PrototypeSwitcher current={variant} onChange={handleVariantChange} />
    </div>
  );
}
