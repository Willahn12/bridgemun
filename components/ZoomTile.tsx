"use client";

import { useEffect, useRef, useState } from "react";
import { SignOut, VideoCamera } from "@phosphor-icons/react";
import { joinToken } from "@/lib/zoomClient";

/* The forum's Zoom meeting, inside the dark floor tile. Joining is a button press, because browsers only allow
   the camera, microphone and sound after the person does something. The SDK runs in public/zoom-embed.html. */
export default function ZoomTile({
  meetingNumber,
  password,
  userName,
  children,
}: {
  meetingNumber: string;
  password: string;
  userName: string;
  /** What the tile shows before joining: the speaker card. */
  children: React.ReactNode;
}) {
  const [state, setState] = useState<"idle" | "loading" | "joined" | "error">("idle");
  const [message, setMessage] = useState("");
  const frameRef = useRef<HTMLIFrameElement>(null);
  const tokenRef = useRef<Promise<{ signature: string; sdkKey: string }> | null>(null);

  useEffect(() => {
    if (state === "idle") return;
    const onMessage = async (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== frameRef.current?.contentWindow || e.data?.source !== "bridgemun-zoom") return;
      const { type, message: msg } = e.data as { type: string; message?: string };
      if (type === "ready") {
        try {
          const t = await (tokenRef.current ?? joinToken(meetingNumber));
          frameRef.current?.contentWindow?.postMessage(
            { source: "bridgemun", type: "join", ...t, meetingNumber, password, userName },
            location.origin,
          );
        } catch (err) {
          setState("error");
          setMessage(err instanceof Error ? err.message : "Could not join the video.");
        }
      } else if (type === "joined") {
        setState("joined");
      } else if (type === "error") {
        setState("error");
        setMessage(msg || "Could not join the video.");
      } else if (type === "left") {
        setState("idle");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [state, meetingNumber, password, userName]);

  if (state === "idle") {
    return (
      <>
        {children}
        <button
          type="button"
          onClick={() => {
            tokenRef.current = joinToken(meetingNumber); // start fetching while the SDK loads
            tokenRef.current.catch(() => {});
            setMessage("");
            setState("loading");
          }}
          className="absolute bottom-10 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-[#0c1a2b] shadow-lg transition-transform hover:scale-105"
        >
          <VideoCamera aria-hidden="true" size={18} weight="fill" /> Join video and audio
        </button>
      </>
    );
  }

  return (
    <>
      <iframe
        ref={frameRef}
        src="/zoom-embed.html"
        title="Forum video"
        allow="camera; microphone; autoplay; display-capture; fullscreen"
        className="absolute inset-0 h-full w-full border-0"
      />
      {state === "error" && (
        <div className="absolute inset-x-3 bottom-3 rounded-[var(--radius-ui)] bg-black/70 p-3 text-center text-xs">
          <p>{message}</p>
          <button type="button" className="mt-2 font-bold underline" onClick={() => setState("idle")}>
            Back
          </button>
        </div>
      )}
      {state === "joined" && (
        <button
          type="button"
          onClick={() => {
            frameRef.current?.contentWindow?.postMessage({ source: "bridgemun", type: "leave" }, location.origin);
            setState("idle");
          }}
          className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold"
        >
          <SignOut aria-hidden="true" size={12} /> Leave video
        </button>
      )}
    </>
  );
}
