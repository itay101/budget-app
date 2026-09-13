"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar } from "./Avatar";
import { owner, viewerRole, isSharedWithViewer, type FakeBudget } from "./data";
import { NewBudgetButton } from "./NewBudgetButton";
import type { VariantProps } from "./SharingPrototypeApp";

/**
 * Variant A — everything lives inside the existing budget-switcher
 * popover. Rows are grouped "Your budgets" / "Shared with you"; owned
 * rows expand in place (accordion) into a mini member list + invite
 * form, so managing collaborators never leaves the sidebar. Lowest
 * friction, but the popover gets tall once a budget has several people.
 */
export function VariantA({
  budgets,
  activeBudgetId,
  onSelectBudget,
  onInvite,
  onRemove,
  onLeave,
}: VariantProps) {
  const [open, setOpen] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [inviteDraft, setInviteDraft] = useState("");

  const active = budgets.find((b) => b.id === activeBudgetId)!;
  const owned = budgets.filter((b) => !isSharedWithViewer(b));
  const shared = budgets.filter((b) => isSharedWithViewer(b));

  function submitInvite(e: React.FormEvent, budgetId: string) {
    e.preventDefault();
    onInvite(budgetId, inviteDraft);
    setInviteDraft("");
  }

  return (
    <div className="flex h-full">
      <nav className="w-72 shrink-0 overflow-y-auto border-r border-neutral-200 bg-neutral-0 p-200">
        <div className="mb-300 text-h3 text-neutral-800">Budget App</div>

        <div className="relative mb-300">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded border border-neutral-200 bg-neutral-0 px-3 py-1.5 text-left text-small font-medium hover:bg-neutral-100"
          >
            <span className="truncate text-neutral-800">
              {active.name}{" "}
              <span className="text-neutral-600">
                ({active.currencySymbol})
              </span>
            </span>
            <Icon name={open ? "expand_less" : "expand_more"} />
          </button>

          {open && (
            <div className="mt-1 rounded-lg border border-neutral-200 bg-neutral-0 p-2 shadow-lg">
              <BudgetGroup
                label="Your budgets"
                budgets={owned}
                activeBudgetId={activeBudgetId}
                expandedId={expandedId}
                inviteDraft={inviteDraft}
                onSelect={onSelectBudget}
                onToggleExpand={(id) =>
                  setExpandedId((cur) => (cur === id ? null : id))
                }
                onInviteDraftChange={setInviteDraft}
                onInviteSubmit={submitInvite}
                onRemove={onRemove}
              />
              <BudgetGroup
                label="Shared with you"
                budgets={shared}
                activeBudgetId={activeBudgetId}
                expandedId={null}
                inviteDraft={inviteDraft}
                onSelect={onSelectBudget}
                onToggleExpand={() => {}}
                onInviteDraftChange={setInviteDraft}
                onInviteSubmit={submitInvite}
                onRemove={onRemove}
                onLeave={onLeave}
                sharedGroup
              />
            </div>
          )}
        </div>

        <ul className="space-y-1">
          {["Budget", "Accounts"].map((label) => (
            <li
              key={label}
              className="rounded px-3 py-2 text-body font-medium text-neutral-600 hover:bg-neutral-100"
            >
              {label}
            </li>
          ))}
        </ul>
      </nav>

      <main className="flex-1 overflow-y-auto p-400">
        <ActiveBudgetSummary budget={active} />
      </main>
    </div>
  );
}

function BudgetGroup({
  label,
  budgets,
  activeBudgetId,
  expandedId,
  inviteDraft,
  onSelect,
  onToggleExpand,
  onInviteDraftChange,
  onInviteSubmit,
  onRemove,
  onLeave,
  sharedGroup = false,
}: {
  label: string;
  budgets: FakeBudget[];
  activeBudgetId: string;
  expandedId: string | null;
  inviteDraft: string;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onInviteDraftChange: (v: string) => void;
  onInviteSubmit: (e: React.FormEvent, budgetId: string) => void;
  onRemove: (budgetId: string, personId: string) => void;
  onLeave?: (budgetId: string) => void;
  sharedGroup?: boolean;
}) {
  if (budgets.length === 0) return null;
  return (
    <div className="mb-2 last:mb-0">
      <p className="mb-1 px-2 text-small font-medium uppercase tracking-wide text-neutral-600">
        {label}
      </p>
      <ul className="space-y-0.5">
        {budgets.map((b) => {
          const collaborators = b.people.filter((p) => p.role === "collaborator");
          const accepted = collaborators.filter((p) => p.status === "accepted");
          const pending = collaborators.filter((p) => p.status === "pending");
          const expanded = expandedId === b.id;
          return (
            <li key={b.id} className="group rounded">
              <div
                className={
                  "flex items-center gap-1 rounded px-2 py-1 text-small " +
                  (b.id === activeBudgetId
                    ? "bg-brand-700/10 font-medium text-brand-700"
                    : "text-neutral-800 hover:bg-neutral-100")
                }
              >
                <button
                  type="button"
                  onClick={() => onSelect(b.id)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                >
                  {sharedGroup && <Avatar person={owner(b)} size="xs" />}
                  <span className="truncate">{b.name}</span>
                  {sharedGroup && (
                    <span className="shrink-0 truncate text-neutral-600">
                      · {owner(b).name}
                    </span>
                  )}
                </button>
                {!sharedGroup && accepted.length > 0 && (
                  <span
                    className="flex shrink-0 items-center gap-0.5 text-neutral-600"
                    title={`${accepted.length} collaborator(s)`}
                  >
                    <Icon name="group" className="text-[16px]" />
                    {accepted.length}
                  </span>
                )}
                {!sharedGroup && pending.length > 0 && (
                  <span className="shrink-0 rounded-full bg-warning/15 px-1.5 text-[10px] font-medium text-warning">
                    {pending.length} pending
                  </span>
                )}
                {!sharedGroup ? (
                  <button
                    type="button"
                    onClick={() => onToggleExpand(b.id)}
                    title="Manage collaborators"
                    className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                  >
                    <Icon name={expanded ? "expand_less" : "person_add"} />
                  </button>
                ) : (
                  onLeave && (
                    <button
                      type="button"
                      onClick={() => onLeave(b.id)}
                      className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-danger opacity-0 hover:bg-danger/10 group-hover:opacity-100"
                    >
                      Leave
                    </button>
                  )
                )}
              </div>

              {expanded && (
                <div className="ml-2 mt-1 space-y-1.5 rounded border border-neutral-200 bg-neutral-100 p-2">
                  {[...accepted, ...pending].map((p) => (
                    <div key={p.id} className="flex items-center gap-1.5">
                      <Avatar person={p} size="xs" />
                      <span className="min-w-0 flex-1 truncate text-small text-neutral-800">
                        {p.email}
                      </span>
                      {p.status === "pending" && (
                        <span className="shrink-0 text-[10px] text-neutral-600">
                          pending
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => onRemove(b.id, p.id)}
                        title={p.status === "pending" ? "Cancel invite" : "Remove"}
                        className="shrink-0 rounded p-0.5 text-neutral-400 hover:bg-danger/10 hover:text-danger"
                      >
                        <Icon name="close" className="text-[16px]" />
                      </button>
                    </div>
                  ))}
                  <form
                    onSubmit={(e) => onInviteSubmit(e, b.id)}
                    className="flex items-center gap-1 pt-1"
                  >
                    <input
                      value={inviteDraft}
                      onChange={(e) => onInviteDraftChange(e.target.value)}
                      type="email"
                      required
                      placeholder="Invite by email…"
                      className="min-w-0 flex-1 rounded border border-neutral-200 bg-neutral-0 px-2 py-1 text-small focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
                    />
                    <button
                      type="submit"
                      className="shrink-0 rounded bg-brand-700 px-2 py-1 text-small font-medium text-white hover:bg-brand-800"
                    >
                      Invite
                    </button>
                  </form>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!sharedGroup && <NewBudgetButton />}
    </div>
  );
}

function ActiveBudgetSummary({ budget }: { budget: FakeBudget }) {
  const role = viewerRole(budget);
  return (
    <div className="max-w-xl">
      <h1 className="text-h2 text-neutral-800">{budget.name}</h1>
      <p className="mt-1 text-body text-neutral-600">
        Viewing as{" "}
        <span className="font-medium text-neutral-800">
          {role === "owner" ? "Owner" : "Collaborator"}
        </span>
        {role === "collaborator" && <> · shared by {owner(budget).name}</>}
      </p>
      {role === "collaborator" ? (
        <p className="mt-3 rounded border border-neutral-200 bg-neutral-0 p-3 text-small text-neutral-600">
          No &ldquo;Delete budget&rdquo; or &ldquo;Manage collaborators&rdquo;
          entry points — a collaborator can only leave (via the sidebar).
        </p>
      ) : (
        <p className="mt-3 rounded border border-neutral-200 bg-neutral-0 p-3 text-small text-neutral-600">
          As the owner you can invite, remove collaborators, rename, or
          delete this budget.
        </p>
      )}
    </div>
  );
}
