(function(root){
'use strict';

const abilities=[
 {id:'fracture',name:'Fracture',description:'Deals 2 extra damage and bypasses shields.',bonus:2,pierce:true},
 {id:'meteor',name:'Meteor Crash',description:'Deals 4 extra damage.',bonus:4},
 {id:'renew',name:'Crystal Renewal',description:'Restores up to 5 HP.',heal:5},
 {id:'bulwark',name:'Crystal Shell',description:'Restores up to 2 HP, raises a shield, and builds focus.',heal:2,guard:true},
 {id:'prism',name:'Prism Siphon',description:'Deals 1 extra damage and restores up to 3 HP.',bonus:1,heal:3}
];
const minerals={
 "granite":["Bedrock Bash","Mountain Mantle","bulwark"],
 "sandstone":["Dune Sweep","Dune Rebuild","renew"],
 "basalt":["Lava Roll","Caldera Crash","meteor"],
 "calcite":["Double Ray","Facet Split","fracture"],
 "agate":["Band Whip","Ribbon Draw","prism"],
 "opal":["Color Ripple","Rainbow Return","prism"],
 "fluorite":["Cube Volley","Cleavage Wave","fracture"],
 "jasper":["Red Mesa Ram","Mesa Rampart","bulwark"],
 "amethyst":["Violet Volley","Geode Bloom","renew"],
 "sapphire":["Blue Comet","Cobalt Break","fracture"],
 "emerald":["Canopy Lance","Green Spring","renew"],
 "pyrite":["Gilded Rattle","Fool’s Flare","meteor"],
 "obsidian":["Glass Sweep","Blackglass Edge","fracture"],
 "diamond":["Brilliant Glint","Adamant Cut","fracture"],
 "garnet":["Crimson Pulse","Scarlet Surge","meteor"],
 "tourmaline":["Color Column","Rift Current","prism"],
 "chalk":["Dust Dash","Powder Patch","renew"],
 "rose-quartz":["Petal Pulse","Rosestone Rest","renew"],
 "azurite":["Azure Ripple","Blue Vein Draw","prism"],
 "malachite":["Verdant Spiral","Coiled Shell","bulwark"],
 "smoky-quartz":["Mist Jab","Smokescreen Shell","bulwark"],
 "citrine":["Amber Flash","Honeylight Flare","meteor"],
 "marble":["Veined Ram","Pillar Brace","bulwark"],
 "slate":["Shingle Sweep","Sheet Split","fracture"],
 "tiger-eye":["Cat’s-Eye Glint","Golden Pounce","meteor"],
 "lapis-lazuli":["Star Fleck","Midnight Absorb","prism"],
 "lepidolite":["Mica Flutter","Lilac Mend","renew"],
 "copper":["Copper Coil","Conductive Draw","prism"],
 "cinnabar":["Vermilion Flick","Red Sparkfall","meteor"],
 "peridot":["Olivine Skim","Meadow Recharge","renew"],
 "onyx":["Shadow Slab","Nocturne Wall","bulwark"],
 "labradorite":["Spectral Sweep","Aurora Return","prism"],
 "desert-rose":["Gypsum Gust","Sand Petal Shelter","bulwark"],
 "galena":["Silver Clatter","Leadline Crack","fracture"],
 "bismuth":["Staircase Skip","Hopper Guard","bulwark"],
 "rutilated-quartz":["Gold Thread","Needle Ray","fracture"],
 "pumice":["Foam Skip","Floating Rebound","renew"],
 "magnetite":["Lodestone Tug","Polar Pull","prism"],
 "celestite":["Sky Shard","Cloudwell","renew"],
 "bornite":["Peacock Sweep","Iridescent Burst","meteor"],
 "serpentinite":["Serpent Slide","Scale Shield","bulwark"],
 "rhodonite":["Pink Fault","Manganese Mend","renew"],
 "sugilite":["Grape Glimmer","Purple Tide","prism"],
 "turquoise":["Canyon Dart","Oasis Refill","renew"],
 "moonstone":["Adularia Arc","Tidal Return","prism"],
 "morganite":["Peach Beam","Dawn Shelter","bulwark"],
 "aquamarine":["Sea Spray","Breaker Surge","meteor"],
 "spinel":["Octahedral Snap","Vertex Break","fracture"]
};
const finishStyles={
 sunlit:['Solar','sunlit'],frost:['Icy','frost'],ember:['Blazing','ember'],moonlit:['Lunar','moonlit']
};
const finishElements={sunlit:'light',frost:'ice',ember:'fire',moonlit:'void'};
const mineralElements={
 basalt:'fire',cinnabar:'fire',sapphire:'ice',celestite:'ice',copper:'lightning',galena:'lightning',
 malachite:'mist',peridot:'mist',jasper:'earth',marble:'earth',obsidian:'void',onyx:'void',
 pyrite:'light',citrine:'light',aquamarine:'water',turquoise:'water',pumice:'wind','desert-rose':'wind',
 amethyst:'arcane',labradorite:'arcane',spinel:'arcane'
};
function movesFor(card){
 const mineral=card.itemId.slice(5);
 const suffix=Object.keys(finishStyles).find(finish=>mineral.endsWith('-'+finish));
 const base=suffix?mineral.slice(0,-suffix.length-1):mineral;
 const moves=minerals[base];
 if(!moves)return {attack:'Rock Strike',special:'Crystal Shell',effect:'bulwark',style:'stone'};
 const [prefix,style]=finishStyles[suffix]||['','stone'];
 return {
  attack:prefix?prefix+' '+moves[0]:moves[0],
  special:prefix?prefix+' '+moves[1]:moves[1],
  effect:moves[2],style,element:finishElements[style]||mineralElements[base]
 };
}
function moveVisual(card,special=false){
 const moves=movesFor(card);
 const name=special?moves.special:moves.attack;
 const key=Array.from(name).reduce((hash,char)=>Math.imul(hash,31)+char.codePointAt(0)>>>0,0);
 const motif=special?moves.effect:['shard','comet','ring','boulder','ribbon','volley'][key%6];
 const element=moves.element;
 return {motif,element,hue:key/0x100000000*360,spread:25+(key%31),bend:14+(key%32)};
}
function abilityFor(card,rules=3){
 if(rules>=3){
  const moves=movesFor(card);
  return {...abilities.find(ability=>ability.id===moves.effect),name:moves.special};
 }

 const key=[...card.itemId].reduce((sum,char)=>sum+char.charCodeAt(0),0);
 return abilities[key%abilities.length];
}
function canUseAbility(card,rules){
 const ability=abilityFor(card,rules);
 return !card.abilityUsed&&(ability.bonus||card.hp<card.maxHp||(ability.guard&&(!card.guard||!card.focus)));
}
function moveNote(actor,name,damage,healed,guarded){
 const effects=[
  damage>0?'Dealt '+damage+' damage.':'',
  healed>0?'Restored '+healed+' HP.':'',
  guarded?'Raised a shield.':''
 ].filter(Boolean);
 return [actor+' used '+name+'.',...effects].join(' ');
}
function battleNote(match,side){
 return match.note.replace(/^Team ([12]) (starts\.|.+)$/,(note,team,rest)=>{
  const own=Number(team)-1===side;
  if(rest==='starts.')return own?'You go first.':'Your opponent goes first.';
  // Finish the sentences in older private rooms, too.
  const parts=rest.split(/\.\s+/);
  if(match.rules!==3&&parts.length>1){
   parts[1]=parts[1].split(' · ').map(effect=>{
    const damage=effect.match(/^(\d+) damage$/);
    const heal=effect.match(/^(\d+) HP restored$/);
    if(damage)return 'Dealt '+damage[1]+' damage.';
    if(heal)return 'Restored '+heal[1]+' HP.';
    return effect==='shield raised'?'Raised a shield.':effect;
   }).join(' ');
   rest=parts.join('. ');
  }
  return (own?'You':'Your opponent')+' '+rest;
 });
}
function attackPower(own,rival,rules){
 const base=own.damage+(own.focus?3:0);
 if(rules<3||!rules)return base;
 const effect=movesFor(own).effect;
 const guardedHit=rival.guard&&effect==='fracture';
 const bonus=(effect==='meteor'&&rival.hp===rival.maxHp)||
  (effect==='renew'&&own.hp*2<=own.maxHp)||
  (effect==='bulwark'&&own.guard)||
  (effect==='prism'&&rival.hp*2<rival.maxHp);
 return base+Number(guardedHit||bonus);
}
function hitDamage(own,rival,rules,ability){
 const power=ability?own.damage+(own.focus?3:0)+ability.bonus:attackPower(own,rival,rules);
 return rival.guard&&!ability?.pierce?Math.ceil(power/2):power;
}
function combatCard(card,engine){
 const {damage,hp}=engine.cardStats(card);
 return {itemId:card.itemId,level:engine.cardLevel(card),damage,hp,maxHp:hp,guard:false,focus:false};
}
function campaignTeam(stage,catalogById,engine){
 return stage.enemies.map(([name,level,rank])=>{
  const item=catalogById['rock-'+name];
  const rival=combatCard({itemId:item.id,tier:item.tier,level,packId:'rocks-'+rank},engine);
  if(stage.practice){
   rival.damage=2;
   rival.hp=rival.maxHp=9;
  }
  return rival;
 });
}
function aiTeam(cards,catalog,packCount,engine,rng=engine.random){
 const direction=rng()<.5?-1:1;
 const used=new Set();
 return cards.map(card=>{
  const level=engine.cardLevel(card),rank=engine.packRank(card);
  const available=catalog.filter(item=>Math.abs(item.tier-card.tier)<=1&&item.id!==card.itemId);
  const candidates=[];
  for(const item of available){
   for(let nextLevel=Math.max(1,level-1);nextLevel<=Math.min(engine.maxLevel,level+1);nextLevel++){
    for(let nextRank=Math.max(0,rank-1);nextRank<=Math.min(packCount-1,rank+1);nextRank++){
     const tierDelta=item.tier-card.tier,levelDelta=nextLevel-level,rankDelta=nextRank-rank;
     const attack=tierDelta+levelDelta*2+rankDelta;
     const health=tierDelta*2+levelDelta*3+rankDelta*3;
     const difference=attack*3+health;
     if(attack*health>0&&Math.abs(difference)<=15){
      candidates.push({itemId:item.id,tier:item.tier,level:nextLevel,packId:'rocks-'+nextRank,difference});
     }
    }
   }
  }
  const sameDirection=candidates.filter(item=>Math.sign(item.difference)===direction);
  const pool=sameDirection.length?sameDirection:candidates;
  const unique=pool.filter(item=>!used.has(item.itemId));
  const choices=unique.length?unique:pool;
  const rival=choices[Math.floor(rng()*choices.length)]||card;
  used.add(rival.itemId);
  return combatCard(rival,engine);
 });
}
function newMatch(first,second){
 return {teams:[first,second],active:[0,0],turn:0,revision:0,rules:3,winner:null,note:'Choose an action.'};
}
function move(match,side,action,target){
 if(match.winner!==null||match.turn!==side)return false;
 const other=1-side;
 const own=match.teams[side][match.active[side]];
 const rival=match.teams[other][match.active[other]];
 const ability=action==='ability'&&match.rules>=2&&canUseAbility(own,match.rules)?abilityFor(own,match.rules):null;
 let damage=0,healed=0;
 if(action==='strike'||ability){
  if(ability){
   own.abilityUsed=true;
   healed=Math.min(own.maxHp-own.hp,ability.heal||0);
   own.hp+=healed;
   if(ability.guard)own.guard=own.focus=true;
  }
  if(!ability||ability.bonus){
   damage=Math.min(rival.hp,hitDamage(own,rival,match.rules,ability));
   own.focus=false;
   rival.guard=false;
   rival.hp=Math.max(0,rival.hp-damage);
   if(rival.hp===0){
    const reserve=match.teams[other].findIndex(card=>card.hp>0);
    if(reserve<0)match.winner=side;
    else match.active[other]=reserve;
   }
  }
  const name=ability?.name||movesFor(own).attack;
  match.note=moveNote('Team '+(side+1),name,damage,healed,ability?.guard);
 }else if(action==='guard'&&!own.focus){
  own.guard=true;
  own.focus=true;
  match.note=(side===0?'Team 1':'Team 2')+' braced for the next hit.';
 }else if(action==='swap'&&target!==match.active[side]&&match.teams[side][target]?.hp>0){
  match.active[side]=target;
  match.note=(side===0?'Team 1':'Team 2')+' switched rocks.';
 }else return false;
 match.lastMove={action,ability:ability?.id??null,side};
 match.turn=other;
 match.revision++;
 return true;
}
function aiMove(match){
 const own=match.teams[1][match.active[1]];
 const rival=match.teams[0][match.active[0]];
 const power=hitDamage(own,rival,match.rules);
 if(rival.hp<=power)return move(match,1,'strike');
 if(match.rules>=2&&canUseAbility(own,match.rules)){
  const ability=abilityFor(own,match.rules);
  if(ability.bonus||own.maxHp-own.hp>=3||(ability.guard&&own.hp<=rival.damage+2))return move(match,1,'ability');
 }
 if(own.focus)return move(match,1,'strike');
 const reserve=match.teams[1].findIndex(card=>card.hp>own.hp+4&&card.damage>=own.damage);
 if(own.hp<=rival.damage&&reserve>=0)return move(match,1,'swap',reserve);
 if(!own.focus&&rival.damage>=own.hp&&own.hp>Math.ceil(rival.damage/2))return move(match,1,'guard');
 return move(match,1,'strike');
}

const arena={campaignTeam,movesFor,moveVisual,aiTeam,attackPower,battleNote,abilityFor,canUseAbility,combatCard,newMatch,move,aiMove};
if(typeof module!=='undefined'&&module.exports)module.exports=arena;
else root.TCGArena=arena;
})(typeof window==='undefined'?globalThis:window);
