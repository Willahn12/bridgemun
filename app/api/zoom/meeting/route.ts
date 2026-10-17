import { NextResponse } from "next/server";
import { createMeeting, verifyUser, zoomConfigured } from "@/lib/zoom";

/* The host's tab calls this when a forum starts, to give the forum its own Zoom meeting. */
export async function POST(req: Request) {
  if (!zoomConfigured()) return NextResponse.json({ error: "Zoom is not set up." }, { status: 501 });
  if (!(await verifyUser(req))) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { topic?: unknown; minutes?: unknown } | null;
  const topic = typeof b?.topic === "string" && b.topic.trim() ? b.topic.trim() : "BridgeMUN forum";
  const minutes = typeof b?.minutes === "number" ? b.minutes : 60;
  try {
    return NextResponse.json(await createMeeting(topic, minutes));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Zoom failed." }, { status: 502 });
  }
}

/* Lets the forum page know whether to offer video at all. */
export async function GET() {
  return NextResponse.json({ configured: zoomConfigured() });
}
