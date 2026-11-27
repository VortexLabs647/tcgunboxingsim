(function(root){
'use strict';

function combatCard(card,engine){
 const {damage,hp}=engine.cardStats(card);
 return {itemId:card.itemId,level:engine.cardLevel(card),damage,hp,maxHp:hp,guard:false,focus:false};
}
function newMatch(first,second){
 return {teams:[first,second],active:[0,0],turn:0,revision:0,winner:null,note:'Choose an action.'};
}
function move(match,side,action,target){
 if(match.winner!==null||match.turn!==side)return false;
 const other=1-side;
 const own=match.teams[side][match.active[side]];
 const rival=match.teams[other][match.active[other]];
 if(action==='strike'){
  const power=own.damage+(own.focus?3:0);
  const damage=rival.guard?Math.ceil(power/2):power;
  own.focus=false;
  rival.guard=false;
  rival.hp=Math.max(0,rival.hp-damage);
  match.note=(side===0?'Team 1':'Team 2')+' dealt '+damage+' damage.';
  if(rival.hp===0){
   const reserve=match.teams[other].findIndex(card=>card.hp>0);
   if(reserve<0)match.winner=side;
   else match.active[other]=reserve;
  }
 }else if(action==='guard'&&!own.focus){
  own.guard=true;
  own.focus=true;
  match.note=(side===0?'Team 1':'Team 2')+' braced for the next hit.';
 }else if(action==='swap'&&target!==match.active[side]&&match.teams[side][target]?.hp>0){
  match.active[side]=target;
  match.note=(side===0?'Team 1':'Team 2')+' switched rocks.';
 }else return false;
 match.turn=other;
 match.revision++;
 return true;
}
function aiMove(match){
 const own=match.teams[1][match.active[1]];
 const rival=match.teams[0][match.active[0]];
 const power=own.damage+(own.focus?3:0);
 if(rival.hp<=(rival.guard?Math.ceil(power/2):power)||own.focus)return move(match,1,'strike');
 const reserve=match.teams[1].findIndex(card=>card.hp>own.hp+4&&card.damage>=own.damage);
 if(own.hp<=rival.damage&&reserve>=0)return move(match,1,'swap',reserve);
 if(!own.focus&&rival.damage>=own.hp&&own.hp>Math.ceil(rival.damage/2))return move(match,1,'guard');
 return move(match,1,'strike');
}

const arena={combatCard,newMatch,move,aiMove};
if(typeof module!=='undefined'&&module.exports)module.exports=arena;
else root.TCGArena=arena;
})(typeof window==='undefined'?globalThis:window);
