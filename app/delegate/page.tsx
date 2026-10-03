"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ModePicker from "@/components/delegate/ModePicker";
import PageHero from "@/components/PageHero";
import { toneStyle } from "@/lib/tone";
import SaveChoice from "@/components/delegate/SaveChoice";
import SessionView from "@/components/delegate/SessionView";
import SetupForm, { type SetupResult } from "@/components/delegate/SetupForm";
import Sidebar from "@/components/delegate/Sidebar";
import { HUMAN, newSessionId, type Mode, type Session } from "@/lib/sessions";

type View =
  | { step: "mode" }
  | { step: "setup"; mode: Mode }
  | { step: "save"; session: Session }
  | { step: "session"; session: Session; save: boolean };

function Delegate() {
  const router = useRouter();
  const country = useSearchParams().get("country")?.slice(0, 100) ?? "";
  const [view, setView] = useState<View>({ step: "mode" });
  const activeId = view.step === "session" ? view.session.id : null;

  function shuffle<T>(items: T[]): T[] {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function begin(mode: Mode, r: SetupResult) {
    // The judge draws the speaking order by lot.
    const order = shuffle(mode === "table" ? [HUMAN, r.aiCountries[0]] : [HUMAN, ...r.aiCountries]);
    setView({
      step: "save",
      session: {
        id: newSessionId(),
        mode,
        ...r,
        lines: [],
        updatedAt: Date.now(),
        phase: mode === "table" ? "debate" : "opening",
        startedAt: Date.now(),
        order,
        cursor: 0,
      },
    });
  }

  return (
    <div style={toneStyle("delegate")}>
      {view.step === "mode" && (
        <PageHero kind="delegate" title="AI delegate" centered>
          <p>Choose how you want to practise. You can speak or type in every mode.</p>
        </PageHero>
      )}
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-12">
      <Sidebar
        activeId={activeId}
        onNew={() => setView({ step: "mode" })}
        // A finished session opens as its report page, with the transcript and coaching beneath it.
        onOpen={(s) => (s.report ? router.push(`/report/${s.id}`) : setView({ step: "session", session: s, save: true }))}
      />

      <section className="min-w-0">
        {view.step === "mode" && (
          <ModePicker onPick={(mode) => setView({ step: "setup", mode })} />
        )}

        {view.step === "setup" && (
          <div className="max-w-xl">
            <SetupForm initialCountry={country} mode={view.mode} onBack={() => setView({ step: "mode" })} onSubmit={(r) => begin(view.mode, r)} />
          </div>
        )}

        {view.step === "save" && (
          <div className="max-w-xl">
            <SaveChoice onChoose={(save) => setView({ step: "session", session: view.session, save })} />
          </div>
        )}

        {view.step === "session" && (
          <SessionView
            key={view.session.id}
            initial={view.session}
            save={view.save}
            onExit={() => setView({ step: "mode" })}
          />
        )}
      </section>
    </main>
    </div>
  );
}

export default function DelegatePage() {
  return (
    <Suspense>
      <Delegate />
    </Suspense>
  );
}
