import { Fragment, type ReactNode } from "react";

/* Small renderer for the brief: "## " headings, "- " bullets, **bold**. No raw HTML is ever injected. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
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

  markdown.split("\n").forEach((raw, i) => {
    const line = raw.trim();
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
