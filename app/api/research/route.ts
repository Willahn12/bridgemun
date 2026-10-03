import { NextResponse } from "next/server";
import { complete, isSetup, llmConfigured } from "@/lib/llm";

const SYSTEM = `You are a research coach for Model United Nations students, many of them beginners.
Write a clear briefing for the delegate's assigned country, committee and topic.

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
- Be honest about uncertainty. If you are not sure a fact, date or figure is correct, say so.
- Never invent statistics, quotes, resolution numbers or URLs. Name real organisations and documents to search for instead (for example UN Digital Library, the country's permanent mission, UNFCCC, World Bank).
- "Where to verify" lists what to look up to confirm each claim above.
- Do not use em-dashes.`;

export async function POST(req: Request) {
  if (!llmConfigured()) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set on the server." }, { status: 500 });
  }
  const body = await req.json().catch(() => null);
  if (!isSetup(body)) {
    return NextResponse.json({ error: "Country, committee and topic are all required." }, { status: 400 });
  }

  try {
    const brief = await complete({
      system: SYSTEM,
      maxTokens: 2200,
      messages: [
        { role: "user", content: `Country: ${body.country}
Committee: ${body.committee}
Topic: ${body.topic}` },
      ],
    });
    return NextResponse.json({ brief });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: "The research request failed.", detail }, { status: 502 });
  }
}
