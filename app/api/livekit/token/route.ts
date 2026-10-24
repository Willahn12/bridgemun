import { NextResponse } from "next/server";
import { idTokenOf, readDoc, verifyUser } from "@/lib/serverAuth";
import { joinTicket, livekitConfigured, livekitUrl } from "@/lib/livekit";

/* A ticket into a forum's live audio and video. The server decides who may speak: only a member whose
   turn it is right now (rooms/{id}.turn_user) gets permission to send their microphone and camera. */
export async function POST(req: Request) {
  if (!livekitConfigured()) return NextResponse.json({ error: "Live video is not set up." }, { status: 501 });
  const uid = await verifyUser(req);
  const idToken = idTokenOf(req);
  if (!uid || !idToken) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const b = (await req.json().catch(() => null)) as { roomId?: unknown } | null;
  const roomId = typeof b?.roomId === "string" && /^[A-Za-z0-9]{10,40}$/.test(b.roomId) ? b.roomId : null;
  if (!roomId) return NextResponse.json({ error: "Invalid forum." }, { status: 400 });

  const [room, member] = await Promise.all([readDoc(`rooms/${roomId}`, idToken), readDoc(`rooms/${roomId}/members/${uid}`, idToken)]);
  if (!room || !member) return NextResponse.json({ error: "You are not in this forum." }, { status: 403 });
  if (room.status?.stringValue !== "live") return NextResponse.json({ error: "The forum is not live." }, { status: 409 });

  const speaker = room.turn_user?.stringValue === uid;
  const name = member.country?.stringValue || member.name?.stringValue || "Delegate";
  return NextResponse.json({ url: livekitUrl(), token: await joinTicket({ roomId, identity: uid, name, speaker }), speaker });
}

/* Lets the forum page know whether to use LiveKit. */
export async function GET() {
  return NextResponse.json({ configured: livekitConfigured() });
}
