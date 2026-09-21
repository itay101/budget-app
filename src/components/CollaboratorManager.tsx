"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { formatError, useServerAction } from "@/components/useServerAction";

type Collaborator = { userId: string; email: string };
type PendingInvite = { id: string; email: string };

/**
 * Invite-by-email, cancel-invite, and remove-collaborator UI for a single
 * owned budget — rendered inside BudgetSwitcherList's expanded row (#96).
 * Owns its own `useServerAction` instances (#95) so acting on one
 * budget's collaborators never disables another budget's rename/delete
 * controls, or another expanded row's own invite form.
 */
export function CollaboratorManager({
  budgetId,
  collaborators,
  pendingInvites,
  sendInvite,
  cancelInvite,
  removeCollaborator,
}: {
  budgetId: string;
  collaborators: Collaborator[];
  pendingInvites: PendingInvite[];
  sendInvite: (formData: FormData) => Promise<{ error?: string }>;
  cancelInvite: (formData: FormData) => Promise<void>;
  removeCollaborator: (formData: FormData) => Promise<void>;
}) {
  const [inviteDraft, setInviteDraft] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const inviteAction = useServerAction(sendInvite);
  const cancelInviteAction = useServerAction(cancelInvite);
  const removeCollaboratorAction = useServerAction(removeCollaborator);

  const pending =
    inviteAction.pending || cancelInviteAction.pending || removeCollaboratorAction.pending;
  const actionError = cancelInviteAction.error || removeCollaboratorAction.error;

  async function handleInvite(e: React.FormEvent<HTMLFormElement>) {
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

  async function handleRemoveCollaborator(userId: string) {
    try {
      await removeCollaboratorAction.run({ budgetId, userId });
    } catch {
      // error is surfaced via removeCollaboratorAction.error
    }
  }

  return (
    <div className="ml-2 mt-1 space-y-1.5 rounded border border-neutral-200 bg-neutral-100 p-2">
      {actionError && (
        <p className="rounded bg-danger/10 px-2 py-1 text-small text-danger">
          {actionError}
        </p>
      )}
      {collaborators.map((c) => (
        <div key={c.userId} className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-small text-neutral-800">
            {c.email}
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => handleRemoveCollaborator(c.userId)}
            title="Remove collaborator"
            className="shrink-0 rounded p-0.5 text-neutral-400 hover:bg-danger/10 hover:text-danger"
          >
            <Icon name="close" className="text-[16px]" label="Remove collaborator" />
          </button>
        </div>
      ))}
      {pendingInvites.map((invite) => (
        <div key={invite.id} className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-small text-neutral-600">
            {invite.email}
          </span>
          <span className="shrink-0 text-[10px] text-neutral-600">pending</span>
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
      {collaborators.length === 0 && pendingInvites.length === 0 && (
        <p className="text-small text-neutral-600">No collaborators yet.</p>
      )}
      <form onSubmit={handleInvite} className="flex items-center gap-1 pt-1">
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
      {inviteError && <p className="text-small text-danger">{inviteError}</p>}
    </div>
  );
}
