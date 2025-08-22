
// assets/js/group_state.1.1.3.js
// Adds listMyGroupsWithOwned() to ensure owner groups are always included.
// Also hardens listMyGroups() so if membership doc is unreadable/missing but current user is owner, we still include.

import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, collection,
  serverTimestamp, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const auth = getAuth();
const db = getFirestore();

const LS_KEY = "bm.currentGroupId";
let _authReady = false;
let _user = null;

// ===== Auth guard =====
export function waitForAuthReady(){
  return new Promise(resolve=>{
    if (_authReady) return resolve();
    onAuthStateChanged(auth, (u)=>{
      _user = u || null;
      _authReady = true;
      resolve();
    });
  });
}
export function currentUser(){ return _user; }

// ===== Current Group =====
export function getCurrentGroupId(){
  return localStorage.getItem(LS_KEY) || "default";
}
export function setCurrentGroupId(gid){
  localStorage.setItem(LS_KEY, gid);
  dispatchEvent(new CustomEvent("group:changed", { detail: { gid } }));
}

// ===== Utils =====
function gid() { return "g" + Math.random().toString(36).slice(2,9); }
function makeInviteCode(len=6){
  const dict="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s=""; for(let i=0;i<len;i++) s += dict[Math.floor(Math.random()*dict.length)];
  return s;
}
function escapeHtml(s=""){ return s.replace(/[&<>\"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c])); }

// ===== Create / Rename / Delete (soft) =====
export async function createGroup(name){
  await waitForAuthReady();
  if(!_user) throw new Error("no-auth");
  const groupId = gid();
  const inviteCode = makeInviteCode();

  await setDoc(doc(db, "groups", groupId), {
    name, ownerUid: _user.uid, inviteCode, deleted: false,
    createdAt: serverTimestamp()
  });

  await setDoc(doc(db, "groupMembers", groupId, "members", _user.uid), {
    role: "owner", active: true, joinedAt: serverTimestamp()
  });

  await setDoc(doc(db, "ownerGroups", _user.uid, "list", groupId), {
    name, role: "owner", updatedAt: serverTimestamp()
  });

  return groupId;
}

export async function renameGroup(groupId, newName){
  await waitForAuthReady(); if(!_user) throw "no-auth";
  await updateDoc(doc(db, "groups", groupId), { name: newName });
  await setDoc(doc(db, "ownerGroups", _user.uid, "list", groupId), {
    name: newName, role: "owner", updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function deleteGroup(groupId){
  await waitForAuthReady(); if(!_user) throw "no-auth";
  const g = await getDoc(doc(db, "groups", groupId));
  if(!g.exists()) return;
  const d = g.data();
  if (d.ownerUid !== _user.uid) throw "not-owner";

  await updateDoc(doc(db, "groups", groupId), { deleted: true });
  await setDoc(doc(db, "groupMembers", groupId, "members", _user.uid), {
    active: false
  }, { merge: true });

  // Optional: also remove from mirror to avoid stale list (uncomment if desired)
  // import { deleteDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
  // await deleteDoc(doc(db, "ownerGroups", _user.uid, "list", groupId));
}

// ===== Invite / Join / Leave =====
export async function getInviteLink(groupId){
  const g = await getDoc(doc(db, "groups", groupId));
  if(!g.exists()) throw "not-found";
  const code = g.data().inviteCode;
  return { gid: groupId, code };
}

export async function joinByCode(groupId, code){
  await waitForAuthReady(); if(!_user) throw "no-auth";
  const g = await getDoc(doc(db, "groups", groupId));
  if(!g.exists() || g.data().deleted) throw "not-found";
  if ((g.data().inviteCode||"").toUpperCase() !== (code||"").toUpperCase()) throw "invalid-code";

  await setDoc(doc(db, "groupMembers", groupId, "members", _user.uid), {
    role: _user.uid === g.data().ownerUid ? "owner" : "member",
    active: true, joinedAt: serverTimestamp()
  }, { merge: true });

  await setDoc(doc(db, "ownerGroups", _user.uid, "list", groupId), {
    name: g.data().name, role: _user.uid === g.data().ownerUid ? "owner":"member",
    updatedAt: serverTimestamp()
  }, { merge: true });

  return true;
}

export async function leaveGroup(groupId){
  await waitForAuthReady(); if(!_user) throw "no-auth";
  await setDoc(doc(db, "groupMembers", groupId, "members", _user.uid), {
    active: false
  }, { merge: true });
}

// ===== List groups for current user =====
export async function listMyGroups(){
  await waitForAuthReady(); if(!_user) throw "no-auth";
  const snap = await getDocs(collection(db, "ownerGroups", _user.uid, "list"));
  const quick = snap.docs.map(d=>({ id: d.id, ...d.data() }));

  const results = [];
  for(const it of quick){
    try {
      const gref = doc(db, "groups", it.id);
      const g = await getDoc(gref);
      if(!g.exists()) continue;
      const gd = g.data();
      if (gd.deleted) continue;

      // Try membership; if missing but current user is owner, still include
      let myRole = "member";
      let active = true;
      try {
        const mem = await getDoc(doc(db, "groupMembers", it.id, "members", _user.uid));
        if (mem.exists()) {
          const md = mem.data();
          myRole = md.role || "member";
          active = md.active !== false;
        } else {
          // No membership doc => if owner, synthesize owner role
          if (gd.ownerUid === _user.uid) {
            myRole = "owner";
            active = true;
          } else {
            active = false;
          }
        }
      } catch (_) {
        // On read error, fallback to owner check
        if (gd.ownerUid === _user.uid) {
          myRole = "owner";
          active = true;
        } else {
          active = false;
        }
      }

      if(!active) continue;

      results.push({
        id: it.id,
        name: gd.name,
        myRole
      });
    } catch(e) {
      // Skip any item that errored; prevents whole list from failing
      console.warn("[listMyGroups] skip", it.id, e);
    }
  }
  results.sort((a,b)=> (a.name||"").localeCompare(b.name||""));
  return results;
}

// Owner-only: direct query
export async function listOwnerGroups(){
  await waitForAuthReady(); if(!_user) throw "no-auth";
  const q = query(collection(db, "groups"),
    where("ownerUid", "==", _user.uid),
    where("deleted", "==", false)
  );
  const snap = await getDocs(q);
  const arr = [];
  snap.forEach(d=>{
    arr.push({ id: d.id, name: d.data().name, myRole: "owner" });
  });
  arr.sort((a,b)=> (a.name||"").localeCompare(b.name||""));
  return arr;
}

// New: union API
export async function listMyGroupsWithOwned(){
  await waitForAuthReady(); if(!_user) throw "no-auth";
  const [mine, owned] = await Promise.all([
    listMyGroups().catch(()=>[]),
    listOwnerGroups().catch(()=>[])
  ]);
  const map = new Map();
  for(const g of mine) map.set(g.id, g);
  for(const g of owned){
    if(!map.has(g.id)) map.set(g.id, g);
    else {
      const cur = map.get(g.id);
      if (cur.myRole !== 'owner') map.set(g.id, { ...cur, myRole: 'owner' });
    }
  }
  return Array.from(map.values()).sort((a,b)=> (a.name||'').localeCompare(b.name||''));
}

export async function mountOwnerGroupSwitcher(container){
  await waitForAuthReady(); if(!_user || !container) return;
  const groups = await listMyGroupsWithOwned();
  container.innerHTML = `
    <select class="form-select form-select-sm" id="ownerSwitcher">
      ${groups.map(g=> `<option value="${g.id}" ${getCurrentGroupId()===g.id?'selected':''}>${escapeHtml(g.name||g.id)}</option>`).join("")}
    </select>
  `;
  container.querySelector("#ownerSwitcher")?.addEventListener("change", (e)=>{
    setCurrentGroupId(e.target.value);
  });
}

export function renderRoleBadge(role){
  const span = document.createElement("span");
  span.className = "badge rounded-pill " + (
    role==="owner" ? "text-bg-success" :
    role==="admin" ? "text-bg-warning text-dark" :
    "text-bg-secondary"
  );
  span.textContent = role || "member";
  return span;
}
