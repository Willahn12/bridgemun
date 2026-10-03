import PageHero from "@/components/PageHero";
import SpeechStudio from "@/components/SpeechStudio";
import { toneStyle } from "@/lib/tone";

export const metadata = { title: "Speech Studio | BridgeMUN" };

export default function StudioPage() {
  return (
    <main style={toneStyle("studio")}>
      <PageHero kind="studio" title="Speech Studio">
        <p>
          Dictate a draft, edit it, then hear it read back in a natural voice. Listening to your own speech is the
          quickest way to catch clumsy sentences and check your timing.
        </p>
      </PageHero>
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="rounded-[var(--radius-ui)] shadow-[8px_8px_0_var(--tone)]">
          <SpeechStudio />
        </div>
      </div>
    </main>
  );
}
