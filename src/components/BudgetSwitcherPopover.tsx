"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { usePopover } from "@/components/usePopover";
import { formatError, useServerAction } from "@/components/useServerAction";

type Collaborator = { userId: string; email: string };
type PendingInvite = { id: string; email: string };
type BudgetOption = {
  id: string;
  name: string;
  currency: string;
  isOwner: boolean;
  ownerEmail: string;
  collaborators: Collaborator[];
  pendingInvites: PendingInvite[];
};
type CurrencyOption = { code: string; name: string };

/**
 * Sidebar control for which budget (= which currency) the app is
 * currently showing — click to switch to another existing budget, or open
 * a new one. Same popover pattern as AddAccountPopover/MoveMoneyPopover.
 *
 * The "new budget" currency <select> only ever lists currencies no budget
 * has claimed yet (`availableCurrencies`, computed server-side from the
 * full budget list), so a duplicate currency can't even be submitted from
 * this form — createBudget's own check is what actually enforces it.
 *
 * The header button doubles as a rename control for the current budget
 * (via the pencil icon beside it) — e.g. "My main budget (₪)", where the
 * currency symbol is shown but not itself editable: it's fixed for a
 * budget's lifetime by createBudget's uniqueness guard.
 *
 * The budget list (Variant A from #59's prototype, per #76) is grouped
 * into "Your budgets" and "Shared with you". An owned row expands in
 * place into its collaborator list (with a per-collaborator remove and a
 * per-pending-invite cancel) plus an invite-by-email form, wired to #73/
 * #74's actions rather than reimplementing them — managing collaborators
 * never leaves the sidebar. Each owned row also keeps its delete (trash)
 * icon — deliberately hard to trigger by accident, requiring you to type
 * the budget's exact name to confirm (deleteBudget enforces the same
 * check server-side, since this popover isn't the only way to call it).
 * A shared row has neither affordance: it shows the Owner's email and a
 * visible "Leave" action instead, since only Owners can delete budgets
 * or manage collaborators (CONTEXT.md).
 */
export function BudgetSwitcherPopover({
  currentBudget,
  currencySymbol,
  budgets,
  availableCurrencies,
  switchBudget,
  createBudget,
  renameBudget,
  deleteBudget,
  sendInvite,
  cancelInvite,
  removeCollaborator,
  leaveBudget,
}: {
  currentBudget: { id: string; name: string; currency: string };
  currencySymbol: string;
  budgets: BudgetOption[];
  availableCurrencies: CurrencyOption[];
  switchBudget: (formData: FormData) => Promise<void>;
  createBudget: (formData: FormData) => Promise<void>;
  renameBudget: (formData: FormData) => Promise<void>;
  deleteBudget: (formData: FormData) => Promise<void>;
  sendInvite: (formData: FormData) => Promise<{ error?: string }>;
  cancelInvite: (formData: FormData) => Promise<void>;
  removeCollaborator: (formData: FormData) => Promise<void>;
  leaveBudget: (formData: FormData) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(currentBudget.name);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [inviteDraft, setInviteDraft] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const switchAction = useServerAction(switchBudget);
  const createAction = useServerAction(createBudget);
  const renameAction = useServerAction(renameBudget);
  const deleteAction = useServerAction(deleteBudget);
  const inviteAction = useServerAction(sendInvite);
  const cancelInviteAction = useServerAction(cancelInvite);
  const removeCollaboratorAction = useServerAction(removeCollaborator);
  const leaveAction = useServerAction(leaveBudget);

  const pending =
    switchAction.pending ||
    createAction.pending ||
    renameAction.pending ||
    deleteAction.pending ||
    inviteAction.pending ||
    cancelInviteAction.pending ||
    removeCollaboratorAction.pending ||
    leaveAction.pending;
  const actionError =
    switchAction.error ||
    createAction.error ||
    deleteAction.error ||
    inviteAction.error ||
    cancelInviteAction.error ||
    removeCollaboratorAction.error ||
    leaveAction.error;
  const { open, setOpen, position, triggerRef, panelRef } = usePopover({
    width: 256, // matches the popover's w-64
    onDismiss: () => {
      setAdding(false);
      setDeletingId(null);
      setExpandedId(null);
      setInviteDraft("");
      setInviteError(null);
    },
  });
  const formRef = useRef<HTMLFormElement>(null);
  const owned = budgets.filter((b) => b.isOwner);
  const shared = budgets.filter((b) => !b.isOwner);

  useEffect(() => {
    setNameDraft(currentBudget.name);
  }, [currentBudget.id, currentBudget.name]);

  async function handleSwitch(budgetId: string) {
    if (budgetId === currentBudget.id) {
      setOpen(false);
      return;
    }
    try {
      await switchAction.run({ budgetId });
      setOpen(false);
    } catch {
      // error is surfaced via switchAction.error
    }
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      await createAction.run({
        name: String(formData.get("name") ?? ""),
        currency: String(formData.get("currency") ?? ""),
      });
      formRef.current?.reset();
      setAdding(false);
      setOpen(false);
    } catch {
      // error is surfaced via createAction.error
    }
  }

  function cancelRename() {
    setRenaming(false);
    setNameDraft(currentBudget.name);
  }

  async function handleRenameSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === currentBudget.name) {
      cancelRename();
      return;
    }
    try {
      await renameAction.run({ budgetId: currentBudget.id, name: trimmed });
      setRenaming(false);
    } catch {
      // error is surfaced via renameAction.error
    }
  }

  async function handleDelete(budgetId: string) {
    try {
      await deleteAction.run({ budgetId, confirmName: confirmText });
      setDeletingId(null);
      setConfirmText("");
      setOpen(false);
    } catch {
      // error is surfaced via deleteAction.error
    }
  }

  function toggleExpanded(budgetId: string) {
    setExpandedId((cur) => (cur === budgetId ? null : budgetId));
    setInviteDraft("");
    setInviteError(null);
  }

  async function handleInvite(e: React.FormEvent<HTMLFormElement>, budgetId: string) {
    e.preventDefault();
    setInviteError(null);
    try {
      const result = await inviteAction.run({ budgetId, email: inviteDraft });
      if (result?.error) {
        setInviteError(result.error);
        return;
      }
      setInviteDraft("");
    } catch (err) {
      setInviteError(formatError(err));
    }
  }

  async function handleCancelInvite(inviteId: string) {
    try {
      await cancelInviteAction.run({ inviteId });
    } catch {
      // error is surfaced via cancelInviteAction.error
    }
  }

  async function handleRemoveCollaborator(budgetId: string, userId: string) {
    try {
      await removeCollaboratorAction.run({ budgetId, userId });
    } catch {
      // error is surfaced via removeCollaboratorAction.error
    }
  }

  async function handleLeave(budgetId: string) {
    try {
      await leaveAction.run({ budgetId });
      setOpen(false);
    } catch {
      // error is surfaced via leaveAction.error
    }
  }

  return (
    <>
      {renaming ? (
        <div>
          <form onSubmit={handleRenameSubmit} className="flex items-center gap-1">
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") cancelRename();
              }}
              autoFocus
              aria-label="Budget name"
              className="min-w-0 flex-1 rounded border border-neutral-200 px-2 py-1 text-small focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
            />
            <button
              type="submit"
              disabled={pending}
              title="Save"
              className="shrink-0 rounded px-1.5 py-1 text-small text-brand-700 hover:bg-brand-700/10"
            >
              <Icon name="check" label="Save" />
            </button>
            <button
              type="button"
              onClick={cancelRename}
              title="Cancel"
              className="shrink-0 rounded px-1.5 py-1 text-small text-neutral-600 hover:bg-neutral-100"
            >
              <Icon name="close" label="Cancel" />
            </button>
          </form>
          {renameAction.error && (
            <p className="mt-1 text-small text-danger">{renameAction.error}</p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex min-w-0 flex-1 items-center rounded border border-neutral-200 bg-neutral-0 px-3 py-1.5 text-left text-small font-medium hover:bg-neutral-100"
          >
            <span className="truncate text-neutral-800">
              {currentBudget.name}{" "}
              <span className="text-neutral-600">({currencySymbol})</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setRenaming(true);
            }}
            title="Rename budget"
            className="shrink-0 rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          >
            <Icon name="edit" label="Rename budget" />
          </button>
        </div>
      )}

      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", top: position.top, left: position.left }}
            className="z-50 w-64 max-w-[calc(100vw-1rem)] rounded-lg border border-neutral-200 bg-neutral-0 p-3 text-left shadow-lg"
          >
            {actionError && (
              <p className="mb-2 rounded bg-danger/10 px-2 py-1 text-small text-danger">
                {actionError}
              </p>
            )}

            <div className="mb-2">
              <p className="mb-1 px-2 text-small font-medium uppercase tracking-wide text-neutral-600">
                Your budgets
              </p>

              {!adding && availableCurrencies.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-small font-medium text-brand-700 hover:bg-brand-700/10"
                >
                  <Icon name="add" /> New budget
                </button>
              )}

              {!adding && availableCurrencies.length === 0 && (
                <p className="px-2 text-small text-neutral-600">
                  Every supported currency already has a budget.
                </p>
              )}

              {adding && (
                <form
                  ref={formRef}
                  onSubmit={handleCreate}
                  className="space-y-2 rounded border border-neutral-200 p-2"
                >
                  <div>
                    <label
                      className="block text-small text-neutral-600"
                      htmlFor="new-budget-name"
                    >
                      Name
                    </label>
                    <input
                      id="new-budget-name"
                      name="name"
                      required
                      autoFocus
                      className="mt-1 w-full rounded border border-neutral-200 px-2 py-1 text-body focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
                    />
                  </div>
                  <div>
                    <label
                      className="block text-small text-neutral-600"
                      htmlFor="new-budget-currency"
                    >
                      Currency
                    </label>
                    <select
                      id="new-budget-currency"
                      name="currency"
                      defaultValue={availableCurrencies[0]?.code}
                      className="mt-1 w-full rounded border border-neutral-200 px-2 py-1 text-body focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
                    >
                      {availableCurrencies.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} — {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setAdding(false)}
                      className="rounded px-2 py-1 text-small text-neutral-600 hover:bg-neutral-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={pending}
                      className="rounded bg-brand-700 px-2 py-1 text-small font-medium text-white hover:bg-brand-800 disabled:opacity-50"
                    >
                      {pending ? "Creating…" : "Create"}
                    </button>
                  </div>
                </form>
              )}

              <ul className="mt-1 space-y-0.5">
                {owned.map((b) =>
                  deletingId === b.id ? (
                    <li
                      key={b.id}
                      className="space-y-1.5 rounded border border-danger/40 bg-danger/5 p-2"
                    >
                      <p className="text-small text-neutral-800">
                        Type <span className="font-semibold">{b.name}</span> to
                        delete it. Its accounts will be closed; nothing is
                        removed from the database yet.
                      </p>
                      <input
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        autoFocus
                        placeholder={b.name}
                        aria-label={`Type "${b.name}" to confirm deletion`}
                        className="w-full rounded border border-neutral-200 px-2 py-1 text-small focus:border-danger focus:outline-none focus:ring-1 focus:ring-danger"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setDeletingId(null);
                            setConfirmText("");
                          }}
                          className="rounded px-2 py-1 text-small text-neutral-600 hover:bg-neutral-100"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={confirmText !== b.name || pending}
                          onClick={() => handleDelete(b.id)}
                          className="rounded bg-danger px-2 py-1 text-small font-medium text-white hover:bg-danger/90 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ) : (
                    <li key={b.id} className="rounded">
                      <div
                        className={
                          "flex items-center gap-1 rounded px-2 py-1 text-small " +
                          (b.id === currentBudget.id
                            ? "bg-brand-700/10 font-medium text-brand-700"
                            : "text-neutral-800 hover:bg-neutral-100")
                        }
                      >
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => handleSwitch(b.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="block truncate">{b.name}</span>
                        </button>
                        {b.collaborators.length > 0 && (
                          <span
                            className="flex shrink-0 items-center gap-0.5 text-neutral-600"
                            title={`${b.collaborators.length} collaborator(s)`}
                          >
                            <Icon name="group" className="text-[16px]" />
                            {b.collaborators.length}
                          </span>
                        )}
                        {b.pendingInvites.length > 0 && (
                          <span className="shrink-0 rounded-full bg-warning/15 px-1.5 text-[10px] font-medium text-warning">
                            {b.pendingInvites.length} pending
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleExpanded(b.id)}
                          title="Manage collaborators"
                          className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                        >
                          <Icon
                            name={expandedId === b.id ? "expand_less" : "person_add"}
                            label="Manage collaborators"
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeletingId(b.id);
                            setConfirmText("");
                          }}
                          title="Delete budget"
                          className="shrink-0 rounded p-1 text-neutral-400 hover:bg-danger/10 hover:text-danger"
                        >
                          <Icon name="delete" label="Delete budget" />
                        </button>
                      </div>

                      {expandedId === b.id && (
                        <div className="ml-2 mt-1 space-y-1.5 rounded border border-neutral-200 bg-neutral-100 p-2">
                          {b.collaborators.map((c) => (
                            <div key={c.userId} className="flex items-center gap-1.5">
                              <span className="min-w-0 flex-1 truncate text-small text-neutral-800">
                                {c.email}
                              </span>
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => handleRemoveCollaborator(b.id, c.userId)}
                                title="Remove collaborator"
                                className="shrink-0 rounded p-0.5 text-neutral-400 hover:bg-danger/10 hover:text-danger"
                              >
                                <Icon name="close" className="text-[16px]" label="Remove collaborator" />
                              </button>
                            </div>
                          ))}
                          {b.pendingInvites.map((invite) => (
                            <div key={invite.id} className="flex items-center gap-1.5">
                              <span className="min-w-0 flex-1 truncate text-small text-neutral-600">
                                {invite.email}
                              </span>
                              <span className="shrink-0 text-[10px] text-neutral-600">
                                pending
                              </span>
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => handleCancelInvite(invite.id)}
                                title="Cancel invite"
                                className="shrink-0 rounded p-0.5 text-neutral-400 hover:bg-danger/10 hover:text-danger"
                              >
                                <Icon name="close" className="text-[16px]" label="Cancel invite" />
                              </button>
                            </div>
                          ))}
                          {b.collaborators.length === 0 && b.pendingInvites.length === 0 && (
                            <p className="text-small text-neutral-600">
                              No collaborators yet.
                            </p>
                          )}
                          <form
                            onSubmit={(e) => handleInvite(e, b.id)}
                            className="flex items-center gap-1 pt-1"
                          >
                            <input
                              value={inviteDraft}
                              onChange={(e) => setInviteDraft(e.target.value)}
                              type="email"
                              required
                              placeholder="Invite by email…"
                              aria-label="Invite by email"
                              className="min-w-0 flex-1 rounded border border-neutral-200 bg-neutral-0 px-2 py-1 text-small focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
                            />
                            <button
                              type="submit"
                              disabled={pending}
                              className="shrink-0 rounded bg-brand-700 px-2 py-1 text-small font-medium text-white hover:bg-brand-800 disabled:opacity-50"
                            >
                              Invite
                            </button>
                          </form>
                          {inviteError && (
                            <p className="text-small text-danger">{inviteError}</p>
                          )}
                        </div>
                      )}
                    </li>
                  ),
                )}
              </ul>
            </div>

            {shared.length > 0 && (
              <div>
                <p className="mb-1 px-2 text-small font-medium uppercase tracking-wide text-neutral-600">
                  Shared with you
                </p>
                <ul className="space-y-0.5">
                  {shared.map((b) => (
                    <li
                      key={b.id}
                      className={
                        "group flex items-center gap-1 rounded px-2 py-1 text-small " +
                        (b.id === currentBudget.id
                          ? "bg-brand-700/10 font-medium text-brand-700"
                          : "text-neutral-800 hover:bg-neutral-100")
                      }
                    >
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => handleSwitch(b.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block truncate">
                          {b.name}{" "}
                          <span className="text-neutral-600">
                            · {b.ownerEmail}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => handleLeave(b.id)}
                        className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-danger hover:bg-danger/10"
                      >
                        Leave
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
