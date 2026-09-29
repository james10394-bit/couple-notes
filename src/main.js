import './style.css';
import { calendarMarkup, setupCalendar, dateKey } from './calendar.js';
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithCredential, onAuthStateChanged, signOut } from 'firebase/auth';
import { initializeFirestore, collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, Timestamp } from 'firebase/firestore';

const env = import.meta.env;
const configured = !!(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID);
const app = configured ? initializeApp({apiKey:env.VITE_FIREBASE_API_KEY,authDomain:env.VITE_FIREBASE_AUTH_DOMAIN,projectId:env.VITE_FIREBASE_PROJECT_ID,appId:env.VITE_FIREBASE_APP_ID}) : null;
const auth = app && getAuth(app), db = app && initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false
});
const root = document.querySelector('#app');
function applyAutomaticTheme(){
  const taipeiHour=new Date(Date.now()+8*60*60*1000).getUTCHours();
  document.documentElement.dataset.theme=taipeiHour>=6&&taipeiHour<18?'day':'night';
}
applyAutomaticTheme();
setInterval(applyAutomaticTheme,60000);
let user = null, coupleId = null, notes = [], items = [], members = [], stops = [], inviteCode = '', inviteExpiry = 0, googleToken = '', googleExpiry = 0, googleTimer = null, syncing = false;
let calendarMonth = new Date(), selectedDay = dateKey(new Date()), editingNoteId = '', editingItemId = '', copyingItemId = '', copyMonth = new Date(), copyDates = new Set(), showLunar = localStorage.getItem('couple:show-lunar') !== 'false';
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const error = e => { console.error(e); alert(e?.message || '操作失敗，請稍後再試。'); };
const dateText = v => v ? new Date(v).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '未設定';
const uid = () => user?.uid;
const coll = path => collection(db,'couples',coupleId,path);


function defaultItemDate(){
  const [year,month,day]=selectedDay.split('-').map(Number);
  const d=year?new Date(year,month-1,day,8,0):new Date();
  const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,16);
}

function itemKindOptions(selected='task'){
  const normalized=selected==='task'?'task_shared':selected;
  return [
    ['task_shared','共同代辦'],
    ['task_rui','芮代辦'],
    ['task_ming','銘代辦'],
    ['shift','值班'],
    ['memo','Memo']
  ].map(([value,label])=>`<option value="${value}" ${normalized===value?'selected':''}>${label}</option>`).join('');
}

function localDateTimeValue(value){
  if(!value)return '';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '';
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const get=type=>parts.find(part=>part.type===type)?.value||'';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

function copyDateWithOriginalTime(item,dateValue){
  if(!dateValue)return '';
  const original=new Date(item.date);
  if(Number.isNaN(original.getTime()))return new Date(`${dateValue}T08:00:00+08:00`).toISOString();
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(original);
  const get=type=>parts.find(part=>part.type===type)?.value||'00';
  return new Date(`${dateValue}T${get('hour')}:${get('minute')}:00+08:00`).toISOString();
}

function copyCalendarSheet(source){
  const month=new Date(copyMonth.getFullYear(),copyMonth.getMonth(),1);
  const start=new Date(month);start.setDate(1-month.getDay());
  const monthIndex=month.getMonth(),sourceDay=dateKey(source.date),today=dateKey(new Date());
  const kindClass=kind=>kind==='shift'?'shift':kind==='memo'?'memo':kind==='task_rui'?'task-rui':kind==='task_ming'?'task-ming':'task';
  const cells=Array.from({length:42},(_,index)=>{
    const day=new Date(start);day.setDate(start.getDate()+index);
    const key=`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
    const selected=copyDates.has(key),original=key===sourceDay;
    const dots=items.filter(item=>dateKey(item.date)===key).slice(0,3).map(item=>`<i class="copy-event-dot ${kindClass(item.kind)}"></i>`).join('');
    return `<button type="button" class="copy-cal-day ${day.getMonth()!==monthIndex?'outside':''} ${selected?'selected':''} ${key===today?'today':''} ${original?'original':''}" ${original?'disabled title="原始日期"':`data-copy-day="${key}"`}><span>${day.getDate()}</span><em>${original?'原始':dots}</em></button>`;
  }).join('');
  return `<div class="copy-overlay" data-close-copy><section class="copy-sheet" role="dialog" aria-modal="true" aria-label="複製到其他日期"><div class="copy-sheet-handle"></div><div class="copy-sheet-title"><div><small>複製行程</small><h2>${esc(source.title)}</h2><p>請點選日期，最多 30 個；原本內容與時間會自動保留。</p></div><button type="button" class="copy-sheet-close" data-cancel-copy aria-label="關閉">×</button></div><div class="copy-month-head"><button type="button" data-copy-month="-1" aria-label="上個月">‹</button><strong>${month.getFullYear()} 年 ${month.getMonth()+1} 月</strong><button type="button" data-copy-month="1" aria-label="下個月">›</button></div><div class="copy-weekdays">${['日','一','二','三','四','五','六'].map(day=>`<span>${day}</span>`).join('')}</div><div class="copy-calendar-grid">${cells}</div><div class="copy-sheet-footer"><span>已選擇 <b>${copyDates.size}</b> 個日期</span><button type="button" data-confirm-copy ${copyDates.size?'':'disabled'}>複製到已選日期${copyDates.size?`（${copyDates.size}）`:''}</button></div></section></div>`;
}

function appMarkup(){
  const todayStart=new Date();todayStart.setHours(0,0,0,0);
  const threeDaysEnd=new Date(todayStart);threeDaysEnd.setDate(threeDaysEnd.getDate()+3);threeDaysEnd.setHours(23,59,59,999);
  const visibleItems=items.filter(item=>{
    if(item.id===editingItemId)return true;
    if(!item.date)return false;
    const time=new Date(item.date).getTime();
    return !Number.isNaN(time)&&time>=todayStart.getTime()&&time<=threeDaysEnd.getTime();
  }).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const kindLabel=k=>k==='shift'?'值班':k==='memo'?'Memo':k==='task_rui'?'芮代辦':k==='task_ming'?'銘代辦':'共同代辦';
  const kindClass=k=>k==='shift'?'shift':k==='memo'?'memo':k==='task_rui'?'task-rui':k==='task_ming'?'task-ming':'task';
  const copyingItem=items.find(item=>item.id===copyingItemId&&!item.source);
  const copySheet=copyingItem?copyCalendarSheet(copyingItem):'';
  return `<main class="shell"><header><div><small>OUR LITTLE DAYS · ${esc(members.map(m=>m.displayName).join(' × '))}</small><h1>兩個人的小日子 ♡</h1></div><button class="subtle" id="logout">登出</button></header>
  <nav><a href="#calendar">行事曆</a><a href="#items">待辦與值班</a><a href="#notes">記事本</a><a href="#google">Google 同步</a></nav>
  <section class="intro card"><div><h2>今天也一起把生活記下來</h2><p>行程、代辦、值班與記事即時同步，點日期即可查看當日內容。</p></div><div><div class="pill">已同步 · ${esc(members.length)} 位成員</div><button class="subtle" id="invite-button">${inviteCode&&inviteExpiry>Date.now()?`邀請碼：${esc(inviteCode)}（點擊複製）`:'產生邀請碼'}</button></div></section>
  <div class="content-stack">
    ${calendarMarkup(items,notes,calendarMonth,selectedDay,showLunar)}
    <section class="card" id="items"><h2>待辦與值班</h2><p class="section-hint">加入待辦、值班或 Memo；有日期的內容會顯示在上方行事曆。</p><form id="item-form"><input name="title" maxlength="100" required placeholder="例如：買牛奶 / 晚班 / 重要提醒"><div class="row"><select name="kind">${itemKindOptions()}</select><input name="date" type="datetime-local" value="${defaultItemDate()}"></div><button>加入清單</button></form><div class="list">${visibleItems.length?visibleItems.map(i=>editingItemId===i.id?`<article class="entry editing"><form class="edit-item-form" data-item-id="${esc(i.id)}"><input name="title" maxlength="100" required value="${esc(i.title)}"><div class="row"><select name="kind">${itemKindOptions(i.kind)}</select><input name="date" type="datetime-local" value="${esc(localDateTimeValue(i.date))}"></div><div class="row item-edit-actions"><button type="button" class="subtle" data-cancel-item>取消</button><button type="submit">儲存修改</button></div></form></article>`:`<article class="entry ${i.done?'done':''}"><div class="row"><label class="item-label">${String(i.kind).startsWith('task')?`<input type="checkbox" data-toggle="${esc(i.id)}" ${i.done?'checked':''} ${i.source?'disabled title="Google 匯入項目請在 Google 修改"':''}>`:`<span class="item-kind-dot ${kindClass(i.kind)}"></span>`}<strong>${esc(i.title)}</strong></label><div class="entry-actions">${i.source?'':`${i.kind==='memo'?`<button class="icon edit-icon" data-edit-item="${esc(i.id)}" aria-label="修改 Memo" title="修改 Memo">✎</button>`:''}<button class="icon copy-icon" data-copy-item="${esc(i.id)}" aria-label="複製到其他日期" title="複製到其他日期">⧉</button><button class="icon" data-delete-item="${esc(i.id)}" aria-label="刪除項目">×</button>`}</div></div><small>${kindLabel(i.kind)} · ${esc(dateText(i.date))}${i.source?' · Google 匯入':''}</small></article>`).join(''):'<p class="empty">還沒有待辦、值班或 Memo。</p>'}</div></section>
    <section class="card" id="notes"><h2>我們的記事本</h2><form id="note-form"><input name="title" maxlength="100" required placeholder="標題，例如：週末小旅行"><textarea name="body" maxlength="10000" required placeholder="寫下想記住的事…"></textarea><button>新增記事</button></form><div class="list">${notes.length?notes.map(n=>editingNoteId===n.id?`<article class="entry editing"><form class="edit-note-form" data-note-id="${esc(n.id)}"><input name="title" maxlength="100" required value="${esc(n.title)}"><textarea name="body" maxlength="10000" required>${esc(n.body)}</textarea><div class="row note-actions"><button type="button" class="subtle" data-cancel-note>取消</button><button type="submit">儲存修改</button></div></form></article>`:`<article class="entry"><div class="row"><strong>${esc(n.title)}</strong><div class="entry-actions"><button class="icon edit-icon" data-edit-note="${esc(n.id)}" aria-label="修改記事">✎</button><button class="icon" data-delete-note="${esc(n.id)}" aria-label="刪除記事">×</button></div></div><p class="pre">${esc(n.body)}</p><small>${esc(members.find(m=>m.uid===n.authorUid)?.displayName||'成員')}</small></article>`).join(''):'<p class="empty">還沒有記事，寫下第一句吧。</p>'}</div></section>
  </div>
  <section class="card google" id="google"><h2>Google 工作與值班同步</h2><p>連接 Google 工作清單和日曆後，選取要分享的清單與值班日曆。匯入資料只能在 Google 修改。</p><div class="row"><button id="connect-google">${googleToken?'重新授權 Google':'連接 Google'}</button><button class="subtle" id="sync-google" ${googleToken?'':'disabled'}>立即同步</button></div><div id="google-selectors"></div><small id="sync-status">${googleToken?'已授權，網頁開啟時每 5 分鐘更新':'尚未授權'}</small></section>
  <footer>版本 1.0.12 · 農曆顯示開關 · 首頁資訊卡精簡 · 自動日夜模式</footer></main>${copySheet}`;
}
function render() {
  if (!configured) {root.innerHTML=`<main class="shell"><h1>兩個人的小日子 ♡</h1><div class="card"><h2>先完成設定</h2><p>建立 Firebase 專案，將 <code>.env.example</code> 複製為 <code>.env</code> 並填入設定，再啟動網站。步驟請看 README。</p></div></main>`;return;}
  if (!user) {root.innerHTML=`<main class="shell login"><div class="hero"><small>OUR LITTLE DAYS</small><h1>兩個人的小日子 ♡</h1><p>想說的話、要做的事、上班的日子，放在同一個地方。</p><button id="login">使用 Google 登入</button></div></main>`;return;}
  if (!coupleId) {root.innerHTML=`<main class="shell"><header><h1>兩個人的小日子 ♡</h1><button class="subtle" id="logout">登出</button></header><div class="grid"><section class="card"><h2>建立兩人空間</h2><p>建立後取得邀請碼，傳給另一半。</p><button id="create">建立空間</button></section><section class="card"><h2>加入另一半的空間</h2><input id="invite-input" placeholder="輸入邀請碼" maxlength="32"><button id="join">加入空間</button></section></div></main>`;return;}
  root.innerHTML=appMarkup();
  setupCalendar(root,{
    onSelectDay:day=>{selectedDay=day;render();requestAnimationFrame(()=>document.querySelector('#daily')?.scrollIntoView({behavior:'smooth',block:'start'}));},
    onChangeMonth:step=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+step,1);render();},
    onToday:()=>{const now=new Date();calendarMonth=new Date(now.getFullYear(),now.getMonth(),1);selectedDay=dateKey(now);render();},
    onToggleLunar:()=>{showLunar=!showLunar;localStorage.setItem('couple:show-lunar',String(showLunar));render();},
    onToggle:(id,done)=>updateDoc(doc(db,'couples',coupleId,'items',id),{done,updatedAt:serverTimestamp()}).catch(error),
    onDeleteItem:id=>deleteDoc(doc(db,'couples',coupleId,'items',id)).catch(error),
    onDeleteNote:id=>deleteDoc(doc(db,'couples',coupleId,'notes',id)).catch(error)
  });
  if (googleToken) loadSelectors().catch(error);
}

async function startSpace(id) {
  stops.forEach(f=>f()); stops=[];coupleId=id;
  const space=await getDoc(doc(db,'couples',id));
  inviteCode=space.data()?.inviteCode||'';
  inviteExpiry=space.data()?.inviteExpiresAt?.toMillis?.()||0;
  for (const [path,set] of [['notes',v=>notes=v],['items',v=>items=v],['members',v=>members=v]]) {
    stops.push(onSnapshot(coll(path),snapshot=>{set(snapshot.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.updatedAt?.seconds||b.createdAt?.seconds||0)-(a.updatedAt?.seconds||a.createdAt?.seconds||0)));render();},error));
  }
  render();
}

async function createInvite() {
  const code=crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase();
  const expiresAt=Timestamp.fromMillis(Date.now()+7*86400000);
  await setDoc(doc(db,'invites',code),{coupleId,ownerUid:uid(),expiresAt});
  await updateDoc(doc(db,'couples',coupleId),{inviteCode:code,inviteExpiresAt:expiresAt});
  inviteCode=code;inviteExpiry=expiresAt.toMillis();render();
  alert(`邀請碼：${code}\n7 天內有效，請傳給另一半。`);
}
async function copyInvite() {
  if(!inviteCode||inviteExpiry<=Date.now())return createInvite();
  try{await navigator.clipboard.writeText(inviteCode);alert(`邀請碼 ${inviteCode} 已複製`)}
  catch{prompt('請複製邀請碼',inviteCode)}
}
async function createSpace() {
  const id=crypto.randomUUID();
  const code=crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase();
  const expiresAt=Timestamp.fromMillis(Date.now()+7*86400000);
  await setDoc(doc(db,'couples',id),{createdBy:uid(),createdAt:serverTimestamp(),partnerUid:'',inviteCode:code,inviteExpiresAt:expiresAt});
  await setDoc(doc(db,'couples',id,'members',uid()),{uid:uid(),displayName:user.displayName||'我',joinedAt:serverTimestamp()});
  await setDoc(doc(db,'users',uid()),{coupleId:id});
  await setDoc(doc(db,'invites',code),{coupleId:id,ownerUid:uid(),expiresAt});
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
function loginGoogle() {
  googleReady();
  window.google.accounts.oauth2.initTokenClient({
    client_id: env.VITE_GOOGLE_CLIENT_ID,
    scope: 'openid email profile',
    callback: async r => {
      if (r.error) return error(new Error(r.error));
      try {
        const credential = GoogleAuthProvider.credential(null, r.access_token);
        await signInWithCredential(auth, credential);
      } catch (err) {
        error(err);
      }
    }
  }).requestAccessToken({prompt: 'select_account'});
}function authorizeGoogle() {
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
  const t=e.target.closest?.('button')||e.target;
  if(t.id==='login')loginGoogle();
  if(t.id==='logout'){stops.forEach(f=>f());stops=[];coupleId=null;googleToken='';if(googleTimer)clearInterval(googleTimer);await signOut(auth);}
  if(t.id==='create')await createSpace();
  if(t.id==='invite-button')await copyInvite();
  if(t.id==='join')await joinSpace(document.querySelector('#invite-input').value);
  if(t.id==='connect-google')authorizeGoogle();
  if(t.dataset.copyItem){
    copyingItemId=t.dataset.copyItem;copyDates=new Set();
    const source=items.find(item=>item.id===copyingItemId),sourceDate=source?.date?new Date(source.date):new Date();
    copyMonth=Number.isNaN(sourceDate.getTime())?new Date():new Date(sourceDate.getFullYear(),sourceDate.getMonth(),1);
    render();
  }
  if(t.hasAttribute('data-cancel-copy')||t.hasAttribute('data-close-copy')){copyingItemId='';copyDates=new Set();render();}
  if(t.dataset.copyMonth){copyMonth=new Date(copyMonth.getFullYear(),copyMonth.getMonth()+Number(t.dataset.copyMonth),1);render();}
  if(t.dataset.copyDay){
    const day=t.dataset.copyDay;
    if(copyDates.has(day))copyDates.delete(day);else if(copyDates.size<30)copyDates.add(day);else alert('一次最多選擇 30 個日期');
    render();
  }
  if(t.hasAttribute('data-confirm-copy')){
    const source=items.find(item=>item.id===copyingItemId&&!item.source);
    if(!source)throw new Error('找不到要複製的行程，請重新操作');
    const dates=[...copyDates].sort();
    if(!dates.length)throw new Error('請至少選擇一個日期');
    t.disabled=true;t.textContent='建立中…';
    await Promise.all(dates.map(date=>addDoc(coll('items'),{title:source.title,date:copyDateWithOriginalTime(source,date),kind:source.kind,done:false,ownerUid:uid(),source:'',updatedAt:serverTimestamp()})));
    copyingItemId='';copyDates=new Set();render();alert(`已建立 ${dates.length} 個日期副本`);
  }
  if(t.dataset.editNote){editingNoteId=t.dataset.editNote;render();requestAnimationFrame(()=>document.querySelector('.edit-note-form input')?.focus());}
  if(t.hasAttribute('data-cancel-note')){editingNoteId='';render();}
  if(t.dataset.editItem){editingItemId=t.dataset.editItem;render();requestAnimationFrame(()=>document.querySelector('.edit-item-form input')?.focus());}
  if(t.hasAttribute('data-cancel-item')){editingItemId='';render();}
  if(t.id==='sync-google'){saveSelected();await syncGoogle();}
  if(t.dataset.deleteNote&&confirm('刪除這篇記事？'))await deleteDoc(doc(db,'couples',coupleId,'notes',t.dataset.deleteNote));
  if(t.dataset.deleteItem&&confirm('刪除這個項目？'))await deleteDoc(doc(db,'couples',coupleId,'items',t.dataset.deleteItem));
}catch(err){error(err)}});
root.addEventListener('submit',async e=>{e.preventDefault();try{
  const form=e.target, data=new FormData(form);
  if(form.id==='note-form')await addDoc(coll('notes'),{title:String(data.get('title')).trim(),body:String(data.get('body')).trim(),authorUid:uid(),createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  if(form.matches('.edit-note-form')){await updateDoc(doc(db,'couples',coupleId,'notes',form.dataset.noteId),{title:String(data.get('title')).trim(),body:String(data.get('body')).trim(),updatedAt:serverTimestamp()});editingNoteId='';}
  if(form.matches('.edit-item-form')){await updateDoc(doc(db,'couples',coupleId,'items',form.dataset.itemId),{title:String(data.get('title')).trim(),date:data.get('date')?new Date(String(data.get('date'))).toISOString():'',kind:String(data.get('kind')),updatedAt:serverTimestamp()});editingItemId='';}
  if(form.id==='item-form')await addDoc(coll('items'),{title:String(data.get('title')).trim(),date:data.get('date')?new Date(String(data.get('date'))).toISOString():'',kind:data.get('kind'),done:false,ownerUid:uid(),source:'',updatedAt:serverTimestamp()});
  form.reset();
}catch(err){error(err)}});
root.addEventListener('change',async e=>{if(e.target.dataset.toggle){try{await updateDoc(doc(db,'couples',coupleId,'items',e.target.dataset.toggle),{done:e.target.checked,updatedAt:serverTimestamp()})}catch(err){error(err)}}});
if(configured)onAuthStateChanged(auth,async u=>{user=u;coupleId=null;inviteCode='';inviteExpiry=0;stops.forEach(f=>f());stops=[];if(u){try{const profile=await getDoc(doc(db,'users',u.uid));if(profile.exists())await startSpace(profile.data().coupleId);else render()}catch(err){error(err);render()}}else render()});else render();
