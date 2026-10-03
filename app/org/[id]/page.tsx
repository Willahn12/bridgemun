"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "@phosphor-icons/react";
import { useOrgContext } from "@/components/org/OrgProvider";
import { ROLE_LABEL, canSeeInvite, deleteOrg, friendlyOrgError, removeMember, setRole, type Role } from "@/lib/orgs";

export default function MembersPage() {
  const router = useRouter();
  const { org, members, userId, isAdmin, reload } = useOrgContext();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const adminCount = members.filter((m) => m.role === "admin").length;
  const soleAdmin = isAdmin && adminCount <= 1;

  async function act(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setError(friendlyOrgError(e instanceof Error ? e.message : "Something went wrong"));
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-6">
      {error && (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error}
        </p>
      )}

      {canSeeInvite(org.role) && (
        <section className="rounded-[var(--radius-ui)] border border-line bg-surface p-5" aria-labelledby="invite-title">
          <h2 id="invite-title" className="text-lg font-semibold tracking-tight">
            Invite code
          </h2>
          <p className="mt-1 max-w-[60ch] text-sm text-muted">
            Share this code with your students. Anyone who joins with it becomes a student. You can promote
            teachers from the member list.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <code className="rounded-[var(--radius-ui)] border border-line bg-sunk px-4 py-2 font-mono text-xl tracking-widest">
              {org.inviteCode}
            </code>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(org.inviteCode);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                } catch {
                  setError("Your browser blocked copying. Select the code and copy it by hand.");
                }
              }}
            >
              {copied ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
              {copied ? "Copied" : "Copy code"}
            </button>
          </div>
        </section>
      )}

      <section className="mt-10" aria-labelledby="members-title">
        <h2 id="members-title" className="text-lg font-semibold tracking-tight">
          Members ({members.length})
        </h2>
        <ul className="mt-3 divide-y divide-line rounded-[var(--radius-ui)] border border-line bg-surface">
          {members.map((m) => {
            const me = m.userId === userId;
            return (
              <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {m.name}
                    {me && <span className="ml-2 text-sm font-normal text-muted">you</span>}
                  </span>
                  <span className="block text-sm text-muted">Joined {new Date(m.joinedAt).toLocaleDateString()}</span>
                </span>
                <span className="flex items-center gap-2">
                  {isAdmin ? (
                    <>
                      <label htmlFor={`role-${m.userId}`} className="sr-only">
                        Role for {m.name}
                      </label>
                      <select
                        id={`role-${m.userId}`}
                        className="field !w-auto py-1.5 pr-8"
                        value={m.role}
                        disabled={me && soleAdmin}
                        title={me && soleAdmin ? "Make someone else an admin first" : undefined}
                        onChange={(e) => act(() => setRole(org.id, m.userId, e.target.value as Role))}
                      >
                        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                      {!me && (
                        <button
                          type="button"
                          className={`btn ${confirmRemove === m.userId ? "btn-live" : ""}`}
                          aria-label={confirmRemove === m.userId ? `Confirm removing ${m.name}` : `Remove ${m.name}`}
                          onClick={() => {
                            if (confirmRemove !== m.userId) return setConfirmRemove(m.userId);
                            setConfirmRemove(null);
                            act(() => removeMember(org.id, m.userId));
                          }}
                          onBlur={() => setConfirmRemove(null)}
                        >
                          {confirmRemove === m.userId ? "Click to confirm" : "Remove"}
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="rounded-[var(--radius-ui)] border border-line px-2.5 py-1 text-sm text-muted">
                      {ROLE_LABEL[m.role]}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-12 border-t border-line pt-6" aria-labelledby="leave-title">
        <h2 id="leave-title" className="text-lg font-semibold tracking-tight">
          Leave or delete
        </h2>
        <div className="mt-3 flex flex-wrap gap-3">
          {soleAdmin ? (
            <p className="max-w-[56ch] text-sm text-muted">
              You are the only admin, so you cannot leave yet. Make someone else an admin first, or delete the
              organization.
            </p>
          ) : (
            <button
              type="button"
              className={`btn ${confirmLeave ? "btn-live" : ""}`}
              onClick={async () => {
                if (!confirmLeave) return setConfirmLeave(true);
                setError(null);
                try {
                  await removeMember(org.id, userId);
                  router.push("/org");
                } catch (e) {
                  setError(friendlyOrgError(e instanceof Error ? e.message : "Could not leave."));
                }
              }}
              onBlur={() => setConfirmLeave(false)}
            >
              {confirmLeave ? "Click again to leave" : "Leave organization"}
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              className={`btn ${confirmDelete ? "btn-live" : ""}`}
              onClick={async () => {
                if (!confirmDelete) return setConfirmDelete(true);
                setError(null);
                try {
                  await deleteOrg(org.id);
                  router.push("/org");
                } catch (e) {
                  setError(friendlyOrgError(e instanceof Error ? e.message : "Could not delete."));
                }
              }}
              onBlur={() => setConfirmDelete(false)}
            >
              {confirmDelete ? "Click again to delete everything" : "Delete organization"}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
