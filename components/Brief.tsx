import { Fragment, type ReactNode } from "react";

/* Small renderer for the brief: "## " headings, "- " bullets, **bold** and [links](https://...).
   No raw HTML is ever injected, and only http(s) links are made clickable. */
const TOKEN = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
const tidy = (url: string) => url.replace(/([?&])utm_source=openai(&|$)/, (_m, a, b) => (b ? a : "")).replace(/[?&]$/, "");

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) out.push(<Fragment key={`t${last}`}>{text.slice(last, m.index)}</Fragment>);
    out.push(
      m[1] !== undefined ? (
        <strong key={m.index} className="font-semibold">
          {m[1]}
        </strong>
      ) : (
        <a key={m.index} href={tidy(m[3])} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
          {m[2]}
        </a>
      ),
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(<Fragment key={`t${last}`}>{text.slice(last)}</Fragment>);
  return out;
}

export default function Brief({ markdown }: { markdown: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];

  const flush = (key: string) => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={key} className="mt-2 list-disc space-y-1.5 pl-5 marker:text-muted">
        {bullets.map((b, i) => (
          <li key={i}>{inline(b)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  // House style has no em-dashes; the model sometimes uses them anyway.
  markdown.split("\n").forEach((raw, i) => {
    const line = raw.trim().replace(/\s*\u2014\s*/g, ", ");
    if (line.startsWith("## ")) {
      flush(`ul-${i}`);
      blocks.push(
        <h3 key={i} className="mt-7 border-t border-line pt-5 text-lg font-semibold tracking-tight first:mt-0 first:border-0 first:pt-0">
          {line.slice(3)}
        </h3>,
      );
    } else if (/^[-*] /.test(line)) {
      bullets.push(line.slice(2));
    } else if (line) {
      flush(`ul-${i}`);
      blocks.push(
        <p key={i} className="mt-2">
          {inline(line)}
        </p>,
      );
    }
  });
  flush("ul-end");

  return <div className="max-w-[68ch] leading-relaxed">{blocks}</div>;
}
