(function(root){
'use strict';

const names=['Opal','Sapphire','Amethyst','Emerald','Ruby','Gold','Obsidian','Diamond','Sovereign'];
const packPrices=[2,4,6,10,15,25,40,65,100];
const salePercent=[20,35,60,100,150,300];
const startingBalance=10;
const starterId='starter-granite';
const foilColors=['#fa3d7d','#3e8bff','#b052ff','#24dfad','#ff4c3d','#ffbf20','#5f63ff','#37d9ff','#ffb54a'];
const rarityNames=['Common','Uncommon','Rare','Epic','Legendary','Grail'];
const rarityColors=['#88a3cb','#41dfb0','#439cff','#aa5bff','#ff4c60','#ffcf36'];
const covers=[
 ['opal','agate','calcite'],['sapphire','fluorite','basalt'],['amethyst','calcite','agate'],
 ['emerald','fluorite','granite'],['garnet','jasper','sandstone'],['pyrite','agate','sandstone'],
 ['obsidian','basalt','tourmaline'],['diamond','calcite','sapphire'],['tourmaline','garnet','emerald']
];
const signatureCards=['opal','sapphire','amethyst','emerald','jasper','pyrite','obsidian','diamond','tourmaline'];
const oddsPresets={
 Balanced:[42,26,17,9,5,1],
 Explorer:[30,30,22,12,5,1],
 Collector:[52,22,12,7,5,2]
};
const productiveLimit=12,offlineSeconds=8*60*60;
// One unit is $0.000001 in virtual currency.
const unitsPerCent=10000;
const passiveUnits=[1,2,3,4,5,6];
function saleValue(price,tier){
 return Math.max(1,Math.floor(price*salePercent[tier]/100));
}
function saleProceeds(rock){
 return rock.uid===starterId?0:rock.value*unitsPerCent+(rock.resaleUnits||0);
}
function canAfford(state,pack){return state.balance>=pack.price;}
function ensureStarterRock(state,now){
 if(state.vault.length||state.balance>=packPrices[0])return;
 state.vault.push({uid:starterId,itemId:'rock-granite',value:0,tier:0,date:new Date(now).toISOString(),locked:false});
 if(!state.discovered.includes('rock-granite'))state.discovered.push('rock-granite');
 state.rockClock=Math.max(state.rockClock,now);
}
function activeRocks(state){
 const seen=new Set();
 return state.vault.filter(rock=>{
  if(seen.has(rock.itemId))return false;
  seen.add(rock.itemId);
  return true;
 }).sort((a,b)=>b.tier-a.tier).slice(0,productiveLimit);
}
function credit(state,units){
 const total=state.rockRemainder+units;
 state.balance=Math.min(1e14,state.balance+Math.floor(total/unitsPerCent));
 state.rockRemainder=total%unitsPerCent;
}
function settleIncome(state,now=Date.now()){
 const seconds=Math.min(offlineSeconds,Math.floor((now-state.rockClock)/1000));
 if(seconds<=0)return 0;
 // Drop time above the offline limit, while keeping fractional seconds.
 state.rockClock=now-(now-state.rockClock)%1000;
 let earned=0;
 for(const rock of activeRocks(state))earned+=passiveUnits[rock.tier]*seconds;
 credit(state,earned);
 return earned;
}
function sellRock(state,uid,now=Date.now()){
 const index=state.vault.findIndex(rock=>rock.uid===uid&&!rock.locked);
 if(index<0)return null;
 settleIncome(state,now);
 const proceeds=saleProceeds(state.vault[index]);
 if(!proceeds)return null;
 state.vault.splice(index,1);
 credit(state,proceeds);
 state.sold+=Math.floor(proceeds/unitsPerCent);
 ensureStarterRock(state,now);
 // Restart the fractional second so a replacement rock cannot earn it twice.
 state.rockClock=Math.max(state.rockClock,now);
 return proceeds;
}

function random(){return crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;}
function uuid(){
 if(crypto.randomUUID)return crypto.randomUUID();
 return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,mark=>{
  const nibble=Math.floor(random()*16);
  return (mark==='x'?nibble:(nibble&3)|8).toString(16);
 });
}
function packs(){
 return names.map((name,index)=>({
  id:'rocks-'+index,index,name,color:foilColors[index],price:packPrices[index],
  cover:covers[index].map(id=>'rock-'+id),signature:'rock-'+signatureCards[index]
 }));
}
function pools(catalog){
 return rarityNames.map((_,tier)=>catalog.filter(item=>item.tier===tier));
}
function itemOdds(item,pack,group,odds){
 const signatureInGroup=group.some(card=>card.id===pack.signature);
 const weight=item.id===pack.signature?2:1;
 return oddsPresets[odds][item.tier]*weight/(group.length+Number(signatureInGroup));
}
function openPack(state,catalog,pack,odds,rng=random,now=Date.now()){
 const weights=oddsPresets[odds];
 if(!Object.hasOwn(oddsPresets,odds))throw Error('Unknown odds');
 settleIncome(state,now);
 if(!canAfford(state,pack))return null;
 const groups=pools(catalog);
 let roll=rng()*100;
 const tier=weights.findIndex(weight=>(roll-=weight)<0);
 const group=groups[tier];
 let pick=rng()*weights[tier];
 const item=group.find(card=>(pick-=itemOdds(card,pack,group,odds))<0)||group.at(-1);
 const duplicate=state.vault.some(rock=>rock.itemId===item.id);
 const value=saleValue(pack.price,tier);
 const pull={uid:uuid(),itemId:item.id,value,tier,packId:pack.id,date:new Date(now).toISOString(),locked:false};
 state.balance-=pack.price;
 state.spent+=pack.price;
 state.vault.unshift(pull);
 state.rockClock=Math.max(state.rockClock,now);
 state.best=Math.max(state.best,value);
 state.opened++;
 if(!state.discovered.includes(item.id))state.discovered.push(item.id);
 return {pull,pack,odds,duplicate};
}

function defaults(){
 return {version:4,balance:startingBalance,rockClock:Date.now(),rockRemainder:0,pricedPacks:true,vault:[],discovered:[],opened:0,spent:0,sold:0,best:0,deposited:0,referralClaimed:false,name:'',history:[],settings:{sound:true,haptics:true},preferences:{category:'rocks',packIndex:0}};
}
function migrate(old,catalog){
 const state={...defaults(),...old,version:4};
 const activeIds=new Set(catalog.map(card=>card.id));
 const oldCards=state.vault.filter(card=>!activeIds.has(card.itemId));
 const oldDiscoveries=state.discovered.filter(id=>!activeIds.has(id));
 if(oldCards.length)state.retiredCards=[...(old.retiredCards||[]),...oldCards];
 if(oldDiscoveries.length)state.retiredDiscoveries=[...new Set([...(old.retiredDiscoveries||[]),...oldDiscoveries])];
 state.vault=state.vault.filter(card=>activeIds.has(card.itemId));
 state.discovered=state.discovered.filter(id=>activeIds.has(id));
 if(old.pricedPacks!==true){
  for(const rock of state.vault){
   if(rock.value>0)continue;
   const match=/^rocks-([0-8])$/.exec(rock.packId);
   rock.value=saleValue(packPrices[Number(match?.[1]??0)],rock.tier);
  }
  if(state.balance===0&&!state.vault.length)state.balance=startingBalance;
 }
 state.pricedPacks=true;
 ensureStarterRock(state,Date.now());
 const index=old.preferences?.packIndex;
 state.preferences={category:'rocks',packIndex:Number.isInteger(index)?Math.max(0,Math.min(names.length-1,index)):0};
 return state;
}
function validSave(state,catalog){
 if(!state||![1,2,3,4].includes(state.version))return false;
 const activeIds=new Set(catalog.map(card=>card.id));
 const retiredPattern=/^(?:(?:pokemon|creatures|football|basketball|sneakers)(?:-expansion)?|wilds|cosmic|mechs|relics)-\d+$/;
 const knownId=id=>typeof id==='string'&&(activeIds.has(id)||retiredPattern.test(id));
 const validCard=card=>card&&typeof card.uid==='string'&&knownId(card.itemId)&&Number.isSafeInteger(card.value)&&
  (card.resaleUnits===undefined||Number.isSafeInteger(card.resaleUnits)&&card.resaleUnits>=0&&card.resaleUnits<=5000)&&card.value>=0&&card.value<=1e12&&Number.isInteger(card.tier)&&card.tier>=0&&card.tier<rarityNames.length;
 const cardList=list=>Array.isArray(list)&&list.length<50000&&list.every(validCard);
 const discoveries=list=>Array.isArray(list)&&list.every(knownId);

 return Number.isSafeInteger(state.balance)&&state.balance>=0&&state.balance<=1e14&&cardList(state.vault)&&
  new Set(state.vault.map(card=>card.uid)).size===state.vault.length&&
  (state.retiredCards===undefined||cardList(state.retiredCards))&&
  ['opened','spent','sold','best','deposited'].every(key=>Number.isSafeInteger(state[key])&&state[key]>=0)&&
  (state.rockClock===undefined||Number.isSafeInteger(state.rockClock)&&state.rockClock>=0)&&
  (state.rockRemainder===undefined||Number.isSafeInteger(state.rockRemainder)&&state.rockRemainder>=0&&state.rockRemainder<unitsPerCent)&&
  discoveries(state.discovered)&&(state.retiredDiscoveries===undefined||discoveries(state.retiredDiscoveries))&&
  typeof state.name==='string'&&state.name.length<=24&&Array.isArray(state.history)&&state.history.length<=150&&
  state.history.every(entry=>entry&&typeof entry.label==='string'&&Number.isSafeInteger(entry.amount)&&!isNaN(Date.parse(entry.date)));
}

const engine={rarityNames,rarityColors,oddsPresets,passiveUnits,productiveLimit,offlineSeconds,unitsPerCent,activeRocks,settleIncome,sellRock,saleProceeds,saleValue,canAfford,packs,pools,itemOdds,openPack,defaults,migrate,validSave,random};
if(typeof module!=='undefined'&&module.exports)module.exports=engine;
else root.TCGEngine=engine;
})(typeof window==='undefined'?globalThis:window);
