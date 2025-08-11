
"use strict";

const LS_GAMES = "bm_games";

function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function levelIcon(level=1){
  const lv = Number(level) || 1;
  return '<span class="level">' + "★".repeat(lv) + '</span>';
}

// DOM refs (static parts)
const pickDate = document.querySelector("#pickDate");
const leftBox  = document.querySelector("#allMembers");
const alphaBar = document.querySelector("#alphaBar");
const searchInput = document.getElementById("searchInput");
const filterLevel = document.getElementById("filterLevel");
const btnAddMember = document.getElementById("btnAddMember");

// Modal refs (re-queried in bindModalHandlers for robustness)
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
  memberEditModal = (memberEditModalEl && window.bootstrap && bootstrap.Modal) ? (memberEditModal || new bootstrap.Modal(memberEditModalEl)) : memberEditModal;
  memberEditForm = document.getElementById("memberEditForm") || document.getElementById("memberForm") || (memberEditModalEl ? memberEditModalEl.querySelector("form") : null);
  memberEditTitle = document.getElementById("memberEditTitle") || (memberEditModalEl ? memberEditModalEl.querySelector(".modal-title") : null);
  memIdInput      = document.getElementById("memId") || document.getElementById("memberId") || (memberEditModalEl ? memberEditModalEl.querySelector("input[type=hidden],input[name=id]") : null);
  memNameInput    = document.getElementById("memName") || document.getElementById("memberName") || (memberEditModalEl ? memberEditModalEl.querySelector("input[type=text],input[name=name]") : null);
  memLevelInput   = document.getElementById("memLevel") || document.getElementById("memberLevel") || (memberEditModalEl ? memberEditModalEl.querySelector("select[name=level]") : null);
  memStatusInput  = document.getElementById("memStatus") || document.getElementById("memberStatus") || (memberEditModalEl ? memberEditModalEl.querySelector("select[name=status]") : null);
  memberEditSaveBtn = document.getElementById("memberEditSaveBtn") || document.getElementById("memberSaveBtn") || (memberEditModalEl ? memberEditModalEl.querySelector("[data-member-save], button[type=submit], .modal-footer .btn-primary") : null);
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

function renderLeft(container, members, pickedIds){
  if (!container) return;
  const picked = pickedIds || new Set();
  container.innerHTML = (members || []).map(m => {
    const isPicked = picked.has(m.id);
    return `
      <li class="list-group-item d-flex justify-content-between align-items-center member-row" data-id="${m.id}">
        <div>
          <div class="fw-semibold">${escapeHtml(m.name || "(ไม่มีชื่อ)")}</div>
          <small class="text-muted">${levelIcon(m.level || 1)}</small>
        </div>
        <div class="actions d-flex gap-1">
          <button type="button" class="btn btn-sm btn-outline-primary btn-add" ${isPicked?'disabled':''}>${isPicked?'เพิ่มแล้ว':'เพิ่มเข้า'}</button>
          <button type="button" class="btn btn-sm btn-outline-secondary btn-edit"><i class="bi bi-pencil"></i></button>
          <button type="button" class="btn btn-sm btn-outline-danger btn-del"><i class="bi bi-trash"></i></button>
        </div>
      </li>`;
  }).join("");
}

function wireLeft(container, onAdd){
  if (!container) return;
  container.querySelectorAll(".member-row .btn-add").forEach(btn => {
    btn.addEventListener("click", e => {
      const row = e.currentTarget.closest(".member-row");
      if (!row) return;
      const id = row.dataset.id;
      if (onAdd) onAdd(id);
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
      bindModalHandlers(); // ensure handlers are bound
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
      }catch(err){
        console.error("Delete failed:", err);
        alert("ลบไม่สำเร็จ: " + (err?.message || err));
      }
    });
  });
}

// Data access
async function loadMembers(){ return await DB.getMembers(); }
async function loadDayList(dateStr){
  const day = await DB.getDay(dateStr);
  const ids = day.playerIds || [];
  return ids.map(id => ({ id, arrived:false }));
}
async function saveDayList(){
  const ids = (state.dayList || []).map(x => x.id);
  await DB.setDayPlayers(state.date, ids);
  try{ if (window.MiniCal && MiniCal.refresh) MiniCal.refresh(); }catch(e){}
}

function onAddToToday(pickedIds){
  return async function(id){
    if (!pickedIds.has(id)){
      pickedIds.add(id);
      state.dayList = Array.from(pickedIds).map(x => ({ id:x, arrived:false }));
      await saveDayList();
      const cur = applyFilters(state.members);
      renderLeft(leftBox, cur, pickedIds);
      wireLeft(leftBox, onAddToToday(pickedIds));
    }
  };
}

// Open Add modal
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
  bindModalHandlers(); // ensure handlers are bound
  memberEditModal.show();
}
btnAddMember && btnAddMember.addEventListener("click", openAdd);

// Unified save handler
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
    console.log("[member] save ok:", mode);
    if (memberEditModal) memberEditModal.hide();
  }catch(err){
    console.error("Save member failed:", err);
    alert("บันทึกไม่สำเร็จ: " + (err?.message || err));
  }
}

// Bind modal handlers robustly
function bindModalHandlers(){
  queryModalRefs();
  // Direct bindings
 /* if (memberEditForm && !memberEditForm.__boundSave){
    memberEditForm.addEventListener("submit", handleMemberSave);
    memberEditForm.__boundSave = true;
  }
  if (memberEditSaveBtn && !memberEditSaveBtn.__boundSave){
    memberEditSaveBtn.addEventListener("click", handleMemberSave);
    memberEditSaveBtn.__boundSave = true;
  }*/
  // Delegation fallback
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
  });
  if (unsubDay){ try{unsubDay();}catch(e){} }
  unsubDay = DB.observeDay(state.date, (day)=>{
    const ids = (day && day.playerIds) ? day.playerIds : [];
    state.dayList = ids.map(id => ({ id, arrived:false }));
    const picked = new Set(ids);
    const cur = applyFilters(state.members);
    renderLeft(leftBox, cur, picked);
    wireLeft(leftBox, onAddToToday(picked));
  });
}

// Init
async function initMembersPage(){
  try{
    console.log("[member] initMembersPage start");
    bindModalHandlers();
    state.members = await loadMembers();
    state.dayList = await loadDayList(state.date);
    const picked = new Set((state.dayList || []).map(x => x.id));
    const cur = applyFilters(state.members);
    renderLeft(leftBox, cur, picked);
    wireLeft(leftBox, onAddToToday(picked));

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
      if (unsubDay){ try{unsubDay();}catch(e){} }
      unsubDay = DB.observeDay(state.date, (day)=>{
        const ids = (day && day.playerIds) ? day.playerIds : [];
        state.dayList = ids.map(id => ({ id, arrived:false }));
        const pk = new Set(ids);
        const cur5 = applyFilters(state.members);
        renderLeft(leftBox, cur5, pk);
        wireLeft(leftBox, onAddToToday(pk));
      });
    });

    await subscribeRealtime();

    // Re-bind when modal is shown (in case markup is dynamic)
    if (memberEditModalEl){
      memberEditModalEl.addEventListener("shown.bs.modal", bindModalHandlers);
    }
  }catch(err){
    console.error("initMembersPage failed:", err);
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  initMembersPage().catch(err => console.error("initMembersPage failed:", err));
});
