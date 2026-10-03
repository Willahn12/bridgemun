-- BridgeMUN database schema for Supabase (Postgres).
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Covers: profiles, organizations with roles, saved sessions and reports,
-- assignments, and classroom chat. Row Level Security is on for every table.

create extension if not exists pgcrypto;

create type org_role as enum ('admin', 'teacher', 'student');

-- ---------- Profiles (one per login) ----------
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- Organizations and roles ----------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  invite_code text not null unique default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

create table memberships (
  org_id uuid not null references organizations on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  role org_role not null default 'student',
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on memberships (user_id);

create function is_member(o uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where org_id = o and user_id = auth.uid())
$$;

create function is_staff(o uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where org_id = o and user_id = auth.uid() and role in ('admin', 'teacher'))
$$;

create function is_admin(o uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where org_id = o and user_id = auth.uid() and role = 'admin')
$$;

-- Creating an organization makes the creator its admin.
create function create_org(org_name text) returns organizations
language plpgsql security definer set search_path = public as $$
declare o organizations;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into organizations (name, created_by) values (org_name, auth.uid()) returning * into o;
  insert into memberships (org_id, user_id, role) values (o.id, auth.uid(), 'admin');
  return o;
end $$;

-- Joining with an invite code always makes you a student. Admins promote teachers later.
create function join_org(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare oid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select id into oid from organizations where invite_code = upper(trim(code));
  if oid is null then raise exception 'Invalid invite code'; end if;
  insert into memberships (org_id, user_id, role) values (oid, auth.uid(), 'student')
  on conflict do nothing;
  return oid;
end $$;

-- ---------- Saved sessions and reports ----------
create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  org_id uuid references organizations on delete set null,
  mode text not null check (mode in ('solo', 'committee', 'table')),
  committee text not null,
  topic text not null,
  human_country text not null default '',
  ai_countries jsonb not null default '[]',
  judge boolean not null default true,
  speaking_order jsonb not null default '[]',
  cursor int not null default 0,
  phase text not null default 'opening',
  lines jsonb not null default '[]',
  report jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  updated_at timestamptz not null default now()
);
create index sessions_user_idx on sessions (user_id, updated_at desc);
create index sessions_org_idx on sessions (org_id);

-- ---------- Assignments (teachers set them, students hand in a session) ----------
create table assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  created_by uuid not null references profiles,
  title text not null,
  description text not null default '',
  due_at timestamptz,
  created_at timestamptz not null default now()
);
create index assignments_org_idx on assignments (org_id, due_at);

create table submissions (
  assignment_id uuid not null references assignments on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  session_id uuid references sessions on delete set null,
  submitted_at timestamptz not null default now(),
  primary key (assignment_id, user_id)
);

-- ---------- Classroom chat ----------
create table channels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_channel_idx on messages (channel_id, created_at);

-- ---------- Row Level Security ----------
alter table profiles enable row level security;
alter table organizations enable row level security;
alter table memberships enable row level security;
alter table sessions enable row level security;
alter table assignments enable row level security;
alter table submissions enable row level security;
alter table channels enable row level security;
alter table messages enable row level security;

-- profiles: yourself, or people you share an organization with
create policy profiles_read on profiles for select using (
  id = auth.uid() or exists (
    select 1 from memberships a join memberships b on a.org_id = b.org_id
    where a.user_id = auth.uid() and b.user_id = profiles.id)
);
create policy profiles_update on profiles for update using (id = auth.uid());

-- organizations: members read, admins edit. Creation and joining go through the functions above.
create policy orgs_read on organizations for select using (is_member(id));
create policy orgs_update on organizations for update using (is_admin(id));
create policy orgs_delete on organizations for delete using (is_admin(id));

-- memberships: members see the roster, admins change roles, anyone can leave
create policy members_read on memberships for select using (is_member(org_id));
create policy members_update on memberships for update using (is_admin(org_id));
create policy members_delete on memberships for delete using (user_id = auth.uid() or is_admin(org_id));

-- sessions: the owner has full access; teachers can read their organization's sessions
create policy sessions_owner on sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy sessions_staff_read on sessions for select using (org_id is not null and is_staff(org_id));

-- assignments: members read, teachers and admins manage
create policy assignments_read on assignments for select using (is_member(org_id));
create policy assignments_write on assignments for all using (is_staff(org_id)) with check (is_staff(org_id) and created_by = auth.uid());

-- submissions: you see and hand in your own, teachers see the whole class
create policy submissions_read on submissions for select using (
  user_id = auth.uid() or exists (select 1 from assignments a where a.id = assignment_id and is_staff(a.org_id))
);
create policy submissions_write on submissions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from assignments a where a.id = assignment_id and is_member(a.org_id)));

-- channels: members read, teachers create
create policy channels_read on channels for select using (is_member(org_id));
create policy channels_write on channels for all using (is_staff(org_id)) with check (is_staff(org_id));

-- messages: members of the channel's organization read and post as themselves
create policy messages_read on messages for select using (
  exists (select 1 from channels c where c.id = channel_id and is_member(c.org_id))
);
create policy messages_insert on messages for insert with check (
  user_id = auth.uid() and exists (select 1 from channels c where c.id = channel_id and is_member(c.org_id))
);
create policy messages_delete on messages for delete using (
  user_id = auth.uid() or exists (select 1 from channels c where c.id = channel_id and is_staff(c.org_id))
);

-- Live chat updates
alter publication supabase_realtime add table messages;
