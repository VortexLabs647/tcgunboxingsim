create schema if not exists tcg_private;
revoke all on schema tcg_private from public, anon, authenticated;
create table public.leaderboard_entries (
 entry_id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references auth.users(id) on delete cascade,
 display_name text not null check(char_length(display_name) between 1 and 24),
 packs_opened bigint not null check(packs_opened between 0 and 100000000000000),
 spent_cents bigint not null check(spent_cents between 0 and 100000000000000),
 updated_at timestamptz not null default now()
);
alter table public.leaderboard_entries enable row level security;
revoke all on public.leaderboard_entries from public,anon,authenticated;
grant select(entry_id,display_name,packs_opened,spent_cents,updated_at) on public.leaderboard_entries to anon,authenticated;
create policy leaderboard_public_read on public.leaderboard_entries for select to anon,authenticated using(true);
create index leaderboard_opened_order on public.leaderboard_entries(packs_opened desc,spent_cents desc,entry_id);
create index leaderboard_spent_order on public.leaderboard_entries(spent_cents desc,packs_opened desc,entry_id);
create function tcg_private.sync_leaderboard() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare opened bigint; spent bigint; collector text;
begin
 if new.state->'leaderboard' is distinct from 'true'::jsonb then
  delete from public.leaderboard_entries where user_id=new.user_id;return new;
 end if;
 if jsonb_typeof(new.state->'opened') is distinct from 'number' or jsonb_typeof(new.state->'spent') is distinct from 'number' then return new;end if;
 if (new.state->>'opened') !~ '^\d{1,15}$' or (new.state->>'spent') !~ '^\d{1,15}$' then return new;end if;
 opened:=(new.state->>'opened')::bigint;spent:=(new.state->>'spent')::bigint;
 if opened>100000000000000 or spent>100000000000000 then return new;end if;
 collector:=left(coalesce(nullif(btrim(new.state->>'name'),''),'Collector'),24);
 insert into public.leaderboard_entries(user_id,display_name,packs_opened,spent_cents) values(new.user_id,collector,opened,spent)
 on conflict(user_id) do update set display_name=excluded.display_name,packs_opened=excluded.packs_opened,spent_cents=excluded.spent_cents,updated_at=now();
 return new;
end $$;
revoke all on function tcg_private.sync_leaderboard() from public,anon,authenticated;
create trigger sync_tcg_leaderboard after insert or update of state on public.game_saves for each row execute function tcg_private.sync_leaderboard();

-- For the optional public virtual balance column, run leaderboard-balance.sql next.
