# BridgeMUN roadmap

Capstone for LognCoding, client: Apas Camp Lapu-Lapu Middle School (Cebu, Philippines). Users are middle-school students, so keep it simple, fast and cheap to run.

## Today (2026-10-17): client checklist (`~/Downloads/MUN_list.pdf`)
"Forum" in the checklist means an online room (`lib/rooms.ts`, `app/room/`). Items 2, 3, 4 and 6 are built and were tested end to end on 2026-10-17 with two accounts (host on `host.localhost:3000`, delegate on `delegate.localhost:3000`; each `*.localhost` subdomain keeps its own login). Also tested: joining a private forum by code, and a person taking their turn (speech sent, judge acknowledges, input locks again). Not yet seen in a test: a scheduled auto-start, and the forum ending by itself when time runs out.

1. **Login / sign up with Firebase.** Built earlier. Re-check it still works.
2. **Forum creation form** (`app/room/page.tsx`): topic, optional subtopic, start "when I'm ready" or at a set date/time (auto-starts from the host's tab), 30 or 60 minutes, 5 to 30 country seats with an AI on/off toggle per seat, and the host takes a seat or moderates only. Stored on the room doc as `subtopic`, `starts_at`, `duration_min`, `seats` (`ai_countries` kept in sync).
3. **Joining:** public list and join-by-code show "N / M joined", countries, AI and open counts, and you pick from the open seats. Needs the new rule that makes `rooms/*/members` readable by any signed-in user.
4. **Live layout change (user request, 2026-10-17):** the full delegations grid and AI ON/OFF cards show only in the lobby. Once live they collapse into a slim strip of round flag bubbles at the top; the country speaking gets a pulsing green ring, AI seats a small robot badge, empty seats are faded, and your own seat a blue dot. The host can click an empty bubble to switch its AI on or off. The transcript moves to the middle and the moderator panel to the right.
4b. **Live forum screen** (`app/room/[id]/page.tsx`): agenda bar with On air badge, big remaining-time countdown (forum ends on time; debate rounds repeat until it's time for closing statements), floor tile showing who's speaking, moderator panel (floor voting, active speaker, empty countries with AI ON/OFF that also works mid-session, End forum session), delegations grid with flags and status, transcript and speaking box on the right. Floor voting: the host opens a vote on a question; people vote for/against/abstain, the AI delegations vote by themselves, and the host closes it and the result is announced. Ballots go in `rooms/*/ballots`.
4c. **Voices (user request, 2026-10-17):** each person picks one of 4 AI voices (`lib/voices.ts`, preview button) in the lobby and can change it in the speech box; their typed or dictated speeches are read to the room in that voice. A toggle switches to "My own voice": Unmute records them (with live captions), Mute stops, Send shares the real recording. Recordings are kept in Firestore (`rooms/*/clips`, base64, 24 kbps so a 2-minute turn stays under the 1 MB document limit) since Storage needs the paid plan. Not live audio: others hear it after the turn; true live talking comes with Zoom.
4d. **Timing (user request, 2026-10-17):** the create form has "Allow late joining" (late joiners pick an open seat and go to the end of the speaking order; public live forums with it stay listed) and four end options: 30 min, 60 min, at a set time, or no end time. At the start the time is split equally across the countries (`splitTime` in `lib/rooms.ts`: 15% kept for the judge, openings get a quarter more), and each delegate gets a pop-up with their opening, debate and closing times. A ring countdown sits in the corner during your turn. AI delegates write speeches sized to the slot, and any speech read by an AI voice speeds up a little (max 1.3x) when it would run over. Tested: late join, pop-up, corner timer, voice change. Not yet tested: the "at a set time" end option and the own-voice recording (needs the clips rule published).
5. **Zoom video in the forum page.** Code is built; it switches on when the keys are in `.env.local` (`ZOOM_SDK_KEY`, `ZOOM_SDK_SECRET` from a Meeting SDK "General App"; `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` from a Server-to-Server OAuth app with the `meeting:write:meeting:admin` scope). How it works: when the host starts a forum, `/api/zoom/meeting` makes an instant meeting (join before host, no waiting room, muted on entry) and stores it on the room as `zoom`; the host also gets a "Start video" button to retry. In the dark floor tile everyone sees "Join video and audio"; that loads `public/zoom-embed.html` in an iframe, which runs Zoom's Meeting SDK 6.5.0 with React 18 from Zoom's CDN (the npm package needs React 18 exactly and the app is on React 19). `/api/zoom/signature` signs the join token. Both routes check the caller's Firebase ID token. Without keys both answer 501 and the forum runs as before. Tested so far: the routes without keys, and the SDK loading in the embed page. Not tested: a real meeting. **Free Zoom accounts end meetings with 3+ people after 40 minutes.**
6. **Country dropdown with flags** (`components/CountryInput.tsx`), added by request: typing "un" lists United Arab Emirates, United Kingdom and United States with flags; arrow keys and Enter pick. Used in practice setup (your country and AI delegations), Research, and the forum's country list. Tested in the browser.

7. **One account per email (to do, not started).** Signing up again with an email that already has an account must be refused. Firebase Auth should already block this by default, and `components/AuthForm.tsx` already shows "An account with this email already exists. Sign in instead." To do: test it, confirm the Firebase setting "One account per email address" (Authentication → Settings → User account linking) is on, and make sure the error message actually shows on the sign-up page. When Google sign-in is added, make sure it links to the existing email account instead of making a second one.

Fixed during testing: the joined count included a host who only moderates; vote and seat buttons waited for the judge to finish speaking; a moderator saw a speaking box; and the report graded an AI delegation as "the student" when no student had spoken. Now no-student sessions get a short note instead of scores, and every transcript line is labelled student, AI or judge.

Rules: the updated `firestore.rules` (members readable, `ballots`) were published on 2026-10-17. A second update adding `clips` (own-voice recordings) was published at 11:25 PM the same day.

## Built
- **Home page:** a loading intro (logo pops up, the motto types itself, the logo flies into the header; plays once per open or reload), then a deck of full-screen scenes that swap instead of scrolling, each with its own entrance and exit. A "Reduce motion" button turns the animations into fades.
- **Speech Studio:** dictation (browser speech API) and read aloud (ElevenLabs Flash, sentence by sentence, with retries).
- **Research assistant:** a briefing for any country, committee and topic (OpenAI).
- **AI delegate modes:** solo, committee (several AI countries), and comp mode "table" (AI listens to the room and speaks when named).
- **AI judge, structured sessions, reports.** A finished session opens on its own page (`/report/[id]`) with the report, an AI coach and the full transcript. Unsaved sessions still get a report page for that tab.
- **Motion system (practice sessions with a judge, `lib/motions.ts`):** "Raise a motion" opens the floor. Four motions, each with its own inputs and conditions: moderated caucus (topic, total minutes, seconds per speaker), unmoderated caucus (minutes; informal talk that does not count against debate time), extend debate (extra speeches, only when 3 or fewer remain, at most twice) and close debate (human only, after two speeches). Motions are voted on most-disruptive first (close, unmod, mod, extend), then longer caucus first, then human before AI, then earliest; the first to pass is carried out and the rest fall. The judge rules motions out of order. AI delegations may suggest one motion per round, must be seconded by the human, sit out the round after one they moved in, get at most three per session, and can never move to close debate.
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
- Rules of procedure still missing: a formal speakers' list, points of order raised by delegates, and voting on draft resolutions. Motions are built for practice sessions but not yet for online rooms.
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
