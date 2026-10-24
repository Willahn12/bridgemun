import OpenAI from "openai";

/* The only file that knows which AI provider we use. Swap providers here. */
export const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export function llmConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function complete(opts: {
  system: string;
  messages: ChatTurn[];
  maxTokens: number;
  json?: boolean;
}): Promise<string> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await client.chat.completions.create({
    model: MODEL,
    max_completion_tokens: opts.maxTokens,
    ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
    messages: [{ role: "system", content: opts.system }, ...opts.messages],
  });
  return res.choices[0]?.message?.content?.trim() ?? "";
}

export interface Setup {
  country: string;
  committee: string;
  topic: string;
}

export function isSetup(v: unknown): v is Setup {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return ["country", "committee", "topic"].every(
    (k) => typeof s[k] === "string" && (s[k] as string).trim().length > 0 && (s[k] as string).length <= 200,
  );
}

export interface Source {
  title: string;
  url: string;
}

export type ResearchEvent = { type: "delta"; text: string } | { type: "done"; sources: Source[] };

/* Tracking parameters the search tool adds to links; they are noise in a student's source list. */
const cleanUrl = (u: string) => u.replace(/([?&])utm_source=openai(&|$)/, (_m, a, b) => (b ? a : "")).replace(/[?&]$/, "");

/* A streamed answer that may search the web, with the pages it cited. Falls back to a plain answer without
   sources if web search is not available to this key or model. */
export async function* researchStream(opts: { system: string; input: string; maxTokens: number }): AsyncGenerator<ResearchEvent> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const sources = new Map<string, Source>();
  const cite = (a: { type?: string; url?: string; title?: string }) => {
    if (a.type !== "url_citation" || !a.url || !/^https?:\/\//.test(a.url)) return;
    const url = cleanUrl(a.url);
    if (!sources.has(url)) sources.set(url, { title: (a.title || url).slice(0, 200), url });
  };
  let started = false;
  try {
    const stream = await client.responses.create({
      model: MODEL,
      instructions: opts.system,
      input: opts.input,
      tools: [{ type: "web_search" }],
      max_output_tokens: opts.maxTokens,
      stream: true,
    });
    for await (const ev of stream) {
      if (ev.type === "response.output_text.delta") {
        started = true;
        yield { type: "delta", text: ev.delta };
      } else if (ev.type === "response.output_text.annotation.added") {
        cite(ev.annotation as { type?: string; url?: string; title?: string });
      } else if (ev.type === "response.completed") {
        for (const item of ev.response.output) {
          if (item.type !== "message") continue;
          for (const c of item.content) if (c.type === "output_text") c.annotations.forEach((a) => cite(a as { type?: string; url?: string; title?: string }));
        }
      }
    }
  } catch (e) {
    if (started) throw e;
    // No web search: answer from the model alone, clearly without sources.
    const text = await complete({ system: opts.system, messages: [{ role: "user", content: opts.input }], maxTokens: opts.maxTokens });
    yield { type: "delta", text };
  }
  yield { type: "done", sources: [...sources.values()].slice(0, 20) };
}
