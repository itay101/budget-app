"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar } from "./Avatar";
import { owner, viewerRole, isSharedWithViewer, type FakeBudget } from "./data";
import { NewBudgetButton } from "./NewBudgetButton";
import type { VariantProps } from "./SharingPrototypeApp";

/**
 * Variant B — the switcher itself barely changes (just a muted "Shared by
 * X" line and icon on shared rows). Managing collaborators gets its own
 * dedicated pane, reached via a gear icon next to the current budget's
 * name — only owners see that icon at all. More room to grow (roles,
 * bulk actions later) at the cost of an extra click.
 */
export function VariantB({
  budgets,
  activeBudgetId,
  onSelectBudget,
  onInvite,
  onRemove,
  onLeave,
}: VariantProps) {
  const [pane, setPane] = useState<"overview" | "collaborators">("overview");
  const [inviteDraft, setInviteDraft] = useState("");

  const active = budgets.find((b) => b.id === activeBudgetId)!;
  const owned = budgets.filter((b) => !isSharedWithViewer(b));
  const shared = budgets.filter((b) => isSharedWithViewer(b));
  const activeIsShared = isSharedWithViewer(active);

  function switchTo(id: string) {
    setPane("overview");
    onSelectBudget(id);
  }

  function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    onInvite(active.id, inviteDraft);
    setInviteDraft("");
  }

  return (
    <div className="flex h-full">
      <nav className="w-72 shrink-0 overflow-y-auto border-r border-neutral-200 bg-neutral-0 p-200">
        <div className="mb-300 text-h3 text-neutral-800">Budget App</div>

        <div className="mb-1 flex items-center gap-1">
          <div className="min-w-0 flex-1 truncate rounded border border-neutral-200 bg-neutral-0 px-3 py-1.5 text-small font-medium text-neutral-800">
            {active.name}{" "}
            <span className="text-neutral-600">({active.currencySymbol})</span>
          </div>
          {!activeIsShared ? (
            <button
              type="button"
              onClick={() => setPane((p) => (p === "collaborators" ? "overview" : "collaborators"))}
              title="Manage collaborators"
              className={
                "shrink-0 rounded p-1.5 hover:bg-neutral-100 " +
                (pane === "collaborators"
                  ? "text-brand-700"
                  : "text-neutral-400 hover:text-neutral-600")
              }
            >
              <Icon name="settings" label="Manage collaborators" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onLeave(active.id)}
              title="Leave this shared budget"
              className="shrink-0 rounded p-1.5 text-neutral-400 hover:bg-danger/10 hover:text-danger"
            >
              <Icon name="logout" label="Leave this shared budget" />
            </button>
          )}
        </div>

        <div className="mb-300 rounded-lg border border-neutral-200 bg-neutral-0 p-2 shadow-sm">
          <SwitcherGroup
            label="Your budgets"
            budgets={owned}
            activeId={activeBudgetId}
            onSelect={switchTo}
          />
          <SwitcherGroup
            label="Shared with you"
            budgets={shared}
            activeId={activeBudgetId}
            onSelect={switchTo}
            shared
          />
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
        {pane === "collaborators" && !activeIsShared ? (
          <CollaboratorsPane
            budget={active}
            inviteDraft={inviteDraft}
            onInviteDraftChange={setInviteDraft}
            onInviteSubmit={submitInvite}
            onRemove={onRemove}
          />
        ) : (
          <Overview budget={active} />
        )}
      </main>
    </div>
  );
}

function SwitcherGroup({
  label,
  budgets,
  activeId,
  onSelect,
  shared = false,
}: {
  label: string;
  budgets: FakeBudget[];
  activeId: string;
  onSelect: (id: string) => void;
  shared?: boolean;
}) {
  if (budgets.length === 0) return null;
  return (
    <div className="mb-2 last:mb-0">
      <p className="mb-1 px-2 text-small font-medium uppercase tracking-wide text-neutral-600">
        {label}
      </p>
      <ul className="space-y-0.5">
        {budgets.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => onSelect(b.id)}
              className={
                "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-small " +
                (b.id === activeId
                  ? "bg-brand-700/10 font-medium text-brand-700"
                  : "text-neutral-800 hover:bg-neutral-100")
              }
            >
              <Icon
                name={shared ? "group" : "folder"}
                className="shrink-0 text-[16px] text-neutral-400"
              />
              <span className="min-w-0 flex-1 truncate">
                <span className="block truncate">{b.name}</span>
                {shared && (
                  <span className="block truncate text-[11px] font-normal text-neutral-600">
                    Shared by {owner(b).name}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {!shared && <NewBudgetButton />}
    </div>
  );
}

function CollaboratorsPane({
  budget,
  inviteDraft,
  onInviteDraftChange,
  onInviteSubmit,
  onRemove,
}: {
  budget: FakeBudget;
  inviteDraft: string;
  onInviteDraftChange: (v: string) => void;
  onInviteSubmit: (e: React.FormEvent) => void;
  onRemove: (budgetId: string, personId: string) => void;
}) {
  const collaborators = budget.people.filter((p) => p.role === "collaborator");
  const accepted = collaborators.filter((p) => p.status === "accepted");
  const pending = collaborators.filter((p) => p.status === "pending");

  return (
    <div className="max-w-lg">
      <h1 className="text-h2 text-neutral-800">{budget.name}</h1>
      <p className="mt-1 text-body text-neutral-600">Collaborators</p>

      <form
        onSubmit={onInviteSubmit}
        className="mt-300 flex items-end gap-2 rounded border border-neutral-200 bg-neutral-0 p-3"
      >
        <div className="flex-1">
          <label className="block text-small text-neutral-600" htmlFor="invite-email">
            Invite by email
          </label>
          <input
            id="invite-email"
            type="email"
            required
            value={inviteDraft}
            onChange={(e) => onInviteDraftChange(e.target.value)}
            placeholder="name@example.com"
            className="mt-1 w-full rounded border border-neutral-200 px-2 py-1.5 text-body focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
          />
        </div>
        <button
          type="submit"
          className="shrink-0 rounded bg-brand-700 px-3 py-1.5 text-small font-medium text-white hover:bg-brand-800"
        >
          Send invite
        </button>
      </form>

      <div className="mt-300">
        <p className="mb-1 text-small font-medium uppercase tracking-wide text-neutral-600">
          Members
        </p>
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 bg-neutral-0">
          <MemberRow person={owner(budget)} tag="Owner" />
          {accepted.map((p) => (
            <MemberRow
              key={p.id}
              person={p}
              tag="Collaborator"
              onRemove={() => onRemove(budget.id, p.id)}
            />
          ))}
        </ul>
      </div>

      {pending.length > 0 && (
        <div className="mt-300">
          <p className="mb-1 text-small font-medium uppercase tracking-wide text-neutral-600">
            Pending invites
          </p>
          <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 bg-neutral-0">
            {pending.map((p) => (
              <MemberRow
                key={p.id}
                person={p}
                tag="Pending"
                onRemove={() => onRemove(budget.id, p.id)}
                removeLabel="Cancel invite"
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MemberRow({
  person,
  tag,
  onRemove,
  removeLabel = "Remove",
}: {
  person: FakeBudget["people"][number];
  tag: string;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <Avatar person={person} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-small font-medium text-neutral-800">
          {person.name}
        </p>
        <p className="truncate text-[11px] text-neutral-600">{person.email}</p>
      </div>
      <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
        {tag}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title={removeLabel}
          className="shrink-0 rounded p-1 text-neutral-400 hover:bg-danger/10 hover:text-danger"
        >
          <Icon name="delete" label={removeLabel} />
        </button>
      )}
    </li>
  );
}

function Overview({ budget }: { budget: FakeBudget }) {
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
      {role === "collaborator" && (
        <p className="mt-3 rounded border border-neutral-200 bg-neutral-0 p-3 text-small text-neutral-600">
          No settings (gear) icon at all — a collaborator can&apos;t reach
          the collaborators page or delete this budget, only leave it (the
          logout icon next to the budget name).
        </p>
      )}
    </div>
  );
}
