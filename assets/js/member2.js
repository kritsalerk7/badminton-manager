
"use strict";

/** v6: Fix date change, arrived toggle, profile modal + monthly stats, keep DnD/filters/toasts/badges **/

/* ---------- Utilities ---------- */
function qs(sel){ return document.querySelector(sel); }
function qsa(sel){ return Array.from(document.querySelectorAll(sel)); }
function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function formatThaiDate(iso){
  if (!iso) return "-";
  const [y,m,d] = String(iso).split("-").map(x=>parseInt(x,10));
  if (!y||!m||!d) return "-";
  const dt = new Date(y, m-1, d);
  return dt.toLocaleDateString("th-TH", { weekday:"short", day:"numeric", month:"long", year:"numeric" });
}
function updateDayHeader(dateISO){
  const el = qs("#dayDateText, [data-day-date]");
  if (el) el.textContent = formatThaiDate(dateISO);
}
function ensureToastRoot(){
  let el = qs("#appToasts");
  if (!el){
    el = document.createElement("div");
    el.id = "appToasts";
    document.body.appendChild(el);
  }
  return el;
}
function showToast(msg, type="info"){
  const root = ensureToastRoot();
  const item = document.createElement("div");
  item.className = "toast-msg " + type;
  item.textContent = msg;
  root.appendChild(item);
  requestAnimationFrame(()=> item.classList.add("show"));
  setTimeout(()=>{
    item.classList.remove("show");
    setTimeout(()=> item.remove(), 300);
  }, 2200);
}
function flash(el, kind){
  if (!el) return;
  const cls = kind === "cancel" ? "flash-cancel" : "flash-add";
  el.classList.add(cls);
  el.scrollIntoView({ block:"center", behavior:"smooth" });
  setTimeout(()=> el.classList.remove(cls), 1200);
}
function flashBox(el, kind){
  if (!el) return;
  const cls = (kind === "cancel") ? "flash-box-cancel" : "flash-box-add";
  el.classList.add(cls);
  setTimeout(()=> el.classList.remove(cls), 800);
}
function yearMonthOf(dateISO){
  const [y,m] = String(dateISO).split("-");
  return `${y}-${m}`;
}

/* ---------- Level badges ---------- */
const LEVELS = {
  1: { key: "มือใหม่",  cls: "lv-1" },
  2: { key: "เบา",     cls: "lv-2" },
  3: { key: "กลาง",    cls: "lv-3" },
  4: { key: "หนัก",    cls: "lv-4" },
  5: { key: "โปร",     cls: "lv-5" }
};
const LEVEL_TEXT_TO_NUM = Object.fromEntries(Object.entries(LEVELS).map(([n,c]) => [c.key, Number(n)]));
function levelBadge(level=1){
  const lv = Number(level) || 1;
  const k = Math.min(5, Math.max(1, lv));
  const cfg = LEVELS[k] || LEVELS[1];
  return '<span class="lvl-badge '+ cfg.cls +'">'+ cfg.key +'</span>';
}
function parseLevelFilter(val){
  if (val == null || val === "") return null;
  if (/^\d+$/.test(String(val))) {
    const n = Number(val); return (n>=1 && n<=5) ? n : null;
  }
  const t = String(val).trim();
  return LEVEL_TEXT_TO_NUM[t] || null;
}

/* ---------- DOM ---------- */
function getPickDate(){ return qs("#pickDate, [data-pick-date], input[type='date']#date, input[type='date']"); }
const leftBox  = qs("#allMembers");
const alphaBar = qs("#alphaBar");
const searchInput = qs("#searchInput");
const filterLevel = qs("#filterLevel");
const btnAddMember = qs("#btnAddMember");
function getDayBox(){ return qs("#todayList, #dayList, #dayPlayers, #pickedMembers, [data-day-list]"); }
let rightBox = getDayBox();

/* ---------- Modal (lazy refs) ---------- */
let memberEditModalEl = null, memberEditModal = null, memberEditForm = null;
let memberEditTitle = null, memIdInput = null, memNameInput = null, memLevelInput = null, memStatusInput = null, memberEditSaveBtn = null;
function queryModalRefs(){
  memberEditModalEl = qs("#memberEditModal") || qs("#memberModal");
  memberEditModal = (memberEditModalEl && window.bootstrap && bootstrap.Modal) ? (memberEditModal || new bootstrap.Modal(memberEditModalEl)) : memberEditModal;
  memberEditForm = qs("#memberEditForm") || qs("#memberForm") || (memberEditModalEl ? memberEditModalEl.querySelector("form") : null);
  memberEditTitle = qs("#memberEditTitle") || (memberEditModalEl ? memberEditModalEl.querySelector(".modal-title") : null);
  memIdInput      = qs("#memId") || qs("#memberId") || (memberEditModalEl ? memberEditModalEl.querySelector("input[type=hidden],input[name=id]") : null);
  memNameInput    = qs("#memName") || qs("#memberName") || (memberEditModalEl ? memberEditModalEl.querySelector("input[type=text],input[name=name]") : null);
  memLevelInput   = qs("#memLevel") || qs("#memberLevel") || (memberEditModalEl ? memberEditModalEl.querySelector("select[name=level]") : null);
  memStatusInput  = qs("#memStatus") || qs("#memberStatus") || (memberEditModalEl ? memberEditModalEl.querySelector("select[name=status]") : null);
  memberEditSaveBtn = qs("#memberEditSaveBtn") || qs("#memberSaveBtn") || (memberEditModalEl ? memberEditModalEl.querySelector("[data-member-save], button[type=submit], .modal-footer .btn-primary") : null);
}

/* ---------- State ---------- */
const LS_GAMES = "bm_games";
let state = {
  members: [],
  games: (window.Utils && Utils.load ? Utils.load(LS_GAMES, {}) : {}),
  page: 1,
  search: "",
  levelFilter: null,
  alpha: "",
  date: (getPickDate() && getPickDate().value) || new Date().toISOString().slice(0,10),
  dayList: [] // [{id, arrived}]
};

/* ---------- Data ---------- */
async function loadMembers(){ return await DB.getMembers(); }
async function loadDay(dateStr){
  const day = await DB.getDay(dateStr);
  // normalize
  if (Array.isArray(day?.players)) return day.players.map(p => ({ id: p.id, arrived: !!p.arrived }));
  const ids = Array.isArray(day?.playerIds) ? day.playerIds : [];
  const arrivedMap = day?.arrived || {};
  return ids.map(id => ({ id, arrived: !!arrivedMap[id] }));
}
async function saveDayRoster(){
  // Try to use new API if available
  if (typeof DB.setDayRoster === "function"){
    await DB.setDayRoster(state.date, state.dayList);
  }else{
    // backward compat: store ids + arrived map if DB.setDayArrived exists
    const ids = (state.dayList||[]).map(x => x.id);
    await DB.setDayPlayers(state.date, ids);
    if (typeof DB.setDayArrived === "function"){
      const arrived = {}; (state.dayList||[]).forEach(x => arrived[x.id] = !!x.arrived);
      await DB.setDayArrived(state.date, arrived);
    }
  }
  try{ window.MiniCal?.refresh?.(); }catch(e){}
  rightBox = getDayBox();
  renderDay(rightBox, state.members, state.dayList);
  wireRight(rightBox);
  bindDayControls();
  enableDnD();
}

/* ---------- Filters ---------- */
function applyFilters(list){
  let out = list || [];
  if (state.alpha) out = out.filter(m => (m.name || "").toUpperCase().startsWith(state.alpha));
  if (state.search){
    const q = state.search.trim().toLowerCase();
    if (q) out = out.filter(m => (m.name || "").toLowerCase().includes(q));
  }
  if (state.levelFilter){
    out = out.filter(m => Number(m.level || 0) === Number(state.levelFilter));
  }
  return out;
}

/* ---------- Left render/wire ---------- */
function renderLeft(container, members, pickedIds){
  if (!container) return;
  const picked = pickedIds || new Set();
  container.innerHTML = (members || []).map(m => {
    const isPicked = picked.has(m.id);
    const addIcon  = isPicked ? 'bi-check-circle' : 'bi-plus-circle';
    const addTitle = isPicked ? 'เพิ่มแล้ว' : 'เพิ่มเข้า';
    const addBtnClass = isPicked ? 'btn btn-sm btn-success btn-add' : 'btn btn-sm btn-outline-primary btn-add';
    return `
      <li class="list-group-item d-flex justify-content-between align-items-center member-row" data-id="${m.id}" draggable="true">
        <div class="d-flex align-items-center gap-2">
          <span class="fw-semibold">${escapeHtml(m.name || "(ไม่มีชื่อ)")}</span> ${levelBadge(m.level || 1)}
        </div>
        <div class="actions d-flex gap-2">
          <button type="button" class="btn btn-sm btn-outline-secondary btn-edit" title="แก้ไข"><i class="bi bi-pencil"></i></button>
          <button type="button" class="btn btn-sm btn-outline-danger btn-del" title="ลบ"><i class="bi bi-trash"></i></button>
          <button type="button" class="btn btn-sm btn-outline-dark btn-profile" title="โปรไฟล์"><i class="bi bi-person-vcard"></i></button>
          <button type="button" class="${addBtnClass}" title="${addTitle}" ${isPicked?'disabled':''}><i class="bi ${addIcon}"></i></button>
        </div>
      </li>`;
  }).join("");
}
function wireLeft(container, onAdd){
  if (!container) return;
  container.querySelectorAll(".member-row .btn-add").forEach(btn => {
    if (btn.__bound) return; btn.__bound = true;
    btn.addEventListener("click", async e => {
      const row = e.currentTarget.closest(".member-row"); if (!row) return;
      const id = row.dataset.id;
      if (onAdd) await onAdd(id);
      const i = row.querySelector(".btn-add i");
      const b = row.querySelector(".btn-add");
      if (i) i.className = "bi bi-check-circle";
      if (b){ b.classList.remove("btn-outline-primary"); b.classList.add("btn-success"); b.setAttribute("disabled","disabled"); }
      flash(row, "add");
    });
  });
  container.querySelectorAll(".member-row .btn-edit").forEach(btn => {
    if (btn.__bound) return; btn.__bound = true;
    btn.addEventListener("click", e => {
      queryModalRefs();
      const row = e.currentTarget.closest(".member-row"); if (!row) return;
      const id = row.dataset.id;
      const m = state.members.find(x => x.id === id);
      if (!m || !memberEditModal) return;
      if (memberEditTitle) memberEditTitle.textContent = "แก้ไขสมาชิก";
      if (memberEditSaveBtn) memberEditSaveBtn.dataset.mode = "edit";
      if (memIdInput) memIdInput.value = m.id;
      if (memNameInput) memNameInput.value = m.name || "";
      if (memLevelInput) memLevelInput.value = String(Number(m.level || 1));
      if (memStatusInput) memStatusInput.value = (m.status === "inactive") ? "inactive" : "active";
      if (memNameInput) memNameInput.classList.remove("is-invalid");
      bindModalHandlers();
      memberEditModal.show();
    });
  });
  container.querySelectorAll(".member-row .btn-del").forEach(btn => {
    if (btn.__bound) return; btn.__bound = true;
    btn.addEventListener("click", async e => {
      const row = e.currentTarget.closest(".member-row"); if (!row) return;
      const id = row.dataset.id;
      if (!confirm("ยืนยันการลบสมาชิกนี้?")) return;
      try{
        await DB.deleteMember(id);
        const before = (state.dayList || []).length;
        state.dayList = (state.dayList || []).filter(x => x.id !== id);
        await saveDayRoster();
        showToast("ลบสมาชิกแล้ว", "error");
      }catch(err){
        console.error("Delete failed:", err);
        alert("ลบไม่สำเร็จ: " + (err?.message || err));
      }
    });
  });
  container.querySelectorAll(".member-row .btn-profile").forEach(btn => {
    if (btn.__bound) return; btn.__bound = true;
    btn.addEventListener("click", e => {
      const row = e.currentTarget.closest(".member-row"); if (!row) return;
      const id = row.dataset.id;
      openProfileModal(id);
    });
  });
}

/* ---------- Right render/wire ---------- */
function renderDay(container, members, dayList){
  if (!container) return;
  if (!dayList || !dayList.length){
    container.innerHTML = '<li class="list-group-item"><div class="empty-state"><i class="bi bi-people"></i><div>ยังไม่มีผู้ลงชื่อ</div><small class="text-muted">เลือกจากรายการสมาชิกฝั่งซ้าย</small></div></li>';
    return;
  }
  const map = new Map(members.map(m => [m.id, m]));
  container.innerHTML = dayList.map(x => {
    const m = map.get(x.id);
    const name = m ? escapeHtml(m.name || "") : ("(" + x.id.substring(0,6) + ")");
    const lv = m ? (m.level || 1) : 1;
    const arrived = !!x.arrived;
    const arriveCls = arrived ? "btn btn-sm btn-success" : "btn btn-sm btn-outline-secondary";
    const arriveIcon = arrived ? "bi-check2-circle" : "bi-circle";
    const arriveTitle = arrived ? "มาแล้ว" : "ยังไม่มา";
    return `<li class="list-group-item d-flex justify-content-between align-items-center day-row" data-id="${x.id}" draggable="true">
      <div class="d-flex align-items-center gap-2">
        <span class="fw-semibold">${name}</span> ${levelBadge(lv)}
      </div>
      <div class="d-flex gap-2">
        <button type="button" class="btn btn-sm btn-outline-dark btn-profile" title="โปรไฟล์"><i class="bi bi-person-vcard"></i></button>
        <button type="button" class="${arriveCls} btn-arrive" title="${arriveTitle}"><i class="bi ${arriveIcon}"></i></button>
        <button type="button" class="btn btn-sm btn-outline-danger btn-cancel" title="ยกเลิก"><i class="bi bi-x-circle"></i></button>
      </div>
    </li>`;
  }).join("");
}
function wireRight(container){
  if (!container) return;
  container.querySelectorAll(".day-row .btn-cancel").forEach(btn => {
    if (btn.__bound) return; btn.__bound = true;
    btn.addEventListener("click", async e => {
      const row = e.currentTarget.closest(".day-row"); if (!row) return;
      const id = row.dataset.id;
      try{
        const picked = new Set((state.dayList || []).map(x => x.id));
        if (picked.has(id)){
          picked.delete(id);
          state.dayList = Array.from(picked).map(x => {
            const found = (state.dayList||[]).find(a=>a.id===x);
            return { id:x, arrived: !!found?.arrived };
          });
          await saveDayRoster();
          const cur = applyFilters(state.members);
          renderLeft(leftBox, cur, picked);
          wireLeft(leftBox, onAddToToday(picked));
          renderDay(container, state.members, state.dayList);
          wireRight(container);
          const leftRow = leftBox?.querySelector(`.member-row[data-id="${id}"]`);
          flash(leftRow, "cancel"); flashBox(container, "cancel");
          showToast("ยกเลิกจากวันนี้แล้ว", "warning");
        }
      }catch(err){
        alert("ยกเลิกไม่สำเร็จ: " + (err?.message || err));
      }
    });
  });
  container.querySelectorAll(".day-row .btn-arrive").forEach(btn => {
    if (btn.__bound) return; btn.__bound = true;
    btn.addEventListener("click", async e => {
      const row = e.currentTarget.closest(".day-row"); if (!row) return;
      const id = row.dataset.id;
      const idx = (state.dayList||[]).findIndex(x => x.id === id);
      if (idx < 0) return;
      state.dayList[idx].arrived = !state.dayList[idx].arrived;
      try{
        await saveDayRoster();
        const icon = row.querySelector(".btn-arrive i");
        const b = row.querySelector(".btn-arrive");
        if (icon && b){
          const arrived = state.dayList[idx].arrived;
          icon.className = "bi " + (arrived ? "bi-check2-circle" : "bi-circle");
          b.className = arrived ? "btn btn-sm btn-success btn-arrive" : "btn btn-sm btn-outline-secondary btn-arrive";
          b.title = arrived ? "มาแล้ว" : "ยังไม่มา";
        }
      }catch(err){
        alert("อัปเดตสถานะมาแล้วไม่สำเร็จ: " + (err?.message || err));
      }
    });
  });
  container.querySelectorAll(".day-row .btn-profile").forEach(btn => {
    if (btn.__bound) return; btn.__bound = true;
    btn.addEventListener("click", e => {
      const row = e.currentTarget.closest(".day-row"); if (!row) return;
      const id = row.dataset.id;
      openProfileModal(id);
    });
  });
}

/* ---------- Clear Today button ---------- */
function bindDayControls(){
  const btn = qs("#btnClearToday, .btn-clear-today, [data-clear-day]");
  if (btn && !btn.__boundClear){
    btn.addEventListener("click", async ()=>{
      if (!confirm("ล้างรายชื่อของวันนี้ทั้งหมด?")) return;
      try{
        state.dayList = [];
        await saveDayRoster();
        const picked = new Set();
        const cur = applyFilters(state.members);
        renderLeft(leftBox, cur, picked);
        wireLeft(leftBox, onAddToToday(picked));
        rightBox = getDayBox();
        renderDay(rightBox, state.members, state.dayList);
        wireRight(rightBox);
        enableDnD();
        showToast("ล้างรายชื่อวันนี้แล้ว", "warning");
      }catch(err){
        alert("ล้างรายชื่อไม่สำเร็จ: " + (err?.message || err));
      }
    });
    btn.__boundClear = true;
  }
}

/* ---------- DnD ---------- */
function onDragStartMember(e){ const li = e.currentTarget; li.classList.add("dragging"); e.dataTransfer.setData("text/plain","member:"+li.dataset.id); e.dataTransfer.effectAllowed="copy"; }
function onDragStartDay(e){ const li = e.currentTarget; li.classList.add("dragging"); e.dataTransfer.setData("text/plain","day:"+li.dataset.id); e.dataTransfer.effectAllowed="move"; }
function onDragEnd(e){ e.currentTarget.classList.remove("dragging"); }
function onRightDragOver(e){ e.preventDefault(); (rightBox||getDayBox())?.classList.add("dropping"); e.dataTransfer.dropEffect='copyMove'; }
async function onRightDrop(e){
  e.preventDefault(); (rightBox||getDayBox())?.classList.remove("dropping");
  const data = e.dataTransfer.getData("text/plain"); if (!data) return;
  const [kind,id] = data.split(":");
  if (kind === "member"){
    const picked = new Set((state.dayList||[]).map(x=>x.id));
    if (!picked.has(id)){
      picked.add(id);
      state.dayList = Array.from(picked).map(x => ({ id:x, arrived: !!(state.dayList.find(a=>a.id===x)?.arrived) }));
      await saveDayRoster();
      const cur = applyFilters(state.members);
      renderLeft(leftBox, cur, picked); wireLeft(leftBox, onAddToToday(picked));
      rightBox = getDayBox(); renderDay(rightBox, state.members, state.dayList); wireRight(rightBox); enableDnD();
      showToast("เพิ่มเข้าวันนี้แล้ว", "success");
    }
  } else if (kind === "day"){
    const targetLi = e.target.closest(".day-row"); if (!targetLi) return;
    const ids = (state.dayList||[]).map(x=>x.id);
    const srcId = id, tgtId = targetLi.dataset.id;
    const srcIdx = ids.indexOf(srcId), tgtIdx = ids.indexOf(tgtId);
    if (srcIdx>-1 && tgtIdx>-1 && srcIdx !== tgtIdx){
      ids.splice(tgtIdx, 0, ids.splice(srcIdx,1)[0]);
      state.dayList = ids.map(x => ({ id:x, arrived: !!(state.dayList.find(a=>a.id===x)?.arrived) }));
      await saveDayRoster();
      rightBox = getDayBox(); renderDay(rightBox, state.members, state.dayList); wireRight(rightBox); enableDnD();
      showToast("จัดลำดับใหม่แล้ว", "info");
    }
  }
}
function onLeftDragOver(e){ e.preventDefault(); leftBox?.classList.add("dropping"); e.dataTransfer.dropEffect='move'; }
async function onLeftDrop(e){
  e.preventDefault(); leftBox?.classList.remove("dropping");
  const data = e.dataTransfer.getData("text/plain"); if (!data) return;
  const [kind,id] = data.split(":");
  if (kind === "day"){
    const picked = new Set((state.dayList||[]).map(x=>x.id));
    if (picked.has(id)){
      picked.delete(id);
      state.dayList = Array.from(picked).map(x => ({ id:x, arrived: !!(state.dayList.find(a=>a.id===x)?.arrived) }));
      await saveDayRoster();
      const cur = applyFilters(state.members);
      renderLeft(leftBox, cur, picked); wireLeft(leftBox, onAddToToday(picked));
      rightBox = getDayBox(); renderDay(rightBox, state.members, state.dayList); wireRight(rightBox); enableDnD();
      showToast("ยกเลิกจากวันนี้แล้ว", "warning");
    }
  }
}
function enableDnD(){
  // left
  if (leftBox){
    leftBox.querySelectorAll(".member-row").forEach(li => {
      li.setAttribute("draggable","true");
      if (!li.__dnd){ li.addEventListener("dragstart", onDragStartMember); li.addEventListener("dragend", onDragEnd); li.__dnd = true; }
    });
    if (!leftBox.__drop){ leftBox.addEventListener("dragover", onLeftDragOver); leftBox.addEventListener("drop", onLeftDrop); leftBox.__drop = true; }
  }
  // right
  rightBox = getDayBox();
  if (rightBox){
    rightBox.querySelectorAll(".day-row").forEach(li => {
      li.setAttribute("draggable","true");
      if (!li.__dnd){ li.addEventListener("dragstart", onDragStartDay); li.addEventListener("dragend", onDragEnd); li.__dnd = true; }
    });
    if (!rightBox.__drop){ rightBox.addEventListener("dragover", onRightDragOver); rightBox.addEventListener("drop", onRightDrop); rightBox.__drop = true; }
  }
}

/* ---------- Actions ---------- */
function onAddToToday(pickedIds){
  return async function(id){
    if (!pickedIds.has(id)){
      pickedIds.add(id);
      state.dayList = Array.from(pickedIds).map(x => ({ id:x, arrived: !!(state.dayList.find(a=>a.id===x)?.arrived) }));
      await saveDayRoster();
      const cur = applyFilters(state.members);
      renderLeft(leftBox, cur, pickedIds); wireLeft(leftBox, onAddToToday(pickedIds));
      rightBox = getDayBox(); renderDay(rightBox, state.members, state.dayList); wireRight(rightBox); enableDnD();
      const row = leftBox?.querySelector(`.member-row[data-id="${id}"]`);
      flash(row, "add"); flashBox(rightBox, "add"); showToast("เพิ่มเข้าวันนี้แล้ว", "success");
    }
  };
}

/* ---------- Profile modal & stats ---------- */
let profileModal, profileModalEl;
function ensureProfileModal(){
  profileModalEl = qs("#profileModal");
  if (!profileModalEl){
    const div = document.createElement("div");
    div.id = "profileModal";
    div.className = "modal fade";
    div.tabIndex = -1;
    div.innerHTML = `
<div class="modal-dialog modal-dialog-centered">
  <div class="modal-content">
    <div class="modal-header">
      <h5 class="modal-title"><i class="bi bi-person-vcard me-2"></i><span id="pfName"></span></h5>
      <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
    </div>
    <div class="modal-body">
      <div class="mb-3" id="pfToday"></div>
      <div class="mb-2"><strong>สรุปเดือน <span id="pfMonth"></span></strong></div>
      <div id="pfMonthly" class="row g-2">
        <div class="col-6">
          <div class="stat-card">
            <div class="label">ลงชื่อ</div>
            <div class="value" id="pfSigned">0</div>
          </div>
        </div>
        <div class="col-6">
          <div class="stat-card">
            <div class="label">มาเล่น</div>
            <div class="value" id="pfArrived">0</div>
          </div>
        </div>
      </div>
      <div class="mt-3" id="pfBreakdown"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-bs-dismiss="modal">ปิด</button>
    </div>
  </div>
</div>`;
    document.body.appendChild(div);
    profileModalEl = div;
  }
  profileModal = (window.bootstrap && bootstrap.Modal) ? (profileModal || new bootstrap.Modal(profileModalEl)) : null;
}
async function openProfileModal(memberId){
  ensureProfileModal();
  const m = state.members.find(x => x.id === memberId);
  const name = m?.name || "(ไม่ทราบชื่อ)";
  profileModalEl.querySelector("#pfName").textContent = name;
  // Today status
  const today = (state.dayList||[]).find(x => x.id === memberId);
  profileModalEl.querySelector("#pfToday").innerHTML = today
    ? `<span class="badge text-bg-${today.arrived?'success':'secondary'}">${today.arrived?'มาแล้ว':'ยังไม่มา'}</span> วันนี้`
    : `<span class="badge text-bg-light text-dark">ไม่ได้ลงชื่อวันนี้</span>`;
  // Month stats
  const ym = yearMonthOf(state.date);
  const days = await (DB.getMonthDays ? DB.getMonthDays(ym) : Promise.resolve([]));
  let signed = 0, arrived = 0;
  const rows = [];
  days.forEach(d => {
    const dateISO = d.date || d.id;
    const players = Array.isArray(d.players)
      ? d.players
      : (Array.isArray(d.playerIds) ? d.playerIds.map(id => ({id, arrived: !!(d.arrived?.[id])})) : []);
    const found = players.find(p => p.id === memberId);
    if (found){
      signed++;
      if (found.arrived) arrived++;
      rows.push(`<div class="small text-muted">${dateISO}: ${found.arrived?'<span class="badge text-bg-success">มา</span>':'<span class="badge text-bg-secondary">ไม่มา</span>'}</div>`);
    }
  });
  profileModalEl.querySelector("#pfMonth").textContent = ym;
  profileModalEl.querySelector("#pfSigned").textContent = signed;
  profileModalEl.querySelector("#pfArrived").textContent = arrived;
  profileModalEl.querySelector("#pfBreakdown").innerHTML = rows.length ? rows.join("") : '<div class="text-muted small">ยังไม่มีข้อมูลเดือนนี้</div>';
  if (profileModal) profileModal.show();
}

/* ---------- Modal open/save ---------- */
function openAdd(){
  queryModalRefs();
  if (!memberEditModal) return;
  if (memberEditTitle) memberEditTitle.textContent = "เพิ่มสมาชิก";
  if (memberEditSaveBtn) memberEditSaveBtn.dataset.mode = "add";
  if (memIdInput) memIdInput.value = "";
  if (memNameInput) memNameInput.value = "";
  if (memLevelInput) memLevelInput.value = "3";
  if (memStatusInput) memStatusInput.value = "active";
  if (memNameInput) memNameInput.classList.remove("is-invalid");
  bindModalHandlers();
  memberEditModal.show();
}
qs("#btnAddMember")?.addEventListener("click", openAdd);

async function handleMemberSave(e){
  if (e && e.preventDefault) e.preventDefault();
  queryModalRefs();
  const name = (memNameInput && memNameInput.value || "").trim();
  if (!name){ if (memNameInput) memNameInput.classList.add("is-invalid"); return; }
  if (memNameInput) memNameInput.classList.remove("is-invalid");
  const level = Number((memLevelInput && memLevelInput.value) || 3);
  const status = (memStatusInput && memStatusInput.value) || "active";
  const mode = (memberEditSaveBtn && memberEditSaveBtn.dataset.mode) || "add";
  try{
    if (mode === "edit"){
      const id = memIdInput && memIdInput.value; if (!id) return;
      await DB.updateMember(id, { name, level, status });
    } else {
      const exists = state.members.some(m => (m.name || "").trim().toLowerCase() === name.toLowerCase());
      if (exists && !confirm("มีชื่อนี้อยู่แล้ว ต้องการเพิ่มซ้ำหรือไม่?")) return;
      await DB.addMember({ name, level, status });
    }
    try{ state.members = await loadMembers(); }catch(e2){}
    const pickedNow = new Set((state.dayList || []).map(x => x.id));
    const curNow = applyFilters(state.members);
    renderLeft(leftBox, curNow, pickedNow); wireLeft(leftBox, onAddToToday(pickedNow));
    rightBox = getDayBox(); renderDay(rightBox, state.members, state.dayList); wireRight(rightBox);
    enableDnD();
    showToast("บันทึกสำเร็จ", "success");
    memberEditModal?.hide();
  }catch(err){
    alert("บันทึกไม่สำเร็จ: " + (err?.message || err));
  }
}
function bindModalHandlers(){
  queryModalRefs();
  if (memberEditForm && !memberEditForm.__boundSave){ memberEditForm.addEventListener("submit", handleMemberSave); memberEditForm.__boundSave = true; }
  if (memberEditSaveBtn && !memberEditSaveBtn.__boundSave){ memberEditSaveBtn.addEventListener("click", handleMemberSave); memberEditSaveBtn.__boundSave = true; }
  if (memberEditModalEl && !memberEditModalEl.__delegated){
    memberEditModalEl.addEventListener("click", (ev)=>{
      const t = ev.target.closest("[data-member-save], #memberEditSaveBtn, #memberSaveBtn, button[type=submit]");
      if (t){ handleMemberSave(ev); }
    });
    memberEditModalEl.__delegated = true;
  }
}

/* ---------- Realtime ---------- */
let unsubMembers = null, unsubDay = null;
async function subscribeRealtime(){
  if (unsubMembers){ try{unsubMembers();}catch(e){} }
  unsubMembers = DB.observeMembers((list)=>{
    state.members = list || [];
    const picked = new Set((state.dayList || []).map(x => x.id));
    const cur = applyFilters(state.members);
    renderLeft(leftBox, cur, picked); wireLeft(leftBox, onAddToToday(picked));
    rightBox = getDayBox(); renderDay(rightBox, state.members, state.dayList); wireRight(rightBox);
    bindDayControls(); enableDnD();
  });
  if (unsubDay){ try{unsubDay();}catch(e){} }
  unsubDay = DB.observeDay(state.date, (day)=>{
    // normalize
    if (Array.isArray(day?.players)) state.dayList = day.players.map(p => ({ id:p.id, arrived:!!p.arrived }));
    else {
      const ids = Array.isArray(day?.playerIds) ? day.playerIds : [];
      const arrivedMap = day?.arrived || {};
      state.dayList = ids.map(id => ({ id, arrived: !!arrivedMap[id] }));
    }
    const picked = new Set((state.dayList || []).map(x => x.id));
    const cur = applyFilters(state.members);
    renderLeft(leftBox, cur, picked); wireLeft(leftBox, onAddToToday(picked));
    rightBox = getDayBox(); renderDay(rightBox, state.members, state.dayList); wireRight(rightBox);
    updateDayHeader(state.date); bindDayControls(); enableDnD();
  });
}

/* ---------- Date change (robust) ---------- */
function bindDatePicker(){
  const d = getPickDate(); if (!d) return;
  if (d.__bound) return; d.__bound = true;
  d.addEventListener("change", ()=>{
    state.date = d.value || new Date().toISOString().slice(0,10);
    updateDayHeader(state.date);
    if (unsubDay){ try{unsubDay();}catch(e){} }
    unsubDay = DB.observeDay(state.date, (day)=>{
      if (Array.isArray(day?.players)) state.dayList = day.players.map(p => ({ id:p.id, arrived:!!p.arrived }));
      else {
        const ids = Array.isArray(day?.playerIds) ? day.playerIds : [];
        const arrivedMap = day?.arrived || {};
        state.dayList = ids.map(id => ({ id, arrived: !!arrivedMap[id] }));
      }
      const picked = new Set((state.dayList || []).map(x => x.id));
      const cur = applyFilters(state.members);
      renderLeft(leftBox, cur, picked); wireLeft(leftBox, onAddToToday(picked));
      rightBox = getDayBox(); renderDay(rightBox, state.members, state.dayList); wireRight(rightBox);
      updateDayHeader(state.date); bindDayControls(); enableDnD();
    });
  });
}

/* ---------- Init ---------- */
async function initMembersPage(){
  try{
    console.log("[member] initMembersPage start");
    bindDatePicker();
    updateDayHeader(state.date);
    state.members = await loadMembers();
    state.dayList = await loadDay(state.date);
    const picked = new Set((state.dayList || []).map(x => x.id));
    const cur = applyFilters(state.members);
    renderLeft(leftBox, cur, picked); wireLeft(leftBox, onAddToToday(picked));
    rightBox = getDayBox(); renderDay(rightBox, state.members, state.dayList); wireRight(rightBox);
    bindDayControls(); enableDnD();

    // Filters / search / alpha
    if (alphaBar){
      const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
      alphaBar.innerHTML = letters.map(ch => `<button class="alpha-btn btn btn-sm btn-outline-secondary me-1 mb-1" data-alpha="${ch}" type="button">${ch}</button>`).join("");
      alphaBar.querySelectorAll(".alpha-btn").forEach(btn=> btn.addEventListener("click", ()=>{
        state.alpha = btn.dataset.alpha; const cur2 = applyFilters(state.members);
        renderLeft(leftBox, cur2, picked); wireLeft(leftBox, onAddToToday(picked)); enableDnD();
      }));
    }
    searchInput && searchInput.addEventListener("input", ()=>{
      state.search = searchInput.value; const cur3 = applyFilters(state.members);
      renderLeft(leftBox, cur3, picked); wireLeft(leftBox, onAddToToday(picked)); enableDnD();
    });
    filterLevel && filterLevel.addEventListener("change", ()=>{
      state.levelFilter = parseLevelFilter(filterLevel.value); const cur4 = applyFilters(state.members);
      renderLeft(leftBox, cur4, picked); wireLeft(leftBox, onAddToToday(picked)); enableDnD();
    });

    await subscribeRealtime();
  }catch(err){
    console.error("initMembersPage failed:", err);
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  initMembersPage().catch(err => console.error("initMembersPage failed:", err));
});
