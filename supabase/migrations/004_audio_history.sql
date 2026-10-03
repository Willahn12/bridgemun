-- Voice recordings in online rooms, plus where a saved session came from.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

-- A line can carry a recording, and the judge's acknowledgement points at the line it introduces.
alter table room_lines add column if not exists audio_path text;
alter table room_lines add column if not exists ref_id uuid;

-- Lets the History page tell practice sessions from online rooms.
alter table sessions add column if not exists source text not null default 'practice';

-- Private bucket for recordings. Files live at <room id>/<user id>/<file>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('room-audio', 'room-audio', false, 8388608, array['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists room_audio_insert on storage.objects;
create policy room_audio_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'room-audio'
  and (storage.foldername(name))[2] = auth.uid()::text
  and is_room_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists room_audio_read on storage.objects;
create policy room_audio_read on storage.objects for select to authenticated using (
  bucket_id = 'room-audio'
  and is_room_member(((storage.foldername(name))[1])::uuid)
);
