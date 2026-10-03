-- Online rooms, part 2: several AI delegations, unique countries, and automatic turn taking.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Requires 002_rooms.sql to have been run first.

-- ---------- New columns ----------
alter table rooms add column if not exists ai_countries text[] not null default '{}';
alter table rooms add column if not exists phase text not null default 'lobby'
  check (phase in ('lobby', 'opening', 'debate', 'closing'));
alter table rooms add column if not exists turn_order jsonb not null default '[]';
alter table rooms add column if not exists cursor int not null default 0;
alter table rooms add column if not exists turn_user uuid references profiles (id) on delete set null;
alter table rooms add column if not exists turn_deadline timestamptz;

update rooms set ai_countries = array[ai_country] where ai_countries = '{}';

-- ---------- No two people may represent the same country ----------
-- Country is now only ever set through join_room / create_room, so drop the direct edit policy.
drop policy if exists room_members_update on room_members;
create unique index if not exists room_members_country_uniq
  on room_members (room_id, lower(country)) where country <> '';

-- ---------- Creating a room: several AI delegations ----------
drop function if exists create_room(text, text, text, boolean, text);

create function create_room(
  p_committee text, p_topic text, p_ai_countries text[], p_judge boolean, p_country text
) returns rooms
language plpgsql security definer set search_path = public as $$
declare
  r rooms;
  ais text[];
  me text := left(trim(coalesce(p_country, '')), 100);
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;

  select coalesce(array_agg(left(trim(c), 100)), '{}') into ais
  from unnest(p_ai_countries) as c where char_length(trim(c)) >= 2;

  if coalesce(array_length(ais, 1), 0) < 1 or array_length(ais, 1) > 4 then
    raise exception 'Choose between 1 and 4 AI countries';
  end if;
  if (select count(distinct lower(x)) from unnest(ais) x) <> array_length(ais, 1) then
    raise exception 'Country taken: the AI countries must be different';
  end if;
  if me <> '' and lower(me) in (select lower(x) from unnest(ais) x) then
    raise exception 'Country taken: an AI delegate already represents that country';
  end if;

  insert into rooms (host_id, committee, topic, ai_country, ai_countries, judge)
  values (auth.uid(), trim(p_committee), trim(p_topic), ais[1], ais, coalesce(p_judge, true))
  returning * into r;
  insert into room_members (room_id, user_id, country) values (r.id, auth.uid(), me);
  return r;
end $$;

-- ---------- Joining: the country must be free, and the session must not have started ----------
create or replace function join_room(p_code text, p_country text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  rid uuid; st text; ais text[];
  me text := left(trim(coalesce(p_country, '')), 100);
  already boolean;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select id, status, ai_countries into rid, st, ais from rooms where code = upper(trim(p_code));
  if rid is null then raise exception 'Invalid room code'; end if;
  if st = 'ended' then raise exception 'This session has ended'; end if;

  select exists (select 1 from room_members where room_id = rid and user_id = auth.uid()) into already;
  if already then return rid; end if; -- coming back to a room you are already in
  if st <> 'lobby' then raise exception 'This session has already started'; end if;

  if me <> '' then
    if lower(me) in (select lower(x) from unnest(ais) x)
       or exists (select 1 from room_members where room_id = rid and lower(country) = lower(me)) then
      raise exception 'Country taken: someone in this room already represents that country';
    end if;
  end if;

  insert into room_members (room_id, user_id, country) values (rid, auth.uid(), me);
  return rid;
end $$;

-- ---------- Only the person whose turn it is may speak ----------
drop policy if exists room_lines_insert on room_lines;
create policy room_lines_insert on room_lines for insert with check (
  is_room_member(room_id)
  and (
    (
      kind = 'human'
      and user_id = auth.uid()
      and exists (select 1 from rooms r where r.id = room_id and r.status = 'live' and r.turn_user = auth.uid())
    )
    or (kind in ('ai', 'chair') and is_room_host(room_id))
  )
);
