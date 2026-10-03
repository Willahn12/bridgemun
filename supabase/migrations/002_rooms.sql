-- BridgeMUN online rooms: several people join one session from their own accounts.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Requires supabase/schema.sql to have been run first.

-- ---------- Tables ----------
create table rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)),
  host_id uuid not null references profiles (id),
  committee text not null check (char_length(committee) between 2 and 200),
  topic text not null check (char_length(topic) between 2 and 200),
  ai_country text not null check (char_length(ai_country) between 2 and 100),
  judge boolean not null default true,
  status text not null default 'lobby' check (status in ('lobby', 'live', 'ended')),
  report jsonb,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table room_members (
  room_id uuid not null references rooms on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  country text not null default '' check (char_length(country) <= 100),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index room_members_user_idx on room_members (user_id);

create table room_lines (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms on delete cascade,
  user_id uuid references profiles on delete set null,
  speaker text not null check (char_length(speaker) between 1 and 100),
  kind text not null check (kind in ('human', 'ai', 'chair')),
  text text not null check (char_length(text) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index room_lines_room_idx on room_lines (room_id, created_at);

-- ---------- Helper functions ----------
create function is_room_member(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from room_members where room_id = r and user_id = auth.uid())
$$;

create function is_room_host(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from rooms where id = r and host_id = auth.uid())
$$;

-- Creating a room makes you its host and its first member.
create function create_room(
  p_committee text, p_topic text, p_ai_country text, p_judge boolean, p_country text
) returns rooms
language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into rooms (host_id, committee, topic, ai_country, judge)
  values (auth.uid(), trim(p_committee), trim(p_topic), trim(p_ai_country), coalesce(p_judge, true))
  returning * into r;
  insert into room_members (room_id, user_id, country) values (r.id, auth.uid(), left(trim(coalesce(p_country, '')), 100));
  return r;
end $$;

-- Joining with the room code.
create function join_room(p_code text, p_country text) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid; st text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select id, status into rid, st from rooms where code = upper(trim(p_code));
  if rid is null then raise exception 'Invalid room code'; end if;
  if st = 'ended' then raise exception 'This session has ended'; end if;
  insert into room_members (room_id, user_id, country)
  values (rid, auth.uid(), left(trim(coalesce(p_country, '')), 100))
  on conflict (room_id, user_id) do update set country = excluded.country;
  return rid;
end $$;

-- ---------- Row Level Security ----------
alter table rooms enable row level security;
alter table room_members enable row level security;
alter table room_lines enable row level security;

-- rooms: members read; only the host changes or deletes. Creating and joining go through the functions.
create policy rooms_read on rooms for select using (is_room_member(id) or host_id = auth.uid());
create policy rooms_update on rooms for update using (host_id = auth.uid());
create policy rooms_delete on rooms for delete using (host_id = auth.uid());

-- members: everyone in the room sees who is there; you edit or leave your own row; the host can remove people
create policy room_members_read on room_members for select using (is_room_member(room_id));
create policy room_members_update on room_members for update using (user_id = auth.uid());
create policy room_members_delete on room_members for delete using (user_id = auth.uid() or is_room_host(room_id));

-- lines: members read. People post their own speeches; only the host posts AI and judge lines.
create policy room_lines_read on room_lines for select using (is_room_member(room_id));
create policy room_lines_insert on room_lines for insert with check (
  is_room_member(room_id)
  and (
    (kind = 'human' and user_id = auth.uid())
    or (kind in ('ai', 'chair') and is_room_host(room_id))
  )
);
create policy room_lines_delete on room_lines for delete using (is_room_host(room_id));

-- ---------- Live updates ----------
alter publication supabase_realtime add table rooms, room_members, room_lines;
