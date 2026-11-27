(function(root){
'use strict';

const abilities=[
 {id:'fracture',name:'Fracture',description:'Strike for +2 damage through shields.',bonus:2,pierce:true},
 {id:'meteor',name:'Meteor Crash',description:'Strike for +4 damage.',bonus:4},
 {id:'renew',name:'Crystal Renewal',description:'Restore up to 5 HP.',heal:5},
 {id:'bulwark',name:'Crystal Shell',description:'Restore up to 2 HP, guard and focus.',heal:2,guard:true},
 {id:'prism',name:'Prism Siphon',description:'Strike for +1 damage and restore up to 3 HP.',bonus:1,heal:3}
];
function abilityFor(card){
 const key=[...card.itemId].reduce((sum,char)=>sum+char.charCodeAt(0),0);
 return abilities[key%abilities.length];
}
function canUseAbility(card){
 const ability=abilityFor(card);
 return !card.abilityUsed&&(ability.bonus||card.hp<card.maxHp||(ability.guard&&(!card.guard||!card.focus)));
}
function hitDamage(own,rival,ability){
 const damage=own.damage+(own.focus?3:0)+(ability?.bonus||0);
 return rival.guard&&!ability?.pierce?Math.ceil(damage/2):damage;
}
function combatCard(card,engine){
 const {damage,hp}=engine.cardStats(card);
 return {itemId:card.itemId,level:engine.cardLevel(card),damage,hp,maxHp:hp,guard:false,focus:false};
}
function newMatch(first,second){
 return {teams:[first,second],active:[0,0],turn:0,revision:0,rules:2,winner:null,note:'Choose an action.'};
}
function move(match,side,action,target){
 if(match.winner!==null||match.turn!==side)return false;
 const other=1-side;
 const own=match.teams[side][match.active[side]];
 const rival=match.teams[other][match.active[other]];
 const ability=action==='ability'&&match.rules===2&&canUseAbility(own)?abilityFor(own):null;
 let damage=0,healed=0;
 if(action==='strike'||ability){
  if(ability){
   own.abilityUsed=true;
   healed=Math.min(own.maxHp-own.hp,ability.heal||0);
   own.hp+=healed;
   if(ability.guard)own.guard=own.focus=true;
  }
  if(!ability||ability.bonus){
   damage=hitDamage(own,rival,ability);
   own.focus=false;
   rival.guard=false;
   rival.hp=Math.max(0,rival.hp-damage);
   if(rival.hp===0){
    const reserve=match.teams[other].findIndex(card=>card.hp>0);
    if(reserve<0)match.winner=side;
    else match.active[other]=reserve;
   }
  }
  const detail=[damage?`${damage} damage`:'',healed?`${healed} HP restored`:'',ability?.guard?'shield raised':''].filter(Boolean).join(' · ');
  match.note=`Team ${side+1}${ability?' used '+ability.name:' struck'}. ${detail}`;
 }else if(action==='guard'&&!own.focus){
  own.guard=true;
  own.focus=true;
  match.note=(side===0?'Team 1':'Team 2')+' braced for the next hit.';
 }else if(action==='swap'&&target!==match.active[side]&&match.teams[side][target]?.hp>0){
  match.active[side]=target;
  match.note=(side===0?'Team 1':'Team 2')+' switched rocks.';
 }else return false;
 match.lastMove={action,ability:ability?.id??null};
 match.turn=other;
 match.revision++;
 return true;
}
function aiMove(match){
 const own=match.teams[1][match.active[1]];
 const rival=match.teams[0][match.active[0]];
 const power=hitDamage(own,rival);
 if(rival.hp<=power)return move(match,1,'strike');
 if(match.rules===2&&canUseAbility(own)){
  const ability=abilityFor(own);
  if(ability.bonus||own.maxHp-own.hp>=3||(ability.guard&&own.hp<=rival.damage+2))return move(match,1,'ability');
 }
 if(own.focus)return move(match,1,'strike');
 const reserve=match.teams[1].findIndex(card=>card.hp>own.hp+4&&card.damage>=own.damage);
 if(own.hp<=rival.damage&&reserve>=0)return move(match,1,'swap',reserve);
 if(!own.focus&&rival.damage>=own.hp&&own.hp>Math.ceil(rival.damage/2))return move(match,1,'guard');
 return move(match,1,'strike');
}

const arena={abilityFor,canUseAbility,combatCard,newMatch,move,aiMove};
if(typeof module!=='undefined'&&module.exports)module.exports=arena;
else root.TCGArena=arena;
})(typeof window==='undefined'?globalThis:window);
