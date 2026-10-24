"use client";

import { useEffect, useRef } from "react";
import type { LocalVideoTrack, RemoteVideoTrack } from "livekit-client";

/* Shows one LiveKit camera track. Your own preview is mirrored, like a mirror, so it feels natural. */
export default function LiveVideo({ track, mirrored = false }: { track: LocalVideoTrack | RemoteVideoTrack; mirrored?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={`absolute inset-0 h-full w-full object-cover ${mirrored ? "-scale-x-100" : ""}`}
    />
  );
}
