/* One colour per page. Pages set --tone on their wrapper; hero bands and .tone-card panels pick it up. */
export type PageKind = "research" | "delegate" | "history" | "studio" | "org" | "room";

export const TONES: Record<PageKind, string> = {
  research: "var(--cyan)",
  delegate: "var(--sun)",
  history: "var(--mint)",
  studio: "var(--coral)",
  org: "var(--accent)",
  room: "var(--violet)",
};

export const toneStyle = (kind: PageKind) => ({ "--tone": TONES[kind] }) as React.CSSProperties;
