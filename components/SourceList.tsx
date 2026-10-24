import type { Source } from "@/lib/research";

/* The pages a briefing or answer cited, with their sites, so students can read them in full. */
export default function SourceList({ sources, title = "Sources" }: { sources: Source[]; title?: string }) {
  if (!sources.length) return null;
  const site = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  };
  return (
    <section className="mt-6 border-t border-line pt-4" aria-label={title}>
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">{title}</h3>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm">
        {sources.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-accent">
              {s.title}
            </a>{" "}
            <span className="text-muted">({site(s.url)})</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
