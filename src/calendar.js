export function dateKey(value){
  if(!value)return '';
  const raw=typeof value?.toDate==='function'?value.toDate():value?.seconds?new Date(value.seconds*1000):new Date(value);
  if(Number.isNaN(raw.getTime()))return '';
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(raw);
  const get=t=>parts.find(p=>p.type===t)?.value||'';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function calendarMarkup(items,notes,viewMonth,selectedDay){
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const valueDate=v=>typeof v?.toDate==='function'?v.toDate():v?.seconds?new Date(v.seconds*1000):new Date(v);
  const kindLabel=k=>k==='shift'?'值班':k==='memo'?'Memo':'待辦';
  const kindClass=k=>k==='shift'?'shift':k==='memo'?'memo':'task';
  const month=new Date(viewMonth.getFullYear(),viewMonth.getMonth(),1);
  const start=new Date(month);start.setDate(1-month.getDay());
  const y=month.getFullYear(),m=month.getMonth();
  const weekdays=['日','一','二','三','四','五','六'];
  const itemEvents=items.filter(i=>dateKey(i.date));
  const noteEvents=notes.filter(n=>dateKey(n.createdAt));
  const cells=Array.from({length:42},(_,index)=>{
    const d=new Date(start);d.setDate(start.getDate()+index);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const dayItems=itemEvents.filter(i=>dateKey(i.date)===key);
    const dayNotes=noteEvents.filter(n=>dateKey(n.createdAt)===key);
    const chips=[
      ...dayItems.map(i=>`<span class="cal-chip ${kindClass(i.kind)} ${i.done?'done':''}">${esc(i.title)}</span>`),
      ...dayNotes.map(n=>`<span class="cal-chip note">${esc(n.title)}</span>`)
    ];
    const extra=chips.length>2?`<span class="cal-more">＋${chips.length-2}</span>`:'';
    return `<button type="button" class="cal-day ${d.getMonth()!==m?'outside':''} ${key===selectedDay?'selected':''}" data-calendar-day="${key}"><span class="cal-number">${d.getDate()}</span><span class="cal-events">${chips.slice(0,2).join('')}${extra}</span></button>`;
  }).join('');
  const dayItems=itemEvents.filter(i=>dateKey(i.date)===selectedDay).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const dayNotes=noteEvents.filter(n=>dateKey(n.createdAt)===selectedDay);
  const selectedLabel=selectedDay?new Date(`${selectedDay}T12:00:00`).toLocaleDateString('zh-TW',{month:'long',day:'numeric',weekday:'long'}):'選擇日期';
  const agenda=[
    ...dayItems.map(i=>{
      const canDelete=!i.source;
      const check=i.kind==='task'?`<input type="checkbox" data-calendar-toggle="${esc(i.id)}" ${i.done?'checked':''} ${i.source?'disabled':''}>`:`<span class="agenda-dot ${kindClass(i.kind)}"></span>`;
      return `<article class="agenda-row ${i.done?'done':''} ${canDelete?'swipeable':''}" ${canDelete?`data-swipe-item="${esc(i.id)}"`:''}><div class="agenda-main"><label>${check}<strong>${esc(i.title)}</strong></label><small>${kindLabel(i.kind)} · ${i.date?valueDate(i.date).toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit'}):'未設定'}${i.source?' · Google 匯入':''}</small></div>${canDelete?'<span class="swipe-delete">刪除</span>':''}</article>`;
    }),
    ...dayNotes.map(n=>`<article class="agenda-row swipeable" data-swipe-note="${esc(n.id)}"><div class="agenda-main"><span class="agenda-dot note"></span><strong>${esc(n.title)}</strong><small>記事 · ${esc(n.body||'')}</small></div><span class="swipe-delete">刪除</span></article>`)
  ].join('');
  return `<section class="card calendar-card" id="calendar"><div class="calendar-head"><button type="button" class="cal-arrow subtle" data-month-step="-1" aria-label="上個月">‹</button><div><small>兩個人的行事曆</small><h2>${y} 年 ${m+1} 月</h2></div><button type="button" class="cal-today subtle" data-calendar-today>今天</button><button type="button" class="cal-arrow subtle" data-month-step="1" aria-label="下個月">›</button></div><div class="weekdays">${weekdays.map(w=>`<span>${w}</span>`).join('')}</div><div class="calendar-grid">${cells}</div><div class="agenda" id="daily"><div class="agenda-title"><h3>${esc(selectedLabel)}的行程</h3><small>手動項目可向左或向右滑動刪除</small></div><div class="agenda-list">${agenda||'<p class="empty">這一天還沒有行程或記事。</p>'}</div></div></section>`;
}

export function setupCalendar(root,handlers){
  root.querySelectorAll('[data-calendar-day]').forEach(button=>button.addEventListener('click',()=>handlers.onSelectDay(button.dataset.calendarDay)));
  root.querySelectorAll('[data-month-step]').forEach(button=>button.addEventListener('click',()=>handlers.onChangeMonth(Number(button.dataset.monthStep))));
  root.querySelector('[data-calendar-today]')?.addEventListener('click',handlers.onToday);
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

