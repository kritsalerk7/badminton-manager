
(function(){
  const MiniCalendar = {
    el:null, state:{viewYear:null,viewMonth:null,selected:null},
    opts:{showCount:true,onSelectDate:null,getSessionsByDate:null},
    init(el,opts){ this.el=el; this.opts={...this.opts,...opts};
      const t=new Date(); this.state.viewYear=t.getFullYear(); this.state.viewMonth=t.getMonth(); this.state.selected=this._iso(t); this.render(); },
    render(){ const {viewYear,viewMonth,selected}=this.state;
      const head=`<div class="cal-header"><div class="month-label">${this._m(viewMonth)} ${viewYear}</div><div class="cal-nav"><button data-cal-prev>‹</button><button data-cal-today>วันนี้</button><button data-cal-next>›</button></div></div>`;
      const dows=['อา','จ','อ','พ','พฤ','ศ','ส'].map(d=>`<div class="dow">${d}</div>`).join('');
      const cells=this._grid(viewYear,viewMonth).map(d=>{const iso=this._iso(d.date); const inM=d.inMonth?'in-month':'out-month'; const isT=(iso===this._iso(new Date()))?'today':''; const isS=(iso===selected)?'selected':''; return `<div class="cell ${inM} ${isT} ${isS}" data-date="${iso}" role="button" tabindex="0"><span class="num">${d.date.getDate()}</span><span class="mark"></span></div>`;}).join('');
      this.el.innerHTML=head+`<div class="cal-grid">${dows}${cells}</div>`; this._bind(); this._marks(); },
    refresh(){ this._marks(); }, setSelected(iso){ const d=new Date(iso); if(!isNaN(d)) { this.state.viewYear=d.getFullYear(); this.state.viewMonth=d.getMonth(); this.state.selected=this._iso(d); this.render(); } },
    _bind(){ this.el.querySelector('[data-cal-prev]')?.addEventListener('click',()=>this._shift(-1));
      this.el.querySelector('[data-cal-next]')?.addEventListener('click',()=>this._shift(1));
      this.el.querySelector('[data-cal-today]')?.addEventListener('click',()=>{ const t=new Date(); this.state.viewYear=t.getFullYear(); this.state.viewMonth=t.getMonth(); this.state.selected=this._iso(t); this.render(); this._emit(this.state.selected); });
      this.el.querySelectorAll('.cell').forEach(c=>{ const iso=c.getAttribute('data-date'); c.addEventListener('click',()=>{ this.state.selected=iso; this.render(); this._emit(iso); }); c.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); c.click(); } }); }); },
    _emit(iso){ if(typeof this.opts.onSelectDate==='function') this.opts.onSelectDate(iso); },
    _marks(){ const map=(typeof this.opts.getSessionsByDate==='function'?this.opts.getSessionsByDate():{})||{}; this.el.querySelectorAll('.cell').forEach(c=>{ const iso=c.getAttribute('data-date'); const m=c.querySelector('.mark'); m.innerHTML=''; const list=map[iso]; if(Array.isArray(list)&&list.length>0){ const b=document.createElement('span'); b.className='badge'; b.textContent=list.length>99?'99+':String(list.length); m.appendChild(b); } }); },
    _shift(d){ let m=this.state.viewMonth+d,y=this.state.viewYear; if(m<0){m=11;y--;} else if(m>11){m=0;y++;} this.state.viewMonth=m; this.state.viewYear=y; this.render(); },
    _grid(y,m){ const f=new Date(y,m,1); const s=f.getDay(); const start=new Date(y,m,1-s); const cells=[]; for(let i=0;i<42;i++){ const d=new Date(start); d.setDate(start.getDate()+i); cells.push({date:d,inMonth:d.getMonth()===m}); } return cells; },
    _iso(d){ const y=d.getFullYear(),mm=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0'); return `${y}-${mm}-${dd}`; },
    _m(m){ return ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][m]||''; }
  };
  window.installMiniCalendar=function({containerId='miniCalendar',onSelectDate,showCount=true,getSessionsByDate}={}){
    const el=document.getElementById(containerId); const api=Object.create(MiniCalendar);
    api.init(el,{onSelectDate,showCount,getSessionsByDate}); return { refresh:()=>api.refresh(), setSelected:(iso)=>api.setSelected(iso) };
  };
})();
