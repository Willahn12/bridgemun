"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MagnifyingGlass } from "@phosphor-icons/react";
import Brief from "@/components/Brief";
import PageHero from "@/components/PageHero";
import { toneStyle } from "@/lib/tone";
import SetupFields, { isComplete, type SetupValues } from "@/components/SetupFields";

function Research() {
  const params = useSearchParams();
  const [values, setValues] = useState<SetupValues>({ country: params.get("country")?.slice(0, 100) ?? "", committee: "", topic: "" });
  const [brief, setBrief] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setBrief(null);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Request failed");
      setBrief(body.brief);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={toneStyle("research")}>
      <PageHero kind="research" title="Research assistant">
        <p>
          Enter your assignment and get a briefing: the country&apos;s position, red lines, allies, and where to
          check each claim. Always verify facts before you use them in committee.
        </p>
      </PageHero>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <form onSubmit={run} className="tone-card h-fit p-5">
          <SetupFields values={values} onChange={setValues} />
          <button type="submit" disabled={!isComplete(values) || loading} className="btn btn-primary mt-5 w-full">
            <MagnifyingGlass aria-hidden="true" size={18} />
            {loading ? "Researching…" : "Build briefing"}
          </button>
        </form>

        <section aria-live="polite" className="min-h-64">
          {loading && (
            <div className="space-y-3" aria-label="Loading briefing">
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
