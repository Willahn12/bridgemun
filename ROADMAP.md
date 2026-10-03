# BridgeMUN roadmap

Capstone for LognCoding, client: Apas Camp Lapu-Lapu Middle School (Cebu, Philippines). Users are middle-school students, so keep it simple, fast and cheap to run.

## Built
- **Home page:** a loading intro (logo pops up, the motto types itself, the logo flies into the header; plays once per open or reload), then a deck of full-screen scenes that swap instead of scrolling, each with its own entrance and exit. A "Reduce motion" button turns the animations into fades.
- **Speech Studio:** dictation (browser speech API) and read aloud (ElevenLabs Flash, sentence by sentence, with retries).
- **Research assistant:** a briefing for any country, committee and topic (OpenAI).
- **AI delegate modes:** solo, committee (several AI countries), and comp mode "table" (AI listens to the room and speaks when named).
- **AI judge, structured sessions, reports.** A finished session opens on its own page (`/report/[id]`) with the report, an AI coach and the full transcript. Unsaved sessions still get a report page for that tab.
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
- Rules of procedure: speakers' list, moderated caucus, motions, voting.
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
