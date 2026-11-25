'use strict';
const E=window.TCGEngine;
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=n=>`<svg class="icon" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const money=(c,compact=false)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:compact&&c%100===0?0:2,maximumFractionDigits:2}).format(c/100);
const date=d=>new Date(d).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
const KEY='tcg-unboxing-sim-v2';
let leaderboardLoaded=0,leaderboardLoading=false,leaderboardRows=null,leaderboardError='';
let effectsBus=null,effectSources=new Set(),effectsUntil=0,winSources=new Set(),winStopTimer=null;
const profileSections=new Set();
const programmaticPackScroll = new WeakSet();
let lastTickAt=0,cardSequence=0,balanceFrame=0,lastInteraction={x:0,y:0},winMusicGain=null;
const SEAL_SWEEP_MS=1800,SPIN_MS=2400;
const REFERRAL_KEY='tcg-cccollectables-claimed';
const chance=(n,digits=3)=>n>0&&n<.001?'<0.0010%':Number(n.toFixed(digits))+'%';
let state=E.defaults(),catalog=[],byId={},packs=[],view='packs',selectedCategory='creatures',selectedIndex=0,mode='Normal',quantity=1,search='',filter='all',sort='recent',limit=30,detailId=null,detailUid=null,previousView='collection',pending=null,phase='sealed',timers=[],audioCtx=null,confirmAction='',carouselTimer=null,feedback='';
function selectedPack(){return packs.find(p=>p.category===selectedCategory&&p.index===selectedIndex);}
function notice(message){$('#status').textContent=message;}
function save(){state.preferences={category:selectedCategory,packIndex:selectedIndex};const cloud=window.TCGCloud;if(cloud?.user&&!cloud.ready){updateHeader();return;}try{localStorage.setItem(cloud?.user?cloud.cacheKey(cloud.user.id):KEY,JSON.stringify(state));}catch{notice('Your device storage is full. Progress could not be saved.');}if(cloud?.user)cloud.queue(state);updateHeader();}
function replaceGameState(next){if(!E.validSave(next,catalog))return;clearAnimation();pending=null;phase='sealed';state=E.migrate(next,catalog);selectedCategory=E.categories[state.preferences.category]?state.preferences.category:'creatures';selectedIndex=Math.max(0,Math.min(8,state.preferences.packIndex||0));if(view==='opening')view='profile';render();}
function guestGameState(){try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(E.validSave(saved,catalog))return E.migrate(saved,catalog);}catch{}return E.defaults();}

function updateHeader(){$('#balance').textContent=money(state.balance);$('#userInitials').textContent=(state.name||'Player').slice(0,2).toUpperCase();}
function log(label,amount,kind){state.history.unshift({label,amount,kind,date:new Date().toISOString()});state.history=state.history.slice(0,150);}
function nav(){const links=[['packs','grid','Packs'],['vault','vault','Vault'],['collection','card','Collection'],['leaderboard','star','Ranks'],['profile','user','Profile']];const html=links.map(([key,i,name])=>`<a href="#${key}" class="nav-link ${key===view?'active':''}" ${key===view?'aria-current="page"':''}>${icon(i)}<span>${name}</span></a>`).join('');$('#desktopNav').innerHTML=html;$('#bottomNav').innerHTML=html;}
function clearAnimation(){stopEffects();timers.forEach(clearTimeout);timers=[];clearTimeout(carouselTimer);}
function go(next){stopWinMusic();stopEffects();if(view==='opening'&&next!=='opening'){clearAnimation();pending=null;phase='sealed';}view=['packs','vault','collection','profile','wallet','leaderboard','opening','item'].includes(next)?next:'packs';search='';limit=30;confirmAction='';feedback='';notice('');if(location.hash!=='#'+view)history.replaceState(null,'','#'+view);render();window.scrollTo({top:0,behavior:'instant'});}
function render(){document.body.dataset.view=view;nav();updateHeader();const app=$('#app');app.innerHTML=view==='packs'?packsView():view==='vault'?vaultView():view==='collection'?collectionView():view==='wallet'?walletView():view==='leaderboard'?leaderboardView():view==='profile'?profileView():view==='item'?itemView():openingView();if(view==='leaderboard')loadLeaderboard();if(view==='packs')bindCarousel();}
function heading(kicker,title){return `<div class="page-heading"><div><div class="eyebrow">${icon('star')}${kicker}</div><h1>${title}</h1></div></div>`;}
function categories(current,action,all=false){return `<div class="category-tabs ${all?'collection-tabs':''}" role="group" aria-label="Collectible category">${all?`<button style="--cat:#d8b9ef" data-action="${action}" data-id="all" class="${current==='all'?'active':''}" aria-pressed="${current==='all'}">All items</button>`:''}${Object.entries(E.categories).map(([id,c])=>`<button style="--cat:${c.color}" data-action="${action}" data-id="${id}" class="${current===id?'active':''}" aria-pressed="${current===id}">${icon(c.icon)}${c.name}</button>`).join('')}</div>`;}
function packPool(pack,oddsMode=mode){return E.pools(catalog,pack,oddsMode);}
function wildCards(pack,oddsMode=mode){
 if(oddsMode==='Gamble')return [];
 return E.pools(catalog,pack,'Normal')[5].filter(item=>oddsMode!=='Ultra'||E.value(item)<=pack.price*20);
}
function packArt(p){const c=E.categories[p.category],top=E.pools(catalog,p,'Normal').flat().slice(-3);return `<div class="foil ${p.category}" style="--foil:${p.color};--foil-alt:${c.color}"><div class="pack-seal top"><i></i></div><div class="foil-body"><div class="foil-shine"></div><div class="foil-logo">TCG<span>UNBOXING SIM</span></div><div class="foil-art">${top.map((i,n)=>cardImage(i,'art-'+n)).join('')}</div><div class="foil-title">${p.name.toUpperCase()}</div><div class="foil-category">${c.name}</div></div><div class="pack-seal bottom"><i></i></div></div>`;}
function packRipArt(p){return `<div class="tear-pack"><div class="tear-layer foil-shell" aria-hidden="true">${packArt(p)}</div><div class="seal-track" aria-hidden="true"><i class="seal-trail"></i><span class="seal-spark">${icon('star')}${Array.from({length:6},(_,i)=>`<i style="--sx:${[-12,8,-7,11,-15,5][i]}px;--sy:${[-9,-12,12,8,3,-4][i]}px;--delay:${-i*.09}s"></i>`).join('')}</span></div></div>`;}

function packsView(){
 const category=E.categories[selectedCategory],selected=selectedPack();
 const editions=packs.filter(pack=>pack.category===selectedCategory);
 return `<div class="pack-room" style="--foil:${selected.color}">
   <header class="pack-room-heading"><h1>Open Packs</h1></header>
   ${categories(selectedCategory,'category')}
   <div class="pack-showcase">
   <section class="carousel-shell" aria-label="Choose a pack edition">
     <div class="pack-carousel" id="packCarousel" tabindex="0" aria-label="Scrollable pack selector">
       ${editions.map(pack=>`<button class="pack-choice ${pack.index===selectedIndex?'selected':''}" style="--foil:${pack.color}" data-action="choose-pack" data-id="${pack.index}" aria-pressed="${pack.index===selectedIndex}" aria-label="${category.name} ${pack.name}, ${money(pack.price)}">
         ${packArt(pack)}<span class="pack-cost"><b>${pack.name}</b><strong>${money(pack.price,true)}</strong></span>
       </button>`).join('')}
     </div>
     <div class="carousel-controls">
       <button data-action="previous-pack" aria-label="Previous pack">${icon('chevron')}<span>Previous</span></button>
       <div class="pack-pagination" role="group" aria-label="Pack editions">
         ${editions.map(pack=>`<button type="button" data-action="choose-pack" data-id="${pack.index}" style="--edition-color:${pack.color}" aria-pressed="${pack.index===selectedIndex}" aria-label="${pack.name}, ${money(pack.price,true)}" title="${pack.name} · ${money(pack.price,true)}"></button>`).join('')}
       </div>
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
     <div class="pack-dialog-actions" hidden><button class="primary" type="button" data-action="apply-odds"></button></div>
   </dialog>
 </div>`;
}
function packValueRange(pack,oddsMode=mode){
 const chances=E.odds(catalog,pack,oddsMode);
 const possible=packPool(pack,oddsMode).filter((_,tier)=>chances[tier]>0).flat();
 const values=[...possible,...wildCards(pack,oddsMode)].map(E.value);
 return {min:Math.min(...values),max:Math.max(...values)};
}
function packPanel(){
 const pack=selectedPack(),{min,max}=packValueRange(pack);
 const cost=pack.price*quantity,canOpen=state.balance>=cost;
 return `<div class="selected-title"><h2>${E.categories[pack.category].name} ${pack.name} Pack</h2><span class="selected-price">${money(pack.price,true)}<small> per pack</small></span></div>
   <div class="pack-facts">
     <div><small>Minimum pull</small><strong>${money(min,true)}</strong></div>
     <div><small>Top chase</small><strong class="chase-value">${money(max,true)}</strong></div>
   </div>
   <div class="pack-quick-links" role="group" aria-label="Pack details">
     <button data-action="pack-details" data-id="odds" aria-haspopup="dialog">${icon('chart')}<span>Odds</span></button>
     <button data-action="pack-details" data-id="options" aria-haspopup="dialog">${icon('adjust')}<span>Options <small>${mode} · ${quantity} pack${quantity===1?'':'s'}</small></span></button>
     <button data-action="pack-details" data-id="cards" aria-haspopup="dialog">${icon('card')}<span>Cards</span></button>
   </div>
   <div class="pack-action-dock">
     <button class="primary open-pack-button pack-open-action" data-action="${canOpen?'open':'wallet'}">${canOpen?'Open '+quantity+' pack'+(quantity>1?'s':'')+' · '+money(cost):'Add virtual funds · '+money(cost)} ${icon(canOpen?'bolt':'wallet')}</button>
     <p class="pack-sim-note">Free virtual currency · No cashouts</p>
   </div>`;
}

function packModeControls(){
 return `<div class="mode-tabs" role="group" aria-label="Odds mode">${Object.keys(E.modes).map(key=>`<button data-action="mode" data-id="${key}" class="${mode===key?'active':''}" aria-pressed="${mode===key}">${key}</button>`).join('')}</div>`;
}

function openPackDetails(kind){
 const dialog=$('#packDetails'), pack=selectedPack();
 const title=$('#packDetailsTitle',dialog), content=$('#packDetailsBody',dialog);
 dialog.dataset.kind=kind;
 const oddsSheet=kind==='odds', art=$('.pack-odds-art',dialog), name=$('.pack-dialog-pack',dialog);
 art.hidden=name.hidden=$('.pack-dialog-actions',dialog).hidden=!oddsSheet;
 art.innerHTML=oddsSheet?packArt(pack):'';
 name.textContent=oddsSheet?`${E.categories[pack.category].name} ${pack.name} Pack`:'';
 if(kind==='options'){
  title.textContent='Pack options';
  content.innerHTML=`<div class="pack-options-controls"><label for="packQuantity">Quantity</label>
    <select id="packQuantity" aria-label="Number of packs">${[1,3,5].map(n=>`<option value="${n}" ${quantity===n?'selected':''}>${n} pack${n===1?'':'s'}</option>`).join('')}</select>
    <div class="pack-modes"><span>Odds mode</span>${packModeControls()}</div></div>`;
 }else if(kind==='odds'){
  title.textContent='Pull rates & values';
  content.innerHTML=`<div class="pack-odds-modes">${packModeControls()}</div>
    <div id="packOddsBody"></div>`;
  previewPackOdds(dialog,mode);
 }else if(kind==='cards'){
  title.textContent='Cards in this pack';
  content.innerHTML=`<div class="section-heading"><h3>${E.categories[pack.category].name} collection</h3><button class="text-link" data-action="view-category">View collection</button></div>
    ${insideLineup()}`;
 }else return;
 dialog.addEventListener('close',()=>{
  if(dialog.isConnected)$('[data-action="pack-details"][data-id="'+kind+'"]')?.focus({preventScroll:true});
 },{once:true});
 dialog.showModal();
 content.scrollTop=0;
}

function scrollToPack(rail, choice, smooth = false) {
  // Use layout coordinates so the pack's visual scale does not shift its snap point.
  const left = choice.offsetLeft - (rail.clientWidth - choice.offsetWidth) / 2;
  const animate = smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  selectedIndex = Math.max(0, Math.min(8, Number(index)));
  if (before !== selectedIndex) sound('tick');
  save();

  const pack = selectedPack();
  const rail = $('#packCarousel');
  const choices = $$('.pack-choice', rail);
  choices.forEach((choice, i) => {
    choice.classList.toggle('selected', i === selectedIndex);
    choice.setAttribute('aria-pressed', String(i === selectedIndex));
  });
  $$('.pack-pagination button').forEach((dot, i) => {
    dot.setAttribute('aria-pressed', String(i === selectedIndex));
  });
  $('.pack-room').style.setProperty('--foil', pack.color);
  updatePackPanel();
  updateCarouselControls();
  if (scroll) scrollToPack(rail, choices[selectedIndex], true);
}
function itemCard(item,own=null,tierOverride=null,itemChance=null){const tier=tierOverride??own?.tier??item.tier,value=own?.value??E.value(item);return `<article class="item-card" style="--rarity:${E.rarityColors[tier]}"><button class="item-button" data-action="item" data-id="${item.id}" ${own?`data-uid="${own.uid}"`:''}><div class="item-visual ${item.category}">${cardImage(item)}${own?.locked?'<span class="item-badge">FAVORITE</span>':state.discovered.includes(item.id)?'<span class="item-badge">COLLECTED</span>':''}</div><div class="item-copy"><span class="rarity">${E.rarityNames[tier]}</span><h3>${escape(item.name)}</h3><p>${escape(item.detail)}</p><div class="item-value"><strong>${money(value)}</strong><small>${itemChance===null?"Virtual value":chance(itemChance)+" chance"}</small></div></div></button>${own?`<div class="item-actions"><button data-action="sell" data-id="${own.uid}" ${own.locked?'disabled':''}>Sell</button><button data-action="favorite" data-id="${own.uid}">${own.locked?'Unfavorite':'Favorite'}</button></div>`:''}</article>`;}
function stats(values){return `<div class="stats">${values.map(([label,value])=>`<div class="stat"><small>${label}</small><strong>${value}</strong></div>`).join('')}</div>`;}
function empty(title,description,button=true){return `<div class="empty">${icon('vault')}<h2>${title}</h2><p>${description}</p>${button?'<button class="primary" data-action="packs">Explore packs</button>':''}</div>`;}
function vaultView(){let owned=state.vault.filter(v=>byId[v.itemId]&&(filter==='all'||byId[v.itemId].category===filter)&&byId[v.itemId].name.toLowerCase().includes(search.toLowerCase()));if(sort==='value')owned.sort((a,b)=>b.value-a.value);if(sort==='rarity')owned.sort((a,b)=>b.tier-a.tier);const total=state.vault.reduce((s,v)=>s+v.value,0),unlocked=state.vault.filter(v=>!v.locked&&v.value>0);return `${heading('YOUR PRIVATE COLLECTION','THE <em>VAULT.</em>')}${stats([['Collectibles',state.vault.length],['Current value',money(total,true)],['Best pull',money(state.best,true)]])}${categories(filter,'filter',true)}<div class="toolbar"><div class="search">${icon('search')}<input id="vaultSearch" placeholder="Search the vault" value="${escape(search)}" aria-label="Search your vault"></div><select id="sort" aria-label="Sort vault"><option value="recent" ${sort==='recent'?'selected':''}>Newest first</option><option value="value" ${sort==='value'?'selected':''}>Highest value</option><option value="rarity" ${sort==='rarity'?'selected':''}>Rarest first</option></select><button class="secondary" data-action="sell-all" ${unlocked.length?'':'disabled'}>Sell unfavorited</button></div>${confirmAction==='sell-all'?`<div class="inline-confirm"><p>Sell ${unlocked.length} unfavorited items for ${money(unlocked.reduce((s,v)=>s+v.value,0))}? Favorites stay in your vault.</p><button class="primary" data-action="confirm-sell-all">Sell items</button><button class="secondary" data-action="cancel-confirm">Keep items</button></div>`:''}${owned.length?`<div class="item-grid">${owned.map(v=>itemCard(byId[v.itemId],v)).join('')}</div>`:empty(state.vault.length?'NO MATCHES.':'YOUR NEXT GRAIL BELONGS HERE.',state.vault.length?'Try another category or search.':'Open a pack to start your collection.')}`;}
function collectionView(){const list=catalog.filter(i=>(filter==='all'||i.category===filter)&&i.name.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>Number(b.id.includes('-expansion-'))-Number(a.id.includes('-expansion-')));return `${heading('THE COLLECTOR INDEX','THE <em>COLLECTION.</em>')}${categories(filter,'filter',true)}<div class="toolbar"><div class="search">${icon('search')}<input id="collectionSearch" value="${escape(search)}" placeholder="Search original cards" aria-label="Search collection"></div></div><div class="item-grid">${list.slice(0,limit).map(i=>itemCard(i)).join('')}</div>${!list.length?empty('NO MATCHES.','Try another name or category.',false):''}${list.length>limit?'<div class="load-more"><button class="secondary" data-action="more">Show more</button></div>':''}`;}
function walletView(){const allowed=E.canDeposit(state);return `${heading('YOUR WALLET','FUND YOUR <em>NEXT PACK.</em>')}<div class="wallet-layout"><section class="content-card"><div class="wallet-balance"><small>CURRENT BALANCE</small><strong>${money(state.balance)}</strong></div><h2>${allowed?'ADD VIRTUAL FUNDS':'DEPOSIT LOCKED'}</h2><p class="deposit-rule">Maximum $10 per deposit. Deposits unlock when your balance is below $1.00.</p><label class="field-label" for="depositAmount">Amount · up to $10</label><div class="money-input"><span>$</span><input type="number" id="depositAmount" min="0.01" max="10" step="0.01" inputmode="decimal" value="10" aria-label="Custom deposit amount" ${allowed?'':'disabled'}></div><button class="primary full" data-action="confirm-deposit" ${allowed?'':'disabled'}>${allowed?'Add virtual funds':'Balance must be below $1'} ${icon('plus')}</button><p class="small-note">Free simulator currency. No payments or cashouts.</p>${feedback?`<p class="inline-feedback" role="status">${escape(feedback)}</p>`:''}<button class="secondary full" data-action="packs">Back to packs</button></section><section class="content-card referral-card">${referralForm()}</section></div>`;}
function profileSection(id,label,content){return `<details class="profile-fold content-card" data-profile-section="${id}" ${profileSections.has(id)?'open':''}><summary>${label}<span aria-hidden="true">+</span></summary><div class="profile-fold-body">${content}</div></details>`;}
function profileView(){return `<div class="simple-profile-heading"><h1>YOUR <em>PROFILE.</em></h1></div><div class="profile-simple profile-basic"><div>${window.TCGCloud?.panel()||''}</div><section class="content-card collector-card"><h2>COLLECTOR NAME</h2><label class="field-label" for="username">Your collector name</label><div class="profile-name-row"><input id="username" maxlength="24" autocomplete="nickname" value="${escape(state.name)}" placeholder="Choose a name"><button class="primary" data-action="save-name">Save</button></div>${feedback?`<p class="settings-feedback" role="status">${escape(feedback)}</p>`:''}</section><div class="profile-folds">${profileSection('stats','My stats',stats([['Packs opened',state.opened],['Virtual spent',money(state.spent)],['Best pull',money(state.best)]]))}${profileSection('rankings','Leaderboard',leaderboardMembership()+'<a class="secondary full" href="#leaderboard">View leaderboard</a>')}${profileSection('android','Download Android app','<p>Play on the website or install the Android app.</p><a class="primary full apk-download" href="TCG_Unboxing_Sim.apk?v=9" download="TCG_Unboxing_Sim.apk">Download APK</a><small>Android 8+ · iPhone and iPad: use the website</small>')}${profileSection('referral','Referral code',referralForm())}${!window.TCGCloud?.user?profileSection('delete','Delete guest progress',`<div class="delete-details"><p>Permanently delete guest progress from this device. The referral reward stays used.</p>${confirmAction==='delete'?'<button class="secondary danger" data-action="delete-confirm">Delete progress permanently</button><button class="secondary" data-action="cancel-confirm">Keep progress</button>':'<button class="secondary danger" data-action="delete-start">Delete guest progress</button>'}</div>`):''}</div></div>`;}

function itemView(){const item=byId[detailId];if(!item)return empty('CARD NOT FOUND.','Choose another collectible.');const own=state.vault.find(v=>v.uid===detailUid),value=own?.value??E.value(item);return `<button class="secondary back-button" data-action="back-item">Back to ${previousView==='packs'?'packs':previousView==='vault'?'vault':'collection'}</button><div class="detail-page"><div class="detail-image ${item.category}">${cardImage(item)}</div><div class="detail-content"><div class="eyebrow">${E.categories[item.category].name} · ${escape(item.number)}</div><h1>${escape(item.name)}</h1><p>${escape(item.lore)}</p><div class="detail-price">${money(value)}</div><p class="price-definition">${own?'Vault value':'Virtual collectible value'}</p>${own?`<button class="primary full" data-action="sell-detail" data-id="${own.uid}" ${own.locked?'disabled':''}>${own.locked?'Favorited':'Sell · '+money(value)}</button>`:''}<p class="price-reference">Original collectible. Values are fictional simulator currency and are not market prices.</p><span class="sim-label">ORIGINAL ART · VIRTUAL CURRENCY</span></div></div>`;}
function haptic(pattern=20){if(navigator.vibrate)navigator.vibrate(pattern);}
function sound(kind){try{if(kind==='tick'){const now=performance.now();if(now-lastTickAt<65)return;lastTickAt=now;}audioCtx??=new(window.AudioContext||window.webkitAudioContext)();audioCtx.resume().catch(()=>{});const now=audioCtx.currentTime;if((kind==='tick'||kind==='click')&&now<effectsUntil)return;stopEffects();effectsBus=audioCtx.createGain();effectsBus.gain.value=1;effectsBus.connect(audioCtx.destination);effectsUntil=now+({tick:.055,click:.08,seal:1.65,charge:.42,rip:.35,burst:.5,cash:.6,grail:.85,hit:.5}[kind]||.5);const tone=(freq,t,d=.12,gain=.035,type='sine')=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.setValueAtTime(freq,now+t);g.gain.setValueAtTime(.001,now+t);g.gain.exponentialRampToValueAtTime(gain,now+t+.008);g.gain.exponentialRampToValueAtTime(.001,now+t+d);o.connect(g);g.connect(effectsBus);trackEffect(o);o.start(now+t);o.stop(now+t+d+.02);};if(kind==='tick'){tone(720,0,.045,.017,'triangle');return;}if(kind==='click'){tone(460,0,.055,.02,'triangle');tone(620,.025,.04,.012);return;}if(kind==='seal'){[1319,1568,1760,2093,2349].forEach((f,i)=>tone(f,.12+i*.3,.24,.012,'sine'));return;}if(kind==='charge'){const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='sine';o.frequency.setValueAtTime(75,now);o.frequency.exponentialRampToValueAtTime(520,now+.36);g.gain.setValueAtTime(.001,now);g.gain.linearRampToValueAtTime(.06,now+.24);g.gain.exponentialRampToValueAtTime(.001,now+.4);o.connect(g);g.connect(effectsBus);trackEffect(o);o.start();o.stop(now+.42);return;}if(kind==='rip'||kind==='burst'){const length=Math.floor(audioCtx.sampleRate*(kind==='rip'?.35:.2)),buffer=audioCtx.createBuffer(1,length,audioCtx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/length,1.7);const src=audioCtx.createBufferSource(),g=audioCtx.createGain(),filter=audioCtx.createBiquadFilter();src.buffer=buffer;filter.type=kind==='rip'?'highpass':'lowpass';filter.frequency.value=kind==='rip'?1100:900;g.gain.value=.12;src.connect(filter);filter.connect(g);g.connect(effectsBus);trackEffect(src);src.start();if(kind==='rip')return;}const notes=kind==='cash'?[784,988,1175,1568]:kind==='grail'?[392,523,659,784,1047,1568]:kind==='burst'?[131,262,523]:[523,659,784];notes.forEach((f,i)=>tone(f,i*.095,.28,.045));}catch{}}
function startOpening(){if(pending&&view==='opening')return;stopWinMusic();const pack=selectedPack(),purchase=E.purchase(state,catalog,pack,mode,quantity);if(!purchase){go('wallet');notice('Add virtual funds to open this pack.');return;}pending=purchase;log(`${quantity}× ${E.categories[pack.category].name} ${pack.name} · ${mode}`,-purchase.cost,'pack');save();phase='sealed';view='opening';history.replaceState(null,'','#opening');render();window.scrollTo({top:0,behavior:'instant'});}
function sparkles(){return `<div class="stage-sparkles">${Array.from({length:14},(_,i)=>`<i style="left:${(i*37)%100}%;top:${(i*23)%100}%;--speed:${2+i%4}s;--delay:${-(i%6)}s"></i>`).join('')}</div>`;}
function openingView(){if(!pending)return empty('READY FOR A NEW PULL?','Choose your next pack.');if(phase==='revealed')return resultsView();const p=pending.pack;return `<section class="opening-screen ${phase}" id="openingScreen" style="--foil:${p.color};--spin-color:${E.rarityColors[0]};--seal-time:${SEAL_SWEEP_MS}ms;--spin-time:${SPIN_MS}ms"><div class="eyebrow">${E.categories[p.category].name} · ${p.name} · ${pending.mode}</div><h1>${phase==='sealed'?'READY TO <em>RIP.</em>':phase==='unsealing'?'UNSEALING YOUR <em>PACK.</em>':'YOUR NEXT <em>DISCOVERY.</em>'}</h1><div class="opening-stage"><div class="opening-aura" aria-hidden="true"></div>${sparkles()}${raritySpinner()}<button class="rip-pack" id="ripPack" type="button" data-action="start-seal" aria-label="Open purchased pack" ${phase!=='sealed'?'disabled':''}>${packRipArt(p)}</button></div><p class="rip-instruction"><span class="opening-message">${phase==='sealed'?'Click or tap the pack to open.':phase==='unsealing'?'Unsealing your pack…':'Opening your pack…'}</span><strong class="spin-readout" aria-hidden="true"><span class="rarity-label active">Common</span><span class="rarity-label"></span></strong></p><button class="skip-button" data-action="skip-reveal" ${phase==='sealed'?'disabled':''}>Reveal now</button></section>`;}

function beginSeal(){
 if(!pending||view!=='opening'||phase!=='sealed')return;
 phase='unsealing';const screen=$('#openingScreen');screen.classList.replace('sealed','unsealing');$('#ripPack').disabled=true;$('.skip-button',screen).disabled=false;$('h1',screen).innerHTML='UNSEALING YOUR <em>PACK.</em>';$('.opening-message',screen).textContent='Unsealing your pack…';
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(!reduced)sound('seal');
 timers.push(setTimeout(()=>{if(pending&&view==='opening'&&phase==='unsealing')rip();},reduced?60:SEAL_SWEEP_MS));
}

function rip(){if(!pending||phase!=='unsealing')return;phase='charging';const screen=$('#openingScreen'),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;screen.classList.replace('unsealing','charging');$('h1',screen).innerHTML='YOUR NEXT <em>DISCOVERY.</em>';$('.opening-message',screen).textContent='Opening your pack…';sound('rip');haptic(15);timers.push(setTimeout(reduced?reveal:spinReveal,reduced?60:350));}

// One awarded pull supplies both the face-up artwork and the final rarity. For a batch, feature its best pull.
function openingPull(){return pending.pulls.reduce((best,pull)=>pull.tier>best.tier||(pull.tier===best.tier&&pull.value>best.value)?pull:best);}

function raritySpinner(){const hero=openingPull();return `<div class="rarity-spin" aria-hidden="true"><div class="spin-glow"></div><div class="card-lift"><div class="spin-card"><div class="spin-face"><span class="spin-face-design"><span class="spin-gem">${icon('star')}</span><strong>TCG</strong><small>UNBOXING SIM</small></span><div class="spin-result-art">${cardImage(byId[hero.itemId])}</div></div></div></div></div>`;}

function spinReveal(){
 if(!pending||view!=='opening'||phase==='revealed'||phase==='spinning')return;
 clearAnimation();phase='spinning';const screen=$('#openingScreen'),labels=$$('.rarity-label',screen),best=openingPull().tier;
 screen.classList.add('spinning');
 // Preview colors pass while the card moves. The final half-turn uses the awarded rarity and face.
 const sequence=[0,2,1,5,3,4,2,0,best],moments=[0,140,300,480,680,900,1160,1420,SPIN_MS*.7];
 sequence.forEach((tier,i)=>timers.push(setTimeout(()=>{
  if(!pending||view!=='opening'||phase!=='spinning')return;
  const wildActive=pending.wild&&i>=4;
  if(wildActive&&!screen.classList.contains('wild')){screen.classList.add('wild');sound('grail');haptic([30,20,50]);}
  screen.style.setProperty('--spin-color',E.rarityColors[wildActive?5:tier]);
  labels[i%2].textContent=pending.wild&&i>=4&&i<sequence.length-1?'WILD · GRAIL':E.rarityNames[tier];
  labels.forEach((label,n)=>label.classList.toggle('active',n===i%2));
  if(i===sequence.length-1){screen.classList.add('landed');screen.dataset.landingRarity=E.rarityNames[best];}else sound('tick');
 },moments[i])));
 timers.push(setTimeout(()=>{if(pending&&view==='opening'&&phase==='spinning')screen.classList.add('face-up');},SPIN_MS*.792));
 timers.push(setTimeout(reveal,SPIN_MS+200));
}

function isHighValuePull(){return !!pending&&pending.pulls.some(p=>p.tier>=4||p.value>=pending.pack.price*5);}
function reveal(){if(!pending||view!=='opening'||phase==='revealed')return;clearAnimation();phase='revealed';render();const best=Math.max(...pending.pulls.map(p=>p.tier)),profit=pending.pulls.reduce((s,p)=>s+p.value,0)-pending.cost;if(isHighValuePull())playWinMusic();else sound(profit>0?'grail':'hit');haptic(best>=4?[40,30,70]:30);if(profit>0)winEffect(profit);}
function trackEffect(source){effectSources.add(source);source.onended=()=>effectSources.delete(source);}
function stopEffects(){for(const source of effectSources){try{source.stop();source.disconnect();}catch{}}effectSources.clear();if(effectsBus){try{effectsBus.disconnect();}catch{}effectsBus=null;}effectsUntil=0;}
function stopWinMusic(){clearTimeout(winStopTimer);for(const source of winSources){try{source.stop();source.disconnect();}catch{}}winSources.clear();if(winMusicGain){try{winMusicGain.disconnect();}catch{}winMusicGain=null;}}

function playWinMusic(){stopEffects();try{audioCtx??=new(window.AudioContext||window.webkitAudioContext)();audioCtx.resume().catch(()=>{});stopWinMusic();const now=audioCtx.currentTime,beat=60/128,bus=audioCtx.createGain();winMusicGain=bus;bus.gain.setValueAtTime(.14,now);bus.gain.setTargetAtTime(0,now+4.5,.18);bus.connect(audioCtx.destination);const note=(midi,start,length,volume=.12,type='triangle')=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.value=440*Math.pow(2,(midi-69)/12);g.gain.setValueAtTime(.001,now+start);g.gain.exponentialRampToValueAtTime(volume,now+start+.018);g.gain.exponentialRampToValueAtTime(.001,now+start+length);o.connect(g);g.connect(bus);winSources.add(o);o.onended=()=>winSources.delete(o);o.start(now+start);o.stop(now+start+length+.03);};const chords=[[60,64,67,71],[57,60,64,67],[53,57,60,64],[55,59,62,67]];chords.forEach((chord,b)=>{chord.forEach(m=>note(m,b*beat*2,beat*1.85,.075,'sine'));note(chord[0]-12,b*beat*2,beat*1.7,.17,'sine');});[72,76,79,84,83,79,76,79,81,84,88,86,84,79,83,84].forEach((m,i)=>note(m,i*beat/2,beat*.46,.15,'triangle'));[72,76,79,84].forEach(m=>note(m,beat*8,1.05,.09,'sine'));winStopTimer=setTimeout(()=>{bus.disconnect();if(winMusicGain===bus)winMusicGain=null;},5500);}catch{}}

function resultTitle(){if(pending.wild)return 'WILD <em>GRAILS.</em>';const best=Math.max(...pending.pulls.map(p=>p.tier)),total=pending.pulls.reduce((s,p)=>s+p.value,0);return best===5?'A GRAIL <em>UNBOXED.</em>':total>pending.cost?'THAT’S A <em>WIN.</em>':'YOUR LATEST <em>PULL.</em>';}
function resultsView(){const best=Math.max(...pending.pulls.map(p=>p.tier)),total=pending.pulls.reduce((s,p)=>s+p.value,0),profit=total-pending.cost;return `<section class="results-screen ${profit>0?'winning':''}${best===5?' grail-result':''}" style="--rarity:${E.rarityColors[best]}"><div class="reveal-shade" aria-hidden="true"></div><div class="eyebrow">${pending.wild?'WILD · ALL GRAIL · ':''}${pending.quantity} ${pending.quantity>1?'COLLECTIBLES':'COLLECTIBLE'} REVEALED${pending.quantity>1?' · SWIPE TO SEE EACH PULL':''}</div><h1>${resultTitle()}</h1><div class="result-grid" aria-label="Revealed collectibles" tabindex="0">${pending.pulls.map((pull,i)=>{const item=byId[pull.itemId];return `<article class="result ${item.category}" data-tier="${pull.tier}" style="--rarity:${E.rarityColors[pull.tier]};--delay:${i*.02}s"><span class="rarity">${E.rarityNames[pull.tier]}</span><div class="result-image">${cardImage(item)}</div><h3>${escape(item.name)}</h3><p>${escape(item.detail)}</p><div class="result-value">${money(pull.value)}</div><span class="result-edition">${escape(item.finish).toUpperCase()} · ${escape(item.number)}</span></article>`;}).join('')}</div><div class="result-summary"><span>Cost ${money(pending.cost)}</span><span>Value ${money(total)}</span><strong class="${profit>=0?'positive':'negative'}">${profit>=0?'Profit +':'Net '}${money(profit)}</strong></div><div class="result-actions"><button class="primary" data-action="sell-result">Sell ${pending.quantity>1?'all ':''}· ${money(total)}</button><button class="secondary" data-action="keep-result">Vault ${pending.quantity>1?'all':'item'}</button><button class="text-link" data-action="packs">Choose another pack</button></div>${profit>0||best>=4?`<div class="particles" aria-hidden="true">${Array.from({length:40},(_,i)=>`<i style="--x:${(E.random()-.5)*900}px;--y:${(E.random()-.4)*700}px;--rot:${E.random()*800}deg;--color:${E.rarityColors[i%6]};--delay:${i*.015}s"></i>`).join('')}</div>`:''}</section>`;}
function sellItems(ids){const sold=E.sell(state,ids);if(sold.count){log(`Sold ${sold.count} collectible${sold.count>1?'s':''}`,sold.amount,'sale');save();}return sold;}
function validDeposit(raw){return E.depositAmount(raw);}
function deposit(){if(!E.canDeposit(state)){feedback='Deposits unlock when your balance falls below $1.00.';render();return;}const amount=E.deposit(state,$('#depositAmount').value);if(!amount){feedback='Enter an amount from $0.01 to $10.00, with no more than two decimal places.';render();return;}log('Virtual deposit',amount,'deposit');save();feedback=money(amount)+' added. Deposits stay locked while your balance is $1.00 or more.';sound('hit');haptic();render();}
function showItem(id,uid){if(!byId[id])return;previousView=view==='opening'?'packs':view;detailId=id;detailUid=uid;go('item');}
window.tcgNativeMessage=notice;window.tcgGoBack=()=>{const dialog=$('#packDetails[open]');if(dialog){dialog.close();return true;}if(view==='packs')return false;go('packs');return true;};
function searchRender(id){const pos=$('#'+id)?.selectionStart;render();const el=$('#'+id);el?.focus();if(pos!=null)el?.setSelectionRange(pos,pos);}
document.addEventListener('click',e=>{const external=e.target.closest('a[target="_blank"]');if(external&&window.TCGAndroid){e.preventDefault();window.TCGAndroid.openExternal(external.href);return;}const b=e.target.closest('[data-action]');if(!b||b.disabled)return;const a=b.dataset.action,id=b.dataset.id;if(window.TCGCloud?.user&&!window.TCGCloud.canPlay&&['open','confirm-deposit','redeem-code','sell','favorite','confirm-sell-all','sell-detail','sell-result','save-name','delete-confirm','category','choose-pack','leaderboard-toggle','previous-pack','next-pack'].includes(a)){notice('Please finish syncing your account before changing your game.');return;}switch(a){
case 'packs':case 'vault':case 'collection':case 'profile':case 'leaderboard':case 'wallet':filter='all';go(a);break;
case 'category':selectedCategory=id;selectedIndex=0;mode='Normal';quantity=1;save();render();break;
case 'choose-pack':selectPack(id);break;case 'previous-pack':selectPack(selectedIndex-1);break;case 'next-pack':selectPack(selectedIndex+1);break;
case 'pack-details':openPackDetails(id);break;
case 'mode':{
 if(!Object.hasOwn(E.modes,id))break;
 const dialog=b.closest('#packDetails[data-kind="odds"]');
 if(dialog){previewPackOdds(dialog,id);break;}
 mode=id;
 updatePackPanel();
 break;
}
case 'apply-odds':{
 const dialog=b.closest('#packDetails[open][data-kind="odds"]');
 if(!dialog)break;
 mode=dialog.dataset.previewMode;
 dialog.close();
 updatePackPanel();
 break;
}
case 'open':startOpening();break;case 'start-seal':beginSeal();break;case 'skip-reveal':if(phase!=='sealed')reveal();break;case 'confirm-deposit':deposit();break;case 'redeem-code':redeemCode();break;
case 'tier-prev':case 'tier-next':{const row=$('#tierRow'+id);row?.scrollBy({left:(a==='tier-next'?1:-1)*row.clientWidth*.85,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});sound('tick');}break;case 'view-category':filter=selectedCategory;go('collection');break;case 'filter':filter=id;limit=30;render();break;case 'more':{limit+=30;const y=scrollY;render();window.scrollTo(0,y);}break;
case 'item':showItem(id,b.dataset.uid);break;case 'back-item':go(previousView);break;
case 'sell':{const v=state.vault.find(v=>v.uid===id),name=byId[v?.itemId]?.name,sold=sellItems([id]);render();if(sold.count)saleEffect(sold.amount,name+' sold');}break;
case 'favorite':{const v=state.vault.find(v=>v.uid===id);if(v){v.locked=!v.locked;save();render();}}break;case 'sell-all':confirmAction='sell-all';render();break;
case 'confirm-sell-all':{const sold=sellItems(state.vault.filter(v=>!v.locked).map(v=>v.uid));confirmAction='';render();if(sold.count)saleEffect(sold.amount,`${sold.count} collectibles sold`);}break;
case 'cancel-confirm':confirmAction='';render();break;case 'sell-detail':{const sold=sellItems([id]);go('vault');if(sold.count)saleEffect(sold.amount,'Collectible sold');}break;
case 'sell-result':if(pending&&!pending.sold){const sold=sellItems(pending.pulls.map(v=>v.uid));go('packs');if(sold.count)saleEffect(sold.amount,`${sold.count} collectible${sold.count>1?'s':''} sold`);}break;
case 'keep-result':{const count=pending?.quantity||0;go('packs');showReceipt('Added to your vault',`${count} collectible${count>1?'s':''} saved`,'vault');}break;
case 'leaderboard-refresh':loadLeaderboard(true);break;
case 'leaderboard-toggle':if(window.TCGCloud?.user&&window.TCGCloud.ready&&window.TCGCloud.canPlay){if(!state.leaderboard&&!state.name.trim()){go('profile');notice('Save a collector name first, then join the leaderboard.');break;}state.leaderboard=!state.leaderboard;save();leaderboardLoaded=0;render();}else{go('profile');notice('Sign in and finish syncing to join the leaderboard.');}break;
case 'save-name':{const name=$('#username').value.trim();if(!name){feedback='Enter a username first.';render();break;}state.name=name.slice(0,24);save();feedback='Username saved.';render();}break;
case 'delete-start':profileSections.add('delete');confirmAction='delete';render();$('.delete-details').scrollIntoView({block:'nearest'});break;
case 'delete-confirm':{const claimed=state.referralClaimed;state=E.defaults();state.referralClaimed=claimed;selectedCategory='creatures';selectedIndex=0;save();go('profile');feedback='Account deleted from this device.';render();}break;
}});
document.addEventListener('input',e=>{if(e.target.id==='vaultSearch'||e.target.id==='collectionSearch'){search=e.target.value;limit=30;searchRender(e.target.id);}});
document.addEventListener('change',e=>{if(e.target.id==='packQuantity'){quantity=Number(e.target.value);updatePackPanel();}if(e.target.id==='sort'){sort=e.target.value;render();}});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='username')$('[data-action="save-name"]').click();if(e.key==='Enter'&&e.target.id==='depositAmount')deposit();if(e.key==='Enter'&&e.target.id==='referralCode')redeemCode();});
window.addEventListener('hashchange',()=>{const target=location.hash.slice(1);if(target!==view&&['packs','vault','collection','profile','wallet','leaderboard'].includes(target)){filter='all';go(target);}});
window.addEventListener('beforeinstallprompt',e=>e.preventDefault());
async function init(){try{if(window.TCG_INLINE_CATALOG)catalog=window.TCG_INLINE_CATALOG;else{const response=await fetch('catalog.json?v=47');if(!response.ok)throw Error();catalog=await response.json();}byId=Object.fromEntries(catalog.map(i=>[i.id,i]));packs=E.packs(catalog);try{const saved=JSON.parse(localStorage.getItem(KEY)||localStorage.getItem('cool-collectables-simulator-v1')||'null');if(E.validSave(saved,catalog))state=E.migrate(saved,catalog);}catch{}try{if(localStorage.getItem(REFERRAL_KEY)==='1')state.referralClaimed=true;if(state.referralClaimed)localStorage.setItem(REFERRAL_KEY,'1');}catch{}state.settings={sound:true,haptics:true};selectedCategory=E.categories[state.preferences.category]?state.preferences.category:'creatures';selectedIndex=Math.max(0,Math.min(8,state.preferences.packIndex||0));const route=location.hash.slice(1);view=['packs','vault','collection','profile','wallet','leaderboard'].includes(route)?route:'packs';save();render();await window.TCGCloud?.init({validate:next=>E.validSave(next,catalog),guest:guestGameState,fresh:E.defaults,replace:replaceGameState,restoreGuest:()=>replaceGameState(guestGameState()),changed:()=>{if(view==='profile'||view==='leaderboard')render();}});if('serviceWorker'in navigator&&location.protocol==='https:'&&!window.TCGAndroid&&!window.TCG_INLINE_CATALOG)navigator.serviceWorker.register('sw.js').catch(()=>{});}catch(e){$('#app').innerHTML=empty('THE COLLECTION COULD NOT LOAD.','Please reload the game to try again.',false);}}
init();
function updateCarouselControls(){const prev=$('[data-action="previous-pack"]'),next=$('[data-action="next-pack"]');if(prev)prev.disabled=selectedIndex===0;if(next)next.disabled=selectedIndex===8;}
function updateModeButtons(dialog,oddsMode){
 $$('[data-action="mode"]',dialog).forEach(button=>{
  const active=button.dataset.id===oddsMode;
  button.classList.toggle('active',active);
  button.setAttribute('aria-pressed',String(active));
 });
}
function previewPackOdds(dialog,oddsMode){
 dialog.dataset.previewMode=oddsMode;
 updateModeButtons(dialog,oddsMode);
 const odds=$('#packOddsBody',dialog);
 const expanded=$('.odds-extra',odds)?.open;
 odds.innerHTML=packOdds(selectedPack(),oddsMode);
 if(expanded)$('.odds-extra',odds).open=true;
 $('[data-action="apply-odds"]',dialog).textContent='Apply '+oddsMode;
}
function updatePackPanel(){
 $('#packPanel').innerHTML=packPanel();
 const dialog=$('#packDetails[open][data-kind="options"]');
 if(dialog)updateModeButtons(dialog,mode);
}
let receiptTimer,effectTimer,receiptExitTimer;
function showReceipt(title,detail,kind='wallet',amount=null){let el=$('#receipt');if(!el){el=document.createElement('aside');el.id='receipt';el.setAttribute('role','status');el.setAttribute('aria-live','polite');document.body.append(el);}clearTimeout(receiptTimer);clearTimeout(receiptExitTimer);el.className='receipt '+kind;el.innerHTML=`<div class="receipt-icon">${icon(kind==='vault'?'vault':'coin')}</div><div class="receipt-copy"><small>${escape(title)}</small>${amount!==null?`<strong class="receipt-amount">+${money(amount)}</strong>`:''}<span>${escape(detail)}</span></div><button data-action="dismiss-receipt" aria-label="Dismiss notification">${icon('close')}</button><div class="receipt-progress"></div>`;receiptTimer=setTimeout(()=>{el.classList.add('leaving');receiptExitTimer=setTimeout(()=>el.remove(),220);},3600);}
function saleEffect(amount,label,title=null){if(title)showReceipt(title,label,'sale',amount);sound('cash');haptic([15,35,25]);$('#moneyEffect')?.remove();cancelAnimationFrame(balanceFrame);const target=state.balance,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,start=target-amount,t0=performance.now();const count=now=>{if(state.balance!==target){updateHeader();return;}const t=Math.min(1,(now-t0)/650);$('#balance').textContent=money(Math.round(start+(target-start)*(1-Math.pow(1-t,3))));if(t<1)balanceFrame=requestAnimationFrame(count);};if(!reduced)balanceFrame=requestAnimationFrame(count);$('.balance').classList.remove('credited');void $('.balance').offsetWidth;$('.balance').classList.add('credited');if(!reduced){const fx=document.createElement('div');fx.id='moneyEffect';fx.className='money-effect';fx.setAttribute('aria-hidden','true');const r=$('#balance').getBoundingClientRect(),tx=r.left+r.width/2,ty=r.top+r.height/2,sx=Math.max(25,Math.min(innerWidth-25,lastInteraction.x||innerWidth*.5)),sy=Math.max(100,Math.min(innerHeight-30,lastInteraction.y||innerHeight*.6));for(let i=0;i<12;i++){const coin=document.createElement('i'),dx=(i%4-1.5)*36,dy=55+(i%3)*20;coin.innerHTML=icon('coin');coin.style.offsetPath=`path('M ${sx} ${sy} Q ${(sx+tx)/2+dx} ${Math.min(sy,ty)-dy} ${tx} ${ty}')`;fx.append(coin);coin.animate([{offsetDistance:'0%',opacity:0,transform:'scale(.6)'},{offsetDistance:'12%',opacity:1,transform:'scale(1)'},{offsetDistance:'84%',opacity:1},{offsetDistance:'100%',opacity:0,transform:'scale(.4)'}],{duration:940,delay:i*34,easing:'cubic-bezier(.25,.1,.25,1)',fill:'both'});}document.body.append(fx);clearTimeout(effectTimer);effectTimer=setTimeout(()=>{fx.remove();$('.balance').classList.remove('credited');},1550);}}
document.addEventListener('click',e=>{if(e.target.closest('[data-action="dismiss-receipt"]'))$('#receipt')?.remove();});

function insideLineup(){const p=selectedPack(),groups=packPool(p),odds=E.odds(catalog,p,mode),individual=E.itemOdds(catalog,p,mode);return groups.map((g,t)=>({g,t})).reverse().filter(({t})=>odds[t]>0).map(({g,t})=>`<section class="tier-lineup" style="--rarity:${E.rarityColors[t]}"><div class="tier-label"><h3>${E.rarityNames[t]}</h3><span>${chance(odds[t],2)} base chance · Card chances below</span><div class="tier-nav"><button data-action="tier-prev" data-id="${t}" aria-label="Previous ${E.rarityNames[t]} items">Previous</button><button data-action="tier-next" data-id="${t}" aria-label="Next ${E.rarityNames[t]} items">Next</button></div></div><div class="tier-items" id="tierRow${t}" tabindex="0" aria-label="${E.rarityNames[t]} possible collectibles">${g.slice().reverse().map(i=>itemCard(i,null,t,individual[t][g.indexOf(i)])).join('')}</div></section>`).join('');}
function referralForm(){return `<div class="referral-emblem">${icon('star')}</div><h2>REFERRAL CODE</h2><p>Redeem a code for a one-time virtual balance reward.</p><label class="field-label" for="referralCode">Your code</label><input id="referralCode" class="full-width" maxlength="40" autocomplete="off" placeholder="Enter referral code" ${state.referralClaimed?'disabled':''}><button class="primary full" data-action="redeem-code" ${state.referralClaimed?'disabled':''}>${state.referralClaimed?'Reward already claimed':'Redeem code'}</button><small>${state.referralClaimed?'Your one-time reward is saved on this device.':'One redemption per device profile.'}</small>`;}
function redeemCode(){try{if(localStorage.getItem(REFERRAL_KEY)==='1')state.referralClaimed=true;}catch{}const result=E.redeemReferral(state,$('#referralCode').value);if(!result.ok){feedback=result.reason==='claimed'?'You have already used this referral reward.':'That referral code was not found.';render();notice(feedback);return;}try{localStorage.setItem(REFERRAL_KEY,'1');}catch{}save();feedback='$100.00 referral reward added.';render();saleEffect(result.amount,'Referral reward · one-time use','Code redeemed');}
function winEffect(profit){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;$('#winCelebration')?.remove();const fx=document.createElement('div');fx.id='winCelebration';fx.className='win-celebration';fx.setAttribute('aria-hidden','true');fx.innerHTML=`<div class="win-halo"></div>${Array.from({length:18},(_,i)=>`<i style="--left:${8+(i*29)%84}%;--delay:${i*.035}s;--drift:${(i%2?1:-1)*(20+i%5*13)}px;--color:${E.rarityColors[i%6]};--spin:${i*23}deg">${icon('coin')}</i>`).join('')}`;document.body.append(fx);setTimeout(()=>fx.remove(),2200);}
document.addEventListener('click',e=>{const b=e.target.closest('button,a,summary');if(b&&!b.disabled){lastInteraction={x:e.clientX,y:e.clientY};const action=b.dataset.action,dedicated=['choose-pack','previous-pack','next-pack','tier-prev','tier-next','start-seal','skip-reveal','open','sell','sell-detail','sell-result','confirm-sell-all','confirm-deposit','redeem-code'];if(!dedicated.includes(action)&&!b.closest('#packCarousel'))sound('click');haptic(6);}},true);

function cardImage(item,extra=''){
 const column = item.artIndex % 4;
 const row = Math.floor(item.artIndex / 4);
 const artwork = item.image + '?v=46';
 return `<span class="original-card cartoon-card card--${item.category} ${extra}" data-finish="${escape(item.finish)}" role="img" aria-label="${escape(item.name+' · '+item.detail)}" style="--card-color:${E.rarityColors[item.tier]};--art:url('${escape(artwork)}');--art-x:${column*100/3}%;--art-y:${row*100/3}%">
   <span class="cartoon-card-head"><b>${escape(E.categories[item.category].name)}</b><i aria-hidden="true">✦</i></span>
   <span class="cartoon-card-art"></span>
   <span class="cartoon-card-name">${escape(item.name)}</span>
   <span class="cartoon-card-edition">${escape(item.finish)} · ${escape(item.number)}</span>
   <span class="cartoon-card-foil" aria-hidden="true"></span>
 </span>`;
}



function leaderboardMembership(){const u=window.TCGCloud?.user;return `<div class="rank-membership"><p>${u?'Show your collector name and stats in the rankings.':'Sign in to join the rankings.'}</p><button class="secondary" data-action="${u?'leaderboard-toggle':'profile'}" ${u&&!window.TCGCloud.canPlay?'disabled':''}>${u?(state.leaderboard?'Leave leaderboard':'Join leaderboard'):'Sign in to join'}</button>${u&&state.leaderboard?'<small>Joined · ranks update after cloud sync</small>':''}</div>`;}
function leaderboardView(){return `${heading('THE COLLECTOR RANKINGS','THE <em>LEADERBOARD.</em>')}${leaderboardMembership()}<div class="rank-toolbar"><p>Top 50 · totals from synced game progress · virtual funds only</p><button class="secondary" data-action="leaderboard-refresh">Refresh</button></div><div id="leaderboardTables" aria-live="polite">${leaderboardContent()}</div>`;}
function leaderboardContent(){if(leaderboardError)return `<div class="content-card"><p>${escape(leaderboardError)}</p><button class="secondary" data-action="leaderboard-refresh">Try again</button></div>`;if(!leaderboardRows)return '<p class="rank-loading">Loading rankings…</p>';return `<div class="rank-columns">${[['opened','PACKS OPENED','packs_opened'],['spent','VIRTUAL MONEY SPENT','spent_cents']].map(([key,title,field])=>`<section class="content-card rank-board"><h2>${title}</h2>${leaderboardRows[key].length?`<table class="rank-table"><thead><tr><th>Rank</th><th>Collector</th><th>${key==='opened'?'Packs':'Virtual spent'}</th></tr></thead><tbody>${leaderboardRows[key].map((r,n)=>`<tr><td><span class="rank-place rank-${n+1}">${n+1}</span></td><td>${escape(r.display_name)}</td><td>${key==='spent'?money(Number(r[field])):Number(r[field]).toLocaleString('en-US')}</td></tr>`).join('')}</tbody></table>`:'<p class="rank-empty">No ranked collectors yet. Join to start the board.</p>'}</section>`).join('')}</div>`;}
async function loadLeaderboard(force=false){if(leaderboardLoading||(!force&&Date.now()-leaderboardLoaded<15000))return;leaderboardLoading=true;leaderboardError='';const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);try{const cfg=window.TCG_CLOUD_CONFIG;if(!window.TCGCloud?.configured)throw Error('Rankings are not connected yet.');const query='select=entry_id,display_name,packs_opened,spent_cents&limit=50&order=';const fetchBoard=async order=>{const r=await fetch(cfg.url+'/rest/v1/leaderboard_entries?'+query+order,{headers:{apikey:cfg.publishableKey},signal:controller.signal});if(!r.ok)throw Error('Rankings could not load. Please try again.');const rows=await r.json();if(!Array.isArray(rows))throw Error('Rankings could not load.');return rows;};const [opened,spent]=await Promise.all([fetchBoard('packs_opened.desc,spent_cents.desc,entry_id.asc'),fetchBoard('spent_cents.desc,packs_opened.desc,entry_id.asc')]);leaderboardRows={opened,spent};leaderboardLoaded=Date.now();}catch(e){leaderboardError=e.name==='AbortError'?'Rankings took too long to load. Please try again.':e.message;}finally{clearTimeout(timeout);leaderboardLoading=false;const target=$('#leaderboardTables');if(target)target.innerHTML=leaderboardContent();}}

document.addEventListener('toggle',event=>{const id=event.target.dataset?.profileSection;if(id){if(event.target.open)profileSections.add(id);else profileSections.delete(id);}},true);
window.addEventListener('pagehide',()=>{clearAnimation();stopWinMusic();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){stopEffects();stopWinMusic();}});

function collectionSpotlight(){const list=catalog.filter(i=>i.category===selectedCategory&&i.id.includes('-expansion-')&&i.finish==='Base');const cards=[0,3,6,9].map(n=>list[n]).filter(Boolean);return `<section class="collection-teaser" aria-label="Collection spotlight"><div class="section-heading"><h2>COLLECTION SPOTLIGHT</h2><button class="text-link" data-action="view-category">View collection</button></div><div class="teaser-grid">${cards.map(item=>`<button class="teaser-card" style="--rarity:${E.rarityColors[item.tier]}" data-action="item" data-id="${item.id}"><span class="teaser-image">${cardImage(item)}</span><span class="teaser-copy"><strong>${escape(item.name)}</strong><small>${escape(item.series)}</small></span></button>`).join('')}</div></section>`;}

function displayOdds(pack,oddsMode=mode){const wild=oddsMode==='Gamble'?0:E.wildChance;return E.odds(catalog,pack,oddsMode).map((n,t)=>n*(1-wild)+(t===5?wild*100:0));}
function packOdds(pack,oddsMode){
 const groups=packPool(pack,oddsMode),base=E.odds(catalog,pack,oddsMode);
 const actual=displayOdds(pack,oddsMode),wild=oddsMode!=='Gamble';
 const {min,max}=packValueRange(pack,oddsMode);
 const rows=actual.map((percent,tier)=>({percent,tier,values:groups[tier].map(E.value)}))
   .filter(row=>row.percent>0).reverse();
 const wildValues=wildCards(pack,oddsMode).map(E.value);
 const range=values=>values.length?`${money(Math.min(...values))}–${money(Math.max(...values))}`:'';
 return `<div class="pack-odds-heading"><h3>Card probabilities</h3><p class="odds-intro">Per card · rarest first</p></div>
   <ul class="pack-odds-list">${rows.map(({percent,tier,values})=>`<li style="--rarity:${E.rarityColors[tier]}">
     <div><span>${E.rarityNames[tier]} <small>${range(tier===5?[...values,...wildValues]:values)}</small></span><strong>${chance(percent,2)}</strong></div>
     <progress max="100" value="${percent}" aria-label="${E.rarityNames[tier]} chance"></progress>
   </li>`).join('')}</ul>
   <dl class="pack-odds-range" aria-label="Virtual value per card">
     <div><dt>Min. virtual value</dt><dd>${money(min,true)}</dd></div>
     <div><dt>Max. virtual value</dt><dd>${money(max,true)}</dd></div>
   </dl>
   <p class="odds-note">${wild?'Wild: 1 in 10 openings makes every card a Grail. This is included above.':'Wild is off in Gamble mode. Each card is a separate draw.'}</p>
   <details class="odds-extra"><summary>Values & detailed odds</summary>
     <p class="odds-note">${wild?'Base chances below apply when Wild does not trigger.':'Chances below are per card.'}</p>
     <table class="odds-table"><thead><tr><th>Rarity</th><th>Card value</th><th>${wild?'Base chance':'Chance'}</th></tr></thead>
     <tbody>${rows.filter(row=>base[row.tier]>0).map(({tier,values})=>`<tr><td class="rarity" style="--rarity:${E.rarityColors[tier]}">${E.rarityNames[tier]}</td><td>${range(values)}</td><td>${chance(base[tier],2)}</td></tr>`).join('')}</tbody></table>
     <p class="odds-note">Average card value${wild?' before Wild':''}: ${money(Math.round(E.expectedReturn(catalog,pack,oddsMode)*pack.price))}. Values are in virtual currency.</p>
   </details>`;
}
