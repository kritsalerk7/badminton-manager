
"use strict";

/** v4 + bi-plus-circle/check-circle + cancel sync + strong highlights **/
const LS_GAMES = "bm_games";

function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
const LEVELS = {
  1: { key: "มือใหม่",  cls: "lv-1" },
  2: { key: "เบา",     cls: "lv-2" },
  3: { key: "กลาง",    cls: "lv-3" },
  4: { key: "หนัก",    cls: "lv-4" },
  5: { key: "โปร",     cls: "lv-5" }
};
function levelBadge(level=1){
  const lv = Number(level) || 1;
  const k = Math.min(5, Math.max(1, lv));
  const cfg = LEVELS[k] || LEVELS[1];
  return '<span class="lvl-badge '+ cfg.cls +'">'+ cfg.key +'</span>';
}
function formatThaiDate(iso){
  if (!iso) return "-";
  const [y,m,d] = iso.split("-").map(x=>parseInt(x,10));
  if (!y||!m||!d) return "-";
  const dt = new Date(y, m-1, d);
  return dt.toLocaleDateString("th-TH", { weekday:"short", day:"numeric", month:"long", year:"numeric" });
}

// Toast feedback (lightweight, no Bootstrap dependency)
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

function updateDayHeader(dateISO){
  const el = document.getElementById("dayDateText") || document.querySelector("[data-day-date]");
  if (el) el.textContent = formatThaiDate(dateISO);
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

// DOM refs
const pickDate = document.querySelector("#pickDate");
const leftBox  = document.querySelector("#allMembers");
const alphaBar = document.querySelector("#alphaBar");
const searchInput = document.getElementById("searchInput");
const filterLevel = document.getElementById("filterLevel");
const btnAddMember = document.getElementById("btnAddMember");

// Right list container
function getDayBox(){
  return document.querySelector("#todayList, #dayList, #dayPlayers, #pickedMembers, [data-day-list]");
}
let rightBox = getDayBox();

// Modal refs (robust)
let memberEditModalEl = null;
let memberEditModal = null;
let memberEditForm = null;
let memberEditTitle = null;
let memIdInput = null;
let memNameInput = null;
let memLevelInput = null;
let memStatusInput = null;
let memberEditSaveBtn = null;

function queryModalRefs(){
  memberEditModalEl = document.getElementById("memberEditModal") || document.getElementById("memberModal");
  memberEditModal = (memberEditModalEl && window.bootstrap && bootstrap.Modal)
    ? (memberEditModal || new bootstrap.Modal(memberEditModalEl))
    : memberEditModal;
  memberEditForm = document.getElementById("memberEditForm")
    || document.getElementById("memberForm")
    || (memberEditModalEl ? memberEditModalEl.querySelector("form") : null);
  memberEditTitle = document.getElementById("memberEditTitle")
    || (memberEditModalEl ? memberEditModalEl.querySelector(".modal-title") : null);
  memIdInput      = document.getElementById("memId")
    || document.getElementById("memberId")
    || (memberEditModalEl ? memberEditModalEl.querySelector("input[type=hidden],input[name=id]") : null);
  memNameInput    = document.getElementById("memName")
    || document.getElementById("memberName")
    || (memberEditModalEl ? memberEditModalEl.querySelector("input[type=text],input[name=name]") : null);
  memLevelInput   = document.getElementById("memLevel")
    || document.getElementById("memberLevel")
    || (memberEditModalEl ? memberEditModalEl.querySelector("select[name=level]") : null);
  memStatusInput  = document.getElementById("memStatus")
    || document.getElementById("memberStatus")
    || (memberEditModalEl ? memberEditModalEl.querySelector("select[name=status]") : null);
  memberEditSaveBtn = document.getElementById("memberEditSaveBtn")
    || document.getElementById("memberSaveBtn")
    || (memberEditModalEl ? memberEditModalEl.querySelector("[data-member-save], button[type=submit], .modal-footer .btn-primary") : null);
}

let state = {
  members: [],
  games: (window.Utils && Utils.load ? Utils.load(LS_GAMES, {}) : {}),
  page: 1,
  search: "",
  level: "",
  alpha: "",
  date: (pickDate && pickDate.value) || new Date().toISOString().slice(0,10),
  dayList: []
};

function applyFilters(list){
  let out = list || [];
  if (state.alpha) out = out.filter(m => (m.name || "").toUpperCase().startsWith(state.alpha));
  if (state.search){
    const q = state.search.trim().toLowerCase();
    if (q) out = out.filter(m => (m.name || "").toLowerCase().includes(q));
  }
  if (state.level){
    const lv = Number(state.level);
    if (lv) out = out.filter(m => Number(m.level || 0) === lv);
  }
  return out;
}

function renderAlphaPagination(container, onSelect){
  if (!container) return;
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  container.innerHTML = letters.map(ch =>
    '<button class="alpha-btn btn btn-sm btn-outline-secondary me-1 mb-1" data-alpha="'+ch+'" type="button">'+ch+'</button>'
  ).join("");
  container.querySelectorAll(".alpha-btn").forEach(btn => {
    btn.addEventListener("click", () => onSelect(btn.dataset.alpha));
  });
}

// LEFT
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
        <div class="d-flex align-items-center gap-2"><span class="fw-semibold">${escapeHtml(m.name || "(ไม่มีชื่อ)")}</span> ${levelBadge(m.level || 1)}</div>
        <div class="actions d-flex gap-1">
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
    btn.addEventListener("click", async e => {
      const row = e.currentTarget.closest(".member-row");
      if (!row) return;
      const id = row.dataset.id;
      if (onAdd) await onAdd(id);
      // visual: to added
      const i = row.querySelector(".btn-add i");
      const b = row.querySelector(".btn-add");
      if (i) i.className = "bi bi-check-circle";
      if (b){
        b.classList.remove("btn-outline-primary");
        b.classList.add("btn-success");
        b.setAttribute("disabled", "disabled");
      }
      flash(row, "add");
    });
  });
  container.querySelectorAll(".member-row .btn-edit").forEach(btn => {
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

// RIGHT
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
      <div class="d-flex align-items-center gap-2"><span class="fw-semibold">${name}</span> ${levelBadge(lv)}</div>
      <div class="d-flex gap-1">
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
          // re-render both
          const cur = applyFilters(state.members);
          renderLeft(leftBox, cur, picked);
          wireLeft(leftBox, onAddToToday(picked));
          renderDay(container, state.members, state.dayList);
          wireRight(container);
          showToast("ยกเลิกจากวันนี้แล้ว", "warning");
          // highlight left row change & right box feedback
          const leftRow = leftBox?.querySelector(`.member-row[data-id="${id}"]`);
          flash(leftRow, "cancel");
          flashBox(container, "cancel");
        }
      }catch(err){
        console.error("[day] cancel failed:", err);
        alert("ยกเลิกไม่สำเร็จ: " + (err?.message || err));
      }
    });
  });
}

// Data
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
}

function onAddToToday(pickedIds){
  return async function(id){
    if (!pickedIds.has(id)){
      pickedIds.add(id);
      state.dayList = Array.from(pickedIds).map(x => ({ id:x, arrived:false }));
      await saveDayList();
      showToast('เพิ่มเข้าวันนี้แล้ว', 'success');
      const cur = applyFilters(state.members);
      renderLeft(leftBox, cur, pickedIds);
      wireLeft(leftBox, onAddToToday(pickedIds));
      // highlight left row add and right box
      const row = leftBox?.querySelector(`.member-row[data-id="${id}"]`);
      flash(row, "add");
      flashBox(rightBox, "add");
    }
  };
}

// Modal
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

// Save
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
    console.log("[member] save ok:", mode);
    showToast("บันทึกสำเร็จ", "success");
    if (memberEditModal) memberEditModal.hide();
  }catch(err){
    console.error("Save member failed:", err);
    alert("บันทึกไม่สำเร็จ: " + (err?.message || err));
  }
}

// Bind
function bindModalHandlers(){
  queryModalRefs();
 /* if (memberEditForm && !memberEditForm.__boundSave){
    memberEditForm.addEventListener("submit", handleMemberSave);
    memberEditForm.__boundSave = true;
  }
  if (memberEditSaveBtn && !memberEditSaveBtn.__boundSave){
    memberEditSaveBtn.addEventListener("click", handleMemberSave);
    memberEditSaveBtn.__boundSave = true;
  }*/
  if (memberEditModalEl && !memberEditModalEl.__delegated){
    memberEditModalEl.addEventListener("click", (ev)=>{
      const t = ev.target.closest("[data-member-save], #memberEditSaveBtn, #memberSaveBtn, button[type=submit]");
      if (t){ handleMemberSave(ev); }
    });
    memberEditModalEl.__delegated = true;
  }
  console.log("[member] bindModalHandlers:", !!memberEditForm, !!memberEditSaveBtn, !!memberEditModalEl);
}

// Realtime
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
  });
}

// Init
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

    renderAlphaPagination(alphaBar, (ch)=>{
      state.alpha = ch;
      const cur2 = applyFilters(state.members);
      renderLeft(leftBox, cur2, picked);
      wireLeft(leftBox, onAddToToday(picked));
    });
    if (searchInput) searchInput.addEventListener("input", ()=>{
      state.search = searchInput.value;
      const cur3 = applyFilters(state.members);
      renderLeft(leftBox, cur3, picked);
      wireLeft(leftBox, onAddToToday(picked));
    });
    if (filterLevel) filterLevel.addEventListener("change", ()=>{
      state.level = filterLevel.value;
      const cur4 = applyFilters(state.members);
      renderLeft(leftBox, cur4, picked);
      wireLeft(leftBox, onAddToToday(picked));
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
