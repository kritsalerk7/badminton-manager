import {
  subscribeCandidates, subscribeQueue, joinQueue, leaveQueue, popFromQueue,
  subscribeExcluded, toggleExclude,
  subscribeStandby, createStandbyMatch, deleteStandbyMatch, swapPlayerInStandby,
  subscribeLive, startMatch, finishMatch,
  getCourtCount, setCourtCount
} from "./services/courtsService.js";
import { todayKey } from "./services/firestore.js";

let dateKey = todayKey();
let courtCount = 10;
let excludedIds = new Set();
let state = { candidates: [], queue: [], standbyByCourt: new Map(), liveByCourt: new Map() };

const els = {
  datePicker: document.getElementById("datePicker"),
  courtCount: document.getElementById("courtCount"),
  candidateList: document.getElementById("candidateList"),
  queueMeta: document.getElementById("queueMeta"),
  btnRandom4: document.getElementById("btnRandom4"),
  matchesToCreate: document.getElementById("matchesToCreate"),
  btnCreateMatches: document.getElementById("btnCreateMatches"),
  standbyMatches: document.getElementById("standbyMatches"),
  playingList: document.getElementById("playingList"),
};

init();

async function init(){
  try{ console.log('[courts/ui] init() start'); }catch(e){}
  courtCount = await getCourtCount();
  renderCourtCountSelect();
  const todayISO = new Date().toISOString().slice(0,10);
  els.datePicker.value = todayISO;
  dateKey = todayISO;
  attachCalendarHook();
  bindEvents();
  resubscribeAll();
}

function renderCourtCountSelect(){
  els.courtCount.innerHTML = "";
  for(let i=1;i<=20;i++){
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = i;
    if(i===courtCount) opt.selected = true;
    els.courtCount.appendChild(opt);
  }
}

function bindEvents(){
  els.datePicker.addEventListener("change", e=>{ dateKey = e.target.value; resubscribeAll(); });
  els.courtCount.addEventListener("change", async e=>{ courtCount = parseInt(e.target.value,10)||10; await setCourtCount(courtCount); resubscribeStandbyAndLive(); });
  els.btnRandom4.addEventListener("click", ()=> randomIntoStandby(1));
  els.btnCreateMatches.addEventListener("click", ()=>{ const n = parseInt(els.matchesToCreate.value,10)||1; randomIntoStandby(n); });
}

function attachCalendarHook(){
  if (window.attachMembersMiniCalendar){
    window.attachMembersMiniCalendar("#calendarHost", (selectedISO)=>{
      dateKey = selectedISO; els.datePicker.value = selectedISO; resubscribeAll();
    });
  }
}

let unsubs = [];
function resubscribeAll(){
  unsubs.forEach(u=>u&&u());
  unsubs = [];
  unsubs.push(subscribeCandidates(dateKey, {onChange:(items)=>{ state.candidates = items; renderCandidates(); }}));
  unsubs.push(subscribeQueue(dateKey, {onChange:(items)=>{ state.queue = items; renderCandidates(); renderQueue(); }}));
  unsubs.push(subscribeExcluded(dateKey, {onChange:(ids)=>{ excludedIds = ids; renderCandidates(); }}));
  resubscribeStandbyAndLive();
}

function resubscribeStandbyAndLive(){
  for(let c=1;c<=courtCount;c++){
    const courtId = "court"+c;
    const unsubStandby = subscribeStandby(dateKey, courtId, {onChange:(arr)=>{ state.standbyByCourt.set(courtId, arr); renderStandby(); }});
    const unsubLive = subscribeLive(dateKey, courtId, {onChange:(doc)=>{ state.liveByCourt.set(courtId, doc); renderPlaying(); }});
    unsubs.push(unsubStandby, unsubLive);
  }
}

function renderCandidates(){
  els.candidateList.innerHTML = "";
  const list = state.candidates
    .filter(m => !excludedIds.has(m.id))
    .map(m => {
      const q = state.queue.find(q=>q.id===m.id);
      const waitText = q ? "กำลังรอ..." : "-";
      const person = document.createElement("div");
      person.className = "person";
      person.draggable = true;
      person.dataset.playerId = m.id;
      person.innerHTML = `
        <div>
          <div class="fw-semibold">${m.name} <span class="badge badge-level ms-1">Lv ${m.level??0}</span></div>
          <div class="meta">เกมแล้ว: <span data-g="${m.id}">?</span> • รอคิว: <span>${waitText}</span></div>
        </div>
        <div class="actions">
          <button class="btn btn-sm btn-outline-secondary" title="เข้าคิว"><i class="bi bi-plus-square"></i></button>
          <button class="btn btn-sm btn-outline-danger" title="หยุดเล่น"><i class="bi bi-pause-circle"></i></button>
        </div>
      `;
      person.querySelectorAll(".btn")[0].addEventListener("click", ()=> joinQueue(dateKey, m));
      person.querySelectorAll(".btn")[1].addEventListener("click", ()=> toggleExclude(dateKey, m.id));
      person.addEventListener("dragstart", ev=>{
        ev.dataTransfer.setData("application/json", JSON.stringify({type:"player", player: m}));
        person.classList.add("ghost");
      });
      person.addEventListener("dragend", ()=> person.classList.remove("ghost"));
      return person;
    });
  list.forEach(el=>els.candidateList.appendChild(el));
  els.queueMeta.textContent = `ในคิว: ${state.queue.length} คน • ไม่รวมผู้กดหยุดเล่น`;
}

function renderQueue(){ /* reserved */ }

function renderStandby(){
  els.standbyMatches.innerHTML = "";
  for(const [courtId, arr] of state.standbyByCourt.entries()){
    for(const m of arr){
      els.standbyMatches.appendChild(renderMatchCard(courtId, m));
    }
  }
  if (!els.standbyMatches.children.length){
    const emp = document.createElement("div");
    emp.className = "text-muted small";
    emp.textContent = "ยังไม่มีแมตช์รอเล่น";
    els.standbyMatches.appendChild(emp);
  }
}

function renderMatchCard(courtId, m){
  const card = document.createElement("div");
  card.className = "match-card";
  card.innerHTML = `
    <div class="card-header d-flex justify-content-between align-items-center">
      <div>คอร์ท (เลือกตอนเริ่ม): <span class="badge text-bg-secondary">${courtId.replace('court','')}</span></div>
      <div class="d-flex gap-2">
        <button class="btn btn-sm btn-outline-secondary" title="สลับผู้เล่น"><i class="bi bi-arrow-left-right"></i></button>
        <button class="btn btn-sm btn-outline-danger" title="ยกเลิก"><i class="bi bi-trash3"></i></button>
      </div>
    </div>
    <div class="card-body">
      <div class="row g-2">
        <div class="col-6">
          <div class="team">
            <div class="small text-muted mb-1">ทีม A</div>
            <div class="slot" data-side="A" data-index="0"></div>
            <div class="slot mt-1" data-side="A" data-index="1"></div>
          </div>
        </div>
        <div class="col-6">
          <div class="team">
            <div class="small text-muted mb-1">ทีม B</div>
            <div class="slot" data-side="B" data-index="0"></div>
            <div class="slot mt-1" data-side="B" data-index="1"></div>
          </div>
        </div>
      </div>
      <div class="d-flex align-items-center gap-2 mt-2">
        <label class="form-label mb-0 small">คอร์ท</label>
        <select class="form-select form-select-sm courtNo" style="width:90px"></select>
        <button class="btn btn-sm btn-success ms-auto"><i class="bi bi-play-fill me-1"></i> เริ่มเกม</button>
      </div>
    </div>
  `;
  const fill = (side, i, p) => {
    const slot = card.querySelector(`.slot[data-side="${side}"][data-index="${i}"]`);
    slot.textContent = p ? p.name : "";
    slot.dataset.playerId = p ? p.id : "";
    setupDrop(slot, {courtId, match:m, side, index:i});
  };
  (m.teamA||[]).forEach((p,i)=>fill("A",i,p));
  (m.teamB||[]).forEach((p,i)=>fill("B",i,p));

  const sel = card.querySelector(".courtNo");
  for(let i=1;i<=courtCount;i++){ const opt=document.createElement("option"); opt.value=String(i); opt.textContent=i; sel.appendChild(opt); }

  const [btnSwap, btnDelete, btnStart] = card.querySelectorAll(".btn");
  btnSwap.addEventListener("click", ()=>{
    const tA = (m.teamA||[]).slice(), tB = (m.teamB||[]).slice();
    const tmp = tA[1]; tA[1]=tB[1]; tB[1]=tmp;
    updateStandbyFromCard(courtId, m, tA, tB);
  });
  btnDelete.addEventListener("click", ()=> deleteStandbyMatch(dateKey, courtId, m.id));
  btnStart.addEventListener("click", ()=>{ const courtNo = parseInt(sel.value,10)||1; startMatch(dateKey, "court"+courtNo, m); });

  return card;
}

async function updateStandbyFromCard(courtId, m, tA, tB){
  await deleteStandbyMatch(dateKey, courtId, m.id);
  await createStandbyMatch(dateKey, courtId, tA, tB);
}

function setupDrop(slot, payload){
  slot.addEventListener("dragover", ev=>{ ev.preventDefault(); slot.classList.add("drag-over"); });
  slot.addEventListener("dragleave", ()=> slot.classList.remove("drag-over"));
  slot.addEventListener("drop", async ev=>{
    ev.preventDefault(); slot.classList.remove("drag-over");
    try{
      const data = JSON.parse(ev.dataTransfer.getData("application/json"));
      if (data.type==="player"){
        await swapPlayerInStandby(dateKey, payload.courtId, payload.match.id, payload.side, parseInt(payload.index,10), data.player);
      }
    }catch(e){}
  });
}

function renderPlaying(){
  els.playingList.innerHTML = "";
  for(let c=1;c<=courtCount;c++){
    const courtId = "court"+c;
    const live = state.liveByCourt.get(courtId);
    const card = document.createElement("div");
    card.className = "playing-card p-3";
    card.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-2">
        <div class="fw-semibold"><i class="bi bi-geo-alt me-1"></i> คอร์ท ${c}</div>
        <button class="btn btn-sm btn-outline-danger" ${live?'':'disabled'}><i class="bi bi-stopwatch"></i> จบเกม</button>
      </div>
      <div class="small text-muted mb-1">สถานะ: ${live?'กำลังเล่น':'ว่าง'}</div>
      <div class="row">
        <div class="col-6"><div class="small text-muted">ทีม A</div>${(live?.teamA||[]).map(p=>`<div>${p.name||''}</div>`).join('')}</div>
        <div class="col-6"><div class="small text-muted">ทีม B</div>${(live?.teamB||[]).map(p=>`<div>${p.name||''}</div>`).join('')}</div>
      </div>
    `;
    card.querySelector("button").addEventListener("click", ()=> finishMatch(dateKey, courtId));
    els.playingList.appendChild(card);
  }
}

async function randomIntoStandby(matchesCount){
  const eligible = state.queue
    .filter(q => !excludedIds.has(q.id))
    .sort((a,b)=> (a.joinedAt?.seconds||0)-(b.joinedAt?.seconds||0));

  const perMatch = 4;
  if (eligible.length < perMatch) return;

  let idx = 0;
  for(let m=0; m<matchesCount; m++){
    const pick = [];
    while(pick.length<perMatch && idx<eligible.length){
      pick.push(eligible[idx]); idx++;
    }
    if (pick.length<perMatch) break;
    const teamA = [pick[0].player, pick[3].player];
    const teamB = [pick[1].player, pick[2].player];
    const courtNo = (m % courtCount) + 1;
    await createStandbyMatch(dateKey, "court"+courtNo, teamA, teamB);
    for(const q of pick){ await popFromQueue(dateKey, q.id); }
  }
}
