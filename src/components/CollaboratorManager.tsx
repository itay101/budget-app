"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { formatError, useServerAction } from "@/components/useServerAction";

type Collaborator = { userId: string; email: string };
type PendingInvite = { id: string; email: string };

/**
 * The server actions CollaboratorManager needs — factored out so
 * BudgetSwitcherList (which receives these from Sidebar and forwards
 * them straight through, unused itself) can declare the same shape once
 * instead of repeating each action's signature in its own props type.
 */
export type CollaboratorActions = {
  sendInvite: (formData: FormData) => Promise<{ error?: string }>;
  cancelInvite: (formData: FormData) => Promise<void>;
  resendInvite: (formData: FormData) => Promise<{ error?: string }>;
  removeCollaborator: (formData: FormData) => Promise<void>;
  transferOwnership: (formData: FormData) => Promise<void>;
};

/**
 * Runs a `useServerAction().run` whose action reports failure inline (an
 * `{ error }` return, e.g. sendInvite/resendInvite) rather than only by
 * throwing — pushes the try/catch and "was there an inline error" branch
 * out of CollaboratorManager's own handlers and into one shared helper.
 */
async function runInlineErrorAction(
  run: (fields: Record<string, string | undefined>) => Promise<{ error?: string } | undefined>,
  fields: Record<string, string | undefined>,
  setError: (error: string | null) => void,
): Promise<boolean> {
  try {
    const result = await run(fields);
    const error = result?.error ?? null;
    setError(error);
    return error === null;
  } catch (err) {
    setError(formatError(err));
    return false;
  }
}

/**
 * Runs a `useServerAction().run` whose action reports failure only by
 * throwing (no inline `{ error }` — cancelInvite/removeCollaborator/
 * transferOwnership) — the caller just needs the click handled without
 * an unhandled rejection; the actual message is already surfaced via
 * that action's own `.error`, same as runInlineErrorAction's catch branch.
 */
async function runIgnoringError(
  run: (fields: Record<string, string | undefined>) => Promise<unknown>,
  fields: Record<string, string | undefined>,
): Promise<void> {
  try {
    await run(fields);
  } catch {
    // error is surfaced via the action's own `.error`
  }
}

/** True if any of the given `useServerAction` results is still in flight. */
function anyPending(...actions: { pending: boolean }[]): boolean {
  return actions.some((a) => a.pending);
}

/** The first non-null error among the given `useServerAction` results, if any. */
function firstError(...errors: (string | null)[]): string | null {
  return errors.find((e) => e !== null) ?? null;
}

/**
 * A single pending invite's row — its own resend/cancel handlers, so
 * CollaboratorManager itself doesn't grow a branch per row action.
 */
function PendingInviteRow({
  invite,
  disabled,
  onResend,
  onCancel,
}: {
  invite: PendingInvite;
  disabled: boolean;
  onResend: (inviteId: string) => void;
  onCancel: (inviteId: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="min-w-0 flex-1 truncate text-small text-neutral-600">
        {invite.email}
      </span>
      <span className="shrink-0 text-[10px] text-neutral-600">pending</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onResend(invite.id)}
        title="Resend invite"
        className="shrink-0 rounded p-0.5 text-neutral-400 hover:bg-brand-700/10 hover:text-brand-700"
      >
        <Icon name="send" className="text-[16px]" label="Resend invite" />
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onCancel(invite.id)}
        title="Cancel invite"
        className="shrink-0 rounded p-0.5 text-neutral-400 hover:bg-danger/10 hover:text-danger"
      >
        <Icon name="close" className="text-[16px]" label="Cancel invite" />
      </button>
    </div>
  );
}

/**
 * A single collaborator's own row — owns its "transfer ownership"
 * confirmation step in-place (rather than a shared confirm state in
 * CollaboratorManager) so confirming for one collaborator never affects
 * another row, the same per-row-state approach PendingInviteRow already
 * takes for resend/cancel.
 */
function CollaboratorRow({
  collaborator,
  disabled,
  onRemove,
  onTransferOwnership,
}: {
  collaborator: Collaborator;
  disabled: boolean;
  onRemove: (userId: string) => void;
  onTransferOwnership: (userId: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="space-y-1.5 rounded border border-brand-700/30 bg-brand-700/5 p-1.5">
        <p className="text-small text-neutral-800">
          Make <span className="font-semibold">{collaborator.email}</span>{" "}
          the owner? They&apos;ll be able to manage collaborators and delete
          this budget — you&apos;ll keep your own access as a collaborator.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded px-2 py-1 text-small text-neutral-600 hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onTransferOwnership(collaborator.userId)}
            className="rounded bg-brand-700 px-2 py-1 text-small font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            Make owner
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="min-w-0 flex-1 truncate text-small text-neutral-800">
        {collaborator.email}
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setConfirming(true)}
        title="Transfer ownership"
        className="shrink-0 rounded p-0.5 text-neutral-400 hover:bg-brand-700/10 hover:text-brand-700"
      >
        <Icon name="swap_horiz" className="text-[16px]" label="Transfer ownership" />
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onRemove(collaborator.userId)}
        title="Remove collaborator"
        className="shrink-0 rounded p-0.5 text-neutral-400 hover:bg-danger/10 hover:text-danger"
      >
        <Icon name="close" className="text-[16px]" label="Remove collaborator" />
      </button>
    </div>
  );
}

/**
 * Invite-by-email, cancel-invite, remove-collaborator, and
 * transfer-ownership UI for a single owned budget — rendered inside
 * BudgetSwitcherList's expanded row (#96, #109). Owns its own
 * `useServerAction` instances (#95) so acting on one budget's
 * collaborators never disables another budget's rename/delete controls,
 * or another expanded row's own invite form.
 */
export function CollaboratorManager({
  budgetId,
  collaborators,
  pendingInvites,
  sendInvite,
  cancelInvite,
  resendInvite,
  removeCollaborator,
  transferOwnership,
}: CollaboratorActions & {
  budgetId: string;
  collaborators: Collaborator[];
  pendingInvites: PendingInvite[];
}) {
  const [inviteDraft, setInviteDraft] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const inviteAction = useServerAction(sendInvite);
  const cancelInviteAction = useServerAction(cancelInvite);
  const resendInviteAction = useServerAction(resendInvite);
  const removeCollaboratorAction = useServerAction(removeCollaborator);
  const transferOwnershipAction = useServerAction(transferOwnership);

  const pending = anyPending(
    inviteAction,
    cancelInviteAction,
    resendInviteAction,
    removeCollaboratorAction,
    transferOwnershipAction,
  );
  const actionError = firstError(
    cancelInviteAction.error,
    removeCollaboratorAction.error,
    transferOwnershipAction.error,
  );

  async function handleInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const sent = await runInlineErrorAction(
      inviteAction.run,
      { budgetId, email: inviteDraft },
      setInviteError,
    );
    if (sent) setInviteDraft("");
  }

  async function handleCancelInvite(inviteId: string) {
    await runIgnoringError(cancelInviteAction.run, { inviteId });
  }

  async function handleResendInvite(inviteId: string) {
    await runInlineErrorAction(resendInviteAction.run, { inviteId }, setInviteError);
  }

  async function handleRemoveCollaborator(userId: string) {
    await runIgnoringError(removeCollaboratorAction.run, { budgetId, userId });
  }

  async function handleTransferOwnership(userId: string) {
    await runIgnoringError(transferOwnershipAction.run, { budgetId, userId });
  }

  return (
    <div className="ml-2 mt-1 space-y-1.5 rounded border border-neutral-200 bg-neutral-100 p-2">
      {actionError && (
        <p className="rounded bg-danger/10 px-2 py-1 text-small text-danger">
          {actionError}
        </p>
      )}
      {collaborators.map((c) => (
        <CollaboratorRow
          key={c.userId}
          collaborator={c}
          disabled={pending}
          onRemove={handleRemoveCollaborator}
          onTransferOwnership={handleTransferOwnership}
        />
      ))}
      {pendingInvites.map((invite) => (
        <PendingInviteRow
          key={invite.id}
          invite={invite}
          disabled={pending}
          onResend={handleResendInvite}
          onCancel={handleCancelInvite}
        />
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
