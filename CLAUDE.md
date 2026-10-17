@AGENTS.md

# BridgeMUN

LognCoding summer 2026 capstone. A web app where middle schoolers research Model UN topics and practise debating with AI delegates. Client: Apas Camp Lapu-Lapu Middle School, Cebu, Philippines. Must work for any country the user types in. The full feature list and to-do list are in `ROADMAP.md`, so read that before picking up roadmap work.

## Stack
- Next.js 16 (App Router; see AGENTS.md about breaking changes), React 19, Tailwind v4, TypeScript.
- Fonts: Bricolage Grotesque (display) + Figtree (body). Icons: `@phosphor-icons/react`.
- **Backend is Firebase, and that's a hard capstone requirement. Never suggest Supabase or another BaaS.** Project `bridgemun-capstone`. Auth = Firebase Auth (email/password only). Data = Firestore.
- LLM: OpenAI, wrapped in `lib/llm.ts` (the single place to swap providers). Voice: ElevenLabs Flash via `app/api/tts`.
- Secrets live in `.env.local` (`NEXT_PUBLIC_FIREBASE_*`, OpenAI, ElevenLabs). Never commit them.

## Layout
- `app/`: pages. `delegate` (AI practice), `research`, `studio` (Speech Studio), `room/[id]` (online rooms, a large file), `org/[id]/...` (organizations, classroom, assignments, chat), `history`, `report/[id]`, and the auth pages.
- `app/api/`: `coach`, `delegate`, `report`, `research`, `tts`. These are server-side LLM/TTS calls that don't touch Firestore.
- `lib/`: Firestore data access (`auth`, `orgs`, `classroom`, `rooms`, `sessions`), `firebase.ts` (init), `motions.ts` (pure motion/procedure logic), `voice.ts`, `tone.ts`.
- Zoom: `lib/zoom.ts` (server) + `app/api/zoom/*` + `lib/zoomClient.ts` + `components/ZoomTile.tsx`, and the SDK runs isolated in `public/zoom-embed.html` (React 18 from Zoom's CDN; never `npm install @zoom/meetingsdk`, it pins React 18).
- `components/delegate/`: the practice-session UI (`SessionView`, `MotionPanel`, `SetupForm`, `ReportView`, ...).

## Firestore
- Collections: `users`, `organizations`, `memberships`, `sessions`, `assignments`, `submissions`, `channels`, `messages`, `rooms` (+ `members`, `lines` subcollections).
- `rooms`/`members`/`lines` intentionally keep the old snake_case field names (see the comment in `lib/rooms.ts`).
- Rules are in `firestore.rules`. There is no CLI deploy: to deploy, paste the file into Firebase console → Firestore → Rules → Publish.
- Rules gotcha: a list query is only allowed if the rule is provable from the query's own `where` filters. Firestore rejects the whole query rather than filtering results. A `get()` in a rule only works for list queries when its path depends on `request.auth.uid` or a field pinned with `==` in that query. That's why `organizations`, `assignments` and `submissions` use plain `signedIn()` reads.
- **Firebase Storage is not enabled** (it needs the paid Blaze plan). Voice-clip upload in rooms is stubbed (`uploadClip`/`clipUrl` throw) and the UI falls back to text. Don't build features that need Storage without asking.

## Working here
- Run with `npm run dev` (port 3000). Typecheck with `npx tsc --noEmit`. If the module graph goes stale, clear `.next`.
- Design: light theme by default, white/light-blue with bright accents (cyan, sun yellow, coral, mint, violet). It should look professional, not AI-generated. Use the `frontend-design` / `design-taste-frontend` skills for UI work. Respect the "Reduce motion" toggle.
- Avoid running full AI debates end-to-end just to test, because they burn OpenAI credits. Test the UI/data paths instead.
- Work down `ROADMAP.md` autonomously. Only stop for billing, OAuth app setup, or other account/credential steps.
- When a feature ships, update `ROADMAP.md` (move it into the built list) and update the project log below.

## Project log (lives in the user's Obsidian vault)
The current state and session history are in the user's Obsidian note, imported here so they load automatically:

@~/Desktop/Brain/Projects/BridgeMUN.md

**Keep that note updated.** It's how the next session starts without re-reading the codebase. After each meaningful chunk of work (a feature, a fix, a decision), edit `~/Desktop/Brain/Projects/BridgeMUN.md`:
- Rewrite "Current state" so it's accurate. Keep it short.
- Add a dated line to the top of "Session log": what was done, any decision made and why, and what's next. One to three lines per entry, in plain language the user can read.
- When the log gets past ~15 entries, fold the oldest ones into a single summary line.
