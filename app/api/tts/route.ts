import { NextResponse } from "next/server";

const MAX_CHARS = 2500;

// Premade ElevenLabs voices. Index 0 is the default; extra AI delegates get the others.
const VOICES = [
  process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM",
  "pNInz6obpgDQGcFmaJgB",
  "EXAVITQu4vr4xnSDxMaL",
  "ErXwobaYiN019PkySvjV",
  "AZnzlk1XvdvUeBnXmlld",
  "TxGEqnHWrfWFTfGW9XjX",
];
// Flash is roughly 5x faster to first audio than the multilingual model.
const MODEL = process.env.ELEVENLABS_MODEL ?? "eleven_flash_v2_5";

export async function POST(req: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "TTS is not configured" }, { status: 500 });
  }

  const { text, voice } = await req.json().catch(() => ({ text: "", voice: 0 }));
  const voiceId = VOICES[Number.isInteger(voice) ? Math.abs(voice) % VOICES.length : 0];
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }
  if (text.length > MAX_CHARS) {
    return NextResponse.json({ error: `Text exceeds ${MAX_CHARS} characters` }, { status: 400 });
  }

  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_22050_32`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({ text, model_id: MODEL }),
    },
  );

  if (!upstream.ok) {
    const detail = await upstream.text();
    return NextResponse.json(
      { error: "ElevenLabs request failed", status: upstream.status, detail },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
