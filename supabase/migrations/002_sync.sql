-- English Quest – migration 002: syncing between devices (phases 4–5)
--
-- Run once in the Supabase dashboard: SQL Editor → New query → paste this file → Run.
-- Safe to run again. New projects: run supabase/schema.sql first, then this file.
--
-- 1. synced_at: the server's own time of the last write to every row, so each device can
--    ask only for rows that changed since its last sync (device clocks are not trusted).
-- 2. code_key: keeps a child's sign-in code valid if the child gets a new id when two
--    devices' children are combined.
-- 3. Guards: a child or family update must carry a higher version than what is stored
--    (so a device that missed another device's change has to merge first), and a wish's
--    status can only move forward (pending → approved/declined → fulfilled).

alter table public.families            add column if not exists synced_at timestamptz not null default now();
alter table public.children            add column if not exists synced_at timestamptz not null default now();
alter table public.children            add column if not exists code_key  text;
alter table public.ticket_transactions add column if not exists synced_at timestamptz not null default now();
alter table public.attempts            add column if not exists synced_at timestamptz not null default now();
alter table public.reward_requests     add column if not exists synced_at timestamptz not null default now();

create index if not exists families_synced  on public.families (id, synced_at);
create index if not exists children_synced  on public.children (family_id, synced_at);
create index if not exists tickets_synced   on public.ticket_transactions (family_id, synced_at);
create index if not exists attempts_synced  on public.attempts (family_id, synced_at);
create index if not exists requests_synced  on public.reward_requests (family_id, synced_at);

create or replace function public.eq_touch_synced_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

create or replace function public.eq_rev_must_grow()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Marking a child as removed does not need a new version; every other change does.
  if tg_table_name = 'children' and new.deleted_at is distinct from old.deleted_at and new.rev = old.rev then
    return new;
  end if;
  if new.rev <= old.rev then
    raise exception 'stale_rev' using errcode = 'P0001', hint = 'Another device changed this first; pull and merge, then retry.';
  end if;
  return new;
end;
$$;

create or replace function public.eq_status_forward()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  rank_old int := case old.status when 'pending' then 0 when 'approved' then 1 when 'declined' then 1 else 2 end;
  rank_new int := case new.status when 'pending' then 0 when 'approved' then 1 when 'declined' then 1 else 2 end;
begin
  if rank_new < rank_old or (rank_new = rank_old and new.status <> old.status) then
    -- Keep the more advanced (or first-decided) status; ignore the older copy.
    new.status := old.status;
    new.data := old.data;
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['families', 'children', 'ticket_transactions', 'attempts', 'reward_requests'] loop
    execute format('drop trigger if exists eq_synced_at on public.%I', t);
    execute format('create trigger eq_synced_at before insert or update on public.%I for each row execute function public.eq_touch_synced_at()', t);
  end loop;
end;
$$;

drop trigger if exists eq_family_rev on public.families;
create trigger eq_family_rev before update of rev, pin_hash, pin_salt, rewards on public.families
  for each row execute function public.eq_rev_must_grow();

drop trigger if exists eq_child_rev on public.children;
create trigger eq_child_rev before update on public.children
  for each row execute function public.eq_rev_must_grow();

drop trigger if exists eq_request_forward on public.reward_requests;
create trigger eq_request_forward before update on public.reward_requests
  for each row execute function public.eq_status_forward();

revoke execute on function public.eq_touch_synced_at(), public.eq_rev_must_grow(), public.eq_status_forward() from public, anon, authenticated;
