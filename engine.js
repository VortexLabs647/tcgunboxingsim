(function(root){
'use strict';
const categories={creatures:{name:'Creatures',packLabel:'CREATURES',icon:'creatures',color:'#bd89ff',prices:[100,200,500,1000,1500,2500,5000,7500,10000]},football:{name:'Football',icon:'football',color:'#55decb',prices:[100,200,500,1000,1500,2500,5000,7500,10000]},basketball:{name:'Basketball',icon:'basketball',color:'#ff9973',prices:[100,200,500,1000,1500,2500,5000,7500,10000]},sneakers:{name:'Sneakers',icon:'sneakers',color:'#70c4ff',prices:[100,200,500,1000,1500,2500,5000,7500,10000]}};
const names=['Opal','Sapphire','Amethyst','Emerald','Ruby','Gold','Obsidian','Diamond','Sovereign'];
const foilColors=['#fa3d7d','#3e8bff','#b052ff','#24dfad','#ff4c3d','#ffbf20','#5f63ff','#37d9ff','#ffb54a'];
const rarityNames=['Common','Uncommon','Rare','Epic','Legendary','Grail'];
const rarityColors=['#88a3cb','#41dfb0','#439cff','#aa5bff','#ff4c60','#ffcf36'];
const modes={Normal:{cap:20,description:'A full rarity spread with smaller wins between the big hits.'},High:{cap:20,description:'Fewer mid-tier pulls, with more weight on the Grail chase.'},Max:{cap:20,description:'90% Common, 10% Grail. Each opening is independent.'},Ultra:{cap:20,description:'Common or Grail, with a top chase capped at 20× pack price.'}};
// Published Crown TCG tier percentages, captured 2026-11-22; see ODDS.md.
modes.Gamble={cap:20,description:'Gamble mode: 90% Common and 10% Grail per card. Wild bonuses are disabled in this mode.'};
const oddsProfiles={"starter":{"price":100,"bounds":[1,1,2,3,4],"minimum":0.1,"commonMax":0.6,"Normal":[60,0,29.6,7.9,1.9,0.6],"High":[80,0,7.7,5.2,3.1,4],"Max":[90,0,0,0,0,10],"Ultra":[85,0,0,0,0,15],"name":"Starter","url":"https://www.crowncards.com/packs/pok-mon-starter-pack"},"select":{"price":250,"bounds":[0.4,1,1.2,1.6,2],"minimum":0.2,"Normal":[27,23,19.8,19.5,7,3.7],"High":[27.9,52.1,1.8,3.5,3.2,11.5],"Max":[90,0,0,0,0,10],"Ultra":[79.93,0,0,0,0,20.07],"name":"Select","url":"https://www.crowncards.com/packs/pok-mon-select-pack"},"basic":{"price":500,"bounds":[0.4,1,1.2,1.4,1.8],"minimum":0.2,"Normal":[25.2,24.8,19.2,12.9,13.5,4.4],"High":[27,53,3.1,3.1,5.8,8],"Max":[90,0,0,0,0,10],"Ultra":[74.66,0,0,0,0,25.34],"name":"Basic","url":"https://www.crowncards.com/packs/pok-mon-basic-pack"},"signature":{"price":1000,"bounds":[0.5,1,1.5,2,2.5],"minimum":0.3,"Normal":[29.6,20.4,38.9,8.7,1.9,0.5],"High":[33.7,46.3,6.4,4.6,3.1,5.9],"Max":[90,0,0,0,0,10],"Ultra":[85,0,0,0,0,15],"name":"Signature","url":"https://www.crowncards.com/packs/pok-mon-signature-pack"},"bronze":{"price":2500,"bounds":[0.4,1,1.2,1.4,2],"minimum":0.32,"Normal":[37.8,12.2,20.6,12.2,13.5,3.7],"High":[51.4,28.6,2,1.8,4.2,12],"Max":[90,0,0,0,0,10],"Ultra":[74.61,0,0,0,0,25.39],"name":"Bronze","url":"https://www.crowncards.com/packs/pok-mon-bronze-pack"},"silver":{"price":5000,"bounds":[0.4,1,1.1,1.3,1.8],"minimum":0.3,"Normal":[19.9,30.1,16,14,15.8,4.19],"High":[17.9,62.09,1.1,1.7,5.41,11.8],"Max":[90,0,0,0,0,10],"Ultra":[85,0,0,0,0,15],"name":"Silver","url":"https://www.crowncards.com/packs/pok-mon-silver-pack"},"gold":{"price":10000,"bounds":[0.5,1,1.25,1.5,1.75],"minimum":0.3,"Normal":[29.4,20.6,32.9,7.5,5.9,3.7],"High":[28.67,51.25,4.5,2.3,3.3,9.99],"Max":[90,0,0,0,0,10],"Ultra":[72.03,0,0,0,0,27.97],"name":"Gold","url":"https://www.crowncards.com/packs/pok-mon-gold-pack"}};
for(const profile of Object.values(oddsProfiles))profile.Gamble=[90,0,0,0,0,10];
const packProfiles=['starter','select','basic','signature','signature','bronze','silver','silver','gold'];
function oddsProfile(pack){return oddsProfiles[packProfiles[pack.index]]||oddsProfiles.starter;}
function random(){return crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;}
function uuid(){if(crypto.randomUUID)return crypto.randomUUID();return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{let n=Math.floor(random()*16);return(c==='x'?n:(n&3)|8).toString(16);});}
function value(item){const n=item?.value;return Number.isSafeInteger(n)&&n>0?n:0;}
function packs(catalog){return Object.entries(categories).flatMap(([category,c])=>c.prices.map((price,index)=>({id:category+'-'+index,category,index,price,name:names[index],color:foilColors[index]})));}
function pools(catalog,pack,mode='Normal'){
 const settings=modes[mode],profile=oddsProfile(pack);if(!settings)throw Error('Unknown odds');
 const all=catalog.filter(i=>i.category===pack.category&&value(i)>0&&value(i)<=pack.price*settings.cap).sort((a,b)=>value(a)-value(b));
 if(!all.length)throw Error('No cards available within this pack’s value limit.');
 const groups=Array.from({length:6},()=>[]),chances=profile[mode],used=new Set();
 const binary=mode==='Max'||mode==='Ultra'||mode==='Gamble',commonEnd=binary?(profile.commonMax??profile.bounds[0]):profile.bounds[0];
 for(let tier=0;tier<6;tier++){
  if(!chances[tier])continue;
  const low=tier===0?profile.minimum:binary?(mode==='Max'||mode==='Gamble'?5:profile.bounds[4]):profile.bounds[tier-1];
  const high=tier===5?settings.cap:tier===0?commonEnd:profile.bounds[tier];
  let items=all.filter(i=>!used.has(i.id)&&value(i)>=pack.price*low&&(tier===5?value(i)<=pack.price*high:value(i)<pack.price*high));
  // Sparse original-art value bands use the closest unused card; the UI shows its actual value.
  if(!items.length){const target=pack.price*(low+high)/2,nearest=all.filter(i=>!used.has(i.id)).reduce((best,i)=>!best||Math.abs(value(i)-target)<Math.abs(value(best)-target)?i:best,null);if(nearest)items=[nearest];else throw Error('Not enough cards within this pack’s value limit.');}
  groups[tier]=items;items.forEach(i=>used.add(i.id));
 }
 return groups;
}
function odds(catalog,pack,mode='Normal'){
 if(!modes[mode])throw Error('Unknown odds');
 const published=oddsProfile(pack)[mode],active=published.filter(n=>n>0).length;
 // Public percentages are rounded. Spread a +/-0.01% rounding remainder across active tiers.
 const remainder=(100-published.reduce((a,b)=>a+b,0))/active;
 return published.map(n=>n?n+remainder:0);
}
function itemWeights(pool){if(!pool.length)return [];const minimum=Math.min(...pool.map(value)),weights=pool.map(i=>Math.pow(minimum/value(i),6)),total=weights.reduce((a,b)=>a+b,0),floor=1e-7;return weights.map(w=>(1-floor*pool.length)*w/total+floor);}
function itemOdds(catalog,pack,mode='Normal'){const chances=odds(catalog,pack,mode);return pools(catalog,pack,mode).map((pool,t)=>itemWeights(pool).map(w=>w*chances[t]));}
function expectedReturn(catalog,pack,mode='Normal'){const chances=itemOdds(catalog,pack,mode);return pools(catalog,pack,mode).reduce((sum,g,t)=>sum+g.reduce((a,i,n)=>a+value(i)*chances[t][n]/100,0),0)/pack.price;}
function sample(catalog,pack,mode='Normal',rng=random){
 const chances=odds(catalog,pack,mode);let n=rng()*100,tier=5;for(let t=0;t<6;t++){n-=chances[t];if(n<0){tier=t;break;}}
 const pool=pools(catalog,pack,mode)[tier],weights=itemWeights(pool);let choice=rng(),index=pool.length-1;
 for(let i=0;i<weights.length;i++){choice-=weights[i];if(choice<0){index=i;break;}}
 const item=pool[index];return {uid:uuid(),itemId:item.id,value:value(item),tier,packId:pack.id,mode,date:new Date().toISOString(),locked:false};
}
const depositLimit=1000,refillThreshold=100;
function depositAmount(raw){if(!/^(?:\d+)(?:\.\d{1,2})?$/.test(String(raw).trim()))return 0;const cents=Math.round(Number(raw)*100);return Number.isSafeInteger(cents)&&cents>0&&cents<=depositLimit?cents:0;}
function redeemReferral(state,code){if(String(code).trim().toLowerCase()!=='cccollectables')return {ok:false,reason:'invalid',amount:0};if(state.referralClaimed)return {ok:false,reason:'claimed',amount:0};state.referralClaimed=true;state.balance+=10000;return {ok:true,amount:10000};}
function canDeposit(state){return Number.isSafeInteger(state.balance)&&state.balance>=0&&state.balance<refillThreshold;}
function deposit(state,raw){const amount=depositAmount(raw);if(!amount||!canDeposit(state))return 0;state.balance+=amount;state.deposited+=amount;return amount;}
function defaults(){return {version:4,balance:0,vault:[],discovered:[],opened:0,spent:0,sold:0,best:0,deposited:0,referralClaimed:false,name:'',history:[],settings:{sound:true,haptics:true},preferences:{category:'creatures',packIndex:0}};}
const legacyCategories={pokemon:'creatures',creatures:'creatures',wilds:'creatures',cosmic:'basketball',mechs:'football',relics:'sneakers',sneakers:'sneakers',football:'football',basketball:'basketball'};
function resolveCategory(category){return categories[category]?category:legacyCategories[category]||'creatures';}
function legacyItem(id,catalog,valueHint=0){const exact=catalog.find(i=>i.id===id);if(exact)return exact;const match=/^(pokemon|creatures|sneakers|football|basketball|wilds|cosmic|mechs|relics)-(\d+)$/.exec(id);if(!match)return null;const list=catalog.filter(i=>i.category===legacyCategories[match[1]]);if(!list.length)return null;if(valueHint>0)return list.reduce((best,i)=>Math.abs(value(i)-valueHint)<Math.abs(value(best)-valueHint)?i:best,list[0]);return list[(Number(match[2])-1)%list.length]||null;}
function migrate(old,catalog){const s={...defaults(),...old,version:4,settings:{sound:true,haptics:true},preferences:{...defaults().preferences,...old.preferences}};s.preferences.category=resolveCategory(s.preferences.category);if(old.version===1){s.balance=Math.max(0,old.balance-100000);if(s.name==='Collector')s.name='';}s.vault=(s.vault||[]).flatMap(v=>{const item=legacyItem(v.itemId,catalog,v.value);if(!item)return [];return [{...v,itemId:item.id,value:v.value>0?v.value:value(item)}];});s.discovered=[...new Set((s.discovered||[]).map(id=>legacyItem(id,catalog)?.id).filter(Boolean))];s.best=Math.max(s.best||0,...s.vault.map(v=>v.value),0);s.history=[];return s;}
function validSave(s,catalog){return s&&[1,2,3,4].includes(s.version)&&Number.isSafeInteger(s.balance)&&s.balance>=0&&s.balance<=1e14&&Array.isArray(s.vault)&&s.vault.length<50000&&s.vault.every(v=>typeof v.uid==='string'&&legacyItem(v.itemId,catalog,v.value)&&Number.isSafeInteger(v.value)&&v.value>=0&&v.value<=1e12&&Number.isInteger(v.tier)&&v.tier>=0&&v.tier<6)&&new Set(s.vault.map(v=>v.uid)).size===s.vault.length&&['opened','spent','sold','best','deposited'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0)&&Array.isArray(s.discovered)&&s.discovered.every(id=>legacyItem(id,catalog))&&typeof s.name==='string'&&s.name.length<=24&&Array.isArray(s.history)&&s.history.length<=150&&s.history.every(h=>typeof h.label==='string'&&Number.isSafeInteger(h.amount)&&!isNaN(Date.parse(h.date)));}
const wildChance=.1;
function wildPull(catalog,pack,mode,rng){const pool=pools(catalog,pack,'Normal')[5].filter(i=>mode!=='Ultra'||value(i)<=pack.price*20);if(!pool.length)throw Error('No Grail cards available for Wild');const weights=itemWeights(pool);let pick=rng(),index=pool.length-1;for(let i=0;i<weights.length;i++){pick-=weights[i];if(pick<0){index=i;break;}}const item=pool[index];return {uid:uuid(),itemId:item.id,value:value(item),tier:5,packId:pack.id,mode,date:new Date().toISOString(),locked:false,wild:true};}
function purchase(state,catalog,pack,mode,quantity,rng=random){if(![1,3,5].includes(quantity))throw Error('Invalid quantity');const cost=pack.price*quantity;if(state.balance<cost)return null;const wild=mode!=='Gamble'&&rng()<wildChance,pulls=Array.from({length:quantity},()=>wild?wildPull(catalog,pack,mode,rng):sample(catalog,pack,mode,rng));state.balance-=cost;state.spent+=cost;state.opened+=quantity;for(const p of pulls){state.vault.unshift(p);if(!state.discovered.includes(p.itemId))state.discovered.push(p.itemId);state.best=Math.max(state.best,p.value);}return {pulls,pack,mode,quantity,cost,sold:false,wild};}

function sell(state,ids){const set=new Set(ids);let amount=0,count=0;state.vault=state.vault.filter(v=>{if(set.has(v.uid)&&!v.locked&&v.value>0){amount+=v.value;count++;return false;}return true;});state.balance+=amount;state.sold+=amount;return {amount,count};}
const engine={wildChance,oddsProfile,oddsProfiles,packProfiles,itemWeights,itemOdds,resolveCategory,legacyItem,odds,expectedReturn,redeemReferral,depositLimit,refillThreshold,depositAmount,canDeposit,deposit,categories,names,foilColors,rarityNames,rarityColors,modes,value,packs,pools,sample,defaults,migrate,validSave,purchase,sell,random,uuid};if(typeof module!=='undefined'&&module.exports)module.exports=engine;else root.TCGEngine=engine;
})(typeof window==='undefined'?globalThis:window);
