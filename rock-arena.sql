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

-- Store each private win reward at match completion so claiming it cannot reroll it.
create table if not exists rock_arena.win_rewards (
 room_code text primary key,
 winner uuid not null references auth.users(id) on delete cascade
);
alter table rock_arena.win_rewards enable row level security;
revoke all on rock_arena.win_rewards from public,anon,authenticated;
create index if not exists rock_win_rewards_winner on rock_arena.win_rewards(winner);

-- Preserve the ten-cent reward for wins already recorded before this range was added.
alter table rock_arena.win_rewards add column if not exists cents smallint not null default 10
 check (cents between 1 and 50);

create or replace function rock_arena.award_win(room_id text,player_id uuid)
returns integer language sql volatile set search_path=pg_catalog
as $$
 insert into rock_arena.win_rewards as existing(room_code,winner,cents)
 values(room_id,player_id,1+floor(random()*50)::int)
 on conflict (room_code) do update set cents=existing.cents
 returning cents::int
$$;
revoke all on function rock_arena.award_win(text,uuid) from public,anon,authenticated;

create or replace function rock_arena.save_with_rewards(p_state jsonb,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
 actor uuid:=auth.uid();
 saved public.game_saves%rowtype;
 next_state jsonb;
 current_balance bigint;
 reward bigint;
begin
 if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select * into saved from public.game_saves where user_id=actor for update;
 if not found or saved.revision is distinct from p_expected_revision then
  raise exception 'Save changed on another device. Load the latest cloud save.' using errcode='40001';
 end if;

 with wins as (delete from rock_arena.win_rewards where winner=actor returning cents)
 select coalesce(sum(cents),0) into reward from wins;
 if p_state is null and reward=0 then
  return jsonb_build_object('revision',saved.revision,'reward',0);
 end if;
 next_state:=coalesce(p_state,saved.state);
 if reward>0 then
  current_balance:=(next_state->>'balance')::bigint;
  if current_balance is null or current_balance not between 0 and 100000000000000 then
   raise exception 'Invalid balance in saved game.';
  end if;
  reward:=least(reward,100000000000000-current_balance);
  next_state:=jsonb_set(next_state,'{balance}',to_jsonb(current_balance+reward));
 end if;
 return jsonb_build_object('revision',public.save_game(next_state,p_expected_revision),'reward',reward);
end
$$;
revoke all on function rock_arena.save_with_rewards(jsonb,bigint) from public,anon,authenticated;
grant execute on function rock_arena.save_with_rewards(jsonb,bigint) to authenticated;

create or replace function public.save_rock_game(p_state jsonb,p_expected_revision bigint)
returns jsonb language sql security invoker set search_path=pg_catalog
as $$ select rock_arena.save_with_rewards(p_state,p_expected_revision) $$;
revoke all on function public.save_rock_game(jsonb,bigint) from public,anon,authenticated;
grant execute on function public.save_rock_game(jsonb,bigint) to authenticated;

-- Stats come from the signed-in player's synced inventory, never from the request.
create or replace function rock_arena.deck(player uuid, cards text[]) returns jsonb
language sql stable set search_path=pg_catalog
as $$
 select jsonb_agg(jsonb_build_object(
  'itemId',card->>'itemId','level',level,'damage',3+tier+2*(level-1)+pack_rank,
  'hp',12+tier*2+3*(level-1)+3*pack_rank,
  'maxHp',12+tier*2+3*(level-1)+3*pack_rank,'guard',false,'focus',false
 ) order by requested.ordinality)
 from public.game_saves as save
 cross join lateral jsonb_array_elements(save.state->'vault') as card
 join unnest(cards) with ordinality as requested(uid,ordinality) on requested.uid=card->>'uid'
 cross join lateral (
  select (card->>'tier')::int as tier,coalesce((card->>'level')::int,1) as level,
   coalesce(substring(card->>'packId' from '^rocks-([0-9]|1[0-5])$')::int,0) as pack_rank
  where card->>'tier' ~ '^[0-5]$' and coalesce(card->>'level','1') ~ '^[1-5]$'
 ) as stats
 where save.user_id=player and card->>'itemId' ~ '^rock-[a-z0-9-]{1,80}$'
$$;
revoke all on function rock_arena.deck(uuid,text[]) from public,anon,authenticated;

-- Mineral move names and effects match the player-facing list in arena.js.
create or replace function rock_arena.moves_for(item_id text)
returns table(attack text, special text, effect text)
language sql immutable set search_path=pg_catalog
as $$
 with mineral as (
  select regexp_replace(substr(item_id,6),'-(sunlit|frost|ember|moonlit)$','') as name,
   case
    when item_id like '%-sunlit' then 'Solar '
    when item_id like '%-frost' then 'Icy '
    when item_id like '%-ember' then 'Blazing '
    when item_id like '%-moonlit' then 'Lunar '
    else ''
   end as prefix
 )
 select mineral.prefix||coalesce(m.attack,'Rock Strike'),
  mineral.prefix||coalesce(m.special,'Crystal Shell'),coalesce(m.effect,'bulwark')
 from mineral left join (values
  ('granite','Bedrock Bash','Mountain Mantle','bulwark'),
  ('sandstone','Dune Sweep','Dune Rebuild','renew'),
  ('basalt','Lava Roll','Caldera Crash','meteor'),
  ('calcite','Double Ray','Facet Split','fracture'),
  ('agate','Band Whip','Ribbon Draw','prism'),
  ('opal','Color Ripple','Rainbow Return','prism'),
  ('fluorite','Cube Volley','Cleavage Wave','fracture'),
  ('jasper','Red Mesa Ram','Mesa Rampart','bulwark'),
  ('amethyst','Violet Volley','Geode Bloom','renew'),
  ('sapphire','Blue Comet','Cobalt Break','fracture'),
  ('emerald','Canopy Lance','Green Spring','renew'),
  ('pyrite','Gilded Rattle','Fool’s Flare','meteor'),
  ('obsidian','Glass Sweep','Blackglass Edge','fracture'),
  ('diamond','Brilliant Glint','Adamant Cut','fracture'),
  ('garnet','Crimson Pulse','Scarlet Surge','meteor'),
  ('tourmaline','Color Column','Rift Current','prism'),
  ('chalk','Dust Dash','Powder Patch','renew'),
  ('rose-quartz','Petal Pulse','Rosestone Rest','renew'),
  ('azurite','Azure Ripple','Blue Vein Draw','prism'),
  ('malachite','Verdant Spiral','Coiled Shell','bulwark'),
  ('smoky-quartz','Mist Jab','Smokescreen Shell','bulwark'),
  ('citrine','Amber Flash','Honeylight Flare','meteor'),
  ('marble','Veined Ram','Pillar Brace','bulwark'),
  ('slate','Shingle Sweep','Sheet Split','fracture'),
  ('tiger-eye','Cat’s-Eye Glint','Golden Pounce','meteor'),
  ('lapis-lazuli','Star Fleck','Midnight Absorb','prism'),
  ('lepidolite','Mica Flutter','Lilac Mend','renew'),
  ('copper','Copper Coil','Conductive Draw','prism'),
  ('cinnabar','Vermilion Flick','Red Sparkfall','meteor'),
  ('peridot','Olivine Skim','Meadow Recharge','renew'),
  ('onyx','Shadow Slab','Nocturne Wall','bulwark'),
  ('labradorite','Spectral Sweep','Aurora Return','prism'),
  ('desert-rose','Gypsum Gust','Sand Petal Shelter','bulwark'),
  ('galena','Silver Clatter','Leadline Crack','fracture'),
  ('bismuth','Staircase Skip','Hopper Guard','bulwark'),
  ('rutilated-quartz','Gold Thread','Needle Ray','fracture'),
  ('pumice','Foam Skip','Floating Rebound','renew'),
  ('magnetite','Lodestone Tug','Polar Pull','prism'),
  ('celestite','Sky Shard','Cloudwell','renew'),
  ('bornite','Peacock Sweep','Iridescent Burst','meteor'),
  ('serpentinite','Serpent Slide','Scale Shield','bulwark'),
  ('rhodonite','Pink Fault','Manganese Mend','renew'),
  ('sugilite','Grape Glimmer','Purple Tide','prism'),
  ('turquoise','Canyon Dart','Oasis Refill','renew'),
  ('moonstone','Adularia Arc','Tidal Return','prism'),
  ('morganite','Peach Beam','Dawn Shelter','bulwark'),
  ('aquamarine','Sea Spray','Breaker Surge','meteor'),
  ('spinel','Octahedral Snap','Vertex Break','fracture')
 ) as m(name,attack,special,effect) on m.name=mineral.name
$$;
revoke all on function rock_arena.moves_for(text) from public,anon,authenticated;

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
 moves record;
 named_moves boolean;
 bonus integer;
 healed integer;
 detail text;
 reserve integer;
 short_code boolean;
 attempts integer;
 win_reward integer;
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
      'turn',0,'revision',0,'rules',3,'winner',null,'note','Waiting for your opponent.'))
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
    win_reward:=rock_arena.award_win(room.code,case when side=0 then room.guest else room.host end);
    update rock_arena.rooms set match=match||jsonb_build_object('winner',1-side,'reward',win_reward,'note','Opponent left the match.')
     where code=room.code;
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
   named_moves:=coalesce(game->>'rules'='3',false);
   if named_moves then select * into moves from rock_arena.moves_for(own->>'itemId'); end if;
   if action='ability' and game->>'rules' in ('2','3') and not coalesce((own->>'abilityUsed')::boolean,false) then
    if named_moves then
     ability_id:=moves.effect;
     ability_name:=moves.special;
     ability:=array_position(array['fracture','meteor','renew','bulwark','prism'],ability_id)-1;
    else
     select sum(ascii(substr(own->>'itemId',n,1))) % 5 into ability
     from generate_series(1,length(own->>'itemId')) as letters(n);
     ability_id:=(array['fracture','meteor','renew','bulwark','prism'])[ability+1];
     ability_name:=(array['Fracture','Meteor Crash','Crystal Renewal','Crystal Shell','Prism Siphon'])[ability+1];
    end if;
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
     if named_moves and action='strike' then
      damage:=damage+case when
       (moves.effect='fracture' and (rival->>'guard')::boolean) or
       (moves.effect='meteor' and rival->>'hp'=rival->>'maxHp') or
       (moves.effect='renew' and (own->>'hp')::int*2<=(own->>'maxHp')::int) or
       (moves.effect='bulwark' and (own->>'guard')::boolean) or
       (moves.effect='prism' and (rival->>'hp')::int*2<(rival->>'maxHp')::int)
       then 1 else 0 end;
     end if;
     if (rival->>'guard')::boolean and ability is distinct from 0 then damage:=(damage+1)/2; end if;
     if named_moves then damage:=least(damage,(rival->>'hp')::int); end if;
     own:=own||jsonb_build_object('focus',false);
     rival:=rival||jsonb_build_object('guard',false,'hp',greatest(0,(rival->>'hp')::int-damage));
    end if;
    game:=jsonb_set(jsonb_set(game,own_path,own),rival_path,rival);
    if named_moves then
     detail:=concat_ws(' ',format('Team %s used %s.',side+1,coalesce(ability_name,moves.attack)),
      case when damage>0 then format('Dealt %s damage.',damage) end,
      case when healed>0 then format('Restored %s HP.',healed) end,
      case when ability=3 then 'Raised a shield.' end);
    else
     detail:=concat_ws(' ',case when action='ability' then format('Team %s used %s.',side+1,ability_name)
                               else format('Team %s struck.',side+1) end,
      case when damage>0 then format('Dealt %s damage.',damage) end,
      case when healed>0 then format('Restored %s HP.',healed) end,
      case when ability=3 then 'Raised a shield.' end);
    end if;
    game:=game||jsonb_build_object('note',detail);
    if (rival->>'hp')::int=0 then
     select min(ordinality::int)-1 into reserve
     from jsonb_array_elements(game#>array['teams',other::text]) with ordinality as slot(card,ordinality)
     where (card->>'hp')::int>0;
     if reserve is null then
      win_reward:=rock_arena.award_win(room.code,actor);
      game:=game||jsonb_build_object('winner',side,'reward',win_reward);
     else
      game:=jsonb_set(game,array['active',other::text],to_jsonb(reserve));
     end if;
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
    'lastMove',jsonb_build_object('action',action,'ability',ability_id,'side',side));
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
