(function(root){
'use strict';
const PASSWORD_MIN_LENGTH = 6;
const cfg=root.TCG_CLOUD_CONFIG||{},esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function secretKey(key){if(String(key).startsWith('sb_secret_'))return true;try{return JSON.parse(atob(String(key).split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='service_role'}catch{return false}}
const configured=/^https:\/\/[^/]+\/?$/.test(cfg.url||'')&&!!cfg.publishableKey&&!secretKey(cfg.publishableKey);
let client=null,session=null,user=null,ready=false,busy=false,dirty=null,revision=0,generation=0,flushing=null,collectRewards=false,timer=null,hooks=null,conflict=false,problem=false,recovery=false,tab='login',message='',status='Guest · saved on this device';
const pendingKey=id=>'tcg-cloud-pending-'+id,cacheKey=id=>'tcg-account-'+id;
const clone=x=>JSON.parse(JSON.stringify(x));
function localGet(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}}
function localSet(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}}
function display(full=false){document.querySelectorAll('[data-cloud-status]').forEach(el=>el.textContent=status);if(full)hooks?.changed();}
function setStatus(text){status=text;display();}
async function request(path,method='GET',body,active=session){if(!active?.access_token)throw Error('Please sign in again.');const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);try{const r=await fetch(cfg.url.replace(/\/$/,'')+'/rest/v1/'+path,{method,headers:{apikey:cfg.publishableKey,Authorization:'Bearer '+active.access_token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});const text=await r.text();let data;try{data=text?JSON.parse(text):null}catch{data=null}if(!r.ok){const e=Error(data?.code==='40001'?'This save changed on another device. Load its latest save before continuing.':r.status===401?'Your session expired. Sign in again to sync.':data?.message||'Cloud save is unavailable. Your game is still saved on this device.');e.code=data?.code;throw e;}return data;}finally{clearTimeout(timeout)}}
async function adopt(next,event){
 if(next?.user?.id===user?.id&&(ready||busy)){session=next;if(event==='PASSWORD_RECOVERY'){recovery=true;display(true);}return;}
 const ownGeneration=++generation;clearTimeout(timer);dirty=null;collectRewards=false;conflict=false;problem=false;ready=false;session=next;user=next?.user||null;
 if(!user){busy=false;status='Guest · saved on this device';hooks?.restoreGuest();display(true);return;}
 busy=true;setStatus('Loading your cloud save…');display(true);const active=next,id=user.id;
 try{
  const rows=await request('game_saves?user_id=eq.'+encodeURIComponent(id)+'&select=state,revision,updated_at','GET',undefined,active);if(generation!==ownGeneration)return;
  const row=rows?.[0],pending=localGet(pendingKey(id));revision=row?.revision||0;let loaded;
  if(row){if(!hooks.validate(row.state))throw Error('Your cloud save could not be read. It has not been overwritten.');loaded=row.state;}
  else{
   const signupEmail=localGet('tcg-new-account-email');
   loaded=signupEmail===user.email?.toLowerCase()?hooks.guest():hooks.fresh();
   if(!hooks.validate(loaded))loaded=hooks.fresh();
   loaded.welcomePack=true;
   loaded.preferences={...loaded.preferences,packIndex:0};
   revision=await request('rpc/save_game','POST',{p_state:loaded,p_expected_revision:0},active);
   if(generation!==ownGeneration)return;
   try{localStorage.removeItem('tcg-new-account-email')}catch{}
  }
  if(pending&&hooks.validate(pending.state)){
   if(pending.revision===revision){loaded=pending.state;dirty=clone(loaded);}
   else{loaded=pending.state;conflict=true;problem=true;status='Another device has a newer save. Your unsynced game is kept on this device.';}
  }
  hooks.replace(clone(loaded));localSet(cacheKey(id),loaded);ready=true;busy=false;if(event==='PASSWORD_RECOVERY')recovery=true;
  if(!conflict){status=dirty?'Saving pending changes…':'Cloud save up to date';display(true);void flush(true);}else display(true);
 }catch(e){if(generation!==ownGeneration)return;busy=false;problem=true;status=e.message;const cached=localGet(cacheKey(id));if(cached&&hooks.validate(cached))hooks.replace(cached);display(true);}
}
function queue(state){if(!user||!ready||conflict)return;dirty=clone(state);localSet(cacheKey(user.id),dirty);localSet(pendingKey(user.id),{state:dirty,revision});setStatus(problem?'Saved on this device · sync needs attention':'Saving…');clearTimeout(timer);timer=setTimeout(()=>flush(),500);}
async function flush(includeRewards=false){
 if(!user||!ready||conflict)return !problem;
 if(includeRewards)collectRewards=true;
 if(flushing)return flushing;
 if(!dirty&&!collectRewards)return !problem;
 const gen=generation,id=user.id,active=session;
 flushing=(async()=>{
  while((dirty||collectRewards)&&generation===gen&&!conflict){
   const snapshot=dirty;
   const checkRewards=collectRewards;
   dirty=null;
   collectRewards=false;
   try{
    const result=await request('rpc/save_rock_game','POST',{p_state:snapshot,p_expected_revision:revision},active);
    if(generation!==gen)return false;
    revision=result.revision;
    problem=false;
    if(result.reward>0){
     const updated=hooks.creditBattleReward(result.reward);
     if(dirty)hooks.creditBattleReward(result.reward,dirty);
     localSet(cacheKey(id),updated);
    }
    if(dirty)localSet(pendingKey(id),{state:dirty,revision});
    else try{localStorage.removeItem(pendingKey(id));}catch{}
    setStatus(dirty?'Saving…':'Cloud save up to date');
   }catch(error){
    if(generation!==gen)return false;
    dirty=dirty||snapshot;
    collectRewards=collectRewards||checkRewards;
    problem=true;
    conflict=error.code==='40001';
    if(dirty)localSet(pendingKey(id),{state:dirty,revision});
    status=error.message;
    display(true);
    return false;
   }
  }
  return generation===gen&&!problem;
 })().finally(()=>{flushing=null;});
 return flushing;
}
async function reload(){if(!user||busy)return;busy=true;display(true);const id=user.id,gen=generation;try{const rows=await request('game_saves?user_id=eq.'+encodeURIComponent(id)+'&select=state,revision');if(gen!==generation)return;const row=rows?.[0];if(!row||!hooks.validate(row.state))throw Error('No valid cloud save was found.');dirty=null;revision=row.revision;conflict=false;problem=false;ready=true;try{localStorage.removeItem(pendingKey(id))}catch{}hooks.replace(clone(row.state));localSet(cacheKey(id),row.state);status='Loaded latest cloud save';}catch(e){status=e.message;}finally{busy=false;display(true)}}
function panel(){
 if(!configured)return '<section class="content-card account-card"><h2>YOUR ACCOUNT</h2><p>Email accounts are not available yet. You can keep playing on this device.</p><p class="account-status" data-cloud-status>Guest · saved on this device</p></section>';
 if(user)return `<section class="content-card account-card"><h2>YOUR ACCOUNT</h2><p class="account-email">${esc(user.email)}</p><p class="account-status" data-cloud-status role="status">${esc(status)}</p>${recovery?passwordForm():''}<div class="account-buttons"><button class="primary" data-cloud-action="sync" ${busy?'disabled':''}>Sync now</button><button class="secondary" data-cloud-action="logout" ${busy?'disabled':''}>Sign out</button></div>${problem?`<p>Loading the cloud save replaces any unsynced changes on this device.</p><button class="secondary full" data-cloud-action="reload" ${busy?'disabled':''}>Load latest cloud save</button>`:''}<details class="info-details"><summary>Delete cloud account</summary><p>Delete your email account and its cloud progress permanently. This cannot be undone.</p><label class="account-confirm"><input id="confirmCloudDelete" type="checkbox"> I want to permanently delete this account.</label><button class="secondary danger full" data-cloud-action="delete" ${busy?'disabled':''}>Delete cloud account permanently</button></details></section>`;
 return `<section class="content-card account-card"><h2>SIGN IN & SAVE</h2><p>Save your cards and progress across devices.</p><div class="account-tabs" role="group" aria-label="Account form"><button data-cloud-action="login-tab" class="${tab==='login'?'active':''}">Sign in</button><button data-cloud-action="signup-tab" class="${tab==='signup'?'active':''}">Create account</button></div><form id="accountForm"><label for="accountEmail">Email</label><input id="accountEmail" name="email" type="email" autocomplete="email" required maxlength="254"><label for="accountPassword">Password</label><input id="accountPassword" name="password" type="password" autocomplete="${tab==='signup'?'new-password':'current-password'}" ${tab==='signup'?`minlength="${PASSWORD_MIN_LENGTH}"`:''} required maxlength="128">${tab==='signup'?`<p class="small-note">Use at least ${PASSWORD_MIN_LENGTH} characters. Your guest game will be attached to your new account.</p>`:''}<button class="primary full" type="submit" ${busy?'disabled':''}>${busy?'Please wait…':tab==='signup'?'Create account':'Sign in'}</button></form><button class="text-link" data-cloud-action="forgot" ${busy?'disabled':''}>Forgot password?</button><p class="account-status" role="status">${esc(message)}</p></section>`;
}
function passwordForm(){return `<form id="passwordForm"><label for="newAccountPassword">New password</label><input id="newAccountPassword" name="password" type="password" autocomplete="new-password" minlength="${PASSWORD_MIN_LENGTH}" maxlength="128" required><button class="primary full" type="submit">Save new password</button></form>`}
async function init(callbacks){hooks=callbacks;if(!configured||!root.TCGSupabase){display(true);return;}client=root.TCGSupabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'}});client.auth.onAuthStateChange((event,next)=>{setTimeout(()=>adopt(next,event),0)});const {data,error}=await client.auth.getSession();if(error){message='Please sign in again.';display(true);return;}await adopt(data.session,'INITIAL_SESSION');}
async function submit(event){const form=event.target;if(form.id!=='accountForm'&&form.id!=='passwordForm')return;event.preventDefault();if(!client||busy||!form.reportValidity())return;busy=true;message='';const data=new FormData(form);try{if(form.id==='passwordForm'){const r=await client.auth.updateUser({password:data.get('password')});if(r.error)throw r.error;recovery=false;status='Password updated';}else{const email=String(data.get('email')).trim(),password=String(data.get('password'));if(tab==='signup')localSet('tcg-new-account-email',email.toLowerCase());const result=tab==='signup'?await client.auth.signUp({email,password,options:{emailRedirectTo:cfg.redirectUrl||new URL('./',location.href).href}}):await client.auth.signInWithPassword({email,password});if(result.error)throw result.error;if(result.data.session){busy=false;await adopt(result.data.session,'SIGNED_IN');}else message='Check your email to confirm your account, then sign in here.';}}catch(e){message=e.message||'Unable to sign in. Please try again.';status=message;}finally{busy=false;form.querySelectorAll('input[type=password]').forEach(el=>el.value='');display(true)}}
async function action(event){const b=event.target.closest('[data-cloud-action]');if(!b||b.disabled)return;const act=b.dataset.cloudAction;if(act==='login-tab'||act==='signup-tab'){tab=act==='login-tab'?'login':'signup';message='';display(true);return;}if(!client||busy)return;
 try{if(act==='forgot'){const email=document.querySelector('#accountEmail');if(!email?.value||!email.checkValidity()){message='Enter your email address first.';display(true);return;}busy=true;const r=await client.auth.resetPasswordForEmail(email.value.trim(),{redirectTo:cfg.redirectUrl||new URL('./',location.href).href});if(r.error)throw r.error;message='If an account exists, a password reset email has been sent.';}
 else if(act==='sync'){if(!ready){const retry=session;user=null;busy=false;await adopt(retry,'RETRY');return;}await flush();}
 else if(act==='reload'){await reload();return;}
 else if(act==='logout'){if(dirty&&!(await flush()))throw Error('Your latest game is saved on this device. Sync it before signing out.');busy=true;const r=await client.auth.signOut();if(r.error)throw r.error;await adopt(null,'SIGNED_OUT');}
 else if(act==='delete'){if(!document.querySelector('#confirmCloudDelete')?.checked)throw Error('Check the deletion confirmation first.');busy=true;await request('rpc/delete_my_game_account','POST',{});const id=user.id;try{localStorage.removeItem(cacheKey(id));localStorage.removeItem(pendingKey(id))}catch{}dirty=null;await client.auth.signOut({scope:'local'});await adopt(null,'SIGNED_OUT');message='Cloud account deleted.';}
 }catch(e){message=e.message;status=e.message;}finally{busy=false;display(true)}}
document.addEventListener('submit',submit);document.addEventListener('click',action);
window.addEventListener('online',()=>{
 if(user&&ready&&!conflict)flush(true);
 else if(user&&!ready&&!busy&&session)adopt(session,'RECONNECT');
});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&dirty)flush();else if(document.visibilityState==='visible'&&user&&ready)flush(true);});
root.TCGCloud={init,panel,queue,flush,reload,claimBattleRewards:()=>flush(true),battle:args=>request('rpc/rock_battle','POST',args),get user(){return user},get configured(){return configured},get canPlay(){return !user||(ready&&!busy&&!problem&&!conflict)},get canAccrue(){return !user||(ready&&!busy&&!conflict)},get ready(){return ready},cacheKey};
})(window);
