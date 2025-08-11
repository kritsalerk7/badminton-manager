
"use strict";

/** v5 enhanced: clear-today, robust level filter, drag&drop, toasts, badges, responsive **/

/* ---------- Utilities ---------- */
function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function formatThaiDate(iso){
  if (!iso) return "-";
  const [y,m,d] = String(iso).split("-").map(x=>parseInt(x,10));
  if (!y||!m||!d) return "-";
  const dt = new Date(y, m-1, d);
  return dt.toLocaleDateString("th-TH", { weekday:"short", day:"numeric", month:"long", year:"numeric" });
}
function updateDayHeader(dateISO){
  const el = document.getElementById("dayDateText") || document.querySelector("[data-day-date]");
  if (el) el.textContent = formatThaiDate(dateISO);
}
function ensureToastRoot(){
  let el = document.getElementById("appToasts");
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
const pickDate = document.querySelector("#pickDate");
const leftBox  = document.querySelector("#allMembers");
const alphaBar = document.querySelector("#alphaBar");
const searchInput = document.getElementById("searchInput");
const filterLevel = document.getElementById("filterLevel");
const btnAddMember = document.getElementById("btnAddMember");
function getDayBox(){
  return document.querySelector("#todayList, #dayList, #dayPlayers, #pickedMembers, [data-day-list]");
}
let rightBox = getDayBox();

/* ---------- Modal (lazy refs) ---------- */
let memberEditModalEl = null, memberEditModal = null, memberEditForm = null;
let memberEditTitle = null, memIdInput = null, memNameInput = null, memLevelInput = null, memStatusInput = null, memberEditSaveBtn = null;
function queryModalRefs(){
  memberEditModalEl = document.getElementById("memberEditModal") || document.getElementById("memberModal");
  memberEditModal = (memberEditModalEl && window.bootstrap && bootstrap.Modal) ? (memberEditModal || new bootstrap.Modal(memberEditModalEl)) : memberEditModal;
  memberEditForm = document.getElementById("memberEditForm") || document.getElementById("memberForm") || (memberEditModalEl ? memberEditModalEl.querySelector("form") : null);
  memberEditTitle = document.getElementById("memberEditTitle") || (memberEditModalEl ? memberEditModalEl.querySelector(".modal-title") : null);
  memIdInput      = document.getElementById("memId") || document.getElementById("memberId") || (memberEditModalEl ? memberEditModalEl.querySelector("input[type=hidden],input[name=id]") : null);
  memNameInput    = document.getElementById("memName") || document.getElementById("memberName") || (memberEditModalEl ? memberEditModalEl.querySelector("input[type=text],input[name=name]") : null);
  memLevelInput   = document.getElementById("memLevel") || document.getElementById("memberLevel") || (memberEditModalEl ? memberEditModalEl.querySelector("select[name=level]") : null);
  memStatusInput  = document.getElementById("memStatus") || document.getElementById("memberStatus") || (memberEditModalEl ? memberEditModalEl.querySelector("select[name=status]") : null);
  memberEditSaveBtn = document.getElementById("memberEditSaveBtn") || document.getElementById("memberSaveBtn") || (memberEditModalEl ? memberEditModalEl.querySelector("[data-member-save], button[type=submit], .modal-footer .btn-primary") : null);
}

/* ---------- State ---------- */
const LS_GAMES = "bm_games";
let state = {
  members: [],
  games: (window.Utils && Utils.load ? Utils.load(LS_GAMES, {}) : {}),
  page: 1,
  search: "",
  level: "",          // legacy; not used in filter, kept for compatibility
  levelFilter: null,  // numeric 1..5 or null
  alpha: "",
  date: (pickDate && pickDate.value) || new Date().toISOString().slice(0,10),
  dayList: []
};

/* ---------- Data ---------- */
async function loadMembers(){ return await DB.getMembers(); }
async function loadDayList(dateStr){
  const day = await DB.getDay(dateStr);
  const ids = (day && Array.isArray(day.playerIds)) ? day.playerIds : [];
  return ids.map(id => ({ id, arrived:false }));
}
async function saveDayList(){
  const ids = (state.dayList || []).map(x => x.id);
  await DB.setDayPlayers(state.date, ids);
  try{ if (window.MiniCal && MiniCal.refresh) MiniCal.refresh(); }catch(e){}
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
      <li class="list-group-item d-flex justify-content-between align-items-center member-row" data-id="${m.id}">
        <div class="d-flex align-items-center gap-2">
          <span class="fw-semibold">${escapeHtml(m.name || "(ไม่มีชื่อ)")}</span>
          ${levelBadge(m.level || 1)}
        </div>
        <div class="actions d-flex gap-2">
          <button type="button" class="btn btn-sm btn-outline-secondary btn-edit" title="แก้ไข"><i class="bi bi-pencil"></i></button>
          <button type="button" class="btn btn-sm btn-outline-danger btn-del" title="ลบ"><i class="bi bi-trash"></i></button>
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
      const row = e.currentTarget.closest(".member-row");
      if (!row) return;
      const id = row.dataset.id;
      if (onAdd) await onAdd(id);
      const i = row.querySelector(".btn-add i");
      const b = row.querySelector(".btn-add");
      if (i) i.className = "bi bi-check-circle";
      if (b){
        b.classList.remove("btn-outline-primary");
        b.classList.add("btn-success");
        b.setAttribute("disabled","disabled");
      }
      flash(row, "add");
    });
  });
  container.querySelectorAll(".member-row .btn-edit").forEach(btn => {
    if (btn.__bound) return; btn.__bound = true;
    btn.addEventListener("click", e => {
      queryModalRefs();
      const row = e.currentTarget.closest(".member-row");
      if (!row) return;
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
      const row = e.currentTarget.closest(".member-row");
      if (!row) return;
      const id = row.dataset.id;
      if (!confirm("ยืนยันการลบสมาชิกนี้?")) return;
      try{
        await DB.deleteMember(id);
        const before = (state.dayList || []).length;
        state.dayList = (state.dayList || []).filter(x => x.id !== id);
        if (state.dayList.length !== before) await saveDayList();
        showToast("ลบสมาชิกแล้ว", "error");
      }catch(err){
        console.error("Delete failed:", err);
        alert("ลบไม่สำเร็จ: " + (err?.message || err));
      }
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
    return `<li class="list-group-item d-flex justify-content-between align-items-center day-row" data-id="${x.id}">
      <div class="d-flex align-items-center gap-2">
        <span class="fw-semibold">${name}</span> ${levelBadge(lv)}
      </div>
      <div class="d-flex gap-2">
        <button type="button" class="btn btn-sm btn-outline-danger btn-cancel" title="ยกเลิก">
          <i class="bi bi-x-circle"></i>
        </button>
      </div>
    </li>`;
  }).join("");
}
function wireRight(container){
  if (!container) return;
  container.querySelectorAll(".day-row .btn-cancel").forEach(btn => {
    if (btn.__bound) return; btn.__bound = true;
    btn.addEventListener("click", async e => {
      const row = e.currentTarget.closest(".day-row");
      if (!row) return;
      const id = row.dataset.id;
      try{
        const picked = new Set((state.dayList || []).map(x => x.id));
        if (picked.has(id)){
          picked.delete(id);
          state.dayList = Array.from(picked).map(x => ({ id:x, arrived:false }));
          await saveDayList();
          const cur = applyFilters(state.members);
          renderLeft(leftBox, cur, picked);
          wireLeft(leftBox, onAddToToday(picked));
          renderDay(container, state.members, state.dayList);
          wireRight(container);
          const leftRow = leftBox?.querySelector(`.member-row[data-id="${id}"]`);
          flash(leftRow, "cancel");
          flashBox(container, "cancel");
          showToast("ยกเลิกจากวันนี้แล้ว", "warning");
        }
      }catch(err){
        console.error("[day] cancel failed:", err);
        alert("ยกเลิกไม่สำเร็จ: " + (err?.message || err));
      }
    });
  });
}

/* ---------- Clear Today button ---------- */
function bindDayControls(){
  const btn = document.querySelector("#btnClearToday, .btn-clear-today, [data-clear-day]");
  if (btn && !btn.__boundClear){
    btn.addEventListener("click", async ()=>{
      if (!confirm("ล้างรายชื่อของวันนี้ทั้งหมด?")) return;
      try{
        state.dayList = [];
        await saveDayList();
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
function onDragStartMember(e){
  const li = e.currentTarget;
  li.classList.add("dragging");
  e.dataTransfer.setData("text/plain", "member:"+li.dataset.id);
  e.dataTransfer.effectAllowed = "copy";
}
function onDragStartDay(e){
  const li = e.currentTarget;
  li.classList.add("dragging");
  e.dataTransfer.setData("text/plain", "day:"+li.dataset.id);
  e.dataTransfer.effectAllowed = "move";
}
function onDragEnd(e){
  e.currentTarget.classList.remove("dragging");
}
function onRightDragOver(e){ e.preventDefault(); (rightBox||getDayBox())?.classList.add("dropping"); e.dataTransfer.dropEffect='copyMove'; }
async function onRightDrop(e){
  e.preventDefault();
  (rightBox||getDayBox())?.classList.remove("dropping");
  const data = e.dataTransfer.getData("text/plain");
  if (!data) return;
  const [kind,id] = data.split(":");
  if (kind === "member"){
    const picked = new Set((state.dayList||[]).map(x=>x.id));
    if (!picked.has(id)){
      picked.add(id);
      state.dayList = Array.from(picked).map(x => ({ id:x, arrived:false }));
      await saveDayList();
      const cur = applyFilters(state.members);
      renderLeft(leftBox, cur, picked);
      wireLeft(leftBox, onAddToToday(picked));
      rightBox = getDayBox();
      renderDay(rightBox, state.members, state.dayList);
      wireRight(rightBox);
      enableDnD();
      showToast("เพิ่มเข้าวันนี้แล้ว", "success");
    }
  } else if (kind === "day"){
    // reorder: drop before target row (if any)
    const targetLi = e.target.closest(".day-row");
    if (!targetLi) return; // dropped on empty gap; skip reorder
    const ids = (state.dayList||[]).map(x=>x.id);
    const srcId = id, tgtId = targetLi.dataset.id;
    const srcIdx = ids.indexOf(srcId), tgtIdx = ids.indexOf(tgtId);
    if (srcIdx>-1 && tgtIdx>-1 && srcIdx !== tgtIdx){
      ids.splice(tgtIdx, 0, ids.splice(srcIdx,1)[0]);
      state.dayList = ids.map(x => ({ id:x, arrived:false }));
      await saveDayList();
      rightBox = getDayBox();
      renderDay(rightBox, state.members, state.dayList);
      wireRight(rightBox);
      enableDnD();
      showToast("จัดลำดับใหม่แล้ว", "info");
    }
  }
}
function onLeftDragOver(e){ e.preventDefault(); leftBox?.classList.add("dropping"); e.dataTransfer.dropEffect='move'; }
async function onLeftDrop(e){
  e.preventDefault();
  leftBox?.classList.remove("dropping");
  const data = e.dataTransfer.getData("text/plain");
  if (!data) return;
  const [kind,id] = data.split(":");
  if (kind === "day"){
    const picked = new Set((state.dayList||[]).map(x=>x.id));
    if (picked.has(id)){
      picked.delete(id);
      state.dayList = Array.from(picked).map(x => ({ id:x, arrived:false }));
      await saveDayList();
      const cur = applyFilters(state.members);
      renderLeft(leftBox, cur, picked);
      wireLeft(leftBox, onAddToToday(picked));
      rightBox = getDayBox();
      renderDay(rightBox, state.members, state.dayList);
      wireRight(rightBox);
      enableDnD();
      showToast("ยกเลิกจากวันนี้แล้ว", "warning");
    }
  }
}
function enableDnD(){
  // left items
  if (leftBox){
    leftBox.querySelectorAll(".member-row").forEach(li => {
      li.setAttribute("draggable","true");
      if (!li.__dnd){
        li.addEventListener("dragstart", onDragStartMember);
        li.addEventListener("dragend", onDragEnd);
        li.__dnd = true;
      }
    });
    if (!leftBox.__drop){
      leftBox.addEventListener("dragover", onLeftDragOver);
      leftBox.addEventListener("drop", onLeftDrop);
      leftBox.__drop = true;
    }
  }
  // right items
  rightBox = getDayBox();
  if (rightBox){
    rightBox.querySelectorAll(".day-row").forEach(li => {
      li.setAttribute("draggable","true");
      if (!li.__dnd){
        li.addEventListener("dragstart", onDragStartDay);
        li.addEventListener("dragend", onDragEnd);
        li.__dnd = true;
      }
    });
    if (!rightBox.__drop){
      rightBox.addEventListener("dragover", onRightDragOver);
      rightBox.addEventListener("drop", onRightDrop);
      rightBox.__drop = true;
    }
  }
}

/* ---------- Actions ---------- */
function onAddToToday(pickedIds){
  return async function(id){
    if (!pickedIds.has(id)){
      pickedIds.add(id);
      state.dayList = Array.from(pickedIds).map(x => ({ id:x, arrived:false }));
      await saveDayList();
      const cur = applyFilters(state.members);
      renderLeft(leftBox, cur, pickedIds);
      wireLeft(leftBox, onAddToToday(pickedIds));
      rightBox = getDayBox();
      renderDay(rightBox, state.members, state.dayList);
      wireRight(rightBox);
      enableDnD();
      const row = leftBox?.querySelector(`.member-row[data-id="${id}"]`);
      flash(row, "add");
      flashBox(rightBox, "add");
      showToast("เพิ่มเข้าวันนี้แล้ว", "success");
    }
  };
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
btnAddMember && btnAddMember.addEventListener("click", openAdd);

async function handleMemberSave(e){
  if (e && e.preventDefault) e.preventDefault();
  console.log("[member] handleMemberSave start");
  queryModalRefs();
  const name = (memNameInput && memNameInput.value || "").trim();
  if (!name){ if (memNameInput) memNameInput.classList.add("is-invalid"); return; }
  if (memNameInput) memNameInput.classList.remove("is-invalid");
  const level = Number((memLevelInput && memLevelInput.value) || 3);
  const status = (memStatusInput && memStatusInput.value) || "active";
  const mode = (memberEditSaveBtn && memberEditSaveBtn.dataset.mode) || "add";
  try{
    if (mode === "edit"){
      const id = memIdInput && memIdInput.value;
      if (!id) return;
      await DB.updateMember(id, { name, level, status });
    } else {
      const exists = state.members.some(m => (m.name || "").trim().toLowerCase() === name.toLowerCase());
      if (exists && !confirm("มีชื่อนี้อยู่แล้ว ต้องการเพิ่มซ้ำหรือไม่?")) return;
      await DB.addMember({ name, level, status });
    }
    try{
      const list = await loadMembers();
      state.members = list || [];
    }catch(e2){ console.warn("[member] reload after save failed", e2); }
    const pickedNow = new Set((state.dayList || []).map(x => x.id));
    const curNow = applyFilters(state.members);
    renderLeft(leftBox, curNow, pickedNow);
    wireLeft(leftBox, onAddToToday(pickedNow));
    rightBox = getDayBox();
    renderDay(rightBox, state.members, state.dayList);
    wireRight(rightBox);
    enableDnD();
    console.log("[member] save ok:", mode);
    showToast("บันทึกสำเร็จ", "success");
    if (memberEditModal) memberEditModal.hide();
  }catch(err){
    console.error("Save member failed:", err);
    alert("บันทึกไม่สำเร็จ: " + (err?.message || err));
  }
}
function bindModalHandlers(){
  queryModalRefs();
  if (memberEditForm && !memberEditForm.__boundSave){
    memberEditForm.addEventListener("submit", handleMemberSave);
    memberEditForm.__boundSave = true;
  }
  if (memberEditSaveBtn && !memberEditSaveBtn.__boundSave){
    memberEditSaveBtn.addEventListener("click", handleMemberSave);
    memberEditSaveBtn.__boundSave = true;
  }
  if (memberEditModalEl && !memberEditModalEl.__delegated){
    memberEditModalEl.addEventListener("click", (ev)=>{
      const t = ev.target.closest("[data-member-save], #memberEditSaveBtn, #memberSaveBtn, button[type=submit]");
      if (t){ handleMemberSave(ev); }
    });
    memberEditModalEl.__delegated = true;
  }
  console.log("[member] bindModalHandlers:", !!memberEditForm, !!memberEditSaveBtn, !!memberEditModalEl);
}

/* ---------- Realtime ---------- */
let unsubMembers = null, unsubDay = null;
async function subscribeRealtime(){
  if (unsubMembers){ try{unsubMembers();}catch(e){} }
  unsubMembers = DB.observeMembers((list)=>{
    state.members = list || [];
    const picked = new Set((state.dayList || []).map(x => x.id));
    const cur = applyFilters(state.members);
    renderLeft(leftBox, cur, picked);
    wireLeft(leftBox, onAddToToday(picked));
    rightBox = getDayBox();
    renderDay(rightBox, state.members, state.dayList);
    wireRight(rightBox);
    bindDayControls();
    enableDnD();
  });
  if (unsubDay){ try{unsubDay();}catch(e){} }
  unsubDay = DB.observeDay(state.date, (day)=>{
    const ids = (day && day.playerIds) ? day.playerIds : [];
    state.dayList = ids.map(id => ({ id, arrived:false }));
    const picked = new Set(ids);
    const cur = applyFilters(state.members);
    renderLeft(leftBox, cur, picked);
    wireLeft(leftBox, onAddToToday(picked));
    rightBox = getDayBox();
    renderDay(rightBox, state.members, state.dayList);
    wireRight(rightBox);
    updateDayHeader(state.date);
    bindDayControls();
    enableDnD();
  });
}

/* ---------- Init ---------- */
async function initMembersPage(){
  try{
    console.log("[member] initMembersPage start");
    updateDayHeader(state.date);
    state.members = await loadMembers();
    state.dayList = await loadDayList(state.date);
    const picked = new Set((state.dayList || []).map(x => x.id));
    const cur = applyFilters(state.members);
    renderLeft(leftBox, cur, picked);
    wireLeft(leftBox, onAddToToday(picked));
    rightBox = getDayBox();
    renderDay(rightBox, state.members, state.dayList);
    wireRight(rightBox);
    bindDayControls();
    enableDnD();

    renderAlphaPagination(alphaBar, (ch)=>{
      state.alpha = ch;
      const cur2 = applyFilters(state.members);
      renderLeft(leftBox, cur2, picked);
      wireLeft(leftBox, onAddToToday(picked));
      enableDnD();
    });
    if (searchInput) searchInput.addEventListener("input", ()=>{
      state.search = searchInput.value;
      const cur3 = applyFilters(state.members);
      renderLeft(leftBox, cur3, picked);
      wireLeft(leftBox, onAddToToday(picked));
      enableDnD();
    });
    if (filterLevel) filterLevel.addEventListener("change", ()=>{
      state.levelFilter = parseLevelFilter(filterLevel.value);
      const cur4 = applyFilters(state.members);
      renderLeft(leftBox, cur4, picked);
      wireLeft(leftBox, onAddToToday(picked));
      enableDnD();
    });
    if (pickDate) pickDate.addEventListener("change", ()=>{
      state.date = pickDate.value || new Date().toISOString().slice(0,10);
      updateDayHeader(state.date);
      if (unsubDay){ try{unsubDay();}catch(e){} }
      unsubDay = DB.observeDay(state.date, (day)=>{
        const ids = (day && day.playerIds) ? day.playerIds : [];
        state.dayList = ids.map(id => ({ id, arrived:false }));
        const pk = new Set(ids);
        const cur5 = applyFilters(state.members);
        renderLeft(leftBox, cur5, pk);
        wireLeft(leftBox, onAddToToday(pk));
        rightBox = getDayBox();
        renderDay(rightBox, state.members, state.dayList);
        wireRight(rightBox);
        updateDayHeader(state.date);
        bindDayControls();
        enableDnD();
      });
    });

    await subscribeRealtime();
  }catch(err){
    console.error("initMembersPage failed:", err);
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  initMembersPage().catch(err => console.error("initMembersPage failed:", err));
});
