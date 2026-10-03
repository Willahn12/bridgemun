"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "@phosphor-icons/react";
import { useOrgContext } from "@/components/org/OrgProvider";
import { createAssignment, dueText, listAssignments, listSubmissions, type Assignment, type Submission } from "@/lib/classroom";
import { friendlyOrgError } from "@/lib/orgs";

export default function AssignmentsPage() {
  const { org, members, userId, isStaff } = useOrgContext();
  const [items, setItems] = useState<Assignment[] | null>(null);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const a = await listAssignments(org.id);
        const s = await listSubmissions(a.map((x) => x.id));
        if (cancelled) return;
        setItems(a);
        setSubs(s);
      } catch (e) {
        if (!cancelled) setError(friendlyOrgError(e instanceof Error ? e.message : "Could not load assignments."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [org.id, tick]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createAssignment(org.id, userId, {
        title,
        description,
        dueAt: due ? new Date(due).toISOString() : null,
      });
      setTitle("");
      setDescription("");
      setDue("");
      setOpen(false);
      setTick((t) => t + 1);
    } catch (err) {
      setError(friendlyOrgError(err instanceof Error ? err.message : "Could not create the assignment."));
    } finally {
      setBusy(false);
    }
  }

  const studentCount = members.filter((m) => m.role === "student").length;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Assignments</h2>
        {isStaff && (
          <button type="button" className="btn btn-primary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            <Plus aria-hidden="true" size={16} /> New assignment
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={create} className="mt-4 rounded-[var(--radius-ui)] border border-line bg-surface p-5">
          <div className="grid gap-4">
            <div>
              <label htmlFor="a-title" className="label">Title</label>
              <input id="a-title" className="field" maxLength={120} value={title} placeholder="Opening statement on plastic pollution" onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label htmlFor="a-desc" className="label">Instructions</label>
              <textarea id="a-desc" rows={4} className="field resize-y" value={description} placeholder="Practise in solo mode with Japan as the AI delegate. Finish the session and hand it in." onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <label htmlFor="a-due" className="label">Due date</label>
              <input id="a-due" type="datetime-local" className="field !w-auto" value={due} onChange={(e) => setDue(e.target.value)} />
              <p className="helper">Optional. Students see it in their reminders.</p>
            </div>
          </div>
          <div className="mt-5 flex gap-3">
            <button type="submit" className="btn btn-primary" disabled={busy || title.trim().length < 2}>
              {busy ? "Creating…" : "Create assignment"}
            </button>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}

      {items === null && !error && (
        <div className="mt-4 space-y-2" aria-label="Loading">
          {[0, 1].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-[var(--radius-ui)] bg-sunk" />
          ))}
        </div>
      )}

      {items?.length === 0 && (
        <p className="mt-4 max-w-[56ch] leading-relaxed text-muted">
          {isStaff ? "No assignments yet. Create one and your students will see it here." : "No assignments yet."}
        </p>
      )}

      {items && items.length > 0 && (
        <ul className="mt-4 grid gap-2">
          {items.map((a) => {
            const { label, overdue } = dueText(a.dueAt);
            const mine = subs.find((s) => s.assignmentId === a.id && s.userId === userId);
            const count = subs.filter((s) => s.assignmentId === a.id).length;
            return (
              <li key={a.id}>
                <Link
                  href={`/org/${org.id}/assignments/${a.id}`}
                  className="group flex items-center justify-between gap-4 rounded-[var(--radius-ui)] border border-line bg-surface p-4 transition-colors hover:border-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{a.title}</span>
                    <span className={`block text-sm ${overdue && !mine && !isStaff ? "text-danger" : "text-muted"}`}>{label}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3 text-sm text-muted">
                    {isStaff ? `${count} of ${studentCount} handed in` : mine ? "Handed in" : "Not handed in"}
                    <ArrowRight aria-hidden="true" size={18} className="transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
