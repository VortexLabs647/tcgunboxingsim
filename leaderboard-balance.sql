alter table public.leaderboard_entries
 add column if not exists balance_cents bigint
 check (balance_cents between 0 and 100000000000000);

-- Existing members opt in to sharing balance separately from pack counts.
grant select(balance_cents) on public.leaderboard_entries to anon,authenticated;

create or replace function tcg_private.sync_leaderboard() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare opened bigint; spent bigint; balance bigint; collector text;
begin
 if new.state->'leaderboard' is distinct from 'true'::jsonb then
  delete from public.leaderboard_entries where user_id=new.user_id;
  return new;
 end if;
 if jsonb_typeof(new.state->'opened') is distinct from 'number' or jsonb_typeof(new.state->'spent') is distinct from 'number' then return new; end if;
 if (new.state->>'opened') !~ '^\d{1,15}$' or (new.state->>'spent') !~ '^\d{1,15}$' then return new; end if;
 opened:=(new.state->>'opened')::bigint;
 spent:=(new.state->>'spent')::bigint;
 if opened>100000000000000 or spent>100000000000000 then return new; end if;
 if new.state->'shareBalance' = 'true'::jsonb and jsonb_typeof(new.state->'balance')='number'
    and (new.state->>'balance') ~ '^\d{1,15}$' then
  balance:=(new.state->>'balance')::bigint;
  if balance>100000000000000 then balance:=null; end if;
 end if;
 collector:=left(coalesce(nullif(btrim(new.state->>'name'),''),'Collector'),24);
 insert into public.leaderboard_entries(user_id,display_name,packs_opened,spent_cents,balance_cents)
 values(new.user_id,collector,opened,spent,balance)
 on conflict(user_id) do update set display_name=excluded.display_name,packs_opened=excluded.packs_opened,
  spent_cents=excluded.spent_cents,balance_cents=excluded.balance_cents,updated_at=now();
 return new;
end $$;
revoke all on function tcg_private.sync_leaderboard() from public,anon,authenticated;
