(function(root){
'use strict';

const names=['Opal','Sapphire','Amethyst','Emerald','Ruby','Gold','Obsidian','Diamond','Sovereign'];
const foilColors=['#fa3d7d','#3e8bff','#b052ff','#24dfad','#ff4c3d','#ffbf20','#5f63ff','#37d9ff','#ffb54a'];
const rarityNames=['Common','Uncommon','Rare','Epic','Legendary','Grail'];
const rarityColors=['#88a3cb','#41dfb0','#439cff','#aa5bff','#ff4c60','#ffcf36'];
const covers=[
 ['opal','agate','calcite'],['sapphire','fluorite','basalt'],['amethyst','calcite','agate'],
 ['emerald','fluorite','granite'],['garnet','jasper','sandstone'],['pyrite','agate','sandstone'],
 ['obsidian','basalt','tourmaline'],['diamond','calcite','sapphire'],['tourmaline','garnet','emerald']
];
const signatureCards=['opal','sapphire','amethyst','emerald','jasper','pyrite','obsidian','diamond','tourmaline'];
const rarityWeights=[42,26,17,9,5,1];

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
  id:'rocks-'+index,index,name,color:foilColors[index],
  cover:covers[index].map(id=>'rock-'+id),signature:'rock-'+signatureCards[index]
 }));
}
function pools(catalog){
 return rarityNames.map((_,tier)=>catalog.filter(item=>item.tier===tier));
}
function itemOdds(item,pack,group){
 const signatureInGroup=group.some(card=>card.id===pack.signature);
 const weight=item.id===pack.signature?2:1;
 return rarityWeights[item.tier]*weight/(group.length+Number(signatureInGroup));
}
function openPack(state,catalog,pack,quantity,rng=random){
 if(![1,3,5].includes(quantity))throw Error('Invalid quantity');
 const groups=pools(catalog);
 const pulls=Array.from({length:quantity},()=>{
  let roll=rng()*100;
  const tier=rarityWeights.findIndex(weight=>(roll-=weight)<0);
  const group=groups[tier];
  let pick=rng()*rarityWeights[tier];
  const item=group.find(card=>(pick-=itemOdds(card,pack,group))<0)||group.at(-1);
  return {uid:uuid(),itemId:item.id,value:0,tier,packId:pack.id,date:new Date().toISOString(),locked:false};
 });
 state.opened+=quantity;
 for(const pull of pulls){
  state.vault.unshift(pull);
  if(!state.discovered.includes(pull.itemId))state.discovered.push(pull.itemId);
 }
 return {pulls,pack,quantity};
}

function defaults(){
 return {version:4,balance:0,vault:[],discovered:[],opened:0,spent:0,sold:0,best:0,deposited:0,referralClaimed:false,name:'',history:[],settings:{sound:true,haptics:true},preferences:{category:'rocks',packIndex:0}};
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
  card.value>=0&&card.value<=1e12&&Number.isInteger(card.tier)&&card.tier>=0&&card.tier<rarityNames.length;
 const cardList=list=>Array.isArray(list)&&list.length<50000&&list.every(validCard);
 const discoveries=list=>Array.isArray(list)&&list.every(knownId);

 return Number.isSafeInteger(state.balance)&&state.balance>=0&&state.balance<=1e14&&cardList(state.vault)&&
  new Set(state.vault.map(card=>card.uid)).size===state.vault.length&&
  (state.retiredCards===undefined||cardList(state.retiredCards))&&
  ['opened','spent','sold','best','deposited'].every(key=>Number.isSafeInteger(state[key])&&state[key]>=0)&&
  discoveries(state.discovered)&&(state.retiredDiscoveries===undefined||discoveries(state.retiredDiscoveries))&&
  typeof state.name==='string'&&state.name.length<=24&&Array.isArray(state.history)&&state.history.length<=150&&
  state.history.every(entry=>entry&&typeof entry.label==='string'&&Number.isSafeInteger(entry.amount)&&!isNaN(Date.parse(entry.date)));
}

const engine={rarityNames,rarityColors,rarityWeights,packs,pools,itemOdds,openPack,defaults,migrate,validSave,random};
if(typeof module!=='undefined'&&module.exports)module.exports=engine;
else root.TCGEngine=engine;
})(typeof window==='undefined'?globalThis:window);
