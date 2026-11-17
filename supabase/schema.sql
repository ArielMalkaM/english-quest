-- English Quest – Supabase schema (phase 1: family accounts and synced data)
--
-- Run once in the Supabase dashboard: SQL Editor → New query → paste this file → Run.
-- It is safe to run again (it only creates what is missing and recreates the policies).
--
-- Model: one parent account (Supabase Auth user, signed up with email) owns one family.
-- A family has shared settings (parent PIN hash, rewards) and several children. Each child's
-- data lives in its own rows so two devices playing for two children never overwrite each other.
-- Ticket transactions and activity attempts are append-only with ids made on the device,
-- so lists from several devices can be combined.

-- ───────────────────────── Tables ─────────────────────────

create table if not exists public.families (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null unique references auth.users (id) on delete cascade,
  pin_hash    text,                                   -- parent PIN (salted hash, never the PIN)
  pin_salt    text,
  rewards     jsonb not null default '[]'::jsonb,     -- shared Wish Board
  ui_lang     text not null default 'he' check (ui_lang in ('he', 'en')),
  rev         bigint not null default 0,              -- version of the shared part
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.children (
  family_id   uuid not null references public.families (id) on delete cascade,
  id          text not null,                          -- child id made by the app
  profile     jsonb not null,                         -- nickname, grade, avatar, daily goal
  settings    jsonb not null,                         -- language, accessibility, ticket rules
  code_hash   text,                                   -- optional 4-digit child code (salted hash)
  progress    jsonb not null,                         -- quest steps, word stats, review queue, badges…
  rev         bigint not null default 0,              -- goes up on every change to this child
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,                            -- removed by the parent (kept so other devices learn about it)
  primary key (family_id, id)
);

create table if not exists public.ticket_transactions (
  family_id   uuid not null,
  child_id    text not null,
  id          text not null,
  at          timestamptz not null,
  amount      integer not null,
  reason      text not null,
  note        text not null default '',
  request_id  text,
  lesson_id   text,
  primary key (family_id, child_id, id),
  foreign key (family_id, child_id) references public.children (family_id, id) on delete cascade
);

create table if not exists public.attempts (
  family_id    uuid not null,
  child_id     text not null,
  id           text not null,
  lesson_id    text not null,
  step         text not null,
  finished_at  timestamptz not null,
  data         jsonb not null,                        -- answers per item, time, writing text
  primary key (family_id, child_id, id),
  foreign key (family_id, child_id) references public.children (family_id, id) on delete cascade
);

create table if not exists public.reward_requests (
  family_id   uuid not null,
  child_id    text not null,
  id          text not null,
  status      text not null check (status in ('pending', 'approved', 'declined', 'fulfilled')),
  data        jsonb not null,                         -- reward copy, cost, dates
  updated_at  timestamptz not null default now(),
  primary key (family_id, child_id, id),
  foreign key (family_id, child_id) references public.children (family_id, id) on delete cascade
);

create index if not exists attempts_child_time on public.attempts (family_id, child_id, finished_at);
create index if not exists tickets_child_time on public.ticket_transactions (family_id, child_id, at);

-- ───────────────────────── A family is created at sign-up ─────────────────────────

create or replace function public.handle_new_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.families (owner_id) values (new.id) on conflict (owner_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_parent();

-- The signed-in parent's family id (used by the security rules below).
create or replace function public.my_family_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.families where owner_id = auth.uid()
$$;

-- ───────────────────────── Security: each family sees only its own rows ─────────────────────────

alter table public.families enable row level security;
alter table public.children enable row level security;
alter table public.ticket_transactions enable row level security;
alter table public.attempts enable row level security;
alter table public.reward_requests enable row level security;

drop policy if exists "own family: read" on public.families;
drop policy if exists "own family: update" on public.families;
drop policy if exists "own family: delete" on public.families;
create policy "own family: read" on public.families for select to authenticated using (owner_id = (select auth.uid()));
create policy "own family: update" on public.families for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "own family: delete" on public.families for delete to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "own children" on public.children;
create policy "own children" on public.children for all to authenticated
  using (family_id = (select public.my_family_id()))
  with check (family_id = (select public.my_family_id()));

-- Tickets and attempts are history: they can be added and read, never edited or deleted by the app.
drop policy if exists "own tickets: read" on public.ticket_transactions;
drop policy if exists "own tickets: add" on public.ticket_transactions;
create policy "own tickets: read" on public.ticket_transactions for select to authenticated using (family_id = (select public.my_family_id()));
create policy "own tickets: add" on public.ticket_transactions for insert to authenticated with check (family_id = (select public.my_family_id()));

drop policy if exists "own attempts: read" on public.attempts;
drop policy if exists "own attempts: add" on public.attempts;
create policy "own attempts: read" on public.attempts for select to authenticated using (family_id = (select public.my_family_id()));
create policy "own attempts: add" on public.attempts for insert to authenticated with check (family_id = (select public.my_family_id()));

drop policy if exists "own requests: read" on public.reward_requests;
drop policy if exists "own requests: add" on public.reward_requests;
drop policy if exists "own requests: update" on public.reward_requests;
create policy "own requests: read" on public.reward_requests for select to authenticated using (family_id = (select public.my_family_id()));
create policy "own requests: add" on public.reward_requests for insert to authenticated with check (family_id = (select public.my_family_id()));
create policy "own requests: update" on public.reward_requests for update to authenticated
  using (family_id = (select public.my_family_id()))
  with check (family_id = (select public.my_family_id()));

-- Explicit table rights: signed-in parents only, nothing for anonymous visitors.
revoke all on public.families, public.children, public.ticket_transactions, public.attempts, public.reward_requests from anon;
grant select, update, delete on public.families to authenticated;
grant select, insert, update, delete on public.children to authenticated;
grant select, insert on public.ticket_transactions, public.attempts to authenticated;
grant select, insert, update on public.reward_requests to authenticated;
revoke execute on function public.handle_new_parent() from public, anon, authenticated;
grant execute on function public.my_family_id() to authenticated;
