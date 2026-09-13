"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar } from "./Avatar";
import { owner, viewerRole, isSharedWithViewer, type FakeBudget } from "./data";
import type { VariantProps } from "./SharingPrototypeApp";

/**
 * Variant C — the switcher stays a single flat list (no grouping
 * headers); owned vs. shared is a quieter visual cue (accent bar + a
 * small owner-avatar badge, à la a shared Drive file). Managing people
 * happens in a right-hand slide-over reached from a "people" icon next
 * to the budget name, so it never crowds the switcher itself.
 */
export function VariantC({
  budgets,
  activeBudgetId,
  onSelectBudget,
  onInvite,
  onRemove,
  onLeave,
}: VariantProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [inviteDraft, setInviteDraft] = useState("");

  const active = budgets.find((b) => b.id === activeBudgetId)!;

  function select(id: string) {
    onSelectBudget(id);
    setDrawerOpen(false);
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

        <div className="mb-300">
          <div className="mb-1 flex items-center gap-1">
            <span className="min-w-0 flex-1 truncate text-small font-medium text-neutral-800">
              {active.name}{" "}
              <span className="text-neutral-600">
                ({active.currencySymbol})
              </span>
            </span>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              title={
                isSharedWithViewer(active)
                  ? "View people with access"
                  : "People with access"
              }
              className="shrink-0 rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            >
              <Icon name="group" label="People with access" />
            </button>
          </div>

          <ul className="space-y-1">
            {budgets.map((b) => {
              const shared = isSharedWithViewer(b);
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => select(b.id)}
                    className={
                      "flex w-full items-center gap-2 rounded border-l-2 px-2 py-1.5 text-left text-small " +
                      (b.id === activeBudgetId
                        ? "bg-brand-700/10 font-medium text-brand-700"
                        : "text-neutral-800 hover:bg-neutral-100") +
                      " " +
                      (shared
                        ? "border-dashed border-neutral-400"
                        : "border-brand-700")
                    }
                  >
                    <span className="relative shrink-0">
                      <Icon
                        name="folder"
                        className={
                          "text-[18px] " +
                          (shared ? "text-neutral-400" : "text-brand-700")
                        }
                      />
                      {shared && (
                        <span className="absolute -bottom-1 -right-1">
                          <Avatar person={owner(b)} size="xs" />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{b.name}</span>
                      {shared && (
                        <span className="block truncate text-[11px] font-normal text-neutral-600">
                          Shared by {owner(b).name}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
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
        <Overview budget={active} />
      </main>

      {drawerOpen && (
        <div className="fixed inset-0 z-[90]">
          <div
            className="absolute inset-0 bg-neutral-800/40"
            onClick={() => setDrawerOpen(false)}
          />
          <PeopleDrawer
            budget={active}
            inviteDraft={inviteDraft}
            onInviteDraftChange={setInviteDraft}
            onInviteSubmit={submitInvite}
            onRemove={onRemove}
            onLeave={() => {
              onLeave(active.id);
              setDrawerOpen(false);
            }}
            onClose={() => setDrawerOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

function PeopleDrawer({
  budget,
  inviteDraft,
  onInviteDraftChange,
  onInviteSubmit,
  onRemove,
  onLeave,
  onClose,
}: {
  budget: FakeBudget;
  inviteDraft: string;
  onInviteDraftChange: (v: string) => void;
  onInviteSubmit: (e: React.FormEvent) => void;
  onRemove: (budgetId: string, personId: string) => void;
  onLeave: () => void;
  onClose: () => void;
}) {
  const role = viewerRole(budget);
  const isOwner = role === "owner";
  const collaborators = budget.people.filter((p) => p.role === "collaborator");
  const accepted = collaborators.filter((p) => p.status === "accepted");
  const pending = collaborators.filter((p) => p.status === "pending");

  return (
    <div className="absolute right-0 top-0 flex h-full w-80 max-w-[90vw] flex-col bg-neutral-0 shadow-xl">
      <div className="flex items-center justify-between border-b border-neutral-200 p-200">
        <div className="min-w-0">
          <p className="text-small text-neutral-600">People with access</p>
          <p className="truncate text-body font-medium text-neutral-800">
            {budget.name}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
        >
          <Icon name="close" label="Close" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-200">
        {isOwner && (
          <form onSubmit={onInviteSubmit} className="mb-300 flex items-center gap-1">
            <input
              type="email"
              required
              value={inviteDraft}
              onChange={(e) => onInviteDraftChange(e.target.value)}
              placeholder="Invite by email…"
              className="min-w-0 flex-1 rounded border border-neutral-200 px-2 py-1.5 text-small focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
            />
            <button
              type="submit"
              className="shrink-0 rounded bg-brand-700 px-2 py-1.5 text-small font-medium text-white hover:bg-brand-800"
            >
              Invite
            </button>
          </form>
        )}

        <ul className="space-y-1.5">
          <PersonRow person={owner(budget)} tag="Owner" />
          {accepted.map((p) => (
            <PersonRow
              key={p.id}
              person={p}
              tag="Collaborator"
              onRemove={isOwner ? () => onRemove(budget.id, p.id) : undefined}
            />
          ))}
        </ul>

        {pending.length > 0 && (
          <>
            <p className="mb-1 mt-300 text-small font-medium uppercase tracking-wide text-neutral-600">
              Pending
            </p>
            <ul className="space-y-1.5">
              {pending.map((p) => (
                <PersonRow
                  key={p.id}
                  person={p}
                  tag="Invited"
                  onRemove={isOwner ? () => onRemove(budget.id, p.id) : undefined}
                  removeIcon="close"
                  removeLabel="Cancel invite"
                />
              ))}
            </ul>
          </>
        )}
      </div>

      {!isOwner && (
        <div className="border-t border-neutral-200 p-200">
          <button
            type="button"
            onClick={onLeave}
            className="w-full rounded border border-danger px-3 py-1.5 text-small font-medium text-danger hover:bg-danger/10"
          >
            Leave shared budget
          </button>
        </div>
      )}
    </div>
  );
}

function PersonRow({
  person,
  tag,
  onRemove,
  removeIcon = "delete",
  removeLabel = "Remove",
}: {
  person: FakeBudget["people"][number];
  tag: string;
  onRemove?: () => void;
  removeIcon?: string;
  removeLabel?: string;
}) {
  return (
    <li className="flex items-center gap-2 rounded px-1 py-1">
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
          <Icon name={removeIcon} label={removeLabel} />
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
      <p className="mt-3 rounded border border-neutral-200 bg-neutral-0 p-3 text-small text-neutral-600">
        Open the people icon next to the budget name to see{" "}
        {role === "owner"
          ? "the invite form and remove collaborators"
          : "the read-only member list and Leave shared budget"}
        .
      </p>
    </div>
  );
}
