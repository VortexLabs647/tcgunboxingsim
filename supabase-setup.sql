-- Run once in your own Supabase project's SQL Editor.
create table if not exists public.game_saves (
 user_id uuid primary key references auth.users(id) on delete cascade,
 state jsonb not null check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 8388608),
 revision bigint not null default 1 check (revision > 0),
 updated_at timestamptz not null default now()
);
alter table public.game_saves enable row level security;
revoke all on public.game_saves from public, anon, authenticated;
grant select, insert, update, delete on public.game_saves to authenticated;
drop policy if exists own_saves on public.game_saves;
create policy own_saves on public.game_saves for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.save_game(p_state jsonb, p_expected_revision bigint)
returns bigint language plpgsql security invoker set search_path = pg_catalog,public as $$
declare new_revision bigint; current_user_id uuid := auth.uid();
begin
 if current_user_id is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_expected_revision = 0 then
  insert into public.game_saves(user_id,state,revision) values(current_user_id,p_state,1)
  on conflict(user_id) do nothing returning revision into new_revision;
 else
  update public.game_saves set state=p_state, revision=revision+1, updated_at=now()
  where user_id=current_user_id and revision=p_expected_revision returning revision into new_revision;
 end if;
 if new_revision is null then raise exception 'Save changed on another device. Load the latest cloud save.' using errcode='40001'; end if;
 return new_revision;
end $$;
revoke all on function public.save_game(jsonb,bigint) from public,anon;
grant execute on function public.save_game(jsonb,bigint) to authenticated;

create or replace function public.delete_my_game_account()
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare current_user_id uuid := auth.uid();
begin
 if current_user_id is null then raise exception 'Sign in required' using errcode='42501'; end if;
 delete from auth.users where id=current_user_id;
end $$;
revoke all on function public.delete_my_game_account() from public,anon;
grant execute on function public.delete_my_game_account() to authenticated;
