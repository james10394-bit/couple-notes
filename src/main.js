import './style.css';
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
import { initializeFirestore, collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, Timestamp } from 'firebase/firestore';

const env = import.meta.env;
const configured = !!(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID);
const app = configured ? initializeApp({apiKey:env.VITE_FIREBASE_API_KEY,authDomain:env.VITE_FIREBASE_AUTH_DOMAIN,projectId:env.VITE_FIREBASE_PROJECT_ID,appId:env.VITE_FIREBASE_APP_ID}) : null;
const auth = app && getAuth(app), db = app && initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false
});
const root = document.querySelector('#app');
let user = null, coupleId = null, notes = [], items = [], members = [], stops = [], googleToken = '', googleExpiry = 0, googleTimer = null, syncing = false;
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const error = e => { console.error(e); alert(e?.message || '操作失敗，請稍後再試。'); };
const dateText = v => v ? new Date(v).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '未設定';
const uid = () => user?.uid;
const coll = path => collection(db,'couples',coupleId,path);

function render() {
  if (!configured) {root.innerHTML=`<main class="shell"><h1>兩個人的小日子 ♡</h1><div class="card"><h2>先完成設定</h2><p>建立 Firebase 專案，將 <code>.env.example</code> 複製為 <code>.env</code> 並填入設定，再啟動網站。步驟請看 README。</p></div></main>`;return;}
  if (!user) {root.innerHTML=`<main class="shell login"><div class="hero"><small>OUR LITTLE DAYS</small><h1>兩個人的小日子 ♡</h1><p>想說的話、要做的事、上班的日子，放在同一個地方。</p><button id="login">使用 Google 登入</button></div></main>`;return;}
  if (!coupleId) {root.innerHTML=`<main class="shell"><header><h1>兩個人的小日子 ♡</h1><button class="subtle" id="logout">登出</button></header><div class="grid"><section class="card"><h2>建立兩人空間</h2><p>建立後取得邀請碼，傳給另一半。</p><button id="create">建立空間</button></section><section class="card"><h2>加入另一半的空間</h2><input id="invite-input" placeholder="輸入邀請碼" maxlength="32"><button id="join">加入空間</button></section></div></main>`;return;}
  root.innerHTML=`<main class="shell"><header><div><small>OUR LITTLE DAYS · ${esc(members.map(m=>m.displayName).join(' × '))}</small><h1>兩個人的小日子 ♡</h1></div><button class="subtle" id="logout">登出</button></header>
  <nav><a href="#notes">記事</a><a href="#items">待辦與值班</a><a href="#google">Google 同步</a></nav>
  <section class="intro card"><div><h2>今天也一起把生活記下來</h2><p>記事與行程即時同步。分享給另一半的內容，由你自己選擇。</p></div><div class="pill">已同步 · ${esc(members.length)} 位成員</div></section>
  <div class="grid"><section class="card" id="notes"><h2>我們的記事本</h2><form id="note-form"><input name="title" maxlength="100" required placeholder="標題，例如：週末小旅行"><textarea name="body" maxlength="10000" required placeholder="寫下想記住的事…"></textarea><button>新增記事</button></form><div class="list">${notes.length?notes.map(n=>`<article class="entry"><div class="row"><strong>${esc(n.title)}</strong><button class="icon" data-delete-note="${esc(n.id)}" aria-label="刪除記事">×</button></div><p class="pre">${esc(n.body)}</p><small>${esc(members.find(m=>m.uid===n.authorUid)?.displayName||'成員')}</small></article>`).join(''):'<p class="empty">還沒有記事，寫下第一句吧。</p>'}</div></section>
  <section class="card" id="items"><h2>待辦與值班</h2><form id="item-form"><input name="title" maxlength="100" required placeholder="例如：買牛奶 / 晚班"><div class="row"><select name="kind"><option value="task">共同待辦</option><option value="shift">值班行程</option></select><input name="date" type="datetime-local"></div><button>加入清單</button></form><div class="list">${items.length?items.map(i=>`<article class="entry ${i.done?'done':''}"><div class="row"><label><input type="checkbox" data-toggle="${esc(i.id)}" ${i.done?'checked':''} ${i.source?'disabled title="Google 匯入項目請在 Google 修改"':''}> <strong>${esc(i.title)}</strong></label>${i.source?'':`<button class="icon" data-delete-item="${esc(i.id)}" aria-label="刪除項目">×</button>`}</div><small>${i.kind==='shift'?'值班':'待辦'} · ${esc(dateText(i.date))}${i.source?' · Google 匯入':''}</small></article>`).join(''):'<p class="empty">還沒有待辦或值班。</p>'}</div></section></div>
  <section class="card google" id="google"><h2>Google 工作與值班同步</h2><p>連接 Google 工作清單和日曆後，選取要分享的清單與值班日曆。選取的項目會顯示給另一半，這裡的匯入資料只能在 Google 修改。</p><div class="row"><button id="connect-google">${googleToken?'重新授權 Google':'連接 Google'}</button><button class="subtle" id="sync-google" ${googleToken?'':'disabled'}>立即同步</button></div><div id="google-selectors"></div><small id="sync-status">${googleToken?'已授權，網頁開啟時每 5 分鐘更新':'尚未授權'}</small></section>
  <footer>版本 1.0.0 · 個人資料由兩人空間成員查看</footer></main>`;
  if (googleToken) loadSelectors().catch(error);
}

async function startSpace(id) {
  stops.forEach(f=>f()); stops=[];coupleId=id;
  for (const [path,set] of [['notes',v=>notes=v],['items',v=>items=v],['members',v=>members=v]]) {
    stops.push(onSnapshot(coll(path),snapshot=>{set(snapshot.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.updatedAt?.seconds||b.createdAt?.seconds||0)-(a.updatedAt?.seconds||a.createdAt?.seconds||0)));render();},error));
  }
  render();
}

async function createSpace() {
  const id=crypto.randomUUID();
  await setDoc(doc(db,'couples',id),{createdBy:uid(),createdAt:serverTimestamp(),partnerUid:'',inviteCode:''});
  await setDoc(doc(db,'couples',id,'members',uid()),{uid:uid(),displayName:user.displayName||'我',joinedAt:serverTimestamp()});
  await setDoc(doc(db,'users',uid()),{coupleId:id});
  const code=crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase();
  await setDoc(doc(db,'invites',code),{coupleId:id,ownerUid:uid(),expiresAt:Timestamp.fromMillis(Date.now()+7*86400000)});
  await startSpace(id);
  alert(`邀請碼：${code}\n7 天內有效，傳給另一半在「加入空間」輸入。`);
}
async function joinSpace(code) {
  code=code.trim().toUpperCase();if(!code) throw new Error('請輸入邀請碼');
  const snap=await getDoc(doc(db,'invites',code));if(!snap.exists()||snap.data().expiresAt.toMillis()<Date.now())throw new Error('邀請碼不存在或已過期');
  const id=snap.data().coupleId;
  await updateDoc(doc(db,'couples',id),{partnerUid:uid(),inviteCode:code});
  await setDoc(doc(db,'couples',id,'members',uid()),{uid:uid(),displayName:user.displayName||'我',joinedAt:serverTimestamp(),inviteCode:code});
  await setDoc(doc(db,'users',uid()),{coupleId:id});await startSpace(id);
}

function googleReady() {if(!env.VITE_GOOGLE_CLIENT_ID)throw new Error('請先在 .env 設定 VITE_GOOGLE_CLIENT_ID');if(!window.google?.accounts?.oauth2)throw new Error('Google 登入元件尚未載入，請重新整理');}
function authorizeGoogle() {
  googleReady();window.google.accounts.oauth2.initTokenClient({client_id:env.VITE_GOOGLE_CLIENT_ID,scope:'https://www.googleapis.com/auth/tasks.readonly https://www.googleapis.com/auth/calendar.readonly',callback:r=>{if(r.error)return error(new Error(r.error));googleToken=r.access_token;googleExpiry=Date.now()+Number(r.expires_in||3600)*1000;render();syncGoogle().catch(error);if(googleTimer)clearInterval(googleTimer);googleTimer=setInterval(()=>{if(googleToken&&Date.now()<googleExpiry-60000)syncGoogle().catch(error);},300000);}}).requestAccessToken({prompt:'consent'});
}
async function api(url) {
  if (!googleToken||Date.now()>googleExpiry-60000)throw new Error('Google 授權已過期，請重新連接 Google');
  const response=await fetch(url,{headers:{Authorization:`Bearer ${googleToken}`}});
  if(!response.ok)throw new Error(`Google API 回應 ${response.status}：${(await response.text()).slice(0,160)}`);
  return response.json();
}
async function pages(url) {const all=[];let token='';do{const u=new URL(url);if(token)u.searchParams.set('pageToken',token);const p=await api(u.toString());all.push(...(p.items||[]));token=p.nextPageToken||'';}while(token);return all;}
async function loadSelectors() {
  const target=document.querySelector('#google-selectors');if(!target||!googleToken)return;
  const [lists,calendars]=await Promise.all([pages('https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100'),pages('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250')]);
  if(!document.querySelector('#google-selectors'))return;
  target.innerHTML=`<div class="grid"><fieldset><legend>分享 Google 工作清單</legend>${lists.map(l=>`<label><input type="checkbox" class="list-select" value="${esc(l.id)}" ${selected('lists').includes(l.id)?'checked':''}> ${esc(l.title)}</label>`).join('')||'沒有工作清單'}</fieldset><fieldset><legend>分享 Google 值班日曆</legend>${calendars.map(c=>`<label><input type="checkbox" class="calendar-select" value="${esc(c.id)}" ${selected('calendars').includes(c.id)?'checked':''}> ${esc(c.summary)}</label>`).join('')||'沒有日曆'}</fieldset></div><p class="hint">選擇後按「立即同步」。日曆匯入未來 90 天內的行程；請只勾選可分享的值班日曆。</p>`;
}
function selected(type) {try{return JSON.parse(localStorage.getItem(`couple:${uid()}:${type}`)||'[]')}catch{return []}}
function saveSelected(){for(const [type,selector] of [['lists','.list-select'],['calendars','.calendar-select']])localStorage.setItem(`couple:${uid()}:${type}`,JSON.stringify([...document.querySelectorAll(selector+':checked')].map(x=>x.value)));}
async function syncGoogle() {
  if(syncing||!coupleId||!googleToken)return;syncing=true;
  const status=document.querySelector('#sync-status');if(status)status.textContent='正在同步…';
  try {
    const incoming=new Map();
    for(const list of selected('lists')) {
      const tasks=await pages(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(list)}/tasks?maxResults=100&showCompleted=true&showHidden=true`);
      for(const t of tasks)if(t.title&&(!t.parent)){
        const source=`task:${uid()}:${list}:${t.id}`;
        incoming.set(source,{title:t.title.slice(0,100),date:t.due||'',kind:'task',done:t.status==='completed',ownerUid:uid(),source,updatedAt:serverTimestamp()});
      }
    }
    const now=new Date(),end=new Date(Date.now()+90*86400000);
    for(const calendar of selected('calendars')) {
      const url=`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar)}/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${encodeURIComponent(now.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}`;
      for(const ev of await pages(url))if(ev.status!=='cancelled'&&ev.summary?.trim()==='哲銘'&&ev.start){
        const source=`calendar:${uid()}:${calendar}:${ev.id}`;
        incoming.set(source,{title:ev.summary.slice(0,100),date:ev.start.dateTime||ev.start.date||'',kind:'shift',done:false,ownerUid:uid(),source,updatedAt:serverTimestamp()});
      }
    }
    const existing=items.filter(x=>x.source&&x.ownerUid===uid());
    for(const v of incoming.values()){
      const old=existing.find(x=>x.source===v.source);
      if(old){if(old.title!==v.title||old.date!==v.date||old.done!==v.done)await updateDoc(doc(db,'couples',coupleId,'items',old.id),v)}
      else await addDoc(coll('items'),v);
    }
    for(const old of existing)
  if(!incoming.has(old.source))
    await deleteDoc(doc(db,'couples',coupleId,'items',old.id)); const s=document.querySelector('#sync-status');if(s)s.textContent=`同步完成 · ${new Date().toLocaleTimeString('zh-TW')}`;
  } finally {syncing=false;}
}

root.addEventListener('click',async e=>{try{
  const t=e.target;
  if(t.id==='login')await signInWithPopup(auth,new GoogleAuthProvider());
  if(t.id==='logout'){stops.forEach(f=>f());stops=[];coupleId=null;googleToken='';if(googleTimer)clearInterval(googleTimer);await signOut(auth);}
  if(t.id==='create')await createSpace();
  if(t.id==='join')await joinSpace(document.querySelector('#invite-input').value);
  if(t.id==='connect-google')authorizeGoogle();
  if(t.id==='sync-google'){saveSelected();await syncGoogle();}
  if(t.dataset.deleteNote&&confirm('刪除這篇記事？'))await deleteDoc(doc(db,'couples',coupleId,'notes',t.dataset.deleteNote));
  if(t.dataset.deleteItem&&confirm('刪除這個項目？'))await deleteDoc(doc(db,'couples',coupleId,'items',t.dataset.deleteItem));
}catch(err){error(err)}});
root.addEventListener('submit',async e=>{e.preventDefault();try{
  const form=e.target, data=new FormData(form);
  if(form.id==='note-form')await addDoc(coll('notes'),{title:String(data.get('title')).trim(),body:String(data.get('body')).trim(),authorUid:uid(),createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  if(form.id==='item-form')await addDoc(coll('items'),{title:String(data.get('title')).trim(),date:data.get('date')?new Date(String(data.get('date'))).toISOString():'',kind:data.get('kind'),done:false,ownerUid:uid(),source:'',updatedAt:serverTimestamp()});
  form.reset();
}catch(err){error(err)}});
root.addEventListener('change',async e=>{if(e.target.dataset.toggle){try{await updateDoc(doc(db,'couples',coupleId,'items',e.target.dataset.toggle),{done:e.target.checked,updatedAt:serverTimestamp()})}catch(err){error(err)}}});
if(configured)onAuthStateChanged(auth,async u=>{user=u;coupleId=null;stops.forEach(f=>f());stops=[];if(u){try{const profile=await getDoc(doc(db,'users',u.uid));if(profile.exists())await startSpace(profile.data().coupleId);else render()}catch(err){error(err);render()}}else render()});else render();
