'use strict';
const E=window.TCGEngine;
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=n=>`<svg class="icon" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const date=d=>new Date(d).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
const KEY='tcg-unboxing-sim-v2';
let leaderboardLoaded=0,leaderboardLoading=false,leaderboardRows=null,leaderboardError='';
let effectsBus=null,effectSources=new Set(),effectsUntil=0,winSources=new Set(),winStopTimer=null;
const profileSections=new Set();
const programmaticPackScroll = new WeakSet();
let lastTickAt=0,cardSequence=0,wheelAudioFrame=0,winMusicGain=null;
const TEAR_MS=360,SPIN_MS=3600,FACE_UP_AT=1;
// Match short, frequency-weighted listening levels across the game's sound cues.
const CUE_GAIN = {tick:21.5, click:14.4, 'pack-crinkle':2.8, rip:.85, wheel:14, land:4.1, vault:6.1, hit:3.3};
const WIN_MUSIC_GAIN = .56;
const chance=(n,digits=3)=>n>0&&n<.001?'<0.0010%':Number(n.toFixed(digits))+'%';
let state=E.defaults(),catalog=[],byId={},packs=[],view='packs',selectedIndex=0,odds='Balanced',search='',sort='recent',detailId=null,previousView='collection',pending=null,phase='sealed',timers=[],audioCtx=null,confirmAction='',carouselTimer=null,feedback='';
function selectedPack(){return packs[selectedIndex];}
function notice(message){$('#status').textContent=message;}
function save(){state.preferences={category:'rocks',packIndex:selectedIndex};const cloud=window.TCGCloud;if(cloud?.user&&!cloud.ready){updateHeader();return;}try{localStorage.setItem(cloud?.user?cloud.cacheKey(cloud.user.id):KEY,JSON.stringify(state));}catch{notice('Your device storage is full. Progress could not be saved.');}if(cloud?.user)cloud.queue(state);updateHeader();}
function replaceGameState(next){if(!E.validSave(next,catalog))return;clearAnimation();pending=null;phase='sealed';state=E.migrate(next,catalog);incomeNeedsSave=false;lastIncomeSave=0;selectedIndex=Math.max(0,Math.min(8,state.preferences.packIndex||0));if(view==='opening')view='profile';render();}
function guestGameState(){try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(E.validSave(saved,catalog))return E.migrate(saved,catalog);}catch{}return E.defaults();}

function money(units){return '$'+(units/1000000).toFixed(6);}
function updateMoney(){
 const cents=state.balance+state.rockRemainder/E.unitsPerCent;
 $('#rockBalance').textContent='$'+(cents/100).toFixed(6);
 const active=E.activeRocks(state);
 const rate=$('#incomeRate');
 if(rate)rate.textContent=money(active.reduce((sum,rock)=>sum+E.passiveUnits[rock.tier],0))+'/sec';
 const sellButtons=$$('[data-action="sell-rock"]');
 if(!sellButtons.length)return;
 const reserve=new Map(state.vault.map(rock=>[rock.uid,rock.resaleUnits||0]));
 for(const button of sellButtons){
  const amount=reserve.get(button.dataset.id)||0;
  button.disabled=amount===0;
  button.textContent='Sell '+money(amount);
 }
}
let incomeNeedsSave=false,lastIncomeSave=0,rockNoticeTimer;
function incomeTick(force=false){
 const cloud=window.TCGCloud;
 if(!catalog.length||(!force&&document.hidden)||(cloud?.user&&!cloud.canPlay))return;
 const now=Date.now();
 if(E.settleIncome(state,now)>0)incomeNeedsSave=true;
 if(incomeNeedsSave&&(force||now-lastIncomeSave>=30000)){
  save();
  incomeNeedsSave=false;lastIncomeSave=now;
 }
 if(!document.hidden)updateMoney();
}
function rockAction(action,uid){
 const proceeds=action==='tap-rock'?E.tapRock(state,uid):E.sellRock(state,uid);
 if(!proceeds)return;
 save();
 sound(action==='tap-rock'?'click':'vault');
 if(action==='sell-rock')render();
 const message=(action==='tap-rock'?'Rock tapped · +':'Rock sold · +')+money(proceeds);
 notice(message);
 clearTimeout(rockNoticeTimer);
 rockNoticeTimer=setTimeout(()=>{if($('#status').textContent===message)notice('');},1600);
}

function updateHeader(){
 updateMoney();
 $('#userInitials').textContent=(state.name||'Player').slice(0,2).toUpperCase();
}
function nav(){const links=[['packs','grid','Packs'],['vault','vault','Inventory'],['collection','card','Collection'],['leaderboard','star','Ranks'],['profile','user','Profile']];const html=links.map(([key,i,name])=>`<a href="#${key}" class="nav-link ${key===view?'active':''}" ${key===view?'aria-current="page"':''}>${icon(i)}<span>${name}</span></a>`).join('');$('#desktopNav').innerHTML=html;$('#bottomNav').innerHTML=html;}
function clearAnimation(){cancelAnimationFrame(wheelAudioFrame);stopEffects();timers.forEach(clearTimeout);timers=[];clearTimeout(carouselTimer);}
function go(next){stopWinMusic();stopEffects();if(view==='opening'&&next!=='opening'){clearAnimation();pending=null;phase='sealed';}view=['packs','vault','collection','profile','leaderboard','opening','item'].includes(next)?next:'packs';search='';confirmAction='';feedback='';notice('');if(location.hash!=='#'+view)history.replaceState(null,'','#'+view);render();window.scrollTo({top:0,behavior:'instant'});}
function render(){document.body.dataset.view=view;nav();updateHeader();const app=$('#app');app.innerHTML=view==='packs'?packsView():view==='vault'?vaultView():view==='collection'?collectionView():view==='leaderboard'?leaderboardView():view==='profile'?profileView():view==='item'?itemView():openingView();if(view==='leaderboard')loadLeaderboard();if(view==='packs')bindCarousel();updateMoney();}
function heading(kicker,title){return `<div class="page-heading"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1></div></div>`;}
function packArt(pack){
 return `<div class="foil rocks" data-edition="${pack.name}" style="--foil:${pack.color}"><div class="pack-seal top" aria-hidden="true"></div><div class="foil-body"><div class="foil-shine"></div><div class="foil-logo">TCG<span>UNBOXING SIM</span></div><div class="foil-art">${[...pack.cover.slice(1),pack.cover[0]].map((id,index)=>cardImage(byId[id],'art-'+index)).join('')}</div><div class="foil-crest" aria-hidden="true"></div><div class="foil-title">${pack.name.toUpperCase()}</div><div class="foil-category">ROCKS</div></div></div>`;
}

function packsView(){
 const selected=selectedPack();
 return `<div class="pack-room" style="--foil:${selected.color}">
   <header class="pack-room-heading"><h1>Open Packs</h1></header>
   <div class="pack-showcase">
   <section class="carousel-shell" aria-label="Choose a pack edition">
     <div class="pack-carousel" id="packCarousel" tabindex="0" aria-label="Scrollable pack selector">
       ${packs.map(pack=>`<button class="pack-choice ${pack.index===selectedIndex?'selected':''}" style="--foil:${pack.color}" data-action="choose-pack" data-id="${pack.index}" aria-pressed="${pack.index===selectedIndex}" aria-label="${pack.name} Rock Pack">
         ${packArt(pack)}<span class="pack-cost"><b>${pack.name}</b></span>
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
 return `<div class="selected-title"><h2>${pack.name} Rock Pack</h2></div>
   <div class="pack-quick-links" role="group" aria-label="Pack details">
     <button data-action="pack-details" data-id="odds" aria-haspopup="dialog">Odds</button>
     <button data-action="pack-details" data-id="cards" aria-haspopup="dialog">Cards</button>
   </div>
   <div class="pack-action-dock">
     <button class="primary open-pack-button pack-open-action" data-action="open">Open 1 free pack</button>
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
 <ul class="pack-odds-list">${E.oddsPresets[odds].map((percent,tier)=>`<li style="--rarity:${E.rarityColors[tier]}">
  <div><span>${E.rarityNames[tier]}</span><strong>${percent}%</strong></div>
  <progress max="100" value="${percent}" aria-label="${E.rarityNames[tier]}"></progress>
 </li>`).reverse().join('')}</ul>`;
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
  selectedIndex = Math.max(0, Math.min(8, Number(index)));
  if (before !== selectedIndex) sound('pack-crinkle');
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
  <button class="item-button" data-action="${own?'tap-rock':'item'}" data-id="${own?.uid||item.id}" ${own?`aria-label="Tap ${escape(item.name)} to earn"`:''}>
   <div class="item-visual rocks">${cardImage(item)}${state.discovered.includes(item.id)?'<span class="item-badge">COLLECTED</span>':''}</div>
   <div class="item-copy"><span class="rarity">${E.rarityNames[item.tier]}</span><h3>${escape(item.name)}</h3><p>${escape(item.detail)}</p>
    ${itemChance===null?'':`<div class="item-value">${chance(itemChance,2)}</div>`}
   </div>
  </button>
  ${own?`<p class="rock-rate">${earning?money(E.passiveUnits[own.tier])+'/sec':'Idle'} · ${money(E.tapUnits[own.tier])}/tap</p>
  <div class="item-actions rock-actions">
   <button data-action="favorite" data-id="${own.uid}" aria-label="${own.locked?'Unfavorite':'Favorite'} ${escape(item.name)}" aria-pressed="${!!own.locked}">${own.locked?'★':'☆'}</button>
   ${own.locked?'':`<button data-action="sell-rock" data-id="${own.uid}" ${own.resaleUnits?'':'disabled'}>Sell ${money(own.resaleUnits||0)}</button>`}
  </div>`:''}
 </article>`;
}
function stats(values){return `<div class="stats">${values.map(([label,value])=>`<div class="stat"><small>${label}</small><strong>${value}</strong></div>`).join('')}</div>`;}
function empty(title,description,button=true){return `<div class="empty"><h2>${title}</h2><p>${description}</p>${button?'<button class="primary" data-action="packs">Explore packs</button>':''}</div>`;}
function vaultView(){
 const earning=new Set(E.activeRocks(state).map(rock=>rock.uid));
 const owned=state.vault.filter(card=>byId[card.itemId]?.name.toLowerCase().includes(search.toLowerCase()));
 if(sort==='rarity')owned.sort((a,b)=>b.tier-a.tier);
 return `${heading('YOUR ROCK COLLECTION','YOUR <em>INVENTORY.</em>')}${stats([['Owned rocks',state.vault.length],['Rock income','<span id="incomeRate"></span>']])}
  <p class="rock-income-note">Tap an owned rock to earn. Your 12 rarest distinct cards earn automatically for up to 8 hours away. Selling collects the money that rock set aside.</p>
  <div class="toolbar"><div class="search">${icon('search')}<input id="vaultSearch" placeholder="Search your rocks" aria-label="Search your rocks" value="${escape(search)}"></div>
   <select id="sort" aria-label="Sort vault"><option value="recent">Newest first</option><option value="rarity" ${sort==='rarity'?'selected':''}>Rarest first</option></select></div>
  ${owned.length?`<div class="item-grid">${owned.map(card=>itemCard(byId[card.itemId],card,null,earning.has(card.uid))).join('')}</div>`:empty(state.vault.length?'NO MATCHES.':'YOUR VAULT IS EMPTY.',state.vault.length?'Try another rock name.':'Open a pack to start collecting.')}`;
}
function collectionView(){
 const cards=catalog.filter(item=>item.name.toLowerCase().includes(search.toLowerCase()));
 return `${heading('ROCKS & MINERALS','THE <em>COLLECTION.</em>')}
  <div class="toolbar"><div class="search">${icon('search')}<input id="collectionSearch" placeholder="Find a rock" aria-label="Find a rock" value="${escape(search)}"></div></div>
  ${cards.length?`<div class="item-grid">${cards.map(item=>itemCard(item)).join('')}</div>`:empty('NO MATCHES.','Try another rock name.',false)}`;
}
function profileSection(id,label,content){return `<details class="profile-fold content-card" data-profile-section="${id}" ${profileSections.has(id)?'open':''}><summary>${label}<span aria-hidden="true">+</span></summary><div class="profile-fold-body">${content}</div></details>`;}
function profileView(){return `<div class="simple-profile-heading"><h1>YOUR <em>PROFILE.</em></h1></div><div class="profile-simple profile-basic"><div>${window.TCGCloud?.panel()||''}</div><section class="content-card collector-card"><h2>COLLECTOR NAME</h2><label class="field-label" for="username">Your collector name</label><div class="profile-name-row"><input id="username" maxlength="24" autocomplete="nickname" value="${escape(state.name)}" placeholder="Choose a name"><button class="primary" data-action="save-name">Save</button></div>${feedback?`<p class="settings-feedback" role="status">${escape(feedback)}</p>`:''}</section><div class="profile-folds">${profileSection('stats','My stats',stats([['Packs opened',state.opened],['Unique rocks',state.discovered.length]]))}${profileSection('rankings','Leaderboard',leaderboardMembership()+'<a class="secondary full" href="#leaderboard">View leaderboard</a>')}${profileSection('install','Install the app','<p>On iPhone, open this site in Safari. Tap Share, select <strong>Add to Home Screen</strong>, turn on <strong>Open as Web App</strong> if shown, then tap Add.</p><p>On Android, open the browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>')}${!window.TCGCloud?.user?profileSection('delete','Delete guest progress',`<div class="delete-details"><p>Permanently delete guest progress from this device. </p>${confirmAction==='delete'?'<button class="secondary danger" data-action="delete-confirm">Delete progress permanently</button><button class="secondary" data-action="cancel-confirm">Keep progress</button>':'<button class="secondary danger" data-action="delete-start">Delete guest progress</button>'}</div>`):''}</div></div>`;}

function itemView(){
 const item=byId[detailId];
 if(!item)return empty('CARD NOT FOUND.','Choose another rock.');
 return `<button class="secondary back-button" data-action="back-item">Back to ${previousView==='vault'?'vault':previousView==='packs'?'packs':'collection'}</button>
  <div class="detail-page"><div class="detail-image rocks">${cardImage(item)}</div><div class="detail-content">
   <div class="eyebrow">${escape(item.detail)} · ${escape(item.number)}</div><h1>${escape(item.name)}</h1><p>${escape(item.lore)}</p>
   <span class="rarity" style="--rarity:${E.rarityColors[item.tier]}">${E.rarityNames[item.tier]}</span>
  </div></div>`;
}
function haptic(pattern=20){if(navigator.vibrate)navigator.vibrate(pattern);}
function unlockSound(){
 try{
  audioCtx??=new(window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state!=='running')audioCtx.resume().catch(()=>{});
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
  if(!audioCtx)return;
  const now=audioCtx.currentTime;
  if((kind==='tick'||kind==='click')&&now<effectsUntil)return;
  stopEffects();
  effectsBus=audioCtx.createGain();
  effectsBus.gain.value=CUE_GAIN[kind]??1;
  effectsBus.connect(audioCtx.destination);
  effectsUntil=now+({tick:.055,click:.08,'pack-crinkle':.155,rip:.35,wheel:.037,land:.46,vault:.25,hit:.5}[kind]||.5);

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
   case 'wheel':
    tone(310,0,.034,.022,'triangle',155);
    tone(2280,0,.026,.018,'triangle',1300);
    break;
   case 'land':
    tone(200,0,.075,.04,'triangle',102);
    tone(784,.044,.18,.04,'triangle');
    tone(1175,.105,.26,.033);
    break;
   case 'vault':
    tone(530,0,.135,.032,'triangle');
    tone(795,.06,.19,.027);
    break;
   case 'pack-crinkle':
   case 'rip': {
    const crinkle=kind==='pack-crinkle';
    const duration=crinkle?.15:.35;
    const buffer=audioCtx.createBuffer(1,Math.floor(audioCtx.sampleRate*duration),audioCtx.sampleRate);
    const data=buffer.getChannelData(0);
    const folds=[.012,.029,.047,.081,.108,.131];
    const widths=[.010,.009,.015,.012,.017,.011];
    const strengths=[.62,.45,.95,.56,.76,.34];
    for(let i=0;i<data.length;i++){
     const time=i/audioCtx.sampleRate;
     const envelope=crinkle
      ? folds.reduce((level,center,index)=>level+strengths[index]*Math.max(0,1-Math.abs(time-center)/widths[index])**2,0)
      : (1-i/data.length)**1.7;
     data[i]=(Math.random()*2-1)*envelope;
    }
    const source=audioCtx.createBufferSource(),filter=audioCtx.createBiquadFilter(),gain=audioCtx.createGain();
    source.buffer=buffer;
    filter.type=crinkle?'bandpass':'highpass';
    filter.frequency.value=crinkle?2850:1100;
    filter.Q.value=crinkle?.7:1;
    gain.gain.value=crinkle?.2:.12;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(effectsBus);
    trackEffect(source);
    source.start();
    break;
   }
   case 'hit':
    [523,659,784].forEach((frequency,index)=>tone(frequency,index*.095,.28,.045,'sine'));
    break;
  }
 }catch{}
}

function startOpening(){
 if(pending&&view==='opening')return;
 stopWinMusic();
 pending=E.openPack(state,catalog,selectedPack(),odds);
 save();
 phase='sealed';view='opening';
 history.replaceState(null,'','#opening');
 render();
 window.scrollTo({top:0,behavior:'instant'});
}
function openingView(){
 if(!pending)return empty('READY FOR A NEW PULL?','Choose your next pack.');
 if(phase==='revealed')return resultsView();
 const pack=pending.pack;
 return `<section class="opening-screen ${phase}" id="openingScreen" style="--foil:${pack.color};--spin-color:${E.rarityColors[0]};--tear-time:${TEAR_MS}ms;--spin-time:${SPIN_MS}ms">
   <div class="eyebrow">${pack.name} Rock Pack</div>
   <h1>${phase==='sealed'?'READY TO <em>RIP.</em>':'CARD <em>WHEEL.</em>'}</h1>
   <div class="opening-stage">
     <div class="opening-aura" aria-hidden="true"></div>
     ${raritySpinner()}
     <button class="rip-pack" id="ripPack" type="button" data-action="start-seal" aria-label="Rip open pack" ${phase!=='sealed'?'disabled':''}>
       <div class="tear-pack"><div class="tear-layer foil-shell" aria-hidden="true">${packArt(pack)}</div></div>
     </button>
   </div>
   <p class="rip-instruction" role="status">
     <span class="opening-message">${phase==='sealed'?'Tap the pack to open.':'Opening your pack…'}</span>
     <strong class="spin-readout"><span class="rarity-label"></span></strong>
   </p>
 </section>`;
}

function rip(){
 if(!pending||view!=='opening'||phase!=='sealed')return;
 if(matchMedia('(prefers-reduced-motion: reduce)').matches){reveal();return;}
 phase='charging';
 const screen=$('#openingScreen');
 screen.classList.replace('sealed','charging');
 $('#ripPack').disabled=true;
 $('h1',screen).innerHTML='CARD <em>WHEEL.</em>';
 $('.opening-message',screen).textContent='Opening your pack…';
 sound('rip');
 haptic(15);
 timers.push(setTimeout(spinReveal,TEAR_MS));
}

// One awarded pull supplies both the face-up artwork and the final rarity. For a batch, feature its best pull.
function openingPull(){return pending.pull;}

function raritySpinner(){
 const hero=openingPull();
 const previews=catalog.filter(item=>item.id!==hero.itemId).map(item=>({item,tier:item.tier}));
 const slots=Array.from({length:7},(_,i)=>previews[Math.floor(i*previews.length/7)]||{item:byId[hero.itemId],tier:hero.tier});
 const landingIndex=hero.itemId.length%8;
 slots.splice(landingIndex,0,{item:byId[hero.itemId],tier:hero.tier});
 const stops=slots.map(({tier},i)=>`${E.rarityColors[tier]} ${i*45}deg ${(i+1)*45}deg`).join(',');
 const rotation=1800+(360-landingIndex*45)%360;
 return `<div class="card-wheel" aria-hidden="true" data-winner="${hero.itemId}" data-landing-index="${landingIndex}">
   <div class="wheel-pointer"></div>
   <div class="wheel-disc" style="--wheel-stop:${rotation}deg;--wheel-colors:conic-gradient(from -22.5deg,${stops})">
     ${slots.map(({item,tier},i)=>`<div class="wheel-slot" data-item-id="${item.id}" data-tier="${tier}" style="--slot-angle:${i*45}deg;--rarity:${E.rarityColors[tier]}">
       ${cardImage(item)}<span>${E.rarityNames[tier]}</span>
     </div>`).join('')}
   </div>
   <div class="wheel-hub">TCG</div>
   <div class="wheel-winner">${cardImage(byId[hero.itemId])}<strong>${escape(byId[hero.itemId].name)}</strong></div>
 </div>`;
}

function playWheelTicks(disc){
 const segmentAngle=360/disc.children.length;
 let previousSegment=0,lastSound=-Infinity;
 const tick=(now)=>{
  if(phase!=='spinning'||!disc.isConnected)return;
  const transform=getComputedStyle(disc).transform;
  if(transform!=='none'){
   const matrix=new DOMMatrixReadOnly(transform);
   const angle=Math.atan2(matrix.b,matrix.a)*180/Math.PI;
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
 if(!pending||view!=='opening'||phase!=='charging')return;
 clearAnimation();
 phase='spinning';
 const screen=$('#openingScreen');
 const tier=openingPull().tier;
 screen.style.setProperty('--spin-color','#c7a4fb');
 screen.classList.add('spinning');
 playWheelTicks($('.wheel-disc',screen));
 timers.push(setTimeout(()=>{
  if(!pending||view!=='opening'||phase!=='spinning')return;
  cancelAnimationFrame(wheelAudioFrame);
  sound('land');
  screen.classList.add('face-up','landed');
  screen.style.setProperty('--spin-color',E.rarityColors[tier]);
  screen.dataset.landingRarity=E.rarityNames[tier];
  screen.dataset.landingCard=openingPull().itemId;
  const label=$('.rarity-label',screen);
  label.textContent=E.rarityNames[tier];
  label.classList.add('active');
 },SPIN_MS*FACE_UP_AT));
 timers.push(setTimeout(reveal,SPIN_MS+1100));
}

function reveal(){
 if(!pending||view!=='opening'||phase==='revealed')return;
 const skippedWheel=phase==='sealed';
 clearAnimation();
 phase='revealed';
 render();
 const best=pending.pull.tier;
 if(best>=4&&!document.hidden)playWinMusic();
 else if(skippedWheel)sound('hit');
 haptic(best>=4?[40,30,70]:30);

}
function trackEffect(source){effectSources.add(source);source.onended=()=>effectSources.delete(source);}
function stopEffects(){for(const source of effectSources){try{source.stop();source.disconnect();}catch{}}effectSources.clear();if(effectsBus){try{effectsBus.disconnect();}catch{}effectsBus=null;}effectsUntil=0;}
function stopWinMusic(){clearTimeout(winStopTimer);for(const source of winSources){try{source.stop();source.disconnect();}catch{}}winSources.clear();if(winMusicGain){try{winMusicGain.disconnect();}catch{}winMusicGain=null;}}

function playWinMusic(){stopEffects();try{audioCtx??=new(window.AudioContext||window.webkitAudioContext)();audioCtx.resume().catch(()=>{});stopWinMusic();const now=audioCtx.currentTime,beat=60/128,bus=audioCtx.createGain();winMusicGain=bus;bus.gain.setValueAtTime(WIN_MUSIC_GAIN,now);bus.gain.setTargetAtTime(0,now+4.5,.18);bus.connect(audioCtx.destination);const note=(midi,start,length,volume=.12,type='triangle')=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.value=440*Math.pow(2,(midi-69)/12);g.gain.setValueAtTime(.001,now+start);g.gain.exponentialRampToValueAtTime(volume,now+start+.018);g.gain.exponentialRampToValueAtTime(.001,now+start+length);o.connect(g);g.connect(bus);winSources.add(o);o.onended=()=>winSources.delete(o);o.start(now+start);o.stop(now+start+length+.03);};const chords=[[60,64,67,71],[57,60,64,67],[53,57,60,64],[55,59,62,67]];chords.forEach((chord,b)=>{chord.forEach(m=>note(m,b*beat*2,beat*1.85,.075,'sine'));note(chord[0]-12,b*beat*2,beat*1.7,.17,'sine');});[72,76,79,84,83,79,76,79,81,84,88,86,84,79,83,84].forEach((m,i)=>note(m,i*beat/2,beat*.46,.15,'triangle'));[72,76,79,84].forEach(m=>note(m,beat*8,1.05,.09,'sine'));winStopTimer=setTimeout(()=>{bus.disconnect();if(winMusicGain===bus)winMusicGain=null;},5500);}catch{}}

function resultsView(){
 const best=openingPull().tier;
 return `<section class="results-screen ${best===5?'grail-result':''}" style="--rarity:${E.rarityColors[best]}">
  <div class="reveal-shade" aria-hidden="true"></div>
  <div class="eyebrow">${pending.duplicate?'ALREADY IN YOUR INVENTORY':'ADDED TO YOUR INVENTORY'}</div>
  <h1>ROCK <em>REVEALED.</em></h1>
  <div class="result-grid" aria-label="Revealed rock cards" tabindex="0">${[pending.pull].map(pull=>{
   const item=byId[pull.itemId];
   return `<article class="result rocks" style="--rarity:${E.rarityColors[item.tier]}">
    <span class="rarity">${E.rarityNames[item.tier]}</span><div class="result-image">${cardImage(item)}</div>
    <h3>${escape(item.name)}</h3><p>${escape(item.detail)}</p><span class="result-edition">${escape(item.number)}</span>
   </article>`;
  }).join('')}</div>
  <div class="result-actions">
   <button class="primary" data-action="keep-result">Back to packs</button>
   <button class="secondary" data-action="vault">View inventory</button>
  </div>
 </section>`;
}
function showItem(id){if(!byId[id])return;previousView=view==='opening'?'packs':view;detailId=id;go('item');}
window.tcgNativeMessage=notice;window.tcgGoBack=()=>{const dialog=$('#packDetails[open]');if(dialog){dialog.close();return true;}if(view==='packs')return false;go('packs');return true;};
function searchRender(id){const pos=$('#'+id)?.selectionStart;render();const el=$('#'+id);el?.focus();if(pos!=null)el?.setSelectionRange(pos,pos);}
document.addEventListener('click',e=>{const external=e.target.closest('a[target="_blank"]');if(external&&window.TCGAndroid){e.preventDefault();window.TCGAndroid.openExternal(external.href);return;}const b=e.target.closest('[data-action]');if(!b||b.disabled)return;const a=b.dataset.action,id=b.dataset.id;if(window.TCGCloud?.user&&!window.TCGCloud.canPlay&&['open','tap-rock','sell-rock','favorite','save-name','delete-confirm','leaderboard-toggle'].includes(a)){notice('Please finish syncing your account before changing your game.');return;}switch(a){
case 'packs':case 'vault':case 'collection':case 'profile':case 'leaderboard':go(a);break;
case 'choose-pack':selectPack(id);break;case 'previous-pack':selectPack(selectedIndex-1);break;case 'next-pack':selectPack(selectedIndex+1);break;
case 'pack-details':openPackDetails(id);break;
case 'rock-odds':if(Object.hasOwn(E.oddsPresets,id)){odds=id;const content=$('#packDetailsBody');content.innerHTML=oddsView();content.querySelector('.active').focus();}break;
case 'tap-rock':case 'sell-rock':rockAction(a,id);break;
case 'open':startOpening();break;case 'start-seal':rip();break;
case 'view-category':go('collection');break;
case 'item':showItem(id);break;case 'back-item':go(previousView);break;
case 'favorite':{const v=state.vault.find(v=>v.uid===id);if(v){v.locked=!v.locked;save();render();}}break;
case 'cancel-confirm':confirmAction='';render();break;
case 'keep-result':go('packs');sound('vault');break;
case 'leaderboard-refresh':loadLeaderboard(true);break;
case 'leaderboard-toggle':if(window.TCGCloud?.user&&window.TCGCloud.ready&&window.TCGCloud.canPlay){if(!state.leaderboard&&!state.name.trim()){go('profile');notice('Save a collector name first, then join the leaderboard.');break;}state.leaderboard=!state.leaderboard;save();leaderboardLoaded=0;render();}else{go('profile');notice('Sign in and finish syncing to join the leaderboard.');}break;
case 'save-name':{const name=$('#username').value.trim();if(!name){feedback='Enter a username first.';render();break;}state.name=name.slice(0,24);save();feedback='Username saved.';render();}break;
case 'delete-start':profileSections.add('delete');confirmAction='delete';render();$('.delete-details').scrollIntoView({block:'nearest'});break;
case 'delete-confirm':{state=E.defaults();selectedIndex=0;save();go('profile');feedback='Account deleted from this device.';render();}break;
}});
document.addEventListener('input',e=>{if(e.target.id==='vaultSearch'||e.target.id==='collectionSearch'){search=e.target.value;searchRender(e.target.id);}});
document.addEventListener('change',e=>{if(e.target.id==='sort'){sort=e.target.value;render();}});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='username')$('[data-action="save-name"]').click();});
window.addEventListener('hashchange',()=>{const target=location.hash.slice(1);if(target!==view&&['packs','vault','collection','profile','leaderboard'].includes(target)){go(target);}});
async function init(){try{if(window.TCG_INLINE_CATALOG)catalog=window.TCG_INLINE_CATALOG;else{const response=await fetch('catalog.json?v=79');if(!response.ok)throw Error();catalog=await response.json();}byId=Object.fromEntries(catalog.map(i=>[i.id,i]));packs=E.packs();try{const saved=JSON.parse(localStorage.getItem(KEY)||localStorage.getItem('cool-collectables-simulator-v1')||'null');if(E.validSave(saved,catalog))state=E.migrate(saved,catalog);}catch{}state.settings={sound:true,haptics:true};E.settleIncome(state);selectedIndex=Math.max(0,Math.min(8,state.preferences.packIndex||0));const route=location.hash.slice(1);view=['packs','vault','collection','profile','leaderboard'].includes(route)?route:'packs';save();render();await window.TCGCloud?.init({validate:next=>E.validSave(next,catalog),guest:guestGameState,fresh:E.defaults,replace:replaceGameState,restoreGuest:()=>replaceGameState(guestGameState()),changed:()=>{incomeTick(true);if(view==='profile'||view==='leaderboard')render();}});if('serviceWorker'in navigator&&window.isSecureContext&&!window.TCGAndroid&&!window.TCG_INLINE_CATALOG)navigator.serviceWorker.register('sw.js').catch(()=>{});}catch(e){$('#app').innerHTML=empty('THE COLLECTION COULD NOT LOAD.','Please reload the game to try again.',false);}}
init();
setInterval(incomeTick,1000);
window.addEventListener('pageshow',()=>incomeTick(true));
function updateCarouselControls(){const prev=$('[data-action="previous-pack"]'),next=$('[data-action="next-pack"]');if(prev)prev.disabled=selectedIndex===0;if(next)next.disabled=selectedIndex===8;}
function updatePackPanel(){
 $('#packPanel').innerHTML=packPanel();
}
function insideLineup(pack){
 const pools=E.pools(catalog);
 return `<div class="item-grid rock-lineup">${catalog.slice().sort((a,b)=>b.tier-a.tier).map(item=>itemCard(item,null,E.itemOdds(item,pack,pools[item.tier],odds))).join('')}</div>`;
}

document.addEventListener('click',e=>{const b=e.target.closest('button,a,summary');if(b&&!b.disabled){const action=b.dataset.action,dedicated=['choose-pack','previous-pack','next-pack','start-seal','open','keep-result','tap-rock','sell-rock'];if(!dedicated.includes(action)&&!b.closest('#packCarousel'))sound('click');haptic(6);}},true);

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



function leaderboardMembership(){const u=window.TCGCloud?.user;return `<div class="rank-membership"><p>${u?'Show your collector name and stats in the rankings.':'Sign in to join the rankings.'}</p><button class="secondary" data-action="${u?'leaderboard-toggle':'profile'}" ${u&&!window.TCGCloud.canPlay?'disabled':''}>${u?(state.leaderboard?'Leave leaderboard':'Join leaderboard'):'Sign in to join'}</button>${u&&state.leaderboard?'<small>Joined · ranks update after cloud sync</small>':''}</div>`;}
function leaderboardView(){return `${heading('THE COLLECTOR RANKINGS','THE <em>LEADERBOARD.</em>')}${leaderboardMembership()}<div class="rank-toolbar"><p>Top 50 · packs opened across synced collections</p><button class="secondary" data-action="leaderboard-refresh">Refresh</button></div><div id="leaderboardTables" aria-live="polite">${leaderboardContent()}</div>`;}
function leaderboardContent(){if(leaderboardError)return `<div class="content-card"><p>${escape(leaderboardError)}</p><button class="secondary" data-action="leaderboard-refresh">Try again</button></div>`;if(!leaderboardRows)return '<p class="rank-loading">Loading rankings…</p>';return `<div class="rank-columns">${[['opened','PACKS OPENED','packs_opened']].map(([key,title,field])=>`<section class="content-card rank-board"><h2>${title}</h2>${leaderboardRows[key].length?`<table class="rank-table"><thead><tr><th>Rank</th><th>Collector</th><th>${key==='opened'?'Packs':'Virtual spent'}</th></tr></thead><tbody>${leaderboardRows[key].map((r,n)=>`<tr><td><span class="rank-place rank-${n+1}">${n+1}</span></td><td>${escape(r.display_name)}</td><td>${key==='spent'?money(Number(r[field])):Number(r[field]).toLocaleString('en-US')}</td></tr>`).join('')}</tbody></table>`:'<p class="rank-empty">No ranked collectors yet. Join to start the board.</p>'}</section>`).join('')}</div>`;}
async function loadLeaderboard(force=false){if(leaderboardLoading||(!force&&Date.now()-leaderboardLoaded<15000))return;leaderboardLoading=true;leaderboardError='';const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);try{const cfg=window.TCG_CLOUD_CONFIG;if(!window.TCGCloud?.configured)throw Error('Rankings are not connected yet.');const query='select=entry_id,display_name,packs_opened&limit=50&order=';const fetchBoard=async order=>{const r=await fetch(cfg.url+'/rest/v1/leaderboard_entries?'+query+order,{headers:{apikey:cfg.publishableKey},signal:controller.signal});if(!r.ok)throw Error('Rankings could not load. Please try again.');const rows=await r.json();if(!Array.isArray(rows))throw Error('Rankings could not load.');return rows;};const opened=await fetchBoard('packs_opened.desc,entry_id.asc');leaderboardRows={opened};leaderboardLoaded=Date.now();}catch(e){leaderboardError=e.name==='AbortError'?'Rankings took too long to load. Please try again.':e.message;}finally{clearTimeout(timeout);leaderboardLoading=false;const target=$('#leaderboardTables');if(target)target.innerHTML=leaderboardContent();}}

document.addEventListener('toggle',event=>{const id=event.target.dataset?.profileSection;if(id){if(event.target.open)profileSections.add(id);else profileSections.delete(id);}},true);
window.addEventListener('pagehide',()=>{incomeTick(true);clearAnimation();stopWinMusic();});
document.addEventListener('visibilitychange',()=>{incomeTick(true);if(document.visibilityState==='hidden'){stopEffects();stopWinMusic();}});

function collectionSpotlight(){const cards=[1,5,8,13].map(index=>catalog[index]).filter(Boolean);return `<section class="collection-teaser" aria-label="Collection spotlight"><div class="section-heading"><h2>COLLECTION SPOTLIGHT</h2><button class="text-link" data-action="view-category">View collection</button></div><div class="teaser-grid">${cards.map(item=>`<button class="teaser-card" style="--rarity:${E.rarityColors[item.tier]}" data-action="item" data-id="${item.id}"><span class="teaser-image">${cardImage(item)}</span><span class="teaser-copy"><strong>${escape(item.name)}</strong><small>${escape(item.series)}</small></span></button>`).join('')}</div></section>`;}
