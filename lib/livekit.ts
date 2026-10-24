import { AccessToken, TrackSource } from "livekit-server-sdk";

/* LiveKit, server side. Keys from a LiveKit Cloud project: LIVEKIT_URL (wss://…livekit.cloud),
   LIVEKIT_API_KEY and LIVEKIT_API_SECRET. Without them the forum falls back to direct browser-to-browser audio. */

const env = (k: string) => process.env[k]?.trim() || "";

export const livekitConfigured = () => !!(env("LIVEKIT_URL") && env("LIVEKIT_API_KEY") && env("LIVEKIT_API_SECRET"));

export const livekitUrl = () => env("LIVEKIT_URL");

/** A short-lived ticket into one forum's LiveKit room. Only the person whose turn it is may send their
    microphone and camera; everyone else can only listen and watch. */
export async function joinTicket(o: { roomId: string; identity: string; name: string; speaker: boolean }): Promise<string> {
  const at = new AccessToken(env("LIVEKIT_API_KEY"), env("LIVEKIT_API_SECRET"), {
    identity: o.identity,
    name: o.name.slice(0, 80),
    ttl: "15m",
  });
  at.addGrant({
    room: `forum-${o.roomId}`,
    roomJoin: true,
    canSubscribe: true,
    canPublish: o.speaker,
    canPublishSources: o.speaker ? [TrackSource.MICROPHONE, TrackSource.CAMERA] : [],
    canPublishData: false,
  });
  return at.toJwt();
}
