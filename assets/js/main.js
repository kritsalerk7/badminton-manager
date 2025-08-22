const APP_KEY = 'badminton_manager_v2';
window.AppState = {
  dateKey: null,
  setDate(dateKey){ this.dateKey = dateKey; sessionStorage.setItem('bm_dateKey', dateKey); },
  getDate(){ return this.dateKey || sessionStorage.getItem('bm_dateKey') || Storage.todayKey(); }
};

const Storage = (()=>{
  const todayKey = () => new Date().toISOString().slice(0,10);

  const init = async () => {
    if (!localStorage.getItem(APP_KEY)) localStorage.setItem(APP_KEY, JSON.stringify({ members:[], sessions:{} }));
    document.getElementById('storageMode').textContent = 'Mode: LocalStorage';
  };

  const getMembers = async () => JSON.parse(localStorage.getItem(APP_KEY)).members || [];
  const saveMember = async (member) => {
    const data = JSON.parse(localStorage.getItem(APP_KEY));
    if (member.id){
      const i = data.members.findIndex(m=>m.id===member.id);
      if (i!==-1) data.members[i]=member;
    }else{
      member.id = crypto.randomUUID();
      data.members.push(member);
    }
    localStorage.setItem(APP_KEY, JSON.stringify(data));
    return member.id;
  };
  const deleteMember = async (id) => {
    const data = JSON.parse(localStorage.getItem(APP_KEY));
    data.members = data.members.filter(m=>m.id!==id);
    localStorage.setItem(APP_KEY, JSON.stringify(data));
  };

  const getSession = async (dateKey=todayKey()) => {
    const data = JSON.parse(localStorage.getItem(APP_KEY));
    return structuredClone(data.sessions[dateKey] || { checkins:{}, courts:[], preQueue:[], expenses:{ total:0 }, gamesCount:{}, gameNames:{}, waitingManual:[], lastPartner:{} });
  };
  const saveSession = async (session, dateKey=todayKey()) => {
    const data = JSON.parse(localStorage.getItem(APP_KEY));
    data.sessions[dateKey] = session;
    localStorage.setItem(APP_KEY, JSON.stringify(data));
  };

  return { init, getMembers, saveMember, deleteMember, getSession, saveSession, todayKey };
})();

const Router = (()=>{
  const showPage = (page) => {
    document.querySelectorAll('.page-section').forEach(sec=>sec.classList.add('d-none'));
    document.getElementById(`page-${page}`).classList.remove('d-none');
    document.querySelectorAll('#mainMenu .nav-link').forEach(a=>a.classList.remove('active'));
    document.querySelector(`#mainMenu .nav-link[data-page="${page}"]`).classList.add('active');
    if(page==='members') Members.render();
    if(page==='courts') Courts.render();
    if(page==='expenses') Expenses.render();
    if(page==='stats') Stats.render();
  };
  const bindMenu = () => {
    document.querySelectorAll('#mainMenu .nav-link').forEach(a=>a.addEventListener('click', e=>{ e.preventDefault(); showPage(a.dataset.page); }));
  };
  return { showPage, bindMenu };
})();

const Utils = {
  money: (n) => (n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 0 }),
  el: (sel) => document.querySelector(sel),
  create: (tag, cls) => { const e=document.createElement(tag); if(cls) e.className=cls; return e; }
};

window.addEventListener('DOMContentLoaded', async ()=>{
  await Storage.init();
  const gDate = document.getElementById('globalDate');
  const initDate = AppState.getDate();
  AppState.setDate(initDate); gDate.value = initDate;
  gDate.addEventListener('change', ()=>{
    AppState.setDate(gDate.value || Storage.todayKey());
    const current = document.querySelector('#mainMenu .nav-link.active')?.dataset.page || 'members';
    Router.showPage(current);
  });

  document.getElementById('btnExportJson').addEventListener('click', async ()=>{
    const blob = new Blob([localStorage.getItem(APP_KEY)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`badminton_export_${Date.now()}.json`; a.click(); URL.revokeObjectURL(url);
  });
  document.getElementById('importJson').addEventListener('change', async (e)=>{
    const f = e.target.files?.[0]; if(!f) return; const text = await f.text(); localStorage.setItem(APP_KEY, text); alert('นำเข้าเรียบร้อย'); Router.showPage('members');
  });

  Router.bindMenu();
  Router.showPage('members');
});
