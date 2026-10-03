# BridgeMUN roadmap

Capstone for LognCoding, client: Apas Camp Lapu-Lapu Middle School (Cebu, Philippines). Users are middle-school students, so keep it simple, fast and cheap to run.

## Built
- **Home page:** a loading intro (logo pops up, the motto types itself, the logo flies into the header; plays once per open or reload), then a deck of full-screen scenes that swap instead of scrolling, each with its own entrance and exit. A "Reduce motion" button turns the animations into fades.
- **Speech Studio:** dictation (browser speech API) and read aloud (ElevenLabs Flash, sentence by sentence, with retries).
- **Research assistant:** a briefing for any country, committee and topic (OpenAI).
- **AI delegate modes:** solo, committee (several AI countries), and comp mode "table" (AI listens to the room and speaks when named).
- **AI judge, structured sessions, reports.** A finished session opens on its own page (`/report/[id]`) with the report, an AI coach and the full transcript. Unsaved sessions still get a report page for that tab.
- **Coach:** written about the student's own speeches: what to fix first, one line rewritten stronger, better diplomatic phrasing, drills and topics to study.
- **Accounts (Supabase email and password):** sign in, register, forgot password and reset password. The header shows the person's name with a small menu once signed in.
- **Past chats (`/history`):** every saved session, split into Practice and Online rooms, with scores. Online rooms keep a copy in each member's own account.
- **Organizations:** create or join by invite code, roles (admin, teacher, student), member management.
- **Classroom:** assignments with due dates, hand-in of finished sessions, teacher review, "Coming up" reminders, live chat.
- **Online rooms:** several people join one session from their own accounts with AI delegates and an AI judge. Turns run automatically and the input locks when it is not your turn. Rooms are private (join with a code) or public (listed under Find a room). The Speak menu offers speech to text or a recording that the rest of the room hears after the judge acknowledges the speaker.
- **Design:** white and light blue with bright accents; every page has its own colour and picture.

## Needs a person (cannot be done from the code)
- Run `supabase/migrations/004_audio_history.sql` and `005_public_rooms.sql` in the Supabase SQL editor (002 and 003 are already run).
- Password reset: add `http://localhost:3000/reset-password` (and the real site address later) to Authentication, URL Configuration, Redirect URLs in Supabase.
- Google sign-in: create a Google OAuth client and switch the provider on in Supabase.
- Emailed reminders and reset emails at school scale: set up custom SMTP in Supabase (the built-in sender is heavily rate limited).
- The school deployment should use the paid Supabase tier: the free tier pauses after about a week of inactivity.
- Nothing is committed to git yet.

## Later
- Country dataset and retrieval (from the SDG content task from Scott) so AI delegates hold accurate positions.
- Rules of procedure: speakers' list, moderated caucus, motions, voting.
- Room visibility for "my class only", using organizations.
- Streamed AI replies for lower latency.
- Cleaning up voice recordings when a room is deleted.
- Testing online rooms with two real accounts end to end.
