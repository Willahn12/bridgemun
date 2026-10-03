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
