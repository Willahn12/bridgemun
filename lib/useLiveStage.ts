"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type LocalVideoTrack, type RemoteTrack, type RemoteVideoTrack } from "livekit-client";
import { auth } from "@/lib/firebase";

/* A forum's live audio and video, through LiveKit. To save the free plan's minutes, everyone connects only
   while a person has the floor (`turnUser`) and disconnects as soon as their turn ends; AI speeches never
   use LiveKit. The server's ticket lets only that person send their microphone or camera. */

let configured: Promise<boolean> | null = null;
function livekitAvailable(): Promise<boolean> {
  configured ??= fetch("/api/livekit/token")
    .then((r) => r.json())
    .then((b: { configured?: boolean }) => b.configured === true)
    .catch(() => false);
  return configured;
}

async function ticket(roomId: string): Promise<{ url: string; token: string; speaker: boolean }> {
  const idToken = await auth().currentUser?.getIdToken();
  if (!idToken) throw new Error("Sign in first.");
  const res = await fetch("/api/livekit/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ roomId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Live audio is not available right now.");
  return body;
}

export function useLiveStage(roomId: string, turnUser: string | null, live: boolean) {
  const [available, setAvailable] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [remoteVideo, setRemoteVideo] = useState<RemoteVideoTrack | null>(null);
  const [localVideo, setLocalVideo] = useState<LocalVideoTrack | null>(null);
  const [hearing, setHearing] = useState<string | null>(null); // name of whoever is live right now
  const [blocked, setBlocked] = useState(false); // the browser is holding back sound until a click
  const [error, setError] = useState<string | null>(null);
  const audioBoxRef = useRef<HTMLDivElement | null>(null);
  /* Where incoming audio elements go; handed out as a callback so the page never reads a ref while rendering. */
  const audioBox = useCallback((el: HTMLDivElement | null) => {
    audioBoxRef.current = el;
  }, []);

  useEffect(() => {
    let on = true;
    livekitAvailable().then((ok) => on && setAvailable(ok));
    return () => {
      on = false;
    };
  }, []);

  /* Connect for each person's turn, and only then. */
  const onAir = available && live && !!turnUser;
  useEffect(() => {
    if (!onAir) return;
    let cancelled = false;
    const r = new Room({ adaptiveStream: true, dynacast: true });
    const attach = (track: RemoteTrack, _pub: unknown, participant: { name?: string; identity: string }) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach();
        audioBoxRef.current?.appendChild(el);
        setHearing(participant.name || participant.identity);
      } else if (track.kind === Track.Kind.Video) {
        setRemoteVideo(track as RemoteVideoTrack);
      }
    };
    r.on(RoomEvent.TrackSubscribed, attach)
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((el) => el.remove());
        if (track.kind === Track.Kind.Audio) setHearing(null);
        else setRemoteVideo(null);
      })
      .on(RoomEvent.TrackMuted, (pub) => {
        if (pub.kind === Track.Kind.Video) setRemoteVideo(null);
      })
      .on(RoomEvent.TrackUnmuted, (pub) => {
        if (pub.kind === Track.Kind.Video && pub.track) setRemoteVideo(pub.track as RemoteVideoTrack);
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, () => setBlocked(!r.canPlaybackAudio));
    ticket(roomId)
      .then(({ url, token }) => (cancelled ? undefined : r.connect(url, token)))
      .then(() => {
        if (cancelled) return;
        setRoom(r);
        setError(null);
        setBlocked(!r.canPlaybackAudio);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Could not connect to live audio."));
    return () => {
      cancelled = true;
      r.disconnect();
      setRoom(null);
      setRemoteVideo(null);
      setLocalVideo(null);
      setHearing(null);
    };
  }, [onAir, roomId, turnUser]);

  /* Speaker only. */
  const goLive = useCallback(
    async (camera: boolean) => {
      if (!room) throw new Error("Still connecting to live audio. Try again in a second.");
      await room.localParticipant.setMicrophoneEnabled(true);
      if (camera) {
        const pub = await room.localParticipant.setCameraEnabled(true);
        setLocalVideo((pub?.track as LocalVideoTrack) ?? null);
      }
    },
    [room],
  );
  const setMic = useCallback((on: boolean) => room?.localParticipant.setMicrophoneEnabled(on), [room]);
  const setCamera = useCallback(
    async (on: boolean) => {
      if (!room) return;
      const pub = await room.localParticipant.setCameraEnabled(on);
      setLocalVideo(on ? ((pub?.track as LocalVideoTrack) ?? null) : null);
    },
    [room],
  );
  const end = useCallback(async () => {
    if (!room) return;
    await room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
    await room.localParticipant.setCameraEnabled(false).catch(() => {});
    setLocalVideo(null);
  }, [room]);
  const unblock = useCallback(() => room?.startAudio().then(() => setBlocked(false)), [room]);

  return { available, connected: !!room, hearing, remoteVideo, localVideo, blocked, error, audioBox, goLive, setMic, setCamera, end, unblock };
}
