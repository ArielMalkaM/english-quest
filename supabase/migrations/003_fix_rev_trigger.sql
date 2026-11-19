-- English Quest – migration 003: fix the version check on the families table
--
-- Run once in the Supabase dashboard: SQL Editor → New query → paste this file → Run.
-- Safe to run again.
--
-- 002_sync.sql checked children.deleted_at inside a trigger that also runs on the families
-- table, which has no such column ("record "new" has no field "deleted_at""), so a family
-- update failed. The check now only looks at deleted_at for the children table.

create or replace function public.eq_rev_must_grow()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'children' then
    -- Marking a child as removed does not need a new version; every other change does.
    if new.deleted_at is distinct from old.deleted_at and new.rev = old.rev then
      return new;
    end if;
  end if;
  if new.rev <= old.rev then
    raise exception 'stale_rev' using errcode = 'P0001', hint = 'Another device changed this first; pull and merge, then retry.';
  end if;
  return new;
end;
$$;

revoke execute on function public.eq_rev_must_grow() from public, anon, authenticated;
