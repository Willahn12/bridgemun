/* The AI voices a person can choose to read their speeches aloud. The ids index the voice list in
   app/api/tts/route.ts: 0 is kept for AI delegations and 5 for the judge, so people never sound like either. */
export const PERSON_VOICES = [
  { id: 1, name: "Adam", note: "Deep and calm" },
  { id: 2, name: "Bella", note: "Soft and warm" },
  { id: 3, name: "Antoni", note: "Clear and friendly" },
  { id: 4, name: "Domi", note: "Bold and confident" },
] as const;

export const isPersonVoice = (v: unknown): v is number => PERSON_VOICES.some((p) => p.id === v);

export const voiceName = (id: number) => PERSON_VOICES.find((p) => p.id === id)?.name ?? "Default";

/* A stable voice for someone who has not chosen one, so each person still sounds different. */
export function defaultVoice(userId: string | null | undefined): number {
  let n = 0;
  for (const ch of userId ?? "") n += ch.charCodeAt(0);
  return PERSON_VOICES[n % PERSON_VOICES.length].id;
}

const KEY = "bridgemun.voice";

/** The voice this browser chose last time, used as the starting choice in a new room. */
export function rememberedVoice(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY));
    return isPersonVoice(v) ? v : null;
  } catch {
    return null;
  }
}

export function rememberVoice(v: number) {
  try {
    localStorage.setItem(KEY, String(v));
  } catch {
    // private window or blocked storage: the choice still applies to this room
  }
}
