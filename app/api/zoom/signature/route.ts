import { NextResponse } from "next/server";
import { sdkKey, sdkSignature, verifyUser, zoomConfigured } from "@/lib/zoom";

/* A short-lived token to join one forum's Zoom meeting. */
export async function POST(req: Request) {
  if (!zoomConfigured()) return NextResponse.json({ error: "Zoom is not set up." }, { status: 501 });
  if (!(await verifyUser(req))) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { meetingNumber?: unknown } | null;
  const mn = typeof b?.meetingNumber === "string" ? b.meetingNumber.replace(/\D/g, "") : "";
  if (mn.length < 9 || mn.length > 12) return NextResponse.json({ error: "Invalid meeting." }, { status: 400 });
  return NextResponse.json({ signature: sdkSignature(mn), sdkKey: sdkKey() });
}
