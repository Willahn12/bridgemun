/* Points a delegate can raise during debate in a practice session. A point is not a speech: it does not count
   against debate time. Pure data and helpers, shared by the session view and the API route. */

export type PointType = "information" | "order" | "inquiry";

export const POINT_INFO: Record<PointType, { label: string; when: string; placeholder: string }> = {
  information: {
    label: "Point of information",
    when: "Ask another delegation a short question about what it said.",
    placeholder: "Your question, e.g. How would your plan be paid for?",
  },
  order: {
    label: "Point of order",
    when: "Something broke the rules of procedure, like a speaker going over time or off topic.",
    placeholder: "What rule was broken, e.g. The last speaker went far over the speaking time.",
  },
  inquiry: {
    label: "Point of parliamentary inquiry",
    when: "Ask the chair a question about the rules or what happens next.",
    placeholder: "Your question, e.g. When will draft resolutions be voted on?",
  },
};

export const POINT_TYPES: PointType[] = ["information", "order", "inquiry"];

/* How the point reads in the transcript, so the judge, the AI delegations and the report all see what it was. */
export function pointLine(type: PointType, text: string, to?: string): string {
  if (type === "information") return `Point of information to ${to}: ${text}`;
  return `${POINT_INFO[type].label}: ${text}`;
}

/* Why a point cannot be raised as written, or null if it can. */
export function checkPoint(type: PointType, text: string, to: string | undefined, delegations: string[]): string | null {
  const t = text.trim();
  if (t.length < 5) return "Say what the point is about.";
  if (t.length > 400) return "Keep a point short (up to 400 characters).";
  if (type === "information" && (!to || !delegations.includes(to))) return "Choose the delegation your question is for.";
  return null;
}
