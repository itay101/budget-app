"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AutoAssignCategory } from "@/lib/autoAssign";

export type AutoAssignAction = (formData: FormData) => Promise<{
  applied: { categoryId: string; from: number; to: number }[];
  skipped: string[];
}>;

/** What every Auto-Assign menu on the page shares (#219). */
export interface AutoAssignContext {
  /** Every category's inputs, in display order; a group menu filters. */
  categories: AutoAssignCategory[];
  /** The most a run may add (getBudgetMonthRows' autoAssignLimit). */
  limit: number;
  run: AutoAssignAction;
  undo: AutoAssignAction;
}

interface ReadyToAssignContextValue {
  total: number;
  autoAssign: AutoAssignContext;
}

/**
 * The viewed month's Ready to Assign, in milliunits, and what Auto-Assign
 * needs, for everything on the budget page under it: Move Money offers
 * Ready to Assign first (#134, #217), and the Ready to Assign drawer and
 * each group header have an Auto-Assign menu (#219). A context rather than
 * props, so the budget table's row components don't each pass it along.
 * Null outside a provider, where those features simply stay out.
 */
const ReadyToAssignContext = createContext<ReadyToAssignContextValue | null>(null);

export function ReadyToAssignProvider({
  total,
  autoAssign,
  children,
}: ReadyToAssignContextValue & { children: ReactNode }) {
  return <ReadyToAssignContext.Provider value={{ total, autoAssign }}>{children}</ReadyToAssignContext.Provider>;
}

export function useReadyToAssign(): number | null {
  return useContext(ReadyToAssignContext)?.total ?? null;
}

export function useAutoAssign(): AutoAssignContext | null {
  return useContext(ReadyToAssignContext)?.autoAssign ?? null;
}
