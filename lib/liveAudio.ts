"use client";

import { collection, deleteDoc, doc, onSnapshot, query, setDoc, Timestamp, updateDoc, where, type QuerySnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

/* Talking live in a forum: the speaker's microphone goes straight to every other member's browser over WebRTC.
   Firestore only carries the connection details, one document per speaker and listener in rooms/{id}/rtc.
   Offers and answers are sent once ICE gathering is complete, so no separate candidate messages are needed.
   Uses Google's public STUN server; very strict networks that block peer-to-peer need Zoom instead. */

const ICE: RTCConfiguration = { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] };

/** Resolves when the connection has found its network routes, or after `ms` with whatever it has. */
function gathered(pc: RTCPeerConnection, ms = 3000) {
  return new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const t = setTimeout(resolve, ms);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(t);
        resolve();
      }
    });
  });
}

const rtcDoc = (roomId: string, from: string, to: string) => doc(db(), "rooms", roomId, "rtc", `${from}_${to}`);

export interface Broadcast {
  /** Mutes or unmutes the microphone without dropping the connection, so resuming is instant. */
  setPaused: (paused: boolean) => void;
  stop: () => Promise<void>;
}

/** Starts sending your microphone to each listener. */
export async function broadcast(roomId: string, me: string, listeners: string[]): Promise<Broadcast> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const links: { pc: RTCPeerConnection; unsub: () => void; to: string }[] = [];
  await Promise.all(
    listeners.map(async (to) => {
      const pc = new RTCPeerConnection(ICE);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      const ref = rtcDoc(roomId, me, to);
      await setDoc(ref, { from: me, to, offer: pc.localDescription?.toJSON() ?? null, answer: null, at: Timestamp.now() });
      const unsub = onSnapshot(ref, (snap) => {
        const answer = snap.data()?.answer as RTCSessionDescriptionInit | null | undefined;
        if (answer && !pc.currentRemoteDescription) pc.setRemoteDescription(answer).catch(() => {});
      });
      links.push({ pc, unsub, to });
    }),
  );
  const stop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    await Promise.all(
      links.map(async ({ pc, unsub, to }) => {
        unsub();
        pc.close();
        await deleteDoc(rtcDoc(roomId, me, to)).catch(() => {});
      }),
    );
  };
  return {
    stop,
    setPaused: (paused) => stream.getAudioTracks().forEach((t) => (t.enabled = !paused)),
  };
}

/** Answers anyone who starts talking live to you. `onStream` gets their audio; `onEnd` fires when they stop. */
export function listen(
  roomId: string,
  me: string,
  onStream: (from: string, stream: MediaStream) => void,
  onEnd: (from: string) => void,
): () => void {
  const pcs = new Map<string, RTCPeerConnection>();
  let unsub: () => void = () => {};
  let retry: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  /* A listener that errors (a dropped connection, rules not yet published) stops for good in Firestore,
     so it is started again a few seconds later instead of leaving this person deaf for the rest of the forum. */
  const subscribe = () => {
    unsub = onSnapshot(query(collection(db(), "rooms", roomId, "rtc"), where("to", "==", me)), onChange, () => {
      unsub();
      if (!stopped) retry = setTimeout(subscribe, 3000);
    });
  };
  const onChange = (snap: QuerySnapshot) => {
    for (const change of snap.docChanges()) {
      const d = change.doc.data();
      const from = d.from as string;
      if (change.type === "removed") {
        pcs.get(from)?.close();
        pcs.delete(from);
        onEnd(from);
        continue;
      }
      if (change.type !== "added" || !d.offer || d.answer || pcs.has(from)) continue;
      const pc = new RTCPeerConnection(ICE);
      pcs.set(from, pc);
      pc.ontrack = (e) => onStream(from, e.streams[0] ?? new MediaStream([e.track]));
      (async () => {
        await pc.setRemoteDescription(d.offer as RTCSessionDescriptionInit);
        await pc.setLocalDescription(await pc.createAnswer());
        await gathered(pc);
        await updateDoc(change.doc.ref, { answer: pc.localDescription?.toJSON() ?? null });
      })().catch(() => {
        pc.close();
        pcs.delete(from);
      });
    }
  };
  subscribe();
  return () => {
    stopped = true;
    clearTimeout(retry);
    unsub();
    pcs.forEach((pc) => pc.close());
    pcs.clear();
  };
}
