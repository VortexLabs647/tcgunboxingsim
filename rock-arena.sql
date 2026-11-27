create schema if not exists rock_arena;
revoke all on schema rock_arena from public, anon, authenticated;
grant usage on schema rock_arena to authenticated;

create table if not exists rock_arena.rooms (
 code text primary key,
 host uuid not null references auth.users(id) on delete cascade,
 guest uuid references auth.users(id) on delete cascade,
 expires_at timestamptz not null default now() + interval '2 hours',
 match jsonb not null
);
alter table rock_arena.rooms enable row level security;
revoke all on rock_arena.rooms from public, anon, authenticated;
create index if not exists rock_rooms_host on rock_arena.rooms(host);
create index if not exists rock_rooms_expires on rock_arena.rooms(expires_at);

-- Keep invite codes separate from the stable room IDs used during matches.
alter table rock_arena.rooms add column if not exists join_code text;
create unique index if not exists rock_rooms_join_code on rock_arena.rooms(join_code)
 where join_code is not null;

create table if not exists rock_arena.join_attempts (
 actor uuid primary key references auth.users(id) on delete cascade,
 started_at timestamptz not null,
 attempts integer not null
);
alter table rock_arena.join_attempts enable row level security;
revoke all on rock_arena.join_attempts from public, anon, authenticated;

-- Stats come from the signed-in player's synced inventory, never from the request.
create or replace function rock_arena.deck(player uuid, cards text[]) returns jsonb
language sql stable set search_path=pg_catalog
as $$
 select jsonb_agg(jsonb_build_object(
  'itemId',card->>'itemId','level',level,'damage',3+tier+2*(level-1),
  'hp',12+tier*2+(level-1)*3,'maxHp',12+tier*2+(level-1)*3,'guard',false,'focus',false
 ) order by requested.ordinality)
 from public.game_saves as save
 cross join lateral jsonb_array_elements(save.state->'vault') as card
 join unnest(cards) with ordinality as requested(uid,ordinality) on requested.uid=card->>'uid'
 cross join lateral (
  select (card->>'tier')::int as tier,coalesce((card->>'level')::int,1) as level
  where card->>'tier' ~ '^[0-5]$' and coalesce(card->>'level','1') ~ '^[1-5]$'
 ) as stats
 where save.user_id=player and card->>'itemId' ~ '^rock-[a-z0-9-]{1,80}$'
$$;
revoke all on function rock_arena.deck(uuid,text[]) from public,anon,authenticated;

create or replace function rock_arena.play(
 operation text, room_code text, cards text[], action text, target integer, expected integer
) returns jsonb
language plpgsql security definer set search_path=pg_catalog
as $$
declare
 actor uuid:=auth.uid();
 room rock_arena.rooms%rowtype;
 team jsonb;
 game jsonb;
 own jsonb;
 rival jsonb;
 side integer;
 other integer;
 own_path text[];
 rival_path text[];
 active integer;
 rival_active integer;
 damage integer;
 ability integer;
 ability_id text;
 ability_name text;
 bonus integer;
 healed integer;
 detail text;
 reserve integer;
 short_code boolean;
 attempts integer;
begin
 if actor is null then raise exception 'Sign in to play online' using errcode='42501'; end if;
 if operation in ('create','join') then
  if coalesce(cardinality(cards),0) not between 1 and 3 or
   (select count(distinct uid) from unnest(cards) as uid)<>cardinality(cards) then
   raise exception 'Choose 1 to 3 different cards.';
  end if;
  team:=rock_arena.deck(actor,cards);
  if coalesce(jsonb_array_length(team),0)<>cardinality(cards) then
   raise exception 'Sync your inventory before starting a match.';
  end if;
 end if;

 if operation='create' then
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  delete from rock_arena.rooms where expires_at<now();
  if (select count(*) from rock_arena.rooms where host=actor and match->'winner'='null'::jsonb)<3 then
   for attempt in 1..100 loop
    insert into rock_arena.rooms(code,join_code,host,match)
    values(left(replace(gen_random_uuid()::text,'-',''),16),lpad(floor(random()*10000)::int::text,4,'0'),actor,
     jsonb_build_object('teams',jsonb_build_array(team,'[]'::jsonb),'active',jsonb_build_array(0,0),
      'turn',0,'revision',0,'rules',2,'winner',null,'note','Waiting for Player 2.'))
    on conflict do nothing returning * into room;
    exit when found;
   end loop;
   if room.code is null then raise exception 'All room codes are busy. Try again shortly.'; end if;
  else
   raise exception 'You already have three open rooms.';
  end if;
  side:=0;
 else
  short_code:=operation='join' and room_code ~ '^[0-9]{4}$';
  if short_code then
   insert into rock_arena.join_attempts as history(actor,started_at,attempts)
   values(actor,now(),1)
   on conflict on constraint join_attempts_pkey do update set
    started_at=case when history.started_at<=now()-interval '1 minute' then now() else history.started_at end,
    attempts=case when history.started_at<=now()-interval '1 minute' then 1 else history.attempts+1 end
   where history.started_at<=now()-interval '1 minute' or history.attempts<8
   returning history.attempts into attempts;
   -- Return a normal response so failed guesses still count after the transaction commits.
   if attempts is null then return jsonb_build_object('error','Too many attempts. Try again in a minute.'); end if;
   select * into room from rock_arena.rooms where join_code=room_code and expires_at>now() for update;
  elsif room_code ~ '^[0-9a-f]{16}$' then
   select * into room from rock_arena.rooms where code=room_code and expires_at>now() for update;
  else
   raise exception 'Enter a valid room code.';
  end if;
  if room.code is null then
   if short_code then return jsonb_build_object('error','Room code not found or expired.'); end if;
   raise exception 'Room closed or expired.';
  end if;
  if room.host=actor then side:=0; elsif room.guest=actor then side:=1; end if;

  if operation='join' and side is null then
   if room.guest is not null or room.match->'winner'<>'null'::jsonb then
    if short_code then return jsonb_build_object('error','Room is full or closed.'); end if;
    raise exception 'Room is full or closed.';
   end if;
   if jsonb_array_length(room.match#>'{teams,0}')<>cardinality(cards) then
    detail:=format('This room needs a team of %s cards.',jsonb_array_length(room.match#>'{teams,0}'));
    if short_code then return jsonb_build_object('error',detail); end if;
    raise exception '%',detail;
   end if;
   room.guest:=actor;
   room.match:=jsonb_set(room.match,'{teams,1}',team)||jsonb_build_object('revision',1,'note','Team 1 starts.');
   update rock_arena.rooms set guest=actor,match=room.match,expires_at=now()+interval '2 hours' where code=room.code;
   side:=1;
  elsif side is null then
   raise exception 'Join the room first.' using errcode='42501';
  elsif operation='leave' then
   if room.guest is null then
    delete from rock_arena.rooms where code=room.code;
   elsif room.match->'winner'='null'::jsonb then
    update rock_arena.rooms set match=match||jsonb_build_object('winner',1-side,'note','Opponent left the match.') where code=room.code;
   end if;
   return null;
  elsif operation='move' then
   game:=room.match;
   if room.guest is null or game->'winner'<>'null'::jsonb or (game->>'turn')::int<>side
      or (game->>'revision')::int is distinct from expected then raise exception 'Wait for your current turn.'; end if;
   other:=1-side;
   active:=(game#>>array['active',side::text])::int;
   rival_active:=(game#>>array['active',other::text])::int;
   own_path:=array['teams',side::text,active::text];
   rival_path:=array['teams',other::text,rival_active::text];
   own:=game#>own_path;
   rival:=game#>rival_path;
   if action='ability' and game->>'rules'='2' and not coalesce((own->>'abilityUsed')::boolean,false) then
    select sum(ascii(substr(own->>'itemId',n,1))) % 5 into ability
    from generate_series(1,length(own->>'itemId')) as letters(n);
    ability_id:=(array['fracture','meteor','renew','bulwark','prism'])[ability+1];
    ability_name:=(array['Fracture','Meteor Crash','Crystal Renewal','Crystal Shell','Prism Siphon'])[ability+1];
    bonus:=(array[2,4,0,0,1])[ability+1];
    healed:=least((own->>'maxHp')::int-(own->>'hp')::int,(array[0,0,5,2,3])[ability+1]);
    if bonus=0 and healed=0 and (ability<>3 or ((own->>'guard')::boolean and (own->>'focus')::boolean)) then
     raise exception 'That ability is unavailable.';
    end if;
    own:=own||jsonb_build_object('abilityUsed',true,'hp',(own->>'hp')::int+healed);
    if ability=3 then own:=own||jsonb_build_object('guard',true,'focus',true); end if;
   elsif action='ability' then
    raise exception 'That ability is unavailable.';
   end if;
   if action in ('strike','ability') then
    damage:=0;
    if action='strike' or bonus>0 then
     damage:=(own->>'damage')::int+case when (own->>'focus')::boolean then 3 else 0 end+coalesce(bonus,0);
     if (rival->>'guard')::boolean and ability is distinct from 0 then damage:=(damage+1)/2; end if;
     own:=own||jsonb_build_object('focus',false);
     rival:=rival||jsonb_build_object('guard',false,'hp',greatest(0,(rival->>'hp')::int-damage));
    end if;
    game:=jsonb_set(jsonb_set(game,own_path,own),rival_path,rival);
    detail:=concat_ws(' · ',case when damage>0 then damage||' damage' end,
     case when healed>0 then healed||' HP restored' end,case when ability=3 then 'shield raised' end);
    if action='ability' then game:=game||jsonb_build_object('note',format('Team %s used %s. %s',side+1,ability_name,detail));
    else game:=game||jsonb_build_object('note',format('Team %s struck. %s',side+1,detail)); end if;
    if (rival->>'hp')::int=0 then
     select min(ordinality::int)-1 into reserve
     from jsonb_array_elements(game#>array['teams',other::text]) with ordinality as slot(card,ordinality)
     where (card->>'hp')::int>0;
     if reserve is null then game:=game||jsonb_build_object('winner',side);
     else game:=jsonb_set(game,array['active',other::text],to_jsonb(reserve)); end if;
    end if;
   elsif action='guard' and not (own->>'focus')::boolean then
    game:=jsonb_set(game,own_path,own||jsonb_build_object('guard',true,'focus',true));
    game:=game||jsonb_build_object('note',format('Team %s braced for the next hit.',side+1));
   elsif action='swap' and target between 0 and 2 and target<>active
     and (game#>>array['teams',side::text,target::text,'hp'])::int>0 then
    game:=jsonb_set(game,array['active',side::text],to_jsonb(target));
    game:=game||jsonb_build_object('note',format('Team %s switched rocks.',side+1));
   else
    raise exception 'That action is unavailable.';
   end if;
   room.match:=game||jsonb_build_object('turn',other,'revision',expected+1,
    'lastMove',jsonb_build_object('action',action,'ability',ability_id));
   update rock_arena.rooms set match=room.match,expires_at=now()+interval '2 hours' where code=room.code;
  elsif operation is null or operation not in ('state','join') then
   raise exception 'Unknown match action.';
  end if;
 end if;
 return jsonb_build_object('code',room.code,'joinCode',room.join_code,'side',side,'waiting',room.guest is null,'match',room.match);
end
$$;
revoke all on function rock_arena.play(text,text,text[],text,integer,integer) from public,anon,authenticated;
grant execute on function rock_arena.play(text,text,text[],text,integer,integer) to authenticated;

create or replace function public.rock_battle(
 operation text, room_code text default null, cards text[] default null,
 action text default null, target integer default null, expected integer default null
) returns jsonb
language sql security invoker set search_path=pg_catalog
as $$ select rock_arena.play(operation,room_code,cards,action,target,expected) $$;
revoke all on function public.rock_battle(text,text,text[],text,integer,integer) from public,anon,authenticated;
grant execute on function public.rock_battle(text,text,text[],text,integer,integer) to authenticated;
