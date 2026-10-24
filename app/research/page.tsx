"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BookmarkSimple, MagnifyingGlass, UsersThree } from "@phosphor-icons/react";
import Brief from "@/components/Brief";
import PageHero from "@/components/PageHero";
import SourceList from "@/components/SourceList";
import { toneStyle } from "@/lib/tone";
import { useAuth } from "@/lib/auth";
import { listMyResearch, saveResearch, streamResearch, type Research, type Source } from "@/lib/research";
import SetupFields, { isComplete, type SetupValues } from "@/components/SetupFields";

function Research() {
  const params = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const [values, setValues] = useState<SetupValues>({ country: params.get("country")?.slice(0, 100) ?? "", committee: "", topic: "" });
  const [asked, setAsked] = useState<SetupValues | null>(null);
  const [brief, setBrief] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<Research[] | null>(null);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    listMyResearch(userId)
      .then((r) => !cancelled && setMine(r))
      .catch(() => !cancelled && setMine([]));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setBrief("");
    setSources([]);
    setAsked(values);
    try {
      const done = await streamResearch({ ...values }, setBrief);
      setBrief(done.text);
      setSources(done.sources);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!asked || !brief) return;
    setSaving(true);
    setError(null);
    try {
      const id = await saveResearch({ ...asked, brief, sources });
      router.push(`/research/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the briefing.");
      setSaving(false);
    }
  }

  const finished = !loading && !!brief;

  return (
    <main style={toneStyle("research")}>
      <PageHero kind="research" title="Research assistant">
        <p>
          Enter your assignment and get a briefing built from current sources: the country&apos;s position, red lines,
          allies, and links to check each claim. Save it to ask follow-up questions and build on it with classmates.
        </p>
      </PageHero>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="space-y-6">
          <form onSubmit={run} className="tone-card h-fit p-5">
            <SetupFields values={values} onChange={setValues} />
            <button type="submit" disabled={!isComplete(values) || loading} className="btn btn-primary mt-5 w-full">
              <MagnifyingGlass aria-hidden="true" size={18} />
              {loading ? "Researching…" : "Build briefing"}
            </button>
          </form>

          {user && (
            <section className="tone-card p-5" aria-labelledby="mine-title">
              <h2 id="mine-title" className="font-semibold">
                My research
              </h2>
              {mine === null ? (
                <p className="mt-2 text-sm text-muted">Loading…</p>
              ) : mine.length === 0 ? (
                <p className="mt-2 text-sm text-muted">Saved briefings appear here, including ones classmates share with you.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {mine.map((r) => (
                    <li key={r.id}>
                      <Link href={`/research/${r.id}`} className="block rounded-[var(--radius-ui)] border border-line p-3 text-sm hover:border-accent">
                        <span className="block font-medium">
                          {r.country}: {r.topic}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-muted">
                          {r.committee}
                          {(r.collaborators.length > 0 || r.ownerId !== user.id) && (
                            <>
                              {" · "}
                              <UsersThree aria-hidden="true" size={14} />
                              {r.ownerId === user.id ? `Shared with ${r.collaborators.length}` : `Shared by ${r.ownerName}`}
                            </>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <section aria-live="polite" aria-busy={loading} className="min-h-64">
          {loading && !brief && (
            <div className="space-y-3" aria-label="Loading briefing">
              <p className="text-sm text-muted">Searching current sources…</p>
              {[70, 95, 85, 60, 90, 75].map((w, i) => (
                <div key={i} className="h-4 animate-pulse rounded bg-sunk" style={{ width: `${w}%` }} />
              ))}
            </div>
          )}
          {error && (
            <p role="alert" className="rounded-[var(--radius-ui)] border border-danger p-4 text-sm text-danger">
              {error}
            </p>
          )}
          {brief && <Brief markdown={brief} />}
          {finished && <SourceList sources={sources} />}
          {finished && (
            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
              {user ? (
                <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
                  <BookmarkSimple aria-hidden="true" size={18} />
                  {saving ? "Saving…" : "Save to my research"}
                </button>
              ) : (
                <Link href="/login" className="btn btn-primary">
                  Sign in to save it
                </Link>
              )}
              <p className="text-sm text-muted">Saved briefings can take follow-up questions, notes, and classmates.</p>
            </div>
          )}
          {!loading && !error && !brief && (
            <p className="max-w-[52ch] text-muted">
              Your briefing will appear here. Try a real assignment, such as the Philippines in the
              UN Environment Assembly on climate adaptation finance.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

export default function ResearchPage() {
  return (
    <Suspense>
      <Research />
    </Suspense>
  );
}
