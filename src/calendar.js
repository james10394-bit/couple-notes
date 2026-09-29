import { Solar } from 'lunar-javascript';

const TAIWAN_HOLIDAYS={
  '2026-01-01':'開國紀念日','2026-02-15':'小年夜','2026-02-16':'農曆除夕','2026-02-17':'春節','2026-02-18':'春節','2026-02-19':'春節','2026-02-20':'春節補假','2026-02-27':'和平紀念日補假','2026-02-28':'和平紀念日','2026-04-03':'兒童節補假','2026-04-04':'兒童節','2026-04-05':'清明節','2026-04-06':'清明節補假','2026-05-01':'勞動節','2026-06-19':'端午節','2026-09-25':'中秋節','2026-09-28':'孔子誕辰紀念日／教師節','2026-10-09':'國慶日補假','2026-10-10':'國慶日','2026-10-25':'臺灣光復暨金門古寧頭大捷紀念日','2026-10-26':'光復節補假','2026-12-25':'行憲紀念日',
  '2027-01-01':'開國紀念日','2027-02-04':'小年夜','2027-02-05':'農曆除夕','2027-02-06':'春節','2027-02-07':'春節','2027-02-08':'春節','2027-02-09':'春節補假','2027-02-10':'春節補假','2027-02-28':'和平紀念日','2027-03-01':'和平紀念日補假','2027-04-04':'兒童節','2027-04-05':'清明節','2027-04-06':'清明節補假','2027-04-30':'勞動節補假','2027-05-01':'勞動節','2027-06-09':'端午節','2027-09-15':'中秋節','2027-09-28':'孔子誕辰紀念日／教師節','2027-10-10':'國慶日','2027-10-11':'國慶日補假','2027-10-25':'臺灣光復暨金門古寧頭大捷紀念日','2027-12-24':'行憲紀念日補假','2027-12-25':'行憲紀念日','2027-12-31':'開國紀念日補假'
};

const TRADITIONAL={'纳':'納','订':'訂','会':'會','开':'開','动':'動','仓':'倉','门':'門','迁':'遷','马':'馬','鸡':'雞','龙':'龍','馀':'餘','坟':'墳','医':'醫','猎':'獵','养':'養','盖':'蓋','网':'網','买':'買','卖':'賣','归':'歸','扫':'掃','厨':'廚','厕':'廁','祷':'禱','证':'證','疗':'療','发':'發','栽':'栽'};
const traditional=value=>String(value??'').replace(/[纳订会开动仓门迁马鸡龙馀坟医猎养盖网买卖归扫厨厕祷证疗发]/g,c=>TRADITIONAL[c]||c);
const ROMANCE_GOOD=['嫁娶','納采','訂盟','會親友'];

function almanac(date){
  const lunar=Solar.fromYmd(date.getFullYear(),date.getMonth()+1,date.getDate()).getLunar();
  const yi=lunar.getDayYi().map(traditional),ji=lunar.getDayJi().map(traditional);
  const romanceYi=ROMANCE_GOOD.filter(word=>yi.includes(word));
  const romanceJi=ROMANCE_GOOD.some(word=>ji.includes(word));
  const auspicious=!romanceJi&&(yi.includes('嫁娶')||romanceYi.length>=2)&&lunar.getDayJiShen().length>=2;
  return {lunar:`農曆${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,yi,ji,zhiXing:traditional(lunar.getZhiXing()),auspicious,romanceYi};
}

function taiwanHoliday(key){
  return TAIWAN_HOLIDAYS[key]?{date:key,title:TAIWAN_HOLIDAYS[key],national:true}:null;
}

export function dateKey(value){
  if(!value)return '';
  const raw=typeof value?.toDate==='function'?value.toDate():value?.seconds?new Date(value.seconds*1000):new Date(value);
  if(Number.isNaN(raw.getTime()))return '';
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(raw);
  const get=t=>parts.find(p=>p.type===t)?.value||'';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function coupleHolidays(year){
  const pad=value=>String(value).padStart(2,'0');
  const holidays=[
    {date:`${year}-02-14`,title:'情人節 💝'},
    {date:`${year}-03-14`,title:'白色情人節 🤍'},
    {date:`${year}-03-18`,title:'交往紀念日 💞',anniversary:true},
    {date:`${year}-05-20`,title:'520 我愛你 💗'},
    {date:`${year}-12-24`,title:'平安夜 🎄'},
    {date:`${year}-12-25`,title:'聖誕節 🎁'}
  ];
  try{
    const lunar=new Intl.DateTimeFormat('en-u-ca-chinese',{timeZone:'Asia/Taipei',month:'numeric',day:'numeric'});
    for(let cursor=new Date(Date.UTC(year,0,1,4));cursor.getUTCFullYear()===year;cursor.setUTCDate(cursor.getUTCDate()+1)){
      if(lunar.format(cursor)==='7/7'){
        holidays.push({date:`${year}-${pad(cursor.getUTCMonth()+1)}-${pad(cursor.getUTCDate())}`,title:'七夕情人節 🌹'});
        break;
      }
    }
  }catch(error){console.warn('無法計算七夕日期',error)}
  return holidays;
}

export function calendarMarkup(items,notes,viewMonth,selectedDay,showLunar=true){
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const valueDate=v=>typeof v?.toDate==='function'?v.toDate():v?.seconds?new Date(v.seconds*1000):new Date(v);
  const kindLabel=k=>k==='shift'?'值班':k==='memo'?'Memo':k==='task_rui'?'芮代辦':k==='task_ming'?'銘代辦':'共同代辦';
  const kindClass=k=>k==='shift'?'shift':k==='memo'?'memo':k==='task_rui'?'task-rui':k==='task_ming'?'task-ming':'task';
  const month=new Date(viewMonth.getFullYear(),viewMonth.getMonth(),1);
  const start=new Date(month);start.setDate(1-month.getDay());
  const y=month.getFullYear(),m=month.getMonth();
  const weekdays=['日','一','二','三','四','五','六'];
  const itemEvents=items.filter(i=>dateKey(i.date));
  const noteEvents=notes.filter(n=>dateKey(n.createdAt));
  const holidayEvents=[...coupleHolidays(y-1),...coupleHolidays(y),...coupleHolidays(y+1)];
  const cells=Array.from({length:42},(_,index)=>{
    const d=new Date(start);d.setDate(start.getDate()+index);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const dayItems=itemEvents.filter(i=>dateKey(i.date)===key);
    const dayNotes=noteEvents.filter(n=>dateKey(n.createdAt)===key);
    const dayHolidays=holidayEvents.filter(event=>event.date===key);
    const nationalHoliday=taiwanHoliday(key);
    const lunar=almanac(d);
    const chips=[
      ...(showLunar&&lunar.auspicious?[`<span class="cal-chip auspicious">大吉 · ${esc(lunar.romanceYi.slice(0,2).join('、')||'宜約會')}</span>`]:[]),
      ...(nationalHoliday?[`<span class="cal-chip national">🇹🇼 ${esc(nationalHoliday.title)}</span>`]:[]),
      ...dayHolidays.map(event=>`<span class="cal-chip holiday ${event.anniversary?'anniversary':''}">${esc(event.title)}</span>`),
      ...dayItems.map(i=>`<span class="cal-chip ${kindClass(i.kind)} ${i.done?'done':''}">${esc(i.title)}</span>`),
      ...dayNotes.map(n=>`<span class="cal-chip note">${esc(n.title)}</span>`)
    ];
    const extra=chips.length>2?`<span class="cal-more">＋${chips.length-2}</span>`:'';
    return `<button type="button" class="cal-day ${d.getMonth()!==m?'outside':''} ${key===selectedDay?'selected':''}" data-calendar-day="${key}"><span class="cal-date-head"><span class="cal-number">${d.getDate()}</span>${showLunar?`<span class="lunar-day">${esc(lunar.lunar.replace('農曆',''))}</span>`:''}</span><span class="cal-events">${chips.slice(0,2).join('')}${extra}</span></button>`;
  }).join('');
  const dayItems=itemEvents.filter(i=>dateKey(i.date)===selectedDay).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const dayNotes=noteEvents.filter(n=>dateKey(n.createdAt)===selectedDay);
  const dayHolidays=holidayEvents.filter(event=>event.date===selectedDay);
  const selectedDate=selectedDay?new Date(`${selectedDay}T12:00:00`):new Date();
  const selectedAlmanac=almanac(selectedDate);
  const selectedNational=taiwanHoliday(selectedDay);
  const selectedLabel=selectedDay?new Date(`${selectedDay}T12:00:00`).toLocaleDateString('zh-TW',{month:'long',day:'numeric',weekday:'long'}):'選擇日期';
  const agenda=[
    ...(showLunar?[`<article class="almanac-panel ${selectedAlmanac.auspicious?'is-auspicious':''}"><div class="almanac-title"><strong>${esc(selectedAlmanac.lunar)} · ${esc(selectedAlmanac.zhiXing)}日</strong>${selectedAlmanac.auspicious?'<span class="auspicious-badge">大吉</span>':''}</div><p><b>宜</b> ${esc(selectedAlmanac.yi.slice(0,8).join('、')||'無')}</p><p><b>忌</b> ${esc(selectedAlmanac.ji.slice(0,8).join('、')||'無')}</p><small>民俗擇日資訊僅供生活規劃參考</small></article>`]:[]),
    ...(selectedNational?[`<article class="agenda-row national-row"><div class="agenda-main"><label><span class="agenda-dot national"></span><strong>🇹🇼 ${esc(selectedNational.title)}</strong></label><small>台灣國定假日（政府辦公日曆）</small></div></article>`]:[]),
    ...dayHolidays.map(event=>`<article class="agenda-row holiday-row ${event.anniversary?'anniversary':''}"><div class="agenda-main"><label><span class="agenda-dot holiday"></span><strong>${esc(event.title)}</strong></label><small>${event.anniversary?'你們的重要紀念日':'情侶節日'}</small></div></article>`),
    ...dayItems.map(i=>{
      const canDelete=!i.source;
      const check=String(i.kind).startsWith('task')?`<input type="checkbox" data-calendar-toggle="${esc(i.id)}" ${i.done?'checked':''} ${i.source?'disabled':''}>`:`<span class="agenda-dot ${kindClass(i.kind)}"></span>`;
      return `<article class="agenda-row ${i.done?'done':''} ${canDelete?'swipeable':''}" ${canDelete?`data-swipe-item="${esc(i.id)}"`:''}><div class="agenda-main"><label>${check}<strong>${esc(i.title)}</strong></label><small>${kindLabel(i.kind)} · ${i.date?valueDate(i.date).toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit'}):'未設定'}${i.source?' · Google 匯入':''}</small></div>${canDelete?`<div class="agenda-actions">${i.kind==='memo'?`<button type="button" class="agenda-edit" data-edit-item="${esc(i.id)}" aria-label="修改 Memo">修改</button>`:''}<button type="button" class="agenda-copy" data-copy-item="${esc(i.id)}" aria-label="複製到其他日期">複製</button></div><span class="swipe-delete">刪除</span>`:''}</article>`;
    }),
    ...dayNotes.map(n=>`<article class="agenda-row swipeable" data-swipe-note="${esc(n.id)}"><div class="agenda-main"><span class="agenda-dot note"></span><strong>${esc(n.title)}</strong><small>記事 · ${esc(n.body||'')}</small></div><span class="swipe-delete">刪除</span></article>`)
  ].join('');
  return `<section class="card calendar-card" id="calendar"><div class="calendar-head"><button type="button" class="cal-arrow subtle" data-month-step="-1" aria-label="上個月">‹</button><div><small>兩個人的行事曆 · ${showLunar?'農曆大吉 · ':''}國定假日</small><h2>${y} 年 ${m+1} 月</h2></div><button type="button" class="cal-today subtle" data-calendar-today>今天</button><button type="button" class="cal-arrow subtle" data-month-step="1" aria-label="下個月">›</button></div><div class="calendar-legend">${showLunar?'<span class="legend-auspicious">大吉</span>':''}<span class="legend-national">台灣假日</span><span class="legend-couple">情侶節日</span><button type="button" class="lunar-toggle ${showLunar?'active':''}" data-toggle-lunar aria-pressed="${showLunar}">農曆：${showLunar?'顯示':'隱藏'}</button></div><div class="weekdays">${weekdays.map(w=>`<span>${w}</span>`).join('')}</div><div class="calendar-grid">${cells}</div><div class="agenda" id="daily"><div class="agenda-title"><h3>${esc(selectedLabel)}的行程</h3><small>手動項目可向左或向右滑動刪除</small></div><div class="agenda-list">${agenda||'<p class="empty">這一天還沒有行程或記事。</p>'}</div></div></section>`;
}

export function setupCalendar(root,handlers){
  root.querySelectorAll('[data-calendar-day]').forEach(button=>button.addEventListener('click',()=>handlers.onSelectDay(button.dataset.calendarDay)));
  root.querySelectorAll('[data-month-step]').forEach(button=>button.addEventListener('click',()=>handlers.onChangeMonth(Number(button.dataset.monthStep))));
  root.querySelector('[data-calendar-today]')?.addEventListener('click',handlers.onToday);
  root.querySelector('[data-toggle-lunar]')?.addEventListener('click',handlers.onToggleLunar);
  root.querySelectorAll('[data-calendar-toggle]').forEach(box=>box.addEventListener('change',()=>handlers.onToggle(box.dataset.calendarToggle,box.checked)));
  root.querySelectorAll('[data-swipe-item],[data-swipe-note]').forEach(row=>{
    let startX=0,currentX=0;
    row.addEventListener('touchstart',event=>{startX=event.touches[0].clientX;currentX=startX;row.classList.add('swiping')},{passive:true});
    row.addEventListener('touchmove',event=>{currentX=event.touches[0].clientX;const dx=Math.max(-110,Math.min(110,currentX-startX));row.style.transform=`translateX(${dx}px)`},{passive:true});
    row.addEventListener('touchend',()=>{
      const dx=currentX-startX;row.classList.remove('swiping');
      if(Math.abs(dx)>=70){
        const isNote=!!row.dataset.swipeNote;
        if(confirm(`刪除這個${isNote?'記事':'行程'}？`)){
          if(isNote)handlers.onDeleteNote(row.dataset.swipeNote);else handlers.onDeleteItem(row.dataset.swipeItem);
          return;
        }
      }
      row.style.transform='';
    });
  });
}
