import { isSetup, llmConfigured, researchStream } from "@/lib/llm";

/* Research briefings and follow-up questions, streamed as they are written. The model may search the web,
   and the pages it cites come back as sources. Response: one JSON object per line,
   {"type":"delta","text":"..."} while writing, then {"type":"done","sources":[{title,url}]}. */

const BRIEF = `You are a research coach for Model United Nations students, many of them beginners.
Write a clear briefing for the delegate's assigned country, committee and topic.

Search the web first for the country's current, real position on this topic and any recent negotiations or votes (prefer official government, UN and reputable news sources from the last two years).

Use exactly these markdown sections, with "## " headings:
## The issue in brief
## What this country wants
## Red lines
## Likely allies and opponents
## Relevant treaties and past resolutions
## Points to raise in speeches
## Questions to expect
## Where to verify

Rules:
- Plain, direct English a 13 year old can follow. Short sentences. Define jargon once.
- Bullet points under each heading, 3 to 6 bullets.
- After a factual claim you found in a source, cite it inline as a markdown link with the publisher's name, like [UN News](https://...). Only link pages you actually found.
- Be honest about uncertainty. If you could not confirm a fact, date or figure, say so.
- Never invent statistics, quotes, resolution numbers or URLs.
- "Where to verify" lists the most useful sources to read in full, and what to look up to confirm the rest.
- Do not use em-dashes.`;

const FOLLOWUP = `You are a research coach for Model United Nations students, many of them beginners.
The student is preparing the assignment below and has a follow-up question. Answer it for their country's point of view.
Search the web if the answer depends on facts, recent events or positions. Answer in 3 to 8 short bullet points ("- ") in plain English a 13 year old can follow. Cite sources inline as markdown links with the publisher's name, only for pages you actually found. Be honest about uncertainty and never invent statistics, quotes, resolution numbers or URLs. Do not add a closing offer of more help. Do not use em-dashes.`;

const short = (v: unknown, n: number) => typeof v === "string" && v.trim().length > 0 && v.length <= n;

export async function POST(req: Request) {
  if (!llmConfigured()) return Response.json({ error: "OPENAI_API_KEY is not set on the server." }, { status: 500 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!isSetup(body)) return Response.json({ error: "Country, committee and topic are all required." }, { status: 400 });

  const assignment = `Country: ${body.country}\nCommittee: ${body.committee}\nTopic: ${body.topic}`;
  const followup = body.mode === "followup";
  if (followup && !short(body.question, 500)) return Response.json({ error: "Ask a question (up to 500 characters)." }, { status: 400 });
  const input = followup
    ? `${assignment}\n\nTheir briefing so far (for context):\n${String(body.brief ?? "").slice(0, 6000)}\n\nFollow-up question: ${String(body.question).trim()}`
    : assignment;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      try {
        for await (const ev of researchStream({ system: followup ? FOLLOWUP : BRIEF, input, maxTokens: followup ? 900 : 2600 })) send(ev);
      } catch (e) {
        send({ type: "error", error: "The research request failed.", detail: e instanceof Error ? e.message : "Unknown error" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
