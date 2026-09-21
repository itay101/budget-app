"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";

type Collaborator = { userId: string; email: string };
type PendingInvite = { id: string; email: string };

function actionErrorMessage(err: unknown, action: string): string {
  return err instanceof Error
    ? err.message
    : `Failed to ${action}. Please try again.`;
}

/**
 * Invite-by-email, cancel-invite, and remove-collaborator UI for a single
 * owned budget — rendered inside BudgetSwitcherList's expanded row (#96).
 * Owns its own `pending`/error state so acting on one budget's
 * collaborators never disables another budget's rename/delete controls,
 * or another expanded row's own invite form.
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
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInviteError(null);
    const formData = new FormData();
    formData.set("budgetId", budgetId);
    formData.set("email", inviteDraft);
    startTransition(async () => {
      try {
        const result = await sendInvite(formData);
        if (result.error) {
          setInviteError(result.error);
          return;
        }
        setInviteDraft("");
      } catch (err) {
        setInviteError(actionErrorMessage(err, "send the invite"));
      }
    });
  }

  function handleCancelInvite(inviteId: string) {
    const formData = new FormData();
    formData.set("inviteId", inviteId);
    setActionError(null);
    startTransition(async () => {
      try {
        await cancelInvite(formData);
      } catch (err) {
        setActionError(actionErrorMessage(err, "cancel the invite"));
      }
    });
  }

  function handleRemoveCollaborator(userId: string) {
    const formData = new FormData();
    formData.set("budgetId", budgetId);
    formData.set("userId", userId);
    setActionError(null);
    startTransition(async () => {
      try {
        await removeCollaborator(formData);
      } catch (err) {
        setActionError(actionErrorMessage(err, "remove the collaborator"));
      }
    });
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
