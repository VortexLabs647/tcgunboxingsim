'use strict';
const E=window.TCGEngine, A=window.TCGArena;
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=n=>`<svg class="icon" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const date=d=>new Date(d).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
const KEY='tcg-unboxing-sim-v2';
let leaderboardLoaded=0,leaderboardLoading=false,leaderboardRows=null,leaderboardError='';
const effectBuses=new Map();
let lastClickTime=-Infinity,packSoundUntil=0,audioMix=null,audioResuming=null,winSources=new Set(),winStopTimer=null;
const profileSections=new Set();
const programmaticPackScroll = new WeakSet();
let lastTickAt=0,cardSequence=0,wheelAudioFrame=0,winMusicGain=null;
const SPIN_MS=2400,RESULT_MS=900;
// Match short, frequency-weighted listening levels across the game's sound cues.
const CUE_GAIN = {'arena-win':3.8,'arena-loss':4.4,'arena-special':3.5,'arena-hit':3.8, 'arena-guard':4.8, 'arena-chip':4.8, tick:21.5, click:14.4, 'pack-select':4.5,'pack-open':5.5, wheel:14, land:4.1, vault:6.1, hit:3.3, coin:5};
const WIN_MUSIC_GAIN = .56;
const chance=(n,digits=3)=>n>0&&n<.001?'<0.0010%':Number(n.toFixed(digits))+'%';
let state=E.defaults(),catalog=[],byId={},packs=[],view='packs',selectedIndex=0,odds='Balanced',search='',sort='recent',detailId=null,detailUid=null,previousView='collection',pending=null,phase='idle',timers=[],audioCtx=null,confirmAction='',carouselTimer=null,feedback='';
function selectedPack(){return packs[selectedIndex];}
function notice(message){
 if(view==='battle'){
  const status=$('.arena-turn span,#arenaStatus:not(.arena-turn)');
  if(status)status.textContent=message;
  return;
 }
 $('#status').textContent=message;
}
function save(){state.preferences={category:'rocks',packIndex:selectedIndex,arenaTeam:[...arenaTeam]};const cloud=window.TCGCloud;if(cloud?.user&&!cloud.ready){updateHeader();return;}try{localStorage.setItem(cloud?.user?cloud.cacheKey(cloud.user.id):KEY,JSON.stringify(state));}catch{notice('Your device storage is full. Progress could not be saved.');}if(cloud?.user)cloud.queue(state);updateHeader();}
function replaceGameState(next){if(!E.validSave(next,catalog))return;clearAnimation();pending=null;phase='idle';clearArenaResult();onlineRoom=null;arenaMatch=null;arenaLevelIndex=null;state=E.migrate(next,catalog);restoreArenaTeam();incomeNeedsSave=false;lastIncomeSave=0;selectedIndex=Math.max(0,Math.min(packs.length-1,state.preferences.packIndex||0));if(view==='opening')view='profile';render();}
function guestGameState(){try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(E.validSave(saved,catalog))return E.migrate(saved,catalog);}catch{}return E.defaults();}

function money(units){
 const precision=units%E.unitsPerCent===0?2:6;
 return '$'+(units/1000000).toLocaleString('en-US',{minimumFractionDigits:precision,maximumFractionDigits:precision});
}
function rateMoney(units){
 const amount=(units/1000000).toFixed(8).replace(/0+$/,'');
 return '$'+amount.padEnd(8,'0')+'/sec';
}
function updateMoney(){
 const whole=money(state.balance*E.unitsPerCent);
 $('#rockBalance').textContent=whole;
 $('#balanceFraction').textContent=String(state.rockRemainder).padStart(4,'0');
 $('.balance-pill').setAttribute('aria-label','Virtual balance and badges: '+whole+String(state.rockRemainder).padStart(4,'0'));
 const rate=$('#incomeRate');
 if(rate){
  const income=E.activeRocks(state).reduce((sum,rock)=>sum+E.incomeRate(state,rock),0);
  const starter=state.vault.find(rock=>rock.uid===E.starterId);
  const boost=starter?E.incomeRate(state,starter):0;
  const starterRate=$('#starterRate');
  if(starterRate)starterRate.textContent=boost?rateMoney(boost):'On standby';
  rate.textContent=rateMoney(income+boost);
 }
 for(const button of $$('[data-action="buy-badge"]'))button.disabled=state.balance<E.badges[button.dataset.id].price;
 const openButton=$('.pack-open-action');
 if(openButton)openButton.disabled=!E.canAfford(state,selectedPack());
}
let incomeNeedsSave=false,lastIncomeSave=0,incomeNoticeTimer,rockNoticeTimer;
function showAwayIncome(earned){
 if(view==='battle')return;
 const message='Rocks earned '+money(earned)+' while you were away.';
 notice(message);
 clearTimeout(incomeNoticeTimer);
 incomeNoticeTimer=setTimeout(()=>{if($('#status').textContent===message)notice('');},6500);
}
function settleRockIncome(now=Date.now(),announceAway=false){
 const elapsed=now-state.rockClock;
 const earned=E.settleIncome(state,now);
 if(announceAway&&earned>0&&elapsed>=10000){
  showAwayIncome(earned);
 }
 return earned;
}
function incomeTick(force=false,announceAway=false){
 const cloud=window.TCGCloud;
 if(!catalog.length||(!force&&document.hidden)||(cloud?.user&&!cloud.canAccrue))return;
 const now=Date.now();
 if(settleRockIncome(now,announceAway)>0)incomeNeedsSave=true;
 if(incomeNeedsSave&&(force||now-lastIncomeSave>=30000)){
  save();
  incomeNeedsSave=false;
  lastIncomeSave=now;
 }
 if(!document.hidden)updateMoney();
}
function sellRock(uid){
 const proceeds=E.sellRock(state,uid);
 if(proceeds===null)return;
 arenaTeam.delete(uid);
 save();
 if(view==='opening')go('packs');
 else render();
 sound('coin');
 const message='Rock sold · +'+money(proceeds);
 notice(message);
 clearTimeout(rockNoticeTimer);
 rockNoticeTimer=setTimeout(()=>{if($('#status').textContent===message)notice('');},1600);
}

function updateHeader(){
 updateMoney();
 $('#userInitials').textContent=(state.name||'Player').slice(0,2).toUpperCase();
}
function nav(){
 const active=['vault','collection'].includes(view)?'vault':view==='item'&&['vault','collection'].includes(previousView)?'vault':view;
 const links=[['packs','grid','Packs'],['vault','card','Cards'],['battle','arena','Battle'],['leaderboard','star','Ranks'],['profile','user','Profile']];
 const html=links.map(([key,i,name])=>`<a href="#${key}" class="nav-link ${key===active?'active':''}" ${key===active?'aria-current="page"':''}>${icon(i)}<span>${name}</span></a>`).join('');
 $('#desktopNav').innerHTML=html;
 $('#bottomNav').innerHTML=html;
}
function clearAnimation(audioOptions){
 cancelAnimationFrame(wheelAudioFrame);
 stopEffects(audioOptions);
 timers.forEach(clearTimeout);
 timers=[];
 clearTimeout(carouselTimer);
}
function go(next){
 stopWinMusic();
 // The tap that triggered navigation is already playing when this runs.
 const audioOptions={keepClick:true};
 if(view==='opening'&&next!=='opening'){
  clearAnimation(audioOptions);
  pending=null;
  phase='idle';
 }else stopEffects(audioOptions);
 if(view==='battle'&&next!=='battle'&&arenaMatch&&arenaMatch.winner!==null){
  clearArenaResult();
  arenaMatch=null;
  onlineRoom=null;
  arenaMessage='';
 }
 view=['packs','vault','collection','profile','battle','leaderboard','opening','item'].includes(next)?next:'packs';
 search='';confirmAction='';feedback='';notice('');
 if(location.hash!=='#'+view)history.replaceState(null,'','#'+view);
 render();
 window.scrollTo({top:0,behavior:'instant'});
}
function render(){document.body.dataset.view=view;nav();updateHeader();const app=$('#app');app.innerHTML=view==='packs'?packsView():view==='vault'?vaultView():view==='collection'?collectionView():view==='battle'?arenaView():view==='leaderboard'?leaderboardView():view==='profile'?profileView():view==='item'?itemView():openingView();if(view==='leaderboard')loadLeaderboard();if(view==='packs')bindCarousel();updateMoney();if(view==='battle')showArenaResult();}
function heading(kicker,title){return `<div class="page-heading"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1></div></div>`;}
function packArt(pack){
 return `<div class="foil rocks" data-edition="${pack.name}" style="--foil:${pack.color};--print-position:${(pack.index+1)*100/9}%"><div class="pack-seal top" aria-hidden="true"></div><div class="foil-body"><div class="foil-shine"></div><div class="foil-logo pack-print" aria-hidden="true"></div><div class="foil-art">${[...pack.cover.slice(1),pack.cover[0]].map((id,index)=>cardImage(byId[id],'art-'+index)).join('')}</div><div class="foil-crest" aria-hidden="true"></div>${pack.index<9?`<div class="foil-title pack-print" aria-hidden="true"></div>`:`<div class="foil-edition-name" aria-hidden="true">${pack.name}</div>`}</div></div>`;
}

function packsView(){
 const selected=selectedPack();
 return `<div class="pack-room" style="--foil:${selected.color}">
   <header class="pack-room-heading"><h1>Open Packs</h1></header>
   <div class="pack-showcase">
   <section class="carousel-shell" aria-label="Choose a pack edition">
     <div class="pack-carousel" id="packCarousel" tabindex="0" aria-label="Scrollable pack selector">
       ${packs.map(pack=>`<button class="pack-choice ${pack.index===selectedIndex?'selected':''}" style="--foil:${pack.color}" data-action="choose-pack" data-id="${pack.index}" aria-pressed="${pack.index===selectedIndex}" aria-label="${pack.name} Rock Pack">
         ${packArt(pack)}<span class="pack-cost"><b>${pack.name}</b><strong>${money(pack.price*E.unitsPerCent)}</strong></span>
       </button>`).join('')}
     </div>
     <div class="carousel-controls">
       <button data-action="previous-pack" aria-label="Previous pack">${icon('chevron')}<span>Previous</span></button>
       <p class="pack-edition-count" role="status" data-total="${packs.length}">${editionPosition(selected,packs.length)}</p>
       <button data-action="next-pack" aria-label="Next pack"><span>Next</span>${icon('chevron')}</button>
     </div>
   </section>
   <section class="pack-panel" id="packPanel" aria-label="Selected pack">${packPanel()}</section>
   </div>
   ${collectionSpotlight()}
   <dialog id="packDetails" class="pack-dialog" aria-labelledby="packDetailsTitle">
     <header>
       <div class="pack-odds-art" aria-hidden="true" hidden></div>
       <div><p class="pack-dialog-pack" hidden></p><h2 id="packDetailsTitle"></h2></div>
       <form method="dialog"><button aria-label="Close pack details" autofocus>${icon('close')}</button></form>
     </header>
     <div id="packDetailsBody" class="pack-dialog-body"></div>
   </dialog>
 </div>`;
}
function editionPosition(pack,total){
 return `${pack.name} · ${pack.index+1} of ${total}`;
}
function packPanel(){
 const pack=selectedPack();
 const price=money(pack.price*E.unitsPerCent);
 return `<h2 class="sr-only">${pack.name} Rock Pack</h2>
   <div class="pack-quick-links" role="group" aria-label="Pack details">
     <button data-action="pack-details" data-id="odds" aria-haspopup="dialog"><span>Odds</span><small id="packOddsLabel">${odds}</small></button>
     <button data-action="pack-details" data-id="cards" aria-haspopup="dialog">Cards</button>
   </div>
   <div class="pack-action-dock">
     <button class="primary open-pack-button pack-open-action" data-action="open" ${E.canAfford(state,pack)?'':'disabled'}>${E.hasWelcomePack(state,pack)?'Open free starter pack':'Open pack · '+price}</button>
   </div>`;
}

function openPackDetails(kind){
 const dialog=$('#packDetails'),pack=selectedPack();
 const title=$('#packDetailsTitle',dialog),content=$('#packDetailsBody',dialog);
 const art=$('.pack-odds-art',dialog),name=$('.pack-dialog-pack',dialog);
 dialog.dataset.kind=kind;
 art.hidden=name.hidden=kind!=='odds';
 art.innerHTML=kind==='odds'?packArt(pack):'';
 name.textContent=`${pack.name} Rock Pack`;
 if(kind==='odds'){
  title.textContent='Pack odds';
  content.innerHTML=oddsView();
 }else if(kind==='cards'){
  title.textContent='Cards in this pack';
  content.innerHTML=insideLineup(pack);
 }else return;
 dialog.addEventListener('close',()=>{
  if(dialog.isConnected)$(`[data-action="pack-details"][data-id="${kind}"]`)?.focus({preventScroll:true});
 },{once:true});
 dialog.showModal();
 content.scrollTop=0;
}

function oddsView(){
 return `<div class="mode-tabs rock-odds-tabs" role="group" aria-label="Odds preset">
  ${Object.keys(E.oddsPresets).map(preset=>`<button data-action="rock-odds" data-id="${preset}" class="${odds===preset?'active':''}" aria-pressed="${odds===preset}">${preset}</button>`).join('')}
 </div>
 <ul class="pack-odds-list">${E.oddsPresets[odds].map((percent,tier)=>percent>0?`<li style="--rarity:${E.rarityColors[tier]}">
  <div><span>${E.rarityNames[tier]}</span><strong>${percent}%</strong></div>
  <progress max="100" value="${percent}" aria-label="${E.rarityNames[tier]}"></progress>
 </li>`:'').reverse().join('')}</ul>`;
}

function scrollToPack(rail, choice, smooth = false) {
  // Use layout coordinates so the pack's visual scale does not shift its snap point.
  const left = choice.offsetLeft - (rail.clientWidth - choice.offsetWidth) / 2;
  const nearby = Math.abs(left - rail.scrollLeft) <= rail.clientWidth;
  const animate = smooth && nearby && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  programmaticPackScroll.add(rail);
  rail.scrollTo({ left, behavior: animate ? 'smooth' : 'instant' });
}

function bindCarousel() {
  const rail = $('#packCarousel');
  if (!rail) return;
  clearTimeout(carouselTimer);
  const choices = $$('.pack-choice', rail);
  scrollToPack(rail, choices[selectedIndex]);

  let drag = null;
  let dragged = false;
  rail.addEventListener('touchend', unlockSound, { passive: true });
  rail.addEventListener('wheel', () => programmaticPackScroll.delete(rail), { passive: true });
  rail.addEventListener('pointerdown', event => {
    programmaticPackScroll.delete(rail);
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    drag = { x: event.clientX, left: rail.scrollLeft };
    dragged = false;
  });
  rail.addEventListener('pointermove', event => {
    if (!drag) return;
    const delta = event.clientX - drag.x;
    if (Math.abs(delta) > 8) {
      dragged = true;
      rail.classList.add('dragging');
      rail.scrollLeft = drag.left - delta;
    }
  });
  const endDrag = () => {
    drag = null;
    rail.classList.remove('dragging');
    setTimeout(() => { dragged = false; }, 0);
  };
  for (const event of ['pointerup', 'pointerleave', 'pointercancel']) {
    rail.addEventListener(event, endDrag);
  }
  rail.addEventListener('click', event => {
    if (dragged) {
      event.preventDefault();
      event.stopPropagation();
      dragged = false;
    }
  }, true);
  const settleSelection = () => {
    if (view !== 'packs' || !rail.isConnected || drag || programmaticPackScroll.has(rail)) return;
    const middle = rail.scrollLeft + rail.clientWidth / 2;
    let closest = 0;
    let best = Infinity;
    choices.forEach((choice, index) => {
      const distance = Math.abs(choice.offsetLeft + choice.offsetWidth / 2 - middle);
      if (distance < best) {
        best = distance;
        closest = index;
      }
    });
    if (rail.scrollLeft <= 1) closest = 0;
    else if (rail.scrollLeft >= rail.scrollWidth - rail.clientWidth - 1) closest = choices.length - 1;
    if (closest !== selectedIndex) selectPack(closest, false);
  };
  if ('onscrollend' in rail) {
    rail.addEventListener('scrollend', settleSelection);
  } else {
    rail.addEventListener('scroll', () => {
      clearTimeout(carouselTimer);
      carouselTimer = setTimeout(settleSelection, 160);
    }, { passive: true });
  }
  rail.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      selectPack(selectedIndex + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  updateCarouselControls();
}

function selectPack(index, scroll = true) {
  const before = selectedIndex;
  selectedIndex = Math.max(0, Math.min(packs.length-1, Number(index)));
  if (before !== selectedIndex) sound('pack-select');
  save();

  const pack = selectedPack();
  const rail = $('#packCarousel');
  const choices = $$('.pack-choice', rail);
  choices.forEach((choice, i) => {
    choice.classList.toggle('selected', i === selectedIndex);
    choice.setAttribute('aria-pressed', String(i === selectedIndex));
  });
  const counter = $('.pack-edition-count');
  if (before !== selectedIndex) counter.textContent = editionPosition(pack,counter.dataset.total);
  $('.pack-room').style.setProperty('--foil', pack.color);
  updatePackPanel();
  updateCarouselControls();
  if (scroll) scrollToPack(rail, choices[selectedIndex], true);
}
function itemCard(item,own=null,itemChance=null,earning=false){
 return `<article class="item-card" style="--rarity:${E.rarityColors[item.tier]}">
  <button class="item-button" data-action="item" data-id="${item.id}" aria-label="View ${escape(item.name)}" ${own?`data-uid="${escape(own.uid)}"`:''}>
   <div class="item-visual rocks">${cardImage(item)}${state.discovered.includes(item.id)?'<span class="item-badge" aria-label="Collected" title="Collected">✓</span>':''}</div>
   <div class="item-copy"><span class="rarity">${E.rarityNames[item.tier]}</span><h3>${escape(item.name)}</h3>
    ${itemChance===null?'':`<div class="item-value">${chance(itemChance,2)}</div>`}
   </div>
  </button>
  ${own?`<p class="rock-rate">Lv ${E.cardLevel(own)} · ${E.cardStats(own).damage} ATK</p><p class="rock-rate">${own.uid===E.starterId?'<span id="starterRate"></span>':earning?rateMoney(E.incomeRate(state,own)):'Idle'}</p>
  <div class="item-actions rock-actions">
   <button data-action="favorite" data-id="${own.uid}" aria-label="${own.locked?'Unfavorite':'Favorite'} ${escape(item.name)}" aria-pressed="${!!own.locked}">${own.locked?'★':'☆'}</button>
   ${sellButton(own)}
  </div>`:''}
 </article>`;
}
function sellButton(rock){
 const amount=E.saleProceeds(rock);
 if(!amount)return '<span class="rock-sale-note">Starter rock</span>';
 if(rock.locked)return '<span class="rock-sale-note">Favorited</span>';
 return `<button class="secondary" data-action="sell-rock" data-id="${rock.uid}">Sell · ${money(amount)}</button>`;
}
function stats(values){return `<div class="stats">${values.map(([label,value])=>`<div class="stat"><small>${label}</small><strong>${value}</strong></div>`).join('')}</div>`;}
function empty(title,description,button=true){return `<div class="empty"><h2>${title}</h2><p>${description}</p>${button?'<button class="primary" data-action="packs">Explore packs</button>':''}</div>`;}
function cardsTabs(){
 return `<nav class="card-tabs" aria-label="Card views">
  <a class="secondary" href="#vault" ${view==='vault'?'aria-current="page"':''}>Inventory</a>
  <a class="secondary" href="#collection" ${view==='collection'?'aria-current="page"':''}>Collection</a>
 </nav>`;
}
function vaultView(){
 const earning=new Set(E.activeRocks(state).map(rock=>rock.uid));
 const owned=state.vault.filter(card=>byId[card.itemId]?.name.toLowerCase().includes(search.toLowerCase()));
 if(sort==='rarity')owned.sort((a,b)=>b.tier-a.tier);
 return `<section class="card-browser"><h1 class="sr-only">Inventory</h1>${cardsTabs()}
  <div class="card-meta"><span>${state.vault.length} owned</span><span id="incomeRate"></span></div>
  <div class="toolbar"><div class="search">${icon('search')}<input type="search" id="vaultSearch" placeholder="Find a rock" aria-label="Search inventory" value="${escape(search)}"></div>
   <button class="secondary sort-trigger" data-action="sort-menu" aria-label="Sort inventory" aria-haspopup="dialog">${sort==='rarity'?'Rarest':'Newest'} ${icon('chevron')}</button></div>
  ${owned.length?`<div class="item-grid">${owned.map(card=>itemCard(byId[card.itemId],card,null,earning.has(card.uid))).join('')}</div>`:empty(state.vault.length?'No matches':'Inventory is empty',state.vault.length?'Try another name.':'Open a pack to start collecting.',!state.vault.length)}</section>`;
}
function showSortMenu(){
 const dialog=$('#sortMenu');
 $('#sortChoices',dialog).innerHTML=Object.entries({recent:'Newest',rarity:'Rarest'}).map(([value,label])=>
  `<button class="secondary sort-option" data-action="sort-by" data-id="${value}" aria-pressed="${sort===value}">${label}${sort===value?'<span aria-hidden="true">✓</span>':''}</button>`
 ).join('');
 dialog.showModal();
}
function setSort(value){
 if(!['recent','rarity'].includes(value))return;
 sort=value;
 $('#sortMenu').close();
 render();
 $('.sort-trigger')?.focus({preventScroll:true});
}
function collectionView(){
 const cards=catalog.filter(item=>item.name.toLowerCase().includes(search.toLowerCase()));
 return `<section class="card-browser"><h1 class="sr-only">Collection</h1>${cardsTabs()}
  <div class="card-meta"><span>${state.discovered.length} / ${catalog.length} discovered</span></div>
  <div class="toolbar"><div class="search">${icon('search')}<input type="search" id="collectionSearch" placeholder="Find a rock" aria-label="Search collection" value="${escape(search)}"></div></div>
  ${cards.length?`<div class="item-grid">${cards.map(item=>itemCard(item)).join('')}</div>`:empty('No matches','Try another name.',false)}</section>`;
}
function renderBadgeShop(){
 $('#badgeList').innerHTML=`<p class="badge-summary">Rock income boost <strong>+${E.badgeBoost(state)}%</strong></p>
  ${Object.entries(E.badges).map(([id,badge])=>`<article class="badge-row">
   <div class="badge-stone badge-${id}" aria-hidden="true"></div>
   <div><h3>${badge.name}</h3><p>+${badge.boost}% rock income</p></div>
   ${state.badges.includes(id)?'<span class="badge-owned">Owned</span>':`<button class="primary" data-action="buy-badge" data-id="${id}" aria-label="Buy ${badge.name} badge for ${money(badge.price*E.unitsPerCent)}">${money(badge.price*E.unitsPerCent)}</button>`}
  </article>`).join('')}
  <p class="badge-footnote">One-time purchases with virtual balance. Boosts stack and apply offline. Starter rock has its own rate.</p>`;
 updateMoney();
}
function buyBadge(id){
 if(!E.buyBadge(state,id))return;
 save();
 renderBadgeShop();
 $('#badgeShopTitle').focus();
 $('#badgeStatus').textContent=E.badges[id].name+' badge purchased.';
 sound('vault');
}
function profileSection(id,label,content){return `<details class="profile-fold content-card" data-profile-section="${id}" ${profileSections.has(id)?'open':''}><summary>${label}<span aria-hidden="true">+</span></summary><div class="profile-fold-body">${content}</div></details>`;}
function profileView(){
 const rank=campaignRank();
 const cleared=state.arenaCleared,total=E.arenaLevels.length;
 const bosses=E.arenaLevels.slice(0,cleared).filter(level=>level.boss).length;
 const bossTotal=E.arenaLevels.filter(level=>level.boss).length;
 const team=state.vault.filter(card=>arenaTeam.has(card.uid));
 const milestones=[
  ['Campaign climb',cleared,total],
  ['Boss hunter',bosses,bossTotal],
  ['Rock collector',state.discovered.length,catalog.length]
 ];
 return `<div class="profile-dashboard">
  <header class="simple-profile-heading"><h1>Profile</h1></header>
  <section class="profile-hero" aria-label="Collector overview">
   <div class="profile-portrait" aria-hidden="true"><img src="profile-amethyst.webp" alt="" width="160" height="160"></div>
   <div class="profile-identity">
    <div class="profile-identity-name"><h2>${escape(state.name||'Rock Collector')}</h2><button class="profile-edit" type="button" data-action="edit-collector" aria-label="Edit collector name">✎</button></div>
    <p>${rank.title}</p>
    <div class="profile-progress"><progress aria-label="Campaign progress" value="${cleared}" max="${total}"></progress><strong>${cleared} / ${total} stages cleared</strong></div>
   </div>
   <div class="profile-rank" title="Campaign rank ${rank.number}">${campaignShield(rank.number)}</div>
  </section>
  <div class="profile-overview">
   <section class="profile-data-panel">
    <h2>${icon('star')} Battle stats</h2>
    <dl><div><dt>Stages played</dt><dd>${state.arenaPlayed}</dd></div><div><dt>Stages cleared</dt><dd>${cleared}</dd></div><div><dt>Bosses beaten</dt><dd>${bosses}</dd></div></dl>
   </section>
   <section class="profile-data-panel">
    <h2>${icon('card')} Current team</h2>
    ${team.length?`<div class="profile-team">${team.map(card=>{
     const item=byId[card.itemId];
     return `<div>${cardImage(item,'profile-mini-card')}<strong>Lv. ${E.cardLevel(card)}</strong><span class="profile-team-name" title="${escape(item.name)}">${escape(item.name)}</span></div>`;
    }).join('')}</div>`:'<a class="profile-team-link" href="#battle">Equip cards in Battle</a>'}
   </section>
   <section class="profile-data-panel">
    <h2>${icon('arena')} Achievements</h2>
    <ul class="profile-milestones">${milestones.map(([name,value,max])=>`<li><div><span>${name}</span><strong>${value} / ${max}</strong></div><progress aria-label="${name}" value="${value}" max="${max}"></progress></li>`).join('')}</ul>
   </section>
  </div>
  <section class="profile-data-panel profile-summary-stats">
   <h2>${icon('grid')} My stats</h2>
   ${stats([['Packs opened',state.opened],['Unique rocks',state.discovered.length],['Cards owned',state.vault.length]])}
  </section>
 </div>
 <div class="profile-simple profile-basic"><div>${window.TCGCloud?.panel()||''}</div><section class="content-card collector-card"><h2>COLLECTOR NAME</h2><label class="field-label" for="username">Your collector name</label><div class="profile-name-row"><input id="username" maxlength="24" autocomplete="nickname" value="${escape(state.name)}" placeholder="Choose a name"><button class="primary" data-action="save-name">Save</button></div>${feedback?`<p class="settings-feedback" role="status">${escape(feedback)}</p>`:''}</section><div class="profile-folds">${!window.TCGCloud?.user?profileSection('delete','Delete guest progress',`<div class="delete-details"><p>Permanently delete guest progress from this device. </p>${confirmAction==='delete'?'<button class="secondary danger" data-action="delete-confirm">Delete progress permanently</button><button class="secondary" data-action="cancel-confirm">Keep progress</button>':'<button class="secondary danger" data-action="delete-start">Delete guest progress</button>'}</div>`):''}</div></div>`;}

function itemView(){
 const item=byId[detailId];
 const owned=state.vault.find(card=>card.uid===detailUid&&card.itemId===detailId);
 if(!item)return empty('CARD NOT FOUND.','Choose another rock.');
 const source=owned&&packs.find(pack=>pack.id===owned.packId);
 const stats=owned&&E.cardStats(owned);
 return `<button class="secondary back-button" data-action="back-item">Back to ${previousView==='vault'?'Inventory':previousView==='packs'?'packs':'collection'}</button>
  <div class="detail-page"><div class="detail-image rocks">${cardImage(item)}</div><div class="detail-content">
   <div class="detail-kicker"><span class="rarity" style="--rarity:${E.rarityColors[item.tier]}">${E.rarityNames[item.tier]}</span><span>${escape(item.number)}</span></div>
   <h1>${escape(item.name)}</h1>
   ${owned?`<div class="card-training">
    <p>Lv ${E.cardLevel(owned)} · ${stats.damage} ATK · ${stats.hp} HP</p>
    ${E.cardLevel(owned)<E.maxLevel?`<button class="primary" data-action="upgrade-rock" data-id="${escape(owned.uid)}">Level up · ${money(E.upgradeCost(owned)*E.unitsPerCent)}</button>`:'<p>Max level</p>'}
   </div>`:''}
   ${source?.index?`<p class="detail-lore">${source.name} pack bonus · +${source.index} ATK · +${source.index*3} HP</p>`:''}
   <p class="detail-lore">${escape(item.lore)}</p>
  </div></div>`;
}
function haptic(pattern=20){if(navigator.vibrate)navigator.vibrate(pattern);}
function unlockSound(){
 try{
  if(!audioCtx){
   const Audio=window.AudioContext||window.webkitAudioContext;
   if(!Audio)return;
   audioCtx=new Audio();
   audioMix=audioCtx.createDynamicsCompressor();
   audioMix.threshold.value=-10;
   audioMix.knee.value=6;
   audioMix.ratio.value=5;
   audioMix.attack.value=.004;
   audioMix.release.value=.09;
   audioMix.connect(audioCtx.destination);
  }
  if(audioCtx.state!=='running'&&!audioResuming){
   audioResuming=audioCtx.resume().catch(()=>{}).finally(()=>{audioResuming=null;});
  }
 }catch{}
}

function sound(kind){
 if(document.hidden)return;
 try{
  if(kind==='tick'){
   const now=performance.now();
   if(now-lastTickAt<65)return;
   lastTickAt=now;
  }
  unlockSound();
  if(!audioMix)return;
  const now=audioCtx.currentTime;
  if(kind==='pack-select'&&now<packSoundUntil)return;
  if(kind==='click'){
   if(now-lastClickTime<.07)return;
   lastClickTime=now;
  }
  const effectsBus=audioCtx.createGain();
  const cueSources=new Set();
  effectsBus.gain.value=CUE_GAIN[kind]??1;
  effectsBus.connect(audioMix);
  effectBuses.set(effectsBus,{kind,sources:cueSources});

  const trackEffect=source=>{
   cueSources.add(source);
   source.onended=()=>{
    cueSources.delete(source);
    if(!cueSources.size&&effectBuses.delete(effectsBus))effectsBus.disconnect();
   };
  };

  const tone=(frequency,delay,duration,volume,type='sine',endFrequency=frequency)=>{
   const source=audioCtx.createOscillator(),gain=audioCtx.createGain();
   const start=now+delay,end=start+duration;
   source.type=type;
   source.frequency.setValueAtTime(frequency,start);
   source.frequency.exponentialRampToValueAtTime(endFrequency,end);
   gain.gain.setValueAtTime(.001,start);
   gain.gain.exponentialRampToValueAtTime(volume,start+.005);
   gain.gain.exponentialRampToValueAtTime(.001,end);
   source.connect(gain);
   gain.connect(effectsBus);
   trackEffect(source);
   source.start(start);
   source.stop(end);
  };

  switch(kind){
   case 'tick': tone(720,0,.045,.017,'triangle'); break;
   case 'click':
    tone(460,0,.055,.02,'triangle');
    tone(620,.025,.04,.012);
    break;
   case 'arena-win':
    tone(523,0,.18,.045,'triangle');tone(659,.09,.20,.038,'triangle');tone(1047,.19,.3,.038,'triangle');
    break;
   case 'arena-loss':
    tone(392,0,.16,.045,'triangle');tone(293,.11,.22,.035,'triangle');
    break;
   case 'arena-special':
    tone(398,0,.18,.04,'triangle',760);tone(1038,.1,.14,.035,'triangle');
    break;
   case 'arena-hit':
    tone(205,0,.14,.056,'triangle',73);
    tone(1250,0,.066,.028,'triangle',510);
    break;
   case 'arena-chip':
    tone(228,0,.07,.045,'triangle',100);
    tone(1510,.01,.085,.039,'triangle',680);
    tone(2180,.052,.11,.022,'sine',1160);
    break;
   case 'arena-guard':
    tone(560,0,.09,.033,'triangle');
    tone(835,.035,.13,.028,'sine');
    break;
   case 'wheel':
    tone(310,0,.034,.022,'triangle',155);
    tone(2280,0,.026,.018,'triangle',1300);
    break;
   case 'land':
    tone(200,0,.075,.04,'triangle',102);
    tone(784,.044,.18,.04,'triangle');
    tone(1175,.105,.26,.033);
    break;
   case 'coin':
    tone(1320,0,.14,.029,'triangle');
    tone(1760,.07,.17,.029,'triangle');
    tone(3290,.07,.08,.013);
    break;
   case 'vault':
    tone(530,0,.135,.032,'triangle');
    tone(795,.06,.19,.027);
    break;
   case 'pack-select':
    packSoundUntil=now+.085;
    tone(380,0,.052,.028,'triangle',530);
    tone(720,.019,.07,.019);
    break;
   case 'pack-open':
    tone(170,0,.082,.045,'triangle',87);
    tone(510,.025,.11,.027,'triangle',920);
    tone(1320,.065,.16,.023);
    tone(1760,.101,.18,.014);
    break;
   case 'hit':
    [523,659,784].forEach((frequency,index)=>tone(frequency,index*.095,.28,.045,'sine'));
    break;
  }
 }catch{}
}

function startOpening(){
 if(view!=='packs')return;
 pending=E.openPack(state,catalog,selectedPack(),odds);
 if(!pending){updateMoney();return;}
 stopWinMusic();
 save();
 view='opening';
 history.replaceState(null,'','#opening');
 spinPackWheel();
 sound('pack-open');
 window.scrollTo({top:0,behavior:'instant'});
}
function spinPackWheel(){
 if(matchMedia('(prefers-reduced-motion: reduce)').matches){
  phase='idle';
  reveal();
 }else{
  phase='spinning';
  render();
  spinReveal();
 }
}
function openingView(){
 if(!pending)return empty('READY FOR A NEW PULL?','Choose your next pack.');
 if(phase==='revealed')return resultsView();
 if(phase==='second-chance')return secondChanceView();
 const pack=pending.pack;
 return `<section class="opening-screen spinning" id="openingScreen" style="--foil:${pack.color};--spin-color:#c7a4fb;--spin-time:${SPIN_MS}ms">
   <div class="eyebrow">${pack.name} Rock Pack · ${pending.odds}</div>
   <h1>${pending.extraSpin?'Second Chance · Rarity wheel':'Rarity wheel'}</h1>
   <div class="opening-stage">${raritySpinner()}</div>
   <p class="opening-result" role="status"><strong class="opening-rarity"></strong></p>
 </section>`;
}

function openingPull(){return pending.pull;}

const wheelColors=['#a7afd9','#49dd29','#0795ff','#b939f6','#ffb813','#f23441'];
const wheelSymbols=['★','◆','⬢','♛','✪','🏆'];
function raritySpinner(){
 const slots=E.oddsPresets[pending.odds].flatMap((weight,tier)=>weight>0?[tier]:[]);
 const size=360/slots.length;
 const wedges=slots.map(tier=>({label:E.rarityNames[tier],symbol:wheelSymbols[tier],color:wheelColors[tier],size,tier}));
 return wheelMarkup(wedges,slots.indexOf(openingPull().tier));
}
function wheelMarkup(wedges,winner,secondChance=false){
 const origin=-wedges[0].size/2-(secondChance?90:0);
 let cursor=0;
 const slices=wedges.map(wedge=>{
  const start=cursor;
  cursor+=wedge.size;
  return {...wedge,start,end:cursor,middle:origin+(start+cursor)/2};
 });
 const stops=slices.map(({color,start,end})=>`${color} ${start}deg ${end}deg`).join(',');
 const rotation=1800+((360-slices[winner].middle)%360);
 const stars=secondChance?[34,87,132,180,228,273,326]:slices.map(({end})=>origin+end);
 return `<div class="card-wheel" aria-hidden="true" data-landing-index="${winner}" style="--slice:${360/slices.length}deg;--half-slice:${origin}deg">
   <div class="wheel-rim"></div>
   ${stars.map(angle=>`<i class="wheel-rim-star" style="--star-angle:${angle}deg">★</i>`).join('')}
   <div class="wheel-pointer"></div>
   <div class="wheel-disc" style="--wheel-stop:${rotation}deg;--wheel-colors:conic-gradient(from ${origin}deg,${stops})">
     ${slices.map(({label,symbol,middle,tier,outcome,size})=>`<div class="wheel-slot" ${outcome?`data-outcome="${outcome}"`:`data-tier="${tier}"`} style="--slot-angle:${middle}deg${outcome?';--slot-room:'+Math.min(35,13+size*.17)+'cqw':''}">
       <span class="wheel-label"><b>${label}</b><i>${symbol}</i></span>
     </div>`).join('')}
   </div>
   <div class="wheel-hub"><span>★</span></div>
 </div>`;
}

function playWheelTicks(disc){
 const segmentAngle=360/disc.children.length;
 let previousSegment=0,lastSound=-Infinity;
 const tick=(now)=>{
  if(!disc.isConnected||disc.closest('.landed'))return;
  const transform=getComputedStyle(disc).transform;
  if(transform!=='none'){
   const [a,b]=transform.slice(transform.indexOf('(')+1).split(',',2).map(Number);
   const angle=Math.atan2(b,a)*180/Math.PI;
   // Each boundary crosses the pointer halfway between two card centers.
   const segment=(Math.round(angle/segmentAngle)+disc.children.length)%disc.children.length;
   if(segment!==previousSegment&&now-lastSound>=40){
    sound('wheel');
    lastSound=now;
   }
   previousSegment=segment;
  }
  wheelAudioFrame=requestAnimationFrame(tick);
 };
 wheelAudioFrame=requestAnimationFrame(tick);
}

function spinReveal(){
 const screen=$('#openingScreen'),disc=$('.wheel-disc',screen);
 const tier=openingPull().tier,rarity=E.rarityNames[tier];
 const land=()=>{
  if(!screen.isConnected||screen.classList.contains('landed'))return;
  cancelAnimationFrame(wheelAudioFrame);
  sound('land');
  screen.classList.add('landed');
  screen.style.setProperty('--spin-color',E.rarityColors[tier]);
  $('.opening-rarity',screen).textContent=rarity;
  timers.push(setTimeout(reveal,RESULT_MS));
 };
 playWheelTicks(disc);
 disc.addEventListener('animationend',event=>{
  if(event.target===disc)land();
 });
 timers.push(setTimeout(land,SPIN_MS+150));
}

function reveal(){
 if(!pending||view!=='opening'||phase==='revealed')return;
 const skippedWheel=phase==='idle';
 clearAnimation();
 phase='revealed';
 render();
 const best=pending.pull.tier;
 if(best>=4&&!document.hidden)playWinMusic();
 else if(skippedWheel)sound('hit');
 haptic(best>=4?[40,30,70]:30);

}
function stopEffects({keepClick=false}={}){
 for(const [bus,{kind,sources}] of effectBuses){
  if(keepClick&&kind==='click')continue;
  effectBuses.delete(bus);
  for(const source of sources){try{source.stop();source.disconnect();}catch{}}
  bus.disconnect();
 }
 if(!keepClick)lastClickTime=-Infinity;
 packSoundUntil=0;
}
function stopWinMusic(){clearTimeout(winStopTimer);for(const source of winSources){try{source.stop();source.disconnect();}catch{}}winSources.clear();if(winMusicGain){try{winMusicGain.disconnect();}catch{}winMusicGain=null;}}

function playWinMusic(){stopEffects();try{unlockSound();if(!audioMix)return;stopWinMusic();const now=audioCtx.currentTime,beat=60/128,bus=audioCtx.createGain();winMusicGain=bus;bus.gain.setValueAtTime(WIN_MUSIC_GAIN,now);bus.gain.setTargetAtTime(0,now+4.5,.18);bus.connect(audioMix);const note=(midi,start,length,volume=.12,type='triangle')=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.value=440*Math.pow(2,(midi-69)/12);g.gain.setValueAtTime(.001,now+start);g.gain.exponentialRampToValueAtTime(volume,now+start+.018);g.gain.exponentialRampToValueAtTime(.001,now+start+length);o.connect(g);g.connect(bus);winSources.add(o);o.onended=()=>winSources.delete(o);o.start(now+start);o.stop(now+start+length+.03);};const chords=[[60,64,67,71],[57,60,64,67],[53,57,60,64],[55,59,62,67]];chords.forEach((chord,b)=>{chord.forEach(m=>note(m,b*beat*2,beat*1.85,.075,'sine'));note(chord[0]-12,b*beat*2,beat*1.7,.17,'sine');});[72,76,79,84,83,79,76,79,81,84,88,86,84,79,83,84].forEach((m,i)=>note(m,i*beat/2,beat*.46,.15,'triangle'));[72,76,79,84].forEach(m=>note(m,beat*8,1.05,.09,'sine'));winStopTimer=setTimeout(()=>{bus.disconnect();if(winMusicGain===bus)winMusicGain=null;},5500);}catch{}}

function winRewardRange(){
 return money(E.winRewardMin*E.unitsPerCent)+'–'+money(E.winRewardMax*E.unitsPerCent);
}
function startSecondChance(){
 if(view!=='opening'||phase!=='revealed'||openingPull().tier!==0||pending.secondChance||pending.extraSpin)return;
 const odds=15+Math.floor(E.random()*31);
 const bonus={odds,won:E.random()*100<odds};
 pending.secondChance=bonus;
 phase='second-chance';
 render();
 $('#secondChanceTitle')?.focus({preventScroll:true});
 const screen=$('#openingScreen');
 const disc=$('.wheel-disc',screen);
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const land=()=>{
  if(!screen.isConnected||phase!=='second-chance'||screen.classList.contains('landed'))return;
  cancelAnimationFrame(wheelAudioFrame);
  screen.classList.add('landed');
  $('.opening-rarity',screen).textContent=bonus.won?'Second Chance!':'Fail · original card kept';
  sound(bonus.won?'vault':'hit');
  timers.push(setTimeout(()=>{
   if(view!=='opening'||phase!=='second-chance'||pending?.secondChance!==bonus)return;
   clearAnimation();
   if(bonus.won){
    const {pack,odds:packOdds}=pending;
    pending={...E.awardSecondChance(state,catalog,pack,packOdds),extraSpin:true};
    save();
    spinPackWheel();
   }else{
    phase='revealed';
    render();
   }
  },RESULT_MS));
 };
 if(reduced){land();return;}
 playWheelTicks(disc);
 disc.addEventListener('animationend',event=>{if(event.target===disc)land();});
 timers.push(setTimeout(land,SPIN_MS+150));
}
function secondChanceView(){
 const {odds,won}=pending.secondChance;
 const wedges=[
  {label:'2nd Chance',symbol:'★',color:'#19d64a',size:odds*3.6,outcome:'chance'},
  {label:'Fail',symbol:'×',color:'#ff3349',size:(100-odds)*3.6,outcome:'fail'}
 ];
 return `<section class="opening-screen spinning second-chance-screen" id="openingScreen" aria-labelledby="secondChanceTitle" style="--spin-time:${SPIN_MS}ms;--spin-color:#ffe48a;--winner-break:${wedges[0].size}deg">
  <div class="eyebrow">Free extra spin · ${escape(pending.pack.name)} Pack</div>
  <h1 id="secondChanceTitle" tabindex="-1">Second Chance</h1>
  <div class="opening-stage">${wheelMarkup(wedges,won?0:1,true)}</div>
  <div class="second-chance-outcome">
   <p>Second Chance ${odds}% · Fail ${100-odds}%</p>
   <p class="opening-result" role="status"><strong class="opening-rarity"></strong></p>
  </div>
 </section>`;
}

function resultsView(){
 const rock=openingPull(),item=byId[rock.itemId];
 const offer=rock.tier===0&&!pending.secondChance&&!pending.extraSpin;
 const bonusStatus=pending.extraSpin?'Extra card from Second Chance':pending.secondChance?'Second Chance missed. Original card kept.':'';
 return `<section data-bonus-row="${!!(offer||bonusStatus)}" class="results-screen ${item.tier===5?'grail-result':''}" style="--rarity:${E.rarityColors[item.tier]}">
  <div class="reveal-shade" aria-hidden="true"></div>
  <div class="eyebrow"><span class="reveal-rarity">${E.rarityNames[item.tier]}</span></div>
  <h1>${escape(item.name)}</h1>
  <div class="result-grid" aria-label="Revealed rock card">
   <article class="result rocks">
    <div class="result-image">${cardImage(item)}</div>
   </article>
  </div>
  <div class="result-actions">
   ${sellButton(rock)}
   <button class="primary" data-action="keep-result">Keep card</button>
   <button class="secondary" data-action="vault">Inventory</button>
  </div>
  ${offer?'<button class="secondary second-chance-offer" data-action="second-chance-start">Second Chance</button>':bonusStatus?`<p class="second-chance-caption" role="status">${bonusStatus}</p>`:''}
 </section>`;
}
function showItem(id,uid){if(!byId[id])return;previousView=view==='opening'?'packs':view;detailId=id;detailUid=uid;go('item');}
function upgradeRock(uid){
 if(!E.upgradeRock(state,uid)){notice('You need more virtual balance for this upgrade.');return;}
 save();
 render();
 notice('Card reached level '+E.cardLevel(state.vault.find(card=>card.uid===uid))+'.');
 sound('land');
}

window.tcgNativeMessage=notice;window.tcgGoBack=()=>{const dialog=$('dialog[open]');if(dialog){dialog.close();return true;}if(view==='packs')return false;go('packs');return true;};
function searchRender(id){const pos=$('#'+id)?.selectionStart;render();const el=$('#'+id);el?.focus({preventScroll:true});if(pos!=null)el?.setSelectionRange(pos,pos);}
document.addEventListener('click',e=>{const external=e.target.closest('a[target="_blank"]');if(external&&window.TCGAndroid){e.preventDefault();window.TCGAndroid.openExternal(external.href);return;}const b=e.target.closest('[data-action]');if(!b||b.disabled)return;const a=b.dataset.action,id=b.dataset.id;if(window.TCGCloud?.user&&!window.TCGCloud.canPlay&&['open','sell-rock','upgrade-rock','buy-badge','favorite','save-name','delete-confirm','leaderboard-toggle','second-chance-start'].includes(a)){notice('Please finish syncing your account before changing your game.');return;}switch(a){
case 'packs':case 'vault':case 'collection':case 'profile':case 'leaderboard':go(a);break;
case 'choose-pack':selectPack(id);break;case 'previous-pack':selectPack(selectedIndex-1);break;case 'next-pack':selectPack(selectedIndex+1);break;
case 'badge-shop':
 renderBadgeShop();
 $('#badgeStatus').textContent='';
 $('#badgeShop').showModal();
 break;
case 'buy-badge':buyBadge(id);break;
case 'arena-pick':pickArenaCard(id);break;
case 'arena-mode':setArenaMode(id);break;
case 'arena-level':selectArenaLevel(Number(id));break;
case 'arena-start-level':startArenaLevel();break;
case 'arena-roster':openArenaRoster();break;
case 'arena-next-level':if(arenaMatch?.winner===0)startArenaLevel(arenaMatch.levelIndex+1);break;
case 'arena-ai':aiBattle();break;
case 'arena-create':onlineAction('create');break;
case 'arena-join':onlineAction('join',{room_code:$('#arenaCode').value.trim()});break;
case 'arena-copy':copyRoomCode();break;
case 'arena-leave':leaveArena();break;
case 'arena-move':battleMove(id,b.dataset.target===undefined?null:Number(b.dataset.target));break;
case 'upgrade-rock':upgradeRock(id);break;
case 'sort-menu':showSortMenu();break;
case 'sort-by':setSort(id);break;
case 'pack-details':openPackDetails(id);break;
case 'rock-odds':if(Object.hasOwn(E.oddsPresets,id)){odds=id;$('#packOddsLabel').textContent=odds;const content=$('#packDetailsBody');content.innerHTML=oddsView();content.querySelector('.active').focus();}break;
case 'sell-rock':sellRock(id);break;
case 'open':startOpening();break;
case 'view-category':go('collection');break;
case 'item':showItem(id,b.dataset.uid);break;case 'back-item':go(previousView);break;
case 'favorite':{const v=state.vault.find(v=>v.uid===id);if(v){v.locked=!v.locked;save();render();}}break;
case 'cancel-confirm':confirmAction='';render();break;
case 'keep-result':go('packs');sound('vault');break;
case 'second-chance-start':startSecondChance();break;
case 'leaderboard-refresh':loadLeaderboard(true);break;
case 'leaderboard-toggle':if(window.TCGCloud?.user&&window.TCGCloud.ready&&window.TCGCloud.canPlay){if(!state.leaderboard&&!state.name.trim()){go('profile');notice('Save a collector name first, then join the leaderboard.');break;}state.leaderboard=!state.leaderboard;save();leaderboardLoaded=0;render();}else{go('profile');notice('Sign in and finish syncing to join the leaderboard.');}break;
case 'edit-collector':$('#username').focus();break;
case 'save-name':{const name=$('#username').value.trim();if(!name){feedback='Enter a username first.';render();break;}state.name=name.slice(0,24);save();feedback='Username saved.';render();}break;
case 'delete-start':profileSections.add('delete');confirmAction='delete';render();$('.delete-details').scrollIntoView({block:'nearest'});break;
case 'delete-confirm':{state=E.defaults();arenaTeam.clear();selectedIndex=0;save();go('profile');feedback='Account deleted from this device.';render();}break;
}});
document.addEventListener('input',e=>{if(e.target.id==='arenaCode'){e.target.value=e.target.value.replace(/[^0-9]/g,'').slice(0,4);return;}if(e.target.id==='arenaFilter'){arenaFilter=e.target.value;$('#arenaTeam').innerHTML=teamOptions();return;}if(e.target.id==='vaultSearch'||e.target.id==='collectionSearch'){search=e.target.value;searchRender(e.target.id);}});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='arenaCode')$('[data-action="arena-join"]').click();if(e.key==='Enter'&&e.target.id==='username')$('[data-action="save-name"]').click();});
window.addEventListener('hashchange',()=>{const target=location.hash.slice(1);if(target!==view&&['packs','vault','collection','profile','battle','leaderboard'].includes(target)){go(target);}});
async function init(){try{if(window.TCG_INLINE_CATALOG)catalog=window.TCG_INLINE_CATALOG;else{const response=await fetch('catalog.json?v=80');if(!response.ok)throw Error();catalog=await response.json();}byId=Object.fromEntries(catalog.map(i=>[i.id,i]));packs=E.packs();try{const saved=JSON.parse(localStorage.getItem(KEY)||localStorage.getItem('cool-collectables-simulator-v1')||'null');if(E.validSave(saved,catalog))state=E.migrate(saved,catalog);}catch{}restoreArenaTeam();state.settings={sound:true,haptics:true};const now=Date.now(),elapsed=now-state.rockClock,earned=settleRockIncome(now);selectedIndex=Math.max(0,Math.min(packs.length-1,state.preferences.packIndex||0));const route=location.hash.slice(1);view=['packs','vault','collection','profile','battle','leaderboard'].includes(route)?route:'packs';save();render();await window.TCGCloud?.init({creditBattleReward:(cents,snapshot)=>{
 if(snapshot)return E.creditReward(snapshot,cents);
 E.creditReward(state,cents);updateHeader();return state;
 },validate:next=>E.validSave(next,catalog),guest:guestGameState,fresh:E.defaults,replace:replaceGameState,restoreGuest:()=>replaceGameState(guestGameState()),changed:()=>{incomeTick(true,true);if(view==='profile'||view==='leaderboard'||view==='battle'&&!arenaMatch&&!onlineRoom&&!$('#arenaRoster')?.open)render();}});if(!window.TCGCloud?.user&&earned>0&&elapsed>=10000&&!$('#status').textContent)showAwayIncome(earned);if('serviceWorker'in navigator&&window.isSecureContext&&!window.TCGAndroid&&!window.TCG_INLINE_CATALOG)refreshWebApp();}catch(e){$('#app').innerHTML=empty('THE COLLECTION COULD NOT LOAD.','Please reload the game to try again.',false);}}
async function refreshWebApp(){
 try {
  const worker=await navigator.serviceWorker.register('sw.js',{updateViaCache:'none'});
  const check=()=>{if(!document.hidden)worker.update().catch(()=>{});};
  document.addEventListener('visibilitychange',check);
  check();
 }catch{}
}

let arenaMatch=null,onlineRoom=null,arenaBusy=false,arenaMessage='',arenaFilter='',arenaResultTimer=null,presentedResult=null;
let arenaMode='levels',arenaLevelIndex=null;
const arenaTeam=new Set();
const battleCloud=()=>window.TCGCloud;

function restoreArenaTeam(){
 arenaTeam.clear();
 const saved=state.preferences.arenaTeam;
 if(Array.isArray(saved))saved.forEach(uid=>arenaTeam.add(uid));
}
function campaignRank(){
 const names=['Trail Scout','Gem Prospector','Crystal Warden','Rock Champion'];
 const step=Math.min(names.length-1,Math.floor(state.arenaCleared/4));
 return {title:names[step],number:step+1};
}
function campaignShield(rank){
 return `<span class="campaign-shield" aria-hidden="true"><span>RANK</span><b>${rank}</b></span>`;
}
let arenaArtPreload;
function arenaView(){
 arenaArtPreload??=['arena-attacks.webp','arena-elements.webp','levels-pickaxe.webp'].map(src=>{
  const image=new Image();
  image.src=src;
  image.decode?.().catch(()=>{});
  return image;
 });
 if(onlineRoom?.waiting)return `<section class="arena content-card">
  <h1>Private room</h1><p>Share this code with your opponent. They’ll need ${onlineRoom.match.teams[0].length} ${onlineRoom.match.teams[0].length===1?'card':'cards'}.</p>
  <input class="room-code" readonly aria-label="Room code" value="${escape(onlineRoom.joinCode||onlineRoom.code)}">
  <button class="secondary" data-action="arena-copy">Copy code</button>
  <button class="secondary" data-action="arena-leave">Close room</button>
  <p id="arenaStatus" role="status">${escape(arenaMessage||'Waiting for your opponent…')}</p>
 </section>`;
 if(arenaMatch)return arenaMatch.winner===null?battleBoard():battleResult();

 for(const uid of arenaTeam)if(!state.vault.some(card=>card.uid===uid))arenaTeam.delete(uid);
 const cloud=battleCloud(),locked=arenaTeam.size===0||arenaBusy;
 return `<section class="arena arena-lobby" data-mode="${arenaMode}">
  <h1 class="arena-lobby-title">Rock Arena</h1>
  <div class="arena-mode-tabs" role="group" aria-label="Battle mode">
   <button class="secondary" data-action="arena-mode" data-id="levels" aria-pressed="${arenaMode==='levels'}">Levels</button>
   <button class="secondary" data-action="arena-mode" data-id="quick" aria-pressed="${arenaMode==='quick'}">Quick Battle</button>
  </div>
  ${arenaMode==='levels'?arenaLevelsView(arenaBusy):`<p>Play AI or challenge a friend. Wins earn ${winRewardRange()} in virtual coins.</p>`}
  <button class="secondary campaign-team-setup" type="button" data-action="arena-roster" aria-haspopup="dialog">Battle team <span id="teamCount" role="status">${arenaTeam.size} / 3 equipped</span></button>
  <dialog class="pack-dialog campaign-team-dialog" id="arenaRoster" aria-labelledby="arenaRosterTitle">
   <header><h2 id="arenaRosterTitle">Battle team</h2><form method="dialog"><button class="secondary" aria-label="Close team picker">${icon('close')}</button></form></header>
   <div class="campaign-team-content">${arenaTeamOptions()}</div>
   <form method="dialog"><button class="primary">Done</button></form>
  </dialog>
  ${arenaMode==='levels'?'':`
   <div class="arena-actions"><button class="primary" data-action="arena-ai" ${locked?'disabled':''}>Battle AI</button>
   ${cloud?.user?`<button class="secondary" data-action="arena-create" ${locked||!cloud.canPlay?'disabled':''}>Create private room</button>`:
    '<a href="#profile" class="secondary">Sign in for online play</a>'}</div>
   ${cloud?.user?`<div class="join-room">
    <label for="arenaCode">Room code</label>
    <input id="arenaCode" type="text" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" placeholder="4-digit code">
    <button class="secondary" data-action="arena-join" ${locked||!cloud.canPlay?'disabled':''}>Join room</button>
   </div>`:''}`}
  <p id="arenaStatus" role="status">${escape(arenaMessage)}</p>
 </section>`;
}
function selectedArenaLevel(){
 return Math.min(arenaLevelIndex??state.arenaCleared,state.arenaCleared,E.arenaLevels.length-1);
}
function setArenaMode(mode){
 if(!['levels','quick'].includes(mode)||mode===arenaMode)return;
 arenaMode=mode;
 render();
 $(`[data-action="arena-mode"][data-id="${mode}"]`).focus({preventScroll:true});
}
function selectArenaLevel(index){
 if(!E.arenaLevels[index]||index>state.arenaCleared)return;
 arenaLevelIndex=index;
 render();
 $(`[data-action="arena-level"][data-id="${index}"]`).focus({preventScroll:true});
}
function arenaTeamOptions(){
 return state.vault.length?`<label class="sr-only" for="arenaFilter">Find a team card</label>
  <div class="search">${icon('search')}<input type="search" id="arenaFilter" placeholder="Find a team card" value="${escape(arenaFilter)}"></div>
  <div class="team-list" id="arenaTeam">${teamOptions()}</div>`:
  '<p>Open a pack to get your first battle card.</p>';
}
function arenaLevelsView(locked){
 const index=selectedArenaLevel(),level=E.arenaLevels[index];
 const {arenaCleared:cleared,arenaPlayed:played}=state;
 const rank=campaignRank();
 const total=E.arenaLevels.length;
 const columns=3;
 const rows=Array.from({length:Math.ceil(total/columns)},(_,row)=>{
  const start=row*columns;
  const stages=E.arenaLevels.slice(start,start+columns);
  return `<div class="arena-map-row" data-turn="${row%2===0?'right':'left'}" data-connected="${cleared>=start+columns}">
   <div class="arena-map-route" aria-hidden="true">${stages.slice(1).map((_,offset)=>`<i data-open="${cleared>start+offset}"></i>`).join('')}</div>
   ${stages.map((stage,offset)=>{
    const id=start+offset,complete=id<cleared,locked=id>cleared;
    const status=complete?'cleared':locked?'locked':'unlocked';
    return `<button type="button" class="arena-map-node" data-action="arena-level" data-id="${id}" data-cleared="${complete}" data-boss="${!!stage.boss}" aria-pressed="${id===index}" aria-label="Level ${id+1}, ${stage.name}, ${status}" ${locked?'disabled':''}>
     <span class="arena-map-stone" aria-hidden="true"><b>${id+1}</b><span class="arena-map-mark">${complete?'★':locked?'<i class="arena-map-lock"></i>':'◆'}</span></span>
     ${stage.boss?'<span class="arena-map-boss" aria-hidden="true">Boss</span>':''}
     <span class="arena-map-prize" aria-hidden="true">${complete?'✓':'<i></i>'+stage.reward+'¢'}</span>
    </button>`;
   }).join('')}
  </div>`;
 }).join('');
 return `<section class="arena-levels" aria-labelledby="arenaLevelsTitle">
  <header class="arena-campaign-title">
   <img class="arena-pickaxe" src="levels-pickaxe.webp" alt="" width="132" height="132">
   <h2 id="arenaLevelsTitle">Levels</h2>
   <span aria-hidden="true" class="arena-title-gem"></span>
  </header>
  <div class="arena-level-heading">
   <div class="campaign-rank-label">${campaignShield(rank.number)}<strong>${rank.title}</strong></div>
   <div class="arena-level-progress"><span>${cleared} / ${total} cleared</span><progress aria-label="Levels cleared" value="${cleared}" max="${total}"></progress></div>
  </div>
  <div class="arena-level-grid">${rows}</div>
  <div class="arena-level-info">
   <div class="arena-level-summary">
    <h3>${level.name}${level.boss?' <span>Boss</span>':''}</h3>
    <p>${level.enemies.map(([name])=>escape(byId['rock-'+name].name)).join(' · ')}</p>
   </div>
   <div class="arena-level-reward">
    <strong>${index<cleared?'Cleared':money(level.reward*E.unitsPerCent)}</strong>
    <span>${index<cleared?'Reward collected':'First-clear reward'}</span>
    ${index===played?`<small>+${money(E.arenaPlayReward*E.unitsPerCent)} first finished battle</small>`:''}
   </div>
   <button class="primary arena-play" data-action="arena-start-level" ${locked?'disabled':''}>Battle Level ${index+1}</button>
  </div>
 </section>`;
}
function openArenaRoster(){
 $('#arenaRoster')?.showModal();
}
function startArenaLevel(index=selectedArenaLevel()){
 const level=E.arenaLevels[index],cloud=battleCloud();
 if(!level||index>state.arenaCleared||arenaBusy)return;
 if(cloud?.user&&!cloud.canCampaign){
  arenaMessage='Finish loading your save in Profile, then try again.';
  notice(arenaMessage);
  return;
 }
 const cards=state.vault.filter(card=>arenaTeam.has(card.uid));
 if(!cards.length){openArenaRoster();return;}
 arenaMessage='';
 const enemy=A.campaignTeam(level,byId,E);
 clearArenaResult();
 arenaLevelIndex=index;
 arenaMatch={...A.newMatch(cards.map(card=>A.combatCard(card,E)),enemy),levelIndex:index};
 render();
 window.scrollTo({top:0,behavior:'instant'});
}
function teamOptions(){
 const query=arenaFilter.trim().toLowerCase();
 const cards=state.vault.filter(card=>byId[card.itemId]?.name.toLowerCase().includes(query));
 return cards.map(card=>{
  const {damage,hp}=E.cardStats(card);
  const moves=A.movesFor(card);
  const equipped=arenaTeam.has(card.uid);
  return `<button class="secondary team-option" data-action="arena-pick" data-id="${escape(card.uid)}" aria-pressed="${equipped}">
   ${cardImage(byId[card.itemId])}<span><b>${escape(byId[card.itemId].name)}</b><small>Lv ${E.cardLevel(card)} · ${damage} ATK · ${hp} HP</small><small>${escape(moves.attack)}</small><small>${escape(moves.special)}</small><small class="team-equipped" aria-hidden="true">${equipped?'✓ Equipped':'＋ Equip'}</small></span></button>`;
 }).join('')||'<p>No matching cards.</p>';
}
function pickArenaCard(uid){
 if(arenaTeam.has(uid))arenaTeam.delete(uid);
 else if(arenaTeam.size<3&&state.vault.some(card=>card.uid===uid))arenaTeam.add(uid);
 else{
  $('#teamCount').textContent='Team full';
  return;
 }
 save();
 const button=$$('.team-option').find(button=>button.dataset.id===uid);
 const equipped=arenaTeam.has(uid);
 if(button){
  button.setAttribute('aria-pressed',String(equipped));
  $('.team-equipped',button).textContent=equipped?'✓ Equipped':'＋ Equip';
 }
 $('#teamCount').textContent=arenaTeam.size+' / 3 equipped';
 const cloud=battleCloud();
 for(const action of ['ai','create','join']){
  const button=$(`[data-action="arena-${action}"]`);
  if(!button)continue;
  const needsSync=action!=='ai';
  button.disabled=!arenaTeam.size||arenaBusy||(needsSync&&!cloud?.canPlay);
 }
}
function aiBattle(){
 clearArenaResult();
 const cards=state.vault.filter(card=>arenaTeam.has(card.uid));
 if(!cards.length)return;
 const first=cards.map(card=>A.combatCard(card,E));
 const second=A.aiTeam(cards,catalog,packs.length,E);
 arenaMatch=A.newMatch(first,second);
 render();
}
function battleBoard(){
 const match=arenaMatch,side=onlineRoom?.side??0,other=1-side;
 const own=match.teams[side][match.active[side]];
 const rival=match.teams[other][match.active[other]];
 const ability=match.rules>=2?A.abilityFor(own,match.rules):null;
 const attack=match.rules===3?A.movesFor(own).attack:'Strike';
 const canMove=!arenaBusy&&match.winner===null&&match.turn===side;
 const note=A.battleNote(match,side);
 const status=match.winner!==null?(match.winner===side?'You won!':'Opponent wins.'):match.turn===side?'Your turn':'Opponent’s turn';
 const roster=(team,position,title)=>{
  const card=match.teams[team][match.active[team]];
  const item=byId[card.itemId];
  return `<article class="arena-team arena-team--${position}" data-arena-team="${team}">
   <div class="arena-fighter-info"><h2>${title}</h2><strong>${escape(item?.name||'Rock')}</strong>
   <progress max="${card.maxHp}" value="${card.hp}" aria-label="${title} health"></progress>
   <small>${card.hp}/${card.maxHp} HP${card.guard?' · Guarded':card.focus?' · Focused':''}</small></div>
   <div class="arena-fighter" data-guard="${card.guard}">${item?cardImage(item):'<span>Rock card</span>'}<b>${card.damage+(card.focus?3:0)} ATK</b></div>
   <div class="arena-backup" aria-label="${title} reserves">${match.teams[team].map((card,index)=>{
    if(index===match.active[team])return '';
    const reserve=byId[card.itemId];
    const art=reserve?cardImage(reserve):'<span>Rock card</span>';
    const label=`${reserve?.name||'Rock'} · ${card.hp} HP`;
    return team===side&&match.winner===null?`<button class="arena-reserve" data-action="arena-move" data-id="swap" data-target="${index}" aria-label="Switch to ${escape(label)}" title="Switch to ${escape(label)}" ${canMove&&card.hp>0?'':'disabled'}>${art}</button>`:
     `<span class="arena-reserve" data-defeated="${card.hp===0}" title="${escape(label)}">${art}</span>`;
   }).join('')}</div>
  </article>`;
 };
 return `<section class="arena arena-match">
  <div class="arena-header"><h1>${onlineRoom?'Private match':match.levelIndex!==undefined?'Level '+(match.levelIndex+1)+' · '+E.arenaLevels[match.levelIndex].name:'Rock Arena'}</h1><button class="secondary" data-action="arena-leave">${match.winner===null?'Leave':'Done'}</button></div>
  <div class="arena-board" aria-label="Battlefield">${roster(other,'opponent',onlineRoom?'Opponent':'AI')}
   ${roster(side,'player','You')}<div class="arena-effects" aria-hidden="true"></div>
  </div>
  <p id="arenaStatus" class="arena-turn" role="status"><strong>${status}</strong> <span>${escape(arenaMessage||note)}</span></p>
  ${match.winner===null?`<div class="arena-actions" data-abilities="${!!ability}">
   <button class="primary" data-action="arena-move" data-id="strike" ${canMove?'':'disabled'}><span>${escape(attack)}</span><small>${A.attackPower(own,rival,match.rules)} power</small></button>
   <button class="secondary" data-action="arena-move" data-id="guard" ${canMove&&!own.focus?'':'disabled'} title="Halves the next hit and adds 3 damage to your next strike">Guard</button>
   ${ability?`<button class="secondary" data-action="arena-move" data-id="ability" aria-describedby="abilityDescription" ${canMove&&A.canUseAbility(own,match.rules)?'':'disabled'}><span>${escape(ability.name)}</span>${own.abilityUsed?'<small>Used</small>':''}</button>`:''}
  </div>
  ${ability?`<p class="arena-hint" id="abilityDescription">${ability.description} Once per battle for each card.</p>`:'<p class="arena-hint">Guard halves the next hit and adds 3 damage to your next strike.</p>'}`:''}
 </section>`;
}
function battleResult(){
 const match=arenaMatch,side=onlineRoom?.side??0,won=match.winner===side;
 const card=match.teams[match.winner][match.active[match.winner]];
 const art=byId[card.itemId];
 const reward=won?match.reward:0;
 const isLevel=match.levelIndex!==undefined;
 const nextLevel=match.levelIndex+1;
 const campaign=match.levelRewards;
 const winMessage=nextLevel===E.arenaLevels.length?'Campaign complete.':'Level cleared.';
 const reason=isLevel
  ? (won?winMessage:'Try a different team or strategy.')
  : match.note==='Opponent left the match.'?'Your opponent left the match.':won?'Your team won the battle.':'The opposing team won the battle.';
 return `<section class="arena arena-result" data-won="${won}" aria-labelledby="battleOutcome">
  <div class="arena-result-art">${art?cardImage(art):''}</div>
  <h1 id="battleOutcome" tabindex="-1">${won?'You won!':'You lost.'}</h1>
  <p>${reason}</p>
  ${campaign?.participation?`<p class="arena-hint">First finished battle · +${money(campaign.participation*E.unitsPerCent)} in virtual coins</p>`:''}
  ${campaign?.clear?`<p class="arena-hint">First-clear reward · +${money(campaign.clear*E.unitsPerCent)} in virtual coins</p>`:''}
  ${reward?`<p class="arena-hint">Win reward · ${money(reward*E.unitsPerCent)} in virtual coins</p>`:''}
  <div class="arena-actions">
   ${isLevel?`${!won?'<button class="primary" data-action="arena-start-level">Try again</button>':nextLevel<E.arenaLevels.length?'<button class="primary" data-action="arena-next-level">Next level</button>':''}<button class="secondary" data-action="arena-leave">Back to Levels</button>`:
    won?'<button class="primary" data-action="packs">Back to Packs</button>':`${onlineRoom?'':'<button class="primary" data-action="arena-ai">Play again</button>'}<button class="secondary" data-action="arena-leave">Back to Battle</button>`}
  </div>
  ${won&&!isLevel?'<div class="victory-timer" aria-hidden="true"><span></span></div>':''}
  <p id="arenaStatus" role="status">${escape(arenaMessage)}</p>
 </section>`;
}
function clearArenaResult(){
 clearTimeout(arenaResultTimer);
 arenaResultTimer=null;
 presentedResult=null;
}
function showArenaResult(){
 const result=$('#battleOutcome');
 if(!result||presentedResult===arenaMatch)return;
 clearArenaResult();
 const match=arenaMatch;
 presentedResult=match;
 const won=match.winner===(onlineRoom?.side??0);
 result.focus({preventScroll:true});
 window.scrollTo({top:0,behavior:'instant'});
 sound(won?'arena-win':'arena-loss');
 if(won&&match.levelIndex===undefined)arenaResultTimer=setTimeout(()=>{
  if(view==='battle'&&arenaMatch===match)go('packs');
 },4200);
}
function lockArenaActions(){
 for(const button of $$('[data-action="arena-move"]'))button.disabled=true;
 const turn=$('.arena-turn strong');
 if(turn)turn.textContent='Resolving move…';
}
function arenaAnimation(element,keyframes,duration,easing='ease-out',delay=0){
 return element.animate(keyframes,{duration,easing,delay,fill:delay?'backwards':'none'}).finished.catch(()=>{});
}
async function animateRockKnockout(fighter,effects,reduced){
 const card=$('.cartoon-card',fighter);
 if(!card||!effects.isConnected)return;
 const bounds=card.getBoundingClientRect(),area=effects.getBoundingClientRect();
 const stage=document.createElement('span');
 stage.className='arena-knockout';
 stage.setAttribute('aria-hidden','true');
 Object.assign(stage.style,{left:bounds.left-area.left+'px',top:bounds.top-area.top+'px',width:bounds.width+'px',height:bounds.height+'px'});
 const pickaxe=document.createElement('img');
 pickaxe.className='arena-knockout-pickaxe';
 pickaxe.src='levels-pickaxe.webp';
 pickaxe.alt='';
 stage.append(pickaxe);
 effects.append(stage);
 try{
  if(reduced){
   stage.classList.add('arena-knockout--reduced');
   sound('arena-chip');
   await arenaAnimation(stage,[{opacity:1},{opacity:1},{opacity:0}],225);
   return;
  }
  const duration=400,contact=.46;
  const swing=arenaAnimation(pickaxe,[
   {opacity:0,transform:'translate(46%,-46%) rotate(43deg) scale(.87)'},
   {opacity:1,transform:'translate(32%,-38%) rotate(35deg) scale(.97)',offset:.19,easing:'cubic-bezier(.52,.03,.74,.49)'},
   {opacity:1,transform:'translate(0,0) rotate(-33deg) scale(1.06)',offset:contact,easing:'ease-out'},
   {opacity:.95,transform:'translate(-23%,18%) rotate(-61deg) scale(1)',offset:.68},
   {opacity:0,transform:'translate(-34%,35%) rotate(-70deg) scale(.86)'}
  ],duration,'linear');
  await arenaAnimation(stage,[{},{}],duration*contact,'linear');
  if(!stage.isConnected)return;
  sound('arena-chip');
  const crack=document.createElement('span');
  crack.className='arena-knockout-crack';
  stage.append(crack);
  const pieces=['left','right'].map((side,index)=>{
   const piece=document.createElement('span');
   piece.className='arena-knockout-piece';
   piece.dataset.side=side;
   piece.append(card.cloneNode(true));
   stage.prepend(piece);
   const direction=index===0?-1:1;
   return arenaAnimation(piece,[
    {opacity:1,transform:'translate(0,0) rotate(0deg) scale(1)'},
    {opacity:1,transform:`translate(${direction*17}%,-8%) rotate(${direction*9}deg) scale(1)`,offset:.37,easing:'ease-in'},
    {opacity:0,transform:`translate(${direction*51}%,46%) rotate(${direction*27}deg) scale(.82)`}
   ],335,'linear');
  });
  fighter.dataset.knockedOut='true';
  await Promise.all([
   swing,...pieces,
   arenaAnimation(crack,[{opacity:1},{opacity:.85,offset:.21},{opacity:0}],190)
  ]);
 }finally{stage.remove();}
}
const arenaAttackArt={
 boulder:0,ribbon:1,fracture:2,bulwark:3,prism:4,ring:5,shard:6,comet:7,volley:8,renew:9,meteor:0
};
const arenaElementArt={fire:0,ice:1,lightning:2,mist:3,earth:4,void:5,light:6,water:7,wind:8,arcane:9};
const arenaMotion={
 fire:{bend:40,turn:32,flight:335,impact:470},
 ice:{bend:16,turn:8,flight:290,impact:510},
 lightning:{bend:22,turn:0,flight:230,impact:390},
 mist:{bend:52,turn:24,flight:400,impact:555},
 earth:{bend:32,turn:58,flight:340,impact:510},
 void:{bend:48,turn:105,flight:390,impact:540},
 light:{bend:12,turn:12,flight:285,impact:470},
 water:{bend:43,turn:19,flight:365,impact:530},
 wind:{bend:53,turn:82,flight:365,impact:505},
 arcane:{bend:36,turn:68,flight:345,impact:515}
};
const rockMotion={bend:26,turn:40,flight:295,impact:460};
async function animateArenaMove(before,after){
 if(view!=='battle'||document.hidden||after?.revision!==before?.revision+1||before.winner!==null)return;
 const effects=$('.arena-effects');
 if(!effects?.animate)return;
 const side=before.turn,other=1-side;
 const actor=$(`[data-arena-team="${side}"] .arena-fighter`);
 const rival=$(`[data-arena-team="${other}"] .arena-fighter`);
 if(!actor||!rival)return;
 const own=before.teams[side][before.active[side]];
 const target=before.teams[other][before.active[other]];
 const nextOwn=after.teams[side][before.active[side]],nextTarget=after.teams[other][before.active[other]];
 const loss=target.hp-nextTarget.hp,healed=nextOwn.hp-own.hp;
 const ability=after.lastMove?.ability?A.abilityFor(own,before.rules):null;
 const visual=A.moveVisual(own,!!ability);
 const motion=arenaMotion[visual.element]??rockMotion;
 const switched=before.active[side]!==after.active[side];
 const guarded=nextOwn.guard&&(!own.focus||!own.guard);
 if(!(ability||loss>0||switched||guarded))return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const compact=matchMedia('(max-width: 600px)').matches;
 const color=actor.closest('.arena-team--player')?'mint':'violet';
 const board=effects.getBoundingClientRect();
 const center=element=>{
  const rect=element.getBoundingClientRect();
  return {x:rect.left+rect.width/2-board.left,y:rect.top+rect.height/2-board.top};
 };
 const spawn=(className,position,label='')=>{
  const effect=document.createElement('span');
  effect.className='arena-effect arena-effect--'+className;
  effect.dataset.color=color;
  if(ability)effect.dataset.ability=ability.id;
  effect.dataset.motif=visual.motif;
  if(visual.element)effect.dataset.element=visual.element;
  effect.style.setProperty('--move-hue',String(visual.hue));
  effect.style.left=position.x+'px';
  effect.style.top=position.y+'px';
  effect.textContent=label;
  effects.append(effect);
  return effect;
 };
 const illustratedImpact=position=>{
  const sprite=spawn('illustrated',position);
  const tile=visual.element?arenaElementArt[visual.element]:arenaAttackArt[visual.motif];
  sprite.style.setProperty('--sprite-x',tile%5*25+'%');
  sprite.style.setProperty('--sprite-y',tile<5?'12%':'88%');
  const swirling=['fire','mist','void','water','wind','arcane'].includes(visual.element);
  const entry=visual.element==='lightning'?'translateY(-22px)':swirling?'rotate(-12deg)':'none';
  const frames=reduced?[{opacity:.9},{opacity:.9},{opacity:0}]:[
   {opacity:0,scale:.58,transform:entry},
   {opacity:1,scale:1.05,transform:'none',offset:.23},
   {opacity:.94,scale:1.08,offset:.68},
   {opacity:0,scale:1.18,transform:swirling?'rotate(10deg)':'none'}
  ];
  return arenaAnimation(sprite,frames,reduced?230:motion.impact).then(()=>sprite.remove());
 };
 const from=center(actor),to=center(rival);
 const updateFighter=(fighter,card)=>{
  const team=fighter.closest('.arena-team');
  $('progress',team).value=card.hp;
  $('small',team).textContent=`${card.hp}/${card.maxHp} HP${card.guard?' · Guarded':card.focus?' · Focused':''}`;
  fighter.dataset.guard=String(card.guard);
  $('b',fighter).textContent=`${card.damage+(card.focus?3:0)} ATK`;
 };
 if(ability){
  updateFighter(actor,nextOwn);
  sound('arena-special');
  const charge=spawn('charge',from,healed>0?`+${healed} HP`:ability.name);
  const aura=reduced?null:spawn('aura',from);
  await Promise.all([
   arenaAnimation(charge,reduced?[{opacity:1},{opacity:1}]:[{opacity:0,scale:.82},{opacity:1,scale:1,offset:.3},{opacity:0,scale:1.08}],reduced?175:225),
   aura&&arenaAnimation(aura,[{opacity:0,scale:.6},{opacity:.6,offset:.4},{opacity:0,scale:1.18}],225),
   loss===0&&illustratedImpact(from)
  ]);
  charge.remove();
  aura?.remove();
  if(!effects.isConnected)return;
 }
 if(loss>0){
  const direction=Math.sign(to.y-from.y);
  if(!reduced){
   const dx=to.x-from.x,dy=to.y-from.y;
   const paths={
    shard:[0],fracture:[-1,0,1],comet:[.5],meteor:[-1],ring:[0],boulder:[-.6],
    ribbon:[-1,1],volley:[-1,0,1],prism:[-1,1],renew:[0],bulwark:[0]
   };
   const windup=spawn('windup',from);
   const launch=100,arrival=launch+motion.flight;
   void arenaAnimation(windup,[{opacity:0,scale:.55},{opacity:.82,scale:.88,offset:.63},{opacity:0,scale:1.15}],launch+75).then(()=>windup.remove());
   void arenaAnimation(actor,[
    {transform:'translateY(0) scale(1)'},
    {transform:`translateY(${-direction*8}px) scale(.95,1.04)`,offset:launch/(arrival+55),easing:'cubic-bezier(.28,.64,.46,1)'},
    {transform:`translateY(${direction*13}px) scale(1.04,.96)`,offset:(launch+75)/(arrival+55),easing:'ease-out'},
    {transform:'translateY(0) scale(1)'}
   ],arrival+55,'linear');
   const shots=paths[visual.motif];
   const trails=Array.from({length:compact?2:3},(_,i)=>i);
   await Promise.all([...shots,...trails].map((lane,index)=>{
    const tracer=index>=shots.length;
    const piece=spawn(tracer?'tracer':'shot',from);
    piece.dataset.direction=direction>0?'down':'up';
    const sideOffset=tracer?(lane-.9)/2:lane;
    const bend=sideOffset*motion.bend;
    const twist=motion.turn*(sideOffset<0?-1:1);
    const lag=tracer?24+lane*17:0;
    const frame=(at,xOffset,rotation,scale,opacity)=>({
     offset:at,opacity,
     transform:`translate(${dx*at+xOffset}px,${dy*at}px) rotate(${rotation}deg) scale(${scale})`
    });
    const frames=[
     frame(0,0,-twist,.42,0),
     frame(.22,bend*.55,twist*.3,tracer ? .48 : .84,1),
     frame(.62,bend,twist*.83,tracer ? .72 : 1,tracer ? .72 : 1),
     frame(1,0,twist,1,tracer ? 0 : .87)
    ];
    return arenaAnimation(piece,frames,motion.flight-lag,'cubic-bezier(.37,.16,.73,.9)',launch+lag).then(()=>piece.remove());
   }));
  }
  if(!effects.isConnected)return;
  const remaining=nextTarget.hp;
  updateFighter(actor,nextOwn);
  updateFighter(rival,nextTarget);
  sound('arena-hit');
  const damage=spawn('damage',to,`−${loss}`);
  const impact=spawn(target.guard&&ability?.id!=='fracture'?'shield':'burst',to);
  const shocks=reduced?[]:Array.from({length:compact?1:2},()=>spawn('shock-ring',to));
  const sparkCount=compact?(remaining?5:7):(remaining?8:10);
  const sparks=reduced?[]:Array.from({length:sparkCount},(_,index)=>spawn(index%3===0?'shard':'spark',to));
  const recoil=arenaAnimation(rival,reduced?[{opacity:1},{opacity:1}]:[
   {transform:'translateY(0) rotate(0deg)',easing:'ease-out'},
   {transform:`translateY(${direction*9}px) rotate(${direction*5}deg)`,offset:.27,easing:'ease-in-out'},
   {transform:`translateY(${-direction*2}px) rotate(${-direction*2}deg)`,offset:.64,easing:'ease-out'},
   {transform:'translateY(0) rotate(0deg)'}
  ],reduced?90:228,'linear');
  await Promise.all([
   recoil.then(()=>remaining===0&&effects.isConnected&&animateRockKnockout(rival,effects,reduced)),
   arenaAnimation(damage,reduced?[{opacity:1},{opacity:1}]:[{opacity:1,transform:'translateY(3px) scale(.85)'},{opacity:1,transform:'translateY(-22px) scale(1.13)',offset:.45},{opacity:0,transform:'translateY(-46px)'}],reduced?260:430),
   ...shocks.map((ring,index)=>arenaAnimation(ring,[
    {opacity:0,scale:.22},{opacity:.8,scale:.45,offset:.22+index*.08},{opacity:0,scale:1.8+index*.54}
   ],330+index*105)),
   ...sparks.map((spark,index)=>{
    const angle=index/sparks.length*2*Math.PI+visual.hue*Math.PI/180;
    const radius=visual.spread+(remaining?8:22)+index%3*7;
    const dx=Math.cos(angle)*radius,dy=Math.sin(angle)*radius;
    return arenaAnimation(spark,[{opacity:1,transform:'none'},
     {opacity:1,transform:`translate(${dx*.55}px,${dy*.76-12}px) rotate(55deg)`,offset:.42},
     {opacity:0,transform:`translate(${dx}px,${dy+15}px) rotate(${100+index*14}deg)`}
    ],motion.impact-58+index%3*18);
   }),
   illustratedImpact(to),
   arenaAnimation(impact,reduced?[{opacity:.8},{opacity:0}]:[{opacity:1,scale:.38},{opacity:0,scale:1.5,rotate:'28deg'}],reduced?180:340)
  ]);
  damage.remove();
  impact.remove();
  [...sparks,...shocks].forEach(effect=>effect.remove());
 }else if(guarded||switched){
  sound('arena-guard');
  const effect=spawn(guarded?'shield':'swap',from,guarded?'GUARD':'SWITCH');
  await arenaAnimation(effect,reduced?[{opacity:1},{opacity:0}]:[{opacity:.3,scale:.74},{opacity:1,scale:1.06,offset:.32},{opacity:0,scale:1.2}],reduced?160:380);
  effect.remove();
 }
}
async function onlineAction(operation,extra={}){
 const cloud=battleCloud();
 if(arenaBusy||!cloud?.user)return;
 if(operation==='join'&&!/^[0-9]{4}$/.test(extra.room_code)){
  $('#arenaStatus').textContent='Enter a 4-digit room code.';
  return;
 }
 const account=cloud.user.id,previousRoom=onlineRoom,previousMatch=arenaMatch;
 arenaBusy=true;
 if(operation==='move')lockArenaActions();
 try {
  if(['create','join'].includes(operation)){
   if(!cloud.canPlay||!await cloud.flush())throw Error('Sync your cards first.');
   extra.cards=[...arenaTeam];
  }
  const result=await cloud.battle({operation,room_code:onlineRoom?.code,...extra});
  if(cloud.user?.id!==account)return;
  if(result?.error)throw Error(result.error);
  const changed=onlineRoom?.waiting!==result?.waiting||arenaMatch?.revision!==result?.match?.revision||arenaMatch?.winner!==result?.match?.winner;
  if(previousMatch&&previousRoom?.code===result?.code&&!result.waiting){
   await animateArenaMove(previousMatch,result.match);
   if(cloud.user?.id!==account||onlineRoom!==previousRoom)return;
  }
  onlineRoom=result;
  arenaMatch=result&&!result.waiting?result.match:null;
  if(arenaMatch?.reward&&arenaMatch.winner===result.side)cloud.claimBattleRewards();
  const hadMessage=!!arenaMessage;
  arenaMessage='';
  if(view==='battle'&&(operation!=='state'||changed||hadMessage)){
   arenaBusy=false;
   render();
  }
 }catch(error){
  arenaMessage=error.message;
  if(operation==='state'&&/closed or expired/i.test(error.message)){
   onlineRoom=null;arenaMatch=null;
   if(view==='battle')render();
  }
  if(view==='battle'&&operation==='move'){arenaBusy=false;render();}
  const status=$('.arena-turn span,#arenaStatus:not(.arena-turn)');
  if(status)status.textContent=arenaMessage;
 }finally{arenaBusy=false;}
}
async function battleMove(action,target){
 if(arenaBusy||!arenaMatch)return;
 if(onlineRoom){
  onlineAction('move',{action,target,expected:arenaMatch.revision});
  return;
 }
 const before=arenaMatch,playerMatch=structuredClone(before);
 if(!A.move(playerMatch,0,action,target))return;
 arenaBusy=true;
 lockArenaActions();
 try{
  await animateArenaMove(before,playerMatch);
  if(arenaMatch!==before)return;
  arenaMatch=playerMatch;
  if(playerMatch.winner===0&&playerMatch.levelIndex===undefined){
   playerMatch.reward=E.rollWinReward();
   E.creditReward(state,playerMatch.reward);
   save();
  }
  if(playerMatch.winner===null){
   if(view==='battle')render();
   const enemyMatch=structuredClone(playerMatch);
   if(A.aiMove(enemyMatch)){
    await animateArenaMove(playerMatch,enemyMatch);
    if(arenaMatch!==playerMatch)return;
    arenaMatch=enemyMatch;
   }
  }
  if(arenaMatch.winner!==null&&arenaMatch.levelIndex!==undefined){
   const result=E.finishArenaLevel(state,arenaMatch.levelIndex,arenaMatch.winner===0);
   arenaMatch.levelRewards=result;
   if(result.participation||result.clear)save();
  }
 }finally{
  arenaBusy=false;
  if(view==='battle'&&!$('#arenaRoster')?.open)render();
 }
}
function leaveArena(){
 if(onlineRoom&&(!arenaMatch||arenaMatch.winner===null)){onlineAction('leave');return;}
 clearArenaResult();
 if(arenaMatch?.levelIndex!==undefined&&arenaMatch.winner===0)arenaLevelIndex=null;
 onlineRoom=null;arenaMatch=null;arenaMessage='';render();
}
async function copyRoomCode(){
 const input=$('.room-code');
 if(!input)return;
 try{
  await navigator.clipboard.writeText(input.value);
  $('#arenaStatus').textContent='Code copied.';
 }catch{
  input.select();
  $('#arenaStatus').textContent='Press and hold to copy the code.';
 }
}
setInterval(()=>{
 if(view==='battle'&&!document.hidden&&onlineRoom&&(onlineRoom.waiting||arenaMatch?.winner===null))onlineAction('state');
},2000);


init();
setInterval(incomeTick,1000);
window.addEventListener('pageshow',()=>incomeTick(true,true));
window.addEventListener('pagehide',event=>{
 incomeTick(true);
 if(event.persisted)stopEffects();
 else clearAnimation();
 stopWinMusic();
});
document.addEventListener('visibilitychange',()=>{
 incomeTick(true,!document.hidden);
 if(document.hidden){stopEffects();stopWinMusic();}
});
function updateCarouselControls(){const prev=$('[data-action="previous-pack"]'),next=$('[data-action="next-pack"]');if(prev)prev.disabled=selectedIndex===0;if(next)next.disabled=selectedIndex===packs.length-1;}
function updatePackPanel(){
 $('#packPanel').innerHTML=packPanel();
}
function insideLineup(pack){
 const pools=E.pools(catalog);
 return `<div class="item-grid rock-lineup">${catalog.filter(item=>E.oddsPresets[odds][item.tier]>0).sort((a,b)=>b.tier-a.tier).map(item=>itemCard(item,null,E.itemOdds(item,pack,pools[item.tier],odds))).join('')}</div>`;
}

document.addEventListener('click',e=>{const b=e.target.closest('button,a,summary');if(b&&!b.disabled){const action=b.dataset.action,dedicated=['choose-pack','previous-pack','next-pack','open','keep-result','sell-rock','buy-badge'];if(!dedicated.includes(action)&&!b.closest('#packCarousel'))sound('click');haptic(6);}},true);

function cardImage(item,extra=''){
 const column = item.artIndex % 4;
 const row = Math.floor(item.artIndex / 4);
 const artwork = item.image;
 return `<span class="original-card cartoon-card card--${item.category} ${extra}" data-finish="${escape(item.finish)}" role="img" aria-label="${escape(item.name+' · '+item.detail)}" style="--specimen-filter:${item.artFilter||'none'};--card-color:${E.rarityColors[item.tier]};--art:url('${escape(artwork)}');--art-x:${column*100/3}%;--art-y:${row*100/3}%">
   <span class="cartoon-card-head"><b>${escape(item.detail)}</b></span>
   <span class="cartoon-card-art"></span>
   <span class="cartoon-card-name">${escape(item.name)}</span>
   <span class="cartoon-card-edition">${escape(item.finish)} · ${escape(item.number)}</span>
   <span class="cartoon-card-foil" aria-hidden="true"></span>
 </span>`;
}



function leaderboardMembership(){
 const cloud=window.TCGCloud;
 const joined=!!state.leaderboard;
 return `<div class="rank-membership">
  <p>Ranked collectors show their pack count and virtual balance.</p>
  <button class="secondary" data-action="${cloud?.user?'leaderboard-toggle':'profile'}" ${cloud?.user&&!cloud.canPlay?'disabled':''}>
   ${cloud?.user?(joined?'Leave leaderboard':'Join leaderboard'):'Sign in to join'}
  </button>
 </div>`;
}
function leaderboardView(){
 return `<section class="profile-dashboard ranks-dashboard" aria-labelledby="rankTitle">
  <header class="simple-profile-heading"><h1 id="rankTitle">Ranks</h1></header>
  <div class="profile-data-panel ranks-table-panel">
   <h2>${icon('star')} Collector leaderboard</h2>
   <div class="ranks-controls">${leaderboardMembership()}<button class="secondary" data-action="leaderboard-refresh" aria-label="Refresh standings">Refresh</button></div>
   <div id="leaderboardTables" aria-live="polite">${leaderboardContent()}</div>
  </div>
 </section>`;
}
function leaderboardContent(){
 if(leaderboardError)return `<div class="content-card"><p>${escape(leaderboardError)}</p><button class="secondary" data-action="leaderboard-refresh">Try again</button></div>`;
 if(!leaderboardRows)return '<p class="rank-loading">Loading rankings…</p>';
 const rows=leaderboardRows.opened;
 return `<section class="content-card rank-board">${rows.length?`<table class="rank-table">
   <thead><tr><th>Rank</th><th>Collector</th><th>Packs</th><th>Virtual balance</th></tr></thead>
   <tbody>${rows.map((row,index)=>`<tr>
    <td><span class="rank-place rank-${index+1}">${index+1}</span></td><td>${escape(row.display_name)}</td>
    <td>${Number(row.packs_opened).toLocaleString('en-US')}</td>
    <td>${row.balance_cents!=null&&Number.isSafeInteger(Number(row.balance_cents))?money(Number(row.balance_cents)*E.unitsPerCent):'—'}</td>
   </tr>`).join('')}</tbody>
  </table>`:'<p class="rank-empty">No ranked collectors yet. Join to start the board.</p>'}</section>`;
}
async function loadLeaderboard(force=false){
 if(leaderboardLoading||(!force&&Date.now()-leaderboardLoaded<15000))return;
 leaderboardLoading=true;leaderboardError='';
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
 try{
  const cfg=window.TCG_CLOUD_CONFIG;
  if(!window.TCGCloud?.configured)throw Error('Rankings are not connected yet.');
  const query='select=entry_id,display_name,packs_opened,balance_cents&limit=50&order=packs_opened.desc,entry_id.asc';
  const response=await fetch(cfg.url+'/rest/v1/leaderboard_entries?'+query,{headers:{apikey:cfg.publishableKey},signal:controller.signal});
  if(!response.ok)throw Error('Rankings could not load. Please try again.');
  const opened=await response.json();
  if(!Array.isArray(opened))throw Error('Rankings could not load.');
  leaderboardRows={opened};leaderboardLoaded=Date.now();
 }catch(error){
  leaderboardError=error.name==='AbortError'?'Rankings took too long to load. Please try again.':error.message;
 }finally{
  clearTimeout(timeout);leaderboardLoading=false;
  const target=$('#leaderboardTables');
  if(target)target.innerHTML=leaderboardContent();
 }
}

document.addEventListener('toggle',event=>{const id=event.target.dataset?.profileSection;if(id){if(event.target.open)profileSections.add(id);else profileSections.delete(id);}},true);

function collectionSpotlight(){const cards=[1,5,8,13].map(index=>catalog[index]).filter(Boolean);return `<section class="collection-teaser" aria-label="Collection spotlight"><div class="section-heading"><h2>COLLECTION SPOTLIGHT</h2><button class="text-link" data-action="view-category">View collection</button></div><div class="teaser-grid">${cards.map(item=>`<button class="teaser-card" style="--rarity:${E.rarityColors[item.tier]}" data-action="item" data-id="${item.id}"><span class="teaser-image">${cardImage(item)}</span><span class="teaser-copy"><strong>${escape(item.name)}</strong><small>${escape(item.series)}</small></span></button>`).join('')}</div></section>`;}
