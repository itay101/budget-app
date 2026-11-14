"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * The viewed month's Ready to Assign, in milliunits, for the category rows
 * below it: Move Money offers it first (#134, #217). A context rather than
 * a prop, so the budget table's row components don't each pass it along.
 * Null outside a provider, where Move Money simply leaves it out.
 */
const ReadyToAssignContext = createContext<number | null>(null);

export function ReadyToAssignProvider({ total, children }: { total: number; children: ReactNode }) {
  return <ReadyToAssignContext.Provider value={total}>{children}</ReadyToAssignContext.Provider>;
}

export function useReadyToAssign(): number | null {
  return useContext(ReadyToAssignContext);
}
