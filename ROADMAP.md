# BridgeMUN roadmap

Capstone for LognCoding, client: Apas Camp Lapu-Lapu Middle School (Cebu, Philippines). Users are middle-school students, so keep it simple, fast and cheap to run.

## Today (2026-10-17): client checklist (`~/Downloads/MUN_list.pdf`)
"Forum" in the checklist means an online room (`lib/rooms.ts`, `app/room/`). Items 2, 3, 4 and 6 are built and were tested end to end on 2026-10-17 with two accounts (host on `host.localhost:3000`, delegate on `delegate.localhost:3000`; each `*.localhost` subdomain keeps its own login). Also tested: joining a private forum by code, and a person taking their turn (speech sent, judge acknowledges, input locks again). Scheduled auto-start and the forum ending by itself on time were tested on 2026-10-24 (emulators, two accounts): it went live at the set minute from the host's tab, a person took a turn, a missed turn moved on by itself, and at the end time closing statements, adjournment and the report followed.

1. **Login / sign up with Firebase.** Built earlier. Re-check it still works.
2. **Forum creation form** (`app/room/page.tsx`): topic, optional subtopic, start "when I'm ready" or at a set date/time (auto-starts from the host's tab), 30 or 60 minutes, 5 to 30 country seats with an AI on/off toggle per seat, and the host takes a seat or moderates only. Stored on the room doc as `subtopic`, `starts_at`, `duration_min`, `seats` (`ai_countries` kept in sync).
3. **Joining:** public list and join-by-code show "N / M joined", countries, AI and open counts, and you pick from the open seats. Needs the new rule that makes `rooms/*/members` readable by any signed-in user.
4. **Live layout change (user request, 2026-10-17):** the full delegations grid and AI ON/OFF cards show only in the lobby. Once live they collapse into a slim strip of round flag bubbles at the top; the country speaking gets a pulsing green ring, AI seats a small robot badge, empty seats are faded, and your own seat a blue dot. The host can click an empty bubble to switch its AI on or off. The transcript moves to the middle and the moderator panel to the right.
4b. **Live forum screen** (`app/room/[id]/page.tsx`): agenda bar with On air badge, big remaining-time countdown (forum ends on time; debate rounds repeat until it's time for closing statements), floor tile showing who's speaking, moderator panel (floor voting, active speaker, empty countries with AI ON/OFF that also works mid-session, End forum session), delegations grid with flags and status, transcript and speaking box on the right. Floor voting: the host opens a vote on a question; people vote for/against/abstain, the AI delegations vote by themselves, and the host closes it and the result is announced. Ballots go in `rooms/*/ballots`.
4c. **Voices (user request, 2026-10-17):** each person picks one of 4 AI voices (`lib/voices.ts`, preview button) in the lobby and can change it in the speech box; their typed or dictated speeches are read to the room in that voice. A toggle switches to "My own voice": Unmute records them (with live captions), Mute stops, Send shares the real recording. Recordings are kept in Firestore (`rooms/*/clips`, base64, 24 kbps so a 2-minute turn stays under the 1 MB document limit) since Storage needs the paid plan. Not live audio: others hear it after the turn; true live talking comes with Zoom.
4e. **Talk live (user request, 2026-10-17):** a third speaking mode next to "AI voice" and "Record". Go live sends the microphone to every other member over WebRTC (`lib/liveAudio.ts`; Firestore `rooms/*/rtc` carries one offer/answer per speaker-listener pair, Google STUN, no TURN server), captions fill the box as you talk, and "End and send" posts the captions as the speech with `live: true` so nobody hears it read out again. Listeners see a "Live voice" badge in the floor tile. Strict networks that block peer-to-peer will need Zoom (or a TURN server). `rtc` rule published 2026-10-17 11:53 PM. Tested: the host heard the delegate live. Pause/Resume not yet tested.
4f. **Notes, pause, robustness (2026-10-17/18):** a private "My notes" panel under the moderator panel (`components/NotesPanel.tsx`, localStorage per forum) with Notes and "Next speech prep" tabs (word count, estimated time vs your limit, "Put in speech box" on your turn). Talk live can be paused and resumed (mutes the mic track, keeps the connection). Empty seats are hidden from delegates once live (host still sees them to switch AI on). The judge announces the real opening time. Host watchdog restarts the forum engine if it stops; the live-audio listener retries after errors. Learned in testing: a hot reload stops the host's engine (now self-healing) and a Firestore listener that errors stays dead unless restarted.
4d. **Timing (user request, 2026-10-17):** the create form has "Allow late joining" (late joiners pick an open seat and go to the end of the speaking order; public live forums with it stay listed) and four end options: 30 min, 60 min, at a set time, or no end time. At the start the time is split equally across the countries (`splitTime` in `lib/rooms.ts`: 15% kept for the judge, openings get a quarter more), and each delegate gets a pop-up with their opening, debate and closing times. A ring countdown sits in the corner during your turn. AI delegates write speeches sized to the slot, and any speech read by an AI voice speeds up a little (max 1.3x) when it would run over. Tested: late join, pop-up, corner timer, voice change. Not yet tested: the "at a set time" end option and the own-voice recording (needs the clips rule published).
5. **Live audio and video: LiveKit (replaced Zoom on 2026-10-18).** Zoom worked (keys added, host joined video), but its embedded meeting can't stop people unmuting out of turn or hide Share/Leave without a Zoom host, and free meetings stop at 40 minutes, so it was removed (it is in commit e98a97c's history). LiveKit Cloud's free Build plan (about 5,000 participant-minutes a month, hard cap, no charges) replaces it. How it works: `lib/useLiveStage.ts` connects everyone to the LiveKit room `forum-{id}` only while a person has the floor (`turn_user`), and disconnects when the turn ends, so AI speeches cost no minutes. `/api/livekit/token` checks the caller's Firebase ID token, reads the room and their member doc through Firestore's REST API as that user (`lib/serverAuth.ts`), and only gives the current `turn_user` permission to publish (microphone and camera); everyone else can only subscribe. Talk live gains a Camera on/off button; the speaker's camera shows in the floor tile. Without LiveKit keys, Talk live falls back to the direct browser-to-browser audio (`lib/liveAudio.ts`). Keys: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` in `.env.local` via `scripts/setkey.sh`. Keys added. **Tested 2026-10-24** (`scripts/test-livekit-token.mjs`, against the emulators): only the current speaker gets publish rights (mic + camera), listeners subscribe only, non-members/signed-out/non-live forums are refused, and LiveKit Cloud accepts the keys. Still to try by hand: two people actually hearing and seeing each other (needs real mics/cameras).
6. **Country dropdown with flags** (`components/CountryInput.tsx`), added by request: typing "un" lists United Arab Emirates, United Kingdom and United States with flags; arrow keys and Enter pick. Used in practice setup (your country and AI delegations), Research, and the forum's country list. Tested in the browser.

7. **One account per email (tested 2026-10-24 on the emulator: signing up again with the same email is refused and the page shows "An account with this email already exists. Sign in instead."; still to confirm the console setting).** Signing up again with an email that already has an account must be refused. Firebase Auth should already block this by default, and `components/AuthForm.tsx` already shows "An account with this email already exists. Sign in instead." To do: test it, confirm the Firebase setting "One account per email address" (Authentication → Settings → User account linking) is on, and make sure the error message actually shows on the sign-up page. When Google sign-in is added, make sure it links to the existing email account instead of making a second one.

Fixed during testing: the joined count included a host who only moderates; vote and seat buttons waited for the judge to finish speaking; a moderator saw a speaking box; and the report graded an AI delegation as "the student" when no student had spoken. Now no-student sessions get a short note instead of scores, and every transcript line is labelled student, AI or judge.

Rules: the updated `firestore.rules` (members readable, `ballots`) were published on 2026-10-17. A second update adding `clips` (own-voice recordings) was published at 11:25 PM the same day.

## Testing locally (no real accounts)
`npm run emulators` (Auth + Firestore emulators, data kept in `.emulator-data/`, UI at http://127.0.0.1:4000) and in a second terminal `npm run dev:emu`. Everything goes to a throwaway `demo-bridgemun` project, and the emulators use `firestore.rules`, so rule changes can be tried before publishing. Test logins are in `.env.local` (`TEST_HOST_*`, `TEST_DELEGATE_*`). Checks: `node scripts/test-livekit-token.mjs`, `node --experimental-strip-types scripts/test-motions.ts`.

## Built
- **Home page:** a loading intro (logo pops up, the motto types itself, the logo flies into the header; plays once per open or reload), then a deck of full-screen scenes that swap instead of scrolling, each with its own entrance and exit. A "Reduce motion" button turns the animations into fades.
- **Speech Studio:** dictation (browser speech API) and read aloud (ElevenLabs Flash, sentence by sentence, with retries).
- **Research assistant:** a briefing for any country, committee and topic (OpenAI).
- **AI delegate modes:** solo, committee (several AI countries), and comp mode "table" (AI listens to the room and speaks when named).
- **AI judge, structured sessions, reports.** A finished session opens on its own page (`/report/[id]`) with the report, an AI coach and the full transcript. Unsaved sessions still get a report page for that tab.
- **Motion system (practice sessions with a judge, `lib/motions.ts`):** "Raise a motion" opens the floor. Four motions, each with its own inputs and conditions: moderated caucus (topic, total minutes, seconds per speaker), unmoderated caucus (minutes; informal talk that does not count against debate time), extend debate (extra speeches, only when 3 or fewer remain, at most twice) and close debate (human only, after two speeches). Motions are voted on most-disruptive first (close, unmod, mod, extend), then longer caucus first, then human before AI, then earliest; the first to pass is carried out and the rest fall. **Tested in the browser 2026-10-24:** AI suggestion + seconding, human motion, vote order (unmod before mod), unmod caucus countdown with motions locked, end caucus early, close debate locked until two speeches then voted down. The debate phase is now labelled "General debate" (it said "Moderated caucus", which clashed with the motion). Rule checks: `scripts/test-motions.ts`. The judge rules motions out of order. AI delegations may suggest one motion per round, must be seconded by the human, sit out the round after one they moved in, get at most three per session, and can never move to close debate.
- **Points (practice sessions with a judge, `lib/points.ts`, `components/delegate/PointPanel.tsx`), added 2026-10-24:** "Raise a point" during general debate. Point of information: pick a delegation and ask a short question; the judge gives it the floor and it answers in 25 to 60 words from its real position. Point of order: the judge rules it "well taken" or "not well taken" (a point about content is ruled out kindly, with a pointer to a point of information or a speech). Point of parliamentary inquiry: the judge answers a procedure question. Points are not speeches, so they do not count against debate time or in the report's speech count. Tested in the browser.
- **Draft resolution and voting procedure (practice sessions with a judge, `components/delegate/ResolutionPanel.tsx`), added 2026-10-24:** after speaking once, the student can introduce one draft resolution (title + 1 to 8 operative clauses, one per line; typed numbering is tidied away). The judge acknowledges it and the AI delegations respond. After closing statements the committee moves into voting procedure: the student votes for, against or abstain on a ballot showing the clauses, each AI delegation votes by national interest with a reason, and it passes on more votes for than against. The result is saved with the session (`procedure.resolution.result`) and shown under the title. Tested in the browser (adopted 3 to 0).
- **Speakers' list (committee practice, general debate), added 2026-10-24:** after opening statements the AI delegations go on the list in the drawn order, shown as chips above the speech box with the next speaker highlighted. "Next speaker: X" (replacing "Let them debate" outside caucuses) has the chair recognize X from the list; X speaks once and rejoins the end. The student can "Add me" / "Remove me"; when they reach the top, "Next speaker" locks with "You are next: give your speech", and speaking in general debate takes them off the list. Stored as `procedure.speakers`. Tested in the browser.
- **Coach:** written about the student's own speeches: what to fix first, one line rewritten stronger, better diplomatic phrasing, drills and topics to study.
- **Accounts (Firebase email and password):** sign in, register, forgot password and reset password. The header shows the person's name with a small menu once signed in.
- **Past chats (`/history`):** every saved session, split into Practice and Online rooms, with scores. Online rooms keep a copy in each member's own account.
- **Organizations:** create or join by invite code, roles (admin, teacher, student), member management.
- **Classroom:** assignments with due dates, hand-in of finished sessions, teacher review, "Coming up" reminders, live chat.
- **Online rooms:** several people join one session from their own accounts with AI delegates and an AI judge. Turns run automatically and the input locks when it is not your turn. Rooms are private (join with a code) or public (listed under Find a room). The Speak menu offers speech to text or a recording that the rest of the room hears after the judge acknowledges the speaker.
- **Design:** white and light blue with bright accents; every page has its own colour and picture.

## Backend: Firebase (migrated from Supabase on 2026-10-03)
Moved off Supabase because the free-tier project paused from inactivity and the capstone
requirement is Firebase. Project: `bridgemun-capstone` (console.firebase.google.com). Auth is
Firebase Authentication (email/password). Data lives in Firestore: `users`, `organizations`,
`memberships`, `sessions`, `assignments`, `submissions`, `channels`, `messages`, and `rooms`
(with `members` and `lines` subcollections — these three keep the old Postgres column names in
snake_case on purpose, see the comment in `lib/rooms.ts`). Security rules are in
`firestore.rules` at the repo root and are also the live rules in the Firebase console; redeploy
by pasting the file's contents into Firestore → Rules → publish (or wire up the Firebase CLI).
The config in `.env.local` (`NEXT_PUBLIC_FIREBASE_*`) matches that project.

Firestore list queries only allow security rules Firestore can prove safe from the query's own
filters — a few collections (`organizations`, `assignments`, `submissions`) ended up with open
`allow read: if signedIn()` rules because the app's query shapes (lookup by invite code, `in`
queries) aren't provable with a get()-based membership check. None of these expose anything
more sensitive than names, titles and due dates; real content (session transcripts, reports,
room chat) stays properly scoped. Mirrors the `rooms` collection's existing trust model, where
any signed-in user can read a room's basic state because its code is the actual secret.

## Needs a person (cannot be done from the code)
- Firebase Storage is not set up (needs the paid Blaze plan). Voice recordings in online rooms
  are disabled until it's turned on — `uploadClip`/`clipUrl` in `lib/rooms.ts` just throw, and
  the UI already falls back to text-only speech gracefully.
- Password reset works today (Firebase handles the email + link to `/reset-password`), but if
  the project moves to a custom domain, the Firebase Auth authorized domains list needs that
  domain added.
- Google sign-in: create a Google OAuth client and switch the provider on in Firebase
  Authentication → Sign-in method.
- Emailed assignment reminders: Firebase doesn't send these on its own; would need a Cloud
  Function (needs Blaze) or an external email service called from the client.
- The school deployment should set a billing budget alert if upgrading to Blaze for Storage,
  since it's pay-as-you-go (though it has a generous free quota before any charge).

## Later
- Country dataset and retrieval (from the SDG content task from Scott) so AI delegates hold accurate positions.
- Rules of procedure in online rooms: motions, points, draft resolutions and the speakers' list are built for practice sessions only so far.
- Room visibility for "my class only", using organizations.
- Streamed AI replies for lower latency.
- Cleaning up voice recordings when a room is deleted (once Storage is on).
- Testing online rooms with two real accounts end to end.
- Composite Firestore indexes: none were needed yet since most queries are sorted client-side
  on purpose (classroom scale), but revisit if a collection grows large.
- Save research briefings. Right now `/research` (`app/research/page.tsx`) is stateless: the
  brief only lives in that tab and is gone on reload or navigation. Needs a `research` (or
  similar) Firestore collection, a save action, and a way to browse past briefings, likely
  alongside Past chats.
- Make the research feature more complex and better. Today it's one `/api/research` call that
  returns a single markdown brief (country's position, red lines, allies, fact-check pointers).
  Scope out what "better" means: more structured/sourced output, follow-up questions, citations,
  per-topic depth, tying into the country dataset item above, etc.
- Shared/collaborative research: a research page that more than one person (people you add) can
  add to and keep building on together, instead of one person's private briefing. Depends on
  research briefings being saved first (see above) and probably reuses the organizations/roles
  model, or a simpler per-document invite list.
- Friends chat, separate from organization/classroom chat: message people you've friended on the
  site directly. Needs a friends/contacts concept (not just shared orgs). In a DM you can send:
  a plain text message, a summary of one of your practice chats, a saved research briefing, and
  your AI delegate session score/report. Each of those is a different payload type in the same
  thread, so the message model needs to support more than plain text (e.g. a `kind` field with
  a reference to the shared session/research doc, rendered as a card in the thread).
