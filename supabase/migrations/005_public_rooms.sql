-- Public and private online rooms.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

-- Private is the default: a room is only reachable with its code. A host can make one public.
alter table rooms add column if not exists visibility text not null default 'private';
alter table rooms drop constraint if exists rooms_visibility_check;
alter table rooms add constraint rooms_visibility_check check (visibility in ('public', 'private'));

-- Lists the public rooms that have not started yet, newest first. Signed-in users only.
-- It is a function (not a table policy) so people who are not in a room can see just these few fields.
create or replace function list_public_rooms()
returns table (
  id uuid,
  code text,
  committee text,
  topic text,
  ai_countries text[],
  judge boolean,
  host_name text,
  players int,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    r.id,
    r.code,
    r.committee,
    r.topic,
    case when coalesce(cardinality(r.ai_countries), 0) > 0 then r.ai_countries else array[r.ai_country] end,
    r.judge,
    coalesce(nullif(trim(p.display_name), ''), 'A host'),
    (select count(*)::int from room_members m where m.room_id = r.id),
    r.created_at
  from rooms r
  left join profiles p on p.id = r.host_id
  where auth.uid() is not null
    and r.visibility = 'public'
    and r.status = 'lobby'
    and r.created_at > now() - interval '6 hours'
  order by r.created_at desc
  limit 50;
$$;

revoke all on function list_public_rooms() from public;
grant execute on function list_public_rooms() to authenticated;
